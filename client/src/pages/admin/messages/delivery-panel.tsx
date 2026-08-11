import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "wouter";
import { AlertTriangle, CheckCircle2, HelpCircle, Send } from "lucide-react";
import { apiRequest } from "@/lib/queryClient";
import { DataTable, type Column } from "@/components/admin/data-table";
import { EmptyState } from "@/components/admin/states";
import { StatCard, StatGrid } from "@/components/admin/stat-card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";

/**
 * What Wing actually sent, and what failed.
 *
 * ── THE THREE STATES ARE NOT TWO ─────────────────────────────────────────
 * It is tempting to render this as sent/failed. There is a third state that
 * matters more than either:
 *
 *   Failed        the provider refused. `failed_at` is set, and we know why.
 *   Delivered     the provider accepted and returned an id we recorded.
 *   Unverified    no failure recorded, and no provider id either.
 *
 * The third is exactly the shape produced by the bug this whole subsystem was
 * repaired around — `sendSnapshot` discarded the send result and reported
 * success unconditionally, so the log said "sent" for mail that never left.
 * Collapsing unverified into "delivered" would hide a recurrence of precisely
 * the failure we already had once. It gets its own state and its own colour.
 */

type Event = {
  id: number;
  templateKey: string | null;
  templateVersion: number | null;
  sequenceKey: string | null;
  sequenceStep: number | null;
  channel: string | null;
  sentAt: string | null;
  failedAt: string | null;
  failureReason: string | null;
  providerMessageId: string | null;
  studentId: number | null;
  firstName: string | null;
  lastName: string | null;
  email: string | null;
};

type State = "failed" | "delivered" | "unverified";

const stateOf = (e: Event): State =>
  e.failedAt ? "failed" : e.providerMessageId ? "delivered" : "unverified";

const when = (v: string | null) =>
  v
    ? new Date(v).toLocaleString(undefined, {
        month: "short",
        day: "numeric",
        hour: "numeric",
        minute: "2-digit",
      })
    : "—";

