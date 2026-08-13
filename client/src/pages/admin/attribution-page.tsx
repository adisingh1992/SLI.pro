import { useMemo, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Building2, CheckCircle2, TriangleAlert } from "lucide-react";
import { apiRequest } from "@/lib/queryClient";
import AdminLayout from "./layout";
import { RequirePlatformAdmin } from "./require-platform-admin";
import { PageShell, PageHeader } from "@/components/admin/page";
import { DataTable, type Column } from "@/components/admin/data-table";
import { EmptyState, Spinner } from "@/components/admin/states";
import { StatCard } from "@/components/admin/stat-card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";

/**
 * Cohort attribution repair.
 *
 * ── THE PROBLEM THIS SCREEN EXISTS FOR ───────────────────────────────────
 * Students are attached to their institution by email domain at registration,
 * which is right for anyone who signs up with a .edu address and silently wrong
 * for everyone who does not. A Berkeley student who registers with a personal
 * Gmail address matches nothing, becomes direct/B2C, and disappears from
 * Berkeley's cohort reporting permanently — the backfill cannot recover them
 * because it re-runs the same domain match and fails identically.
 *
 * Students routinely register with personal addresses. Until this screen there
 * was no way to fix a single one of them without writing SQL.
 *
 * ── THE COLUMN THAT MATTERS IS "SAID VIA PARTNERSHIP" ────────────────────
 * Most unattached students are simply direct customers and are not a problem to
 * be solved. The ones worth acting on told us so themselves: they picked
 * "university partnership" when asked how they heard about us, and then matched
 * no domain. That is a contradiction the student reported, and it needs no extra
 * question at registration to detect — which is why the intake deliberately
 * still does not ask people to choose their institution from a list.
 *
 * So the list defaults to those students. The rest are one toggle away, because
 * occasionally a partner student picks a different answer.
 *
 * ── PLATFORM STAFF ONLY, DELIBERATELY ────────────────────────────────────
 * Not deferred scoping work. An unattached student belongs to no institution, so
 * an institution-scoped view of this screen would correctly be empty — and
 * letting a partner claim unattached students invites two partners claiming the
 * same person in good faith. See ADMIN_SCOPE.md.
 */

type Unattached = {
  userId: number;
  studentId: number;
  email: string;
  firstName: string | null;
  lastName: string | null;
  discoverySource: string | null;
  domain: string | null;
  claimsPartnership: boolean;
  createdAt: string | null;
};

type UnattachedResponse = {
  students: Unattached[];
  total: number;
  claimingPartnership: number;
  /**
   * Test accounts the server left out.
   *
   * Surfaced rather than ignored: the students screen learned this the hard way —
   * test accounts mixed into a cohort list quietly inflate every number read off
   * it. Saying how many are hidden is what makes the visible count trustworthy.
   */
  excludedTestAccounts: number;
};

type Institution = { id: number; name: string };

const DISCOVERY: Record<string, string> = {
  university_partnership: "University partnership",
  colleague_or_mentor: "Colleague or mentor",
  linkedin: "LinkedIn",
  web_search: "Web search",
  professional_network_or_conference: "Network or conference",
  other: "Other",
};

function fmt(value: string | null) {
  if (!value) return "—";
  const d = new Date(value);
  return Number.isNaN(d.getTime())
    ? "—"
    : d.toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" });
}

