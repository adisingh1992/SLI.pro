import React, { useState, useEffect, useRef } from "react";
import { useAuth } from "@/hooks/use-auth";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
  CardFooter,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "@/hooks/use-toast";
import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import UserAvatar from "@/components/user-avatar";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Loader2, Send, Plus, MessageSquare, Bot } from "lucide-react";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ChatPrompt } from "@shared/schema";

export default function ChatPage() {
  const { user } = useAuth();
  const [message, setMessage] = useState("");
  const [selectedPromptId, setSelectedPromptId] = useState<number | null>(null);
  const [isCreatingConversation, setIsCreatingConversation] = useState(false);
  const [activeConversationId, setActiveConversationId] = useState<number | null>(null);
  const [newPromptTitle, setNewPromptTitle] = useState("");
  const [newPromptContent, setNewPromptContent] = useState("");
  const [newPromptSystemPrompt, setNewPromptSystemPrompt] = useState("");
  const [isAddingPrompt, setIsAddingPrompt] = useState(false);
  const [claudeResponse, setClaudeResponse] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  // Track message history for context preservation in direct Claude conversations
  const [messageHistory, setMessageHistory] = useState<Array<{role: string, content: string}>>([]);
  // Track whether the bot has initiated the conversation
  const [conversationInitiated, setConversationInitiated] = useState(false);
  // Track the current question number in the guided conversation
  const [currentQuestionNumber, setCurrentQuestionNumber] = useState(0);
  // Track if the user mentioned business school to ask the business school specific question
  const [mentionedBusinessSchool, setMentionedBusinessSchool] = useState(false);
  // Track if the business school question has been asked
  const [askedBusinessSchoolQuestion, setAskedBusinessSchoolQuestion] = useState(false);
  
  // Reference for auto scrolling
  const messagesEndRef = useRef<HTMLDivElement>(null);
  
  // Predefined conversation flow questions
  const guidedQuestions = [
    `Hi there! I'm SLI.pro's Assistant. Thanks so much for taking the time to chat today.

Before your upcoming coaching session, I'd love to ask you a few questions to help us make the most of your time with your coach. These will give us a clearer picture of where you are right now and where you'd like to go, so we can tailor the session to what matters most to you.

Let's start here:

1. Could you share more about your current professional situation? I'd like to understand any specific challenges or opportunities you're facing right now.`,
    
    `Thank you for sharing that. Now for my next question:

2. What motivated you to invest in professional branding at this particular moment in your career? What outcomes are you hoping to achieve?`,
    
    `That's very helpful to understand. For my next question:

3. Looking ahead, which functional area do you see yourself best fitting into? (For example: operations, marketing, sales, finance, product, or something else entirely)`,
    
    `Thank you for all your thoughtful responses. Let me summarize what I've learned about:

- Your current professional situation
- Your motivations for investing in personal branding now
- Your target functional direction

Is there anything else you'd like to add that would be helpful for your coach to know before your session?`,
    
    `You've done a great job sharing your background and goals. This information will help make your coaching session much more productive.

To move forward with scheduling your session, please use this link:
https://calendly.com/dcara-sli/haas

Thank you for your time, and we look forward to working with you!`
  ];
  
  // Additional question for business school
  const businessSchoolQuestion = `I noticed from your background that you're pursuing business school. What specifically motivated you to pursue business school now, and how do you see it fitting into your longer-term career trajectory?`;
  
  // Default system prompt for SLI.pro coaching assistant
  const defaultSystemPrompt = `You are a professional branding consultant for SLI.pro, conducting a preliminary conversation with a client before their coaching session. Your goal is to gather essential information that will maximize the effectiveness of their upcoming coaching call.
  
Keep your tone warm and conversational, ask one question at a time, and respond thoughtfully to their answers. Keep all responses very concise - no more than 4-5 lines. Avoid sounding like a scripted survey or AI-generated text.

After gathering insights about their current situation, motivations, and functional direction, briefly summarize what you've learned and ask if they'd like to add anything else that would be helpful for their coach to know before their session.

End by thanking them for their time and explaining that this information will help make their coaching session more productive.`;

  // Get all predefined prompts
  const { data: prompts = [], isLoading: promptsLoading } = useQuery({
    queryKey: ["/api/chat/prompts"],
    queryFn: async () => {
      try {
        const response = await fetch("/api/chat/prompts", {
          credentials: "include"
        });
        if (!response.ok) throw new Error(response.statusText);
        return await response.json();
      } catch (error) {
        console.error("Error fetching prompts:", error);
        return [];
      }
    },
  });

  // Get all conversations
  const { data: conversations = [], isLoading: conversationsLoading } = useQuery({
    queryKey: ["/api/chat/conversations"],
    queryFn: async () => {
      try {
        const response = await fetch("/api/chat/conversations", {
          credentials: "include"
        });
        if (!response.ok) throw new Error(response.statusText);
        return await response.json();
      } catch (error) {
        console.error("Error fetching conversations:", error);
        return [];
      }
    },
  });

  // Get active conversation with messages
  const { data: activeConversation, isLoading: activeConversationLoading } = useQuery({
    queryKey: ["/api/chat/conversations", activeConversationId],
    queryFn: async () => {
      if (!activeConversationId) return null;
      try {
        const response = await fetch(`/api/chat/conversations/${activeConversationId}`, {
          credentials: "include"
        });
        if (!response.ok) throw new Error(response.statusText);
        return await response.json();
      } catch (error) {
        console.error("Error fetching conversation:", error);
        return null;
      }
    },
    enabled: !!activeConversationId,
  });

  // Create a new conversation
  const createConversationMutation = useMutation({
    mutationFn: async (title: string) => {
      const response = await fetch("/api/chat/conversations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title }),
        credentials: "include"
      });
      if (!response.ok) throw new Error(response.statusText);
      return await response.json();
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["/api/chat/conversations"] });
      setActiveConversationId(data.id);
      setIsCreatingConversation(false);
      toast({
        title: "Conversation created",
        description: "Your new conversation has been created.",
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Error",
        description: `Failed to create conversation: ${error.message}`,
        variant: "destructive",
      });
    },
  });

  // Create a new chat prompt
  const createPromptMutation = useMutation({
    mutationFn: async (promptData: { title: string; prompt: string; systemPrompt?: string }) => {
      const response = await fetch("/api/chat/prompts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(promptData),
        credentials: "include"
      });
      if (!response.ok) throw new Error(response.statusText);
      return await response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/chat/prompts"] });
      setIsAddingPrompt(false);
      setNewPromptTitle("");
      setNewPromptContent("");
      setNewPromptSystemPrompt("");
      toast({
        title: "Prompt created",
        description: "Your new prompt has been created successfully.",
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Error",
        description: `Failed to create prompt: ${error.message}`,
        variant: "destructive",
      });
    },
  });

  // Add a message to a conversation
  const addMessageMutation = useMutation({
    mutationFn: async ({
      conversationId,
      content,
    }: {
      conversationId: number;
      content: string;
    }) => {
      const response = await fetch(`/api/chat/conversations/${conversationId}/messages`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ role: "user", content }),
        credentials: "include"
      });
      if (!response.ok) throw new Error(response.statusText);
      return await response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: ["/api/chat/conversations", activeConversationId],
      });
      setMessage("");
    },
    onError: (error: Error) => {
      toast({
        title: "Error",
        description: `Failed to send message: ${error.message}`,
        variant: "destructive",
      });
    },
  });

  // Check if SLI.pro system prompt already exists in database
  useEffect(() => {
    if (prompts.length > 0) {
      const sliProPrompt = prompts.find(p => p.title === "SLI.pro");
      if (!sliProPrompt) {
        // Create the default SLI.pro prompt
        createPromptMutation.mutate({
          title: "SLI.pro",
          prompt: "Act as a professional branding consultant for SLI.pro",
          systemPrompt: defaultSystemPrompt
        });
      }
    }
  }, [prompts, createPromptMutation, defaultSystemPrompt]);

  // Initialize the guided conversation when the chat page loads
  useEffect(() => {
    // Only initialize if in "New Chat" mode and conversation hasn't started yet
    if (!activeConversationId && !conversationInitiated && guidedQuestions.length > 0) {
      // Find the SLI.pro prompt ID to use as default
      const sliProPrompt = prompts.find(p => p.title === "SLI.pro");
      if (sliProPrompt) {
        setSelectedPromptId(sliProPrompt.id);
      }
      
      // Add first question as assistant message to history
      setMessageHistory([{ role: "assistant", content: guidedQuestions[0] }]);
      setConversationInitiated(true);
      setCurrentQuestionNumber(1); // Set to first question
    }
  }, [activeConversationId, conversationInitiated, guidedQuestions, prompts]);
  
  // Auto-scroll to the bottom when messages are added
  useEffect(() => {
    if (messagesEndRef.current) {
      messagesEndRef.current.scrollIntoView({ behavior: "smooth" });
    }
  }, [messageHistory, activeConversation]);
  
  // Direct Claude API call with selected prompt
  const callClaudeMutation = useMutation({
    mutationFn: async ({
      message,
      promptId,
    }: {
      message: string;
      promptId?: number;
    }) => {
      setIsLoading(true);
      try {
        // Add the current message to history for context tracking
        const currentMessageHistory = [...messageHistory];
        
        const response = await fetch("/api/chat/claude", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            message,
            promptId,
            messageHistory: currentMessageHistory, // Send the conversation history
          }),
          credentials: "include"
        });
        if (!response.ok) throw new Error(response.statusText);
        return await response.json();
      } finally {
        setIsLoading(false);
      }
    },
    onSuccess: (data) => {
      setClaudeResponse(data.response);
      
      // Check if the user mentioned business school in their message or response
      const checkForBusinessSchool = () => {
        const lowerMessage = message.toLowerCase();
        const lowerResponse = data.response.toLowerCase();
        return (
          lowerMessage.includes("business school") || 
          lowerMessage.includes("mba") || 
          lowerResponse.includes("business school") || 
          lowerResponse.includes("mba")
        );
      };
      
      // Set flag if business school is mentioned
      if (checkForBusinessSchool()) {
        setMentionedBusinessSchool(true);
      }
      
      // Update the message history with user message and Claude's response
      setMessageHistory(prevHistory => [
        ...prevHistory,
        { role: "user", content: message },
        { role: "assistant", content: data.response }
      ]);
      
      if (!activeConversationId) {
        // Determine which question to ask next
        const determineNextQuestion = () => {
          // If we're at question 3 (index 2) and business school was mentioned but not yet asked about
          if (currentQuestionNumber === 3 && mentionedBusinessSchool && !askedBusinessSchoolQuestion) {
            // Ask the business school specific question
            setTimeout(() => {
              setMessageHistory(prevHistory => [
                ...prevHistory,
                { role: "assistant", content: businessSchoolQuestion }
              ]);
              setAskedBusinessSchoolQuestion(true);
            }, 1000);
            return;
          }
          
          // If we still have standard questions to ask
          if (currentQuestionNumber > 0 && currentQuestionNumber < guidedQuestions.length) {
            setTimeout(() => {
              // Add the next question to the message history
              setMessageHistory(prevHistory => [
                ...prevHistory,
                { role: "assistant", content: guidedQuestions[currentQuestionNumber] }
              ]);
              
              // Increment the question counter
              setCurrentQuestionNumber(currentQuestionNumber + 1);
            }, 1000); // Small delay for better UX
          }
        };
        
        determineNextQuestion();
      }
    },
    onError: (error: Error) => {
      console.error("Claude API error:", error);
      toast({
        title: "Error",
        description: `Failed to get response from Claude: ${error.message}`,
        variant: "destructive",
      });
    },
  });

  const handleSendMessage = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!message.trim()) return;

    if (activeConversationId) {
      addMessageMutation.mutate({
        conversationId: activeConversationId,
        content: message,
      });
    } else {
      // Direct Claude API call with selected prompt
      callClaudeMutation.mutate({
        message,
        promptId: selectedPromptId || undefined,
      });
    }
  };

  const handleCreateConversation = (e: React.FormEvent) => {
    e.preventDefault();
    const title = `Conversation ${conversations.length + 1}`;
    createConversationMutation.mutate(title);
  };

  const handleCreatePrompt = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newPromptTitle.trim() || !newPromptContent.trim()) {
      toast({
        title: "Invalid input",
        description: "Prompt title and content are required.",
        variant: "destructive",
      });
      return;
    }

    createPromptMutation.mutate({
      title: newPromptTitle,
      prompt: newPromptContent,
      systemPrompt: newPromptSystemPrompt || undefined,
    });
  };

  return (
    <div className="container mx-auto py-6">
      <h1 className="text-3xl font-bold mb-8">Chat with Claude AI</h1>

      <div className="grid grid-cols-1 gap-6">
        {/* Chat area */}
        <div className="col-span-1">
          <Card className="h-full flex flex-col">
            <CardHeader>
              <CardTitle>
                {activeConversationId
                  ? activeConversation?.title || "Loading conversation..."
                  : "New Chat"}
              </CardTitle>
              <CardDescription>
                {activeConversationId
                  ? "Continue your conversation with Claude"
                  : "Start a new conversation with Claude"}
              </CardDescription>
            </CardHeader>
            <CardContent className="flex-grow overflow-y-auto">
              {/* Messages display */}
              <ScrollArea className="h-[500px] pr-4">
                {activeConversationId ? (
                  activeConversationLoading ? (
                    <div className="flex items-center justify-center h-full">
                      <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
                    </div>
                  ) : activeConversation?.messages && activeConversation.messages.length > 0 ? (
                    <div className="space-y-4">
                      {activeConversation.messages.map((msg) => (
                        <div
                          key={msg.id}
                          className={`flex ${
                            msg.role === "user" ? "justify-end" : "justify-start"
                          }`}
                        >
                          <div
                            className={`flex items-start max-w-[80%] ${
                              msg.role === "user" ? "flex-row-reverse" : ""
                            }`}
                          >
                            {msg.role === "user" ? (
                              user && (
                                <UserAvatar
                                  firstName={user.firstName}
                                  lastName={user.lastName}
                                  size="small"
                                />
                              )
                            ) : (
                              <Avatar className="h-8 w-8 bg-primary text-white">
                                <AvatarFallback>
                                  <Bot size={16} />
                                </AvatarFallback>
                              </Avatar>
                            )}
                            <div
                              className={`mx-2 p-3 rounded-lg ${
                                msg.role === "user"
                                  ? "bg-primary text-primary-foreground"
                                  : "bg-muted"
                              }`}
                            >
                              <p className="whitespace-pre-wrap break-words">{msg.content}</p>
                              <p className="text-xs opacity-70 mt-1">
                                {new Date(msg.createdAt).toLocaleTimeString()}
                              </p>
                            </div>
                          </div>
                        </div>
                      ))}
                      <div ref={messagesEndRef} />
                    </div>
                  ) : (
                    <div className="flex items-center justify-center h-full text-muted-foreground">
                      <p>No messages yet. Start chatting!</p>
                    </div>
                  )
                ) : (
                  <div className="space-y-4">
                    {messageHistory.length === 0 && !claudeResponse ? (
                      isLoading ? (
                        <div className="flex items-center justify-center h-full mt-20">
                          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
                        </div>
                      ) : (
                        <div className="flex items-center justify-center h-full text-muted-foreground">
                          <div className="text-center space-y-4">
                            <Bot className="h-16 w-16 mx-auto text-muted-foreground" />
                            <p className="text-xl">
                              {selectedPromptId
                                ? "Selected prompt: " +
                                  prompts.find((p) => p.id === selectedPromptId)?.title
                                : "Ask Claude anything"}
                            </p>
                            <p>
                              Claude is an AI assistant developed by Anthropic that can help answer
                              questions, provide insights, and assist with various tasks.
                            </p>
                          </div>
                        </div>
                      )
                    ) : (
                      <>
                        {/* Display all messages from history */}
                        {messageHistory.map((msg, index) => (
                          <div
                            key={index}
                            className={`flex ${
                              msg.role === "user" ? "justify-end" : "justify-start"
                            }`}
                          >
                            <div
                              className={`flex items-start max-w-[80%] ${
                                msg.role === "user" ? "flex-row-reverse" : ""
                              }`}
                            >
                              {msg.role === "user" ? (
                                user && (
                                  <UserAvatar
                                    firstName={user.firstName}
                                    lastName={user.lastName}
                                    size="small"
                                  />
                                )
                              ) : (
                                <Avatar className="h-8 w-8 bg-primary text-white">
                                  <AvatarFallback>
                                    <Bot size={16} />
                                  </AvatarFallback>
                                </Avatar>
                              )}
                              <div
                                className={`mx-2 p-3 rounded-lg ${
                                  msg.role === "user"
                                    ? "bg-primary text-primary-foreground"
                                    : "bg-muted"
                                }`}
                              >
                                <p className="whitespace-pre-wrap break-words">{msg.content}</p>
                              </div>
                            </div>
                          </div>
                        ))}
                        
                        {/* Show current message and response if available but not yet in history */}
                        {claudeResponse && messageHistory.length === 0 && (
                          <>
                            {/* User message */}
                            <div className="flex justify-end">
                              <div className="flex items-start max-w-[80%] flex-row-reverse">
                                {user && (
                                  <UserAvatar
                                    firstName={user.firstName}
                                    lastName={user.lastName}
                                    size="small"
                                  />
                                )}
                                <div className="mx-2 p-3 rounded-lg bg-primary text-primary-foreground">
                                  <p className="whitespace-pre-wrap break-words">{message}</p>
                                </div>
                              </div>
                            </div>

                            {/* Claude response */}
                            <div className="flex justify-start">
                              <div className="flex items-start max-w-[80%]">
                                <Avatar className="h-8 w-8 bg-primary text-white">
                                  <AvatarFallback>
                                    <Bot size={16} />
                                  </AvatarFallback>
                                </Avatar>
                                <div className="mx-2 p-3 rounded-lg bg-muted">
                                  <p className="whitespace-pre-wrap break-words">{claudeResponse}</p>
                                </div>
                              </div>
                            </div>
                          </>
                        )}
                        
                        {/* Show loading indicator during API call */}
                        {isLoading && (
                          <div className="flex justify-center py-4">
                            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                          </div>
                        )}
                        
                        {/* Invisible element at the end to enable auto-scrolling */}
                        <div ref={messagesEndRef} />
                      </>
                    )}
                  </div>
                )}
              </ScrollArea>
            </CardContent>
            <CardFooter>
              <form onSubmit={handleSendMessage} className="w-full flex space-x-2">
                <Input
                  value={message}
                  onChange={(e) => setMessage(e.target.value)}
                  placeholder="Type your message..."
                  disabled={addMessageMutation.isPending || callClaudeMutation.isPending}
                />
                <Button
                  type="submit"
                  disabled={
                    !message.trim() ||
                    addMessageMutation.isPending ||
                    callClaudeMutation.isPending
                  }
                >
                  {(addMessageMutation.isPending || callClaudeMutation.isPending) ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Send className="h-4 w-4" />
                  )}
                </Button>
                {!activeConversationId && claudeResponse && (
                  <Button
                    type="button"
                    variant="outline"
                    onClick={handleCreateConversation}
                    disabled={isCreatingConversation}
                  >
                    {isCreatingConversation ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      "Save as Conversation"
                    )}
                  </Button>
                )}
              </form>
            </CardFooter>
          </Card>
        </div>
      </div>
    </div>
  );
}