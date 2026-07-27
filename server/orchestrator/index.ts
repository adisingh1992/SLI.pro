import Anthropic from "@anthropic-ai/sdk";
import { AzureOpenAI } from "openai";
import { DefaultAzureCredential, getBearerTokenProvider } from "@azure/identity";
import { createReadStream } from "fs";

/**
 * LLM orchestrator — the single place the application talks to a model.
 *
 * Per the Wing architecture, the heuristics engine decides *what* should
 * happen; the orchestrator assembles context and decides *which model* runs the
 * resulting prompt. Keeping the provider behind this boundary is what lets
 * routing change without re-architecture — and it removes the hardcoded model
 * strings that were scattered across 17 call sites.
 *
 * Traffic is routed by task to the cheapest tier that meets the quality bar:
 *   flagship  — Foundation Sessions, SLI generation/refinement
 *   mid       — intake, daily prompts, journal/drift, analysis, content drafts
 *   nano      — classification, tagging, turn-typing, routing
 *   embedding — memory / journal / drift vectors
 *
 * Provider selection:
 *   LLM_PROVIDER=azure     -> Azure OpenAI (target state)
 *   LLM_PROVIDER=anthropic -> Anthropic (interim, while prompts are re-tuned)
 *   unset                  -> azure if AZURE_OPENAI_ENDPOINT is set, else anthropic
 */

export type ModelTier = "flagship" | "mid" | "nano";

export interface CompletionMessage {
  role: "user" | "assistant";
  content: string;
}

export interface CompletionRequest {
  /** Defaults to "mid" — the sensible default for most surfaces. */
  tier?: ModelTier;
  system?: string;
  messages: CompletionMessage[];
  maxTokens?: number;
  temperature?: number;
}

export interface CompletionResult {
  text: string;
  provider: "azure" | "anthropic";
  model: string;
  usage?: { inputTokens?: number; outputTokens?: number };
}

type Provider = "azure" | "anthropic";

export function activeProvider(): Provider {
  const explicit = process.env.LLM_PROVIDER?.toLowerCase();
  if (explicit === "azure" || explicit === "anthropic") return explicit;
  return process.env.AZURE_OPENAI_ENDPOINT ? "azure" : "anthropic";
}

// ── Model resolution ────────────────────────────────────────────────────────

function azureDeployment(tier: ModelTier): string {
  const byTier: Record<ModelTier, string | undefined> = {
    flagship: process.env.AZURE_OPENAI_DEPLOYMENT_FLAGSHIP,
    mid: process.env.AZURE_OPENAI_DEPLOYMENT_MID,
    nano: process.env.AZURE_OPENAI_DEPLOYMENT_NANO,
  };
  const deployment = byTier[tier] ?? byTier.mid;
  if (!deployment) {
    throw new Error(
      `No Azure OpenAI deployment configured for tier '${tier}'. ` +
        `Set AZURE_OPENAI_DEPLOYMENT_${tier.toUpperCase()} (or _MID as a fallback).`,
    );
  }
  return deployment;
}

function anthropicModel(tier: ModelTier): string {
  const byTier: Record<ModelTier, string | undefined> = {
    flagship: process.env.ANTHROPIC_MODEL_FLAGSHIP,
    mid: process.env.ANTHROPIC_MODEL_MID,
    nano: process.env.ANTHROPIC_MODEL_NANO,
  };
  // CLAUDE_MODEL is the legacy single-model variable the MVP used.
  return byTier[tier] ?? process.env.CLAUDE_MODEL ?? byTier.mid ?? "";
}

// ── Clients (lazily constructed) ────────────────────────────────────────────

let azureClient: AzureOpenAI | null = null;
let anthropicClient: Anthropic | null = null;

/** Deployments that reject an explicit `temperature` (learned at runtime). */
const fixedTemperatureDeployments = new Set<string>();

