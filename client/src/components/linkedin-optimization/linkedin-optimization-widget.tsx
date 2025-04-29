import { useState } from "react";
import { useLocation } from "wouter";
import { ArrowRight, FileText, Award, BarChart4, Linkedin } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter } from "@/components/ui/card";
import { formatDate, scrollToTop } from "@/lib/utils";
import { LinkedinOptimization } from "@shared/schema";

interface LinkedinOptimizationWidgetProps {
  userHasQuestionnaire: boolean;
  userHasRequiredDocuments: boolean;
  userHasSli: boolean;
  userHasFreshnessReport: boolean;
  latestLinkedinOptimization?: LinkedinOptimization;
}

export default function LinkedinOptimizationWidget({
  userHasQuestionnaire,
  userHasRequiredDocuments,
  userHasSli,
  userHasFreshnessReport,
  latestLinkedinOptimization
}: LinkedinOptimizationWidgetProps) {
  const [_, navigate] = useLocation();

  // All requirements must be met to generate optimization
  const allRequirementsMet = userHasQuestionnaire && userHasRequiredDocuments && userHasSli && userHasFreshnessReport;

  // Check if there is a latest optimization
  const hasOptimization = !!latestLinkedinOptimization;

  // Format the date from the latest optimization
  const formattedDate = hasOptimization && latestLinkedinOptimization?.createdAt
    ? formatDate(new Date(latestLinkedinOptimization.createdAt))
    : null;

  return (
    <Card className={hasOptimization ? "bg-[#f0f5ff] border-blue-200" : "bg-[#f5f7ff] border-blue-100"}>
      <CardHeader className="pb-2">
        <div className="flex items-center">
          <div className={`p-3 rounded-full ${hasOptimization ? "bg-blue-200 text-blue-700" : "bg-blue-100 text-blue-500"} mr-4`}>
            <Linkedin className="h-6 w-6" />
          </div>
          <div>
            <CardTitle className="text-lg font-medium text-[#333333]">
              LinkedIn Profile Optimization
            </CardTitle>
            <CardDescription className="text-gray-600">
              {hasOptimization 
                ? `Last optimized on ${formattedDate}`
                : "Enhance your LinkedIn profile to make a stronger professional impact"}
            </CardDescription>
          </div>
        </div>
      </CardHeader>
      <CardContent className="pt-4 pb-2">
        {hasOptimization ? (
          <div className="space-y-4">
            <p className="text-gray-700">
              Your latest optimization includes recommendations for:
            </p>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {latestLinkedinOptimization?.headlineOptimization && (
                <div className="bg-white rounded-md p-3 border border-blue-100 flex items-start">
                  <div className="p-2 bg-blue-50 rounded-full text-blue-600 mr-3">
                    <FileText className="h-4 w-4" />
                  </div>
                  <div>
                    <h3 className="font-medium text-gray-700 text-sm">Headline Optimization</h3>
                    <p className="text-xs text-gray-500">Enhance your professional headline</p>
                  </div>
                </div>
              )}
              {latestLinkedinOptimization?.aboutSection && (
                <div className="bg-white rounded-md p-3 border border-blue-100 flex items-start">
                  <div className="p-2 bg-blue-50 rounded-full text-blue-600 mr-3">
                    <FileText className="h-4 w-4" />
                  </div>
                  <div>
                    <h3 className="font-medium text-gray-700 text-sm">About Section</h3>
                    <p className="text-xs text-gray-500">Improve your professional story</p>
                  </div>
                </div>
              )}
              {latestLinkedinOptimization?.contentStrategy && (
                <div className="bg-white rounded-md p-3 border border-blue-100 flex items-start">
                  <div className="p-2 bg-blue-50 rounded-full text-blue-600 mr-3">
                    <FileText className="h-4 w-4" />
                  </div>
                  <div>
                    <h3 className="font-medium text-gray-700 text-sm">Content Strategy</h3>
                    <p className="text-xs text-gray-500">Build your thought leadership</p>
                  </div>
                </div>
              )}
              {latestLinkedinOptimization?.profileEnhancements && (
                <div className="bg-white rounded-md p-3 border border-blue-100 flex items-start">
                  <div className="p-2 bg-blue-50 rounded-full text-blue-600 mr-3">
                    <FileText className="h-4 w-4" />
                  </div>
                  <div>
                    <h3 className="font-medium text-gray-700 text-sm">Profile Enhancements</h3>
                    <p className="text-xs text-gray-500">Strengthen your overall presence</p>
                  </div>
                </div>
              )}
            </div>
          </div>
        ) : (
          <div className="space-y-4">
            <p className="text-gray-700">
              Get tailored recommendations to optimize your LinkedIn profile and enhance your professional brand.
            </p>
            <div className="space-y-2 text-sm text-gray-600">
              <div className="flex items-start">
                <div className={`p-1.5 rounded-full mr-2 mt-0.5 ${userHasRequiredDocuments ? "bg-green-100 text-green-600" : "bg-gray-100 text-gray-400"}`}>
                  <FileText className="h-3.5 w-3.5" />
                </div>
                <span>Resume & LinkedIn Profile {userHasRequiredDocuments ? "✓" : "required"}</span>
              </div>
              <div className="flex items-start">
                <div className={`p-1.5 rounded-full mr-2 mt-0.5 ${userHasSli ? "bg-green-100 text-green-600" : "bg-gray-100 text-gray-400"}`}>
                  <Award className="h-3.5 w-3.5" />
                </div>
                <span>Single Lasting Impression (SLI) {userHasSli ? "✓" : "required"}</span>
              </div>
              <div className="flex items-start">
                <div className={`p-1.5 rounded-full mr-2 mt-0.5 ${userHasFreshnessReport ? "bg-green-100 text-green-600" : "bg-gray-100 text-gray-400"}`}>
                  <BarChart4 className="h-3.5 w-3.5" />
                </div>
                <span>Freshness Report {userHasFreshnessReport ? "✓" : "required"}</span>
              </div>
            </div>
          </div>
        )}
      </CardContent>
      <CardFooter className="pt-2">
        <div className="flex flex-wrap gap-3">
          {hasOptimization ? (
            <>
              <Button
                className="flex items-center bg-blue-600 hover:bg-blue-700"
                onClick={() => {
                  scrollToTop();
                  navigate(`/linkedin-optimization/${latestLinkedinOptimization.id}`);
                }}
              >
                View Optimization
                <ArrowRight className="ml-2 h-4 w-4" />
              </Button>
              <Button
                variant="outline"
                className="flex items-center border-blue-300 text-blue-700 hover:bg-blue-50"
                onClick={() => {
                  scrollToTop();
                  navigate("/linkedin-optimization/generate");
                }}
              >
                Generate New
                <ArrowRight className="ml-2 h-4 w-4" />
              </Button>
            </>
          ) : (
            <Button
              className={`flex items-center ${allRequirementsMet ? "bg-blue-600 hover:bg-blue-700" : "bg-gray-400 cursor-not-allowed"}`}
              onClick={() => {
                if (allRequirementsMet) {
                  scrollToTop();
                  navigate("/linkedin-optimization/generate");
                }
              }}
              disabled={!allRequirementsMet}
            >
              Generate Optimization
              <ArrowRight className="ml-2 h-4 w-4" />
            </Button>
          )}
        </div>
      </CardFooter>
    </Card>
  );
}