import React, { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/use-auth";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { AlertCircle, BookOpen, CheckCircle2, Download, FileText, Lightbulb, Sparkles } from "lucide-react";
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
  const [activeTab, setActiveTab] = useState("overview");
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
  const { finalSynthesis } = report;

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

      <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
        <TabsList className="grid w-full grid-cols-3 md:grid-cols-5 mb-6">
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="strategy">Strategy</TabsTrigger>
          <TabsTrigger value="content">Content</TabsTrigger>
          <TabsTrigger value="implementation">Implementation</TabsTrigger>
          <TabsTrigger value="full-report">Full Report</TabsTrigger>
        </TabsList>

        {/* Overview Tab */}
        <TabsContent value="overview" className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center">
                <Sparkles className="h-5 w-5 mr-2 text-blue-500" />
                Brand Audit
              </CardTitle>
              <CardDescription>
                Current state of your professional brand
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <h4 className="font-medium mb-2">Brand Strength</h4>
                <p>{finalSynthesis?.brandAudit?.currentBrandStrength || "No data available"}</p>
              </div>
              <Separator />
              <div>
                <h4 className="font-medium mb-2">Core Strengths</h4>
                <ul className="list-disc pl-5 space-y-1">
                  {finalSynthesis?.brandAudit?.coreStrengths?.map((strength: string, i: number) => (
                    <li key={i}>{strength}</li>
                  )) || "No data available"}
                </ul>
              </div>
              <Separator />
              <div>
                <h4 className="font-medium mb-2">Critical Gaps</h4>
                <ul className="list-disc pl-5 space-y-1">
                  {finalSynthesis?.brandAudit?.criticalGaps?.map((gap: string, i: number) => (
                    <li key={i}>{gap}</li>
                  )) || "No data available"}
                </ul>
              </div>
            </CardContent>
          </Card>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-lg flex items-center">
                  <CheckCircle2 className="h-5 w-5 mr-2 text-green-500" />
                  Unique Value Proposition
                </CardTitle>
              </CardHeader>
              <CardContent>
                <p>{finalSynthesis?.personalBrandStrategy?.uniqueValueProposition || "No data available"}</p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-lg flex items-center">
                  <Lightbulb className="h-5 w-5 mr-2 text-amber-500" />
                  Next Steps
                </CardTitle>
              </CardHeader>
              <CardContent>
                <ul className="list-disc pl-5 space-y-1">
                  {finalSynthesis?.implementationRoadmap?.immediateNextSteps?.map((step: string, i: number) => (
                    <li key={i}>{step}</li>
                  )) || "No data available"}
                </ul>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        {/* Strategy Tab */}
        <TabsContent value="strategy" className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Personal Brand Strategy</CardTitle>
              <CardDescription>
                Strategic recommendations for your professional brand
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <h4 className="font-medium mb-2">Recommended Positioning</h4>
                <p>{finalSynthesis?.personalBrandStrategy?.recommendedPositioning || "No data available"}</p>
              </div>
              <Separator />
              <div>
                <h4 className="font-medium mb-2">Target Audience</h4>
                <ul className="list-disc pl-5 space-y-1">
                  {finalSynthesis?.personalBrandStrategy?.targetAudience?.map((audience: string, i: number) => (
                    <li key={i}>{audience}</li>
                  )) || "No data available"}
                </ul>
              </div>
              <Separator />
              <div>
                <h4 className="font-medium mb-2">Core Narrative</h4>
                <p>{finalSynthesis?.personalBrandStrategy?.coreNarrative || "No data available"}</p>
              </div>
              <Separator />
              <div>
                <h4 className="font-medium mb-2">Key Differentiators</h4>
                <ul className="list-disc pl-5 space-y-1">
                  {finalSynthesis?.personalBrandStrategy?.keyDifferentiators?.map((diff: string, i: number) => (
                    <li key={i}>{diff}</li>
                  )) || "No data available"}
                </ul>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Competitive Analysis</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <h4 className="font-medium mb-2">Market Positioning</h4>
                <p>{finalSynthesis?.competitiveAnalysis?.marketPositioning || "No data available"}</p>
              </div>
              <Separator />
              <div>
                <h4 className="font-medium mb-2">Industry Trend Alignment</h4>
                <p>{finalSynthesis?.competitiveAnalysis?.industryTrendAlignment || "No data available"}</p>
              </div>
              <Separator />
              <div>
                <h4 className="font-medium mb-2">Distinction Opportunities</h4>
                <p>{finalSynthesis?.competitiveAnalysis?.distinctionOpportunities || "No data available"}</p>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Content Tab */}
        <TabsContent value="content" className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Content Recommendations</CardTitle>
              <CardDescription>
                Improve your professional content and digital presence
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <h4 className="font-medium mb-2">Resume Improvements</h4>
                <ul className="list-disc pl-5 space-y-1">
                  {finalSynthesis?.contentRecommendations?.resumeImprovements?.map((imp: string, i: number) => (
                    <li key={i}>{imp}</li>
                  )) || "No data available"}
                </ul>
              </div>
              <Separator />
              <div>
                <h4 className="font-medium mb-2">LinkedIn Enhancements</h4>
                <ul className="list-disc pl-5 space-y-1">
                  {finalSynthesis?.contentRecommendations?.linkedInEnhancements?.map((enh: string, i: number) => (
                    <li key={i}>{enh}</li>
                  )) || "No data available"}
                </ul>
              </div>
              <Separator />
              <div>
                <h4 className="font-medium mb-2">Thought Leadership Topics</h4>
                <ul className="list-disc pl-5 space-y-1">
                  {finalSynthesis?.contentRecommendations?.thoughtLeadershipTopics?.map((topic: string, i: number) => (
                    <li key={i}>{topic}</li>
                  )) || "No data available"}
                </ul>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Digital Presence Strategy</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <h4 className="font-medium mb-2">Platform Priorities</h4>
                <ul className="list-disc pl-5 space-y-1">
                  {finalSynthesis?.digitalPresenceStrategy?.platformPriorities?.map((platform: string, i: number) => (
                    <li key={i}>{platform}</li>
                  )) || "No data available"}
                </ul>
              </div>
              <Separator />
              <div>
                <h4 className="font-medium mb-2">Engagement Tactics</h4>
                <ul className="list-disc pl-5 space-y-1">
                  {finalSynthesis?.digitalPresenceStrategy?.engagementTactics?.map((tactic: string, i: number) => (
                    <li key={i}>{tactic}</li>
                  )) || "No data available"}
                </ul>
              </div>
              <Separator />
              <div>
                <h4 className="font-medium mb-2">Networking Approach</h4>
                <p>{finalSynthesis?.digitalPresenceStrategy?.networkingApproach || "No data available"}</p>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Implementation Tab */}
        <TabsContent value="implementation" className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Implementation Roadmap</CardTitle>
              <CardDescription>
                Actionable steps to enhance your professional brand
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <div>
                <h4 className="font-medium mb-3">Immediate Next Steps</h4>
                <ul className="list-disc pl-5 space-y-2">
                  {finalSynthesis?.implementationRoadmap?.immediateNextSteps?.map((step: string, i: number) => (
                    <li key={i}>{step}</li>
                  )) || "No data available"}
                </ul>
              </div>
              <Separator />
              <div>
                <h4 className="font-medium mb-3">30-Day Milestones</h4>
                <ul className="list-disc pl-5 space-y-2">
                  {finalSynthesis?.implementationRoadmap?.["30DayMilestones"]?.map((milestone: string, i: number) => (
                    <li key={i}>{milestone}</li>
                  )) || "No data available"}
                </ul>
              </div>
              <Separator />
              <div>
                <h4 className="font-medium mb-3">90-Day Milestones</h4>
                <ul className="list-disc pl-5 space-y-2">
                  {finalSynthesis?.implementationRoadmap?.["90DayMilestones"]?.map((milestone: string, i: number) => (
                    <li key={i}>{milestone}</li>
                  )) || "No data available"}
                </ul>
              </div>
              <Separator />
              <div>
                <h4 className="font-medium mb-3">Success Metrics</h4>
                <ul className="list-disc pl-5 space-y-2">
                  {finalSynthesis?.implementationRoadmap?.successMetrics?.map((metric: string, i: number) => (
                    <li key={i}>{metric}</li>
                  )) || "No data available"}
                </ul>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Full Report Tab */}
        <TabsContent value="full-report">
          <div className="mb-4 flex items-center justify-end">
            <Button variant="outline" size="sm">
              <Download className="h-4 w-4 mr-2" />
              Export Report
            </Button>
          </div>
          
          {/* Use our new ReportDisplay component here */}
          <ReportDisplay report={report} userName={user?.username} />
        </TabsContent>
      </Tabs>
    </div>
  );
};

// Export without default to fix the routing issue
export { FreshnessReportPage as default };