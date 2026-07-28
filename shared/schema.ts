import { pgTable, text, serial, integer, boolean, timestamp, json, jsonb, pgEnum, unique, check, index, varchar } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

// Enums for user onboarding
export const professionalStatusEnum = pgEnum("professional_status", [
  "undergraduate_or_recent_grad",
  "early_career",
  "mid_career_or_senior",
  "career_break_or_transition",
]);

export const discoverySourceEnum = pgEnum("discovery_source", [
  "university_partnership",
  "colleague_or_mentor",
  "linkedin",
  "web_search",
  "professional_network_or_conference",
  "other",
]);

// Enums for Foundation Sessions
export const sessionStatusEnum = pgEnum("session_status", ["locked", "available", "in_progress", "completed"]);
export const messageRoleEnum = pgEnum("message_role", ["user", "assistant"]);

// Enums for Subscription Tiers
export const subscriptionTierEnum = pgEnum("subscription_tier", ["free", "premium", "subscription"]);
export const subscriptionStatusEnum = pgEnum("subscription_status", ["active", "expired", "canceled"]);
export const paymentStatusEnum = pgEnum("payment_status", ["pending", "succeeded", "failed", "refunded"]);

/**
 * TRANSITIONAL — migration bookkeeping, not part of the Wing specification.
 *
 * During the parallel-run period the app writes to both the legacy MVP tables
 * and the new `wing` schema. This table links a legacy row to the wing row it
 * was mirrored into, so the dual-write is idempotent and Phase 2's scripted
 * migration can tell what has already been carried across.
 *
 * Dropped after cutover, together with the legacy tables.
 */
