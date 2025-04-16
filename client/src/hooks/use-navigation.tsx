import React, { createContext, useContext, useState, ReactNode, useCallback } from 'react';
import { useLocation } from 'wouter';
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

type NavigationContextType = {
  navigate: (path: string) => void;
  shouldConfirmNavigation: boolean;
  setShouldConfirmNavigation: (value: boolean) => void;
};

const NavigationContext = createContext<NavigationContextType | null>(null);

export const NavigationProvider = ({ children }: { children: ReactNode }) => {
  const [location, setLocation] = useLocation();
  const [shouldConfirmNavigation, setShouldConfirmNavigation] = useState(false);
  const [showExitDialog, setShowExitDialog] = useState(false);
  const [pendingNavigation, setPendingNavigation] = useState<string | null>(null);

  // Navigation function that will check if confirmation is needed
  const navigate = useCallback((path: string) => {
    if (shouldConfirmNavigation && path !== location) {
      setPendingNavigation(path);
      setShowExitDialog(true);
    } else {
      setLocation(path);
    }
  }, [shouldConfirmNavigation, location, setLocation]);

  // Handle confirm exit
  const handleConfirmExit = useCallback(() => {
    if (pendingNavigation) {
      setLocation(pendingNavigation);
    }
    setShowExitDialog(false);
  }, [pendingNavigation, setLocation]);

  // Handle cancel exit
  const handleCancelExit = useCallback(() => {
    setPendingNavigation(null);
    setShowExitDialog(false);
  }, []);

  return (
    <NavigationContext.Provider value={{
      navigate,
      shouldConfirmNavigation,
      setShouldConfirmNavigation,
    }}>
      {children}
      
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
    </NavigationContext.Provider>
  );
};

export const useNavigation = () => {
  const context = useContext(NavigationContext);
  if (!context) {
    throw new Error('useNavigation must be used within a NavigationProvider');
  }
  return context;
};