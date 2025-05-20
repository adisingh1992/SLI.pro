import React, { useState, useEffect, useRef } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/hooks/use-auth";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { useToast } from "@/hooks/use-toast";
import { FileText, CheckCircle2, Sparkles } from "lucide-react";
import { apiRequest } from "@/lib/queryClient";
import ReportDisplay from "@/components/freshness-report/report-display";
import ReportHistory from "@/components/freshness-report/report-history";
import NavBar from "@/components/nav-bar";

// Interface to define the structure of Freshness Report data
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

// Report history item summary
interface ReportSummaryItem {
  id: number;
  createdAt: string;
}

/**
 * Complete rewrite of FreshnessReportPage to fix React hooks errors
 * Main approach:
 * 1. Declare all hooks at the top level
 * 2. Separate data fetching and transformations
 * 3. Use consistent conditional rendering
 * 4. Use React.memo for expensive calculations
 */
const FreshnessReportPage: React.FC = () => {
  // Core state and hooks
  const { user, isLoading: authLoading } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  
  // Use user object presence to determine authentication status
  const isAuthenticated = !!user;
  
  // UI state
  const [isGenerating, setIsGenerating] = useState(false);
  const [progress, setProgress] = useState(0);
  const [selectedReportId, setSelectedReportId] = useState<number | null>(null);
  
  // Progress animation reference
  const progressInterval = useRef<NodeJS.Timeout | null>(null);
  
  // QUERY 1: Fetch all reports for the history list
  const {
    data: allReportsRaw,
    isLoading: isLoadingAllReports,
    refetch: refetchAllReports,
  } = useQuery({
    queryKey: ["/api/freshness-reports"],
    queryFn: async () => {
      try {
        const response = await (await apiRequest("GET", `/api/freshness-reports`)).json();
        console.log("All reports API response:", response);
        return response; // apiRequest already handles JSON parsing
      } catch (error) {
        console.error("Error fetching all reports:", error);
        return [];
      }
    },
    enabled: isAuthenticated,
    retry: 1,
    staleTime: Infinity, // Prevent automatic refetching
    refetchOnWindowFocus: false, // Prevent refetch on window focus
    refetchInterval: false, // Disable polling
  });
  
  // QUERY 2: Fetch the latest report (initial load)
  const {
    data: latestReportRaw,
    isLoading: isLoadingLatestReport,
  } = useQuery({
    queryKey: ["/api/freshness-reports/latest"],
    queryFn: async () => {
      try {
        const response = await (await apiRequest("GET", `/api/freshness-reports/latest`)).json();
        console.log("Latest report API response:", response);
        return response;
      } catch (error) {
        console.error("Error fetching latest report:", error);
        return null;
      }
    },
    staleTime: Infinity, // Prevent automatic refetching
    refetchOnWindowFocus: false, // Prevent refetch on window focus
    refetchInterval: false // Disable polling
  });
  
  // QUERY 3: Fetch a specific report if one is selected
  const {
    data: selectedReportRaw,
    isLoading: isLoadingSelectedReport,
  } = useQuery({
    queryKey: ["/api/freshness-reports", selectedReportId],
    queryFn: async () => {
      try {
        if (!selectedReportId) return null;
        const response = await (await apiRequest("GET", `/api/freshness-reports/${selectedReportId}`)).json();
        console.log("Selected report API response:", response);
        return response;
      } catch (error) {
        console.error("Error fetching selected report:", error);
        return null;
      }
    },
    enabled: isAuthenticated && !!selectedReportId,
    retry: 1,
    staleTime: Infinity, // Prevent automatic refetching
    refetchOnWindowFocus: false, // Prevent refetch on window focus
    refetchInterval: false, // Disable polling
  });
  
  // Process the raw data from the API responses to parse JSON strings
  const processReportData = (rawData: any): FreshnessReportData | null => {
    if (!rawData) return null;
    
    try {
      console.log("Processing raw report data:", rawData);
      
      // Helper function to parse JSON fields
      const parseJsonField = (field: any) => {
        if (typeof field === 'string') {
          try {
            return JSON.parse(field);
          } catch (e) {
            console.error(`Failed to parse JSON string for field:`, e);
            return null;
          }
        }
        return field || null;
      };
      
      // Parse all potential JSON fields
      const finalSynthesis = parseJsonField(rawData.finalSynthesis);
      const questionnaireAnalysis = parseJsonField(rawData.questionnaireAnalysis);
      const resumeAnalysis = parseJsonField(rawData.resumeAnalysis);
      const linkedinAnalysis = parseJsonField(rawData.linkedinAnalysis);
      
      // Handle array field
      let additionalDocsAnalysis = rawData.additionalDocumentsAnalysis || [];
      if (typeof additionalDocsAnalysis === 'string') {
        try {
          additionalDocsAnalysis = JSON.parse(additionalDocsAnalysis);
        } catch (e) {
          console.error("Failed to parse additionalDocumentsAnalysis JSON string:", e);
          additionalDocsAnalysis = [];
        }
      }
      
      const result = {
        id: rawData.id,
        userId: rawData.userId,
        questionnaireAnalysis: questionnaireAnalysis,
        resumeAnalysis: resumeAnalysis,
        linkedinAnalysis: linkedinAnalysis,
        additionalDocumentsAnalysis: additionalDocsAnalysis,
        finalSynthesis: finalSynthesis,
        createdAt: rawData.createdAt
      };
      
      console.log("Processed report data:", result);
      return result;
    } catch (error) {
      console.error("Error processing report data:", error);
      return null;
    }
  };
  
  // Process multiple reports (for history list)
  const processReportList = (rawList: any): FreshnessReportData[] => {
    console.log("HISTORY DEBUG - Processing raw list of reports:", rawList);
    
    if (!rawList || !Array.isArray(rawList)) {
      console.log("HISTORY DEBUG - rawList is not an array:", typeof rawList);
      return [];
    }
    
    console.log("HISTORY DEBUG - rawList.length:", rawList.length);
    
    const processedReports = rawList
      .map((item) => {
        console.log("HISTORY DEBUG - Processing report item:", item.id);
        return processReportData(item);
      })
      .filter((item): item is FreshnessReportData => {
        const isValid = item !== null;
        if (!isValid) {
          console.log("HISTORY DEBUG - Filtered out null report");
        }
        return isValid;
      });
    
    console.log("HISTORY DEBUG - Processed reports count:", processedReports.length);
    return processedReports;
  };
  
  // Derived data: Processed reports
  const allReports = processReportList(allReportsRaw);
  const latestReport = processReportData(latestReportRaw);
  const selectedReport = processReportData(selectedReportRaw);
  
  // Initialize selectedReportId with latest report ONLY on first load
  // We track whether we've already selected a report with a ref to prevent auto-selection
  const initialSelectionMade = useRef(false);
  
  useEffect(() => {
    if (latestReport) {
      if (!selectedReportId && !initialSelectionMade.current) {
        // First load only - set to latest and mark selection as done
        console.log("Setting initial selectedReportId to latest report:", latestReport.id);
        setSelectedReportId(latestReport.id);
        initialSelectionMade.current = true;
      } else if (selectedReportId !== null && latestReport.id > selectedReportId && !initialSelectionMade.current) {
        // Only update to newer report if we haven't manually selected a report yet
        console.log("Updating to newer report:", latestReport.id);
        setSelectedReportId(latestReport.id);
      }
    }
  }, [latestReport, selectedReportId]);
  
  // Progress animation for report generation
  useEffect(() => {
    if (isGenerating) {
      setProgress(0);
      
      progressInterval.current = setInterval(() => {
        setProgress((prevProgress) => {
          // Increment progress but cap at 95% until we get confirmation of success
          const newProgress = prevProgress + (0.5 + Math.random());
          return newProgress < 95 ? newProgress : 95;
        });
      }, 500);
    } else if (progressInterval.current) {
      clearInterval(progressInterval.current);
      progressInterval.current = null;
    }
    
    // Clean up interval on component unmount
    return () => {
      if (progressInterval.current) {
        clearInterval(progressInterval.current);
      }
    };
  }, [isGenerating]);
  
  // Complete progress animation on successful report generation
  useEffect(() => {
    if (progress >= 95 && !isGenerating) {
      setProgress(100);
    }
  }, [progress, isGenerating]);
  
  // Additional check to ensure reportData actually has finalSynthesis - but only run once on mount
  // We use a ref to make sure this only runs once to prevent continuous polling
  const hasCheckedFinalSynthesis = useRef(false);
  
  useEffect(() => {
    // Skip if we've already checked once
    if (hasCheckedFinalSynthesis.current) return;
    
    const currentReport = selectedReport || latestReport;
    
    // Only proceed if we have a report and we haven't checked before
    if (currentReport && !hasCheckedFinalSynthesis.current) {
      console.log("First report check, checking for finalSynthesis data");
      
      // Mark that we've checked regardless of outcome
      hasCheckedFinalSynthesis.current = true;
      
      // Only refresh if missing finalSynthesis data
      if (!currentReport.finalSynthesis || currentReport.finalSynthesis === "null") {
        console.log("Report data missing finalSynthesis, forcing ONE refresh...");
        
        // Only do one single refresh, no continuous polling
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
    }
  }, [selectedReport, latestReport, selectedReportId, queryClient]);
  
  // Determine which report to display (selected or latest)
  const currentReport = React.useMemo(() => {
    console.log("REPORT DEBUG - selectedReport:", selectedReport);
    console.log("REPORT DEBUG - latestReport:", latestReport);
    console.log("REPORT DEBUG - selectedReportId:", selectedReportId);
    console.log("REPORT DEBUG - latestReportRaw:", latestReportRaw);
    console.log("REPORT DEBUG - selectedReportRaw:", selectedReportRaw);
    
    if (selectedReport) {
      console.log("REPORT DEBUG - Using selectedReport");
      return selectedReport;
    }
    
    if (latestReport) {
      console.log("REPORT DEBUG - Using latestReport");
      return latestReport;
    }
    
    console.log("REPORT DEBUG - No report available");
    return null;
  }, [selectedReport, latestReport, selectedReportId, latestReportRaw, selectedReportRaw]);
  
  // Create summary list for report history
  const reportSummaries: ReportSummaryItem[] = React.useMemo(() => {
    console.log("Creating report summaries with allReports:", allReports);
    
    // First try to use allReports
    if (allReports && allReports.length > 0) {
      return [...allReports]
        .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
        .map(report => {
          console.log("Processing report for history:", report.id, "createdAt:", report.createdAt, "type:", typeof report.createdAt);
          return {
            id: report.id,
            createdAt: report.createdAt
          };
        });
    }
    
    // Fallback to using the current report to ensure we at least have something in history
    if (currentReport) {
      console.log("Using currentReport for history:", currentReport.id, "createdAt:", currentReport.createdAt);
      return [{
        id: currentReport.id,
        createdAt: currentReport.createdAt
      }];
    }
    
    return [];
  }, [allReports, currentReport]);
  
  // Mutation for generating a new report
  const generateReportMutation = useMutation({
    mutationFn: async () => {
      return await apiRequest("POST", "/api/freshness-reports") as any;
    },
    onSuccess: async (data) => {
      console.log("Report generation successful:", data);
      setIsGenerating(false);
      toast({
        title: "Success!",
        description: "Your professional brand assessment has been generated.",
      });
      
      // Force refresh both queries but with aggressive settings to prevent background polling
      try {
        // Explicitly invalidate and force reload these specific queries
        await queryClient.refetchQueries({
          queryKey: ["/api/freshness-reports/latest"],
          exact: true, 
          type: 'active'
        });
        
        await queryClient.refetchQueries({
          queryKey: ["/api/freshness-reports"],
          exact: true,
          type: 'active'
        });
        
        // Get the latest report ID and set it as selected
        const response = await apiRequest("GET", `/api/freshness-reports/latest`);
        if (response && typeof response === 'object' && 'id' in response) {
          const reportId = Number(response.id);
          console.log("Setting selectedReportId to new report:", reportId);
          
          // When we generate a new report, we always want to show it
          setSelectedReportId(reportId);
          
          // Reset the initialSelectionMade to false so we can see newly generated reports
          // This is the only case where we want to override the user's previous selection
          initialSelectionMade.current = false;
        }
      } catch (error) {
        console.error("Error fetching new report after generation:", error);
      }
    },
    onError: (err: any) => {
      setIsGenerating(false);
      const errorMessage = err.response?.data?.error || err.message || "Failed to generate report";
      toast({
        title: "Error generating report",
        description: errorMessage,
        variant: "destructive",
      });
    },
  });
  
  // Handler for generating a new report
  const handleGenerateReport = () => {
    setIsGenerating(true);
    setTimeout(() => {
      generateReportMutation.mutate();
    }, 50);
  };
  
  // Handler for selecting a report from history
  const handleSelectReport = (reportId: number) => {
    setSelectedReportId(reportId);
    // When user manually selects a report, mark that this is a user selection
    initialSelectionMade.current = true;
  };
  
  // Utility function to format dates
  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleDateString("en-US", {
      year: "numeric",
      month: "long",
      day: "numeric",
    });
  };
  
  // Check if any of our queries are still loading
  const isLoading = isLoadingAllReports || isLoadingLatestReport || isLoadingSelectedReport;
  
  // Empty state component
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
  
  // RENDER LOADING STATE
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
  
  // RENDER NO REPORT STATE
  if (!currentReport) {
    return (
      <div className="px-4 py-8">
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
  
  // RENDER MAIN CONTENT
  return (
    <div className="container px-4 py-8" style={{minWidth: '100%'}}>
      {/* Header with title and generate button */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold">Freshness Report</h1>
          <p className="text-muted-foreground">
            Generated on {formatDate(currentReport.createdAt)}
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

      {/* Main content - either generating progress or report with history */}
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
            <ReportDisplay report={currentReport} userName={user?.firstName} />
          </div>
          
          {/* Column 2: Report History (20%) */}
          <div className="w-full lg:w-1/5">
            <ReportHistory 
              reports={reportSummaries} 
              currentReportId={currentReport.id} 
              onSelectReport={handleSelectReport}
            />
          </div>
        </div>
      )}
    </div>
  );
};

export default FreshnessReportPage;