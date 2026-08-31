import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowUpDown, Loader2 } from "lucide-react";
import { AppShell, OfflineBanner } from "@/components/wing/AppShell";
import { ExploreOverlay } from "@/components/wing/ExploreOverlay";
import { useWingNav } from "@/lib/use-wing-nav";
import { addLifeLogEntry, getLifeLog, listThreads, whenLabel } from "@/lib/wing-api";

/**
 * "What's Happened" — the life log.
 *
 * The design calls these milestones; the backend calls them life-log entries, and they
 * are the same thing: real-world events the student tells Wing about. They are also the
 * platform's core data-generating surface, so this screen writes into the same table the
 * weekly prompt answers land in, with `promptId` left null because nothing prompted them.
 *
 * ── SORTING IS DONE HERE, PROPERLY ───────────────────────────────────────
 * The prototype's comparator returned 0 for two of its three modes and relied on array
 * order, with a `.reverse()` bolted on afterwards — so "latest" and "oldest" were the
 * same list until something upstream changed, and then both were wrong. Entries carry a
 * real `createdAt`, so this sorts on it.
 *
 * ── LAYOUT MATCHES wing5's `routes/milestones.tsx` ────────────────────────
 * Container width, heading, the "LOG" button, the subtitle copy, the sort control (an
 * icon button, not a text link), row spacing/radius and the "Show more" button all copied
 * from wing5's own classes. Two departures, both deliberate: the date badge shows this
 * entry's real `createdAt` via `whenLabel` rather than wing5's canned calendar strings
 * ("APRIL 2024") — same visual treatment (uppercase, tracked, `text-plum`), real data
 * underneath — and the sort control keeps this file's own working three-way comparator
 * instead of wing5's, which returns 0 for "latest" and only sometimes reverses correctly.
 */
const PAGE = 10;
type Sort = "latest" | "oldest" | "az";

