import * as docStore from "./document-store";
import * as intakeStore from "./intake-store";
import { log } from "../logger";

/**
 * Everything Wing already knows about a student, assembled for a session
 * prompt (Feature List A2).
 *
 * ── THE BUG THIS EXISTS TO FIX ───────────────────────────────────────────
 * "Eliminate redundant data collection: sessions currently ask for information
 * already available from the LinkedIn PDF upload (e.g. 'What's your current
 * headline?'). Wing should pull this from uploaded LinkedIn data and reference
 * it rather than re-asking."
 *
 * The cause was not subtle once found. The conversation prompt received
 * exactly three things: a resume summary, prior session transcripts, and the
 * completion criteria. And the resume summary filtered on `type === "resume"`,
 * so the LinkedIn PDF — the document the complaint is specifically about — was
 * uploaded, extracted, stored, and then never shown to Wing at all.
 *
 * The intake was worse. `formatQuestionnaireContext` existed and was wired
 * only into the ANALYSIS prompt, never the conversation. So during a live
 * session Wing had no idea what the student had already told it, and asked
 * again. That is not a prompt-tuning problem; the information was not there.
 *
 * A1 makes this sharper rather than milder: the conversational intake now
 * gathers goals, fears, self-perception and current visibility. A session that
 * re-asks any of it undoes the one thing the intake was rebuilt to achieve.
 *
 * ── WHY THE "DO NOT ASK" LIST NAMES FIELDS ───────────────────────────────
 * The old resume block ended with "Use this information to provide
 * personalized coaching". That is a suggestion, and models treat it as one. A
 * model that has been handed a LinkedIn profile will still ask for a headline
 * unless it is told, specifically, that the headline is a thing it already has.
 * So the sections below list the fields by name.
 *
 * ── SIZE IS A CORRECTNESS PROBLEM, NOT A COST ONE ────────────────────────
 * Extracted document text runs to tens of thousands of characters. The session
 * prompt is already ~22,000. Pasting three documents in whole would bury the
 * methodology under the student's CV, and the model would follow the loudest
 * thing in the context rather than the coaching instructions. Everything here
 * is bounded, per document and in total.
 */

/** Per-document ceiling. Enough for a profile or an essay's substance. */
const PER_DOCUMENT_CHARS = 3000;
/** Total ceiling across all documents. */
const TOTAL_DOCUMENT_CHARS = 9000;

const SUPPLEMENTARY: ReadonlySet<string> = new Set([
  "essay",
  "assessment",
  "certificate",
  "other",
]);

/** Trims to a boundary rather than mid-word, and says it was trimmed. */
function clip(text: string, limit: number): string {
  const t = text.trim();
  if (t.length <= limit) return t;
  const cut = t.slice(0, limit);
  const lastBreak = Math.max(cut.lastIndexOf("\n"), cut.lastIndexOf(". "));
  const body = lastBreak > limit * 0.6 ? cut.slice(0, lastBreak + 1) : cut;
  return `${body.trim()}\n[…truncated]`;
}

/**
 * The usable text of a document.
 *
 * `analysisContent` first — it is Wing's own summary and is denser than raw
 * extraction. `extractedText` is the fallback for documents uploaded before
 * analysis ran, or where it failed.
 */
function documentText(doc: docStore.DocumentView): string | null {
  const text = doc.analysisContent?.trim() || doc.extractedText?.trim();
  return text ? text : null;
}

/* ── Section builders ───────────────────────────────────────────────────── */

function linkedInSection(docs: docStore.DocumentView[]): string {
  const linkedin = docs.filter((d) => d.type === "linkedin").at(-1);
  if (!linkedin) return "";
  const text = documentText(linkedin);
  if (!text) return "";

  return `── THEIR LINKEDIN PROFILE (already uploaded) ────────────────────────────
${clip(text, PER_DOCUMENT_CHARS)}

DO NOT ASK FOR ANY OF THE FOLLOWING — you already have it above:
their current headline, their About/summary text, their job titles, their
employers, their dates, their listed skills, their education.

Reference it instead. "Your headline says X" is worth ten times "what's your
headline?", because the second tells them you have not looked.`;
}

function resumeSection(docs: docStore.DocumentView[]): string {
  const resume = docs.filter((d) => d.type === "resume").at(-1);
  if (!resume) return "";
  const text = documentText(resume);
  if (!text) return "";

  return `── THEIR RESUME (already uploaded) ──────────────────────────────────────
${clip(text, PER_DOCUMENT_CHARS)}

DO NOT ASK for their work history, job titles, employers, dates or degree.
Ask about what is NOT in a resume: why they made a choice, what they were
actually good at, what a bullet point cost them.`;
}

