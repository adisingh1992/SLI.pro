import React from "react";
import { Switch, Route, Redirect as WouterRedirect } from "wouter";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import NotFound from "@/pages/not-found";
import { AuthProvider } from "@/hooks/use-auth";
import { ProtectedRoute } from "@/lib/protected-route";

/* ── Wing — the student surface ─────────────────────────────────────────
 *
 * Replaces the ~20 screens the old student UI had. Those pages are still on disk under
 * `client/src/pages/` and are reachable from nothing: they are excluded from this router,
 * so Vite does not bundle them and no URL resolves to one.
 *
 * Their BACKEND routes are all still live and untouched — `/api/freshness-reports`,
 * `/api/linkedin-optimizations`, `/api/monthly-check-ins`, `/api/portfolio`,
 * `/api/user/homework` and the rest. The admin panel and the exports read several of
 * them, and nothing about this change deletes data or takes an endpoint away. Any of it
 * can come back behind a Wing-styled screen without a migration.
 */
import WingChatPage from "@/pages/wing/chat";
import WingDashboardPage from "@/pages/wing/dashboard";
import WingFilesPage from "@/pages/wing/files";
import WingMilestonesPage from "@/pages/wing/milestones";
import WingProfilePage from "@/pages/wing/profile";
import WingRadarPage from "@/pages/wing/radar";
import WingSettingsPage from "@/pages/wing/settings";
import WingLoginPage from "@/pages/wing/login";
import WingSignupPage from "@/pages/wing/signup";

/* Intake is Wing's conversation and predates this rebuild; it stays as it is. */
import IntakeChatPage from "@/pages/intake-chat";
import ResetPasswordPage from "@/pages/reset-password-page";

// Admin — unchanged. One import per screen; the panels that make up each screen live
// beside it under pages/admin/<area>/.
import AdminLoginPage from "@/pages/admin/login-page";
import AdminOverviewPage from "@/pages/admin/overview/overview-page";
import AdminStudentsPage from "@/pages/admin/students-page";
import AdminStudentRecordPage from "@/pages/admin/student/record-page";
import AdminAdvisorsPage from "@/pages/admin/advisors-page";
import AdminAttributionPage from "@/pages/admin/attribution-page";
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
      {/* ── Student ─────────────────────────────────────────────────── */}
      <ProtectedRoute path="/" component={WingDashboardPage} />
      <ProtectedRoute path="/chat" component={WingChatPage} />
      <ProtectedRoute path="/chat/:slug" component={WingChatPage} />
      <ProtectedRoute path="/files" component={WingFilesPage} />
      <ProtectedRoute path="/milestones" component={WingMilestonesPage} />
      <ProtectedRoute path="/profile" component={WingProfilePage} />
      <ProtectedRoute path="/radar" component={WingRadarPage} />
      <ProtectedRoute path="/settings" component={WingSettingsPage} />

      {/* A1: the form-based intake is Wing's conversation. Both paths stay mapped so
          existing redirects and bookmarks keep working. */}
      <ProtectedRoute path="/intake" component={IntakeChatPage} />
      <ProtectedRoute path="/branding-intake" component={IntakeChatPage} />

      {/* ── Retired student URLs ────────────────────────────────────────
          Every one of these was a screen. They land somewhere sensible rather than on a
          404, because students have them bookmarked and an emailed link from last week
          should not dead-end. Each points at whatever now does that job. */}
      <Route path="/dashboard">{() => <WouterRedirect to="/" />}</Route>
      <Route path="/log">{() => <WouterRedirect to="/milestones" />}</Route>
      <Route path="/portfolio">{() => <WouterRedirect to="/" />}</Route>
      <Route path="/homework">{() => <WouterRedirect to="/" />}</Route>
      <Route path="/questionnaire">{() => <WouterRedirect to="/intake" />}</Route>
      <Route path="/monthly-check-in">{() => <WouterRedirect to="/milestones" />}</Route>
      <Route path="/freshness-report">{() => <WouterRedirect to="/" />}</Route>
      <Route path="/sli-selection">{() => <WouterRedirect to="/" />}</Route>
      <Route path="/sli-refinement">{() => <WouterRedirect to="/" />}</Route>
      <Route path="/positioning-refresh">
        {() => <WouterRedirect to="/chat/refresh_your_positioning" />}
      </Route>
      <Route path="/linkedin-optimization/:rest*">{() => <WouterRedirect to="/files" />}</Route>
      <Route path="/linkedin-optimization">{() => <WouterRedirect to="/files" />}</Route>
      <Route path="/linkedin-content-drafts">{() => <WouterRedirect to="/files" />}</Route>
      <Route path="/foundation/session/:n">{() => <WouterRedirect to="/chat" />}</Route>
      <Route path="/foundation">{() => <WouterRedirect to="/chat" />}</Route>
      <Route path="/enhancement-modules/:code">{() => <WouterRedirect to="/chat" />}</Route>
      <Route path="/enhancement-modules">{() => <WouterRedirect to="/chat" />}</Route>
      <Route path="/profile/create">{() => <WouterRedirect to="/profile" />}</Route>

      {/* ── Admin — unchanged ───────────────────────────────────────────
          Seven screens. Tabs are path segments so every URL is linkable and every
          pre-consolidation bookmark can be redirected somewhere exact — see
          pages/admin/redirect.tsx. */}
      <Route path="/admin/login" component={AdminLoginPage} />

      <Route path="/admin/dashboard" component={AdminOverviewPage} />
      <Route path="/admin/dashboard/:tab" component={AdminOverviewPage} />

      <Route path="/admin/users" component={AdminStudentsPage} />
      <Route path="/admin/users/:id" component={AdminStudentRecordPage} />
      <Route path="/admin/users/:id/:tab" component={AdminStudentRecordPage} />

      <Route path="/admin/advisors" component={AdminAdvisorsPage} />

      {/* Platform staff only; the page itself refuses others (RequirePlatformAdmin). */}
      <Route path="/admin/attribution" component={AdminAttributionPage} />

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

      {/* ── Retired admin URLs ──────────────────────────────────────── */}
      <Route path="/admin/reports">{() => <Redirect to="/admin/dashboard/exports" />}</Route>
      <Route path="/admin/templates">{() => <Redirect to="/admin/messages/templates" />}</Route>
      <Route path="/admin/calendar">{() => <Redirect to="/admin/messages/calendar" />}</Route>
      <Route path="/admin/heuristics">{() => <Redirect to="/admin/methodology/cards" />}</Route>
      <Route path="/admin/heuristics/:id" component={AdminHeuristicDetailPage} />
      <Route path="/admin/sequences">{() => <Redirect to="/admin/methodology/sequences" />}</Route>
      <Route path="/admin/criteria">{() => <Redirect to="/admin/session-design/completion" />}</Route>
      <Route path="/admin/objectives">{() => <Redirect to="/admin/session-design/completion" />}</Route>
      <Route path="/admin/users/:userId/coaching-notes">{() => <RedirectStudent tab="coaching-notes" />}</Route>
      <Route path="/admin/users/:userId/summary/:summaryId">{() => <RedirectStudent tab="summary" />}</Route>

      {/* ── Auth and fallback ───────────────────────────────────────── */}
      <Route path="/auth" component={WingLoginPage} />
      <Route path="/signup" component={WingSignupPage} />
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
