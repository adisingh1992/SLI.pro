import { useAuth } from "@/hooks/use-auth";
import { useLocation } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { UserProfile } from "@shared/schema";
import { Loader2 } from "lucide-react";
import DashboardSidebar from "@/components/dashboard/DashboardSidebar";
import DirectiveCard from "@/components/dashboard/DirectiveCard";
import UserAvatar from "@/components/user-avatar";
import "@/assets/css/new-dashboard.css";

function useDashboardStatus(userProfile?: UserProfile) {
  const isAssessmentComplete =
    !!userProfile?.questionnaire && userProfile.questionnaire.isDraft !== true;

  const hasResume = userProfile?.documents?.some((doc) => doc.type === "resume") ?? false;
  const hasLinkedIn = userProfile?.documents?.some((doc) => doc.type === "linkedin") ?? false;
  const isDocumentsComplete = hasResume && hasLinkedIn;

  return { isAssessmentComplete, hasResume, hasLinkedIn, isDocumentsComplete };
}

function buildSidebarSections(status: {
  isAssessmentComplete: boolean;
  isDocumentsComplete: boolean;
}) {
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
          disabled: true,
          items: [
            { label: "Functional Identity Mapping", locked: true },
            { label: "Narrative Architecture", locked: true },
          ],
        },
      ],
    },
  ];
}

export default function NewDashboardPage() {
  const { user } = useAuth();
  const [, navigate] = useLocation();

  const {
    data: userProfile,
    isLoading,
  } = useQuery<UserProfile>({
    queryKey: ["/api/user/profile"],
    enabled: !!user,
    staleTime: 0,
    refetchOnWindowFocus: true,
  });

  const status = useDashboardStatus(userProfile);
  const sidebarSections = buildSidebarSections(status);

  const handleNavItemClick = (item: { label: string; locked?: boolean }) => {
    if (item.locked) return;
    if (item.label === "Professional Branding Assessment") {
      navigate("/questionnaire");
    } else if (item.label === "Document Vault") {
      if (status.isAssessmentComplete) {
        navigate("/profile?tab=documents");
      }
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
          Foundation <span className="text-[var(--dashboard-aqua)]">Protocol</span>
        </h1>

        {!status.isAssessmentComplete ? (
          <DirectiveCard
            title="Professional Branding Assessment"
            description="To begin crafting your single lasting impression, we start by mapping your professional DNA, capturing your ambitions and establishing the structural foundation of your elite brand architecture."
            note="To enhance session accuracy, you may complete a prior assessment (MBTI, StrengthsFinder, Enneagram, or 360° Leadership). This is non-blocking."
            metaInfo="Duration: 5 Minutes"
            buttonLabel="Begin"
            onButtonClick={() => navigate("/questionnaire")}
          />
        ) : (
          <DirectiveCard
            title="Document Vault"
            description="Upload your professional documents to enable deeper analysis. Your resume and LinkedIn profile allow us to map your current positioning and identify opportunities for your brand architecture."
            note="Upload your latest resume and a PDF export of your LinkedIn profile. Additional documents such as certificates, assessments, or performance reviews can further enhance the analysis."
            metaInfo="2 Documents Required"
            buttonLabel={status.isDocumentsComplete ? "View" : "Upload"}
            onButtonClick={() => navigate("/profile?tab=documents")}
          />
        )}
      </main>
    </div>
  );
}
