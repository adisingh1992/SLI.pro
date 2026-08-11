# Foundation Session chat — performance audit

Three complaints: slow after every turn, the UI misbehaves while processing,
text sometimes disappears. They turned out to be three different problems, and
the third was not a performance problem at all.

---

## 1 · The text disappearing was a broken contract

The turn stream is Server-Sent Events, and its event names are string literals
in two files that never see each other. They had drifted:

| server sends | client listened for |
|---|---|
| `chunk` | `chunk` ✓ |
| `turn_complete` | `complete` ✗ |
| `done` | `user_message` ✗ |
| `session_completed` | `session_completed` ✓ |
| `error` | `error` ✓ |

Two branches never ran. The consequences compounded:

- **`user_message` never fired**, so the optimistic user bubble never appeared.
- **`complete` never fired**, so `invalidateQueries` never ran after a normal
  turn — the session was *never refetched*.

Which means Wing's reply existed only in `streamingResponse`, a piece of React
state. It was never written into the rendered message list. On the next send,
`setStreamingResponse('')` erased it.

**That is the disappearing text.** Not a race, not a render bug — a refetch
wired to an event nobody was sending. The transcript only appeared after a page
reload, which is presumably why it looked intermittent.

`api-contracts.test.ts` now compares the two vocabularies and fails the build on
drift. Verified by reintroducing the exact mismatch.

## 2 · The wait was bookkeeping, not conversation

Per turn, after Wing stopped speaking and before the client was told the turn
had ended:

1. `recordObjectiveEvidence` — a mid-tier model call
2. `checkSessionCompletion` — a mid-tier model call **over the entire
   transcript**, on every turn, including turn 2 of 30

The reply was visibly complete and the composer stayed disabled for both. The
conversation was never the slow part.

`turn_complete` is now emitted as soon as the assistant turn is durable. The
connection stays open — a session that finishes on this turn still needs to say
so, and that verdict isn't known yet — but the UI is released immediately.

The same change was applied to the enhancement-module stream, which had the
identical shape.

## 3 · Six sequential round trips before the first token

Everything below ran in series before the model was even asked to start:

```
getTurnsAsMessages → getUserProfile → buildPriorSessionContexts
  → buildStudentContext → resolveCompletionCriteria
  → buildObjectivePrompt → evaluateTurn (nano model call)
```

Two fixes:

- **`getUserProfile` is gone from the turn path.** It runs six queries and
  returns every document with its full `extracted_text` — a resume and a
  LinkedIn export, in full — plus every session's artifact jsonb. Every use of
  its result, here and in `checkSessionCompletion`, read exactly one field:
  `professionalStatus`. It now reads one column. (`checkSessionCompletion`'s
  signature narrowed to match, which is what made this possible.)
- **The independent reads run together**, and `evaluateTurn` overlaps prompt
  assembly rather than following it. It needs only the turn and its
  predecessors, both already in hand, and its answer isn't needed until the
  system prompt is assembled.

`getTurnsAsMessages` is also no longer called a second time after the stream —
the list is assembled from what was already read plus the reply just generated.

---

## The client state machine

`optimisticMessage`, `streamingResponse` and `isStreaming` were cleared
independently against a refetch that landed whenever it landed. The clearing
condition compared `messages.length` to a count captured before sending — a
count the optimistic bubble itself inflated.

They are now one `PendingTurn`, retired when the **turn ids the server
confirmed** appear in fetched data. `turn_complete` carries `humanTurnId` and
`assistantTurnId`, so there is something definite to wait for instead of a
heuristic.

Also fixed while in here:

- **A failed send no longer eats the message.** `setCurrentMessage('')` ran in
  `finally` regardless of outcome, so a dropped connection lost whatever the
  student had typed. It's restored to the composer on failure.
- **An empty assistant bubble no longer renders** while waiting for the first
  token — three pulsing dots instead, which reads as thinking rather than as a
  broken turn.
- **First paint doesn't animate** through a long transcript; smooth scrolling
  starts after the first render.

