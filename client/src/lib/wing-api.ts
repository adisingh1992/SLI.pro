/**
 * The student surface's data layer.
 *
 * One module between the Wing screens and the API, because the prototype this UI came
 * from had no data layer at all — it read from `data/wing.ts` and wrote to React state —
 * and every screen would otherwise grow its own idea of what a message or a thread is.
 *
 * ── THE TWO VOCABULARIES, AND WHY THE MAPPING LIVES HERE ─────────────────
 * The design and the database describe a conversation differently, and neither is wrong.
 *
 *   the design    a Msg has `role: "wing" | "user" | "thinking" | "insight"` and, on
 *                 Wing's messages, `tone: "observing" | "proposing"`. Those two enums do
 *                 real work — `insight` renders as a salmon-bordered card, `thinking` as
 *                 three animated dots — so they are semantics, not styling.
 *   the database  a transcript turn has `turn_type` (ai_prompt, human_elicited_response,
 *                 human_spontaneous, ai_adapted, …) and `provenance_tag`, assigned at
 *                 capture because provenance is what the whole methodology is built on.
 *
 * `turnToMsg` is the only place the two meet. Anywhere else and two screens end up
 * disagreeing about which turns are Wing's — which is not hypothetical: keying on
 * `provenance_tag` renders every migrated turn as the student, because the Replit corpus
 * is uniformly `provenance_unknown` by design. Speaker comes from `turn_type`.
 *
 * ── ONE THREAD PER MODULE, FOR NOW, AND SAID OUT LOUD ────────────────────
 * The design shows several concurrent conversations, two of them in the same module
 * ("Interview prep — Meridian" and "Interview prep — Northstar"), and Danielle's routing
 * rules make that a rule: "Every switch creates a new thread."
 *
 * The backend cannot express it yet. `sessions` holds one row per (student, type) —
 * `ensureSession` is documented as idempotent on exactly that — and `transcripts` is
 * unique on `session_id`. So a thread here IS a session, and its id is the module slug.
 * That is honest and it works; it is not what the design shows, and `threadsAreSessions`
 * exists so a screen can say so rather than quietly rendering a one-item sidebar as
 * though it were the full picture.
 */
import { apiFetch, apiRequest, apiUrl } from "./queryClient";
import {
  SLUG_FOR_SESSION_TYPE,
  moduleFor,
  type ModuleSlug,
  type WingModule,
} from "./wing-modules";

/**
 * True while a thread is a session and cannot be duplicated per module.
 *
 * Read by the sidebar so it does not offer "new conversation" affordances that would
 * resume the existing one instead. Flip it when `sessions.module_slug` and a thread list
 * endpoint land — see the module map, §3.
 */
export const threadsAreSessions = true;

/* ── Messages ─────────────────────────────────────────────────────────── */

export type WingTone = "observing" | "proposing";

export type Msg =
  | { id: string; role: "wing"; tone: WingTone; text: string }
  | { id: string; role: "user"; text: string }
  | { id: string; role: "thinking"; text: string }
  | { id: string; role: "insight"; text: string };

/** A transcript turn, as `/api/foundation-sessions/:n` returns it. */
export type Turn = {
  id: number;
  position: number;
  turnType: string;
  provenanceTag: string;
  content: string;
  signalDetected: boolean;
  createdAt: string;
};

/**
 * Wing's turn types, from the `turn_type` enum.
 *
 * Listed rather than inferred from a prefix. `ai_` happens to prefix both of them today,
 * and a rule that reads a prefix silently reclassifies the whole transcript the day
 * somebody adds `ai_summary` or renames one — which is the same failure as reading
 * provenance, one step further along.
 */
const AI_TURN_TYPES: ReadonlySet<string> = new Set(["ai_prompt", "ai_adapted"]);

/**
 * One turn, as the chat renders it.
 *
 * `signalDetected` becomes an insight card. That is the closest honest mapping the
 * schema offers: the column marks a turn where Wing recognised something in what the
 * student said, which is exactly what "Wing noticed something" claims. Wing's *tone* is
 * not in the schema at all — see `toneFor`.
 */
