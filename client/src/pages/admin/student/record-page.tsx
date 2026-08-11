import { useQuery } from "@tanstack/react-query";
import { Link, useLocation, useParams } from "wouter";
import {
  ArrowLeft,
  BookOpen,
  FileText,
  MessageSquare,
  ScrollText,
  Star,
  UserCircle,
} from "lucide-react";
import { getQueryFn } from "@/lib/queryClient";
import AdminLayout from "../layout";
import { PageShell, PageHeader } from "@/components/admin/page";
import { ErrorState } from "@/components/admin/states";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";

import { OverviewPanel } from "./overview-panel";
import { PositioningPanel } from "./positioning-panel";
import { SessionsPanel } from "./sessions-panel";
import { HomeworkPanel } from "./homework-panel";
import { NotesPanel } from "./notes-panel";
import { SummaryPanel } from "./summary-panel";
import type { StudentRecord } from "./types";

/**
 * One student, one screen.
 *
 * ── WHAT THIS REPLACES ───────────────────────────────────────────────────
 * Six separate pages — detail, summary, SLI, homework, transcripts and
 * coaching notes — each with its own route, its own header, its own auth
 * redirect, and its own copy of `useQuery(['/api/admin/users/:id'])`. Five of
 * them fetched the entire student profile, including every document and every
 * session, purely to render a name at the top.
 *
 * That was not a styling problem. An advisor reading a student before a meeting
 * had to visit six URLs, and each one dropped them back at the list. The
 * information is about one person; the screen should be too.
 *
 * ── THE TAB IS A PATH SEGMENT, ON PURPOSE ────────────────────────────────
 * `/admin/users/42/coaching-notes` was a real route that people have
 * bookmarked, and it is now a tab of this page with the same URL. Keeping the
 * tab in the path rather than in component state means every one of those old
 * links still lands exactly where it used to, deep links can be shared, and
 * the browser back button moves between tabs the way people expect.
 *
 * ── ONE FETCH, SHARED ────────────────────────────────────────────────────
 * The student is fetched here and passed down. The panels take the data as a
 * prop rather than re-querying, so switching tabs is instant and the name in
 * the header cannot disagree with the name in the body — which it could, and
 * occasionally did, when six pages fetched independently.
 */

const TABS = [
  { id: "overview", label: "Overview", icon: UserCircle },
  { id: "positioning", label: "Positioning", icon: Star },
  { id: "sessions", label: "Sessions", icon: MessageSquare },
  { id: "homework", label: "Homework", icon: BookOpen },
  { id: "coaching-notes", label: "Notes", icon: ScrollText },
  { id: "summary", label: "Summary", icon: FileText },
] as const;

type TabId = (typeof TABS)[number]["id"];

/** Old URLs that were their own page. Mapped so bookmarks survive. */
const LEGACY_TABS: Record<string, TabId> = {
  sli: "positioning",
  transcripts: "sessions",
  notes: "coaching-notes",
};

function resolveTab(raw: string | undefined): TabId {
  if (!raw) return "overview";
  if (TABS.some((t) => t.id === raw)) return raw as TabId;
  return LEGACY_TABS[raw] ?? "overview";
}

export default function StudentRecordPage() {
  const params = useParams();
  const [, navigate] = useLocation();

  const userId = params.id ? parseInt(params.id, 10) : undefined;
  const tab = resolveTab(params.tab);

  const student = useQuery<StudentRecord>({
    queryKey: [`/api/admin/users/${userId}`],
    queryFn: getQueryFn({ on401: "throw" }),
    enabled: !!userId,
  });

  const name = student.data
    ? `${student.data.firstName ?? ""} ${student.data.lastName ?? ""}`.trim() ||
      student.data.email
    : undefined;

  return (
    <AdminLayout breadcrumb={name ?? (student.isLoading ? "…" : "Student")}>
      <PageShell width="wide">
        <div>
          <Button
            variant="ghost"
            size="sm"
            className="-ml-2 mb-3 h-7 px-2 text-muted-foreground"
            asChild
          >
            <Link href="/admin/users">
              <ArrowLeft className="mr-1.5 h-3.5 w-3.5" />
              All students
            </Link>
          </Button>

          {student.isLoading ? (
            <div className="space-y-2">
              <Skeleton className="h-8 w-56" />
              <Skeleton className="h-4 w-72" />
            </div>
          ) : student.error ? (
            <ErrorState error={student.error} onRetry={() => student.refetch()} />
          ) : (
            <PageHeader
              title={name}
              description={
                <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
                  <span>{student.data?.email}</span>
                  {student.data?.isTestUser && (
                    <Badge variant="outline" className="text-[10px]">
                      test account
                    </Badge>
                  )}
                  {student.data?.status && student.data.status !== "active" && (
                    <Badge variant="destructive" className="text-[10px]">
                      {student.data.status}
                    </Badge>
                  )}
                </span>
              }
            />
          )}
        </div>

        {!student.error && (
          <Tabs
            value={tab}
            onValueChange={(v) => navigate(`/admin/users/${userId}/${v}`)}
            className="space-y-6"
          >
            {/* Scrolls rather than wraps: six tabs do not fit on a phone, and a
                wrapped second row shifts the whole page down on the widths
                where there is least room. */}
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

            {/*
              Only the active panel is mounted. These panels each run their own
              secondary queries — transcripts pulls every message of every
              session — and mounting all six would fire the lot on first paint
              to render one.
            */}
            {userId !== undefined && (
              <div>
                {tab === "overview" && (
                  <OverviewPanel student={student.data} isLoading={student.isLoading} />
                )}
                {tab === "positioning" && <PositioningPanel userId={userId} />}
                {tab === "sessions" && (
                  <SessionsPanel
                    userId={userId}
                    sessions={student.data?.foundationSessions}
                  />
                )}
                {tab === "homework" && <HomeworkPanel userId={userId} />}
                {tab === "coaching-notes" && <NotesPanel userId={userId} />}
                {tab === "summary" && <SummaryPanel userId={userId} />}
              </div>
            )}
          </Tabs>
        )}
      </PageShell>
    </AdminLayout>
  );
}
