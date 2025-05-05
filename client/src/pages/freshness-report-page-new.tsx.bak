import React, { useState, useEffect, useRef } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/use-auth";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { FileText, Sparkles, CheckCircle2 } from "lucide-react";
import { apiRequest } from "@/lib/queryClient";
import { Progress } from "@/components/ui/progress";
import ReportDisplay from "@/components/freshness-report/report-display";
import ReportHistory, { FreshnessReportSummary } from "@/components/freshness-report/report-history";

interface FreshnessReportData {
  id: number;
  userId: number;
  questionnaireAnalysis: any;
  resumeAnalysis: any;
  linkedinAnalysis: any;
  additionalDocumentsAnalysis: any[];
  finalSynthesis: any;
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

  // State to track the currently selected report ID
  const [selectedReportId, setSelectedReportId] = useState<number | null>(null);

  // Fetch all reports for history list
  const {
    data: allReports,
    isLoading: isLoadingAllReports,
    refetch: refetchAllReports,
  } = useQuery<FreshnessReportData[]>({
    queryKey: ["/api/freshness-reports"],
    queryFn: async () => {
      try {
        const response = await apiRequest("GET", `/api/freshness-reports`);
        console.log("Raw reports from API:", response);
        
        if (!response) return [];
        if (!Array.isArray(response)) {
          console.error("Expected array of reports but got:", typeof response);
          return [];
        }
        
        // Map and parse each report's finalSynthesis if needed
        return response.map((reportData: any) => {
          // Ensure we have valid data with required fields
          if (!reportData || typeof reportData !== 'object' || !reportData.id) {
            console.warn("Skipping invalid report data:", reportData);
            return null;
          }
          
          // Special handling for finalSynthesis which might be a JSON string
          let finalSynthesis = reportData.finalSynthesis;
          
          // If finalSynthesis is a string, try to parse it as JSON
          if (typeof finalSynthesis === 'string') {
            try {
              finalSynthesis = JSON.parse(finalSynthesis);
            } catch (e) {
              console.error("Failed to parse finalSynthesis JSON string in report list:", e);
            }
          }
          
          return {
            id: reportData.id,
            userId: reportData.userId,
            questionnaireAnalysis: reportData.questionnaireAnalysis || null,
            resumeAnalysis: reportData.resumeAnalysis || null,
            linkedinAnalysis: reportData.linkedinAnalysis || null,
            additionalDocumentsAnalysis: reportData.additionalDocumentsAnalysis || [],
            finalSynthesis: finalSynthesis,
            createdAt: reportData.createdAt
          };
        }).filter(report => report !== null) as FreshnessReportData[];
      } catch (error) {
        console.error("Error fetching all reports:", error);
        return [];
      }
    },
    enabled: isAuthenticated,
    retry: 1,
    staleTime: 30000, // Consider data fresh for 30 seconds
    refetchOnWindowFocus: true,
  });
  
  // Fetch the latest report (initial load)
  const {
    data: latestReportData,
    isLoading: isLoadingLatestReport,
    isError,
    error,
  } = useQuery<FreshnessReportData | null>({
    queryKey: ["/api/freshness-reports/latest"],
    queryFn: async () => {
      try {
        const response = await apiRequest("GET", `/api/freshness-reports/latest`);
        if (!response) return null;
        console.log("Latest report data:", response);
        
        // Type-safe approach to handle the response
        const reportData = response as any;
        
        // Special handling for finalSynthesis which might be a JSON string
        let finalSynthesis = reportData.finalSynthesis;
        
        // If finalSynthesis is a string, try to parse it as JSON
        if (typeof finalSynthesis === 'string') {
          try {
            finalSynthesis = JSON.parse(finalSynthesis);
            console.log("Successfully parsed finalSynthesis from string in latest report:", finalSynthesis);
          } catch (e) {
            console.error("Failed to parse finalSynthesis JSON string in latest report:", e);
          }
        }
        
        return {
          id: reportData.id,
          userId: reportData.userId,
          questionnaireAnalysis: reportData.questionnaireAnalysis || null,
          resumeAnalysis: reportData.resumeAnalysis || null,
          linkedinAnalysis: reportData.linkedinAnalysis || null,
          additionalDocumentsAnalysis: reportData.additionalDocumentsAnalysis || [],
          finalSynthesis: finalSynthesis,
          createdAt: reportData.createdAt
        } as FreshnessReportData;
      } catch (error) {
        console.error("Error fetching latest report:", error);
        return null;
      }
    },
    enabled: isAuthenticated,
    retry: false,
    throwOnError: false,
  });
  
