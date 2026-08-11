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
  group:
    | "Welcome"
    | "Session completion"
    | "Dormancy"
    | "Advising"
    | "Life log"
    | "Milestones"
    | "Positioning launch"
    | "Academic calendar";
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

  /* ── Life log ────────────────────────────────────────────────────────── */
  {
    templateKey: "life_log_nudge",
    title: "Life log nudge",
    trigger:
      "Every 5 days for the first month after Session 1, then weekly. Never stops.",
    sender: "engagement.runDueSequences",
    group: "Life log",
    variables: [
      firstName,
      {
        name: "prompt",
        description:
          "A rotating prompt from the library, never repeated within 14 days. Used as the " +
          "subject line as well as in the body. Absent if the library is empty — copy must " +
          "still make sense without it.",
        sample: "What's something you accomplished this week that you didn't tell anyone about?",
        optional: true,
      },
      {
        name: "logLink",
        description: "Link to the student's log.",
        sample: "https://app.sli.pro/log",
      },
    ],
  },

  /* ── Milestones (B3 E1/E2) ───────────────────────────────────────────── */
  {
    templateKey: "event_followup_career",
    title: "Life-event follow-up — career",
    trigger: "24 hours after a career entry in the life log. Once per student.",
    sender: "event-sequences.runEventFollowUps",
    group: "Milestones",
    variables: [
      firstName,
      {
        name: "entryExcerpt",
        description:
          "The first 180 characters of what they wrote. Quoting them is the justification for " +
          "a second message — Wing already replied when they logged it.",
        sample: "Had the second interview. They asked about the migration and I froze on the numbers.",
      },
      { name: "logLink", description: "Link to their log.", sample: "https://app.sli.pro/log" },
    ],
  },
  {
    templateKey: "event_followup_personal",
    title: "Life-event follow-up — personal",
    trigger: "24 hours after a personal entry in the life log. Once per student.",
    sender: "event-sequences.runEventFollowUps",
    group: "Milestones",
    variables: [
      firstName,
      {
        name: "entryExcerpt",
        description: "The first 180 characters of what they wrote.",
        sample: "Keep feeling like everyone else knows what they're doing and I'm improvising.",
      },
      { name: "logLink", description: "Link to their log.", sample: "https://app.sli.pro/log" },
    ],
  },
  {
    templateKey: "internship_day_30",
    title: "Internship — day 30",
    trigger: "30 days after students.internship_start_date. Never fires if that is unset.",
    sender: "event-sequences.runInternshipMilestones",
    group: "Milestones",
    variables: [
      firstName,
      { name: "logLink", description: "Link to their log.", sample: "https://app.sli.pro/log" },
    ],
  },
  {
    templateKey: "internship_day_60",
    title: "Internship — day 60",
    trigger: "60 days after students.internship_start_date.",
    sender: "event-sequences.runInternshipMilestones",
    group: "Milestones",
    variables: [
      firstName,
      {
        name: "portfolioLink",
        description: "Link to their evidence portfolio.",
        sample: "https://app.sli.pro/portfolio",
      },
    ],
  },

  /* ── 90-Day Positioning Launch (B3 S5) ───────────────────────────────── */
  {
    templateKey: "positioning_launch_week",
    title: "Positioning launch — weekly",
    trigger:
      "Weekly for twelve weeks, starting a week after their first published LinkedIn post.",
    sender: "engagement.runDueSequences",
    group: "Positioning launch",
    variables: [
      firstName,
      { name: "weekNumber", description: "1–12.", sample: "3" },
      {
        name: "weekTheme",
        description:
          "That week's theme. Comes from LAUNCH_WEEKS in event-sequences.ts — the twelve weeks " +
          "share this ONE template, so editing the copy here changes all of them.",
        sample: "Something you changed your mind about",
      },
      {
        name: "weekPrompt",
        description: "That week's specific instruction. Also from LAUNCH_WEEKS.",
        sample:
          "A view you held and dropped. It signals you are thinking rather than performing.",
      },
      {
        name: "draftsLink",
        description: "Link to their content drafts.",
        sample: "https://app.sli.pro/linkedin-content-drafts",
      },
    ],
  },

  /* ── Academic calendar (B3 S4) ───────────────────────────────────────── */
  {
    templateKey: "calendar_touchpoint_incomplete",
    title: "Calendar touchpoint — not finished",
    trigger:
      "On a configured institution calendar date, to students with fewer than 3 sessions done.",
    sender: "calendar-touchpoints.runDueTouchpoints",
    group: "Academic calendar",
    variables: [
      firstName,
      {
        name: "eventLabel",
        description: "The calendar event's name, as configured per institution.",
        sample: "Recruiting season",
      },
      {
        name: "institutionName",
        description: "Their institution.",
        sample: "University of California, Berkeley",
      },
      { name: "sessionsCompleted", description: "0, 1 or 2.", sample: "1" },
      sessionLink,
    ],
  },
  {
    templateKey: "calendar_touchpoint_complete",
    title: "Calendar touchpoint — finished",
    trigger: "Same date, to students who have completed all three sessions.",
    sender: "calendar-touchpoints.runDueTouchpoints",
    group: "Academic calendar",
    variables: [
      firstName,
      { name: "eventLabel", description: "The calendar event's name.", sample: "Recruiting season" },
      {
        name: "institutionName",
        description: "Their institution.",
        sample: "Vanderbilt University",
      },
      dashboardLink,
    ],
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
