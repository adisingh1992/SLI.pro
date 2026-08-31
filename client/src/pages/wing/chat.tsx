import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useLocation, useRoute } from "wouter";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Loader2 } from "lucide-react";
import { isFoundationNumber } from "@shared/session-access";
import { AppShell, OfflineBanner } from "@/components/wing/AppShell";
import { ExploreOverlay } from "@/components/wing/ExploreOverlay";
import { MessageRow } from "@/components/wing/chat/Bubbles";
import { Composer } from "@/components/wing/chat/Composer";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/hooks/use-auth";
import {
  acceptPositioningRefresh,
  addLifeLogEntry,
  beginPositioningRefresh,
  getLifeLog,
  getPositioningRefresh,
  listThreads,
  loadThreadMessages,
  localId,
  refreshMsgFor,
  sendPositioningRefreshMessage,
  startFoundationSession,
  streamTurn,
  toneFor,
  waitForLifeLogResponse,
  type Msg,
  type RefreshProposal,
  type Thread,
} from "@/lib/wing-api";
import {
  moduleFor,
  SLUG_FOR_SESSION_TYPE,
  unavailableOpening,
  type ModuleSlug,
  type WingModule,
} from "@/lib/wing-modules";

/**
 * Where a completed Foundation session sends the student next.
 *
 * `FOUNDATION_TRANSITIONS` (`shared/transitions.ts`) already NAMES the next session in
 * the transition card's own text — "Session 2 identifies the credibility you already
 * have" — so this mapping isn't inventing a sequence, it's just where that same "what's
 * next" the student was just told about actually takes them. Session 3's `nextStep` is
 * `null` there (there is no Session 4), which is why this map's last entry is too — the
 * dashboard, not another module, is what "done with Foundation" goes to.
 */
const NEXT_FOUNDATION_SLUG: Readonly<Record<1 | 2 | 3, ModuleSlug | null>> = {
  1: SLUG_FOR_SESSION_TYPE.foundation_2,
  2: SLUG_FOR_SESSION_TYPE.foundation_3,
  3: null,
};

/**
 * The conversation. The whole student product, more or less.
 *
 * ── STREAMING INTO ONE BUBBLE, AND WHAT THAT IS NOT ──────────────────────
 * The design shows Wing's longer replies broken into several bubbles with a pause
 * between them, which is H-308 and IG-UX04. That is real and it is not faked here.
 *
 * The prototype produced it with `setTimeout` — 350ms, then 1550ms, then 900ms — against
 * scripted text it already had. Against a live model there is no script, and splitting
 * the stream client-side would mean the client deciding where Wing's thoughts end. That
 * decision already exists, server-side, in `wing/chunking.ts` (`planChunks`,
 * `MIN_PAUSE_MS`, `MAX_PAUSE_MS`, `StreamChunker`) — complete, tested, and not yet wired
 * into the SSE stream, which emits raw token chunks.
 *
 * So this renders one bubble that fills as the tokens arrive, which is honest and is what
 * a student expects from a chat. When the stream emits bubble boundaries, this reads them
 * and the pauses appear. A client-side re-implementation would be a second opinion about
 * chunking that disagrees with the tested one the moment either changes.
 *
 * ── A THREAD IS A MODULE ─────────────────────────────────────────────────
 * `/chat/:slug`. Switching module navigates rather than mutating, so the browser's back
 * button walks the student's own path through the conversation — which matters more here
 * than usual, because "every switch creates a new thread" means switching is a thing they
 * will do often.
 */
