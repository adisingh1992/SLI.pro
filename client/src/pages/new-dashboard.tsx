import { useAuth } from "@/hooks/use-auth";
import { useLocation } from "wouter";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { UserProfile, FoundationSession, EnhancementModule } from "@shared/schema";
import { Loader2 } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import DashboardSidebar from "@/components/dashboard/DashboardSidebar";
import DirectiveCard from "@/components/dashboard/DirectiveCard";
import SessionCard from "@/components/dashboard/SessionCard";
import UserAvatar from "@/components/user-avatar";
import "@/assets/css/new-dashboard.css";

const SESSION_CONTENT = [
  {
    header: "Session 1",
    title: "Functional Identity Mapping",
    description: "Define your primary business function and positioning",
  },
  {
    header: "Session 2",
    title: "Professional Credibility Assessment",
    description: "Identify measurable expertise and business impact",
  },
  {
    header: "Session 3",
    title: "Positioning Story Development",
    description: "Extract compelling stories that prove your unique value",
  },
];

const MODULE_CONTENT: Record<string, { header: string; title: string; description: string }> = {
  A: {
    header: "Module A",
    title: "Digital Behavior Analysis Framework",
    description: "Analyze your LinkedIn presence and content strategy patterns to identify opportunities and barriers for professional growth.",
  },
  B: {
    header: "Module B",
    title: "Network Position Mapping Framework",
    description: "Map your current network position and develop strategic relationship building approaches for enhanced professional influence.",
  },
  C: {
    header: "Module C",
    title: "Career Aspiration Alignment Framework",
    description: "Align your long-term career aspirations with your current positioning to create an actionable roadmap for professional advancement.",
  },
};

function useDashboardStatus(userProfile?: UserProfile, foundationSessions?: FoundationSession[]) {
  const isAssessmentComplete =
    !!userProfile?.questionnaire && userProfile.questionnaire.isDraft !== true;

  const hasResume =
    userProfile?.documents?.some((doc) => doc.type === "resume") ?? false;
  const hasLinkedIn =
    userProfile?.documents?.some((doc) => doc.type === "linkedin") ?? false;
  const isDocumentsComplete = hasResume && hasLinkedIn;

  const completedSessionCount = foundationSessions?.filter(
    (s) => s.status === "completed",
  ).length ?? 0;
  const areAllSessionsComplete = completedSessionCount >= 3;

  return { isAssessmentComplete, hasResume, hasLinkedIn, isDocumentsComplete, areAllSessionsComplete };
}

type DashboardStatus = ReturnType<typeof useDashboardStatus>;

function buildSidebarSections(
  status: DashboardStatus,
  foundationSessions?: FoundationSession[],
  enhancementModules?: EnhancementModule[],
) {
  const getSessionCompleted = (sessionNumber: number) =>
    foundationSessions?.some(
      (s) => s.sessionNumber === sessionNumber && s.status === "completed",
    ) ?? false;

  const getModuleCompleted = (code: string) =>
    enhancementModules?.some(
      (m) => m.moduleCode === code && m.status === "completed",
    ) ?? false;

  const session1Done = getSessionCompleted(1);
  const session2Done = getSessionCompleted(2);
  const moduleADone = getModuleCompleted("A");
  const moduleBDone = getModuleCompleted("B");

  return [
    {
      label: "Overview",
      phaseGroups: [
        {
          title: "Phase 1 - Foundation Protocol",
          items: [
            {
              label: "Professional Branding Assessment",
              completed: status.isAssessmentComplete,
            },
            {
              label: "Document Vault",
              completed: status.isDocumentsComplete,
            },
          ],
        },
        {
          title: "Phase 2 - Foundation Sessions",
          disabled: !status.isDocumentsComplete,
          items: [
            {
              label: "Functional Identity Mapping",
              locked: !status.isDocumentsComplete,
              completed: session1Done,
            },
            {
              label: "Professional Credibility Assessment",
              locked: !status.isDocumentsComplete || !session1Done,
              completed: session2Done,
            },
            {
              label: "Positioning Story Development",
              locked: !status.isDocumentsComplete || !session2Done,
              completed: getSessionCompleted(3),
            },
          ],
        },
        {
          title: "Phase 3 - Enhancement Modules",
          disabled: !status.areAllSessionsComplete,
          items: [
            {
              label: "Digital Behavior Analysis",
              locked: !status.areAllSessionsComplete,
              completed: moduleADone,
            },
            {
              label: "Network Position Mapping",
              locked: !status.areAllSessionsComplete || !moduleADone,
              completed: moduleBDone,
            },
            {
              label: "Career Aspiration Alignment",
              locked: !status.areAllSessionsComplete || !moduleBDone,
              completed: getModuleCompleted("C"),
            },
          ],
        },
      ],
    },
  ];
}

