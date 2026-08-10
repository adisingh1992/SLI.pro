import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/hooks/use-auth";
import { useLocation } from "wouter";
import { Download, Loader2, Users } from "lucide-react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { apiRequest, apiUrl } from "@/lib/queryClient";
import AdminLayout from "./layout";

/**
 * Institutional admin dashboard (Feature List B4).
 *
 * ── WHO THIS IS FOR ──────────────────────────────────────────────────────
 * The spec says these numbers exist for "budget defense and board reporting".
 * That is the whole design brief: a career centre director will put them in
 * front of someone who controls their funding, and will be asked where each one
 * came from. So every rate shows its counts — "38 of 61", not "62%" — because a
 * percentage nobody can audit is worth less than the raw pair.
 *
 * ── WHAT WAS HERE BEFORE ─────────────────────────────────────────────────
 * A user count, a link to Calendly, and a "System Status" panel with three
 * hardcoded green lights. Those lights checked nothing — they would have read
 * "Database: Connected" with the database on fire. A status display that cannot
 * fail is not a status display, and on a screen meant for budget defense it is
 * worse than nothing. Removed rather than implemented: real health checks
 * belong in Azure's monitoring, not in a page an administrator reads once a
 * term.
 */

type Rate = { numerator: number; denominator: number; rate: number | null };

type Metrics = {
  totalRegistered: number;
  activeLast30Days: number;
  neverStarted: number;
  completionBySession: { sessionType: string; started: number; completed: number; rate: Rate }[];
  completedAllThree: Rate;
  withSelectedSli: Rate;
  medianDaysToComplete: number | null;
  engagementDistribution: { sessionsCompleted: number; students: number }[];
  appointments: { total: number; withSnapshotSent: number };
  generatedAt: string;
};

type Institution = {
  id: number;
  name: string;
  cycles: { id: number; label: string; year: number }[];
};

const SESSION_LABEL: Record<string, string> = {
  foundation_1: "Session 1 — Functional identity",
  foundation_2: "Session 2 — Credibility",
  foundation_3: "Session 3 — Signature story",
};

const pct = (r: Rate) =>
  r.rate === null ? "—" : `${Math.round(r.rate * 100)}%`;

/** "38 of 61" — the denominator is the point. */
const of = (r: Rate) => `${r.numerator} of ${r.denominator}`;

function Stat({
  label,
  value,
  detail,
}: {
  label: string;
  value: string;
  detail?: string;
}) {
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-medium text-muted-foreground">{label}</CardTitle>
      </CardHeader>
      <CardContent>
        <p className="text-3xl font-semibold">{value}</p>
        {detail && <p className="pt-1 text-xs text-muted-foreground">{detail}</p>}
      </CardContent>
    </Card>
  );
}

