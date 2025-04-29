import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/use-auth";
import { useLocation, useRoute, Link } from "wouter";
import { Loader2, ChevronLeft, Clock, CheckCircle, ExternalLink } from "lucide-react";
import { LinkedinOptimization } from "@shared/schema";
import { Button } from "@/components/ui/button";
import NavBar from "@/components/nav-bar";

export default function LinkedinOptimizationPage() {
  const { user } = useAuth();
  const { toast } = useToast();
  const [match, params] = useRoute("/linkedin-optimization/:id?");
  const [_, navigate] = useLocation();

  // Fetch the latest LinkedIn optimization if no ID is provided
  const {
    data: latestOptimization,
    isLoading: isLatestLoading,
    isError: isLatestError,
    error: latestError,
  } = useQuery<LinkedinOptimization>({
    queryKey: ["/api/linkedin-optimizations/latest"],
    enabled: !!user && !params?.id,
  });

  // Fetch specific LinkedIn optimization if ID is provided
  const {
    data: specificOptimization,
    isLoading: isSpecificLoading,
    isError: isSpecificError,
    error: specificError,
  } = useQuery<LinkedinOptimization>({
    queryKey: ["/api/linkedin-optimizations", params?.id],
    enabled: !!user && !!params?.id,
  });

  // Use the appropriate optimization data
  const optimization = params?.id ? specificOptimization : latestOptimization;
  const isLoading = params?.id ? isSpecificLoading : isLatestLoading;
  const isError = params?.id ? isSpecificError : isLatestError;
  const error = params?.id ? specificError : latestError;

  // Format date
  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    return new Intl.DateTimeFormat("en-US", {
      year: "numeric",
      month: "long",
      day: "numeric",
      hour: "numeric",
      minute: "numeric",
    }).format(date);
  };

  useEffect(() => {
    if (isError && error) {
      toast({
        title: "Error",
        description: "Failed to load LinkedIn optimization data.",
        variant: "destructive",
      });
    }
  }, [isError, error, toast]);

  if (isLoading) {
    return (
      <div className="min-h-screen bg-background flex flex-col">
        <NavBar />
        <div className="flex-1 flex items-center justify-center">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
          <span className="ml-2">Loading LinkedIn optimization data...</span>
        </div>
      </div>
    );
  }

  if (!optimization) {
    return (
      <div className="min-h-screen bg-background flex flex-col">
        <NavBar />
        <div className="max-w-4xl mx-auto px-4 sm:px-6 py-8 w-full">
          <Button
            variant="ghost"
            className="mb-6 flex items-center text-gray-600"
            onClick={() => navigate("/")}
          >
            <ChevronLeft className="mr-2 h-4 w-4" />
            Back to Home
          </Button>
          
          <div className="bg-white shadow-card rounded-lg p-8 text-center">
            <div className="mb-6 mx-auto w-16 h-16 flex items-center justify-center rounded-full bg-blue-50">
              <Clock className="h-8 w-8 text-blue-500" />
            </div>
            <h1 className="text-2xl font-semibold mb-4">No LinkedIn Optimization Found</h1>
            <p className="text-gray-600 mb-6 max-w-md mx-auto">
              You haven't generated any LinkedIn optimization recommendations yet.
              Return to the home page to start the optimization process.
            </p>
            <Button onClick={() => navigate("/")}>
              Return to Home
            </Button>
          </div>
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
        >
          <ChevronLeft className="mr-2 h-4 w-4" />
          Back to Home
        </Button>

        <div className="bg-white shadow-md rounded-lg overflow-hidden">
          <div className="bg-blue-50 p-6 border-b border-blue-100">
            <h1 className="text-2xl font-semibold text-blue-900">LinkedIn Profile Optimization</h1>
            <p className="text-blue-700 mt-1">
              Generated on {formatDate(optimization.createdAt.toString())}
            </p>
          </div>

          <div className="p-6">
            {/* SLI Alignment Assessment */}
            <section className="mb-10">
              <h2 className="text-xl font-semibold text-gray-800 mb-4 pb-2 border-b border-gray-100">
                SLI Alignment Assessment
              </h2>
              <div className="bg-blue-50 p-4 rounded-md border border-blue-100 text-blue-800">
                {optimization.alignmentAssessment}
              </div>
            </section>

            {/* Headline Optimization */}
            {optimization.headlineOptimization && (
              <section className="mb-10">
                <h2 className="text-xl font-semibold text-gray-800 mb-4 pb-2 border-b border-gray-100">
                  Headline Optimization
                </h2>
                <div className="space-y-4">
                  <div>
                    <h3 className="font-medium text-gray-700 mb-1">Current Headline</h3>
                    <p className="text-gray-600 border-l-4 border-gray-200 pl-3 py-1">
                      {optimization.headlineOptimization.currentHeadline || "No current headline provided"}
                    </p>
                  </div>
                  <div>
                    <h3 className="font-medium text-gray-700 mb-1">Recommended Headline</h3>
                    <p className="text-blue-700 border-l-4 border-blue-300 pl-3 py-1 bg-blue-50">
                      {optimization.headlineOptimization.recommendedHeadline}
                    </p>
                  </div>
                  <div>
                    <h3 className="font-medium text-gray-700 mb-1">Rationale</h3>
                    <p className="text-gray-600">
                      {optimization.headlineOptimization.rationale}
                    </p>
                  </div>
                </div>
              </section>
            )}

            {/* About Section Enhancement */}
            {optimization.aboutSection && (
              <section className="mb-10">
                <h2 className="text-xl font-semibold text-gray-800 mb-4 pb-2 border-b border-gray-100">
                  About Section Enhancement
                </h2>
                <div className="space-y-4">
                  {optimization.aboutSection.currentWeaknesses && (
                    <div>
                      <h3 className="font-medium text-gray-700 mb-2">Current Weaknesses</h3>
                      <ul className="list-disc pl-5 space-y-1 text-gray-600">
                        {optimization.aboutSection.currentWeaknesses.map((weakness, index) => (
                          <li key={index}>{weakness}</li>
                        ))}
                      </ul>
                    </div>
                  )}
                  {optimization.aboutSection.recommendedAbout && (
                    <div>
                      <h3 className="font-medium text-gray-700 mb-2">Recommended About Section</h3>
                      <div className="bg-blue-50 p-4 rounded-md border border-blue-100 text-gray-800 whitespace-pre-line">
                        {optimization.aboutSection.recommendedAbout}
                      </div>
                    </div>
                  )}
                  {optimization.aboutSection.keyElements && (
                    <div>
                      <h3 className="font-medium text-gray-700 mb-2">Key Elements</h3>
                      <ul className="list-disc pl-5 space-y-1 text-gray-600">
                        {optimization.aboutSection.keyElements.map((element, index) => (
                          <li key={index}>{element}</li>
                        ))}
                      </ul>
                    </div>
                  )}
                </div>
              </section>
            )}

            {/* Experience Descriptions */}
            {optimization.experienceDescriptions && optimization.experienceDescriptions.positions && (
              <section className="mb-10">
                <h2 className="text-xl font-semibold text-gray-800 mb-4 pb-2 border-b border-gray-100">
                  Experience Descriptions
                </h2>
                <div className="space-y-8">
                  {optimization.experienceDescriptions.positions.map((position, index) => (
                    <div key={index} className="p-4 border border-gray-200 rounded-md">
                      <h3 className="font-medium text-gray-800 mb-3">{position.position}</h3>
                      
                      <div className="mb-4">
                        <h4 className="text-sm font-medium text-gray-600 mb-1">Current Description</h4>
                        <p className="text-gray-600 text-sm border-l-4 border-gray-200 pl-3 py-1">
                          {position.currentDescription || "No current description provided"}
                        </p>
                      </div>
                      
                      <div className="mb-4">
                        <h4 className="text-sm font-medium text-gray-600 mb-1">Recommended Description</h4>
                        <p className="text-gray-800 text-sm border-l-4 border-blue-300 pl-3 py-1 bg-blue-50">
                          {position.recommendedDescription}
                        </p>
                      </div>
                      
                      {position.rationale && (
                        <div>
                          <h4 className="text-sm font-medium text-gray-600 mb-1">Rationale</h4>
                          <p className="text-gray-600 text-sm">{position.rationale}</p>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </section>
            )}

            {/* Skills & Endorsements */}
            {optimization.skillsAndEndorsements && (
              <section className="mb-10">
                <h2 className="text-xl font-semibold text-gray-800 mb-4 pb-2 border-b border-gray-100">
                  Skills & Endorsements
                </h2>
                <div className="space-y-4">
                  {optimization.skillsAndEndorsements.recommendedSkills && (
                    <div>
                      <h3 className="font-medium text-gray-700 mb-2">Recommended Skills</h3>
                      <div className="flex flex-wrap gap-2">
                        {optimization.skillsAndEndorsements.recommendedSkills.map((skill, index) => (
                          <span
                            key={index}
                            className="px-3 py-1 bg-blue-100 text-blue-800 rounded-full text-sm"
                          >
                            {skill}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}
                  
                  {optimization.skillsAndEndorsements.skillsToRemove && (
                    <div>
                      <h3 className="font-medium text-gray-700 mb-2">Skills to Remove</h3>
                      <div className="flex flex-wrap gap-2">
                        {optimization.skillsAndEndorsements.skillsToRemove.map((skill, index) => (
                          <span
                            key={index}
                            className="px-3 py-1 bg-red-100 text-red-800 rounded-full text-sm"
                          >
                            {skill}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}
                  
                  {optimization.skillsAndEndorsements.rationale && (
                    <div>
                      <h3 className="font-medium text-gray-700 mb-2">Rationale</h3>
                      <p className="text-gray-600">{optimization.skillsAndEndorsements.rationale}</p>
                    </div>
                  )}
                </div>
              </section>
            )}

            {/* Additional Sections */}
            {optimization.additionalSections && (
              <section className="mb-10">
                <h2 className="text-xl font-semibold text-gray-800 mb-4 pb-2 border-b border-gray-100">
                  Additional Sections
                </h2>
                <div className="bg-gray-50 p-4 rounded-md border border-gray-200 whitespace-pre-line">
                  {optimization.additionalSections}
                </div>
              </section>
            )}

            {/* Visual Elements */}
            {optimization.visualElements && (
              <section className="mb-10">
                <h2 className="text-xl font-semibold text-gray-800 mb-4 pb-2 border-b border-gray-100">
                  Visual Elements
                </h2>
                <div className="space-y-4">
                  {optimization.visualElements.profilePhotoSuggestions && (
                    <div>
                      <h3 className="font-medium text-gray-700 mb-2">Profile Photo Suggestions</h3>
                      <p className="text-gray-600">{optimization.visualElements.profilePhotoSuggestions}</p>
                    </div>
                  )}
                  
                  {optimization.visualElements.backgroundImageRecommendations && (
                    <div>
                      <h3 className="font-medium text-gray-700 mb-2">Background Image Recommendations</h3>
                      <p className="text-gray-600">{optimization.visualElements.backgroundImageRecommendations}</p>
                    </div>
                  )}
                  
                  {optimization.visualElements.activityFeedContentIdeas && (
                    <div>
                      <h3 className="font-medium text-gray-700 mb-2">Activity Feed Content Ideas</h3>
                      <p className="text-gray-600">{optimization.visualElements.activityFeedContentIdeas}</p>
                    </div>
                  )}
                </div>
              </section>
            )}

            {/* Content Strategy */}
            {optimization.contentStrategy && (
              <section className="mb-10">
                <h2 className="text-xl font-semibold text-gray-800 mb-4 pb-2 border-b border-gray-100">
                  Content Strategy
                </h2>
                <div className="space-y-6">
                  {optimization.contentStrategy.themes && (
                    <div>
                      <h3 className="font-medium text-gray-700 mb-2">Recommended Themes</h3>
                      <ul className="list-disc pl-5 space-y-1 text-gray-600">
                        {optimization.contentStrategy.themes.map((theme, index) => (
                          <li key={index}>{theme}</li>
                        ))}
                      </ul>
                    </div>
                  )}
                  
                  {optimization.contentStrategy.postIdeas && optimization.contentStrategy.postIdeas.length > 0 && (
                    <div>
                      <h3 className="font-medium text-gray-700 mb-2">Post Ideas</h3>
                      <div className="space-y-4">
                        {optimization.contentStrategy.postIdeas.map((idea, index) => (
                          <div key={index} className="p-4 bg-blue-50 rounded-md border border-blue-100">
                            <h4 className="font-medium text-blue-800 mb-2">{idea.title}</h4>
                            <p className="text-gray-700">{idea.content}</p>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                  
                  {optimization.contentStrategy.engagementTips && (
                    <div>
                      <h3 className="font-medium text-gray-700 mb-2">Engagement Tips</h3>
                      <p className="text-gray-600 whitespace-pre-line">{optimization.contentStrategy.engagementTips}</p>
                    </div>
                  )}
                </div>
              </section>
            )}

            {/* Implementation Priorities */}
            {optimization.implementationPriorities && (
              <section className="mb-10">
                <h2 className="text-xl font-semibold text-gray-800 mb-4 pb-2 border-b border-gray-100">
                  Implementation Priorities
                </h2>
                <div className="bg-yellow-50 p-4 rounded-md border border-yellow-100 text-gray-800 whitespace-pre-line">
                  {optimization.implementationPriorities}
                </div>
              </section>
            )}

            {/* Action Button */}
            <div className="flex justify-between items-center mt-8">
              <Button
                variant="outline"
                className="flex items-center"
                onClick={() => navigate("/")}
              >
                <ChevronLeft className="mr-2 h-4 w-4" />
                Back to Home
              </Button>
              <Button 
                className="flex items-center"
                onClick={() => window.open("https://www.linkedin.com", "_blank")}
              >
                Go to LinkedIn
                <ExternalLink className="ml-2 h-4 w-4" />
              </Button>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}