import { 
  users, type User, type InsertUser, 
  experiences, type Experience, type InsertExperience,
  education, type Education, type InsertEducation,
  skills, type Skill, type InsertSkill,
  languages, type Language, type InsertLanguage,
  profiles, type Profile, type InsertProfile,
  questionnaires, type Questionnaire, type InsertQuestionnaire,
  documents, type Document, type InsertDocument,
  passwordResets, type PasswordReset, type InsertPasswordReset,
  conversations, type Conversation, type InsertConversation,
  messages, type Message, type InsertMessage,
  conversationSummaries, type ConversationSummary, type InsertConversationSummary,
  monthlyCheckIns, type MonthlyCheckIn, type InsertMonthlyCheckIn,
  freshnessReports, type FreshnessReport, type InsertFreshnessReport,
  coachingNotes, type CoachingNote, type InsertCoachingNote,
  slis, type Sli, type InsertSli, type UpdateSli,
  linkedinOptimizations, type LinkedinOptimization, type InsertLinkedinOptimization,
  linkedinContentDrafts, type LinkedinContentDraft, type InsertLinkedinContentDraft,
  homeworkAssignments, type HomeworkAssignment, type InsertHomeworkAssignment, type UpdateHomeworkAssignment,
  foundationSessions, type FoundationSession, type InsertFoundationSession, type UpdateFoundationSession,
  foundationSessionMessages, type FoundationSessionMessage, type InsertFoundationSessionMessage,
  type UpdateUser, type UpdateProfile, type UserProfile
} from "@shared/schema";
import session from "express-session";
import { pool } from "./db";
import { db } from "./db";
import { IStorage } from "./storage";
import { eq, desc, asc, and } from "drizzle-orm";
import PgSession from "connect-pg-simple";

export class DatabaseStorage implements IStorage {
  sessionStore: session.Store;

  constructor() {
    // Create PostgreSQL-backed session store
    const PgStore = PgSession(session);
    this.sessionStore = new PgStore({
      pool: pool,
      tableName: "sessions"
    });
  }

  // User methods
  async getUser(id: number): Promise<User | undefined> {
    const [user] = await db.select().from(users).where(eq(users.id, id));
    return user || undefined;
  }

  async getUserByUsername(username: string): Promise<User | undefined> {
    const [user] = await db.select().from(users).where(eq(users.username, username));
    return user || undefined;
  }

  async createUser(userData: InsertUser): Promise<User> {
    const [user] = await db.insert(users).values(userData).returning();
    return user;
  }
  
  async updateUser(id: number, data: UpdateUser): Promise<User | undefined> {
    const [updatedUser] = await db
      .update(users)
      .set(data)
      .where(eq(users.id, id))
      .returning();
    return updatedUser || undefined;
  }

  async updateUserPassword(id: number, password: string): Promise<User | undefined> {
    const [updatedUser] = await db
      .update(users)
      .set({ password })
      .where(eq(users.id, id))
      .returning();
    return updatedUser || undefined;
  }

  async getNonAdminUsers(): Promise<User[]> {
    return db.select().from(users).where(eq(users.isAdmin, false));
  }

  // Experience methods
  async getExperiences(userId: number): Promise<Experience[]> {
    return db.select().from(experiences).where(eq(experiences.userId, userId));
  }
  
  async getExperience(id: number): Promise<Experience | undefined> {
    const [experience] = await db.select().from(experiences).where(eq(experiences.id, id));
    return experience || undefined;
  }
  
  async createExperience(experience: InsertExperience): Promise<Experience> {
    const [newExperience] = await db.insert(experiences).values(experience).returning();
    return newExperience;
  }
  
  async updateExperience(id: number, experience: Partial<InsertExperience>): Promise<Experience | undefined> {
    const [updatedExperience] = await db
      .update(experiences)
      .set(experience)
      .where(eq(experiences.id, id))
      .returning();
    return updatedExperience || undefined;
  }
  
  async deleteExperience(id: number): Promise<void> {
    await db.delete(experiences).where(eq(experiences.id, id));
  }

  // Education methods
  async getEducations(userId: number): Promise<Education[]> {
    return db.select().from(education).where(eq(education.userId, userId));
  }
  
  async getEducation(id: number): Promise<Education | undefined> {
    const [edu] = await db.select().from(education).where(eq(education.id, id));
    return edu || undefined;
  }
  
