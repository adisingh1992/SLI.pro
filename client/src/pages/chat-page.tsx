import React, { useState } from "react";
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
      return await apiRequest("/api/chat/prompts", {
        method: "POST",
        data: promptData,
      });
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
      return await apiRequest(`/api/chat/conversations/${conversationId}/messages`, {
        method: "POST",
        data: { role: "user", content },
      });
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
        const response = await apiRequest("/api/chat/claude", {
          method: "POST",
          data: {
            message,
            promptId,
          },
        });
        return response;
      } finally {
        setIsLoading(false);
      }
    },
    onSuccess: (data) => {
      setClaudeResponse(data.response);
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

      <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
        {/* Left sidebar */}
        <div className="md:col-span-1">
          <Card>
            <CardHeader>
              <CardTitle>Conversations</CardTitle>
              <CardDescription>Start or continue a conversation</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <Button
                variant="outline"
                className="w-full justify-start"
                onClick={() => {
                  setActiveConversationId(null);
                  setClaudeResponse(null);
                }}
              >
                <Plus className="mr-2 h-4 w-4" />
                New Chat
              </Button>

              {conversationsLoading ? (
                <div className="flex items-center justify-center py-4">
                  <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                </div>
              ) : (
                <ScrollArea className="h-[300px]">
                  <div className="space-y-2">
                    {conversations.map((conversation) => (
                      <Button
                        key={conversation.id}
                        variant={
                          activeConversationId === conversation.id ? "default" : "ghost"
                        }
                        className="w-full justify-start"
                        onClick={() => setActiveConversationId(conversation.id)}
                      >
                        <MessageSquare className="mr-2 h-4 w-4" />
                        {conversation.title}
                      </Button>
                    ))}
                  </div>
                </ScrollArea>
              )}
            </CardContent>
          </Card>

          <Card className="mt-6">
            <CardHeader>
              <CardTitle>Prompts</CardTitle>
              <CardDescription>Pre-defined prompts for Claude</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {promptsLoading ? (
                <div className="flex items-center justify-center py-4">
                  <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                </div>
              ) : (
                <>
                  <Select
                    value={selectedPromptId?.toString() || "0"}
                    onValueChange={(value) => setSelectedPromptId(value === "0" ? null : parseInt(value))}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Select a prompt" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="0">No prompt</SelectItem>
                      {prompts.map((prompt) => (
                        <SelectItem key={prompt.id} value={prompt.id.toString()}>
                          {prompt.title}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>

                  <Button
                    variant="outline"
                    className="w-full"
                    onClick={() => setIsAddingPrompt(!isAddingPrompt)}
                  >
                    {isAddingPrompt ? "Cancel" : "Add New Prompt"}
                  </Button>

                  {isAddingPrompt && (
                    <form onSubmit={handleCreatePrompt} className="space-y-3 mt-3">
                      <div>
                        <Label htmlFor="prompt-title">Prompt Title</Label>
                        <Input
                          id="prompt-title"
                          value={newPromptTitle}
                          onChange={(e) => setNewPromptTitle(e.target.value)}
                          placeholder="Enter prompt title"
                          required
                        />
                      </div>
                      <div>
                        <Label htmlFor="prompt-content">Prompt Content</Label>
                        <Textarea
                          id="prompt-content"
                          value={newPromptContent}
                          onChange={(e) => setNewPromptContent(e.target.value)}
                          placeholder="Enter the prompt content here..."
                          rows={4}
                          required
                        />
                      </div>
                      <div>
                        <Label htmlFor="system-prompt">System Prompt (Optional)</Label>
                        <Textarea
                          id="system-prompt"
                          value={newPromptSystemPrompt}
                          onChange={(e) => setNewPromptSystemPrompt(e.target.value)}
                          placeholder="Enter system prompt (optional)"
                          rows={3}
                        />
                      </div>
                      <Button
                        type="submit"
                        className="w-full"
                        disabled={createPromptMutation.isPending}
                      >
                        {createPromptMutation.isPending && (
                          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        )}
                        Save Prompt
                      </Button>
                    </form>
                  )}
                </>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Chat area */}
        <div className="md:col-span-3">
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
                    </div>
                  ) : (
                    <div className="flex items-center justify-center h-full text-muted-foreground">
                      <p>No messages yet. Start chatting!</p>
                    </div>
                  )
                ) : (
                  <div className="space-y-4">
                    {!claudeResponse ? (
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