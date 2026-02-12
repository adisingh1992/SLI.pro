import { useAuth } from "@/hooks/use-auth";
import { useLocation } from "wouter";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { UserProfile, FoundationSession } from "@shared/schema";
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

function useDashboardStatus(userProfile?: UserProfile) {
  const isAssessmentComplete =
    !!userProfile?.questionnaire && userProfile.questionnaire.isDraft !== true;

  const hasResume =
    userProfile?.documents?.some((doc) => doc.type === "resume") ?? false;
  const hasLinkedIn =
    userProfile?.documents?.some((doc) => doc.type === "linkedin") ?? false;
  const isDocumentsComplete = hasResume && hasLinkedIn;

  return { isAssessmentComplete, hasResume, hasLinkedIn, isDocumentsComplete };
}

type DashboardStatus = ReturnType<typeof useDashboardStatus>;

function buildSidebarSections(
  status: DashboardStatus,
  foundationSessions?: FoundationSession[],
) {
  const getSessionCompleted = (sessionNumber: number) =>
    foundationSessions?.some(
      (s) => s.sessionNumber === sessionNumber && s.status === "completed",
    ) ?? false;

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
          title: "Phase 2 - Professional Development",
          disabled: !status.isDocumentsComplete,
          items: [
            {
              label: "Functional Identity Mapping",
              locked: !status.isDocumentsComplete,
              completed: getSessionCompleted(1),
            },
            {
              label: "Professional Credibility Assessment",
              locked: !status.isDocumentsComplete,
              completed: getSessionCompleted(2),
            },
            {
              label: "Positioning Story Development",
              locked: !status.isDocumentsComplete,
              completed: getSessionCompleted(3),
            },
          ],
        },
      ],
    },
  ];
}

function getCurrentPhase(status: DashboardStatus): "assessment" | "documents" | "sessions" {
  if (!status.isAssessmentComplete) return "assessment";
  if (!status.isDocumentsComplete) return "documents";
  return "sessions";
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

  const startSessionMutation = useMutation({
    mutationFn: async (sessionNumber: number) => {
      return await apiRequest("POST", `/api/foundation-sessions/${sessionNumber}/start`);
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

  const status = useDashboardStatus(userProfile);
  const currentPhase = getCurrentPhase(status);
  const sidebarSections = buildSidebarSections(status, foundationSessions);

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

  if (isLoading) {
    return (
      <div className="dashboard-layout flex h-screen overflow-hidden bg-[var(--dashboard-void)]">
        <div className="flex-1 flex items-center justify-center">
          <Loader2 className="h-8 w-8 animate-spin text-[var(--dashboard-aqua)]" />
        </div>
      </div>
    );
  }

  const headingText = currentPhase === "sessions" ? "Professional" : "Foundation";
  const headingAccent = currentPhase === "sessions" ? "Development" : "Protocol";

  return (
    <div className="dashboard-layout flex h-screen overflow-hidden">
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
          <span className="text-[var(--dashboard-aqua)]">{headingAccent}</span>
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
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6 max-w-[900px]">
            {foundationSessions?.slice(0, 3).map((session) => {
              const content = SESSION_CONTENT[session.sessionNumber - 1];
              if (!content) return null;
              return (
                <SessionCard
                  key={session.id}
                  header={content.header}
                  title={content.title}
                  description={content.description}
                  status={session.status}
                  onClick={() => handleSessionClick(session.sessionNumber)}
                />
              );
            })}
          </div>
        )}
      </main>
    </div>
  );
}
