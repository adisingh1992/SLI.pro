import { useMemo, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import AdminLayout from "./layout";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Info, Loader2, Mail, Plus, Send, UserPlus } from "lucide-react";
import { PageShell } from "@/components/admin/page";

/**
 * Advising appointments and pre-meeting snapshots (Feature List B1).
 *
 * ── WHY THIS SCREEN EXISTS AT ALL ────────────────────────────────────────
 * The spec's infrastructure line for B1 is "calendar/scheduling integration
 * (or manual admin trigger)". Manual is the August answer, so this page is the
 * whole intake path: someone types in an appointment, and the platform does the
 * two things the spec actually asks for — brief the advisor before the meeting,
 * and prompt the student before it.
 *
 * ── WHAT THIS SCREEN DELIBERATELY IS NOT ─────────────────────────────────
 * Not a scheduler. No availability, no booking, no rescheduling, no reminders
 * about the meeting itself. Berkeley and Vanderbilt already run those systems
 * and we are not competing with them; an appointment here is an input we act
 * on, and the day this screen grows a calendar grid is the day we have started
 * building the wrong product.
 *
 * The completed-session count sits next to every student in the picker because
 * it changes what happens: it selects which prep email they get, and it is a
 * fair warning that a snapshot for someone at 0 of 3 will be short.
 */

type Institution = { id: number; name: string };

type Advisor = {
  id: number;
  institutionId: number;
  name: string;
  email: string;
  active: boolean;
};

type Advisee = {
  id: number;
  firstName: string;
  lastName: string;
  email: string;
  completedSessions: number;
};

type Appointment = {
  id: number;
  scheduledAt: string;
  status: string;
  snapshotSentAt: string | null;
  studentPromptSentAt: string | null;
  studentName: string;
  studentLastName: string;
  advisorName: string;
  advisorEmail: string;
};

/*
 * Optional on purpose. A stored snapshot is whatever `compose()` wrote at the
 * time, and that shape has already changed once — declaring these required
 * would be the compiler asserting something about data it has never seen.
 */
type StoredSnapshot = {
  studentName?: string;
  sliHeadline?: string | null;
  brandClaim?: string | null;
  primaryFunction?: string | null;
  secondaryFunction?: string | null;
  evidence?: string[];
  whyNow?: string | null;
  signatureStory?: { title: string; outcome: string } | null;
  nextSteps?: string[];
  positioningInsights?: string[];
  completedCount?: number;
  confidenceTrajectory?: { session: string; confidence: number }[];
};

type SnapshotResponse = {
  sent: boolean;
  preview?: boolean;
  sentAt?: string | null;
  snapshot: StoredSnapshot | null;
};

const when = (iso: string) =>
  new Date(iso).toLocaleString(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  });

