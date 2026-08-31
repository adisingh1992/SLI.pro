import { useEffect, useMemo, useRef, useState } from "react";
import { Link } from "wouter";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowRight, Loader2, Plus } from "lucide-react";
import { AppShell, OfflineBanner } from "@/components/wing/AppShell";
import { ExploreOverlay } from "@/components/wing/ExploreOverlay";
import { useWingNav } from "@/lib/use-wing-nav";
import { useAuth } from "@/hooks/use-auth";
import { addLifeLogEntry, getLifeLog, listThreads, type ApiSession } from "@/lib/wing-api";
import { hrefFor, isExternalTarget, reachableRecommendation } from "@/lib/wing-recommendation";
import type { RecommendationState } from "@shared/recommendation";

/**
 * Home — the positioning statement, this week's prompt, and one next move.
 *
 * ── THE THREE STATES ARE DERIVED FROM DATA, NOT FROM A PERSONA ───────────
 * The prototype branched on a `persona` field it kept in sessionStorage — "new",
 * "returning", "direct" — which conflated auth state, onboarding progress and billing
 * tier into one string that nothing on a real backend produces.
 *
 * The states themselves are right, and they come from what the student actually has:
 *
 *   empty        no SLI, no completed Foundation session
 *   in progress  a function named, no SLI locked in
 *   active       an SLI exists
 *
 * ── ONE RECOMMENDATION, AND IT HAS TO BE REACHABLE ───────────────────────
 * IG-UX02: one recommendation, never a menu. `shared/recommendation.ts` implements it and
 * has never been called until now; `wing-recommendation.ts` handles the part it cannot
 * know about, which is that six of its eleven destinations were archived with the old UI.
 *
 * ── AND THERE IS NO RADAR CARD ───────────────────────────────────────────
 * The design has one. Radar generates nothing — see `radar.tsx` — and a card teasing a
 * brief that does not exist is worse than the gap.
 *
 * ── CARD STYLING NOW MATCHES wing5, STRUCTURE DOESN'T ────────────────────
 * Every card below borrows wing5's actual visual language — the label sits inside the
 * card instead of above it, "This week" gets the aqua left-accent, the three
 * recommend/observations/what's-happened cards share its `bg-sand/30` treatment
 * instead of three different backgrounds (aqua-light, white, white) that never agreed
 * with each other or with wing5.
 *
 * ── THE GRID, AND WHERE IT DEPARTS FROM wing5'S ──────────────────────────
 * The container is now `max-w-[1180px]`, matching wing5, and Wing's observations /
 * What's happened sit side by side in a `lg:grid-cols-2` row, same as wing5's row 2.
 *
 * Wing recommends spans both columns instead of sharing row 1 with a Wing radar
 * card, because there is no Wing radar card — see above. wing5's own layout only
 * gives recommends the full row when its `empty` persona state is active; here it
 * always gets the full row, since the thing that would occupy the other half never
 * exists in this build. Full width reads as more considered than a half-empty row,
 * and costs nothing real data would have used otherwise.
 *
 * Still real data, not wing5's canned demo strings: "What's happened" shows the
 * actual latest log entry when there is one, and "This week"'s copy stays accurate
 * to why the prompt can be missing (see `promptFor` in `life-log-store.ts`) rather
 * than borrowing wing5's "after your first session" line, which is wrong here.
 *
 * ── THE ANSWER BOX'S FOCUS RING ───────────────────────────────────────────
 * The textarea carries `quiet-focus`, opting it out of the global salmon
 * `:focus-visible` outline defined in index.css (Chrome treats a text input as
 * focus-visible on an ordinary click, not just on Tab — clicking to answer
 * shouldn't look like an error state). The pill wrapping it gets
 * `focus-within:ring-1 focus-within:ring-aqua` instead, so focus is still shown,
 * just as the quieter ring AppShell's search box also uses.
 */