export function turnToMsg(t: Turn): Msg {
  const id = `t${t.id}`;
  if (!AI_TURN_TYPES.has(t.turnType)) return { id, role: "user", text: t.content };
  if (t.signalDetected) return { id, role: "insight", text: t.content };
  return { id, role: "wing", tone: toneFor(t.content), text: t.content };
}

/**
 * Wing's register, until the model emits it.
 *
 * ── THIS IS A PLACEHOLDER AND IT IS MARKED AS ONE ────────────────────────
 * `tone` is a real distinction in the methodology — observing is "I noticed…", proposing
 * is "let's…" — and the right source is the model, which knows which it just did. There
 * is no column for it and no field on the stream, so this reads the text.
 *
 * A question mark or an imperative opening is a proposal; anything else is an
 * observation. That is a heuristic, it will be wrong sometimes, and the cost of being
 * wrong is a slightly warmer or cooler bubble — which is why a guess is tolerable here
 * and would not be for anything that changes what Wing says.
 *
 * When the stream carries a tone, delete this and read it. Do not extend it.
 */
export function toneFor(text: string): WingTone {
  const t = text.trim();
  if (t.endsWith("?")) return "proposing";
  return /^(let'?s|try|tell me|walk me|start|pick|give me|take)\b/i.test(t)
    ? "proposing"
    : "observing";
}

/* ── Sessions, which are threads ──────────────────────────────────────── */

export type ApiSession = {
  id: number;
  sessionType: string;
  sessionNumber: number;
  status: "locked" | "available" | "in_progress" | "completed" | "ended_early";
  startedAt: string | null;
  completedAt: string | null;
  timerElapsedSeconds: number;
  createdAt: string;
};

export type Thread = {
  /** The module slug. See the header: a thread is a session, for now. */
  id: ModuleSlug;
  title: string;
  /** Display string — "Just now", "3 days ago". Derived from `createdAt`. */
  when: string;
  module: WingModule;
  session: ApiSession | null;
  messages: Msg[];
};

export async function listFoundationSessions(): Promise<ApiSession[]> {
  const res = await apiRequest("GET", "/api/foundation-sessions");
  return (await res.json()) as ApiSession[];
}

export async function getFoundationSession(
  n: number,
): Promise<{ session: ApiSession; turns: Turn[]; artifacts: unknown[] }> {
  const res = await apiRequest("GET", `/api/foundation-sessions/${n}`);
  return await res.json();
}

/**
 * Starts a session if it is not already running.
 *
 * Safe to call on a completed one: the route grew a guard so reopening a finished
 * session no longer demotes it to `in_progress` and drops it out of every context
 * builder that keys on `completed`.
 */
export async function startFoundationSession(n: number): Promise<void> {
  await apiFetch("POST", `/api/foundation-sessions/${n}/start`);
}

/* ── The stream ───────────────────────────────────────────────────────── */

export type StreamEvent =
  | { type: "chunk"; content: string }
  | { type: "session_completed"; artifactType: string; content: unknown; transition?: string }
  | { type: "done" }
  | { type: "error"; message: string };

/**
 * One turn of conversation, streamed.
 *
 * ── WHY THIS IS A HAND-ROLLED READER AND NOT `EventSource` ───────────────
 * `EventSource` only issues GETs. The turn carries the student's message in a body, and
 * the session cookie has to ride along, so this is `fetch` with `credentials: "include"`
 * and a manual SSE parse. Which is fine — the format is two lines and a blank.
 *
 * The buffer split is on "\n\n" and the remainder is KEPT. A chunk boundary lands
 * mid-event often enough that dropping the tail loses roughly one message in twenty,
 * and it loses it silently: the text simply arrives with a hole in it.
 */
export async function streamTurn(
  sessionNumber: number,
  content: string,
  onEvent: (e: StreamEvent) => void,
  signal?: AbortSignal,
): Promise<void> {
  const res = await fetch(
    apiUrl(`/api/foundation-sessions/${sessionNumber}/messages/stream`),
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ content }),
      credentials: "include",
      ...(signal ? { signal } : {}),
    },
  );

  if (!res.ok || !res.body) {
    onEvent({ type: "error", message: `The conversation could not be reached (${res.status}).` });
    return;
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });

    const parts = buffer.split("\n\n");
    buffer = parts.pop() ?? "";

    for (const part of parts) {
      const line = part.split("\n").find((l) => l.startsWith("data: "));
      if (!line) continue;
      try {
        onEvent(JSON.parse(line.slice(6)) as StreamEvent);
      } catch {
        /*
         * A malformed frame is dropped rather than thrown. Throwing here aborts the
         * read, which loses the rest of a reply that is otherwise fine — and the
         * student sees a half-sentence and an error for one bad frame.
         */
      }
    }
  }
}

