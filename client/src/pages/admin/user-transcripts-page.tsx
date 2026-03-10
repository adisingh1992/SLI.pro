import { useState } from "react";
import { useParams, useLocation } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import AdminLayout from "./layout";
import { ArrowLeft, Bot, User } from "lucide-react";
import { cn } from "@/lib/utils";

type SessionKey =
  | "foundation-1"
  | "foundation-2"
  | "foundation-3"
  | "enhancement-A"
  | "enhancement-B"
  | "enhancement-C";

interface Message {
  id: number;
  role: "user" | "assistant";
  content: string;
  createdAt?: string;
}

const FOUNDATION_SESSIONS: { key: SessionKey; label: string; number: number }[] = [
  { key: "foundation-1", label: "Session 1", number: 1 },
  { key: "foundation-2", label: "Session 2", number: 2 },
  { key: "foundation-3", label: "Session 3", number: 3 },
];

const ENHANCEMENT_MODULES: { key: SessionKey; label: string; code: string }[] = [
  { key: "enhancement-A", label: "Module A", code: "A" },
  { key: "enhancement-B", label: "Module B", code: "B" },
  { key: "enhancement-C", label: "Module C", code: "C" },
];

function TranscriptView({ userId, selected }: { userId: string; selected: SessionKey }) {
  const isFoundation = selected.startsWith("foundation-");

  const foundationNumber = isFoundation
    ? FOUNDATION_SESSIONS.find((s) => s.key === selected)!.number
    : null;
  const enhancementCode = !isFoundation
    ? ENHANCEMENT_MODULES.find((m) => m.key === selected)!.code
    : null;

  const { data, isLoading } = useQuery<{ messages: Message[] }>({
    queryKey: isFoundation
      ? [`/api/admin/users/${userId}/foundation-sessions/${foundationNumber}/messages`]
      : [`/api/admin/users/${userId}/enhancement-modules/${enhancementCode}/messages`],
    queryFn: async () => {
      const url = isFoundation
        ? `/api/admin/users/${userId}/foundation-sessions/${foundationNumber}/messages`
        : `/api/admin/users/${userId}/enhancement-modules/${enhancementCode}/messages`;
      const res = await fetch(url, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch transcript");
      return res.json();
    },
  });

  if (isLoading) {
    return (
      <div className="space-y-4 mt-6">
        {[...Array(5)].map((_, i) => (
          <div key={i} className={cn("flex gap-3", i % 2 === 0 ? "justify-start" : "justify-end")}>
            <Skeleton className="h-16 w-2/3 rounded-2xl" />
          </div>
        ))}
      </div>
    );
  }

  const messages = data?.messages ?? [];

  if (messages.length === 0) {
    return (
      <div className="mt-10 flex flex-col items-center justify-center text-center text-muted-foreground py-16">
        <Bot className="h-10 w-10 mb-3 opacity-40" />
        <p className="text-base font-medium">No transcript available for this session</p>
        <p className="text-sm mt-1">The user has not started this session yet.</p>
      </div>
    );
  }

  return (
    <div className="mt-6 space-y-4">
      {messages.map((msg) => {
        const isUser = msg.role === "user";
        return (
          <div
            key={msg.id}
            className={cn("flex gap-3 items-start", isUser ? "flex-row-reverse" : "flex-row")}
          >
            <div
              className={cn(
                "flex-shrink-0 h-8 w-8 rounded-full flex items-center justify-center text-white text-xs font-semibold",
                isUser ? "bg-primary" : "bg-slate-500"
              )}
            >
              {isUser ? <User className="h-4 w-4" /> : <Bot className="h-4 w-4" />}
            </div>
            <div
              className={cn(
                "max-w-[72%] rounded-2xl px-4 py-3 text-sm leading-relaxed whitespace-pre-wrap",
                isUser
                  ? "bg-primary text-primary-foreground rounded-tr-sm"
                  : "bg-muted text-foreground rounded-tl-sm"
              )}
            >
              {msg.content}
            </div>
          </div>
        );
      })}
    </div>
  );
}

export default function UserTranscriptsPage() {
  const { userId } = useParams();
  const [_, navigate] = useLocation();
  const [selected, setSelected] = useState<SessionKey>("foundation-1");

  const selectedFoundation = FOUNDATION_SESSIONS.find((s) => s.key === selected);
  const selectedEnhancement = ENHANCEMENT_MODULES.find((m) => m.key === selected);
  const pageTitle = selectedFoundation
    ? `Foundation ${selectedFoundation.label}`
    : selectedEnhancement
    ? `Enhancement ${selectedEnhancement.label}`
    : "";

  return (
    <AdminLayout>
      <div className="p-6 max-w-4xl mx-auto space-y-6">
        <div>
          <Button
            variant="ghost"
            size="sm"
            className="mb-3"
            onClick={() => navigate(`/admin/users/${userId}`)}
          >
            <ArrowLeft className="h-4 w-4 mr-2" />
            Back to User Profile
          </Button>
          <h1 className="text-2xl font-bold">Session Transcripts</h1>
          <p className="text-muted-foreground text-sm mt-1">
            Full turn-by-turn conversation history for each session.
          </p>
        </div>

        <Card>
          <CardContent className="pt-5 pb-4">
            <div className="space-y-4">
              <div>
                <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2">
                  Foundation Sessions
                </p>
                <div className="flex gap-2 flex-wrap">
                  {FOUNDATION_SESSIONS.map((s) => (
                    <Button
                      key={s.key}
                      variant={selected === s.key ? "default" : "outline"}
                      size="sm"
                      onClick={() => setSelected(s.key)}
                    >
                      {s.label}
                    </Button>
                  ))}
                </div>
              </div>

              <div>
                <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2">
                  Enhancement Modules
                </p>
                <div className="flex gap-2 flex-wrap">
                  {ENHANCEMENT_MODULES.map((m) => (
                    <Button
                      key={m.key}
                      variant={selected === m.key ? "default" : "outline"}
                      size="sm"
                      onClick={() => setSelected(m.key)}
                    >
                      {m.label}
                    </Button>
                  ))}
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        <div>
          <h2 className="text-lg font-semibold mb-1">{pageTitle}</h2>
          <TranscriptView userId={userId!} selected={selected} />
        </div>
      </div>
    </AdminLayout>
  );
}
