import { useAuth } from "@/hooks/use-auth";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Button } from "@/components/ui/button";
import { LogOut, User, ChevronDown } from "lucide-react";
import { useLocation } from "wouter";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import {
  UserProfile,
  FoundationSession,
  EnhancementModule,
  Sli,
  FreshnessReport,
  LinkedinOptimization,
  HomeworkAssignment,
} from "@shared/schema";
import { Loader2 } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import DashboardSidebar from "@/components/dashboard/DashboardSidebar";
import DirectiveCard from "@/components/dashboard/DirectiveCard";
import SessionCard from "@/components/dashboard/SessionCard";
import ToolCard from "@/components/dashboard/ToolCard";
import UserAvatar from "@/components/user-avatar";
import "@/assets/css/new-dashboard.css";
import { hasSelectedSli, hasRefinedSli } from "@/lib/sli";

/*
 * A2: "Add contextual micro-copy at every transition: what the next section
 * does, approximately how long it takes, and what it will reveal."
 *
 * The reported complaint was a "lack of instructions and rationale at
 * transition points" — students arriving at a session with no idea what they
 * were walking into or why. So each entry now carries all three, and `reveals`
 * is deliberately phrased as an OUTCOME the student leaves with rather than a
 * description of the activity. "Identify measurable expertise" tells you what
 * you will be doing; "which of your claims someone would actually bet on" tells
 * you what you get, which is the part that decides whether they start.
 */
const SESSION_CONTENT = [
  {
    header: "Session 1",
    title: "Functional Identity Mapping",
    description: "Define your primary business function and positioning",
    duration: "About 10 minutes",
    reveals: "Which single function you're credible in — and what you've been hedging across.",
  },
  {
    header: "Session 2",
    title: "Professional Credibility Assessment",
    description: "Identify measurable expertise and business impact",
    duration: "About 12 minutes",
    reveals: "Which of your claims someone would actually bet on, and which need proof.",
  },
  {
    header: "Session 3",
    title: "Positioning Story Development",
    description: "Extract compelling stories that prove your unique value",
    duration: "About 12 minutes",
    reveals: "The story you'll tell when someone asks what you do — built from evidence, not adjectives.",
  },
];

const MODULE_CONTENT: Record<
  string,
  { header: string; title: string; description: string; duration: string; reveals: string }
> = {
  A: {
    header: "Module A",
    title: "Digital Behavior Analysis Framework",
    description:
      "Analyze your LinkedIn presence and content strategy patterns to identify opportunities and barriers for professional growth.",
    duration: "About 15 minutes",
    reveals: "What your LinkedIn currently signals versus what you meant it to.",
  },
  B: {
    header: "Module B",
    title: "Network Position Mapping Framework",
    description:
      "Map your current network position and develop strategic relationship building approaches for enhanced professional influence.",
    duration: "About 12 minutes",
    reveals: "The ten people worth knowing that you don't yet, and a way in.",
  },
  C: {
    header: "Module C",
    title: "Career Aspiration Alignment Framework",
    description:
      "Align your long-term career aspirations with your current positioning to create an actionable roadmap for professional advancement.",
    duration: "About 10 minutes",
    reveals: "Whether where you're heading and where you're positioned are the same place."
  },
};

interface ToolsData {
  userSlis?: Sli[];
  latestFreshnessReport?: FreshnessReport;
  latestLinkedinOptimization?: LinkedinOptimization;
  homeworkData?: HomeworkAssignment[];
}

function useDashboardStatus(
  userProfile?: UserProfile,
  foundationSessions?: FoundationSession[],
  enhancementModules?: EnhancementModule[],
) {
  const isAssessmentComplete =
    !!userProfile?.questionnaire && userProfile.questionnaire.isDraft !== true;

  const hasResume =
    userProfile?.documents?.some((doc) => doc.type === "resume") ?? false;
  const hasLinkedIn =
    userProfile?.documents?.some((doc) => doc.type === "linkedin") ?? false;
  const isDocumentsComplete = hasResume && hasLinkedIn;

  const completedSessionCount =
    foundationSessions?.filter((s) => s.status === "completed").length ?? 0;
  const areAllSessionsComplete = completedSessionCount >= 3;

  const areAllModulesComplete =
    !!enhancementModules &&
    enhancementModules.length > 0 &&
    enhancementModules.every((m) => m.status === "completed");

  return {
    isAssessmentComplete,
    hasResume,
    hasLinkedIn,
    isDocumentsComplete,
    areAllSessionsComplete,
    areAllModulesComplete,
  };
}

