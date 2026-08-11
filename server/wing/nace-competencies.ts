/**
 * The NACE Career Readiness Competencies — reference data (Feature List A4).
 *
 * Pure, zero imports. Verbatim from the National Association of Colleges and
 * Employers, "Competencies for a Career-Ready Workforce", December 2025
 * revision (©2025 NACE).
 *
 * ── WHY THE EXACT WORDING MATTERS ────────────────────────────────────────
 * This is the vocabulary Berkeley and Vanderbilt already report against. A
 * competency named "Career Development" instead of "Career + Self-Development",
 * or "Diversity" instead of "Equity + Inclusion", does not map onto anything
 * their existing reporting recognises — which is the entire point of using an
 * external standard rather than inventing one.
 *
 * The names below were checked against the current NACE publication rather
 * than recalled. NACE revises this: the December 2025 edition supersedes the
 * April 2024 one, and a future revision may change names again. If it does,
 * change them HERE — every consumer reads from this table.
 *
 * ── THE SAMPLE BEHAVIOURS ARE THE USEFUL PART ────────────────────────────
 * Mapping a story to a competency is genuinely ambiguous without them. "I ran
 * the project and kept everyone on track" reads as Leadership or Teamwork
 * depending on nothing in particular. NACE's own behaviour lists settle it:
 * "plan, initiate, manage, complete, and evaluate projects" is Leadership;
 * "be accountable for individual and team responsibilities" is Teamwork.
 *
 * So they go into the extraction prompt in full. Without them the model
 * produces plausible mappings that no career centre would agree with, and the
 * portfolio becomes worse than useless — confidently mislabelled.
 */

export type NaceCompetency = {
  /** Stable key stored in the database. Never change these. */
  key: string;
  /** NACE's exact published name. */
  name: string;
  /** NACE's exact published definition. */
  definition: string;
  /** NACE's published sample behaviours, used to disambiguate mapping. */
  sampleBehaviors: string[];
};

export const NACE_COMPETENCIES: NaceCompetency[] = [
  {
    key: "career_self_development",
    name: "Career + Self-Development",
    definition:
      "Proactively develop oneself and one's career through continual personal and professional learning, awareness of one's strengths and weaknesses, navigation of career opportunities, and networking to build relationships within and without one's organization.",
    sampleBehaviors: [
      "Show an awareness of own strengths and areas for development.",
      "Identify areas for continual growth while pursuing and applying feedback.",
      "Develop plans and goals for one's future career.",
      "Professionally advocate for oneself and others.",
      "Display curiosity; seek out opportunities to learn.",
      "Assume duties or positions that will help one progress professionally.",
      "Establish, maintain, and/or leverage relationships with people who can help one professionally.",
      "Seek and embrace development opportunities.",
      "Voluntarily participate in further education, training, or other events to support one's career.",
    ],
  },
  {
    key: "communication",
    name: "Communication",
    definition:
      "Clearly and effectively exchange information, ideas, facts, and perspectives with persons inside and outside of an organization.",
    sampleBehaviors: [
      "Understand the importance of and demonstrate verbal, written, and non-verbal/body language, abilities.",
      "Employ active listening, persuasion, and influencing skills.",
      "Communicate in a clear and organized manner so that others can effectively understand.",
      "Frame communication with respect to diversity of learning styles, varied individual communication abilities, and cultural differences.",
      "Ask appropriate questions for specific information from supervisors, specialists, and others.",
      "Promptly inform relevant others when needing guidance with assigned tasks.",
    ],
  },
  {
    key: "critical_thinking",
    name: "Critical Thinking",
    definition:
      "Identify and respond to needs based upon an understanding of situational context and logical analysis of relevant information.",
    sampleBehaviors: [
      "Make decisions and solve problems using sound, inclusive reasoning and judgment.",
      "Gather and analyze information from a diverse set of sources and individuals to fully understand a problem.",
      "Proactively anticipate needs and prioritize action steps.",
      "Accurately summarize and interpret data with an awareness of personal biases that may impact outcomes.",
      "Effectively communicate actions and rationale, recognizing the diverse perspectives and lived experiences of stakeholders.",
      "Multi-task well in a fast-paced environment.",
    ],
  },
  {
    key: "equity_inclusion",
    name: "Equity + Inclusion",
    definition:
      "Demonstrate the awareness, attitude, knowledge, and skills required to equitably engage and include people from different cultures and backgrounds. Engage in anti-oppressive practices that actively challenge the systems, structures, and policies of racism and inequity.",
    sampleBehaviors: [
      "Solicit and use feedback from multiple cultural perspectives to make inclusive and equity-minded decisions.",
      "Actively contribute to inclusive and equitable practices that influence individual and systemic change.",
      "Advocate for inclusion, equitable practices, justice, and empowerment for historically marginalized communities.",
      "Seek global cross-cultural interactions and experiences that enhance one's understanding of people from different demographic groups and that leads to personal growth.",
      "Keep an open mind to diverse ideas and new ways of thinking.",
      "Identify resources and eliminate barriers resulting from individual and systemic racism, inequities, and biases.",
      "Demonstrate flexibility by adapting to diverse environments.",
      "Address systems of privilege that limit opportunities for members of historically marginalized communities.",
    ],
  },
  {
    key: "leadership",
    name: "Leadership",
    definition:
      "Recognize and capitalize on personal and team strengths to achieve organizational goals.",
    sampleBehaviors: [
      "Inspire, persuade, and motivate self and others under a shared vision.",
      "Seek out and leverage diverse resources and feedback from others to inform direction.",
      "Use innovative thinking to go beyond traditional methods.",
      "Serve as a role model to others by approaching tasks with confidence and a positive attitude.",
      "Motivate and inspire others by encouraging them and by building mutual trust.",
      "Plan, initiate, manage, complete, and evaluate projects.",
    ],
  },
  {
    key: "professionalism",
    name: "Professionalism",
    definition:
      "Knowing work environments differ greatly, understand and demonstrate effective work habits, and act in the interest of the larger community and workplace.",
    sampleBehaviors: [
      "Act equitably with integrity and accountability to self, others, and the organization.",
      "Maintain a positive personal brand in alignment with organization and personal career values.",
      "Be present and prepared.",
      "Demonstrate dependability (e.g., report consistently for work or meetings).",
      "Prioritize and complete tasks to accomplish organizational goals.",
      "Consistently meet or exceed goals and expectations.",
      "Have an attention to detail, resulting in few if any errors in their work.",
      "Show a high level of dedication toward doing a good job.",
    ],
  },
  {
    key: "teamwork",
    name: "Teamwork",
    definition:
      "Build and maintain collaborative relationships to work effectively toward common goals, while appreciating diverse viewpoints and shared responsibilities.",
    sampleBehaviors: [
      "Listen carefully to others, taking time to understand and ask appropriate questions without interrupting.",
      "Effectively manage conflict, interact with and respect diverse personalities, and meet ambiguity with resilience.",
      "Be accountable for individual and team responsibilities and deliverables.",
      "Employ personal strengths, knowledge, and talents to complement those of others.",
      "Exercise the ability to compromise and be agile.",
      "Collaborate with others to achieve common goals.",
      "Build strong, positive working relationships with supervisor and team members/coworkers.",
    ],
  },
  {
    key: "technology",
    name: "Technology",
    definition:
      "Understand and leverage technologies ethically to enhance efficiencies, complete tasks, and accomplish goals.",
    sampleBehaviors: [
      "Navigate change and be open to learning new technologies.",
      "Use technology to improve efficiency and productivity of their work.",
      "Identify appropriate technology for completing specific tasks.",
      "Manage technology to integrate information to support relevant, effective, and timely decision-making.",
      "Quickly adapt to new or unfamiliar technologies.",
      "Manipulate information, construct ideas, and use technology to achieve strategic goals.",
    ],
  },
];

