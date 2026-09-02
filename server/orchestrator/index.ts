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
 *
 * Image generation (IG-M6-01, Spec 4) is a fourth, separate deployment on the
 * same resource — `AZURE_OPENAI_DEPLOYMENT_IMAGE`, pointed at MAI-Image-2.5-Flash
 * rather than DALL-E (Aditya, 2 Sep 2026 — see `generateImage()`'s own header).
 * It is not a `ModelTier`: images aren't routed by task-complexity the way text
 * completions are, there's exactly one image deployment, and forcing it into
 * `complete()`'s tier/text shape would be the wrong abstraction for a call that
 * returns bytes, not `choices[0].message.content`.
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

/**
 * Whether voice dictation can work, and where it would go.
 *
 * Reported separately because a missing Whisper deployment breaks only the
 * microphone — everything else on the page keeps working, so nothing surfaces
 * it until a student taps the mic and gets "not configured on the server".
 */
export function voiceConfiguration(): { endpoint: string | null; deployment: string | null } {
  return {
    endpoint:
      process.env.AZURE_OPENAI_ENDPOINT_ALT ?? process.env.AZURE_OPENAI_ENDPOINT ?? null,
    deployment:
      process.env.AZURE_OPENAI_DEPLOYMENT_WHISPER ??
      process.env.AZURE_OPENAI_DEPLOYMENT_TRANSCRIBE ??
      null,
  };
}

/**
 * Whether Wing-generated article header images (IG-M6-01) can work, and where.
 *
 * Same shape as `voiceConfiguration()`, for the same reason: this is a fourth
 * deployment on top of the three text tiers, and a missing one should break
 * only "generate a header image" — not read as the whole orchestrator being
 * misconfigured.
 */
export function imageConfiguration(): { endpoint: string | null; deployment: string | null } {
  return {
    endpoint: process.env.AZURE_OPENAI_ENDPOINT ?? null,
    deployment: process.env.AZURE_OPENAI_DEPLOYMENT_IMAGE ?? null,
  };
}

/** One line, for a startup log: `flagship=gpt-5.6-sol mid=… nano=… voice=… image=…`. */
export function describeModels(): string {
  const { endpoint, deployments } = modelConfiguration();
  if (!endpoint) return "NOT CONFIGURED (AZURE_OPENAI_ENDPOINT is unset)";
  const voice = voiceConfiguration();
  const image = imageConfiguration();
  return (
    Object.entries(deployments)
      .map(([tier, name]) => `${tier}=${name ?? "(unset → mid)"}`)
      .join(" ") +
    ` voice=${voice.deployment ?? "(none)"}` +
    ` image=${image.deployment ?? "(none)"}`
  );
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
 * The Whisper client — a SECOND Azure OpenAI resource.
 *
 * ── WHY THIS IS NOT `getAzureClient()` ───────────────────────────────────────
 * Speech-to-text has much narrower regional availability than the chat models,
 * so the Whisper deployment lives on its own resource with its own endpoint and
 * key: `AZURE_OPENAI_ENDPOINT_ALT` / `AZURE_OPENAI_KEY_ALT`. Reusing the main
 * client would send the audio to a resource that has no such deployment and
 * come back 404 — which reads exactly like a broken microphone.
 *
 * If the ALT endpoint is unset, this falls back to the main one, because some
 * setups do have Whisper on the same resource. That is a fallback *within* the
 * Azure boundary and it cannot leak audio; the worst case is a 404 that names
 * both the deployment and the endpoint it was looked for on.
 */
let whisperClient: AzureOpenAI | null = null;

function getWhisperClient(): AzureOpenAI {
  if (whisperClient) return whisperClient;

  const rawEndpoint =
    process.env.AZURE_OPENAI_ENDPOINT_ALT || process.env.AZURE_OPENAI_ENDPOINT;
  if (!rawEndpoint) {
    throw new Error(
      "No transcription endpoint. Set AZURE_OPENAI_ENDPOINT_ALT (the resource " +
        "hosting the Whisper deployment), or AZURE_OPENAI_ENDPOINT if it is the " +
        "same resource as the chat models.",
    );
  }

  const endpoint = normaliseEndpoint(rawEndpoint);
  const apiVersion = process.env.AZURE_OPENAI_API_VERSION || "2024-10-21";
  const apiKey = process.env.AZURE_OPENAI_KEY_ALT || process.env.AZURE_OPENAI_KEY;

  if (apiKey) {
    whisperClient = new AzureOpenAI({ endpoint, apiKey, apiVersion });
  } else {
    // Managed identity, same posture as the main client. The container's
    // identity needs a Cognitive Services OpenAI User role assignment on the
    // ALT resource too — a separate resource means a separate assignment, and
    // it is an easy one to miss.
    const credential = new DefaultAzureCredential({
      managedIdentityClientId: process.env.AZURE_MANAGED_IDENTITY_CLIENT_ID,
    });
    const azureADTokenProvider = getBearerTokenProvider(
      credential,
      "https://cognitiveservices.azure.com/.default",
    );
    whisperClient = new AzureOpenAI({ endpoint, azureADTokenProvider, apiVersion });
  }

  return whisperClient;
}

/**
 * Speech-to-text, single-pass record-then-transcribe — the Tier 1 voice flow.
 *
 * ── AZURE ONLY. THERE IS NO FALLBACK, AND THAT IS THE POINT ──────────────────
 * This used to call OpenAI directly whenever the Azure deployment was missing
 * or errored, gated by `TRANSCRIBE_FALLBACK_TO_OPENAI` — opt-OUT, so the
 * default behaviour was to send a student's recorded voice to a third party
 * outside the Azure tenancy. A misconfiguration did not fail; it silently
 * changed where the audio went.
 *
 * That is a data-residency question rather than a reliability one, and the
 * institutions this is sold to will ask it. Voice is the most identifying
 * content the product handles: not a transcript of what a student said, but
 * their actual voice. The path is gone rather than defaulted off — a flag that
 * re-enables it is a flag someone can flip without understanding what it does.
 *
 * A missing or broken deployment now fails loudly and the student is told the
 * server is misconfigured, which is true and fixable. Silently succeeding by
 * routing elsewhere is neither.
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
    process.env.AZURE_OPENAI_DEPLOYMENT_WHISPER ||
    process.env.AZURE_OPENAI_DEPLOYMENT_TRANSCRIBE;

  if (!deployment) {
    throw new Error(
      "No transcription deployment configured. Set " +
        "AZURE_OPENAI_DEPLOYMENT_WHISPER to the name of the speech-to-text " +
        "deployment in Azure AI Foundry (the deployment name, not the model name).",
    );
  }

  const endpoint =
    process.env.AZURE_OPENAI_ENDPOINT_ALT || process.env.AZURE_OPENAI_ENDPOINT;

  try {
    const result = await getWhisperClient().audio.transcriptions.create({
      file: createReadStream(filePath),
      model: deployment, // in Azure this is the deployment name
      ...(opts.language ? { language: opts.language } : {}),
    });
    return result.text;
  } catch (err: any) {
    // A bare "Resource not found" says nothing about which of the two
    // resources was asked, which is the first thing you need to know when
    // Whisper is deployed somewhere other than the chat models.
    if (err?.status === 404 || err?.code === "404") {
      throw new Error(
        `Azure OpenAI returned 404 for the transcription deployment.\n` +
          `  endpoint:    ${endpoint}\n` +
          `  deployment:  ${deployment}\n` +
          `  api-version: ${process.env.AZURE_OPENAI_API_VERSION || "2024-10-21"}\n` +
          `Whisper often lives on a different resource from the chat models — if ` +
          `it does, AZURE_OPENAI_ENDPOINT_ALT and AZURE_OPENAI_KEY_ALT must point ` +
          `at that one. Verify with:\n` +
          `  az cognitiveservices account deployment list ` +
          `--name <openai-resource> --resource-group <rg> -o table`,
      );
    }
    throw err;
  }
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

/**
 * Article header images (IG-M6-01, Spec 4).
 *
 * ── MAI-Image-2.5-Flash, NOT DALL-E ───────────────────────────────────────
 * `wing-content-system-v1.md` specifies "DALL-E on Azure OpenAI" throughout
 * Spec 4 and IG-IMG-01 — written when that was the only image model on this
 * resource. Aditya's direction (2 Sep 2026): use MAI-Image-2.5-Flash instead,
 * "same source as other models being used like sol, terra and luna" — i.e.
 * the same Azure OpenAI resource `getAzureClient()` already talks to, not a
 * second resource the way Whisper needed one. Deployment name lives in
 * `AZURE_OPENAI_DEPLOYMENT_IMAGE`, pointed at whatever MAI-Image-2.5-Flash is
 * named in Azure AI Foundry — the deployment name, not the model name, same
 * convention as every other deployment here. The spec's own safety and
 * approval requirements (IG-IMG-01–03) don't name DALL-E specifically —
 * they're about what any image-generation step must do — so nothing else in
 * Spec 4 changes with the model swapped.
 *
 * ── WHY THE RESPONSE SHAPE ISN'T ASSUMED ──────────────────────────────────
 * DALL-E 3 on Azure returns a `url` by default and accepts an explicit
 * `response_format: "b64_json"`; the newer `gpt-image-1` family always
 * returns `b64_json` and rejects the `response_format` param outright.
 * MAI-Image-2.5-Flash's exact contract hasn't been exercised against a real
 * deployment from this sandbox (no network route to Azure, no deployment
 * configured here) — rather than guess which family it follows, this asks
 * for `b64_json` first, and on an "unrecognized/unsupported parameter" 400
 * for `response_format` specifically, retries without it and accepts
 * whichever field (`b64_json` or `url`) comes back. Needs a real run against
 * the configured deployment to confirm before this ships to students.
 *
 * Returns raw image bytes — never a URL to the caller — so a Wing-generated
 * image and a student-provided one (`content-trigger-routes.ts`'s
 * generate-image route, `linkedin-content-routes.ts`'s publish route) are the
 * exact same shape from that point on.
 */
export class ImageGenerationBlockedError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ImageGenerationBlockedError";
  }
}

