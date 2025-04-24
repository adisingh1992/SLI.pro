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
  type UpdateUser, type UpdateProfile, type UserProfile
} from "@shared/schema";
import session from "express-session";
import createMemoryStore from "memorystore";

const MemoryStore = createMemoryStore(session);

export interface IStorage {
  // User operations
  getUser(id: number): Promise<User | undefined>;
  getUserByUsername(username: string): Promise<User | undefined>;
  createUser(user: InsertUser): Promise<User>;
  updateUser(id: number, data: UpdateUser): Promise<User | undefined>;
  updateUserPassword(id: number, password: string): Promise<User | undefined>;
  getNonAdminUsers(): Promise<User[]>; // New method to get only non-admin users
  
  // Experience operations
  getExperiences(userId: number): Promise<Experience[]>;
  getExperience(id: number): Promise<Experience | undefined>;
  createExperience(experience: InsertExperience): Promise<Experience>;
  updateExperience(id: number, experience: Partial<InsertExperience>): Promise<Experience | undefined>;
  deleteExperience(id: number): Promise<void>;
  
  // Education operations
  getEducations(userId: number): Promise<Education[]>;
  getEducation(id: number): Promise<Education | undefined>;
  createEducation(education: InsertEducation): Promise<Education>;
  updateEducation(id: number, education: Partial<InsertEducation>): Promise<Education | undefined>;
  deleteEducation(id: number): Promise<void>;
  
  // Skill operations
  getSkills(userId: number): Promise<Skill[]>;
  getSkill(id: number): Promise<Skill | undefined>;
  createSkill(skill: InsertSkill): Promise<Skill>;
  deleteSkill(id: number): Promise<void>;
  
  // Language operations
  getLanguages(userId: number): Promise<Language[]>;
  getLanguage(id: number): Promise<Language | undefined>;
  createLanguage(language: InsertLanguage): Promise<Language>;
  deleteLanguage(id: number): Promise<void>;
  
  // Document operations
  getDocuments(userId: number): Promise<Document[]>;
  getDocument(id: number): Promise<Document | undefined>;
  createDocument(document: InsertDocument): Promise<Document>;
  deleteDocument(id: number): Promise<void>;
  
  // Profile operations
  getProfile(userId: number): Promise<Profile | undefined>;
  createProfile(profile: InsertProfile): Promise<Profile>;
  updateProfile(userId: number, profile: UpdateProfile): Promise<Profile | undefined>;
  
  // Questionnaire operations
  getQuestionnaire(userId: number): Promise<Questionnaire | undefined>;
  createQuestionnaire(questionnaire: InsertQuestionnaire): Promise<Questionnaire>;
  updateQuestionnaire(userId: number, questionnaire: Partial<InsertQuestionnaire>): Promise<Questionnaire | undefined>;
  
  // Password reset operations
  createPasswordReset(passwordReset: InsertPasswordReset): Promise<PasswordReset>;
  getPasswordResetByToken(token: string): Promise<PasswordReset | undefined>;
  markPasswordResetAsUsed(id: number): Promise<PasswordReset | undefined>;
  
  // User profile operations
  getUserProfile(userId: number): Promise<UserProfile | undefined>;
  
  // Conversation operations
  getConversations(userId: number): Promise<Conversation[]>;
  getConversation(id: number): Promise<Conversation | undefined>;
  createConversation(conversation: InsertConversation): Promise<Conversation>;
  updateConversation(id: number, title: string): Promise<Conversation | undefined>;
  deleteConversation(id: number): Promise<void>;
  
  // Message operations
  getMessages(conversationId: number): Promise<Message[]>;
  createMessage(message: InsertMessage): Promise<Message>;
  
  // Conversation Summary operations
  getConversationSummary(id: number): Promise<ConversationSummary | undefined>;
  getConversationSummaryByConversationId(conversationId: number): Promise<ConversationSummary | undefined>;
  getConversationSummaries(userId: number): Promise<ConversationSummary[]>;
  createConversationSummary(summary: InsertConversationSummary): Promise<ConversationSummary>;

