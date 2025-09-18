import { useAuth } from '@/hooks/use-auth';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiRequest } from '@/lib/queryClient';
import { useState } from 'react';
import { useLocation } from 'wouter';
import NavBar from "@/components/nav-bar";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Loader2, Lock, Play, CheckCircle, MessageSquare } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

type FoundationSession = {
  id: number;
  userId: number;
  sessionNumber: number;
  title: string;
  description: string;
  status: 'locked' | 'available' | 'in_progress' | 'completed';
  startedAt?: string;
  completedAt?: string;
  progress?: number;
};

type FoundationSessionMessage = {
  id: number;
  sessionId: number;
  role: 'user' | 'assistant';
  content: string;
  timestamp: string;
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
    const variants = {
      locked: { variant: "secondary" as const, icon: Lock, text: "Locked" },
      available: { variant: "default" as const, icon: Play, text: "Available" },
      in_progress: { variant: "outline" as const, icon: MessageSquare, text: "In Progress" },
      completed: { variant: "destructive" as const, icon: CheckCircle, text: "Completed" }
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
        <Button disabled variant="outline" className="w-full">
          <Lock className="h-4 w-4 mr-2" />
          Complete Previous Session
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
          <CheckCircle className="h-4 w-4 mr-2" />
          Review Session
        </Button>
      );
    }
  };

  // const calculateOverallProgress = () => {
  //   if (!sessions) return 0;
  //   const completedSessions = sessions.filter(s => s.status === 'completed').length;
  //   return (completedSessions / sessions.length) * 100;
  // };

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
        return "Foundation complete. Your professional positioning framework is ready. You can now book a session with a positioning coach or explore enhancement modules to deepen specific areas.";
      default:
        return "";
    }
  };

  return (
    <div className="min-h-screen bg-background">
      <NavBar />
      
      {/* Full-width hero section */}
      <div className="w-full bg-gradient-to-br from-background via-background/50 to-primary/5">
        <div className="w-full px-6">
          <div className="max-w-7xl mx-auto">
            <div className="text-center">
              <h1 className="text-4xl md:text-5xl font-bold text-foreground mb-4" data-testid="text-page-title">
                Foundation Sessions
              </h1>
              <p className="text-lg text-muted-foreground max-w-3xl mx-auto">
                Complete three sequential coaching conversations to identify your primary business function and develop your professional foundation.
              </p>
            </div>
            
            {/* Overall Progress */}
            {/* <div className="max-w-2xl mx-auto">
              <div className="bg-card/80 backdrop-blur-sm rounded-xl p-6 border shadow-sm">
                <div className="flex items-center justify-between mb-3">
                  <span className="text-base font-semibold">Overall Progress</span>
                  <span className="text-sm text-muted-foreground px-3 py-1 rounded-full bg-background/50">
                    {sessions.filter(s => s.status === 'completed').length} of {sessions.length} completed
                  </span>
                </div>
                <Progress 
                  value={calculateOverallProgress()} 
                  className="h-3 rounded-full" 
                  data-testid="progress-overall"
                />
              </div>
            </div> */}
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
              const showPostMessage = completedPrevious?.status === 'completed';
              
              return (
                <div key={session.id} className="flex flex-col space-y-4 h-full">
                  {/* Post-session transition message */}
                  {showPostMessage && (
                    <div className="bg-green-50/80 dark:bg-green-900/20 border border-green-200/50 dark:border-green-800/50 rounded-xl p-4 text-center">
                      <CheckCircle className="h-5 w-5 text-green-600 mx-auto mb-2" />
                      <p className="text-sm font-medium text-green-800 dark:text-green-200">
                        {getPostSessionMessage(completedPrevious.sessionNumber)}
                      </p>
                    </div>
                  )}

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

                    <CardHeader className="pb-4 space-y-3">
                      <div className="flex items-start justify-between gap-3">
                        <div className="flex-1 min-w-0">
                          <CardTitle className="text-xl font-bold leading-tight" data-testid={`text-session-title-${session.sessionNumber}`}>
                            {content.header}
                          </CardTitle>
                          {content.subtext && (
                            <p className="text-sm font-medium text-primary mt-3">
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
                            <div className="flex items-center justify-between mb-2">
                              <span className="text-sm font-medium">Session Progress</span>
                              <span className="text-sm text-muted-foreground font-mono">{session.progress}%</span>
                            </div>
                            <Progress 
                              value={session.progress} 
                              className="h-2" 
                              data-testid={`progress-session-${session.sessionNumber}`}
                            />
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
                              <span className="text-muted-foreground">Completed:</span>
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
                Sessions must be completed in order. Each session builds upon the previous one to help you develop your professional foundation.
              </p>
          </div>
        </div>
      </div>
    </div>
  );
}