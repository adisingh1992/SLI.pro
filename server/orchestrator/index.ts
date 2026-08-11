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
 * ── ONE PROVIDER: AZURE OPENAI ───────────────────────────────────────────
 * There was a second path here — Anthropic, kept during the Replit migration
 * so the MVP's prompts could be re-tuned against Azure without the app going
 * dark in between. That period is over and the models are no longer available
 * to this project, so the path is gone rather than dormant.
 *
 * Dormant was the dangerous state. `activeProvider()` fell back to Anthropic
 * whenever AZURE_OPENAI_ENDPOINT was unset, so a config mistake did not fail —
 * it quietly routed to a provider with no key and surfaced as an
 * authentication error several layers away from the missing variable. A
 * missing endpoint now fails at startup, naming the variable.
 *
 * Tiers map to Azure *deployment* names via environment, so which deployment
 * backs which tier stays configuration:
 *   AZURE_OPENAI_DEPLOYMENT_FLAGSHIP / _MID / _NANO
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
  provider: "azure";
  model: string;
  usage?: { inputTokens?: number; outputTokens?: number };
}

/**
 * What the readiness check and the startup log report.
 *
 * This replaces `activeProvider()`, which is gone rather than stubbed. Once
 * there is one provider, a function returning the string "azure" is not
 * information — but it still *looks* like information at the call site, and
 * three call sites were logging it as though it told them something. The
 * useful question was never "which provider" but "which deployments", and a
 * misconfigured tier is the thing that actually breaks.
 *
 * Names only. Never the key.
 */
export function modelConfiguration(): {
  endpoint: string | null;
  deployments: Record<ModelTier, string | null>;
} {
  return {
    endpoint: process.env.AZURE_OPENAI_ENDPOINT ?? null,
    deployments: {
      flagship: process.env.AZURE_OPENAI_DEPLOYMENT_FLAGSHIP ?? null,
      mid: process.env.AZURE_OPENAI_DEPLOYMENT_MID ?? null,
      nano: process.env.AZURE_OPENAI_DEPLOYMENT_NANO ?? null,
    },
  };
}

