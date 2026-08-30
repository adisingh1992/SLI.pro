import { useLocation, useParams } from "wouter";
import { CheckSquare, ScanSearch } from "lucide-react";
import AdminLayout from "../layout";
import { RequirePlatformAdmin } from "../require-platform-admin";
import { PageShell, PageHeader } from "@/components/admin/page";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { AlertTriangle } from "lucide-react";
import { CriteriaPanel } from "./criteria-panel";
import { AnalysisPanel } from "./analysis-panel";

/**
 * How a session works, once it is under way.
 *
 * ── TWO SCREENS THAT ONLY MAKE SENSE TOGETHER ────────────────────────────
 * These were "Completion" and "Analysis" — separate sidebar entries whose
 * relationship was explained only in a comment in the old layout file, where
 * nobody using the product could read it. They are two stages of one pipeline:
 *
 *   Completion   whether the session got where it was going
 *   Analysis     how the finished transcript is then read
 *
 * There was a third, "Objectives" — what the session is trying to reach. It
 * edited `objective_sets`, which the renderer read and which was retired in
 * Tier 1 part 4 (migration 0032); the renderer was never enabled for any
 * population and never assembled a prompt. An editor whose saves reach nothing
 * is worse than no editor, because it looks like methodology is in force. What
 * a session is trying to reach now lives in the v2 Foundation cards, edited
 * under Methodology.
 *
 * ── THE WARNING IS ON THE PAGE, NOT IN THE SOURCE ────────────────────────
 * Nothing here has a review gate. A saved criterion applies to every student on
 * their next session. That was documented in a file comment; it now sits above
 * the tabs where the person about to click Save can see it.
 */

const TABS = [
  { id: "completion", label: "Completion", icon: CheckSquare },
  { id: "analysis", label: "Analysis", icon: ScanSearch },
] as const;

type TabId = (typeof TABS)[number]["id"];

/** Old routes: two that were once their own pages, and one that is now retired. */
const LEGACY: Record<string, TabId> = {
  criteria: "completion",
  methodology: "analysis",
  objectives: "completion",
};

export default function SessionDesignPage() {
  const params = useParams();
  const [, navigate] = useLocation();

  const raw = params.tab;
  const tab: TabId = TABS.some((t) => t.id === raw)
    ? (raw as TabId)
    : (LEGACY[raw ?? ""] ?? "completion");

  return (
    <RequirePlatformAdmin>
      <AdminLayout breadcrumb={TABS.find((t) => t.id === tab)?.label}>
        <PageShell width="wide">
          <PageHeader
            title="Session design"
            description="When a session counts as finished, and how the transcript is read afterwards."
          />

          <Alert className="border-warn/30 bg-warn-soft [&>svg]:text-warn">
            <AlertTriangle className="h-4 w-4" />
            <AlertTitle>There is no review step</AlertTitle>
            <AlertDescription>
              Anything saved here applies to every student's next session immediately. For
              completion criteria in particular, run a replay against finished sessions before
              publishing — it's the only check between an edit and the whole cohort.
            </AlertDescription>
          </Alert>

          <Tabs
            value={tab}
            onValueChange={(v) => navigate(`/admin/session-design/${v}`)}
            className="space-y-6"
          >
            <div className="-mx-1 overflow-x-auto px-1 pb-1">
              <TabsList className="inline-flex w-auto">
                {TABS.map((t) => (
                  <TabsTrigger key={t.id} value={t.id} className="gap-1.5 data-[state=active]:bg-brand-soft data-[state=active]:text-brand data-[state=active]:shadow-sm">
                    <t.icon className="h-3.5 w-3.5" />
                    {t.label}
                  </TabsTrigger>
                ))}
              </TabsList>
            </div>

            {tab === "completion" && <CriteriaPanel />}
            {tab === "analysis" && <AnalysisPanel />}
          </Tabs>
        </PageShell>
      </AdminLayout>
    </RequirePlatformAdmin>
  );
}
