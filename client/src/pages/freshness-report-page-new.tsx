import React, { useState, useEffect, useRef } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/use-auth";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { AlertCircle, FileText, Sparkles, CheckCircle2 } from "lucide-react";
import { apiRequest } from "@/lib/queryClient";
import { Progress } from "@/components/ui/progress";
import ReportDisplay from "@/components/freshness-report/report-display";

interface FreshnessReportData {
  id: number;
  userId: number;
  questionnaireAnalysis: any;
  resumeAnalysis: any;
  linkedinAnalysis: any;
  additionalDocumentsAnalysis: any[];
  finalSynthesis: {
    brandAudit: {
      currentBrandStrength: string;
      coreStrengths: string[];
      criticalGaps: string[];
      brandConsistency: string;
      marketRelevance: string;
    };
    personalBrandStrategy: {
      uniqueValueProposition: string;
      coreNarrative: string;
      recommendedPositioning: string;
      targetAudience: string[];
      keyDifferentiators: string[];
    };
    contentRecommendations: {
      resumeImprovements: string[];
      linkedInEnhancements: string[];
      thoughtLeadershipTopics: string[];
      contentFormatPreferences: string[];
    };
    digitalPresenceStrategy: {
      platformPriorities: string[];
      engagementTactics: string[];
      networkingApproach: string;
      contentCalendarFramework: string;
    };
    implementationRoadmap: {
      immediateNextSteps: string[];
      "30DayMilestones": string[];
      "90DayMilestones": string[];
      successMetrics: string[];
    };
    competitiveAnalysis: {
      marketPositioning: string;
      industryTrendAlignment: string;
      distinctionOpportunities: string;
      threatAssessment: string;
    };
    detailedMetrics?: {
      profileContentQuality: {
        grade: string;
        explanation: string;
      };
    };
  };
  createdAt: string;
}

