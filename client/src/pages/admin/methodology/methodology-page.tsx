import { useLocation, useParams } from "wouter";
import { BookOpen, ListOrdered } from "lucide-react";
import AdminLayout from "../layout";
import { RequirePlatformAdmin } from "../require-platform-admin";
import { PageShell, PageHeader } from "@/components/admin/page";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { CardsPanel } from "./cards-panel";
import { SequencesPanel } from "./sequences-panel";

/**
 * The methodology library.
 *
 * ── CARDS AND SEQUENCES ARE ONE THING ────────────────────────────────────
 * A heuristic card does nothing until a sequence makes it live for a cohort;
 * a sequence is a list of cards. They were two screens joined by a button in
 * each header pointing at the other, which is the shape you get when two halves
 * of one idea are given separate routes. Editing a card and checking whether it
 * is actually firing was a navigation, and the answer arrived after you had
 * stopped looking at the card.
 */

const TABS = [
  { id: "cards", label: "Cards", icon: BookOpen },
  { id: "sequences", label: "Sequences", icon: ListOrdered },
] as const;

type TabId = (typeof TABS)[number]["id"];

export default function MethodologyPage() {
  const params = useParams();
  const [, navigate] = useLocation();

  const raw = params.tab;
  const tab: TabId = TABS.some((t) => t.id === raw) ? (raw as TabId) : "cards";

  return (
    <RequirePlatformAdmin>
      <AdminLayout breadcrumb={tab === "sequences" ? "Sequences" : undefined}>
        <PageShell width="wide">
          <PageHeader
            title="Methodology"
            description="The heuristic cards Wing executes during a conversation, and the sequences that decide which are live for a cohort. Changes take effect without a deploy."
          />

          <Tabs
            value={tab}
            onValueChange={(v) => navigate(`/admin/methodology/${v}`)}
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

            {tab === "cards" && <CardsPanel />}
            {tab === "sequences" && <SequencesPanel />}
          </Tabs>
        </PageShell>
      </AdminLayout>
    </RequirePlatformAdmin>
  );
}
