import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Loader2 } from "lucide-react";
import { AppShell, OfflineBanner } from "@/components/wing/AppShell";
import { ExploreOverlay } from "@/components/wing/ExploreOverlay";
import { useWingNav } from "@/lib/use-wing-nav";
import {
  engageRadarSuggestion,
  getRadarSuggestions,
  listThreads,
  whenLabel,
  type RadarSuggestion,
} from "@/lib/wing-api";

/**
 * This Week's Intelligence — Baby Radar (H-701), not full Module 7 Radar.
 *
 * ── WHY THIS PAGE NOW SHOWS SOMETHING, AND WHY IT'S CAREFUL ABOUT WHAT ──────
 * The previous version of this page said "Not running yet" and meant it: full
 * Module 7 Wing Radar — a web-search-capable model call reading real
 * headlines — still doesn't exist. No search provider, no retrieval field on
 * `CompletionRequest`, nothing has changed there.
 *
 * What shipped instead is smaller and honestly described: Baby Radar
 * (H-701), a weekly job that suggests 3-5 topic AREAS drawn from the
 * student's own Foundation 1 function and intake Q5.5 topic — not real news,
 * not a specific headline, not anything the model could not verify. The copy
 * below says "topic suggestions," never "headlines" or "this week's news,"
 * for the same reason the old copy refused to fake a dateline: a student
 * should never read something here that claims more certainty than the
 * feature actually has.
 *
 * ── THREE STATES, NOT TWO ────────────────────────────────────────────────
 * `radarEligibility` (server) is not a boolean gate around otherwise-static
 * content — it changes which message the student sees:
 *   1. Not eligible yet — no Foundation 1 function and no intake Q5.5 topic.
 *      Same CTA the old placeholder had: go work on positioning first.
 *   2. Eligible, nothing generated this week — the weekly job hasn't run for
 *      this student yet (due next run, not stuck).
 *   3. Suggestions on hand — the actual list, each with an engage action per
 *      H-701's success_criteria.
 */
export default function WingRadarPage() {
  const queryClient = useQueryClient();
  const { exploreOpen, setExploreOpen, pickModule } = useWingNav();

  const { data: threads = [] } = useQuery({ queryKey: ["wing", "threads"], queryFn: listThreads });
  const { data, isLoading } = useQuery({ queryKey: ["wing", "radar"], queryFn: getRadarSuggestions });

  const engage = useMutation({
    mutationFn: (id: number) => engageRadarSuggestion(id),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["wing", "radar"] });
    },
  });

  const suggestions = data?.suggestions ?? [];
  const eligible = data?.eligible ?? false;

  return (
    <AppShell threads={threads} activeThreadId={null} onOpenExplore={() => setExploreOpen(true)}>
      <OfflineBanner />
      {exploreOpen && <ExploreOverlay onClose={() => setExploreOpen(false)} onPick={pickModule} />}

      <div className="mx-auto max-w-2xl px-6 py-16 md:px-10">
        <p className="label-eyebrow">Wing radar</p>
        <h1 className="mt-4 text-[28px] leading-tight text-forest">This Week&rsquo;s Intelligence</h1>

        {isLoading ? (
          <div className="flex justify-center py-16">
            <Loader2 className="h-5 w-5 animate-spin text-plum/50" />
          </div>
        ) : !eligible ? (
          <>
            <p className="mt-5 text-[15px] leading-[1.75] text-plum-body">
              Radar suggests topics worth engaging with, filtered to your positioning — but it
              needs to know your positioning first. Wing doesn&rsquo;t have a locked function
              from Foundation 1 or a topic area from intake yet, so there&rsquo;s nothing to
              filter against.
            </p>
            <p className="mt-4 text-[15px] leading-[1.75] text-plum-body">
              Once that&rsquo;s in place, Radar starts suggesting topic areas — comment-worthy,
              post-worthy, or just worth keeping in mind — each week.
            </p>
            <button
              type="button"
              onClick={() => setExploreOpen(true)}
              className="mt-8 rounded-full bg-salmon px-5 py-2.5 text-sm font-medium text-white"
            >
              Work on your positioning
            </button>
          </>
        ) : suggestions.length === 0 ? (
          <p className="mt-5 text-[15px] leading-[1.75] text-plum-body">
            Nothing yet this week. Radar generates a fresh batch of topic suggestions on a
            weekly cadence — check back, or come back after your next session.
          </p>
        ) : (
          <>
            <p className="mt-5 text-[15px] leading-[1.75] text-plum-body">
              Topic areas worth your attention this week, drawn from your positioning — not
              headlines, and not anything Wing claims to have read.
            </p>

            <ul className="mt-6 space-y-3">
              {suggestions.map((s: RadarSuggestion) => (
                <li key={s.id} className="rounded-xl bg-white px-5 py-4 ring-1 ring-wing-border">
                  <div className="flex items-start justify-between gap-4">
                    <span className="label-eyebrow">{actionLabel(s.suggestedAction)}</span>
                    <span className="shrink-0 whitespace-nowrap font-sans text-[11px] uppercase tracking-[0.12em] text-plum">
                      {whenLabel(s.generatedAt)}
                    </span>
                  </div>
                  <p className="mt-2 text-[16px] leading-snug text-forest">{s.topic}</p>
                  <p className="mt-2 text-[14px] leading-relaxed text-plum-body">{s.whyRelevant}</p>

                  <div className="mt-4 flex justify-end">
                    {s.engagedAt ? (
                      <span className="text-xs text-plum">Marked engaged {whenLabel(s.engagedAt)}</span>
                    ) : (
                      <button
                        type="button"
                        disabled={engage.isPending}
                        onClick={() => engage.mutate(s.id)}
                        className="rounded-full bg-salmon px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
                      >
                        I engaged with this
                      </button>
                    )}
                  </div>
                </li>
              ))}
            </ul>
          </>
        )}
      </div>
    </AppShell>
  );
}

function actionLabel(action: RadarSuggestion["suggestedAction"]): string {
  switch (action) {
    case "comment":
      return "Worth commenting on";
    case "post":
      return "Worth writing about";
    case "save_for_later":
      return "Worth keeping in mind";
  }
}
