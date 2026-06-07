# SLI.pro — Architecture Reference

> A professional branding & career‑coaching platform that helps people develop a
> **Single Lasting Impression (SLI)**, optimize their LinkedIn presence, and keep
> their professional profile fresh through AI‑powered analysis and guided coaching
> sessions.

This document is the single, detailed reference for how SLI.pro is built: the
technology stack, the data model (exact table definitions), the complete HTTP API
surface, the AI / prompt architecture, the realtime voice pipeline, payments, and a
full from‑scratch setup guide.

---

## Table of Contents

1. [System Overview](#1-system-overview)
2. [Technology Stack](#2-technology-stack)
3. [Repository Layout](#3-repository-layout)
4. [Runtime & Request Flow](#4-runtime--request-flow)
5. [Data Model (Database Schema)](#5-data-model-database-schema)
6. [Storage Layer (`IStorage`)](#6-storage-layer-istorage)
7. [Authentication & Authorization](#7-authentication--authorization)
8. [HTTP API Reference](#8-http-api-reference)
9. [AI & Prompt Architecture](#9-ai--prompt-architecture)
10. [Freshness Report Pipeline](#10-freshness-report-pipeline)
11. [Realtime Voice (WebSocket + Whisper)](#11-realtime-voice-websocket--whisper)
12. [Payments (Stripe)](#12-payments-stripe)
13. [Email (SendGrid)](#13-email-sendgrid)
14. [Frontend Architecture](#14-frontend-architecture)
15. [Environment Variables & Secrets](#15-environment-variables--secrets)
16. [From‑Scratch Setup Guide](#16-from-scratch-setup-guide)

---

## 1. System Overview

SLI.pro is a **full‑stack TypeScript monorepo** with three logical layers that share
one type system:

| Layer | Location | Responsibility |
|-------|----------|----------------|
| **Shared** | `shared/` | Drizzle ORM schema + Zod schemas + inferred types used by **both** client and server. Single source of truth for the data model. |
| **Server** | `server/` | Express REST API, Passport authentication, Drizzle/Postgres persistence, Anthropic Claude AI calls, OpenAI Whisper voice transcription, Stripe payments, SendGrid email. |
| **Client** | `client/` | React 18 SPA (Vite) using wouter for routing and TanStack Query for server state. |

Both the API and the client are served from a **single Express process on port 5000**.
In development, Vite runs in middleware mode inside Express; in production, the client
is pre‑built to static assets and served by the same Express server.

The product has two audiences:

- **Clients (end users)** — complete onboarding, a questionnaire and document uploads,
  run AI coaching (Foundation Sessions and Enhancement Modules), generate freshness
  reports, optimize LinkedIn, and manage a subscription.
- **Admins (coaches)** — manage users, generate/refine SLIs, write coaching notes,
  assign homework, and export data.

---

## 2. Technology Stack

### Frontend
- **React 18** + **TypeScript**
- **Vite** (build + dev server; configured in `vite.config.ts` — *do not modify*)
- **wouter** — lightweight client‑side routing
- **@tanstack/react-query** (v5) — server state / caching
- **React Context** — app‑wide auth state (`use-auth.tsx`)
- **react-hook-form** + **@hookform/resolvers** + **zod** — forms & validation
- **Radix UI primitives** + **Tailwind CSS** (shadcn‑style component library in
  `client/src/components/ui`)
- **lucide-react** (icons), **react-icons** (brand logos)
- **recharts** (charts), **framer-motion** (animation), **react-markdown** + **remark-gfm**
- **@stripe/react-stripe-js** + **@stripe/stripe-js** (checkout UI)
- **html2pdf.js**, **qrcode** (exports / sharing)

### Backend
- **Node.js 20** + **Express** + **TypeScript** (run via `tsx` in dev, bundled by
  `esbuild` for production)
- **Passport.js** — `passport-local` (email/password) and `passport-oauth2`
  (`OAuth2Strategy`) configured for **LinkedIn OpenID Connect** (the
  `passport-linkedin-oauth2` package is present in deps but the active strategy is the
  generic `passport-oauth2` flow)
- **express-session** + **connect-pg-simple** — Postgres‑backed sessions
- **Drizzle ORM** + **drizzle-zod** + **drizzle-kit** — schema, validation, migrations
- **@neondatabase/serverless** — Postgres driver (Neon serverless, WebSocket‑enabled)
- **@anthropic-ai/sdk** — Claude AI
- **openai** — Whisper transcription for voice
- **ws** — WebSocket server for realtime voice
- **stripe** — payments
- **@sendgrid/mail** — transactional email
- **pdf-parse**, **mammoth** — document text extraction (PDF / DOCX)
- **exceljs** — admin data exports

### Platform
- Replit (Nix modules: `nodejs-20`, `web`, `postgresql-16`, `python-3.11`)
- Single port `5000` mapped to external `80`
- Deployment target: **autoscale** (`build` = `npm run build`, `run` = `npm run start`)

---

## 3. Repository Layout

```
.
├── shared/
│   └── schema.ts                 # Drizzle tables + Zod insert/update schemas + types
├── server/
│   ├── index.ts                  # Express bootstrap, middleware, port 5000, WS init
│   ├── vite.ts                   # Vite middleware / static serving (DO NOT EDIT)
│   ├── db.ts                     # Neon pool + Drizzle instance (DATABASE_URL)
│   ├── auth.ts                   # Passport setup, register/login/logout, password reset, LinkedIn OAuth
│   ├── storage.ts                # IStorage interface + MemStorage + active storage export
│   ├── database-storage.ts       # DatabaseStorage (Drizzle-backed IStorage impl)
│   ├── routes.ts                 # Core API routes (profile, questionnaire, docs, admin, etc.)
│   ├── claude.ts                 # Claude chat/coaching helpers
│   ├── sli.ts                    # SLI generation/refinement AI
│   ├── sli-routes.ts             # SLI endpoints (admin + user)
│   ├── linkedin-optimization.ts  # LinkedIn optimization AI
│   ├── linkedin-optimization-routes.ts
│   ├── linkedin-content-routes.ts# LinkedIn content draft generation + share tracking
│   ├── freshness-report.ts       # Multi-step freshness analysis (Claude)
│   ├── freshness-routes.ts       # Freshness report CRUD + generation pipeline
│   ├── foundation-sessions-routes.ts   # Foundation Sessions 1–3 chat + streaming
│   ├── enhancement-modules-routes.ts   # Enhancement Modules A/B/C chat + streaming
│   ├── homework-routes.ts        # Homework assignment CRUD
│   ├── payment-routes.ts         # Stripe checkout, webhook, subscription mgmt
│   ├── email-service.ts          # SendGrid password-reset email
│   ├── document-extractor.ts     # PDF/DOCX/text extraction & validation
│   ├── prompts/                  # Foundation Session prompt strategy (by status)
│   │   ├── types.ts              # PromptSet interface + context types
│   │   ├── index.ts              # getPromptSet(professionalStatus)
│   │   ├── undergraduate-recent-grad.ts
│   │   ├── early-career.ts
│   │   └── mid-career-senior.ts
│   ├── enhancement-module-prompts/  # Enhancement Module prompt strategy (by status)
│   │   ├── types.ts              # ModulePromptSet interface + context types
│   │   ├── index.ts              # getModulePromptSet(professionalStatus)
│   │   ├── undergraduate-recent-grad.ts
│   │   ├── early-career.ts
│   │   └── mid-career-senior.ts
│   └── realtime/
│       ├── websocket-handler.ts  # /ws/voice upgrade + session auth
│       └── openai-realtime.ts    # OpenAI Whisper transcription session
├── client/
│   └── src/
│       ├── main.tsx              # React entry
│       ├── App.tsx               # Route table (wouter)
│       ├── pages/                # One file per page (see §14)
│       ├── components/           # UI + feature components (ui/ = shadcn)
│       ├── hooks/                # use-auth, use-voice-recording, use-session-timer, ...
│       ├── lib/                  # queryClient, apiRequest, protected-route, utils
│       └── assets/
├── theme.json                    # shadcn theme (primary color, variant, radius)
├── drizzle.config.ts             # Drizzle Kit config (DO NOT EDIT)
├── vite.config.ts                # Vite config (DO NOT EDIT)
├── package.json                  # Scripts & deps (DO NOT EDIT manually)
└── .replit                       # Replit run/deploy config
```

---

## 4. Runtime & Request Flow

### Bootstrap (`server/index.ts`)
1. Create the Express app.
2. **Stripe webhook raw body**: the route `/api/payments/webhook` is registered with
   `express.raw({ type: 'application/json' })` **before** `express.json()` so the raw
   payload is available for signature verification. All other routes use parsed JSON.
3. `express.json()` and `express.urlencoded()` are applied for the rest of the API.
4. A request logger logs method, path, status, and duration for `/api/*` requests.
5. `setupAuth(app)` wires session, Passport, and auth routes.
6. `registerRoutes(app)` (and the per‑feature `registerXRoutes(app)` functions) mount
   all API endpoints.
7. An HTTP server is created and **`setupWebSocketServer(server)`** attaches the
   `/ws/voice` WebSocket server.
8. In **development** (`app.get("env") === "development"`) Vite is attached in
   middleware mode; in **production** the pre‑built client is served statically.
9. The server listens on **port 5000** (host `0.0.0.0`).

### Typical request lifecycle
```
Browser → Express (session cookie) → Passport deserialize (req.user)
        → isAuthenticated / isAdmin guard
        → route handler → storage.<method>() → Drizzle → Neon Postgres
        → (optional) Claude / Whisper / Stripe / SendGrid
        → JSON response
```

---

## 5. Data Model (Database Schema)

All tables live in **`shared/schema.ts`** and are defined with Drizzle ORM. For every
table there is a matching `insert*Schema` (built with `createInsertSchema` from
`drizzle-zod`, with auto‑generated columns `.omit`‑ted), often an `update*Schema`
(`.partial()`), and inferred `Insert*` / select types.

### 5.1 Enums (Postgres `pgEnum`)

```ts
professional_status:  "undergraduate_or_recent_grad" | "early_career"
                    | "mid_career_or_senior" | "career_break_or_transition"

discovery_source:     "university_partnership" | "colleague_or_mentor" | "linkedin"
                    | "web_search" | "professional_network_or_conference" | "other"

session_status:       "locked" | "available" | "in_progress" | "completed"
message_role:         "user" | "assistant"

subscription_tier:    "free" | "premium" | "subscription"
subscription_status:  "active" | "expired" | "canceled"
payment_status:       "pending" | "succeeded" | "failed" | "refunded"

branding_intake_platform: "undergraduate" | "early_career" | "mid_career"
```

### 5.2 Identity & profile

#### `users`
```ts
export const users = pgTable("users", {
  id: serial("id").primaryKey(),
  username: text("username").notNull().unique(),        // email
  password: text("password"),                           // null for OAuth-only users
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
  // Stripe / subscription
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
```
> `password` is nullable because LinkedIn OAuth users may have no local password.
> `professionalStatus` drives prompt selection (see §9).

#### `experiences`, `education`, `skills`, `languages`
Profile sub‑records, each `references(() => users.id)`:
```ts
experiences: { id, userId, title, company, startDate, endDate?, description?, current? }
education:   { id, userId, degree, institution, startYear, endYear?, description? }
skills:      { id, userId, name }
languages:   { id, userId, name, proficiency }
```

#### `profiles`
```ts
profiles: { id, userId (unique), completionStep (default 0), isComplete (default false) }
```

#### `password_resets`
```ts
password_resets: { id, userId, token (unique), expiresAt, used (default false), createdAt }
```

### 5.3 Documents & questionnaire

#### `documents`
```ts
export const documents = pgTable("documents", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull().references(() => users.id),
  name: text("name").notNull(),
  type: text("type").notNull(),          // "resume" | "linkedin" | "certificate" | ...
  fileName: text("file_name").notNull(),
  fileData: text("file_data").notNull(), // Base64-encoded file contents (PDF/img/text)
  uploadedAt: timestamp("uploaded_at").defaultNow().notNull(),
  analysisContent: text("analysis_content"), // AI-generated analysis
});
```
> Documents are stored **inline as Base64 text** in Postgres (no external blob store).
> Limit ~10 MB. Text is later extracted with `pdf-parse` / `mammoth`.

#### `questionnaires`
```ts
questionnaires: {
  id, userId,
  industry?, background?, goals?, aspirations?, challenges?, interests?, timeframe?,
  rawAnswers? (jsonb), isDraft (default false), createdAt, updatedAt
}
```

### 5.4 Conversations & summaries

#### `conversations` / `messages`
```ts
conversations: { id, userId, title (default "New Conversation"), createdAt, updatedAt }
messages:      { id, conversationId, role ("user"|"assistant"), content, createdAt }
```

#### `conversation_summaries`
Rich, structured AI summary of a coaching conversation. All sections are typed
`jsonb` and `notNull`:
```ts
conversation_summaries: {
  id, conversationId (cascade), userId (cascade),
  basicInfo:              { name?, currentRole?, industry?, yearsOfExperience?, targetTimeline? },
  functionalCategorization:{ primaryFunction?, secondaryFunction?, levelOfCertainty?, keyStrengths? },
  careerTransition:       { currentState?, desiredState?, transitionType?, complexityRating?, primaryMotivation? },
  strengthsAndPositioning:{ keyStrengths?, areasForDevelopment?, valueProposition?, achievementExamples?, comfortWithSelfPromotion? },
  digitalPresence:        { linkedInActivity?, contentCreationExperience?, barriers?, networkingApproach?, postingFrequency? },
  psychologyAndMotivation:{ enneagramType?, assessmentResults?, topPriorities?, aspirationalThemes?, notableQuotes?, motivationalDrivers? },
  contentStrategy:        { confidentTopics?, preferredFormats?, creationBarriers?, suggestedInitialTopic? },
  recommendations:        { sliDirections?, iceBucketMoments?, contentStrategyDirections?, specialConsiderations? },
  createdAt
}
```

### 5.5 Monthly check‑ins & freshness reports

#### `monthly_check_ins`
```ts
monthly_check_ins: {
  id, userId, month ("YYYY-MM"),
  contentPosts (int), contentLinks (string[]), contentScreenshots ({name,data}[]),
  engagementFrequency, engagementScreenshot? (base64),
  updatedProfileVisuals (bool), profileScreenshot? (base64),
  newConnections (int), targetConnectionPercentage,
  recommendationImplementation, implementationChallenges?, createdAt
}
```

#### `freshness_reports`
```ts
freshness_reports: {
  id, userId,
  questionnaireAnalysis (jsonb), resumeAnalysis (jsonb), linkedinAnalysis (jsonb),
  additionalDocumentsAnalysis (jsonb[] default []), finalSynthesis (jsonb),
  createdAt
}
```

### 5.6 LinkedIn content

#### `linkedin_content_drafts`
```ts
linkedin_content_drafts: {
  id, userId (cascade),
  post1Type, post1Content: { hook, body, closing, hashtags },
  post2Type, post2Content: { hook, body, closing, hashtags },
  createdAt
}
```

#### `linkedin_post_shares`
```ts
linkedin_post_shares: {
  id, draftId (cascade), postNumber (1|2), shareCount (default 0), lastSharedAt?
}
```

#### `linkedin_optimizations`
```ts
linkedin_optimizations: {
  id, userId (cascade),
  alignmentAssessment?,
  headlineOptimization:  { currentHeadline?, recommendedHeadline?, rationale? },
  aboutSection:          { currentAnalysis?, recommendations?, suggestedStructure?, keyElements?, draftContent? },
  profileEnhancements:   { experienceSection?, skillsEndorsements?, activityEngagement?, visualImprovements? },
  contentStrategy:       { themes?, postIdeas?, engagementTips? },
  implementationPriorities?, createdAt
}
```

### 5.7 Coaching artifacts (admin)

#### `coaching_notes`
```ts
coaching_notes: { id, userId, adminId, content, createdAt, updatedAt }
```

#### `slis` (Single Lasting Impressions)
Three AI‑generated candidate SLIs plus selection & refinement state:
```ts
slis: {
  id, userId (cascade), adminId,
  title1, statement1, rationale1,
  title2, statement2, rationale2,
  title3, statement3, rationale3,
  selectedSliIndex?,            // 1|2|3 (null = none/custom)
  customSliText?,               // user-authored SLI
  refinedSliText?,              // Claude refinement
  refinementRationale?, implementationGuidance?, refinedAt?,
  refinementCount (default 0),  // max 3 refinements
  createdAt, updatedAt
}
// updateSliSchema = insert schema, .omit(id, userId, adminId, timestamps).partial()
```

#### `homework_assignments`
```ts
homework_assignments: { id, userId, adminId, questionText, answerText?, createdAt, updatedAt }
```

### 5.8 Guided coaching: Foundation Sessions & Enhancement Modules

#### `foundation_sessions`
Sessions **1–3**, each with a typed `completionData` payload that differs per session:
```ts
foundation_sessions: {
  id, userId (cascade), sessionNumber (1..3),
  status (session_status, default "locked"),
  startedAt?, completedAt?, timerElapsed (default 0, seconds),
  completionData: jsonb {            // union of per-session fields:
    // Session 1 — functional identity
    primaryFunction?, secondaryFunction?, functionalSplit? {primary, secondary},
    antiGeneralistCommitment?, commitmentStatement?, functionalLanguageExamples?,
    keyInsights?, confidence?, reasoning?,
    // Session 2 — credibility
    credibilityTier? (1..5), proofBullets?, brandClaim?, checkWorthyReason?, nextSteps?,
    // Session 3 — signature story
    signatureStory? { title, context, challenge, approach, tension, outcome, repeatability },
    contentAngles?, methodology?,
    completedAt?
  },
  createdAt, updatedAt
}
// Constraints:
//   unique(userId, sessionNumber)
//   check: sessionNumber BETWEEN 1 AND 3
//   index(userId, sessionNumber)
```

#### `foundation_session_messages`
```ts
foundation_session_messages: {
  id, sessionId (cascade), role (message_role), content, createdAt
}
// index(sessionId, createdAt)
```

#### `enhancement_modules`
Independent modules **A / B / C** (no locked state — all `available` by default).
`completionData` carries module‑specific fields plus legacy/back‑compat fields:
```ts
enhancement_modules: {
  id, userId (cascade), moduleCode (varchar(1): 'A'|'B'|'C'),
  status (session_status, default "available"),
  startedAt?, completedAt?, timerElapsed (default 0),
  completionData: jsonb {  // Module A digital behavior, Module B network mapping,
                           // Module C career-aspiration alignment + legacy fields
    ... (brandClaim, contentStrategy, networkAnalysis, backwardsNarrative,
         tierClassification, alignmentStatement, positioningScore, etc.)
  },
  createdAt, updatedAt
}
// Constraints:
//   unique(userId, moduleCode)
//   check: moduleCode IN ('A','B','C')
//   index(userId, moduleCode)
```

#### `enhancement_module_messages`
```ts
enhancement_module_messages: {
  id, moduleId (cascade), role (message_role), content, createdAt
}
// index(moduleId, createdAt)
```

### 5.9 Payments & intake

#### `transactions`
```ts
transactions: {
  id, userId, stripePaymentId?, stripeSessionId?,
  amount (int, cents), currency (default "usd"),
  tier (subscription_tier), status (payment_status, default "pending"),
  createdAt, updatedAt
}
```

#### `branding_intakes`
Platform‑specific multi‑stage intake form (one per user):
```ts
branding_intakes: {
  id, userId (unique), platform (branding_intake_platform),
  currentStage (int, default 1), responses (jsonb, default {}),
  completed (bool, default false), marketingOptIn (bool, default false),
  createdAt, updatedAt
}
```

### 5.10 Composite read type — `UserProfile`
`getUserProfile(userId)` composes a user with all related collections:
```ts
type UserProfile = User & {
  experiences?, education?, skills?, languages?, profile?, questionnaire?,
  brandingIntake?, documents?, conversations?, conversationSummaries?,
  monthlyCheckIns?, freshnessReports?, coachingNotes?, slis?,
  linkedinOptimizations?, homeworkAssignments?, foundationSessions?
};
```

---

## 6. Storage Layer (`IStorage`)

All persistence goes through the **`IStorage`** interface defined in
`server/storage.ts`. Two implementations exist:

- **`MemStorage`** — in‑memory (used for tests / fallback).
- **`DatabaseStorage`** (`server/database-storage.ts`) — the **active** implementation,
  backed by Drizzle + Neon Postgres. Both expose a `sessionStore` for
  `express-session`.

Routes overwhelmingly go through `storage.<method>()` rather than touching Drizzle
directly. A few admin/export paths in `server/routes.ts` (e.g. transcript aggregation)
import `db` and run Drizzle queries directly; new code should prefer the storage
interface. Representative storage methods (grouped):

```ts
// Users
getUser, getUserByUsername, getUserByLinkedinId, createUser, updateUser,
updateUserPassword, updateLinkedinTokens, getNonAdminUsers, getAllUsers

// Profile sub-records
getExperiences/Educations/Skills/Languages (+ get/create/update/delete each)
getProfile, createProfile, updateProfile

// Questionnaire / password reset
getQuestionnaire, createQuestionnaire, updateQuestionnaire
createPasswordReset, getPasswordResetByToken, markPasswordResetAsUsed

// Composite
getUserProfile(userId): UserProfile

// Conversations / messages / summaries
getConversations, getConversation, createConversation, updateConversation, deleteConversation
getMessages, createMessage
getConversationSummary(ById/ByConversationId/list), createConversationSummary

// Monthly check-ins / freshness reports
get/create/update/delete MonthlyCheckIn (+ byMonth)
get/getLatest/create/update/delete FreshnessReport

// Coaching artifacts
getCoachingNotes/get/create/update/delete
getSlisByUserId/getSli/createSli/updateSli/deleteSli
getHomeworkAssignments/get/create/update/delete

// LinkedIn
getLinkedinOptimizations/get/getLatest/create
getLinkedinContentDrafts/get/getLatest/create
getLinkedinPostShare/create/increment

// Foundation sessions / Enhancement modules
getFoundationSessions/get/create/update; getFoundationSessionMessages/create
getEnhancementModulesForUser/get/getWithMessages/create/update
getEnhancementModuleMessages/create

// Payments / intake
getTransactions/get/create/update
getBrandingIntake, upsertBrandingIntake
```

---

## 7. Authentication & Authorization

Defined in **`server/auth.ts`**.

### Sessions
- `express-session` with **`connect-pg-simple`** Postgres session store
  (`storage.sessionStore`).
- Cookie: HTTP‑only; `maxAge` 24h. Secret from `SESSION_SECRET`
  (falls back to a dev default if unset — set it in production).

### Strategies
1. **LocalStrategy** (`passport-local`)
   - Username = email; password verified with **scrypt + salt** (Node `crypto`).
   - Hash format: `scrypt(password, salt)` stored as `"<hex>.<salt>"`; comparison uses
     `timingSafeEqual`.
2. **LinkedIn OpenID Connect** — implemented with `passport-oauth2`'s
   `OAuth2Strategy` (strategy renamed to `"linkedin"`), using scopes
   `["openid", "profile", "email", "w_member_social"]`.
   - Requires `LINKEDIN_CLIENT_ID`, `LINKEDIN_CLIENT_SECRET`, `LINKEDIN_CALLBACK_URL`.
   - After token exchange, the profile is fetched manually from the OIDC userinfo
     endpoint (`https://api.linkedin.com/v2/userinfo`).
   - On callback, finds/creates a user by `linkedinId`, stores tokens via
     `updateLinkedinTokens`.

### Password policy
Minimum 8 characters with uppercase, lowercase, and numeric requirements
(enforced via Zod on register / reset).

### Route guards
```ts
isAuthenticated(req,res,next)  // 401 if !req.isAuthenticated()
isAdmin(req,res,next)          // 401 if not logged in, 403 if !req.user.isAdmin
```

### Password reset flow
1. `POST /api/forgot-password` → create token (`password_resets`), email link via SendGrid.
2. `POST /api/reset-password` → validate token (unexpired, unused), update password,
   mark token used.

---

## 8. HTTP API Reference

> Convention: routes under `/api`. `🔒` = `isAuthenticated`, `👑` = `isAdmin`,
> 🔓 = public. Request bodies are validated with Zod schemas from `shared/schema.ts`.

### 8.1 Auth (`server/auth.ts`)
| Method | Path | Guard | Purpose |
|--------|------|-------|---------|
| POST | `/api/register` | 🔓 | Create account (local) |
| POST | `/api/login` | 🔓 | Local login |
| POST | `/api/logout` | 🔒 | End session |
| GET | `/api/user` | 🔒 | Current user (returns 401 if not logged in) |
| GET | `/api/user/profile` | 🔒 | Current user's basic profile |
| POST | `/api/forgot-password` | 🔓 | Send reset email |
| POST | `/api/reset-password` | 🔓 | Reset via token |
| GET | `/api/auth/linkedin` | 🔓 | Begin LinkedIn OAuth |
| GET | `/api/auth/linkedin/callback` | 🔓 | OAuth callback |

### 8.2 Profile, onboarding & sub‑records (`server/routes.ts`)
| Method | Path | Guard | Purpose |
|--------|------|-------|---------|
| PATCH | `/api/profile` | 🔒 | Update profile fields |
| PATCH | `/api/user/onboarding` | 🔒 | Save onboarding (status, discovery source) |
| GET | `/api/user/profile` | 🔒 | Full composed `UserProfile` |
| GET/POST | `/api/experiences` | 🔒 | List / add experience |
| PUT/DELETE | `/api/experiences/:id` | 🔒 | Update / delete experience |
| GET/POST | `/api/education` | 🔒 | List / add education |
| PUT/DELETE | `/api/education/:id` | 🔒 | Update / delete education |
| GET/POST | `/api/skills` | 🔒 | List / add skill |
| DELETE | `/api/skills/:id` | 🔒 | Delete skill |
| GET/POST | `/api/languages` | 🔒 | List / add language |
| DELETE | `/api/languages/:id` | 🔒 | Delete language |

### 8.3 Questionnaire (`server/routes.ts`)
| Method | Path | Guard | Purpose |
|--------|------|-------|---------|
| GET | `/api/questionnaire` | 🔒 | Get questionnaire |
| POST | `/api/questionnaire` | 🔒 | Create questionnaire |
| POST | `/api/questionnaire/...` (draft) | 🔒 | Save draft (see file) |
| PUT | `/api/questionnaire` | 🔒 | Update questionnaire |

### 8.4 Documents (`server/routes.ts`)
| Method | Path | Guard | Purpose |
|--------|------|-------|---------|
| GET | `/api/documents` | 🔒 | List documents |
| GET | `/api/documents/:id` | 🔒 | Get document |
| POST | `/api/documents` | 🔒 | Upload (Base64) |
| DELETE | `/api/documents/:id` | 🔒 | Delete |
| PATCH | `/api/documents/:id/analysis` | 🔒 | Save AI analysis |

### 8.5 Monthly check‑ins (`server/routes.ts`)
| Method | Path | Guard |
|--------|------|-------|
| GET | `/api/monthly-check-ins` | 🔒 |
| GET | `/api/monthly-check-ins/:id` | 🔒 |
| GET | `/api/monthly-check-ins/month/:month` | 🔒 |
| POST | `/api/monthly-check-ins` | 🔒 |
| PUT | `/api/monthly-check-ins/:id` | 🔒 |
| DELETE | `/api/monthly-check-ins/:id` | 🔒 |

### 8.6 Branding intake (`server/routes.ts`)
| Method | Path | Guard | Purpose |
|--------|------|-------|---------|
| GET | `/api/branding-intake` | 🔒 | Get intake |
| POST | `/api/branding-intake` | 🔒 | Upsert intake (stage/responses) |

### 8.7 Freshness reports (`server/freshness-routes.ts`)
| Method | Path | Guard | Purpose |
|--------|------|-------|---------|
| GET | `/api/freshness-reports` | 🔒 | List |
| GET | `/api/freshness-reports/latest` | 🔒 | Latest |
| GET | `/api/freshness-reports/previous` | 🔒 | Second-newest |
| GET | `/api/freshness-reports/:id` | 🔒 | One (ownership-checked) |
| POST | `/api/freshness-reports` | 🔒 | **Generate** (multi-step Claude pipeline) |
| DELETE | `/api/freshness-reports/:id` | 🔒 | Delete (ownership-checked) |

### 8.8 SLIs (`server/sli-routes.ts`)
| Method | Path | Guard | Purpose |
|--------|------|-------|---------|
| POST | `/api/admin/users/:userId/slis/generate` | 👑 | Generate 3 SLIs via Claude |
| GET | `/api/admin/users/:userId/slis` | 👑 | List user's SLIs |
| GET | `/api/admin/slis/:id` | 👑 | Get SLI |
| PATCH | `/api/admin/slis/:id` | 👑 | Update SLI |
| DELETE | `/api/admin/slis/:id` | 👑 | Delete SLI |
| GET | `/api/user/sli` | 🔒 | User's current SLI |
| GET | `/api/user/slis` | 🔒 | User's SLIs |
| PATCH | `/api/user/slis/:id` | 🔒 | Select/customize SLI |
| POST | `/api/user/sli/refine` | 🔒 | Refine SLI via Claude (max 3) |

### 8.9 LinkedIn optimization (`server/linkedin-optimization-routes.ts`)
| Method | Path | Guard |
|--------|------|-------|
| GET | `/api/linkedin-optimizations` | 🔒 |
| GET | `/api/linkedin-optimizations/latest` | 🔒 |
| GET | `/api/linkedin-optimizations/:id` | 🔒 |
| POST | `/api/linkedin-optimizations/generate` | 🔒 |

### 8.10 LinkedIn content drafts (`server/linkedin-content-routes.ts`)
| Method | Path | Guard | Purpose |
|--------|------|-------|---------|
| GET | `/api/linkedin-content-drafts` | 🔒 | List |
| GET | `/api/linkedin-content-drafts/latest` | 🔒 | Latest |
| GET | `/api/linkedin-content-drafts/:id` | 🔒 | One |
| POST | `/api/linkedin-content-drafts/generate` | 🔒 | Generate 2 posts via Claude |
| POST | `/api/linkedin-content-drafts/:draftId/post/:postNumber` | 🔒 | Record a share |
| GET | `/api/linkedin-content-drafts/:draftId/shares/:postNumber` | 🔒 | Share count |

### 8.11 Foundation Sessions (`server/foundation-sessions-routes.ts`)
| Method | Path | Guard | Purpose |
|--------|------|-------|---------|
| GET | `/api/foundation-sessions` | 🔒 | All sessions for user |
| GET | `/api/foundation-sessions/:sessionNumber` | 🔒 | Session + messages |
| POST | `/api/foundation-sessions/:sessionNumber/start` | 🔒 | Start session |
| POST | `/api/foundation-sessions/:sessionNumber/messages` | 🔒 | Send message (non-stream) |
| POST | `/api/foundation-sessions/:sessionNumber/messages/stream` | 🔒 | Send message (SSE stream) |
| POST | `/api/foundation-sessions/:sessionNumber/end-early` | 🔒 | End early + analysis |
| PATCH | `/api/foundation-sessions/:sessionNumber` | 🔒 | Update session (status/completion) |
| PATCH | `/api/foundation-sessions/:sessionNumber/timer` | 🔒 | Persist timer |

### 8.12 Enhancement Modules (`server/enhancement-modules-routes.ts`)
| Method | Path | Guard | Purpose |
|--------|------|-------|---------|
| GET | `/api/enhancement-modules` | 🔒 | All modules for user |
| GET | `/api/enhancement-modules/:moduleCode` | 🔒 | Module + messages |
| POST | `/api/enhancement-modules/:moduleCode/start` | 🔒 | Start module |
| POST | `/api/enhancement-modules/:moduleCode/messages/stream` | 🔒 | Send message (SSE stream) |
| POST | `/api/enhancement-modules/:moduleCode/message` | 🔒 | Send message (non-stream) |
| PATCH | `/api/enhancement-modules/:moduleCode` | 🔒 | Update module |
| GET | `/api/admin/users/:userId/enhancement-modules` | 👑 | Admin view |

### 8.13 Homework (`server/homework-routes.ts`)
| Method | Path | Guard | Purpose |
|--------|------|-------|---------|
| GET | `/api/admin/users/:userId/homework` | 👑 | List a user's homework |
| POST | `/api/admin/users/:userId/homework` | 👑 | Assign homework |
| PATCH | `/api/admin/homework/:id` | 👑 | Edit homework |
| DELETE | `/api/admin/homework/:id` | 👑 | Delete |
| GET | `/api/user/homework` | 🔒 | My homework |
| PATCH | `/api/user/homework/:id/answer` | 🔒 | Submit answer |

### 8.14 Admin & coaching (`server/routes.ts`)
| Method | Path | Guard | Purpose |
|--------|------|-------|---------|
| GET | `/api/admin/users` | 👑 | List users |
| GET | `/api/admin/users/count` | 👑 | Count |
| GET | `/api/admin/users/:id` | 👑 | User detail |
| GET | `/api/admin/users/:userId/foundation-sessions` | 👑 | Sessions |
| GET | `/api/admin/users/:userId/foundation-sessions/:sessionNumber/messages` | 👑 | Transcript |
| GET | `/api/admin/users/:userId/enhancement-modules/:moduleCode/messages` | 👑 | Transcript |
| GET | `/api/admin/users/:userId/coaching-notes` | 👑 | Notes |
| GET | `/api/admin/coaching-notes/:id` | 👑 | Note |
| POST | `/api/admin/coaching-notes` | 👑 | Create note |
| PUT | `/api/admin/coaching-notes/:id` | 👑 | Update note |
| DELETE | `/api/admin/coaching-notes/:id` | 👑 | Delete note |
| GET | `/api/admin/export/questionnaire` | 👑 | Export (Excel) |
| GET | `/api/admin/export/branding-intake` | 👑 | Export |
| GET | `/api/admin/export/users` | 👑 | Export |
| GET | `/api/admin/export/chatbot-sessions` | 👑 | Export |
| GET | `/api/admin/export/transcripts` | 👑 | Export |
| GET | `/api/debug/users` | 👑 | Debug list |

### 8.15 Payments (`server/payment-routes.ts`)
| Method | Path | Guard | Purpose |
|--------|------|-------|---------|
| POST | `/api/payments/webhook` | 🔓 (raw body) | Stripe webhook (signature-verified in prod) |
| POST | `/api/payments/create-checkout-session` | 🔒 | Create Stripe Checkout session |
| GET | `/api/payments/subscription-status` | 🔒 | Current tier/status (auto-expires) |
| POST | `/api/payments/cancel-subscription` | 🔒 | Cancel subscription |

---

## 9. AI & Prompt Architecture

SLI.pro uses **Anthropic Claude** for all generative work. The model is configurable:

```ts
const CLAUDE_MODEL = process.env.CLAUDE_MODEL || "claude-sonnet-4-20250514";
```
(Some modules — e.g. `freshness-report.ts` — hardcode `"claude-sonnet-4-20250514"`.)

Each Claude integration follows a common pattern:
- A `callClaude(systemPrompt, userPrompt, …)` helper that issues
  `anthropic.messages.create(...)`.
- **Retry with exponential backoff** on rate‑limit (`429` / `rate_limit_error`).
- **Robust JSON extraction**: strips markdown code fences, runs a balanced‑brace
  regex, falls back to a manual bracket scan, and finally returns a typed default
  object if parsing fails — so the pipeline degrades gracefully rather than crashing.
- Long user prompts are truncated (e.g. to ~150k chars) to control token cost.

### 9.1 Status‑based prompt strategy

Both guided‑coaching surfaces select prompts based on the user's
`professionalStatus`. This is a **strategy pattern**:

```ts
// server/prompts/index.ts
getPromptSet(professionalStatus): PromptSet
  "undergraduate_or_recent_grad" → undergraduateRecentGradPrompts
  "early_career"                 → earlyCareerPrompts
  "mid_career_or_senior"         → midCareerSeniorPrompts
  "career_break_or_transition"   → midCareerSeniorPrompts (default)
  (undefined / other)            → midCareerSeniorPrompts
```

#### Foundation Sessions — `server/prompts/`
```ts
interface PromptSet {
  getSystemPrompt(ctx: SessionPromptContext): string;
  getAnalysisPrompt(sessionNumber, messages, questionnaireContext, previousSessionsContext): string;
  getInitialGuidanceMessage(sessionNumber): string | null;
}

interface SessionPromptContext {
  sessionNumber: number;
  resumeSummary?: string;
  priorSessions?: PriorSessionContext[];   // { sessionNumber, completionData, conversationTranscript }
}
```
- `getSystemPrompt` builds the coaching persona/instructions for the given session,
  injecting resume + prior‑session context.
- `getAnalysisPrompt` is used at session end to extract structured `completionData`
  (Session 1 functional identity, Session 2 credibility, Session 3 signature story).
- `getInitialGuidanceMessage` seeds the conversation with an opening prompt.

#### Enhancement Modules — `server/enhancement-module-prompts/`
```ts
interface ModulePromptSet {
  getSystemPrompt(moduleCode, ctx: ModulePromptContext): string;
  getAnalysisPrompt(moduleCode, messages, questionnaireContext, foundationSessionsContext, previousModulesContext): string;
  getInitialGuidanceMessage(moduleCode): string | null;
}

interface ModulePromptContext {
  resumeSummary; questionnaireSummary; foundationSessionsSummary; sliSummary;
  conversationSummaryContext; brandingIntakeContext; homeworkContext;
  linkedinOptimizationContext; previousSummaries; userProfile;
}
```
- `moduleCode` (`'A' | 'B' | 'C'`) is a **parameter** (not a separate file), so a
  single status implementation handles all three modules.
- The three status files (`undergraduate-recent-grad`, `early-career`,
  `mid-career-senior`) are independent and currently carry **different** prompt text,
  so each audience is tuned separately. (Note: the `replit.md` overview still describes
  them as identical — that note is out of date relative to the current source.)

### 9.2 Streaming
Foundation Sessions and Enhancement Modules expose `/messages/stream` endpoints that
stream Claude output to the browser (Server‑Sent Events), giving a typing‑style UX.
Non‑streaming variants (`/messages`, `/message`) also exist.

### 9.3 Other Claude integrations
- **`server/claude.ts`** — general coaching chat helpers.
- **`server/sli.ts`** — generates three candidate SLIs and refines a chosen SLI
  (`DEBUG_SLI` env enables verbose logging).
- **`server/linkedin-optimization.ts`** — produces the structured
  `linkedin_optimizations` payload.
- **`server/linkedin-content-routes.ts`** — generates two LinkedIn post drafts.
- **`server/freshness-report.ts`** — the multi‑step freshness pipeline (see §10).

---

## 10. Freshness Report Pipeline

`POST /api/freshness-reports` orchestrates a **sequential, multi‑step Claude
analysis** (`server/freshness-routes.ts` + `server/freshness-report.ts`):

Preconditions: the user must have a completed **questionnaire** and uploaded both a
**resume** and a **LinkedIn** document (else `400` with `missingDocuments`).

Steps:
1. **Questionnaire analysis** — `generateQuestionnaireSummary(userProfile)` →
   structured JSON (professional identity, aspirations, challenges, digital presence,
   recommended positioning).
2. **Resume analysis** — two‑step for token efficiency:
   - `summarizeResumeContent(resumeText)` (extract career trajectory, skills,
     accomplishments, presentation style),
   - `analyzeResumeAlignment(resumeSummary, questionnaireAnalysis)` (consistencies,
     discrepancies, gaps, congruence). Resume text is extracted from the stored
     Base64 file via `document-extractor`.
3. **LinkedIn analysis** — `generateLinkedInSummary(linkedinText, questionnaire,
   resume)` (profile completeness, networking, content strategy, brand projection,
   comparison to resume).
4. **Additional documents** — `generateAdditionalDocsSummary(...)` for any non‑resume,
   non‑LinkedIn docs.
5. **Context gathering** — monthly check‑ins and the previous freshness report (each
   failure‑tolerant: the report continues even if these fail).
6. **Final synthesis** — `generateFinalSynthesis(...)` combines everything into the
   final report.
7. **Validate** with `insertFreshnessReportSchema` and **persist** via
   `storage.createFreshnessReport`.

Resilience: each step is wrapped in try/catch with explicit step logging; JSON parsing
has multi‑level fallbacks (including a fully‑formed default report structure) so a
malformed Claude response does not abort the whole job.

---

## 11. Realtime Voice (WebSocket + Whisper)

Voice‑to‑text powers the Foundation Session and Enhancement Module chat pages.

- **Frontend**: `useVoiceRecording` hook (`client/src/hooks/use-voice-recording.tsx`)
  uses the `MediaRecorder` API to capture audio and opens a WebSocket to `/ws/voice`.
- **Server upgrade** (`server/realtime/websocket-handler.ts`): the HTTP `upgrade`
  event is intercepted for path `/ws/voice`. The session cookie is replayed through
  the same `express-session` middleware to authenticate the user (rejects with
  `401` if there is no `passport.user`).
- **Protocol** (JSON messages over WS):
  - client → `{ type: "start" }` → server creates an `OpenAIRealtimeSession`, replies
    `{ type: "ready" }`.
  - client → `{ type: "audio_data", data, mimeType }` → server transcribes.
  - server → `{ type: "transcription_complete", text }` or `{ type: "error", error }`.
- **Transcription** (`server/realtime/openai-realtime.ts`): uses the OpenAI SDK with
  model **`whisper-1`**. Requires `OPENAI_API_KEY`.
- Frontend retry logic: exponential backoff (1s/2s/3s), 3 attempts, 30s timeout, audio
  cached in memory so retries don't require re‑recording.

---

## 12. Payments (Stripe)

Implemented in `server/payment-routes.ts` using the `stripe` SDK
(`STRIPE_SECRET_KEY`). Replit integration: `javascript_stripe`.

### Tiers & pricing
| Tier | Amount | Stripe mode |
|------|--------|-------------|
| `premium` | **$129.00** (`12900` cents) | `payment` (one‑time) |
| `subscription` | **$39.00/mo** (`3900` cents) | `subscription` (recurring) |

Checkout uses inline `price_data` / `product_data` (no pre‑created Price IDs) with
metadata identifying the user and tier. A `transactions` row is recorded.

Business rules:
- Cannot purchase the tier you already hold.
- Cannot downgrade from active `subscription` → `premium` (must cancel first).

### Webhook
`POST /api/payments/webhook` reads the **raw body** (registered before `express.json()`).
In production the Stripe signature is verified with `STRIPE_WEBHOOK_SECRET`; in dev,
verification is skipped with a warning. Handled events include
`customer.subscription.updated` / `.deleted` → `handleSubscriptionUpdate(...)` which
updates the user's `subscriptionStatus`.

### Status & cancel
- `GET /api/payments/subscription-status` returns the current tier/status and
  **auto‑expires** a subscription whose `subscriptionExpiresAt` has passed.
- `POST /api/payments/cancel-subscription` cancels the subscription.

---

## 13. Email (SendGrid)

`server/email-service.ts` sends transactional email via **`@sendgrid/mail`**
(`SENDGRID_API_KEY`). Primary use: password‑reset links with a secure token. If the
key is missing the service fails gracefully (logs an error rather than crashing).

---

## 14. Frontend Architecture

### Entry & routing
`client/src/main.tsx` mounts `App`. `client/src/App.tsx` declares all routes with
**wouter**. `ProtectedRoute` (in `client/src/lib`) redirects unauthenticated users to
`/auth`.

**Client (protected)**
```
/                              NewDashboardPage
/profile                       ProfilePage
/profile/create                ProfileCreationPage
/questionnaire                 QuestionnairePage
/summaries                     SummaryPage
/conversations/:id/summary     (summary view)
/monthly-check-in              MonthlyCheckInPage
/freshness-report              FreshnessReportPage
/sli-selection                 SliSelectionPage
/sli-refinement                SliRefinementPage
/linkedin-optimization         LinkedInOptimizationPage
/linkedin-optimization/generate
/linkedin-optimization/:id
/linkedin-content-drafts       LinkedInContentDraftsPage
/homework                      HomeworkPage
/foundation                    FoundationPage
/foundation/session/:sessionNumber   FoundationSessionChatPage
/enhancement-modules           EnhancementModulesPage
/enhancement-modules/:moduleCode     EnhancementModuleChatPage
/dashboard                     NewDashboardPage
/branding-intake               BrandingIntakePage
```
**Public / admin**
```
/auth                          AuthPage
/reset-password                ResetPasswordPage
/admin/login                   AdminLoginPage
/admin/dashboard               AdminDashboardPage
/admin/users, /admin/users/:id, .../coaching-notes, .../summary, .../sli,
/admin/users/:userId/homework, /admin/users/:userId/transcripts
/admin/reports                 AdminReportsPage
*                              NotFound
```

### State & data
- **TanStack Query v5** (`client/src/lib/queryClient.ts`) provides a default fetcher,
  so queries omit their own `queryFn`. Mutations use `apiRequest(...)` and invalidate
  caches by `queryKey`. Hierarchical keys use array segments
  (e.g. `['/api/foundation-sessions', sessionNumber]`).
- **Auth context**: `client/src/hooks/use-auth.tsx` exposes the current user and
  login/logout/register mutations.
- **Other hooks**: `use-voice-recording` (mic + WS), `use-session-timer` (coaching
  timers), `use-toast`, `use-mobile`, `use-navigation`.

### Styling & theming
- `theme.json` drives the shadcn theme:
  ```json
  { "variant": "professional", "primary": "hsl(167, 23%, 79%)",
    "appearance": "light", "radius": 0.5 }
  ```
- Tailwind + Radix‑based components in `client/src/components/ui`.
- Icons: `lucide-react`; brand logos: `react-icons/si`.

---

## 15. Environment Variables & Secrets

| Variable | Required | Used by | Purpose |
|----------|:--------:|---------|---------|
| `DATABASE_URL` | ✅ | `server/db.ts` | Neon Postgres connection string |
| `SESSION_SECRET` | ✅ (prod) | `auth.ts`, `realtime/websocket-handler.ts` | Session cookie signing (dev fallback exists) |
| `ANTHROPIC_API_KEY` | ✅ | claude/sli/linkedin/freshness/routes | Claude AI access |
| `CLAUDE_MODEL` | optional | claude/sli/linkedin/routes | Override model (default `claude-sonnet-4-20250514`) |
| `OPENAI_API_KEY` | ✅ (voice) | `realtime/openai-realtime.ts` | Whisper transcription |
| `STRIPE_SECRET_KEY` | ✅ (**startup**) | `payment-routes.ts` | Stripe API. **Required for the server to boot** — `payment-routes.ts` throws at module load if it is missing. |
| `STRIPE_WEBHOOK_SECRET` | ✅ (prod payments) | `payment-routes.ts` | Verify webhook signatures |
| `SENDGRID_API_KEY` | ✅ (email) | `email-service.ts` | Password‑reset email |
| `LINKEDIN_CLIENT_ID` | optional | `auth.ts` | LinkedIn OAuth |
| `LINKEDIN_CLIENT_SECRET` | optional | `auth.ts` | LinkedIn OAuth |
| `LINKEDIN_CALLBACK_URL` | optional | `auth.ts` | LinkedIn OAuth redirect |
| `NODE_ENV` | auto | `auth.ts`, `index.ts` | `development` vs `production` |
| `REPLIT_DEPLOYMENT` | auto | `auth.ts` | Detect deployed env |
| `REPLIT_DEV_DOMAIN` | auto | `auth.ts` | Build OAuth callback in dev |
| `DEBUG_SLI` | optional | `sli.ts` | Verbose SLI logging |

> On Replit, set these via the Secrets pane (never commit them). Locally, use a `.env`
> or your shell environment. Secrets are read with `process.env.*` at runtime.

---

## 16. From‑Scratch Setup Guide

### 16.1 Prerequisites
- **Node.js 20** and **npm**
- A **PostgreSQL 16** database (Neon recommended; any Postgres works via
  `DATABASE_URL`)
- API keys: Anthropic (required), OpenAI (voice), Stripe + webhook secret (payments),
  SendGrid (email). LinkedIn OAuth optional.

### 16.2 Install
```bash
git clone <repo-url>
cd <repo>
npm install
```
> On Replit, dependencies install automatically via the workflow
> (`packager.installForAll`). Do **not** hand‑edit `package.json` — use the package
> manager / install tooling.

### 16.3 Configure environment
Create the variables from §15. **Minimum required for the server to boot:**
```bash
DATABASE_URL="postgres://user:pass@host/db?sslmode=require"
SESSION_SECRET="a-long-random-string"
ANTHROPIC_API_KEY="sk-ant-..."
STRIPE_SECRET_KEY="sk_test_..."   # REQUIRED — payment-routes.ts throws on load if absent
```
Add these to enable the remaining features:
```bash
OPENAI_API_KEY="sk-..."           # voice transcription
STRIPE_WEBHOOK_SECRET="whsec_..." # required to verify webhooks in production
SENDGRID_API_KEY="SG...."         # password-reset email
LINKEDIN_CLIENT_ID="..."          # LinkedIn OIDC login (optional)
LINKEDIN_CLIENT_SECRET="..."
LINKEDIN_CALLBACK_URL="https://<your-domain>/api/auth/linkedin/callback"
```
On Replit, add each as a **Secret** (see the environment‑secrets workflow). The
LinkedIn callback in dev is derived from `REPLIT_DEV_DOMAIN`.

### 16.4 Create the database schema
The project uses **Drizzle Kit push** (schema is the source of truth; no SQL
migration files to run):
```bash
npm run db:push        # drizzle-kit push — syncs shared/schema.ts to the DB
```
> Do **not** edit `drizzle.config.ts`. If `db:push` reports a destructive change you
> didn't intend, review your schema edits before confirming.

### 16.5 Run in development
```bash
npm run dev            # tsx server/index.ts → Express + Vite on port 5000
```
- App: `http://localhost:5000` (Replit serves it on the preview/external URL).
- The same process serves the API, the Vite‑powered client, and the `/ws/voice`
  WebSocket.
- On Replit, the **"Start application"** workflow runs `npm run dev` for you and waits
  for port 5000.

### 16.6 Create an admin user
Admin access is gated by `users.isAdmin`. Register a normal account, then promote it
directly in the database:
```sql
UPDATE users SET is_admin = true WHERE username = 'you@example.com';
```
Then log in at `/admin/login`.

### 16.7 Stripe webhook (local testing)
Use the Stripe CLI to forward events to the local webhook:
```bash
stripe listen --forward-to localhost:5000/api/payments/webhook
```
Copy the printed signing secret into `STRIPE_WEBHOOK_SECRET`.

### 16.8 Build & run for production
```bash
npm run build          # vite build (client) + esbuild bundle (server → dist/)
npm run start          # NODE_ENV=production node dist/index.js
```
On Replit, deployment is configured for **autoscale** in `.replit`:
- build: `npm run build`
- run: `npm run start`
- port `5000` → external `80`

### 16.9 Useful scripts
| Script | Command | Purpose |
|--------|---------|---------|
| `dev` | `tsx server/index.ts` | Dev server (Express + Vite) |
| `build` | `vite build && esbuild server/index.ts …` | Production bundle |
| `start` | `NODE_ENV=production node dist/index.js` | Run production build |
| `check` | `tsc` | Type‑check the whole project |
| `db:push` | `drizzle-kit push` | Sync schema to the database |

### 16.10 Things never to change
- `vite.config.ts` and `server/vite.ts` (frontend/backend single‑port serving).
- `drizzle.config.ts`.
- `package.json` by hand (use the package manager).
These are pre‑configured for the Replit environment; modifying them will break the
dev/preview pipeline.

---

*This document describes the codebase as of the current revision. When the schema,
routes, or AI prompts change, update the corresponding section here so it remains the
authoritative architecture reference.*
