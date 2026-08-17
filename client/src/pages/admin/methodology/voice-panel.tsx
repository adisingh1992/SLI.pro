import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import {
  Loader2, Info, Upload, Link2, Link2Off, AlertTriangle, HelpCircle, Check,
} from "lucide-react";
import { apiRequest, apiFetch, queryClient } from "@/lib/queryClient";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";

/**
 * Wing's voice — reviewing the transcription, and switching it on.
 *
 * ── WHO THIS SCREEN IS FOR ───────────────────────────────────────────────
 * Danielle wrote the Voice Guide and the personality directive. `wing:seed-voice`
 * turned them into 54 typed records, and until this screen existed the only way
 * to check that transcription was to read a TypeScript file, and the only way to
 * switch it on was for an engineer to call two store functions. The author of the
 * voice should be able to read what the platform believes her voice is, see what
 * the documents left unsaid, and say yes.
 *
 * ── SHORT IS WHAT SHIPS ──────────────────────────────────────────────────
 * Each component shows both lines because the review question is whether the
 * short one is a fair reduction of the document's own wording. Only `short`
 * reaches a prompt: the section costs ~760-820 tokens of every turn as it is, and
 * rendering the full text would roughly triple the standing instruction.
 */

type Cycle = {
  cycleId: number;
  label: string;
  institutionName: string;
  voiceProfileId: number | null;
};

type Profile = {
  id: number;
  name: string;
  versionNumber: number;
  status: "draft" | "published" | "retired";
  notes: string | null;
  createdAt: string;
  publishedAt: string | null;
  supersededAt: string | null;
  componentCount: number;
  cycles: { cycleId: number; label: string; institutionName: string }[];
};

type Overview = {
  profiles: Profile[];
  cycles: Cycle[];
  unstated: { what: string; why: string }[];
  notRendered: { what: string; why: string }[];
};

type Component = {
  id: number;
  componentType: string;
  context: string | null;
  isCurrent: boolean;
  key: string;
  short: string;
  full: string;
};

const TYPE_LABELS: Record<string, string> = {
  trait_hierarchy: "Which traits lead, by context",
  tone_rule: "How Wing sounds",
  language_principle: "How Wing uses language",
  anti_pattern: "What Wing never does",
  calibration_example: "Calibration examples",
  delivery_doorway: "Delivery doorways",
};

const TYPE_ORDER = [
  "trait_hierarchy",
  "language_principle",
  "tone_rule",
  "anti_pattern",
  "delivery_doorway",
  "calibration_example",
];

function when(value: string | null): string {
  return value ? new Date(value).toLocaleString() : "—";
}

function StatusBadge({ profile }: { profile: Profile }) {
  if (profile.supersededAt) {
    return <Badge className="bg-muted text-muted-foreground hover:bg-muted">Superseded</Badge>;
  }
  if (profile.status === "published") {
    return <Badge className="bg-good-soft text-good hover:bg-good-soft">Published</Badge>;
  }
  if (profile.status === "retired") {
    return <Badge className="bg-muted text-muted-foreground hover:bg-muted">Retired</Badge>;
  }
  return <Badge className="bg-brand-soft text-brand hover:bg-brand-soft">Draft</Badge>;
}

