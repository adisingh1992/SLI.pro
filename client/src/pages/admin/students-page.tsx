import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { Users, X } from "lucide-react";
import { apiRequest } from "@/lib/queryClient";
import AdminLayout from "./layout";
import { PageShell, PageHeader } from "@/components/admin/page";
import { DataTable, type Column } from "@/components/admin/data-table";
import { EmptyState } from "@/components/admin/states";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";

/**
 * The cohort.
 *
 * ── THE STATUS COLUMN WAS A RAINBOW ──────────────────────────────────────
 * "Status" here is not a category, it is a position in a thirteen-step funnel:
 * Registered → intake → questionnaire → documents → three sessions → three
 * modules → freshness report → SLI → LinkedIn. The old screen rendered each
 * step in its own pastel — sky, blue, indigo, violet, purple, fuchsia — which
 * looks like meaning and carries none. Nobody can rank thirteen hues, so the
 * one genuinely useful question ("how far along is this person?") took reading
 * every row.
 *
 * A step counter and a progress bar answer it at a glance and sort correctly,
 * because the underlying value is ordinal and now the display admits it.
 *
 * ── PAGINATION REMOVED ───────────────────────────────────────────────────
 * The old screen paginated a client-side array at ten rows a page, with a page
 * size selector. The entire cohort is 255 people and already fully in memory;
 * paging it added three controls and a piece of state to hide rows the browser
 * had already loaded. Scrolling is fine at this size, and searching is faster
 * than paging at any size.
 */

type Student = {
  id: number;
  email?: string | null;
  username?: string | null;
  firstName?: string | null;
  lastName?: string | null;
  /**
   * Position in the thirteen-step funnel.
   *
   * Named apart from `status` deliberately. The server used to spread the user
   * row and then set `status` to the funnel stage, so the funnel silently
   * overwrote the account state — two unrelated meanings on one key, with the
   * spread order deciding which survived.
   */
  journeyStatus?: string | null;
  /** Account state: active / suspended / closed. */
  status?: string | null;
  professionalStatus?: string | null;
  school?: string | null;
  academicProgram?: string | null;
  isTestUser?: boolean;
  isAdmin?: boolean;
  createdAt?: string | null;
  lastLoginAt?: string | null;
};

/** Ordered. Index is the step number — that is the whole point. */
const FUNNEL = [
  "Registered",
  "Registration Intake Completed",
  "Questionnaire Completed",
  "Documents Uploaded",
  "Foundation Session 1 Completed",
  "Foundation Session 2 Completed",
  "Foundation Session 3 Completed",
  "Enhancement Module A Completed",
  "Enhancement Module B Completed",
  "Enhancement Module C Completed",
  "Freshness Report Generated",
  "SLI Generated",
  "LinkedIn Optimization Done",
];

/** Shorter labels — the full strings are unreadable in a table cell. */
const SHORT: Record<string, string> = {
  "Registered": "Registered",
  "Registration Intake Completed": "Intake done",
  "Questionnaire Completed": "Assessment done",
  "Documents Uploaded": "Documents in",
  "Foundation Session 1 Completed": "Session 1",
  "Foundation Session 2 Completed": "Session 2",
  "Foundation Session 3 Completed": "Session 3",
  "Enhancement Module A Completed": "Module A",
  "Enhancement Module B Completed": "Module B",
  "Enhancement Module C Completed": "Module C",
  "Freshness Report Generated": "Freshness report",
  "SLI Generated": "Positioning ready",
  "LinkedIn Optimization Done": "LinkedIn done",
};

const SITUATION: Record<string, string> = {
  undergraduate_or_recent_grad: "Undergrad",
  early_career: "Early career",
  mid_career_or_senior: "Mid-career",
  career_break_or_transition: "Career break",
};

const stepOf = (status?: string | null) => {
  const i = FUNNEL.indexOf(status ?? "Registered");
  return i < 0 ? 0 : i;
};

const fmt = (v?: string | null) =>
  v ? new Date(v).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" }) : "—";

function Progress({ status }: { status?: string | null }) {
  const step = stepOf(status);
  const pct = Math.round((step / (FUNNEL.length - 1)) * 100);

  return (
    <div className="min-w-[10rem] space-y-1.5">
      <div className="flex items-center justify-between gap-2">
        <span className="text-sm">{SHORT[status ?? "Registered"] ?? status}</span>
        <span className="shrink-0 text-xs tabular-nums text-muted-foreground">
          {step + 1}/{FUNNEL.length}
        </span>
      </div>
      <div className="h-1.5 overflow-hidden rounded-full bg-muted">
        <div
          className={cn(
            "h-full rounded-full transition-all",
            // Three bands, not thirteen: not started, in the work, done. That
            // is the amount of distinction a colour can actually carry.
            step === 0 ? "bg-muted-foreground/25" : step >= 11 ? "bg-good" : "bg-brand",
          )}
          style={{ width: `${Math.max(pct, 4)}%` }}
        />
      </div>
    </div>
  );
}

