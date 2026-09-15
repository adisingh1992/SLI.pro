import { useLocation, useParams } from "wouter";
import { FlaskConical, Users, ClipboardList } from "lucide-react";
import AdminLayout from "../layout";
import { RequirePlatformAdmin } from "../require-platform-admin";
import { PageShell, PageHeader } from "@/components/admin/page";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { SimulationsPanel } from "./simulations-panel";
import { PersonasPanel } from "./personas-panel";
import { UnfiredCardsPanel } from "./unfired-cards-panel";

/**
 * Test Harness — its own module, deliberately not a tab under Methodology.
 *
 * "I want you to create a separate set of pages... where all things related
 * to testing are there and those screens do not get mixed up with the
 * current pages" — Aditya, 10 Sep 2026. Everything here is either read-only
 * reconstruction of what already happened (Simulations) or authored test
 * data that becomes a `is_test_user = true` account (Personas) — never a
 * live methodology surface, so it does not belong beside Cards, Sequences,
 * Integrity or Voice, whatever tab bar it briefly shared with them.
 *
 * ── TAB ORDER FOLLOWS THE JOB, NOT THE DATA MODEL ─────────────────────────
 * This screen opened on Simulations for its first two weeks, because that is
 * the panel that got built first. For anyone arriving to *do* something that
 * is the wrong door: Simulations is a read-only forensic view of a session
 * that already exists, so a first-time visitor landed on an empty table with
 * no way to see what to do about it. The order is now the order of the work —
 * write a persona, run it, review the run, then look across runs — and
 * Personas is the default. Route ids are unchanged, so every link anyone has
 * already saved or pasted into a doc still resolves.
 */

const TABS = [
  {
    id: "personas",
    label: "Personas",
    icon: Users,
    blurb: "Write a test student, then run a session for them against the live methodology.",
  },
  {
    id: "simulations",
    label: "Session review",
    icon: FlaskConical,
    blurb: "Read any session turn by turn and see which coaching cards were considered, and why one won.",
  },
  {
    id: "reports",
    label: "Coverage",
    icon: ClipboardList,
    blurb: "Across every run on a sequence: which cards never fire, and whose problem that is.",
  },
] as const;

type TabId = (typeof TABS)[number]["id"];

const DEFAULT_TAB: TabId = "personas";

export default function TestingPage() {
  const params = useParams();
  const [, navigate] = useLocation();

  const raw = params.tab;
  const tab: TabId = TABS.some((t) => t.id === raw) ? (raw as TabId) : DEFAULT_TAB;
  const active = TABS.find((t) => t.id === tab);

  return (
    <RequirePlatformAdmin>
      <AdminLayout breadcrumb={tab !== DEFAULT_TAB ? active?.label : undefined}>
        <PageShell width="wide">
          <PageHeader
            title="Test Harness"
            description="Try out test personas, watch their sessions play out, and see which coaching moments fired and why. Nothing here is visible to real students."
          />

          <Tabs
            value={tab}
            onValueChange={(v) => navigate(`/admin/testing/${v}`)}
            className="space-y-6"
          >
            <div className="space-y-3">
              <TabsList>
                {TABS.map((t) => (
                  <TabsTrigger
                    key={t.id}
                    value={t.id}
                    className="gap-2 data-[state=active]:bg-brand-soft data-[state=active]:text-brand data-[state=active]:shadow-sm"
                  >
                    <t.icon className="h-4 w-4" />
                    {t.label}
                  </TabsTrigger>
                ))}
              </TabsList>

              {/* One line saying what this tab is for. Three tabs whose names
                  are all plausible synonyms to someone new ("personas",
                  "simulations", "reports") need it — without it the only way
                  to find the right one is to click all three. */}
              {active ? (
                <p className="text-sm text-muted-foreground">{active.blurb}</p>
              ) : null}
            </div>

            {tab === "simulations" && <SimulationsPanel />}
            {tab === "personas" && <PersonasPanel />}
            {tab === "reports" && <UnfiredCardsPanel />}
          </Tabs>
        </PageShell>
      </AdminLayout>
    </RequirePlatformAdmin>
  );
}
