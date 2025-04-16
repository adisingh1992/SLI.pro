import React, { useState, useEffect } from 'react';
import { useAuth } from '@/hooks/use-auth';
import { useLocation } from 'wouter';
import { ConversationProvider, useConversation } from '@/hooks/use-conversation';
import { useNavigation } from '@/hooks/use-navigation';
import { ChatInterface } from '@/components/chat/chat-interface';

function ChatPageContent() {
  const { currentConversation, isProcessing } = useConversation();
  const { setShouldConfirmNavigation } = useNavigation();

  // Enable navigation confirmation when needed
  useEffect(() => {
    // Set navigation confirmation if we're processing messages or have conversation content
    const shouldConfirm = isProcessing || (currentConversation && currentConversation.messages.length > 0);
    setShouldConfirmNavigation(shouldConfirm);

    // Always handle browser beforeunload event
    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      if (shouldConfirm) {
        e.preventDefault();
        e.returnValue = '';
        return '';
      }
    };

    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => {
      window.removeEventListener('beforeunload', handleBeforeUnload);
      // Make sure to reset the confirmation when leaving
      setShouldConfirmNavigation(false);
    };
  }, [isProcessing, currentConversation, setShouldConfirmNavigation]);

  return <ChatInterface />;
}

export default function ChatPage() {
  const { user, isLoading } = useAuth();
  const [, setLocation] = useLocation();

  // If authentication is still loading, show a loading indicator
  if (isLoading) {
    return (
      <div className="h-screen flex items-center justify-center">
        <p>Loading...</p>
      </div>
    );
  }

  // If the user is not authenticated, redirect to the login page
  if (!user) {
    setLocation('/auth');
    return null;
  }

  return (
    <div className="container mx-auto h-[calc(100vh-1rem)]">
      <ConversationProvider>
        <ChatPageContent />
      </ConversationProvider>
    </div>
  );
}