  async createEducation(educ: InsertEducation): Promise<Education> {
    const [newEducation] = await db.insert(education).values(educ).returning();
    return newEducation;
  }
  
  async updateEducation(id: number, educ: Partial<InsertEducation>): Promise<Education | undefined> {
    const [updatedEducation] = await db
      .update(education)
      .set(educ)
      .where(eq(education.id, id))
      .returning();
    return updatedEducation || undefined;
  }
  
  async deleteEducation(id: number): Promise<void> {
    await db.delete(education).where(eq(education.id, id));
  }

  // Skill methods
  async getSkills(userId: number): Promise<Skill[]> {
    return db.select().from(skills).where(eq(skills.userId, userId));
  }
  
  async getSkill(id: number): Promise<Skill | undefined> {
    const [skill] = await db.select().from(skills).where(eq(skills.id, id));
    return skill || undefined;
  }
  
  async createSkill(skill: InsertSkill): Promise<Skill> {
    const [newSkill] = await db.insert(skills).values(skill).returning();
    return newSkill;
  }
  
  async deleteSkill(id: number): Promise<void> {
    await db.delete(skills).where(eq(skills.id, id));
  }

  // Language methods
  async getLanguages(userId: number): Promise<Language[]> {
    return db.select().from(languages).where(eq(languages.userId, userId));
  }
  
  async getLanguage(id: number): Promise<Language | undefined> {
    const [language] = await db.select().from(languages).where(eq(languages.id, id));
    return language || undefined;
  }
  
  async createLanguage(language: InsertLanguage): Promise<Language> {
    const [newLanguage] = await db.insert(languages).values(language).returning();
    return newLanguage;
  }
  
  async deleteLanguage(id: number): Promise<void> {
    await db.delete(languages).where(eq(languages.id, id));
  }

  // Profile methods
  async getProfile(userId: number): Promise<Profile | undefined> {
    const [profile] = await db.select().from(profiles).where(eq(profiles.userId, userId));
    return profile || undefined;
  }
  
  async createProfile(profile: InsertProfile): Promise<Profile> {
    const [newProfile] = await db.insert(profiles).values(profile).returning();
    return newProfile;
  }
  
  async updateProfile(userId: number, profileData: UpdateProfile): Promise<Profile | undefined> {
    const [profile] = await db.select().from(profiles).where(eq(profiles.userId, userId));
    if (!profile) return undefined;
    
    const [updatedProfile] = await db
      .update(profiles)
      .set(profileData)
      .where(eq(profiles.id, profile.id))
      .returning();
    return updatedProfile;
  }

  // Questionnaire methods
  async getQuestionnaire(userId: number): Promise<Questionnaire | undefined> {
    const [questionnaire] = await db
      .select()
      .from(questionnaires)
      .where(eq(questionnaires.userId, userId));
    return questionnaire || undefined;
  }
  
  async createQuestionnaire(questionnaireData: InsertQuestionnaire): Promise<Questionnaire> {
    const now = new Date();
    const [newQuestionnaire] = await db
      .insert(questionnaires)
      .values({
        ...questionnaireData,
        createdAt: now,
        updatedAt: now
      })
      .returning();
    return newQuestionnaire;
  }
  
  async updateQuestionnaire(userId: number, questionnaireData: Partial<InsertQuestionnaire>): Promise<Questionnaire | undefined> {
    const [questionnaire] = await db
      .select()
      .from(questionnaires)
      .where(eq(questionnaires.userId, userId));
    if (!questionnaire) return undefined;
    
    const [updatedQuestionnaire] = await db
      .update(questionnaires)
      .set({
        ...questionnaireData,
        updatedAt: new Date()
      })
      .where(eq(questionnaires.id, questionnaire.id))
      .returning();
    return updatedQuestionnaire;
  }

  // Document methods
  async getDocuments(userId: number): Promise<Document[]> {
    return db.select().from(documents).where(eq(documents.userId, userId));
  }
  
  async getDocument(id: number): Promise<Document | undefined> {
    const [document] = await db.select().from(documents).where(eq(documents.id, id));
    return document || undefined;
  }
  
  async createDocument(documentData: InsertDocument): Promise<Document> {
    const now = new Date();
    const [newDocument] = await db
      .insert(documents)
      .values({
        ...documentData,
        uploadedAt: now
      })
      .returning();
    return newDocument;
  }
  
