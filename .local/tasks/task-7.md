---
title: Update sign-up copy to 'Create Account'
---
# Sign-up copy: account creation language

## What & Why
Replace "Request Membership" / "Membership Request" / pending-approval language on the auth page so new users understand they have an instant account, not a pending application. Several users mistakenly waited days for an approval email that never arrives.

## Done looks like
- The link on the login view reads: "New here? Create Your Account" (instead of "Request Membership").
- The header on the sign-up view reads: "Create Account" (instead of "Membership Request").
- After a successful sign-up, the confirmation view tells the user their account has been created and asks them to log in to access it (no mention of validation, approval, or 24–48 hour activation).
- No other auth-page behavior changes (form fields, validation, routing, login flow stay the same).

## Out of scope
- Visual redesign of the auth page (colors, layout, icon).
- Any backend changes to the `/api/register` flow.
- Copy changes outside the auth page (e.g. emails, admin dashboard).
- The legacy HTML mockups under `attached_assets/` (reference only).

## Steps
1. **Update sign-up entry link** — On the login view, change the "Request Membership" call-to-action to "Create Your Account".
2. **Update sign-up view header** — Change the sign-up form heading from "Membership Request" to "Create Account".
3. **Rewrite post-sign-up success message** — Replace the "Request Submitted" heading, the "credentials are being validated" body copy, and the "Estimated Activation: 24–48 Hours" line with a message that says the account has been created and asks the user to log in to access it. Keep the success check icon and the "Return" button so the user can go back to the login view.

## Relevant files
- `client/src/pages/auth-page.tsx:217-227`
- `client/src/pages/auth-page.tsx:348-361`
- `client/src/pages/auth-page.tsx:626-648`