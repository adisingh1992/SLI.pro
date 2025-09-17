import { pgTable, text, serial, integer, boolean, timestamp, jsonb, pgEnum, unique, check, index } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

// Enums for Foundation Sessions
export const sessionStatusEnum = pgEnum("session_status", ["locked", "available", "in_progress", "completed"]);
export const messageRoleEnum = pgEnum("message_role", ["user", "assistant"]);

export const users = pgTable("users", {
  id: serial("id").primaryKey(),
  username: text("username").notNull().unique(),
  password: text("password").notNull(),
  firstName: text("first_name").notNull(),
  lastName: text("last_name").notNull(),
  phoneNumber: text("phone_number").notNull(),
  headline: text("headline"),
  bio: text("bio"),
  location: text("location"),
  isAdmin: boolean("is_admin").default(false).notNull(),
  lastLoginAt: timestamp("last_login_at"),
});

export const experiences = pgTable("experiences", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull().references(() => users.id),
  title: text("title").notNull(),
  company: text("company").notNull(),
  startDate: text("start_date").notNull(),
  endDate: text("end_date"),
  description: text("description"),
  current: boolean("current").default(false),
});

export const education = pgTable("education", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull().references(() => users.id),
  degree: text("degree").notNull(),
  institution: text("institution").notNull(),
  startYear: text("start_year").notNull(),
  endYear: text("end_year"),
  description: text("description"),
});

export const skills = pgTable("skills", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull().references(() => users.id),
  name: text("name").notNull(),
});

export const languages = pgTable("languages", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull().references(() => users.id),
  name: text("name").notNull(),
  proficiency: text("proficiency").notNull(),
});

export const profiles = pgTable("profiles", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull().references(() => users.id).unique(),
  completionStep: integer("completion_step").default(0),
  isComplete: boolean("is_complete").default(false),
});

// Insert schemas
export const insertUserSchema = createInsertSchema(users).pick({
  username: true,
  password: true,
  firstName: true,
  lastName: true,
  phoneNumber: true,
  isAdmin: true,
});

export const insertExperienceSchema = createInsertSchema(experiences).omit({
  id: true,
});

export const insertEducationSchema = createInsertSchema(education).omit({
  id: true,
});

export const insertSkillSchema = createInsertSchema(skills).omit({
  id: true,
});

export const insertLanguageSchema = createInsertSchema(languages).omit({
  id: true,
});

export const insertProfileSchema = createInsertSchema(profiles).omit({
  id: true,
});

export const updateUserSchema = createInsertSchema(users).omit({
  id: true,
  password: true,
}).partial();

export const updateProfileSchema = z.object({
  headline: z.string().optional(),
  bio: z.string().optional(),
  location: z.string().optional(),
  completionStep: z.number().optional(),
  isComplete: z.boolean().optional(),
});

// Types
export type InsertUser = z.infer<typeof insertUserSchema>;
export type InsertExperience = z.infer<typeof insertExperienceSchema>;
export type InsertEducation = z.infer<typeof insertEducationSchema>;
export type InsertSkill = z.infer<typeof insertSkillSchema>;
export type InsertLanguage = z.infer<typeof insertLanguageSchema>;
export type InsertProfile = z.infer<typeof insertProfileSchema>;
export type UpdateUser = z.infer<typeof updateUserSchema>;
export type UpdateProfile = z.infer<typeof updateProfileSchema>;

export type User = typeof users.$inferSelect;
export type Experience = typeof experiences.$inferSelect;
export type Education = typeof education.$inferSelect;
export type Skill = typeof skills.$inferSelect;
export type Language = typeof languages.$inferSelect;
export type Profile = typeof profiles.$inferSelect;

// Documents schema for storing PDF files
export const documents = pgTable("documents", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull().references(() => users.id),
  name: text("name").notNull(),
  type: text("type").notNull(), // document type: "resume", "linkedin", "certificate", etc.
  fileName: text("file_name").notNull(),
  fileData: text("file_data").notNull(), // Base64 encoded PDF data
  uploadedAt: timestamp("uploaded_at").defaultNow().notNull(),
  analysisContent: text("analysis_content"), // AI-generated analysis of document content
});