export interface GenerateImageRequest {
  prompt: string;
  /** "WxH", e.g. "1536x1024" for a landscape article header. Defaults to
   *  AZURE_OPENAI_IMAGE_SIZE, or 1536x1024 if that's unset too — a first-pass
   *  guess at a size MAI-Image-2.5-Flash accepts, not a confirmed value. */
  size?: string;
}

export interface GenerateImageResult {
  imageBuffer: Buffer;
  model: string;
}

function isUnsupportedParamError(err: any, param: string): boolean {
  return (
    err?.status === 400 &&
    (err?.param === param || new RegExp(param, "i").test(err?.message ?? "")) &&
    /unsupported|unrecognized|unknown/i.test(err?.message ?? "")
  );
}

/** Azure's content filter and MAI-Image's own safety layer both surface as a
 *  400 whose message names the block — matched broadly since the exact
 *  wording isn't confirmed for this model yet (see the header above). */
function isContentFilterError(err: any): boolean {
  return (
    err?.status === 400 &&
    /content.?polic|content.?filter|safety system|moderation|responsible ai/i.test(
      err?.message ?? "",
    )
  );
}

/**
 * Generates one image and returns its bytes.
 *
 * Throws `ImageGenerationBlockedError` when Azure's content filter (or
 * MAI-Image's own safety layer) rejected the prompt or the result — the
 * caller (the generate-image route) is what implements IG-IMG-01's
 * "after 2 failed generations" fallback message, since that's a per-draft
 * count this function has no reason to know about. Any other failure
 * (misconfiguration, a genuine 5xx) throws a plain Error and is not counted
 * toward that limit — only a content-filter block is "a failed generation"
 * in the card's sense; a broken deployment is a different problem.
 */