  // Monthly Check-in operations
  getMonthlyCheckIns(userId: number): Promise<MonthlyCheckIn[]>;
  getMonthlyCheckIn(id: number): Promise<MonthlyCheckIn | undefined>;
  getMonthlyCheckInByMonth(userId: number, month: string): Promise<MonthlyCheckIn | undefined>;
  createMonthlyCheckIn(checkIn: InsertMonthlyCheckIn): Promise<MonthlyCheckIn>;
  updateMonthlyCheckIn(id: number, checkIn: Partial<InsertMonthlyCheckIn>): Promise<MonthlyCheckIn | undefined>;
  deleteMonthlyCheckIn(id: number): Promise<void>;
  
  // Freshness Report operations
  getFreshnessReports(userId: number): Promise<FreshnessReport[]>;
  getFreshnessReport(id: number): Promise<FreshnessReport | undefined>;
  getLatestFreshnessReport(userId: number): Promise<FreshnessReport | undefined>;
  createFreshnessReport(report: InsertFreshnessReport): Promise<FreshnessReport>;
  updateFreshnessReport(id: number, report: Partial<InsertFreshnessReport>): Promise<FreshnessReport | undefined>;
  deleteFreshnessReport(id: number): Promise<void>;

  // Coaching Notes operations
  getCoachingNotes(userId: number): Promise<CoachingNote[]>;
  getCoachingNote(id: number): Promise<CoachingNote | undefined>;
  createCoachingNote(note: InsertCoachingNote): Promise<CoachingNote>;
  updateCoachingNote(id: number, content: string): Promise<CoachingNote | undefined>;
  deleteCoachingNote(id: number): Promise<void>;

  // Session store
  sessionStore: session.Store;
}

export class MemStorage implements IStorage {
  private users: Map<number, User>;
  private experiences: Map<number, Experience>;
  private educations: Map<number, Education>;
  private skills: Map<number, Skill>;
  private languages: Map<number, Language>;
  private profiles: Map<number, Profile>;
  private questionnaires: Map<number, Questionnaire>;
  private documents: Map<number, Document>;
  private passwordResets: Map<number, PasswordReset>;
  private conversations: Map<number, Conversation>;
  private messages: Map<number, Message>;
  private conversationSummaries: Map<number, ConversationSummary>;
  private monthlyCheckIns: Map<number, MonthlyCheckIn>;
  private freshnessReports: Map<number, FreshnessReport>;
  private coachingNotes: Map<number, CoachingNote>;
  
  private userId: number;
  private experienceId: number;
  private educationId: number;
  private skillId: number;
  private languageId: number;
  private profileId: number;
  private questionnaireId: number;
  private documentId: number;
  private passwordResetId: number;
  private conversationId: number;
  private messageId: number;
  private conversationSummaryId: number;
  private monthlyCheckInId: number;
  private freshnessReportId: number;
  private coachingNoteId: number;
  
  sessionStore: session.Store;

  constructor() {
    this.users = new Map();
    this.experiences = new Map();
    this.educations = new Map();
    this.skills = new Map();
    this.languages = new Map();
    this.profiles = new Map();
    this.questionnaires = new Map();
    this.documents = new Map();
    this.passwordResets = new Map();
    this.conversations = new Map();
    this.messages = new Map();
    this.conversationSummaries = new Map();
    this.monthlyCheckIns = new Map();
    this.freshnessReports = new Map();
    this.coachingNotes = new Map();
    
    this.userId = 1;
    this.experienceId = 1;
    this.educationId = 1;
    this.skillId = 1;
    this.languageId = 1;
    this.profileId = 1;
    this.questionnaireId = 1;
    this.documentId = 1;
    this.passwordResetId = 1;
    this.conversationId = 1;
    this.messageId = 1;
    this.conversationSummaryId = 1;
    this.monthlyCheckInId = 1;
    this.freshnessReportId = 1;
    this.coachingNoteId = 1;
    
    this.sessionStore = new MemoryStore({
      checkPeriod: 86400000,
    });
  }

