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
import { Loader2, Send, ArrowLeft, Lock, CheckCircle, MessageSquare, AlertCircle, Clock, CheckCircle2 } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { ScrollArea } from "@/components/ui/scroll-area";
import type { EnhancementModule, EnhancementModuleMessage } from '@shared/schema';

// Simple timer component for Enhancement Modules
interface EnhancementModuleTimerProps {
  isActive: boolean;
  isCompleted: boolean;
  initialTimerElapsed: number;
  onTimerUpdate: (elapsed: number) => void;
}

function EnhancementModuleTimer({ isActive, isCompleted, initialTimerElapsed, onTimerUpdate }: EnhancementModuleTimerProps) {
  const [timeElapsed, setTimeElapsed] = useState(initialTimerElapsed);
  const intervalRef = useRef<NodeJS.Timeout | null>(null);
  const lastUpdateRef = useRef<number>(0);

  useEffect(() => {
    setTimeElapsed(initialTimerElapsed);
  }, [initialTimerElapsed]);

  useEffect(() => {
    if (isActive && !isCompleted) {
      intervalRef.current = setInterval(() => {
        setTimeElapsed(prev => {
          const newElapsed = prev + 1;
          
          // Call onTimerUpdate every 10 seconds
          if (newElapsed - lastUpdateRef.current >= 10) {
            onTimerUpdate(newElapsed);
            lastUpdateRef.current = newElapsed;
          }
          
          return newElapsed;
        });
      }, 1000);
    } else {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
    }

    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
      }
    };
  }, [isActive, isCompleted, onTimerUpdate]);

  const formatTime = (seconds: number): string => {
    const minutes = Math.floor(seconds / 60);
    const remainingSeconds = seconds % 60;
    return `${minutes.toString().padStart(2, '0')}:${remainingSeconds.toString().padStart(2, '0')}`;
  };

  const getIcon = () => {
    return isCompleted ? CheckCircle2 : Clock;
  };

  const getColorClass = () => {
    return isCompleted ? 'text-green-600' : 'text-blue-600';
  };

  const Icon = getIcon();

  return (
    <div className={`flex items-center gap-2 ${getColorClass()}`}>
      <Icon className="h-4 w-4" />
      <span className="font-medium">{formatTime(timeElapsed)}</span>
      {isCompleted && <span className="text-sm text-green-600">Complete</span>}
    </div>
  );
}

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
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const messageInputRef = useRef<HTMLTextAreaElement>(null);

  // Validate module code
  if (!['A', 'B', 'C'].includes(moduleCode)) {
    navigate('/enhancement-modules');
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
    
    try {
      // Use fetch directly for streaming
      const response = await fetch(`/api/enhancement-modules/${moduleCode}/messages/stream`, {
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
      setStreamingResponse('');
      setCurrentMessage('');
      // Refocus the input after clearing the message
      setTimeout(() => {
        messageInputRef.current?.focus();
      }, 0);
    }
  };

  // Auto-scroll to bottom when new messages arrive
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [moduleData?.messages, streamingResponse]);

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
              <Button onClick={() => navigate('/enhancement-modules')} variant="outline">
                <ArrowLeft className="h-4 w-4 mr-2" />
                Back to Enhancement Modules
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
          <div className="flex items-center gap-4">
            <Button 
              onClick={() => navigate('/enhancement-modules')} 
              variant="outline" 
              size="sm"
              data-testid="button-back-to-overview"
            >
              <ArrowLeft className="h-4 w-4 mr-2" />
              Back
            </Button>
            <div>
              <h1 className="text-2xl font-bold text-foreground" data-testid="text-module-title">
                {moduleInfo.title}
              </h1>
              <p className="text-sm text-muted-foreground">{moduleInfo.description}</p>
            </div>
          </div>
        </div>
      </div>

      {/* 2-Column Layout */}
      <div className="flex h-[calc(100vh-140px)]">
        {/* Left Column - Chat Interface (75%) */}
        <div className="w-3/4 flex flex-col">
          {/* Module Progress - based on message count */}
          {module.status === 'in_progress' && messages.length > 0 && (
            <div className="px-4 py-3 border-b bg-background/50">
              <div className="flex items-center justify-between mb-2">
                <span className="text-sm font-medium">Module Progress</span>
                <span className="text-sm text-muted-foreground">{Math.min(Math.floor((messages.length / 20) * 100), 100)}%</span>
              </div>
              <Progress value={Math.min(Math.floor((messages.length / 20) * 100), 100)} className="h-2" data-testid="progress-module" />
            </div>
          )}

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
                      {message.role === 'user' ? 'U' : 'M'}
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
                        {message.role === 'user' ? 'You' : 'Module'} • {new Date(message.createdAt).toLocaleTimeString()}
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
                    <div className="flex-1 max-w-[calc(100%-6rem)]">
                      <div className="bg-muted rounded-lg p-4 mr-8 break-words">
                        <p className="text-sm break-words">{streamingResponse}</p>
                      </div>
                      <p className="text-xs text-muted-foreground mt-1">Module • typing...</p>
                    </div>
                  </div>
                )}

                <div ref={messagesEndRef} />
              </div>
            </ScrollArea>

            {/* Message Input */}
            {module.status === 'in_progress' && (
              <form onSubmit={handleSendMessage} className="border-t p-6">
                <div className="flex gap-3">
                  <Textarea
                    ref={messageInputRef}
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

            {/* Completed module message */}
            {module.status === 'completed' && (
              <div className="border-t p-6 text-center">
                <CheckCircle className="h-6 w-6 text-green-600 mx-auto mb-2" />
                <p className="text-sm text-muted-foreground">
                  This module has been completed. You can review the conversation above.
                </p>
              </div>
            )}
          </CardContent>
        </Card>
        </div>

        {/* Right Column - Timer & Status (25%) */}
        <div className="w-1/4 border-l bg-background/50">
          <div className="p-4 space-y-4">
            <h3 className="font-semibold text-sm text-muted-foreground uppercase tracking-wide">Module Info</h3>
            
            {/* Module Timer */}
            {(module.status === 'in_progress' || module.status === 'completed') && (
              <div className="space-y-3">
                <EnhancementModuleTimer 
                  isActive={module.status === 'in_progress'}
                  isCompleted={module.status === 'completed'}
                  initialTimerElapsed={module.timerElapsed || 0}
                  onTimerUpdate={(elapsed: number) => {
                    // Update timer in database every 10 seconds
                    if (module.status === 'in_progress') {
                      updateTimerMutation.mutate(elapsed);
                    }
                  }}
                />
              </div>
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
          </div>
        </div>
      </div>
    </div>
  );
}