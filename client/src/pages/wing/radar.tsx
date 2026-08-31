import { useQuery } from "@tanstack/react-query";
import { AppShell, OfflineBanner } from "@/components/wing/AppShell";
import { ExploreOverlay } from "@/components/wing/ExploreOverlay";
import { useWingNav } from "@/lib/use-wing-nav";
import { listThreads } from "@/lib/wing-api";

/**
 * Wing Radar — and it is not switched on.
 *
 * ── WHY THIS PAGE SAYS SO INSTEAD OF SHOWING A BRIEF ─────────────────────
 * The design gives Radar a full editorial surface: a dateline, a headline, three
 * paragraphs, and a reaction box. Behind it there is nothing. No web-search-capable model
 * call — `CompletionRequest` carries no tools or retrieval field — no search provider
 * anywhere in the repo, no weekly generation job, no intelligence archive. Module 7's own
 * premise is "a single API call with web search enabled", and that call does not exist.
 *
 * The prototype filled the space with a hardcoded headline about algorithmic B2B pricing,
 * duplicated verbatim in `dashboard.tsx`. Shipping that is the worst option available: a
 * student reads a dateline that says this week, and a brief that will be the same next
 * week, about a company they have nothing to do with. It would take a while to notice,
 * and it is exactly the class of surface — one that claims something is in force when the
 * thing it names is absent — that the rest of this codebase is built to refuse.
 *
 * So the page exists, is reachable from Explore, and tells the truth. When the generation
 * job lands, this renders what it produces.
 */
export default function WingRadarPage() {
  const { exploreOpen, setExploreOpen, pickModule } = useWingNav();
  const { data: threads = [] } = useQuery({ queryKey: ["wing", "threads"], queryFn: listThreads });

  return (
    <AppShell threads={threads} activeThreadId={null} onOpenExplore={() => setExploreOpen(true)}>
      <OfflineBanner />
      {exploreOpen && <ExploreOverlay onClose={() => setExploreOpen(false)} onPick={pickModule} />}

      <div className="mx-auto max-w-2xl px-6 py-16 md:px-10">
        <p className="label-eyebrow">Wing radar</p>
        <h1 className="mt-4 text-[28px] leading-tight text-forest">
          Not running yet.
        </h1>
        <p className="mt-5 text-[15px] leading-[1.75] text-plum-body">
          Radar is the weekly read on what&rsquo;s moving in your field, filtered to what
          matters for your positioning. It isn&rsquo;t generating briefs yet — so rather
          than show you last week&rsquo;s placeholder, there&rsquo;s nothing here.
        </p>
        <p className="mt-4 text-[15px] leading-[1.75] text-plum-body">
          In the meantime, the work that makes Radar worth reading is your positioning:
          Wing needs to know what you&rsquo;re known for before it can tell you which
          signals are yours.
        </p>

        <button
          type="button"
          onClick={() => setExploreOpen(true)}
          className="mt-8 rounded-full bg-salmon px-5 py-2.5 text-sm font-medium text-white"
        >
          Work on your positioning
        </button>
      </div>
    </AppShell>
  );
}