  // User methods
  async getUser(id: number): Promise<User | undefined> {
    return this.users.get(id);
  }

  async getUserByUsername(username: string): Promise<User | undefined> {
    return Array.from(this.users.values()).find(
      (user) => user.username === username,
    );
  }

  async createUser(userData: InsertUser): Promise<User> {
    const id = this.userId++;
    const user: User = { ...userData, id };
    this.users.set(id, user);
    return user;
  }
  
  async updateUser(id: number, data: UpdateUser): Promise<User | undefined> {
    const user = await this.getUser(id);
    if (!user) return undefined;
    
    const updatedUser = { ...user, ...data };
    this.users.set(id, updatedUser);
    return updatedUser;
  }

  // Experience methods
  async getExperiences(userId: number): Promise<Experience[]> {
    return Array.from(this.experiences.values()).filter(
      (exp) => exp.userId === userId
    );
  }
  
  async getExperience(id: number): Promise<Experience | undefined> {
    return this.experiences.get(id);
  }
  
  async createExperience(experience: InsertExperience): Promise<Experience> {
    const id = this.experienceId++;
    const newExperience: Experience = { ...experience, id };
    this.experiences.set(id, newExperience);
    return newExperience;
  }
  
  async updateExperience(id: number, experience: Partial<InsertExperience>): Promise<Experience | undefined> {
    const existingExperience = await this.getExperience(id);
    if (!existingExperience) return undefined;
    
    const updatedExperience = { ...existingExperience, ...experience };
    this.experiences.set(id, updatedExperience);
    return updatedExperience;
  }
  
  async deleteExperience(id: number): Promise<void> {
    this.experiences.delete(id);
  }

  // Education methods
  async getEducations(userId: number): Promise<Education[]> {
    return Array.from(this.educations.values()).filter(
      (edu) => edu.userId === userId
    );
  }
  
  async getEducation(id: number): Promise<Education | undefined> {
    return this.educations.get(id);
  }
  
  async createEducation(education: InsertEducation): Promise<Education> {
    const id = this.educationId++;
    const newEducation: Education = { ...education, id };
    this.educations.set(id, newEducation);
    return newEducation;
  }
  
  async updateEducation(id: number, education: Partial<InsertEducation>): Promise<Education | undefined> {
    const existingEducation = await this.getEducation(id);
    if (!existingEducation) return undefined;
    
    const updatedEducation = { ...existingEducation, ...education };
    this.educations.set(id, updatedEducation);
    return updatedEducation;
  }
  
  async deleteEducation(id: number): Promise<void> {
    this.educations.delete(id);
  }

  // Skill methods
  async getSkills(userId: number): Promise<Skill[]> {
    return Array.from(this.skills.values()).filter(
      (skill) => skill.userId === userId
    );
  }
  
  async getSkill(id: number): Promise<Skill | undefined> {
    return this.skills.get(id);
  }
  
  async createSkill(skill: InsertSkill): Promise<Skill> {
    const id = this.skillId++;
    const newSkill: Skill = { ...skill, id };
    this.skills.set(id, newSkill);
    return newSkill;
  }
  
  async deleteSkill(id: number): Promise<void> {
    this.skills.delete(id);
  }

  // Language methods
  async getLanguages(userId: number): Promise<Language[]> {
    return Array.from(this.languages.values()).filter(
      (language) => language.userId === userId
    );
  }
  
  async getLanguage(id: number): Promise<Language | undefined> {
    return this.languages.get(id);
  }
  
  async createLanguage(language: InsertLanguage): Promise<Language> {
    const id = this.languageId++;
    const newLanguage: Language = { ...language, id };
    this.languages.set(id, newLanguage);
    return newLanguage;
  }
  
  async deleteLanguage(id: number): Promise<void> {
    this.languages.delete(id);
  }

  // Profile methods
  async getProfile(userId: number): Promise<Profile | undefined> {
    return Array.from(this.profiles.values()).find(
      (profile) => profile.userId === userId
    );
  }
  
