import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Loader2 } from "lucide-react";
import { AppShell, OfflineBanner } from "@/components/wing/AppShell";
import { ExploreOverlay } from "@/components/wing/ExploreOverlay";
import { useWingNav } from "@/lib/use-wing-nav";
import {
  acceptContentTrigger,
  declineContentTrigger,
  getContentTriggerStatus,
  listThreads,
  postContentDraftToLinkedIn,
  requestContentTrigger,
  type ContentTriggerAccepted,
  type ContentTriggerType,
} from "@/lib/wing-api";

/**
 * Write Something — H-620–627's student-facing surface, live for the first
 * time.
 *
 * ── WHY THIS PAGE NEVER SHOWS FINISHED PROSE ────────────────────────────────
 * H-615 ("Wing coaches, never authors") is explicit: a complete,
 * ready-to-publish draft Wing wrote is not acceptable, even as a starting
 * point offered for editing. So accepting or requesting a suggestion below
 * returns a coaching prompt — the reason Wing noticed something, framed as a
 * nudge — never a paragraph to copy. The text box under it is blank on
 * purpose. What gets typed there is what gets posted; this page has no path
 * that publishes anything Wing generated.
 *
 * ── WHY THERE'S NO "GENERATE A DRAFT" BUTTON ────────────────────────────────
 * `/api/linkedin-content-drafts/generate` already exists and does generate
 * full ready-to-post text — that's the older MVP flow
 * (`linkedin-content-drafts-page.tsx`), built before H-615 was written down
 * as a numbered gate, and out of scope to change here. This page is the
 * newer, compliant surface; it deliberately doesn't route through that one.
 *
 * ── THE THREE STATES ────────────────────────────────────────────────────────
 *   1. Nothing due, no draft in progress — "help me write" affordances for
 *      post/article (H-626's explicit-request override; comment has none,
 *      per H-620).
 *   2. Something's due (Wing noticed a signal) — the reason, and
 *      accept/decline.
 *   3. A draft was just started (accepted or requested) — the coaching
 *      prompt, a text box, and Post to LinkedIn once there's something to
 *      post — going straight through the existing
 *      `POST /api/linkedin-content-drafts/:draftId/post`, unmodified.
 */
