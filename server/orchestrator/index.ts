import Anthropic from "@anthropic-ai/sdk";
import { AzureOpenAI } from "openai";
import { DefaultAzureCredential, getBearerTokenProvider } from "@azure/identity";

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
