import React, { useState } from "react";
import { useAuth } from "@/hooks/use-auth";
import { useQuery, useMutation } from "@tanstack/react-query";
import { getActiveSli, hasRefinedSli, type SliRecord } from "@/lib/sli";
import { queryClient } from "@/lib/queryClient";
import { useLocation } from "wouter";
import { useToast } from "@/hooks/use-toast";
import NavBar from "@/components/nav-bar";
import { 
  ArrowLeft, 
  Award, 
  CheckCircle2,
  Sparkles,
  Loader2,
  MessageCircle,
  Lightbulb,
  LightbulbOff,
  RefreshCw,
  AlertCircle
} from "lucide-react";

import { 
  Card, 
  CardContent, 
  CardDescription, 
  CardHeader, 
  CardTitle,
  CardFooter
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { scrollToTop } from "@/lib/utils";

export default function SliRefinementPage() {
  const { user } = useAuth();
  const { toast } = useToast();
  const [, navigate] = useLocation();
  const [feedback, setFeedback] = useState<string>("");
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);
  const [showFeedbackForm, setShowFeedbackForm] = useState<boolean>(false);
  // The refine endpoint returns rationale + implementation guidance. Rationale
  // is persisted on the record; guidance is not a column in sli_records, so we
  // hold the most recent one for display.
  const [lastRefinement, setLastRefinement] = useState<{
    refinementRationale?: string;
    implementationGuidance?: string;
  } | null>(null);

  // Fetch user's selected SLI
  const { data: slis, isLoading: slisLoading } = useQuery<SliRecord[]>({
    queryKey: ["/api/user/slis"],
    queryFn: async () => {
      const res = await fetch(`/api/user/slis`, { credentials: "include" });
      if (res.status === 404) return [];
      if (!res.ok) throw new Error("Failed to fetch SLIs");
      return res.json();
    },
    enabled: !!user,
  });

  // The SLI in force is the one that gets refined; a refinement creates a new
  // record descending from it rather than mutating it.
  const activeSli = getActiveSli(slis);
  const refinementsUsed = activeSli?.refinementCount ?? 0;
  const isRefined = hasRefinedSli(slis);

  // Function to handle refinement submission
  const handleSubmitRefinement = async () => {
    if (!slis || slis.length === 0) {
      toast({
        title: "Error",
        description: "No SLIs found to refine",
        variant: "destructive",
      });
      return;
    }

    if (!feedback.trim()) {
      toast({
        title: "Error",
        description: "Please provide feedback for refinement",
        variant: "destructive",
      });
      return;
    }

    const sli = activeSli;

    // Ensure an SLI is selected
    if (!sli) {
      toast({
        title: "Error",
        description: "Please select an SLI first before refining",
        variant: "destructive",
      });
      navigate("/sli-selection");
      return;
    }

    setIsSubmitting(true);

    try {
      // Send refinement request
      const res = await fetch('/api/user/sli/refine', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          sliId: sli.id,
          feedback,
        }),
      });

      if (!res.ok) {
        const errorData = await res.json();
        throw new Error(errorData.message || "Failed to refine SLI");
      }

      const data = await res.json();
      setLastRefinement(data?.refinementResponse ?? null);

      // Invalidate queries to refresh data
      queryClient.invalidateQueries({ queryKey: ["/api/user/slis"] });
      
      // Reset UI state
      setShowFeedbackForm(false);
      
      toast({
        title: "Success",
        description: "Your SLI has been refined and saved",
      });
    } catch (error) {
      toast({
        title: "Error",
        description: error instanceof Error ? error.message : "Failed to refine SLI",
        variant: "destructive",
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  // The statement being refined — for a refinement, show its parent's text.
  const getSelectedSliStatement = (): string => {
    if (!activeSli) return "";
    if (activeSli.parentSliId != null && Array.isArray(slis)) {
      const parent = slis.find((s) => s.id === activeSli.parentSliId);
      if (parent) return parent.statement;
    }
    return activeSli.statement;
  };

  // Redirect to home if no SLIs are available
  if (!slisLoading && (!slis || slis.length === 0)) {
    toast({
      title: "No SLIs Available",
      description: "You don't have any SLIs available to refine.",
    });
    navigate("/");
    return null;
  }

  return (
    <div className="min-h-screen bg-background flex flex-col">
      <NavBar />
      <main className="flex-1 max-w-5xl mx-auto px-4 sm:px-6 py-8">
        <div className="mb-6 flex items-center gap-2">
          <Button
            variant="outline"
            size="icon"
            onClick={() => {
              scrollToTop();
              navigate("/sli-selection");
            }}
            className="h-8 w-8"
          >
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <h1 className="text-2xl font-bold">Refine Your SLI</h1>
        </div>

        {slisLoading ? (
          <div className="flex-1 flex items-center justify-center">
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
            <span className="ml-2">Loading your SLIs...</span>
          </div>
        ) : activeSli ? (
          <div className="space-y-8">
            {/* Show different views based on whether the SLI has been refined already */}
            {isRefined && !showFeedbackForm ? (
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <CheckCircle2 className="h-5 w-5 text-green-500" />
                    <span>Your Refined SLI</span>
                  </CardTitle>
                  <CardDescription>
                    Your SLI has been refined based on your feedback.
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <Tabs defaultValue="refined" className="w-full">
                    <TabsList className="grid grid-cols-3 mb-4">
                      <TabsTrigger value="refined">Refined SLI</TabsTrigger>
                      <TabsTrigger value="rationale">Rationale</TabsTrigger>
                      <TabsTrigger value="guidance">Implementation</TabsTrigger>
                    </TabsList>
                    
                    <TabsContent value="refined">
                      <div className="space-y-4">
                        <Alert className="bg-primary/5 border-primary/20">
                          <AlertTitle className="flex items-center gap-2">
                            <Sparkles className="h-4 w-4 text-primary" />
                            <span>Final SLI Statement</span>
                          </AlertTitle>
                          <AlertDescription className="mt-2 text-lg font-medium">
                            {activeSli?.statement}
                          </AlertDescription>
                        </Alert>
                        
                        <div className="text-sm text-muted-foreground mt-4">
                          <div className="flex items-start gap-2 mb-2">
                            <ArrowLeft className="h-4 w-4 mt-0.5 text-muted-foreground" />
                            <div>
                              <p className="font-medium">Original SLI:</p>
                              <p>{getSelectedSliStatement()}</p>
                            </div>
                          </div>
                        </div>
                      </div>
                    </TabsContent>
                    
                    <TabsContent value="rationale">
                      <div className="bg-background p-4 rounded-md border">
                        <div className="flex items-center gap-2 mb-3">
                          <MessageCircle className="h-4 w-4 text-primary" />
                          <h3 className="font-medium">Refinement Rationale</h3>
                        </div>
                        <ScrollArea className="h-[300px] rounded-md">
                          <div className="p-2 whitespace-pre-line">
                            {lastRefinement?.refinementRationale ||
                              activeSli?.rationale ||
                              "No rationale provided."}
                          </div>
                        </ScrollArea>
                      </div>
                    </TabsContent>
                    
                    <TabsContent value="guidance">
                      <div className="bg-background p-4 rounded-md border">
                        <div className="flex items-center gap-2 mb-3">
                          <Lightbulb className="h-4 w-4 text-amber-500" />
                          <h3 className="font-medium">Implementation Guidance</h3>
                        </div>
                        <ScrollArea className="h-[300px] rounded-md">
                          <div className="p-2 whitespace-pre-line">
                            {lastRefinement?.implementationGuidance ||
                              activeSli?.implementationGuidance ||
                              "No implementation guidance provided."}
                          </div>
                        </ScrollArea>
                      </div>
                    </TabsContent>
                  </Tabs>
                </CardContent>
                <CardFooter className="flex flex-col border-t pt-6 gap-4">
                  <div className="flex justify-between w-full">
                    <Button
                      variant="outline"
                      onClick={() => {
                        scrollToTop();
                        navigate("/");
                      }}
                    >
                      Return to Home
                    </Button>
                    <Button
                      onClick={() => {
                        scrollToTop();
                        navigate("/sli-selection");
                      }}
                    >
                      Back to SLI Selection
                    </Button>
                  </div>
                  
                  {/* Re-refinement section */}
                  {refinementsUsed < 3 ? (
                    <div className="pt-2 border-t border-gray-100 mt-2 w-full">
                      <div className="flex justify-between items-center">
                        <div>
                          <h4 className="text-sm font-medium">Not quite right?</h4>
                          <p className="text-xs text-muted-foreground">
                            You can refine your SLI {3 - refinementsUsed} more {(3 - refinementsUsed) === 1 ? 'time' : 'times'}.
                          </p>
                        </div>
                        <Button 
                          variant="secondary"
                          size="sm"
                          className="gap-1"
                          onClick={() => {
                            setFeedback(""); // Clear any previous feedback
                            setShowFeedbackForm(true); // Show the feedback form
                          }}
                        >
                          <RefreshCw className="h-3.5 w-3.5" />
                          Re-refine SLI
                        </Button>
                      </div>
                    </div>
                  ) : (
                    <div className="pt-2 border-t border-gray-100 mt-2 w-full">
                      <div className="flex justify-between items-center">
                        <div className="flex items-start gap-2">
                          <AlertCircle className="h-4 w-4 text-yellow-600 mt-0.5" />
                          <div>
                            <h4 className="text-sm font-medium">Maximum refinements reached</h4>
                            <p className="text-xs text-muted-foreground">
                              You've already refined this SLI the maximum number of times (3).
                            </p>
                          </div>
                        </div>
                      </div>
                    </div>
                  )}
                </CardFooter>
              </Card>
            ) : (
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Award className="h-5 w-5 text-primary" />
                    <span>Your Selected SLI</span>
                  </CardTitle>
                  <CardDescription>
                    Provide feedback to improve and personalize your Single Lasting Impression.
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-6">
                  <div className="p-4 bg-primary/10 rounded-lg border border-primary/20">
                    <p className="text-lg font-medium text-secondary">
                      {getSelectedSliStatement()}
                    </p>
                  </div>
                  
                  <div className="space-y-3">
                    <label className="block font-medium" htmlFor="feedback">
                      Provide Feedback to Improve Your SLI
                    </label>
                    <Textarea
                      id="feedback"
                      placeholder="Describe how you'd like to refine your SLI. For example: Make it more concise, emphasize a specific quality, adjust the tone to be more approachable, etc."
                      rows={5}
                      value={feedback}
                      onChange={(e) => setFeedback(e.target.value)}
                      className="w-full"
                    />
                  </div>

                  <div className="flex justify-between mt-8">
                    {showFeedbackForm && isRefined ? (
                      <Button
                        variant="outline"
                        onClick={() => {
                          setShowFeedbackForm(false); // Go back to viewing the refined SLI
                        }}
                      >
                        Cancel
                      </Button>
                    ) : (
                      <Button
                        variant="outline"
                        onClick={() => {
                          scrollToTop();
                          navigate("/sli-selection");
                        }}
                      >
                        Back
                      </Button>
                    )}
                    <Button
                      onClick={handleSubmitRefinement}
                      disabled={isSubmitting}
                      className="gap-2"
                    >
                      {isSubmitting ? (
                        <>
                          <Loader2 className="h-4 w-4 animate-spin" />
                          Processing...
                        </>
                      ) : (
                        <>
                          <Sparkles className="h-4 w-4" />
                          {showFeedbackForm && isRefined ? "Re-refine My SLI" : "Refine My SLI"}
                        </>
                      )}
                    </Button>
                  </div>
                </CardContent>
              </Card>
            )}
          </div>
        ) : (
          <Card>
            <CardContent className="p-6">
              <div className="text-center">
                <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-primary/10">
                  <Award className="h-6 w-6 text-primary" />
                </div>
                <h3 className="mt-3 text-lg font-medium">No SLI Selected</h3>
                <p className="mt-2 text-sm text-gray-500">
                  You need to select an SLI before you can refine it.
                </p>
                <Button
                  className="mt-4"
                  onClick={() => {
                    scrollToTop();
                    navigate("/sli-selection");
                  }}
                >
                  Select an SLI
                </Button>
              </div>
            </CardContent>
          </Card>
        )}
      </main>
    </div>
  );
}