function AttributionScreen() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [onlyClaims, setOnlyClaims] = useState(true);
  /** Institution chosen per row, before it is committed. */
  const [choice, setChoice] = useState<Record<number, string>>({});

  const unattached = useQuery<UnattachedResponse>({
    queryKey: ["/api/admin/students/unattached"],
    queryFn: async () => (await apiRequest("GET", "/api/admin/students/unattached")).json(),
  });

  const institutions = useQuery<Institution[]>({
    queryKey: ["/api/admin/institutions"],
    queryFn: async () => (await apiRequest("GET", "/api/admin/institutions")).json(),
  });

  const assign = useMutation({
    mutationFn: async ({ userId, institutionId }: { userId: number; institutionId: number }) =>
      (
        await apiRequest("PUT", `/api/admin/students/${userId}/institution`, {
          institutionId,
        })
      ).json(),
    onSuccess: (_data, variables) => {
      const name =
        institutions.data?.find((i) => i.id === variables.institutionId)?.name ??
        "their institution";
      toast({
        title: "Student attached",
        description: `Now counted in ${name}'s cohort. The change is recorded in the audit log.`,
      });
      setChoice((c) => {
        const next = { ...c };
        delete next[variables.userId];
        return next;
      });
      // Attribution changes what every cohort number reports, so the metrics and
      // the student list are both stale the moment this succeeds.
      queryClient.invalidateQueries({ queryKey: ["/api/admin/students/unattached"] });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/metrics"] });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/users"] });
    },
    onError: (error: Error) => {
      toast({
        title: "Couldn't attach this student",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const rows = useMemo(() => {
    const all = unattached.data?.students ?? [];
    const filtered = onlyClaims ? all.filter((s) => s.claimsPartnership) : all;
    // Claims first regardless of the filter — those are the ones to act on.
    return [...filtered].sort((a, b) => Number(b.claimsPartnership) - Number(a.claimsPartnership));
  }, [unattached.data, onlyClaims]);

  const name = (s: Unattached) =>
    `${s.firstName ?? ""} ${s.lastName ?? ""}`.trim() || s.email || `#${s.userId}`;

  const columns: Column<Unattached>[] = [
    {
      id: "student",
      header: "Student",
      sortBy: (s) => `${s.lastName ?? ""} ${s.firstName ?? ""}`.trim().toLowerCase(),
      cell: (s) => (
        <div className="min-w-0">
          <p className="truncate font-medium">{name(s)}</p>
          <p className="truncate text-xs text-muted-foreground">{s.email}</p>
        </div>
      ),
    },
    {
      id: "domain",
      header: "Email domain",
      sortBy: (s) => s.domain ?? "",
      cell: (s) => (
        <code className="rounded bg-muted px-1.5 py-0.5 text-xs">{s.domain ?? "—"}</code>
      ),
    },
    {
      id: "said",
      header: "How they found us",
      sortBy: (s) => (s.claimsPartnership ? 0 : 1),
      cell: (s) =>
        s.claimsPartnership ? (
          <Badge
            variant="outline"
            className="whitespace-nowrap border-warn/25 bg-warn-soft font-normal text-warn"
          >
            <TriangleAlert className="mr-1 h-3 w-3" />
            Said university partnership
          </Badge>
        ) : (
          <span className="text-sm text-muted-foreground">
            {DISCOVERY[s.discoverySource ?? ""] ?? "—"}
          </span>
        ),
    },
    {
      id: "registered",
      header: "Registered",
      sortBy: (s) => (s.createdAt ? new Date(s.createdAt).getTime() : null),
      cell: (s) => <span className="whitespace-nowrap text-sm">{fmt(s.createdAt)}</span>,
    },
    {
      id: "attach",
      header: "Attach to",
      className: "w-[19rem]",
      cell: (s) => {
        const picked = choice[s.userId];
        const saving = assign.isPending && assign.variables?.userId === s.userId;

        return (
          <div className="flex items-center gap-2">
            <Select
              value={picked ?? ""}
              onValueChange={(v) => setChoice((c) => ({ ...c, [s.userId]: v }))}
              disabled={saving}
            >
              <SelectTrigger className="w-[11rem]">
                <SelectValue placeholder="Choose institution" />
              </SelectTrigger>
              <SelectContent>
                {(institutions.data ?? []).map((i) => (
                  <SelectItem key={i.id} value={String(i.id)}>
                    {i.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button
              size="sm"
              disabled={!picked || saving}
              onClick={() =>
                assign.mutate({ userId: s.userId, institutionId: Number(picked) })
              }
            >
              {saving ? <Spinner /> : "Attach"}
            </Button>
          </div>
        );
      },
    },
  ];

  const data = unattached.data;

  return (
    <AdminLayout>
      <PageShell width="wide">
        <PageHeader
          title="Attribution"
          description={
            <>
              Students who belong to no institution — and the ones who told us they should.
              {data && data.excludedTestAccounts > 0 && (
                <>
                  {" "}
                  <span className="text-muted-foreground">
                    {data.excludedTestAccounts} test account
                    {data.excludedTestAccounts === 1 ? "" : "s"} excluded.
                  </span>
                </>
              )}
            </>
          }
        />

        <div className="grid gap-4 sm:grid-cols-2">
          <StatCard
            label="Said university partnership"
            value={data ? data.claimingPartnership : "—"}
            hint="Matched no partner email domain. These are the ones to fix."
            icon={TriangleAlert}
            tone={data && data.claimingPartnership > 0 ? "warn" : "good"}
            isLoading={unattached.isLoading}
          />
          <StatCard
            label="Unattached in total"
            value={data ? data.total : "—"}
            hint="Students only — staff and test accounts excluded. Includes direct customers, who are not a problem to solve."
            icon={Building2}
            isLoading={unattached.isLoading}
          />
        </div>

        <DataTable
          rows={rows}
          columns={columns}
          rowKey={(s) => s.userId}
          isLoading={unattached.isLoading}
          error={unattached.error}
          onRetry={() => unattached.refetch()}
          searchable={(s) => `${name(s)} ${s.email} ${s.domain ?? ""}`}
          searchPlaceholder="Search by name, email or domain…"
          empty={
            <EmptyState
              icon={onlyClaims ? CheckCircle2 : Building2}
              title={
                onlyClaims
                  ? "Nobody is claiming a partnership they can't be matched to"
                  : "Every student is attached to an institution"
              }
              description={
                onlyClaims
                  ? "Everyone who said they came via a university partnership matched a partner email domain. Switch to all unattached students if you're looking for someone specific."
                  : "Nothing to repair. Students are attached automatically when their email domain matches a partner institution."
              }
              action={
                onlyClaims && (
                  <Button variant="outline" onClick={() => setOnlyClaims(false)}>
                    Show all unattached
                  </Button>
                )
              }
            />
          }
          toolbar={
            <Button
              variant={onlyClaims ? "secondary" : "ghost"}
              size="sm"
              onClick={() => setOnlyClaims((v) => !v)}
            >
              {onlyClaims ? "Show all unattached" : "Only partnership claims"}
            </Button>
          }
        />

        <p className="text-sm text-muted-foreground">
          Attaching a student adds them to that institution's current active cycle and makes them
          count in its reporting. Every change is written to the audit log with your name on it.
        </p>
      </PageShell>
    </AdminLayout>
  );
}

export default function AttributionPage() {
  return (
    <RequirePlatformAdmin>
      <AttributionScreen />
    </RequirePlatformAdmin>
  );
}
