import { midCareerSeniorPrompts } from "./mid-career-senior";
import { earlyCareerPrompts } from "./early-career";
import { undergraduateRecentGradPrompts } from "./undergraduate-recent-grad";
import type { PromptSet } from "./types";

export type { PromptSet, SessionPromptContext, PriorSessionContext, MessageItem } from "./types";

export function getPromptSet(professionalStatus: string | null | undefined): PromptSet {
  switch (professionalStatus) {
    case "undergraduate_or_recent_grad":
      return undergraduateRecentGradPrompts;
    case "early_career":
      return earlyCareerPrompts;
    case "mid_career_or_senior":
    case "career_break_or_transition":
    default:
      return midCareerSeniorPrompts;
  }
}