const BY_KEY = new Map(NACE_COMPETENCIES.map((c) => [c.key, c]));

/** Lowercased name → key, for tolerating a model returning the display name. */
const BY_NAME = new Map(
  NACE_COMPETENCIES.map((c) => [c.name.toLowerCase(), c.key]),
);

export function isCompetencyKey(v: unknown): v is string {
  return typeof v === "string" && BY_KEY.has(v);
}

export function getCompetency(key: string): NaceCompetency | undefined {
  return BY_KEY.get(key);
}

/**
 * Resolves whatever the model returned to a real competency key, or null.
 *
 * Accepts the key or the display name, case-insensitively, and normalises the
 * punctuation NACE uses — "Career + Self-Development" gets written back as
 * "Career and Self Development" often enough that rejecting it would throw away
 * correct mappings over a plus sign.
 *
 * Returns NULL rather than guessing. An unmappable value means the item is
 * dropped: a portfolio entry filed under a competency nobody recognises is
 * worse than one fewer entry, because it goes into institutional reporting.
 */
export function resolveCompetency(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const t = raw.trim();
  if (!t) return null;

  if (BY_KEY.has(t)) return t;

  const lower = t.toLowerCase();
  const byName = BY_NAME.get(lower);
  if (byName) return byName;

  // Normalise separators: "+", "&", "and", hyphens and spaces all collapse.
  const normalise = (s: string) =>
    s
      .toLowerCase()
      .replace(/\band\b/g, "+")
      .replace(/&/g, "+")
      .replace(/[\s\-_]+/g, "")
      .replace(/\++/g, "+");

  const target = normalise(t);
  for (const c of NACE_COMPETENCIES) {
    if (normalise(c.name) === target || normalise(c.key) === target) return c.key;
  }

  return null;
}

/** The competency list rendered for a prompt, behaviours included. */
export function renderForPrompt(): string {
  return NACE_COMPETENCIES.map(
    (c) =>
      `${c.key}  —  ${c.name}\n` +
      `  ${c.definition}\n` +
      `  Counts as this when the student:\n` +
      c.sampleBehaviors.map((b) => `    · ${b}`).join("\n"),
  ).join("\n\n");
}

/** Empty coverage map — every competency present, so gaps are visible. */
export function emptyCoverage(): Record<string, number> {
  return Object.fromEntries(NACE_COMPETENCIES.map((c) => [c.key, 0]));
}
