import React from "react";
import { Switch, Route } from "wouter";
import { queryClient } from "./lib/query-client";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import NotFound from "@/pages/not-found";
import AuthPage from "@/pages/auth-page";
import ResetPasswordPage from "@/pages/reset-password-page";
import ProfilePage from "@/pages/profile-page";
import ProfileCreationPage from "@/pages/profile-creation-page";
import QuestionnairePage from "@/pages/questionnaire-simple";
import MonthlyCheckInPage from "@/pages/monthly-check-in-page";
import FreshnessReportPage from "@/pages/freshness-report-page-fixed";
import SliSelectionPage from "@/pages/sli-selection-page";
import SliRefinementPage from "@/pages/sli-refinement-page";
import LinkedinOptimizationPage from "@/pages/linkedin-optimization-page";
import LinkedinOptimizationGeneratePage from "@/pages/linkedin-optimization-generate-page";
import LinkedinContentDraftsPage from "@/pages/linkedin-content-drafts-page";
import HomeworkPage from "@/pages/homework-page";
import FoundationPage from "@/pages/foundation-page";
import FoundationSessionChatPage from "@/pages/foundation-session-chat";
import EnhancementModulesPage from "@/pages/enhancement-modules-page";
import EnhancementModuleChatPage from "@/pages/enhancement-module-chat";
import NewDashboardPage from "@/pages/new-dashboard";
import IntakeChatPage from "@/pages/intake-chat";
import { AuthProvider } from "@/hooks/use-auth";
import { ProtectedRoute } from "@/lib/protected-route";
import LifeLogPage from "@/pages/life-log-page";
import PositioningRefreshPage from "@/pages/positioning-refresh-page";
import PortfolioPage from "@/pages/portfolio-page";

// Admin — one import per screen. The panels that make up each screen live
// beside it under pages/admin/<area>/.
import AdminLoginPage from "@/pages/admin/login-page";
import AdminOverviewPage from "@/pages/admin/overview/overview-page";
import AdminStudentsPage from "@/pages/admin/students-page";
import AdminStudentRecordPage from "@/pages/admin/student/record-page";
import AdminAdvisorsPage from "@/pages/admin/advisors-page";
import AdminMessagesPage from "@/pages/admin/messages/messages-page";
import AdminMethodologyPage from "@/pages/admin/methodology/methodology-page";
import AdminSessionDesignPage from "@/pages/admin/methodology/session-design-page";
import AdminTaggingPage from "@/pages/admin/tagging/tagging-page";
import AdminHeuristicDetailPage from "@/pages/admin/heuristic-detail-page";
import AdminTaggingSessionPage from "@/pages/admin/tagging-session-page";
import { Redirect, RedirectStudent } from "@/pages/admin/redirect";

