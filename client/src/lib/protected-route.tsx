import { useAuth } from "@/hooks/use-auth";
import { Loader2 } from "lucide-react";
import { Redirect, Route } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { UserProfile, BrandingIntake } from "@shared/schema";

export function ProtectedRoute({
  path,
  component: Component,
}: {
  path: string;
  component: () => React.JSX.Element | null;
}) {
  const { user, isLoading } = useAuth();
  
  const { data: userProfile } = useQuery<UserProfile>({
    queryKey: ["/api/user/profile"],
    enabled: !!user,
  });

  const { data: brandingIntake, isLoading: isIntakeLoading, isError: isIntakeError } = useQuery<BrandingIntake | null>({
    queryKey: ["/api/branding-intake"],
    enabled: !!user,
    retry: 1,
  });

  if (isLoading || (!!user && isIntakeLoading && !isIntakeError)) {
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

  const intakeCompleted = brandingIntake?.completed === true;
  const isIntakePage = path === "/branding-intake";

  if (!intakeCompleted && !isIntakePage && !isIntakeError) {
    return (
      <Route path={path}>
        <Redirect to="/branding-intake" />
      </Route>
    );
  }

  return <Route path={path} component={Component} />;
}
