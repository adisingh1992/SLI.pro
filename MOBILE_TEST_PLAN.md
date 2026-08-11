# B5 — mobile test plan

Feature List B5 requires: *"Full user journey must function on mobile (iPhone
Safari, Android Chrome)"*, tested on **iPhone 13+ (Safari), Samsung Galaxy S21+
(Chrome), and one older device**, covering *"chatbot interface, form inputs,
load time (<3 sec on cellular), voice recording, email reply/voice message
flows"*.

The code-side work is done. This is the part that needs real hardware — a
resized desktop browser does not reproduce any of the three bugs that were fixed,
because all three depend on behaviour a desktop browser does not have.

---

## Why a resized desktop window is not a test

The three mobile bugs fixed in this session were all invisible at a narrow
desktop width:

| Bug | Why desktop can't show it |
|---|---|
| `100vh` taller than the visible area | Desktop has no collapsing address bar |
| iOS zooming on input focus | Desktop has no focus-zoom behaviour at all |
| Touch targets shrunk 5% by `html { zoom }` | Mouse pointers hit small targets fine |

So every check below is marked with what specifically needs a device.

---

## 1. The bugs that were fixed — confirm they are actually fixed

**iOS input zoom** — iPhone Safari only.
Open a Foundation Session, tap the message box. The page must **not** zoom in.
Repeat on the intake conversation and the life log.
*This is the highest-value check: it affected a fifteen-minute typing session and
iOS never zooms back out on its own.*

**Message box below the fold** — iPhone Safari and Android Chrome.
Open a session with the address bar visible. The message box and send button
must be on screen without scrolling. Scroll down so the address bar collapses,
then back up — the layout must not jump or leave a gap.

**Pinch zoom** — Android Chrome specifically.
Pinch to zoom anywhere. It must work. (`maximum-scale=1` was removed; Android
honoured it, iOS never did.)

**Session controls on mobile** — both.
In a session, confirm the timer and the **End** button are visible. Before this
session there was no way to leave a session on a phone at all.

---

## 2. The journey, end to end, on the device

Do this once per device as one continuous run, not as isolated screens.

1. **Register** a new account.
2. **Intake conversation** — answer 8–10 questions. Watch for the Q8–10 insight.
   Check the composer stays reachable as the transcript grows.
3. **Demographics step** — the selects must open and be usable one-handed.
4. **Dashboard** — cards readable, nothing clipped.
5. **Foundation Session 1** — a full session. This is the longest single
   interaction and the one that matters most.
6. **Voice recording** — see section 3.
7. **Life log** — write an entry, check Wing's reply renders.
8. **Portfolio** — build it, check the coverage grid is legible at 375px.

---

## 3. Voice recording — the one with real platform risk

iOS Safari and Android Chrome expose different MediaRecorder MIME types. The
code negotiates (`audio/webm;codecs=opus` → `audio/webm` → `audio/ogg` →
`audio/mp4`), and **iOS needs the `audio/mp4` fallback**, which is last in the
list — so iOS is exercising a path Android never touches.

- Tap the mic in a session. The permission prompt must appear.
- Record ~10 seconds, stop, confirm the transcript arrives in the input box.
- **Deny** permission once and confirm the failure is explained, not silent.
- Lock the screen mid-recording, unlock, and check the app has not wedged.

---

## 4. The `<3s on cellular` measurement

This is a **number the spec asks for**, so it needs measuring rather than
eyeballing.

- Real cellular, not throttled wifi. 4G, not 5G — 4G is the honest floor.
- Measure **first contentful paint on the login page**, cold, with cache
  cleared.
- Repeat three times and take the median; a single sample on mobile networks is
  noise.
- Record the actual number even if it passes — "under 3 seconds" without a
  figure cannot be compared against later.

Known contributors already addressed: the Replit badge script (a third-party
request on every page load) was removed. Two Google Fonts stylesheets remain and
are render-blocking — if the number misses, that is the first thing to look at.

---

## 5. Devices

| Device | Browser | Notes |
|---|---|---|
| iPhone 13 or newer | Safari | The zoom and `dvh` behaviour lives here |
| Samsung Galaxy S21+ | Chrome | Pinch-zoom check is Android-specific |
| One older device | either | The spec asks for it; anything 4+ years old |

The older device matters for a reason worth stating: it is where the session
chat's scroll performance and the base64 screenshot upload on the monthly
check-in are most likely to struggle, and neither shows up on current hardware.

---

## 6. Recording the result

For each device, note: **passed / failed / not tested**, and for any failure the
screen, what happened, and what you expected. A failure with no repro is worse
than an untested item, because it looks handled.

The cellular number goes in whatever the outcome — it is the only figure in B5
that a partner could ask about.