function Router() {
  return (
    <Switch>
      {/* Main app routes */}
      <ProtectedRoute path="/" component={NewDashboardPage} />
      <ProtectedRoute path="/profile" component={ProfilePage} />
      <ProtectedRoute path="/profile/create" component={ProfileCreationPage} />
      <ProtectedRoute path="/questionnaire" component={QuestionnairePage} />
      <ProtectedRoute path="/monthly-check-in" component={MonthlyCheckInPage} />
      <ProtectedRoute path="/log" component={LifeLogPage} />
      <ProtectedRoute path="/positioning-refresh" component={PositioningRefreshPage} />
      <ProtectedRoute path="/portfolio" component={PortfolioPage} />
      <ProtectedRoute
        path="/freshness-report"
        component={FreshnessReportPage}
      />
      <ProtectedRoute
        path="/sli-selection"
        component={SliSelectionPage}
      />
      <ProtectedRoute
        path="/sli-refinement"
        component={SliRefinementPage}
      />
      <ProtectedRoute
        path="/linkedin-optimization/generate"
        component={LinkedinOptimizationGeneratePage}
      />
      <ProtectedRoute
        path="/linkedin-optimization/:id"
        component={LinkedinOptimizationPage}
      />
      <ProtectedRoute
        path="/linkedin-optimization"
        component={LinkedinOptimizationPage}
      />
      <ProtectedRoute
        path="/linkedin-content-drafts"
        component={LinkedinContentDraftsPage}
      />
      <ProtectedRoute path="/homework" component={HomeworkPage} />
      <ProtectedRoute path="/foundation" component={FoundationPage} />
      <ProtectedRoute path="/foundation/session/:sessionNumber" component={FoundationSessionChatPage} />
      <ProtectedRoute path="/enhancement-modules" component={EnhancementModulesPage} />
      <ProtectedRoute path="/enhancement-modules/:moduleCode" component={EnhancementModuleChatPage} />
      <ProtectedRoute path="/dashboard" component={NewDashboardPage} />
      {/* A1: the form-based intake is replaced by Wing's conversation. The old
          path stays mapped so existing redirects and bookmarks keep working. */}
      <ProtectedRoute path="/branding-intake" component={IntakeChatPage} />
      <ProtectedRoute path="/intake" component={IntakeChatPage} />
      
      {/* ── Admin ──────────────────────────────────────────────────────
          Seven screens. Tabs are path segments so every URL is linkable and
          every pre-consolidation bookmark can be redirected somewhere exact —
          see pages/admin/redirect.tsx. */}
      <Route path="/admin/login" component={AdminLoginPage} />

      <Route path="/admin/dashboard" component={AdminOverviewPage} />
      <Route path="/admin/dashboard/:tab" component={AdminOverviewPage} />

      <Route path="/admin/users" component={AdminStudentsPage} />
      <Route path="/admin/users/:id" component={AdminStudentRecordPage} />
      <Route path="/admin/users/:id/:tab" component={AdminStudentRecordPage} />

      <Route path="/admin/advisors" component={AdminAdvisorsPage} />

      <Route path="/admin/messages" component={AdminMessagesPage} />
      <Route path="/admin/messages/:tab" component={AdminMessagesPage} />

      <Route path="/admin/methodology" component={AdminMethodologyPage} />
      <Route path="/admin/methodology/cards/:id" component={AdminHeuristicDetailPage} />
      <Route path="/admin/methodology/:tab" component={AdminMethodologyPage} />

      <Route path="/admin/session-design" component={AdminSessionDesignPage} />
      <Route path="/admin/session-design/:tab" component={AdminSessionDesignPage} />

      <Route path="/admin/tagging" component={AdminTaggingPage} />
      <Route path="/admin/tagging/sessions/:id" component={AdminTaggingSessionPage} />
      <Route path="/admin/tagging/:tab" component={AdminTaggingPage} />

      {/* ── Retired URLs ───────────────────────────────────────────────
          Kept so open tabs and pasted links keep working. Ordered before
          nothing — wouter matches top to bottom and these are all exact
          paths that no longer collide with the routes above. */}
      <Route path="/admin/reports">{() => <Redirect to="/admin/dashboard/exports" />}</Route>
      <Route path="/admin/templates">{() => <Redirect to="/admin/messages/templates" />}</Route>
      <Route path="/admin/calendar">{() => <Redirect to="/admin/messages/calendar" />}</Route>
      <Route path="/admin/heuristics">{() => <Redirect to="/admin/methodology/cards" />}</Route>
      <Route path="/admin/heuristics/:id" component={AdminHeuristicDetailPage} />
      <Route path="/admin/sequences">{() => <Redirect to="/admin/methodology/sequences" />}</Route>
      <Route path="/admin/criteria">{() => <Redirect to="/admin/session-design/completion" />}</Route>
      <Route path="/admin/objectives">{() => <Redirect to="/admin/session-design/objectives" />}</Route>
      <Route path="/admin/users/:userId/coaching-notes">{() => <RedirectStudent tab="coaching-notes" />}</Route>
      <Route path="/admin/users/:userId/summary/:summaryId">{() => <RedirectStudent tab="summary" />}</Route>

      {/* Auth and fallback routes */}
      <Route path="/auth" component={AuthPage} />
      <Route path="/reset-password" component={ResetPasswordPage} />
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