---

## Not changed, deliberately

- **`buildStudentContext` stays on the critical path.** It is the expensive
  read that remains, and Wing genuinely needs it in the prompt — that is the A2
  fix. Removing it would take the coaching backwards to asking for things
  already in the database.
- **No turn-count gate on completion.** The existing comment is right that the
  methodology decides when a session is done, not an arbitrary threshold. The
  cost is now off the student's critical path, which was the actual problem.
- **`checkModuleCompletion` still takes the full profile.** The module prompt
  genuinely uses it for context, unlike the Foundation path.

## 4 · Local dev talks to the stage database, and it dominates

From a local `npm run dev` server log:

```
GET   /api/user/homework   304 in 2650ms  ::  []
GET   /api/user/slis       404 in 2025ms  ::  {"message":"No SLIs found"}
PATCH /api/.../timer       200 in 6346ms
GET   /api/foundation-sessions/2  200 in 9518ms
```

An endpoint returning an empty array in 2.65 seconds is not doing application
work. `npm run dev` loads secrets from the **stage** Key Vault, so every query
is a round trip to Azure Postgres over the VPN — roughly 1.5s each. The session
timer was three trivial statements and took six seconds.

This is a development-environment property, not a product one: on stage the app
runs inside the same VNet as the database. But it changes what to optimise for,
because it makes query *count* the dominant term. Two consequences:

- **`getSessionForUser`** replaces the `studentIdFor` → `getSession` pair that
  opened almost every session endpoint. One indexed join instead of two
  sequential round trips. Applied to the turn and to the timer, which fires
  continuously for the whole session and so pays its cost over and over.
- **Judge these changes by relative improvement locally, or absolute numbers on
  stage.** Local absolute timings are mostly measuring the VPN.

## 5 · The turn is now timed

`[foundation] session N turn timing — session 0.4s | turns 1.1s | context 2.3s
| prompt 2.9s | first token 4.1s | stream done 12.6s | TURN RELEASED 13.0s |
analysis 41.2s`

Every guess at this so far has been wrong in an interesting way — post-stream
analysis, then a profile fetch nobody needed, then plain network latency. One
line per turn means the next person doesn't have to guess either.

`TURN RELEASED` is the number the student actually experiences. Everything
between it and `analysis` is off their clock.

## 6 · The session timer was competing with the conversation

From a clean restart, during a single turn:

```
4:45:26 PATCH .../timer 200 in 1416ms
4:45:30 PATCH .../timer 200 in 4869ms
4:45:37 PATCH .../timer 200 in 1894ms
4:45:39 PATCH .../timer 200 in 3865ms      ← turn starts around here
4:45:47 PATCH .../timer 200 in 2632ms
4:45:47 PATCH .../timer 200 in 2635ms      ← two in the same second
4:45:56 PATCH .../timer 200 in 1429ms
4:45:59 PATCH .../timer 200 in 4303ms
```

Two causes, compounding:

- The timer saved **every 10 seconds**.
- The chat page renders `SessionTimer` **twice** — desktop sidebar and mobile —
  and both are mounted at every width, so both ran their own save interval.
  That is the pair landing on the same second.

**120 writes over a ten-minute session, now 10.** Each takes 1.4–4.9s against
the remote database, and five of them landed *inside* one chat turn, competing
for connections in a pool of ten. The bookkeeping was slowing down the thing it
was keeping book on.

- Interval 10s → 60s. That granularity is right for a number whose only job is
  "you're around the recommended 8–10 minutes".
- `persist` prop, default true; the mobile instance sets it false. Both still
  display correctly — elapsed time is derived locally, so a read-only timer
  counts identically.
- Flush on unmount and on `pagehide` / `visibilitychange`, so a longer interval
  costs nothing on an ordinary exit.

### The flush handler then made it worse, briefly

The first version of that flush effect listed `saveTimerToDatabase` in its
dependencies. That function closes over `lastSavedTime`, so:

