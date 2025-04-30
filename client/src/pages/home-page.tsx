import { useAuth } from "@/hooks/use-auth";
import { useQuery } from "@tanstack/react-query";
import { FreshnessReport, LinkedinOptimization, Sli, UserProfile } from "@shared/schema";
import { useToast } from "@/hooks/use-toast";
import { useLocation } from "wouter";
import {
  Loader2,
  FileQuestion,
  ArrowRight,
  CheckCircle,
  Calendar,
  User,
  FileText,
  Award,
  CheckCircle2,
  Sparkles,
  AlertCircle,
  Info
} from "lucide-react";
import MonthlyCheckInWidget from "@/components/monthly-check-in-widget";
import { FreshnessReportWidget } from "@/components/freshness-report-widget";
import LinkedinOptimizationWidget from "@/components/linkedin-optimization/linkedin-optimization-widget";
import { Button } from "@/components/ui/button";
import { useEffect } from "react";
import NavBar from "@/components/nav-bar";
import { scrollToTop } from "@/lib/utils";
import { 
  Card, 
  CardContent, 
  CardDescription, 
  CardFooter, 
  CardHeader, 
  CardTitle 
} from "@/components/ui/card";
import { 
  Tooltip, 
  TooltipContent, 
  TooltipProvider, 
  TooltipTrigger 
} from "@/components/ui/tooltip";
import { Badge } from "@/components/ui/badge";

