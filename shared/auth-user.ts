/**
 * The shape of the signed-in user, as the client actually receives it.
 *
 * ── WHY THIS IS NOT `User` FROM @shared/schema ───────────────────────────
 * `User` describes a row in `public.users` — the legacy MVP table. Since the
 * identity cutover, `/api/user` returns a row from `wing.users` mapped through
 * `AuthUser`. The two disagree in ways that matter: the wing user has `email`
 * and a four-value `role`; the public row has `username` and a boolean
 * `is_admin`, and carries a `password` column that is never sent.
 *
 * The client having been typed against the wrong table is the same failure
 * this project keeps hitting from the other direction — a read migrated to
 * `wing` with something left pointing at `public`. Here it was silent because
 * the overlapping fields happen to line up, so everything compiled and
 * `user.role` simply did not exist as far as TypeScript knew.
 *
 * This type is written to match `server/auth.ts`'s allowlist field for field.
 * If a field is added there, add it here; if it is removed there, the compiler
 * will not tell you, so keep the two next to each other in review.
 */
export type AuthenticatedUser = {
  id: number;
  email: string;
  /** Alias for email, kept for the MVP handlers that still read it. */
  username: string;
  firstName: string;
  lastName: string;
  phoneNumber: string | null;
  role: "student" | "advisor" | "institution_admin" | "platform_admin";
  /** True for both admin roles. Use `role` when the distinction matters. */
  isAdmin: boolean;
  /**
   * For an administrator, the institution they are scoped to. NULL means
   * unrestricted for a `platform_admin` and nothing at all for an
   * `institution_admin`. Present so the admin UI can label and pre-filter by
   * the viewer's own cohort — the server re-derives it from the session on
   * every request and never trusts it coming back from the client.
   */
  institutionId: number | null;
  /**
   * Whether a LinkedIn account is linked — never the token that links it.
   * The endpoint used to serialise `linkedinAccessToken` and
   * `linkedinRefreshToken` to the browser on every page load.
   */
  linkedinConnected: boolean;
  professionalStatus: string | null;
  discoverySource: string | null;
  timezone: string;
  isTestUser: boolean;
  status: "active" | "suspended" | "closed";
  lastLoginAt: string | Date | null;
  createdAt: string | Date;
};
