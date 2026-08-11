import { useAuth } from "@/hooks/use-auth";

/**
 * Who is looking at the admin panel.
 *
 * ── WHY `isAdmin` IS NOT ENOUGH ──────────────────────────────────────────
 * `isAdmin` is derived from role and is true for BOTH admin roles, so it
 * cannot tell a career-centre director from SLIpro internal staff. The admin
 * panel serves two genuinely different jobs and that distinction is the one
 * that matters:
 *
 *   institution_admin  Danielle, Berkeley, Vanderbilt. Runs a cohort — students,
 *                      advising, messages, metrics. Should never see the
 *                      methodology engine.
 *
 *   platform_admin     SLIpro internal. Everything above, plus the machinery
 *                      that decides how Wing behaves: heuristic cards,
 *                      objectives, completion criteria, turn tagging, the
 *                      classifier prompt.
 *
 * Hiding the second group is not about secrecy — it is that an editable
 * completion criterion applies to every student the moment it is saved, with
 * no review gate. That is not a control to hand a partner by accident.
 *
 * The server enforces this independently (`isPlatformAdmin` in
 * server/admin-guards.ts). This hook only decides what is worth rendering; it
 * is not the security boundary and must never be the only check.
 */

export type AdminRole = "student" | "advisor" | "institution_admin" | "platform_admin";

export function useAdminRole() {
  const { user } = useAuth();
  const role = user?.role;

  return {
    role,
    /** Any admin surface at all. */
    isAdmin: role === "platform_admin" || role === "institution_admin",
    /** The methodology engine. */
    isPlatformAdmin: role === "platform_admin",
    /** Runs a cohort, but not the engine behind it. */
    isInstitutionAdmin: role === "institution_admin",
  };
}
