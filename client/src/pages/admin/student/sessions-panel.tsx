import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Bot, MessageSquare, User } from "lucide-react";
import { apiRequest } from "@/lib/queryClient";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Section } from "@/components/admin/page";
import { EmptyState, ErrorState } from "@/components/admin/states";
import { cn } from "@/lib/utils";
import type { FoundationSession } from "./types";

/**
 * Session transcripts.
 *
 * ── THE SESSION PICKER TOLD YOU NOTHING ──────────────────────────────────
 * The old screen offered six identical buttons — Session 1/2/3, Module A/B/C —
 * with no indication of which had actually happened. Finding the transcript you
 * wanted meant clicking through until one had content in it, and four of the
 * six were usually empty. The picker now carries state, so an unstarted session
 * is visibly unstarted before you click.
 *
 * ── ROLE, NOT `turn_type` ────────────────────────────────────────────────
 * The endpoint returns `role: "user" | "assistant"`, which answers "who spoke".
 * That is all this screen needs and all it should imply. It deliberately does
 * not render provenance — how far a record is trusted is a different question
 * with a different vocabulary, and conflating the two is a mistake this project
 * has made before.
 */

type Message = {
  id: number;
  role: "user" | "assistant";
  content: string;
  createdAt?: string;
};

const FOUNDATION = [
  { key: "foundation-1", label: "Session 1", number: 1 },
  { key: "foundation-2", label: "Session 2", number: 2 },
  { key: "foundation-3", label: "Session 3", number: 3 },
] as const;

const MODULES = [
  { key: "enhancement-A", label: "Module A", code: "A" },
  { key: "enhancement-B", label: "Module B", code: "B" },
  { key: "enhancement-C", label: "Module C", code: "C" },
] as const;

type SessionKey = (typeof FOUNDATION)[number]["key"] | (typeof MODULES)[number]["key"];

function urlFor(userId: number, selected: SessionKey) {
  const foundation = FOUNDATION.find((s) => s.key === selected);
  return foundation
    ? `/api/admin/users/${userId}/foundation-sessions/${foundation.number}/messages`
    : `/api/admin/users/${userId}/enhancement-modules/${
        MODULES.find((m) => m.key === selected)!.code
      }/messages`;
}

function Transcript({ userId, selected }: { userId: number; selected: SessionKey }) {
  const url = urlFor(userId, selected);

  const q = useQuery<{ messages: Message[] }>({
    queryKey: [url],
    queryFn: async () => (await apiRequest("GET", url)).json(),
  });

  if (q.isLoading) {
    return (
      <div className="space-y-4">
        {Array.from({ length: 5 }).map((_, i) => (
          <div key={i} className={cn("flex", i % 2 ? "justify-end" : "justify-start")}>
            <Skeleton className="h-16 w-2/3 rounded-2xl" />
          </div>
        ))}
      </div>
    );
  }

  if (q.error) return <ErrorState error={q.error} onRetry={() => q.refetch()} />;

  const messages = q.data?.messages ?? [];

  if (messages.length === 0) {
    return (
      <EmptyState
        icon={MessageSquare}
        title="Not started"
        description="Nothing has been said in this session yet. Foundation sessions run in order; the modules are optional and can be taken in any order or skipped entirely."
      />
    );
  }

  return (
    <div className="space-y-4">
      {messages.map((msg) => {
        const isStudent = msg.role === "user";
        return (
          <div
            key={msg.id}
            className={cn("flex items-start gap-3", isStudent && "flex-row-reverse")}
          >
            <div
              className={cn(
                "flex h-7 w-7 shrink-0 items-center justify-center rounded-full",
                isStudent ? "bg-brand text-white" : "bg-info-soft text-info",
              )}
            >
              {isStudent ? <User className="h-3.5 w-3.5" /> : <Bot className="h-3.5 w-3.5" />}
            </div>

            <div
              className={cn(
                "max-w-[min(42rem,80%)] rounded-2xl px-4 py-2.5",
                isStudent ? "bg-brand-soft" : "border bg-background",
              )}
            >
              <p className="whitespace-pre-wrap text-sm leading-relaxed">{msg.content}</p>
              {msg.createdAt && (
                <p className="pt-1.5 text-[11px] text-muted-foreground">
                  {new Date(msg.createdAt).toLocaleString(undefined, {
                    month: "short",
                    day: "numeric",
                    hour: "numeric",
                    minute: "2-digit",
                  })}
                </p>
              )}
            </div>
          </div>
        );
      })}
      <p className="pt-2 text-center text-xs text-muted-foreground">
        {messages.length} turn{messages.length === 1 ? "" : "s"}
      </p>
    </div>
  );
}

export function SessionsPanel({
  userId,
  sessions,
}: {
  userId: number;
  /**
   * Session state, from the record already fetched by the parent.
   *
   * Deliberately a prop rather than a query: `/api/admin/users/:id` already
   * returns `foundationSessions`, and adding a second request for data sitting
   * in the cache is precisely the duplication this consolidation removed.
   */
  sessions?: FoundationSession[] | null;
}) {
  const [selected, setSelected] = useState<SessionKey>("foundation-1");

  const statusOf = (key: SessionKey): string | undefined => {
    if (!Array.isArray(sessions)) return undefined;
    const foundation = FOUNDATION.find((s) => s.key === key);
    const needle = foundation
      ? `foundation_${foundation.number}`
      : `enhancement_${MODULES.find((m) => m.key === key)!.code.toLowerCase()}`;

    const row = sessions.find(
      (r) =>
        r.sessionType?.toLowerCase() === needle ||
        // Older rows carry the number separately rather than in the type.
        (foundation != null &&
          r.sessionType?.toLowerCase() === "foundation" &&
          r.sessionNumber === foundation.number),
    );
    return row?.status ?? undefined;
  };

  const Picker = ({ items }: { items: readonly { key: SessionKey; label: string }[] }) => (
    <div className="flex flex-wrap gap-2">
      {items.map((item) => {
        const status = statusOf(item.key);
        const active = selected === item.key;
        return (
          <button
            key={item.key}
            onClick={() => setSelected(item.key)}
            className={cn(
              "flex items-center gap-2 rounded-md border px-3 py-1.5 text-sm transition-colors",
              active
                ? "border-brand/40 bg-brand-soft font-medium text-brand"
                : "hover:bg-muted/60",
            )}
          >
            {item.label}
            {status && status !== "available" && (
              <Badge
                variant={status === "completed" ? "default" : "outline"}
                className="h-4 px-1.5 text-[10px] font-normal capitalize"
              >
                {status.replace(/_/g, " ")}
              </Badge>
            )}
          </button>
        );
      })}
    </div>
  );

  return (
    <div className="space-y-8">
      <Section title="Foundation">
        <Picker items={FOUNDATION} />
      </Section>

      <Section
        title="Enhancement modules"
        description="Optional, and can be taken in any order."
      >
        <Picker items={MODULES} />
      </Section>

      <div className="rounded-lg border bg-muted/20 p-4 sm:p-6">
        <Transcript userId={userId} selected={selected} />
      </div>
    </div>
  );
}
