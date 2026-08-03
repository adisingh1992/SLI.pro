export interface ModulePromptContext {
  /**
   * Completion criteria rendered from session_completion_criteria.
   *
   * The same row the analysis reads, so the module cannot be told to achieve
   * one thing and judged against another. Undefined means nothing is published
   * for this population/module and the prompt file's own list is used.
   */
  completionCriteria?: string;
  resumeSummary: string;
  questionnaireSummary: string;
  foundationSessionsSummary: string;
  sliSummary: string;
  conversationSummaryContext: string;
  brandingIntakeContext: string;
  homeworkContext: string;
  linkedinOptimizationContext: string;
  previousSummaries: string;
  userProfile: any;
}

export interface ModulePromptSet {
  getSystemPrompt(moduleCode: string, ctx: ModulePromptContext): string;
  getAnalysisPrompt(
    moduleCode: string,
    messages: any[],
    questionnaireContext: string,
    foundationSessionsContext: string,
    previousModulesContext: string,
    /** Same criteria the conversation was given. Undefined uses the built-in list. */
    completionCriteria?: string,
  ): string;
  getInitialGuidanceMessage(moduleCode: string): string | null;
}
