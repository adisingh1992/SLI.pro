import { useAuth } from '@/hooks/use-auth';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiRequest } from '@/lib/queryClient';
import { useState, useRef, useEffect } from 'react';
import { useLocation, useParams } from 'wouter';
import NavBar from "@/components/nav-bar";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Loader2, Send, ArrowLeft, CheckCircle, MessageSquare, AlertCircle, LogOut, Compass, Sparkles } from "lucide-react";
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
import type { EnhancementModule, EnhancementModuleMessage } from '@shared/schema';
import { SessionTimer } from "@/components/ui/session-timer";
import type { SessionTimerConfig } from '@/hooks/use-session-timer';
import {
  ChatHeader,
  Composer,
  Sheet,
  OutcomeCard,
  Prose,
  RailFact,
  RailMeter,
  RailSection,
  Thinking,
  Transcript,
  Turn,
} from "@/components/chat";

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
    /* Flex column, not calc — see foundation-session-chat.tsx. The old
       arithmetic omitted the nav bar and pushed the composer below the fold. */
    <div className="flex h-[100dvh] flex-col bg-canvas">
      <div className="shrink-0">
        <NavBar />
      </div>
      
      {/*
        Header carries the timer and the exit, so both exist on a phone. They
        used to live only in the rail (`hidden lg:`) plus a duplicated mobile
        bar — two implementations of one thing.
      */}
      <ChatHeader
        title={moduleInfo.title}
        subtitle={moduleInfo.description}
        onBack={() => navigate('/')}
        meta={
          (module.status === 'in_progress' || module.status === 'completed') && (
            <div className="flex items-center gap-1">
              <SessionTimer
                config={getTimerConfig()}
                isSessionActive={module.status === 'in_progress'}
                isSessionCompleted={module.status === 'completed'}
                initialTimerElapsed={module.timerElapsed || 0}
                onTimerSave={handleTimerSave}
              />
              {module.status === 'in_progress' && (
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-8 px-2 text-ink-soft hover:text-bad lg:hidden"
                  onClick={() => setShowEndDialog(true)}
                  disabled={isStreaming || endEarlyMutation.isPending}
                >
                  <LogOut className="h-3.5 w-3.5" />
                  <span className="sr-only">End module early</span>
                </Button>
              )}
            </div>
          )
        }
      />

      {/* Paper on a desk — see foundation-session-chat.tsx for the reasoning.
          `px-6` matches the header's gutters so the title sits above the
          sheet's left edge and the timer above the rail. */}
      <div className="flex min-h-0 flex-1 gap-4 p-4 sm:gap-5 sm:px-6 sm:py-5">
        <Sheet className="w-full min-w-0 lg:w-[72%]">
          <Transcript>
            {messages.map((message, index) => (
              <Turn
                key={message.id}
                role={message.role === 'user' ? 'user' : 'assistant'}
                time={message.createdAt}
                testId={`message-${message.role}-${index}`}
              >
                {message.role === 'user' ? message.content : <Prose content={message.content} />}
              </Turn>
            ))}

            {optimisticMessage && (
              <Turn role="user" time={optimisticMessage.createdAt} testId="message-optimistic">
                {optimisticMessage.content}
              </Turn>
            )}

            {isStreaming &&
              (streamingResponse ? (
                <Turn role="assistant" testId="message-streaming">
                  <Prose content={streamingResponse} />
                </Turn>
              ) : (
                <Thinking />
              ))}

            {module.status === 'completed' && !allowContinue && (
              <div className="space-y-4 pt-2">
                <div className="flex items-start gap-2 text-[14px] text-ink-soft">
                  <CheckCircle className="mt-0.5 h-4 w-4 shrink-0 text-good" />
                  <p>This module is done — the conversation above stays here if you want to reread it.</p>
                </div>
                <OutcomeCard
                  eyebrow="Finished"
                  title="Back to your dashboard"
                  action={<Button onClick={() => navigate('/')}>Go to dashboard</Button>}
                >
                  Modules are optional and can be taken in any order. The rest are waiting
                  whenever you want them.
                </OutcomeCard>
                <Button
                  onClick={() => setAllowContinue(true)}
                  variant="ghost"
                  size="sm"
                  className="text-ink-soft hover:text-ink"
                  data-testid="button-continue-chat"
                >
                  <MessageSquare className="mr-2 h-4 w-4" />
                  Or keep talking about this one
                </Button>
              </div>
            )}

            <div ref={messagesEndRef} />
          </Transcript>

          {(module.status === 'in_progress' ||
            (module.status === 'completed' && allowContinue)) && (
            <Composer
              note={
                voiceRecording.isProcessing ? (
                  <span className="animate-pulse" data-testid="text-voice-status">
                    Processing voice…
                  </span>
                ) : voiceRecording.isRecording ? (
                  <span className="font-medium text-bad" data-testid="text-voice-status">
                    Recording — tap the mic to stop
                  </span>
                ) : null
              }
            >
              <form onSubmit={handleSendMessage}>
                <div className="flex items-end gap-1 rounded-2xl border border-rule bg-background p-1.5 transition-colors focus-within:border-brand/40">
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
                    placeholder="Type your answer, or tap the mic…"
                    className="max-h-40 min-h-9 flex-1 resize-none border-0 bg-transparent px-2 py-[6px] text-base leading-6 text-ink shadow-none placeholder:text-ink-soft/60 focus-visible:ring-0 sm:text-[15px]"
                    rows={1}
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
                    size="icon"
                    disabled={!currentMessage.trim() || isStreaming || voiceRecording.isRecording}
                    data-testid="button-send-message"
                    className="h-9 w-9 shrink-0 rounded-full bg-brand text-white hover:bg-brand/90"
                  >
                    {isStreaming ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <Send className="h-4 w-4" />
                    )}
                  </Button>
                </div>
              </form>
            </Composer>
          )}
        </Sheet>

        <aside className="hidden w-[28%] min-w-[17rem] shrink-0 overflow-y-auto lg:block">
          <div className="space-y-4">
            <RailSection title="Focus areas" tone="info" icon={<Compass className="h-3.5 w-3.5" />}>
              <div className="flex flex-wrap gap-1.5">
                {moduleInfo.functions.map((func) => (
                  <span key={func} className="rounded-full bg-info-soft px-2.5 py-1 text-[12px] text-info">
                    {func}
                  </span>
                ))}
              </div>
            </RailSection>

            {module.status === 'completed' && module.completionData?.confidence != null && (
              <RailSection
                title="What this module found"
                tone="brand"
                icon={<Sparkles className="h-3.5 w-3.5" />}
              >
                <RailMeter value={module.completionData.confidence} label="Confidence" />
              </RailSection>
            )}

            {module.status === 'in_progress' && (
              <RailSection title="If you need to stop" tone="warn" icon={<LogOut className="h-3.5 w-3.5" />}>
                <p className="text-[13px] leading-relaxed text-ink-soft">
                  Your progress is saved as you go. Modules are optional, so stopping costs
                  you nothing.
                </p>
                <Button
                  variant="outline"
                  size="sm"
                  className="w-full border-rule text-ink-soft hover:border-bad/40 hover:text-bad"
                  onClick={() => setShowEndDialog(true)}
                  disabled={isStreaming || endEarlyMutation.isPending}
                >
                  <LogOut className="mr-2 h-3.5 w-3.5" />
                  End module early
                </Button>
              </RailSection>
            )}
          </div>
        </aside>
      </div>

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