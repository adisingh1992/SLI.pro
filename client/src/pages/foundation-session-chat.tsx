import { useAuth } from '@/hooks/use-auth';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiRequest } from '@/lib/queryClient';
import { useState, useRef, useEffect } from 'react';
import { useLocation, useParams } from 'wouter';
import NavBar from "@/components/nav-bar";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Loader2, Send, ArrowLeft, Lock, CheckCircle, MessageSquare, AlertCircle } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { ScrollArea } from "@/components/ui/scroll-area";

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

type SessionWithMessages = {
  session: FoundationSession;
  messages: FoundationSessionMessage[];
};

export default function FoundationSessionChatPage() {
  const { user } = useAuth();
  const [, navigate] = useLocation();
  const { sessionNumber: sessionNumberParam } = useParams<{ sessionNumber: string }>();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  
  const sessionNumber = parseInt(sessionNumberParam || '1');
  const [currentMessage, setCurrentMessage] = useState('');
  const [isStreaming, setIsStreaming] = useState(false);
  const [streamingResponse, setStreamingResponse] = useState('');
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Validate session number
  if (isNaN(sessionNumber) || sessionNumber < 1 || sessionNumber > 3) {
    navigate('/foundation');
    return null;
  }

  // Fetch session with messages
  const { data: sessionData, isLoading, error } = useQuery<SessionWithMessages>({
    queryKey: ['/api/foundation-sessions', sessionNumber],
    enabled: !!user,
  });

  // Auto-start session if available
  const startSessionMutation = useMutation({
    mutationFn: async (sessionNumber: number) => {
      return await apiRequest('POST', `/api/foundation-sessions/${sessionNumber}/start`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/foundation-sessions', sessionNumber] });
      queryClient.invalidateQueries({ queryKey: ['/api/foundation-sessions'] });
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.message || "Failed to start session",
        variant: "destructive",
      });
    },
  });

  // Auto-start session if it's available
  useEffect(() => {
    if (sessionData?.session && sessionData.session.status === 'available' && sessionNumber === 1) {
      startSessionMutation.mutate(sessionNumber);
    }
  }, [sessionData?.session?.status, sessionNumber]);

  // Send message with streaming response (similar to conversation hook)
  const sendMessage = async (content: string) => {
    if (!content.trim() || isStreaming) return;

    setIsStreaming(true);
    setStreamingResponse('');
    
    try {
      // Use fetch directly for streaming
      const response = await fetch(`/api/foundation-sessions/${sessionNumber}/messages/stream`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ content: content.trim() }),
        credentials: 'include'
      });

      if (!response.body) {
        throw new Error('ReadableStream not supported');
      }

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Stream request failed: ${response.status} ${errorText}`);
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      
      let done = false;
      let accumulatedData = '';

      while (!done) {
        const { value, done: readerDone } = await reader.read();
        done = readerDone;

        if (done) break;

        const text = decoder.decode(value, { stream: true });
        accumulatedData += text;

        // Process SSE data
        const lines = accumulatedData.split('\n\n');

        for (let i = 0; i < lines.length - 1; i++) {
          const line = lines[i];
          if (line.startsWith('data: ')) {
            try {
              const eventData = JSON.parse(line.substring(6));

              if (eventData.type === 'chunk') {
                setStreamingResponse(prev => prev + eventData.content);
              } else if (eventData.type === 'complete') {
                console.log('Stream completed');
                // Refresh data after completion
                queryClient.invalidateQueries({ queryKey: ['/api/foundation-sessions', sessionNumber] });
                queryClient.invalidateQueries({ queryKey: ['/api/foundation-sessions'] });
              } else if (eventData.type === 'error') {
                console.error('Error from server:', eventData.message);
                throw new Error(eventData.message || 'Server error');
              }
            } catch (e) {
              console.error('Error parsing event data:', e);
            }
          }
        }

        // Keep remaining data for next iteration
        accumulatedData = lines[lines.length - 1];
      }

    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message || "Failed to send message",
        variant: "destructive",
      });
    } finally {
      setIsStreaming(false);
      setStreamingResponse('');
      setCurrentMessage('');
    }
  };

  // Complete session mutation
  const completeSessionMutation = useMutation({
    mutationFn: async () => {
      return await apiRequest('PATCH', `/api/foundation-sessions/${sessionNumber}`, {
        status: 'completed'
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/foundation-sessions'] });
      queryClient.invalidateQueries({ queryKey: ['/api/foundation-sessions', sessionNumber, 'messages'] });
      toast({
        title: "Session Completed",
        description: `Foundation Session ${sessionNumber} has been completed successfully!`,
      });
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.message || "Failed to complete session",
        variant: "destructive",
      });
    },
  });

  // Auto-scroll to bottom when new messages arrive
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [sessionData?.messages, streamingResponse]);

  // Handle message submission
  const handleSendMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!currentMessage.trim() || isStreaming) {
      return;
    }

    const messageContent = currentMessage.trim();
    await sendMessage(messageContent);
  };

  // Session 1 specific guardrails and guidance
  const getSessionGuidance = () => {
    if (sessionNumber === 1) {
      return {
        title: "Functional Identity Lock-In",
        description: "Discover your primary business function through guided conversation.",
        prompt: "I'm here to help you identify your primary business function (Finance, Operations, Sales, Marketing, or Product). Let's start by discussing your current role and what energizes you most about work.",
        functions: ["Finance", "Operations", "Sales", "Marketing", "Product"]
      };
    }
    return {
      title: `Session ${sessionNumber}`,
      description: "This session is not yet available.",
      prompt: "This session is coming soon.",
      functions: []
    };
  };

  const sessionInfo = getSessionGuidance();

  const canComplete = () => {
    if (!sessionData?.session) return false;
    if (sessionData.session.status !== 'in_progress') return false;
    if (sessionData.messages.length < 4) return false; // Minimum conversation length
    return true;
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

  if (error || !sessionData) {
    return (
      <div className="min-h-screen bg-background">
        <NavBar />
        <div className="container mx-auto px-4 py-8">
          <Card className="max-w-md mx-auto">
            <CardContent className="p-6 text-center">
              <AlertCircle className="h-12 w-12 text-destructive mx-auto mb-4" />
              <p className="text-red-600 mb-4">Error loading Foundation Session</p>
              <Button onClick={() => navigate('/foundation')} variant="outline">
                <ArrowLeft className="h-4 w-4 mr-2" />
                Back to Foundation Sessions
              </Button>
            </CardContent>
          </Card>
        </div>
      </div>
    );
  }

  const { session, messages } = sessionData;

  // Check if session is locked
  if (session.status === 'locked') {
    return (
      <div className="min-h-screen bg-background">
        <NavBar />
        <div className="container mx-auto px-4 py-8">
          <Card className="max-w-md mx-auto">
            <CardContent className="p-6 text-center">
              <Lock className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
              <h2 className="text-xl font-semibold mb-2">Session Locked</h2>
              <p className="text-muted-foreground mb-4">
                Complete the previous session to unlock Session {sessionNumber}.
              </p>
              <Button onClick={() => navigate('/foundation')} variant="outline">
                <ArrowLeft className="h-4 w-4 mr-2" />
                Back to Foundation Sessions
              </Button>
            </CardContent>
          </Card>
        </div>
      </div>
    );
  }

  // Sessions 2 and 3 are not implemented yet
  if (sessionNumber > 1) {
    return (
      <div className="min-h-screen bg-background">
        <NavBar />
        <div className="container mx-auto px-4 py-8">
          <Card className="max-w-md mx-auto">
            <CardContent className="p-6 text-center">
              <MessageSquare className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
              <h2 className="text-xl font-semibold mb-2">Coming Soon</h2>
              <p className="text-muted-foreground mb-4">
                Session {sessionNumber} is not yet available. Focus on completing Session 1 first.
              </p>
              <Button onClick={() => navigate('/foundation')} variant="outline">
                <ArrowLeft className="h-4 w-4 mr-2" />
                Back to Foundation Sessions
              </Button>
            </CardContent>
          </Card>
        </div>
      </div>
    );
  }

  const getStatusBadge = (status: FoundationSession['status']) => {
    const variants = {
      locked: { variant: "secondary" as const, icon: Lock, text: "Locked" },
      available: { variant: "default" as const, icon: MessageSquare, text: "Available" },
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

  return (
    <div className="min-h-screen bg-background">
      <NavBar />
      <div className="container mx-auto px-4 py-4 max-w-4xl">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-4">
            <Button 
              onClick={() => navigate('/foundation')} 
              variant="outline" 
              size="sm"
              data-testid="button-back-to-overview"
            >
              <ArrowLeft className="h-4 w-4 mr-2" />
              Back
            </Button>
            <div>
              <h1 className="text-2xl font-bold text-foreground" data-testid="text-session-title">
                {sessionInfo.title}
              </h1>
              <p className="text-sm text-muted-foreground">{sessionInfo.description}</p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            {getStatusBadge(session.status)}
            {session.status === 'in_progress' && canComplete() && (
              <Button 
                onClick={() => completeSessionMutation.mutate()}
                disabled={completeSessionMutation.isPending}
                variant="default"
                size="sm"
                data-testid="button-complete-session"
              >
                {completeSessionMutation.isPending ? (
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                ) : (
                  <CheckCircle className="h-4 w-4 mr-2" />
                )}
                Complete Session
              </Button>
            )}
          </div>
        </div>

        {/* Session Progress */}
        {session.status === 'in_progress' && session.progress !== undefined && (
          <div className="mb-6">
            <div className="flex items-center justify-between mb-2">
              <span className="text-sm font-medium">Session Progress</span>
              <span className="text-sm text-muted-foreground">{session.progress}%</span>
            </div>
            <Progress value={session.progress} className="h-2" data-testid="progress-session" />
          </div>
        )}

        {/* Chat Interface */}
        <Card className="h-[calc(100vh-300px)] flex flex-col">
          <CardHeader className="pb-4">
            <div className="flex items-center justify-between">
              <div>
                <CardTitle className="text-lg">Session Chat</CardTitle>
                <CardDescription>
                  {sessionInfo.functions.length > 0 && (
                    <>Target Functions: {sessionInfo.functions.join(', ')}</>
                  )}
                </CardDescription>
              </div>
            </div>
          </CardHeader>
          
          <CardContent className="flex-1 flex flex-col p-0">
            {/* Messages Area */}
            <ScrollArea className="flex-1 px-6">
              <div className="space-y-4 pb-4">
                {/* Initial guidance message for Session 1 */}
                {sessionNumber === 1 && messages.length === 0 && (
                  <div className="flex gap-3">
                    <div className="w-8 h-8 bg-primary rounded-full flex items-center justify-center">
                      <MessageSquare className="h-4 w-4 text-primary-foreground" />
                    </div>
                    <div className="flex-1">
                      <div className="bg-muted rounded-lg p-4">
                        <p className="text-sm">{sessionInfo.prompt}</p>
                      </div>
                      <p className="text-xs text-muted-foreground mt-1">Coach</p>
                    </div>
                  </div>
                )}

                {/* Conversation messages */}
                {messages.map((message, index) => (
                  <div 
                    key={message.id} 
                    className={`flex gap-3 ${message.role === 'user' ? 'flex-row-reverse' : ''}`}
                    data-testid={`message-${message.role}-${index}`}
                  >
                    <div className={`w-8 h-8 rounded-full flex items-center justify-center ${
                      message.role === 'user' 
                        ? 'bg-primary text-primary-foreground' 
                        : 'bg-muted text-muted-foreground'
                    }`}>
                      {message.role === 'user' ? 'U' : 'C'}
                    </div>
                    <div className="flex-1 max-w-[80%]">
                      <div className={`rounded-lg p-4 ${
                        message.role === 'user' 
                          ? 'bg-primary text-primary-foreground ml-8' 
                          : 'bg-muted mr-8'
                      }`}>
                        <p className="text-sm whitespace-pre-wrap">{message.content}</p>
                      </div>
                      <p className={`text-xs text-muted-foreground mt-1 ${
                        message.role === 'user' ? 'text-right' : ''
                      }`}>
                        {message.role === 'user' ? 'You' : 'Coach'} • {new Date(message.timestamp).toLocaleTimeString()}
                      </p>
                    </div>
                  </div>
                ))}

                {/* Streaming response */}
                {streamingResponse && (
                  <div className="flex gap-3">
                    <div className="w-8 h-8 bg-muted rounded-full flex items-center justify-center">
                      <Loader2 className="h-4 w-4 animate-spin" />
                    </div>
                    <div className="flex-1">
                      <div className="bg-muted rounded-lg p-4 mr-8">
                        <p className="text-sm">{streamingResponse}</p>
                      </div>
                      <p className="text-xs text-muted-foreground mt-1">Coach • typing...</p>
                    </div>
                  </div>
                )}

                <div ref={messagesEndRef} />
              </div>
            </ScrollArea>

            {/* Message Input */}
            {session.status === 'in_progress' && (
              <form onSubmit={handleSendMessage} className="border-t p-6">
                <div className="flex gap-3">
                  <Textarea
                    value={currentMessage}
                    onChange={(e) => setCurrentMessage(e.target.value)}
                    placeholder="Type your message here..."
                    className="min-h-[60px] resize-none"
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' && !e.shiftKey) {
                        e.preventDefault();
                        handleSendMessage(e);
                      }
                    }}
                    disabled={isStreaming}
                    data-testid="input-message"
                  />
                  <Button 
                    type="submit" 
                    size="lg"
                    disabled={!currentMessage.trim() || isStreaming}
                    data-testid="button-send-message"
                  >
                    {isStreaming ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <Send className="h-4 w-4" />
                    )}
                  </Button>
                </div>
              </form>
            )}

            {/* Completed session message */}
            {session.status === 'completed' && (
              <div className="border-t p-6 text-center">
                <CheckCircle className="h-6 w-6 text-green-600 mx-auto mb-2" />
                <p className="text-sm text-muted-foreground">
                  This session has been completed. You can review the conversation above.
                </p>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}