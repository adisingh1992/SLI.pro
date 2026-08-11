import { useEffect } from "react";

/**
 * Puts the admin panel at 90% while this component is mounted.
 *
 * The panel is a tool someone keeps open all day, and the extra density is
 * worth having — but the student app is a fifteen-minute conversation and
 * stays at 95%. `.admin-ui` on <html> is what selects between them; the rule
 * itself lives in index.css next to the `--zoom` variable that the
 * viewport-height arithmetic depends on.
 *
 * A hook rather than a line in AdminLayout because the login screen is an
 * admin screen and does not render the layout — and the zoom stepping from
 * 95% to 90% on sign-in would be a visible lurch at exactly the moment
 * somebody is judging whether the product feels solid.
 *
 * The cleanup matters: without it, navigating from the admin panel to the
 * student view leaves the whole app at 90%.
 */
export function useAdminZoom() {
  useEffect(() => {
    document.documentElement.classList.add("admin-ui");
    return () => document.documentElement.classList.remove("admin-ui");
  }, []);
}