/* ── The life log — "What's Happened", and the weekly check-in ────────── */

export type LifeLogEntry = {
  id: number;
  entryText: string;
  entryType: "career" | "personal";
  wingResponse: string | null;
  createdAt: string;
};

export type LifeLogPrompt = { id: number; promptText: string } | null;

export async function getLifeLog(): Promise<{
  entries: LifeLogEntry[];
  prompt: LifeLogPrompt;
  summary: unknown;
}> {
  const res = await apiRequest("GET", "/api/life-log");
  return await res.json();
}

export async function addLifeLogEntry(params: {
  entryText: string;
  entryType?: "career" | "personal";
  promptId?: number | null;
}): Promise<LifeLogEntry> {
  const res = await apiRequest("POST", "/api/life-log", {
    entryText: params.entryText,
    entryType: params.entryType ?? "career",
    /*
     * Sent only when it is a real integer. The route checks `Number.isInteger`, so an
     * undefined or null id is stored as "unprompted" — which is correct for a milestone
     * the student typed into the log themselves, and wrong for an answer to this week's
     * prompt, where the id is what ties the answer to the question.
     */
    ...(Number.isInteger(params.promptId) ? { promptId: params.promptId } : {}),
  });
  return await res.json();
}

/**
 * Waits for the background reply on a life-log entry that was just created.
 *
 * `createEntry` (`life-log-store.ts`) returns the instant the entry is inserted, with
 * `wingResponse: null` — the judged reply is a model call that runs afterward,
 * deliberately not held up: its own comment is explicit that the entry must not be
 * "held hostage" to an LLM round trip. Good for "What's Happened", which just
 * refetches the list and lets the reply show up whenever it's ready. Wrong for the
 * chat surface, where the student is sitting there watching — showing nothing after
 * they hit send is exactly the "looks stuck" bug this app keeps having to fix.
 *
 * So this polls briefly. If the reply still is not there, it asks the explicit
 * backfill route once — `POST /api/life-log/:id/response`, the same retry path
 * "What's Happened" has for an entry that never got a reply at all — before giving up
 * and letting the caller say so honestly rather than spinning forever.
 */
export async function waitForLifeLogResponse(
  entryId: number,
  { tries = 6, intervalMs = 1500 }: { tries?: number; intervalMs?: number } = {},
): Promise<string | null> {
  for (let i = 0; i < tries; i++) {
    await new Promise((resolve) => setTimeout(resolve, intervalMs));
    const { entries } = await getLifeLog();
    const found = entries.find((e) => e.id === entryId);
    if (found?.wingResponse) return found.wingResponse;
  }

  try {
    await apiRequest("POST", `/api/life-log/${entryId}/response`);
  } catch {
    return null;
  }

  const { entries } = await getLifeLog();
  return entries.find((e) => e.id === entryId)?.wingResponse ?? null;
}

/* ── Baby Radar — H-701's weekly topic suggestions ───────────────────────
 *
 * Not the same thing as Module 7's full Wing Radar, which the `/radar`
 * page's own header comment describes as unbuilt (no web search, no weekly
 * generation job). Baby Radar is a smaller, already-shipped piece: a weekly
 * cron job (`runDueRadarSuggestions`) generates 3-5 topic suggestions from a
 * student's positioning, not from any real news or search. This is the
 * client binding for it.
 */

