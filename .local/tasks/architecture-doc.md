# Write detailed ARCHITECTURE.md

## What & Why
Create a single, comprehensive `ARCHITECTURE.md` at the project root that fully documents SLI.pro — its purpose, architecture, structure, features, data model, API surface, AI/prompt system, and a from-scratch setup guide. The goal is a document detailed enough that a new developer could recreate the project from zero. The user requested maximum detail: include real code snippets, exact schema/table definitions, and full API endpoint lists.

## Done looks like
- A new `ARCHITECTURE.md` file exists at the project root.
- It gives a complete, accurate picture of the project covering: overview, tech stack, repo structure, frontend architecture, backend architecture, full data model, API endpoints, authentication/sessions, AI/prompt system, voice-to-text, payments, email, and a step-by-step setup/run guide.
- Content reflects the actual code (verified against the real files), not assumptions — exact table/column definitions, real route paths, and real env var names.
- Code snippets and schema blocks are included and accurate.

## Out of scope
- No code changes to the application itself — documentation only.
- No changes to `replit.md` or other existing docs.
- Not generating per-module separate docs; everything goes in one `ARCHITECTURE.md`.

## Content outline (sections the document must contain)
1. **Project Overview** — what SLI.pro is, who it's for, the core value (SLIs, Foundation Sessions, Enhancement Modules, Freshness Reports, LinkedIn optimization, admin coaching).
2. **Tech Stack** — frontend, backend, database, AI services, payments, email, voice, with versions where relevant.
3. **Repository Structure** — annotated directory tree of `client/`, `server/`, `shared/`, and root config files.
4. **Frontend Architecture** — React 18 + TS, Vite, wouter routing (full page list + routes), TanStack Query patterns, auth context (`use-auth`), protected routes, shadcn/Tailwind/theme.json, voice recording hook, forms with react-hook-form + zod.
5. **Backend Architecture** — Express entry (`server/index.ts`), how Vite middleware serves frontend in dev vs static in prod, the route-module registration pattern, thin-routes-over-storage pattern.
6. **Data Model** — for every table in `shared/schema.ts`: exact column definitions (code block), insert schema, types, and relationships. Cover users, profiles, experiences, education, skills, languages, documents, questionnaires, conversations, messages, conversation_summaries, foundation_sessions(+messages), enhancement_modules(+messages), slis, linkedin_optimizations, linkedin_content_drafts, linkedin_post_shares, homework_assignments, coaching_notes, monthly_check_ins, password_resets, sessions, and any others present.
7. **Storage Layer** — the `IStorage` interface and `DatabaseStorage`/`MemStorage` implementations, session store via connect-pg-simple, the composite user-profile retrieval.
8. **API Reference** — every route grouped by module (core routes.ts, sli-routes, foundation-sessions-routes, enhancement-modules-routes, freshness-routes, homework-routes, linkedin-*-routes, payment-routes): method, path, auth requirement (auth/admin), purpose, and key request/response shape.
9. **Authentication & Sessions** — Passport Local (scrypt hashing) + LinkedIn OAuth2/OIDC, session cookies config, password reset token flow, isAdmin middleware.
10. **AI & Prompt Architecture (in depth)** — Claude integration (`server/claude.ts`), the status-based PromptSet pattern in `server/prompts/` and `server/enhancement-module-prompts/` (interfaces, selector functions, the three professional-status implementations), Foundation Session phases, the multi-step Freshness Report pipeline (`server/freshness-report.ts`), document analysis.
11. **Voice-to-Text** — `useVoiceRecording` hook, WebSocket handler, OpenAI Realtime/Whisper transcription, retry/timeout logic.
12. **Payments** — Stripe integration (`server/payment-routes.ts`) and tiers.
13. **Email** — SendGrid usage for password resets.
14. **Build, Run & Deploy** — `npm` scripts (dev/build/start/check/db:push), dev vs production behavior, port, Drizzle migrations.
15. **Setup from Scratch** — ordered steps: install Node deps, provision PostgreSQL, set required environment variables/secrets (DATABASE_URL, ANTHROPIC_API_KEY, OPENAI_API_KEY, SendGrid key, Stripe keys, LinkedIn OAuth creds, SESSION_SECRET — list the exact names found in code), run db:push, run dev, build for production.
16. **Environment Variables** — table of every env var the code reads, what it's for, and whether it's required.

## Steps
1. Read every file in `shared/`, `server/` (including `prompts/`, `enhancement-module-prompts/`, `realtime/`, and all `*-routes.ts`), and `client/src` (App routing, hooks, lib, representative pages) to extract exact definitions. Grep the codebase for `process.env.` to capture the complete, accurate list of environment variables.
2. Extract the full data model verbatim from `shared/schema.ts` and the full route list from each route module.
3. Write `ARCHITECTURE.md` at the project root following the content outline above, with accurate code snippets, schema blocks, and API tables.
4. Verify accuracy: cross-check documented routes, table columns, and env var names against the source so nothing is invented.

## Relevant files
- `shared/schema.ts`
- `server/index.ts`
- `server/routes.ts`
- `server/auth.ts`
- `server/storage.ts`
- `server/database-storage.ts`
- `server/db.ts`
- `server/claude.ts`
- `server/freshness-report.ts`
- `server/freshness-routes.ts`
- `server/sli.ts`
- `server/sli-routes.ts`
- `server/foundation-sessions-routes.ts`
- `server/enhancement-modules-routes.ts`
- `server/homework-routes.ts`
- `server/linkedin-optimization.ts`
- `server/linkedin-optimization-routes.ts`
- `server/linkedin-content-routes.ts`
- `server/payment-routes.ts`
- `server/email-service.ts`
- `server/document-extractor.ts`
- `server/intake-schema.ts`
- `server/prompts/types.ts`
- `server/prompts/index.ts`
- `server/prompts/undergraduate-recent-grad.ts`
- `server/prompts/early-career.ts`
- `server/prompts/mid-career-senior.ts`
- `server/enhancement-module-prompts/types.ts`
- `server/enhancement-module-prompts/index.ts`
- `server/realtime/openai-realtime.ts`
- `server/realtime/websocket-handler.ts`
- `client/src/App.tsx`
- `client/src/main.tsx`
- `client/src/hooks/use-auth.tsx`
- `client/src/lib/protected-route.tsx`
- `client/src/lib/queryClient.ts`
- `client/src/pages`
- `package.json`
- `drizzle.config.ts`
- `vite.config.ts`
- `theme.json`
