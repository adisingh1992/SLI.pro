export interface PriorSessionContext {
  sessionNumber: number;
  completionData: any;
  conversationTranscript: string;
}

export interface SessionPromptContext {
  sessionNumber: number;
  resumeSummary?: string;
  priorSessions?: PriorSessionContext[];
}

export interface MessageItem {
  role: string;
  content: string;
}

export interface PromptSet {
  getSystemPrompt(ctx: SessionPromptContext): string;
  getAnalysisPrompt(
    sessionNumber: number,
    messages: MessageItem[],
    questionnaireContext: string,
    previousSessionsContext: string,
  ): string;
  getInitialGuidanceMessage(sessionNumber: number): string | null;
}
