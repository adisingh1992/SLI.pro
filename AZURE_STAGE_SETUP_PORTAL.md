# Azure Staging Environment — Manual Portal Setup List

**Environment:** `stage` — **architecturally identical to prod, lower spec only**
**Method:** Azure Portal, created manually one service at a time (no IaC)
**For:** SLI.pro / Wing Phase 1

---

## Principle: same shape, smaller size

Stage uses the **same services, same network topology, and same private-endpoint wiring as prod.** The *only* differences are compute size, high-availability, and storage redundancy. Nothing is skipped. This costs a bit more and takes more clicks up front, but it means promoting to prod is a **spec change, not a re-architecture** — no surprises at cutover.

So: private VNet, private endpoints to the data/AI services, Front Door + WAF, Redis, and Service Bus are all **in** stage, just at their lowest SKUs.

**Conventions**
- One region for everything: **East US 2** (matches strategy doc + Azure OpenAI availability).
- One resource group: `rg-slipro-stage` — delete it to tear down the whole environment.
- Suffix every resource `-stage`. When you build prod, repeat this list with `-prod` names and the prod-spec column.
- Free-tier eligibility and prices change — **confirm live in the portal** at creation. This is guidance, not a quote.

---

## A. Stage vs Prod spec table (the reference)

| # | Service | Stage spec | Prod spec | What differs |
| --- | --- | --- | --- | --- |
| 1 | Resource Group | `rg-slipro-stage` | `rg-slipro-prod` | name only |
| 2 | Virtual Network | same address plan + subnets | same | **identical** |
| 3 | Log Analytics + App Insights | pay-as-you-go | same | volume only |
| 4 | Managed Identity (user-assigned) | 1 identity | same | **identical** |
| 5 | Key Vault | Standard + private endpoint | Standard + private endpoint | **identical** |
| 6 | Container Registry (ACR) | Standard | Standard | **identical** (see note 1) |
| 7 | Storage (Blob) | Standard **LRS**, private endpoints | Standard **GRS/ZRS**, private endpoints | redundancy |
| 8 | PostgreSQL Flexible Server | **Burstable B1ms/B2s**, **HA off**, private access | **General Purpose ~4 vCore**, **zone-redundant HA**, private access | compute + HA |
| 9 | Azure OpenAI | Standard S0, small deployments, private endpoint | Standard S0, full deployments, private endpoint | deployment size |
| 10 | Azure Cache for Redis | **Basic C0**, private endpoint | **Standard C1**, private endpoint | tier/SLA |
| 11 | Service Bus | Standard | Standard | **identical** (see note 2) |
| 12 | Container Apps env + app | VNet-integrated, **min replica 0–1** | VNet-integrated, **min replica ≥1**, autoscale | replica count |
| 13 | Azure Functions | Consumption/Flex | Consumption/Flex | **identical** |
| 14 | Static Web Apps | Standard | Standard | **identical** (see note 3) |
| 15 | Front Door + WAF | Standard + WAF policy | Standard + WAF policy | **identical** |
| 16 | SendGrid | Free/low plan | Pro plan | send volume |

**Notes**
1. **ACR:** Standard matches the prod design in the strategy doc. Standard/Basic ACR can't take a *private endpoint* (that needs Premium) — in both environments the registry is reached publicly and image pulls are authorised by the Container Apps managed identity (`AcrPull`). If you later decide prod ACR must be private, bump **both** to Premium to keep parity.
2. **Service Bus:** Standard supports topics (what the async design needs) but **not** private endpoints (those require Premium). Both environments reach it via **managed identity + SAS**, secured by the namespace firewall — same in stage and prod. Bump both to Premium only if you decide you need private link.
3. **Static Web Apps:** use **Standard** (not Free) so stage matches prod — Standard is what supports linked backends/custom auth/SLA. The SPA is edge-hosted so it doesn't sit in the VNet in either environment.

---

## B. Create in this order (portal)

Order matters: networking and identity first, then the services that attach to them, then the edge.

### 1. Resource Group
Resource groups → Create → `rg-slipro-stage`, East US 2.

### 2. Virtual Network
Virtual networks → Create → `slipro-vnet-stage`. Use the **same address space and subnet layout you'll use in prod** so nothing has to change later. Create these subnets:
- `snet-containerapps` (delegated to Container Apps environment; needs a /23 or larger)
- `snet-privatelink` (for private endpoints)
- `snet-functions` (delegate to Functions; create now even though Functions come later)

### 3. Log Analytics Workspace, then Application Insights
- Log Analytics workspaces → Create → `slipro-logs-stage`.
- Application Insights → Create → `slipro-appinsights-stage`, **Workspace-based**, pointed at the workspace. Save the connection string.

### 4. Managed Identity (user-assigned)
Managed Identities → Create → `slipro-id-stage`. This one identity is what the API/Functions use to reach Key Vault, Postgres, Blob, OpenAI, Service Bus, and ACR — **no keys in app config.** Grant it roles as you create each service below.

### 5. Key Vault
Key Vaults → Create → `slipro-kv-stage`, **Standard**, **Azure RBAC** permission model.
- After creation: Networking → add a **private endpoint** into `snet-privatelink` (let the portal auto-create the `privatelink.vaultcore.azure.net` private DNS zone and VNet link).
- Access: grant yourself **Key Vault Administrator**; grant `slipro-id-stage` **Key Vault Secrets User**.
- Add secrets: `DATABASE-URL`, `SESSION-SECRET`, `SENDGRID-API-KEY`, `STRIPE-SECRET-KEY`, `STRIPE-WEBHOOK-SECRET`, `LINKEDIN-CLIENT-ID`, `LINKEDIN-CLIENT-SECRET`, `AZURE-OPENAI-KEY`.

