# Phase 1 — Azure Migration Implementation Plan

**Project:** SLI.pro / Wing — Replit MVP → Microsoft Azure
**Phase:** 1 of the migration programme — *Stand up Azure and move the app onto it*
**Owner / executor:** Aditya
**Audience:** Internal engineering (execution runbook — not a client deliverable)
**Prepared:** July 2026
**Status:** Draft for execution

---

## 0. How to read this document

This is a **step-by-step execution runbook**, not a strategy paper. The *why* already lives in your three governing documents (the Architecture & Strategy doc, the Wing Data Architecture Spec, and the Feature List). This plan tells you **what to do, in what order, with which files and services**, to get the current app running on Azure with the correct foundations underneath it.

Work top to bottom. Each **Stage** has an objective, concrete steps that reference real files/services, and an **exit check** you must pass before moving on. Stages 1–3 get the app *running on Azure*. Stage 4 lays the *backbone* (schema, provenance, engine) that every later Tier-1 feature depends on. Stages 5–7 make it deployable, observable, and verified.

A single linear checklist is in **Section 12** if you just want the ordered task list.

---

## 1. What Phase 1 is (and is not)

You told me: *"I need everything by Aug 2026, but step by step — the first step is to migrate the app to Azure and set up the services on Azure."* So Phase 1 is scoped as the **Backbone / Foundation workstream** from the strategy doc, made concrete for a brand-new Azure account and a refactor-and-port of the existing monorepo.

### In scope for Phase 1

1. **Azure landing zone** on a new account — subscription, resource groups, networking, identity, secrets, registry.
2. **All Tier-1 Azure services provisioned** and privately networked — PostgreSQL Flexible Server (+ pgvector), Container Apps, Static Web Apps, Front Door + WAF, Blob, Redis, Service Bus, Azure OpenAI, Key Vault, Monitor/App Insights, Container Registry.
3. **Refactor-and-port** of the existing TypeScript monorepo so it *runs on Azure* — swap the Neon driver, split client from API, move secrets to Key Vault, move inline media to Blob, put the model provider behind an orchestrator, retire Replit-isms.
4. **Backbone data + engine foundations** — the "build-now" subset of the 13-table schema, turn-level provenance capture on every new turn, and the engine/orchestrator separation scaffolding. This is the non-negotiable groundwork that makes the app on Azure the *right* app, not just a relocated one.
5. **CI/CD, containerisation, deploy, and a verified smoke test** of the full user path on Azure.

### Explicitly deferred to later phases (designed-for, not built now)

- **Migrating the ~100 existing users and legacy transcripts** (a scripted cutover — its own phase, after the backbone is proven on Azure).
- **Building the Tier-1 feature surface** (conversational intake, Foundation Session refactor, Enhancement Module fixes, SLI artefacts/Behavioral Evidence Portfolio, advisor snapshot, event log, email journeys, admin dashboard, mobile polish).
- **Vector-memory population**, cohort scoring, pattern-detection queue, graduate loop — tables provisioned, pipelines dormant.
- **Twilio SMS, Phyllo/360Brew, news APIs, fine-tuning** — later tiers.

> **Governing principle for this phase:** *Design the full structure now; activate only what a live session needs.* Retrofitting structure later is expensive; retrofitting activation is cheap.

### Phase 1 exit criteria (definition of done)

- The full user journey (register → intake → a Foundation Session → SLI view) runs end-to-end on Azure, served through Front Door, with the client on Static Web Apps and the API on Container Apps.
- The database is Azure PostgreSQL Flexible Server with the pgvector extension enabled and the build-now schema deployed via versioned migrations.
- **Every new conversational turn is written to `transcript_turns` with a provenance tag** at the moment of capture.
- No secret is present in source or app config — all resolved from Key Vault via managed identity.
- No media is stored inline in the database — documents and images live in Blob.
- The model provider is reached only through the orchestrator abstraction (no direct SDK calls scattered through routes).
- CI/CD deploys a container image from ACR to Container Apps on push to `main`; App Insights shows traces.
- The Replit environment is still running untouched (parallel-run; nothing retired yet).