```
save → setLastSavedTime → new function identity → React tears the effect down
     → the cleanup saves → repeat
```

A cleanup with a side effect, re-triggered by its own side effect. It ran about
once a second — worse than the every-ten-seconds behaviour it replaced, and
visible only as a wall of requests in a terminal.

Two changes, because the fix and the guard are different things:

- **The fix.** The save function is held in a ref, so the effect's dependencies
  are `[persist, sessionNumber]` — stable — and the cleanup runs when the
  component actually goes away.
- **The guard.** `MIN_SAVE_GAP_MS` refuses any non-forced write within ten
  seconds of the last. There is no legitimate reason for two elapsed-second
  writes that close together, so a future dependency mistake costs six requests
  a minute rather than sixty. Exit flushes pass `force` — those must happen
  regardless, and they are the one case where the throttle would lose data.

The rule worth keeping: *a cleanup with a side effect must not depend on
anything that side effect changes.*

`sendBeacon` can only issue a POST, so the timer route now accepts POST as well
as PATCH. Without that the closing flush would have 404'd silently — the exact
failure shape this document keeps being about.

### And then the beacon fired on every tab switch

The next log showed the interval behaving — 6:02:55 and 6:03:54, fifty-nine
seconds apart — followed by this:

```
6:04:15 POST .../timer 200 in 4082ms
6:04:20 POST .../timer 200 in 2612ms
6:04:28 POST .../timer 200 in 2285ms
6:04:40 POST .../timer 200 in 2365ms
```

PATCH is the interval; POST is `sendBeacon`. Four beacons in twenty-five
seconds, from alt-tabbing between the browser and an editor.

`visibilitychange` fires on every tab switch, not only on exit. The guard was
`elapsed > lastSaved`, and elapsed grows every second — so it was true again
moments later. And because the beacon never advanced `lastSavedTimeRef`,
nothing ever made it false. The beacon also went straight to `navigator`, so
the ten-second floor on `saveTimerToDatabase` never applied to it.

Two corrections:

- **A queued beacon advances the same refs a real save does.** The interval,
  the unmount flush and the beacon now share one notion of what the server
  already knows. `sendBeacon` returns whether the request was queued, which is
  the only signal available — there is no response — so the refs move only when
  it returns true.
- **`hidden` is throttled; `pagehide` is not.** They are different events and
  deserved different treatment from the start. A tab switch is speculative and
  may repeat all afternoon. A pagehide is the last chance to record anything,
  and throttling it would discard the data the flush exists to preserve.

Ten-minute session, twenty tab switches: 30 writes before, 16 after, against 10
in the steady state.

Both of this section's bugs were mine, one turn apart, and both had the same
shape — **an exit path that does not record that it ran.** Worth stating once:
a handler that writes must update whatever the next caller reads to decide
whether writing is necessary.

## 7 · One wasted model round trip per cold start

```
[orchestrator] deployment 'gpt-5.6-luna' only supports the default temperature;
  retrying without it and omitting it on subsequent calls.
```

This is not a quirk to be discovered — it is documented behaviour. The GPT-5
series and o-series reasoning models reject any explicit temperature with a
400 (*"Only the default (1) value is supported"*), because their decoding
involves several rounds of generation and selection that an external
temperature would cut across.

The orchestrator found out by sending the request, taking the 400, and
retrying. Correct and self-healing, and it costs one wasted round trip per
deployment per process. In a long-lived process that is a one-off; in Container
Apps every replica starts cold and re-learns it, and the student who sends the
first turn on a new replica pays.

Three layers now, most specific first:

1. `FIXED_TEMPERATURE_DEPLOYMENTS` — an escape hatch for deployments whose
   names say nothing about the model behind them. Azure deployment names are
   arbitrary, so a name is a hint, not a guarantee.
2. A name pattern — catches the ordinary case, where the deployment is named
   after its model. No configuration needed for `gpt-5.6-luna`.
3. Runtime learning — unchanged, still the backstop.