function getCurrentPhase(
  status: DashboardStatus,
): "assessment" | "documents" | "sessions" | "enhancement" {
  if (!status.isAssessmentComplete) return "assessment";
  if (!status.isDocumentsComplete) return "documents";
  if (!status.areAllSessionsComplete) return "sessions";
  return "enhancement";
}

export default function NewDashboardPage() {
  const { user } = useAuth();
  const [, navigate] = useLocation();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const { data: userProfile, isLoading } = useQuery<UserProfile>({
    queryKey: ["/api/user/profile"],
    enabled: !!user,
    staleTime: 0,
    refetchOnWindowFocus: true,
  });

  const { data: foundationSessions } = useQuery<FoundationSession[]>({
    queryKey: ["/api/foundation-sessions"],
    enabled: !!user,
    retry: false,
  });

  const { data: enhancementModules } = useQuery<EnhancementModule[]>({
    queryKey: ["/api/enhancement-modules"],
    enabled: !!user,
    retry: false,
  });

  const startSessionMutation = useMutation({
    mutationFn: async (sessionNumber: number) => {
      return await apiRequest(
        "POST",
        `/api/foundation-sessions/${sessionNumber}/start`,
      );
    },
    onSuccess: (_data, sessionNumber) => {
      queryClient.invalidateQueries({ queryKey: ["/api/foundation-sessions"] });
      toast({
        title: "Session Started",
        description: `Foundation Session ${sessionNumber} has been started.`,
      });
      navigate(`/foundation/session/${sessionNumber}`);
    },
    onError: (error: Error) => {
      toast({
        title: "Error",
        description: error.message || "Failed to start session",
        variant: "destructive",
      });
    },
  });

  const startModuleMutation = useMutation({
    mutationFn: async (moduleCode: string) => {
      return await apiRequest(
        "POST",
        `/api/enhancement-modules/${moduleCode}/start`,
      );
    },
    onSuccess: (_data, moduleCode) => {
      queryClient.invalidateQueries({ queryKey: ["/api/enhancement-modules"] });
      toast({
        title: "Module Started",
        description: `Enhancement Module ${moduleCode} has been started.`,
      });
      navigate(`/enhancement-modules/${moduleCode}`);
    },
    onError: (error: Error) => {
      toast({
        title: "Error",
        description: error.message || "Failed to start module",
        variant: "destructive",
      });
    },
  });

  const status = useDashboardStatus(userProfile, foundationSessions);
  const currentPhase = getCurrentPhase(status);
  const sidebarSections = buildSidebarSections(status, foundationSessions, enhancementModules);

  const handleNavItemClick = (item: { label: string; locked?: boolean }) => {
    if (item.locked) return;
    if (item.label === "Professional Branding Assessment") {
      navigate("/questionnaire");
    } else if (item.label === "Document Vault") {
      if (status.isAssessmentComplete) {
        navigate("/profile?tab=documents");
      }
    } else if (item.label === "Functional Identity Mapping") {
      handleSessionClick(1);
    } else if (item.label === "Professional Credibility Assessment") {
      handleSessionClick(2);
    } else if (item.label === "Positioning Story Development") {
      handleSessionClick(3);
    } else if (item.label === "Digital Behavior Analysis") {
      handleModuleClick("A");
    } else if (item.label === "Network Position Mapping") {
      handleModuleClick("B");
    } else if (item.label === "Career Aspiration Alignment") {
      handleModuleClick("C");
    }
  };

  const handleSessionClick = (sessionNumber: number) => {
    const session = foundationSessions?.find(
      (s) => s.sessionNumber === sessionNumber,
    );
    if (!session || session.status === "locked") return;
    if (session.status === "available") {
      startSessionMutation.mutate(sessionNumber);
    } else {
      navigate(`/foundation/session/${sessionNumber}`);
    }
  };

  const handleModuleClick = (moduleCode: string) => {
    const module = enhancementModules?.find(
      (m) => m.moduleCode === moduleCode,
    );
    if (!module) {
      startModuleMutation.mutate(moduleCode);
      return;
    }
    if (module.status === "available") {
      startModuleMutation.mutate(moduleCode);
    } else if (module.status === "in_progress" || module.status === "completed") {
      navigate(`/enhancement-modules/${moduleCode}`);
    }
  };

  if (isLoading) {
    return (
      <div className="dashboard-layout flex min-h-screen overflow-hidden bg-[var(--dashboard-void)]">
        <div className="flex-1 flex items-center justify-center">
          <Loader2 className="h-8 w-8 animate-spin text-[var(--dashboard-aqua-dark)]" />
        </div>
      </div>
    );
  }

  const headingText =
    currentPhase === "enhancement" ? "Enhancement" :
    currentPhase === "sessions" ? "Foundation" : "Foundation";
  const headingAccent =
    currentPhase === "enhancement" ? "Modules" :
    currentPhase === "sessions" ? "Sessions" : "Protocol";

  return (
    <div className="dashboard-layout flex min-h-screen overflow-hidden">
      <DashboardSidebar
        sections={sidebarSections}
        onNavItemClick={handleNavItemClick}
      />

      <main className="flex-1 bg-[var(--dashboard-silk)] px-[100px] py-[60px] text-[var(--dashboard-void)] relative flex flex-col overflow-y-auto">
        <div className="absolute top-10 right-10">
          <UserAvatar
            firstName={user?.firstName || ""}
            lastName={user?.lastName || ""}
            size="small"
          />
        </div>

        <h1 className="dashboard-heading text-[56px] font-normal mb-16">
          {headingText}{" "}
          <span className="text-[var(--dashboard-aqua-dark)]">
            {headingAccent}
          </span>
        </h1>

        {currentPhase === "assessment" && (
          <DirectiveCard
            title="Professional Branding Assessment"
            description="To begin crafting your single lasting impression, we start by mapping your professional DNA, capturing your ambitions and establishing the structural foundation of your elite brand architecture."
            note="To enhance session accuracy, you may complete a prior assessment (MBTI, StrengthsFinder, Enneagram, or 360° Leadership). This is non-blocking."
            metaInfo="Duration: 5 Minutes"
            buttonLabel="Begin"
            onButtonClick={() => navigate("/questionnaire")}
          />
        )}

        {currentPhase === "documents" && (
          <DirectiveCard
            title="Document Vault"
            description="Upload your professional documents to enable deeper analysis. Your resume and LinkedIn profile allow us to map your current positioning and identify opportunities for your brand architecture."
            note="Upload your latest resume and a PDF export of your LinkedIn profile. Additional documents such as certificates, assessments, or performance reviews can further enhance the analysis."
            metaInfo="2 Documents Required"
            buttonLabel={status.isDocumentsComplete ? "View" : "Upload"}
            onButtonClick={() => navigate("/profile?tab=documents")}
          />
        )}

        {currentPhase === "sessions" && (
          <div className="flex flex-col gap-6 max-w-[900px]">
            {foundationSessions?.slice(0, 3).map((session) => {
              const content = SESSION_CONTENT[session.sessionNumber - 1];
              if (!content) return null;
              const prevCompleted =
                session.sessionNumber === 1
                  ? true
                  : foundationSessions?.some(
                      (s) =>
                        s.sessionNumber === session.sessionNumber - 1 &&
                        s.status === "completed",
                    ) ?? false;
              const cardStatus = prevCompleted ? session.status : "locked";
              return (
                <SessionCard
                  key={session.id}
                  header={content.header}
                  title={content.title}
                  description={content.description}
                  status={cardStatus}
                  onClick={() => handleSessionClick(session.sessionNumber)}
                />
              );
            })}
          </div>
        )}

        {currentPhase === "enhancement" && (
          <div className="flex flex-col gap-6 max-w-[900px]">
            {(["A", "B", "C"] as const).map((code, index) => {
              const content = MODULE_CONTENT[code];
              const module = enhancementModules?.find((m) => m.moduleCode === code);
              const moduleStatus = module?.status ?? "available";
              const prevCodes = ["A", "B", "C"];
              const prevCompleted =
                index === 0
                  ? true
                  : enhancementModules?.some(
                      (m) =>
                        m.moduleCode === prevCodes[index - 1] &&
                        m.status === "completed",
                    ) ?? false;
              const cardStatus = prevCompleted ? moduleStatus : "locked";
              return (
                <SessionCard
                  key={code}
                  header={content.header}
                  title={content.title}
                  description={content.description}
                  status={cardStatus}
                  onClick={() => handleModuleClick(code)}
                />
              );
            })}
          </div>
        )}
      </main>
    </div>
  );
}
