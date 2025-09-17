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

  const calculateOverallProgress = () => {
    if (!sessions) return 0;
    const completedSessions = sessions.filter(s => s.status === 'completed').length;
    return (completedSessions / sessions.length) * 100;
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

  return (
    <div className="min-h-screen bg-background">
      <NavBar />
      <div className="container mx-auto px-4 py-8 max-w-4xl">
        {/* Header */}
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-foreground mb-2" data-testid="text-page-title">
            Foundation Sessions
          </h1>
          <p className="text-muted-foreground mb-6">
            Complete three sequential coaching conversations to identify your primary business function and develop your professional foundation.
          </p>
          
          {/* Overall Progress */}
          <div className="bg-card rounded-lg p-4 border">
            <div className="flex items-center justify-between mb-2">
              <span className="text-sm font-medium">Overall Progress</span>
              <span className="text-sm text-muted-foreground">
                {sessions.filter(s => s.status === 'completed').length} of {sessions.length} completed
              </span>
            </div>
            <Progress 
              value={calculateOverallProgress()} 
              className="h-2" 
              data-testid="progress-overall"
            />
          </div>
        </div>

        {/* Sessions Grid */}
        <div className="grid gap-6 md:grid-cols-1 lg:grid-cols-3">
          {sessions.map((session) => (
            <Card 
              key={session.id} 
              className="relative overflow-hidden"
              data-testid={`card-session-${session.sessionNumber}`}
            >
              <CardHeader className="pb-4">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-lg" data-testid={`text-session-title-${session.sessionNumber}`}>
                    {session.title}
                  </CardTitle>
                  {getStatusBadge(session.status)}
                </div>
                <CardDescription className="text-sm" data-testid={`text-session-description-${session.sessionNumber}`}>
                  {session.description}
                </CardDescription>
              </CardHeader>
              
              <CardContent className="space-y-4">
                {/* Session Progress */}
                {session.status === 'in_progress' && session.progress !== undefined && (
                  <div>
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-sm font-medium">Session Progress</span>
                      <span className="text-sm text-muted-foreground">{session.progress}%</span>
                    </div>
                    <Progress 
                      value={session.progress} 
                      className="h-2" 
                      data-testid={`progress-session-${session.sessionNumber}`}
                    />
                  </div>
                )}

                {/* Timestamps */}
                {session.startedAt && (
                  <div className="text-xs text-muted-foreground">
                    Started: {new Date(session.startedAt).toLocaleDateString()}
                  </div>
                )}
                {session.completedAt && (
                  <div className="text-xs text-muted-foreground">
                    Completed: {new Date(session.completedAt).toLocaleDateString()}
                  </div>
                )}

                {/* Action Button */}
                {getActionButton(session)}
              </CardContent>
            </Card>
          ))}
        </div>

        {/* Help Text */}
        <div className="mt-8 text-center">
          <p className="text-sm text-muted-foreground">
            Sessions must be completed in order. Each session builds upon the previous one to help you develop your professional foundation.
          </p>
        </div>
      </div>
    </div>
  );
}