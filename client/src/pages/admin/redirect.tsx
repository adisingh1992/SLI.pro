import { useEffect } from "react";
import { useLocation, useParams } from "wouter";

/**
 * Sends an old admin URL to its new home.
 *
 * ── WHY BOTHER ───────────────────────────────────────────────────────────
 * This consolidation moved or merged fourteen routes. Every one of them has
 * been open in somebody's tab, pasted into a Slack message, or bookmarked —
 * `/admin/criteria` in particular, which is where the completion-criteria work
 * lived for weeks. Letting those 404 would make a UI improvement feel like a
 * regression on the first day, and the people most affected are the two or
 * three who use this product every day.
 *
 * `replace` rather than push: the old URL should not sit in history, or Back
 * from the new page bounces straight through the redirect again.
 *
 * These are cheap to keep and should stay until the URLs are demonstrably out
 * of circulation — which for a four-person tool means roughly forever.
 */
export function Redirect({ to }: { to: string }) {
  const [, navigate] = useLocation();

  useEffect(() => {
    navigate(to, { replace: true });
  }, [to, navigate]);

  return null;
}

/**
 * Same, but for routes carrying a student id — `/admin/users/:userId/positioning`
 * becoming a tab of the record rather than its own page.
 */
export function RedirectStudent({ tab }: { tab: string }) {
  const params = useParams();
  const [, navigate] = useLocation();
  const id = params.userId ?? params.id;

  useEffect(() => {
    navigate(id ? `/admin/users/${id}/${tab}` : "/admin/users", { replace: true });
  }, [id, tab, navigate]);

  return null;
}
