import { createContext, useContext, useState, ReactNode, useCallback } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiRequest } from '@/lib/queryClient';

type Message = {
  id: number;
  conversationId: number;
  role: 'user' | 'assistant';
  content: string;
  createdAt: string;
};

type Conversation = {
  id: number;
  title: string;
  userId: number;
  createdAt: string;
  updatedAt: string;
};

type ConversationWithMessages = {
  conversation: Conversation;
  messages: Message[];
};

type ConversationContextType = {
  conversations: Conversation[];
  currentConversation: ConversationWithMessages | null;
  isLoadingConversations: boolean;
  isLoadingMessages: boolean;
  error: Error | null;
  createConversation: (title: string) => Promise<Conversation>;
  setCurrentConversation: (conversationId: number) => void;
  sendMessage: (content: string) => Promise<void>;
  isProcessing: boolean;
  streamingResponse: string;
};

const ConversationContext = createContext<ConversationContextType | null>(null);

export const ConversationProvider = ({ children }: { children: ReactNode }) => {
  const [currentConversationId, setCurrentConversationId] = useState<number | null>(null);
  const [streamingResponse, setStreamingResponse] = useState<string>('');
  const [isProcessing, setIsProcessing] = useState<boolean>(false);
  const queryClient = useQueryClient();

  // Fetch all conversations
  const { data: conversations, isLoading: isLoadingConversations, error: conversationsError } = useQuery({
    queryKey: ['/api/conversations'],
    queryFn: async () => {
      const response = await fetch('/api/conversations');
      if (!response.ok) {
        throw new Error('Failed to fetch conversations');
      }
      return response.json();
    },
    enabled: true,
  });

  // Fetch current conversation with messages
  const { data: currentConversation, isLoading: isLoadingMessages, error: messagesError } = useQuery({
    queryKey: ['/api/conversations', currentConversationId],
    queryFn: async () => {
      if (!currentConversationId) return null;
      const response = await fetch(`/api/conversations/${currentConversationId}`);
      if (!response.ok) {
        throw new Error('Failed to fetch conversation messages');
      }
      return response.json();
    },
    enabled: !!currentConversationId,
  });

  // Create a new conversation
  const createConversationMutation = useMutation({
    mutationFn: async (title: string) => {
      return apiRequest('/api/conversations', 'POST', { title });
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['/api/conversations'] });
      setCurrentConversationId(data.id);
    },
    onError: (error: Error) => {
      console.error('Error creating conversation:', error);
    },
  });

  // Send a message and get non-streaming response
  const sendMessageMutation = useMutation({
    mutationFn: async ({ conversationId, content }: { conversationId: number, content: string }) => {
      return apiRequest(`/api/conversations/${conversationId}/messages`, 'POST', { content });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/conversations', currentConversationId] });
    },
    onError: (error: Error) => {
      console.error('Error sending message:', error);
    },
  });

  // Send a message with streaming response
  const sendStreamingMessage = useCallback(async (conversationId: number, content: string) => {
    setIsProcessing(true);
    setStreamingResponse('');
    
    try {
      // First, create a new EventSource connection
      const response = await fetch(`/api/conversations/${conversationId}/messages/stream`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ content }),
      });
      
      if (!response.body) {
        throw new Error('ReadableStream not supported');
      }
      
      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      
      let done = false;
      let accumulatedData = '';
      
      while (!done) {
        const { value, done: readerDone } = await reader.read();
        done = readerDone;
        
        if (done) {
          break;
        }
        
        const text = decoder.decode(value);
        accumulatedData += text;
        
        // Process SSE data
        const lines = accumulatedData.split('\n\n');
        
        for (let i = 0; i < lines.length - 1; i++) {
          const line = lines[i];
          if (line.startsWith('data: ')) {
            try {
              const eventData = JSON.parse(line.substring(6));
              
              if (eventData.type === 'chunk') {
                setStreamingResponse(prev => prev + eventData.content);
              } else if (eventData.type === 'completed') {
                // Event stream is complete, invalidate queries to refresh the UI
                queryClient.invalidateQueries({ queryKey: ['/api/conversations', currentConversationId] });
              } else if (eventData.type === 'error') {
                console.error('Error from server:', eventData.message);
              }
            } catch (e) {
              console.error('Error parsing event data:', e);
            }
          }
        }
        
        // Keep any remaining data that didn't form a complete SSE message
        accumulatedData = lines[lines.length - 1];
      }
    } catch (error) {
      console.error('Error with streaming message:', error);
    } finally {
      setIsProcessing(false);
      // Refresh the conversation data once streaming is complete
      queryClient.invalidateQueries({ queryKey: ['/api/conversations', currentConversationId] });
    }
  }, [currentConversationId, queryClient]);

  // Create a new conversation
  const createConversation = async (title: string) => {
    return createConversationMutation.mutateAsync(title);
  };

  // Set the current conversation by ID
  const setCurrentConversation = (conversationId: number) => {
    setCurrentConversationId(conversationId);
  };

  // Send a message (using streaming by default)
  const sendMessage = async (content: string) => {
    if (!currentConversationId) {
      throw new Error('No active conversation');
    }
    
    // Use streaming response
    await sendStreamingMessage(currentConversationId, content);
  };

  return (
    <ConversationContext.Provider
      value={{
        conversations: conversations || [],
        currentConversation: currentConversation || null,
        isLoadingConversations,
        isLoadingMessages,
        error: conversationsError || messagesError || null,
        createConversation,
        setCurrentConversation,
        sendMessage,
        isProcessing,
        streamingResponse,
      }}
    >
      {children}
    </ConversationContext.Provider>
  );
};

export const useConversation = () => {
  const context = useContext(ConversationContext);
  if (!context) {
    throw new Error('useConversation must be used within a ConversationProvider');
  }
  return context;
};