function supplementarySection(docs: docStore.DocumentView[], budget: number): string {
  const extras = docs.filter((d) => SUPPLEMENTARY.has(d.type));
  if (!extras.length || budget <= 0) return "";

  const parts: string[] = [];
  let used = 0;

  // Newest first: a recent personality assessment says more about who they are
  // now than a college essay from four years ago.
  for (const doc of [...extras].reverse()) {
    const text = documentText(doc);
    if (!text) continue;

    const remaining = budget - used;
    if (remaining < 400) break; // too little left to be worth including

    const body = clip(text, Math.min(PER_DOCUMENT_CHARS, remaining));
    parts.push(`${doc.name} (${doc.type}):\n${body}`);
    used += body.length;
  }

  if (!parts.length) return "";

  return `── OTHER THINGS THEY HAVE UPLOADED ──────────────────────────────────────
${parts.join("\n\n")}

Reference these when they are genuinely relevant — an essay that shows how they
think, an assessment that names a strength they are not claiming. Do not force
a mention, and do not treat an assessment result as a fact about them. It is
one more piece of evidence, and they are allowed to disagree with it.`;
}

/**
 * What the student told Wing during intake.
 *
 * Field names come from the intake beats (intake-beats.ts) and the legacy
 * form, which deliberately share a vocabulary so this reads the same either
 * way.
 */
const INTAKE_LABELS: Record<string, string> = {
  professional_status: "Career stage",
  current_title: "Current role",
  current_company: "Employer",
  major: "Studying",
  field_of_study: "Field",
  university_name: "Institution",
  graduation_year: "Graduating",
  years_experience: "Years of experience",
  leadership_level: "Leadership level",
  primary_industry: "Industry",
  target_industries: "Target industries",
  target_functions: "Target functions",
  career_focus: "Where they want to go",
  goals: "What they want",
  immediate_priorities: "Why they are here now",
  activity_level: "Current professional visibility",
  content_activity: "Content activity",
  visibility_concerns: "What holds them back",
  fears: "What they are worried about",
  self_description: "How they think they are seen",
  perceived_strengths: "What they think they are good at",
  notable_work: "Something they are quietly pleased with",
  student_experience: "Student experience",
  professional_experience: "Professional experience",
  timeline: "Timeline",
  pathway: "Pathway (employment / venture / freelance)",
};

function intakeSection(responses: Record<string, unknown>): string {
  const lines: string[] = [];

  for (const [key, label] of Object.entries(INTAKE_LABELS)) {
    const value = responses[key];
    if (value === null || value === undefined) continue;

    const rendered = Array.isArray(value)
      ? value.filter(Boolean).join(", ")
      : String(value).trim();
    if (!rendered) continue;

    lines.push(`  ${label}: ${clip(rendered, 400)}`);
  }

  if (!lines.length) return "";

  return `── WHAT THEY TOLD YOU WHEN THEY SIGNED UP ───────────────────────────────
${lines.join("\n")}

This came from your own first conversation with them. Asking any of it again
tells them you were not listening — and it is the single most common complaint
about these sessions.

Build on it instead. If they said they are worried about how they will be
perceived, that is something to return to, not something to discover twice.`;
}

/* ── The founder / freelancer branch ────────────────────────────────────── */

/**
 * How the session should speak, given what they are aiming at (A2).
 *
 * "Add a founder/freelancer pathway branch — intake asks whether the student is
 * targeting employment, starting a venture, or freelancing, and session
 * language adjusts accordingly."
 *
 * ── WHY THIS IS MORE THAN VOCABULARY ─────────────────────────────────────
 * The methodology's central test is whether someone would bet on you, and the
 * prompts express it as a hiring manager or a VC deciding. For a freelancer
 * that test still holds but the person applying it is a client choosing between
 * three quotes, and "would an investor fund this" is a question they will never
 * face. Left unadjusted, the session spends its most important moments asking a
 * freelancer to prove something to an audience they do not have.
 *
 * So each pathway names three things: who is judging, what that person is
 * actually deciding, and the evidence that moves them. Wing keeps the same
 * standard and changes who it is held against.
 */
