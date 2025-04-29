import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/use-auth";
import { useLocation } from "wouter";
import { Loader2, ChevronLeft, FileText, Award, BarChart4 } from "lucide-react";
import { LinkedinOptimization } from "@shared/schema";
import { Button } from "@/components/ui/button";
import NavBar from "@/components/nav-bar";
import { apiRequest } from "../lib/query-client";

export default function LinkedinOptimizationGeneratePage() {
  const { user } = useAuth();
  const { toast } = useToast();
  const [_, navigate] = useLocation();
  const queryClient = useQueryClient();
  const [generationStarted, setGenerationStarted] = useState(false);

  // Check data requirements
  const { data: userProfile, isLoading: isUserLoading } = useQuery({
    queryKey: ["/api/user/profile"],
    enabled: !!user,
  });

  // Fetch the user's selected SLI
  const { data: userSli, isLoading: isSliLoading } = useQuery({
    queryKey: ["/api/user/sli"],
    enabled: !!user,
    retry: false,
  });

  // Fetch the latest freshness report
  const { data: freshnessReport, isLoading: isFreshnessLoading } = useQuery({
    queryKey: ["/api/freshness-reports/latest"],
    enabled: !!user,
    retry: false,
  });

  // Check if the user has the required documents (resume and linkedin)
  const hasResume = userProfile?.documents?.some(doc => doc.type === 'resume');
  const hasLinkedin = userProfile?.documents?.some(doc => doc.type === 'linkedin');
  const hasRequiredDocuments = hasResume && hasLinkedin;

  // Check if the user has selected or refined an SLI
  const hasSli = !!userSli;

  // Check if the user has a freshness report
  const hasFreshnessReport = !!freshnessReport;

  // Check if all requirements are met
  const allRequirementsMet = hasRequiredDocuments && hasSli && hasFreshnessReport;

  // Setup mutation for generating optimization
  const generateOptimization = useMutation({
    mutationFn: async () => {
      const response = await apiRequest<LinkedinOptimization>({
        url: "/api/linkedin-optimizations/generate",
        method: "POST",
      });
      return response;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["/api/linkedin-optimizations"] });
      queryClient.invalidateQueries({ queryKey: ["/api/linkedin-optimizations/latest"] });
      toast({
        title: "Success!",
        description: "LinkedIn optimization recommendations have been generated",
      });
      navigate(`/linkedin-optimization/${data.id}`);
    },
    onError: (error) => {
      toast({
        title: "Error",
        description: "Failed to generate LinkedIn optimization. Please try again later.",
        variant: "destructive",
      });
      setGenerationStarted(false);
    },
  });

  const handleGenerateOptimization = () => {
    if (!allRequirementsMet) {
      toast({
        title: "Cannot generate optimization",
        description: "Please ensure all requirements are met before generating optimization.",
        variant: "destructive",
      });
      return;
    }

    setGenerationStarted(true);
    generateOptimization.mutate();
  };

  // Combined loading state
  const isLoading = isUserLoading || isSliLoading || isFreshnessLoading;

  if (isLoading) {
    return (
      <div className="min-h-screen bg-background flex flex-col">
        <NavBar />
        <div className="flex-1 flex items-center justify-center">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
          <span className="ml-2">Checking requirements...</span>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background flex flex-col">
      <NavBar />
      <main className="max-w-4xl mx-auto px-4 sm:px-6 py-8 w-full">
        <Button
          variant="ghost"
          className="mb-6 flex items-center text-gray-600"
          onClick={() => navigate("/")}
          disabled={generateOptimization.isPending}
        >
          <ChevronLeft className="mr-2 h-4 w-4" />
          Back to Home
        </Button>

        <div className="bg-white shadow-card rounded-lg overflow-hidden">
          <div className="bg-blue-50 p-6 border-b border-blue-100">
            <h1 className="text-2xl font-semibold text-blue-900">Generate LinkedIn Optimization</h1>
            <p className="text-blue-700 mt-1">
              Create personalized recommendations to enhance your LinkedIn profile
            </p>
          </div>

          <div className="p-6">
            <div className="mb-8">
              <h2 className="text-lg font-medium text-gray-800 mb-4">
                Requirements Check
              </h2>
              <div className="space-y-4">
                <div className="flex items-start">
                  <div className={`p-2 rounded-full ${hasRequiredDocuments ? 'bg-green-100 text-green-600' : 'bg-gray-100 text-gray-400'} mr-3`}>
                    <FileText className="h-5 w-5" />
                  </div>
                  <div>
                    <h3 className="font-medium text-gray-700">Resume & LinkedIn Profile</h3>
                    <p className="text-sm text-gray-500">
                      {hasRequiredDocuments 
                        ? "Both documents are uploaded"
                        : !hasResume && !hasLinkedin
                          ? "Missing both resume and LinkedIn profile"
                          : !hasResume
                            ? "Missing resume document"
                            : "Missing LinkedIn profile document"}
                    </p>
                  </div>
                </div>

                <div className="flex items-start">
                  <div className={`p-2 rounded-full ${hasSli ? 'bg-green-100 text-green-600' : 'bg-gray-100 text-gray-400'} mr-3`}>
                    <Award className="h-5 w-5" />
                  </div>
                  <div>
                    <h3 className="font-medium text-gray-700">Single Lasting Impression (SLI)</h3>
                    <p className="text-sm text-gray-500">
                      {hasSli 
                        ? userSli?.refinedSliText 
                          ? "Refined SLI is available" 
                          : "Selected SLI is available"
                        : "No SLI selected or refined"}
                    </p>
                  </div>
                </div>

                <div className="flex items-start">
                  <div className={`p-2 rounded-full ${hasFreshnessReport ? 'bg-green-100 text-green-600' : 'bg-gray-100 text-gray-400'} mr-3`}>
                    <BarChart4 className="h-5 w-5" />
                  </div>
                  <div>
                    <h3 className="font-medium text-gray-700">Freshness Report</h3>
                    <p className="text-sm text-gray-500">
                      {hasFreshnessReport 
                        ? "Freshness report is available"
                        : "No freshness report found"}
                    </p>
                  </div>
                </div>
              </div>
            </div>

            <div className="bg-blue-50 p-6 rounded-lg border border-blue-100 mb-8">
              <h2 className="text-lg font-medium text-blue-900 mb-3">What to Expect</h2>
              <p className="text-blue-800 mb-4">
                The LinkedIn optimization process will analyze your:
              </p>
              <ul className="space-y-2 text-blue-700">
                <li className="flex items-start">
                  <span className="inline-block w-4 h-4 bg-blue-200 rounded-full mr-2 mt-1"></span>
                  <span>Resume and LinkedIn profile to identify strengths and opportunities</span>
                </li>
                <li className="flex items-start">
                  <span className="inline-block w-4 h-4 bg-blue-200 rounded-full mr-2 mt-1"></span>
                  <span>Single Lasting Impression to ensure profile alignment</span>
                </li>
                <li className="flex items-start">
                  <span className="inline-block w-4 h-4 bg-blue-200 rounded-full mr-2 mt-1"></span>
                  <span>Freshness Report insights to enhance your professional presence</span>
                </li>
              </ul>
              <div className="mt-6 text-sm text-blue-800">
                <strong>Note:</strong> Generation can take up to 2-3 minutes as our AI carefully analyzes your documents and creates personalized recommendations.
              </div>
            </div>

            <div className="flex justify-between items-center">
              <Button
                variant="outline"
                className="flex items-center"
                onClick={() => navigate("/")}
                disabled={generateOptimization.isPending}
              >
                <ChevronLeft className="mr-2 h-4 w-4" />
                Cancel
              </Button>
              <Button
                className="flex items-center"
                onClick={handleGenerateOptimization}
                disabled={!allRequirementsMet || generateOptimization.isPending}
              >
                {generateOptimization.isPending ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Generating...
                  </>
                ) : (
                  "Generate Optimization"
                )}
              </Button>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}