export default function WingMilestonesPage() {
  const queryClient = useQueryClient();
  const { exploreOpen, setExploreOpen, pickModule } = useWingNav();

  const [sort, setSort] = useState<Sort>("latest");
  const [shown, setShown] = useState(PAGE);
  const [adding, setAdding] = useState(false);
  const [text, setText] = useState("");
  const [error, setError] = useState<string | null>(null);

  const { data: threads = [] } = useQuery({ queryKey: ["wing", "threads"], queryFn: listThreads });
  const { data, isLoading } = useQuery({ queryKey: ["wing", "life-log"], queryFn: getLifeLog });

  const entries = useMemo(() => {
    const rows = [...(data?.entries ?? [])];
    if (sort === "az") return rows.sort((a, b) => a.entryText.localeCompare(b.entryText));
    return rows.sort((a, b) =>
      sort === "latest"
        ? b.createdAt.localeCompare(a.createdAt)
        : a.createdAt.localeCompare(b.createdAt),
    );
  }, [data?.entries, sort]);

  const add = useMutation({
    mutationFn: (entryText: string) => addLifeLogEntry({ entryText }),
    onSuccess: () => {
      setText("");
      setAdding(false);
      setError(null);
      void queryClient.invalidateQueries({ queryKey: ["wing", "life-log"] });
      void queryClient.invalidateQueries({ queryKey: ["wing", "dashboard"] });
    },
    onError: (e: Error) => setError(e.message || "That didn't save. Try again?"),
  });

  const pages = Math.max(1, Math.ceil(entries.length / PAGE));
  const page = Math.min(pages, Math.ceil(shown / PAGE));

  return (
    <AppShell threads={threads} activeThreadId={null} onOpenExplore={() => setExploreOpen(true)}>
      <OfflineBanner />
      {exploreOpen && <ExploreOverlay onClose={() => setExploreOpen(false)} onPick={pickModule} />}

      <div className="mx-auto max-w-[720px] px-6 py-10 md:px-10">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <h1 className="text-[30px] font-semibold text-wine">What&rsquo;s Happened</h1>
          <button
            type="button"
            onClick={() => setAdding((a) => !a)}
            className="rounded-full bg-salmon px-6 py-2.5 font-sans text-xs font-semibold uppercase tracking-[0.14em] text-white hover:opacity-90"
          >
            Log
          </button>
        </div>

        <p className="mt-4 text-[15px] leading-relaxed text-plum">
          Log something from the real world — an interview that came in, a post that
          performed, a recruiter who reached out. Wing folds it into your story.
        </p>

        {adding && (
          <div className="mt-6 animate-rise rounded-2xl bg-white p-5 ring-1 ring-wing-border">
            <label htmlFor="milestone" className="label-eyebrow">
              What happened?
            </label>
            <textarea
              id="milestone"
              rows={3}
              value={text}
              onChange={(e) => setText(e.target.value)}
              placeholder="Promoted to Senior Consultant. Or — the meeting where the room finally agreed."
              className="mt-3 w-full resize-none rounded-xl bg-wing-canvas px-4 py-3 text-[15px] text-forest outline-none ring-1 ring-wing-border placeholder:text-plum/50"
            />
            {error && <p className="mt-2 text-xs text-salmon">{error}</p>}
            <div className="mt-3 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => {
                  setAdding(false);
                  setError(null);
                }}
                className="rounded-full px-4 py-2 text-sm text-plum hover:bg-black/5"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={!text.trim() || add.isPending}
                onClick={() => add.mutate(text.trim())}
                className="rounded-full bg-salmon px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
              >
                {add.isPending ? "Saving…" : "Log it"}
              </button>
            </div>
            {/*
              * No date field. The prototype collected one as free text — "This Thursday" —
              * which cannot be sorted or compared, and the entry is timestamped server-side
              * anyway. A student logging something that happened last month is a real case
              * and wants a real date picker wired to a real column, not a text box.
              */}
          </div>
        )}

        <div className="mt-1 flex justify-end">
          <button
            type="button"
            onClick={() => setSort(sort === "latest" ? "oldest" : sort === "oldest" ? "az" : "latest")}
            title={`Sort by ${sort === "latest" ? "latest" : sort === "oldest" ? "oldest" : "A–Z"}`}
            aria-label={`Sort by ${sort === "latest" ? "latest" : sort === "oldest" ? "oldest" : "A–Z"}. Click to cycle.`}
            className="flex h-9 w-9 items-center justify-center rounded-full bg-white text-plum ring-1 ring-wing-border transition hover:text-forest hover:ring-aqua"
          >
            <ArrowUpDown className="h-4 w-4" />
          </button>
        </div>

        {isLoading ? (
          <div className="flex justify-center py-16">
            <Loader2 className="h-5 w-5 animate-spin text-plum/50" />
          </div>
        ) : entries.length === 0 ? (
          <p className="mt-10 text-sm text-plum-body">
            Nothing logged yet. When something happens — a promotion, a hard conversation, a
            piece of work that landed — tell Wing here.
          </p>
        ) : (
          <>
            <ul className="mt-3 space-y-3">
              {entries.slice(0, shown).map((e) => (
                <li
                  key={e.id}
                  className="flex items-baseline justify-between gap-4 rounded-xl bg-white px-5 py-4 ring-1 ring-wing-border"
                >
                  <span className="min-w-0 flex-1 text-[15px] leading-relaxed text-forest">
                    {e.entryText}
                  </span>
                  <span className="shrink-0 whitespace-nowrap font-sans text-[11px] uppercase tracking-[0.12em] text-plum">
                    {whenLabel(e.createdAt)}
                  </span>
                </li>
              ))}
            </ul>

            {shown < entries.length && (
              <button
                type="button"
                onClick={() => setShown((s) => s + PAGE)}
                className="mt-6 rounded-full border border-midnight/30 px-6 py-2.5 font-sans text-[11px] font-semibold uppercase tracking-[0.14em] text-midnight hover:bg-midnight/5"
              >
                Show more
              </button>
            )}
            {pages > 1 && (
              <p className="mt-4 font-sans text-[11px] text-plum/40">
                Page {page} of {pages}
              </p>
            )}
          </>
        )}
      </div>
    </AppShell>
  );
}