  async updateDocument(id: number, data: Partial<Document>): Promise<Document | undefined> {
    const [updatedDocument] = await db
      .update(documents)
      .set(data)
      .where(eq(documents.id, id))
      .returning();
    return updatedDocument || undefined;
  }
  
  async deleteDocument(id: number): Promise<void> {
    await db.delete(documents).where(eq(documents.id, id));
  }

  // LinkedIn Optimization methods
  async getLinkedinOptimizations(userId: number): Promise<LinkedinOptimization[]> {
    return db.select().from(linkedinOptimizations).where(eq(linkedinOptimizations.userId, userId))
      .orderBy(desc(linkedinOptimizations.createdAt));
  }
  
  async getLinkedinOptimization(id: number): Promise<LinkedinOptimization | undefined> {
    const [optimization] = await db.select().from(linkedinOptimizations).where(eq(linkedinOptimizations.id, id));
    return optimization || undefined;
  }
  
  async getLatestLinkedinOptimization(userId: number): Promise<LinkedinOptimization | undefined> {
    const [optimization] = await db.select().from(linkedinOptimizations)
      .where(eq(linkedinOptimizations.userId, userId))
      .orderBy(desc(linkedinOptimizations.createdAt))
      .limit(1);
    return optimization || undefined;
  }
  
  async createLinkedinOptimization(optimization: InsertLinkedinOptimization): Promise<LinkedinOptimization> {
    const [newOptimization] = await db.insert(linkedinOptimizations).values(optimization).returning();
    return newOptimization;
  }
  
  // User profile operations
  async getUserProfile(userId: number): Promise<UserProfile | undefined> {
    const user = await this.getUser(userId);
    if (!user) return undefined;
    
    const profile = await this.getProfile(userId);
    const experiences = await this.getExperiences(userId);
    const education = await this.getEducations(userId);
    const skills = await this.getSkills(userId);
    const languages = await this.getLanguages(userId);
    const questionnaire = await this.getQuestionnaire(userId);
    const documents = await this.getDocuments(userId);
    const conversations = await this.getConversations(userId);
    const monthlyCheckIns = await this.getMonthlyCheckIns(userId);
    const freshnessReports = await this.getFreshnessReports(userId);
    const coachingNotes = await this.getCoachingNotes(userId);
    const slis = await this.getSlisByUserId(userId);
    const linkedinOptimizations = await this.getLinkedinOptimizations(userId);
    
    return {
      ...user,
      profile,
      experiences,
      education,
      skills,
      languages,
      questionnaire,
      documents,
      conversations,
      monthlyCheckIns,
      freshnessReports,
      coachingNotes,
      slis,
      linkedinOptimizations
    };
  }

  // Password reset operations
  async createPasswordReset(passwordReset: InsertPasswordReset): Promise<PasswordReset> {
    const [newReset] = await db
      .insert(passwordResets)
      .values(passwordReset)
      .returning();
    return newReset;
  }
  
  async getPasswordResetByToken(token: string): Promise<PasswordReset | undefined> {
    const [reset] = await db
      .select()
      .from(passwordResets)
      .where(eq(passwordResets.token, token));
    return reset || undefined;
  }
  
  async markPasswordResetAsUsed(id: number): Promise<PasswordReset | undefined> {
    const [updatedReset] = await db
      .update(passwordResets)
      .set({ used: true })
      .where(eq(passwordResets.id, id))
      .returning();
    return updatedReset || undefined;
  }

  // Conversation operations
  async getConversations(userId: number): Promise<Conversation[]> {
    return db
      .select()
      .from(conversations)
      .where(eq(conversations.userId, userId))
      .orderBy(desc(conversations.createdAt));
  }
  
  async getConversation(id: number): Promise<Conversation | undefined> {
    const [conversation] = await db
      .select()
      .from(conversations)
      .where(eq(conversations.id, id));
    return conversation || undefined;
  }
  
  async createConversation(conversationData: InsertConversation): Promise<Conversation> {
    const [newConversation] = await db
      .insert(conversations)
      .values({
        ...conversationData,
        createdAt: new Date()
      })
      .returning();
    return newConversation;
  }
  
  async updateConversation(id: number, title: string): Promise<Conversation | undefined> {
    const [updatedConversation] = await db
      .update(conversations)
      .set({ title })
      .where(eq(conversations.id, id))
      .returning();
    return updatedConversation || undefined;
  }
  
