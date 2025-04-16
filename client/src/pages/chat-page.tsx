import React, { useState, useEffect, useRef } from 'react';
import { useAuth } from '@/hooks/use-auth';
import { useLocation } from 'wouter';
import { ConversationProvider, useConversation } from '@/hooks/use-conversation';
import { ChatInterface } from '@/components/chat/chat-interface';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle
} from '@/components/ui/alert-dialog';

function ChatPageContent() {
  const { currentConversation, isProcessing } = useConversation();
  const [showExitDialog, setShowExitDialog] = useState(false);
  const [pendingPath, setPendingPath] = useState<string | null>(null);
  const [, navigate] = useLocation();

  // Override the window navigation to show our confirmation dialog when needed
  useEffect(() => {
    // Handle browser's beforeunload event (closing tab/window)
    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      if (isProcessing || (currentConversation && currentConversation.messages.length > 0)) {
        e.preventDefault();
        e.returnValue = '';
        return '';
      }
    };

    // Override all navigation link clicks
    const handleLinkClick = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      const link = target.closest('a');
      
      if (!link) return;
      
      const href = link.getAttribute('href');
      if (!href || href.startsWith('http') || href.startsWith('mailto')) return;
      
      // If we have an active conversation, show confirmation
      if (isProcessing || (currentConversation && currentConversation.messages.length > 0)) {
        e.preventDefault();
        setPendingPath(href);
        setShowExitDialog(true);
      }
    };

    // Add event listeners
    window.addEventListener('beforeunload', handleBeforeUnload);
    document.addEventListener('click', handleLinkClick, true);
    
    return () => {
      window.removeEventListener('beforeunload', handleBeforeUnload);
      document.removeEventListener('click', handleLinkClick, true);
    };
  }, [currentConversation, isProcessing]);

  // Handle confirmation dialog responses
  const handleConfirm = () => {
    if (pendingPath) {
      originalNavigateRef.current(pendingPath);
    }
    setShowExitDialog(false);
    setPendingPath(null);
  };

  const handleCancel = () => {
    setShowExitDialog(false);
    setPendingPath(null);
  };

  return (
    <>
      <ChatInterface />
      
      <AlertDialog open={showExitDialog} onOpenChange={setShowExitDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Leave the conversation?</AlertDialogTitle>
            <AlertDialogDescription>
              If you leave this page, your conversation progress will be lost. Are you sure you want to exit?
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={handleCancel}>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleConfirm}>Okay</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
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