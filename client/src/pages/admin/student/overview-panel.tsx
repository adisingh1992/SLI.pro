import { ReactNode } from "react";
import {
  Clock,
  Download,
  ExternalLink,
  File,
  FileText,
  Link2,
  Mail,
  Phone,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { useToast } from "@/hooks/use-toast";
import { useAdminRole } from "@/hooks/use-admin-role";
import { Section } from "@/components/admin/page";
import { EmptyState, LoadingCards } from "@/components/admin/states";
import { INTAKE_SCHEMA, resolveIntakeFieldValue } from "@/lib/intake-admin-schema";
import { QUESTIONNAIRE_SCHEMA, resolveQuestionText } from "@/lib/questionnaire-admin-schema";
import type { StudentRecord } from "./types";
import { cn } from "@/lib/utils";

/**
 * Who this student is: profile, documents, and everything they told us before
 * their first session.
 *
 * ── DENSITY IS THE POINT ─────────────────────────────────────────────────
 * The old version wrapped each of five sections in a Card with a 20px icon, an
 * `text-xl` title and a description sentence — roughly 120px of chrome before
 * the first fact. An advisor opening this five minutes before a meeting is
 * scanning, not reading, and the chrome was pushing the actual answers below
 * the fold. Definition lists on a plain surface, one light rule between
 * sections.
 */

/**
 * Intake sections restricted to SLIpro platform staff.
 *
 * ── WHY THIS ONE IS GATED ────────────────────────────────────────────────
 * Race, gender identity, first-generation status and immigrant background are
 * collected for aggregate equity reporting. They are not context for a
 * one-to-one meeting, and an advisor scanning a record five minutes beforehand
 * has no use for them that is better than the risk of reading them.
 *
 * This project already holds the line elsewhere: the evidence portfolio
 * explicitly forbids inferring the Equity + Inclusion competency from
 * demographics. Displaying them by default to every institutional admin at
 * Berkeley and Vanderbilt undercuts that from the other direction — it puts
 * the data in front of the person making the judgement.
 *
 * Institution admins get the aggregate through the cohort exports, which is
 * what the reporting obligation actually needs.
 *
 * Presentation only. The API still returns these fields; if they should not
 * leave the server for a non-platform admin, that belongs in the endpoint.
 */
const RESTRICTED_STAGES = new Set(["Demographics"]);

/** Whether an intake answer was actually given. */
const hasAnswer = (v: unknown) =>
  v !== null &&
  v !== undefined &&
  v !== "" &&
  !(Array.isArray(v) && v.length === 0);

const fmt = (d?: string | null) =>
  d
    ? new Date(d).toLocaleDateString(undefined, {
        year: "numeric",
        month: "short",
        day: "numeric",
      })
    : "—";

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="space-y-1">
      <dt className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
        {label}
      </dt>
      <dd className="text-sm">{children || <span className="text-muted-foreground">—</span>}</dd>
    </div>
  );
}

/** Renders whatever an intake answer turned out to be, without guessing. */
function Answer({ value, isUrl = false }: { value: unknown; isUrl?: boolean }) {
  if (
    value === null ||
    value === undefined ||
    value === "" ||
    (Array.isArray(value) && value.length === 0)
  ) {
    return <span className="text-sm italic text-muted-foreground">Not answered</span>;
  }
  if (typeof value === "boolean") {
    return <span className="text-sm">{value ? "Yes" : "No"}</span>;
  }

  // A number here is a 1–5 rating. Printing "4" loses the scale, and the scale
  // is most of the meaning.
  if (typeof value === "number") {
    return (
      <div className="flex items-center gap-1.5">
        {[1, 2, 3, 4, 5].map((i) => (
          <span
            key={i}
            className={cn("h-1.5 w-6 rounded-full", i <= value ? "bg-brand" : "bg-muted")}
          />
        ))}
        <span className="ml-1 text-xs text-muted-foreground">{value} / 5</span>
      </div>
    );
  }

  if (Array.isArray(value)) {
    return (
      <div className="flex flex-wrap gap-1.5">
        {value.map((item, i) => (
          <Badge key={i} variant="secondary" className="font-normal">
            {String(item)}
          </Badge>
        ))}
      </div>
    );
  }

  if (typeof value === "string") {
    const looksLikeLink =
      isUrl || value.startsWith("http") || value.includes("linkedin.com");
    if (looksLikeLink) {
      const href = value.startsWith("http") ? value : `https://${value}`;
      return (
        <a
          href={href}
          target="_blank"
          rel="noreferrer noopener"
          className="inline-flex items-center gap-1 break-all text-sm text-info underline-offset-2 hover:underline"
        >
          {value}
          <ExternalLink className="h-3 w-3 shrink-0" />
        </a>
      );
    }
    return <p className="whitespace-pre-wrap text-sm leading-relaxed">{value}</p>;
  }

  return <span className="text-sm">{String(value)}</span>;
}

