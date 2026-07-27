# User Branding Intake Excel Export

## What & Why
Add an admin-accessible endpoint that generates and downloads an Excel file containing every user's branding intake responses. Each row represents one question/answer pair for one user. This gives admins a flat, reviewable record of all intake data without needing database access.

## Done looks like
- A "Download Excel Export" button appears on the admin dashboard
- Clicking it downloads a `.xlsx` file immediately
- The file contains one row per user per intake question with these columns:
  - User Email
  - Name (first + last)
  - Phone Number
  - Branding Intake Question (full question label from INTAKE_SCHEMA)
  - Branding Intake Answer (resolved display value)
  - Platform (undergraduate / early_career / mid_career)
  - Created At (user account creation date)
- Rows are sorted by user email, then by question order within each user's platform schema

## Out of scope
- Filtering or date-range selection (full export only)
- Password-protecting the file
- Scheduling or emailing the export

## Steps
1. **Install Excel library** — Add `exceljs` (or `xlsx`) as a server-side dependency for generating `.xlsx` files
2. **Move INTAKE_SCHEMA to shared** — Copy or re-export `INTAKE_SCHEMA` and `resolveIntakeFieldValue` from `client/src/lib/intake-admin-schema.ts` into a new `server/intake-schema.ts` file so the backend can reference the question labels without importing client code
3. **Add admin export endpoint** — Create `GET /api/admin/export/branding-intake` in the admin routes. It should: query all users joined with their `branding_intakes` row; for each user, iterate over the INTAKE_SCHEMA questions for their platform; emit one row per question with the resolved answer; stream the resulting `.xlsx` back as a file download with an appropriate `Content-Disposition` header
4. **Add download button to admin dashboard** — Add a clearly labelled "Download Intake Export (.xlsx)" button in the admin dashboard that triggers the endpoint and initiates a browser file download

## Relevant files
- `client/src/lib/intake-admin-schema.ts`
- `client/src/pages/admin/dashboard-page.tsx`
- `server/routes.ts`
- `shared/schema.ts`
