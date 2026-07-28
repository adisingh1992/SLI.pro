import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { ChevronLeft, Linkedin, ArrowRight, Loader2, CheckCircle, AlertCircle, FileCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import NavBar from "@/components/nav-bar";
import type { SliRecord } from "@/lib/sli";

export default function LinkedinOptimizationGeneratePage() {
  const [_, navigate] = useLocation();
  const queryClient = useQueryClient();
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Fetch user profile to check for required documents
  const { data: userProfile, isLoading: isProfileLoading } = useQuery({
    queryKey: ["/api/user/profile"],
  });

  // Fetch user's SLI
  // Returns the single SLI in force (or 404 when none selected yet).
  const { data: sli, isLoading: isSliLoading } = useQuery<SliRecord | null>({
    queryKey: ["/api/user/sli"],
  });

  // Fetch latest freshness report
  const { data: freshnessReport, isLoading: isFreshnessReportLoading } = useQuery({
    queryKey: ["/api/freshness-reports/latest"],
  });

  // Mutation for generating LinkedIn optimization
  const generateMutation = useMutation({
    mutationFn: async () => {
      const response = await fetch("/api/linkedin-optimizations/generate", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        credentials: "include"
      });
      
      if (!response.ok) {
        const errorText = await response.text();
        let errorMessage = `API request failed with status ${response.status}`;
        
        try {
          const errorData = JSON.parse(errorText);
          if (errorData.error) {
            errorMessage = errorData.error;
          }
        } catch (e) {
          console.error("Error parsing error response:", e);
        }
        
        throw new Error(errorMessage);
      }
      
      const responseText = await response.text();
      console.log("Raw API response:", responseText);
      
      if (!responseText) {
        throw new Error("Empty response from server");
      }
      
      try {
        return JSON.parse(responseText);
      } catch (e) {
        console.error("Error parsing JSON response:", e);
        throw new Error("Failed to parse response from server");
      }
    },
    onSuccess: (data: any) => {
      console.log("LinkedIn optimization generated successfully:", data);
      queryClient.invalidateQueries({ queryKey: ["/api/linkedin-optimizations/latest"] });
      
      if (data && data.id) {
        console.log("Generated LinkedIn optimization with ID:", data.id);
        queryClient.invalidateQueries({ queryKey: [`/api/linkedin-optimizations/${data.id}`] });
        navigate(`/linkedin-optimization/${data.id}`);
      } else {
        console.error("LinkedIn optimization response is missing ID:", data);
        setError("Response missing ID. Please try again.");
        setGenerating(false);
      }
    },
    onError: (error: any) => {
      console.error("LinkedIn optimization generation error:", error);
      setError(error.message || "Failed to generate LinkedIn optimization");
      setGenerating(false);
    },
    onSettled: () => {
      // Ensure generating state is cleared in all cases
      if (generating) {
        setGenerating(false);
      }
    }
  });

  // Check if user has the required documents (resume and LinkedIn)
  const resumeDoc = userProfile?.documents?.find((doc: any) => doc.type === "resume");
  const linkedinDoc = userProfile?.documents?.find((doc: any) => doc.type === "linkedin");
  const hasRequiredDocuments = !!resumeDoc && !!linkedinDoc;

  // Check if user has a selected SLI
  const hasSli = !!sli;

  // Check if user has a freshness report
  const hasFreshnessReport = !!freshnessReport;

  // All requirements met
  const canGenerate = hasRequiredDocuments && hasSli && hasFreshnessReport;

  // Handle generation
  const handleGenerate = () => {
    if (!canGenerate) return;
    setGenerating(true);
    setError(null);
    generateMutation.mutate();
  };

  // Loading state
  if (isProfileLoading || isSliLoading || isFreshnessReportLoading) {
    return (
      <div className="min-h-screen bg-background flex flex-col">
        <NavBar />
        <div className="flex-1 flex items-center justify-center">
          <div className="text-center">
            <Loader2 className="h-10 w-10 animate-spin text-primary mx-auto mb-4" />
            <p className="text-muted-foreground">Loading...</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background flex flex-col">
      <NavBar />
      <main className="flex-1 container max-w-5xl mx-auto px-4 py-8">
        <Button
          variant="ghost"
          className="mb-6 flex items-center text-muted-foreground"
          onClick={() => navigate("/")}
        >
          <ChevronLeft className="mr-2 h-4 w-4" />
          Back to Home
        </Button>

        <Card className="mb-8">
          <CardHeader className="bg-primary/5 border-b border-primary/20">
            <div className="flex items-center">
              <Linkedin className="mr-2 h-5 w-5 text-primary" />
              <CardTitle className="text-xl">Generate LinkedIn Optimization</CardTitle>
            </div>
            <CardDescription>
              Create AI-powered recommendations to enhance your LinkedIn profile and align it with your SLI
            </CardDescription>
          </CardHeader>
          <CardContent className="p-6">
            <div className="space-y-6">
              <div className="bg-card p-5 rounded-lg border">
                <h2 className="text-lg font-medium mb-4">Requirements</h2>
                <div className="space-y-3">
                  <div className="flex items-start">
                    {hasRequiredDocuments ? (
                      <CheckCircle className="h-5 w-5 text-green-500 mt-0.5 mr-2 flex-shrink-0" />
                    ) : (
                      <AlertCircle className="h-5 w-5 text-amber-500 mt-0.5 mr-2 flex-shrink-0" />
                    )}
                    <div>
                      <h3 className="font-medium">Resume & LinkedIn Profile Documents</h3>
                      <p className="text-sm text-muted-foreground">
                        {hasRequiredDocuments
                          ? "You have uploaded both your resume and LinkedIn profile"
                          : "You need to upload both your resume and LinkedIn profile"}
                      </p>
                      {!hasRequiredDocuments && (
                        <Button
                          variant="link"
                          className="text-sm p-0 h-auto mt-1"
                          onClick={() => navigate("/documents")}
                        >
                          Go to Documents
                          <ArrowRight className="ml-1 h-3 w-3" />
                        </Button>
                      )}
                    </div>
                  </div>

                  <div className="flex items-start">
                    {hasSli ? (
                      <CheckCircle className="h-5 w-5 text-green-500 mt-0.5 mr-2 flex-shrink-0" />
                    ) : (
                      <AlertCircle className="h-5 w-5 text-amber-500 mt-0.5 mr-2 flex-shrink-0" />
                    )}
                    <div>
                      <h3 className="font-medium">Single Lasting Impression (SLI)</h3>
                      <p className="text-sm text-muted-foreground">
                        {hasSli
                          ? `You have selected or refined an SLI: "${
                              sli?.statement
                            }"`
                          : "You need to select an SLI statement"}
                      </p>
                      {!hasSli && (
                        <Button
                          variant="link"
                          className="text-sm p-0 h-auto mt-1"
                          onClick={() => navigate("/sli")}
                        >
                          Go to SLI
                          <ArrowRight className="ml-1 h-3 w-3" />
                        </Button>
                      )}
                    </div>
                  </div>

                  <div className="flex items-start">
                    {hasFreshnessReport ? (
                      <CheckCircle className="h-5 w-5 text-green-500 mt-0.5 mr-2 flex-shrink-0" />
                    ) : (
                      <AlertCircle className="h-5 w-5 text-amber-500 mt-0.5 mr-2 flex-shrink-0" />
                    )}
                    <div>
                      <h3 className="font-medium">Brand Freshness Report</h3>
                      <p className="text-sm text-muted-foreground">
                        {hasFreshnessReport
                          ? "You have a brand freshness report"
                          : "You need to generate a brand freshness report"}
                      </p>
                      {!hasFreshnessReport && (
                        <Button
                          variant="link"
                          className="text-sm p-0 h-auto mt-1"
                          onClick={() => navigate("/freshness-report")}
                        >
                          Go to Freshness Report
                          <ArrowRight className="ml-1 h-3 w-3" />
                        </Button>
                      )}
                    </div>
                  </div>
                </div>
              </div>

              {error && (
                <Alert variant="destructive">
                  <AlertCircle className="h-4 w-4" />
                  <AlertTitle>Error</AlertTitle>
                  <AlertDescription>{error}</AlertDescription>
                </Alert>
              )}

              {canGenerate && (
                <div className="bg-primary/5 p-5 rounded-lg border border-primary/20">
                  <h3 className="font-medium text-primary-foreground mb-2">Ready to Generate</h3>
                  <p className="text-muted-foreground text-sm mb-4">
                    Our AI will analyze your uploaded documents, SLI, and freshness report to create tailored
                    recommendations for optimizing your LinkedIn profile.
                  </p>
                  <p className="text-muted-foreground text-sm mb-4">
                    This process may take up to 2 minutes as our AI carefully crafts personalized guidance for maximum
                    professional impact.
                  </p>
                </div>
              )}
            </div>
          </CardContent>
          <CardFooter className="flex justify-between border-t p-6 bg-muted/50">
            <Button variant="outline" onClick={() => navigate("/")}>
              Cancel
            </Button>
            <Button
              onClick={handleGenerate}
              disabled={!canGenerate || generating}
              className="flex items-center"
            >
              {generating ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Generating...
                </>
              ) : (
                <>
                  <FileCheck className="mr-2 h-4 w-4" />
                  Generate Optimization
                </>
              )}
            </Button>
          </CardFooter>
        </Card>
      </main>
    </div>
  );
}