/**
 * The OpenAI SDK wants the *resource* endpoint and builds the request path
 * itself. Foundry hands out several other URLs that look plausible but 404:
 *   - project endpoint:  https://<res>.services.ai.azure.com/api/projects/<proj>
 *   - inference endpoint: https://<res>.services.ai.azure.com/models
 * Normalise those down to the origin rather than failing cryptically.
 */
function normaliseEndpoint(raw: string): string {
  try {
    const url = new URL(raw);
    if (url.pathname && url.pathname !== "/") {
      console.warn(
        `[orchestrator] AZURE_OPENAI_ENDPOINT has path '${url.pathname}' — ` +
          `the OpenAI SDK expects the resource endpoint only. Using ${url.origin}/ instead. ` +
          `(A '/api/projects/...' URL is a Foundry project endpoint, not the Azure OpenAI endpoint.)`,
      );
      return `${url.origin}/`;
    }
    return url.toString();
  } catch {
    return raw;
  }
}

function getAzureClient(): AzureOpenAI {
  if (!azureClient) {
    const rawEndpoint = process.env.AZURE_OPENAI_ENDPOINT;
    if (!rawEndpoint) throw new Error("AZURE_OPENAI_ENDPOINT is not set");
    const endpoint = normaliseEndpoint(rawEndpoint);

    const apiVersion = process.env.AZURE_OPENAI_API_VERSION || "2024-10-21";
    const apiKey = process.env.AZURE_OPENAI_KEY;

    if (apiKey) {
      azureClient = new AzureOpenAI({ endpoint, apiKey, apiVersion });
    } else {
      // No key configured — use managed identity (Container Apps) or the local
      // `az login` session. Preferred posture: no secrets in config at all.
      const credential = new DefaultAzureCredential({
        managedIdentityClientId: process.env.AZURE_MANAGED_IDENTITY_CLIENT_ID,
      });
      const azureADTokenProvider = getBearerTokenProvider(
        credential,
        "https://cognitiveservices.azure.com/.default",
      );
      azureClient = new AzureOpenAI({ endpoint, azureADTokenProvider, apiVersion });
    }
  }
  return azureClient;
}

function getAnthropicClient(): Anthropic {
  if (!anthropicClient) {
    anthropicClient = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  }
  return anthropicClient;
}

// ── Public API ──────────────────────────────────────────────────────────────