  // Set selected report ID when latest report data changes
  // This useEffect should always execute and not be conditionally skipped
  useEffect(() => {
    // If we have latest report data and no selected report ID
    if (latestReportData && !selectedReportId) {
      // Type assertion to safely access id
      const report = latestReportData as FreshnessReportData;
      console.log("Setting initial selectedReportId to latest report:", report.id);
      setSelectedReportId(report.id);
    }
  }, [latestReportData, selectedReportId]);
  
  // Fetch the specific report if one is selected (not the latest)
  const {
    data: selectedReportData,
    isLoading: isLoadingSelectedReport,
  } = useQuery<FreshnessReportData | null>({
    queryKey: ["/api/freshness-reports", selectedReportId],
    queryFn: async () => {
      try {
        if (!selectedReportId) return null;
        const response = await apiRequest("GET", `/api/freshness-reports/${selectedReportId}`);
        if (!response) return null;
        console.log("Selected report data:", response);
        
        // Type-safe approach to handle the response
        const reportData = response as any;
        
        // Special handling for finalSynthesis which might be a JSON string
        let finalSynthesis = reportData.finalSynthesis;
        
        // If finalSynthesis is a string, try to parse it as JSON
        if (typeof finalSynthesis === 'string') {
          try {
            finalSynthesis = JSON.parse(finalSynthesis);
            console.log("Successfully parsed finalSynthesis from string:", finalSynthesis);
          } catch (e) {
            console.error("Failed to parse finalSynthesis JSON string:", e);
          }
        }
        
        return {
          id: reportData.id,
          userId: reportData.userId,
          questionnaireAnalysis: reportData.questionnaireAnalysis || null,
          resumeAnalysis: reportData.resumeAnalysis || null,
          linkedinAnalysis: reportData.linkedinAnalysis || null,
          additionalDocumentsAnalysis: reportData.additionalDocumentsAnalysis || [],
          finalSynthesis: finalSynthesis,
          createdAt: reportData.createdAt
        } as FreshnessReportData;
      } catch (error) {
        console.error("Error fetching selected report:", error);
        return null;
      }
    },
    enabled: isAuthenticated && !!selectedReportId && latestReportData ? ((latestReportData as FreshnessReportData).id !== selectedReportId) : true,
    retry: false,
    throwOnError: false,
  });
  
  // Combine loading states
  const isLoading = isLoadingAllReports || isLoadingLatestReport || isLoadingSelectedReport;
  
  // Determine which report data to use - moved before hooks
  const reportData = React.useMemo(() => {
    return selectedReportId && selectedReportData 
      ? selectedReportData 
      : (selectedReportId && latestReportData && (latestReportData as FreshnessReportData).id === selectedReportId 
        ? latestReportData 
        : latestReportData);
  }, [selectedReportId, selectedReportData, latestReportData]);
  
  // Additional check to ensure reportData actually has finalSynthesis
  useEffect(() => {
    if (reportData && (!reportData.finalSynthesis || reportData.finalSynthesis === "null")) {
      console.log("Report data missing finalSynthesis, forcing refresh...");
      queryClient.invalidateQueries({
        queryKey: ["/api/freshness-reports/latest"],
        refetchType: 'all',
      });
      if (selectedReportId) {
        queryClient.invalidateQueries({
          queryKey: ["/api/freshness-reports", selectedReportId],
          refetchType: 'all',
        });
      }
    }
  }, [reportData, selectedReportId, queryClient]);