type DashboardStatus = ReturnType<typeof useDashboardStatus>;

function buildSidebarSections(
  status: DashboardStatus,
  foundationSessions?: FoundationSession[],
  enhancementModules?: EnhancementModule[],
  toolsData?: ToolsData,
  isAdmin?: boolean,
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

  const hasSli = toolsData?.userSlis && toolsData.userSlis.length > 0;
  const hasSliSelected =
    hasSli && hasSelectedSli(toolsData.userSlis);
  const hasSliRefined = hasSli && hasRefinedSli(toolsData.userSlis);
  const hasFreshnessReport = !!toolsData?.latestFreshnessReport;
  const hasLinkedInOpt = !!toolsData?.latestLinkedinOptimization;
  const canGenerateLinkedIn =
    status.isDocumentsComplete &&
    (hasSliSelected || hasSliRefined) &&
    hasFreshnessReport;

  const sections = [
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
            /* A3: "Enhancement Modules should NOT be progressive — students can
               complete them in any order or skip entirely." B and C used to
               wait on A and B respectively. Only the Foundation Sessions
               prerequisite remains, because the modules genuinely do read the
               SLI and functional identity those produce. */
            {
              label: "Network Position Mapping",
              locked: !status.areAllSessionsComplete,
              completed: moduleBDone,
            },
            {
              label: "Career Aspiration Alignment",
              locked: !status.areAllSessionsComplete,
              completed: getModuleCompleted("C"),
            },
          ],
        },
        {
          title: "Phase 4 - Advanced Tools",
          // A3: optional modules cannot gate the tools.
          disabled: !status.areAllSessionsComplete,
          items: [
            {
              label: "Schedule Coaching Call",
              locked: !status.areAllSessionsComplete,
              completed: false,
            },
            {
              label: "Brand Intelligence Report",
              locked: !status.areAllSessionsComplete,
              completed: hasFreshnessReport,
            },
            {
              label: "Single Lasting Impression",
              locked: !status.areAllSessionsComplete || !hasSli,
              completed: !!(hasSliSelected || hasSliRefined),
            },
            {
              label: "LinkedIn Optimization",
              locked: !status.areAllSessionsComplete || !canGenerateLinkedIn,
              completed: hasLinkedInOpt,
            },
            {
              label: "Strategic Content",
              locked: !status.areAllSessionsComplete || !canGenerateLinkedIn,
              completed: false,
            },
            ...(!isAdmin
              ? [
                  {
                    label: "Assigned Homework",
                    locked: !status.areAllSessionsComplete,
                    completed: false,
                  },
                ]
              : []),
          ],
        },
      ],
    },
  ];

  return sections;
}

function getCurrentPhase(
  status: DashboardStatus,
): "assessment" | "documents" | "sessions" | "enhancement" | "tools" {
  if (!status.isAssessmentComplete) return "assessment";
  if (!status.isDocumentsComplete) return "documents";
  if (!status.areAllSessionsComplete) return "sessions";
  /*
   * A3: modules are optional, so they no longer hold the phase.
   *
   * `if (!areAllModulesComplete) return "enhancement"` used to sit here, and it
   * WAS the "undergraduate platform forces students to complete Enhancement
   * Modules" bug. Nothing displayed a lock and nothing explained itself — the
   * phase simply never advanced past "enhancement" until all three modules were
   * finished, so every tool stayed out of reach for a reason the student could
   * not see.
   *
   * Finishing the Foundation Sessions is now what opens the tools. The modules
   * remain available alongside them, in any order or not at all.
   */
  return "tools";
}