### 6. Container Registry (ACR)
Container registries → Create → `sliprostage`, **Standard**. Grant `slipro-id-stage` the **AcrPull** role. (See note 1 on private endpoints.)

### 7. Storage Account (Blob)
Storage accounts → Create → `sliprostageblob`, Standard, **LRS**, Hot.
- Networking → add a **private endpoint** for the **blob** sub-resource into `snet-privatelink` (auto-create `privatelink.blob.core.windows.net` DNS zone).
- Containers: `documents`, `check-in-media`, `voice`, `artifacts`.
- Disable public blob access; grant `slipro-id-stage` **Storage Blob Data Contributor**.

### 8. PostgreSQL Flexible Server
Azure Database for PostgreSQL flexible servers → Create → `slipro-pg-stage`.
- Compute: **Burstable B1ms** (bump to B2s if B1ms feels tight), storage 32 GiB.
- **High availability: Disabled** (this is the main stage/prod difference).
- Networking: **Private access (VNet integration)** into the VNet — **same model as prod** (not public + firewall). Auto-creates the `privatelink.postgres.database.azure.com` DNS zone.
- Auth: PostgreSQL password auth; store the connection string in Key Vault as `DATABASE-URL`.
- Enable pgvector: Server parameters → `azure.extensions` → add **VECTOR** → Save → then `CREATE EXTENSION vector;` via psql.
- If the portal shows the **12-month-free** new-account Postgres offer, take it.

### 9. Azure OpenAI
*(Request access first if you haven't — it gates this step.)*
Azure OpenAI → Create → `slipro-openai-stage`, Standard S0.
- Networking → **private endpoint** into `snet-privatelink` (auto-create `privatelink.openai.azure.com` DNS zone); disable public access.
- In AI Foundry/OpenAI Studio, create **small** deployments: one mid, one nano, one embeddings, optionally flagship + Whisper. Note the deployment names.

### 10. Azure Cache for Redis
Azure Cache for Redis → Create → `slipro-redis-stage`, **Basic C0** (250 MB).
- Networking → **private endpoint** into `snet-privatelink` (auto-create `privatelink.redis.cache.windows.net` DNS zone).

### 11. Service Bus
Service Bus → Create → `slipro-sb-stage`, **Standard**. Create a starter queue/topic. Grant `slipro-id-stage` **Azure Service Bus Data Owner**. (Reached via managed identity + firewall — see note 2.)

### 12. Container Apps environment + app
Container Apps → Create.
- Environment `slipro-env-stage`: **VNet-integrated** into `snet-containerapps`; Log Analytics = `slipro-logs-stage`.
- App `slipro-api-stage`: **min replicas 0** for stage (accept cold start; prod uses ≥1). Assign the **user-assigned identity** `slipro-id-stage`. Start with a placeholder image; CI/CD (Phase 1, Stage 5) ships the real one.

### 13. Azure Functions
Function App → Create → `slipro-func-stage`, **Consumption** (or Flex), VNet-integrated into `snet-functions`, same Log Analytics + identity. Provision now for parity even though jobs are wired in a later phase.

### 14. Static Web Apps
Static Web Apps → Create → `slipro-web-stage`, **Standard**. Link the GitHub repo/branch (or use the deploy token in your pipeline). Build points at `client/`.

### 15. Front Door + WAF
Front Door and CDN profiles → Create → **Azure Front Door Standard** → `slipro-fd-stage`.
- Origin group 1 → Static Web Apps (`slipro-web-stage`) for static assets.
- Origin group 2 → Container App (`slipro-api-stage`) for `/api/*` and the WebSocket path; keep the Stripe webhook route (`/api/payments/webhook`) reachable.
- Create a **WAF policy** and associate it with the endpoint (same policy shape you'll use in prod).

### 16. SendGrid
Marketplace → SendGrid → Free/low plan for stage. Verify the sender/domain; put the API key in Key Vault.

---

## C. Private DNS zones (auto-created, but verify)

Creating each private endpoint above will offer to create and VNet-link the matching private DNS zone. Confirm these five exist and are linked to `slipro-vnet-stage`:
- `privatelink.vaultcore.azure.net` (Key Vault)
- `privatelink.blob.core.windows.net` (Blob)
- `privatelink.postgres.database.azure.com` (Postgres)
- `privatelink.openai.azure.com` (Azure OpenAI)
- `privatelink.redis.cache.windows.net` (Redis)

Without these links, the app inside the VNet won't resolve the private IPs.

---

## D. Cost note

Because it mirrors prod, stage is **not** as cheap as a bare-bones setup — you're paying for parity. The always-on line items are Front Door Standard, the private endpoints (small monthly each), Redis Basic C0, Service Bus Standard, and Static Web Apps Standard. Compute stays cheap: Postgres B1ms (possibly free 12 months), Container Apps scale-to-zero, Functions Consumption, and token/ingestion-billed OpenAI/Blob/App Insights are trivial at stage volume. Confirm live prices in the portal — this is guidance, not a quote.

The payoff: when you stand up prod, you copy this exact list with `-prod` names and only change the four spec columns (Postgres compute + HA, Blob redundancy, Redis tier, Container Apps replicas). No topology surprises.