/** Local datetime string for <input type="datetime-local">, tomorrow at 10am. */
const defaultSlot = () => {
  const d = new Date();
  d.setDate(d.getDate() + 1);
  d.setHours(10, 0, 0, 0);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(
    d.getHours(),
  )}:${pad(d.getMinutes())}`;
};

export default function AdminAdvisorsPage() {
  const { toast } = useToast();

  const [studentId, setStudentId] = useState("");
  const [advisorId, setAdvisorId] = useState("");
  const [scheduledAt, setScheduledAt] = useState(defaultSlot);
  const [sendNow, setSendNow] = useState(false);

  const [showAdvisorForm, setShowAdvisorForm] = useState(false);
  const [newAdvisor, setNewAdvisor] = useState({ institutionId: "", name: "", email: "" });

  const [openSnapshot, setOpenSnapshot] = useState<number | null>(null);

  const get = <T,>(url: string) => async (): Promise<T> =>
    (await apiRequest("GET", url)).json();

  const institutions = useQuery<Institution[]>({
    queryKey: ["/api/admin/institutions"],
    queryFn: get<Institution[]>("/api/admin/institutions"),
  });

  const advisors = useQuery<Advisor[]>({
    queryKey: ["/api/admin/advisors"],
    queryFn: get<Advisor[]>("/api/admin/advisors"),
  });

  const advisees = useQuery<Advisee[]>({
    queryKey: ["/api/admin/advisees"],
    queryFn: get<Advisee[]>("/api/admin/advisees"),
  });

  const appointments = useQuery<Appointment[]>({
    queryKey: ["/api/admin/appointments"],
    queryFn: get<Appointment[]>("/api/admin/appointments"),
  });

  const snapshot = useQuery<SnapshotResponse>({
    queryKey: ["/api/admin/appointments", openSnapshot, "snapshot"],
    queryFn: get<SnapshotResponse>(`/api/admin/appointments/${openSnapshot}/snapshot`),
    enabled: openSnapshot !== null,
  });

  const selectedStudent = useMemo(
    () => advisees.data?.find((a) => String(a.id) === studentId) ?? null,
    [advisees.data, studentId],
  );

  const createAdvisor = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/admin/advisors", {
        institutionId: Number(newAdvisor.institutionId),
        name: newAdvisor.name.trim(),
        email: newAdvisor.email.trim(),
      });
      return res.json();
    },
    onSuccess: (created: Advisor) => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/advisors"] });
      setNewAdvisor({ institutionId: "", name: "", email: "" });
      setShowAdvisorForm(false);
      setAdvisorId(String(created.id));
      toast({ title: "Advisor added", description: created.email });
    },
    onError: (e: Error) => toast({ title: "Could not add advisor", description: e.message, variant: "destructive" }),
  });

  const createAppointment = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/admin/appointments", {
        studentId: Number(studentId),
        advisorId: Number(advisorId),
        scheduledAt: new Date(scheduledAt).toISOString(),
        sendNow,
      });
      return res.json();
    },
    onSuccess: (created: { snapshotSent?: boolean; snapshotReason?: string }) => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/appointments"] });
      setStudentId("");
      setSendNow(false);

      // Three outcomes, not two. The middle one — asked for the snapshot, did
      // not get it — was previously reported as the "goes in 24 hours" case,
      // so a refused send looked like a scheduled one.
      if (created.snapshotSent) {
        toast({
          title: "Appointment registered",
          description: "Snapshot sent to the advisor, and the student has been prompted.",
        });
      } else if (sendNow) {
        toast({
          title: "Registered, but the snapshot didn't send",
          description: created.snapshotReason ?? "The advisor email was not accepted.",
          variant: "destructive",
        });
      } else {
        toast({
          title: "Appointment registered",
          description: "The student has been prompted. The advisor snapshot goes 24 hours before.",
        });
      }
    },
    onError: (e: Error) =>
      toast({ title: "Could not register", description: e.message, variant: "destructive" }),
  });

  const sendSnapshot = useMutation({
    mutationFn: async ({ id, force }: { id: number; force: boolean }) => {
      const res = await apiRequest("POST", `/api/admin/appointments/${id}/snapshot`, { force });
      return res.json();
    },
    onSuccess: (_d, v) => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/appointments"] });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/appointments", v.id, "snapshot"] });
      toast({ title: "Snapshot sent" });
    },
    onError: (e: Error) =>
      toast({ title: "Not sent", description: e.message, variant: "destructive" }),
  });

  const canRegister =
    studentId !== "" && advisorId !== "" && scheduledAt !== "" && !createAppointment.isPending;

  return (
    <AdminLayout>
      <PageShell width="page">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Advising appointments</h1>
          <p className="text-sm text-muted-foreground">
            The advisor gets a summary 24 hours before the meeting. The student gets a prompt as
            soon as the appointment is registered.
          </p>
        </div>

        <Alert>
          <Info className="h-4 w-4" />
          <AlertTitle>Appointments are entered by hand</AlertTitle>
          <AlertDescription>
            SLI.pro doesn't do scheduling — Berkeley and Vanderbilt already have systems for that.
            We take the time and act on it. When a partner tells us which system they use, we'll
            pull appointments from it instead of typing them here.
          </AlertDescription>
        </Alert>

        {/* ── Register ─────────────────────────────────────────────────── */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Register an appointment</CardTitle>
            <CardDescription>
              Both emails are recorded against the appointment, so nothing sends twice.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label>Student</Label>
                <Select value={studentId} onValueChange={setStudentId}>
                  <SelectTrigger>
                    <SelectValue
                      placeholder={advisees.isLoading ? "Loading…" : "Choose a student"}
                    />
                  </SelectTrigger>
                  <SelectContent>
                    {(advisees.data ?? []).map((s) => (
                      <SelectItem key={s.id} value={String(s.id)}>
                        {s.firstName} {s.lastName} — {s.completedSessions}/3
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {selectedStudent && (
                  <p className="text-xs text-muted-foreground">
                    {selectedStudent.email} ·{" "}
                    {selectedStudent.completedSessions === 0
                      ? "hasn't started — the snapshot will say so"
                      : selectedStudent.completedSessions >= 3
                        ? "all three sessions done"
                        : `${selectedStudent.completedSessions} of 3 sessions done`}
                  </p>
                )}
              </div>

              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <Label>Advisor</Label>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="h-6 px-2 text-xs"
                    onClick={() => setShowAdvisorForm((v) => !v)}
                  >
                    <UserPlus className="mr-1 h-3 w-3" />
                    New
                  </Button>
                </div>
                <Select value={advisorId} onValueChange={setAdvisorId}>
                  <SelectTrigger>
                    <SelectValue
                      placeholder={advisors.isLoading ? "Loading…" : "Choose an advisor"}
                    />
                  </SelectTrigger>
                  <SelectContent>
                    {(advisors.data ?? []).map((a) => (
                      <SelectItem key={a.id} value={String(a.id)}>
                        {a.name} — {a.email}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label htmlFor="scheduledAt">Meeting time</Label>
                <Input
                  id="scheduledAt"
                  type="datetime-local"
                  value={scheduledAt}
                  onChange={(e) => setScheduledAt(e.target.value)}
                />
              </div>

              <div className="flex items-end pb-1">
                <label className="flex cursor-pointer items-start gap-2 text-sm">
                  <Checkbox
                    checked={sendNow}
                    onCheckedChange={(v) => setSendNow(v === true)}
                    className="mt-0.5"
                  />
                  <span>
                    Send the advisor snapshot now
                    <span className="block text-xs text-muted-foreground">
                      For a meeting sooner than 24 hours, or when an advisor has asked.
                    </span>
                  </span>
                </label>
              </div>
            </div>

            {showAdvisorForm && (
              <div className="space-y-3 rounded-md border bg-muted/40 p-4">
                <p className="text-sm font-medium">Add an advisor</p>
                <div className="grid gap-3 sm:grid-cols-3">
                  <Select
                    value={newAdvisor.institutionId}
                    onValueChange={(v) => setNewAdvisor((s) => ({ ...s, institutionId: v }))}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Institution" />
                    </SelectTrigger>
                    <SelectContent>
                      {(institutions.data ?? []).map((i) => (
                        <SelectItem key={i.id} value={String(i.id)}>
                          {i.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Input
                    placeholder="Name"
                    value={newAdvisor.name}
                    onChange={(e) => setNewAdvisor((s) => ({ ...s, name: e.target.value }))}
                  />
                  <Input
                    placeholder="Email"
                    type="email"
                    value={newAdvisor.email}
                    onChange={(e) => setNewAdvisor((s) => ({ ...s, email: e.target.value }))}
                  />
                </div>
                <Button
                  size="sm"
                  disabled={
                    !newAdvisor.institutionId ||
                    !newAdvisor.name.trim() ||
                    !newAdvisor.email.trim() ||
                    createAdvisor.isPending
                  }
                  onClick={() => createAdvisor.mutate()}
                >
                  {createAdvisor.isPending ? (
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  ) : (
                    <Plus className="mr-2 h-4 w-4" />
                  )}
                  Add advisor
                </Button>
              </div>
            )}

            <Button disabled={!canRegister} onClick={() => createAppointment.mutate()}>
              {createAppointment.isPending ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <Plus className="mr-2 h-4 w-4" />
              )}
              Register appointment
            </Button>
          </CardContent>
        </Card>

        {/* ── The list ─────────────────────────────────────────────────── */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Appointments</CardTitle>
            <CardDescription>Most recent first.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {appointments.isLoading && (
              <p className="text-sm text-muted-foreground">Loading…</p>
            )}

            {appointments.data?.length === 0 && (
              <p className="text-sm text-muted-foreground">
                Nothing registered yet.
              </p>
            )}

            {(appointments.data ?? []).map((a) => (
              <div key={a.id} className="rounded-md border p-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="space-y-1">
                    <p className="font-medium">
                      {a.studentName} {a.studentLastName}{" "}
                      <span className="font-normal text-muted-foreground">
                        with {a.advisorName}
                      </span>
                    </p>
                    <p className="text-sm text-muted-foreground">{when(a.scheduledAt)}</p>
                    <div className="flex flex-wrap gap-2 pt-1">
                      <Badge variant={a.snapshotSentAt ? "default" : "outline"}>
                        {a.snapshotSentAt
                          ? `Advisor briefed ${when(a.snapshotSentAt)}`
                          : "Advisor snapshot pending"}
                      </Badge>
                      <Badge variant={a.studentPromptSentAt ? "secondary" : "outline"}>
                        {a.studentPromptSentAt ? "Student prompted" : "Student not prompted"}
                      </Badge>
                    </div>
                  </div>

                  <div className="flex gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setOpenSnapshot(openSnapshot === a.id ? null : a.id)}
                    >
                      {openSnapshot === a.id ? "Hide" : "View snapshot"}
                    </Button>
                    <Button
                      size="sm"
                      disabled={sendSnapshot.isPending}
                      onClick={() =>
                        sendSnapshot.mutate({ id: a.id, force: Boolean(a.snapshotSentAt) })
                      }
                    >
                      {sendSnapshot.isPending ? (
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      ) : a.snapshotSentAt ? (
                        <Send className="mr-2 h-4 w-4" />
                      ) : (
                        <Mail className="mr-2 h-4 w-4" />
                      )}
                      {a.snapshotSentAt ? "Send again" : "Send now"}
                    </Button>
                  </div>
                </div>

                {openSnapshot === a.id && (
                  <div className="mt-4 border-t pt-4">
                    {snapshot.isLoading && (
                      <p className="text-sm text-muted-foreground">Loading…</p>
                    )}
                    {snapshot.data && (
                      <SnapshotView data={snapshot.data} advisorEmail={a.advisorEmail} />
                    )}
                  </div>
                )}
              </div>
            ))}
          </CardContent>
        </Card>
      </PageShell>
    </AdminLayout>
  );
}

/**
 * A sent snapshot and a preview are rendered differently on purpose.
 *
 * What the advisor received is the stored copy. Showing a fresh composition as
 * though it were the thing they read would misrepresent the record — a student
 * who completed a session in between would make the preview say something the
 * advisor never saw.
 */
function SnapshotView({ data, advisorEmail }: { data: SnapshotResponse; advisorEmail: string }) {
  const raw = data.snapshot;
  if (!raw) return <p className="text-sm text-muted-foreground">No snapshot could be built.</p>;

  /*
   * Every list is defaulted even though the server normalises stored snapshots
   * on the way out. Two reasons, and the second is the real one:
   *
   *   1. A stored snapshot is an immutable record, so old shapes persist by
   *      design and both ends should tolerate them.
   *   2. This component is rendered inside the appointment list. An exception
   *      here does not blank the snapshot, it unmounts the entire admin page —
   *      which is what it did. A missing bullet list is worth strictly less
   *      than a working screen.
   */
  const s = {
    ...raw,
    evidence: raw.evidence ?? [],
    nextSteps: raw.nextSteps ?? [],
    positioningInsights: raw.positioningInsights ?? [],
    confidenceTrajectory: raw.confidenceTrajectory ?? [],
    completedCount: raw.completedCount ?? 0,
  };

  const trajectory = s.confidenceTrajectory;

  return (
    <div className="space-y-3 text-sm">
      <p className="text-xs text-muted-foreground">
        {data.sent
          ? `Sent to ${advisorEmail}${data.sentAt ? ` on ${when(data.sentAt)}` : ""} — this is the copy they read.`
          : "Not sent yet. This is a preview of what would go out now."}
      </p>

      <div>
        <span className="text-muted-foreground">SLI: </span>
        {s.sliHeadline ?? <span className="italic">not landed on one yet</span>}
      </div>

      {s.brandClaim && (
        <div>
          <span className="text-muted-foreground">Their claim: </span>
          <span className="italic">"{s.brandClaim}"</span>
        </div>
      )}

      {s.primaryFunction && (
        <div>
          <span className="text-muted-foreground">Function: </span>
          {s.primaryFunction}
          {s.secondaryFunction ? ` (with ${s.secondaryFunction} secondary)` : ""}
        </div>
      )}

      <div>
        <span className="text-muted-foreground">Sessions completed: </span>
        {s.completedCount} of 3
      </div>

      {trajectory.length > 1 && (
        <div>
          <span className="text-muted-foreground">Confidence: </span>
          {trajectory[0].confidence} → {trajectory[trajectory.length - 1].confidence}
        </div>
      )}

      {s.evidence.length > 0 && (
        <div>
          <p className="text-muted-foreground">The proof behind it:</p>
          <ul className="mt-1 list-disc space-y-1 pl-5">
            {s.evidence.map((e, n) => (
              <li key={n}>{e}</li>
            ))}
          </ul>
        </div>
      )}

      {s.whyNow && (
        <div>
          <span className="text-muted-foreground">Why they're worth betting on now: </span>
          {s.whyNow}
        </div>
      )}

      {s.signatureStory && (
        <div>
          <span className="text-muted-foreground">Signature story: </span>
          {s.signatureStory.title}
          {s.signatureStory.outcome && (
            <p className="text-muted-foreground">{s.signatureStory.outcome}</p>
          )}
        </div>
      )}

      {s.nextSteps.length > 0 && (
        <div>
          <p className="text-muted-foreground">What they said they'd do next:</p>
          <ul className="mt-1 list-disc space-y-1 pl-5">
            {s.nextSteps.map((n, i) => (
              <li key={i}>{n}</li>
            ))}
          </ul>
        </div>
      )}

      {/* Session 1 shorthand, shown only when the evidenced fields are empty —
          same rule as the email. It reads like our notes, so it is a fallback
          for a student one session in, not a headline. */}
      {!s.evidence.length && !s.whyNow && s.positioningInsights.length > 0 && (
        <div>
          <p className="text-muted-foreground">From their first session:</p>
          <ul className="mt-1 list-disc space-y-1 pl-5">
            {s.positioningInsights.map((i, n) => (
              <li key={n}>{i}</li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
