import { useQuery } from "@tanstack/react-query";
import { useLocation, useParams } from "wouter";
import { ChevronLeft, Loader2, Linkedin, Stars, Award, ArrowRight, Lightbulb, BarChart4 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { formatDistanceToNow } from "date-fns";
import NavBar from "@/components/nav-bar";

export default function LinkedinOptimizationPage() {
  const [_, navigate] = useLocation();
  const params = useParams();
  const id = params?.id;

  // Fetch the specific LinkedIn optimization if ID is provided, otherwise fetch the latest
  const { data: optimization, isLoading } = useQuery({
    queryKey: id ? [`/api/linkedin-optimizations/${id}`] : ["/api/linkedin-optimizations/latest"],
  });

  // Handle generate new optimization
  const handleGenerateNew = () => {
    navigate("/linkedin-optimization/generate");
  };

  if (isLoading) {
    return (
      <div className="min-h-screen bg-background flex flex-col">
        <NavBar />
        <div className="flex-1 flex items-center justify-center">
          <Loader2 className="h-10 w-10 animate-spin text-primary" />
        </div>
      </div>
    );
  }

  if (!optimization) {
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

          <div className="bg-white shadow-card rounded-lg p-8 text-center">
            <div className="my-8">
              <div className="bg-blue-100 h-20 w-20 rounded-full flex items-center justify-center mx-auto mb-4">
                <Linkedin className="h-10 w-10 text-blue-600" />
              </div>
              <h1 className="text-2xl font-semibold">No LinkedIn Optimization Found</h1>
              <p className="mt-2 text-gray-600 max-w-md mx-auto">
                You haven't generated a LinkedIn optimization yet. Generate one to get AI-powered recommendations
                for enhancing your LinkedIn profile.
              </p>
              <Button className="mt-6" onClick={handleGenerateNew}>
                Generate Your First Optimization
              </Button>
            </div>
          </div>
        </main>
      </div>
    );
  }

  // Format date
  const timeAgo = optimization.createdAt
    ? formatDistanceToNow(new Date(optimization.createdAt), { addSuffix: true })
    : "recently";

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

        <div className="bg-white shadow-card rounded-lg overflow-hidden mb-8">
          <div className="bg-blue-50 p-6 border-b border-blue-100">
            <div className="flex items-center gap-2 mb-1">
              <Linkedin className="h-5 w-5 text-blue-600" />
              <h1 className="text-2xl font-semibold text-blue-900">LinkedIn Optimization</h1>
              <Badge variant="outline" className="ml-auto text-blue-700 border-blue-200 bg-blue-50">
                Generated {timeAgo}
              </Badge>
            </div>
            <p className="text-blue-700">
              AI-generated recommendations to enhance your professional presence on LinkedIn
            </p>
          </div>

          <Tabs defaultValue="overview" className="p-6">
            <TabsList className="mb-6">
              <TabsTrigger value="overview">Overview</TabsTrigger>
              <TabsTrigger value="headline">Headline</TabsTrigger>
              <TabsTrigger value="about">About Section</TabsTrigger>
              <TabsTrigger value="profile">Profile Enhancements</TabsTrigger>
              <TabsTrigger value="content">Content Strategy</TabsTrigger>
            </TabsList>

            {/* Overview Tab */}
            <TabsContent value="overview" className="space-y-6">
              <div className="bg-blue-50 p-5 rounded-lg border border-blue-100">
                <h2 className="text-lg font-medium flex items-center gap-2 mb-3 text-blue-800">
                  <Stars className="h-5 w-5 text-blue-600" />
                  SLI Alignment Assessment
                </h2>
                <div className="text-blue-900 whitespace-pre-line">
                  {optimization.alignmentAssessment}
                </div>
              </div>

              <div className="bg-amber-50 p-5 rounded-lg border border-amber-100">
                <h2 className="text-lg font-medium flex items-center gap-2 mb-3 text-amber-800">
                  <Award className="h-5 w-5 text-amber-600" />
                  Implementation Priorities
                </h2>
                <div className="text-amber-900 whitespace-pre-line">
                  {optimization.implementationPriorities}
                </div>
              </div>
            </TabsContent>

            {/* Headline Tab */}
            <TabsContent value="headline" className="space-y-6">
              {optimization.headlineOptimization ? (
                <>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <div className="bg-gray-50 p-5 rounded-lg border border-gray-200">
                      <h3 className="font-medium text-gray-700 mb-2">Current Headline</h3>
                      <p className="text-gray-800">
                        {optimization.headlineOptimization.currentHeadline || "No current headline provided"}
                      </p>
                    </div>
                    <div className="bg-green-50 p-5 rounded-lg border border-green-100">
                      <h3 className="font-medium text-green-700 mb-2">Recommended Headline</h3>
                      <p className="text-green-800 font-medium">
                        {optimization.headlineOptimization.recommendedHeadline || "No recommendation available"}
                      </p>
                    </div>
                  </div>
                  
                  <div className="bg-blue-50 p-5 rounded-lg border border-blue-100">
                    <h3 className="font-medium text-blue-700 mb-2">Rationale</h3>
                    <p className="text-blue-800 whitespace-pre-line">
                      {optimization.headlineOptimization.rationale || "No rationale provided"}
                    </p>
                  </div>
                </>
              ) : (
                <div className="text-center p-8">
                  <p className="text-gray-500">No headline optimization data available</p>
                </div>
              )}
            </TabsContent>

            {/* About Section Tab */}
            <TabsContent value="about" className="space-y-6">
              {optimization.aboutSection ? (
                <>
                  <div className="bg-gray-50 p-5 rounded-lg border border-gray-200">
                    <h3 className="font-medium text-gray-700 mb-2">Current Analysis</h3>
                    <p className="text-gray-800 whitespace-pre-line">
                      {optimization.aboutSection.currentAnalysis || "No current analysis provided"}
                    </p>
                  </div>
                  
                  <div className="bg-blue-50 p-5 rounded-lg border border-blue-100">
                    <h3 className="font-medium text-blue-700 mb-2">Recommendations</h3>
                    <p className="text-blue-800 whitespace-pre-line">
                      {optimization.aboutSection.recommendations || "No recommendations provided"}
                    </p>
                  </div>
                  
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <div className="bg-gray-50 p-5 rounded-lg border border-gray-200">
                      <h3 className="font-medium text-gray-700 mb-2">Suggested Structure</h3>
                      <p className="text-gray-800 whitespace-pre-line">
                        {optimization.aboutSection.suggestedStructure || "No structure suggestion provided"}
                      </p>
                    </div>
                    
                    <div className="bg-gray-50 p-5 rounded-lg border border-gray-200">
                      <h3 className="font-medium text-gray-700 mb-2">Key Elements</h3>
                      <p className="text-gray-800 whitespace-pre-line">
                        {optimization.aboutSection.keyElements || "No key elements provided"}
                      </p>
                    </div>
                  </div>
                  
                  <div className="bg-green-50 p-5 rounded-lg border border-green-100">
                    <h3 className="font-medium text-green-700 mb-2">Draft Content</h3>
                    <p className="text-green-800 whitespace-pre-line">
                      {optimization.aboutSection.draftContent || "No draft content provided"}
                    </p>
                  </div>
                </>
              ) : (
                <div className="text-center p-8">
                  <p className="text-gray-500">No about section optimization data available</p>
                </div>
              )}
            </TabsContent>

            {/* Profile Enhancements Tab */}
            <TabsContent value="profile" className="space-y-6">
              {optimization.profileEnhancements ? (
                <>
                  <div className="bg-blue-50 p-5 rounded-lg border border-blue-100">
                    <h3 className="font-medium text-blue-700 mb-2">Experience Section</h3>
                    <p className="text-blue-800 whitespace-pre-line">
                      {optimization.profileEnhancements.experienceSection || "No experience section recommendations provided"}
                    </p>
                  </div>
                  
                  <div className="bg-blue-50 p-5 rounded-lg border border-blue-100">
                    <h3 className="font-medium text-blue-700 mb-2">Skills & Endorsements</h3>
                    <p className="text-blue-800 whitespace-pre-line">
                      {optimization.profileEnhancements.skillsEndorsements || "No skills recommendations provided"}
                    </p>
                  </div>
                  
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <div className="bg-blue-50 p-5 rounded-lg border border-blue-100">
                      <h3 className="font-medium text-blue-700 mb-2">Activity & Engagement</h3>
                      <p className="text-blue-800 whitespace-pre-line">
                        {optimization.profileEnhancements.activityEngagement || "No activity recommendations provided"}
                      </p>
                    </div>
                    
                    <div className="bg-blue-50 p-5 rounded-lg border border-blue-100">
                      <h3 className="font-medium text-blue-700 mb-2">Visual Improvements</h3>
                      <p className="text-blue-800 whitespace-pre-line">
                        {optimization.profileEnhancements.visualImprovements || "No visual recommendations provided"}
                      </p>
                    </div>
                  </div>
                </>
              ) : (
                <div className="text-center p-8">
                  <p className="text-gray-500">No profile enhancement data available</p>
                </div>
              )}
            </TabsContent>

            {/* Content Strategy Tab */}
            <TabsContent value="content" className="space-y-6">
              {optimization.contentStrategy ? (
                <>
                  <div className="bg-amber-50 p-5 rounded-lg border border-amber-100">
                    <h3 className="font-medium text-amber-700 mb-2">Content Themes</h3>
                    <p className="text-amber-800 whitespace-pre-line">
                      {optimization.contentStrategy.themes || "No content themes provided"}
                    </p>
                  </div>
                  
                  <div className="bg-amber-50 p-5 rounded-lg border border-amber-100">
                    <h3 className="font-medium text-amber-700 mb-2">Post Ideas</h3>
                    <p className="text-amber-800 whitespace-pre-line">
                      {optimization.contentStrategy.postIdeas || "No post ideas provided"}
                    </p>
                  </div>
                  
                  <div className="bg-amber-50 p-5 rounded-lg border border-amber-100">
                    <h3 className="font-medium text-amber-700 mb-2">Engagement Tips</h3>
                    <p className="text-amber-800 whitespace-pre-line">
                      {optimization.contentStrategy.engagementTips || "No engagement tips provided"}
                    </p>
                  </div>
                </>
              ) : (
                <div className="text-center p-8">
                  <p className="text-gray-500">No content strategy data available</p>
                </div>
              )}
            </TabsContent>
          </Tabs>
        </div>

        <div className="flex justify-between items-center">
          <Button
            variant="outline"
            onClick={() => navigate("/")}
            className="flex items-center"
          >
            <ChevronLeft className="mr-2 h-4 w-4" />
            Back to Home
          </Button>
          <Button
            onClick={handleGenerateNew}
            className="flex items-center"
          >
            <Lightbulb className="mr-2 h-4 w-4" />
            Generate New
          </Button>
        </div>
      </main>
    </div>
  );
}