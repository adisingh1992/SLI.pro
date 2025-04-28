import React, { useState } from "react";
import { useAuth } from "@/hooks/use-auth";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Sli } from "@shared/schema";
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
  LightbulbOff
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

  // Fetch user's selected SLI
  const { data: slis, isLoading: slisLoading } = useQuery<Sli[]>({
    queryKey: ["/api/user/slis"],
    queryFn: async () => {
      const res = await fetch(`/api/user/slis`);
      if (!res.ok) throw new Error("Failed to fetch SLIs");
      return res.json();
    },
    enabled: !!user,
  });

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

    const sli = slis[0]; // Use the first SLI since that's the most recent one
    
    // Ensure an SLI is selected
    if (sli.selectedSliIndex === null) {
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
          feedback: feedback,
          selectedSliIndex: sli.selectedSliIndex
        }),
      });

      if (!res.ok) {
        const errorData = await res.json();
        throw new Error(errorData.message || "Failed to refine SLI");
      }

      const data = await res.json();
      
      // Invalidate queries to refresh data
      queryClient.invalidateQueries({ queryKey: ["/api/user/slis"] });
      
      toast({
        title: "Success",
        description: "Your SLI has been refined and saved",
      });
      
      // Navigate back to home page after successful update
      setTimeout(() => {
        scrollToTop();
        navigate("/");
      }, 1500);
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

  // Helper function to get the selected SLI statement
  const getSelectedSliStatement = (): string => {
    if (!slis || slis.length === 0 || slis[0].selectedSliIndex === null) {
      return "";
    }
    
    const sli = slis[0];
    const index = sli.selectedSliIndex;
    
    switch(index) {
      case 1:
        return sli.statement1;
      case 2:
        return sli.statement2;
      case 3:
        return sli.statement3;
      default:
        return "";
    }
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
        ) : slis && slis.length > 0 && slis[0].selectedSliIndex !== null ? (
          <div className="space-y-8">
            {/* Show different views based on whether the SLI has been refined already */}
            {slis[0].refinedSliText ? (
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
                            {slis[0].refinedSliText}
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
                            {slis[0].refinementRationale || "No rationale provided."}
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
                            {slis[0].implementationGuidance || "No implementation guidance provided."}
                          </div>
                        </ScrollArea>
                      </div>
                    </TabsContent>
                  </Tabs>
                </CardContent>
                <CardFooter className="flex justify-between border-t pt-6">
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
                    <p className="text-lg font-medium text-primary">
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
                    <Button
                      variant="outline"
                      onClick={() => {
                        scrollToTop();
                        navigate("/sli-selection");
                      }}
                    >
                      Back
                    </Button>
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
                          Refine My SLI
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