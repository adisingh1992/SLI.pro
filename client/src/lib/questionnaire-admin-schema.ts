type PlatformMap = Record<"undergraduate" | "early_career" | "mid_career", string>;

export interface QuestionEntry {
  key: string;
  label: string;
  description: string | PlatformMap;
  isUrl?: boolean;
}

export interface SectionSchema {
  name: string;
  questions: QuestionEntry[];
}

export const QUESTIONNAIRE_SCHEMA: SectionSchema[] = [
  {
    name: "Digital Presence",
    questions: [
      {
        key: "Q1",
        label: "LinkedIn URL",
        description: "Your LinkedIn profile URL — our AI coach will use this to audit your presence.",
        isUrl: true,
      },
      {
        key: "Q2",
        label: "Current LinkedIn Presence",
        description: "Which best describes your current LinkedIn activity?",
      },
      {
        key: "Q3",
        label: "Other Professional Online Presence",
        description: "Select any other platforms where you have a professional presence.",
      },
      {
        key: "Q4",
        label: "Self-Assessment of Professional Presence",
        description: {
          undergraduate: "How well does your online presence reflect who you are professionally?",
          early_career: "How well does your professional brand position you for where you want to go next?",
          mid_career: "How well does your professional presence reflect your current expertise and leadership?",
        },
      },
    ],
  },
  {
    name: "Identity & Narrative",
    questions: [
      {
        key: "Q5",
        label: "Professional Narrative Diagnostic",
        description: {
          undergraduate: "When someone asks \"what do you want to do after graduation,\" how do you feel?",
          early_career: "When someone asks \"what do you do?,\" how confident are you?",
          mid_career: "When someone asks \"what's your story?,\" how do you feel?",
        },
      },
      {
        key: "Q6",
        label: "What's Hardest About Talking About Yourself?",
        description: "Select up to 2.",
      },
      {
        key: "Q7",
        label: "Desired Change",
        description: "What do you hope is different about how you present yourself professionally after completing SLI.pro?",
      },
    ],
  },
  {
    name: "Content",
    questions: [
      {
        key: "Q8",
        label: "Comfort Creating Professional Content",
        description: "How comfortable are you creating and sharing professional content online? (1–5)",
      },
      {
        key: "Q9",
        label: "What Holds You Back?",
        description: "What holds you back from creating content?",
      },
      {
        key: "Q10",
        label: "Preferred Content Format",
        description: "Which content formats do you prefer? Select up to 2.",
      },
    ],
  },
  {
    name: "Networking",
    questions: [
      {
        key: "Q11",
        label: "Current Network State",
        description: "Which best describes the current state of your professional network?",
      },
      {
        key: "Q12",
        label: "Networking Beliefs",
        description: "Which of these best describes your feelings toward networking? Select up to 2.",
      },
    ],
  },
  {
    name: "Aspirations",
    questions: [
      {
        key: "Q13",
        label: "Topic Interests",
        description: "Select up to 3 topics that interest you most.",
      },
      {
        key: "Q14",
        label: "Cross-Cutting Themes",
        description: "Select all themes that resonate with you.",
      },
      {
        key: "Q15",
        label: "Aspiration Question",
        description: {
          undergraduate: "Beyond your next job or internship, what kind of impact do you want to have in your career?",
          early_career: "Where do you want to be professionally in 3–5 years, and what's the gap between there and here?",
          mid_career: "What do you want to be known for in your industry? What's preventing that from being true today?",
        },
      },
    ],
  },
  {
    name: "Self-Knowledge",
    questions: [
      {
        key: "Q16",
        label: "Personality / Strengths Assessments",
        description: "Which of these have you completed? Select all that apply.",
      },
      {
        key: "Q18",
        label: "Anything Else?",
        description: "Is there anything else you want to share before we begin?",
      },
    ],
  },
];

export function resolveQuestionText(
  entry: QuestionEntry,
  platform: string
): { label: string; description: string } {
  const validPlatform =
    platform === "undergraduate" || platform === "early_career" || platform === "mid_career"
      ? (platform as "undergraduate" | "early_career" | "mid_career")
      : "early_career";

  const description =
    typeof entry.description === "string"
      ? entry.description
      : entry.description[validPlatform];

  return { label: entry.label, description };
}
