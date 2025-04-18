import React from "react";
import { useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Sparkles } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

interface FreshnessReportWidgetProps {
  userHasQuestionnaire: boolean;
  userHasRequiredDocuments: boolean;
  latestReportDate?: Date;
}

export const FreshnessReportWidget: React.FC<FreshnessReportWidgetProps> = ({
  userHasQuestionnaire,
  userHasRequiredDocuments,
  latestReportDate
}) => {
  const [, navigate] = useLocation();
  const { toast } = useToast();

  const handleGenerateReport = () => {
    if (!userHasQuestionnaire) {
      toast({
        title: "Questionnaire Required",
        description: "Please complete your questionnaire before generating a Freshness Report.",
        variant: "destructive"
      });
      navigate("/questionnaire-simple");
      return;
    }

    if (!userHasRequiredDocuments) {
      toast({
        title: "Documents Required",
        description: "Please upload your resume and LinkedIn profile before generating a Freshness Report.",
        variant: "destructive"
      });
      // Navigate to document upload page when created
      navigate("/profile");
      return;
    }

    // Navigate to the freshness report page (we'll create this next)
    navigate("/freshness-report");
  };

  return (
    <Card className="shadow-md">
      <CardHeader className="pb-2">
        <CardTitle className="text-lg flex items-center">
          <Sparkles className="h-5 w-5 mr-2 text-blue-500" />
          Professional Brand Assessment
        </CardTitle>
        <CardDescription>
          Get a comprehensive analysis of your professional brand presence
        </CardDescription>
      </CardHeader>
      <CardContent className="pb-2">
        <p className="text-sm text-muted-foreground">
          {latestReportDate 
            ? `Last report generated on ${new Date(latestReportDate).toLocaleDateString()}`
            : "No reports generated yet"}
        </p>
        <ul className="mt-2 text-sm space-y-1">
          <li className="flex items-start">
            <span className={`mr-2 ${userHasQuestionnaire ? 'text-green-500' : 'text-amber-500'}`}>
              {userHasQuestionnaire ? '✓' : '→'}
            </span>
            Complete professional questionnaire
          </li>
          <li className="flex items-start">
            <span className={`mr-2 ${userHasRequiredDocuments ? 'text-green-500' : 'text-amber-500'}`}>
              {userHasRequiredDocuments ? '✓' : '→'}
            </span>
            Upload resume and LinkedIn profile
          </li>
        </ul>
      </CardContent>
      <CardFooter>
        <Button 
          onClick={handleGenerateReport} 
          className="w-full"
          variant={latestReportDate ? "outline" : "default"}
        >
          {latestReportDate ? "Generate New Report" : "Generate Report"}
        </Button>
      </CardFooter>
    </Card>
  );
};