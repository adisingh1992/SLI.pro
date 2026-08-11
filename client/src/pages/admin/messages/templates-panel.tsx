import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  AlertTriangle,
  Check,
  Eye,
  History,
  Info,
  Loader2,
  Mail,
  RotateCcw,
  Send,
} from "lucide-react";

/**
 * Message template editor.
 *
 * Wing's voice is Danielle's, and changing a sentence should not need an
 * engineer. Same principle as the heuristics, criteria, methodology and
 * objectives editors: what might need to change lives as data.
 *
 * ── THE VARIABLE PANEL IS THE POINT ──────────────────────────────────────
 * `render()` deliberately leaves an unresolved {{variable}} visible in the sent
 * message, because a visible gap is debuggable and a blanked one is not. That
 * is correct at send time and useless while writing — nobody should discover a
 * typo by reading it in a student's inbox. So the variables each message can
 * actually use are listed beside the editor, click-to-insert, and validated
 * before publishing.
 *
 * ── VALIDATION WARNS, IT DOES NOT BLOCK ──────────────────────────────────
 * The catalogue is hand-maintained and will drift behind the code. A stale
 * entry must never stop a copy fix from shipping, so errors are shown and
 * publishing proceeds. Only an empty body is refused.
 *
 * ── NO REPLAY, UNLIKE CRITERIA ───────────────────────────────────────────
 * Criteria and methodology can be re-run against finished transcripts. Copy
 * cannot — an email either went out or it didn't. Preview and test send are the
 * honest substitute: the first shows what it says, the second what arrives.
 */

type Variable = {
  name: string;
  description: string;
  sample: string;
  optional?: boolean;
};

type TemplateRow = {
  templateKey: string;
  title: string;
  trigger: string;
  sender: string;
  group: string;
  variables: Variable[];
  version: number | null;
  subjectTemplate: string | null;
  bodyTemplate: string | null;
  seeded: boolean;
};

type Issue = { level: "error" | "warning"; message: string };

type Version = {
  id: number;
  version: number;
  active: boolean;
  subjectTemplate: string | null;
  bodyTemplate: string;
  createdAt: string;
};

const GROUP_ORDER = [
  "Welcome",
  "Session completion",
  "Dormancy",
  "Life log",
  "Milestones",
  "Positioning launch",
  "Academic calendar",
  "Advising",
];