**The near-misses are the whole difficulty**, so they are pinned in
`orchestrator/temperature.test.ts`: `gpt-4o` must still receive a temperature,
`o4-mini` must not. Getting it wrong permissively reinstates the wasted round
trip; getting it wrong strictly silently drops temperature from a model that
honours it — which would make the nano-tier classifier non-deterministic with
no error to notice.

Those names are regex fixtures, not deployments. Nothing in that file is
deployed or reachable, and the file now says so — a list of model names in a
test reads like a list of models in use, which is worth one sentence to
prevent. The three real deployments are `gpt-5.6-luna`, `gpt-5.6-terra` and
`gpt-5.6-sol`, and all three are asserted to reject an explicit temperature.

## 8 · One provider

Anthropic was removed from the orchestrator entirely — client, model
resolution, and both call paths. It was kept through the Replit migration so
the MVP's prompts could be re-tuned against Azure without the app going dark in
between; that period is over.

The reason to delete rather than leave dormant is the fallback, not the cost.
`activeProvider()` returned Anthropic whenever `AZURE_OPENAI_ENDPOINT` was
unset, so a config mistake did not fail — it routed to a provider with no key
and surfaced as an authentication error several layers from the variable that
was actually wrong. **A provider that only runs when configuration is broken
converts a loud failure into a quiet one**, which is the theme of this whole
document.

Now: a missing endpoint fails readiness by name, a missing `_MID` does too, and
a missing `_NANO` reports *degraded* rather than down — because `_MID` is a
genuine fallback for it, and taking a replica out of rotation for a survivable
gap would be worse than the gap. Guard check 9 in `api-contracts.test.ts` fails
the build on an SDK import, an `ANTHROPIC_*` or `CLAUDE_MODEL` read anywhere
under `server/`, or the dependency reappearing in `package.json`. Verified by
reintroducing each of the three.

## 9 · The page crashed mid-stream, and that was mine

```
Uncaught Error: The connection closed before Wing finished
  at foundation-session-chat.tsx:410
The above error occurred in the <FoundationSessionChatPage> component
```

White page, twenty minutes into a session. Two separate defects, both
introduced by §2 and §"The client state machine" above.

**A throw inside a `setState` updater.** The end-of-stream check was written as:

```js
setPending(p => {
  if (p && p.phase !== 'settling') throw new Error('…');
  return p;
});
```

That reads like ordinary control flow and is not. `setPending` returns
normally; React invokes the updater later, during its render phase. The throw
therefore **missed the surrounding `try/catch` entirely** and surfaced as a
render error — and React's response to an unhandled render error is to unmount
the whole tree. A line written to improve error handling was the thing that
blanked the page. (StrictMode double-invokes updaters in development, which is
why the console showed it twice.)

An updater must be pure. The check is now a local `let sawTurnComplete`,
thrown where it is written, caught where the catch is.

**A finished stream writing over its successor.** Releasing the composer at
`turn_complete` was right, but it means the reader for turn *n* is still open
while turn *n+1* is being sent — 23s to release, 54s to body end in the log
above. The reader's final `setPending` acted on whatever `pending` currently
held, which by then was the *next* turn. It saw phase `'sending'`, concluded
its own stream had ended early, and threw.

Every turn now takes a token, and each reader's writes are conditional on
still being the current turn. A stale reader becomes a no-op rather than a
corruption. The same token makes a superseded turn's failure silent, since a
destructive toast about an older turn would be both confusing and wrong.

Also fixed while here: `sendMessage` bailed on `pending` being set, which
included the whole `'settling'` phase — so for up to thirty seconds after the
composer visibly unlocked, pressing Enter did nothing at all. It now blocks
only while Wing is actually speaking.

Two guards: check 10 fails the build on a `throw` inside any `setX(… => {…})`
updater across `client/src`, verified against the original line; and every
authenticated page now renders inside an `ErrorBoundary`, because the specific
bug is fixed and the next one will be different — the blast radius is the part
worth capping.

