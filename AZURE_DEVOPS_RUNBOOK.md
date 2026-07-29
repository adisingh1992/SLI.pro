# Azure DevOps — Repos, Pipelines and Deploy

Setting up Azure DevOps as the home for the repository and CI/CD, deploying
the **single-container** application (SPA + API + WebSocket) to Azure Container
Apps.

Companion to `AZURE_STAGE_SETUP_PORTAL.md` (which creates the infrastructure).

---

## 1. Deployment shape

One image, one Container App, one rollback:

| Piece | Where |
| --- | --- |
| React SPA | Served by the app process (`SERVE_CLIENT=true`) from `dist/public` |
| REST API + voice WebSocket | Same process |
| Public entry | Front Door + WAF → the Container App (one origin) |
| Migrations | Container Apps **job**, same image, inside the VNet |

**Why single container:** the client and API deploy together, so a live UI is
always paired with the API it was built against. With a separate static host
they deploy independently and can drift.

> This deviates from Architecture & Strategy §5, which places the SPA on Static
> Web Apps. Worth flagging to Sam, since that document is under review. It is
> reversible: set `SERVE_CLIENT=false` and deploy the client separately.

---

## 2. Move the repository to Azure Repos

1. **Create the project** — Azure DevOps → New project → `SLIpro`
   (Git, Basic process, Private).
2. **Import the repo** — Repos → Files → Import a repository → paste the
   existing Git URL. This preserves history.

   Or push an existing local clone:

   ```
   git remote rename origin github            # keep the old remote if you like
   git remote add origin https://dev.azure.com/<org>/SLIpro/_git/SLIpro
   git push -u origin --all
   git push origin --tags
   ```

3. **Branch policies** — Repos → Branches → `main` → Branch policies:
   - Require a minimum number of reviewers (1)
   - Check for linked work items (optional)
   - **Build validation** → the pipeline below, so PRs are typechecked

---

## 3. Service connection (workload identity federation)

Preferred over a service principal secret — there is no credential to rotate
or leak.

1. Project settings → Service connections → New → **Azure Resource Manager**
2. Identity type: **App registration (automatic)**, credential:
   **Workload identity federation**
3. Scope: the subscription and resource group `rg-slipro-stage`
4. Name it **`slipro-azure-stage`** — the pipeline references this exact name
5. Grant its identity:
   - **Contributor** on `rg-slipro-stage`
   - **AcrPush** on the container registry

---

## 4. Variable group

Pipelines → Library → Variable group → **`slipro-stage`**:

| Variable | Example |
| --- | --- |
| `ACR_NAME` | `sliprostage` |
| `RESOURCE_GROUP` | `rg-slipro-stage` |
| `CONTAINER_APP_NAME` | `slipro-api-stage` |
| `MIGRATE_JOB_NAME` | `slipro-migrate-stage` |

Application secrets are **not** needed here — the app reads them from Key Vault
at startup via its managed identity. Only add a Key Vault link if the pipeline
itself ever needs a secret.

---

## 5. Environment and approvals

Pipelines → Environments → New → **`slipro-stage`**.

Add an **Approvals and checks** → Approvals gate. Both the migration and deploy
stages target this environment, so schema changes require a human to confirm.
That is deliberate: migrations are the least reversible step in the pipeline.

---

## 6. Migration job (one-time)

The database is VNet-only, so a hosted agent cannot reach it. Migrations run
inside the VNet as a Container Apps job using the same image:

```
az containerapp job create \
  --name slipro-migrate-stage \
  --resource-group rg-slipro-stage \
  --environment slipro-env-stage \
  --trigger-type Manual \
  --replica-timeout 900 \
  --replica-retry-limit 0 \
  --image <acr>.azurecr.io/slipro-api:latest \
  --cpu 0.5 --memory 1Gi \
  --command "node" "dist/migrate.js" \
  --user-assigned <resource-id-of-slipro-id-stage> \
  --registry-server <acr>.azurecr.io \
  --registry-identity <resource-id-of-slipro-id-stage> \
  --env-vars \
    NODE_ENV=production \
    KEY_VAULT_URI=https://slipro-keyvault-stage.vault.azure.net/ \
    AZURE_MANAGED_IDENTITY_CLIENT_ID=<client-id-of-slipro-id-stage>
```

