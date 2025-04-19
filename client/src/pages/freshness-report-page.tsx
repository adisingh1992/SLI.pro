import React, { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/use-auth";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { AlertCircle, FileText, Sparkles } from "lucide-react";
import { apiRequest } from "@/lib/queryClient";
import ReportDisplay from "@/components/freshness-report/report-display";

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

  // Fetch the latest report
  const { data: reportData, isLoading, isError, error } = useQuery({
    queryKey: ["/api/freshness-reports/latest"],
    enabled: isAuthenticated,
    retry: false,
    throwOnError: false,
  });

  // Mutation for generating a new report
  const generateReportMutation = useMutation({
    mutationFn: async () => {
      setIsGenerating(true);
      const response = await apiRequest("POST", "/api/freshness-reports");
      return response;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["/api/freshness-reports/latest"] });
      toast({
        title: "Success!",
        description: "Your professional brand assessment has been generated.",
      });
      setIsGenerating(false);
    },
    onError: (err: any) => {
      setIsGenerating(false);
      const errorMessage = err.response?.data?.error || 
        err.message || 
        "Failed to generate report";
      
      const missingDocs = err.response?.data?.missingDocuments;
      
      toast({
        title: "Error generating report",
        description: errorMessage,
        variant: "destructive",
      });
    },
  });

  const handleGenerateReport = () => {
    generateReportMutation.mutate();
  };

  // Format the date
  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'long',
      day: 'numeric'
    });
  };

  // Content for when no report exists
  const NoReportContent = () => (
    <div className="flex flex-col items-center justify-center py-12 text-center">
      <FileText className="h-16 w-16 text-muted-foreground mb-4" />
      <h3 className="text-xl font-medium mb-2">No Brand Assessment Yet</h3>
      <p className="text-muted-foreground max-w-md mb-6">
        Generate your first professional brand assessment to get comprehensive insights into your brand positioning.
      </p>
      <Button
        onClick={handleGenerateReport}
        disabled={isGenerating}
        className="flex items-center"
      >
        {isGenerating ? (
          <>Generating Report...</>
        ) : (
          <>
            <Sparkles className="mr-2 h-4 w-4" />
            Generate Assessment
          </>
        )}
      </Button>
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
  if (isError && error) {
    return (
      <div className="container px-4 py-8">
        <Alert variant="destructive" className="mb-6">
          <AlertCircle className="h-4 w-4" />
          <AlertTitle>Error</AlertTitle>
          <AlertDescription>
            {(error as any).message || "Failed to load report data"}
          </AlertDescription>
        </Alert>
        <Button onClick={handleGenerateReport} disabled={isGenerating}>
          {isGenerating ? "Generating Report..." : "Generate New Report"}
        </Button>
      </div>
    );
  }

  // If report doesn't exist yet
  if (!reportData) {
    return (
      <div className="container px-4 py-8">
        <h1 className="text-2xl font-bold mb-4">Professional Brand Assessment</h1>
        <p className="text-muted-foreground mb-8">
          Get a comprehensive analysis of your professional brand presence and positioning
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
          <h1 className="text-2xl font-bold">Professional Brand Assessment</h1>
          <p className="text-muted-foreground">
            Generated on {formatDate(report.createdAt)}
          </p>
        </div>
        <Button
          onClick={handleGenerateReport}
          disabled={isGenerating}
          variant="outline"
          className="mt-4 md:mt-0"
        >
          {isGenerating ? "Generating..." : "Generate New Report"}
        </Button>
      </div>
      
      {/* Full Report Content */}
      <ReportDisplay report={report} userName={user?.username} />
    </div>
  );
};

export default FreshnessReportPage;