export type RadarSuggestion = {
  id: number;
  topic: string;
  whyRelevant: string;
  suggestedAction: "comment" | "post" | "save_for_later";
  generatedAt: string;
  engagedAt: string | null;
};

export async function getRadarSuggestions(): Promise<{
  suggestions: RadarSuggestion[];
  eligible: boolean;
  reason: string;
}> {
  const res = await apiRequest("GET", "/api/radar-suggestions");
  return await res.json();
}

export async function engageRadarSuggestion(id: number): Promise<{ engaged: boolean }> {
  const res = await apiRequest("POST", `/api/radar-suggestions/${id}/engage`);
  return await res.json();
}

/* ── Content Triggers — H-620–627's student-facing surface ────────────────
 *
 * `content-trigger-routes.ts` had no client binding at all until now — the
 * whole Content Trigger Layer (comment/post/article suggestions) was
 * backend-only. Deliberately NOT a drafting UI: accepting or requesting a
 * suggestion seeds a `content_drafts` row with a coaching prompt, never
 * finished prose (H-615 — Wing coaches, never authors), so what comes back
 * is something to write FROM, not something to publish as-is. Actually
 * publishing still goes through the existing
 * `POST /api/linkedin-content-drafts/:draftId/post`, with whatever text the
 * student wrote themselves.
 */

export type ContentTriggerType = "comment" | "post" | "article";

export type ContentTriggerStatus = {
  fires: boolean;
  contentType: ContentTriggerType | null;
  reason: string;
  signal: string | null;
  triggerSource: string | null;
};

export type ContentTriggerAccepted = {
  recorded: boolean;
  contentType: ContentTriggerType;
  draftId: number | null;
  coachingPrompt: string;
};

export async function getContentTriggerStatus(): Promise<ContentTriggerStatus> {
  const res = await apiRequest("GET", "/api/content-triggers");
  return await res.json();
}

export async function acceptContentTrigger(contentType: ContentTriggerType): Promise<ContentTriggerAccepted> {
  const res = await apiRequest("POST", "/api/content-triggers/accept", { contentType });
  return await res.json();
}

export async function declineContentTrigger(contentType: ContentTriggerType): Promise<{ recorded: boolean }> {
  const res = await apiRequest("POST", "/api/content-triggers/decline", { contentType });
  return await res.json();
}

/** H-626's explicit-request override — comment isn't accepted; see the route's own note. */
export async function requestContentTrigger(
  contentType: "post" | "article",
): Promise<ContentTriggerAccepted> {
  const res = await apiRequest("POST", "/api/content-triggers/request", { contentType });
  return await res.json();
}

/**
 * Publishes student-written text to LinkedIn via the existing, unmodified
 * `POST /api/linkedin-content-drafts/:draftId/post` — the same publish route
 * the older MVP page uses. That route accepts arbitrary `content` from the
 * request body independent of the stored draft row, so this never sends
 * anything Wing generated — only whatever the student typed.
 */
export async function postContentDraftToLinkedIn(
  draftId: number,
  content: string,
): Promise<unknown> {
  const res = await apiRequest("POST", `/api/linkedin-content-drafts/${draftId}/post`, { content });
  return await res.json();
}

/* ── Positioning Refresh — a real conversation, but not a Foundation session ──
 *
 * `/api/positioning-refresh/*` (`refresh-routes.ts`) is complete server-side — begin,
 * message, accept, history, reset — and had no client binding at all until now, which
 * is why "Refresh Your Positioning" sat in the registry marked `status: "live"` and
 * did nothing: `chat.tsx` had no way to reach it, so every message typed into it fell
 * through to the same "isn't something I can work on with you yet" branch built for
 * modules that are honestly unbuilt. This one wasn't unbuilt. It was unwired.
 *
 * It isn't a Foundation session — no SSE stream, no `session_type: "foundation_*"`,
 * not in `listThreads()` — so it gets its own small surface here rather than being
 * bent to fit `streamTurn`. One JSON round trip per turn, and a `proposal` field that
 * a Foundation turn never has: the model's suggested new SLI, which the student has to
 * accept explicitly (`acceptPositioningRefresh`) rather than it landing as a side
 * effect of chatting.
 */

