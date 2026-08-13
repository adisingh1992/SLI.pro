import React from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";
import NavBar from "@/components/nav-bar";
import {
  ArrowLeft,
  Calendar,
  Copy,
  FileText,
  Linkedin,
  Loader2,
  MessageSquare,
  PenLine,
  RefreshCw,
  Share2,
} from "lucide-react";
import { queryClient } from "@/lib/queryClient";

/**
 * LinkedIn content drafts — one card per post.
 *
 * This page used to assume the MVP's row shape, where a single record carried
 * `post1Type`/`post1Content` and `post2Type`/`post2Content`. Wing stores one
 * row per post (spec §12), which is what lets the Tier 2 Feature Article
 * module iterate on an individual draft — and both the migration and the live
 * generate path have written that shape for a while. The page had not caught
 * up, so `draft.post1Content` was undefined and reading `.hook` off it crashed
 * the route for every user with drafts, migrated or not.
 *
 * Share counts now live on the draft row too, so the list response already
 * carries them. The two per-card `/shares/:postNumber` queries this page used
 * to fire are gone.
 */

/** One post, as wing.content_drafts stores it. */
interface ContentDraft {
  id: number;
  userId: number;
  draftType: string;
  /** jsonb — treat every field as possibly absent. */
  content: {
    postType?: string;
    hook?: string;
    body?: string;
    closing?: string;
    hashtags?: string;
  } | null;
  iteration: number;
  status: string;
  publishedUrl: string | null;
  publishedAt: string | null;
  shareCount: number;
  createdAt: string;
}

const getLastDayOfMonth = (): Date => {
  const now = new Date();
  return new Date(now.getFullYear(), now.getMonth() + 1, 0);
};

const formatDate = (date: Date): string =>
  date.toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" });

const formatFullPost = (c: ContentDraft["content"]): string =>
  [c?.hook, c?.body, c?.closing, c?.hashtags].filter(Boolean).join("\n\n");

/** Drafts generated together share a timestamp, which is how a batch reads. */
function groupByDay(drafts: ContentDraft[]): Array<[string, ContentDraft[]]> {
  const groups = new Map<string, ContentDraft[]>();
  for (const d of drafts) {
    const day = new Date(d.createdAt).toDateString();
    groups.set(day, [...(groups.get(day) ?? []), d]);
  }
  return Array.from(groups.entries());
}

function PostCard({
  draft,
  onCopy,
  onPost,
  isPosting,
}: {
  draft: ContentDraft;
  onCopy: (text: string) => void;
  onPost: (draft: ContentDraft) => void;
  isPosting: boolean;
}) {
  const c = draft.content;
  const full = formatFullPost(c);

  return (
    <Card className="mb-4">
      <CardHeader className="pb-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <CardTitle className="text-base">
            {c?.postType ?? "Post"}
          </CardTitle>
          <div className="flex items-center gap-2">
            {draft.shareCount > 0 && (
              <Badge variant="secondary" className="font-normal">
                <Share2 className="mr-1 h-3 w-3" />
                Posted {draft.shareCount} {draft.shareCount === 1 ? "time" : "times"}
              </Badge>
            )}
            <Button variant="outline" size="sm" onClick={() => onCopy(full)} disabled={!full}>
              <Copy className="mr-1 h-3 w-3" />
              Copy
            </Button>
            <Button size="sm" onClick={() => onPost(draft)} disabled={isPosting || !full}>
              {isPosting ? (
                <Loader2 className="mr-1 h-3 w-3 animate-spin" />
              ) : (
                <Linkedin className="mr-1 h-3 w-3" />
              )}
              Post to LinkedIn
            </Button>
          </div>
        </div>
        {draft.publishedAt && (
          <CardDescription>
            Last posted {new Date(draft.publishedAt).toLocaleDateString()}
          </CardDescription>
        )}
      </CardHeader>

      <CardContent className="space-y-3">
        {/* Rendered per section rather than as one blob so a draft missing a
            section still shows the rest instead of collapsing. */}
        {c?.hook && (
          <div>
            <p className="mb-1 text-xs font-medium text-muted-foreground">Hook</p>
            <p className="text-sm">{c.hook}</p>
          </div>
        )}
        {c?.body && (
          <div>
            <p className="mb-1 text-xs font-medium text-muted-foreground">Body</p>
            <p className="whitespace-pre-line text-sm">{c.body}</p>
          </div>
        )}
        {c?.closing && (
          <div>
            <p className="mb-1 text-xs font-medium text-muted-foreground">Closing</p>
            <p className="text-sm">{c.closing}</p>
          </div>
        )}
        {c?.hashtags && (
          <div>
            <p className="mb-1 text-xs font-medium text-muted-foreground">Hashtags</p>
            <p className="text-sm text-blue-600">{c.hashtags}</p>
          </div>
        )}
        {!full && (
          <p className="py-2 text-sm text-muted-foreground">
            This draft has no content recorded.
          </p>
        )}
      </CardContent>
    </Card>
  );
}

