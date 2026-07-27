---
title: Admin session transcripts Excel report
---
## What & Why
Add a new admin report that exports full chat transcripts for a single Foundation Session (1, 2, or 3) or Enhancement Module (A, B, or C). The admin picks one session/module, and the system generates a multi-sheet Excel workbook — one sheet per user (named with the user's email) — containing every message in that user's transcript(s) for that session/module, so coaches can review who said what and when.

## Done looks like
- On the existing admin Reports page, there is a new "Session Transcripts" report card alongside the current reports.
- The card has a selector for which session/module to export, with these 6 options:
  - Foundation Session 1
  - Foundation Session 2
  - Foundation Session 3
  - Enhancement Module A
  - Enhancement Module B
  - Enhancement Module C
- A "Generate Report" button downloads an `.xlsx` file. The filename clearly indicates which session/module was exported (e.g. `session-transcripts-foundation-1-YYYY-MM-DD.xlsx`).
- The workbook contains one sheet per user who has at least one transcript for the chosen session/module. Users with no transcript are skipped entirely.
- Each sheet is named with the user's email, sanitized for Excel:
  - Excel-disallowed characters (`: \ / ? * [ ]`) are replaced with `_`
  - Sheet names are truncated to 31 characters
  - Duplicate sanitized names get a numeric suffix (e.g. `_2`)
- Each sheet has 4 columns with a styled header row: `Message #`, `Date & Time (PST)`, `Sender`, `Message`
  - `Message #` — sequential per conversation, restarting at 1 for each conversation block
  - `Date & Time (PST)` — formatted in America/Los_Angeles time, single column, with the label "(PST)" in the header so the timezone is unambiguous
  - `Sender` — `User` or `Chatbot` (mapped from `role`: `user` → `User`, `assistant` → `Chatbot`)
  - `Message` — full message text, with text wrapping enabled and a generous column width
- If a user has multiple session/module records (e.g. they restarted), all transcripts are included in their sheet, separated by a divider row that shows which conversation it is and when it was started/completed (e.g. "Conversation 2 — started May 3, 2026 10:14 AM PST"). `Message #` resets at 1 for each conversation block.
- Within each conversation block, messages are ordered chronologically (oldest first).
- Users are sorted by email so sheet order is predictable.
- The endpoint is admin-protected the same way as the existing report endpoints; non-admins get a 403.
- A loading state is shown on the button while the report is being generated, and a clear error toast appears if generation fails.

## Out of scope
- Selecting multiple sessions/modules in one export.
- Filtering by individual user, date range, or completion status.
- Including transcripts from the general `conversations` table (only `foundation_sessions` and `enhancement_modules`).
- Any non-Excel format (CSV, PDF).
- Changes to how transcripts are stored or rendered elsewhere in the app.

## Steps
1. **Backend export endpoint** — Add a new admin-protected route that accepts a `type` (`foundation` | `enhancement`) and an `identifier` (session number `1`/`2`/`3` or module code `A`/`B`/`C`). Query all matching session/module records across all users, group by user, fetch each record's messages, and build an `ExcelJS` workbook with one sheet per user (sheet name = sanitized email). Each sheet renders the 4-column layout, conversation divider rows when a user has multiple records, and PST-formatted timestamps. Return the workbook as an `.xlsx` download with a descriptive filename. Mirror the styling and middleware patterns of the existing export endpoints in `server/routes.ts`.
2. **Admin UI card** — Add a new "Session Transcripts" card to the admin Reports page alongside the existing report cards. Include a dropdown with the 6 fixed options (Foundation Session 1/2/3, Enhancement Module A/B/C) and a Generate button that triggers the download with a loading state and an error toast on failure. Match the visual style of the surrounding report cards.

## Relevant files
- `client/src/pages/admin/reports-page.tsx`
- `server/routes.ts:991-1500`
- `server/foundation-sessions-routes.ts`
- `server/enhancement-modules-routes.ts`
- `server/database-storage.ts:891`
- `shared/schema.ts`