import { useAuth } from "@/hooks/use-auth";
import { useLocation } from "wouter";
import DashboardSidebar from "@/components/dashboard/DashboardSidebar";
import DirectiveCard from "@/components/dashboard/DirectiveCard";
import UserAvatar from "@/components/user-avatar";
import "@/assets/css/new-dashboard.css";

const SIDEBAR_SECTIONS = [
  {
    label: "Overview",
    phaseGroups: [
      {
        title: "Phase 1 - Foundation Protocol",
        items: [
          { label: "Professional Branding Assessment" },
          { label: "Document Vault" },
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

export default function NewDashboardPage() {
  const { user } = useAuth();
  const [, navigate] = useLocation();

  const handleBegin = () => {
    navigate("/questionnaire");
  };

  const handleNavItemClick = (item: { label: string; locked?: boolean }) => {
    if (item.locked) return;
    console.log("Navigate to:", item.label);
  };

  return (
    <div className="dashboard-layout flex min-h-screen overflow-hidden">
      <DashboardSidebar
        sections={SIDEBAR_SECTIONS}
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
          Foundation{" "}
          <span className="text-[var(--dashboard-aqua-dark)]">Protocol</span>
        </h1>

        <DirectiveCard
          title="Professional Branding Assessment"
          description="To begin crafting your single lasting impression, we start by mapping your professional DNA, capturing your ambitions and establishing the structural foundation of your elite brand architecture."
          note="To enhance session accuracy, you may complete a prior assessment (MBTI, StrengthsFinder, Enneagram, or 360° Leadership). This is non-blocking."
          metaInfo="Duration: 5 Minutes"
          buttonLabel="Begin"
          onButtonClick={handleBegin}
        />
      </main>
    </div>
  );
}
