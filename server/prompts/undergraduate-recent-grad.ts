// TODO: This file contains placeholder prompts for users with professional_status = "undergraduate_or_recent_grad".
// Real prompts tailored to undergraduates and recent graduates will be provided and should replace these fallbacks.
// Currently all methods delegate to the mid-career/senior prompt set as a silent fallback.

import { PromptSet, SessionPromptContext, MessageItem } from "./types";
import { midCareerSeniorPrompts } from "./mid-career-senior";

function getSystemPrompt(ctx: SessionPromptContext): string {
  // TODO: Replace with undergraduate/recent-grad specific system prompt for session ctx.sessionNumber
  return midCareerSeniorPrompts.getSystemPrompt(ctx);
}

function getAnalysisPrompt(
  sessionNumber: number,
  messages: MessageItem[],
  questionnaireContext: string,
  previousSessionsContext: string,
): string {
  // TODO: Replace with undergraduate/recent-grad specific analysis prompt for the given sessionNumber
  return midCareerSeniorPrompts.getAnalysisPrompt(
    sessionNumber,
    messages,
    questionnaireContext,
    previousSessionsContext,
  );
}

function getInitialGuidanceMessage(sessionNumber: number): string | null {
  // TODO: Replace with undergraduate/recent-grad specific opening message for the given sessionNumber
  return midCareerSeniorPrompts.getInitialGuidanceMessage(sessionNumber);
}

export const undergraduateRecentGradPrompts: PromptSet = {
  getSystemPrompt,
  getAnalysisPrompt,
  getInitialGuidanceMessage,
};
