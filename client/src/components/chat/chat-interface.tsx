import React, { useEffect, useRef, useState } from 'react';
import { useConversation } from '@/hooks/use-conversation';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Separator } from '@/components/ui/separator';
import { ChatMessage } from './chat-message';
import { ChatInput } from './chat-input';
import { ConversationList } from './conversation-list';
import { useIsMobile } from '@/hooks/use-mobile';

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
    streamingResponse
  } = useConversation();
  
  const [showNewChatDialog, setShowNewChatDialog] = useState(false);
  const [newChatTitle, setNewChatTitle] = useState('');
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const isMobile = useIsMobile();
  const [showSidebar, setShowSidebar] = useState(!isMobile);

  // Scroll to bottom when messages change or streaming occurs
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [currentConversation?.messages, streamingResponse]);

  // Hide sidebar on mobile by default
  useEffect(() => {
    setShowSidebar(!isMobile);
  }, [isMobile]);
  
  // Auto-initiate conversation on component mount - using a ref to prevent multiple executions
  const hasInitiatedRef = useRef(false);
  
  useEffect(() => {
    const initiateConversation = async () => {
      try {
        // Only run once and only if we need to create a conversation
        if (!hasInitiatedRef.current && !isLoadingConversations) {
          hasInitiatedRef.current = true;
          
          // If conversations exist but none is selected, select the first one
          if (conversations.length > 0 && !currentConversation) {
            setCurrentConversation(conversations[0].id);
            return;
          }
          
          // If no conversations exist at all, create a new one
          if (conversations.length === 0) {
            console.log("Creating new initial conversation");
            const newConversation = await createConversation('New chat');
            
            // Send an initial welcome message
            if (newConversation && newConversation.id) {
              setTimeout(() => {
                sendMessage("Hello! I'm Claude, your professional branding assistant. How can I help you today?");
              }, 1000);
            }
          }
        }
      } catch (error) {
        console.error("Failed to auto-initiate conversation:", error);
      }
    };

    // Only run if all data is loaded and we haven't initiated yet
    if (!isLoadingConversations && !hasInitiatedRef.current) {
      initiateConversation();
    }
  }, [isLoadingConversations, conversations, currentConversation, createConversation, sendMessage, setCurrentConversation]);

  const handleCreateConversation = async () => {
    if (newChatTitle.trim()) {
      await createConversation(newChatTitle);
      setNewChatTitle('');
      setShowNewChatDialog(false);
    }
  };

  const handleSendMessage = async (content: string) => {
    try {
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
          const newConv = await createConversation('New chat');
          
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
      console.error('Error sending message:', error);
      // Display error to the user (could add toast notification here)
    }
  };

  return (
    <div className="flex h-full border rounded-lg overflow-hidden">
      {/* Conversation sidebar */}
      {showSidebar && (
        <div className="w-64 border-r h-full flex-shrink-0">
          <ConversationList
            conversations={conversations}
            activeConversationId={currentConversation?.conversation?.id || null}
            onSelectConversation={setCurrentConversation}
            onNewConversation={() => setShowNewChatDialog(true)}
          />
        </div>
      )}

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
              {currentConversation?.conversation?.title || 'New Conversation'}
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
              <p className="text-muted-foreground mb-4">No conversation selected</p>
              <Button onClick={() => setShowNewChatDialog(true)}>Start a new conversation</Button>
            </div>
          ) : (
            <div className="space-y-4">
              {currentConversation?.messages?.length > 0 ? (
                currentConversation.messages.map((message) => (
                  <ChatMessage
                    key={message.id}
                    content={message.content}
                    role={message.role}
                  />
                ))
              ) : (
                <div className="text-center text-muted-foreground py-8">
                  <p>This conversation is empty. Start by sending a message.</p>
                </div>
              )}
              
              {/* Streaming message if active */}
              {isProcessing && streamingResponse && (
                <ChatMessage
                  content={streamingResponse}
                  role="assistant"
                  isStreaming={true}
                />
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
            <DialogTitle>New Conversation</DialogTitle>
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
            <Button variant="outline" onClick={() => setShowNewChatDialog(false)}>
              Cancel
            </Button>
            <Button onClick={handleCreateConversation}>
              Create
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}