/** One line, for a startup log: `flagship=gpt-5.6-sol mid=… nano=…`. */
export function describeModels(): string {
  const { endpoint, deployments } = modelConfiguration();
  if (!endpoint) return "NOT CONFIGURED (AZURE_OPENAI_ENDPOINT is unset)";
  return Object.entries(deployments)
    .map(([tier, name]) => `${tier}=${name ?? "(unset → mid)"}`)
    .join(" ");
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

// ── Clients (lazily constructed) ────────────────────────────────────────────

let azureClient: AzureOpenAI | null = null;

/**
 * Model families that accept only the default `temperature`.
 *
 * ── THIS IS A KNOWN PROPERTY, NOT A SURPRISE ─────────────────────────────
 * The GPT-5 series and the o-series reasoning models reject any explicit
 * temperature with a 400: "Unsupported value: 'temperature' does not support
 * 0.7 with this model. Only the default (1) value is supported." Their decoding
 * path involves several rounds of generation and selection, and an external
 * temperature would cut across that.
 *
 * The orchestrator used to discover this by sending the request, taking the
 * 400, and retrying without the parameter. That works and self-heals, and it
 * costs one wasted round trip per deployment per process. In a long-lived
 * process that is a one-off; in Container Apps every replica starts cold, and
 * the student who sends the first turn on a new replica pays for it.
 *
 * Three layers, most specific first:
 *
 *   1. FIXED_TEMPERATURE_DEPLOYMENTS — an explicit list, for deployments whose
 *      names say nothing about the model behind them. Azure deployment names
 *      are arbitrary, so a name is a hint and not a guarantee.
 *   2. the pattern below — catches the usual case where the deployment is named
 *      after its model, as `gpt-5.6-luna` and `gpt-5.6-terra` are here.
 *   3. runtime learning — unchanged, and still the backstop. Anything the first
 *      two miss costs exactly what it used to.
 *
 * Being wrong in the cautious direction is cheap: omitting temperature from a
 * model that would have accepted it loses a tuning knob. Being wrong the other
 * way costs a round trip, once. So the pattern is deliberately broad.
 */
const FIXED_TEMPERATURE_PATTERN = /(^|[^a-z0-9])(gpt-?5|o1|o3|o4)([^a-z0-9]|$)/i;

const fixedTemperatureDeployments = new Set<string>(
  (process.env.FIXED_TEMPERATURE_DEPLOYMENTS ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean),
);

/**
 * Whether an explicit temperature may be sent to this deployment.
 *
 * Exported for the test — the interesting cases are the near-misses (`gpt-4o`
 * must still receive one; `o4-mini` must not), and a copy of the regex in a
 * test file would drift from the one that runs.
 */
export function acceptsTemperature(model: string): boolean {
  if (fixedTemperatureDeployments.has(model)) return false;
  return !FIXED_TEMPERATURE_PATTERN.test(model);
}

/**
 * Minimum token budget a deployment has been observed to need.
 *
 * Reasoning deployments spend max_completion_tokens on thinking before any
 * output appears, so a budget that is fine for a non-reasoning model returns
 * nothing at all. Learned on first empty completion and applied thereafter, so
 * the failure happens at most once per deployment per process.
 */
const minimumTokensByDeployment = new Map<string, number>();

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

// ── Public API ──────────────────────────────────────────────────────────────

/** Runs a chat completion on the tier's model and returns the text. */
export async function complete(
  request: CompletionRequest,
): Promise<CompletionResult> {
  const tier = request.tier ?? "mid";

  {
    const model = azureDeployment(tier);
    // Respect any floor learned from a previous empty completion.
    const maxTokens = Math.max(
      request.maxTokens ?? 4096,
      minimumTokensByDeployment.get(model) ?? 0,
    );
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
        buildParams(acceptsTemperature(model)),
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

      if (isFixedTemperature && acceptsTemperature(model)) {
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

    let text = response.choices[0]?.message?.content ?? "";
    let finishReason = response.choices[0]?.finish_reason;

    // ── Empty completion from a reasoning model ───────────────────────────
    //
    // Reasoning deployments (the same ones that reject an explicit
    // temperature) count REASONING tokens against max_completion_tokens. If
    // the budget is spent thinking, the API returns finish_reason 'length'
    // with completely empty content and no error.
    //
    // Left alone this is close to undebuggable: the caller gets "" and fails
    // several layers away parsing it as JSON, with nothing pointing at the
    // real cause. So retry once with a much larger budget, and remember the
    // floor for this deployment — the same learn-at-runtime approach used for
    // the temperature restriction above.
    if (!text.trim() && finishReason === "length") {
      const reasoningTokens =
        (response.usage as any)?.completion_tokens_details?.reasoning_tokens;
      const retryTokens = Math.min(Math.max(maxTokens * 4, 4000), 16000);

      console.warn(
        `[orchestrator] deployment '${model}' returned an EMPTY completion: the ` +
          `${maxTokens}-token budget was consumed` +
          (reasoningTokens ? ` by ${reasoningTokens} reasoning tokens` : "") +
          `. Retrying with ${retryTokens} and raising the floor for this deployment.`,
      );

      minimumTokensByDeployment.set(model, retryTokens);

      const retry = await client.chat.completions.create({
        ...buildParams(acceptsTemperature(model)),
        max_completion_tokens: retryTokens,
      });
      text = retry.choices[0]?.message?.content ?? "";
      finishReason = retry.choices[0]?.finish_reason;
      response = retry;
    }

    if (!text.trim()) {
      // Still empty. Fail here, where the cause is known, rather than letting
      // an empty string travel to a JSON parser that can only report that ""
      // is not JSON.
      throw new Error(
        `Azure OpenAI returned an empty completion.\n` +
          `  deployment:    ${model} (tier '${tier}')\n` +
          `  finish_reason: ${finishReason ?? "unknown"}\n` +
          `  token budget:  ${maxTokens}\n` +
          (finishReason === "length"
            ? `The budget was exhausted before any output was produced. On reasoning ` +
              `deployments, max_completion_tokens covers reasoning as well as output — ` +
              `raise maxTokens at the call site.`
            : finishReason === "content_filter"
              ? `The response was blocked by the content filter.`
              : `No output was produced and the reason is not 'length'. Inspect the ` +
                `deployment in Azure AI Foundry.`),
      );
    }

    return {
      text,
      provider: "azure",
      model,
      usage: {
        inputTokens: response.usage?.prompt_tokens,
        outputTokens: response.usage?.completion_tokens,
      },
    };
  }
}

/**
 * Streaming variant of `complete`. Yields text deltas as they arrive, so the
 * caller can forward them to the client (SSE / WebSocket) without knowing how
 * they were produced.
 */
export async function* completeStream(
  request: CompletionRequest,
): AsyncGenerator<string, void, unknown> {
  const tier = request.tier ?? "mid";

  {
    const model = azureDeployment(tier);
    // Respect any floor learned from a previous empty completion.
    const maxTokens = Math.max(
      request.maxTokens ?? 4096,
      minimumTokensByDeployment.get(model) ?? 0,
    );
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
        buildParams(acceptsTemperature(model)),
      );
    } catch (err: any) {
      const isFixedTemperature =
        err?.status === 400 &&
        (err?.param === "temperature" || /temperature/i.test(err?.message ?? "")) &&
        /unsupported/i.test(err?.message ?? "");
      if (isFixedTemperature && acceptsTemperature(model)) {
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
