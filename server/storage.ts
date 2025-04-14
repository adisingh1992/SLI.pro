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
  chatPrompts, type ChatPrompt, type InsertChatPrompt,
  chatConversations, type ChatConversation, type InsertChatConversation,
  chatMessages, type ChatMessage, type InsertChatMessage,
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

  // Chat prompt operations
  getChatPrompts(): Promise<ChatPrompt[]>;
  getChatPrompt(id: number): Promise<ChatPrompt | undefined>;
  createChatPrompt(prompt: InsertChatPrompt): Promise<ChatPrompt>;
  updateChatPrompt(id: number, prompt: Partial<InsertChatPrompt>): Promise<ChatPrompt | undefined>;
  deleteChatPrompt(id: number): Promise<void>;
  
  // Chat conversation operations
  getChatConversations(userId: number): Promise<ChatConversation[]>;
  getChatConversation(id: number): Promise<ChatConversation | undefined>;
  getChatConversationWithMessages(id: number): Promise<(ChatConversation & { messages: ChatMessage[] }) | undefined>;
  createChatConversation(conversation: InsertChatConversation): Promise<ChatConversation>;
  updateChatConversation(id: number, conversation: Partial<InsertChatConversation>): Promise<ChatConversation | undefined>;
  deleteChatConversation(id: number): Promise<void>;
  
  // Chat message operations
  getChatMessages(conversationId: number): Promise<ChatMessage[]>;
  createChatMessage(message: InsertChatMessage): Promise<ChatMessage>;

  // Session store
  sessionStore: session.SessionStore;
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
  private chatPrompts: Map<number, ChatPrompt>;
  private chatConversations: Map<number, ChatConversation>;
  private chatMessages: Map<number, ChatMessage>;
  
  private userId: number;
  private experienceId: number;
  private educationId: number;
  private skillId: number;
  private languageId: number;
  private profileId: number;
  private questionnaireId: number;
  private documentId: number;
  private passwordResetId: number;
  private chatPromptId: number;
  private chatConversationId: number;
  private chatMessageId: number;
  
  sessionStore: session.SessionStore;

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
    this.chatPrompts = new Map();
    this.chatConversations = new Map();
    this.chatMessages = new Map();
    
    this.userId = 1;
    this.experienceId = 1;
    this.educationId = 1;
    this.skillId = 1;
    this.languageId = 1;
    this.profileId = 1;
    this.questionnaireId = 1;
    this.documentId = 1;
    this.passwordResetId = 1;
    this.chatPromptId = 1;
    this.chatConversationId = 1;
    this.chatMessageId = 1;
    
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
    
    return {
      ...user,
      experiences,
      education: educations,
      skills,
      languages,
      profile,
      questionnaire,
      documents
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
  
  // Chat prompt methods
  async getChatPrompts(): Promise<ChatPrompt[]> {
    return Array.from(this.chatPrompts.values());
  }
  
  async getChatPrompt(id: number): Promise<ChatPrompt | undefined> {
    return this.chatPrompts.get(id);
  }
  
  async createChatPrompt(prompt: InsertChatPrompt): Promise<ChatPrompt> {
    const id = this.chatPromptId++;
    const newPrompt: ChatPrompt = {
      ...prompt,
      id,
      createdAt: new Date(),
      updatedAt: new Date()
    };
    this.chatPrompts.set(id, newPrompt);
    return newPrompt;
  }
  
  async updateChatPrompt(id: number, prompt: Partial<InsertChatPrompt>): Promise<ChatPrompt | undefined> {
    const existingPrompt = await this.getChatPrompt(id);
    if (!existingPrompt) return undefined;
    
    const updatedPrompt: ChatPrompt = {
      ...existingPrompt,
      ...prompt,
      updatedAt: new Date()
    };
    this.chatPrompts.set(id, updatedPrompt);
    return updatedPrompt;
  }
  
  async deleteChatPrompt(id: number): Promise<void> {
    this.chatPrompts.delete(id);
  }
  
  // Chat conversation methods
  async getChatConversations(userId: number): Promise<ChatConversation[]> {
    return Array.from(this.chatConversations.values()).filter(
      (conversation) => conversation.userId === userId
    );
  }
  
  async getChatConversation(id: number): Promise<ChatConversation | undefined> {
    return this.chatConversations.get(id);
  }
  
  async getChatConversationWithMessages(id: number): Promise<(ChatConversation & { messages: ChatMessage[] }) | undefined> {
    const conversation = await this.getChatConversation(id);
    if (!conversation) return undefined;
    
    const messages = await this.getChatMessages(id);
    
    return {
      ...conversation,
      messages
    };
  }
  
  async createChatConversation(conversation: InsertChatConversation): Promise<ChatConversation> {
    const id = this.chatConversationId++;
    const newConversation: ChatConversation = {
      ...conversation,
      id,
      createdAt: new Date(),
      updatedAt: new Date()
    };
    this.chatConversations.set(id, newConversation);
    return newConversation;
  }
  
  async updateChatConversation(id: number, conversation: Partial<InsertChatConversation>): Promise<ChatConversation | undefined> {
    const existingConversation = await this.getChatConversation(id);
    if (!existingConversation) return undefined;
    
    const updatedConversation: ChatConversation = {
      ...existingConversation,
      ...conversation,
      updatedAt: new Date()
    };
    this.chatConversations.set(id, updatedConversation);
    return updatedConversation;
  }
  
  async deleteChatConversation(id: number): Promise<void> {
    // Delete all messages in this conversation first
    const messages = await this.getChatMessages(id);
    for (const message of messages) {
      this.chatMessages.delete(message.id);
    }
    // Then delete the conversation itself
    this.chatConversations.delete(id);
  }
  
  // Chat message methods
  async getChatMessages(conversationId: number): Promise<ChatMessage[]> {
    return Array.from(this.chatMessages.values())
      .filter((message) => message.conversationId === conversationId)
      .sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());
  }
  
  async createChatMessage(message: InsertChatMessage): Promise<ChatMessage> {
    const id = this.chatMessageId++;
    const newMessage: ChatMessage = {
      ...message,
      id,
      createdAt: new Date()
    };
    this.chatMessages.set(id, newMessage);
    return newMessage;
  }
}

export const storage = new MemStorage();
