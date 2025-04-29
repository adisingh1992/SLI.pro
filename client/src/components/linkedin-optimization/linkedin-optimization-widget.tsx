import { useQuery } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { ChevronRight, Plus, Linkedin, AlertCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { formatDistanceToNow } from "date-fns";

export default function LinkedinOptimizationWidget() {
  const [_, navigate] = useLocation();
  
  // Fetch latest LinkedIn optimization
  const { data: latestOptimization, isLoading: isOptimizationLoading, error: optimizationError } = useQuery({
    queryKey: ["/api/linkedin-optimizations/latest"],
    retry: false,
  });
  
  // Function to handle generate button click
  const handleGenerateClick = () => {
    navigate("/linkedin-optimization/generate");
  };
  
  // Function to handle view details click
  const handleViewDetailsClick = () => {
    if (latestOptimization?.id) {
      navigate(`/linkedin-optimization/${latestOptimization.id}`);
    }
  };

  // Loading state
  if (isOptimizationLoading) {
    return (
      <Card className="overflow-hidden">
        <CardHeader className="bg-blue-50 pb-4">
          <div className="flex items-center mb-2">
            <Linkedin className="mr-2 h-5 w-5 text-blue-600" />
            <Skeleton className="h-6 w-52" />
          </div>
          <Skeleton className="h-4 w-96 mt-1" />
        </CardHeader>
        <CardContent className="p-5">
          <Skeleton className="h-24 w-full" />
        </CardContent>
        <CardFooter className="bg-gray-50 py-3 px-6 flex justify-between">
          <Skeleton className="h-9 w-24" />
          <Skeleton className="h-9 w-28" />
        </CardFooter>
      </Card>
    );
  }

  // No optimization available yet
  if (!latestOptimization || optimizationError) {
    return (
      <Card className="overflow-hidden">
        <CardHeader className="bg-blue-50 pb-4">
          <div className="flex items-center">
            <Linkedin className="mr-2 h-5 w-5 text-blue-600" />
            <CardTitle className="text-lg font-semibold">LinkedIn Optimization</CardTitle>
          </div>
          <CardDescription className="text-blue-700">
            Enhance your LinkedIn profile with AI-powered recommendations
          </CardDescription>
        </CardHeader>
        <CardContent className="p-5">
          <div className="flex flex-col items-center justify-center text-center py-6">
            <div className="bg-blue-100 p-3 rounded-full mb-3">
              <Plus className="h-6 w-6 text-blue-600" />
            </div>
            <h3 className="font-semibold text-gray-800 mb-1">No optimizations yet</h3>
            <p className="text-gray-600 text-sm mb-4">
              Generate your first LinkedIn profile optimization to align with your SLI
            </p>
            <Button onClick={handleGenerateClick} className="mt-2">
              Generate Optimization
            </Button>
          </div>
        </CardContent>
      </Card>
    );
  }

  // Format date
  const timeAgo = latestOptimization.createdAt 
    ? formatDistanceToNow(new Date(latestOptimization.createdAt), { addSuffix: true })
    : "recently";

  // Show optimization preview
  return (
    <Card className="overflow-hidden">
      <CardHeader className="bg-blue-50 pb-4">
        <div className="flex items-center">
          <Linkedin className="mr-2 h-5 w-5 text-blue-600" />
          <CardTitle className="text-lg font-semibold">LinkedIn Optimization</CardTitle>
        </div>
        <CardDescription className="text-blue-700">
          Profile optimization generated {timeAgo}
        </CardDescription>
      </CardHeader>
      <CardContent className="p-5">
        <div className="space-y-4">
          {latestOptimization.alignmentAssessment && (
            <div className="mb-3">
              <h3 className="font-medium text-sm text-gray-700 mb-1">SLI Alignment Assessment</h3>
              <p className="text-gray-600 text-sm line-clamp-3">
                {latestOptimization.alignmentAssessment}
              </p>
            </div>
          )}

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {latestOptimization.headlineOptimization?.recommendedHeadline && (
              <div className="bg-gray-50 p-3 rounded-md">
                <h3 className="font-medium text-sm text-gray-700 mb-1">Headline</h3>
                <p className="text-gray-800 text-sm">
                  {latestOptimization.headlineOptimization.recommendedHeadline}
                </p>
              </div>
            )}
            
            {latestOptimization.profileEnhancements?.experienceSection && (
              <div className="bg-gray-50 p-3 rounded-md">
                <h3 className="font-medium text-sm text-gray-700 mb-1">Experience Section</h3>
                <p className="text-gray-800 text-sm line-clamp-3">
                  {latestOptimization.profileEnhancements.experienceSection}
                </p>
              </div>
            )}
          </div>
        </div>
      </CardContent>
      <CardFooter className="bg-gray-50 py-3 px-6 flex justify-between">
        <Button variant="outline" size="sm" onClick={handleGenerateClick}>
          <Plus className="mr-1 h-4 w-4" />
          New
        </Button>
        <Button size="sm" onClick={handleViewDetailsClick} className="flex items-center">
          View Details
          <ChevronRight className="ml-1 h-4 w-4" />
        </Button>
      </CardFooter>
    </Card>
  );
}