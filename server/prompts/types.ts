export interface PriorSessionContext {
  sessionNumber: number;
  completionData: any;
  conversationTranscript: string;
}

export interface SessionPromptContext {
  sessionNumber: number;
  resumeSummary?: string;
  priorSessions?: PriorSessionContext[];
  /**
   * Completion criteria, rendered from the database.
   *
   * The conversation prompt and the analysis prompt must state the SAME
   * criteria. When they were written separately they drifted, and a session
   * could satisfy everything it was told to do while the analysis judged it
   * incomplete. Both now receive this, rendered from one row.
   *
   * Undefined means nothing is published for this population/session, and the
   * prompt file's own hardcoded list is used — so adoption can be gradual.
   */
  completionCriteria?: string;
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
    /** Same criteria the conversation was given. Undefined uses the built-in list. */
    completionCriteria?: string,
  ): string;
  getInitialGuidanceMessage(sessionNumber: number): string | null;
}
