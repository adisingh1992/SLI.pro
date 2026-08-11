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
import { Loader2, Send, ArrowLeft, Lock, CheckCircle, MessageSquare, AlertCircle, LogOut } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import VoiceMicButton from "@/components/VoiceMicButton";
import { useVoiceRecording } from "@/hooks/use-voice-recording";
import { useToast } from "@/hooks/use-toast";
import { ScrollArea } from "@/components/ui/scroll-area";
import type { EnhancementModule, EnhancementModuleMessage } from '@shared/schema';
import { SessionTimer } from "@/components/ui/session-timer";
import type { SessionTimerConfig } from '@/hooks/use-session-timer';

// Timer configurations for Enhancement Modules
const MODULE_A_TIMER_CONFIG: SessionTimerConfig = {
  targetMinutes: 15,
  warningMinutes: 12,
  messages: {
    initial: "Recommended time: 15-20 minutes (thoughtful responses improve your LinkedIn strategy)",
    warning: "About 3 minutes remaining - focus on your key content challenges",
    overtime: "No rush - quality insights create better positioning outcomes",
    completed: "Digital Behavior Analysis complete - your LinkedIn strategy is optimized"
  }
};

const MODULE_B_TIMER_CONFIG: SessionTimerConfig = {
  targetMinutes: 12,
  warningMinutes: 10,
  messages: {
    initial: "Recommended time: 12-15 minutes (detailed answers reveal network positioning gaps)",
    warning: "About 2 minutes remaining - identify your key relationship targets",
    overtime: "No rush - thorough analysis creates stronger relationship strategies",
    completed: "Network Position Mapping complete - your relationship strategy is clear"
  }
};

const MODULE_C_TIMER_CONFIG: SessionTimerConfig = {
  targetMinutes: 10,
  warningMinutes: 8,
  messages: {
    initial: "Recommended time: 10-15 minutes (clear goals improve alignment)",
    warning: "About 2 minutes remaining - clarify your top aspirational goals",
    overtime: "No rush - thoughtful planning strengthens career positioning",
    completed: "Career Aspiration Alignment complete - your goals are aligned"
  }
};

type ModuleWithMessages = {
  module: EnhancementModule;
  messages: EnhancementModuleMessage[];
};

