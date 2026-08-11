import { useLocation, useParams } from "wouter";
import { Beaker, Sparkles, Tag } from "lucide-react";
import AdminLayout from "../layout";
import { RequirePlatformAdmin } from "../require-platform-admin";
import { PageShell, PageHeader } from "@/components/admin/page";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { TaggingSessionsPanel } from "./sessions-panel";
import { ValidatePanel } from "./validate-panel";
import { ClassifierPanel } from "./classifier-panel";

/**
 * Turn tagging, and what it is for.
 *
 * ── THE LOOP WAS THREE UNCONNECTED SCREENS ───────────────────────────────
 * Tagging is a cycle: label turns by hand, measure the classifier against those
 * labels, publish the good ones as worked examples, measure again. The three
 * screens were the three stages, reachable only from a sidebar entry and two
 * URLs someone had to know about — so the loop existed in the code and nowhere
 * in the interface. Somebody tagging sessions had no visible path to the thing
 * their tagging was for.
 *
 * As tabs in cycle order, the workflow is legible from the screen itself.
 */

const TABS = [
  { id: "sessions", label: "Sessions", icon: Tag },
  { id: "validate", label: "Validation", icon: Beaker },
  { id: "classifier", label: "Classifier prompt", icon: Sparkles },
] as const;

type TabId = (typeof TABS)[number]["id"];

export default function TaggingPage() {
  const params = useParams();
  const [, navigate] = useLocation();

  const raw = params.tab;
  const tab: TabId = TABS.some((t) => t.id === raw) ? (raw as TabId) : "sessions";

  return (
    <RequirePlatformAdmin>
      <AdminLayout breadcrumb={tab === "sessions" ? undefined : TABS.find((t) => t.id === tab)?.label}>
        <PageShell width="wide">
          <PageHeader
            title="Turn tagging"
            description="Hand-labelled turns are the gold standard the classifier is measured against, and the worked examples it learns from. Label, validate, publish, repeat."
          />

          <Tabs
            value={tab}
            onValueChange={(v) => navigate(`/admin/tagging/${v}`)}
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

            {tab === "sessions" && <TaggingSessionsPanel />}
            {tab === "validate" && <ValidatePanel />}
            {tab === "classifier" && <ClassifierPanel />}
          </Tabs>
        </PageShell>
      </AdminLayout>
    </RequirePlatformAdmin>
  );
}