const LinkedinContentDraftsPage: React.FC = () => {
  const { toast } = useToast();
  const [, navigate] = useLocation();
  const [postingDraftId, setPostingDraftId] = React.useState<number | null>(null);
  const dueDate = getLastDayOfMonth();

  const {
    data: contentDrafts,
    isLoading,
    error,
  } = useQuery<ContentDraft[]>({
    queryKey: ["/api/linkedin-content-drafts"],
    refetchOnWindowFocus: false,
  });

  const generateMutation = useMutation({
    mutationFn: async () => {
      const response = await fetch("/api/linkedin-content-drafts/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
      });
      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || "Failed to generate content drafts");
      }
      return response.json();
    },
    onSuccess: () => {
      toast({
        title: "Content drafts generated",
        description: "New LinkedIn content drafts have been generated successfully.",
      });
      queryClient.invalidateQueries({ queryKey: ["/api/linkedin-content-drafts"] });
    },
    onError: (err: any) => {
      toast({
        title: "Generation failed",
        description: err.message || "Failed to generate LinkedIn content drafts. Please try again.",
        variant: "destructive",
      });
    },
  });

  const postMutation = useMutation({
    // No post number in the path — a draft id identifies one post now.
    mutationFn: async ({ draftId, content }: { draftId: number; content: string }) => {
      const response = await fetch(`/api/linkedin-content-drafts/${draftId}/post`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content }),
      });
      if (!response.ok) {
        const err = await response.json();
        throw new Error(err.error || "Failed to post to LinkedIn");
      }
      return response.json();
    },
    onSuccess: () => {
      setPostingDraftId(null);
      toast({
        title: "Posted to LinkedIn",
        description: "Your post has been published to LinkedIn successfully!",
      });
      // The share count lives on the draft row, so refetching the list is what
      // refreshes it — there is no separate shares query any more.
      queryClient.invalidateQueries({ queryKey: ["/api/linkedin-content-drafts"] });
    },
    onError: (err: any) => {
      setPostingDraftId(null);
      toast({
        title: "Post failed",
        description: err.message || "Failed to post to LinkedIn. Please try again.",
        variant: "destructive",
      });
    },
  });

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text).then(() => {
      toast({
        title: "Copied to clipboard",
        description: "Content has been copied to your clipboard.",
      });
    });
  };

  const header = (
    <div className="mb-6 mt-6 flex items-center justify-between">
      <div className="flex items-center">
        <Button
          variant="ghost"
          onClick={() => navigate("/linkedin-optimization")}
          className="mr-2"
        >
          <ArrowLeft className="mr-2 h-4 w-4" />
          Back
        </Button>
        <h1 className="text-2xl font-bold">LinkedIn Content Drafts</h1>
      </div>
      <Button
        onClick={() => generateMutation.mutate()}
        disabled={generateMutation.isPending}
        className="ml-auto"
      >
        {generateMutation.isPending ? (
          <>
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            Generating...
          </>
        ) : (
          <>
            <RefreshCw className="mr-2 h-4 w-4" />
            Generate New Drafts
          </>
        )}
      </Button>
    </div>
  );

  if (isLoading) {
    return (
      <div className="container mx-auto px-4">
        <NavBar />
        {header}
        <Card>
          <CardHeader>
            <Skeleton className="mb-2 h-4 w-1/3" />
            <Skeleton className="h-3 w-1/2" />
          </CardHeader>
          <CardContent>
            <Skeleton className="mb-4 h-24 w-full" />
            <Skeleton className="h-24 w-full" />
          </CardContent>
        </Card>
      </div>
    );
  }

  if (error) {
    return (
      <div className="container mx-auto px-4">
        <NavBar />
        {header}
        <Card className="bg-destructive/10">
          <CardHeader>
            <CardTitle>Error Loading Content Drafts</CardTitle>
            <CardDescription>
              Something went wrong while loading your LinkedIn content drafts.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <p>{error instanceof Error ? error.message : "Unknown error"}</p>
          </CardContent>
          <CardFooter>
            <Button
              onClick={() =>
                queryClient.invalidateQueries({ queryKey: ["/api/linkedin-content-drafts"] })
              }
            >
              Try Again
            </Button>
          </CardFooter>
        </Card>
      </div>
    );
  }

  const drafts = contentDrafts ?? [];
  const groups = groupByDay(drafts);

  return (
    <div className="container mx-auto px-4">
      <NavBar />
      {header}

      {drafts.length === 0 ? (
        <Card className="mb-8">
          <CardHeader>
            <CardTitle>No Content Drafts Found</CardTitle>
            <CardDescription>
              You don't have any LinkedIn content drafts yet. Generate your first drafts now.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex flex-col items-center justify-center py-12 text-center">
              <FileText className="mb-4 h-16 w-16 text-muted-foreground" />
              <h3 className="mb-2 text-lg font-medium">Create LinkedIn Content</h3>
              <p className="mb-6 max-w-md text-muted-foreground">
                Generate professional, SLI-aligned content for your LinkedIn profile with
                just one click.
              </p>
              <Button
                onClick={() => generateMutation.mutate()}
                disabled={generateMutation.isPending}
              >
                {generateMutation.isPending ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Generating...
                  </>
                ) : (
                  <>
                    <PenLine className="mr-2 h-4 w-4" />
                    Generate Content Drafts
                  </>
                )}
              </Button>
            </div>
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 gap-6 md:grid-cols-4">
          <div className="md:col-span-3">
            {groups.map(([day, posts], groupIndex) => (
              <div key={day} className="mb-8">
                <div className="mb-3 flex items-center gap-3">
                  <h2 className="text-lg font-semibold">
                    {groupIndex === 0 ? "Latest drafts" : new Date(day).toLocaleDateString()}
                  </h2>
                  <span className="text-sm text-muted-foreground">
                    {posts.length} {posts.length === 1 ? "post" : "posts"}
                    {groupIndex === 0 && ` · ${new Date(day).toLocaleDateString()}`}
                  </span>
                </div>
                <Separator className="mb-4" />
                {posts.map((draft) => (
                  <PostCard
                    key={draft.id}
                    draft={draft}
                    onCopy={copyToClipboard}
                    isPosting={postingDraftId === draft.id}
                    onPost={(d) => {
                      setPostingDraftId(d.id);
                      postMutation.mutate({
                        draftId: d.id,
                        content: formatFullPost(d.content),
                      });
                    }}
                  />
                ))}
              </div>
            ))}
          </div>

          <div className="md:col-span-1">
            <Card className="h-full border-blue-200 bg-blue-50">
              <CardHeader className="pb-3">
                <CardTitle className="text-lg text-blue-700">Provide Feedback</CardTitle>
                <CardDescription>Tell us how these posts work for you</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  <div className="flex items-center text-blue-600">
                    <Calendar className="mr-2 h-4 w-4" />
                    <span className="text-sm font-medium">Due Date:</span>
                  </div>
                  <div className="rounded-md border border-blue-200 bg-white px-2 py-1.5 text-sm">
                    {formatDate(dueDate)}
                  </div>
                  <p className="mt-2 text-sm text-blue-700">
                    Your feedback helps us improve content recommendations and ensures
                    alignment with your SLI.
                  </p>
                </div>
              </CardContent>
              <CardFooter>
                <Button className="w-full" onClick={() => navigate("/monthly-check-in")}>
                  <MessageSquare className="mr-2 h-4 w-4" />
                  Provide Feedback
                </Button>
              </CardFooter>
            </Card>
          </div>
        </div>
      )}
    </div>
  );
};

export default LinkedinContentDraftsPage;
