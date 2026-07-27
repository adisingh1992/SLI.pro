# Point-to-Site VPN into the Stage VNet (macOS)

**Goal:** let your laptop reach the private (VNet-only) stage services — especially `slipro-database-stage` Postgres — so you can run `npm run db:migrate` and develop against stage directly.

**Two heads-ups before you start:**
- **Cost:** a VPN Gateway is a standing monthly charge (the one non-trivial always-on cost in this stage setup). You can delete it when not in use and recreate later, but recreation takes ~30–45 min.
- **Time:** the gateway itself takes **~30–45 minutes to provision**. Kick it off, then do other work while it builds.
- **The real gotcha is DNS**, not the tunnel — see Step 5. The VPN carries packets, but your laptop still needs to *resolve* the private Postgres name to its private IP. Skipping Step 5 is the #1 reason "the VPN connects but I still can't reach the database."

---

## Step 1 — Add the GatewaySubnet

VPN gateways require a dedicated subnet named exactly `GatewaySubnet`.

- Portal → `slipro-vnet-stage` → Subnets → **+ Subnet**
- **Name:** `GatewaySubnet` (exact name — the portal enforces it)
- **Size:** `/27` (e.g. `10.x.x.x/27`) — leaves room; don't put other resources here.

## Step 2 — Create the VPN Gateway

- Portal → **Virtual Network Gateways** → **Create**
- **Name:** `slipro-vpngw-stage`
- **Gateway type:** VPN
- **VPN type:** Route-based
- **SKU:** **VpnGw1** — required for OpenVPN / Entra ID auth (the cheaper legacy **Basic** SKU does *not* support them; only pick Basic if you'll use certificate auth instead).
- **Virtual network:** `slipro-vnet-stage`
- **Public IP:** create new, `slipro-vpngw-pip-stage`
- Create. **This is the ~30–45 min wait.**

## Step 3 — Point-to-Site configuration (Entra ID auth)

Once the gateway is deployed:

- Gateway → **Point-to-site configuration** → **Configure now**
- **Address pool:** a private CIDR that does **not** overlap your VNet, e.g. `172.16.0.0/24` (this is the pool VPN clients get IPs from)
- **Tunnel type:** **OpenVPN (SSL)**
- **Authentication type:** **Microsoft Entra ID**
  - **Tenant:** `https://login.microsoftonline.com/<your-tenant-id>/`
  - **Audience:** the Azure VPN Client app id (the portal shows the current Microsoft-registered value to use)
  - **Issuer:** `https://sts.windows.net/<your-tenant-id>/`
  - (The portal's Entra ID option pre-fills most of this; just supply your tenant id.)
- **Save.**

> Cheaper alternative: **Basic SKU + certificate auth**. It avoids VpnGw1's cost but means generating a root + client certificate and, on macOS, configuring native IKEv2 by hand (the Azure VPN Client app doesn't do IKEv2/cert). For a Mac, Entra + Azure VPN Client is the smoother path — hence the recommendation above.

## Step 4 — Install the client and connect (macOS)

- Gateway → Point-to-site configuration → **Download VPN client** (gives you a config zip).
- Install **Azure VPN Client** from the Mac App Store.
- Azure VPN Client → **Import** → select the `AzureVPN/azurevpnconfig.xml` from the downloaded zip.
- Connect → sign in with your Entra ID account.

## Step 5 — Make private names resolve over the VPN (the important part)

Your Postgres FQDN `slipro-database-stage.postgres.database.azure.com` is a CNAME into a **private DNS zone** and resolves to a **private IP** only from inside the VNet. Over the VPN you must resolve it too. Pick one:

**Option A — Quick (hosts entry, fine for one dev / stage):**
1. Find the server's private IP: Portal → the private DNS zone `privatelink.postgres.database.azure.com` (or `...private.postgres.database.azure.com`) → the A record for `slipro-database-stage` → copy the IP (e.g. `10.x.x.x`).
2. On your Mac: `sudo nano /etc/hosts` and add:
   ```
   10.x.x.x   slipro-database-stage.postgres.database.azure.com
   ```
   (TLS still works because `db.ts` uses `rejectUnauthorized: false` for stage.)

**Option B — Durable (Azure DNS Private Resolver, team-scale):**
1. Deploy an **Azure DNS Private Resolver** with an **inbound endpoint** in the VNet; note its inbound IP.
2. In the P2S configuration, set the VPN client **custom DNS** to that inbound IP.
3. Now any private FQDN resolves automatically over the VPN — no hosts edits.

Start with Option A to unblock now; move to Option B if the team grows.

## Step 6 — Verify and run the migration

With the VPN connected and DNS resolving:

```
# resolves to the private IP?
nslookup slipro-database-stage.postgres.database.azure.com

# generate the migration files locally (no DB needed), commit them
npm run db:generate

# apply to the stage DB over the VPN
npm run db:migrate
```

If `db:migrate` throws a **connection-string parse error**, the DB password's special characters (`;`, `{`) are breaking URL parsing — URL-encode them in `DATABASE_URL` (`;` → `%3B`, `{` → `%7B`), or store the already-encoded form in Key Vault.

---

## Local development note

Once the VPN is up you *can* run `npm run dev` against the stage DB. For a faster inner loop, though, a **local Docker Postgres** (`DATABASE_SSL=false`) is still worth keeping for day-to-day work — connect to stage over the VPN only when you specifically need it.

## Cost / teardown

Delete `slipro-vpngw-stage` when you don't need VPN access to stop the standing charge; recreate it later (Steps 2–3) when you do — the ~30–45 min provisioning is the only cost of turning it off and on.