export default function HomePage() {
  const { user } = useAuth();
  const { toast } = useToast();
  const [_, navigate] = useLocation();

  // Fetch user profile data
  const {
    data: userProfile,
    isLoading,
    isError,
    error,
  } = useQuery<UserProfile>({
    queryKey: ["/api/user/profile"],
    enabled: !!user,
  });
  
  // Fetch the latest freshness report
  const { data: latestFreshnessReport } = useQuery<FreshnessReport>({
    queryKey: ["/api/freshness-reports/latest"],
    enabled: !!user,
    retry: false,
  });
  
  // Fetch user's selected SLI
  const { data: userSli, isLoading: sliLoading } = useQuery<Sli>({
    queryKey: ["/api/user/sli"],
    enabled: !!user,
    retry: false,
  });
  
  // Fetch all user's SLIs to check refined status and whether they exist
  const { data: userSlis, isLoading: slisLoading } = useQuery<Sli[]>({
    queryKey: ["/api/user/slis"],
    enabled: !!user,
    retry: false,
  });
  
  // Fetch the latest LinkedIn optimization
  const { data: latestLinkedinOptimization } = useQuery<LinkedinOptimization>({
    queryKey: ["/api/linkedin-optimizations/latest"],
    enabled: !!user,
    retry: false,
  });
  
  // Check if user has uploaded the required documents (resume and linkedin profile)
  const hasRequiredDocuments = userProfile?.documents?.some(doc => doc.type === 'resume') &&
                               userProfile?.documents?.some(doc => doc.type === 'linkedin');
  
  // Check if SLI exists and is selected/refined
  const hasSli = userSlis && userSlis.length > 0;
  const hasSliSelected = hasSli && userSlis[0]?.selectedSliIndex !== null;
  const hasSliRefined = hasSli && userSlis[0]?.refinedSliText !== null && userSlis[0]?.refinedSliText !== "";
  
  // Check if user can generate LinkedIn Optimization
  const canGenerateLinkedInOptimization = 
    hasRequiredDocuments && 
    (hasSliSelected || hasSliRefined) && 
    latestFreshnessReport !== undefined;

  useEffect(() => {
    if (isError && error) {
      toast({
        title: "Error",
        description: "Failed to load profile data. " + error.message,
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
          <span className="ml-2">Loading your profile...</span>
        </div>
      </div>
    );
  }

  const getStatusBadge = (isActive: boolean, isComplete: boolean) => {
    if (!isActive) {
      return (
        <Badge variant="outline" className="bg-muted text-muted-foreground border-muted">
          Locked
        </Badge>
      );
    }
    
    return isComplete ? (
      <Badge variant="outline" className="bg-success/10 text-success border-success/20">
        Completed
      </Badge>
    ) : (
      <Badge variant="outline" className="bg-warning/10 text-warning border-warning/20">
        Action Needed
      </Badge>
    );
  };

  const questionnaireBadge = getStatusBadge(
    true, 
    !!userProfile?.questionnaire && userProfile.questionnaire.isDraft !== true
  );
  
  const documentsBadge = getStatusBadge(
    !!userProfile?.questionnaire && userProfile.questionnaire.isDraft !== true,
    !!hasRequiredDocuments
  );
  
  const freshnessReportBadge = getStatusBadge(
    !!hasRequiredDocuments && !!userProfile?.questionnaire && userProfile.questionnaire.isDraft !== true,
    !!latestFreshnessReport
  );
  
  const sliBadge = getStatusBadge(
    true,
    !!hasSliSelected || !!hasSliRefined
  );
  
  const linkedInBadge = getStatusBadge(
    !!canGenerateLinkedInOptimization,
    !!latestLinkedinOptimization
  );
  
  const monthlyCheckInBadge = getStatusBadge(
    !!userProfile?.questionnaire && userProfile.questionnaire.isDraft !== true,
    false // Always available once questionnaire is completed
  );
  
  const coachingBadge = getStatusBadge(
    !!userProfile?.questionnaire && userProfile.questionnaire.isDraft !== true && !!hasRequiredDocuments,
    false // Always available once prerequisites are met
  );

  return (
    <div className="min-h-screen bg-background flex flex-col">
      <NavBar />
      <main className="flex-1 max-w-7xl mx-auto px-4 sm:px-6 py-8">
        <div className="mb-6">
          <h1 className="text-2xl font-semibold text-foreground">
            Welcome, {user?.firstName}!
          </h1>
          <p className="text-muted-foreground mt-2">
            Your professional brand journey dashboard helps you track and improve your professional presence.
          </p>
        </div>
        
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {/* Questionnaire Section - Always first and visible */}
          <Card className={`overflow-hidden shadow-sm flex flex-col h-full ${
            userProfile?.questionnaire 
              ? userProfile.questionnaire.isDraft === true
                ? "border-amber-200"
                : "border-green-200" 
              : "border-orange-200"
          }`}>
            <CardHeader className={`pb-4 ${
              userProfile?.questionnaire 
                ? userProfile.questionnaire.isDraft === true
                  ? "bg-amber-50"
                  : "bg-green-50" 
                : "bg-orange-50"
            }`}>
              <div className="flex items-center justify-between">
                <div className="flex items-center">
                  <div className={`p-2 rounded-full mr-3 ${
                    userProfile?.questionnaire 
                      ? userProfile.questionnaire.isDraft === true
                        ? "bg-amber-100 text-amber-600"
                        : "bg-green-100 text-green-600" 
                      : "bg-orange-100 text-orange-600"
                  }`}>
                    {userProfile?.questionnaire 
                      ? userProfile.questionnaire.isDraft === true
                        ? <FileQuestion className="h-5 w-5" />
                        : <CheckCircle className="h-5 w-5" />
                      : <FileQuestion className="h-5 w-5" />
                    }
                  </div>
                  <CardTitle className="text-lg">
                    Professional Branding Assessment
                  </CardTitle>
                </div>
                {questionnaireBadge}
              </div>
              <CardDescription className="mt-2">
                {userProfile?.questionnaire
                  ? userProfile.questionnaire.isDraft === true
                    ? "You have a draft questionnaire that needs to be completed"
                    : "Your professional branding assessment is complete"
                  : "Start with this comprehensive assessment (~5 minutes)"}
              </CardDescription>
            </CardHeader>
            <CardContent className="p-5 flex-grow">
              <p className="text-sm text-muted-foreground mb-2">
                {userProfile?.questionnaire
                  ? userProfile.questionnaire.isDraft === true
                    ? "Continue where you left off to complete your assessment."
                    : "This information helps us understand your professional goals and aspirations."
                  : "This assessment helps customize your personal branding strategy and shapes your Single Lasting Impression (SLI)."}
              </p>
            </CardContent>
            <CardFooter className="bg-gray-50 py-3 px-5 mt-auto">
              <Button
                variant="outline"
                className={`w-full ${
                  userProfile?.questionnaire
                    ? userProfile.questionnaire.isDraft === true
                      ? "border-amber-500 text-amber-600 hover:bg-amber-50"
                      : "border-green-600 text-green-700 hover:bg-green-50"
                    : "border-orange-500 text-orange-600 hover:bg-orange-50"
                }`}
                onClick={() => {
                  scrollToTop();
                  navigate("/questionnaire");
                }}
              >
                {userProfile?.questionnaire
                  ? userProfile.questionnaire.isDraft === true
                    ? "Continue Questionnaire"
                    : "Review Questionnaire"
                  : "Start Questionnaire"}
                <ArrowRight className="ml-2 h-4 w-4" />
              </Button>
            </CardFooter>
          </Card>

          {/* Document Upload Section */}
          <Card className={`overflow-hidden shadow-sm flex flex-col h-full ${
            !userProfile?.questionnaire || userProfile.questionnaire.isDraft === true
              ? "border-gray-200 opacity-75"
              : !hasRequiredDocuments
                ? "border-blue-200"
                : "border-green-200"
          }`}>
            <CardHeader className={`pb-4 ${
              !userProfile?.questionnaire || userProfile.questionnaire.isDraft === true
                ? "bg-gray-50"
                : !hasRequiredDocuments
                  ? "bg-blue-50"
                  : "bg-green-50"
            }`}>
              <div className="flex items-center justify-between">
                <div className="flex items-center">
                  <div className={`p-2 rounded-full mr-3 ${
                    !userProfile?.questionnaire || userProfile.questionnaire.isDraft === true
                      ? "bg-gray-100 text-gray-500"
                      : !hasRequiredDocuments
                        ? "bg-blue-100 text-blue-600"
                        : "bg-green-100 text-green-600"
                  }`}>
                    <FileText className="h-5 w-5" />
                  </div>
                  <CardTitle className="text-lg">
                    Documents Upload
                  </CardTitle>
                </div>
                {documentsBadge}
              </div>
              <CardDescription className="mt-2">
                {!userProfile?.questionnaire || userProfile.questionnaire.isDraft === true
                  ? "Complete the questionnaire to unlock this section"
                  : !hasRequiredDocuments
                    ? "Upload your resume and LinkedIn profile"
                    : "All required documents have been uploaded"}
              </CardDescription>
            </CardHeader>
            <CardContent className="p-5 flex-grow">
              <div className={`${!userProfile?.questionnaire || userProfile.questionnaire.isDraft === true ? "opacity-50" : ""}`}>
                <ul className="space-y-3 text-sm">
                  <li className="flex items-center gap-2">
                    <div className={`rounded-full h-5 w-5 flex items-center justify-center text-xs font-bold ${
                      !userProfile?.questionnaire || userProfile.questionnaire.isDraft === true
                        ? "bg-gray-100 text-gray-600"
                        : "bg-blue-100 text-blue-600"
                    }`}>1</div>
                    <span className={`${!userProfile?.questionnaire || userProfile.questionnaire.isDraft === true ? "text-gray-500" : ""}`}>
                      Most Recent Resume
                    </span>
                    {userProfile?.documents?.some(doc => doc.type === 'resume') && (
                      <CheckCircle className="h-4 w-4 text-green-600 ml-auto" />
                    )}
                  </li>
                  
                  <li className="flex items-center gap-2">
                    <div className={`rounded-full h-5 w-5 flex items-center justify-center text-xs font-bold ${
                      !userProfile?.questionnaire || userProfile.questionnaire.isDraft === true
                        ? "bg-gray-100 text-gray-600"
                        : "bg-blue-100 text-blue-600"
                    }`}>2</div>
                    <span className={`${!userProfile?.questionnaire || userProfile.questionnaire.isDraft === true ? "text-gray-500" : ""}`}>
                      LinkedIn Profile PDF
                    </span>
                    {userProfile?.documents?.some(doc => doc.type === 'linkedin') && (
                      <CheckCircle className="h-4 w-4 text-green-600 ml-auto" />
                    )}
                  </li>
                </ul>
              </div>
            </CardContent>
            <CardFooter className="bg-gray-50 py-3 px-5 mt-auto">
              <Button
                variant="outline"
                className={`w-full ${
                  !userProfile?.questionnaire || userProfile.questionnaire.isDraft === true
                    ? "border-gray-300 text-gray-500 cursor-not-allowed"
                    : !hasRequiredDocuments
                      ? "border-blue-500 text-blue-600 hover:bg-blue-50"
                      : "border-green-500 text-green-700 hover:bg-green-50"
                }`}
                onClick={() => {
                  if (userProfile?.questionnaire && userProfile.questionnaire.isDraft !== true) {
                    scrollToTop();
                    navigate("/profile?tab=documents");
                  }
                }}
                disabled={!userProfile?.questionnaire || userProfile.questionnaire.isDraft === true}
              >
                {hasRequiredDocuments ? "View Documents" : "Upload Documents"}
                <FileText className="ml-2 h-4 w-4" />
              </Button>
            </CardFooter>
          </Card>
          
          {/* Profile Section */}
          <Card className={`overflow-hidden shadow-sm flex flex-col h-full ${
            !userProfile?.questionnaire
              ? "border-gray-200 opacity-75"
              : "border-primary/20"
          }`}>
            <CardHeader className={`pb-4 ${
              !userProfile?.questionnaire
                ? "bg-gray-50"
                : "bg-primary/5"
            }`}>
              <div className="flex items-center justify-between">
                <div className="flex items-center">
                  <div className={`p-2 rounded-full mr-3 ${
                    !userProfile?.questionnaire
                      ? "bg-gray-100 text-gray-500"
                      : "bg-primary/10 text-primary"
                  }`}>
                    <User className="h-5 w-5" />
                  </div>
                  <CardTitle className="text-lg">
                    Your Professional Profile
                  </CardTitle>
                </div>
                <Badge variant="outline" className={`${
                  !userProfile?.questionnaire
                    ? "bg-muted text-muted-foreground"
                    : "bg-primary/10 text-primary"
                }`}>
                  {userProfile?.questionnaire ? "Available" : "Unavailable"}
                </Badge>
              </div>
              <CardDescription className="mt-2">
                {!userProfile?.questionnaire
                  ? "Complete the questionnaire to see your profile"
                  : "View and manage your professional profile details"}
              </CardDescription>
            </CardHeader>
            <CardContent className="p-5 flex-grow">
              <p className={`text-sm ${!userProfile?.questionnaire ? "text-muted-foreground/70" : "text-muted-foreground"}`}>
                {!userProfile?.questionnaire
                  ? "Your profile will be created after completing the questionnaire"
                  : userProfile.questionnaire.isDraft === true
                    ? "Your profile is based on your draft questionnaire"
                    : "Your profile reflects information from your completed questionnaire"}
              </p>
            </CardContent>
            <CardFooter className="bg-gray-50 py-3 px-5 mt-auto">
              <Button
                variant="outline"
                className={`w-full ${
                  !userProfile?.questionnaire
                    ? "border-gray-300 text-gray-500 cursor-not-allowed"
                    : "border-primary text-primary hover:bg-primary/5"
                }`}
                onClick={() => {
                  if (userProfile?.questionnaire) {
                    scrollToTop();
                    navigate("/profile");
                  }
                }}
                disabled={!userProfile?.questionnaire}
              >
                View Profile
                <ArrowRight className="ml-2 h-4 w-4" />
              </Button>
            </CardFooter>
          </Card>
          
          {/* Strategy Session (Coaching) Section */}
          <Card className={`overflow-hidden shadow-sm flex flex-col h-full ${
            !userProfile?.questionnaire || userProfile.questionnaire.isDraft === true || !hasRequiredDocuments
              ? "border-gray-200 opacity-75"
              : "border-success/20"
          }`}>
            <CardHeader className={`pb-4 ${
              !userProfile?.questionnaire || userProfile.questionnaire.isDraft === true || !hasRequiredDocuments
                ? "bg-gray-50"
                : "bg-success/5"
            }`}>
              <div className="flex items-center justify-between">
                <div className="flex items-center">
                  <div className={`p-2 rounded-full mr-3 ${
                    !userProfile?.questionnaire || userProfile.questionnaire.isDraft === true || !hasRequiredDocuments
                      ? "bg-gray-100 text-gray-500"
                      : "bg-success/10 text-success"
                  }`}>
                    <Calendar className="h-5 w-5" />
                  </div>
                  <CardTitle className="text-lg">
                    Schedule Strategy Session
                  </CardTitle>
                </div>
                {coachingBadge}
              </div>
              <CardDescription className="mt-2">
                {!userProfile?.questionnaire
                  ? "Complete the questionnaire to unlock strategy sessions"
                  : userProfile.questionnaire.isDraft === true
                    ? "Finish your questionnaire to schedule strategy sessions"
                    : !hasRequiredDocuments
                      ? "Upload your documents to schedule strategy sessions"
                      : "Book a session to sharpen your professional positioning"}
              </CardDescription>
            </CardHeader>
            <CardContent className="p-5 flex-grow">
              <p className={`text-sm ${!userProfile?.questionnaire || userProfile.questionnaire.isDraft === true || !hasRequiredDocuments ? "text-muted-foreground/70" : "text-muted-foreground"}`}>
                {!userProfile?.questionnaire || userProfile.questionnaire.isDraft === true || !hasRequiredDocuments
                  ? `You must ${!userProfile?.questionnaire ? "complete the questionnaire" : userProfile.questionnaire.isDraft === true ? "complete the questionnaire" : "upload your documents"} first`
                  : "Stand out in your market with clarity and confidence. These sessions help you define your professional presence."}
              </p>
            </CardContent>
            <CardFooter className="bg-gray-50 py-3 px-5 mt-auto">
              <Button
                variant="outline"
                className={`w-full ${
                  !userProfile?.questionnaire || userProfile.questionnaire.isDraft === true || !hasRequiredDocuments
                    ? "border-gray-300 text-gray-500 cursor-not-allowed"
                    : "border-success text-success hover:bg-success/5"
                }`}
                onClick={() => {
                  if (userProfile?.questionnaire && userProfile.questionnaire.isDraft !== true && hasRequiredDocuments) {
                    scrollToTop();
                    navigate("/chat");
                  }
                }}
                disabled={!userProfile?.questionnaire || userProfile.questionnaire.isDraft === true || !hasRequiredDocuments}
              >
                Schedule Coaching Session
                <ArrowRight className="ml-2 h-4 w-4" />
              </Button>
            </CardFooter>
          </Card>

          {/* Freshness Report Section */}
          <Card className={`overflow-hidden shadow-sm flex flex-col h-full ${
            !userProfile?.questionnaire || userProfile.questionnaire.isDraft === true || !hasRequiredDocuments
              ? "border-gray-200 opacity-75"
              : "border-info/20"
          }`}>
            <CardHeader className={`pb-4 ${
              !userProfile?.questionnaire || userProfile.questionnaire.isDraft === true || !hasRequiredDocuments
                ? "bg-gray-50"
                : "bg-info/5"
            }`}>
              <div className="flex items-center justify-between">
                <div className="flex items-center">
                  <div className={`p-2 rounded-full mr-3 ${
                    !userProfile?.questionnaire || userProfile.questionnaire.isDraft === true || !hasRequiredDocuments
                      ? "bg-gray-100 text-gray-500"
                      : "bg-info/10 text-info"
                  }`}>
                    <Sparkles className="h-5 w-5" />
                  </div>
                  <CardTitle className="text-lg">
                    Freshness Report
                  </CardTitle>
                </div>
                {freshnessReportBadge}
              </div>
              <CardDescription className="mt-2">
                {!userProfile?.questionnaire || userProfile.questionnaire.isDraft === true
                  ? "Complete the questionnaire to unlock freshness report"
                  : !hasRequiredDocuments
                    ? "Upload your documents to generate a freshness report"
                    : latestFreshnessReport
                      ? `Last report: ${new Date(latestFreshnessReport.createdAt).toLocaleDateString()}`
                      : "Generate a comprehensive analysis of your brand presence"}
              </CardDescription>
            </CardHeader>
            <CardContent className="p-5 flex-grow">
              <div className={`${!userProfile?.questionnaire || userProfile.questionnaire.isDraft === true || !hasRequiredDocuments ? "opacity-50" : ""}`}>
                <ul className="space-y-3 text-sm">
                  <li className="flex items-center gap-2">
                    <span className={`mr-2 ${userProfile?.questionnaire && userProfile.questionnaire.isDraft !== true ? 'text-success' : 'text-muted-foreground/50'}`}>
                      {userProfile?.questionnaire && userProfile.questionnaire.isDraft !== true ? '✓' : '→'}
                    </span>
                    <span className={`${!userProfile?.questionnaire || userProfile.questionnaire.isDraft === true ? "text-muted-foreground/50" : "text-muted-foreground"}`}>
                      Complete professional questionnaire
                    </span>
                  </li>
                  <li className="flex items-center gap-2">
                    <span className={`mr-2 ${hasRequiredDocuments ? 'text-success' : 'text-warning'}`}>
                      {hasRequiredDocuments ? '✓' : '→'}
                    </span>
                    <span className={`${!hasRequiredDocuments ? "text-muted-foreground/50" : "text-muted-foreground"}`}>
                      Upload resume and LinkedIn profile
                    </span>
                  </li>
                </ul>
              </div>
            </CardContent>
            <CardFooter className="bg-gray-50 py-3 px-5 mt-auto">
              <Button
                variant="outline"
                className={`w-full ${
                  !userProfile?.questionnaire || userProfile.questionnaire.isDraft === true || !hasRequiredDocuments
                    ? "border-gray-300 text-gray-500 cursor-not-allowed"
                    : "border-info text-info hover:bg-info/5"
                }`}
                onClick={() => {
                  if (userProfile?.questionnaire && userProfile.questionnaire.isDraft !== true && hasRequiredDocuments) {
                    scrollToTop();
                    navigate("/freshness-report");
                  }
                }}
                disabled={!userProfile?.questionnaire || userProfile.questionnaire.isDraft === true || !hasRequiredDocuments}
              >
                {latestFreshnessReport ? "View Report" : "Generate Report"}
                <ArrowRight className="ml-2 h-4 w-4" />
              </Button>
            </CardFooter>
          </Card>
          
          {/* SLI Section */}
          <Card className={`overflow-hidden shadow-sm ${
            !hasSli
              ? "border-gray-200 opacity-75"
              : "border-primary/20"
          }`}>
            <CardHeader className={`pb-4 ${
              !hasSli
                ? "bg-gray-50"
                : "bg-primary/5"
            }`}>
              <div className="flex items-center justify-between">
                <div className="flex items-center">
                  <div className={`p-2 rounded-full mr-3 ${
                    !hasSli
                      ? "bg-gray-100 text-gray-500"
                      : "bg-primary/10 text-primary"
                  }`}>
                    <Award className="h-5 w-5" />
                  </div>
                  <CardTitle className="text-lg">
                    Single Lasting Impression
                  </CardTitle>
                </div>
                {sliBadge}
              </div>
              <CardDescription className="mt-2">
                {!hasSli
                  ? "SLI options will be generated for you"
                  : hasSliRefined
                    ? "Your SLI has been refined and is ready to use"
                    : hasSliSelected
                      ? "You've selected your SLI, consider refining it"
                      : "Select your preferred SLI option"}
              </CardDescription>
            </CardHeader>
            <CardContent className="p-5">
              {hasSli && (hasSliSelected || hasSliRefined) ? (
                <div className="mb-3">
                  <h3 className="font-medium text-sm text-gray-700 mb-2">
                    {hasSliRefined ? "Your Refined SLI" : "Your Selected SLI"}:
                  </h3>
                  <div className="p-3 bg-white border border-primary/10 rounded-md">
                    <p className="text-sm font-medium text-gray-800">
                      {hasSliRefined 
                        ? userSlis[0].refinedSliText 
                        : userSlis[0].selectedSliIndex === 1 
                          ? userSlis[0].statement1 
                          : userSlis[0].selectedSliIndex === 2 
                            ? userSlis[0].statement2 
                            : userSlis[0].statement3}
                    </p>
                  </div>
                </div>
              ) : (
                <p className={`text-sm ${!hasSli ? "text-gray-400" : "text-gray-600"}`}>
                  {!hasSli
                    ? "SLI options will become available as you complete your profile"
                    : "Your SLI is a concise statement that captures your professional essence. Select one that resonates with you."}
                </p>
              )}
            </CardContent>
            <CardFooter className="bg-gray-50 py-3 px-5">
              <div className="w-full grid grid-cols-1 gap-2">
                <Button
                  className={`w-full ${
                    !hasSli
                      ? "bg-gray-100 text-gray-500 cursor-not-allowed"
                      : "bg-primary hover:bg-primary/90"
                  }`}
                  onClick={() => {
                    if (hasSli) {
                      scrollToTop();
                      navigate("/sli-selection");
                    }
                  }}
                  disabled={!hasSli}
                >
                  {hasSliSelected ? "View Selected SLI" : "Select Your SLI"}
                  <ArrowRight className="ml-2 h-4 w-4" />
                </Button>
                
                {hasSliSelected && (
                  <Button
                    variant="outline"
                    className={`w-full border-primary/50 text-primary hover:bg-primary/5`}
                    onClick={() => {
                      scrollToTop();
                      navigate("/sli-refinement");
                    }}
                  >
                    {hasSliRefined ? "View Refined SLI" : "Refine Your SLI"}
                    <Sparkles className="ml-2 h-4 w-4" />
                  </Button>
                )}
              </div>
            </CardFooter>
          </Card>
          
          {/* LinkedIn Optimization Section */}
          <Card className={`overflow-hidden shadow-sm ${
            !canGenerateLinkedInOptimization
              ? "border-gray-200 opacity-75"
              : "border-blue-200"
          }`}>
            <CardHeader className={`pb-4 ${
              !canGenerateLinkedInOptimization
                ? "bg-gray-50"
                : "bg-blue-50"
            }`}>
              <div className="flex items-center justify-between">
                <div className="flex items-center">
                  <div className={`p-2 rounded-full mr-3 ${
                    !canGenerateLinkedInOptimization
                      ? "bg-gray-100 text-gray-500"
                      : "bg-blue-100 text-blue-600"
                  }`}>
                    <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 24 24" fill="currentColor">
                      <path d="M19 3a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h14m-.5 15.5v-5.3a3.26 3.26 0 0 0-3.26-3.26c-.85 0-1.84.52-2.32 1.3v-1.11h-2.79v8.37h2.79v-4.93c0-.77.62-1.4 1.39-1.4a1.4 1.4 0 0 1 1.4 1.4v4.93h2.79M6.88 8.56a1.68 1.68 0 0 0 1.68-1.68c0-.93-.75-1.69-1.68-1.69a1.69 1.69 0 0 0-1.69 1.69c0 .93.76 1.68 1.69 1.68m1.39 9.94v-8.37H5.5v8.37h2.77z" />
                    </svg>
                  </div>
                  <CardTitle className="text-lg">
                    LinkedIn Optimization
                  </CardTitle>
                </div>
                {linkedInBadge}
              </div>
              <CardDescription className="mt-2">
                {!canGenerateLinkedInOptimization
                  ? getLinkedInRequirementsMessage(hasRequiredDocuments, hasSliSelected || hasSliRefined, !!latestFreshnessReport)
                  : latestLinkedinOptimization
                    ? `Generated ${formatTimeAgo(latestLinkedinOptimization.createdAt)}`
                    : "Enhance your LinkedIn profile with AI-powered recommendations"}
              </CardDescription>
            </CardHeader>
            <CardContent className="p-5">
              {!canGenerateLinkedInOptimization ? (
                <div className="space-y-3 text-sm text-gray-400">
                  <div className="flex items-center gap-2">
                    <CheckCircle className={`h-4 w-4 ${hasRequiredDocuments ? "text-green-500" : "text-gray-300"}`} />
                    <span>Upload resume and LinkedIn profile</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <CheckCircle className={`h-4 w-4 ${(hasSliSelected || hasSliRefined) ? "text-green-500" : "text-gray-300"}`} />
                    <span>Select or refine your SLI</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <CheckCircle className={`h-4 w-4 ${latestFreshnessReport ? "text-green-500" : "text-gray-300"}`} />
                    <span>Generate a freshness report</span>
                  </div>
                </div>
              ) : latestLinkedinOptimization ? (
                <div className="space-y-3">
                  {latestLinkedinOptimization.headlineOptimization?.recommendedHeadline && (
                    <div>
                      <h3 className="font-medium text-sm text-gray-700 mb-1">Headline Recommendation:</h3>
                      <p className="text-sm text-gray-800 line-clamp-2">{latestLinkedinOptimization.headlineOptimization.recommendedHeadline}</p>
                    </div>
                  )}
                  {latestLinkedinOptimization.alignmentAssessment && (
                    <div>
                      <h3 className="font-medium text-sm text-gray-700 mb-1">SLI Alignment:</h3>
                      <p className="text-sm text-gray-600 line-clamp-2">{latestLinkedinOptimization.alignmentAssessment}</p>
                    </div>
                  )}
                </div>
              ) : (
                <p className="text-sm text-gray-600">
                  Get personalized recommendations to align your LinkedIn profile with your SLI and improve your professional presence.
                </p>
              )}
            </CardContent>
            <CardFooter className="bg-gray-50 py-3 px-5">
              <Button
                className={`w-full ${
                  !canGenerateLinkedInOptimization
                    ? "bg-gray-100 text-gray-500 cursor-not-allowed"
                    : latestLinkedinOptimization
                      ? "border-blue-500 text-blue-700 hover:bg-blue-50"
                      : "bg-blue-600 hover:bg-blue-700"
                }`}
                variant={latestLinkedinOptimization ? "outline" : "default"}
                onClick={() => {
                  if (canGenerateLinkedInOptimization) {
                    scrollToTop();
                    navigate(latestLinkedinOptimization 
                      ? `/linkedin-optimization/${latestLinkedinOptimization.id}` 
                      : "/linkedin-optimization/generate");
                  }
                }}
                disabled={!canGenerateLinkedInOptimization}
              >
                {latestLinkedinOptimization ? "View Optimization" : "Generate Optimization"}
                <ArrowRight className="ml-2 h-4 w-4" />
              </Button>
            </CardFooter>
          </Card>
          
          {/* Monthly Check-In Section */}
          <Card className={`overflow-hidden shadow-sm ${
            !userProfile?.questionnaire || userProfile.questionnaire.isDraft === true
              ? "border-gray-200 opacity-75"
              : "border-blue-200"
          }`}>
            <CardHeader className={`pb-4 ${
              !userProfile?.questionnaire || userProfile.questionnaire.isDraft === true
                ? "bg-gray-50"
                : "bg-blue-50"
            }`}>
              <div className="flex items-center justify-between">
                <div className="flex items-center">
                  <div className={`p-2 rounded-full mr-3 ${
                    !userProfile?.questionnaire || userProfile.questionnaire.isDraft === true
                      ? "bg-gray-100 text-gray-500"
                      : "bg-blue-100 text-blue-600"
                  }`}>
                    <Calendar className="h-5 w-5" />
                  </div>
                  <CardTitle className="text-lg">
                    Monthly Brand Check-In
                  </CardTitle>
                </div>
                {monthlyCheckInBadge}
              </div>
              <CardDescription className="mt-2">
                {!userProfile?.questionnaire || userProfile.questionnaire.isDraft === true
                  ? "Complete the questionnaire to unlock monthly check-ins"
                  : "Track your LinkedIn activity and professional growth"}
              </CardDescription>
            </CardHeader>
            <CardContent className="p-5">
              {userProfile?.questionnaire && userProfile.questionnaire.isDraft !== true ? (
                <MonthlyCheckInWidgetContent userId={user?.id || 0} />
              ) : (
                <p className="text-sm text-gray-400">
                  Monthly check-ins help you stay consistent and track your professional growth over time.
                </p>
              )}
            </CardContent>
            <CardFooter className="bg-gray-50 py-3 px-5">
              <Button
                className={`w-full ${
                  !userProfile?.questionnaire || userProfile.questionnaire.isDraft === true
                    ? "bg-gray-100 text-gray-500 cursor-not-allowed"
                    : "bg-blue-600 hover:bg-blue-700"
                }`}
                onClick={() => {
                  if (userProfile?.questionnaire && userProfile.questionnaire.isDraft !== true) {
                    scrollToTop();
                    navigate("/monthly-check-in");
                  }
                }}
                disabled={!userProfile?.questionnaire || userProfile.questionnaire.isDraft === true}
              >
                Go to Monthly Check-In
                <ArrowRight className="ml-2 h-4 w-4" />
              </Button>
            </CardFooter>
          </Card>
        </div>
      </main>
    </div>
  );
}

// Helper function to format time ago
function formatTimeAgo(dateString?: string | Date): string {
  if (!dateString) return "recently";
  
  try {
    const date = typeof dateString === 'string' ? new Date(dateString) : dateString;
    const now = new Date();
    const diffInSeconds = Math.floor((now.getTime() - date.getTime()) / 1000);
    
    if (diffInSeconds < 60) return "just now";
    if (diffInSeconds < 3600) return `${Math.floor(diffInSeconds / 60)} minutes ago`;
    if (diffInSeconds < 86400) return `${Math.floor(diffInSeconds / 3600)} hours ago`;
    if (diffInSeconds < 604800) return `${Math.floor(diffInSeconds / 86400)} days ago`;
    if (diffInSeconds < 2592000) return `${Math.floor(diffInSeconds / 604800)} weeks ago`;
    
    // Default to a formatted date for longer periods
    return date.toLocaleDateString();
  } catch (e) {
    return "recently";
  }
}

// Helper function for LinkedIn requirement messages
function getLinkedInRequirementsMessage(
  hasDocuments: boolean, 
  hasSli: boolean, 
  hasFreshnessReport: boolean
): string {
  if (!hasDocuments && !hasSli && !hasFreshnessReport) {
    return "Complete prerequisites to unlock LinkedIn optimization";
  }
  
  if (!hasDocuments) {
    return "Upload your resume and LinkedIn profile first";
  }
  
  if (!hasSli) {
    return "Select or refine your SLI first";
  }
  
  if (!hasFreshnessReport) {
    return "Generate a freshness report first";
  }
  
  return "Almost ready for LinkedIn optimization";
}

// Monthly Check-In Widget Content Component
function MonthlyCheckInWidgetContent({ userId }: { userId: number }) {
  // Fetch user's monthly check-ins
  const { data: checkIns, isLoading } = useQuery<any[]>({
    queryKey: ["/api/monthly-check-ins"],
    enabled: !!userId,
  });

  // Format month for display
  const formatMonth = (monthStr: string) => {
    const [year, month] = monthStr.split('-');
    const date = new Date(parseInt(year), parseInt(month) - 1);
    return date.toLocaleString('default', { month: 'long', year: 'numeric' });
  };

  // Check if a check-in exists for the current month
  const getCurrentMonth = () => {
    const now = new Date();
    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, '0');
    return `${year}-${month}`;
  };

  const currentMonth = getCurrentMonth();
  
  const hasCurrentMonthCheckIn = checkIns?.some(
    checkIn => checkIn.month === currentMonth
  );

  // Get most recent check-in
  const mostRecentCheckIn = checkIns?.sort((a, b) => 
    new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
  )[0];

  const hasCompletedAnyCheckIn = checkIns && checkIns.length > 0;

  if (isLoading) {
    return <p className="text-sm text-gray-500">Loading check-in data...</p>;
  }

  return (
    <div className="space-y-3 text-sm">
      {hasCurrentMonthCheckIn ? (
        <>
          <div className="flex items-center text-green-600 gap-2">
            <CheckCircle className="h-4 w-4" />
            <span className="font-medium">Completed for {formatMonth(currentMonth)}</span>
          </div>
          <p className="text-gray-600">
            Great job maintaining your professional presence! Your next check-in will be available next month.
          </p>
        </>
      ) : hasCompletedAnyCheckIn ? (
        <p className="text-gray-600">
          Time for your monthly check-in! Your last check-in was for <span className="font-medium">{formatMonth(mostRecentCheckIn?.month || '')}</span>.
        </p>
      ) : (
        <p className="text-gray-600">
          Track your LinkedIn activity each month to measure your professional brand growth. This 5-minute check-in helps you stay consistent.
        </p>
      )}
    </div>
  );
}
