import { ReactNode } from "react";
import { Link } from "wouter";
import { ShieldAlert } from "lucide-react";
import { useAdminRole } from "@/hooks/use-admin-role";
import { Button } from "@/components/ui/button";
import AdminLayout from "./layout";
import { PageShell } from "@/components/admin/page";
import { EmptyState } from "@/components/admin/states";

/**
 * Wraps the methodology screens.
 *
 * The sidebar already hides these for institution admins, but a bookmark, a
 * pasted link or a browser autocomplete will still land someone here. Without
 * this they would get a page whose every query 403s — a screen full of error
 * cards, which reads as "the product is broken" rather than "this is not
 * yours".
 *
 * This is a courtesy, not a control. The server refuses the requests
 * regardless (server/admin-guards.ts, `isPlatformAdmin`); removing this file
 * would make the experience worse and the system no less safe.
 */
export function RequirePlatformAdmin({ children }: { children: ReactNode }) {
  const { isPlatformAdmin, role } = useAdminRole();

  if (isPlatformAdmin) return <>{children}</>;

  // Still resolving who the user is — render nothing rather than flashing a
  // refusal at someone who turns out to be allowed.
  if (!role) return null;

  return (
    <AdminLayout>
      <PageShell>
        <EmptyState
          icon={ShieldAlert}
          title="This area is for SLIpro platform staff"
          description={
            <>
              These screens control how Wing behaves for every student — the coaching
              methodology, what counts as a finished session, and how transcripts are read.
              Changes here take effect immediately across the whole cohort, so they're kept
              with the platform team.
            </>
          }
          action={
            <Button asChild variant="outline">
              <Link href="/admin/dashboard">Back to your dashboard</Link>
            </Button>
          }
        />
      </PageShell>
    </AdminLayout>
  );
}
