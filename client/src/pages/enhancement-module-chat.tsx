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
import { Loader2, Send, ArrowLeft, CheckCircle, MessageSquare, AlertCircle } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { ScrollArea } from "@/components/ui/scroll-area";
import SessionTimer from "@/components/ui/session-timer";

type EnhancementModule = {
  id: number;
  userId: number;
  moduleCode: string;
  status: 'available' | 'in_progress' | 'completed';
  startedAt?: string;
  completedAt?: string;
  timerElapsed?: number;
  completionData?: Record<string, any>;
};

type EnhancementModuleMessage = {
  id: number;
  moduleId: number;
  role: 'user' | 'assistant';
  content: string;
  createdAt: string;
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

  // Send message mutation
  const sendMessageMutation = useMutation({
    mutationFn: async (content: string) => {
      return await apiRequest('POST', `/api/enhancement-modules/${moduleCode}/message`, { content });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/enhancement-modules', moduleCode] });
      queryClient.invalidateQueries({ queryKey: ['/api/enhancement-modules'] });
      setCurrentMessage('');
      setStreamingResponse('');
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.message || "Failed to send message",
        variant: "destructive",
      });
    },
  });

  // Update timer mutation
  const updateTimerMutation = useMutation({
    mutationFn: async (timerElapsed: number) => {
      return await apiRequest('PATCH', `/api/enhancement-modules/${moduleCode}`, { timerElapsed });
    },
    onError: (error: any) => {
      console.error('Failed to update timer:', error);
    },
  });

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [moduleData?.messages, streamingResponse]);

  const handleSendMessage = () => {
    if (!currentMessage.trim() || sendMessageMutation.isPending) return;
    
    sendMessageMutation.mutate(currentMessage.trim());
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSendMessage();
    }
  };

  const getModuleDetails = (moduleCode: string) => {
    const details = {
      'A': {
        title: "Module A: Digital Behavior Analysis Framework",
        subtitle: "LinkedIn Presence & Content Strategy Assessment",
        description: "Understanding Digital Behavior Patterns & Barriers"
      },
      'B': {
        title: "Module B: Network Position Mapping Framework", 
        subtitle: "Strategic Relationship & Influence Analysis",
        description: "Random Networking vs. Strategic Positioning"
      },
      'C': {
        title: "Module C: Career Aspiration Alignment Framework",
        subtitle: "Long-Term Goals & Positioning Refinement", 
        description: "Aspirational Goals vs. Current Positioning Reality"
      }
    };
    return details[moduleCode as keyof typeof details] || { title: `Module ${moduleCode}`, subtitle: "", description: "" };
  };

  const getStatusBadge = (status: EnhancementModule['status']) => {
    const variants = {
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

  if (isLoading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-50 via-blue-50 to-indigo-100">
        <NavBar />
        <div className="container mx-auto px-4 py-8">
          <div className="flex items-center justify-center py-12">
            <Loader2 className="h-8 w-8 animate-spin" />
          </div>
        </div>
      </div>
    );
  }

  if (error || !moduleData) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-50 via-blue-50 to-indigo-100">
        <NavBar />
        <div className="container mx-auto px-4 py-8">
          <div className="text-center py-12">
            <AlertCircle className="h-12 w-12 text-red-500 mx-auto mb-4" />
            <h2 className="text-xl font-semibold text-slate-800 mb-2">Module Not Found</h2>
            <p className="text-slate-600 mb-4">This module doesn't exist or you don't have access to it.</p>
            <Button onClick={() => navigate('/enhancement-modules')} variant="outline">
              <ArrowLeft className="mr-2 h-4 w-4" />
              Back to Modules
            </Button>
          </div>
        </div>
      </div>
    );
  }

  const { module, messages } = moduleData;
  const details = getModuleDetails(moduleCode);

  // Auto-start if module is available
  useEffect(() => {
    if (module.status === 'available' && !startModuleMutation.isPending) {
      startModuleMutation.mutate(moduleCode);
    }
  }, [module.status, moduleCode]);

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-blue-50 to-indigo-100">
      <NavBar />
      
      <div className="container mx-auto px-4 py-6">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <Button 
            onClick={() => navigate('/enhancement-modules')}
            variant="outline"
            className="border-slate-200 hover:bg-slate-50"
            data-testid="button-back-to-modules"
          >
            <ArrowLeft className="mr-2 h-4 w-4" />
            Back to Modules
          </Button>
          
          <div className="flex items-center gap-4">
            {module.status === 'in_progress' && (
              <SessionTimer 
                initialElapsed={module.timerElapsed || 0}
                onElapsedUpdate={(elapsed) => updateTimerMutation.mutate(elapsed)}
              />
            )}
            {getStatusBadge(module.status)}
          </div>
        </div>

        {/* Module Info */}
        <Card className="mb-6 border-0 shadow-lg bg-white/90 backdrop-blur-sm">
          <CardHeader>
            <CardTitle className="text-2xl font-bold text-slate-800">
              {details.title}
            </CardTitle>
            <CardDescription className="text-lg text-blue-600 font-medium">
              {details.subtitle}
            </CardDescription>
            <p className="text-slate-600 mt-2">
              {details.description}
            </p>
          </CardHeader>
        </Card>

        {/* Chat Interface */}
        <div className="grid gap-6 lg:grid-cols-1">
          <Card className="border-0 shadow-xl bg-white/90 backdrop-blur-sm">
            <CardHeader className="pb-4">
              <CardTitle className="text-lg font-semibold text-slate-800">
                Coaching Conversation
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {/* Messages */}
              <ScrollArea className="h-[500px] w-full pr-4">
                <div className="space-y-4">
                  {messages.map((message) => (
                    <div
                      key={message.id}
                      className={`flex ${message.role === 'user' ? 'justify-end' : 'justify-start'}`}
                      data-testid={`message-${message.role}-${message.id}`}
                    >
                      <div
                        className={`max-w-[80%] px-4 py-3 rounded-lg ${
                          message.role === 'user'
                            ? 'bg-blue-600 text-white ml-4'
                            : 'bg-slate-100 text-slate-800 mr-4'
                        }`}
                      >
                        <div className="whitespace-pre-wrap break-words">
                          {message.content}
                        </div>
                        <div
                          className={`text-xs mt-2 opacity-70 ${
                            message.role === 'user' ? 'text-blue-100' : 'text-slate-500'
                          }`}
                        >
                          {new Date(message.createdAt).toLocaleTimeString()}
                        </div>
                      </div>
                    </div>
                  ))}
                  
                  {/* Streaming response */}
                  {streamingResponse && (
                    <div className="flex justify-start">
                      <div className="max-w-[80%] px-4 py-3 rounded-lg bg-slate-100 text-slate-800 mr-4">
                        <div className="whitespace-pre-wrap break-words">
                          {streamingResponse}
                        </div>
                        <div className="flex items-center gap-1 mt-2">
                          <Loader2 className="h-3 w-3 animate-spin" />
                          <span className="text-xs text-slate-500">AI is typing...</span>
                        </div>
                      </div>
                    </div>
                  )}
                  
                  <div ref={messagesEndRef} />
                </div>
              </ScrollArea>
              
              {/* Input */}
              {module.status !== 'completed' && (
                <div className="flex gap-3 pt-4 border-t">
                  <Textarea
                    ref={messageInputRef}
                    value={currentMessage}
                    onChange={(e) => setCurrentMessage(e.target.value)}
                    onKeyPress={handleKeyPress}
                    placeholder="Type your message here..."
                    className="flex-1 resize-none min-h-[60px] border-slate-200 focus:border-blue-300 focus:ring-blue-200"
                    disabled={sendMessageMutation.isPending || module.status === 'completed'}
                    data-testid="input-message"
                  />
                  <Button
                    onClick={handleSendMessage}
                    disabled={!currentMessage.trim() || sendMessageMutation.isPending || module.status === 'completed'}
                    className="bg-blue-600 hover:bg-blue-700 text-white px-6 self-end"
                    data-testid="button-send-message"
                  >
                    {sendMessageMutation.isPending ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <>
                        <Send className="h-4 w-4 mr-2" />
                        Send
                      </>
                    )}
                  </Button>
                </div>
              )}
              
              {/* Completed State */}
              {module.status === 'completed' && (
                <div className="pt-4 border-t bg-green-50 rounded-lg p-4 mt-4">
                  <div className="flex items-center gap-3 mb-3">
                    <CheckCircle className="h-5 w-5 text-green-600" />
                    <h3 className="font-semibold text-green-800">
                      Module Completed!
                    </h3>
                  </div>
                  
                  {module.completionData && (
                    <div className="space-y-3 text-sm text-green-700">
                      {module.completionData.confidence && (
                        <div>
                          <span className="font-medium">Confidence:</span> {module.completionData.confidence}%
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}