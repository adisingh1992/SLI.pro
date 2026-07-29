# Azure Deploy Runbook — Stage

Getting the app **running on Azure**, not just pointing at it. Covers the
Container App, Static Web Apps, Front Door routing, CI/CD wiring, and the
end-to-end smoke test.

Prerequisite: the services from `AZURE_STAGE_SETUP_PORTAL.md` exist, and
`npm run dev` works locally against them.

---

## 1. What gets deployed where

| Piece | Runs on | Notes |
| --- | --- | --- |
| API + voice WebSocket | Container Apps (`slipro-api-stage`) | Docker image from ACR; **API only**, `SERVE_CLIENT=false` |
| React SPA | Static Web Apps (`slipro-web-stage`) | Built with `VITE_API_BASE_URL` baked in |
| Public entry point | Front Door + WAF | static → SWA, `/api/*` + WebSocket → Container App |
| Migrations | Container Apps **job** (or VNet runner) | The database is private; a hosted runner cannot reach it |

---

## 2. Container App configuration

**Identity.** Assign the user-assigned managed identity `slipro-id-stage`
(Container App → Settings → Identity → User assigned). This is what lets the
app read Key Vault, Blob and Azure OpenAI with no secrets in config.

**Environment variables** (Container App → Containers → Edit and deploy →
Environment variables). Only non-secret config goes here — everything sensitive
is fetched from Key Vault at startup:

```
NODE_ENV=production
PORT=8080
SERVE_CLIENT=false
KEY_VAULT_URI=https://slipro-keyvault-stage.vault.azure.net/
AZURE_MANAGED_IDENTITY_CLIENT_ID=<client id of slipro-id-stage>
AZURE_STORAGE_ACCOUNT=<storage account name>
LINKEDIN_CALLBACK_URL=https://<front-door-hostname>/api/auth/linkedin/callback
```

**Ingress.** Enabled, HTTP, target port **8080**, and **session affinity is not
required** (sessions live in Postgres, not memory). Allow insecure = off.

**Health probes.** Liveness `/api/health` (no database dependency, so a slow
database cannot cause healthy replicas to be killed). Readiness `/api/health/ready`
reports database, LLM provider and Blob status.

**Scale.** Stage: min 0 (scale to zero, accept cold start). Production: min 1.

**ACR pull.** Grant `slipro-id-stage` the **AcrPull** role on the registry, and
set the Container App's registry authentication to that identity.

---

## 3. Static Web Apps

Build the SPA with the API base URL baked in — the client calls the API through
Front Door, not the Container App directly:

```
VITE_API_BASE_URL=https://<front-door-hostname>
npm run build:client     # outputs dist/public
```

Deployment is handled by the workflow (`Azure/static-web-apps-deploy`), using
the SWA deployment token.

**SPA fallback.** Add `client/public/staticwebapp.config.json` so client-side
routes resolve (see §7).

---

## 4. Front Door routes

Three routes on the endpoint, matched most-specific first:

| Order | Path | Origin group | Notes |
| --- | --- | --- | --- |
| 1 | `/api/*` | Container App | Forward host header; **no caching** |
| 2 | `/ws` (or the voice WS path) | Container App | Enable WebSocket support |
| 3 | `/*` | Static Web Apps | Caching on for static assets |

**Stripe webhook.** `/api/payments/webhook` must reach the API through the
`/api/*` route with the body **unmodified** — the signature is verified against
the raw body. Do not enable any request-body transformation on that route.

**WAF.** Associate the policy. Start in *Detection* mode, review the logs after
the smoke test, then switch to *Prevention* — a WAF in prevention mode can
silently block legitimate multipart uploads or long SSE responses.

---

## 5. Migrations against a private database

The stage database has **no public endpoint**, so a GitHub-hosted runner cannot
reach it. The pipeline's `migrate` job is therefore non-blocking until one of
these is in place:

