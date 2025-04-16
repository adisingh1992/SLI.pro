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
import { AuthProvider } from "@/hooks/use-auth";
import { ProtectedRoute } from "@/lib/protected-route";

function Router() {
  return (
    <Switch>
      <ProtectedRoute path="/" component={HomePage} />
      <ProtectedRoute path="/profile" component={ProfilePage} />
      <ProtectedRoute path="/profile/create" component={ProfileCreationPage} />
      <ProtectedRoute path="/questionnaire" component={QuestionnairePage} />
      <ProtectedRoute path="/chat" component={ChatPage} />
      <ProtectedRoute path="/summaries" component={SummaryPage} />
      <ProtectedRoute path="/conversations/:id/summary" component={SummaryPage} />
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