  async deleteConversation(id: number): Promise<void> {
    // Delete all messages first (cascade delete in application)
    await db.delete(messages).where(eq(messages.conversationId, id));
    // Now delete the conversation
    await db.delete(conversations).where(eq(conversations.id, id));
  }

  // Message operations
  async getMessages(conversationId: number): Promise<Message[]> {
    return db
      .select()
      .from(messages)
      .where(eq(messages.conversationId, conversationId))
      .orderBy(asc(messages.createdAt));
  }
  
  async createMessage(messageData: InsertMessage): Promise<Message> {
    const [newMessage] = await db
      .insert(messages)
      .values({
        ...messageData,
        createdAt: new Date()
      })
      .returning();
    return newMessage;
  }

  // Conversation Summary operations
  async getConversationSummary(id: number): Promise<ConversationSummary | undefined> {
    const [summary] = await db
      .select()
      .from(conversationSummaries)
      .where(eq(conversationSummaries.id, id));
    return summary || undefined;
  }
  
  async getConversationSummaryByConversationId(conversationId: number): Promise<ConversationSummary | undefined> {
    const [summary] = await db
      .select()
      .from(conversationSummaries)
      .where(eq(conversationSummaries.conversationId, conversationId));
    return summary || undefined;
  }
  
  async getConversationSummaries(userId: number): Promise<ConversationSummary[]> {
    return db
      .select()
      .from(conversationSummaries)
      .where(eq(conversationSummaries.userId, userId))
      .orderBy(desc(conversationSummaries.createdAt));
  }
  
  async createConversationSummary(summary: InsertConversationSummary): Promise<ConversationSummary> {
    const [newSummary] = await db
      .insert(conversationSummaries)
      .values({
        ...summary,
        createdAt: new Date()
      })
      .returning();
    return newSummary;
  }

  // Monthly Check-in operations
  async getMonthlyCheckIns(userId: number): Promise<MonthlyCheckIn[]> {
    return db
      .select()
      .from(monthlyCheckIns)
      .where(eq(monthlyCheckIns.userId, userId))
      .orderBy(desc(monthlyCheckIns.createdAt));
  }
  
  async getMonthlyCheckIn(id: number): Promise<MonthlyCheckIn | undefined> {
    const [checkIn] = await db
      .select()
      .from(monthlyCheckIns)
      .where(eq(monthlyCheckIns.id, id));
    return checkIn || undefined;
  }
  
  async getMonthlyCheckInByMonth(userId: number, month: string): Promise<MonthlyCheckIn | undefined> {
    const [checkIn] = await db
      .select()
      .from(monthlyCheckIns)
      .where(and(
        eq(monthlyCheckIns.userId, userId),
        eq(monthlyCheckIns.month, month)
      ));
    return checkIn || undefined;
  }
  
  async createMonthlyCheckIn(checkIn: InsertMonthlyCheckIn): Promise<MonthlyCheckIn> {
    const [newCheckIn] = await db
      .insert(monthlyCheckIns)
      .values({
        ...checkIn,
        createdAt: new Date()
      })
      .returning();
    return newCheckIn;
  }
  
  async updateMonthlyCheckIn(id: number, checkIn: Partial<InsertMonthlyCheckIn>): Promise<MonthlyCheckIn | undefined> {
    const [updatedCheckIn] = await db
      .update(monthlyCheckIns)
      .set(checkIn)
      .where(eq(monthlyCheckIns.id, id))
      .returning();
    return updatedCheckIn || undefined;
  }
  
  async deleteMonthlyCheckIn(id: number): Promise<void> {
    await db.delete(monthlyCheckIns).where(eq(monthlyCheckIns.id, id));
  }

  // Freshness Report operations
  async getFreshnessReports(userId: number): Promise<FreshnessReport[]> {
    return db
      .select()
      .from(freshnessReports)
      .where(eq(freshnessReports.userId, userId))
      .orderBy(desc(freshnessReports.createdAt));
  }
  
  async getFreshnessReport(id: number): Promise<FreshnessReport | undefined> {
    const [report] = await db
      .select()
      .from(freshnessReports)
      .where(eq(freshnessReports.id, id));
    return report || undefined;
  }
  
  async getLatestFreshnessReport(userId: number): Promise<FreshnessReport | undefined> {
    const [report] = await db
      .select()
      .from(freshnessReports)
      .where(eq(freshnessReports.userId, userId))
      .orderBy(desc(freshnessReports.createdAt))
      .limit(1);
    return report || undefined;
  }
  
