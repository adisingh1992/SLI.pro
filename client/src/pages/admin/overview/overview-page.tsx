import { useLocation, useParams } from "wouter";
import { BarChart3, Download } from "lucide-react";
import AdminLayout from "../layout";
import { PageShell, PageHeader } from "@/components/admin/page";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { MetricsPanel } from "./metrics-panel";
import { ExportsPanel } from "./exports-panel";

/**
 * The cohort overview.
 *
 * ── WHY REPORTS FOLDED IN HERE ───────────────────────────────────────────
 * "Reports" was its own sidebar section containing a grid of download buttons
 * and nothing else. It is the same data as the dashboard in a different
 * container — you look at the numbers, then you export the numbers, and those
 * are two steps of one task rather than two areas of the product. Keeping them
 * apart meant a director building a board deck bounced between two screens to
 * check a figure against the spreadsheet they had just downloaded.
 */

const TABS = [
  { id: "metrics", label: "Metrics", icon: BarChart3 },
  { id: "exports", label: "Exports", icon: Download },
] as const;

type TabId = (typeof TABS)[number]["id"];

export default function OverviewPage() {
  const params = useParams();
  const [, navigate] = useLocation();

  const raw = params.tab;
  const tab: TabId = TABS.some((t) => t.id === raw) ? (raw as TabId) : "metrics";

  return (
    <AdminLayout breadcrumb={tab === "exports" ? "Exports" : undefined}>
      <PageShell width="wide">
        <PageHeader
          title="Overview"
          description="Engagement and completion across the cohort. Rates show “—” where there's nobody to measure, rather than 0%."
        />

        <Tabs
          value={tab}
          onValueChange={(v) => navigate(v === "metrics" ? "/admin/dashboard" : `/admin/dashboard/${v}`)}
          className="space-y-6"
        >
          <TabsList>
            {TABS.map((t) => (
              <TabsTrigger key={t.id} value={t.id} className="gap-1.5 data-[state=active]:bg-brand-soft data-[state=active]:text-brand data-[state=active]:shadow-sm">
                <t.icon className="h-3.5 w-3.5" />
                {t.label}
              </TabsTrigger>
            ))}
          </TabsList>

          {tab === "metrics" && <MetricsPanel />}
          {tab === "exports" && <ExportsPanel />}
        </Tabs>
      </PageShell>
    </AdminLayout>
  );
}
