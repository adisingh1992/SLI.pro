import { useAuth } from "@/hooks/use-auth";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { FreshnessReport, LinkedinOptimization, Sli, UserProfile, ConversationSummary, HomeworkAssignment, FoundationSession } from "@shared/schema";

type EnhancementModule = {
  id: number;
  userId: number;
  moduleCode: string;
  status: 'available' | 'in_progress' | 'completed';
  startedAt?: string;
  completedAt?: string;
  timerElapsed?: number;
};
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
  BookOpen,
  Lock,
  Play,
  MessageSquare,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { useEffect, useState } from "react";
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
import { PaymentModal } from "@/components/payment-modal";
import { Crown } from "lucide-react";

export default function HomePage() {
  const { user } = useAuth();
  const { toast } = useToast();
  const [_, navigate] = useLocation();
  const queryClient = useQueryClient();
  const [isPaymentModalOpen, setIsPaymentModalOpen] = useState(false);

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
  
  // Fetch foundation sessions to check completion status
  const { data: foundationSessions } = useQuery<FoundationSession[]>({
    queryKey: ["/api/foundation-sessions"],
    enabled: !!user,
    retry: false,
  });
  
  // Fetch enhancement modules
  const { data: enhancementModules } = useQuery<EnhancementModule[]>({
    queryKey: ['/api/enhancement-modules'],
    enabled: !!user,
    retry: false,
  });
  
  // Fetch user's homework assignments (only for non-admin users)
  const { data: homeworkData } = useQuery<HomeworkAssignment[]>({
    queryKey: ["/api/user/homework"],
    enabled: !!user && !user.isAdmin,
    retry: false,
  });

  // Fetch subscription status
  const { data: subscriptionStatus } = useQuery<{
    tier: 'free' | 'premium' | 'subscription';
    status: 'active' | 'expired' | 'canceled';
    expiresAt?: Date;
    premiumPurchasedAt?: Date;
  }>({
    queryKey: ["/api/payments/subscription-status"],
    enabled: !!user,
    retry: false,
  });
  
  // Mutations for foundation sessions - MUST be before any early returns
  const startSessionMutation = useMutation({
    mutationFn: async (sessionNumber: number) => {
      return await apiRequest('POST', `/api/foundation-sessions/${sessionNumber}/start`);
    },
    onSuccess: (data, sessionNumber) => {
      queryClient.invalidateQueries({ queryKey: ['/api/foundation-sessions'] });
      toast({
        title: "Session Started",
        description: `Foundation Session ${sessionNumber} has been started.`,
      });
      navigate(`/foundation/session/${sessionNumber}`);
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.message || "Failed to start session",
        variant: "destructive",
      });
    },
  });

  // Mutations for enhancement modules - MUST be before any early returns
  const startModuleMutation = useMutation({
    mutationFn: async (moduleCode: string) => {
      return await apiRequest('POST', `/api/enhancement-modules/${moduleCode}/start`);
    },
    onSuccess: (data, moduleCode) => {
      queryClient.invalidateQueries({ queryKey: ['/api/enhancement-modules'] });
      toast({
        title: "Module Started",
        description: `Enhancement Module ${moduleCode} has been started.`,
      });
      navigate(`/enhancement-modules/${moduleCode}`);
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.message || "Failed to start module",
        variant: "destructive",
      });
    },
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

  // Helper function to check if a feature is allowed based on payment tier (first layer validation)
  const isTierAllowed = (feature: string): boolean => {
    const tier = subscriptionStatus?.tier || 'free';
    
    // Free tier: Only Step 1, Step 2, and Foundation Session 1 allowed
    if (tier === 'free') {
      return ['step1', 'step2', 'session1'].includes(feature);
    }
    
    // Premium tier: Everything except Step 8
    if (tier === 'premium') {
      return feature !== 'step8';
    }
    
    // Subscription tier: Everything allowed
    return true;
  };

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
    isTierAllowed('step1'), 
    !!userProfile?.questionnaire && userProfile.questionnaire.isDraft !== true
  );
  
  const documentsBadge = getStatusBadge(
    isTierAllowed('step2') && !!userProfile?.questionnaire && userProfile.questionnaire.isDraft !== true,
    !!hasRequiredDocuments
  );
  
  const freshnessReportBadge = getStatusBadge(
    isTierAllowed('step5') && !!hasRequiredDocuments && !!userProfile?.questionnaire && userProfile.questionnaire.isDraft !== true,
    !!latestFreshnessReport
  );
  
  const sliBadge = getStatusBadge(
    isTierAllowed('step6') && (!!hasSliSelected || !!hasSliRefined),
    !!hasSliSelected || !!hasSliRefined
  );
  
  const linkedInBadge = getStatusBadge(
    isTierAllowed('step7') && !!canGenerateLinkedInOptimization,
    !!latestLinkedinOptimization
  );
  
  // Check if user has any conversation summaries for Step 4 enablement
  const hasConversationSummaries = conversationSummaries && conversationSummaries.length > 0;
  
  // Check if any foundation sessions are completed
  const hasFoundationSessionsCompleted = foundationSessions && foundationSessions.some(session => session.status === 'completed');
  
  // Check if all 3 foundation sessions are completed
  const allFoundationSessionsCompleted = foundationSessions && 
    foundationSessions.length >= 3 && 
    foundationSessions.filter(session => session.status === 'completed').length === 3;
  
  const foundationSessionsBadge = getStatusBadge(
    isTierAllowed('step3') && !!userProfile?.questionnaire && userProfile.questionnaire.isDraft !== true && !!hasRequiredDocuments,
    !!hasFoundationSessionsCompleted
  );
  
  const liveCoachingBadge = getStatusBadge(
    isTierAllowed('step4') && !!allFoundationSessionsCompleted,
    false // Always available once all 3 foundation sessions are completed
  );

  // Helper functions for foundation sessions
  const getSessionContent = (sessionNumber: number) => {
    switch (sessionNumber) {
      case 1:
        return {
          header: "Session 1",
          title: "Functional Identity Mapping",
          description: "Define your primary business function and positioning"
        };
      case 2:
        return {
          header: "Session 2",
          title: "Professional Credibility Assessment",
          description: "Identify measurable expertise and business impact"
        };
      case 3:
        return {
          header: "Session 3",
          title: "Positioning Story Development",
          description: "Extract compelling stories that prove your unique value"
        };
      default:
        return {
          header: `Session ${sessionNumber}`,
          title: "",
          description: ""
        };
    }
  };

  const getSessionStatusBadge = (status: FoundationSession['status']) => {
    const variants = {
      locked: { variant: "secondary" as const, icon: Lock, text: "Locked", className: "" },
      available: { variant: "default" as const, icon: Play, text: "Available", className: "" },
      in_progress: { variant: "outline" as const, icon: MessageSquare, text: "In Progress", className: "" },
      completed: { variant: "outline" as const, icon: CheckCircle, text: "Completed", className: "bg-green-50 text-green-700 border-green-200" }
    };
    
    const config = variants[status];
    const Icon = config.icon;
    
    return (
      <Badge variant={config.variant} className={`flex items-center gap-1 ${config.className}`}>
        <Icon className="h-3 w-3" />
        {config.text}
      </Badge>
    );
  };

  // Helper functions for enhancement modules
  const getModuleDetails = (moduleCode: string) => {
    const details = {
      'A': {
        title: "Module A",
        subtitle: "Digital Behavior Analysis",
        description: "LinkedIn Presence & Content Strategy Assessment"
      },
      'B': {
        title: "Module B",
        subtitle: "Network Position Mapping",
        description: "Strategic Relationship & Influence Analysis"
      },
      'C': {
        title: "Module C",
        subtitle: "Career Aspiration Alignment",
        description: "Long-Term Goals & Positioning Refinement"
      }
    };
    return details[moduleCode as keyof typeof details] || { title: `Module ${moduleCode}`, subtitle: "", description: "" };
  };

  const getModuleStatusBadge = (status: EnhancementModule['status']) => {
    const variants = {
      available: { variant: "default" as const, icon: Play, text: "Available", className: "" },
      in_progress: { variant: "outline" as const, icon: MessageSquare, text: "In Progress", className: "" },
      completed: { variant: "outline" as const, icon: CheckCircle, text: "Completed", className: "bg-green-50 text-green-700 border-green-200" }
    };
    
    const config = variants[status];
    const Icon = config.icon;
    
    return (
      <Badge variant={config.variant} className={`flex items-center gap-1 ${config.className}`}>
        <Icon className="h-3 w-3" />
        {config.text}
      </Badge>
    );
  };

  const handleSessionAction = (session: FoundationSession) => {
    if (session.status === 'available') {
      startSessionMutation.mutate(session.sessionNumber);
    } else if (session.status === 'in_progress' || session.status === 'completed') {
      navigate(`/foundation/session/${session.sessionNumber}`);
    }
  };

  const handleModuleAction = (module: EnhancementModule) => {
    if (module.status === 'available') {
      startModuleMutation.mutate(module.moduleCode);
    } else if (module.status === 'in_progress' || module.status === 'completed') {
      navigate(`/enhancement-modules/${module.moduleCode}`);
    }
  };

  // Check if all enhancement modules are completed
  const hasAllModulesCompleted = enhancementModules && enhancementModules.length > 0 && 
    enhancementModules.every(module => module.status === 'completed');

  // Helper function to get subscription tier display name and style
  const getSubscriptionTierDisplay = () => {
    const tier = subscriptionStatus?.tier || 'free';
    const status = subscriptionStatus?.status || 'active';

    const tierConfig: Record<string, { name: string; variant: any; icon: any }> = {
      free: { name: 'Free Tier', variant: 'outline', icon: User },
      premium: { name: 'Premium Tier', variant: 'default', icon: Crown },
      subscription: { name: 'Subscription Tier', variant: 'default', icon: Crown },
    };

    const config = tierConfig[tier] || tierConfig.free;

    return {
      ...config,
      isExpired: tier === 'subscription' && status === 'expired',
    };
  };

  // Helper function to determine upgrade button text and visibility
  const getUpgradeButtonConfig = () => {
    const tier = subscriptionStatus?.tier || 'free';
    const status = subscriptionStatus?.status || 'active';

    if (tier === 'free') {
      return { show: true, text: 'Upgrade to Premium' };
    } else if (tier === 'premium') {
      return { show: true, text: 'Upgrade to Subscription' };
    } else if (tier === 'subscription' && status === 'expired') {
      return { show: true, text: 'Renew Subscription' };
    }
    
    return { show: false, text: '' };
  };

  const subscriptionDisplay = getSubscriptionTierDisplay();
  const upgradeConfig = getUpgradeButtonConfig();

  return (
    <div className="min-h-screen bg-background flex flex-col">
      <NavBar />
      <main className="flex-1 max-w-7xl mx-auto px-4 sm:px-6 py-8">
        <div className="mb-6 flex items-center justify-between">
          <div className="flex-1">
            <h1 className="text-2xl font-semibold text-foreground">
              Welcome, {user?.firstName}!
            </h1>
            <p className="text-muted-foreground mt-2">
              Congratulations on joining SLI.pro! Your professional brand journey starts with few key actions
            </p>
          </div>
          
          <div className="flex items-center gap-3">
            <Badge 
              variant={subscriptionDisplay.variant}
              className={`flex items-center gap-1.5 px-3 py-1 ${
                subscriptionDisplay.isExpired ? 'border-destructive text-destructive' : ''
              }`}
              data-testid="badge-subscription-tier"
            >
              <subscriptionDisplay.icon className="h-4 w-4" />
              {subscriptionDisplay.name}
              {subscriptionDisplay.isExpired && <span className="ml-1">(Expired)</span>}
            </Badge>
            
            {upgradeConfig.show && (
              <Button 
                onClick={() => setIsPaymentModalOpen(true)}
                variant="default"
                size="sm"
                data-testid="button-upgrade"
              >
                <Crown className="h-4 w-4 mr-2" />
                {upgradeConfig.text}
              </Button>
            )}
          </div>
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
        </div>

        {/* Step 3: Professional Development Sessions - Full Width */}
        <div className="mt-6">
          <Card className="overflow-hidden shadow-sm">
            <CardHeader className="pb-4 bg-gradient-to-r from-green-50 to-blue-50">
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle className="text-xl font-semibold">Step 3: Professional Development Sessions</CardTitle>
                  <CardDescription className="mt-2">
                    Complete foundation sessions and optional enhancement modules to develop your professional identity
                  </CardDescription>
                </div>
              </div>
            </CardHeader>
            <CardContent className="p-6 space-y-8">
              {/* Foundation Sessions Section */}
              <div>
                <div className="flex items-center gap-2 mb-4">
                  <Calendar className="h-5 w-5 text-green-600" />
                  <h3 className="text-lg font-semibold">Foundation Sessions</h3>
                  {foundationSessionsBadge}
                </div>
                
                {!userProfile?.questionnaire || userProfile.questionnaire.isDraft === true || !hasRequiredDocuments ? (
                  <div className="p-4 bg-muted/50 rounded-lg text-muted-foreground">
                    You must {!userProfile?.questionnaire ? "complete the questionnaire" : userProfile.questionnaire.isDraft === true ? "complete the questionnaire" : "upload your documents"} first
                  </div>
                ) : (
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    {foundationSessions?.slice(0, 3).map((session) => {
                      const content = getSessionContent(session.sessionNumber);
                      // Check tier access for sessions 2 and 3
                      const isTierLocked = session.sessionNumber >= 2 && !isTierAllowed(`session${session.sessionNumber}`);
                      const displayStatus = isTierLocked ? 'locked' as const : session.status;
                      const isClickable = !isTierLocked && session.status !== 'locked';
                      
                      return (
                        <Card 
                          key={session.id} 
                          className={`transition-all ${
                            isClickable ? 'cursor-pointer hover:shadow-md' : 'opacity-60 cursor-not-allowed'
                          }`}
                          onClick={() => isClickable && handleSessionAction(session)}
                          data-testid={`card-foundation-session-${session.sessionNumber}`}
                        >
                          <CardHeader className="pb-3">
                            <div className="flex items-center justify-between mb-2">
                              <span className="text-sm font-medium text-muted-foreground">{content.header}</span>
                              {getSessionStatusBadge(displayStatus)}
                            </div>
                            <CardTitle className="text-base">{content.title}</CardTitle>
                          </CardHeader>
                          <CardContent>
                            <p className="text-sm text-muted-foreground">
                              {isTierLocked ? "Upgrade to Premium to unlock" : content.description}
                            </p>
                          </CardContent>
                        </Card>
                      );
                    })}
                  </div>
                )}
              </div>

              {/* Enhancement Modules Section */}
              <div>
                <div className="flex items-center gap-2 mb-4">
                  <Sparkles className="h-5 w-5 text-blue-600" />
                  <h3 className="text-lg font-semibold">Enhancement Modules (Optional)</h3>
                  {getStatusBadge(
                    !!hasFoundationSessionsCompleted,
                    !!hasAllModulesCompleted
                  )}
                </div>
                
                {!hasFoundationSessionsCompleted ? (
                  <div className="p-4 bg-muted/50 rounded-lg text-muted-foreground">
                    You must complete at least one foundation session first
                  </div>
                ) : !isTierAllowed('moduleA') ? (
                  <div className="p-4 bg-muted/50 rounded-lg text-muted-foreground">
                    Upgrade to Premium to unlock Enhancement Modules
                  </div>
                ) : (
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    {enhancementModules?.slice(0, 3).map((module) => {
                      const details = getModuleDetails(module.moduleCode);
                      return (
                        <Card 
                          key={module.id} 
                          className="cursor-pointer transition-all hover:shadow-md"
                          onClick={() => handleModuleAction(module)}
                          data-testid={`card-enhancement-module-${module.moduleCode}`}
                        >
                          <CardHeader className="pb-3">
                            <div className="flex items-center justify-between mb-2">
                              <span className="text-sm font-medium text-muted-foreground">{details.title}</span>
                              {getModuleStatusBadge(module.status)}
                            </div>
                            <CardTitle className="text-base">{details.subtitle}</CardTitle>
                          </CardHeader>
                          <CardContent>
                            <p className="text-sm text-muted-foreground">{details.description}</p>
                          </CardContent>
                        </Card>
                      );
                    })}
                  </div>
                )}
              </div>
            </CardContent>
          </Card>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mt-6">
          {/* Step 4: Schedule Live Coaching Call */}
          <Card className={`overflow-hidden shadow-sm flex flex-col h-full ${
            !isTierAllowed('step4') || !allFoundationSessionsCompleted
              ? "border-gray-200 opacity-75"
              : "border-green-200"
          }`}>
            <CardHeader className={`pb-4 ${
              !isTierAllowed('step4') || !allFoundationSessionsCompleted
                ? "bg-gray-50"
                : "bg-green-50"
            }`}>
              <div className="flex items-center justify-between">
                <div className="flex items-center">
                  <div className={`p-2 rounded-full mr-3 ${
                    !isTierAllowed('step4') || !allFoundationSessionsCompleted
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
                {!isTierAllowed('step4')
                  ? "Upgrade to Premium to unlock live coaching"
                  : !allFoundationSessionsCompleted
                    ? "Complete all 3 foundation sessions to unlock live coaching"
                    : "Book your 30-minute session with an SLI.pro expert to refine your professional positioning"}
              </CardDescription>
            </CardHeader>
            <CardContent className="p-5 flex-grow">
              <p className={`text-sm ${!isTierAllowed('step4') || !allFoundationSessionsCompleted ? "text-muted-foreground/70" : "text-muted-foreground"}`}>
                {!isTierAllowed('step4')
                  ? "Upgrade your account to access live coaching sessions"
                  : !allFoundationSessionsCompleted
                    ? "You must complete all 3 foundation sessions first"
                    : "Work directly with our experts to polish your Single Lasting Impression and create a powerful professional presence."}
              </p>
            </CardContent>
            <CardFooter className="bg-gray-50 py-3 px-5 mt-auto">
              <Button
                variant="outline"
                className={`w-full ${
                  !isTierAllowed('step4') || !allFoundationSessionsCompleted
                    ? "border-gray-300 text-gray-500 cursor-not-allowed"
                    : "border-green-500 text-green-600 hover:bg-green-50"
                }`}
                onClick={() => {
                  if (isTierAllowed('step4') && allFoundationSessionsCompleted) {
                    window.open("https://calendly.com/dcara-sli/haas", "_blank");
                  }
                }}
                disabled={!isTierAllowed('step4') || !allFoundationSessionsCompleted}
              >
                Schedule Now
                <ArrowRight className="ml-2 h-4 w-4" />
              </Button>
            </CardFooter>
          </Card>

          {/* Freshness Report Section */}
          <Card className={`overflow-hidden shadow-sm flex flex-col h-full ${
            !isTierAllowed('step5') || !hasFoundationSessionsCompleted
              ? "border-gray-200 opacity-75"
              : "border-info/20"
          }`}>
            <CardHeader className={`pb-4 ${
              !isTierAllowed('step5') || !hasFoundationSessionsCompleted
                ? "bg-gray-50"
                : "bg-green-50"
            }`}>
              <div className="flex items-center justify-between">
                <div className="flex items-center">
                  <div className={`p-2 rounded-full mr-3 ${
                    !isTierAllowed('step5') || !hasFoundationSessionsCompleted
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
                {!isTierAllowed('step5')
                  ? "Upgrade to Premium to unlock Brand Intelligence Report"
                  : !hasFoundationSessionsCompleted
                    ? "Complete at least one foundation session to unlock freshness report"
                    : latestFreshnessReport
                      ? `Last report: ${new Date(latestFreshnessReport.createdAt).toLocaleDateString()}`
                      : "Understand how your digital presence aligns with your career goals"}
              </CardDescription>
            </CardHeader>
            <CardContent className="p-5 flex-grow">
              <div className={`${!isTierAllowed('step5') || !hasFoundationSessionsCompleted ? "opacity-50" : ""}`}>
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
                  <li className="flex items-center gap-2">
                    <span className={`mr-2 ${hasFoundationSessionsCompleted ? 'text-success' : 'text-muted-foreground/50'}`}>
                      {hasFoundationSessionsCompleted ? '✓' : '→'}
                    </span>
                    <span className={`${!hasFoundationSessionsCompleted ? "text-muted-foreground/50" : "text-muted-foreground"}`}>
                      Complete at least one foundation session
                    </span>
                  </li>
                </ul>
              </div>
            </CardContent>
            <CardFooter className="bg-gray-50 py-3 px-5 mt-auto">
              <Button
                variant="outline"
                className={`w-full ${
                  !isTierAllowed('step5') || !hasFoundationSessionsCompleted
                    ? "border-blue-500 text-blue-600 hover:bg-blue-50 cursor-not-allowed"
                    : "border-green-500 text-green-700 hover:bg-green-50"
                }`}
                onClick={() => {
                  if (isTierAllowed('step5') && hasFoundationSessionsCompleted) {
                    scrollToTop();
                    navigate("/freshness-report");
                  }
                }}
                disabled={!isTierAllowed('step5') || !hasFoundationSessionsCompleted}
              >
                {latestFreshnessReport ? "View Report" : "Generate Report"}
                <ArrowRight className="ml-2 h-4 w-4" />
              </Button>
            </CardFooter>
          </Card>
          
          {/* SLI Section */}
          <Card className={`overflow-hidden shadow-sm ${
            !isTierAllowed('step6') || !hasSli
              ? "border-gray-200 opacity-75"
              : "border-primary/20"
          }`}>
            <CardHeader className={`pb-4 ${
              !isTierAllowed('step6') || !hasSli
                ? "bg-gray-50"
                : "bg-green-50"
            }`}>
              <div className="flex items-center justify-between">
                <div className="flex items-center">
                  <div className={`p-2 rounded-full mr-3 ${
                    !isTierAllowed('step6') || !hasSli
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
                {!isTierAllowed('step6')
                  ? "Upgrade to Premium to unlock SLI discovery"
                  : !hasSli
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
                    !isTierAllowed('step6') || !hasSli
                      ? "bg-gray-100 text-gray-500 cursor-not-allowed"
                      : "bg-primary hover:bg-primary/90"
                  }`}
                  onClick={() => {
                    if (isTierAllowed('step6') && hasSli) {
                      scrollToTop();
                      navigate("/sli-selection");
                    }
                  }}
                  disabled={!isTierAllowed('step6') || !hasSli}
                >
                  {hasSliSelected ? "View Selected SLI" : "Select Your SLI"}
                  <ArrowRight className="ml-2 h-4 w-4" />
                </Button>
                
                {isTierAllowed('step6') && hasSliSelected && (
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
            !isTierAllowed('step7') || !canGenerateLinkedInOptimization
              ? "border-gray-200 opacity-75"
              : "border-blue-200"
          }`}>
            <CardHeader className={`pb-4 ${
              !isTierAllowed('step7') || !canGenerateLinkedInOptimization
                ? "bg-gray-50"
                : "bg-green-50"
            }`}>
              <div className="flex items-center justify-between">
                <div className="flex items-center">
                  <div className={`p-2 rounded-full mr-3 ${
                    !isTierAllowed('step7') || !canGenerateLinkedInOptimization
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
                {!isTierAllowed('step7')
                  ? "Upgrade to Premium to unlock LinkedIn optimization"
                  : !canGenerateLinkedInOptimization
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
                  !isTierAllowed('step7') || !canGenerateLinkedInOptimization
                    ? "border-gray-300 text-gray-500 cursor-not-allowed"
                    : latestLinkedinOptimization
                      ? "border-green-500 text-green-700 hover:bg-green-50"
                      : "border-green-500 text-green-700 hover:bg-green-50"
                }`}
                variant={latestLinkedinOptimization ? "outline" : "outline"}
                onClick={() => {
                  if (isTierAllowed('step7') && canGenerateLinkedInOptimization) {
                    scrollToTop();
                    navigate(latestLinkedinOptimization 
                      ? `/linkedin-optimization/${latestLinkedinOptimization.id}` 
                      : "/linkedin-optimization/generate");
                  }
                }}
                disabled={!isTierAllowed('step7') || !canGenerateLinkedInOptimization}
              >
                {latestLinkedinOptimization ? "View Optimization" : "Generate Optimization"}
                <ArrowRight className="ml-2 h-4 w-4" />
              </Button>
            </CardFooter>
          </Card>

          {/* Step 8: Generate Strategic Content */}
          <Card className={`overflow-hidden shadow-sm flex flex-col h-full ${
            !isTierAllowed('step8') || !canGenerateLinkedInOptimization
              ? "border-gray-200 opacity-75"
              : "border-emerald-200"
          }`}>
            <CardHeader className={`pb-4 ${
              !isTierAllowed('step8') || !canGenerateLinkedInOptimization
                ? "bg-gray-50"
                : "bg-emerald-50"
            }`}>
              <div className="flex items-center justify-between">
                <div className="flex items-center">
                  <div className={`p-2 rounded-full mr-3 ${
                    !isTierAllowed('step8') || !canGenerateLinkedInOptimization
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
                  !isTierAllowed('step8') || !canGenerateLinkedInOptimization
                    ? "bg-muted text-muted-foreground border-muted"
                    : "bg-emerald-50 text-emerald-700 border-emerald-200"
                }`}>
                  {!isTierAllowed('step8') || !canGenerateLinkedInOptimization ? "Locked" : "Available"}
                </Badge>
              </div>
              <CardDescription className="mt-2">
                {!isTierAllowed('step8')
                  ? "Upgrade to Subscription to unlock Content Generation"
                  : !canGenerateLinkedInOptimization
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
                  !isTierAllowed('step8') || !canGenerateLinkedInOptimization
                    ? "border-gray-300 text-gray-500 cursor-not-allowed"
                    : "border-emerald-500 text-emerald-700 hover:bg-emerald-50"
                }`}
                variant="outline"
                onClick={() => {
                  if (isTierAllowed('step8') && canGenerateLinkedInOptimization) {
                    scrollToTop();
                    navigate("/linkedin-content-drafts");
                  }
                }}
                disabled={!isTierAllowed('step8') || !canGenerateLinkedInOptimization}
              >
                Generate Content
                <ArrowRight className="ml-2 h-4 w-4" />
              </Button>
            </CardFooter>
          </Card>

          {/* Step 9: Schedule Follow-Up Coaching */}
          <Card className={`overflow-hidden shadow-sm flex flex-col h-full ${
            !isTierAllowed('step9') || !hasConversationSummaries
              ? "border-gray-200 opacity-75"
              : "border-green-200"
          }`}>
            <CardHeader className={`pb-4 ${
              !isTierAllowed('step9') || !hasConversationSummaries
                ? "bg-gray-50"
                : "bg-green-50"
            }`}>
              <div className="flex items-center justify-between">
                <div className="flex items-center">
                  <div className={`p-2 rounded-full mr-3 ${
                    !isTierAllowed('step9') || !hasConversationSummaries
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
                {!isTierAllowed('step9')
                  ? "Upgrade to Premium to unlock Follow-Up Coaching"
                  : !hasConversationSummaries
                    ? "Complete your AI-guided discovery conversations to unlock live coaching"
                    : "Refine your approach and measure progress"}
              </CardDescription>
            </CardHeader>
            <CardContent className="p-5 flex-grow">
              <p className={`text-sm ${!isTierAllowed('step9') || !hasConversationSummaries ? "text-muted-foreground/70" : "text-muted-foreground"}`}>
                {!isTierAllowed('step9')
                  ? "Upgrade your account to access follow-up coaching sessions"
                  : !hasConversationSummaries
                    ? "You must complete at least one AI coaching conversation first"
                    : "Refine your approach and measure progress"}
              </p>
            </CardContent>
            <CardFooter className="bg-gray-50 py-3 px-5 mt-auto">
              <Button
                variant="outline"
                className={`w-full ${
                  !isTierAllowed('step9') || !hasFoundationSessionsCompleted
                    ? "border-gray-300 text-gray-500 cursor-not-allowed"
                    : "border-green-500 text-green-600 hover:bg-green-50"
                }`}
                onClick={() => {
                  if (isTierAllowed('step9') && hasFoundationSessionsCompleted) {
                    window.open("https://calendly.com/dcara-sli/haas", "_blank");
                  }
                }}
                disabled={!isTierAllowed('step9') || !hasFoundationSessionsCompleted}
              >
                Schedule Now
                <ArrowRight className="ml-2 h-4 w-4" />
              </Button>
            </CardFooter>
          </Card>

          {/* Assigned Homework Card - Only show for non-admin users */}
          {user && !user.isAdmin && (
            <Card className="overflow-hidden shadow-sm flex flex-col h-full border-purple-200">
              <CardHeader className="pb-4 bg-purple-50">
                <div className="flex items-center justify-between">
                  <div className="flex items-center">
                    <div className="p-2 rounded-full mr-3 bg-purple-100 text-purple-600">
                      <BookOpen className="h-5 w-5" />
                    </div>
                    <CardTitle className="text-lg">
                      Assigned Homework
                    </CardTitle>
                  </div>
                  <Badge variant={homeworkData && homeworkData.length > 0 ? "default" : "secondary"}>
                    {homeworkData && homeworkData.length > 0 
                      ? `${homeworkData.filter(hw => hw.answerText).length}/${homeworkData.length} Complete`
                      : "No Questions"
                    }
                  </Badge>
                </div>
                <CardDescription className="mt-2">
                  {homeworkData && homeworkData.length > 0
                    ? "View and respond to personalized questions from your SLI.pro coach."
                    : "Your coach hasn't assigned any homework questions yet."
                  }
                </CardDescription>
              </CardHeader>
              <CardContent className="p-5 flex-grow">
                <p className="text-sm text-muted-foreground mb-2">
                  {homeworkData && homeworkData.length > 0
                    ? `You have ${homeworkData.filter(hw => !hw.answerText).length} unanswered questions waiting for your response.`
                    : "Check back later for personalized development questions from your coach."
                  }
                </p>
                {homeworkData && homeworkData.length > 0 && (
                  <div className="mt-3">
                    <p className="text-xs text-muted-foreground">
                      Recent question: "{homeworkData[homeworkData.length - 1]?.questionText?.substring(0, 60)}..."
                    </p>
                  </div>
                )}
              </CardContent>
              <CardFooter className="bg-gray-50 py-3 px-5 mt-auto">
                <Button
                  variant="outline"
                  className={`w-full ${
                    homeworkData && homeworkData.length > 0
                      ? "border-purple-500 text-purple-600 hover:bg-purple-50"
                      : "border-gray-300 text-gray-500 cursor-not-allowed"
                  }`}
                  onClick={() => {
                    if (homeworkData && homeworkData.length > 0) {
                      scrollToTop();
                      navigate("/homework");
                    }
                  }}
                  disabled={!homeworkData || homeworkData.length === 0}
                >
                  {homeworkData && homeworkData.length > 0 ? "Answer Now" : "No Questions Yet"}
                  <ArrowRight className="ml-2 h-4 w-4" />
                </Button>
              </CardFooter>
            </Card>
          )}

        </div>
      </main>
      
      <PaymentModal
        open={isPaymentModalOpen}
        onOpenChange={setIsPaymentModalOpen}
        currentTier={subscriptionStatus?.tier || 'free'}
      />
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


