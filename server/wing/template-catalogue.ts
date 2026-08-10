/**
 * What each message template is for, and which variables it can use.
 *
 * Pure data with no imports, so it can be unit tested and read by both the API
 * and the editor without pulling in the database.
 *
 * ── WHY THIS EXISTS ──────────────────────────────────────────────────────
 * `render()` leaves an unresolved `{{variable}}` visible in the sent message on
 * purpose — a visible gap is debuggable, a blanked one is not. That is the
 * right behaviour at send time and a terrible discovery mechanism for the
 * person writing the copy: Danielle should not learn that `{{studentName}}`
 * doesn't exist in a dormancy email by reading it in a student's inbox.
 *
 * So the editor validates against this table before publishing. It is the only
 * place that knows which variables a given send actually supplies, and it has
 * to be kept in step with the call sites in engagement.ts and
 * advisor-snapshot.ts — which is why each entry names its sender.
 */

export type TemplateVariable = {
  name: string;
  description: string;
  /** A realistic value, used for the editor's preview. */
  sample: string;
  /**
   * True when the sender can legitimately produce nothing for it. Copy that
   * leans on an optional variable reads broken exactly when it matters — this
   * is what lets the editor warn instead of finding out in an inbox.
   */
  optional?: boolean;
};

export type TemplateSpec = {
  templateKey: string;
  /** Human name for the list. */
  title: string;
  /** When this goes out, in one line. */
  trigger: string;
  /** Where the send is made from — where to look when it misbehaves. */
  sender: string;
  variables: TemplateVariable[];
  /** Grouping in the editor. */
  group: "Welcome" | "Session completion" | "Dormancy" | "Advising";
};

const firstName: TemplateVariable = {
  name: "firstName",
  description: "The student's first name.",
  sample: "Simon",
};
const sessionLink: TemplateVariable = {
  name: "sessionLink",
  description: "Link to the session they should do next.",
  sample: "https://app.sli.pro/foundation/session/1",
};
const dashboardLink: TemplateVariable = {
  name: "dashboardLink",
  description: "Link to the student dashboard.",
  sample: "https://app.sli.pro/dashboard",
};

export const TEMPLATE_CATALOGUE: TemplateSpec[] = [
  /* ── Welcome ─────────────────────────────────────────────────────────── */
  {
    templateKey: "welcome_1",
    title: "Welcome 1 — at registration",
    trigger: "Immediately when a student registers.",
    sender: "engagement.onRegistered",
    group: "Welcome",
    variables: [firstName, sessionLink],
  },
  {
    templateKey: "welcome_2",
    title: "Welcome 2 — 48 hours later",
    trigger: "48 hours after registration, only if they haven't started a session.",
    sender: "engagement.runDueSequences",
    group: "Welcome",
    variables: [firstName, sessionLink],
  },
  {
    templateKey: "welcome_3",
    title: "Welcome 3 — day 5",
    trigger: "5 days after registration, only if they still haven't started. Last of the sequence.",
    sender: "engagement.runDueSequences",
    group: "Welcome",
    variables: [firstName, sessionLink],
  },

  /* ── Session completion ──────────────────────────────────────────────── */
  {
    templateKey: "session_complete_1",
    title: "Session 1 complete",
    trigger: "Within the hour of finishing Foundation Session 1.",
    sender: "engagement.onSessionCompleted",
    group: "Session completion",
    variables: [
      firstName,
      {
        name: "primaryFunction",
        description: "The function they locked in Session 1.",
        sample: "Operations",
        optional: true,
      },
      {
        name: "insight",
        description:
          "One sentence drawn from their own session. The send is skipped entirely when there " +
          "is no real insight, rather than filling this with something generic.",
        sample: "you kept coming back to making things faster rather than bigger",
      },
      { ...sessionLink, name: "nextSessionLink", description: "Link to the next session." },
    ],
  },
  {
    templateKey: "session_complete_2",
    title: "Session 2 complete",
    trigger: "Within the hour of finishing Foundation Session 2.",
    sender: "engagement.onSessionCompleted",
    group: "Session completion",
    variables: [
      firstName,
      {
        name: "insight",
        description: "One sentence drawn from their own session.",
        sample: "your strongest proof was the one you almost didn't mention",
      },
      { ...sessionLink, name: "nextSessionLink", description: "Link to the next session." },
    ],
  },
  {
    templateKey: "session_complete_3",
    title: "Session 3 complete — the SLI",
    trigger: "Within the hour of finishing Foundation Session 3.",
    sender: "engagement.onSessionCompleted",
    group: "Session completion",
    variables: [
      firstName,
      {
        name: "sliStatement",
        description: "Their selected SLI statement.",
        sample: "The operations lead who makes clinical workflows measurably faster.",
        optional: true,
      },
      dashboardLink,
    ],
  },

  /* ── Dormancy ────────────────────────────────────────────────────────── */
  {
    templateKey: "dormancy_1",
    title: "Dormancy 1 — day 14",
    trigger: "14 days after their last activity.",
    sender: "engagement.runDueSequences",
    group: "Dormancy",
    variables: [firstName, dashboardLink],
  },
  {
    templateKey: "dormancy_2",
    title: "Dormancy 2 — day 19",
    trigger: "5 days after the first nudge, if still dormant.",
    sender: "engagement.runDueSequences",
    group: "Dormancy",
    variables: [firstName, dashboardLink],
  },
  {
    templateKey: "dormancy_3",
    title: "Dormancy 3 — day 24, then silence",
    trigger: "5 days after the second. Nothing follows until the next calendar touchpoint.",
    sender: "engagement.runDueSequences",
    group: "Dormancy",
    variables: [firstName, dashboardLink],
  },

  /* ── Advising ────────────────────────────────────────────────────────── */
  {
    templateKey: "advisor_snapshot",
    title: "Advisor pre-meeting snapshot",
    trigger: "24 hours before an advising appointment, or on demand from the admin.",
    sender: "advisor-snapshot.sendSnapshot",
    group: "Advising",
    variables: [
      { name: "advisorName", description: "The advisor's name.", sample: "Danielle Carattini" },
      { name: "studentName", description: "The student's full name.", sample: "Simon Crafer" },
      {
        name: "appointmentTime",
        description: "Date and time of the meeting.",
        sample: "8/14/2026, 10:00:00 AM",
      },
      {
        name: "snapshot",
        description:
          "The composed summary block. IMPORTANT: for a student who has done nothing this is " +
          "just \"They haven't landed on an SLI yet\" and a 0-of-3 count — so copy around it " +
          "must not promise positioning work that may not exist.",
        sample:
          "Their SLI: The operations lead who makes clinical workflows measurably faster.\n" +
          "Function: Operations (with Product secondary)\n" +
          "Sessions completed: 3 of 3",
      },
    ],
  },
  {
    templateKey: "student_prep_incomplete",
    title: "Student prep — partway through",
    trigger: "When an appointment is registered and the student hasn't finished all three sessions.",
    sender: "advisor-snapshot.sendStudentPrep",
    group: "Advising",
    variables: [
      firstName,
      { name: "appointmentDate", description: "Date of the meeting.", sample: "8/14/2026" },
      sessionLink,
    ],
  },
  {
    templateKey: "student_prep_complete",
    title: "Student prep — finished",
    trigger: "When an appointment is registered and the student has finished all three sessions.",
    sender: "advisor-snapshot.sendStudentPrep",
    group: "Advising",
    variables: [
      firstName,
      { name: "appointmentDate", description: "Date of the meeting.", sample: "8/14/2026" },
      dashboardLink,
    ],
  },
];

