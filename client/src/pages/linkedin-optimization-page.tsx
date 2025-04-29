import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/hooks/use-auth";
import { useLocation, useParams } from "wouter";
import { Loader2, ChevronLeft, ArrowRight, FileText, MessageSquare, Lightbulb, ArrowUpRight } from "lucide-react";
import { LinkedinOptimization } from "@shared/schema";
import { Button } from "@/components/ui/button";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import NavBar from "@/components/nav-bar";
import { formatDate } from "@/lib/utils";

export default function LinkedinOptimizationPage() {
  const { user } = useAuth();
  const params = useParams();
  const [_, navigate] = useLocation();
  const [activeTab, setActiveTab] = useState("headline");

  // Determine if we are viewing a specific optimization or the latest
  const isViewingSpecific = !!params.id;

  // Fetch a specific optimization if ID is provided, otherwise fetch the latest
  const {
    data: optimization,
    isLoading,
    isError,
    error
  } = useQuery<LinkedinOptimization>({
    queryKey: isViewingSpecific ? [`/api/linkedin-optimizations/${params.id}`] : ["/api/linkedin-optimizations/latest"],
    enabled: !!user,
  });

  if (isLoading) {
    return (
      <div className="min-h-screen bg-background flex flex-col">
        <NavBar />
        <div className="flex-1 flex items-center justify-center">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
          <span className="ml-2">Loading optimization data...</span>
        </div>
      </div>
    );
  }

  if (isError || !optimization) {
    return (
      <div className="min-h-screen bg-background flex flex-col">
        <NavBar />
        <main className="max-w-6xl mx-auto px-4 sm:px-6 py-8 w-full">
          <Button
            variant="ghost"
            className="mb-6 flex items-center text-gray-600"
            onClick={() => navigate("/")}
          >
            <ChevronLeft className="mr-2 h-4 w-4" />
            Back to Home
          </Button>

          <div className="bg-white shadow-card rounded-lg p-8 text-center">
            <div className="mx-auto w-16 h-16 bg-red-100 rounded-full flex items-center justify-center mb-4">
              <FileText className="h-8 w-8 text-red-600" />
            </div>
            <h1 className="text-2xl font-semibold text-gray-800 mb-2">Optimization Not Found</h1>
            <p className="text-gray-600 mb-6">
              {isError 
                ? `Error: ${error instanceof Error ? error.message : "Unknown error"}`
                : "No LinkedIn optimization found. Generate your first optimization to view recommendations."}
            </p>
            <Button 
              className="flex items-center mx-auto"
              onClick={() => navigate("/linkedin-optimization/generate")}
            >
              Generate Optimization
              <ArrowRight className="ml-2 h-4 w-4" />
            </Button>
          </div>
        </main>
      </div>
    );
  }

  // Format the date
  const formattedDate = formatDate(new Date(optimization.createdAt));

  return (
    <div className="min-h-screen bg-background flex flex-col">
      <NavBar />
      <main className="max-w-6xl mx-auto px-4 sm:px-6 py-8 w-full">
        <Button
          variant="ghost"
          className="mb-6 flex items-center text-gray-600"
          onClick={() => navigate("/")}
        >
          <ChevronLeft className="mr-2 h-4 w-4" />
          Back to Home
        </Button>

        <div className="bg-white shadow-card rounded-lg overflow-hidden">
          <div className="bg-blue-50 p-6 border-b border-blue-100">
            <div className="flex flex-col md:flex-row md:items-center md:justify-between">
              <div>
                <h1 className="text-2xl font-semibold text-blue-900">LinkedIn Profile Optimization</h1>
                <p className="text-blue-700 mt-1">Generated on {formattedDate}</p>
              </div>
              <Button
                variant="outline"
                className="mt-4 md:mt-0 flex items-center border-blue-300 text-blue-700 hover:bg-blue-50"
                onClick={() => navigate("/linkedin-optimization/generate")}
              >
                Generate New
                <ArrowRight className="ml-2 h-4 w-4" />
              </Button>
            </div>
          </div>

          {/* Alignment Assessment Section */}
          {optimization.alignmentAssessment && (
            <div className="p-6 border-b border-gray-200">
              <h2 className="text-xl font-medium text-gray-800 mb-4">SLI Alignment Assessment</h2>
              <div className="bg-blue-50 rounded-lg p-4 border border-blue-100">
                <p className="text-gray-700 whitespace-pre-line">{optimization.alignmentAssessment}</p>
              </div>
            </div>
          )}

          {/* Main Content Tabs */}
          <Tabs value={activeTab} onValueChange={setActiveTab} className="p-6">
            <TabsList className="grid grid-cols-2 md:grid-cols-4 mb-6">
              <TabsTrigger 
                value="headline"
                disabled={!optimization.headlineOptimization}
                className={!optimization.headlineOptimization ? "text-gray-400" : ""}
              >
                Headline
              </TabsTrigger>
              <TabsTrigger 
                value="about"
                disabled={!optimization.aboutSection}
                className={!optimization.aboutSection ? "text-gray-400" : ""}
              >
                About Section
              </TabsTrigger>
              <TabsTrigger 
                value="content"
                disabled={!optimization.contentStrategy}
                className={!optimization.contentStrategy ? "text-gray-400" : ""}
              >
                Content Strategy
              </TabsTrigger>
              <TabsTrigger 
                value="profile"
                disabled={!optimization.profileEnhancements}
                className={!optimization.profileEnhancements ? "text-gray-400" : ""}
              >
                Profile Enhancements
              </TabsTrigger>
            </TabsList>

            {/* Headline Optimization Tab */}
            <TabsContent value="headline" className="space-y-6">
              {optimization.headlineOptimization && (
                <>
                  <Card>
                    <CardHeader>
                      <CardTitle>Current Headline</CardTitle>
                    </CardHeader>
                    <CardContent>
                      <p className="text-gray-700 italic">"{optimization.headlineOptimization.currentHeadline}"</p>
                    </CardContent>
                  </Card>

                  <Card>
                    <CardHeader>
                      <CardTitle className="flex items-center">
                        <Lightbulb className="h-5 w-5 text-amber-500 mr-2" />
                        Recommended Headline
                      </CardTitle>
                    </CardHeader>
                    <CardContent>
                      <p className="text-gray-700 font-medium">{optimization.headlineOptimization.recommendedHeadline}</p>
                      {optimization.headlineOptimization.rationale && (
                        <div className="mt-4 pt-4 border-t border-gray-100">
                          <h4 className="text-sm font-medium text-gray-700 mb-2 flex items-center">
                            <MessageSquare className="h-4 w-4 mr-2 text-blue-600" />
                            Why this works better:
                          </h4>
                          <p className="text-gray-600 text-sm">{optimization.headlineOptimization.rationale}</p>
                        </div>
                      )}
                    </CardContent>
                  </Card>
                </>
              )}
            </TabsContent>

            {/* About Section Tab */}
            <TabsContent value="about" className="space-y-6">
              {optimization.aboutSection && (
                <>
                  <Card>
                    <CardHeader>
                      <CardTitle>Current About Section Analysis</CardTitle>
                    </CardHeader>
                    <CardContent>
                      <p className="text-gray-700 whitespace-pre-line">{optimization.aboutSection.currentAnalysis}</p>
                    </CardContent>
                  </Card>

                  <Card>
                    <CardHeader>
                      <CardTitle className="flex items-center">
                        <Lightbulb className="h-5 w-5 text-amber-500 mr-2" />
                        Recommended Improvements
                      </CardTitle>
                    </CardHeader>
                    <CardContent>
                      <p className="text-gray-700 whitespace-pre-line">{optimization.aboutSection.recommendations}</p>
                      
                      {optimization.aboutSection.suggestedStructure && (
                        <div className="mt-4 pt-4 border-t border-gray-100">
                          <h4 className="text-sm font-medium text-gray-700 mb-2">Suggested Structure:</h4>
                          <p className="text-gray-600 text-sm whitespace-pre-line">{optimization.aboutSection.suggestedStructure}</p>
                        </div>
                      )}
                      
                      {optimization.aboutSection.keyElements && (
                        <div className="mt-4 pt-4 border-t border-gray-100">
                          <h4 className="text-sm font-medium text-gray-700 mb-2">Key Elements to Include:</h4>
                          <p className="text-gray-600 text-sm whitespace-pre-line">{optimization.aboutSection.keyElements}</p>
                        </div>
                      )}
                    </CardContent>
                  </Card>
                  
                  {optimization.aboutSection.draftContent && (
                    <Card>
                      <CardHeader>
                        <CardTitle className="flex items-center">
                          <FileText className="h-5 w-5 text-green-500 mr-2" />
                          Sample Draft
                        </CardTitle>
                      </CardHeader>
                      <CardContent>
                        <p className="text-gray-700 whitespace-pre-line">{optimization.aboutSection.draftContent}</p>
                      </CardContent>
                    </Card>
                  )}
                </>
              )}
            </TabsContent>

            {/* Content Strategy Tab */}
            <TabsContent value="content" className="space-y-6">
              {optimization.contentStrategy && (
                <>
                  <Card>
                    <CardHeader>
                      <CardTitle>Content Themes</CardTitle>
                    </CardHeader>
                    <CardContent>
                      <p className="text-gray-700 whitespace-pre-line">{optimization.contentStrategy.themes}</p>
                    </CardContent>
                  </Card>

                  <Card>
                    <CardHeader>
                      <CardTitle>Post Ideas</CardTitle>
                    </CardHeader>
                    <CardContent>
                      <p className="text-gray-700 whitespace-pre-line">{optimization.contentStrategy.postIdeas}</p>
                    </CardContent>
                  </Card>

                  <Card>
                    <CardHeader>
                      <CardTitle>Engagement Tips</CardTitle>
                    </CardHeader>
                    <CardContent>
                      <p className="text-gray-700 whitespace-pre-line">{optimization.contentStrategy.engagementTips}</p>
                    </CardContent>
                  </Card>
                </>
              )}
            </TabsContent>

            {/* Profile Enhancements Tab */}
            <TabsContent value="profile" className="space-y-6">
              {optimization.profileEnhancements && (
                <>
                  <Card>
                    <CardHeader>
                      <CardTitle>Experience Section</CardTitle>
                    </CardHeader>
                    <CardContent>
                      <p className="text-gray-700 whitespace-pre-line">{optimization.profileEnhancements.experienceSection}</p>
                    </CardContent>
                  </Card>

                  <Card>
                    <CardHeader>
                      <CardTitle>Skills & Endorsements</CardTitle>
                    </CardHeader>
                    <CardContent>
                      <p className="text-gray-700 whitespace-pre-line">{optimization.profileEnhancements.skillsEndorsements}</p>
                    </CardContent>
                  </Card>

                  <Card>
                    <CardHeader>
                      <CardTitle>Activity & Engagement</CardTitle>
                    </CardHeader>
                    <CardContent>
                      <p className="text-gray-700 whitespace-pre-line">{optimization.profileEnhancements.activityEngagement}</p>
                    </CardContent>
                  </Card>

                  {optimization.profileEnhancements.visualImprovements && (
                    <Card>
                      <CardHeader>
                        <CardTitle>Visual Improvements</CardTitle>
                      </CardHeader>
                      <CardContent>
                        <p className="text-gray-700 whitespace-pre-line">{optimization.profileEnhancements.visualImprovements}</p>
                      </CardContent>
                    </Card>
                  )}
                </>
              )}
            </TabsContent>
          </Tabs>

          {/* Implementation Priorities Section */}
          {optimization.implementationPriorities && (
            <div className="p-6 border-t border-gray-200 bg-gray-50">
              <h2 className="text-xl font-medium text-gray-800 mb-4">Implementation Priorities</h2>
              <div className="bg-white rounded-lg p-4 border border-gray-200">
                <p className="text-gray-700 whitespace-pre-line">{optimization.implementationPriorities}</p>
              </div>
              
              <div className="mt-6 flex items-center text-sm text-gray-600">
                <Lightbulb className="h-4 w-4 text-amber-500 mr-2" />
                <p>
                  Implement these recommendations in the suggested order for maximum impact on your professional brand.
                </p>
              </div>
            </div>
          )}

          {/* Call to Action Footer */}
          <div className="p-6 border-t border-gray-200">
            <div className="flex flex-col md:flex-row md:justify-between md:items-center">
              <div className="mb-4 md:mb-0">
                <h3 className="text-lg font-medium text-gray-800">Ready to update your LinkedIn profile?</h3>
                <p className="text-gray-600">Apply these recommendations to strengthen your professional presence.</p>
              </div>
              <Button
                className="flex items-center"
                onClick={() => window.open("https://linkedin.com/in/", "_blank")}
              >
                Go to LinkedIn
                <ArrowUpRight className="ml-2 h-4 w-4" />
              </Button>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}