export function VoicePanel() {
  const { toast } = useToast();
  const [openProfile, setOpenProfile] = useState<number | null>(null);
  const [pointing, setPointing] = useState<{ profile: Profile; cycle: Cycle } | null>(null);
  const [windowShut, setWindowShut] = useState<string | null>(null);
  const [reason, setReason] = useState("");

  const { data, isLoading } = useQuery<Overview>({
    queryKey: ["/api/admin/voice-profiles"],
    queryFn: async () => (await apiRequest("GET", "/api/admin/voice-profiles")).json(),
  });

  const { data: detail } = useQuery<{ components: Component[] }>({
    queryKey: [`/api/admin/voice-profiles/${openProfile}`],
    queryFn: async () =>
      (await apiRequest("GET", `/api/admin/voice-profiles/${openProfile}`)).json(),
    enabled: !!openProfile,
  });

  const refresh = () => {
    queryClient.invalidateQueries({ queryKey: ["/api/admin/voice-profiles"] });
    queryClient.invalidateQueries({ queryKey: ["/api/admin/cycles"] });
  };

  const publish = useMutation({
    mutationFn: async (id: number) =>
      apiFetch("POST", `/api/admin/voice-profiles/${id}/publish`, {}),
    onSuccess: (res) => {
      if (!res.ok) {
        toast({
          title: res.data?.error ?? "Could not publish",
          description: [res.data?.detail, res.data?.remedy].filter(Boolean).join(" "),
          variant: "destructive",
        });
        return;
      }
      refresh();
      toast({
        title: "Voice profile published",
        description:
          "No cohort has it yet — point a cycle at it below to put it in front of students.",
      });
    },
    onError: (error: Error) =>
      toast({ title: "Could not reach the server", description: error.message, variant: "destructive" }),
  });

  const point = useMutation({
    mutationFn: async ({
      cycleId,
      profileId,
      force,
    }: {
      cycleId: number;
      profileId: number | null;
      force?: boolean;
    }) =>
      apiFetch("PUT", `/api/admin/cycles/${cycleId}/voice-profile`, {
        profileId,
        ...(force ? { force: true, reason } : {}),
      }),
    onSuccess: (res) => {
      if (res.status === 409 && /evaluation window/i.test(res.data?.error ?? "")) {
        setWindowShut(res.data?.detail ?? "outside the evaluation window");
        return;
      }
      if (!res.ok) {
        toast({
          title: res.data?.error ?? "Could not change the pointer",
          description: [res.data?.detail, res.data?.remedy].filter(Boolean).join(" "),
          variant: "destructive",
        });
        return;
      }
      refresh();
      setPointing(null);
      setWindowShut(null);
      setReason("");
      toast({
        title: res.data?.voiceProfileId ? "This cohort now has the voice profile" : "Pointer cleared",
        description: res.data?.voiceProfileId
          ? "It applies from each student's next turn."
          : "The cohort returns to the voice the prompt files carry.",
      });
    },
    onError: (error: Error) =>
      toast({ title: "Could not reach the server", description: error.message, variant: "destructive" }),
  });

  if (isLoading || !data) {
    return (
      <div className="flex justify-center py-16">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!data.profiles.length) {
    return (
      <Alert>
        <Info className="h-4 w-4" />
        <AlertTitle>No voice profile has been seeded</AlertTitle>
        <AlertDescription>
          Run <code>npm run wing:seed-voice</code> to transcribe the Voice Guide and the
          personality directive into records this screen can review.
        </AlertDescription>
      </Alert>
    );
  }

  const grouped = (detail?.components ?? []).reduce<Record<string, Component[]>>((acc, c) => {
    (acc[c.componentType] ??= []).push(c);
    return acc;
  }, {});

  return (
    <div className="space-y-6">
      <Alert>
        <Info className="h-4 w-4" />
        <AlertTitle>Two switches, on purpose</AlertTitle>
        <AlertDescription>
          A profile has to be published, and a cycle has to point at it. This text is the
          opening of every reply Wing composes, so a transcription of the governing documents
          gets read before it changes what a student hears. Only the short line of each rule
          goes into a prompt — the full wording is here for review.
        </AlertDescription>
      </Alert>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Profiles</CardTitle>
          <CardDescription>
            Newest first. Re-running the seed adds a version and leaves earlier ones untouched.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {data.profiles.map((p) => (
            <div key={p.id} className="space-y-3 rounded-md border p-3">
              <div className="flex flex-wrap items-center gap-2">
                <span className="font-medium">Version {p.versionNumber}</span>
                <StatusBadge profile={p} />
                <span className="text-sm text-muted-foreground">
                  {p.componentCount} rules · seeded {when(p.createdAt)}
                </span>
                <div className="ml-auto flex gap-2">
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => setOpenProfile(openProfile === p.id ? null : p.id)}
                  >
                    {openProfile === p.id ? "Hide" : "Review"}
                  </Button>
                  {p.status === "draft" && (
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={publish.isPending}
                      onClick={() => publish.mutate(p.id)}
                    >
                      <Upload className="mr-1.5 h-3.5 w-3.5" />
                      Publish
                    </Button>
                  )}
                </div>
              </div>

              {p.cycles.length ? (
                <p className="text-sm text-good">
                  <Check className="mr-1 inline h-3.5 w-3.5" />
                  In force for {p.cycles.map((c) => `${c.institutionName} · ${c.label}`).join(", ")}
                </p>
              ) : (
                <p className="text-sm text-muted-foreground">
                  No cohort points at this version, so it reaches nobody.
                </p>
              )}

              {p.status === "published" && !p.supersededAt && (
                <div className="flex flex-wrap gap-2 border-t pt-3">
                  {data.cycles.map((c) => {
                    const live = c.voiceProfileId === p.id;
                    return (
                      <Button
                        key={c.cycleId}
                        size="sm"
                        variant={live ? "ghost" : "outline"}
                        disabled={point.isPending}
                        onClick={() => {
                          if (live) {
                            point.mutate({ cycleId: c.cycleId, profileId: null });
                            return;
                          }
                          setWindowShut(null);
                          setReason("");
                          setPointing({ profile: p, cycle: c });
                        }}
                      >
                        {live ? (
                          <Link2Off className="mr-1.5 h-3.5 w-3.5" />
                        ) : (
                          <Link2 className="mr-1.5 h-3.5 w-3.5" />
                        )}
                        {live ? `Remove from ${c.label}` : `Give to ${c.institutionName} · ${c.label}`}
                      </Button>
                    );
                  })}
                </div>
              )}

              {openProfile === p.id && (
                <div className="space-y-4 border-t pt-3">
                  {p.notes && <p className="text-xs text-muted-foreground">{p.notes}</p>}
                  {!detail ? (
                    <div className="flex justify-center py-6">
                      <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
                    </div>
                  ) : (
                    TYPE_ORDER.filter((t) => grouped[t]?.length).map((type) => (
                      <div key={type} className="space-y-2">
                        <h4 className="text-sm font-medium">
                          {TYPE_LABELS[type] ?? type}{" "}
                          <span className="text-muted-foreground">({grouped[type].length})</span>
                        </h4>
                        {grouped[type].map((c) => (
                          <div key={c.id} className="rounded-md bg-muted/40 p-2.5">
                            <div className="flex items-baseline gap-2">
                              <span className="font-mono text-[11px] text-muted-foreground">
                                {c.key}
                              </span>
                              {c.context && (
                                <Badge className="bg-muted text-muted-foreground hover:bg-muted">
                                  {c.context.replace(/_/g, " ")}
                                </Badge>
                              )}
                            </div>
                            <p className="mt-1 text-sm font-medium">{c.short}</p>
                            <p className="mt-1 text-xs text-muted-foreground">{c.full}</p>
                          </div>
                        ))}
                      </div>
                    ))
                  )}
                </div>
              )}
            </div>
          ))}
        </CardContent>
      </Card>

      {!!data.unstated.length && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <HelpCircle className="h-4 w-4 text-warn" />
              What the documents do not say
            </CardTitle>
            <CardDescription>
              Recorded rather than filled in with something plausible. Each one is a question
              for whoever owns the Voice Guide.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {data.unstated.map((u) => (
              <div key={u.what} className="rounded-md border-l-2 border-warn pl-3">
                <p className="text-sm font-medium">{u.what}</p>
                <p className="text-xs text-muted-foreground">{u.why}</p>
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      {!!data.notRendered?.length && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <AlertTriangle className="h-4 w-4 text-warn" />
              Defined in the methodology, reaching no prompt
            </CardTitle>
            <CardDescription>
              These are not gaps in the documents — they are instructions that exist and that
              nothing currently renders. Ours to fix, not the author's.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {data.notRendered.map((u) => (
              <div key={u.what} className="rounded-md border-l-2 border-warn pl-3">
                <p className="text-sm font-medium">{u.what}</p>
                <p className="text-xs text-muted-foreground">{u.why}</p>
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      <Dialog
        open={!!pointing}
        onOpenChange={(open) => {
          if (!open) {
            setPointing(null);
            setWindowShut(null);
            setReason("");
          }
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              Give version {pointing?.profile.versionNumber} to {pointing?.cycle.label}?
            </DialogTitle>
            <DialogDescription>
              Every student in {pointing?.cycle.institutionName} · {pointing?.cycle.label} will be
              spoken to in this voice from their next turn. It replaces nothing else about the
              coaching — the same cards fire and the same gates apply — but it changes how every
              reply opens and sounds.
            </DialogDescription>
          </DialogHeader>

          {windowShut && (
            <>
              <Alert variant="destructive">
                <AlertTriangle className="h-4 w-4" />
                <AlertTitle>This cycle is mid-flight</AlertTitle>
                <AlertDescription>
                  {windowShut}. Wing's voice is the opening of every reply, so changing it now
                  changes the programme under students who are partway through — the same reason
                  publishing a sequence is gated. To override, say why. It is written to the log.
                </AlertDescription>
              </Alert>
              <div className="space-y-1.5">
                <Label htmlFor="voice-override-reason">Reason for overriding</Label>
                <Textarea
                  id="voice-override-reason"
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                  placeholder="At least ten characters, read by whoever asks why the cohort changed mid-cycle."
                  rows={3}
                />
              </div>
            </>
          )}

          <DialogFooter>
            <Button
              variant="ghost"
              onClick={() => {
                setPointing(null);
                setWindowShut(null);
                setReason("");
              }}
            >
              Cancel
            </Button>
            <Button
              disabled={
                point.isPending || !pointing || (!!windowShut && reason.trim().length < 10)
              }
              onClick={() =>
                pointing &&
                point.mutate({
                  cycleId: pointing.cycle.cycleId,
                  profileId: pointing.profile.id,
                  force: !!windowShut,
                })
              }
            >
              {point.isPending && <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />}
              {windowShut ? "Override and give" : "Give to this cohort"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