## 10 · HMR was never connected, which explains two false diagnoses

```
WebSocket connection to 'ws://localhost:undefined/?token=…' failed
```

In middleware mode Vite shares the app's HTTP server, so there is no separate
dev-server port to infer — without `clientPort` the injected client builds its
socket URL from a port it never received.

This is not cosmetic. With the HMR socket dead, **edits never hot-apply**: the
browser keeps running whatever bundle it first loaded. Two rounds of debugging
this session were spent on symptoms that had already been fixed, and both were
written off as "a stale Vite bundle" without asking why the bundle was stale.
The console had been saying so the whole time.

### Fixing it caused an infinite reload loop, which was the real finding

```
WebSocket connection to 'ws://localhost:5173/?token=…' failed
[vite] server connection lost. Polling for restart...
```

The URL was now right and the connection still died — because the voice
WebSocket handler ended with:

```js
if (pathname === '/ws/voice') { … } else { socket.destroy(); }
```

`upgrade` is an event, not a router. Node delivers it to **every** registered
listener, and this process has two: the voice handler and Vite's HMR socket,
which share the port in development. That `else` severed the HMR handshake.
Vite read the closed socket as "server connection lost", reloaded the page,
reconnected, was severed again — a reload loop that made the app unusable.

Two bugs had been masking each other. The client built an invalid URL, so
`new WebSocket()` threw in the browser before any connection was attempted;
the server would have killed that connection if it had ever arrived. **A
broken client was hiding a broken server**, and fixing either one alone
produces a worse symptom than leaving both. That is the more interesting half
of this: the reason to chase a console error you have already decided is
cosmetic.

The rule is now one line — handle your path, return on everything else — and
check 12 fails the build on either half: a client dialling a path the server
does not accept, or an upgrade handler destroying sockets it does not own.

## 11 · Prompt assembly took five times longer than the answer

From the same timing line:

| phase | Δ | what it is |
|---|---|---|
| session | 0.3s | one indexed join |
| turns | 2.2s | transcript read |
| context | 3.7s | three reads in parallel |
| **prompt** | **7.0s** | **four sequential round trips** |
| first token | 3.3s | model latency |
| stream done | 1.4s | **the actual generation** |
| **TURN RELEASED** | **5.2s** | **one insert** |
| analysis | 24.3s | off the student's clock |

Generation took 1.4 seconds. Assembling the prompt took 7. Four sequential
queries — published criteria, the objective set, the intervention cards, and
the session's satisfied objectives — at roughly a second and a half each.

Three of those four are **editorial content that is identical on every turn of
every session**: criteria, objective sets and cards. They follow the
retire-never-edit rule, so a row is never updated in place — publishing
inserts a new row and retires the old. A cached copy therefore cannot become
*wrong*, only *stale*, which is a much weaker failure and the reason caching is
defensible here when it would not be for a transcript or a student's documents.

`published-cache.ts` holds them for sixty seconds. Every publish and revert
path clears its own namespace; the TTL exists only to bound the disagreement
between replicas, since a publish served by one replica cannot notify the
others. A minute of skew on a page edited a few times a week is not worth a
pub/sub channel.

The fourth — the session's satisfied objectives — is per-session state and is
not cached. It now starts before the editorial reads are awaited rather than
after, so it overlaps them instead of following.

Expect prompt assembly to fall from ~7s to roughly one round trip after the
first turn on a replica.

Check 11 fails the build if a namespace is cached and never invalidated. That
failure mode is specific and nasty: editing criteria appears to do nothing,
then works a minute later, or on a colleague's machine — which trains people to
distrust the editor rather than look for a cache.

### The cache helped less than predicted, and the reason was the interesting part

Three turns after the change:

```
turns 2.6s | context 6.3s | prompt 11.8s | first token 15.1s | RELEASED 19.1s
turns 2.9s | context 6.0s | prompt 11.2s | first token 14.1s | RELEASED 17.2s
turns 2.9s | context 6.9s | prompt 13.2s | first token 16.8s | RELEASED 19.1s
```