const FreshnessReportPage = () => {
  const { user } = useAuth();
  const isAuthenticated = !!user;
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [isGenerating, setIsGenerating] = useState(false);
  const [progress, setProgress] = useState(0);
  const progressIntervalRef = useRef<NodeJS.Timeout | null>(null);

  // Function to start progress animation
  const startProgressAnimation = () => {
    console.log("Starting progress animation");

    // Reset progress to 0
    setProgress(0);

    // Clear any existing interval first to avoid multiple animations
    if (progressIntervalRef.current) {
      clearInterval(progressIntervalRef.current);
      progressIntervalRef.current = null;
    }

    // Start a new progress animation
    progressIntervalRef.current = setInterval(() => {
      setProgress((prevProgress) => {
        // Slowly increase to 90%, then wait for completion
        if (prevProgress >= 90) {
          if (progressIntervalRef.current) {
            clearInterval(progressIntervalRef.current);
            progressIntervalRef.current = null;
          }
          return 90;
        }
        return prevProgress + Math.random() * 3;
      });
    }, 800);
  };

  // Function to complete progress animation
  const completeProgressAnimation = () => {
    console.log("Completing progress animation");

    // Clear the interval
    if (progressIntervalRef.current) {
      clearInterval(progressIntervalRef.current);
      progressIntervalRef.current = null;
    }

    // Set progress to 100%
    setProgress(100);
  };

  // Clean up on component unmount
  useEffect(() => {
    return () => {
      if (progressIntervalRef.current) {
        clearInterval(progressIntervalRef.current);
      }
    };
  }, []);

  // Watch for changes to isGenerating state
  useEffect(() => {
    console.log("isGenerating changed:", isGenerating);

    if (isGenerating) {
      startProgressAnimation();
    } else if (progress > 0) {
      completeProgressAnimation();
    }
  }, [isGenerating]);

  // Fetch the latest report
  const {
    data: reportData,
    isLoading,
    isError,
    error,
  } = useQuery({
    queryKey: ["/api/freshness-reports/latest"],
    enabled: isAuthenticated,
    retry: false,
    throwOnError: false,
  });

  // Mutation for generating a new report
  const generateReportMutation = useMutation({
    mutationFn: async () => {
      // API call to generate the report
      const response = await apiRequest("POST", "/api/freshness-reports");
      return response;
    },
    onSuccess: (data) => {
      // Update the query cache with the latest report
      queryClient.invalidateQueries({
        queryKey: ["/api/freshness-reports/latest"],
      });
      toast({
        title: "Success!",
        description: "Your professional brand assessment has been generated.",
      });
      setIsGenerating(false);
    },
    onError: (err: any) => {
      setIsGenerating(false);
      const errorMessage =
        err.response?.data?.error || err.message || "Failed to generate report";

      toast({
        title: "Error generating report",
        description: errorMessage,
        variant: "destructive",
      });
    },
  });

  const handleGenerateReport = () => {
    // Set generating state first to trigger UI update
    setIsGenerating(true);

    // Short timeout to ensure state has propagated to UI
    setTimeout(() => {
      generateReportMutation.mutate();
    }, 50);
  };

  // Format the date
  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleDateString("en-US", {
      year: "numeric",
      month: "long",
      day: "numeric",
    });
  };

  // Content for when no report exists
  const NoReportContent = () => (
    <div className="flex flex-col items-center justify-center py-12 text-center">
      {isGenerating ? (
        <div className="w-full max-w-md">
          <div className="flex items-center justify-center mb-4">
            <div className="relative flex items-center justify-center w-16 h-16 rounded-full bg-primary/10">
              <Sparkles className="h-8 w-8 text-primary animate-pulse" />
            </div>
          </div>
          <h3 className="text-xl font-medium mb-2">Generating Your Report</h3>
          <p className="text-muted-foreground mb-6">
            Please wait while our AI analyzes your professional profile. This
            may take a minute or two.
          </p>
          <div className="space-y-2 w-full">
            <div className="flex justify-between text-sm text-muted-foreground">
              <span>Progress</span>
              <span>{Math.round(progress)}%</span>
            </div>
            <Progress value={progress} className="h-2 w-full" />
          </div>
          <div className="mt-6 space-y-3">
            <div className="flex items-start gap-2 text-sm text-muted-foreground text-left">
              <CheckCircle2
                className={`h-4 w-4 mt-0.5 ${progress > 25 ? "text-green-500" : "text-muted"}`}
              />
              <span>Analyzing your questionnaire data...</span>
            </div>
            <div className="flex items-start gap-2 text-sm text-muted-foreground text-left">
              <CheckCircle2
                className={`h-4 w-4 mt-0.5 ${progress > 45 ? "text-green-500" : "text-muted"}`}
              />
              <span>Processing resume information...</span>
            </div>
            <div className="flex items-start gap-2 text-sm text-muted-foreground text-left">
              <CheckCircle2
                className={`h-4 w-4 mt-0.5 ${progress > 65 ? "text-green-500" : "text-muted"}`}
              />
              <span>Reviewing LinkedIn profile...</span>
            </div>
            <div className="flex items-start gap-2 text-sm text-muted-foreground text-left">
              <CheckCircle2
                className={`h-4 w-4 mt-0.5 ${progress > 85 ? "text-green-500" : "text-muted"}`}
              />
              <span>Generating brand recommendations...</span>
            </div>
          </div>
        </div>
      ) : (
        <>
          <FileText className="h-16 w-16 text-muted-foreground mb-4" />
          <h3 className="text-xl font-medium mb-2">No Brand Assessment Yet</h3>
          <p className="text-muted-foreground max-w-md mb-6">
            Generate your first professional brand assessment to get
            comprehensive insights into your brand positioning.
          </p>
          <Button
            onClick={handleGenerateReport}
            disabled={isGenerating}
            className="flex items-center"
          >
            <Sparkles className="mr-2 h-4 w-4" />
            Generate Assessment
          </Button>
        </>
      )}
    </div>
  );

  // Loading state
  if (isLoading) {
    return (
      <div className="container px-4 py-8">
        <div className="space-y-4">
          <Skeleton className="h-12 w-[250px]" />
          <Skeleton className="h-6 w-full max-w-[600px]" />
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mt-8">
            <Skeleton className="h-[300px] w-full" />
            <Skeleton className="h-[300px] w-full" />
          </div>
        </div>
      </div>
    );
  }

  // Error state
  // if (isError && error) {
  //   return (
  //     <div className="container px-4 py-8">
  //       <Alert variant="destructive" className="mb-6">
  //         <AlertCircle className="h-4 w-4" />
  //         <AlertTitle>Error</AlertTitle>
  //         <AlertDescription>
  //           {(error as any).message || "Failed to load report data"}
  //         </AlertDescription>
  //       </Alert>
  //       <Button onClick={handleGenerateReport} disabled={isGenerating}>
  //         {isGenerating ? "Generating Report..." : "Generate New Report"}
  //       </Button>
  //     </div>
  //   );
  // }

  // If report doesn't exist yet
  if (!reportData) {
    return (
      <div className="container px-4 py-8">
        <h1 className="text-2xl font-bold mb-4">Freshness Report</h1>
        <p className="text-muted-foreground mb-8">
          Get a comprehensive analysis of your professional brand presence and
          positioning
        </p>
        <Card>
          <CardContent className="pt-6">
            <NoReportContent />
          </CardContent>
        </Card>
      </div>
    );
  }

  // Main content with report data
  const report = reportData as FreshnessReportData;

  return (
    <div className="container px-4 py-8">
      <div className="flex flex-col md:flex-row md:items-center md:justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold">Freshness Report</h1>
          <p className="text-muted-foreground">
            Generated on {formatDate(report.createdAt)}
          </p>
        </div>
        {isGenerating ? (
          <div className="mt-4 md:mt-0 space-y-2 min-w-[250px]">
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">
                Generating new report...
              </span>
              <span className="text-muted-foreground">
                {Math.round(progress)}%
              </span>
            </div>
            <Progress value={progress} className="h-2" />
          </div>
        ) : (
          <Button
            onClick={handleGenerateReport}
            disabled={isGenerating}
            variant="outline"
            className="mt-4 md:mt-0"
          >
            Generate New Report
          </Button>
        )}
      </div>

      {isGenerating ? (
        <Card className="mb-8 p-8">
          <div className="flex flex-col items-center justify-center py-8 text-center">
            <div className="w-full max-w-md">
              <div className="flex items-center justify-center mb-4">
                <div className="relative flex items-center justify-center w-16 h-16 rounded-full bg-primary/10">
                  <Sparkles className="h-8 w-8 text-primary animate-pulse" />
                </div>
              </div>
              <h3 className="text-xl font-medium mb-2">
                Generating Your Report
              </h3>
              <p className="text-muted-foreground mb-6">
                Please wait while our AI analyzes your professional profile.
                This may take a minute or two.
              </p>
              <div className="mt-6 space-y-3">
                <div className="flex items-start gap-2 text-sm text-muted-foreground text-left">
                  <CheckCircle2
                    className={`h-4 w-4 mt-0.5 ${progress > 25 ? "text-green-500" : "text-muted"}`}
                  />
                  <span>Analyzing your questionnaire data...</span>
                </div>
                <div className="flex items-start gap-2 text-sm text-muted-foreground text-left">
                  <CheckCircle2
                    className={`h-4 w-4 mt-0.5 ${progress > 45 ? "text-green-500" : "text-muted"}`}
                  />
                  <span>Processing resume information...</span>
                </div>
                <div className="flex items-start gap-2 text-sm text-muted-foreground text-left">
                  <CheckCircle2
                    className={`h-4 w-4 mt-0.5 ${progress > 65 ? "text-green-500" : "text-muted"}`}
                  />
                  <span>Reviewing LinkedIn profile...</span>
                </div>
                <div className="flex items-start gap-2 text-sm text-muted-foreground text-left">
                  <CheckCircle2
                    className={`h-4 w-4 mt-0.5 ${progress > 85 ? "text-green-500" : "text-muted"}`}
                  />
                  <span>Generating brand recommendations...</span>
                </div>
              </div>
            </div>
          </div>
        </Card>
      ) : (
        /* Full Report Content */
        <ReportDisplay report={report} userName={user?.firstName} />
      )}
    </div>
  );
};

export default FreshnessReportPage;