export default function WingChatPage() {
  const [, params] = useRoute("/chat/:slug");
  const [, navigate] = useLocation();
  const { user } = useAuth();
  const queryClient = useQueryClient();

  const [exploreOpen, setExploreOpen] = useState(false);
  const [local, setLocal] = useState<Msg[]>([]);
  const [streaming, setStreaming] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const abortRef = useRef<AbortController | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  /**
   * Set the moment a Foundation session completes — not acted on automatically. It
   * drives the "ready to move on?" prompt rendered above the composer, which the
   * student clicks themselves when they're ready. `null` means no just-finished
   * session is waiting on that decision.
   */
  const [completedNav, setCompletedNav] = useState<{ nextSlug: ModuleSlug | null } | null>(null);
  /** The model's suggested new SLI, waiting on the student's explicit yes. See
   *  `acceptRefreshProposal` and the banner it drives, below the message list. */
  const [refreshProposal, setRefreshProposal] = useState<RefreshProposal | null>(null);
  /** True for the span of the `acceptPositioningRefresh` request. `accept()` calls the
   *  model and writes a new SLI row (`sliStore.refresh`) — slow enough, with nothing
   *  between click and the proposal disappearing, that an unguarded button invited
   *  repeat clicks, each one its own request racing to create its own SLI refresh. */
  const [acceptingRefresh, setAcceptingRefresh] = useState(false);

  const { data: threads = [], isLoading: threadsLoading } = useQuery({
    queryKey: ["wing", "threads"],
    queryFn: listThreads,
  });

  /*
   * The slug decides the module, not the thread list — a module with no session yet has
   * no thread, and it still has to be openable. That is the difference between "you have
   * not started this" and "this does not exist".
   */
  const module: WingModule | null = params?.slug ? moduleFor(params.slug) : null;
  const isRefreshModule = module?.slug === "refresh_your_positioning";
  const isCheckInModule = module?.slug === "weekly_check_in";

  const thread: Thread | null = useMemo(
    () => threads.find((t) => t.id === module?.slug) ?? null,
    [threads, module],
  );

  const { data: stored = [], isLoading: msgsLoading } = useQuery({
    queryKey: ["wing", "messages", module?.slug],
    queryFn: () => (thread ? loadThreadMessages(thread) : Promise.resolve([])),
    enabled: !!thread,
  });

  /*
   * Positioning Refresh isn't a Foundation session — no `thread`, not in `listThreads()`
   * (see `wing-api.ts`'s comment on why) — so its conversation lives in its own query
   * rather than being forced through `stored`/`loadThreadMessages`. `getPositioningRefresh`
   * is also what the opening text and the auto-start effect below read `available` and
   * `messages.length` from.
   */
  const { data: refreshState, isLoading: refreshLoading } = useQuery({
    queryKey: ["wing", "positioning-refresh"],
    queryFn: getPositioningRefresh,
    enabled: isRefreshModule,
  });

  /* The weekly check-in's opening line is today's actual prompt, not a canned greeting. */
  const { data: lifeLogPrompt } = useQuery({
    queryKey: ["wing", "life-log-prompt"],
    queryFn: async () => (await getLifeLog()).prompt,
    enabled: isCheckInModule,
  });

  /*
   * Stored turns, then anything sent since, then whatever is arriving now.
   *
   * ── THE GAP BETWEEN "SENT" AND THE FIRST TOKEN ───────────────────────────
   * `send()` calls `setStreaming("")` the instant a turn goes out, before the model has
   * produced anything to show. That used to render straight into the `role: "wing"` bubble
   * below with `text: ""` — a blank, static bubble with nothing in it, which is exactly
   * what "there's no animation, it looks stuck" describes: nothing on screen changes
   * between hitting send and the first chunk arriving, however long that takes.
   *
   * `Bubbles.tsx` already has a `role: "thinking"` bubble built for precisely this —
   * three dots pulsing on `wing-dot` — it just was never constructed here. So: while
   * `streaming` is the empty string (turn sent, nothing back yet), show that; the moment
   * real text starts arriving, swap to the normal streaming `wing` bubble that fills in
   * as tokens come.
   *
   * Positioning Refresh's history comes from `refreshState.messages` (mapped through
   * `refreshMsgFor`) rather than `stored`, since `stored` is wired to `loadThreadMessages`
   * and stays empty here — `thread` is always null for this module (see the query above).
   */
  const messages: Msg[] = useMemo(() => {
    const base = isRefreshModule ? (refreshState?.messages.map(refreshMsgFor) ?? []) : stored;
    const out = [...base, ...local];
    if (streaming !== null) {
      out.push(
        streaming === ""
          ? { id: "streaming", role: "thinking", text: "" }
          : { id: "streaming", role: "wing", tone: toneFor(streaming), text: streaming },
      );
    }
    return out;
  }, [stored, local, streaming, isRefreshModule, refreshState]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages.length, streaming]);

  /* A new thread means nothing is in flight and nothing local belongs to it. */
  useEffect(() => {
    abortRef.current?.abort();
    setLocal([]);
    setStreaming(null);
    setBusy(false);
    /* A prompt left over from whatever module they were just in has no business here. */
    setCompletedNav(null);
    setRefreshProposal(null);
  }, [module?.slug]);

  /*
   * ── A LIVE MODULE OPENS WITH WING SPEAKING FIRST ──────────────────────────
   * `ensureFoundationArc` pre-creates all three Foundation sessions the first time a
   * student touches any of these routes — `status: "available"`, zero turns, no
   * `startedAt` — so `thread` is non-null for every live module long before the student
   * has ever opened it. `send()`, below, already starts an untouched session on the
   * student's first message. But simply VIEWING a never-started module's page skips
   * that: the session row already exists, so `!thread` is false there, and nothing
   * calls `/start` — which is also what seeds Wing's opening turn server-side
   * (`foundationOpening`, in `foundation-sessions-routes.ts`). Nothing to await and
   * nothing to render: a genuinely empty transcript, no greeting, until the student
   * types first into what looks like a broken page.
   *
   * Reached three ways that all skip `pickModule` (which does call `/start`): the bare
   * `/chat` → `/chat/discover_your_function` fallback below, a bookmarked or shared
   * thread URL, and the dashboard's "Wing recommends" card (`hrefFor` in
   * `wing-recommendation.ts`) — the most common route right after intake.
   *
   * So: opening a live module whose session has never started calls `/start` itself —
   * the same idempotent call `pickModule` already makes — then refetches both queries
   * so the seeded opening turn appears without the student sending anything first. The
   * `session?.status === "available"` check is what "never started" actually means here
   * (not `!thread`, which `ensureFoundationArc` makes false from the first page load —
   * the row already exists), and it stops this from firing again once the refetch turns
   * that status over.
   */
  const autoStartedRef = useRef<string | null>(null);
  const [autoStarting, setAutoStarting] = useState(false);
  useEffect(() => {
    if (!module || module.status !== "live" || !module.sessionType) return;
    if (!thread || thread.session?.status !== "available") return;
    if (autoStartedRef.current === module.slug) return;
    autoStartedRef.current = module.slug;

    const n = Number(module.sessionType.replace("foundation_", ""));
    setAutoStarting(true);
    void startFoundationSession(n)
      .then(() =>
        Promise.all([
          queryClient.invalidateQueries({ queryKey: ["wing", "threads"] }),
          queryClient.invalidateQueries({ queryKey: ["wing", "messages", module.slug] }),
        ]),
      )
      .finally(() => setAutoStarting(false));
  }, [module, thread, queryClient]);

  /*
   * Positioning Refresh's own version of the effect above: `refresh.begin` (server-side)
   * is what seeds Wing's opening line — the one that quotes the student's existing SLI
   * back to them — and nothing calls it just from viewing the page. Fires once a fetched
   * `refreshState` says there's something to refresh and the conversation hasn't started
   * (`messages.length === 0`); guarded by slug, same as `autoStartedRef`, so a refetch
   * that turns `messages` non-empty doesn't fire it again.
   */
  const refreshStartedRef = useRef<string | null>(null);
  useEffect(() => {
    if (!isRefreshModule || !refreshState) return;
    if (!refreshState.available || refreshState.messages.length > 0) return;
    if (refreshStartedRef.current === module?.slug) return;
    refreshStartedRef.current = module?.slug ?? null;

    void beginPositioningRefresh()
      .then(() => queryClient.invalidateQueries({ queryKey: ["wing", "positioning-refresh"] }))
      .catch(() => {
        // Nothing to do — refreshStartedRef stays set for this slug, so a broken begin()
        // call doesn't retry in a loop; the student just sees the "not available yet"
        // opening a beat longer than expected rather than a crash.
      });
  }, [isRefreshModule, refreshState, module?.slug, queryClient]);

  const send = useCallback(
    async (text: string) => {
      if (!module || busy) return;

      setLocal((m) => [...m, { id: localId(), role: "user", text }]);

      /*
       * ── WEEKLY CHECK-IN: A LIFE-LOG ENTRY, NOT A FOUNDATION TURN ──────────────
       * `addLifeLogEntry` returns the instant the entry is saved, with `wingResponse`
       * still null — the reply is a model call that runs in the background
       * (`life-log-store.ts`'s `finishEntry`, fired and not awaited). `waitForLifeLogResponse`
       * polls briefly for it rather than either blocking indefinitely or, as before this
       * fix, showing nothing at all — which is what made this module read as broken.
       */
      if (isCheckInModule) {
        setBusy(true);
        setStreaming("");
        try {
          const entry = await addLifeLogEntry({
            entryText: text,
            promptId: lifeLogPrompt?.id ?? null,
          });
          /*
           * Milestones/"What's Happened" (`milestones.tsx`) reads this same list under
           * `["wing", "life-log"]` and invalidates it after its own submit — this page
           * never did, so an entry logged here sat in `chat.tsx`'s local state only,
           * invisible on Milestones until an unrelated refetch (a manual reload) happened
           * to run. Invalidated once now, so the entry itself shows up right away, and
           * again after the poll below, so Wing's reply does too if it arrived in time.
           */
          void queryClient.invalidateQueries({ queryKey: ["wing", "life-log"] });
          void queryClient.invalidateQueries({ queryKey: ["wing", "dashboard"] });
          const reply = await waitForLifeLogResponse(entry.id);
          void queryClient.invalidateQueries({ queryKey: ["wing", "life-log"] });
          setLocal((m) => [
            ...m,
            {
              id: localId(),
              role: "wing",
              tone: "observing",
              text:
                reply ??
                "Logged — thank you. I'm still working on a reply; it'll be here if you check back shortly.",
            },
          ]);
        } catch {
          setLocal((m) => [
            ...m,
            { id: localId(), role: "wing", tone: "observing", text: "That didn't save — try again?" },
          ]);
        } finally {
          setStreaming(null);
          setBusy(false);
        }
        return;
      }

      /*
       * ── POSITIONING REFRESH: ONE JSON ROUND TRIP, NOT A STREAM ────────────────
       * `/api/positioning-refresh/message` returns a complete reply in one response — no
       * SSE, no chunk events — so this fills `streaming` straight to the final text rather
       * than accumulating it. A `proposal` puts a suggested new SLI up for the student's
       * explicit accept (the banner below the message list); it is never applied here.
       */
      if (isRefreshModule) {
        setBusy(true);
        setStreaming("");
        try {
          const result = await sendPositioningRefreshMessage(text);
          setLocal((m) => [
            ...m,
            { id: localId(), role: "wing", tone: toneFor(result.reply), text: result.reply },
          ]);
          if (result.proposal) setRefreshProposal(result.proposal);
        } catch {
          setLocal((m) => [
            ...m,
            {
              id: localId(),
              role: "wing",
              tone: "observing",
              text: "That didn't reach me — the connection dropped, not the thread. Try again?",
            },
          ]);
        } finally {
          setStreaming(null);
          setBusy(false);
          void queryClient.invalidateQueries({ queryKey: ["wing", "positioning-refresh"] });
        }
        return;
      }

      /*
       * A module with no methodology gets one honest sentence and no request.
       *
       * The alternative is asking the model to coach without cards, which is precisely
       * what this codebase exists not to do — and the student cannot tell the difference,
       * which is what makes it the wrong kind of wrong.
       */
      if (module.status !== "live" || !module.sessionType) {
        setLocal((m) => [
          ...m,
          { id: localId(), role: "wing", tone: "proposing", text: unavailableOpening(module) },
        ]);
        return;
      }

      const n = Number(module.sessionType.replace("foundation_", ""));

      /*
       * ── A LIVE MODULE'S SESSION HAS TO BE STARTED BEFORE IT CAN BE SENT TO ────
       * `pickModule` calls `startFoundationSession` before navigating, and the auto-start
       * effect above does the same the moment a never-started module's page is opened, so
       * by the time a student can actually type, the session is normally already
       * `in_progress`. This guard is what covers the gap between those: the student typing
       * and hitting send before that effect's own `/start` call has resolved.
       *
       * `thread.session?.status === "available"` is what "never started" actually looks
       * like — NOT `!thread`. `ensureFoundationArc` pre-creates all three Foundation
       * session rows the first time a student touches any of these routes, and
       * `listThreads` deliberately keeps every one of them (its own comment: "a module
       * with no session yet still gets a thread"), so `thread` is essentially always
       * non-null for a live module. Checking `!thread` alone here is why this guard used
       * to look like it covered "never started" and didn't: a `available` session already
       * has a `thread`, `!thread` was false, nothing called `/start`, and the send hit the
       * stream route's own guard — "Session must be in progress or completed to send
       * messages" — and 400'd. `!thread` is kept as a defensive fallback for the (should be
       * unreachable) case where the row genuinely doesn't exist yet.
       *
       * Idempotent and safe to call again on the same module — see `/start`'s own comment
       * on why it does not re-`start` a `completed` session.
       */
      if (!thread || thread.session?.status === "available") {
        await startFoundationSession(n);
        void queryClient.invalidateQueries({ queryKey: ["wing", "threads"] });
      }

      const controller = new AbortController();
      abortRef.current = controller;
      setBusy(true);
      setStreaming("");

      let acc = "";
      let completed = false;

      await streamTurn(
        n,
        text,
        (e) => {
          if (e.type === "chunk") {
            acc += e.content;
            setStreaming(acc);
          } else if (e.type === "session_completed") {
            completed = true;
            /*
             * IG-UX05's transition, rendered server-side because it quotes the student's
             * own artifact. Shown as an insight card: it is Wing naming what just got
             * built, which is what that card means.
             */
            if (e.transition) {
              setLocal((m) => [...m, { id: localId(), role: "insight", text: e.transition! }]);
            }
          } else if (e.type === "error") {
            setLocal((m) => [
              ...m,
              {
                id: localId(),
                role: "wing",
                tone: "observing",
                text: "That didn't reach me — the connection dropped, not the thread. Try again?",
              },
            ]);
          }
        },
        controller.signal,
      );

      /*
       * The streamed text is moved into the local list before the refetch, not discarded
       * in favour of it. The turn is written server-side during the stream, so a refetch
       * usually returns it — but "usually" is doing work there, and a student watching
       * their reply vanish and reappear is worse than one extra render.
       */
      if (acc) {
        setLocal((m) => [...m, { id: localId(), role: "wing", tone: toneFor(acc), text: acc }]);
      }
      setStreaming(null);
      setBusy(false);
      abortRef.current = null;

      if (completed) {
        void queryClient.invalidateQueries({ queryKey: ["wing", "threads"] });
        void queryClient.invalidateQueries({ queryKey: ["wing", "dashboard"] });

        /*
         * ── A COMPLETED SESSION IS NOT WHERE THE CONVERSATION CONTINUES ──────────
         * The stream route keeps admitting turns to a `completed` session (see
         * `/start`'s own comment on why finishing one doesn't lock it), which is right
         * for reopening old work — but left alone, a student who just finished Session 1
         * and kept typing right here would stay in Session 1's own thread indefinitely.
         * Wing's replies would drift onto Session 2 material (nothing stops the model
         * from talking about what's next), while the URL, the module picker, and the
         * transcript all still said Session 1 — a live session with no session, going
         * nowhere the data model or the sidebar can see.
         *
         * So finishing one surfaces a prompt — not an automatic navigation — pointing at
         * wherever `FOUNDATION_TRANSITIONS`' own text just told the student comes next
         * (`NEXT_FOUNDATION_SLUG`), or the dashboard when there isn't a next one (Session
         * 3). It renders next to the composer (below) and stays up until the student
         * clicks it themselves; the `[module?.slug]` effect above clears it if they
         * navigate away some other way first.
         */
        if (isFoundationNumber(n)) {
          setCompletedNav({ nextSlug: NEXT_FOUNDATION_SLUG[n] });
        }
      }
    },
    [module, busy, queryClient, thread, isCheckInModule, lifeLogPrompt, isRefreshModule],
  );

  /**
   * The explicit "yes, replace it" step for a Positioning Refresh proposal. Deliberately
   * separate from `send` — accepting a new SLI is not a side effect of chatting, per
   * `positioning-refresh.ts`'s own comment on `accept()`, and this mirrors that: the
   * student clicks a distinct button, same as the completion banner above.
   */
  const acceptRefreshProposal = useCallback(async () => {
    // Guards against the double-submit itself, not just the button below — a second
    // call arriving (a fast second click, a stray keyboard activation) before the
    // first one has cleared `refreshProposal` would otherwise still go through.
    if (!refreshProposal || acceptingRefresh) return;
    const accepted = refreshProposal;
    setAcceptingRefresh(true);
    try {
      await acceptPositioningRefresh(accepted);
      setRefreshProposal(null);
      setLocal((m) => [
        ...m,
        { id: localId(), role: "insight", text: `Your positioning is updated: "${accepted.statement}"` },
      ]);
      void queryClient.invalidateQueries({ queryKey: ["wing", "positioning-refresh"] });
      void queryClient.invalidateQueries({ queryKey: ["wing", "dashboard"] });
    } catch {
      // Leave the proposal up — the student can try the button again rather than losing it.
    } finally {
      setAcceptingRefresh(false);
    }
  }, [refreshProposal, acceptingRefresh, queryClient]);

  const pickModule = useCallback(
    async (m: WingModule) => {
      if (m.href) {
        navigate(m.href);
        return;
      }
      /*
       * Starting is idempotent and safe on a completed session — the `/start` route grew
       * a guard after reopening a finished one demoted it to `in_progress` and dropped it
       * out of every context builder that keys on `completed`.
       */
      if (m.sessionType) {
        const n = Number(m.sessionType.replace("foundation_", ""));
        await startFoundationSession(n);
        void queryClient.invalidateQueries({ queryKey: ["wing", "threads"] });
      }
      navigate(`/chat/${m.slug}`);
    },
    [navigate, queryClient],
  );

  /* No slug: send them to whatever they were last in, or to the first Foundation module. */
  useEffect(() => {
    if (params?.slug || threadsLoading) return;
    navigate(`/chat/${threads[0]?.id ?? "discover_your_function"}`, { replace: true });
  }, [params?.slug, threads, threadsLoading, navigate]);

  /*
   * The greeting shown before any turn exists in `messages`. Foundation modules that
   * aren't live, and the nine `not_built` modules, keep `unavailableOpening` — that part
   * is unchanged and correct as designed (IG-UX01: every module is tappable, and this is
   * what tapping one with no methodology behind it says).
   *
   * The two live-but-non-Foundation modules each need their own: Positioning Refresh's
   * real opening line is server-seeded (`begin()`, above) and arrives as the first
   * `refreshState` message, not through this — this only covers "not available yet" (no
   * SLI to refresh) and the brief gap while that first fetch is in flight. The weekly
   * check-in has no session to seed anything, so its "opening" IS this: today's actual
   * prompt, read from `lifeLogPrompt` instead of a canned line.
   */
  const opening = useMemo(() => {
    if (!module) return null;
    if (isRefreshModule) {
      if (refreshLoading || !refreshState) return null;
      return refreshState.available
        ? null
        : "There's no positioning to refresh yet — finish the foundation sessions first, and I'll be ready whenever you want to revisit it.";
    }
    if (isCheckInModule) {
      return lifeLogPrompt?.promptText ?? "What's been happening — in your work, or outside it?";
    }
    return module.status !== "live" ? unavailableOpening(module) : null;
  }, [module, isRefreshModule, refreshLoading, refreshState, isCheckInModule, lifeLogPrompt]);

  return (
    <AppShell
      threads={threads}
      activeThreadId={module?.slug ?? null}
      onOpenExplore={() => setExploreOpen(true)}
    >
      <OfflineBanner />
      {exploreOpen && <ExploreOverlay onClose={() => setExploreOpen(false)} onPick={pickModule} />}

      <div className="flex h-screen flex-col">
        <header className="shrink-0 px-6 pb-3 pt-5 md:px-10">
          <p className="label-eyebrow">{module?.name ?? "Wing"}</p>
        </header>

        <div className="min-h-0 flex-1 overflow-y-auto px-6 md:px-10">
          <div className="mx-auto flex max-w-[720px] flex-col gap-6 pb-4">
            {(threadsLoading || msgsLoading || autoStarting || (isRefreshModule && refreshLoading)) &&
            messages.length === 0 ? (
              <div className="flex justify-center py-16">
                <Loader2 className="h-5 w-5 animate-spin text-plum/50" />
              </div>
            ) : messages.length === 0 && opening ? (
              <MessageRow
                msg={{ id: "opening", role: "wing", tone: "proposing", text: opening }}
                isLastOfRun
              />
            ) : (
              messages.map((m, i) => (
                <MessageRow
                  key={m.id}
                  msg={m}
                  isLastOfRun={messages[i + 1]?.role !== m.role}
                />
              ))
            )}
            <div ref={bottomRef} className="h-24" />
          </div>
        </div>

        <div className="shrink-0 bg-gradient-to-t from-wing-canvas via-wing-canvas px-6 pb-6 md:px-10">
          <div className="mx-auto max-w-[720px] space-y-2">
            {refreshProposal && (
              <div
                className="space-y-2 rounded-2xl border-l-[3px] border-salmon px-4 py-3"
                style={{ backgroundColor: "rgb(var(--salmon-light) / 0.26)" }}
              >
                <p className="label-eyebrow">Updated positioning</p>
                <p className="text-sm text-forest">{refreshProposal.statement}</p>
                {refreshProposal.rationale && (
                  <p className="text-xs text-plum">{refreshProposal.rationale}</p>
                )}
                <div className="flex justify-end gap-2 pt-1">
                  <button
                    type="button"
                    onClick={() => setRefreshProposal(null)}
                    disabled={acceptingRefresh}
                    className="rounded-full px-3 py-1.5 text-xs font-medium text-plum hover:bg-black/5 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    Keep talking
                  </button>
                  <Button
                    size="sm"
                    onClick={acceptRefreshProposal}
                    disabled={acceptingRefresh}
                    className="h-auto shrink-0 rounded-full bg-white px-3 py-1.5 text-xs font-medium text-wine ring-1 ring-wing-border hover:bg-white/80 disabled:cursor-not-allowed disabled:opacity-70"
                  >
                    {acceptingRefresh ? (
                      <span className="flex items-center gap-1.5">
                        <Loader2 className="h-3 w-3 animate-spin" />
                        Accepting…
                      </span>
                    ) : (
                      "Accept this statement"
                    )}
                  </Button>
                </div>
              </div>
            )}
            {completedNav && (
              <div className="flex items-center justify-between gap-3 rounded-2xl bg-aqua-light px-4 py-2.5 text-sm text-wine">
                <span>
                  {completedNav.nextSlug
                    ? "This session's done. Ready for what's next?"
                    : "This session's done — that's Foundation complete."}
                </span>
                <Button
                  size="sm"
                  onClick={() =>
                    navigate(completedNav.nextSlug ? `/chat/${completedNav.nextSlug}` : "/")
                  }
                  className="h-auto shrink-0 rounded-full bg-white px-3 py-1.5 text-xs font-medium text-wine ring-1 ring-wing-border hover:bg-white/80"
                >
                  {completedNav.nextSlug
                    ? `Continue to ${moduleFor(completedNav.nextSlug)?.name ?? "next session"}`
                    : "Back to dashboard"}
                </Button>
              </div>
            )}
            {module && user && (
              <Composer
                onSend={send}
                module={module}
                onPickModule={pickModule}
                busy={busy}
                onStop={() => {
                  abortRef.current?.abort();
                  setBusy(false);
                  setStreaming(null);
                }}
                userId={user.id}
              />
            )}
          </div>
        </div>
      </div>
    </AppShell>
  );
}
