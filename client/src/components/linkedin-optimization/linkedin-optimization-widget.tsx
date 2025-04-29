import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Loader2, Briefcase, ArrowRight, Info } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { Document, FreshnessReport, LinkedinOptimization, Sli } from "@shared/schema";
import { scrollToTop } from "@/lib/utils";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";

interface LinkedinOptimizationWidgetProps {
  userHasQuestionnaire: boolean;
  userHasRequiredDocuments: boolean;
  userHasSli: boolean;
  userHasFreshnessReport: boolean;
  latestLinkedinOptimization?: LinkedinOptimization;
}

export function LinkedinOptimizationWidget({
  userHasQuestionnaire,
  userHasRequiredDocuments,
  userHasSli,
  userHasFreshnessReport,
  latestLinkedinOptimization,
}: LinkedinOptimizationWidgetProps) {
  const [_, navigate] = useLocation();

  // Check if all prerequisites are met
  const allPrerequisitesMet = userHasQuestionnaire && userHasRequiredDocuments && userHasSli && userHasFreshnessReport;

  // Format the date if available
  const formatDate = (date?: Date) => {
    if (!date) return "N/A";
    return new Intl.DateTimeFormat("en-US", {
      year: "numeric",
      month: "long",
      day: "numeric",
    }).format(date);
  };

  // Get the date of the latest optimization
  const optimizationDate = latestLinkedinOptimization?.createdAt
    ? new Date(latestLinkedinOptimization.createdAt)
    : undefined;

  return (
    <div className="bg-[#f7fbff] border border-blue-200 rounded-lg p-6">
      <div className="flex items-start">
        <div className="p-3 rounded-full bg-blue-100 text-blue-600 mr-4">
          <Briefcase className="h-6 w-6" />
        </div>
        <div className="flex-1">
          <div className="flex items-center mb-2">
            <h2 className="text-lg font-medium text-[#333333]">
              LinkedIn Optimization
            </h2>
            {!allPrerequisitesMet && (
              <TooltipProvider>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Info className="h-4 w-4 ml-2 text-blue-500" />
                  </TooltipTrigger>
                  <TooltipContent className="max-w-sm">
                    <p>
                      This section will unlock once you've uploaded your resume and 
                      LinkedIn profile, selected/refined your SLI, and generated a 
                      Freshness Report.
                    </p>
                  </TooltipContent>
                </Tooltip>
              </TooltipProvider>
            )}
          </div>

          {latestLinkedinOptimization ? (
            <>
              <p className="text-gray-600 mb-2">
                Your LinkedIn profile optimization recommendations are ready. These personalized 
                suggestions will help strengthen your professional presence.
              </p>
              <p className="text-sm text-blue-700 mb-4">
                Generated on {formatDate(optimizationDate)}
              </p>
              <Button
                className="flex items-center bg-blue-600 hover:bg-blue-700"
                onClick={() => {
                  scrollToTop();
                  navigate("/linkedin-optimization");
                }}
              >
                View Optimization
                <ArrowRight className="ml-2 h-4 w-4" />
              </Button>
            </>
          ) : (
            <>
              <p className="text-gray-600 mb-4">
                {allPrerequisitesMet
                  ? "Get personalized recommendations to enhance your LinkedIn profile based on your SLI and professional details. Our AI analyzes your profile and suggests improvements for content, engagement, and networking."
                  : "Optimize your LinkedIn profile with personalized recommendations aligned with your professional brand. This feature will be available after completing the prerequisites."}
              </p>
              <Button
                className="flex items-center"
                disabled={!allPrerequisitesMet}
                onClick={() => {
                  scrollToTop();
                  navigate("/linkedin-optimization/generate");
                }}
              >
                {allPrerequisitesMet ? "Start Optimization" : "Prerequisites Required"}
                <ArrowRight className="ml-2 h-4 w-4" />
              </Button>
            </>
          )}

          {!allPrerequisitesMet && (
            <div className="mt-4 space-y-2">
              <h3 className="text-sm font-medium text-gray-700">Prerequisites:</h3>
              <ul className="space-y-1 text-sm">
                <li className="flex items-center">
                  <div className={`h-2 w-2 rounded-full mr-2 ${userHasQuestionnaire ? "bg-green-500" : "bg-gray-300"}`}></div>
                  <span className={userHasQuestionnaire ? "text-gray-700" : "text-gray-500"}>Complete the questionnaire</span>
                </li>
                <li className="flex items-center">
                  <div className={`h-2 w-2 rounded-full mr-2 ${userHasRequiredDocuments ? "bg-green-500" : "bg-gray-300"}`}></div>
                  <span className={userHasRequiredDocuments ? "text-gray-700" : "text-gray-500"}>Upload resume and LinkedIn profile</span>
                </li>
                <li className="flex items-center">
                  <div className={`h-2 w-2 rounded-full mr-2 ${userHasSli ? "bg-green-500" : "bg-gray-300"}`}></div>
                  <span className={userHasSli ? "text-gray-700" : "text-gray-500"}>Select or refine your SLI</span>
                </li>
                <li className="flex items-center">
                  <div className={`h-2 w-2 rounded-full mr-2 ${userHasFreshnessReport ? "bg-green-500" : "bg-gray-300"}`}></div>
                  <span className={userHasFreshnessReport ? "text-gray-700" : "text-gray-500"}>Generate a Freshness Report</span>
                </li>
              </ul>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}