/**
 * One brand-assessment answer.
 *
 * ── THE ENTRY IS NOT THE ANSWER ──────────────────────────────────────────
 * `rawAnswers[key]` is `{ question, answer, other?, aiSubtopics? }` — a record
 * of what was asked as well as what was said. Rendering the entry rather than
 * `entry.answer` prints "[object Object]" for every question, which is
 * exactly the kind of plausible-looking wrongness that survives a review.
 *
 * `aiSubtopics` are machine-suggested and labelled as such: they are not
 * something the student said, and an advisor quoting one back in a meeting as
 * though it were would be a bad moment.
 */
type RawEntry = {
  question?: string;
  answer?: unknown;
  other?: string | null;
  aiSubtopics?: string[] | null;
};

function AssessmentAnswer({ entry, isUrl }: { entry: RawEntry | undefined; isUrl?: boolean }) {
  return (
    <div className="space-y-1.5">
      <Answer value={entry?.answer ?? null} isUrl={isUrl} />

      {entry?.other && (
        <p className="text-sm leading-relaxed text-muted-foreground">{entry.other}</p>
      )}

      {entry?.aiSubtopics && entry.aiSubtopics.length > 0 && (
        <div className="space-y-1 pt-0.5">
          <p className="text-[11px] font-medium text-muted-foreground">Wing suggested</p>
          <div className="flex flex-wrap gap-1">
            {entry.aiSubtopics.map((t, i) => (
              <Badge
                key={i}
                variant="outline"
                className="border-deep/25 bg-deep-soft font-normal text-deep"
              >
                {t}
              </Badge>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

export function OverviewPanel({
  student,
  isLoading,
}: {
  student: StudentRecord | undefined;
  isLoading: boolean;
}) {
  const { toast } = useToast();
  const { isPlatformAdmin } = useAdminRole();

  if (isLoading) return <LoadingCards count={3} />;
  if (!student) return null;

  const intake = student.brandingIntake as
    | {
        platform: string;
        completed: boolean;
        marketingOptIn: boolean | null;
        currentStage: number;
        createdAt: string;
        responses: Record<string, unknown>;
      }
    | undefined;

  const questionnaire = student.questionnaire as Record<string, unknown> | undefined;
  const documents = student.documents ?? [];

  const download = async (id: number, name: string) => {
    try {
      // Content lives in Blob storage; the single-document read hydrates it.
      const res = await fetch(`/api/documents/${id}`, { credentials: "include" });
      if (!res.ok) throw new Error(`Server returned ${res.status}`);
      const full = await res.json();
      if (!full?.fileData) throw new Error("No file content stored for this document");

      const a = document.createElement("a");
      a.href = `data:application/pdf;base64,${full.fileData}`;
      a.download = name.endsWith(".pdf") ? name : `${name}.pdf`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
    } catch (err) {
      // Was `alert()`. A native dialog in an admin panel reads as a crash.
      toast({
        title: "Couldn't download that",
        description: (err as Error).message,
        variant: "destructive",
      });
    }
  };

  return (
    <div className="space-y-8">
      <Section title="Profile">
        <Card className="shadow-none">
          <CardContent className="grid gap-6 p-5 sm:grid-cols-2 lg:grid-cols-3">
            <Field label="Email">
              <span className="flex items-center gap-1.5">
                <Mail className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                <span className="break-all">{student.email}</span>
              </span>
            </Field>
            <Field label="Phone">
              {student.phoneNumber && (
                <span className="flex items-center gap-1.5">
                  <Phone className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                  {student.phoneNumber}
                </span>
              )}
            </Field>
            <Field label="LinkedIn">
              {student.linkedinConnected ? (
                <span className="flex items-center gap-1.5">
                  <Link2 className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                  Connected
                </span>
              ) : (
                <span className="text-muted-foreground">Not connected</span>
              )}
            </Field>
            <Field label="Situation">
              {student.professionalStatus?.replace(/_/g, " ")}
            </Field>
            <Field label="Found us via">{student.discoverySource?.replace(/_/g, " ")}</Field>
            <Field label="Registered">
              <span className="flex items-center gap-1.5">
                <Clock className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                {fmt(student.createdAt)}
              </span>
            </Field>
          </CardContent>
        </Card>
      </Section>

      <Section
        title="Documents"
        description="Resume, LinkedIn export and anything else they uploaded."
      >
        {documents.length === 0 ? (
          <EmptyState
            icon={File}
            title="Nothing uploaded"
            description="Wing works from these when writing a session prompt, so a student with no resume or LinkedIn export gets noticeably more generic questions."
          />
        ) : (
          <div className="space-y-2">
            {documents.map((doc) => {
              const name = doc.name || `Document ${doc.id}`;
              const uploaded = doc.uploadedAt;
              return (
                <div
                  key={doc.id}
                  className="flex items-center justify-between gap-3 rounded-lg border p-3"
                >
                  <div className="flex min-w-0 items-center gap-3">
                    <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-muted">
                      <FileText className="h-4 w-4 text-muted-foreground" />
                    </div>
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium">{name}</p>
                      <p className="text-xs text-muted-foreground">
                        {doc.docType ?? "document"} · {fmt(uploaded)}
                        {doc.sizeBytes ? ` · ${Math.round(doc.sizeBytes / 1024)} KB` : ""}
                      </p>
                    </div>
                  </div>
                  <Button size="sm" variant="outline" onClick={() => download(doc.id, name)}>
                    <Download className="mr-1.5 h-3.5 w-3.5" />
                    Download
                  </Button>
                </div>
              );
            })}
          </div>
        )}
      </Section>

      <Separator />

      <Section
        title="Registration intake"
        description="What they told Wing before the first session."
        actions={
          intake && (
            <div className="flex flex-wrap items-center gap-2">
              <Badge variant="secondary" className="font-normal capitalize">
                {intake.platform?.replace(/_/g, " ")}
              </Badge>
              <Badge variant={intake.completed ? "default" : "outline"} className="font-normal">
                {intake.completed ? "Completed" : `In progress · stage ${intake.currentStage}`}
              </Badge>
            </div>
          )
        }
      >
        {!intake ? (
          <EmptyState
            icon={FileText}
            title="No intake yet"
            description="They registered but haven't been through the intake conversation. Wing asks for all of this in the first session instead, which makes that session longer."
          />
        ) : (
          <div className="space-y-7">
            {(INTAKE_SCHEMA[intake.platform] ?? [])
              .filter((stage) => isPlatformAdmin || !RESTRICTED_STAGES.has(stage.name))
              .map((stage) => {
                const resolved = stage.questions.map((question) => ({
                  question,
                  value: resolveIntakeFieldValue(
                    question,
                    (intake.responses ?? {})[question.key],
                  ),
                }));

                const answered = resolved.filter((r) => hasAnswer(r.value));
                const skipped = resolved.filter((r) => !hasAnswer(r.value));

                // A stage where nothing was answered is a branch that never
                // applied to this student. Rendering its heading and six
                // "Not answered" rows says nothing and costs a screenful.
                if (answered.length === 0) return null;

                return (
                  <div key={stage.name}>
                    <p className="mb-3 border-b pb-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                      {stage.name}
                    </p>
                    <dl className="grid grid-cols-1 gap-x-8 gap-y-5 md:grid-cols-2">
                      {answered.map(({ question, value }) => (
                        <div key={question.key} className="space-y-1.5">
                          <dt className="text-sm font-medium">{question.label}</dt>
                          <dd>
                            <Answer value={value} />
                          </dd>
                        </div>
                      ))}
                    </dl>

                    {/*
                      Unanswered questions collapse to one line rather than
                      disappearing. The intake has conditional branches with no
                      `showIf` in the schema, so most of these never applied —
                      but some are genuine skips, and "they didn't say" is
                      occasionally the useful fact. One line keeps it without
                      the wall.
                    */}
                    {skipped.length > 0 && (
                      <p className="pt-3 text-xs leading-relaxed text-muted-foreground">
                        Not answered: {skipped.map((s) => s.question.label).join(" · ")}
                      </p>
                    )}
                  </div>
                );
              })}

            {!isPlatformAdmin && (
              <p className="border-t pt-4 text-xs leading-relaxed text-muted-foreground">
                Demographic responses are held by the SLIpro platform team and aren't shown
                here. Aggregate figures are available in the cohort exports.
              </p>
            )}
          </div>
        )}
      </Section>

      <Separator />

      <Section
        title="Brand assessment"
        description="The questionnaire responses."
      >
        {!questionnaire ? (
          <EmptyState
            icon={FileText}
            title="Not completed"
            description="The assessment is optional, so this being empty is normal rather than a problem."
          />
        ) : (
          <div className="space-y-7">
            {QUESTIONNAIRE_SCHEMA.map((section) => (
              <div key={section.name}>
                <p className="mb-3 border-b pb-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  {section.name}
                </p>
                <dl className="grid grid-cols-1 gap-x-8 gap-y-5 md:grid-cols-2">
                  {section.questions.map((q) => {
                    const { label, description } = resolveQuestionText(
                      q,
                      (intake?.platform ?? "early_career") as string,
                    );
                    return (
                      <div key={q.key} className="space-y-1.5">
                        <dt className="text-sm font-medium leading-snug">{label}</dt>
                        {description && (
                          <p className="text-xs italic leading-snug text-muted-foreground">
                            {description}
                          </p>
                        )}
                        <dd>
                          <AssessmentAnswer
                            entry={questionnaire[q.key] as RawEntry | undefined}
                            isUrl={q.isUrl}
                          />
                        </dd>
                      </div>
                    );
                  })}
                </dl>
              </div>
            ))}
          </div>
        )}
      </Section>
    </div>
  );
}