export const wingMigrationLinks = pgTable("wing_migration_links", {
  id: serial("id").primaryKey(),
  legacyType: text("legacy_type").notNull(), // 'user' | 'foundation_session' | ...
  legacyId: integer("legacy_id").notNull(),
  wingId: integer("wing_id").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (table) => ({
  legacyUnique: unique().on(table.legacyType, table.legacyId),
  lookupIdx: index("wing_migration_links_lookup_idx").on(table.legacyType, table.legacyId),
}));

/**
 * Session store table for connect-pg-simple (express-session).
 *
 * Managed here rather than via the loose create-sessions-table.sql so it ships
 * with the versioned migrations and exists in every environment automatically.
 * Shape must match what connect-pg-simple expects: sid / sess / expire.
 */
export const sessions = pgTable("sessions", {
  sid: varchar("sid").primaryKey(),
  sess: json("sess").notNull(),
  expire: timestamp("expire", { precision: 6 }).notNull(),
}, (table) => ({
  expireIdx: index("IDX_sessions_expire").on(table.expire),
}));

export const users = pgTable("users", {
  id: serial("id").primaryKey(),
  username: text("username").notNull().unique(),
  password: text("password"),
  firstName: text("first_name").notNull(),
  lastName: text("last_name").notNull(),
  phoneNumber: text("phone_number"),
  linkedinId: text("linkedin_id").unique(),
  linkedinAccessToken: text("linkedin_access_token"),
  linkedinRefreshToken: text("linkedin_refresh_token"),
  linkedinTokenExpiry: timestamp("linkedin_token_expiry"),
  headline: text("headline"),
  bio: text("bio"),
  location: text("location"),
  isAdmin: boolean("is_admin").default(false).notNull(),
  isTestUser: boolean("is_test_user").default(false).notNull(),
  lastLoginAt: timestamp("last_login_at"),
  // Stripe and Subscription fields
  subscriptionTier: subscriptionTierEnum("subscription_tier").default("subscription").notNull(),
  subscriptionStatus: subscriptionStatusEnum("subscription_status").default("active"),
  stripeCustomerId: text("stripe_customer_id"),
  stripeSubscriptionId: text("stripe_subscription_id"),
  subscriptionExpiresAt: timestamp("subscription_expires_at"),
  premiumPurchasedAt: timestamp("premium_purchased_at"),
  professionalStatus: professionalStatusEnum("professional_status"),
  discoverySource: discoverySourceEnum("discovery_source"),
  discoverySourceOther: text("discovery_source_other"),
  createdAt: timestamp("created_at").defaultNow(),
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

// Transactions table for payment history
export const transactions = pgTable("transactions", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull().references(() => users.id),
  stripePaymentId: text("stripe_payment_id"),
  stripeSessionId: text("stripe_session_id"),
  amount: integer("amount").notNull(), // Amount in cents
  currency: text("currency").default("usd").notNull(),
  tier: subscriptionTierEnum("tier").notNull(),
  status: paymentStatusEnum("status").default("pending").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

// Base insert schema with all fields optional to support both form registration and OAuth
export const professionalStatusValues = [
  "undergraduate_or_recent_grad",
  "early_career",
  "mid_career_or_senior",
  "career_break_or_transition",
] as const;

export const discoverySourceValues = [
  "university_partnership",
  "colleague_or_mentor",
  "linkedin",
  "web_search",
  "professional_network_or_conference",
  "other",
] as const;

export const insertUserSchema = z.object({
  username: z.string(),
  password: z.string().optional(),
  firstName: z.string(),
  lastName: z.string(),
  phoneNumber: z.string().optional(),
  linkedinId: z.string().optional(),
  isAdmin: z.boolean().optional(),
  professionalStatus: z.enum(professionalStatusValues).optional(),
  discoverySource: z.enum(discoverySourceValues).optional(),
  discoverySourceOther: z.string().optional(),
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

export const insertTransactionSchema = createInsertSchema(transactions).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
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
export type InsertTransaction = z.infer<typeof insertTransactionSchema>;
export type UpdateUser = z.infer<typeof updateUserSchema>;
export type UpdateProfile = z.infer<typeof updateProfileSchema>;

export type User = typeof users.$inferSelect;
export type Experience = typeof experiences.$inferSelect;
export type Education = typeof education.$inferSelect;
export type Skill = typeof skills.$inferSelect;
export type Language = typeof languages.$inferSelect;
export type Profile = typeof profiles.$inferSelect;
export type Transaction = typeof transactions.$inferSelect;

// Documents schema for storing PDF files
export const documents = pgTable("documents", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull().references(() => users.id),
  name: text("name").notNull(),
  type: text("type").notNull(), // document type: "resume", "linkedin", "certificate", etc.
  fileName: text("file_name").notNull(),
  // LEGACY: base64 payload stored inline. Nullable now — new uploads go to
  // Azure Blob and set blobKey instead. Existing rows keep working until the
  // data-migration phase moves them out.
  fileData: text("file_data"),
  // Azure Blob key in the "documents" container.
  blobKey: text("blob_key"),
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
  rawAnswers: jsonb("raw_answers"),
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

// LinkedIn Post Shares tracking
export const linkedinPostShares = pgTable("linkedin_post_shares", {
  id: serial("id").primaryKey(),
  draftId: integer("draft_id").notNull().references(() => linkedinContentDrafts.id, { onDelete: 'cascade' }),
  postNumber: integer("post_number").notNull(), // 1 or 2
  shareCount: integer("share_count").default(0).notNull(),
  lastSharedAt: timestamp("last_shared_at"),
});

export const insertLinkedinPostShareSchema = createInsertSchema(linkedinPostShares).omit({
  id: true,
});

export type InsertLinkedinPostShare = z.infer<typeof insertLinkedinPostShareSchema>;
export type LinkedinPostShare = typeof linkedinPostShares.$inferSelect;

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
  timerElapsed: integer("timer_elapsed").default(0), // Timer elapsed time in seconds
  completionData: jsonb("completion_data").$type<{
    // Session 1 completion criteria
    primaryFunction?: "Finance" | "Operations" | "Sales" | "Marketing" | "Product";
    secondaryFunction?: "Finance" | "Operations" | "Sales" | "Marketing" | "Product";
    functionalSplit?: { primary: number; secondary: number };
    antiGeneralistCommitment?: boolean;
    commitmentStatement?: string;
    functionalLanguageExamples?: string[];
    keyInsights?: string[];
    confidence?: number;
    reasoning?: string;
    // Session 2 completion criteria
    credibilityTier?: 1 | 2 | 3 | 4 | 5;
    proofBullets?: string[];
    brandClaim?: string;
    checkWorthyReason?: string;
    nextSteps?: string[];
    // Session 3 completion criteria
    signatureStory?: {
      title: string;
      context: string;
      challenge: string;
      approach: string;
      tension: string;
      outcome: string;
      repeatability: string;
    };
    contentAngles?: string[];
    methodology?: string;
    // Common fields
    completedAt?: string;
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

// Enhancement Modules schema - independent modules A, B, C
export const enhancementModules = pgTable("enhancement_modules", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull().references(() => users.id, { onDelete: 'cascade' }),
  moduleCode: varchar("module_code", { length: 1 }).notNull(), // 'A', 'B', or 'C'
  status: sessionStatusEnum("status").notNull().default("available"), // No locked state, all available by default
  startedAt: timestamp("started_at", { mode: 'date' }),
  completedAt: timestamp("completed_at", { mode: 'date' }),
  timerElapsed: integer("timer_elapsed").default(0), // Timer elapsed time in seconds
  completionData: jsonb("completion_data").$type<{
    // Module A: Digital Behavior Analysis completion criteria (updated schema)
    brandClaim?: string;
    featuredArticleSeeds?: string[];
    contentStrategy?: {
      naturalFormats: string[];
      phasedPlan: string[];
      barriers: string[];
      behaviorChange: string;
    };
    linkedinOptimization?: {
      headline: string;
      profileScore: number;
      keyImprovements: string[];
    };
    actionPlan?: string[];
    successMetrics?: string[];
    // Legacy Module A fields (backwards compatibility)
    digitalBehaviorInsights?: string[];
    contentStrategyRecommendations?: string[];
    linkedinPresenceScore?: number;
    barriers?: string[];
    // Module B: Network Position Mapping completion criteria
    networkAnalysis?: {
      currentPosition: string;
      strategicGaps: string[];
      influenceMapping: string[];
    };
    relationshipStrategy?: string[];
    positioningPlan?: string[];
    // Module B comprehensive fields (new schema)
    functionalIdentity?: string;
    psychologicalBarriers?: string[];
    digitalPresenceAudit?: string;
    networkAuditSummary?: string;
    positioningGap?: string;
    tier1Targets?: string[];
    tier2Targets?: string[];
    strategicGaps?: string[];
    valueProposition?: string;
    outreachTemplates?: string[];
    profileOptimization?: string[];
    thirtyDayPlan?: string[];
    // Module C: Career Aspiration Alignment comprehensive completion criteria
    backwardsNarrative?: string; // 25-year aspiration narrative
    currentPositioning?: string; // Current credibility + function + core story
    targetRole?: string; // Target role/impact description
    tierClassification?: "Tier 1" | "Tier 2" | "Tier 3"; // Advancement tier (Tier 1: same path, Tier 2: single pivot, Tier 3: Earth-to-Moon)
    experienceGaps?: string[]; // Missing experience competencies
    functionalGaps?: string[]; // Functional ownership gaps
    scaleGaps?: string[]; // Scale/complexity gaps
    industryGaps?: string[]; // Industry domain gaps
    immediateStep?: string; // 6-12 month next role with competency added
    intermediateStep?: string; // 2-3 year role with layered competency
    ultimateGoal?: string; // 5+ year realistic target role
    credibilityExpansion?: string[]; // Content/projects for target domain
    networkRepositioning?: string[]; // Network shift actions
    narrativeReframing?: string[]; // Transferable skills messaging
    skillGapFilling?: string[]; // Specific skills to acquire
    alignmentStatement?: string; // Complete Current → Target → Pathway statement
    timelineReality?: string; // X-year journey with readiness timeframe
    positioningScore?: number; // Alignment score (1-5 based on checklist)
    thirtyDayActions?: string[]; // 30-day immediate actions
    ninetyDayMilestones?: string[]; // 90-day progress markers
    sixMonthMetrics?: string[]; // 6-month success metrics
    // Legacy Module C fields (backwards compatibility)
    aspirationalGoals?: string[];
    currentPositionGaps?: string[];
    alignmentStrategy?: string[];
    longTermRoadmap?: string[];
    // Common fields
    confidence?: number;
    reasoning?: string;
    completedAt?: string;
  }>(),
  createdAt: timestamp("created_at", { mode: 'date' }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { mode: 'date' }).defaultNow().notNull(),
}, (table) => ({
  // Unique constraint to prevent duplicate modules for same user/module
  userModuleUnique: unique().on(table.userId, table.moduleCode),
  // Check constraint to ensure module code is A, B, or C
  moduleCodeCheck: check("module_code_check", sql`${table.moduleCode} IN ('A', 'B', 'C')`),
  // Index for efficient lookups
  userModuleIndex: index("enhancement_modules_user_module_idx").on(table.userId, table.moduleCode),
}));

export const enhancementModuleMessages = pgTable("enhancement_module_messages", {
  id: serial("id").primaryKey(),
  moduleId: integer("module_id").notNull().references(() => enhancementModules.id, { onDelete: 'cascade' }),
  role: messageRoleEnum("role").notNull(),
  content: text("content").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (table) => ({
  // Index for efficient chronological message retrieval
  moduleTimeIndex: index("enhancement_module_messages_module_time_idx").on(table.moduleId, table.createdAt),
}));

export const insertEnhancementModuleSchema = createInsertSchema(enhancementModules, {
  moduleCode: z.enum(["A", "B", "C"]),
  status: z.enum(["available", "in_progress", "completed"]).optional(),
}).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export const insertEnhancementModuleMessageSchema = createInsertSchema(enhancementModuleMessages, {
  role: z.enum(["user", "assistant"]),
}).omit({
  id: true,
  createdAt: true,
});

export const updateEnhancementModuleSchema = insertEnhancementModuleSchema.omit({
  userId: true,
  moduleCode: true,
}).partial();

export type InsertEnhancementModule = z.infer<typeof insertEnhancementModuleSchema>;
export type InsertEnhancementModuleMessage = z.infer<typeof insertEnhancementModuleMessageSchema>;
export type UpdateEnhancementModule = z.infer<typeof updateEnhancementModuleSchema>;
export type EnhancementModule = typeof enhancementModules.$inferSelect;
export type EnhancementModuleMessage = typeof enhancementModuleMessages.$inferSelect;

// Branding Intake
export const brandingIntakePlatformEnum = pgEnum("branding_intake_platform", [
  "undergraduate",
  "early_career",
  "mid_career",
]);

export const brandingIntakes = pgTable("branding_intakes", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull().references(() => users.id).unique(),
  platform: brandingIntakePlatformEnum("platform").notNull(),
  currentStage: integer("current_stage").default(1).notNull(),
  responses: jsonb("responses").default({}).notNull(),
  completed: boolean("completed").default(false).notNull(),
  marketingOptIn: boolean("marketing_opt_in").default(false),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const insertBrandingIntakeSchema = createInsertSchema(brandingIntakes).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export type InsertBrandingIntake = z.infer<typeof insertBrandingIntakeSchema>;
export type BrandingIntake = typeof brandingIntakes.$inferSelect;

export type UserProfile = User & {
  experiences?: Experience[];
  education?: Education[];
  skills?: Skill[];
  languages?: Language[];
  profile?: Profile;
  questionnaire?: Questionnaire;
  brandingIntake?: BrandingIntake;
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