export default function AdminDashboardPage() {
  const { user, isLoading: authLoading } = useAuth();
  const [, navigate] = useLocation();

  const [institutionId, setInstitutionId] = useState("all");
  const [cycleId, setCycleId] = useState("all");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");

  useEffect(() => {
    if (!authLoading && (!user || !user.isAdmin)) navigate("/admin/login");
  }, [user, authLoading, navigate]);

  const query = useMemo(() => {
    const p = new URLSearchParams();
    if (institutionId !== "all") p.set("institutionId", institutionId);
    if (cycleId !== "all") p.set("cycleId", cycleId);
    if (from) p.set("from", from);
    if (to) p.set("to", to);
    return p.toString();
  }, [institutionId, cycleId, from, to]);

  const options = useQuery<Institution[]>({
    queryKey: ["/api/admin/metrics/options"],
    queryFn: async () => (await apiRequest("GET", "/api/admin/metrics/options")).json(),
    enabled: !!user?.isAdmin,
  });

  const metrics = useQuery<Metrics>({
    queryKey: ["/api/admin/metrics", query],
    queryFn: async () =>
      (await apiRequest("GET", `/api/admin/metrics${query ? `?${query}` : ""}`)).json(),
    enabled: !!user?.isAdmin,
  });

  const cycles = useMemo(
    () => options.data?.find((i) => String(i.id) === institutionId)?.cycles ?? [],
    [options.data, institutionId],
  );

  if (authLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }
  if (!user?.isAdmin) return null;

  const m = metrics.data;

  return (
    <AdminLayout>
      <div className="space-y-6 p-6">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">Cohort dashboard</h1>
            <p className="text-sm text-muted-foreground">
              Engagement and completion across the platform.
            </p>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => navigate("/admin/users")}>
              <Users className="mr-2 h-4 w-4" />
              Students
            </Button>
            <Button
              variant="outline"
              asChild
            >
              {/* A real link, not a fetch-and-blob: the browser handles the
                  Content-Disposition header and the file lands in Downloads
                  with the server's filename. */}
              <a href={apiUrl(`/api/admin/metrics/export${query ? `?${query}` : ""}`)}>
                <Download className="mr-2 h-4 w-4" />
                Export CSV
              </a>
            </Button>
          </div>
        </div>

        {/* ── Filters ──────────────────────────────────────────────────── */}
        <Card>
          <CardContent className="grid gap-4 p-4 sm:grid-cols-2 lg:grid-cols-4">
            <div className="space-y-2">
              <Label>Institution</Label>
              <Select
                value={institutionId}
                onValueChange={(v) => {
                  setInstitutionId(v);
                  // Cycles belong to an institution; keeping the old one
                  // selected would filter to a cohort of a different school and
                  // silently return zero.
                  setCycleId("all");
                }}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All institutions</SelectItem>
                  {(options.data ?? []).map((i) => (
                    <SelectItem key={i.id} value={String(i.id)}>
                      {i.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label>Cohort</Label>
              <Select
                value={cycleId}
                onValueChange={setCycleId}
                disabled={institutionId === "all" || !cycles.length}
              >
                <SelectTrigger>
                  <SelectValue
                    placeholder={institutionId === "all" ? "Pick an institution first" : "All"}
                  />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All cohorts</SelectItem>
                  {cycles.map((c) => (
                    <SelectItem key={c.id} value={String(c.id)}>
                      {c.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="from">Registered from</Label>
              <Input id="from" type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
            </div>

            <div className="space-y-2">
              <Label htmlFor="to">Registered to</Label>
              <Input id="to" type="date" value={to} onChange={(e) => setTo(e.target.value)} />
            </div>
          </CardContent>
        </Card>

        {metrics.isLoading && (
          <div className="flex justify-center p-8">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        )}

        {m && (
          <>
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              <Stat label="Registered" value={String(m.totalRegistered)} />
              <Stat
                label="Active"
                value={String(m.activeLast30Days)}
                detail="Signed in within 30 days"
              />
              <Stat
                label="Completed all three"
                value={pct(m.completedAllThree)}
                detail={of(m.completedAllThree)}
              />
              <Stat
                label="Median time to complete"
                value={
                  m.medianDaysToComplete === null ? "—" : `${m.medianDaysToComplete} days`
                }
                detail={
                  m.medianDaysToComplete === null
                    ? "Nobody has finished all three yet"
                    : "First session start to third completion"
                }
              />
            </div>

            <div className="grid gap-6 lg:grid-cols-2">
              {/* ── Completion by session ──────────────────────────────── */}
              <Card>
                <CardHeader>
                  <CardTitle className="text-base">Completion by session</CardTitle>
                  <CardDescription>
                    Of the students who started each session — not of everyone registered.
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  {m.completionBySession.map((s) => (
                    <div key={s.sessionType} className="space-y-1">
                      <div className="flex items-baseline justify-between text-sm">
                        <span>{SESSION_LABEL[s.sessionType] ?? s.sessionType}</span>
                        <span className="text-muted-foreground">
                          {of(s.rate)} · {pct(s.rate)}
                        </span>
                      </div>
                      <div className="h-2 overflow-hidden rounded-full bg-muted">
                        <div
                          className="h-full rounded-full bg-primary transition-all"
                          style={{ width: `${(s.rate.rate ?? 0) * 100}%` }}
                        />
                      </div>
                    </div>
                  ))}
                </CardContent>
              </Card>

              {/* ── Engagement distribution ────────────────────────────── */}
              <Card>
                <CardHeader>
                  <CardTitle className="text-base">How far students get</CardTitle>
                  <CardDescription>
                    Foundation sessions completed, across everyone registered.
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  {m.engagementDistribution.map((d) => {
                    const share = m.totalRegistered
                      ? d.students / m.totalRegistered
                      : 0;
                    return (
                      <div key={d.sessionsCompleted} className="space-y-1">
                        <div className="flex items-baseline justify-between text-sm">
                          <span>
                            {d.sessionsCompleted === 0
                              ? "None completed"
                              : `${d.sessionsCompleted} session${d.sessionsCompleted > 1 ? "s" : ""}`}
                          </span>
                          <span className="text-muted-foreground">
                            {d.students} · {Math.round(share * 100)}%
                          </span>
                        </div>
                        <div className="h-2 overflow-hidden rounded-full bg-muted">
                          <div
                            className="h-full rounded-full bg-primary/70"
                            style={{ width: `${share * 100}%` }}
                          />
                        </div>
                      </div>
                    );
                  })}
                  <p className="pt-1 text-xs text-muted-foreground">
                    {m.neverStarted} registered but never opened a session.
                  </p>
                </CardContent>
              </Card>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <Stat
                label="Have a selected SLI"
                value={pct(m.withSelectedSli)}
                detail={of(m.withSelectedSli)}
              />
              <Stat
                label="Advising appointments"
                value={String(m.appointments.total)}
                detail={`${m.appointments.withSnapshotSent} advisor snapshot${
                  m.appointments.withSnapshotSent === 1 ? "" : "s"
                } sent`}
              />
            </div>

            <p className="text-xs text-muted-foreground">
              Generated {new Date(m.generatedAt).toLocaleString()}. Rates show "—" where there
              is nobody to measure, rather than 0%.
            </p>
          </>
        )}
      </div>
    </AdminLayout>
  );
}