export default function StudentsPage() {
  const [, navigate] = useLocation();
  const [situation, setSituation] = useState("all");
  const [stage, setStage] = useState("all");
  const [showTest, setShowTest] = useState(false);

  const students = useQuery<Student[]>({
    queryKey: ["/api/admin/users"],
    queryFn: async () => (await apiRequest("GET", "/api/admin/users")).json(),
  });

  const rows = useMemo(() => {
    let out = (students.data ?? []).filter((u) => !u.isAdmin);
    // Test accounts are excluded by default and counted separately. They were
    // mixed into the list, which quietly inflated every number anyone read off
    // this screen.
    if (!showTest) out = out.filter((u) => !u.isTestUser);
    if (situation !== "all") out = out.filter((u) => u.professionalStatus === situation);
    if (stage !== "all") {
      out =
        stage === "not-started"
          ? out.filter((u) => stepOf(u.journeyStatus) === 0)
          : stage === "in-progress"
            ? out.filter((u) => stepOf(u.journeyStatus) > 0 && stepOf(u.journeyStatus) < 6)
            : out.filter((u) => stepOf(u.journeyStatus) >= 6);
    }
    return out;
  }, [students.data, situation, stage, showTest]);

  const testCount = (students.data ?? []).filter((u) => u.isTestUser && !u.isAdmin).length;
  const filtered = situation !== "all" || stage !== "all";

  const name = (u: Student) =>
    `${u.firstName ?? ""} ${u.lastName ?? ""}`.trim() || u.email || u.username || `#${u.id}`;

  const columns: Column<Student>[] = [
    {
      id: "name",
      header: "Student",
      sortBy: (u) => `${u.lastName ?? ""} ${u.firstName ?? ""}`.trim().toLowerCase(),
      cell: (u) => (
        <div className="min-w-0">
          <p className="truncate font-medium">{name(u)}</p>
          <p className="truncate text-xs text-muted-foreground">{u.email ?? u.username}</p>
        </div>
      ),
    },
    {
      id: "progress",
      header: "Progress",
      sortBy: (u) => stepOf(u.journeyStatus),
      cell: (u) => <Progress status={u.journeyStatus} />,
    },
    {
      id: "situation",
      header: "Situation",
      sortBy: (u) => u.professionalStatus ?? "",
      cell: (u) =>
        u.professionalStatus ? (
          <Badge
            variant="outline"
            className="whitespace-nowrap border-info/25 bg-info-soft font-normal text-info"
          >
            {SITUATION[u.professionalStatus] ?? u.professionalStatus.replace(/_/g, " ")}
          </Badge>
        ) : (
          <span className="text-muted-foreground">—</span>
        ),
    },
    {
      id: "school",
      header: "School",
      sortBy: (u) => u.school ?? "",
      cell: (u) => <span className="text-sm">{u.school || "—"}</span>,
    },
    {
      id: "registered",
      header: "Registered",
      sortBy: (u) => (u.createdAt ? new Date(u.createdAt).getTime() : null),
      cell: (u) => <span className="whitespace-nowrap text-sm">{fmt(u.createdAt)}</span>,
    },
    {
      id: "lastSeen",
      header: "Last seen",
      sortBy: (u) => (u.lastLoginAt ? new Date(u.lastLoginAt).getTime() : null),
      cell: (u) => (
        <span className="whitespace-nowrap text-sm text-muted-foreground">
          {fmt(u.lastLoginAt)}
        </span>
      ),
    },
  ];

  return (
    <AdminLayout>
      <PageShell width="wide">
        <PageHeader
          title="Students"
          description={
            students.data
              ? `${rows.length} student${rows.length === 1 ? "" : "s"}${
                  filtered ? " matching these filters" : ""
                }${!showTest && testCount ? ` · ${testCount} test account${testCount === 1 ? "" : "s"} hidden` : ""}`
              : "Everyone enrolled, and how far each has got."
          }
        />

        <DataTable
          rows={rows}
          columns={columns}
          rowKey={(u) => u.id}
          onRowClick={(u) => navigate(`/admin/users/${u.id}`)}
          isLoading={students.isLoading}
          error={students.error}
          onRetry={() => students.refetch()}
          searchable={(u) => `${name(u)} ${u.email ?? ""} ${u.school ?? ""}`}
          searchPlaceholder="Search by name, email or school…"
          empty={
            <EmptyState
              icon={Users}
              title={filtered ? "No students match" : "No students yet"}
              description={
                filtered
                  ? "Try widening the filters — the cohort is small enough that most combinations return nothing."
                  : "Students appear here as soon as they register. If you're expecting people and seeing none, check that their email domain is mapped to an institution."
              }
              action={
                filtered && (
                  <Button
                    variant="outline"
                    onClick={() => {
                      setSituation("all");
                      setStage("all");
                    }}
                  >
                    Clear filters
                  </Button>
                )
              }
            />
          }
          toolbar={
            <div className="flex flex-wrap items-center gap-2">
              <Select value={stage} onValueChange={setStage}>
                <SelectTrigger className="w-[10.5rem]">
                  <SelectValue placeholder="Any stage" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Any stage</SelectItem>
                  <SelectItem value="not-started">Not started</SelectItem>
                  <SelectItem value="in-progress">In the sessions</SelectItem>
                  <SelectItem value="finished">Finished the three</SelectItem>
                </SelectContent>
              </Select>

              <Select value={situation} onValueChange={setSituation}>
                <SelectTrigger className="w-[10.5rem]">
                  <SelectValue placeholder="Any situation" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Any situation</SelectItem>
                  {Object.entries(SITUATION).map(([value, label]) => (
                    <SelectItem key={value} value={value}>
                      {label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>

              {testCount > 0 && (
                <Button
                  variant={showTest ? "secondary" : "ghost"}
                  size="sm"
                  onClick={() => setShowTest((v) => !v)}
                >
                  {showTest ? `Hide ${testCount} test` : `Show ${testCount} test`}
                </Button>
              )}

              {filtered && (
                <Button
                  variant="ghost"
                  size="sm"
                  className="text-muted-foreground"
                  onClick={() => {
                    setSituation("all");
                    setStage("all");
                  }}
                >
                  <X className="mr-1 h-3.5 w-3.5" />
                  Clear
                </Button>
              )}
            </div>
          }
        />
      </PageShell>
    </AdminLayout>
  );
}