The `prompt` phase fell from 7.0s to about 5.2s — one round trip, which is the
criteria lookup now being cached. I had predicted it would fall to roughly one
round trip *total*. It did not, and the reason is that **most of that phase
was never database work at all.**

`engine.evaluateTurn` is a nano-tier model call, and the prompt phase was
waiting on it. The objective renderer is off for this population, so
`buildObjectivePrompt` returns immediately without querying; the criteria
lookup is cached. What was left was one model call, and I had attributed it to
prompt assembly because that is where the mark sat.

**A phase boundary is a claim about what the time is spent on.** `prompt` was
measuring two unrelated things and I optimised the smaller one. There are now
two marks — `assembled` and `engine wait` — so the split is visible rather than
inferred.

### A promise started later than its inputs allow is not parallel

`evaluateTurn` was created immediately *after* the context reads, one line
below a comment of mine asserting it depended only on things "already in
hand". That was true. It was still started three seconds later than it needed
to be, because it sat after an `await` for data it never uses.

Its four arguments — student, session, the turn's text, the preceding turns —
are all available the moment the transcript read returns. It now starts there,
so it overlaps the context reads too.

The general form, which is worth more than this instance: *a promise created
and awaited later is only a win if it is created at the earliest point its
inputs exist.* Otherwise it is a serial call wearing a parallel shape — and it
reads as parallel in review, which is exactly why it survived two passes over
this file. Only the measurement caught it.

### What the split marks then showed

```
session 0.4s | turns 3.0s | context 7.2s | assembled 7.2s | engine wait 8.2s
| prompt 8.2s | first token 13.4s | stream done 14.0s | TURN RELEASED 15.8s
```

- **`assembled` +0.0s.** Prompt assembly is now free. The cache does what it
  was supposed to.
- **`engine wait` +1.0s**, from 5.2s of blocking. The overlap works.
- **`TURN RELEASED` 17.2s → 15.8s.**

And with those two gone, the shape of the remainder was obvious: `turns` +2.6s
and `context` +4.2s, strictly sequential, at the very front.

The context reads need `legacyUserId`, `studentId` and the session number —
all returned by the session lookup at 0.4s. They need nothing from the turn
write or the transcript read, and sat behind both. **The same mistake, one
level further up, found by the same measurement.** They now start immediately
after the session lookup, so the write and the read overlap them rather than
delaying them.

A note on the guard that came with it: `contextPromise.catch(() => {})` is
attached the moment the promise is created. If `addHumanTurn` throws on the
next line, nothing would ever await the context promise, and an unhandled
rejection terminates the process under Node's default policy — one database
blip taking down every session on the replica. The `await` further down still
sees the rejection; the no-op catch only tells Node someone is listening.
**Every promise started early needs this.** It is the tax on the pattern.

### Where the time goes now, and the one decision left

The remaining critical path is `first token` — 3.7 to 5.2 seconds between the
request leaving and the first token arriving. That is Azure's latency on the
flagship deployment, and the main lever on it is prompt size.

Which is where the objective renderer comes in. It is **off** for this
population, so every turn sends the legacy prompt file: roughly 22,000
characters. The renderer's whole purpose is to send ~1,500 instead — one
objective and its cards rather than everything at once.

That is not a performance decision to make quietly. The comparison it exists
to run is which produces better coaching, and turning it on to save latency
would answer a question nobody asked with an experiment nobody designed. It is
listed here as the next lever with the trade-off attached, not applied.

**Still on the list:** the gap between `stream done` and `TURN RELEASED` is a
single insert, and it has measured between 1.8s and 5.2s. Worth understanding
before assuming it is only the VPN.

## Still unverified

None of this has been run. Typecheck holds at 97 and all eight suites pass,
which says the shapes are right and nothing about behaviour. Worth watching on
the first real session:

- the composer releasing as soon as Wing stops, not seconds later
- the reply staying on screen when you send the next message
- no duplicate bubble as the refetch lands
