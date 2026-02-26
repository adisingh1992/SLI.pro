export interface ModulePromptContext {
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
  ): string;
  getInitialGuidanceMessage(moduleCode: string): string | null;
}