const PATHWAY_GUIDANCE: Record<string, string> = {
  employment: `── THEY ARE AIMING AT EMPLOYMENT ────────────────────────────────────────
Audience: hiring managers and the people who brief them.
The decision: whether to interview, and later whether to make an offer.
What moves it: evidence they did the thing, at a scale the role needs, recently.

Speak in roles, teams, scope and progression. "Would a hiring manager reading
this shortlist you" is the live test.`,

  venture: `── THEY ARE BUILDING SOMETHING OF THEIR OWN ─────────────────────────────
Audience: investors, co-founders, and early customers.
The decision: whether to back them, join them, or buy from them.
What moves it: evidence of judgement under uncertainty, not job titles. What
they chose when it was not obvious, and what it cost.

Do NOT coach them toward employability. A founder does not need a headline that
reads well to a recruiter — they need a claim an investor or a first customer
would act on. "Why you, for this" outranks "why you, for a role".`,

  freelance: `── THEY WORK FOR THEMSELVES ─────────────────────────────────────────────
Audience: prospective clients, and whoever refers them.
The decision: whether to hire them for a specific piece of work, usually
against two or three alternatives, usually quickly.

What moves it: a sharp, narrow claim about the problem they solve, and proof
they have solved it before for someone recognisably similar. Breadth reads as
availability rather than range — it actively hurts here in a way it does not in
employment.

Speak in engagements, clients, outcomes and repeat work. Never "your career
trajectory" or "your next role"; they are not looking for one.`,
};

function pathwaySection(pathway: string | null | undefined): string {
  if (!pathway) return "";
  return PATHWAY_GUIDANCE[pathway] ?? "";
}

/* ── Assembly ───────────────────────────────────────────────────────────── */

export type StudentContext = {
  text: string;
  /** Which sections were included — for logging and the prompt preview. */
  included: string[];
  chars: number;
};

/**
 * Builds the context block for a session prompt.
 *
 * Never throws: a session must not fail because a document could not be read.
 * A missing section produces a smaller prompt, which is a degraded conversation
 * rather than a broken one.
 */
export async function buildStudentContext(userId: number): Promise<StudentContext> {
  const empty: StudentContext = { text: "", included: [], chars: 0 };

  try {
    const [documents, intake, questionnaire, record] = await Promise.all([
      docStore.getDocuments(userId).catch(() => [] as docStore.DocumentView[]),
      intakeStore.getBrandingIntake(userId).catch(() => undefined),
      intakeStore.getQuestionnaire(userId).catch(() => undefined),
      intakeStore.getIntakeRecord(userId).catch(() => undefined),
    ]);

    const responses: Record<string, unknown> = {
      ...((intake?.responses as Record<string, unknown>) ?? {}),
    };

    // The legacy questionnaire mapped onto the same vocabulary, so a migrated
    // student's answers appear alongside a new student's without the prompt
    // needing to know which era they came from. Intake wins on conflict: it is
    // the more recent conversation.
    if (questionnaire) {
      const legacy: Record<string, unknown> = {
        primary_industry: questionnaire.industry,
        goals: questionnaire.goals,
        career_focus: questionnaire.aspirations,
        visibility_concerns: questionnaire.challenges,
        timeline: questionnaire.timeframe,
      };
      for (const [k, v] of Object.entries(legacy)) {
        if (responses[k] === undefined && v) responses[k] = v;
      }
    }

    const sections: { name: string; body: string }[] = [];

    const li = linkedInSection(documents);
    if (li) sections.push({ name: "linkedin", body: li });

    const cv = resumeSection(documents);
    if (cv) sections.push({ name: "resume", body: cv });

    const usedSoFar = li.length + cv.length;
    const extra = supplementarySection(documents, TOTAL_DOCUMENT_CHARS - usedSoFar);
    if (extra) sections.push({ name: "supplementary", body: extra });

    const said = intakeSection(responses);
    if (said) sections.push({ name: "intake", body: said });

    // The column first, the JSON blob as fallback — the column is what the
    // intake writes deliberately, and what any later consumer will read.
    const pathway =
      (record?.pathway as string | null | undefined) ??
      (typeof responses.pathway === "string" ? responses.pathway : null);

    const branch = pathwaySection(pathway);
    if (branch) sections.push({ name: `pathway:${pathway}`, body: branch });

    if (!sections.length) return empty;

    const text =
      `═══════════════════════════════════════════════════════════════\n` +
      `WHAT YOU ALREADY KNOW ABOUT THIS PERSON\n` +
      `═══════════════════════════════════════════════════════════════\n\n` +
      sections.map((s) => s.body).join("\n\n") +
      `\n\n═══════════════════════════════════════════════════════════════`;

    return { text, included: sections.map((s) => s.name), chars: text.length };
  } catch (err) {
    log(`student context failed for user ${userId}: ${(err as Error).message}`, "context");
    return empty;
  }
}
