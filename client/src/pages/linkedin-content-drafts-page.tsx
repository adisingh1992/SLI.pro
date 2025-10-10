import React, { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Link, useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";
import NavBar from "@/components/nav-bar";
import { ArrowLeft, Copy, Loader2, FileText, PenLine, RefreshCw, Calendar, MessageSquare, Linkedin, Share2 } from "lucide-react";
import { queryClient } from "@/lib/query-client";

interface LinkedinContentDraft {
  id: number;
  userId: number;
  post1Type: string;
  post1Content: {
    hook: string;
    body: string;
    closing: string;
    hashtags: string;
  };
  post2Type: string;
  post2Content: {
    hook: string;
    body: string;
    closing: string;
    hashtags: string;
  };
  createdAt: string;
}

// Helper function to get the last day of the current month
const getLastDayOfMonth = (): Date => {
  const now = new Date();
  return new Date(now.getFullYear(), now.getMonth() + 1, 0);
};

// Helper function to format date as Month DD, YYYY
const formatDate = (date: Date): string => {
  return date.toLocaleDateString('en-US', { 
    month: 'long', 
    day: 'numeric', 
    year: 'numeric' 
  });
};

// Separate component for draft display that handles hooks
interface DraftDisplayProps {
  draft: LinkedinContentDraft;
  activeTab: string;
  setActiveTab: (tab: string) => void;
  copyToClipboard: (text: string) => void;
  formatFullPost: (postContent: LinkedinContentDraft["post1Content"]) => string;
  postToLinkedIn: (params: { draftId: number; postNumber: number; content: string }) => void;
  postingPostNumber: number | null;
  dueDate: Date;
  navigate: (path: string) => void;
}

const DraftDisplay: React.FC<DraftDisplayProps> = ({
  draft,
  activeTab,
  setActiveTab,
  copyToClipboard,
  formatFullPost,
  postToLinkedIn,
  postingPostNumber,
  dueDate,
  navigate
}) => {
  // Fetch share counts for both posts - hooks are always called here since component only renders with valid draft
  const post1ShareData = useQuery<{ shareCount: number; lastSharedAt: string | null }>({
    queryKey: ["/api/linkedin-content-drafts", draft.id, "shares", 1],
    queryFn: async () => {
      const response = await fetch(`/api/linkedin-content-drafts/${draft.id}/shares/1`);
      if (!response.ok) {
        throw new Error("Failed to fetch share count");
      }
      return response.json();
    },
    refetchOnWindowFocus: false,
  });

  const post2ShareData = useQuery<{ shareCount: number; lastSharedAt: string | null }>({
    queryKey: ["/api/linkedin-content-drafts", draft.id, "shares", 2],
    queryFn: async () => {
      const response = await fetch(`/api/linkedin-content-drafts/${draft.id}/shares/2`);
      if (!response.ok) {
        throw new Error("Failed to fetch share count");
      }
      return response.json();
    },
    refetchOnWindowFocus: false,
  });

  return (
    <div className="grid grid-cols-1 md:grid-cols-4 gap-6 mb-8">
      {/* Left Column (75% width) */}
      <div className="md:col-span-3">
        <Card>
          <CardHeader>
            <CardTitle>Ready-to-Use LinkedIn Content</CardTitle>
            <CardDescription>
              These posts are designed to enhance your professional brand and reinforce your SLI.
              Simply copy and paste directly to LinkedIn.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
              <TabsList className="grid w-full grid-cols-2">
                <TabsTrigger value="post1">
                  Post 1: {draft.post1Type}
                </TabsTrigger>
                <TabsTrigger value="post2">
                  Post 2: {draft.post2Type}
                </TabsTrigger>
              </TabsList>
              
              <TabsContent value="post1" className="mt-4">
                <Card>
                  <CardHeader>
                    <CardTitle className="text-lg">
                      <div className="flex items-center justify-between">
                        <span>Post Type: {draft.post1Type}</span>
                        <div className="flex items-center gap-2">
                          <Button 
                            variant="ghost" 
                            size="sm" 
                            onClick={() => copyToClipboard(formatFullPost(draft.post1Content))}
                            data-testid="button-copy-post-1"
                          >
                            <Copy className="h-4 w-4 mr-2" />
                            Copy Full Post
                          </Button>
                          <Button 
                            variant="default" 
                            size="sm" 
                            onClick={() => postToLinkedIn({
                              draftId: draft.id,
                              postNumber: 1,
                              content: formatFullPost(draft.post1Content)
                            })}
                            disabled={postingPostNumber === 1}
                            data-testid="button-post-to-linkedin-1"
                          >
                            {postingPostNumber === 1 ? (
                              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                            ) : (
                              <Linkedin className="h-4 w-4 mr-2" />
                            )}
                            Post to LinkedIn
                          </Button>
                        </div>
                      </div>
                    </CardTitle>
                    <CardDescription className="flex items-center justify-between">
                      <span>Created on {new Date(draft.createdAt).toLocaleDateString()}</span>
                      <span className="text-sm flex items-center gap-1" data-testid="text-share-count-1">
                        <Share2 className="h-3 w-3" />
                        {post1ShareData.isLoading ? (
                          "Loading..."
                        ) : post1ShareData.error ? (
                          "Error loading count"
                        ) : (
                          `Posted ${post1ShareData.data?.shareCount || 0} ${post1ShareData.data?.shareCount === 1 ? 'time' : 'times'}`
                        )}
                      </span>
                    </CardDescription>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-4">
                      <div>
                        <h3 className="font-medium text-sm mb-1">Hook</h3>
                        <div className="p-3 rounded-md bg-muted/50">
                          {draft.post1Content.hook}
                        </div>
                      </div>
                      
                      <div>
                        <h3 className="font-medium text-sm mb-1">Body</h3>
                        <div className="p-3 rounded-md bg-muted/50 whitespace-pre-line">
                          {draft.post1Content.body}
                        </div>
                      </div>
                      
                      <div>
                        <h3 className="font-medium text-sm mb-1">Closing</h3>
                        <div className="p-3 rounded-md bg-muted/50">
                          {draft.post1Content.closing}
                        </div>
                      </div>
                      
                      <div>
                        <h3 className="font-medium text-sm mb-1">Hashtags</h3>
                        <div className="p-3 rounded-md bg-muted/50">
                          {draft.post1Content.hashtags}
                        </div>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </TabsContent>
              
              <TabsContent value="post2" className="mt-4">
                <Card>
                  <CardHeader>
                    <CardTitle className="text-lg">
                      <div className="flex items-center justify-between">
                        <span>Post Type: {draft.post2Type}</span>
                        <div className="flex items-center gap-2">
                          <Button 
                            variant="ghost" 
                            size="sm" 
                            onClick={() => copyToClipboard(formatFullPost(draft.post2Content))}
                            data-testid="button-copy-post-2"
                          >
                            <Copy className="h-4 w-4 mr-2" />
                            Copy Full Post
                          </Button>
                          <Button 
                            variant="default" 
                            size="sm" 
                            onClick={() => postToLinkedIn({
                              draftId: draft.id,
                              postNumber: 2,
                              content: formatFullPost(draft.post2Content)
                            })}
                            disabled={postingPostNumber === 2}
                            data-testid="button-post-to-linkedin-2"
                          >
                            {postingPostNumber === 2 ? (
                              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                            ) : (
                              <Linkedin className="h-4 w-4 mr-2" />
                            )}
                            Post to LinkedIn
                          </Button>
                        </div>
                      </div>
                    </CardTitle>
                    <CardDescription className="flex items-center justify-between">
                      <span>Created on {new Date(draft.createdAt).toLocaleDateString()}</span>
                      <span className="text-sm flex items-center gap-1" data-testid="text-share-count-2">
                        <Share2 className="h-3 w-3" />
                        {post2ShareData.isLoading ? (
                          "Loading..."
                        ) : post2ShareData.error ? (
                          "Error loading count"
                        ) : (
                          `Posted ${post2ShareData.data?.shareCount || 0} ${post2ShareData.data?.shareCount === 1 ? 'time' : 'times'}`
                        )}
                      </span>
                    </CardDescription>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-4">
                      <div>
                        <h3 className="font-medium text-sm mb-1">Hook</h3>
                        <div className="p-3 rounded-md bg-muted/50">
                          {draft.post2Content.hook}
                        </div>
                      </div>
                      
                      <div>
                        <h3 className="font-medium text-sm mb-1">Body</h3>
                        <div className="p-3 rounded-md bg-muted/50 whitespace-pre-line">
                          {draft.post2Content.body}
                        </div>
                      </div>
                      
                      <div>
                        <h3 className="font-medium text-sm mb-1">Closing</h3>
                        <div className="p-3 rounded-md bg-muted/50">
                          {draft.post2Content.closing}
                        </div>
                      </div>
                      
                      <div>
                        <h3 className="font-medium text-sm mb-1">Hashtags</h3>
                        <div className="p-3 rounded-md bg-muted/50">
                          {draft.post2Content.hashtags}
                        </div>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </TabsContent>
            </Tabs>
          </CardContent>
          <CardFooter className="flex justify-between">
            <div className="text-sm text-muted-foreground">
              These posts are aligned with your SLI and professional goals.
            </div>
          </CardFooter>
        </Card>
      </div>
      
      {/* Right Column (25% width) - Feedback Widget */}
      <div className="md:col-span-1">
        <Card className="h-full bg-blue-50 border-blue-200">
          <CardHeader className="pb-3">
            <CardTitle className="text-lg text-blue-700">Provide Feedback</CardTitle>
            <CardDescription>
              Tell us how these posts work for you
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              <div className="flex items-center text-blue-600">
                <Calendar className="h-4 w-4 mr-2" />
                <span className="text-sm font-medium">Due Date:</span>
              </div>
              <div className="px-2 py-1.5 bg-white rounded-md border border-blue-200 text-sm">
                {formatDate(dueDate)}
              </div>
              <p className="text-sm text-blue-700 mt-2">
                Your feedback helps us improve content recommendations and ensures alignment with your SLI.
              </p>
            </div>
          </CardContent>
          <CardFooter>
            <Button 
              className="w-full" 
              onClick={() => navigate("/monthly-check-in")}
            >
              <MessageSquare className="h-4 w-4 mr-2" />
              Provide Feedback
            </Button>
          </CardFooter>
        </Card>
      </div>
    </div>
  );
};

const LinkedinContentDraftsPage: React.FC = () => {
  const [activeTab, setActiveTab] = useState("post1");
  const [postingPostNumber, setPostingPostNumber] = useState<number | null>(null);
  const { toast } = useToast();
  const [, navigate] = useLocation();
  
  // Get the last day of the current month for the due date
  const dueDate = getLastDayOfMonth();

  // Fetch LinkedIn content drafts
  const { data: contentDrafts, isLoading: isDraftsLoading, error: draftsError } = useQuery<LinkedinContentDraft[]>({
    queryKey: ["/api/linkedin-content-drafts"],
    refetchOnWindowFocus: false,
  });

  // Generate new content drafts
  const generateMutation = useMutation({
    mutationFn: async () => {
      const response = await fetch("/api/linkedin-content-drafts/generate", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
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
    onError: (error) => {
      toast({
        title: "Generation failed",
        description: error.message || "Failed to generate LinkedIn content drafts. Please try again.",
        variant: "destructive",
      });
    },
  });

  // Post to LinkedIn mutation
  const postToLinkedinMutation = useMutation({
    mutationFn: async ({ draftId, postNumber, content }: { draftId: number; postNumber: number; content: string }) => {
      setPostingPostNumber(postNumber);
      const response = await fetch(`/api/linkedin-content-drafts/${draftId}/post/${postNumber}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content }),
      });
      
      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || "Failed to post to LinkedIn");
      }
      
      return response.json();
    },
    onSuccess: (_, variables) => {
      setPostingPostNumber(null);
      toast({
        title: "Posted to LinkedIn",
        description: "Your post has been published to LinkedIn successfully!",
      });
      // Invalidate share count query to refresh the count
      queryClient.invalidateQueries({ queryKey: ["/api/linkedin-content-drafts", variables.draftId, "shares", variables.postNumber] });
    },
    onError: (error: any) => {
      setPostingPostNumber(null);
      toast({
        title: "Post failed",
        description: error.message || "Failed to post to LinkedIn. Please try again.",
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

  // Format the full post for copying
  const formatFullPost = (postContent: LinkedinContentDraft["post1Content"]) => {
    return `${postContent.hook}\n\n${postContent.body}\n\n${postContent.closing}\n\n${postContent.hashtags}`;
  };

  // Show a loading state while fetching data
  if (isDraftsLoading) {
    return (
      <div className="container mx-auto p-4">
        <NavBar />
        <div className="flex items-center mb-6">
          <Button variant="ghost" onClick={() => navigate("/linkedin-optimization")} className="mr-2">
            <ArrowLeft className="h-4 w-4 mr-2" />
            Back
          </Button>
          <h1 className="text-2xl font-bold">LinkedIn Content Drafts</h1>
        </div>
        
        <div className="grid grid-cols-1 gap-6">
          <Card>
            <CardHeader>
              <Skeleton className="h-4 w-1/3 mb-2" />
              <Skeleton className="h-3 w-1/2" />
            </CardHeader>
            <CardContent>
              <Skeleton className="h-24 w-full mb-4" />
              <Skeleton className="h-24 w-full" />
            </CardContent>
            <CardFooter>
              <Skeleton className="h-8 w-24 mr-2" />
              <Skeleton className="h-8 w-24" />
            </CardFooter>
          </Card>
        </div>
      </div>
    );
  }

  // Show an error message if something went wrong
  if (draftsError) {
    return (
      <div className="container mx-auto p-4">
        <NavBar />
        <div className="flex items-center mb-6">
          <Button variant="ghost" onClick={() => navigate("/linkedin-optimization")} className="mr-2">
            <ArrowLeft className="h-4 w-4 mr-2" />
            Back
          </Button>
          <h1 className="text-2xl font-bold">LinkedIn Content Drafts</h1>
        </div>
        
        <Card className="bg-destructive/10">
          <CardHeader>
            <CardTitle>Error Loading Content Drafts</CardTitle>
            <CardDescription>
              Something went wrong while loading your LinkedIn content drafts.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <p>{draftsError instanceof Error ? draftsError.message : "Unknown error"}</p>
          </CardContent>
          <CardFooter>
            <Button onClick={() => queryClient.invalidateQueries({ queryKey: ["/api/linkedin-content-drafts"] })}>
              Try Again
            </Button>
          </CardFooter>
        </Card>
      </div>
    );
  }

  const latestDraft = contentDrafts && contentDrafts.length > 0 ? contentDrafts[0] : null;

  return (
    <div className="container mx-auto px-4">
      <NavBar />
      <div className="flex items-center justify-between mt-6 mb-6">
        <div className="flex items-center">
          <Button variant="ghost" onClick={() => navigate("/linkedin-optimization")} className="mr-2">
            <ArrowLeft className="h-4 w-4 mr-2" />
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
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              Generating...
            </>
          ) : (
            <>
              <RefreshCw className="h-4 w-4 mr-2" />
              Generate New Drafts
            </>
          )}
        </Button>
      </div>

      {latestDraft ? (
        <DraftDisplay 
          draft={latestDraft} 
          activeTab={activeTab}
          setActiveTab={setActiveTab}
          copyToClipboard={copyToClipboard}
          formatFullPost={formatFullPost}
          postToLinkedIn={(params) => {
            setPostingPostNumber(params.postNumber);
            postToLinkedinMutation.mutate(params);
          }}
          postingPostNumber={postingPostNumber}
          dueDate={dueDate}
          navigate={navigate}
        />
      ) : (
        // No content drafts exist
        <Card className="mb-8">
          <CardHeader>
            <CardTitle>No Content Drafts Found</CardTitle>
            <CardDescription>
              You don't have any LinkedIn content drafts yet. Generate your first drafts now.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex flex-col items-center justify-center py-12 text-center">
              <FileText className="h-16 w-16 text-muted-foreground mb-4" />
              <h3 className="font-medium text-lg mb-2">Create LinkedIn Content</h3>
              <p className="text-muted-foreground mb-6 max-w-md">
                Generate professional, SLI-aligned content for your LinkedIn profile with just one click.
              </p>
              <Button 
                onClick={() => generateMutation.mutate()} 
                disabled={generateMutation.isPending}
              >
                {generateMutation.isPending ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    Generating...
                  </>
                ) : (
                  <>
                    <PenLine className="h-4 w-4 mr-2" />
                    Generate Content Drafts
                  </>
                )}
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Previous Drafts Section */}
      {contentDrafts && contentDrafts.length > 1 && (
        <div className="mt-8">
          <div className="flex items-center mb-4">
            <h2 className="text-xl font-bold">Previous Drafts</h2>
          </div>
          
          {contentDrafts.slice(1).map((draft) => (
            <Card key={draft.id} className="mb-4">
              <CardHeader>
                <CardTitle className="text-lg">
                  Content from {new Date(draft.createdAt).toLocaleDateString()}
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <h3 className="font-medium mb-2">{draft.post1Type}</h3>
                    <p className="text-sm line-clamp-3 mb-2">{draft.post1Content.hook}</p>
                    <Button 
                      variant="outline" 
                      size="sm" 
                      onClick={() => copyToClipboard(formatFullPost(draft.post1Content))}
                    >
                      <Copy className="h-3 w-3 mr-1" />
                      Copy
                    </Button>
                  </div>
                  
                  <div>
                    <h3 className="font-medium mb-2">{draft.post2Type}</h3>
                    <p className="text-sm line-clamp-3 mb-2">{draft.post2Content.hook}</p>
                    <Button 
                      variant="outline" 
                      size="sm" 
                      onClick={() => copyToClipboard(formatFullPost(draft.post2Content))}
                    >
                      <Copy className="h-3 w-3 mr-1" />
                      Copy
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
};

export default LinkedinContentDraftsPage;