export default function EnhancementModuleChatPage() {
  const { user } = useAuth();
  const [, navigate] = useLocation();
  const { moduleCode: moduleCodeParam } = useParams<{ moduleCode: string }>();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  
  const moduleCode = moduleCodeParam || 'A';
  const [currentMessage, setCurrentMessage] = useState('');
  const [isStreaming, setIsStreaming] = useState(false);
  const [streamingResponse, setStreamingResponse] = useState('');
  const [optimisticMessage, setOptimisticMessage] = useState<EnhancementModuleMessage | null>(null);
  const [allowContinue, setAllowContinue] = useState(false);
  const [showEndDialog, setShowEndDialog] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const messageInputRef = useRef<HTMLTextAreaElement>(null);
  const messageCountBeforeStreamRef = useRef<number>(0);

  // Voice recording hook
  const voiceRecording = useVoiceRecording({
    userId: user?.id || 0,
    moduleCode: moduleCode,
    onTranscriptionComplete: (text: string) => {
      // Insert transcribed text into the message input
      setCurrentMessage(prev => prev + (prev ? ' ' : '') + text);
      // Focus the text area for potential editing
      setTimeout(() => messageInputRef.current?.focus(), 100);
    }
  });

  // Validate module code
  if (!['A', 'B', 'C'].includes(moduleCode)) {
    navigate('/');
    return null;
  }

  // Fetch module with messages
  const { data: moduleData, isLoading, error } = useQuery<ModuleWithMessages>({
    queryKey: ['/api/enhancement-modules', moduleCode],
    enabled: !!user,
  });

  // Auto-start module if available
  const startModuleMutation = useMutation({
    mutationFn: async (moduleCode: string) => {
      return await apiRequest('POST', `/api/enhancement-modules/${moduleCode}/start`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/enhancement-modules', moduleCode] });
      queryClient.invalidateQueries({ queryKey: ['/api/enhancement-modules'] });
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.message || "Failed to start module",
        variant: "destructive",
      });
    },
  });

  // Update timer mutation for Enhancement Modules
  const updateTimerMutation = useMutation({
    mutationFn: async (timerElapsed: number) => {
      return await apiRequest('PATCH', `/api/enhancement-modules/${moduleCode}`, { timerElapsed });
    },
    onError: (error: any) => {
      console.error('Failed to update timer:', error);
    },
  });

  /**
   * A3: "No option to end modules early (unlike Foundation Sessions, which
   * allow early exit). Modules should allow exit at any natural stopping
   * point."
   *
   * The server still runs the analysis, so whatever the conversation produced
   * is kept — the module is recorded as ended_early rather than completed.
   */
  const endEarlyMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest('POST', `/api/enhancement-modules/${moduleCode}/end-early`);
      return await res.json();
    },
    onSuccess: (data: any) => {
      queryClient.invalidateQueries({ queryKey: ['/api/enhancement-modules'] });
      toast({
        title: "Module ended",
        description: data?.outcomeSaved
          ? "Your progress was saved, along with what came out of the conversation."
          : "Your progress is saved. You can pick this up again whenever.",
      });
      navigate('/');
    },
    onError: () => {
      toast({
        title: "Couldn't end the module",
        description: "Try again in a moment.",
        variant: "destructive",
      });
    },
  });

  // Auto-start module if available (similar to Foundation Sessions)
  useEffect(() => {
    if (moduleData?.module && moduleData.module.status === 'available') {
      startModuleMutation.mutate(moduleCode);
    }
  }, [moduleData?.module?.status, moduleCode]);

  // Send message with streaming response (similar to Foundation Sessions)
  const sendMessage = async (content: string) => {
    if (!content.trim() || isStreaming) return;

    setIsStreaming(true);
    setStreamingResponse('');
    
    // Track message count before streaming starts
    messageCountBeforeStreamRef.current = moduleData?.messages?.length || 0;
    
    // Store the message content for optimistic display
    const messageContent = content.trim();
    
    try {
      // Use fetch directly for streaming
      const response = await fetch(`/api/enhancement-modules/${moduleCode}/messages/stream`, {
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
                  moduleId: moduleData?.module.id || 0,
                  role: 'user',
                  content: messageContent,
                  createdAt: new Date()
                });
              } else if (eventData.type === 'chunk') {
                setStreamingResponse(prev => prev + eventData.content);
              } else if (eventData.type === 'complete') {
                /*
                 * Wing has finished speaking and the reply is saved. Release
                 * the composer HERE rather than when the response body ends —
                 * the server keeps the connection open past this point to run
                 * the module completion analysis, which is a model call over
                 * the whole transcript that the student has no reason to wait
                 * through. Clearing it in `finally` meant a finished reply sat
                 * on screen with the input disabled for several more seconds,
                 * every turn.
                 */
                setIsStreaming(false);
                queryClient.invalidateQueries({ queryKey: ['/api/enhancement-modules', moduleCode] });
                queryClient.invalidateQueries({ queryKey: ['/api/enhancement-modules'] });
              } else if (eventData.type === 'module_completed') {
                console.log('Module automatically completed:', eventData);
                
                // Module-specific completion messages
                let description = '';
                if (eventData.moduleCode === 'A') {
                  description = `Digital Behavior Analysis completed! Your LinkedIn strategy has been optimized.`;
                } else if (eventData.moduleCode === 'B') {
                  description = `Network Position Mapping completed! Your relationship strategy is now clear.`;
                } else if (eventData.moduleCode === 'C') {
                  description = `Career Aspiration Alignment completed! Your goals are now aligned with your positioning.`;
                } else {
                  description = `Enhancement Module ${eventData.moduleCode} has been completed successfully.`;
                }
                
                toast({
                  title: "Module Completed!",
                  description,
                  duration: 5000,
                });
                // Refresh data after auto-completion
                queryClient.invalidateQueries({ queryKey: ['/api/enhancement-modules', moduleCode] });
                queryClient.invalidateQueries({ queryKey: ['/api/enhancement-modules'] });
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
    if (optimisticMessage && moduleData?.messages) {
      const messageExists = moduleData.messages.some(msg => msg.id === optimisticMessage.id);
      if (messageExists) {
        setOptimisticMessage(null);
      }
    }
    
    // Clear streaming response when new assistant message appears
    if (streamingResponse && moduleData?.messages) {
      // Check if we have more messages than before streaming started
      const currentMessageCount = moduleData.messages.length;
      if (currentMessageCount > messageCountBeforeStreamRef.current) {
        const lastMessage = moduleData.messages[moduleData.messages.length - 1];
        // If the last message is from assistant, the stream has been saved
        if (lastMessage.role === 'assistant') {
          setStreamingResponse('');
        }
      }
    }
  }, [moduleData?.messages, optimisticMessage, streamingResponse]);

  // Auto-scroll to bottom when new messages arrive
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [moduleData?.messages, streamingResponse, optimisticMessage]);

  // Handle message submission
  const handleSendMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!currentMessage.trim() || isStreaming) {
      return;
    }

    const messageContent = currentMessage.trim();
    await sendMessage(messageContent);
  };

  // Module-specific information and guidance
  const getModuleGuidance = () => {
    if (moduleCode === 'A') {
      return {
        title: "Digital Behavior Analysis",
        description: "LinkedIn Content Strategy & Professional Brand Development (15-20 minutes)",
        prompt: "People scan a LinkedIn profile in 4–10 seconds. Let's do that with yours.",
        functions: ["Content Strategy", "Brand Development", "LinkedIn Optimization"]
      };
    } else if (moduleCode === 'B') {
      return {
        title: "Network Position Mapping",
        description: "Strategic Relationship Analysis & Influence Assessment (12-15 minutes)",
        prompt: "Let's analyze your current network positioning and identify strategic relationship gaps.",
        functions: ["Network Analysis", "Relationship Strategy", "Influence Mapping"]
      };
    } else if (moduleCode === 'C') {
      return {
        title: "Career Aspiration Alignment",
        description: "Goal Alignment & Long-term Positioning Strategy (10-15 minutes)",
        prompt: "Let's align your career aspirations with your current professional positioning.",
        functions: ["Goal Alignment", "Career Strategy", "Position Optimization"]
      };
    }
    return {
      title: `Enhancement Module ${moduleCode}`,
      description: "This module is not yet available.",
      prompt: "This module is coming soon.",
      functions: []
    };
  };

  // Get timer config for the current module
  const getTimerConfig = (): SessionTimerConfig => {
    if (moduleCode === 'A') return MODULE_A_TIMER_CONFIG;
    if (moduleCode === 'B') return MODULE_B_TIMER_CONFIG;
    if (moduleCode === 'C') return MODULE_C_TIMER_CONFIG;
    return MODULE_A_TIMER_CONFIG; // Default
  };

  // Timer save callback
  const handleTimerSave = async (elapsed: number) => {
    if (module.status === 'in_progress') {
      updateTimerMutation.mutate(elapsed);
    }
  };

  const moduleInfo = getModuleGuidance();

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

  if (error || !moduleData || !moduleData.module) {
    return (
      <div className="min-h-screen bg-background">
        <NavBar />
        <div className="container mx-auto px-4 py-8">
          <Card className="max-w-md mx-auto">
            <CardContent className="p-6 text-center">
              <AlertCircle className="h-12 w-12 text-destructive mx-auto mb-4" />
              <p className="text-red-600 mb-4">Error loading Enhancement Module</p>
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

  const { module, messages } = moduleData;

  return (
    <div className="min-h-screen bg-background">
      <NavBar />
      
      {/* Header */}
      <div className="w-full px-4 py-2 border-b bg-background">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2 sm:gap-4">
            <Button
              onClick={() => navigate('/')}
              variant="outline"
              size="sm"
              data-testid="button-back-to-overview"
            >
              <ArrowLeft className="h-4 w-4 sm:mr-2" />
              <span className="hidden sm:inline">Back</span>
            </Button>
            <div className="min-w-0">
              <h1 className="truncate text-base font-bold text-foreground sm:text-2xl" data-testid="text-module-title">
                {moduleInfo.title}
              </h1>
              <p className="hidden text-sm text-muted-foreground sm:block">{moduleInfo.description}</p>
            </div>
          </div>
        </div>
      </div>

      {/* 2-column layout. `dvh` not `vh` — see foundation-session-chat.tsx for
          why; the failure is the message box sitting below the fold on a
          phone. */}
      <div className="flex h-[calc(100dvh-104px)] sm:h-[calc(100dvh-140px)]">
        {/* Left Column - Chat Interface (75%) */}
        <div className="w-full lg:w-3/4 flex flex-col">
          {/* Mobile bar — the info column is hidden below lg, so a student on a
              phone would otherwise have neither the timer nor a way out. */}
          {(module.status === 'in_progress' || module.status === 'completed') && (
            <div className="flex shrink-0 items-center justify-between gap-2 border-b px-3 py-1.5 lg:hidden">
              <SessionTimer
                config={getTimerConfig()}
                isSessionActive={module.status === 'in_progress'}
                isSessionCompleted={module.status === 'completed'}
                className="border-0 bg-transparent p-0 text-xs"
                initialTimerElapsed={module.timerElapsed || 0}
                onTimerSave={handleTimerSave}
              />
              {module.status === 'in_progress' && (
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-8 shrink-0 px-2 text-xs text-muted-foreground hover:text-destructive"
                  onClick={() => setShowEndDialog(true)}
                  disabled={isStreaming || endEarlyMutation.isPending}
                >
                  <LogOut className="mr-1 h-3.5 w-3.5" />
                  End
                </Button>
              )}
            </div>
          )}

          {/* Chat Interface */}
          <Card className="flex-1 flex flex-col overflow-hidden m-0 rounded-none">       
          <CardContent className="flex-1 min-h-0 flex flex-col p-0 overflow-hidden py-2">
            {/* Messages Area */}
            <ScrollArea className="flex-1 min-h-0 px-3 sm:px-6">
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
            {(module.status === 'in_progress' || (module.status === 'completed' && allowContinue)) && (
              <div className="border-t p-3 sm:p-6">
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
                      className="min-h-[60px] resize-none text-base sm:text-sm flex-1"
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

            {/* Completed module message with Continue option */}
            {module.status === 'completed' && !allowContinue && (
              <div className="border-t p-6 text-center space-y-4">
                <div>
                  <CheckCircle className="h-6 w-6 text-green-600 mx-auto mb-2" />
                  <p className="text-sm text-muted-foreground">
                    This module has been completed. You can review the conversation above.
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
            <h3 className="font-semibold text-sm text-muted-foreground uppercase tracking-wide">Module Info</h3>
            
            {/* Module Timer */}
            <SessionTimer
              config={getTimerConfig()}
              isSessionActive={module.status === 'in_progress'}
              isSessionCompleted={module.status === 'completed'}
              initialTimerElapsed={module.timerElapsed || 0}
              onTimerSave={handleTimerSave}
            />

            {module.status === 'in_progress' && (
              <Button
                variant="outline"
                size="sm"
                className="w-full text-muted-foreground hover:text-destructive hover:border-destructive"
                onClick={() => setShowEndDialog(true)}
                disabled={isStreaming || endEarlyMutation.isPending}
              >
                <LogOut className="h-3.5 w-3.5 mr-2" />
                End Module Early
              </Button>
            )}


            {/* Function Progress for Enhancement Modules */}
            <div className="space-y-2">
              <h4 className="text-sm font-medium">Focus Areas</h4>
              <div className="flex flex-wrap gap-1">
                {moduleInfo.functions.map((func) => (
                  <Badge key={func} variant="outline" className="text-xs">
                    {func}
                  </Badge>
                ))}
              </div>
            </div>

            {/* Completion Data */}
            {module.status === 'completed' && module.completionData && (
              <div className="space-y-2">
                <h4 className="text-sm font-medium">Results</h4>
                <div className="space-y-2 text-sm">
                  {module.completionData.confidence && (
                    <div>
                      <span className="font-medium">Confidence:</span> {module.completionData.confidence}%
                    </div>
                  )}
                  {module.completionData.brandClaim && (
                    <div>
                      <span className="font-medium">Brand Claim:</span> {module.completionData.brandClaim}
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* Removed: a "download a PDF summary" link to /summaries, which
                has no server route. See the same note in
                foundation-session-chat.tsx. */}
          </div>
        </div>
      </div>

      {/*
        Ending early is a legitimate stopping point, so the copy says so.

        Deliberately gentler than the Foundation Session equivalent, which warns
        that partial completion means partial results. That is true there — the
        three sessions build on each other and produce the positioning. Modules
        are optional and non-progressive, so implying a penalty for stopping
        would be both untrue and exactly the pressure A3 exists to remove.
      */}
      <Dialog open={showEndDialog} onOpenChange={setShowEndDialog}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Stop here?</DialogTitle>
            <DialogDescription className="pt-2 leading-relaxed">
              That's fine — these modules are optional and you can take them in any order.
              <br /><br />
              Whatever you've worked out so far is saved, and you can come back to this one
              whenever you want.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="flex-col-reverse gap-2 sm:flex-row sm:gap-0">
            <Button
              variant="outline"
              onClick={() => setShowEndDialog(false)}
              className="sm:mr-2"
              disabled={endEarlyMutation.isPending}
            >
              Keep going
            </Button>
            <Button
              onClick={() => endEarlyMutation.mutate()}
              disabled={endEarlyMutation.isPending}
              data-testid="button-end-module-confirm"
            >
              {endEarlyMutation.isPending ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Saving…
                </>
              ) : (
                'Stop here'
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}