export default function WriteSomethingPage() {
  const queryClient = useQueryClient();
  const { exploreOpen, setExploreOpen, pickModule } = useWingNav();
  const [draft, setDraft] = useState<ContentTriggerAccepted | null>(null);
  const [draftText, setDraftText] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [posted, setPosted] = useState(false);

  const { data: threads = [] } = useQuery({ queryKey: ["wing", "threads"], queryFn: listThreads });
  const { data: status, isLoading } = useQuery({
    queryKey: ["wing", "content-triggers"],
    queryFn: getContentTriggerStatus,
    enabled: !draft,
  });

  const respond = useMutation({
    mutationFn: async (action: "accept" | "decline") => {
      if (!status?.contentType) throw new Error("Nothing to respond to");
      if (action === "accept") return acceptContentTrigger(status.contentType);
      await declineContentTrigger(status.contentType);
      return null;
    },
    onSuccess: (result) => {
      setError(null);
      if (result) {
        setDraft(result);
        setDraftText("");
      } else {
        void queryClient.invalidateQueries({ queryKey: ["wing", "content-triggers"] });
      }
    },
    onError: (err: Error) => setError(err.message),
  });

  const request = useMutation({
    mutationFn: (contentType: "post" | "article") => requestContentTrigger(contentType),
    onSuccess: (result) => {
      setError(null);
      setDraft(result);
      setDraftText("");
    },
    onError: (err: Error) => setError(err.message),
  });

  const publish = useMutation({
    mutationFn: async () => {
      if (!draft?.draftId) throw new Error("Nothing to post yet");
      return postContentDraftToLinkedIn(draft.draftId, draftText);
    },
    onSuccess: () => {
      setError(null);
      setPosted(true);
    },
    onError: (err: Error) => setError(err.message),
  });

  const startOver = () => {
    setDraft(null);
    setDraftText("");
    setPosted(false);
    setError(null);
    void queryClient.invalidateQueries({ queryKey: ["wing", "content-triggers"] });
  };

  const actionLabel: Record<ContentTriggerType, string> = {
    comment: "comment",
    post: "post",
    article: "article",
  };

  return (
    <AppShell threads={threads} activeThreadId={null} onOpenExplore={() => setExploreOpen(true)}>
      <OfflineBanner />
      {exploreOpen && <ExploreOverlay onClose={() => setExploreOpen(false)} onPick={pickModule} />}

      <div className="mx-auto max-w-2xl px-6 py-16 md:px-10">
        <p className="label-eyebrow">Write something</p>
        <h1 className="mt-4 text-[28px] leading-tight text-forest">Draft in your voice</h1>

        {error && (
          <p className="mt-4 rounded-lg bg-red-50 px-4 py-3 text-[14px] text-red-700">{error}</p>
        )}

        {draft ? (
          <div className="mt-6">
            <p className="text-[15px] leading-[1.75] text-plum-body">{draft.coachingPrompt}</p>

            {posted ? (
              <p className="mt-6 rounded-xl bg-white px-5 py-4 text-[15px] text-forest ring-1 ring-wing-border">
                Posted to LinkedIn. Nice work.
              </p>
            ) : (
              <>
                <textarea
                  value={draftText}
                  onChange={(e) => setDraftText(e.target.value)}
                  placeholder="Write it here, in your own words — Wing coaches, it doesn't write this part."
                  rows={10}
                  className="mt-5 w-full rounded-xl bg-white px-4 py-3 text-[15px] leading-relaxed text-forest ring-1 ring-wing-border focus:outline-none focus:ring-2 focus:ring-salmon"
                />
                <div className="mt-4 flex justify-end gap-3">
                  <button
                    type="button"
                    onClick={startOver}
                    className="rounded-full px-4 py-2 text-sm font-medium text-plum"
                  >
                    Start over
                  </button>
                  <button
                    type="button"
                    disabled={publish.isPending || !draftText.trim()}
                    onClick={() => publish.mutate()}
                    className="rounded-full bg-salmon px-5 py-2.5 text-sm font-medium text-white disabled:opacity-50"
                  >
                    {publish.isPending ? "Posting…" : "Post to LinkedIn"}
                  </button>
                </div>
              </>
            )}
          </div>
        ) : isLoading ? (
          <div className="flex justify-center py-16">
            <Loader2 className="h-5 w-5 animate-spin text-plum/50" />
          </div>
        ) : status?.fires && status.contentType ? (
          <div className="mt-6">
            <span className="label-eyebrow">Worth a {actionLabel[status.contentType]}</span>
            <p className="mt-2 text-[15px] leading-[1.75] text-plum-body">{status.reason}</p>
            <div className="mt-6 flex gap-3">
              <button
                type="button"
                disabled={respond.isPending}
                onClick={() => respond.mutate("decline")}
                className="rounded-full px-4 py-2 text-sm font-medium text-plum disabled:opacity-50"
              >
                Not now
              </button>
              <button
                type="button"
                disabled={respond.isPending}
                onClick={() => respond.mutate("accept")}
                className="rounded-full bg-salmon px-5 py-2.5 text-sm font-medium text-white disabled:opacity-50"
              >
                {respond.isPending ? "…" : `Let's ${actionLabel[status.contentType]}`}
              </button>
            </div>
          </div>
        ) : (
          <div className="mt-6">
            <p className="text-[15px] leading-[1.75] text-plum-body">
              {status?.reason ?? "Nothing Wing's noticed right now."} Want to write something
              anyway?
            </p>
            <div className="mt-6 flex gap-3">
              <button
                type="button"
                disabled={request.isPending}
                onClick={() => request.mutate("post")}
                className="rounded-full bg-white px-4 py-2 text-sm font-medium text-forest ring-1 ring-wing-border disabled:opacity-50"
              >
                Help me write a post
              </button>
              <button
                type="button"
                disabled={request.isPending}
                onClick={() => request.mutate("article")}
                className="rounded-full bg-white px-4 py-2 text-sm font-medium text-forest ring-1 ring-wing-border disabled:opacity-50"
              >
                Help me write an article
              </button>
            </div>
          </div>
        )}
      </div>
    </AppShell>
  );
}