export default function NewDashboardPage() {
  const { user, logoutMutation } = useAuth();
  const [, navigate] = useLocation();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const { data: userProfile, isLoading } = useQuery<UserProfile>({
    queryKey: ["/api/user/profile"],
    enabled: !!user,
    staleTime: 0,
    refetchOnMount: "always",
    refetchOnWindowFocus: true,
  });

  const { data: foundationSessions } = useQuery<FoundationSession[]>({
    queryKey: ["/api/foundation-sessions"],
    enabled: !!user,
    retry: false,
    staleTime: 0,
    refetchOnMount: "always",
  });

  const { data: enhancementModules } = useQuery<EnhancementModule[]>({
    queryKey: ["/api/enhancement-modules"],
    enabled: !!user,
    retry: false,
    staleTime: 0,
    refetchOnMount: "always",
  });

  const { data: userSlis } = useQuery<Sli[]>({
    queryKey: ["/api/user/slis"],
    enabled: !!user,
    retry: false,
    staleTime: 0,
    refetchOnMount: "always",
  });

  const { data: latestFreshnessReport } = useQuery<FreshnessReport>({
    queryKey: ["/api/freshness-reports/latest"],
    enabled: !!user,
    retry: false,
    staleTime: 0,
    refetchOnMount: "always",
  });

  const { data: latestLinkedinOptimization } = useQuery<LinkedinOptimization>({
    queryKey: ["/api/linkedin-optimizations/latest"],
    enabled: !!user,
    retry: false,
    staleTime: 0,
    refetchOnMount: "always",
  });

  const { data: homeworkData } = useQuery<HomeworkAssignment[]>({
    queryKey: ["/api/user/homework"],
    enabled: !!user && !user?.isAdmin,
    retry: false,
    staleTime: 0,
    refetchOnMount: "always",
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

  const status = useDashboardStatus(
    userProfile,
    foundationSessions,
    enhancementModules,
  );
  const currentPhase = getCurrentPhase(status);

  const toolsData: ToolsData = {
    userSlis,
    latestFreshnessReport,
    latestLinkedinOptimization,
    homeworkData,
  };

  const sidebarSections = buildSidebarSections(
    status,
    foundationSessions,
    enhancementModules,
    toolsData,
    !!user?.isAdmin,
  );

  const hasSli = userSlis && userSlis.length > 0;
  const hasSliSelected = hasSli && hasSelectedSli(userSlis);
  const hasSliRefined = hasSli && hasRefinedSli(userSlis);
  const canGenerateLinkedIn =
    status.isDocumentsComplete &&
    (hasSliSelected || hasSliRefined) &&
    !!latestFreshnessReport;

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
    } else if (item.label === "Schedule Coaching Call") {
      window.open("https://calendly.com/dcara-sli/haas", "_blank");
    } else if (item.label === "Brand Intelligence Report") {
      navigate("/freshness-report");
    } else if (item.label === "Single Lasting Impression") {
      if (hasSliSelected) {
        navigate("/sli-refinement");
      } else if (hasSli) {
        navigate("/sli-selection");
      }
    } else if (item.label === "LinkedIn Optimization") {
      if (latestLinkedinOptimization) {
        navigate(`/linkedin-optimization/${latestLinkedinOptimization.id}`);
      } else {
        navigate("/linkedin-optimization/generate");
      }
    } else if (item.label === "Strategic Content") {
      navigate("/linkedin-content-drafts");
    } else if (item.label === "Assigned Homework") {
      navigate("/homework");
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
    const module = enhancementModules?.find((m) => m.moduleCode === moduleCode);
    if (!module) {
      startModuleMutation.mutate(moduleCode);
      return;
    }
    if (module.status === "available") {
      startModuleMutation.mutate(moduleCode);
    } else if (
      module.status === "in_progress" ||
      module.status === "completed"
    ) {
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
    currentPhase === "tools"
      ? "Advanced"
      : currentPhase === "enhancement"
        ? "Enhancement"
        : currentPhase === "sessions"
          ? "Foundation"
          : "Foundation";
  const headingAccent =
    currentPhase === "tools"
      ? "Tools"
      : currentPhase === "enhancement"
        ? "Modules"
        : currentPhase === "sessions"
          ? "Sessions"
          : "Protocol";

  return (
    <div className="dashboard-layout flex min-h-screen overflow-hidden">
      <DashboardSidebar
        sections={sidebarSections}
        activePhaseTitle={
          currentPhase === "assessment" || currentPhase === "documents"
            ? "Phase 1 - Foundation Protocol"
            : currentPhase === "sessions"
              ? "Phase 2 - Foundation Sessions"
              : currentPhase === "enhancement"
                ? "Phase 3 - Enhancement Modules"
                : "Phase 4 - Advanced Tools"
        }
        onNavItemClick={handleNavItemClick}
      />

      <main className="flex-1 bg-[var(--dashboard-silk)] px-[100px] py-[60px] text-[var(--dashboard-void)] relative flex flex-col overflow-y-auto">
        <div className="absolute top-10 right-10">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button className="flex items-center gap-3 cursor-pointer outline-none">
                <span className="text-sm font-medium text-[var(--dashboard-void)]">
                  {user?.firstName} {user?.lastName}
                </span>
                <UserAvatar
                  firstName={user?.firstName || ""}
                  lastName={user?.lastName || ""}
                  size="small"
                />
                <ChevronDown className="w-4 h-4 text-[var(--dashboard-void)] opacity-60" />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-48">
              <DropdownMenuItem onClick={() => navigate("/profile")} className="cursor-pointer">
                <User className="mr-2 h-4 w-4" />
                <span>View Profile</span>
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem
                onClick={async () => {
                  await logoutMutation.mutateAsync();
                  navigate("/auth");
                }}
                className="cursor-pointer text-red-500"
              >
                <LogOut className="mr-2 h-4 w-4" />
                <span>Log Out</span>
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>

        <h1 className="dashboard-heading text-[56px] font-normal mb-6">
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
            {foundationSessions?.find(s => Number(s.sessionNumber) === 1)?.status === "available" && (
              <div className="rounded-lg border border-amber-300 bg-amber-50 px-6 py-4 flex gap-4 items-start">
                <span className="text-amber-500 mt-0.5 shrink-0 text-xl">⏱</span>
                <p className="text-sm leading-relaxed text-amber-900">
                  <span className="font-semibold">Set aside 25–35 minutes before you begin.</span>{" "}
                  These three sessions work together — each one builds on the last. The platform needs all three to generate your personalized positioning results, so starting when you actually have the time makes a big difference. Partial completion = partial results. One sitting, start to finish, is the best move.
                </p>
              </div>
            )}
            {foundationSessions?.slice(0, 3).map((session) => {
              const content = SESSION_CONTENT[session.sessionNumber - 1];
              if (!content) return null;
              const prevCompleted =
                session.sessionNumber === 1
                  ? true
                  : (foundationSessions?.some(
                      (s) =>
                        s.sessionNumber === session.sessionNumber - 1 &&
                        s.status === "completed",
                    ) ?? false);
              const cardStatus = prevCompleted ? session.status : "locked";
              return (
                <SessionCard
                  key={session.id}
                  header={content.header}
                  title={content.title}
                  description={content.description}
                  duration={content.duration}
                  reveals={content.reveals}
                  status={cardStatus}
                  onClick={() => handleSessionClick(session.sessionNumber)}
                />
              );
            })}
          </div>
        )}

        {/*
          A3: modules render in the tools phase, not a phase of their own.

          They used to have an exclusive "enhancement" phase that the dashboard
          could not leave until all three were finished. Now that the phase
          advances on sessions alone, an `=== "enhancement"` condition would
          never match and the modules would simply vanish — so they sit
          alongside the tools, which is what "optional" actually looks like on
          a screen.
        */}
        {/*
          A2 backward navigation: completed sessions stay on the main panel.

          The sessions block only renders while `currentPhase === "sessions"`,
          which stops being true the moment the third one finishes — so a
          student who wanted to reread Session 1 found the cards simply gone.
          They were still reachable from the sidebar, which is why this looked
          fine to anyone who knew where to click.

          Revisiting is safe at the data layer: putArtifact versions rather than
          overwrites, so continuing a finished session adds a new artifact
          version and cannot destroy the original outcome.
        */}
        {/*
          A2 career-evolution re-entry.

          Offered whenever an SLI exists, with no elapsed-time gate. The spec is
          explicit that re-engagement is "not just after years, and not just for
          career pivots" — a promotion six weeks after finishing counts, and a
          cooldown would amount to telling someone their positioning is not
          allowed to have changed yet.
        */}
        {/* A4: the portfolio is the artefact an advisor reads, so it sits above
            the refresh prompt rather than among the secondary tools. */}
        {currentPhase === "tools" && (
          <div className="max-w-[900px] rounded-lg border bg-muted/40 p-4">
            <p className="text-sm font-medium">Your evidence portfolio</p>
            <p className="pt-1 text-sm text-muted-foreground">
              What you can claim and what proves it, mapped to the competencies employers
              screen for. Built from your own words.
            </p>
            <Button variant="outline" className="mt-3" onClick={() => navigate("/portfolio")}>
              Open portfolio
            </Button>
          </div>
        )}

        {currentPhase === "tools" && (hasSliSelected || hasSliRefined) && (
          <div className="max-w-[900px] rounded-lg border bg-muted/40 p-4">
            <p className="text-sm font-medium">Has something changed?</p>
            <p className="pt-1 text-sm text-muted-foreground">
              A promotion, a move into something of your own, a different industry — or just a
              sense that your positioning doesn't fit any more. We'll build on what you've
              already done rather than starting over.
            </p>
            <Button
              variant="outline"
              className="mt-3"
              onClick={() => navigate("/positioning-refresh")}
            >
              Refresh my positioning
            </Button>
          </div>
        )}

        {currentPhase === "tools" && (
          <div className="flex flex-col gap-4 max-w-[900px]">
            <div>
              <h2 className="text-lg font-semibold">Your sessions</h2>
              <p className="text-sm text-muted-foreground">
                Reread any of these, or pick up one you paused. Nothing you've already
                worked out gets lost.
              </p>
            </div>
            {foundationSessions?.slice(0, 3).map((session) => {
              const content = SESSION_CONTENT[session.sessionNumber - 1];
              if (!content) return null;
              return (
                <SessionCard
                  key={session.id}
                  header={content.header}
                  title={content.title}
                  description={content.description}
                  duration={content.duration}
                  reveals={content.reveals}
                  status={session.status as any}
                  onClick={() => handleSessionClick(session.sessionNumber)}
                />
              );
            })}
          </div>
        )}

        {currentPhase === "tools" && (
          <div className="flex flex-col gap-4 max-w-[900px]">
            <div>
              <h2 className="text-lg font-semibold">Enhancement Modules</h2>
              <p className="text-sm text-muted-foreground">
                Optional, and in any order. Each one builds on your SLI rather than on the
                other modules.
              </p>
            </div>
            {(["A", "B", "C"] as const).map((code) => {
              const content = MODULE_CONTENT[code];
              const module = enhancementModules?.find(
                (m) => m.moduleCode === code,
              );
              // No prevCompleted: the modules are not a sequence. The only
              // prerequisite is the Foundation Sessions, and reaching this
              // phase means those are done.
              return (
                <SessionCard
                  key={code}
                  header={content.header}
                  title={content.title}
                  description={content.description}
                  duration={content.duration}
                  reveals={content.reveals}
                  status={module?.status ?? "available"}
                  onClick={() => handleModuleClick(code)}
                />
              );
            })}
          </div>
        )}

        {currentPhase === "tools" && (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 max-w-[900px]">
            <ToolCard
              title="Schedule Live Coaching Call"
              description="Book your 30-minute session with an SLI.pro expert to refine your professional positioning and create a powerful professional presence."
              buttonLabel="Schedule Now"
              onClick={() =>
                window.open("https://calendly.com/dcara-sli/haas", "_blank")
              }
              statusLabel="Available"
              statusType="available"
            />

            <ToolCard
              title="Review Your Brand Intelligence Report"
              description="Understand how your digital presence aligns with your career goals through a comprehensive analysis of your professional profile."
              buttonLabel={
                latestFreshnessReport ? "View Report" : "Generate Report"
              }
              onClick={() => navigate("/freshness-report")}
              statusLabel={latestFreshnessReport ? "Completed" : "Available"}
              statusType={latestFreshnessReport ? "completed" : "available"}
            />

            <ToolCard
              title="Discover Your Single Lasting Impression"
              description={
                hasSliRefined
                  ? "Your SLI has been refined and is ready to use."
                  : hasSliSelected
                    ? "You've selected your SLI. Consider refining it for maximum impact."
                    : hasSli
                      ? "Your SLI options are ready. Select the one that resonates with your professional identity."
                      : "SLI options will become available once your coach generates them based on your profile."
              }
              buttonLabel={
                hasSliRefined
                  ? "View Refined SLI"
                  : hasSliSelected
                    ? "View Selected SLI"
                    : hasSli
                      ? "Select Your SLI"
                      : "Awaiting Coach"
              }
              onClick={() => {
                if (hasSliSelected) {
                  navigate("/sli-refinement");
                } else if (hasSli) {
                  navigate("/sli-selection");
                }
              }}
              disabled={!hasSli}
              disabledMessage="SLI options will become available once your coach generates them based on your profile and sessions."
              statusLabel={
                hasSliRefined
                  ? "Refined"
                  : hasSliSelected
                    ? "Selected"
                    : hasSli
                      ? "Ready"
                      : undefined
              }
              statusType={
                hasSliRefined || hasSliSelected ? "completed" : "available"
              }
            />

            <ToolCard
              title="Optimize Your LinkedIn Profile"
              description="Get personalized recommendations to align your LinkedIn profile with your SLI and improve your professional presence."
              buttonLabel={
                latestLinkedinOptimization
                  ? "View Optimization"
                  : "Generate Optimization"
              }
              onClick={() => {
                if (latestLinkedinOptimization) {
                  navigate(
                    `/linkedin-optimization/${latestLinkedinOptimization.id}`,
                  );
                } else {
                  navigate("/linkedin-optimization/generate");
                }
              }}
              disabled={!canGenerateLinkedIn}
              disabledMessage={getLinkedInRequirementsMessage(
                status.isDocumentsComplete,
                !!(hasSliSelected || hasSliRefined),
                !!latestFreshnessReport,
              )}
              statusLabel={
                latestLinkedinOptimization
                  ? "Completed"
                  : canGenerateLinkedIn
                    ? "Available"
                    : undefined
              }
              statusType={
                latestLinkedinOptimization ? "completed" : "available"
              }
            />

            <ToolCard
              title="Generate Strategic Content"
              description="Create LinkedIn posts and professional content aligned with your brand positioning and SLI."
              buttonLabel="Generate Content"
              onClick={() => navigate("/linkedin-content-drafts")}
              disabled={!canGenerateLinkedIn}
              disabledMessage="Complete your Brand Intelligence Report, SLI selection, and document uploads first."
              statusLabel={canGenerateLinkedIn ? "Available" : undefined}
              statusType="available"
            />

            {user && !user.isAdmin && (
              <ToolCard
                title="Assigned Homework"
                description={
                  homeworkData && homeworkData.length > 0
                    ? `You have ${homeworkData.filter((hw) => !hw.answerText).length} unanswered questions waiting for your response.`
                    : "Your coach hasn't assigned any homework questions yet. Check back later."
                }
                buttonLabel={
                  homeworkData && homeworkData.length > 0
                    ? "Answer Now"
                    : "No Questions Yet"
                }
                onClick={() => navigate("/homework")}
                disabled={!homeworkData || homeworkData.length === 0}
                disabledMessage="Your coach hasn't assigned any homework questions yet. Check back later for personalized development questions."
                statusLabel={
                  homeworkData && homeworkData.length > 0
                    ? `${homeworkData.filter((hw) => hw.answerText).length}/${homeworkData.length} Complete`
                    : undefined
                }
                statusType={
                  homeworkData &&
                  homeworkData.length > 0 &&
                  homeworkData.filter((hw) => hw.answerText).length ===
                    homeworkData.length
                    ? "completed"
                    : "info"
                }
              />
            )}
          </div>
        )}
      </main>
    </div>
  );
}

function getLinkedInRequirementsMessage(
  hasDocuments: boolean,
  hasSli: boolean,
  hasFreshnessReport: boolean,
): string {
  if (!hasDocuments && !hasSli && !hasFreshnessReport) {
    return "Complete prerequisites to unlock LinkedIn optimization.";
  }
  if (!hasDocuments) {
    return "Upload your resume and LinkedIn profile first.";
  }
  if (!hasSli) {
    return "Select or refine your SLI first.";
  }
  if (!hasFreshnessReport) {
    return "Generate a Brand Intelligence Report first.";
  }
  return "Almost ready for LinkedIn optimization.";
}