export function specFor(templateKey: string): TemplateSpec | null {
  return TEMPLATE_CATALOGUE.find((t) => t.templateKey === templateKey) ?? null;
}

/** Every `{{variable}}` used in a piece of copy, deduplicated, in order. */
export function variablesUsed(...parts: (string | null | undefined)[]): string[] {
  const found: string[] = [];
  for (const part of parts) {
    if (!part) continue;
    // Array.from rather than for..of: the tsconfig target predates iterating a
    // RegExpStringIterator directly, and messaging-store.ts uses the same form.
    for (const m of Array.from(part.matchAll(/\{\{(\w+)\}\}/g))) {
      if (!found.includes(m[1])) found.push(m[1]);
    }
  }
  return found;
}

export type TemplateIssue = {
  level: "error" | "warning";
  message: string;
};

/**
 * Checks copy against what the sender actually supplies.
 *
 * An unknown variable is an error: it will reach the recipient as a literal
 * `{{typo}}`. An optional one is a warning, because leaning on a value that is
 * sometimes absent is a judgement call the writer should make knowingly rather
 * than a rule the system can decide.
 */
export function validateTemplate(
  templateKey: string,
  subject: string | null,
  body: string,
): TemplateIssue[] {
  const spec = specFor(templateKey);
  const issues: TemplateIssue[] = [];

  if (!body.trim()) {
    issues.push({ level: "error", message: "The body is empty." });
  }

  if (!spec) {
    issues.push({
      level: "warning",
      message:
        `"${templateKey}" isn't in the catalogue, so its variables can't be checked. ` +
        `Add it to template-catalogue.ts alongside whatever sends it.`,
    });
    return issues;
  }

  const known = new Map(spec.variables.map((v) => [v.name, v]));

  for (const used of variablesUsed(subject, body)) {
    const v = known.get(used);
    if (!v) {
      issues.push({
        level: "error",
        message:
          `{{${used}}} isn't supplied by this message. It would be delivered literally. ` +
          `Available: ${spec.variables.map((x) => x.name).join(", ")}.`,
      });
    } else if (v.optional) {
      issues.push({
        level: "warning",
        message: `{{${v.name}}} is sometimes empty — check this still reads correctly without it.`,
      });
    }
  }

  return issues;
}

/** Fills a template with the catalogue's sample values, for the preview. */
export function previewWith(templateKey: string, text: string): string {
  const spec = specFor(templateKey);
  const samples = new Map((spec?.variables ?? []).map((v) => [v.name, v.sample]));
  return text.replace(/\{\{(\w+)\}\}/g, (whole, key) => samples.get(key) ?? whole);
}
