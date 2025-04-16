import React from 'react';
import { useAuth } from '@/hooks/use-auth';
import { useLocation } from 'wouter';
import { ConversationProvider } from '@/hooks/use-conversation';
import { ChatInterface } from '@/components/chat/chat-interface';

export default function ChatPage() {
  const { user, isLoading } = useAuth();

  // If authentication is still loading, show a loading indicator
  if (isLoading) {
    return (
      <div className="h-screen flex items-center justify-center">
        <p>Loading...</p>
      </div>
    );
  }

  // If the user is not authenticated, redirect to the login page
  const [, setLocation] = useLocation();
  if (!user) {
    setLocation('/auth');
    return null;
  }

  return (
    <div className="container mx-auto py-8 h-[calc(100vh-8rem)]">
      <ConversationProvider>
        <ChatInterface />
      </ConversationProvider>
    </div>
  );
}