  // Mutation for generating a new report
  const generateReportMutation = useMutation<any, Error, void, unknown>({
    mutationFn: async () => {
      // API call to generate the report
      const response = await apiRequest("POST", "/api/freshness-reports");
      return response;
    },
    onSuccess: async (data) => {
      setIsGenerating(false);
      toast({
        title: "Success!",
        description: "Your professional brand assessment has been generated.",
      });
      
      // Force a complete cache refresh for these queries
      await queryClient.invalidateQueries({
        queryKey: ["/api/freshness-reports"],
        refetchType: 'all',
      });
      await queryClient.invalidateQueries({
        queryKey: ["/api/freshness-reports/latest"],
        refetchType: 'all',
      });
      
      // Directly fetch new data
      try {
        const response = await apiRequest("GET", `/api/freshness-reports/latest`);
        // Type check and conversion
        if (response && typeof response === 'object' && 'id' in response) {
          // Type assertion with proper conversion to ensure FreshnessReportData format
          const rawData = response as any;
          
          // Special handling for finalSynthesis which might be a JSON string
          let finalSynthesis = rawData.finalSynthesis;
          if (typeof finalSynthesis === 'string') {
            try {
              finalSynthesis = JSON.parse(finalSynthesis);
            } catch (e) {
              console.error("Failed to parse finalSynthesis JSON string:", e);
            }
          }
          
          const newReportData: FreshnessReportData = {
            id: rawData.id,
            userId: rawData.userId,
            questionnaireAnalysis: rawData.questionnaireAnalysis || null,
            resumeAnalysis: rawData.resumeAnalysis || null,
            linkedinAnalysis: rawData.linkedinAnalysis || null,
            additionalDocumentsAnalysis: rawData.additionalDocumentsAnalysis || [],
            finalSynthesis: finalSynthesis,
            createdAt: rawData.createdAt
          };
          
          setSelectedReportId(newReportData.id);
          
          // Manually update the query cache with the new data
          queryClient.setQueryData(["/api/freshness-reports/latest"], newReportData);
          
          // Update the specific report data too
          queryClient.setQueryData(["/api/freshness-reports", newReportData.id], newReportData);
          
          // Also refresh the report list to ensure it includes the new report
          refetchAllReports();
        }
      } catch (error) {
        console.error("Error fetching new report after generation:", error);
      }
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
  
  // Function to handle report selection from history
  const handleSelectReport = (reportId: number) => {
    setSelectedReportId(reportId);
  };
  
  // Convert reports to summary format for the history component - place this before any conditionals
  const reportSummaries = React.useMemo(() => {
    console.log("Building report summaries from:", allReports);
    
    if (!allReports || !Array.isArray(allReports) || allReports.length === 0) {
      // If we have the latest report but no report list, create a single item list
      if (reportData) {
        return [{
          id: reportData.id,
          createdAt: reportData.createdAt
        }];
      }
      return [];
    }
    
    // Sort reports by creation date, newest first
    return [...allReports]
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
      .map(report => ({
        id: report.id,
        createdAt: report.createdAt
      }));
  }, [allReports, reportData]);

  return (
    <div className="container px-4 py-8" style={{minWidth: '100%'}}>
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
                This may take 3 to 5 minutes.
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
        /* Two-column layout with report and history */
        <div className="flex flex-col lg:flex-row gap-6 w-full">
          {/* Column 1: Report Content (80%) */}
          <div className="w-full lg:w-4/5">
            <ReportDisplay report={report} userName={user?.firstName} />
          </div>
          
          {/* Column 2: Report History (20%) */}
          <div className="w-full lg:w-1/5">
            <ReportHistory 
              reports={reportSummaries} 
              currentReportId={report.id} 
              onSelectReport={handleSelectReport}
            />
          </div>
        </div>
      )}
    </div>
  );
};

export default FreshnessReportPage;
