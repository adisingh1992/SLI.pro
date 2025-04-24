import { Switch, Route } from "wouter";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import NotFound from "@/pages/not-found";
import HomePage from "@/pages/home-page";
import AuthPage from "@/pages/auth-page";
import ProfilePage from "@/pages/profile-page";
import ProfileCreationPage from "@/pages/profile-creation-page";
import QuestionnairePage from "@/pages/questionnaire-simple";
import ChatPage from "@/pages/chat-page";
import SummaryPage from "@/pages/summary-page";
import MonthlyCheckInPage from "@/pages/monthly-check-in-page";
import FreshnessReportPage from "@/pages/freshness-report-page-new";
import { AuthProvider } from "@/hooks/use-auth";
import { ProtectedRoute } from "@/lib/protected-route";

// Admin pages
import AdminLoginPage from "@/pages/admin/login-page";
import AdminDashboardPage from "@/pages/admin/dashboard-page";
import AdminUsersPage from "@/pages/admin/users-page";
import AdminUserDetailPage from "@/pages/admin/user-detail-page";
import AdminCoachingNotesPage from "@/pages/admin/coaching-notes-page";
import AdminUserSummaryPage from "@/pages/admin/user-summary-page";
import AdminSliPage from "@/pages/admin/sli-page";

function Router() {
  return (
    <Switch>
      {/* Main app routes */}
      <ProtectedRoute path="/" component={HomePage} />
      <ProtectedRoute path="/profile" component={ProfilePage} />
      <ProtectedRoute path="/profile/create" component={ProfileCreationPage} />
      <ProtectedRoute path="/questionnaire" component={QuestionnairePage} />
      <ProtectedRoute path="/chat" component={ChatPage} />
      <ProtectedRoute path="/summaries" component={SummaryPage} />
      <ProtectedRoute
        path="/conversations/:id/summary"
        component={SummaryPage}
      />
      <ProtectedRoute path="/monthly-check-in" component={MonthlyCheckInPage} />
      <ProtectedRoute
        path="/freshness-report"
        component={FreshnessReportPage}
      />
      
      {/* Admin routes */}
      <Route path="/admin/login" component={AdminLoginPage} />
      <Route path="/admin/dashboard" component={AdminDashboardPage} />
      <Route path="/admin/users" component={AdminUsersPage} />
      <Route path="/admin/users/:id" component={AdminUserDetailPage} />
      <Route path="/admin/users/:userId/coaching-notes" component={AdminCoachingNotesPage} />
      <Route path="/admin/users/:userId/summary" component={AdminUserSummaryPage} />
      <Route path="/admin/users/:userId/summary/:summaryId" component={AdminUserSummaryPage} />
      <Route path="/admin/users/:userId/sli" component={AdminSliPage} />
      
      {/* Auth and fallback routes */}
      <Route path="/auth" component={AuthPage} />
      <Route component={NotFound} />
    </Switch>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <Router />
        <Toaster />
      </AuthProvider>
    </QueryClientProvider>
  );
}

export default App;
