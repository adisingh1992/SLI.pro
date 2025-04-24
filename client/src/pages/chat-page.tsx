import React, { useState, useEffect, useCallback } from 'react';
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
    // Handle browser's beforeunload event (closing tab/window/reloading)
    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      // Check if we have an active conversation or processing
      if (isProcessing || (currentConversation && currentConversation.messages.length > 0)) {
        // Try to generate a summary
        if (currentConversation && currentConversation.messages.length >= 4) {
          // Use a synchronous fetch for beforeunload
          // This is a best-effort attempt, as the page is about to unload
          // We're using the sync version which is deprecated but works for this use case
          try {
            const xhr = new XMLHttpRequest();
            xhr.open('POST', `/api/conversations/${currentConversation.conversation.id}/summary`, false);
            xhr.setRequestHeader('Content-Type', 'application/json');
            xhr.send();
            console.log("Summary generation triggered on page unload");
          } catch (error) {
            console.error("Error generating summary on unload:", error);
          }
        }
        
        // Standard approach to show browser's built-in confirmation dialog
        e.preventDefault();
        
        // Required for older browsers
        const confirmationMessage = 'You have an active conversation. Are you sure you want to leave?';
        e.returnValue = confirmationMessage;
        
        // This message will be shown in some browsers (like Chrome)
        return confirmationMessage;
      }
    };

    // Handle browser's back/forward navigation
    const handlePopState = (e: PopStateEvent) => {
      if (isProcessing || (currentConversation && currentConversation.messages.length > 0)) {
        // This will prevent the automatic navigation
        e.preventDefault();
        
        // Save the current URL so we can restore it
        const currentUrl = window.location.pathname;
        
        // Show confirmation dialog
        setShowExitDialog(true);
        
        // Push the current URL back to the history to cancel the navigation
        window.history.pushState(null, '', currentUrl);
        
        return false;
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
    window.addEventListener('popstate', handlePopState);
    document.addEventListener('click', handleLinkClick, true);
    
    // Save the current history state when the component mounts
    const currentUrl = window.location.pathname;
    window.history.replaceState({ chatPage: true }, '', currentUrl);
    
    return () => {
      window.removeEventListener('beforeunload', handleBeforeUnload);
      window.removeEventListener('popstate', handlePopState);
      document.removeEventListener('click', handleLinkClick, true);
    };
  }, [currentConversation, isProcessing, navigate]);

  // Generate a summary when the conversation is complete
  const generateSummary = useCallback(async () => {
    if (!currentConversation || currentConversation.messages.length < 4) {
      // Don't generate summaries for very short conversations
      console.log("Conversation too short for summary generation");
      return;
    }
    
    try {
      console.log("Generating summary for conversation", currentConversation.conversation.id);
      // Call the API to generate a summary
      await fetch(`/api/conversations/${currentConversation.conversation.id}/summary`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        credentials: 'include'
      });
      console.log("Summary generation request sent");
    } catch (error) {
      console.error("Error generating conversation summary:", error);
    }
  }, [currentConversation]);

  // Handle confirmation dialog responses
  const handleConfirm = async () => {
    if (currentConversation && currentConversation.messages.length > 0) {
      // Generate a summary before navigating away
      await generateSummary();
    }
    
    if (pendingPath) {
      // If we have a stored path, navigate to it
      navigate(pendingPath);
    } else {
      // This was likely a back button press, go back in browser history
      window.history.back();
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