export function DeliveryPanel() {
  const [failuresOnly, setFailuresOnly] = useState(false);

  const events = useQuery<Event[]>({
    queryKey: ["/api/admin/message-events", failuresOnly],
    queryFn: async () =>
      (
        await apiRequest(
          "GET",
          `/api/admin/message-events${failuresOnly ? "?failures=true" : ""}`,
        )
      ).json(),
  });

  const rows = events.data ?? [];
  const failed = rows.filter((e) => stateOf(e) === "failed").length;
  const unverified = rows.filter((e) => stateOf(e) === "unverified").length;
  const delivered = rows.length - failed - unverified;

  const nameOf = (e: Event) =>
    `${e.firstName ?? ""} ${e.lastName ?? ""}`.trim() || e.email || "—";

  const columns: Column<Event>[] = [
    {
      id: "state",
      header: "",
      headerClassName: "w-8",
      cell: (e) => {
        const state = stateOf(e);
        const icon =
          state === "failed" ? (
            <AlertTriangle className="h-4 w-4 text-bad" />
          ) : state === "delivered" ? (
            <CheckCircle2 className="h-4 w-4 text-good" />
          ) : (
            <HelpCircle className="h-4 w-4 text-warn" />
          );

        return (
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <span className="inline-flex">{icon}</span>
              </TooltipTrigger>
              <TooltipContent className="max-w-xs">
                {state === "failed"
                  ? `The provider refused this. ${e.failureReason ?? ""}`
                  : state === "delivered"
                    ? "Accepted by the provider, with a message id recorded."
                    : "Recorded as sent, but no provider id came back — we can't confirm it left. Worth investigating if you see many of these."}
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
        );
      },
    },
    {
      id: "message",
      header: "Message",
      sortBy: (e) => e.templateKey ?? "",
      cell: (e) => (
        <div className="min-w-0">
          <p className="truncate font-medium">{e.templateKey ?? "—"}</p>
          <p className="truncate text-xs text-muted-foreground">
            {e.sequenceKey ?? "one-off"}
            {e.sequenceStep != null && ` · step ${e.sequenceStep}`}
            {e.templateVersion != null && ` · v${e.templateVersion}`}
          </p>
        </div>
      ),
    },
    {
      id: "student",
      header: "To",
      sortBy: (e) => `${e.lastName ?? ""} ${e.firstName ?? ""}`,
      cell: (e) =>
        e.studentId ? (
          <Link
            href={`/admin/users/${e.studentId}`}
            className="text-sm hover:underline"
            onClick={(ev) => ev.stopPropagation()}
          >
            {nameOf(e)}
          </Link>
        ) : (
          <span className="text-sm text-muted-foreground">{nameOf(e)}</span>
        ),
    },
    {
      id: "reason",
      header: "Detail",
      cell: (e) =>
        e.failureReason ? (
          <span className="text-sm text-bad">{e.failureReason}</span>
        ) : (
          <span className="text-xs text-muted-foreground">
            {e.providerMessageId ? "accepted" : "no provider id"}
          </span>
        ),
    },
    {
      id: "when",
      header: "When",
      sortBy: (e) => new Date(e.failedAt ?? e.sentAt ?? 0).getTime(),
      cell: (e) => (
        <span className="whitespace-nowrap text-sm text-muted-foreground">
          {when(e.failedAt ?? e.sentAt)}
        </span>
      ),
    },
  ];

  return (
    <div className="space-y-6">
      <StatGrid className="lg:grid-cols-3">
        <StatCard
          label="Delivered"
          value={delivered}
          hint="Accepted with a provider id"
          icon={CheckCircle2}
          tone="good"
          isLoading={events.isLoading}
        />
        <StatCard
          label="Failed"
          value={failed}
          hint="The provider refused"
          icon={AlertTriangle}
          tone="bad"
          isLoading={events.isLoading}
        />
        <StatCard
          label="Unverified"
          value={unverified}
          hint="No failure, but no proof it left"
          icon={HelpCircle}
          tone="warn"
          isLoading={events.isLoading}
        />
      </StatGrid>

      {unverified > 0 && !events.isLoading && (
        <Alert className="border-warn/30 bg-warn-soft [&>svg]:text-warn">
          <HelpCircle className="h-4 w-4" />
          <AlertTitle>
            {unverified} message{unverified === 1 ? "" : "s"} can't be confirmed
          </AlertTitle>
          <AlertDescription>
            These recorded no failure but also no provider id, so there's no evidence they
            reached the mail provider. A handful is normal for older rows written before we
            recorded ids. A steady stream of new ones means something is swallowing errors.
          </AlertDescription>
        </Alert>
      )}

      <DataTable
        rows={rows}
        columns={columns}
        rowKey={(e) => e.id}
        isLoading={events.isLoading}
        error={events.error}
        onRetry={() => events.refetch()}
        searchable={(e) =>
          `${e.templateKey ?? ""} ${e.sequenceKey ?? ""} ${nameOf(e)} ${e.failureReason ?? ""}`
        }
        searchPlaceholder="Search by message, student or error…"
        toolbar={
          <Button
            variant={failuresOnly ? "secondary" : "outline"}
            size="sm"
            onClick={() => setFailuresOnly((v) => !v)}
          >
            {failuresOnly ? "Showing failures only" : "Failures only"}
          </Button>
        }
        empty={
          <EmptyState
            icon={Send}
            title={failuresOnly ? "No failures" : "Nothing sent yet"}
            description={
              failuresOnly
                ? "Nothing has been refused by the mail provider. That's the answer you want."
                : "Messages appear here once the sequence runner has executed. On stage that means running wing:run-sequences — nothing sends on its own until the scheduled job is deployed."
            }
          />
        }
      />

      <p className="text-xs text-muted-foreground">
        The 200 most recent. Older history is in the database.
      </p>
    </div>
  );
}
