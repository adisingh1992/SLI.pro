import { useAuth } from '@/hooks/use-auth';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiRequest } from '@/lib/queryClient';
import { useLocation } from 'wouter';
import NavBar from "@/components/nav-bar";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Loader2, Play, MessageSquare, ArrowLeft } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

/** Wing session shape. `sessionNumber` is derived from session_type by the API. */
type FoundationSession = {
  id: number;
  sessionType: string;
  sessionNumber: number;
  title: string;
  description: string;
  status: 'locked' | 'available' | 'in_progress' | 'completed' | 'ended_early';
  startedAt?: string;
  completedAt?: string;
  timerElapsedSeconds?: number;
  progress?: number;
};

export default function FoundationPage() {
  const { user } = useAuth();
  const [, navigate] = useLocation();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  // Fetch foundation sessions
  const { data: sessions, isLoading, error } = useQuery<FoundationSession[]>({
    queryKey: ['/api/foundation-sessions'],
    enabled: !!user,
  });

  // Start session mutation
  const startSessionMutation = useMutation({
    mutationFn: async (sessionNumber: number) => {
      return await apiRequest('POST', `/api/foundation-sessions/${sessionNumber}/start`);
    },
    onSuccess: (data, sessionNumber) => {
      queryClient.invalidateQueries({ queryKey: ['/api/foundation-sessions'] });
      toast({
        title: "Session Started",
        description: `Foundation Session ${sessionNumber} has been started.`,
      });
      // Navigate to the chat interface for this session
      navigate(`/foundation/session/${sessionNumber}`);
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.message || "Failed to start session",
        variant: "destructive",
      });
    },
  });

  const getStatusBadge = (status: FoundationSession['status']) => {
    /*
     * IG-UX03 and IG-UX01. Three of these five said the wrong thing to a student.
     *
     * "Completed" with a tick is the exact pairing her card calls out. "Built" is her own
     * replacement word — the session produced something, and that is what the badge now
     * says. `ended_early` also wore a tick, which was wrong twice over: nothing was
     * finished and the icon said it was.
     *
     * `locked` presents as available, because IG-UX01 is settled: "Every module enterable
     * at any time; depth adapts, access does not." The status still exists in the
     * database and the admin surfaces still report it — the student-facing badge is what
     * stops rendering it as a gate.
     */
    const variants = {
      locked: { variant: "default" as const, icon: Play, text: "Available" },
      available: { variant: "default" as const, icon: Play, text: "Available" },
      in_progress: { variant: "outline" as const, icon: MessageSquare, text: "In progress" },
      completed: { variant: "secondary" as const, icon: MessageSquare, text: "Built" },
      ended_early: { variant: "outline" as const, icon: MessageSquare, text: "Ended early" }
    };
    
    const config = variants[status];
    const Icon = config.icon;
    
    return (
      <Badge variant={config.variant} className="flex items-center gap-1">
        <Icon className="h-3 w-3" />
        {config.text}
      </Badge>
    );
  };

  const handleSessionAction = (session: FoundationSession) => {
    if (session.status === 'available') {
      startSessionMutation.mutate(session.sessionNumber);
    } else if (session.status === 'in_progress' || session.status === 'completed') {
      // Navigate to chat interface
      navigate(`/foundation/session/${session.sessionNumber}`);
    }
  };

  const getActionButton = (session: FoundationSession) => {
    if (session.status === 'locked') {
      return (
        /*
         * IG-UX03 on the copy, and IG-UX01 only partly. "Complete Previous Session" is a
         * task instruction; "Start with Session N" says the same thing as a direction.
         *
         * The button stays disabled, and that is a deliberate stop rather than an
         * oversight. IG-UX01 is settled and its success criterion is that "the user never
         * encounters a locked state" — but Foundation 2 genuinely reads Foundation 1's
         * output, and her own answer for that case is to communicate inside the module,
         * not on the navigation. That needs the start endpoint to accept an out-of-order
         * session, which is API work. An enabled button in front of an API that refuses
         * would be worse than the padlock. Listed as one of the six screens.
         */
        <Button disabled variant="outline" className="w-full">
          Start with Session {session.sessionNumber - 1}
        </Button>
      );
    }
    
    if (session.status === 'available') {
      return (
        <Button 
          onClick={() => handleSessionAction(session)}
          disabled={startSessionMutation.isPending}
          className="w-full"
          data-testid={`button-start-session-${session.sessionNumber}`}
        >
          {startSessionMutation.isPending ? (
            <Loader2 className="h-4 w-4 mr-2 animate-spin" />
          ) : (
            <Play className="h-4 w-4 mr-2" />
          )}
          Start Session
        </Button>
      );
    }
    
    if (session.status === 'in_progress') {
      return (
        <Button 
          onClick={() => handleSessionAction(session)}
          variant="outline" 
          className="w-full"
          data-testid={`button-continue-session-${session.sessionNumber}`}
        >
          <MessageSquare className="h-4 w-4 mr-2" />
          Continue Session
        </Button>
      );
    }
    
    if (session.status === 'completed') {
      return (
        <Button 
          onClick={() => handleSessionAction(session)}
          variant="outline" 
          className="w-full"
          data-testid={`button-review-session-${session.sessionNumber}`}
        >
          Review Session
        </Button>
      );
    }
  };

  if (isLoading) {
    return (
      <div className="min-h-screen bg-background">
        <NavBar />
        <div className="flex items-center justify-center min-h-[calc(100vh-80px)]">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen bg-background">
        <NavBar />
        <div className="container mx-auto px-4 py-8">
          <Card className="max-w-md mx-auto">
            <CardContent className="p-6 text-center">
              <p className="text-red-600">Error loading Foundation Sessions</p>
              <Button 
                onClick={() => window.location.reload()} 
                variant="outline" 
                className="mt-4"
              >
                Retry
              </Button>
            </CardContent>
          </Card>
        </div>
      </div>
    );
  }

  if (!sessions || sessions.length === 0) {
    return (
      <div className="min-h-screen bg-background">
        <NavBar />
        <div className="container mx-auto px-4 py-8">
          <Card className="max-w-md mx-auto">
            <CardContent className="p-6 text-center">
              <p className="text-muted-foreground">No Foundation Sessions found</p>
            </CardContent>
          </Card>
        </div>
      </div>
    );
  }

  const getSessionContent = (sessionNumber: number, session: FoundationSession) => {
    switch (sessionNumber) {
      case 1:
        return {
          header: "Foundation Session 1: Functional Identity Mapping",
          subtext: "Define your primary business function and positioning (7-9 minutes)",
          description: "Build on your credibility foundation by identifying your functional expertise across Finance, Operations, Sales, Marketing, or Product roles."
        };
      case 2:
        return {
          header: "Foundation Session 2: Professional Credibility Assessment",
          subtext: "Identify measurable expertise and business impact (8-10 minutes)",
          description: "This session helps establish your core professional credibility through specific achievements and quantifiable results that differentiate you in your industry."
        };
      case 3:
        return {
          header: "Foundation Session 3: Positioning Story Development",
          subtext: "Extract compelling stories that prove your unique value (9-10 minutes)",
          description: "Transform your experience into memorable stories with specific outcomes that reinforce your professional positioning."
        };
      default:
        return {
          header: session.title,
          subtext: "",
          description: session.description
        };
    }
  };

  const getPostSessionMessage = (sessionNumber: number) => {
    switch (sessionNumber) {
      case 1:
        return "Functional identity mapped. Your primary expertise area is now clear. Continue to Session 2 to identify your credibility to date.";
      case 2:
        return "Credibility foundation established. Your measurable expertise provides the foundation for stronger professional positioning. Continue to Session 3 to develop the stories that prove your unique value.";
      case 3:
        return "Your positioning framework is built. You can now book a session with a positioning coach or explore enhancement modules to deepen specific areas.";
      default:
        return "";
    }
  };

  return (
    <div className="min-h-screen bg-background">
      <NavBar />
      
      {/* Full-width hero section */}
      <div className="w-full bg-gradient-to-br from-background via-background/50 to-primary/5">
        <div className="w-full px-6 py-8">
          <div className="max-w-7xl mx-auto">
            <div className="flex items-center justify-between mb-4">
              <Button
                variant="ghost"
                onClick={() => navigate('/')}
                className="gap-2 hover:bg-primary/10"
                data-testid="button-back-home"
              >
                <ArrowLeft className="h-4 w-4" />
                Back to Home
              </Button>
              <h1 className="text-4xl md:text-5xl font-bold text-foreground" data-testid="text-page-title">
                Foundation Sessions
              </h1>
              <div className="w-32"></div> {/* Spacer for balance */}
            </div>
            <p className="text-lg text-muted-foreground max-w-3xl mx-auto text-center">
              Three coaching conversations that identify your primary business function and build your professional foundation.
            </p>
          </div>
        </div>
      </div>

      {/* Full-width sessions section */}
      <div className="w-full px-6 py-12 pb-4">
        <div className="max-w-7xl mx-auto">
          {/* Sessions Grid */}
          <div className="grid gap-8 lg:grid-cols-3 items-stretch">
            {sessions.map((session) => {
              const content = getSessionContent(session.sessionNumber, session);
              const completedPrevious = sessions.find(s => s.sessionNumber === session.sessionNumber - 1);
              const showPostMessage = completedPrevious?.status === 'completed' && session.status !== 'completed';
              const showCompletionMessage = session.status === 'completed';
              
              return (
                <div key={session.id} className="flex flex-col h-full">
                  {/* Session Card */}
                  <Card 
                    className={`relative overflow-hidden transition-all duration-300 hover:shadow-lg group flex flex-col min-h-[420px] ${
                      session.status === 'completed' ? 'ring-2 ring-green-200 dark:ring-green-800' : 
                      session.status === 'in_progress' ? 'ring-2 ring-blue-200 dark:ring-blue-800' : ''
                    }`}
                    data-testid={`card-session-${session.sessionNumber}`}
                  >
                    {/* Status indicator strip */}
                    <div className={`absolute top-0 left-0 right-0 h-1 ${
                      session.status === 'completed' ? 'bg-green-500' :
                      session.status === 'in_progress' ? 'bg-blue-500' :
                      session.status === 'available' ? 'bg-orange-500' : 'bg-gray-300'
                    }`} />

                    {/* Post-session transition message */}
                    {showPostMessage && (
                      <div className="mx-4 mt-4 mb-0 bg-green-50/80 dark:bg-green-900/20 border border-green-200/50 dark:border-green-800/50 rounded-lg p-3 text-center">
                        <p className="text-xs font-medium text-green-800 dark:text-green-200">
                          {getPostSessionMessage(completedPrevious.sessionNumber)}
                        </p>
                      </div>
                    )}

                    {/* Session completion message */}
                    {showCompletionMessage && (
                      <div className="mx-4 mt-4 mb-0 bg-green-50/80 dark:bg-green-900/20 border border-green-200/50 dark:border-green-800/50 rounded-lg p-3 text-center">
                        <p className="text-xs font-medium text-green-800 dark:text-green-200">
                          Your insights have been captured and saved.
                        </p>
                      </div>
                    )}

                    <CardHeader className={`pb-4 space-y-3 ${showPostMessage || showCompletionMessage ? 'pt-3' : ''}`}>
                      <div className="flex items-start justify-between gap-3">
                        <div className="flex-1 min-w-0">
                          <CardTitle className="text-xl font-bold leading-tight" data-testid={`text-session-title-${session.sessionNumber}`}>
                            {content.header}
                          </CardTitle>
                          {content.subtext && (
                            <p className="text-sm font-medium text-green-800 mt-3">
                              {content.subtext}
                            </p>
                          )}
                        </div>
                        {getStatusBadge(session.status)}
                      </div>
                      <CardDescription className="text-sm leading-relaxed" data-testid={`text-session-description-${session.sessionNumber}`}>
                        {content.description}
                      </CardDescription>
                    </CardHeader>
                    
                    <CardContent className="flex flex-col flex-1 space-y-4">
                      <div className="flex-1 space-y-4">
                        {/* Session Progress */}
                        {session.status === 'in_progress' && session.progress !== undefined && (
                          <div className="bg-background/50 rounded-lg p-3 border">
                            {/*
                              IG-UX03. Was a percentage and a Progress bar. Her card names
                              these directly: "Progress bars and checkmarks turn the
                              experience into a to-do list. Milestone language turns it
                              into a portfolio." The number said how far through a task the
                              student was, which is the framing the gate exists to remove.
                            */}
                            <div className="flex items-center justify-between mb-2">
                              <span className="text-sm font-medium">In progress</span>
                            </div>
                          </div>
                        )}

                        {/* Timestamps */}
                        <div className="space-y-1">
                          {session.startedAt && (
                            <div className="flex items-center justify-between text-xs">
                              <span className="text-muted-foreground">Started:</span>
                              <span className="font-mono text-foreground">
                                {new Date(session.startedAt).toLocaleDateString()} {new Date(session.startedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                              </span>
                            </div>
                          )}
                          {session.completedAt && (
                            <div className="flex items-center justify-between text-xs">
                              <span className="text-muted-foreground">Recorded:</span>
                              <span className="font-mono text-foreground">
                                {new Date(session.completedAt).toLocaleDateString()} {new Date(session.completedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                              </span>
                            </div>
                          )}
                        </div>
                      </div>

                      {/* Action Button */}
                      <div className="pt-2 mt-auto">
                        {getActionButton(session)}
                      </div>
                    </CardContent>
                  </Card>
                </div>
              );
            })}
          </div>

          {/* Help Text */}
          <div className="mt-10 text-center max-w-2xl mx-auto">
              <p className="text-sm text-muted-foreground leading-relaxed">
                Each session builds on the one before it, so they run in order.
              </p>
          </div>
        </div>
      </div>
    </div>
  );
}