  async createProfile(profile: InsertProfile): Promise<Profile> {
    const id = this.profileId++;
    const newProfile: Profile = { ...profile, id };
    this.profiles.set(id, newProfile);
    return newProfile;
  }
  
  async updateProfile(userId: number, profileData: UpdateProfile): Promise<Profile | undefined> {
    const profile = await this.getProfile(userId);
    if (!profile) return undefined;
    
    const updatedProfile = { ...profile, ...profileData };
    this.profiles.set(profile.id, updatedProfile);
    return updatedProfile;
  }
  
  // Questionnaire methods
  async getQuestionnaire(userId: number): Promise<Questionnaire | undefined> {
    return Array.from(this.questionnaires.values()).find(
      (questionnaire) => questionnaire.userId === userId
    );
  }
  
  async createQuestionnaire(questionnaire: InsertQuestionnaire): Promise<Questionnaire> {
    const id = this.questionnaireId++;
    const newQuestionnaire: Questionnaire = { 
      ...questionnaire, 
      id,
      createdAt: new Date(),
      updatedAt: new Date()
    };
    this.questionnaires.set(id, newQuestionnaire);
    return newQuestionnaire;
  }
  
  async updateQuestionnaire(userId: number, questionnaireData: Partial<InsertQuestionnaire>): Promise<Questionnaire | undefined> {
    const questionnaire = await this.getQuestionnaire(userId);
    if (!questionnaire) return undefined;
    
    const updatedQuestionnaire = { 
      ...questionnaire, 
      ...questionnaireData,
      updatedAt: new Date()
    };
    this.questionnaires.set(questionnaire.id, updatedQuestionnaire);
    return updatedQuestionnaire;
  }

  // Document methods
  async getDocuments(userId: number): Promise<Document[]> {
    return Array.from(this.documents.values()).filter(
      (document) => document.userId === userId
    );
  }
  
  async getDocument(id: number): Promise<Document | undefined> {
    return this.documents.get(id);
  }
  
  async createDocument(document: InsertDocument): Promise<Document> {
    const id = this.documentId++;
    const newDocument: Document = { 
      ...document, 
      id,
      uploadedAt: new Date()
    };
    this.documents.set(id, newDocument);
    return newDocument;
  }
  
  async deleteDocument(id: number): Promise<void> {
    this.documents.delete(id);
  }
  
  // User profile operations
  async getUserProfile(userId: number): Promise<UserProfile | undefined> {
    const user = await this.getUser(userId);
    if (!user) return undefined;
    
    const experiences = await this.getExperiences(userId);
    const educations = await this.getEducations(userId);
    const skills = await this.getSkills(userId);
    const languages = await this.getLanguages(userId);
    const profile = await this.getProfile(userId);
    const questionnaire = await this.getQuestionnaire(userId);
    const documents = await this.getDocuments(userId);
    const conversations = await this.getConversations(userId);
    const monthlyCheckIns = await this.getMonthlyCheckIns(userId);
    const freshnessReports = await this.getFreshnessReports(userId);
    const coachingNotes = await this.getCoachingNotes(userId);
    
    console.log(`Fetched ${monthlyCheckIns.length} monthly check-ins for user ${userId}`);
    
    return {
      ...user,
      experiences,
      education: educations,
      skills,
      languages,
      profile,
      questionnaire,
      documents,
      conversations,
      monthlyCheckIns,
      freshnessReports,
      coachingNotes
    };
  }
  
  // Password reset methods
  async updateUserPassword(id: number, password: string): Promise<User | undefined> {
    const user = await this.getUser(id);
    if (!user) return undefined;
    
    const updatedUser = { ...user, password };
    this.users.set(id, updatedUser);
    return updatedUser;
  }
  
  async getNonAdminUsers(): Promise<User[]> {
    // Return only users that are NOT marked as admin
    return Array.from(this.users.values()).filter(user => user.isAdmin !== true);
  }
  
