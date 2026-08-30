# The scheduler — an hourly Container Apps job

Everything Wing sends without being asked runs from one entry point,
`server/wing/run-sequences.ts`, bundled into the app image as `dist/sequences.js`.

Until this job existed, nothing invoked it on a timer. Five job families were built,
tested and never fired automatically: the B3 engagement sequences, advisor snapshots,
academic-calendar touchpoints, life-event follow-ups and internship milestones. They ran
when somebody remembered to run them.

---

## Why a job and not the app

An in-process `setInterval` in the API container would run in every replica. A student on
a three-replica revision would get three copies of the same dormancy email, and the fix
would be a distributed lock nobody wants to own.

A Container Apps **job** runs on its own, on a schedule, in the same VNet, from the same
image. The migration job already works this way — `MIGRATE_JOB_NAME` in the pipeline — so
this is the pattern the deployment already understands rather than a new one.

Same image, same tag as the app revision it was deployed alongside. The hourly job and the
application it drives can never be different builds.

---

## Why hourly

`daily_prompt_hour_local` exists on the student's settings: they choose when they hear
from Wing. A daily job can honour exactly one hour for everybody, so either the setting is
a lie or the job runs often enough to act on it.

Every job in the runner asks "who is due now" against the database rather than reading a
row written when the last send happened. That has two consequences worth stating:

- **Running more often costs queries and sends nothing extra.** An hour with nobody due
  does nothing.
- **A missed hour is caught up, not lost.** If the job does not run at 14:00, the 15:00
  execution finds the same people still due. This is why the retry limit below is zero.

`0 * * * *` — on the hour, UTC. Container Apps cron expressions are always UTC.

---

## Creating the job

One-time, per environment. The pipeline updates the image on every deploy but does not
create the resource — creating infrastructure from a deploy pipeline is how an environment
gets rebuilt by accident.

```bash
RESOURCE_GROUP=<rg>
ENVIRONMENT=<container-apps-environment>
ACR_NAME=<acr>
JOB_NAME=slipro-scheduler
IMAGE="$ACR_NAME.azurecr.io/slipro-api:<tag>"

az containerapp job create \
  --name "$JOB_NAME" \
  --resource-group "$RESOURCE_GROUP" \
  --environment "$ENVIRONMENT" \
  --trigger-type Schedule \
  --cron-expression "0 * * * *" \
  --image "$IMAGE" \
  --command "node" --args "dist/sequences.js" \
  --cpu 0.5 --memory 1.0Gi \
  --parallelism 1 \
  --replica-completion-count 1 \
  --replica-timeout 1800 \
  --replica-retry-limit 0 \
  --registry-server "$ACR_NAME.azurecr.io" \
  --registry-identity system \
  --mi-system-assigned
```

Then grant the job's managed identity the same Key Vault access the app has — it resolves
`DATABASE_URL` the same way, through `initScript`, so there is no second copy of the
secret to rotate:

```bash
PRINCIPAL=$(az containerapp job show --name "$JOB_NAME" --resource-group "$RESOURCE_GROUP" \
  --query identity.principalId -o tsv)

az role assignment create \
  --assignee "$PRINCIPAL" \
  --role "Key Vault Secrets User" \
  --scope "$(az keyvault show --name <vault> --query id -o tsv)"
```

Add `SCHEDULER_JOB_NAME=slipro-scheduler` to the `slipro-stage` variable group.

---

## The settings that are not defaults

**`--parallelism 1` and `--replica-completion-count 1`.** One replica per execution. Two
replicas walking the same "who is due" list would both find the same student due, and both
would send.

**`--replica-retry-limit 0`.** A retry re-runs the whole entry point, and a run that failed
halfway has already sent to everyone before the failure. The retry would send to them
again. The next hourly execution is the retry, and it skips whoever was already served
because their send is recorded. A failed hour is one hour late; a retried hour is a
duplicate.

**`--replica-timeout 1800`.** Thirty minutes. Generous for the current volume, and the
number to revisit first if executions start being killed — a truncated walk means the
students at the end of the list are silently never reached.

**Overlap.** Container Apps can start an execution while the previous one is still
running. With hourly runs and a thirty-minute timeout that should not happen, and if it
does, the idempotence above is what protects the student rather than the schedule.

---

## Deploying a new build

The pipeline's `Scheduler` stage runs after `Deploy` and points the job at the image that
was just deployed:

```bash
az containerapp job update \
  --name "$(SCHEDULER_JOB_NAME)" \
  --resource-group "$(RESOURCE_GROUP)" \
  --image "$(ACR_NAME).azurecr.io/$(imageName):$(imageTag)"
```

After `Deploy` rather than before, deliberately. If the deploy fails its health gate the
app rolls back, and a scheduler already updated to the new image would keep running the
build that was just rejected.

---

## Watching it

```bash
# The last ten executions and how they ended.
az containerapp job execution list \
  --name slipro-scheduler --resource-group <rg> \
  --query "[].{name:name, status:properties.status, start:properties.startTime}" \
  -o table

# What one of them actually did.
az containerapp job logs show \
  --name slipro-scheduler --resource-group <rg> \
  --container slipro-scheduler --execution <execution-name>
```

**A failed execution is a real signal.** The runner catches each job's errors so one
failure cannot stop the others, and then exits non-zero if any of them failed — so a job
that has been broken for a month no longer looks identical to one with nothing to do.
The output names which job and why.

---

## Running it by hand

On stage, or while testing:

```bash
npm run wing:run-sequences -- --dry-run   # lists what is due, sends nothing
npm run wing:run-sequences                # sends
```

Or trigger the deployed job once, without waiting for the hour:

```bash
az containerapp job start --name slipro-scheduler --resource-group <rg>
```

---

## What this job does not do yet

**B2's prompt cadence.** `prompt-cadence.ts` decides when a student is due a micro-journal
or heartbeat prompt, and `prompt-selection.ts` decides which one — both tested. The job
that walks students, renders the opener and sends is not written, so no prompt goes out on
a schedule yet. Everything else in the runner does.

**The day-30 soft check-in.** `safety-hold-store.softCheckInIsDue` exists with no caller.
It belongs in this runner, on the same hourly clock.