export type RefreshMessage = { role: "assistant" | "user"; content: string };

export type RefreshState = {
  /** Whether there's anything to refresh at all — false until a first SLI exists. */
  available: boolean;
  currentSli: { id: number; statement: string; createdAt: string } | null;
  priorCount: number;
  messages: RefreshMessage[];
  complete: boolean;
};

export async function getPositioningRefresh(): Promise<RefreshState> {
  const res = await apiRequest("GET", "/api/positioning-refresh");
  return await res.json();
}

/** Idempotent, like `startFoundationSession` — safe to call on a conversation that has
 *  already started; `refresh.begin` (server-side) returns the existing state rather
 *  than re-opening. */
export async function beginPositioningRefresh(): Promise<RefreshState> {
  const res = await apiRequest("POST", "/api/positioning-refresh/begin");
  return await res.json();
}

export type RefreshProposal = { statement: string; rationale: string };

export async function sendPositioningRefreshMessage(
  message: string,
): Promise<{ reply: string; proposal: RefreshProposal | null; unchanged: boolean }> {
  const res = await apiRequest("POST", "/api/positioning-refresh/message", { message });
  return await res.json();
}

/** The explicit "yes, replace my SLI with this" step — never automatic. */
export async function acceptPositioningRefresh(
  proposal: RefreshProposal,
): Promise<{ sli: { id: number; statement: string } }> {
  const res = await apiRequest("POST", "/api/positioning-refresh/accept", proposal);
  return await res.json();
}

/** A refresh turn, mapped onto the same `Msg` shape every other conversation renders. */
export function refreshMsgFor(m: RefreshMessage, i: number): Msg {
  return m.role === "user"
    ? { id: `refresh-${i}`, role: "user", text: m.content }
    : { id: `refresh-${i}`, role: "wing", tone: toneFor(m.content), text: m.content };
}

/* ── Scoped free chat — persisted as an ongoing_engagement transcript ─── */

export type FreeChatMessage = {
  id: number;
  role: "assistant" | "user";
  content: string;
};

export type FreeChatState = {
  active: boolean;
  sessionId: number | null;
  messages: FreeChatMessage[];
};

export async function getFreeChat(): Promise<FreeChatState> {
  const res = await apiRequest("GET", "/api/wing/free-chat");
  return await res.json();
}

/** Activates the scoped conversation; idempotent and does not store the routing phrase. */
export async function beginFreeChat(): Promise<FreeChatState> {
  const res = await apiRequest("POST", "/api/wing/free-chat/begin");
  return await res.json();
}

export async function sendFreeChatMessage(content: string): Promise<{
  reply: string;
  category: string;
  userTurnId: number;
  replyTurnId: number;
}> {
  const res = await apiRequest("POST", "/api/wing/free-chat/message", { content });
  return await res.json();
}

export function freeChatMsgFor(m: FreeChatMessage): Msg {
  return m.role === "user"
    ? { id: `free-${m.id}`, role: "user", text: m.content }
    : { id: `free-${m.id}`, role: "wing", tone: toneFor(m.content), text: m.content };
}

/* ── Documents ────────────────────────────────────────────────────────── */

export type WingDocKind = "Resume" | "LinkedIn profile" | "Assessment";

export type WingDoc = {
  id: number;
  name: string;
  kind: WingDocKind;
  when: string;
};

export async function listDocuments(): Promise<WingDoc[]> {
  const res = await apiRequest("GET", "/api/documents");
  const rows = (await res.json()) as Array<Record<string, unknown>>;
  return rows.map(toWingDoc);
}

/**
 * A stored document, in the shape the files screen slots by.
 *
 * `kind` is a closed three-member union and the screen finds the resume and the LinkedIn
 * PDF by matching on it, so an unrecognised document type has to land somewhere rather
 * than becoming `undefined` and silently emptying a required slot.
 */