export function TemplatesPanel() {
  const { toast } = useToast();

  const [selected, setSelected] = useState<string | null>(null);
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [issues, setIssues] = useState<Issue[]>([]);
  const [preview, setPreview] = useState<{ subject: string; body: string } | null>(null);
  const [showHistory, setShowHistory] = useState(false);
  const [testTo, setTestTo] = useState("");

  const list = useQuery<{ templates: TemplateRow[]; uncatalogued: any[] }>({
    queryKey: ["/api/admin/templates"],
    queryFn: async () => (await apiRequest("GET", "/api/admin/templates")).json(),
  });

  const detail = useQuery<{ live: Version | null; versions: Version[] }>({
    queryKey: ["/api/admin/templates", selected],
    queryFn: async () => (await apiRequest("GET", `/api/admin/templates/${selected}`)).json(),
    enabled: !!selected,
  });

  const current = useMemo(
    () => list.data?.templates.find((t) => t.templateKey === selected) ?? null,
    [list.data, selected],
  );

  // Load the live copy into the editor when the selection changes. Keyed on
  // `selected` alone so typing is never clobbered by a refetch.
  useEffect(() => {
    if (!selected || !detail.data) return;
    setSubject(detail.data.live?.subjectTemplate ?? "");
    setBody(detail.data.live?.bodyTemplate ?? "");
    setIssues([]);
    setPreview(null);
    setShowHistory(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selected, detail.data?.live?.id]);

  const dirty =
    !!selected &&
    (subject !== (detail.data?.live?.subjectTemplate ?? "") ||
      body !== (detail.data?.live?.bodyTemplate ?? ""));

  const check = useMutation({
    mutationFn: async () =>
      (
        await apiRequest("POST", `/api/admin/templates/${selected}/preview`, { subject, body })
      ).json(),
    onSuccess: (r: { issues: Issue[]; preview: { subject: string; body: string } }) => {
      setIssues(r.issues);
      setPreview(r.preview);
    },
  });

  const publish = useMutation({
    mutationFn: async () =>
      (await apiRequest("POST", `/api/admin/templates/${selected}`, { subject, body })).json(),
    onSuccess: (r: { published: boolean; version: number; reason?: string }) => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/templates"] });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/templates", selected] });
      toast({
        title: r.published ? `Published as v${r.version}` : "Nothing to publish",
        description: r.published
          ? "Live now. The previous version is retired, not overwritten."
          : "The copy is unchanged from what's already live.",
      });
    },
    onError: (e: Error) =>
      toast({ title: "Could not publish", description: e.message, variant: "destructive" }),
  });

  const revert = useMutation({
    mutationFn: async (versionId: number) =>
      (
        await apiRequest("POST", `/api/admin/templates/${selected}/revert/${versionId}`)
      ).json(),
    onSuccess: (r: { version: number; revertedFrom: number }) => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/templates"] });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/templates", selected] });
      toast({
        title: `Restored v${r.revertedFrom}`,
        description: `Published as v${r.version} — the history stays intact.`,
      });
    },
  });

  const testSend = useMutation({
    mutationFn: async () =>
      (await apiRequest("POST", `/api/admin/templates/${selected}/test-send`, { to: testTo })).json(),
    onSuccess: () => toast({ title: "Test sent", description: `Check ${testTo}.` }),
    onError: (e: Error) =>
      toast({ title: "Test not sent", description: e.message, variant: "destructive" }),
  });

  const insert = (name: string) => setBody((b) => `${b}{{${name}}}`);

  const grouped = useMemo(() => {
    const out: Record<string, TemplateRow[]> = {};
    for (const t of list.data?.templates ?? []) (out[t.group] ??= []).push(t);
    return out;
  }, [list.data]);

  const errors = issues.filter((i) => i.level === "error");
  const warnings = issues.filter((i) => i.level === "warning");

  return (
    <div className="space-y-6">
        <div className="grid gap-6 lg:grid-cols-[280px_1fr]">
          {/* ── The list ───────────────────────────────────────────────── */}
          <div className="space-y-4">
            {GROUP_ORDER.filter((g) => grouped[g]?.length).map((group) => (
              <div key={group}>
                <p className="px-1 pb-1 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  {group}
                </p>
                <div className="space-y-1">
                  {grouped[group].map((t) => (
                    <button
                      key={t.templateKey}
                      onClick={() => setSelected(t.templateKey)}
                      className={`w-full rounded-md border px-3 py-2 text-left text-sm transition-colors ${
                        selected === t.templateKey
                          ? "border-primary bg-accent"
                          : "hover:bg-accent/50"
                      }`}
                    >
                      <span className="block font-medium">{t.title}</span>
                      <span className="text-xs text-muted-foreground">
                        {t.seeded ? `v${t.version}` : "not seeded — sends nothing"}
                      </span>
                    </button>
                  ))}
                </div>
              </div>
            ))}
          </div>

          {/* ── The editor ─────────────────────────────────────────────── */}
          {!current ? (
            <Card>
              <CardContent className="p-8 text-center text-sm text-muted-foreground">
                Pick a message to edit.
              </CardContent>
            </Card>
          ) : (
            <div className="space-y-4">
              <Card>
                <CardHeader>
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div>
                      <CardTitle className="text-base">{current.title}</CardTitle>
                      <CardDescription>{current.trigger}</CardDescription>
                    </div>
                    <div className="flex items-center gap-2">
                      {current.seeded ? (
                        <Badge variant="secondary">v{current.version} live</Badge>
                      ) : (
                        <Badge variant="destructive">not seeded</Badge>
                      )}
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => setShowHistory((v) => !v)}
                      >
                        <History className="mr-1 h-4 w-4" />
                        History
                      </Button>
                    </div>
                  </div>
                </CardHeader>

                <CardContent className="space-y-4">
                  {!current.seeded && (
                    <Alert variant="destructive">
                      <AlertTriangle className="h-4 w-4" />
                      <AlertTitle>Nothing is live for this message</AlertTitle>
                      <AlertDescription>
                        The code that sends it exists, but there's no active template — so it
                        currently delivers nothing at all. Publishing here fixes that.
                      </AlertDescription>
                    </Alert>
                  )}

                  <div className="space-y-2">
                    <Label htmlFor="subject">Subject</Label>
                    <Input
                      id="subject"
                      value={subject}
                      onChange={(e) => setSubject(e.target.value)}
                      placeholder="Subject line"
                    />
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="body">Body</Label>
                    <Textarea
                      id="body"
                      value={body}
                      onChange={(e) => setBody(e.target.value)}
                      rows={16}
                      className="font-mono text-sm"
                    />
                  </div>

                  {/* Variables — click to insert at the end. */}
                  <div className="rounded-md border bg-muted/40 p-3">
                    <p className="pb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                      Variables this message can use
                    </p>
                    <div className="space-y-2">
                      {current.variables.map((v) => (
                        <div key={v.name} className="flex items-start gap-2 text-sm">
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            className="h-6 shrink-0 px-2 font-mono text-xs"
                            onClick={() => insert(v.name)}
                          >
                            {`{{${v.name}}}`}
                          </Button>
                          <span className="text-muted-foreground">
                            {v.description}
                            {v.optional && (
                              <Badge variant="outline" className="ml-2 text-[10px]">
                                sometimes empty
                              </Badge>
                            )}
                          </span>
                        </div>
                      ))}
                    </div>
                    <p className="pt-3 text-xs text-muted-foreground">
                      Anything else you type in double braces is delivered literally — it won't
                      be filled in. Sent from <code>{current.sender}</code>.
                    </p>
                  </div>

                  <div className="flex flex-wrap gap-2">
                    <Button variant="outline" onClick={() => check.mutate()} disabled={check.isPending}>
                      {check.isPending ? (
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      ) : (
                        <Eye className="mr-2 h-4 w-4" />
                      )}
                      Check and preview
                    </Button>
                    <Button onClick={() => publish.mutate()} disabled={!dirty || publish.isPending}>
                      {publish.isPending ? (
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      ) : (
                        <Check className="mr-2 h-4 w-4" />
                      )}
                      Publish
                    </Button>
                    {dirty && (
                      <span className="self-center text-xs text-muted-foreground">
                        Unpublished changes
                      </span>
                    )}
                  </div>

                  {errors.length > 0 && (
                    <Alert variant="destructive">
                      <AlertTriangle className="h-4 w-4" />
                      <AlertTitle>
                        {errors.length} problem{errors.length > 1 ? "s" : ""}
                      </AlertTitle>
                      <AlertDescription>
                        <ul className="list-disc space-y-1 pl-4">
                          {errors.map((i, n) => (
                            <li key={n}>{i.message}</li>
                          ))}
                        </ul>
                      </AlertDescription>
                    </Alert>
                  )}

                  {warnings.length > 0 && (
                    <Alert>
                      <Info className="h-4 w-4" />
                      <AlertTitle>Worth checking</AlertTitle>
                      <AlertDescription>
                        <ul className="list-disc space-y-1 pl-4">
                          {warnings.map((i, n) => (
                            <li key={n}>{i.message}</li>
                          ))}
                        </ul>
                      </AlertDescription>
                    </Alert>
                  )}

                  {preview && (
                    <div className="rounded-md border p-4">
                      <p className="pb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                        Preview — with example values
                      </p>
                      <p className="font-medium">{preview.subject}</p>
                      <pre className="whitespace-pre-wrap pt-2 text-sm font-sans">
                        {preview.body}
                      </pre>
                    </div>
                  )}
                </CardContent>
              </Card>

              {/* ── Test send ────────────────────────────────────────────── */}
              <Card>
                <CardHeader>
                  <CardTitle className="text-base">Send yourself a test</CardTitle>
                  <CardDescription>
                    Sends the published version, with example values. Preview shows what it says;
                    this shows what actually arrives.
                  </CardDescription>
                </CardHeader>
                <CardContent className="flex flex-wrap gap-2">
                  <Input
                    type="email"
                    placeholder="you@example.com"
                    value={testTo}
                    onChange={(e) => setTestTo(e.target.value)}
                    className="max-w-xs"
                  />
                  <Button
                    variant="outline"
                    disabled={!testTo.includes("@") || testSend.isPending || !current.seeded}
                    onClick={() => testSend.mutate()}
                  >
                    {testSend.isPending ? (
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    ) : (
                      <Send className="mr-2 h-4 w-4" />
                    )}
                    Send test
                  </Button>
                  {dirty && (
                    <p className="w-full text-xs text-muted-foreground">
                      Your unpublished edits won't be in it — publish first to test them.
                    </p>
                  )}
                </CardContent>
              </Card>

              {/* ── History ──────────────────────────────────────────────── */}
              {showHistory && (
                <Card>
                  <CardHeader>
                    <CardTitle className="text-base">Version history</CardTitle>
                    <CardDescription>
                      Old versions are retired, never overwritten — an email sent last month stays
                      explicable by the copy that was live when it went.
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    {(detail.data?.versions ?? []).map((v) => (
                      <div key={v.id} className="rounded-md border p-3">
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <div className="flex items-center gap-2">
                            <Badge variant={v.active ? "default" : "outline"}>v{v.version}</Badge>
                            {v.active && <span className="text-xs text-muted-foreground">live</span>}
                            <span className="text-xs text-muted-foreground">
                              {new Date(v.createdAt).toLocaleString()}
                            </span>
                          </div>
                          {!v.active && (
                            <Button
                              variant="ghost"
                              size="sm"
                              disabled={revert.isPending}
                              onClick={() => revert.mutate(v.id)}
                            >
                              <RotateCcw className="mr-1 h-4 w-4" />
                              Restore
                            </Button>
                          )}
                        </div>
                        <p className="pt-2 text-sm font-medium">{v.subjectTemplate}</p>
                        <pre className="whitespace-pre-wrap pt-1 text-xs font-sans text-muted-foreground">
                          {v.bodyTemplate}
                        </pre>
                      </div>
                    ))}
                  </CardContent>
                </Card>
              )}
            </div>
          )}
        </div>

        {(list.data?.uncatalogued.length ?? 0) > 0 && (
          <Alert>
            <Mail className="h-4 w-4" />
            <AlertTitle>Templates in the database that aren't listed above</AlertTitle>
            <AlertDescription>
              {list.data!.uncatalogued.map((u) => u.templateKey).join(", ")} — these are live but
              have no catalogue entry, so their variables can't be checked and they can't be
              edited here. Add them to <code>template-catalogue.ts</code>.
            </AlertDescription>
          </Alert>
        )}
    </div>
  );
}