export const insertDocumentSchema = createInsertSchema(documents).omit({
  id: true,
  uploadedAt: true,
});

// Password reset tokens
export const passwordResets = pgTable("password_resets", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull().references(() => users.id),
  token: text("token").notNull().unique(),
  expiresAt: timestamp("expires_at").notNull(),
  used: boolean("used").default(false).notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

// Extended user schema with profile data
export const questionnaires = pgTable("questionnaires", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull().references(() => users.id),
  industry: text("industry"),
  background: text("background"),
  goals: text("goals"),
  aspirations: text("aspirations"),
  challenges: text("challenges"),
  interests: text("interests"),
  timeframe: text("timeframe"),
  isDraft: boolean("is_draft").default(false),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const insertQuestionnaireSchema = createInsertSchema(questionnaires).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export const insertPasswordResetSchema = createInsertSchema(passwordResets).omit({
  id: true,
  createdAt: true,
});

export type InsertQuestionnaire = z.infer<typeof insertQuestionnaireSchema>;
export type Questionnaire = typeof questionnaires.$inferSelect;
export type PasswordReset = typeof passwordResets.$inferSelect;
export type InsertPasswordReset = z.infer<typeof insertPasswordResetSchema>;

export type InsertDocument = z.infer<typeof insertDocumentSchema>;
export type Document = typeof documents.$inferSelect;





// Chat and conversation schemas
export const conversations = pgTable("conversations", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull().references(() => users.id),
  title: text("title").notNull().default("New Conversation"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const messages = pgTable("messages", {
  id: serial("id").primaryKey(),
  conversationId: integer("conversation_id").notNull().references(() => conversations.id),
  role: text("role").notNull(), // "user" or "assistant"
  content: text("content").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const insertConversationSchema = createInsertSchema(conversations).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export const insertMessageSchema = createInsertSchema(messages).omit({
  id: true,
  createdAt: true,
});

export type InsertConversation = z.infer<typeof insertConversationSchema>;
export type InsertMessage = z.infer<typeof insertMessageSchema>;
export type Conversation = typeof conversations.$inferSelect;
export type Message = typeof messages.$inferSelect;

export const conversationSummaries = pgTable("conversation_summaries", {
  id: serial("id").primaryKey(),
  conversationId: integer("conversation_id").notNull().references(() => conversations.id, { onDelete: 'cascade' }),
  userId: integer("user_id").notNull().references(() => users.id, { onDelete: 'cascade' }),
  basicInfo: jsonb("basic_info").$type<{
    name?: string;
    currentRole?: string;
    industry?: string;
    yearsOfExperience?: string;
    targetTimeline?: string;
  }>().notNull(),
  functionalCategorization: jsonb("functional_categorization").$type<{
    primaryFunction?: string;
    secondaryFunction?: string;
    levelOfCertainty?: number;
    keyStrengths?: string[];
  }>().notNull(),
  careerTransition: jsonb("career_transition").$type<{
    currentState?: string;
    desiredState?: string;
    transitionType?: string;
    complexityRating?: number;
    primaryMotivation?: string;
  }>().notNull(),
  strengthsAndPositioning: jsonb("strengths_and_positioning").$type<{
    keyStrengths?: string[];
    areasForDevelopment?: string[];
    valueProposition?: string;
    achievementExamples?: string[];
    comfortWithSelfPromotion?: number;
  }>().notNull(),
  digitalPresence: jsonb("digital_presence").$type<{
    linkedInActivity?: string;
    contentCreationExperience?: string;
    barriers?: string;
    networkingApproach?: string;
    postingFrequency?: string;
  }>().notNull(),
  psychologyAndMotivation: jsonb("psychology_and_motivation").$type<{
    enneagramType?: string;
    assessmentResults?: string;
    topPriorities?: string[];
    aspirationalThemes?: string[];
    notableQuotes?: string[];
    motivationalDrivers?: string[];
  }>().notNull(),
  contentStrategy: jsonb("content_strategy").$type<{
    confidentTopics?: string[];
    preferredFormats?: string[];
    creationBarriers?: string;
    suggestedInitialTopic?: string;
  }>().notNull(),
  recommendations: jsonb("recommendations").$type<{
    sliDirections?: string[];
    iceBucketMoments?: string[];
    contentStrategyDirections?: string[];
    specialConsiderations?: string;
  }>().notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const insertConversationSummarySchema = createInsertSchema(conversationSummaries);

export type InsertConversationSummary = z.infer<typeof insertConversationSummarySchema>;
export type ConversationSummary = typeof conversationSummaries.$inferSelect;

// Monthly check-in form
export const monthlyCheckIns = pgTable("monthly_check_ins", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull().references(() => users.id),
  month: text("month").notNull(), // Format: YYYY-MM
  contentPosts: integer("content_posts").notNull(), // Number of posts published
  contentLinks: jsonb("content_links").$type<string[]>().default([]),
  contentScreenshots: jsonb("content_screenshots").$type<{name: string, data: string}[]>().default([]),
  engagementFrequency: text("engagement_frequency").notNull(), // "daily", "3-5/week", "1-2/week", "less-than-1/week", "none"
  engagementScreenshot: text("engagement_screenshot"), // Base64 encoded image
  updatedProfileVisuals: boolean("updated_profile_visuals").default(false),
  profileScreenshot: text("profile_screenshot"), // Base64 encoded image
  newConnections: integer("new_connections").notNull(),
  targetConnectionPercentage: text("target_connection_percentage").notNull(), // "0-25%", "26-50%", "51-75%", "76-100%"
  recommendationImplementation: text("recommendation_implementation").notNull(), // "fully", "mostly", "partially", "minimally", "not-yet"
  implementationChallenges: text("implementation_challenges"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const insertMonthlyCheckInSchema = createInsertSchema(monthlyCheckIns).omit({
  id: true,
  createdAt: true,
});

export type InsertMonthlyCheckIn = z.infer<typeof insertMonthlyCheckInSchema>;
export type MonthlyCheckIn = typeof monthlyCheckIns.$inferSelect;

// Freshness Report
export const freshnessReports = pgTable("freshness_reports", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull().references(() => users.id),
  questionnaireAnalysis: jsonb("questionnaire_analysis").$type<Record<string, any>>(),
  resumeAnalysis: jsonb("resume_analysis").$type<Record<string, any>>(),
  linkedinAnalysis: jsonb("linkedin_analysis").$type<Record<string, any>>(),
  additionalDocumentsAnalysis: jsonb("additional_documents_analysis").$type<Record<string, any>[]>().default([]),
  finalSynthesis: jsonb("final_synthesis").$type<Record<string, any>>(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const insertFreshnessReportSchema = createInsertSchema(freshnessReports).omit({
  id: true,
  createdAt: true,
});

export type InsertFreshnessReport = z.infer<typeof insertFreshnessReportSchema>;
export type FreshnessReport = typeof freshnessReports.$inferSelect;

// LinkedIn Content Drafts schema
export const linkedinContentDrafts = pgTable("linkedin_content_drafts", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull().references(() => users.id, { onDelete: 'cascade' }),
  post1Type: text("post1_type").notNull(), // Type of first post (experiential, news, trend, resource)
  post1Content: jsonb("post1_content").$type<{
    hook: string;
    body: string;
    closing: string;
    hashtags: string;
  }>().notNull(),
  post2Type: text("post2_type").notNull(), // Type of second post
  post2Content: jsonb("post2_content").$type<{
    hook: string;
    body: string;
    closing: string;
    hashtags: string;
  }>().notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const insertLinkedinContentDraftSchema = createInsertSchema(linkedinContentDrafts).omit({
  id: true,
  createdAt: true,
});

export type InsertLinkedinContentDraft = z.infer<typeof insertLinkedinContentDraftSchema>;
export type LinkedinContentDraft = typeof linkedinContentDrafts.$inferSelect;

// Coaching Notes schema
export const coachingNotes = pgTable("coaching_notes", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull().references(() => users.id),
  adminId: integer("admin_id").notNull().references(() => users.id), // The admin who wrote the note
  content: text("content").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const insertCoachingNoteSchema = createInsertSchema(coachingNotes).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export type InsertCoachingNote = z.infer<typeof insertCoachingNoteSchema>;
export type CoachingNote = typeof coachingNotes.$inferSelect;

// SLIs (Single Lasting Impressions) schema
export const slis = pgTable("slis", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull().references(() => users.id, { onDelete: 'cascade' }),
  adminId: integer("admin_id").notNull().references(() => users.id), // The admin who generated the SLIs
  title1: text("title1").notNull(),
  statement1: text("statement1").notNull(),
  rationale1: text("rationale1").notNull(),
  title2: text("title2").notNull(),
  statement2: text("statement2").notNull(),
  rationale2: text("rationale2").notNull(),
  title3: text("title3").notNull(),
  statement3: text("statement3").notNull(),
  rationale3: text("rationale3").notNull(),
  selectedSliIndex: integer("selected_sli_index"), // 1, 2, or 3, null if not selected yet or if custom SLI
  customSliText: text("custom_sli_text"), // Custom SLI text if user chooses to write their own
  
  // SLI Refinement fields
  refinedSliText: text("refined_sli_text"), // The refined SLI created by Claude
  refinementRationale: text("refinement_rationale"), // Explanation of the refinement
  implementationGuidance: text("implementation_guidance"), // Guidance on implementing the refined SLI
  refinedAt: timestamp("refined_at"), // When the SLI was refined
  refinementCount: integer("refinement_count").default(0), // Track number of times SLI has been refined (max 3)
  
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const insertSliSchema = createInsertSchema(slis).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export const updateSliSchema = createInsertSchema(slis).omit({
  id: true,
  userId: true,
  adminId: true,
  createdAt: true,
  updatedAt: true,
}).partial();

export type InsertSli = z.infer<typeof insertSliSchema>;
export type UpdateSli = z.infer<typeof updateSliSchema>;
export type Sli = typeof slis.$inferSelect;

// LinkedIn Optimization schema
export const linkedinOptimizations = pgTable("linkedin_optimizations", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull().references(() => users.id, { onDelete: 'cascade' }),
  alignmentAssessment: text("alignment_assessment"), // Claude's evaluation of profile alignment with SLI
  headlineOptimization: jsonb("headline_optimization").$type<{
    currentHeadline?: string;
    recommendedHeadline?: string;
    rationale?: string;
  }>(),
  aboutSection: jsonb("about_section").$type<{
    currentAnalysis?: string;
    recommendations?: string;
    suggestedStructure?: string;
    keyElements?: string;
    draftContent?: string;
  }>(),
  profileEnhancements: jsonb("profile_enhancements").$type<{
    experienceSection?: string;
    skillsEndorsements?: string;
    activityEngagement?: string;
    visualImprovements?: string;
  }>(),
  contentStrategy: jsonb("content_strategy").$type<{
    themes?: string;
    postIdeas?: string;
    engagementTips?: string;
  }>(),
  implementationPriorities: text("implementation_priorities"), // Prioritized roadmap for changes
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const insertLinkedinOptimizationSchema = createInsertSchema(linkedinOptimizations).omit({
  id: true,
  createdAt: true,
});

export type InsertLinkedinOptimization = z.infer<typeof insertLinkedinOptimizationSchema>;
export type LinkedinOptimization = typeof linkedinOptimizations.$inferSelect;

// Homework Assignments schema
export const homeworkAssignments = pgTable("homework_assignments", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull().references(() => users.id, { onDelete: 'cascade' }),
  adminId: integer("admin_id").notNull().references(() => users.id), // The admin who assigned the homework
  questionText: text("question_text").notNull(),
  answerText: text("answer_text"), // User's answer (initially null)
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const insertHomeworkAssignmentSchema = createInsertSchema(homeworkAssignments).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export const updateHomeworkAssignmentSchema = createInsertSchema(homeworkAssignments).omit({
  id: true,
  userId: true,
  adminId: true,
  questionText: true,
  createdAt: true,
  updatedAt: true,
}).partial();

export type InsertHomeworkAssignment = z.infer<typeof insertHomeworkAssignmentSchema>;
export type UpdateHomeworkAssignment = z.infer<typeof updateHomeworkAssignmentSchema>;
export type HomeworkAssignment = typeof homeworkAssignments.$inferSelect;

// Foundation Sessions schema
export const foundationSessions = pgTable("foundation_sessions", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull().references(() => users.id, { onDelete: 'cascade' }),
  sessionNumber: integer("session_number").notNull(),
  status: sessionStatusEnum("status").notNull().default("locked"),
  startedAt: timestamp("started_at", { mode: 'date' }),
  completedAt: timestamp("completed_at", { mode: 'date' }),
  completionData: jsonb("completion_data").$type<{
    // Session 1 completion criteria
    primaryFunction?: "Finance" | "Operations" | "Sales" | "Marketing" | "Product";
    secondaryFunction?: "Finance" | "Operations" | "Sales" | "Marketing" | "Product";
    functionalSplit?: { primary: number; secondary: number };
    antiGeneralistCommitment?: boolean;
    commitmentStatement?: string;
    functionalLanguageExamples?: string[];
    // Future sessions will have their own completion criteria
  }>(),
  createdAt: timestamp("created_at", { mode: 'date' }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { mode: 'date' }).defaultNow().notNull(),
}, (table) => ({
  // Unique constraint to prevent duplicate sessions for same user/session
  userSessionUnique: unique().on(table.userId, table.sessionNumber),
  // Check constraint to ensure session number is 1, 2, or 3
  sessionNumberCheck: check("session_number_check", sql`${table.sessionNumber} >= 1 AND ${table.sessionNumber} <= 3`),
  // Index for efficient lookups
  userSessionIndex: index("foundation_sessions_user_session_idx").on(table.userId, table.sessionNumber),
}));

export const foundationSessionMessages = pgTable("foundation_session_messages", {
  id: serial("id").primaryKey(),
  sessionId: integer("session_id").notNull().references(() => foundationSessions.id, { onDelete: 'cascade' }),
  role: messageRoleEnum("role").notNull(),
  content: text("content").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (table) => ({
  // Index for efficient chronological message retrieval
  sessionTimeIndex: index("foundation_session_messages_session_time_idx").on(table.sessionId, table.createdAt),
}));

export const insertFoundationSessionSchema = createInsertSchema(foundationSessions).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
}).extend({
  sessionNumber: z.number().int().min(1).max(3),
  status: z.enum(["locked", "available", "in_progress", "completed"]).optional(),
});

export const insertFoundationSessionMessageSchema = createInsertSchema(foundationSessionMessages).omit({
  id: true,
  createdAt: true,
}).extend({
  role: z.enum(["user", "assistant"]),
});

export const updateFoundationSessionSchema = createInsertSchema(foundationSessions).omit({
  id: true,
  userId: true,
  sessionNumber: true,
  createdAt: true,
  updatedAt: true,
}).extend({
  status: z.enum(["locked", "available", "in_progress", "completed"]).optional(),
}).partial();

export type InsertFoundationSession = z.infer<typeof insertFoundationSessionSchema>;
export type InsertFoundationSessionMessage = z.infer<typeof insertFoundationSessionMessageSchema>;
export type UpdateFoundationSession = z.infer<typeof updateFoundationSessionSchema>;
export type FoundationSession = typeof foundationSessions.$inferSelect;
export type FoundationSessionMessage = typeof foundationSessionMessages.$inferSelect;

export type UserProfile = User & {
  experiences?: Experience[];
  education?: Education[];
  skills?: Skill[];
  languages?: Language[];
  profile?: Profile;
  questionnaire?: Questionnaire;
  documents?: Document[];
  conversations?: Conversation[];
  conversationSummaries?: ConversationSummary[];
  monthlyCheckIns?: MonthlyCheckIn[];
  freshnessReports?: FreshnessReport[];
  coachingNotes?: CoachingNote[];
  slis?: Sli[];
  linkedinOptimizations?: LinkedinOptimization[];
  homeworkAssignments?: HomeworkAssignment[];
  foundationSessions?: FoundationSession[];
};
