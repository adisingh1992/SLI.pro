import { useState } from "react";
import { useLocation } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { Loader2, Tag, CheckCircle2 } from "lucide-react";
import { apiRequest } from "@/lib/queryClient";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";

/**
 * Tagging index — pick a session to label.
 *
 * Spec §14: the strongest 10–15 sessions are hand-tagged at turn level to seed
 * the classifier and provide a validation gold standard. This is where that
 * work starts.
 */

type TaggableSession = {
  sessionId: number;
  sessionType: string;
  status: string;
  completedAt: string | null;
  firstName: string;
  lastName: string;
  email: string;
  isTestUser: boolean;
  transcriptStatus: string;
  totalTurns: number;
  humanTurns: number;
  handTagged: number;
};

export function TaggingSessionsPanel() {
  const [, navigate] = useLocation();
  const [showTestUsers, setShowTestUsers] = useState(true);

  const { data: sessions, isLoading } = useQuery<TaggableSession[]>({
    queryKey: ["/api/admin/tagging/sessions"],
    queryFn: async () => (await apiRequest("GET", "/api/admin/tagging/sessions")).json(),
  });

  const visible = (sessions ?? []).filter((s) => showTestUsers || !s.isTestUser);
  const totalTagged = (sessions ?? []).reduce((n, s) => n + s.handTagged, 0);
  const sessionsStarted = (sessions ?? []).filter((s) => s.handTagged > 0).length;

  return (
    <div className="space-y-6">

        <Alert className="mb-6">
          <Tag className="h-4 w-4" />
          <AlertTitle>Why this matters</AlertTitle>
          <AlertDescription>
            Turn type decides what enters Wing's longitudinal memory and any future
            training corpus. The classifier assigns it automatically — but without
            human-labelled turns there is no way to know whether it is accurate.
            Aim for <strong>10–15 sessions</strong>, choosing the richest conversations
            rather than the easiest ones. A hand tag is final: the classifier never
            overwrites it.
          </AlertDescription>
        </Alert>

        <div className="mb-6 grid grid-cols-3 gap-4">
          <Card>
            <CardContent className="pt-6">
              <p className="text-2xl font-semibold">{sessionsStarted}</p>
              <p className="text-xs text-muted-foreground">sessions started</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-6">
              <p className="text-2xl font-semibold">{totalTagged}</p>
              <p className="text-xs text-muted-foreground">turns tagged</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-6">
              <Button
                variant="outline"
                className="w-full"
                onClick={() => navigate("/admin/tagging/validate")}
              >
                Validate
              </Button>
              <Button
                variant="outline"
                className="mt-2 w-full"
                onClick={() => navigate("/admin/tagging/classifier")}
              >
                Publish prompt
              </Button>
              <p className="mt-2 text-xs text-muted-foreground">
                measure, then teach
              </p>
            </CardContent>
          </Card>
        </div>

        <div className="mb-4 flex items-center gap-2">
          <Button
            variant={showTestUsers ? "secondary" : "outline"}
            size="sm"
            onClick={() => setShowTestUsers((v) => !v)}
          >
            {showTestUsers ? "Showing test users" : "Hiding test users"}
          </Button>
        </div>

        {isLoading ? (
          <div className="flex justify-center py-12">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : !visible.length ? (
          <Card>
            <CardContent className="py-12 text-center text-muted-foreground">
              No sessions with transcripts yet.
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-3">
            {visible.map((s) => {
              const pct = s.humanTurns ? (s.handTagged / s.humanTurns) * 100 : 0;
              const done = s.humanTurns > 0 && s.handTagged >= s.humanTurns;
              return (
                <Card
                  key={s.sessionId}
                  className="cursor-pointer transition-colors hover:bg-accent/40"
                  onClick={() => navigate(`/admin/tagging/sessions/${s.sessionId}`)}
                >
                  <CardHeader className="pb-3">
                    <div className="flex items-start justify-between gap-4">
                      <div className="min-w-0">
                        <CardTitle className="flex items-center gap-2 text-base">
                          {done && <CheckCircle2 className="h-4 w-4 text-good" />}
                          Session {s.sessionId} · {s.sessionType.replace(/_/g, " ")}
                        </CardTitle>
                        <CardDescription>
                          {s.firstName} {s.lastName} · {s.email}
                          {s.isTestUser && " · test user"}
                        </CardDescription>
                      </div>
                      <div className="flex shrink-0 items-center gap-2">
                        {s.transcriptStatus === "migrated_provenance_unknown" && (
                          <Badge variant="outline" className="text-xs">
                            legacy import
                          </Badge>
                        )}
                        <Badge variant="outline">{s.status.replace(/_/g, " ")}</Badge>
                      </div>
                    </div>
                  </CardHeader>
                  <CardContent className="pt-0">
                    <div className="flex items-center gap-3">
                      <Progress value={pct} className="h-2 flex-1" />
                      <span className="shrink-0 text-xs text-muted-foreground">
                        {s.handTagged} / {s.humanTurns} human turns
                        {s.totalTurns !== s.humanTurns && ` (${s.totalTurns} total)`}
                      </span>
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        )}
    </div>
  );
}