The pipeline updates this job's image and starts it on every deploy, polling to
completion — a silent migration failure followed by a successful app rollout is
the worst possible outcome, so the stage fails loudly instead.

---

## 7. Container App configuration

**Identity** — assign the user-assigned identity `slipro-id-stage`. This is how
the app reads Key Vault, Blob and Azure OpenAI with no secrets in config.

**Registry** — set registry authentication to that same identity, and grant it
**AcrPull**.

**Environment variables** (non-secret only):

```
NODE_ENV=production
PORT=8080
SERVE_CLIENT=true
KEY_VAULT_URI=https://slipro-keyvault-stage.vault.azure.net/
AZURE_MANAGED_IDENTITY_CLIENT_ID=<client id of slipro-id-stage>
AZURE_STORAGE_ACCOUNT=<storage account name>
LINKEDIN_CALLBACK_URL=https://<front-door-hostname>/api/auth/linkedin/callback
```

**Ingress** — enabled, target port **8080**. Session affinity not required
(sessions live in Postgres).

**Probes** — liveness `/api/health` (no database dependency, so a slow database
cannot cause healthy replicas to be killed); readiness `/api/health/ready`.

**Scale** — stage: min 0 (accept cold start). Production: min 1.

---

## 8. Front Door

With a single container there is **one origin group** and effectively one route:

| Path | Origin | Notes |
| --- | --- | --- |
| `/*` | Container App | Enable WebSocket support; forward host header |

Caching: the app already sets `immutable` on fingerprinted `/assets/*` and
`no-cache` on `index.html`, so Front Door can safely honour origin cache
headers. Do **not** cache `/api/*`.

**Stripe webhook** — `/api/payments/webhook` must arrive with an unmodified
body; the signature is verified against the raw bytes. No body transformation
on that route.

**WAF** — start in **Detection**, review logs after the smoke test, then switch
to Prevention. In Prevention it can silently block multipart uploads and long
SSE responses — exactly your document upload and session streaming.

---

## 9. Create and run the pipeline

1. Pipelines → New pipeline → **Azure Repos Git** → your repo
2. **Existing Azure Pipelines YAML file** → `/azure-pipelines.yml`
3. Run.

Stages: `Validate → Build → Migrate → Deploy`. PR builds run **Validate only**
(the Build stage is skipped for `PullRequest`).

**Rollback** — activate the previous revision, no rebuild:

```
az containerapp revision list -n slipro-api-stage -g rg-slipro-stage -o table
az containerapp revision activate -n slipro-api-stage -g rg-slipro-stage --revision <previous>
```

---

## 10. Smoke test (Phase 1 exit criteria)

Run against the **Front Door hostname**.

- [ ] `GET /api/health` → 200; `/api/health/ready` → 200 with database ok
- [ ] SPA loads; hard-refresh on a deep link works (SPA fallback)
- [ ] Unknown `/api/*` path returns JSON 404, not the SPA shell
- [ ] Register, log in, **refresh** (session survives → `wing.user_sessions`)
- [ ] LinkedIn OIDC (callback registered for the Front Door domain)
- [ ] Foundation Session: start → stream → complete
- [ ] `wing.transcript_turns` shows provenance tags for the new session
- [ ] Document upload → view (Blob via managed identity, no keys)
- [ ] SLI generate → select → refine
- [ ] Stripe test payment; webhook signature verifies
- [ ] Mobile: iPhone Safari + Android Chrome, core path
- [ ] App Insights shows traces

---

## 11. Known gaps

- **`AZURE-OPENAI-DEPLOYMENT-TRANSCRIBE`** must be in Key Vault or voice
  transcription falls back to OpenAI (audio leaves Azure — see
  `TRANSCRIBE_FALLBACK_TO_OPENAI`).
- **LinkedIn callback** must be registered for the Front Door domain, or OIDC
  fails with a redirect mismatch.
- **`public` schema tables** still exist, unused. Drop only after the production
  data migration is complete and verified.
- **Typecheck is advisory** in the pipeline until the MVP's pre-existing errors
  are cleared.
- The GitHub Actions workflow at `.github/workflows/deploy-stage.yml` is now
  superseded — delete it to avoid two sources of truth.
