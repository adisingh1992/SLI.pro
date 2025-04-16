import { pgTable, text, serial, integer, boolean, timestamp, jsonb } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

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
  uploadedAt: timestamp("uploaded_at").defaultNow().notNull()
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





export type UserProfile = User & {
  experiences?: Experience[];
  education?: Education[];
  skills?: Skill[];
  languages?: Language[];
  profile?: Profile;
  questionnaire?: Questionnaire;
  documents?: Document[];
};
