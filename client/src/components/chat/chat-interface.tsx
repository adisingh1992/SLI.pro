import React, { useEffect, useRef, useState, useCallback } from "react";
import { useConversation } from "@/hooks/use-conversation";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Separator } from "@/components/ui/separator";
import { ChatMessage } from "./chat-message";
import { ChatInput } from "./chat-input";
import { ConversationList } from "./conversation-list";
import { useIsMobile } from "@/hooks/use-mobile";

export function ChatInterface() {
  const {
    conversations,
    currentConversation,
    isLoadingConversations,
    isLoadingMessages,
    createConversation,
    setCurrentConversation,
    sendMessage,
    isProcessing,
    streamingResponse,
  } = useConversation();

  // Track all messages, including those from the API and streaming
  const [allMessages, setAllMessages] = useState<
    Array<{
      id?: number;
      content: string;
      role: "user" | "assistant";
      isStreaming?: boolean;
    }>
  >([]);

  const [showNewChatDialog, setShowNewChatDialog] = useState(false);
  const [newChatTitle, setNewChatTitle] = useState("");
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const isMobile = useIsMobile();
  const [showSidebar, setShowSidebar] = useState(!isMobile);
  
  // Keep track of conversation completion status
  const [hasGeneratedSummary, setHasGeneratedSummary] = useState(false);

  // Keep track of the last seen conversation ID to prevent data loss
  const lastConversationIdRef = useRef<number | null>(null);

  // Update all messages when conversation changes, but preserve streaming state
  useEffect(() => {
    if (currentConversation && currentConversation.messages) {
      const conversationId = currentConversation.conversation?.id;

      // Skip initial load or if it's the same conversation
      if (lastConversationIdRef.current === conversationId) {
        return;
      }

      // Different conversation was loaded, update ref
      lastConversationIdRef.current = conversationId;
      
      // Reset summary generation status for the new conversation
      setHasGeneratedSummary(false);

      // If we're not actively streaming, replace all messages
      if (!isProcessing) {
        console.log(
          "Replacing all messages with conversation data",
          conversationId,
        );
        setAllMessages(
          currentConversation.messages.map((message) => ({
            id: message.id,
            content: message.content,
            role: message.role as "user" | "assistant",
          })),
        );
      } else {
        console.log("Not replacing messages while processing", isProcessing);
      }
    }
  }, [currentConversation, isProcessing]);

  // Add streaming message to the allMessages array
  useEffect(() => {
    if (isProcessing && streamingResponse) {
      // Check if we already have a streaming message at the end
      if (
        allMessages.length > 0 &&
        allMessages[allMessages.length - 1].isStreaming
      ) {
        // Update the existing streaming message
        setAllMessages((prev) => [
          ...prev.slice(0, prev.length - 1),
          { content: streamingResponse, role: "assistant", isStreaming: true },
        ]);
      } else {
        // Add a new streaming message
        setAllMessages((prev) => [
          ...prev,
          { content: streamingResponse, role: "assistant", isStreaming: true },
        ]);
      }
    }
  }, [streamingResponse, isProcessing, allMessages]);
  
  // Check for conversation completion and generate summary if needed
  const checkForConversationCompletion = useCallback(async () => {
    // Only run if we have a conversation, it has sufficient messages, and we haven't generated a summary yet
    if (!currentConversation || 
        !currentConversation.conversation ||
        currentConversation.messages.length < 4 ||
        hasGeneratedSummary) {
      return;
    }
    
    // Check if the conversation has progressed through all phases (9 phases in total)
    // Look for phase completion markers in the assistant's messages
    const assistantMessages = currentConversation.messages.filter(m => m.role === 'assistant');
    const lastAssistantMessage = assistantMessages[assistantMessages.length - 1];
    
    // Look for markers indicating completion of Phase 9 (final phase)
    if (lastAssistantMessage && 
        (lastAssistantMessage.content.includes("Phase 9: Summary") || 
         lastAssistantMessage.content.includes("Thank you for your time today") ||
         lastAssistantMessage.content.includes("This completes our assessment"))) {
      
      console.log("Conversation appears to be complete, generating summary");
      
      try {
        // Mark as generated so we don't try again
        setHasGeneratedSummary(true);
        
        // Call the API to generate a summary
        const response = await fetch(`/api/conversations/${currentConversation.conversation.id}/summary`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          credentials: 'include'
        });
        
        if (response.ok) {
          console.log("Successfully generated summary for completed conversation");
        } else {
          console.error("Failed to generate summary:", await response.text());
        }
      } catch (error) {
        console.error("Error generating conversation summary:", error);
      }
    }
  }, [currentConversation, hasGeneratedSummary]);
  
  // Run the completion check whenever messages change
  useEffect(() => {
    if (!isProcessing && currentConversation) {
      checkForConversationCompletion();
    }
  }, [isProcessing, currentConversation, checkForConversationCompletion]);

  // Scroll to bottom when messages change
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [allMessages]);

  // Hide sidebar on mobile by default
  useEffect(() => {
    setShowSidebar(!isMobile);
  }, [isMobile]);

  // Auto-initiate conversation on component mount - using a ref to prevent multiple executions
  const hasInitiatedRef = useRef(false);
  const hasAutoSentRef = useRef(false);

  // First effect: Initialize or select a conversation
  useEffect(() => {
    const initializeConversation = async () => {
      try {
        if (hasInitiatedRef.current) return;

        // Skip if conversations are still loading
        if (isLoadingConversations) return;

        console.log("Checking if we need to initialize a conversation");
        hasInitiatedRef.current = true;

        // If conversations exist but none is selected, select the first one
        if (conversations.length > 0) {
          console.log("Selecting first conversation:", conversations[0].id);
          setCurrentConversation(conversations[0].id);
          return;
        }

        // If no conversations exist, create one
        if (conversations.length === 0) {
          console.log("Creating a new initial conversation");
          await createConversation("New chat");
          // The queryClient invalidation will trigger the conversations to reload
        }
      } catch (error) {
        console.error("Failed to initialize conversation:", error);
      }
    };

    initializeConversation();
  }, [
    isLoadingConversations,
    conversations,
    createConversation,
    setCurrentConversation,
  ]);

  // Second effect: Send a welcome message after conversation is selected/created
  useEffect(() => {
    const sendWelcomeMessage = async () => {
      try {
        // Only send welcome message if we have a valid conversation and haven't sent one yet
        if (
          hasAutoSentRef.current ||
          !currentConversation ||
          !currentConversation.conversation
        ) {
          return;
        }

        // Only send if the conversation is empty (no messages yet)
        if (currentConversation.messages.length === 0) {
          console.log(
            "Sending welcome message to conversation:",
            currentConversation.conversation.id,
          );
          hasAutoSentRef.current = true;

          // Small delay to ensure UI is ready
          setTimeout(async () => {
            try {
              await sendMessage(
                "Hello! I'm Claude, your professional branding assistant. How can I help you today?",
              );
            } catch (err) {
              console.error("Error sending welcome message:", err);
            }
          }, 1000);
        } else {
          // If there are already messages, mark as sent
          hasAutoSentRef.current = true;
        }
      } catch (error) {
        console.error("Failed to send welcome message:", error);
      }
    };

    // Only try to send welcome if the conversation is loaded and not loading
    if (!isLoadingMessages && currentConversation) {
      sendWelcomeMessage();
    }
  }, [currentConversation, isLoadingMessages, sendMessage]);

  const handleCreateConversation = async () => {
    if (newChatTitle.trim()) {
      await createConversation(newChatTitle);
      setNewChatTitle("");
      setShowNewChatDialog(false);
    }
  };

  const handleSendMessage = async (content: string) => {
    try {
      // Always add the user message to our local messages state immediately
      // This ensures it doesn't disappear even if there's an API error
      setAllMessages((prev) => [...prev, { content, role: "user" }]);

      // Make sure we have a current conversation before sending
      if (!currentConversation || !currentConversation.conversation) {
        // If we have conversations but none selected, select the first one
        if (conversations.length > 0) {
          setCurrentConversation(conversations[0].id);
          // We need to wait for the conversation to be selected
          // Let the user try again - the UI should update
          return;
        } else {
          // If no conversation exists at all, create one first
          console.log("Creating a new conversation for message");
          const newConv = await createConversation("New chat");

          // Now we can send the message using the new conversation
          if (newConv) {
            return sendMessage(content);
          }
        }
      } else {
        // Normal case - we have a conversation, just send the message
        await sendMessage(content);
      }
    } catch (error) {
      console.error("Error sending message:", error);
      // Display error to the user (could add toast notification here)
    }
  };

  return (
    <div className="flex h-full border rounded-lg overflow-hidden">
      {/* Conversation sidebar */}
      {/* {showSidebar && (
        <div className="w-64 border-r h-full flex-shrink-0">
          <ConversationList
            conversations={conversations}
            activeConversationId={currentConversation?.conversation?.id || null}
            onSelectConversation={setCurrentConversation}
            onNewConversation={() => setShowNewChatDialog(true)}
          />
        </div>
      )} */}

      {/* Main chat area */}
      <div className="flex-1 flex flex-col h-full">
        {/* Chat header */}
        <div className="p-4 border-b flex justify-between items-center">
          <div className="flex items-center">
            {isMobile && (
              <Button
                variant="ghost"
                size="icon"
                onClick={() => setShowSidebar(!showSidebar)}
                className="mr-2"
              >
                ☰
              </Button>
            )}
            <h2 className="text-xl font-semibold">
              {currentConversation?.conversation?.title || "SLI.pro"}
            </h2>
          </div>
        </div>

        {/* Messages area */}
        <ScrollArea className="flex-1 p-4">
          {isLoadingMessages ? (
            <div className="h-full flex items-center justify-center">
              <p className="text-muted-foreground">Loading messages...</p>
            </div>
          ) : !currentConversation ? (
            <div className="h-full flex flex-col items-center justify-center">
              <p className="text-muted-foreground mb-4">
                No conversation selected
              </p>
              <Button onClick={() => setShowNewChatDialog(true)}>
                Start a new conversation
              </Button>
            </div>
          ) : (
            <div className="space-y-4">
              {allMessages.length > 0 ? (
                allMessages.map((message, index) => (
                  <ChatMessage
                    key={message.id || `temp-message-${index}`}
                    content={message.content}
                    role={message.role}
                    isStreaming={message.isStreaming}
                  />
                ))
              ) : (
                <div className="text-center text-muted-foreground py-8">
                  <p>SLI.pro is thinking, please wait..</p>
                </div>
              )}

              <div ref={messagesEndRef} />
            </div>
          )}
        </ScrollArea>

        {/* Input area */}
        <ChatInput
          onSendMessage={handleSendMessage}
          isDisabled={isProcessing || isLoadingMessages}
        />
      </div>

      {/* New conversation dialog */}
      <Dialog open={showNewChatDialog} onOpenChange={setShowNewChatDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>SLI.pro</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Input
                placeholder="Enter conversation title"
                value={newChatTitle}
                onChange={(e) => setNewChatTitle(e.target.value)}
              />
            </div>
          </div>
          <div className="flex justify-end gap-2">
            <Button
              variant="outline"
              onClick={() => setShowNewChatDialog(false)}
            >
              Cancel
            </Button>
            <Button onClick={handleCreateConversation}>Create</Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