---

## 2. Current state → target state at a glance

| Concern | Current (Replit MVP) | Phase 1 target (Azure) |
| --- | --- | --- |
| Compute | Single Express process, port 5000, serves API **and** SPA (`server/index.ts`) | API/voice/engine on **Container Apps**; SPA on **Static Web Apps**; split behind **Front Door + WAF** |
| Database | Neon serverless Postgres (`@neondatabase/serverless`, `drizzle-orm/neon-serverless`, `ws`) | **Azure PostgreSQL Flexible Server**, zone-redundant, **pgvector** enabled; `pg` + `drizzle-orm/node-postgres` |
| Schema | Flat: `conversations/messages`, `foundation_session_messages`, etc. — role = `user`/`assistant`, **no provenance**; no institutions/cycles; single `users` table | **Build-now subset of the 13-table model**; `transcript_turns` with provenance tag; institutions/school_cycles/heuristics provisioned |
| Heuristics | Inline in prompt files (`server/prompts/*`, `server/enhancement-module-prompts/*`, per persona) | **Engine reads heuristics from DB**; scaffolding in Phase 1, full authoring UI later |
| LLM | Anthropic **Claude** (`server/claude.ts`, `server/sli.ts`); OpenAI **realtime** voice (`server/realtime/*`) | **Azure OpenAI** behind an **orchestrator**; voice via **Whisper** (record-then-transcribe) |
| Secrets | `process.env.*` (Replit secrets) | **Key Vault** + **managed identity**; nothing in app config |
| Media | Base64 inline in DB (`documents.fileData`, `monthly_check_ins` screenshots) | **Blob Storage**; DB stores blob URLs/keys only |
| Sessions | `express-session` + `connect-pg-simple`/`memorystore` | `connect-pg-simple` against Azure Postgres (Redis optional later) |
| Email | SendGrid (`@sendgrid/mail`) — already aligned | SendGrid on Azure (keep) |
| Payments | Stripe (`server/payment-routes.ts`, raw webhook in `index.ts`) | Stripe (keep); webhook via Front Door route |
| Auth | Passport local + LinkedIn OIDC, server-side sessions | Same model retained; callback URL re-pointed to Azure domain |
| Async jobs | None (all in-request) | **Service Bus + Azure Functions** provisioned; jobs wired in later phases |
| Build/deploy | `vite build` + `esbuild` bundle; Replit autoscale | Docker image → **ACR** → Container Apps; SWA build for client |
| Observability | Replit logs | **Azure Monitor + Application Insights** |

---

## 3. Prerequisites — lock these before Day 1

**Accounts & access**
- New Azure account created; billing/subscription active; you have **Owner** on the subscription.
- Azure OpenAI **access approved** in the target region (this can take days — request it first; East US 2 is the working-assumption region from the strategy doc).
- GitHub (or Azure DevOps) repo for the monorepo with Actions enabled.
- A domain/subdomain you control for the app (for Front Door + LinkedIn callback + SendGrid domain auth).

**Local tooling**
- Azure CLI (`az`) + Bicep, Docker, Node 20 (matches Replit `nodejs-20`), `psql`, and your IaC tool of choice.
- `az login` working against the new subscription.

**Decisions to confirm (see Section 11 — Open decisions):**
- Region (East US 2 assumed). IaC tool (**Bicep recommended** — first-party, no state backend to manage). Whether to keep Claude short-term behind the orchestrator or cut straight to Azure OpenAI. Container Apps min-replica (cost vs. cold-start).

**Do first, in parallel with Stage 0 (they have lead times):**
- Submit the Azure OpenAI access request.
- Start SendGrid domain authentication (DNS propagation).

---

## Stage 0 — Foundations: repo, IaC, and local parity

**Objective:** Prepare the codebase and infrastructure-as-code so every later stage is repeatable and reversible. Nothing is deployed yet.

**Steps**

