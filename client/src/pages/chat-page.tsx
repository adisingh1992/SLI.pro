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
import {
  Loader2,
  Send,
  Plus,
  MessageSquare,
  Bot,
  FileDigit,
} from "lucide-react";
import StructuredSummary from "@/components/structured-summary";
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
  const [sentMessage, setSentMessage] = useState("");
  const [selectedPromptId, setSelectedPromptId] = useState<number | null>(null);
  const [isCreatingConversation, setIsCreatingConversation] = useState(false);
  const [activeConversationId, setActiveConversationId] = useState<
    number | null
  >(null);
  const [newPromptTitle, setNewPromptTitle] = useState("");
  const [newPromptContent, setNewPromptContent] = useState("");
  const [newPromptSystemPrompt, setNewPromptSystemPrompt] = useState("");
  const [isAddingPrompt, setIsAddingPrompt] = useState(false);
  const [claudeResponse, setClaudeResponse] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  // Track message history for context preservation in direct Claude conversations
  const [messageHistory, setMessageHistory] = useState<
    Array<{ role: string; content: string }>
  >([]);
  // Track whether the bot has initiated the conversation
  const [conversationInitiated, setConversationInitiated] = useState(false);
  // Track if the structured summary button should be shown
  const [showSummaryButton, setShowSummaryButton] = useState(false);

  // Reference for auto scrolling
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Function to format message content with clickable links
  const formatMessageWithLinks = (
    content: string,
    isUserMessage: boolean = false,
  ) => {
    // Regex to match URLs
    const urlRegex = /(https?:\/\/[^\s]+)/g;

    if (!content || typeof content !== "string" || !content.match(urlRegex)) {
      return content;
    }

    const parts = [];
    let lastIndex = 0;
    let match;

    // Find all URLs in the content and make them clickable
    while ((match = urlRegex.exec(content)) !== null) {
      // Add text before the URL
      if (match.index > lastIndex) {
        parts.push(content.substring(lastIndex, match.index));
      }

      // Add the URL as a link
      const url = match[0];
      parts.push(
        <a
          key={match.index}
          href={url}
          target="_blank"
          rel="noopener noreferrer"
          className={
            isUserMessage
              ? "text-blue-100 hover:text-white underline"
              : "text-blue-600 hover:text-blue-800 underline"
          }
        >
          {url}
        </a>,
      );

      lastIndex = match.index + url.length;
    }

    // Add any remaining text
    if (lastIndex < content.length) {
      parts.push(content.substring(lastIndex));
    }

    return <>{parts}</>;
  };

  // Removed guided questions as they're no longer needed with the new approach

  // Default system prompt for SLI.pro coaching assistant
  const defaultSystemPrompt = `You are an AI assistant for SLI.pro, a professional branding service. Your purpose is to build upon the client's initial questionnaire responses to gather deeper insights before they meet with their coach, Danielle.

IMPORTANT INSTRUCTION: You must follow a specific sequential process for the conversation. Start with Phase 1 and ONLY move to the next phase after completing the current one. Do not skip phases or jump ahead in the conversation. Ask questions from one phase at a time, waiting for the user to respond before moving on.

The client has already submitted an initial assessment questionnaire with the following information:
- Name: [PULL FROM QUESTIONNAIRE]
- Current/Recent Role: [PULL FROM QUESTIONNAIRE]
- Industry: [PULL FROM QUESTIONNAIRE]
- Function: [PULL FROM QUESTIONNAIRE]
- LinkedIn URL: [PULL FROM QUESTIONNAIRE]
- Top professional branding challenges: [PULL FROM QUESTIONNAIRE]
- Digital presence details: [PULL FROM QUESTIONNAIRE]
- Content creation experience: [PULL FROM QUESTIONNAIRE]
- Target industry/role interests: [PULL FROM QUESTIONNAIRE]

Phase 1: Basic Info Gathering
Begin by introducing yourself and referencing their questionnaire submission. Confirm key information is accurate and explain the purpose of this follow-up conversation. Make sure to communicate:
1. That you've reviewed their initial assessment
2. The purpose of this conversation (diving deeper into specific areas)
3. The time commitment (approximately 30-40 minutes)
4. How the information will be used in their coaching session
Wait for confirmation before moving to Phase 2.

Phase 2: Assessment Status Check (2-3 minutes)
Check whether the client has already submitted specific assessments that are typically part of the SLI.pro process:
"Before we begin, I'd like to confirm which assessments you've already completed:
1. Have you already submitted an Enneagram assessment as part of your SLI.pro process? (Yes/No)
2. Have you submitted any other personality or strengths assessments like Myers-Briggs, StrengthsFinder, or VIA? (Yes/No, and if yes, which ones)"
If they haven't completed the Enneagram assessment, explain its importance and guide them to: https://www.truity.com/test/enneagram-personality-test
Wait for the client's response before moving to Phase 3.

Phase 3: Career Aspirations Deep Dive (7-10 minutes)
Building on the career interests they indicated in their questionnaire, explore their aspirations more deeply. Ask specifically:
1. What specifically attracts them to their mentioned industry/role?
2. How does this direction build on their current expertise?
3. What timeline are they considering for this move?
4. Are they primarily looking to advance within current function, pivot to a new function, change industries, or relocate?
Wait for complete responses before moving to Phase 4.

Phase 4: Functional Clarity Assessment (5-7 minutes)
Help the client gain clarity on their functional identity. Explain:
"For positioning purposes, it's helpful to think about five primary business functions: Finance, Operations, Sales, Marketing, and Product. While many roles blend these areas, identifying your primary functional identity helps create a clearer professional brand."
Ask them to identify their primary functional home, providing details about each function as needed.
Wait for their identification before moving to Phase 5.

Phase 5: Strengths & Differentiation Exploration (7-10 minutes)
Explore what makes them unique professionally by asking:
1. What specific achievements or contributions are they most proud of in their career?
2. What do people consistently come to them for help with?
3. What problems do they solve that others in their organization struggle with?
4. What unique combination of skills or experiences gives them an edge?
Wait for thorough responses before moving to Phase 6.

Phase 6: Aspirational Image Exercise (10 minutes)
Guide them to describe their ideal professional self in detail, then ask them to find 3-5 images that represent aspects of this aspirational self (not business leaders but images that capture qualities, feelings).
Ask them to explain why they chose each image and what it represents about their aspirational self.
Wait for them to complete this exercise before moving to Phase 7.

Phase 7: Forced Ranking Exercise (7-10 minutes)
Help identify their true priorities by:
1. Having them list at least 10 elements they want in their ideal job
2. Systematically comparing each item against every other item (e.g., "Between compensation and work-life balance, which is more important to you?")
3. Presenting the final ranking based on the number of "wins" per item
Wait for the complete exercise to be finished before moving to Phase 8.

Phase 8: Content Creation Potential (5-7 minutes)
Explore their potential for developing thought leadership content by asking:
1. What topics do they feel most confident discussing professionally?
2. What format feels most natural for them to share ideas (writing, speaking, visual content)?
3. What's the primary factor that has held them back from creating more professional content?
Wait for their answers before moving to Phase 9.

Phase 9: Summary & Next Steps (3-5 minutes)
Wrap up by:
1. Summarizing key insights from both their questionnaire and your conversation
2. Explaining how these insights will inform their coaching session
3. Setting expectations for next steps
4. Asking if they have any final questions

Remember: You must complete each phase thoroughly before moving to the next one. Do not skip or combine phases.`;

  // Get all predefined prompts
  const { data: prompts = [], isLoading: promptsLoading } = useQuery({
    queryKey: ["/api/chat/prompts"],
    queryFn: async () => {
      try {
        const response = await fetch("/api/chat/prompts", {
          credentials: "include",
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
  const { data: conversations = [], isLoading: conversationsLoading } =
    useQuery({
      queryKey: ["/api/chat/conversations"],
      queryFn: async () => {
        try {
          const response = await fetch("/api/chat/conversations", {
            credentials: "include",
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
  const { data: activeConversation, isLoading: activeConversationLoading } =
    useQuery({
      queryKey: ["/api/chat/conversations", activeConversationId],
      queryFn: async () => {
        if (!activeConversationId) return null;
        try {
          const response = await fetch(
            `/api/chat/conversations/${activeConversationId}`,
            {
              credentials: "include",
            },
          );
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
        credentials: "include",
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
    mutationFn: async (promptData: {
      title: string;
      prompt: string;
      systemPrompt?: string;
    }) => {
      const response = await fetch("/api/chat/prompts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(promptData),
        credentials: "include",
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
      const response = await fetch(
        `/api/chat/conversations/${conversationId}/messages`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ role: "user", content }),
          credentials: "include",
        },
      );
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
      const sliProPrompt = prompts.find((p: ChatPrompt) => p.title === "SLI.pro");
      if (!sliProPrompt) {
        // Create the default SLI.pro prompt
        createPromptMutation.mutate({
          title: "SLI.pro",
          prompt: "Act as a professional branding consultant for SLI.pro",
          systemPrompt: defaultSystemPrompt,
        });
      }
    }
  }, [prompts, createPromptMutation, defaultSystemPrompt]);

  // Get user profile information
  const { data: userProfile } = useQuery({
    queryKey: ["/api/user/profile"],
    queryFn: async () => {
      try {
        const response = await fetch("/api/user/profile", {
          credentials: "include",
        });
        if (!response.ok) throw new Error(response.statusText);
        return await response.json();
      } catch (error) {
        console.error("Error fetching user profile:", error);
        return null;
      }
    },
    enabled: !!user, // Only fetch if user is logged in
  });

  // Initialize the conversation when the chat page loads with context but let Claude start the conversation
  useEffect(() => {
    // Only initialize if in "New Chat" mode and conversation hasn't started yet
    if (
      !activeConversationId &&
      !conversationInitiated
    ) {
      // Find the SLI.pro prompt ID to use as default
      const sliProPrompt = prompts.find((p: ChatPrompt) => p.title === "SLI.pro");
      if (sliProPrompt) {
        setSelectedPromptId(sliProPrompt.id);
      }

      // Prepare context information for Claude
      let contextIntro = "";

      // Add user information if available
      if (user) {
        contextIntro += `User: ${user.firstName} ${user.lastName}\n\n`;
      }

      // Add questionnaire information if available
      if (userProfile?.questionnaire) {
        const q = userProfile.questionnaire;
        contextIntro += "Questionnaire Responses:\n";
        if (q.industry) contextIntro += `- Industry: ${q.industry}\n`;
        if (q.background) contextIntro += `- Background: ${q.background}\n`;
        if (q.goals) contextIntro += `- Goals: ${q.goals}\n`;
        if (q.aspirations) contextIntro += `- Aspirations: ${q.aspirations}\n`;
        if (q.challenges) contextIntro += `- Challenges: ${q.challenges}\n`;
        if (q.interests) contextIntro += `- Interests: ${q.interests}\n`;
        if (q.timeframe) contextIntro += `- Timeframe: ${q.timeframe}\n`;
        contextIntro += "\n";
      }

      // Add the system context message and trigger Claude to initiate the conversation
      if (contextIntro) {
        // Create a hidden system message with context
        setMessageHistory([
          { role: "system", content: contextIntro }, // This won't be displayed to the user
        ]);
        
        // Automatically trigger Claude to respond with the first message
        setTimeout(() => {
          // Use an empty first message to trigger Claude to start the conversation
          if (callClaudeMutationRef.current) {
            callClaudeMutationRef.current({
              message: "Hi",
              promptId: selectedPromptId || undefined,
            });
          }
        }, 500); // Short delay to ensure state is updated
      }

      setConversationInitiated(true);
    }
  }, [
    activeConversationId,
    conversationInitiated,
    prompts,
    user,
    userProfile,
    selectedPromptId,
    callClaudeMutationRef,
  ]);

  // Auto-scroll to the bottom when messages are added
  useEffect(() => {
    if (messagesEndRef.current) {
      messagesEndRef.current.scrollIntoView({ behavior: "smooth" });
    }
  }, [messageHistory, activeConversation]);
  
  // Define the mutation ref first
  const callClaudeMutationRef = useRef<any>(null);

  // State for streaming response
  const [isStreaming, setIsStreaming] = useState(false);
  const [streamingResponse, setStreamingResponse] = useState("");

  // State for structured summary
  const [showStructuredSummary, setShowStructuredSummary] = useState(false);

  // Enhanced Claude API call with streaming support
  const callClaudeMutation = useMutation({
    mutationFn: async ({
      message,
      promptId,
      useStreaming = true, // Default to streaming for better UX
    }: {
      message: string;
      promptId?: number;
      useStreaming?: boolean;
    }) => {
      setIsLoading(true);
      try {
        // Add the current message to history for context tracking
        const currentMessageHistory = [...messageHistory];

        if (useStreaming) {
          // Use streaming API endpoint for natural conversation flow
          setIsStreaming(true);
          setStreamingResponse("");

          // Set up EventSource for server-sent events
          const response = await fetch("/api/chat/claude/stream", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              message,
              promptId,
              messageHistory: currentMessageHistory,
            }),
            credentials: "include",
          });

          if (!response.ok) throw new Error(response.statusText);
          const reader = response.body?.getReader();
          if (!reader) throw new Error("Failed to get stream reader");

          const decoder = new TextDecoder();
          let fullResponse = "";

          // Process streaming response
          let buffer = "";
          while (true) {
            const { done, value } = await reader.read();
            if (done) break;

            buffer += decoder.decode(value, { stream: true });

            // Process SSE format: data: {...}\n\n
            const lines = buffer.split("\n\n");
            buffer = lines.pop() || "";

            for (const line of lines) {
              if (line.startsWith("data: ")) {
                try {
                  const eventData = JSON.parse(line.slice(6));

                  if (eventData.error) {
                    throw new Error(eventData.error);
                  }

                  if (eventData.chunk) {
                    fullResponse = eventData.fullResponse;
                    setStreamingResponse(fullResponse);
                  }

                  if (eventData.isComplete) {
                    // Streaming complete, return the accumulated response
                    return { response: fullResponse };
                  }
                } catch (e) {
                  console.error("Error parsing SSE data:", e);
                }
              }
            }
          }

          // If we get here, the stream has ended without a completion event
          return { response: fullResponse };
        } else {
          // Use regular (non-streaming) API endpoint for compatibility
          const response = await fetch("/api/chat/claude", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              message,
              promptId,
              messageHistory: currentMessageHistory, // Send the conversation history
            }),
            credentials: "include",
          });
          if (!response.ok) throw new Error(response.statusText);
          return await response.json();
        }
      } finally {
        setIsLoading(false);
        setIsStreaming(false);
      }
    },
    onSuccess: (data) => {
      setClaudeResponse(data.response);

      // Check if we're near the end of the conversation to offer structured summary
      const checkForConversationEnd = () => {
        const lowerResponse = data.response.toLowerCase();
        return (
          lowerResponse.includes("summary") ||
          lowerResponse.includes("wrap up") ||
          lowerResponse.includes("next steps") ||
          lowerResponse.includes("thank you for your time") ||
          lowerResponse.includes("coaching session")
        );
      };

      // Offer structured summary if we detect the conversation is concluding
      if (checkForConversationEnd()) {
        setShowSummaryButton(true);
      }

      // Update the message history with user message (if any) and Claude's response
      setMessageHistory((prevHistory) => {
        // Only add the user message if there was actually a message sent by the user
        // This is to handle the auto-generated first message where we don't want to show "Hi"
        if (sentMessage) {
          return [
            ...prevHistory,
            { role: "user", content: sentMessage },
            { role: "assistant", content: data.response },
          ];
        } else {
          // For the first automated message, just add Claude's response
          return [
            ...prevHistory,
            { role: "assistant", content: data.response },
          ];
        }
      });

      // No need to determine next questions since we're using a free-flowing conversation
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

    // Store current message value before clearing it
    const currentMessage = message;

    // Store message in state variable to display in UI while clearing input
    setSentMessage(currentMessage);

    // Clear the input immediately for better user experience
    setMessage("");

    if (activeConversationId) {
      addMessageMutation.mutate({
        conversationId: activeConversationId,
        content: currentMessage,
      });
    } else {
      // Direct Claude API call with selected prompt
      callClaudeMutation.mutate({
        message: currentMessage,
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

  // Handle button click to generate structured summary at user's request
  const handleSummaryClick = () => {
    // Hide the summary button
    setShowSummaryButton(false);
    
    // Show the structured summary component
    setShowStructuredSummary(true);
    
    // Generate and save the structured summary
    generateStructuredSummary();
  };

  // Function to automatically generate and save structured summary
  const generateStructuredSummary = async () => {
    if (!user || messageHistory.length === 0) return;

    try {
      // Call the structured summary API endpoint
      const response = await fetch("/api/chat/structured-summary", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          conversationId: activeConversationId,
          messageHistory,
          userProfile,
          saveToDatabase: true, // Flag to indicate we want to save the summary to the database
        }),
        credentials: "include",
      });

      if (!response.ok) {
        throw new Error("Failed to generate structured summary");
      }

      // No need to show the summary or update UI since we're just saving it
      console.log("Successfully generated and saved structured summary");
    } catch (error) {
      console.error("Error generating structured summary:", error);
      // We don't show an error toast since this happens in the background
    }
  };

  return (
    <div className="container mx-auto">
      <div className="grid grid-cols-1 gap-6">
        {/* Chat area */}
        <div className="col-span-1">
          <Card className="h-full flex flex-col shadow-lg border-2">
            <CardHeader className="bg-gradient-to-r from-primary/10 to-primary/5">
              <CardTitle className="flex items-center gap-2">
                <Avatar className="h-8 w-8 bg-primary text-white">
                  <AvatarFallback>
                    <Bot size={16} />
                  </AvatarFallback>
                </Avatar>
                {activeConversationId
                  ? activeConversation?.title || "Loading conversation..."
                  : "SLI.pro"}
              </CardTitle>
              <CardDescription>
                {activeConversationId
                  ? "Continue your conversation with SLI.pro"
                  : "Please answer a few questions before scheduling your coaching session"}
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
                  ) : activeConversation?.messages &&
                    activeConversation.messages.length > 0 ? (
                    <div className="space-y-4">
                      {activeConversation.messages.map((msg: any) => (
                        <div
                          key={msg.id}
                          className={`flex ${
                            msg.role === "user"
                              ? "justify-end"
                              : "justify-start"
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
                              className={`mx-2 p-3 rounded-lg shadow-sm ${
                                msg.role === "user"
                                  ? "bg-primary text-primary-foreground"
                                  : "bg-muted"
                              }`}
                            >
                              <div className="whitespace-pre-wrap break-words">
                                {formatMessageWithLinks(
                                  msg.content,
                                  msg.role === "user",
                                )}
                              </div>
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
                              Welcome to your SLI.pro coaching preparation
                            </p>
                            <p className="mt-2">
                              I'm your professional branding consultant. I'll
                              help prepare for your coaching session by
                              discussing your career goals and professional
                              experience.
                            </p>
                          </div>
                        </div>
                      )
                    ) : (
                      <>
                        {/* Display all messages from history (except system messages) */}
                        {messageHistory
                          .filter((msg) => msg.role !== "system")
                          .map((msg, index) => (
                            <div
                              key={index}
                              className={`flex ${
                                msg.role === "user"
                                  ? "justify-end"
                                  : "justify-start"
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
                                  className={`mx-2 p-3 rounded-lg shadow-sm ${
                                    msg.role === "user"
                                      ? "bg-primary text-primary-foreground"
                                      : "bg-muted"
                                  }`}
                                >
                                  <div className="whitespace-pre-wrap break-words">
                                    {formatMessageWithLinks(
                                      msg.content,
                                      msg.role === "user",
                                    )}
                                  </div>
                                </div>
                              </div>
                            </div>
                          ))}

                        {/* Show current message and response if available but not yet in history */}
                        {(claudeResponse ||
                          (isStreaming && streamingResponse)) &&
                          messageHistory.length === 0 && (
                            <>
                              {/* User message - only show if there's an actual user message */}
                              {sentMessage && (
                                <div className="flex justify-end">
                                  <div className="flex items-start max-w-[80%] flex-row-reverse">
                                    {user && (
                                      <UserAvatar
                                        firstName={user.firstName}
                                        lastName={user.lastName}
                                        size="small"
                                      />
                                    )}
                                    <div className="mx-2 p-3 rounded-lg shadow-sm bg-primary text-primary-foreground">
                                      <div className="whitespace-pre-wrap break-words">
                                        {formatMessageWithLinks(
                                          sentMessage,
                                          true,
                                        )}
                                      </div>
                                    </div>
                                  </div>
                                </div>
                              )}

                              {/* Claude response - either final or streaming */}
                              <div className="flex justify-start">
                                <div className="flex items-start max-w-[80%]">
                                  <Avatar className="h-8 w-8 bg-primary text-white">
                                    <AvatarFallback>
                                      <Bot size={16} />
                                    </AvatarFallback>
                                  </Avatar>
                                  <div className="mx-2 p-3 rounded-lg shadow-sm bg-muted">
                                    <div className="whitespace-pre-wrap break-words">
                                      {isStreaming ? (
                                        // Streaming response with cursor effect
                                        <>
                                          {formatMessageWithLinks(
                                            streamingResponse,
                                            false,
                                          )}
                                          <span className="animate-pulse">
                                            ▌
                                          </span>
                                        </>
                                      ) : (
                                        // Final response
                                        formatMessageWithLinks(
                                          claudeResponse || "",
                                          false,
                                        )
                                      )}
                                    </div>
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

                        {/* Show Summary button when the conversation reaches a logical end point */}
                        {showSummaryButton && !activeConversationId && (
                          <div className="flex justify-center mt-6 mb-2">
                            <Button
                              onClick={handleSummaryClick}
                              className="bg-primary hover:bg-primary/90"
                            >
                              Generate Structured Summary
                            </Button>
                          </div>
                        )}

                        {/* Display the structured summary when requested */}
                        {showStructuredSummary && (
                          <div className="mt-6 mb-2">
                            <StructuredSummary
                              messageHistory={messageHistory}
                              userProfile={userProfile}
                              onClose={() => setShowStructuredSummary(false)}
                            />
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
            <CardFooter className="border-t pt-4">
              <form
                onSubmit={handleSendMessage}
                className="w-full flex flex-col space-y-3"
              >
                <div className="relative">
                  <Textarea
                    value={message}
                    onChange={(e) => setMessage(e.target.value)}
                    placeholder="Type your message..."
                    disabled={
                      addMessageMutation.isPending ||
                      callClaudeMutation.isPending
                    }
                    className="min-h-[80px] resize-none pr-12"
                    onKeyDown={(e) => {
                      if (e.key === "Enter" && !e.shiftKey) {
                        e.preventDefault();
                        if (message.trim()) {
                          handleSendMessage(e);
                        }
                      }
                    }}
                  />
                  <Button
                    type="submit"
                    size="icon"
                    className="absolute bottom-2 right-2"
                    disabled={
                      !message.trim() ||
                      addMessageMutation.isPending ||
                      callClaudeMutation.isPending
                    }
                  >
                    {addMessageMutation.isPending ||
                    callClaudeMutation.isPending ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <Send className="h-4 w-4" />
                    )}
                  </Button>
                </div>

                <div className="flex justify-between items-center text-xs text-muted-foreground">
                  <p>Press Shift+Enter for a new line</p>

                  {!activeConversationId && claudeResponse && (
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={handleCreateConversation}
                      disabled={isCreatingConversation}
                    >
                      {isCreatingConversation ? (
                        <Loader2 className="h-4 w-4 animate-spin mr-2" />
                      ) : (
                        "Save as Conversation"
                      )}
                    </Button>
                  )}
                </div>
              </form>
            </CardFooter>
          </Card>
        </div>
      </div>
    </div>
  );
}
