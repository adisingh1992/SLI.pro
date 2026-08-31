import { useAuth } from "@/hooks/use-auth";
import { Loader2 } from "lucide-react";
import { Redirect, Route } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { UserProfile, BrandingIntake } from "@shared/schema";
import { ErrorBoundary } from "@/components/error-boundary";

export function ProtectedRoute({
  path,
  component: Component,
}: {
  path: string;
  component: () => React.JSX.Element | null;
}) {
  const { user, isLoading } = useAuth();

  /*
   * ── THE OTHER HALF OF THE ADMIN/STUDENT SPLIT ────────────────────────────
   * `AdminLayout` already refuses a signed-in student on any `/admin/*` route
   * (redirects to `/admin/login`, which itself sends a signed-in-but-not-admin
   * visitor back here). Nothing enforced the reverse: this component only ever
   * checked `!!user`, so an admin's own session — `institution_admin` or
   * `platform_admin` — satisfied that check exactly like a student's and
   * rendered the Wing student UI as them. There is no student record behind an
   * admin account (no `wing_students` row, no Foundation sessions, no SLI), so
   * `/api/user/profile` and `/api/branding-intake` below would have been
   * firing for a user they were never scoped to serve.
   *
   * `user.isAdmin` — student pages are for everyone else. Checked, and the
   * queries below gated on it, before touching student-only data at all.
   */
  const isStudent = !!user && !user.isAdmin;

  const { data: userProfile } = useQuery<UserProfile>({
    queryKey: ["/api/user/profile"],
    enabled: isStudent,
  });

  const { data: brandingIntake, isLoading: isIntakeLoading, isError: isIntakeError } = useQuery<BrandingIntake | null>({
    queryKey: ["/api/branding-intake"],
    enabled: isStudent,
    retry: 1,
  });

  if (isLoading || (isStudent && isIntakeLoading && !isIntakeError)) {
    return (
      <Route path={path}>
        <div className="flex items-center justify-center min-h-screen">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </div>
      </Route>
    );
  }

  if (!user) {
    return (
      <Route path={path}>
        <Redirect to="/auth" />
      </Route>
    );
  }

  if (user.isAdmin) {
    return (
      <Route path={path}>
        <Redirect to="/admin/dashboard" />
      </Route>
    );
  }

  const intakeCompleted = brandingIntake?.completed === true;
  /*
   * Both paths, since A1 introduced /intake as the canonical one and
   * /branding-intake stays mapped for existing redirects and bookmarks.
   * Recognising only the old path would redirect /intake straight back to
   * /branding-intake — the intake page bouncing off its own gate, which
   * presents as an infinite redirect on the first screen a new student sees.
   */
  const isIntakePage = path === "/branding-intake" || path === "/intake";

  if (!intakeCompleted && !isIntakePage && !isIntakeError) {
    return (
      <Route path={path}>
        <Redirect to="/branding-intake" />
      </Route>
    );
  }

  /*
   * Every authenticated page renders inside an error boundary.
   *
   * Placed here rather than around individual pages because the failure this
   * responds to was not specific to one screen: React unmounts the whole tree
   * on an unhandled render error, so *any* page throwing takes the entire app
   * to a blank white document. That happened mid-session — twenty minutes into
   * a Foundation Session, the student's screen simply went empty.
   *
   * The children form, not `component`, so the boundary sits between the route
   * and the page. Every page here reads its params with `useParams()`, so
   * nothing depends on the props `component` would have passed.
   */
  return (
    <Route path={path}>
      <ErrorBoundary context={path}>
        <Component />
      </ErrorBoundary>
    </Route>
  );
}