export default function WingDashboardPage() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const { exploreOpen, setExploreOpen, pickModule } = useWingNav();

  const [answer, setAnswer] = useState("");
  const [submitted, setSubmitted] = useState<string | null>(null);
  /*
   * True for a few seconds right after a successful submit. wing5's own "This week"
   * card doesn't go straight from the textarea to echoing the answer back — it shows
   * a plain "Got it" message first, with no text on screen at all, then swaps to the
   * echoed-answer receipt a few seconds later. Skipping that first phase (which this
   * card used to do — straight to textarea → echo box) reads as "my answer is just
   * sitting there, did it even submit" even though `answer` really was cleared; the
   * echoed copy in the aqua box looks exactly like unsent input at a glance.
   */
  const [ackVisible, setAckVisible] = useState(false);
  const ackTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => {
    if (ackTimer.current) clearTimeout(ackTimer.current);
  }, []);

  const { data: threads = [] } = useQuery({ queryKey: ["wing", "threads"], queryFn: listThreads });
  const { data: sessions = [], isLoading: sessionsLoading } = useQuery<ApiSession[]>({
    queryKey: ["/api/foundation-sessions"],
  });
  const { data: sli } = useQuery<Record<string, unknown> | null>({ queryKey: ["/api/user/sli"] });
  const { data: log, isLoading: logLoading } = useQuery({
    queryKey: ["wing", "life-log"],
    queryFn: getLifeLog,
  });
  const { data: docs = [] } = useQuery<Array<{ type?: string }>>({ queryKey: ["/api/documents"] });
  const { data: intake } = useQuery<{ completed?: boolean } | null>({
    queryKey: ["/api/branding-intake"],
  });
  const { data: observationData, isLoading: observationLoading } = useQuery<{
    observation: { content: string; createdAt: string } | null;
  }>({
    queryKey: ["/api/wing/observation"],
  });
  const observation = observationData?.observation ?? null;

  const built = sessions.filter(
    (s) => s.status === "completed" || s.status === "ended_early",
  ).length;
  const sliText = typeof sli?.statement === "string" ? sli.statement : null;

  const state: RecommendationState = useMemo(
    () => ({
      intakeComplete: intake?.completed === true,
      hasResume: docs.some((d) => d.type === "resume"),
      hasLinkedIn: docs.some((d) => d.type === "linkedin"),
      foundationSessionsBuilt: built,
      /* Both archived with the old UI. False rather than guessed — the rules that read
         them route to screens that no longer exist and are filtered out either way. */
      hasBrandReport: false,
      sliOptionsReady: !!sliText,
      sliChosen: !!sliText,
      linkedinOptimised: false,
      openHomework: 0,
    }),
    [intake, docs, built, sliText],
  );

  const recommendation = useMemo(() => reachableRecommendation(state), [state]);

  const prompt = log?.prompt ?? null;

  const submit = useMutation({
    mutationFn: (text: string) =>
      addLifeLogEntry({ entryText: text, promptId: prompt?.id ?? null }),
    onSuccess: (_d, text) => {
      setSubmitted(text);
      setAnswer("");
      setAckVisible(true);
      if (ackTimer.current) clearTimeout(ackTimer.current);
      ackTimer.current = setTimeout(() => setAckVisible(false), 3000);
      void queryClient.invalidateQueries({ queryKey: ["wing", "life-log"] });
    },
  });

  const firstName = (user?.firstName ?? "").toUpperCase();

  return (
    <AppShell threads={threads} activeThreadId={null} onOpenExplore={() => setExploreOpen(true)}>
      <OfflineBanner />
      {exploreOpen && <ExploreOverlay onClose={() => setExploreOpen(false)} onPick={pickModule} />}

      <div className="mx-auto max-w-[1180px] px-6 py-10 md:px-10">
        {/* ── The positioning statement ─────────────────────────────── */}
        <section className="rounded-xl bg-wine px-8 py-7 text-white">
          <p className="label-eyebrow text-aqua">
            {sliText ? `${firstName}, YOU ARE` : `${firstName},`}
          </p>
          {sessionsLoading ? (
            <Loader2 className="mt-3 h-5 w-5 animate-spin text-aqua" />
          ) : sliText ? (
            <>
              <p className="mt-1.5 text-[26px] font-semibold leading-[1.2]">{sliText}</p>
              <hr className="my-6 border-white/15" />
              <Link
                href="/chat/refresh_your_positioning"
                className="text-xs text-aqua underline-offset-4 hover:underline"
              >
                Re-anchor this as the work changes
              </Link>
            </>
          ) : built > 0 ? (
            <p className="mt-1.5 text-[22px] font-semibold leading-[1.2] text-white/90">
              You&rsquo;ve started naming it. Keep going — the statement comes out of the
              work, not before it.
            </p>
          ) : (
            <p className="mt-1.5 text-[22px] font-semibold leading-[1.2] text-white/90">
              Your positioning starts here.
            </p>
          )}
        </section>

        {/* ── This week ─────────────────────────────────────────────── */}
        <section className="mt-5 rounded-xl border border-wing-border border-l-[5px] border-l-aqua bg-white px-6 py-5 shadow-sm">
          <p className="label-eyebrow">This week</p>
          {logLoading ? (
            <Loader2 className="mt-3 h-4 w-4 animate-spin text-plum/50" />
          ) : !prompt ? (
            <p className="mt-1.5 text-[19px] font-medium leading-[1.35] text-forest">
              Nothing to answer this week. Wing will send one along.
            </p>
          ) : submitted ? (
            <>
              <p className="mt-1.5 text-[19px] font-medium leading-[1.35] text-forest">
                {prompt.promptText}
              </p>
              {ackVisible ? (
                <p className="mt-4 text-[13px] leading-[20px] text-forest">
                  Got it. That goes into what Wing knows about you.
                </p>
              ) : (
                <>
                  <div className="mt-4 rounded-lg bg-aqua-light px-3.5 py-2.5">
                    <p className="text-[13px] leading-[20px] text-forest">{submitted}</p>
                  </div>
                  <p className="mt-2 text-xs text-plum-body">
                    Got it. That goes into what Wing knows about you.
                  </p>
                </>
              )}
            </>
          ) : (
            <>
              <p className="mt-1.5 text-[19px] font-medium leading-[1.35] text-forest">
                {prompt.promptText}
              </p>
              <div className="mt-4 flex w-full items-center gap-2.5 rounded-lg bg-aqua-light py-2 pl-3.5 pr-2 focus-within:ring-1 focus-within:ring-aqua">
                <textarea
                  rows={1}
                  value={answer}
                  onChange={(e) => setAnswer(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && !e.shiftKey) {
                      e.preventDefault();
                      if (answer.trim()) submit.mutate(answer.trim());
                    }
                  }}
                  placeholder="Answer here…"
                  aria-label="Your answer"
                  className="quiet-focus min-w-0 flex-1 resize-none self-center overflow-y-auto bg-transparent text-[13px] leading-[20px] text-forest outline-none placeholder:text-plum/50"
                />
                <button
                  type="button"
                  disabled={!answer.trim() || submit.isPending}
                  onClick={() => submit.mutate(answer.trim())}
                  aria-label="Send answer"
                  className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-salmon text-white shadow-sm transition-opacity hover:opacity-90 disabled:opacity-50"
                >
                  <ArrowRight className="h-4 w-4" />
                </button>
              </div>
            </>
          )}
        </section>

        {/* ── The grid: recommends full-width, observations + what's happened side by side ── */}
        <div className="mt-5 grid gap-5 lg:grid-cols-2">
          {/* One recommendation. Full width — see the file comment on why there's no
              second card to share the row with. */}
          <section className="flex h-full flex-col rounded-xl border border-wing-border bg-sand/30 p-5 lg:col-span-2">
            <p className="label-eyebrow">Wing recommends</p>
            {recommendation ? (
              <>
                <p className="mt-2 text-[15px] leading-snug text-forest">
                  {recommendation.rec.action}
                </p>
                <p className="mt-2 text-sm text-plum-body">{recommendation.rec.why}</p>
                {recommendation.rec.minutes && (
                  <p className="mt-1 text-xs text-plum-label">{recommendation.rec.minutes}</p>
                )}
                <div className="mt-auto flex justify-end pt-3.5">
                  {isExternalTarget(recommendation.target) ? (
                    // Leaves the app (Danielle's Calendly) — a real anchor, not wouter's
                    // `<Link>`, which would try to push an absolute URL onto the SPA's
                    // own history instead of letting the browser navigate to it.
                    <a
                      href={hrefFor(recommendation.target)}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="rounded-full bg-salmon px-5 py-2 text-xs font-semibold uppercase tracking-wider text-white"
                    >
                      Let&rsquo;s do it
                    </a>
                  ) : (
                    <Link
                      href={hrefFor(recommendation.target)}
                      className="rounded-full bg-salmon px-5 py-2 text-xs font-semibold uppercase tracking-wider text-white"
                    >
                      Let&rsquo;s do it
                    </Link>
                  )}
                </div>
              </>
            ) : (
              /* Her failure path: never display "no recommendation". */
              <>
                <p className="mt-2 text-[15px] leading-snug text-forest">
                  Keep building your positioning.
                </p>
                <div className="mt-auto flex justify-end pt-3.5">
                  <button
                    type="button"
                    onClick={() => setExploreOpen(true)}
                    className="rounded-full bg-salmon px-5 py-2 text-xs font-semibold uppercase tracking-wider text-white"
                  >
                    See what&rsquo;s there
                  </button>
                </div>
              </>
            )}
          </section>

          {/*
            * ── Wing's observations ────────────────────────────────────
            * Sourced from `latestObservation` in `session-store.ts`: the newest turn,
            * across every session, where the engine actually marked a signal detected
            * — the same fact an inline "Wing noticed something" insight card renders
            * from inside a thread, read here across all of them. Not the wing5 demo's
            * canned `d.noticed`/`d.reveal` copy — there was nothing to port, this is
            * real student data or nothing.
            */}
          <section className="flex h-full flex-col rounded-xl border border-wing-border bg-sand/30 p-5 lg:col-start-1">
            <p className="label-eyebrow">Wing&rsquo;s observations</p>
            {observationLoading ? (
              <Loader2 className="mt-3 h-4 w-4 animate-spin text-plum/50" />
            ) : observation ? (
              <p className="mt-2 text-[15px] leading-relaxed text-forest">{observation.content}</p>
            ) : (
              <p className="mt-2 text-sm text-plum-body">
                Wing&rsquo;s observations will appear here as you work together.
              </p>
            )}
          </section>

          {/* ── What's happened ───────────────────────────────────────── */}
          <section className="flex h-full flex-col rounded-xl border border-wing-border bg-sand/30 p-5">
            <p className="label-eyebrow">What&rsquo;s happened</p>
            {log?.entries.length ? (
              <p className="mt-2 text-[15px] leading-relaxed text-forest">
                {log.entries[0]!.entryText}
              </p>
            ) : (
              <p className="mt-2 text-sm text-plum-body">
                Log something from the real world — an interview that came in, a post that
                performed, a recruiter who reached out. Wing folds it into your story.
              </p>
            )}
            <div className="mt-auto flex justify-end pt-3.5">
              <Link
                href="/milestones"
                className="flex items-center gap-1.5 rounded-full border border-salmon px-3.5 py-1.5 text-[11px] font-semibold uppercase tracking-[0.14em] text-salmon transition-colors hover:bg-salmon/10"
              >
                <Plus className="h-3 w-3" />
                Log
              </Link>
            </div>
          </section>
        </div>

        {/* ── What you've built ─────────────────────────────────────── */}
        <section className="mt-5 flex flex-wrap items-baseline gap-x-6 gap-y-3 rounded-xl border border-wing-border bg-sand/30 px-5 py-4">
          {/*
            * IG-UX03: what was PRODUCED, never "3 of 3" or a checkmark. "1 function", not
            * "Session 1 complete" — the number is the output, and a student who ended a
            * session early still built something.
            */}
          <p className="label-eyebrow shrink-0">What you&rsquo;ve built</p>
          {built === 0 ? (
            <p className="text-sm text-plum-body">Your positioning starts here.</p>
          ) : (
            <>
              <Stat value={String(built)} label={built === 1 ? "session built" : "sessions built"} />
              {sliText && <Stat value="1" label="positioning statement" />}
              {log?.entries.length ? (
                <Stat
                  value={String(log.entries.length)}
                  label={log.entries.length === 1 ? "moment logged" : "moments logged"}
                />
              ) : null}
            </>
          )}
        </section>
      </div>
    </AppShell>
  );
}

function Stat({ value, label }: { value: string; label: string }) {
  return (
    <p className="text-sm text-forest">
      <span className="text-[22px] font-medium">{value}</span>{" "}
      <span className="text-plum-body">{label}</span>
    </p>
  );
}
