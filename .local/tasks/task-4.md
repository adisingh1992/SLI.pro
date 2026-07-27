---
title: End Foundation Session early
---
# End Foundation Session Early

## What & Why
Clicking "End Session Anyway" in the early-end dialog on a Foundation Session currently just navigates the user to the home page without actually ending the session — the session stays in `in_progress`. Wire the button to a real end-session flow that mirrors the normal auto-completion path so the session is properly marked completed, analyzed, and (where applicable) the next session is unlocked.

## Done looks like
- In any Foundation Session (1, 2, or 3), clicking "End Session Early" → "End Session Anyway" actually ends the session.
- The session's status becomes `completed`, with `completedAt` set and `completionData` populated by the same Claude analysis used during normal auto-completion.
- For sessions 1 and 2, the next session is unlocked just like in normal completion.
- The user sees a "Session Completed!" toast (same as normal completion) and is then taken to the home page.
- Session list and session detail queries are refreshed so the dashboard reflects the new completed state immediately.
- If the end-early request fails, the user stays on the page and sees a clear error toast (no silent navigation).

## Out of scope
- Changing the normal auto-completion logic or the Claude analysis itself.
- Adding a separate "ended early" status — the session is marked `completed`, same as normal.
- Any UI changes beyond the button behavior, pending state, and toast.

## Steps
1. **Backend end-early endpoint** — Add `POST /api/foundation-sessions/:sessionNumber/end-early`. It must require auth, verify ownership, require status `in_progress`, run the existing `checkSessionCompletion` helper on the current messages + user profile, persist `status: 'completed'`, `completedAt`, and the resulting `completionData` (use the analyzer's output when available; otherwise save a minimal `{ endedEarly: true, completedAt }` stub so the session is still marked completed), and unlock the next session if `sessionNumber < 3` — matching the auto-completion branch in the streaming chat handler.
2. **Frontend mutation + button wiring** — In the Foundation Session chat page, add an `endSessionEarlyMutation` that POSTs to the new endpoint. Replace the current `navigate('/')`-only handler on "End Session Anyway" with one that runs the mutation, shows a pending state on the button, on success invalidates `['/api/foundation-sessions', sessionNumber]` and `['/api/foundation-sessions']`, shows the same "Session Completed!" toast used by the normal completion flow, then navigates to `/`. On error, show a destructive toast and keep the user on the page.

## Relevant files
- `client/src/pages/foundation-session-chat.tsx:46,659-689,100-226`
- `server/foundation-sessions-routes.ts:170-257,460-547,549-757`