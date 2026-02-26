import { midCareerSeniorPrompts } from "./mid-career-senior";
import { earlyCareerPrompts } from "./early-career";
import { undergraduateRecentGradPrompts } from "./undergraduate-recent-grad";
import type { ModulePromptSet } from "./types";

export type { ModulePromptSet, ModulePromptContext } from "./types";

export function getModulePromptSet(
  professionalStatus: string | null | undefined,
): ModulePromptSet {
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
