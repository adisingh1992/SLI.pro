import { useAuth } from '@/hooks/use-auth';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiRequest } from '@/lib/queryClient';
import { useState, useRef, useEffect } from 'react';
import { useLocation, useParams, Link } from 'wouter';
import NavBar from "@/components/nav-bar";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Loader2, Send, ArrowLeft, Lock, CheckCircle, MessageSquare, AlertCircle, FileText } from "lucide-react";
import VoiceMicButton from "@/components/VoiceMicButton";
import { useVoiceRecording } from "@/hooks/use-voice-recording";
import { useToast } from "@/hooks/use-toast";
import { ScrollArea } from "@/components/ui/scroll-area";
import SessionTimer from "@/components/ui/session-timer";

import type { FoundationSession, FoundationSessionMessage } from '@shared/schema';

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
  const [optimisticMessage, setOptimisticMessage] = useState<FoundationSessionMessage | null>(null);
  const [allowContinue, setAllowContinue] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const messageInputRef = useRef<HTMLTextAreaElement>(null);
  const messageCountBeforeStreamRef = useRef<number>(0);

  // Voice recording hook
  const voiceRecording = useVoiceRecording({
    userId: user?.id || 0,
    sessionNumber,
    onTranscriptionComplete: (text: string) => {
      // Insert transcribed text into the message input
      setCurrentMessage(prev => prev + (prev ? ' ' : '') + text);
      // Focus the text area for potential editing
      setTimeout(() => messageInputRef.current?.focus(), 100);
    }
  });

  // Validate session number
  if (isNaN(sessionNumber) || sessionNumber < 1 || sessionNumber > 3) {
    navigate('/');
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
    
    // Track message count before streaming starts
    messageCountBeforeStreamRef.current = sessionData?.messages?.length || 0;
    
    // Store the message content for optimistic display
    const messageContent = content.trim();
    
    try {
      // Use fetch directly for streaming
      const response = await fetch(`/api/foundation-sessions/${sessionNumber}/messages/stream`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ content: messageContent }),
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

              if (eventData.type === 'user_message') {
                // Optimistically display user message immediately
                setOptimisticMessage({
                  id: eventData.id,
                  sessionId: sessionData?.session.id || 0,
                  role: 'user',
                  content: messageContent,
                  createdAt: new Date()
                });
              } else if (eventData.type === 'chunk') {
                setStreamingResponse(prev => prev + eventData.content);
              } else if (eventData.type === 'complete') {
                console.log('Stream completed');
                // Refresh data after completion (optimistic message will be cleared in finally block)
                queryClient.invalidateQueries({ queryKey: ['/api/foundation-sessions', sessionNumber] });
                queryClient.invalidateQueries({ queryKey: ['/api/foundation-sessions'] });
              } else if (eventData.type === 'session_completed') {
                console.log('Session automatically completed:', eventData);
                
                // Session-specific completion messages
                let description = '';
                if (eventData.sessionNumber === 1) {
                  description = `Foundation Session 1 completed automatically. Your primary function has been identified as ${eventData.completionData?.primaryFunction}.`;
                } else if (eventData.sessionNumber === 2) {
                  const tier = eventData.completionData?.credibilityTier;
                  const brandClaim = eventData.completionData?.brandClaim;
                  description = `Professional Credibility Assessment completed. Achieved Tier ${tier} evidence strength${brandClaim ? `: ${brandClaim}` : ''}.`;
                } else {
                  description = `Foundation Session ${eventData.sessionNumber} has been completed successfully.`;
                }
                
                toast({
                  title: "Session Completed!",
                  description,
                  duration: 5000,
                });
                // Refresh data after auto-completion
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
      // Don't clear streamingResponse here - let useEffect handle it when real message appears
      setCurrentMessage('');
      // Note: optimisticMessage and streamingResponse are cleared by useEffect when real messages appear
      // Refocus the input after clearing the message
      setTimeout(() => {
        messageInputRef.current?.focus();
      }, 0);
    }
  };

  // Clear optimistic message and streaming response when real messages appear in fetched data
  useEffect(() => {
    if (optimisticMessage && sessionData?.messages) {
      const messageExists = sessionData.messages.some(msg => msg.id === optimisticMessage.id);
      if (messageExists) {
        setOptimisticMessage(null);
      }
    }
    
    // Clear streaming response when new assistant message appears
    if (streamingResponse && sessionData?.messages) {
      // Check if we have more messages than before streaming started
      const currentMessageCount = sessionData.messages.length;
      if (currentMessageCount > messageCountBeforeStreamRef.current) {
        const lastMessage = sessionData.messages[sessionData.messages.length - 1];
        // If the last message is from assistant, the stream has been saved
        if (lastMessage.role === 'assistant') {
          setStreamingResponse('');
        }
      }
    }
  }, [sessionData?.messages, optimisticMessage, streamingResponse]);

  // Auto-scroll to bottom when new messages arrive
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [sessionData?.messages, streamingResponse, optimisticMessage]);

  // Handle message submission
  const handleSendMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!currentMessage.trim() || isStreaming) {
      return;
    }

    const messageContent = currentMessage.trim();
    await sendMessage(messageContent);
  };

  // Session-specific guardrails and guidance
  const getSessionGuidance = () => {
    if (sessionNumber === 1) {
      return {
        title: "Functional Identity Mapping",
        description: "Define your primary business function and positioning (7-9 minutes)",
        prompt: "Hello, I'm here to help you identify your primary business function (Finance, Operations, Sales, Marketing, or Product). Let's start by discussing your current role and what energizes you most about work.",
        functions: ["Finance", "Operations", "Sales", "Marketing", "Product"]
      };
    } else if (sessionNumber === 2) {
      return {
        title: "Professional Credibility Assessment",
        description: "Identify measurable expertise and business impact (8-10 minutes)",
        prompt: "If I'm writing you a $1M check because you're credible, what SPECIFIC expertise am I investing in? Think like a ruthless, revenue-only investor: what would they throw $1M at YOU to do?",
        functions: ["Finance", "Operations", "Sales", "Marketing", "Product"]
      };
    } else if (sessionNumber === 3) {
      return {
        title: "Positioning Story Development",
        description: "Extract compelling stories that prove your unique value (9-10 minutes)",
        prompt: "'I led cross-functional teams' means nothing by itself. We'll excavate the HOW, WHY, STRUGGLE, and INSIGHT so your stories prove credibility and fuel your brand.",
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

  if (error || !sessionData || !sessionData.session) {
    return (
      <div className="min-h-screen bg-background">
        <NavBar />
        <div className="container mx-auto px-4 py-8">
          <Card className="max-w-md mx-auto">
            <CardContent className="p-6 text-center">
              <AlertCircle className="h-12 w-12 text-destructive mx-auto mb-4" />
              <p className="text-red-600 mb-4">Error loading Foundation Session</p>
              <Button onClick={() => navigate('/')} variant="outline">
                <ArrowLeft className="h-4 w-4 mr-2" />
                Back to Home
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
              <Button onClick={() => navigate('/')} variant="outline">
                <ArrowLeft className="h-4 w-4 mr-2" />
                Back to Home
              </Button>
            </CardContent>
          </Card>
        </div>
      </div>
    );
  }

  // Block access to sessions beyond Session 3
  if (sessionNumber > 3) {
    return (
      <div className="min-h-screen bg-background">
        <NavBar />
        <div className="container mx-auto px-4 py-8">
          <Card className="max-w-md mx-auto">
            <CardContent className="p-6 text-center">
              <MessageSquare className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
              <h2 className="text-xl font-semibold mb-2">Coming Soon</h2>
              <p className="text-muted-foreground mb-4">
                Session {sessionNumber} is not yet available. Focus on completing Sessions 1, 2, and 3 first.
              </p>
              <Button onClick={() => navigate('/')} variant="outline">
                <ArrowLeft className="h-4 w-4 mr-2" />
                Back to Home
              </Button>
            </CardContent>
          </Card>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <NavBar />
      
      {/* Header */}
      <div className="w-full px-4 py-2 border-b bg-background">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <Button 
              onClick={() => navigate('/')} 
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
        </div>
      </div>

      {/* 2-Column Layout */}
      <div className="flex h-[calc(100vh-140px)]">
        {/* Left Column - Chat Interface (75%) */}
        <div className="w-full lg:w-3/4 flex flex-col">
          {/* Chat Interface */}
          <Card className="flex-1 flex flex-col overflow-hidden m-0 rounded-none">       
          <CardContent className="flex-1 min-h-0 flex flex-col p-0 overflow-hidden py-2">
            {/* Messages Area */}
            <ScrollArea className="flex-1 min-h-0 px-6">
              <div className="space-y-4 pb-4">

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
                      {message.role === 'user' ? (user?.firstName?.[0]?.toUpperCase() || 'U') : 'S'}
                    </div>
                    <div className={`flex-1 ${message.role === 'user' ? 'max-w-[calc(100%-6rem)]' : 'max-w-[calc(100%-6rem)]'}`}>
                      <div className={`rounded-lg p-4 break-words ${
                        message.role === 'user' 
                          ? 'bg-primary text-primary-foreground ml-8' 
                          : 'bg-muted mr-8'
                      }`}>
                        <p className="text-sm whitespace-pre-wrap break-words">{message.content}</p>
                      </div>
                      <p className={`text-xs text-muted-foreground mt-1 ${
                        message.role === 'user' ? 'text-right' : ''
                      }`}>
                        {message.role === 'user' ? 'You' : 'SLI'} • {new Date(message.createdAt).toLocaleTimeString()}
                      </p>
                    </div>
                  </div>
                ))}

                {/* Optimistic user message (shown immediately when sent) */}
                {optimisticMessage && (
                  <div 
                    className="flex gap-3 flex-row-reverse"
                    data-testid="message-optimistic"
                  >
                    <div className="w-8 h-8 rounded-full flex items-center justify-center bg-primary text-primary-foreground">
                      {user?.firstName?.[0]?.toUpperCase() || 'U'}
                    </div>
                    <div className="flex-1 max-w-[calc(100%-6rem)]">
                      <div className="rounded-lg p-4 break-words bg-primary text-primary-foreground ml-8">
                        <p className="text-sm whitespace-pre-wrap break-words">{optimisticMessage.content}</p>
                      </div>
                      <p className="text-xs text-muted-foreground mt-1 text-right">
                        You • {new Date(optimisticMessage.createdAt).toLocaleTimeString()}
                      </p>
                    </div>
                  </div>
                )}

                {/* Streaming response */}
                {streamingResponse && (
                  <div className="flex gap-3">
                    <div className="w-8 h-8 bg-muted rounded-full flex items-center justify-center">
                      <Loader2 className="h-4 w-4 animate-spin" />
                    </div>
                    <div className="flex-1 max-w-[calc(100%-6rem)]">
                      <div className="bg-muted rounded-lg p-4 mr-8 break-words">
                        <p className="text-sm whitespace-pre-wrap break-words">{streamingResponse}</p>
                      </div>
                      <p className="text-xs text-muted-foreground mt-1">SLI • typing...</p>
                    </div>
                  </div>
                )}

                <div ref={messagesEndRef} />
              </div>
            </ScrollArea>

            {/* Message Input */}
            {(session.status === 'in_progress' || (session.status === 'completed' && allowContinue)) && (
              <div className="border-t p-6">
                <form onSubmit={handleSendMessage}>
                  <div className="flex gap-2">
                    <VoiceMicButton
                      isRecording={voiceRecording.isRecording}
                      isProcessing={voiceRecording.isProcessing}
                      disabled={isStreaming}
                      onClick={voiceRecording.toggleRecording}
                    />
                    <Textarea
                      ref={messageInputRef}
                      value={currentMessage}
                      onChange={(e) => setCurrentMessage(e.target.value)}
                      placeholder="Type or click the microphone to speak your response naturally..."
                      className="min-h-[60px] resize-none text-sm flex-1"
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' && !e.shiftKey) {
                          e.preventDefault();
                          handleSendMessage(e);
                        }
                      }}
                      disabled={isStreaming || voiceRecording.isRecording}
                      data-testid="input-message"
                    />
                    <Button 
                      type="submit" 
                      size="default"
                      disabled={!currentMessage.trim() || isStreaming || voiceRecording.isRecording}
                      data-testid="button-send-message"
                      className="h-[60px]"
                    >
                      {isStreaming ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        <Send className="h-4 w-4" />
                      )}
                    </Button>
                  </div>
                </form>
                
                {/* Status indicator */}
                {(voiceRecording.isRecording || voiceRecording.isProcessing) && (
                  <div className="mt-2 text-sm">
                    {voiceRecording.isProcessing ? (
                      <p className="text-muted-foreground animate-pulse" data-testid="text-voice-status">
                        Processing voice...
                      </p>
                    ) : voiceRecording.isRecording ? (
                      <p className="text-red-600 dark:text-red-400 font-medium" data-testid="text-voice-status">
                        Recording... Click mic to stop
                      </p>
                    ) : null}
                  </div>
                )}
              </div>
            )}

            {/* Completed session message with Continue option */}
            {session.status === 'completed' && !allowContinue && (
              <div className="border-t p-6 text-center space-y-4">
                <div>
                  <CheckCircle className="h-6 w-6 text-green-600 mx-auto mb-2" />
                  <p className="text-sm text-muted-foreground">
                    This session has been completed. You can review the conversation above.
                  </p>
                </div>
                <Button 
                  onClick={() => setAllowContinue(true)}
                  variant="outline"
                  data-testid="button-continue-chat"
                >
                  <MessageSquare className="h-4 w-4 mr-2" />
                  Continue the chat
                </Button>
              </div>
            )}
          </CardContent>
        </Card>
        </div>

        {/* Right Column - Timer & Status (25%) */}
        <div className="hidden lg:block w-1/4 border-l bg-background/50">
          <div className="p-4 space-y-4">
            <h3 className="font-semibold text-sm text-muted-foreground uppercase tracking-wide">Session Info</h3>
            
            {/* Session Timer */}
            {(session.status === 'in_progress' || session.status === 'completed') && (
              <div className="space-y-3">
                <SessionTimer 
                  isSessionActive={session.status === 'in_progress'}
                  isSessionCompleted={session.status === 'completed'}
                  className="border-0 bg-transparent p-0"
                  sessionNumber={sessionNumber}
                  initialTimerElapsed={session.timerElapsed || 0}
                />
              </div>
            )}

            {/* Function Progress for Sessions 1 & 2 */}
            {(sessionNumber === 1 || sessionNumber === 2) && (
              <div className="space-y-2">
                <h4 className="text-sm font-medium">
                  {sessionNumber === 1 ? "Target Functions" : "Credibility Areas"}
                </h4>
                <div className="flex flex-wrap gap-1">
                  {sessionInfo.functions.map((func) => (
                    <Badge key={func} variant="outline" className="text-xs">
                      {func}
                    </Badge>
                  ))}
                </div>
              </div>
            )}

            {/* Completion Data */}
            {session.status === 'completed' && session.completionData && (
              <div className="space-y-2">
                <h4 className="text-sm font-medium">Results</h4>
                <div className="space-y-2 text-sm">
                  {session.completionData.primaryFunction && (
                    <div>
                      <span className="font-medium">Primary:</span> {session.completionData.primaryFunction}
                    </div>
                  )}
                  {session.completionData.secondaryFunction && (
                    <div>
                      <span className="font-medium">Secondary:</span> {session.completionData.secondaryFunction}
                    </div>
                  )}
                  {session.completionData.confidence && (
                    <div>
                      <span className="font-medium">Confidence:</span> {session.completionData.confidence}%
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* PDF Summary Link - Only show when completed */}
            {session.status === 'completed' && (
              <div className="pt-4 border-t">
                <Link href="/summaries">
                  <a 
                    className="text-sm text-green-700 dark:text-green-600 font-medium hover:text-green-800 dark:hover:text-green-500 hover:underline flex items-start gap-2 cursor-pointer"
                    data-testid="link-view-pdf-summary"
                  >
                    <FileText className="h-4 w-4 mt-0.5 flex-shrink-0" />
                    <span>View and Download a PDF summary of this conversation for your records</span>
                  </a>
                </Link>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}