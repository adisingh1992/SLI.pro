import { useLocation, useParams } from "wouter";
import { CalendarDays, Mail, Send } from "lucide-react";
import AdminLayout from "../layout";
import { PageShell, PageHeader } from "@/components/admin/page";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { TemplatesPanel } from "./templates-panel";
import { CalendarPanel } from "./calendar-panel";
import { DeliveryPanel } from "./delivery-panel";

/**
 * Everything Wing says outside a session.
 *
 * ── WHY THESE THREE ARE ONE SCREEN ───────────────────────────────────────
 * They were three, and the split cut across the actual task rather than along
 * it. Adding a calendar touchpoint does nothing unless its template is
 * published; publishing a template tells you nothing about whether the last one
 * arrived. Someone setting up recruiting-season mail needs all three, and had
 * to hold the relationship between them in their head while navigating between
 * two screens and psql.
 *
 * The delivery tab did not exist at all. `failed_at` and `failure_reason` were
 * added to `message_events` after a send that reported success and never
 * arrived — but the only way to read them was a database client, which means
 * the person who most needs to know a message failed was the least able to find
 * out. That was the same invisibility the original bug had.
 *
 * ── TAB IN THE PATH ──────────────────────────────────────────────────────
 * `/admin/messages/calendar` rather than component state, so the old
 * `/admin/calendar` and `/admin/templates` bookmarks can redirect somewhere
 * exact, and so "look at the delivery log" is a link someone can paste.
 */

const TABS = [
  { id: "templates", label: "Templates", icon: Mail },
  { id: "calendar", label: "Academic calendar", icon: CalendarDays },
  { id: "delivery", label: "Delivery", icon: Send },
] as const;

type TabId = (typeof TABS)[number]["id"];

export default function MessagesPage() {
  const params = useParams();
  const [, navigate] = useLocation();

  const raw = params.tab;
  const tab: TabId = TABS.some((t) => t.id === raw) ? (raw as TabId) : "templates";

  return (
    <AdminLayout breadcrumb={TABS.find((t) => t.id === tab)?.label}>
      <PageShell width="wide">
        <PageHeader
          title="Messages"
          description="Every email Wing sends outside a session — the copy, the dates that trigger it, and whether it arrived. Template changes are live on publish, with no deploy."
        />

        <Tabs
          value={tab}
          onValueChange={(v) => navigate(`/admin/messages/${v}`)}
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

          {/* Mounted one at a time — the templates panel holds unsaved editor
              state, and the delivery panel pulls 200 rows. Neither should run
              because the other is on screen. */}
          {tab === "templates" && <TemplatesPanel />}
          {tab === "calendar" && <CalendarPanel />}
          {tab === "delivery" && <DeliveryPanel />}
        </Tabs>
      </PageShell>
    </AdminLayout>
  );
}