  async createPasswordReset(passwordReset: InsertPasswordReset): Promise<PasswordReset> {
    const id = this.passwordResetId++;
    const newPasswordReset: PasswordReset = { 
      ...passwordReset, 
      id,
      createdAt: new Date(),
      used: false
    };
    this.passwordResets.set(id, newPasswordReset);
    return newPasswordReset;
  }
  
  async getPasswordResetByToken(token: string): Promise<PasswordReset | undefined> {
    return Array.from(this.passwordResets.values()).find(
      (reset) => reset.token === token && !reset.used && reset.expiresAt > new Date()
    );
  }
  
  async markPasswordResetAsUsed(id: number): Promise<PasswordReset | undefined> {
    const passwordReset = this.passwordResets.get(id);
    if (!passwordReset) return undefined;
    
    const updatedReset = { ...passwordReset, used: true };
    this.passwordResets.set(id, updatedReset);
    return updatedReset;
  }
  
  // Conversation methods
  async getConversations(userId: number): Promise<Conversation[]> {
    return Array.from(this.conversations.values())
      .filter(conversation => conversation.userId === userId)
      .sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime());
  }
  
  async getConversation(id: number): Promise<Conversation | undefined> {
    return this.conversations.get(id);
  }
  
  async createConversation(conversation: InsertConversation): Promise<Conversation> {
    const id = this.conversationId++;
    const newConversation: Conversation = {
      ...conversation,
      id,
      createdAt: new Date(),
      updatedAt: new Date()
    };
    this.conversations.set(id, newConversation);
    return newConversation;
  }
  
  async updateConversation(id: number, title: string): Promise<Conversation | undefined> {
    const conversation = await this.getConversation(id);
    if (!conversation) return undefined;
    
    const updatedConversation = {
      ...conversation,
      title,
      updatedAt: new Date()
    };
    this.conversations.set(id, updatedConversation);
    return updatedConversation;
  }
  
  async deleteConversation(id: number): Promise<void> {
    // Delete all messages in the conversation first
    const messages = await this.getMessages(id);
    messages.forEach(message => {
      this.messages.delete(message.id);
    });
    
    // Then delete the conversation
    this.conversations.delete(id);
  }
  
  // Message methods
  async getMessages(conversationId: number): Promise<Message[]> {
    return Array.from(this.messages.values())
      .filter(message => message.conversationId === conversationId)
      .sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());
  }
  
  async createMessage(message: InsertMessage): Promise<Message> {
    const id = this.messageId++;
    const newMessage: Message = {
      ...message,
      id,
      createdAt: new Date()
    };
    this.messages.set(id, newMessage);
    
    // Update the conversation's updatedAt timestamp
    const conversation = await this.getConversation(message.conversationId);
    if (conversation) {
      await this.updateConversation(conversation.id, conversation.title);
    }
    
    return newMessage;
  }
  
  // Conversation Summary methods
  async getConversationSummary(id: number): Promise<ConversationSummary | undefined> {
    return this.conversationSummaries.get(id);
  }
  
  async getConversationSummaryByConversationId(conversationId: number): Promise<ConversationSummary | undefined> {
    return Array.from(this.conversationSummaries.values()).find(
      (summary) => summary.conversationId === conversationId
    );
  }
  
  async getConversationSummaries(userId: number): Promise<ConversationSummary[]> {
    return Array.from(this.conversationSummaries.values())
      .filter(summary => summary.userId === userId)
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  }
  
  async createConversationSummary(summary: InsertConversationSummary): Promise<ConversationSummary> {
    const id = this.conversationSummaryId++;
    const newSummary: ConversationSummary = {
      ...summary,
      id,
      createdAt: new Date()
    };
    this.conversationSummaries.set(id, newSummary);
    return newSummary;
  }

  // Monthly Check-in methods
  async getMonthlyCheckIns(userId: number): Promise<MonthlyCheckIn[]> {
    return Array.from(this.monthlyCheckIns.values())
      .filter(checkIn => checkIn.userId === userId)
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  }
  
  async getMonthlyCheckIn(id: number): Promise<MonthlyCheckIn | undefined> {
    return this.monthlyCheckIns.get(id);
  }
  
  async getMonthlyCheckInByMonth(userId: number, month: string): Promise<MonthlyCheckIn | undefined> {
    return Array.from(this.monthlyCheckIns.values()).find(
      checkIn => checkIn.userId === userId && checkIn.month === month
    );
  }
  
  async createMonthlyCheckIn(checkIn: InsertMonthlyCheckIn): Promise<MonthlyCheckIn> {
    const id = this.monthlyCheckInId++;
    const newCheckIn: MonthlyCheckIn = {
      ...checkIn,
      id,
      createdAt: new Date()
    };
    this.monthlyCheckIns.set(id, newCheckIn);
    return newCheckIn;
  }
  
  async updateMonthlyCheckIn(id: number, checkIn: Partial<InsertMonthlyCheckIn>): Promise<MonthlyCheckIn | undefined> {
    const existingCheckIn = await this.getMonthlyCheckIn(id);
    if (!existingCheckIn) return undefined;
    
    const updatedCheckIn = { ...existingCheckIn, ...checkIn };
    this.monthlyCheckIns.set(id, updatedCheckIn);
    return updatedCheckIn;
  }
  
  async deleteMonthlyCheckIn(id: number): Promise<void> {
    this.monthlyCheckIns.delete(id);
  }

  // Freshness Report methods
  async getFreshnessReports(userId: number): Promise<FreshnessReport[]> {
    return Array.from(this.freshnessReports.values())
      .filter(report => report.userId === userId)
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  }
  
  async getFreshnessReport(id: number): Promise<FreshnessReport | undefined> {
    return this.freshnessReports.get(id);
  }
  
  async getLatestFreshnessReport(userId: number): Promise<FreshnessReport | undefined> {
    const reports = await this.getFreshnessReports(userId);
    return reports.length > 0 ? reports[0] : undefined;
  }
  
  async createFreshnessReport(report: InsertFreshnessReport): Promise<FreshnessReport> {
    const id = this.freshnessReportId++;
    const newReport: FreshnessReport = {
      ...report,
      id,
      createdAt: new Date()
    };
    this.freshnessReports.set(id, newReport);
    return newReport;
  }
  
  async updateFreshnessReport(id: number, reportData: Partial<InsertFreshnessReport>): Promise<FreshnessReport | undefined> {
    const report = await this.getFreshnessReport(id);
    if (!report) return undefined;
    
    const updatedReport = { ...report, ...reportData };
    this.freshnessReports.set(id, updatedReport);
    return updatedReport;
  }
  
  async deleteFreshnessReport(id: number): Promise<void> {
    this.freshnessReports.delete(id);
  }

  // Coaching Notes methods
  async getCoachingNotes(userId: number): Promise<CoachingNote[]> {
    return Array.from(this.coachingNotes.values())
      .filter(note => note.userId === userId)
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  }
  
  async getCoachingNote(id: number): Promise<CoachingNote | undefined> {
    return this.coachingNotes.get(id);
  }
  
  async createCoachingNote(note: InsertCoachingNote): Promise<CoachingNote> {
    const id = this.coachingNoteId++;
    const newNote: CoachingNote = {
      ...note,
      id,
      createdAt: new Date(),
      updatedAt: new Date()
    };
    this.coachingNotes.set(id, newNote);
    return newNote;
  }
  
  async updateCoachingNote(id: number, content: string): Promise<CoachingNote | undefined> {
    const note = await this.getCoachingNote(id);
    if (!note) return undefined;
    
    const updatedNote = {
      ...note,
      content,
      updatedAt: new Date()
    };
    this.coachingNotes.set(id, updatedNote);
    return updatedNote;
  }
  
  async deleteCoachingNote(id: number): Promise<void> {
    this.coachingNotes.delete(id);
  }
}

export const storage = new MemStorage();