export async function generateImage(
  request: GenerateImageRequest,
): Promise<GenerateImageResult> {
  const model = process.env.AZURE_OPENAI_DEPLOYMENT_IMAGE;
  if (!model) {
    throw new Error(
      "No image-generation deployment configured. Set AZURE_OPENAI_DEPLOYMENT_IMAGE " +
        "to the MAI-Image-2.5-Flash deployment name in Azure AI Foundry (the " +
        "deployment name, not the model name).",
    );
  }

  const size = request.size || process.env.AZURE_OPENAI_IMAGE_SIZE || "1536x1024";
  const client = getAzureClient();

  const buildParams = (withResponseFormat: boolean) => ({
    model,
    prompt: request.prompt,
    n: 1,
    size: size as any,
    ...(withResponseFormat ? { response_format: "b64_json" as const } : {}),
  });

  let response;
  try {
    response = await client.images.generate(buildParams(true));
  } catch (err: any) {
    if (err?.status === 404 || err?.code === "404") {
      throw new Error(
        `Azure OpenAI returned 404 for image generation.\n` +
          `  endpoint:    ${process.env.AZURE_OPENAI_ENDPOINT}\n` +
          `  deployment:  ${model}\n` +
          `  api-version: ${process.env.AZURE_OPENAI_API_VERSION || "2024-10-21"}\n` +
          `Verify the deployment name matches Azure AI Foundry exactly:\n` +
          `  az cognitiveservices account deployment list ` +
          `--name <openai-resource> --resource-group <rg> -o table`,
      );
    }
    if (isContentFilterError(err)) {
      throw new ImageGenerationBlockedError(err.message ?? "blocked by the content filter");
    }
    if (isUnsupportedParamError(err, "response_format")) {
      response = await client.images.generate(buildParams(false));
    } else {
      throw err;
    }
  }

  const datum = response.data?.[0] as { b64_json?: string; url?: string } | undefined;
  if (!datum) {
    throw new Error(
      `Azure OpenAI returned no image data for deployment '${model}' — the request ` +
        `succeeded but the response had no entries in 'data'.`,
    );
  }

  if (datum.b64_json) {
    return { imageBuffer: Buffer.from(datum.b64_json, "base64"), model };
  }

  if (datum.url) {
    const fetched = await fetch(datum.url);
    if (!fetched.ok) {
      throw new Error(
        `Image was generated but the returned URL could not be fetched (${fetched.status}).`,
      );
    }
    const arrayBuffer = await fetched.arrayBuffer();
    return { imageBuffer: Buffer.from(arrayBuffer), model };
  }

  throw new Error(
    `Azure OpenAI's image response had neither 'b64_json' nor 'url' for deployment '${model}'.`,
  );
}