/** Runs a chat completion on the tier's model and returns the text. */
export async function complete(
  request: CompletionRequest,
): Promise<CompletionResult> {
  const tier = request.tier ?? "mid";
  const maxTokens = request.maxTokens ?? 4096;
  const provider = activeProvider();

  if (provider === "azure") {
    const model = azureDeployment(tier);
    const messages = [
      ...(request.system ? [{ role: "system" as const, content: request.system }] : []),
      ...request.messages,
    ];

    // Some models (reasoning-style ones in particular) only accept the default
    // temperature and reject an explicit value. We can't know which ahead of
    // time, so learn it per deployment on first failure and stop sending it.
    const buildParams = (withTemperature: boolean) => ({
      model, // in Azure this is the *deployment* name
      messages,
      max_completion_tokens: maxTokens,
      ...(withTemperature && request.temperature !== undefined
        ? { temperature: request.temperature }
        : {}),
    });

    const client = getAzureClient();
    let response;
    try {
      response = await client.chat.completions.create(
        buildParams(!fixedTemperatureDeployments.has(model)),
      );
    } catch (err: any) {
      // A bare "Resource not found" from Azure is unhelpful — say exactly what
      // was attempted so the mismatch is obvious.
      if (err?.status === 404 || err?.code === "404") {
        throw new Error(
          `Azure OpenAI returned 404 for tier '${tier}'.\n` +
            `  endpoint:    ${process.env.AZURE_OPENAI_ENDPOINT}\n` +
            `  deployment:  ${model}\n` +
            `  api-version: ${process.env.AZURE_OPENAI_API_VERSION || "2024-10-21"}\n` +
            `The deployment name must match a deployment in Azure AI Foundry exactly ` +
            `(it is the deployment name, not the model name). Verify with:\n` +
            `  az cognitiveservices account deployment list ` +
            `--name <openai-resource> --resource-group <rg> -o table`,
        );
      }

      // "Unsupported value: 'temperature'" — remember, then retry without it.
      const isFixedTemperature =
        err?.status === 400 &&
        (err?.param === "temperature" || /temperature/i.test(err?.message ?? "")) &&
        /unsupported/i.test(err?.message ?? "");

      if (isFixedTemperature && !fixedTemperatureDeployments.has(model)) {
        fixedTemperatureDeployments.add(model);
        console.warn(
          `[orchestrator] deployment '${model}' only supports the default temperature; ` +
            `retrying without it and omitting it on subsequent calls.`,
        );
        response = await client.chat.completions.create(buildParams(false));
      } else {
        throw err;
      }
    }

    return {
      text: response.choices[0]?.message?.content ?? "",
      provider,
      model,
      usage: {
        inputTokens: response.usage?.prompt_tokens,
        outputTokens: response.usage?.completion_tokens,
      },
    };
  }

  const model = anthropicModel(tier);
  const response = await getAnthropicClient().messages.create({
    model,
    max_tokens: maxTokens,
    ...(request.system ? { system: request.system } : {}),
    ...(request.temperature !== undefined ? { temperature: request.temperature } : {}),
    messages: request.messages,
  });

  const text = response.content
    .filter((block): block is Anthropic.TextBlock => block.type === "text")
    .map((block) => block.text)
    .join("");

  return {
    text,
    provider,
    model,
    usage: {
      inputTokens: response.usage?.input_tokens,
      outputTokens: response.usage?.output_tokens,
    },
  };
}

/**
 * Streaming variant of `complete`. Yields text deltas as they arrive, so the
 * caller can forward them to the client (SSE / WebSocket) without knowing which
 * provider produced them.
 */
export async function* completeStream(
  request: CompletionRequest,
): AsyncGenerator<string, void, unknown> {
  const tier = request.tier ?? "mid";
  const maxTokens = request.maxTokens ?? 4096;
  const provider = activeProvider();

  if (provider === "azure") {
    const model = azureDeployment(tier);
    const messages = [
      ...(request.system ? [{ role: "system" as const, content: request.system }] : []),
      ...request.messages,
    ];

    const buildParams = (withTemperature: boolean) => ({
      model,
      messages,
      max_completion_tokens: maxTokens,
      stream: true as const,
      ...(withTemperature && request.temperature !== undefined
        ? { temperature: request.temperature }
        : {}),
    });

    const client = getAzureClient();
    let stream;
    try {
      stream = await client.chat.completions.create(
        buildParams(!fixedTemperatureDeployments.has(model)),
      );
    } catch (err: any) {
      const isFixedTemperature =
        err?.status === 400 &&
        (err?.param === "temperature" || /temperature/i.test(err?.message ?? "")) &&
        /unsupported/i.test(err?.message ?? "");
      if (isFixedTemperature && !fixedTemperatureDeployments.has(model)) {
        fixedTemperatureDeployments.add(model);
        stream = await client.chat.completions.create(buildParams(false));
      } else {
        throw err;
      }
    }

    for await (const chunk of stream) {
      const delta = chunk.choices[0]?.delta?.content;
      if (delta) yield delta;
    }
    return;
  }

  const stream = await getAnthropicClient().messages.create({
    model: anthropicModel(tier),
    max_tokens: maxTokens,
    ...(request.system ? { system: request.system } : {}),
    ...(request.temperature !== undefined ? { temperature: request.temperature } : {}),
    messages: request.messages,
    stream: true,
  });

  for await (const event of stream) {
    if (
      event.type === "content_block_delta" &&
      "text" in event.delta &&
      event.delta.text
    ) {
      yield event.delta.text;
    }
  }
}

