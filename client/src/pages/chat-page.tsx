import React, { useState, useEffect } from 'react';
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
  const [showExitDialog, setShowExitDialog] = useState(false);
  const [location, navigate] = useLocation();
  const [pendingNavigation, setPendingNavigation] = useState<string | null>(null);
  const { currentConversation, isProcessing } = useConversation();

  // Handle navigation - show dialog if we're in the middle of a conversation
  useEffect(() => {
    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      // If we're processing a message, warn before leaving
      if (isProcessing || (currentConversation && currentConversation.messages.length > 0)) {
        e.preventDefault();
        e.returnValue = '';
        return '';
      }
    };

    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => {
      window.removeEventListener('beforeunload', handleBeforeUnload);
    };
  }, [isProcessing, currentConversation]);

  // Handle internal navigation
  const handleNavigation = (path: string) => {
    // If we're processing or have messages, show confirmation
    if (isProcessing || (currentConversation && currentConversation.messages.length > 0)) {
      setPendingNavigation(path);
      setShowExitDialog(true);
    } else {
      // Otherwise, navigate directly
      navigate(path);
    }
  };

  // Override all link clicks to use our custom navigation
  useEffect(() => {
    const handleClick = (e: MouseEvent) => {
      // Find closest anchor tag
      const anchor = (e.target as HTMLElement).closest('a');
      if (!anchor) return;
      
      // Only intercept links that are internal to our app
      const href = anchor.getAttribute('href');
      if (!href || href.startsWith('http') || href.startsWith('mailto')) return;
      
      // Prevent default and handle navigation
      e.preventDefault();
      handleNavigation(href);
    };

    document.addEventListener('click', handleClick);
    return () => {
      document.removeEventListener('click', handleClick);
    };
  }, [isProcessing, currentConversation]);

  // Handle confirmation
  const handleConfirmExit = () => {
    if (pendingNavigation) {
      navigate(pendingNavigation);
    }
    setShowExitDialog(false);
  };

  // Handle cancel
  const handleCancelExit = () => {
    setPendingNavigation(null);
    setShowExitDialog(false);
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
            <AlertDialogCancel onClick={handleCancelExit}>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleConfirmExit}>Okay</AlertDialogAction>
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