  async createFreshnessReport(report: InsertFreshnessReport): Promise<FreshnessReport> {
    const [newReport] = await db
      .insert(freshnessReports)
      .values({
        ...report,
        createdAt: new Date()
      })
      .returning();
    return newReport;
  }
  
  async updateFreshnessReport(id: number, report: Partial<InsertFreshnessReport>): Promise<FreshnessReport | undefined> {
    const [updatedReport] = await db
      .update(freshnessReports)
      .set(report)
      .where(eq(freshnessReports.id, id))
      .returning();
    return updatedReport || undefined;
  }
  
  async deleteFreshnessReport(id: number): Promise<void> {
    await db.delete(freshnessReports).where(eq(freshnessReports.id, id));
  }

  // Coaching Notes operations
  async getCoachingNotes(userId: number): Promise<CoachingNote[]> {
    return db
      .select()
      .from(coachingNotes)
      .where(eq(coachingNotes.userId, userId))
      .orderBy(desc(coachingNotes.createdAt));
  }
  
  async getCoachingNote(id: number): Promise<CoachingNote | undefined> {
    const [note] = await db
      .select()
      .from(coachingNotes)
      .where(eq(coachingNotes.id, id));
    return note || undefined;
  }
  
  async createCoachingNote(note: InsertCoachingNote): Promise<CoachingNote> {
    const now = new Date();
    const [newNote] = await db
      .insert(coachingNotes)
      .values({
        ...note,
        createdAt: now,
        updatedAt: now
      })
      .returning();
    return newNote;
  }
  
  async updateCoachingNote(id: number, content: string): Promise<CoachingNote | undefined> {
    const [updatedNote] = await db
      .update(coachingNotes)
      .set({
        content,
        updatedAt: new Date()
      })
      .where(eq(coachingNotes.id, id))
      .returning();
    return updatedNote || undefined;
  }
  
  async deleteCoachingNote(id: number): Promise<void> {
    await db.delete(coachingNotes).where(eq(coachingNotes.id, id));
  }

  // SLI methods
  async getSlisByUserId(userId: number): Promise<Sli[]> {
    return db
      .select()
      .from(slis)
      .where(eq(slis.userId, userId))
      .orderBy(desc(slis.createdAt));
  }
  
  async getSli(id: number): Promise<Sli | undefined> {
    const [sli] = await db
      .select()
      .from(slis)
      .where(eq(slis.id, id));
    return sli || undefined;
  }
  
  async createSli(sliData: InsertSli): Promise<Sli> {
    const now = new Date();
    const [newSli] = await db
      .insert(slis)
      .values({
        ...sliData,
        createdAt: now,
        updatedAt: now
      })
      .returning();
    return newSli;
  }
  
  async updateSli(id: number, sliData: UpdateSli): Promise<Sli | undefined> {
    const [updatedSli] = await db
      .update(slis)
      .set({
        ...sliData,
        updatedAt: new Date()
      })
      .where(eq(slis.id, id))
      .returning();
    return updatedSli || undefined;
  }
  
  async deleteSli(id: number): Promise<void> {
    await db.delete(slis).where(eq(slis.id, id));
  }

  // LinkedIn Optimization methods
  async getLinkedinOptimizations(userId: number): Promise<LinkedinOptimization[]> {
    return db
      .select()
      .from(linkedinOptimizations)
      .where(eq(linkedinOptimizations.userId, userId))
      .orderBy(desc(linkedinOptimizations.createdAt));
  }
  
  async getLinkedinOptimization(id: number): Promise<LinkedinOptimization | undefined> {
    const [optimization] = await db
      .select()
      .from(linkedinOptimizations)
      .where(eq(linkedinOptimizations.id, id));
    return optimization || undefined;
  }
  
  async getLatestLinkedinOptimization(userId: number): Promise<LinkedinOptimization | undefined> {
    const [optimization] = await db
      .select()
      .from(linkedinOptimizations)
      .where(eq(linkedinOptimizations.userId, userId))
      .orderBy(desc(linkedinOptimizations.createdAt))
      .limit(1);
    return optimization || undefined;
  }
  
  async createLinkedinOptimization(optimization: InsertLinkedinOptimization): Promise<LinkedinOptimization> {
    const [newOptimization] = await db
      .insert(linkedinOptimizations)
      .values(optimization)
      .returning();
    return newOptimization;
  }