/**
 * Speech-to-text (Whisper), single-pass record-then-transcribe — the Tier 1
 * voice flow. Routes to the Azure Whisper deployment when configured, and
 * falls back to OpenAI directly only if AZURE_OPENAI_DEPLOYMENT_WHISPER is
 * unset but OPENAI_API_KEY is present.
 *
 * (Live streaming transcription via Azure AI Speech is the later swap; the
 * WebSocket service that calls this stays as-is when that happens.)
 */
export async function transcribe(
  filePath: string,
  opts: { language?: string } = {},
): Promise<string> {
  // Named generically because the underlying model keeps changing: whisper-1,
  // gpt-4o-transcribe and gpt-4o-mini-transcribe all retired around June 2026;
  // gpt-4o-transcribe-diarize is the current GA successor. Any of them work —
  // set the deployment name and the call is identical.
  const deployment =
    process.env.AZURE_OPENAI_DEPLOYMENT_TRANSCRIBE ||
    process.env.AZURE_OPENAI_DEPLOYMENT_WHISPER; // legacy alias

  // Fallback is opt-out: it sends audio to OpenAI directly, which leaves the
  // Azure boundary. Set TRANSCRIBE_FALLBACK_TO_OPENAI=false to forbid that.
  const fallbackAllowed =
    Boolean(process.env.OPENAI_API_KEY) &&
    process.env.TRANSCRIBE_FALLBACK_TO_OPENAI !== "false";

  const transcribeWithOpenAI = async (reason: string): Promise<string> => {
    console.warn(
      `[orchestrator] Transcribing via OpenAI directly (${reason}). ` +
        `NOTE: audio leaves the Azure boundary on this path.`,
    );
    const { default: OpenAI } = await import("openai");
    const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
    const result = await openai.audio.transcriptions.create({
      file: createReadStream(filePath), // fresh stream per attempt
      model: process.env.OPENAI_TRANSCRIBE_MODEL || "whisper-1",
      ...(opts.language ? { language: opts.language } : {}),
    });
    return result.text;
  };

  if (deployment) {
    try {
      const result = await getAzureClient().audio.transcriptions.create({
        file: createReadStream(filePath), // fresh stream per attempt
        model: deployment, // deployment name in Azure
        ...(opts.language ? { language: opts.language } : {}),
      });
      return result.text;
    } catch (err: any) {
      const detail = `Azure deployment '${deployment}' failed: ${err?.status ?? ""} ${
        err?.message ?? err
      }`;
      if (fallbackAllowed) {
        return transcribeWithOpenAI(detail);
      }
      throw new Error(
        `${detail}. No fallback available (set OPENAI_API_KEY, or ` +
          `TRANSCRIBE_FALLBACK_TO_OPENAI is false).`,
      );
    }
  }

  if (fallbackAllowed) {
    return transcribeWithOpenAI("no Azure transcription deployment configured");
  }

  throw new Error(
    "No transcription provider configured. Deploy a speech-to-text model in Azure AI " +
      "Foundry (gpt-4o-transcribe-diarize is the current GA option) and set " +
      "AZURE_OPENAI_DEPLOYMENT_TRANSCRIBE, or set OPENAI_API_KEY to fall back.",
  );
}

/** Embeddings for the memory / journal / drift vector stores (pgvector). */
export async function embed(input: string | string[]): Promise<number[][]> {
  const model = process.env.AZURE_OPENAI_DEPLOYMENT_EMBEDDINGS;
  if (!model) {
    throw new Error("AZURE_OPENAI_DEPLOYMENT_EMBEDDINGS is not set");
  }
  const response = await getAzureClient().embeddings.create({
    model,
    input: Array.isArray(input) ? input : [input],
  });
  return response.data.map((d) => d.embedding);
}