1. **Branch and baseline.** Create an `azure-migration` branch off `main`. Tag the current Replit-working commit (`replit-mvp-baseline`) so you can always diff against a known-good state. Keep the Replit deployment live and untouched throughout Phase 1 (parallel run).
2. **Restructure the monorepo for a clean client/server split.** The code is already `client/`, `server/`, `shared/`. Confirm the boundary is clean: the client must talk to the API only over HTTP (no server imports leaking into the bundle), because the client will be built and hosted separately on Static Web Apps. Introduce a single `API_BASE_URL` the client reads at build time.
3. **Create an `infra/` folder for Bicep.** One `main.bicep` plus per-service modules (`network.bicep`, `postgres.bicep`, `containerapp.bicep`, `openai.bicep`, etc.). Everything you provision in Stages 1–2 is authored here — no click-ops in the portal for anything you'll need to reproduce. Parameterise by environment (`dev`, `prod`).
4. **Externalise all configuration.** Grep confirms the app reads these today: `DATABASE_URL`, `SESSION_SECRET`, `ANTHROPIC_API_KEY`, `CLAUDE_MODEL`, `OPENAI_API_KEY`, `SENDGRID_API_KEY`, `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `LINKEDIN_CLIENT_ID`, `LINKEDIN_CLIENT_SECRET`, `LINKEDIN_CALLBACK_URL`, plus Replit-only `REPLIT_DEV_DOMAIN` / `REPLIT_DEPLOYMENT`. Create a `.env.example` documenting every one. Mark the two Replit vars for **removal** (Stage 3).
5. **Author the migration tooling.** You currently use `drizzle-kit push` (dev-only, destructive-ish). For a production database, switch to **generated, versioned SQL migrations** (`drizzle-kit generate`) checked into `migrations/`. Add an `npm run db:migrate` script that applies them idempotently. Push stays for local scratch only.
6. **Local parity harness.** Stand up Postgres 16 + pgvector locally (Docker) so you can develop and test the driver/schema changes before any cloud spend. Confirm the app boots against local Postgres with the *current* schema first — that isolates driver issues from schema issues.

**Exit check:** `infra/` compiles (`az bicep build`); the app runs locally against Dockerised Postgres 16 on the existing schema; `.env.example` lists every secret; migrations generate and apply cleanly to a fresh local DB.

---

## Stage 1 — Azure landing zone

**Objective:** A secure, private-by-default foundation the services will sit in. All via Bicep.

**Steps**

1. **Resource groups.** `rg-slipro-prod` (workloads) and optionally `rg-slipro-shared` (registry, Key Vault, monitoring). Consistent naming + tags (`env`, `owner`, `costCenter`) from the start — it's how the cost model in the strategy doc gets validated later.
2. **Virtual network.** One VNet with subnets for: Container Apps environment (delegated), private endpoints, and Functions (provision the subnet now even though Functions are wired later). No public data-plane anywhere.
3. **Managed identity.** Create a **user-assigned managed identity** for the app. This is the identity Container Apps uses to read Key Vault and reach Postgres/Blob/OpenAI — so **no connection strings or keys live in app config**. Grant it least-privilege roles as each service is created.
4. **Key Vault.** Provision it with RBAC authorisation and a private endpoint. Grant the managed identity `Key Vault Secrets User`. Load the secrets from your `.env.example` list as vault secrets (Stage 3 wires the app to read them).
5. **Container Registry (ACR).** Standard tier, private endpoint. Grant the managed identity `AcrPull`.
6. **Log Analytics workspace + Application Insights.** Create now so every service you provision next can point its diagnostics at it from birth.

**Exit check:** `az deployment group create` provisions RG/VNet/identity/Key Vault/ACR/Log Analytics with no public data-plane exposure; you can `az keyvault secret set/list` through the private path; the managed identity exists with role assignments visible.

---

## Stage 2 — Provision the managed services

**Objective:** Every Tier-1 backing service exists, is privately networked, and streams diagnostics — but the app isn't pointed at them yet.

**Steps**

1. **PostgreSQL Flexible Server** — General Purpose (~4 vCore per the cost model), **zone-redundant HA**, private endpoint into the VNet, point-in-time + geo-redundant backups. Then:
   - Enable the **`vector` (pgvector)** extension via the server's `azure.extensions` allow-list, then `CREATE EXTENSION vector;`.
   - Create the app database and a least-privilege role; prefer **Entra/managed-identity auth** for the app over a password where practical.
2. **Container Apps environment** — VNet-integrated, internal ingress, KEDA autoscaling, wired to Log Analytics. (The app image comes in Stage 5; create the environment now.)
3. **Static Web Apps** — Standard tier, for the React SPA. Note the deployment token for CI.
4. **Front Door (Standard) + WAF** — single public entry point. Plan two route groups: static assets → Static Web Apps; `/api/*` and the WebSocket path → Container Apps. **The Stripe webhook returns through Front Door** to `/api/payments/webhook` — keep that route reachable and preserve the raw body (see Stage 3).
5. **Blob Storage** — Hot tier, private endpoint. Containers: `documents`, `check-in-media`, `voice`, `artifacts`.
6. **Azure Cache for Redis** — Standard C1 (provision now; used for caching/rate-limiting, optional session store later).
7. **Service Bus** — Standard namespace + a starter queue/topic for domain events. Provisioned now; Functions consume it in a later phase.
8. **Azure OpenAI** — deploy the tiered models the strategy doc specifies (flagship / mid / nano / embeddings). Private endpoint; disable data logging/training. Capture deployment names for the orchestrator config.
9. **Diagnostics** — every service above sends metrics/logs to Log Analytics.

**Exit check:** From a jump host/Container App shell inside the VNet you can reach Postgres (`SELECT extname FROM pg_extension` shows `vector`), Blob, Redis, Service Bus, and Azure OpenAI **over private endpoints**; nothing resolves to a public data-plane IP; all services show up in Monitor.

---

## Stage 3 — Refactor the app to run on Azure

**Objective:** The existing monorepo boots and serves the *current* feature set on Azure services. This is the "port" — behaviour-preserving except where a Replit assumption must die. Keep the schema unchanged in this stage so you can isolate infra issues from data-model issues; the schema re-architecture is Stage 4.

**Steps**

1. **Database driver swap — `server/db.ts`.** Replace `@neondatabase/serverless` + `drizzle-orm/neon-serverless` + `neonConfig.webSocketConstructor = ws` with **`pg` (node-postgres)** + `drizzle-orm/node-postgres`. Configure TLS for Flexible Server and a sane pool size for Container Apps concurrency. Resolve the connection from Key Vault / managed identity, not a literal `DATABASE_URL`.
2. **Secrets via Key Vault.** Introduce a small config loader that pulls secrets from Key Vault using the managed identity at startup (or via Container Apps secret references). Remove direct `process.env` reads of sensitive values. **Delete `REPLIT_DEV_DOMAIN` and `REPLIT_DEPLOYMENT`** usage and any Replit-only code paths.
3. **Split serving of client and API — `server/index.ts`.** Today it hardcodes **port 5000** and serves the SPA via Vite/`serveStatic`. On Azure the **SPA is hosted by Static Web Apps**, so the Express process should serve **API + WebSocket only**. Read the port from env, bind for Container Apps, and drop the static-serving path in production. Preserve the **raw-body Stripe webhook** handler (`express.raw` before `express.json`) — it must survive the Front Door route.
4. **Client build for Static Web Apps.** Point the SPA at the API through Front Door via `API_BASE_URL`. Produce the SWA build output; wire the SWA CI token.
5. **Move inline media to Blob.** Refactor document upload/download so `documents.fileData` (base64 PDF) and the `monthly_check_ins` base64 screenshots become **Blob objects**, with the DB holding the blob key/URL. Provide a shim so existing rows still resolve until the data-migration phase rewrites them. (`document-extractor.ts` and the check-in routes are the touch points.)
6. **Model provider behind an orchestrator.** Introduce a single `orchestrator` module that is the *only* place that talks to a model. Route the current callers — `server/claude.ts`, `server/sli.ts`, `server/realtime/*` — through it. Back it with **Azure OpenAI** using the Stage-2 deployment names and the tiered routing (flagship for Foundation Sessions/SLI, mid for intake/analysis, nano for classification, embeddings for memory). Because current prompts were tuned for Claude, **A/B the highest-value prompts** (Foundation Sessions, SLI generation) on Azure OpenAI and adjust before cutover. *(If prompt-portability risk is too high for the deadline, the orchestrator lets you keep Claude for those surfaces short-term and still standardise everything else — see Open Decisions.)*
7. **Voice.** Replace the OpenAI **realtime** dependency (`server/realtime/openai-realtime.ts`, `websocket-handler.ts`) with **record-then-transcribe Whisper** on Azure for Tier 1 (matches today's flow and the strategy doc). Keep the WebSocket service in place so live streaming (Azure AI Speech) can slot in later without re-architecture.
8. **Sessions.** Keep `express-session` + `connect-pg-simple` pointed at Azure Postgres (`create-sessions-table.sql` already exists — apply it as a migration). Redis-backed sessions are an optional later optimisation.
9. **Auth callback.** Re-point `LINKEDIN_CALLBACK_URL` to the Azure/Front Door domain and register it in the LinkedIn app. Local + LinkedIn OIDC and server-side sessions otherwise unchanged.
10. **Kill the fail-to-start-on-missing-key behaviour** the strategy doc flags; fail loudly with clear diagnostics instead, and rely on Key Vault presence.

**Exit check:** Running locally with cloud services (or in a dev Container App), the app serves the *existing* features against Azure Postgres, uploads land in Blob, all model calls flow through the orchestrator to Azure OpenAI, voice transcribes via Whisper, login via LinkedIn works on the Azure domain, and no secret is read from plain config.

---

## Stage 4 — Lay the data and engine backbone

**Objective:** Introduce the foundations that make this the *right* platform, not just a relocated one: the build-now subset of the 13-table model, **turn-level provenance on every new turn**, and the engine/orchestrator separation. This is the part of Phase 1 that later Tier-1 features are built on, so it must be correct even though its full activation is deferred.

**Steps**

1. **Add the build-now tables** (from the Data Architecture Spec, Section 3) as new Drizzle tables + versioned migrations, alongside the existing tables (don't rip the old ones out yet — the data-migration phase reconciles them):
   - Institutional: `institutions`, `school_cycles`
   - Methodology: `heuristics`, `heuristic_components` (seven component types as **rows**), `heuristic_sequences`
   - People: `students` (with `personal_sequence_id` nullable)
   - Session/transcript: `sessions`, `transcripts`, `transcript_turns`
   - Scoring: `user_heuristic_applications`, `user_heuristic_scores` (student-level only)
   - Memory: `user_memory_embeddings` — **create the table and enable pgvector, but leave the population pipeline dormant** (activates at the first returning-user session, a later phase)
   - `pattern_detection_queue` — **stub** (table only)
2. **Identity split.** Introduce the `users` (auth identity) vs. `students` (coaching entity) separation as the memory notes. In Phase 1 you can keep the existing `users` table as the auth identity and add `students` linked to it; full reconciliation happens during data migration.
3. **Turn-level provenance capture — the non-negotiable.** Every new conversational turn (intake, Foundation Sessions, Enhancement Modules) must be written to `transcript_turns` with:
   - `turn_type` ∈ {`ai_prompt`, `human_spontaneous`, `human_elicited_response`, `human_correction`, and the added `ai_adapted`}
   - `provenance` tag ∈ {`ai_generated`, `human_spontaneous`, `human_elicited`, `human_correction`, `provenance_unknown`}
   - the active `heuristic_id` and a `signal_detected` flag
   Implement the **deterministic capture rule** from the spec: if the prior turn was an `ai_prompt`, tag the response `human_elicited`; otherwise `human_spontaneous`. Design the field so the rule can be upgraded later without a schema change. Keep writing to the existing `*_messages` tables in parallel during Phase 1 so nothing breaks; `transcript_turns` becomes the source of truth.
4. **Engine/orchestrator separation scaffolding.** Stand up a deterministic **engine** module that reads the active `heuristic_sequence` for a student's `school_cycle`, evaluates the current turn against `heuristic_components` signal definitions, and decides what should fire — separate from the **orchestrator** (Stage 3) that assembles context and calls the model. In Phase 1 the engine can read a **seed set of heuristics loaded from your existing prompt files** into the methodology tables (a migration script that parses `server/prompts/*` and `server/enhancement-module-prompts/*` into `heuristics`/`heuristic_components` rows). Full authoring UI and pattern-detection are later phases.
5. **Provenance for classification (Nano tier).** Wire turn-typing/classification calls through the orchestrator's **nano** model so provenance/turn-type refinement has a home from day one.

**Exit check:** A brand-new session on Azure writes provenance-tagged rows to `transcript_turns` (verify a Foundation Session produces the four turn types correctly); the engine resolves an active sequence and logs a `user_heuristic_applications` row per firing; pgvector table exists and is empty by design; a seed set of heuristics is queryable in the methodology tables.

---

## Stage 5 — Containerise and CI/CD

**Objective:** One-command, repeatable deploys.

**Steps**

1. **Dockerfile for the API.** Multi-stage: build with the existing `vite build`/`esbuild` server bundle step, produce a slim Node 20 runtime image. `.dockerignore` node_modules/dist/Replit files.
2. **Pipeline (GitHub Actions).** On push to `main`: build image → push to **ACR** → deploy new **Container Apps** revision. Separate job builds the SPA and deploys to **Static Web Apps** using its token. Run `npm run db:migrate` as a gated pre-deploy step.
3. **Secrets in CI** via OIDC federation to Azure (no long-lived credentials in GitHub).
4. **Revisions/rollback.** Use Container Apps revision-based deployment so a bad deploy is a one-click roll-back.

**Exit check:** A commit to `main` builds, pushes, migrates, and deploys both tiers automatically; rolling back to the previous revision works.

---

## Stage 6 — Deploy and smoke-test on Azure

**Objective:** Prove the full path on real Azure infrastructure.

**Steps**

1. Deploy client + API through the pipeline; confirm Front Door routes static vs. `/api/*` vs. WebSocket correctly.
2. **End-to-end smoke test** with a fresh test user: register (local + LinkedIn) → conversational/questionnaire intake → run a Foundation Session (turns land in `transcript_turns` with provenance) → generate/view an SLI → upload a document (lands in Blob) → trigger a SendGrid email → complete a Stripe test payment (webhook returns through Front Door with intact raw body).
3. **Mobile pass** on iPhone Safari + Android Chrome for the core path (full mobile optimisation is a Tier-1 feature later, but confirm nothing is broken).
4. **Load smoke** at partner-cohort scale to confirm autoscaling and pool sizing.

**Exit check:** Every step of the smoke test passes on the Azure URL; App Insights shows the traces; no secret or media touches plain config or the DB inline.

---

## Stage 7 — Verification and Phase 1 acceptance

**Objective:** Confirm the Phase 1 exit criteria (Section 1) objectively before declaring the phase done.

**Steps**

1. **Security review.** Run through: no public data-plane endpoints; WAF active; all secrets in Key Vault; managed identity least-privilege; AI/voice providers set to not train on data; TLS everywhere. (Consider a dedicated security-review pass here.)
2. **Provenance audit.** Query `transcript_turns` for a sample of new sessions and confirm every turn has a valid, correctly-assigned provenance tag and turn type — this is the foundation the whole product rests on, so verify it explicitly.
3. **Cost checkpoint.** Read one week of Azure Cost Management against the strategy doc's envelope (~$2,600/mo target); flag drift.
4. **Parallel-run confirmation.** Replit still serves live users untouched; Azure is not yet taking production traffic. Document the go/no-go for the later cutover phase.
5. **Sign-off.** Tick every Phase 1 exit criterion; record known gaps as tickets for the next phase.

**Exit check:** All Section 1 exit criteria pass; a short written Phase 1 completion note lists what's live on Azure and what's deferred.

---

## 11. Secrets → Key Vault mapping

Every value below moves from Replit env to a Key Vault secret, read by the app via managed identity. The two Replit-only vars are deleted, not migrated.

| Current env var | Destination | Notes |
| --- | --- | --- |
| `DATABASE_URL` | Key Vault (or managed-identity auth) | Re-points to Flexible Server; prefer Entra auth |
| `SESSION_SECRET` | Key Vault | Rotate on migration |
| `ANTHROPIC_API_KEY` | Key Vault *(interim)* | Only if keeping Claude short-term via orchestrator; target is Azure OpenAI |
| `CLAUDE_MODEL` | Orchestrator config | Replaced by Azure OpenAI deployment names |
| `OPENAI_API_KEY` | Key Vault → Azure OpenAI | Voice/realtime replaced by Whisper on Azure |
| `SENDGRID_API_KEY` | Key Vault | Keep; complete domain auth |
| `STRIPE_SECRET_KEY` | Key Vault | Keep |
| `STRIPE_WEBHOOK_SECRET` | Key Vault | Webhook route via Front Door; raw body preserved |
| `LINKEDIN_CLIENT_ID` | Key Vault | Keep |
| `LINKEDIN_CLIENT_SECRET` | Key Vault | Keep |
| `LINKEDIN_CALLBACK_URL` | App config | Re-point to Azure/Front Door domain; register in LinkedIn app |
| `REPLIT_DEV_DOMAIN` | **Delete** | Replit-only |
| `REPLIT_DEPLOYMENT` | **Delete** | Replit-only |
| `NODE_ENV`, `DEBUG_SLI` | App config | Non-secret |

---

## 12. Linear execution checklist

Do these in order. Each maps to a stage above.

**Pre-work (start now — lead times)**
- [ ] Request Azure OpenAI access in target region
- [ ] Begin SendGrid domain authentication
- [ ] Confirm the four open decisions (Section 13)

**Stage 0 — Foundations**
- [ ] Branch `azure-migration`; tag `replit-mvp-baseline`
- [ ] Verify clean client/server split; add `API_BASE_URL`
- [ ] Create `infra/` (Bicep) skeleton
- [ ] Write `.env.example`; mark Replit vars for deletion
- [ ] Switch to generated versioned migrations; add `db:migrate`
- [ ] Local Postgres 16 + pgvector; app boots on current schema

**Stage 1 — Landing zone**
- [ ] Resource groups + tags
- [ ] VNet + subnets (app, private endpoints, functions)
- [ ] User-assigned managed identity
- [ ] Key Vault (RBAC, private endpoint) + load secrets
- [ ] ACR (private endpoint, AcrPull)
- [ ] Log Analytics + App Insights

**Stage 2 — Services**
- [ ] PostgreSQL Flexible Server (HA) + enable pgvector + app DB/role
- [ ] Container Apps environment (VNet-integrated)
- [ ] Static Web Apps
- [ ] Front Door + WAF (static / api / websocket routes)
- [ ] Blob (documents, check-in-media, voice, artifacts)
- [ ] Redis (C1)
- [ ] Service Bus (namespace + starter queue)
- [ ] Azure OpenAI (flagship/mid/nano/embeddings deployments)
- [ ] Diagnostics wired to Log Analytics

**Stage 3 — Refactor to run on Azure**
- [ ] Swap Neon → `pg` / node-postgres in `server/db.ts`
- [ ] Key Vault config loader; remove Replit vars
- [ ] Split serving: API/WS only on Container Apps; SPA on SWA; env port; keep raw Stripe webhook
- [ ] Client build → SWA; `API_BASE_URL` via Front Door
- [ ] Inline media → Blob (documents, check-in screenshots)
- [ ] Orchestrator module; route `claude.ts`/`sli.ts`/`realtime` through it → Azure OpenAI; A/B key prompts
- [ ] Voice → Whisper record-then-transcribe (keep WS service)
- [ ] Sessions on Azure Postgres (`connect-pg-simple`)
- [ ] Re-point LinkedIn callback
- [ ] Remove fail-on-missing-key startup behaviour

**Stage 4 — Backbone**
- [ ] Add build-now 13-table subset + migrations
- [ ] `users` vs `students` identity split (additive)
- [ ] Turn-level provenance capture on every new turn (deterministic rule)
- [ ] Engine module (reads sequence/components, logs applications)
- [ ] Seed heuristics from prompt files into methodology tables
- [ ] pgvector table created, pipeline dormant; `pattern_detection_queue` stubbed

**Stage 5 — CI/CD**
- [ ] Dockerfile (multi-stage, Node 20)
- [ ] GitHub Actions: build → ACR → Container Apps; SPA → SWA; gated `db:migrate`
- [ ] OIDC federation to Azure
- [ ] Revision-based rollback verified

**Stage 6 — Deploy + smoke**
- [ ] Deploy both tiers via pipeline
- [ ] Full end-to-end smoke test (register → intake → session → SLI → upload → email → payment)
- [ ] Mobile pass; load smoke

**Stage 7 — Verify + accept**
- [ ] Security review
- [ ] Provenance audit
- [ ] Cost checkpoint vs. envelope
- [ ] Parallel-run confirmed; Phase 1 completion note

---

## 13. Open decisions (need your call before/at Stage 2–3)

1. **Region.** East US 2 is the strategy-doc working assumption — confirm, since Azure OpenAI model/tier availability varies by region and gates Stage 2.8.
2. **Model provider at cutover.** Cut straight to Azure OpenAI for all surfaces, or keep Claude for the highest-value prompts (Foundation Sessions, SLI) short-term behind the orchestrator to de-risk the deadline? Affects Stage 3.6 effort and prompt-tuning time.
3. **IaC tool.** Bicep (recommended — first-party, no state backend) vs. Terraform (if your team already standardises on it).
4. **Container Apps min-replica.** Scale-to-zero (cheapest, cold-start latency) vs. min 1 (always-warm, ~$250/mo line in the cost model). Recommendation: min 1 for the API given the coaching UX.
5. **Auth for Postgres.** Managed-identity/Entra auth (preferred, no password) vs. password-in-Key-Vault (simpler, slightly weaker). Recommendation: managed identity.

---

## 14. Risks and mitigations

| Risk | Impact | Mitigation |
| --- | --- | --- |
| Azure OpenAI access/region delay | Blocks Stage 2.8 | Request access on Day 0; region-flex the Bicep param |
| Prompt behaviour shifts Claude → Azure OpenAI | Quality regression on core sessions | A/B key prompts before cutover; orchestrator lets you keep Claude interim |
| Neon → node-postgres pooling/TLS quirks | Runtime errors under load | Validate locally (Stage 0) and load-smoke (Stage 6); tune pool for Container Apps concurrency |
| Inline-media refactor misses a read path | Broken downloads | Keep a DB→Blob shim until the data-migration phase; grep all `fileData`/screenshot readers |
| Doing backbone + port at once expands scope | Deadline slip | Stage 3 preserves current schema; Stage 4 is additive — the app runs on Azure before the re-architecture lands |
| Stripe raw-body webhook broken by Front Door/body parser | Payment events lost | Preserve `express.raw` ordering; test webhook explicitly in Stage 6 |
| Secret left in config/source | Security finding | Stage 7 security review + secret-scan in CI |

---

## 15. What comes after Phase 1 (so you can sequence)

- **Phase 2 — Data migration & cutover:** scripted move of ~100 users and legacy transcripts (tagged `migrated_provenance_unknown`); hand-tag 10–15 strongest sessions as the gold-standard seed; validate; short parallel run; retire Replit.
- **Phase 3 — Tier-1 feature surface:** conversational intake with the early insight, Foundation Session refactor, Enhancement Module fixes (restore SLI refinement, cross-context), Behavioral Evidence Portfolio, advisor snapshot, event log, email journeys, admin dashboard, full mobile — all built on the Phase 1 backbone.
- **Then:** activate vector-memory population (first returning-user session), Service Bus/Functions engagement cadences, and the Tier-2 features for the fall raise.

*This plan covers Phase 1 only. Update it as decisions in Section 13 are resolved.*