  // LinkedIn Content Drafts methods
  async getLinkedinContentDrafts(userId: number): Promise<LinkedinContentDraft[]> {
    return db
      .select()
      .from(linkedinContentDrafts)
      .where(eq(linkedinContentDrafts.userId, userId))
      .orderBy(desc(linkedinContentDrafts.createdAt));
  }
  
  async getLinkedinContentDraft(id: number): Promise<LinkedinContentDraft | undefined> {
    const [contentDraft] = await db
      .select()
      .from(linkedinContentDrafts)
      .where(eq(linkedinContentDrafts.id, id));
    return contentDraft || undefined;
  }
  
  async getLatestLinkedinContentDraft(userId: number): Promise<LinkedinContentDraft | undefined> {
    const [contentDraft] = await db
      .select()
      .from(linkedinContentDrafts)
      .where(eq(linkedinContentDrafts.userId, userId))
      .orderBy(desc(linkedinContentDrafts.createdAt))
      .limit(1);
    return contentDraft || undefined;
  }
  
  async createLinkedinContentDraft(contentDraft: InsertLinkedinContentDraft): Promise<LinkedinContentDraft> {
    const [newContentDraft] = await db
      .insert(linkedinContentDrafts)
      .values(contentDraft)
      .returning();
    return newContentDraft;
  }

  // Homework Assignment methods
  async getHomeworkAssignments(userId: number): Promise<HomeworkAssignment[]> {
    return await db
      .select()
      .from(homeworkAssignments)
      .where(eq(homeworkAssignments.userId, userId))
      .orderBy(desc(homeworkAssignments.createdAt));
  }

  async getHomeworkAssignment(id: number): Promise<HomeworkAssignment | undefined> {
    const [homework] = await db
      .select()
      .from(homeworkAssignments)
      .where(eq(homeworkAssignments.id, id));
    return homework || undefined;
  }

  async createHomeworkAssignment(homework: InsertHomeworkAssignment): Promise<HomeworkAssignment> {
    const [newHomework] = await db
      .insert(homeworkAssignments)
      .values(homework)
      .returning();
    return newHomework;
  }

  async updateHomeworkAssignment(id: number, data: UpdateHomeworkAssignment): Promise<HomeworkAssignment | undefined> {
    const [updatedHomework] = await db
      .update(homeworkAssignments)
      .set({ ...data, updatedAt: new Date() })
      .where(eq(homeworkAssignments.id, id))
      .returning();
    return updatedHomework || undefined;
  }

  async deleteHomeworkAssignment(id: number): Promise<void> {
    await db
      .delete(homeworkAssignments)
      .where(eq(homeworkAssignments.id, id));
  }

  // Foundation Sessions methods
  async getFoundationSessions(userId: number): Promise<FoundationSession[]> {
    return db
      .select()
      .from(foundationSessions)
      .where(eq(foundationSessions.userId, userId))
      .orderBy(asc(foundationSessions.sessionNumber));
  }

  async getFoundationSession(userId: number, sessionNumber: number): Promise<FoundationSession | undefined> {
    const [session] = await db
      .select()
      .from(foundationSessions)
      .where(and(
        eq(foundationSessions.userId, userId),
        eq(foundationSessions.sessionNumber, sessionNumber)
      ));
    return session || undefined;
  }

  async createFoundationSession(sessionData: InsertFoundationSession): Promise<FoundationSession> {
    const [newSession] = await db
      .insert(foundationSessions)
      .values(sessionData)
      .returning();
    return newSession;
  }

  async updateFoundationSession(id: number, data: UpdateFoundationSession): Promise<FoundationSession | undefined> {
    const [updatedSession] = await db
      .update(foundationSessions)
      .set(data)
      .where(eq(foundationSessions.id, id))
      .returning();
    return updatedSession || undefined;
  }

  // Foundation Session Messages methods
  async getFoundationSessionMessages(sessionId: number): Promise<FoundationSessionMessage[]> {
    return db
      .select()
      .from(foundationSessionMessages)
      .where(eq(foundationSessionMessages.sessionId, sessionId))
      .orderBy(asc(foundationSessionMessages.createdAt));
  }

  async createFoundationSessionMessage(messageData: InsertFoundationSessionMessage): Promise<FoundationSessionMessage> {
    const [newMessage] = await db
      .insert(foundationSessionMessages)
      .values(messageData)
      .returning();
    return newMessage;
  }
}