function toWingDoc(row: Record<string, unknown>): WingDoc {
  const raw = String(row.documentType ?? row.type ?? "").toLowerCase();
  const kind: WingDocKind = raw.includes("resume")
    ? "Resume"
    : raw.includes("linkedin")
      ? "LinkedIn profile"
      : "Assessment";

  return {
    id: Number(row.id),
    name: String(row.fileName ?? row.name ?? "Untitled"),
    kind,
    when: whenLabel(String(row.createdAt ?? row.uploadedAt ?? "")),
  };
}

export async function deleteDocument(id: number): Promise<void> {
  await apiRequest("DELETE", `/api/documents/${id}`);
}

/* ── Display helpers ──────────────────────────────────────────────────── */

/**
 * "Just now" · "3 days ago" · "12 March 2024".
 *
 * The prototype stored these as free text on every record — `when`, `date` — with no
 * timestamp anywhere, so sorting was impossible and its own sort comparator was a no-op
 * for two of three modes. The API returns real timestamps; the string is derived at the
 * edge, where it belongs, and nothing downstream ever has to parse "This Thursday".
 */
export function whenLabel(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";

  const mins = Math.floor((Date.now() - d.getTime()) / 60000);
  if (mins < 2) return "Just now";
  if (mins < 60) return `${mins} minutes ago`;

  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours} hour${hours === 1 ? "" : "s"} ago`;

  const days = Math.floor(hours / 24);
  if (days === 1) return "Yesterday";
  if (days < 7) return `${days} days ago`;
  if (days < 14) return "Last week";
  if (days < 31) return `${Math.floor(days / 7)} weeks ago`;

  return d.toLocaleDateString(undefined, { day: "numeric", month: "long", year: "numeric" });
}

/** A client-side id for a message that has not been stored yet. */
let localSeq = 0;
export const localId = () => `local-${Date.now().toString(36)}-${++localSeq}`;

/* ── Threads ──────────────────────────────────────────────────────────── */

/**
 * Every conversation the student has, newest first.
 *
 * Built from the Foundation sessions, because those are the only modules with a
 * transcript today. A module with no session yet still gets a thread — the student can
 * open it and start — but it sorts last and carries no messages.
 */
export async function listThreads(): Promise<Thread[]> {
  const sessions = await listFoundationSessions();
  const bySlug = new Map<ModuleSlug, ApiSession>();

  for (const s of sessions) {
    const slug = SLUG_FOR_SESSION_TYPE[s.sessionType];
    if (slug) bySlug.set(slug, s);
  }

  const threads: Thread[] = [];
  for (const [slug, session] of bySlug) {
    const module = moduleFor(slug);
    if (!module) continue;
    threads.push({
      id: slug,
      title: module.name,
      when: whenLabel(session.startedAt ?? session.createdAt),
      module,
      session,
      messages: [],
    });
  }

  /*
   * Started conversations first, then untouched ones — the sidebar is a history, and a
   * session that exists only because `ensureFoundationArc` created it is not history.
   */
  return threads.sort((a, b) => {
    const at = a.session?.startedAt ?? "";
    const bt = b.session?.startedAt ?? "";
    if (!at && !bt) return 0;
    if (!at) return 1;
    if (!bt) return -1;
    return bt.localeCompare(at);
  });
}

/** The turns of one thread, as messages. */
export async function loadThreadMessages(thread: Thread): Promise<Msg[]> {
  const n = thread.module.sessionType
    ? Number(thread.module.sessionType.replace("foundation_", ""))
    : null;
  if (!n) return [];

  const { turns } = await getFoundationSession(n);
  return turns.map(turnToMsg);
}

/* ── Notification preferences — Settings' Email/SMS toggles ──────────────── */

export type NotificationPreferences = { emailOptIn: boolean; smsOptIn: boolean };

export async function getNotificationPreferences(): Promise<NotificationPreferences> {
  const res = await apiRequest("GET", "/api/user/notification-preferences");
  return await res.json();
}

export async function updateNotificationPreferences(
  patch: Partial<NotificationPreferences>,
): Promise<NotificationPreferences> {
  const res = await apiRequest("PATCH", "/api/user/notification-preferences", patch);
  return await res.json();
}