- **Container Apps job (recommended).** Create a manual job in the same
  environment using the same image, with command `node dist/migrate.js`. It runs
  inside the VNet and reuses the app's identity:

  ```
  az containerapp job create \
    --name slipro-migrate-stage \
    --resource-group rg-slipro-stage \
    --environment slipro-env-stage \
    --trigger-type Manual \
    --replica-timeout 600 \
    --image <acr>.azurecr.io/slipro-api:latest \
    --command "node" "dist/migrate.js"
  ```

  Then in the workflow, replace the `npm run db:migrate` step with
  `az containerapp job start --name slipro-migrate-stage ...`.

- **Self-hosted runner** inside the VNet.
- **Manual** over the P2S VPN (what you are doing today).

---

## 6. CI/CD wiring (one-time)

**Federated credential** — lets GitHub authenticate to Azure without a secret:

1. Create (or reuse) an app registration; note its **client id**.
2. Add a federated credential: issuer `https://token.actions.githubusercontent.com`,
   subject `repo:<org>/<repo>:ref:refs/heads/main` (add a second for
   `azure-migration` while testing), audience `api://AzureADTokenExchange`.
3. Grant it **Contributor** on `rg-slipro-stage` and **AcrPush** on the registry.

**Repository secrets**

```
AZURE_CLIENT_ID, AZURE_TENANT_ID, AZURE_SUBSCRIPTION_ID
AZURE_STATIC_WEB_APPS_API_TOKEN
DATABASE_URL                    # only if migrating from a VNet-connected runner
```

**Repository variables**

```
ACR_NAME, RESOURCE_GROUP, CONTAINER_APP_NAME, API_BASE_URL
```

---

## 7. SPA routing config

`client/public/staticwebapp.config.json`:

```json
{
  "navigationFallback": {
    "rewrite": "/index.html",
    "exclude": ["/assets/*", "/*.{png,jpg,svg,ico,webp,woff,woff2}"]
  }
}
```

Without this, a hard refresh on `/foundation/session/1` returns 404.

---

## 8. First deploy

```
# From the repo root — verify the image builds before wiring CI
az acr build --registry <acr-name> --image slipro-api:test --file Dockerfile .
```

Then push to `main` (or `azure-migration`) and watch the workflow. The
`deploy-api` job polls `/api/health` and fails if the revision does not become
healthy within five minutes.

**Rollback:** activate the previous revision — no rebuild required.

```
az containerapp revision list -n <app> -g <rg> -o table
az containerapp revision activate -n <app> -g <rg> --revision <previous>
```

---

## 9. Smoke test (Phase 1 exit criteria)

Run against the **Front Door hostname**, not the Container App URL.

- [ ] `GET /api/health` → 200
- [ ] `GET /api/health/ready` → 200, database ok
- [ ] SPA loads; hard-refresh on a deep link works (SPA fallback)
- [ ] Register a new user; log in; **refresh** (session survives → `wing.user_sessions` works)
- [ ] LinkedIn OIDC (callback URL registered for the Front Door domain)
- [ ] Foundation Session: start → stream turns → complete
- [ ] `wing.transcript_turns` shows provenance tags for the new session
- [ ] Document upload → view (proves Blob via managed identity, no keys)
- [ ] SLI generate → select → refine
- [ ] Stripe test payment; webhook arrives with intact signature
- [ ] Mobile pass: iPhone Safari + Android Chrome, core path
- [ ] App Insights shows traces

**Then confirm the Phase 1 exit criteria:** no secret in app config, no media
inline in the database, every new turn carries provenance, CI/CD deploys on
push, and Replit still runs untouched (parallel run).

---

## 10. Known gaps at this stage

- **Migrations** are manual over the VPN until the Container Apps job is created (§5).
- **Whisper/transcription** needs `AZURE-OPENAI-DEPLOYMENT-TRANSCRIBE` in Key Vault.
- **Front Door hostname** must be set in `LINKEDIN_CALLBACK_URL` *and* registered
  in the LinkedIn app, or OIDC login fails with a redirect mismatch.
- **`public` schema tables** still exist and are unused. Drop them only after the
  production data migration is complete and verified.
