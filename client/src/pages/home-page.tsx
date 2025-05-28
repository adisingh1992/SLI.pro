import { useAuth } from "@/hooks/use-auth";
import { useQuery } from "@tanstack/react-query";
import { FreshnessReport, LinkedinOptimization, Sli, UserProfile, ConversationSummary } from "@shared/schema";
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
  Sparkles,
  Phone,
  PenTool,
} from "lucide-react";
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
    staleTime: 0, // Always consider data stale so it refreshes when coming back to the page
    refetchOnWindowFocus: true, // Refetch when window regains focus
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
  
  // Fetch conversation summaries to check if user has completed any coaching conversations
  const { data: conversationSummaries } = useQuery<ConversationSummary[]>({
    queryKey: ["/api/conversation-summaries"],
    enabled: !!user,
    retry: false,
  });
  
  // Check if user has uploaded the required documents (resume and linkedin profile)
  const hasRequiredDocuments = userProfile?.documents?.some(doc => doc.type === 'resume') &&
                               userProfile?.documents?.some(doc => doc.type === 'linkedin');
  
  // Check if SLI exists and is selected/refined
  const hasSli = userSlis && Array.isArray(userSlis) && userSlis.length > 0;
  const hasSliSelected = hasSli && Array.isArray(userSlis) && userSlis[0] && userSlis[0].selectedSliIndex !== null;
  const hasSliRefined = hasSli && Array.isArray(userSlis) && userSlis[0] && userSlis[0].refinedSliText !== null && userSlis[0].refinedSliText !== "";
  
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
    !!hasSliSelected || !!hasSliRefined,
    !!hasSliSelected || !!hasSliRefined
  );
  
  const linkedInBadge = getStatusBadge(
    !!canGenerateLinkedInOptimization,
    !!latestLinkedinOptimization
  );
  

  
  const coachingBadge = getStatusBadge(
    !!userProfile?.questionnaire && userProfile.questionnaire.isDraft !== true && !!hasRequiredDocuments,
    false // Always available once prerequisites are met
  );
  
  // Check if user has any conversation summaries for Step 4 enablement
  const hasConversationSummaries = conversationSummaries && conversationSummaries.length > 0;
  
  const liveCoachingBadge = getStatusBadge(
    !!hasConversationSummaries,
    false // Always available once user has conversation summaries
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
            Congratulations on joining SLI.pro! Your professional brand journey starts with few key actions
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
                    Step 1: Professional Branding Assessment
                  </CardTitle>
                </div>
                {questionnaireBadge}
              </div>
              <CardDescription className="mt-2">
                {userProfile?.questionnaire
                  ? userProfile.questionnaire.isDraft === true
                    ? "You have a draft questionnaire that needs to be completed"
                    : "Your professional branding assessment is complete"
                  : "Take a quick assessment to establish your baseline digital presence"}
              </CardDescription>
            </CardHeader>
            <CardContent className="p-5 flex-grow">
              <p className="text-sm text-muted-foreground mb-2">
                {userProfile?.questionnaire
                  ? userProfile.questionnaire.isDraft === true
                    ? "Continue where you left off to complete your assessment."
                    : "This information helps us understand your professional goals and aspirations."
                  : "This comprehensive assessment helps customize your personal branding strategy and provide information to shape your Single Lasting Impression (SLI)."}
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
                    Step 2: Upload Documents
                  </CardTitle>
                </div>
                {documentsBadge}
              </div>
              <CardDescription className="mt-2">
                {!userProfile?.questionnaire || userProfile.questionnaire.isDraft === true
                  ? "Complete the questionnaire to unlock this section"
                  : !hasRequiredDocuments
                    ? "Share your resume and LinkedIn PDF to help analyze your current positioning"
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
                      Latest Resume
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
                      LinkedIn Profile (PDF)
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
                {hasRequiredDocuments ? "View Documents" : "Upload"}
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
                : "bg-green-50"
            }`}>
              <div className="flex items-center justify-between">
                <div className="flex items-center">
                  <div className={`p-2 rounded-full mr-3 ${
                    !userProfile?.questionnaire || userProfile.questionnaire.isDraft === true || !hasRequiredDocuments
                      ? "bg-gray-100 text-gray-500"
                      : "bg-green-100 text-green-600"
                  }`}>
                    <Calendar className="h-5 w-5" />
                  </div>
                  <CardTitle className="text-lg">
                    Step 3: Complete AI-Guided Discovery
                  </CardTitle>
                </div>
                {coachingBadge}
              </div>
              <CardDescription className="mt-2">
                {!userProfile?.questionnaire
                  ? "Complete the questionnaire to unlock coaching sessions"
                  : userProfile.questionnaire.isDraft === true
                    ? "Finish your questionnaire to schedule strategy sessions"
                    : !hasRequiredDocuments
                      ? "Upload your documents to schedule strategy sessions"
                      : "Begin your SLI journey with three focused AI conversations to prepare for your coaching session"}
              </CardDescription>
            </CardHeader>
            <CardContent className="p-5 flex-grow">
              <p className={`text-sm ${!userProfile?.questionnaire || userProfile.questionnaire.isDraft === true || !hasRequiredDocuments ? "text-muted-foreground/70" : "text-muted-foreground"}`}>
                {!userProfile?.questionnaire || userProfile.questionnaire.isDraft === true || !hasRequiredDocuments
                  ? `You must ${!userProfile?.questionnaire ? "complete the questionnaire" : userProfile.questionnaire.isDraft === true ? "complete the questionnaire" : "upload your documents"} first`
                  : "Gain clarity and confidence to stand out in your field. These sessions help you sharpen your professional presence."}
              </p>
            </CardContent>
            <CardFooter className="bg-gray-50 py-3 px-5 mt-auto">
              <Button
                variant="outline"
                className={`w-full ${
                  !userProfile?.questionnaire || userProfile.questionnaire.isDraft === true || !hasRequiredDocuments
                    ? "border-blue-500 text-blue-600 hover:bg-blue-50 cursor-not-allowed"
                    : "border-green-500 text-green-700 hover:bg-green-50"
                }`}
                onClick={() => {
                  if (userProfile?.questionnaire && userProfile.questionnaire.isDraft !== true && hasRequiredDocuments) {
                    scrollToTop();
                    navigate("/chat");
                  }
                }}
                disabled={!userProfile?.questionnaire || userProfile.questionnaire.isDraft === true || !hasRequiredDocuments}
              >
                Start Conversation
                <ArrowRight className="ml-2 h-4 w-4" />
              </Button>
            </CardFooter>
          </Card>

          {/* Step 4: Schedule Live Coaching Call */}
          <Card className={`overflow-hidden shadow-sm flex flex-col h-full ${
            !hasConversationSummaries
              ? "border-gray-200 opacity-75"
              : "border-green-200"
          }`}>
            <CardHeader className={`pb-4 ${
              !hasConversationSummaries
                ? "bg-gray-50"
                : "bg-green-50"
            }`}>
              <div className="flex items-center justify-between">
                <div className="flex items-center">
                  <div className={`p-2 rounded-full mr-3 ${
                    !hasConversationSummaries
                      ? "bg-gray-100 text-gray-500"
                      : "bg-green-100 text-green-600"
                  }`}>
                    <Phone className="h-5 w-5" />
                  </div>
                  <CardTitle className="text-lg">
                    Step 4: Schedule Live Coaching Call
                  </CardTitle>
                </div>
                {liveCoachingBadge}
              </div>
              <CardDescription className="mt-2">
                {!hasConversationSummaries
                  ? "Complete your AI-guided discovery conversations to unlock live coaching"
                  : "Book your 30-minute session with an SLI.pro expert to refine your professional positioning"}
              </CardDescription>
            </CardHeader>
            <CardContent className="p-5 flex-grow">
              <p className={`text-sm ${!hasConversationSummaries ? "text-muted-foreground/70" : "text-muted-foreground"}`}>
                {!hasConversationSummaries
                  ? "You must complete at least one AI coaching conversation first"
                  : "Work directly with our experts to polish your Single Lasting Impression and create a powerful professional presence."}
              </p>
            </CardContent>
            <CardFooter className="bg-gray-50 py-3 px-5 mt-auto">
              <Button
                variant="outline"
                className={`w-full ${
                  !hasConversationSummaries
                    ? "border-gray-300 text-gray-500 cursor-not-allowed"
                    : "border-green-500 text-green-600 hover:bg-green-50"
                }`}
                onClick={() => {
                  if (hasConversationSummaries) {
                    window.open("https://calendly.com/dcara-sli/haas", "_blank");
                  }
                }}
                disabled={!hasConversationSummaries}
              >
                Schedule Now
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
                : "bg-green-50"
            }`}>
              <div className="flex items-center justify-between">
                <div className="flex items-center">
                  <div className={`p-2 rounded-full mr-3 ${
                    !userProfile?.questionnaire || userProfile.questionnaire.isDraft === true || !hasRequiredDocuments
                      ? "bg-gray-100 text-gray-500"
                      : "bg-green-100 text-green-600"
                  }`}>
                    <Sparkles className="h-5 w-5" />
                  </div>
                  <CardTitle className="text-lg">
                    Step 5: Review Your Brand Intelligence Report
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
                      : "Understand how your digital presence aligns with your career goals"}
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
                    ? "border-blue-500 text-blue-600 hover:bg-blue-50 cursor-not-allowed"
                    : "border-green-500 text-green-700 hover:bg-green-50"
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
                : "bg-green-50"
            }`}>
              <div className="flex items-center justify-between">
                <div className="flex items-center">
                  <div className={`p-2 rounded-full mr-3 ${
                    !hasSli
                      ? "bg-gray-100 text-gray-500"
                      : "bg-green-100 text-green-600"
                  }`}>
                    <Award className="h-5 w-5" />
                  </div>
                  <CardTitle className="text-lg">
                    Step 6: Discover Your Single Lasting Impression
                  </CardTitle>
                </div>
                {sliBadge}
              </div>
              <CardDescription className="mt-2">
                {!hasSli
                  ? "Review coach-generated SLI options that capture your professional essence"
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
                    className={`w-full border-green-500 text-green-700 hover:bg-green-50`}
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
                : "bg-green-50"
            }`}>
              <div className="flex items-center justify-between">
                <div className="flex items-center">
                  <div className={`p-2 rounded-full mr-3 ${
                    !canGenerateLinkedInOptimization
                      ? "bg-gray-100 text-gray-500"
                      : "bg-green-100 text-green-600"
                  }`}>
                    <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 24 24" fill="currentColor">
                      <path d="M19 3a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h14m-.5 15.5v-5.3a3.26 3.26 0 0 0-3.26-3.26c-.85 0-1.84.52-2.32 1.3v-1.11h-2.79v8.37h2.79v-4.93c0-.77.62-1.4 1.39-1.4a1.4 1.4 0 0 1 1.4 1.4v4.93h2.79M6.88 8.56a1.68 1.68 0 0 0 1.68-1.68c0-.93-.75-1.69-1.68-1.69a1.69 1.69 0 0 0-1.69 1.69c0 .93.76 1.68 1.69 1.68m1.39 9.94v-8.37H5.5v8.37h2.77z" />
                    </svg>
                  </div>
                  <CardTitle className="text-lg">
                    Step 7: Optimize Your LinkedIn Profile
                  </CardTitle>
                </div>
                {linkedInBadge}
              </div>
              <CardDescription className="mt-2">
                {!canGenerateLinkedInOptimization
                  ? getLinkedInRequirementsMessage(hasRequiredDocuments || false, Boolean(hasSliSelected || hasSliRefined), latestFreshnessReport !== undefined)
                  : latestLinkedinOptimization !== undefined
                    ? `Generated ${formatTimeAgo(latestLinkedinOptimization.createdAt)}`
                    : "Apply your SLI to enhance your professional presence"}
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
                    ? "border-gray-300 text-gray-500 cursor-not-allowed"
                    : latestLinkedinOptimization
                      ? "border-green-500 text-green-700 hover:bg-green-50"
                      : "border-green-500 text-green-700 hover:bg-green-50"
                }`}
                variant={latestLinkedinOptimization ? "outline" : "outline"}
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

          {/* Step 8: Generate Strategic Content */}
          <Card className={`overflow-hidden shadow-sm flex flex-col h-full ${
            !canGenerateLinkedInOptimization
              ? "border-gray-200 opacity-75"
              : "border-emerald-200"
          }`}>
            <CardHeader className={`pb-4 ${
              !canGenerateLinkedInOptimization
                ? "bg-gray-50"
                : "bg-emerald-50"
            }`}>
              <div className="flex items-center justify-between">
                <div className="flex items-center">
                  <div className={`p-2 rounded-full mr-3 ${
                    !canGenerateLinkedInOptimization
                      ? "bg-gray-100 text-gray-500"
                      : "bg-emerald-100 text-emerald-600"
                  }`}>
                    <PenTool className="h-5 w-5" />
                  </div>
                  <CardTitle className="text-lg">
                    Step 8: Generate Strategic Content
                  </CardTitle>
                </div>
                <Badge variant="outline" className={`${
                  !canGenerateLinkedInOptimization
                    ? "bg-muted text-muted-foreground border-muted"
                    : "bg-emerald-50 text-emerald-700 border-emerald-200"
                }`}>
                  {!canGenerateLinkedInOptimization ? "Locked" : "Available"}
                </Badge>
              </div>
              <CardDescription className="mt-2">
                {!canGenerateLinkedInOptimization
                  ? getLinkedInRequirementsMessage(hasRequiredDocuments || false, Boolean(hasSliSelected || hasSliRefined), latestFreshnessReport !== undefined)
                  : "Create thought leadership content aligned with your SLI"}
              </CardDescription>
            </CardHeader>
            <CardContent className="p-5 flex-grow">
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
              ) : (
                <p className="text-sm text-gray-600">
                  Generate AI-powered content ideas and drafts that showcase your expertise and align with your professional brand.
                </p>
              )}
            </CardContent>
            <CardFooter className="bg-gray-50 py-3 px-5 mt-auto">
              <Button
                className={`w-full ${
                  !canGenerateLinkedInOptimization
                    ? "border-gray-300 text-gray-500 cursor-not-allowed"
                    : "border-emerald-500 text-emerald-700 hover:bg-emerald-50"
                }`}
                variant="outline"
                onClick={() => {
                  if (canGenerateLinkedInOptimization) {
                    scrollToTop();
                    navigate("/linkedin-content-drafts");
                  }
                }}
                disabled={!canGenerateLinkedInOptimization}
              >
                Generate Content
                <ArrowRight className="ml-2 h-4 w-4" />
              </Button>
            </CardFooter>
          </Card>

          {/* Step 9: Schedule Follow-Up Coaching */}
          <Card className={`overflow-hidden shadow-sm flex flex-col h-full ${
            !hasConversationSummaries
              ? "border-gray-200 opacity-75"
              : "border-green-200"
          }`}>
            <CardHeader className={`pb-4 ${
              !hasConversationSummaries
                ? "bg-gray-50"
                : "bg-green-50"
            }`}>
              <div className="flex items-center justify-between">
                <div className="flex items-center">
                  <div className={`p-2 rounded-full mr-3 ${
                    !hasConversationSummaries
                      ? "bg-gray-100 text-gray-500"
                      : "bg-green-100 text-green-600"
                  }`}>
                    <Phone className="h-5 w-5" />
                  </div>
                  <CardTitle className="text-lg">
                    Step 9: Schedule Follow-Up Coaching
                  </CardTitle>
                </div>
                {liveCoachingBadge}
              </div>
              <CardDescription className="mt-2">
                {!hasConversationSummaries
                  ? "Complete your AI-guided discovery conversations to unlock live coaching"
                  : "Refine your approach and measure progress"}
              </CardDescription>
            </CardHeader>
            <CardContent className="p-5 flex-grow">
              <p className={`text-sm ${!hasConversationSummaries ? "text-muted-foreground/70" : "text-muted-foreground"}`}>
                {!hasConversationSummaries
                  ? "You must complete at least one AI coaching conversation first"
                  : "Refine your approach and measure progress"}
              </p>
            </CardContent>
            <CardFooter className="bg-gray-50 py-3 px-5 mt-auto">
              <Button
                variant="outline"
                className={`w-full ${
                  !hasConversationSummaries
                    ? "border-gray-300 text-gray-500 cursor-not-allowed"
                    : "border-green-500 text-green-600 hover:bg-green-50"
                }`}
                onClick={() => {
                  if (hasConversationSummaries) {
                    window.open("https://calendly.com/dcara-sli/haas", "_blank");
                  }
                }}
                disabled={!hasConversationSummaries}
              >
                Schedule Now
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
  hasDocuments: boolean | undefined, 
  hasSli: boolean | undefined, 
  hasFreshnessReport: boolean | undefined
): string {
  // Convert any undefined values to false
  hasDocuments = hasDocuments === true;
  hasSli = hasSli === true;
  hasFreshnessReport = hasFreshnessReport === true;
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


