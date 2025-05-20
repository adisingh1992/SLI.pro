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
    // Using the default queryFn from the queryClient which knows how to handle the URL
    enabled: true,
  });

  // Fetch current conversation with messages
  const { data: currentConversation, isLoading: isLoadingMessages, error: messagesError } = useQuery({
    queryKey: ['/api/conversations', currentConversationId],
    // Using the default queryFn which will hit `/api/conversations/${currentConversationId}`
    enabled: !!currentConversationId,
    select: (data: any) => {
      // Make sure we have a consistent data structure
      if (!data) return null;
      
      console.log('Raw conversation data from API:', data);
      
      // Structure can come in different formats, normalize it
      const conversation = data.conversation || data;
      const messages = data.messages || [];
      
      console.log('Processed conversation:', conversation);
      console.log('Processed messages:', messages);
      
      return {
        conversation,
        messages: Array.isArray(messages) ? messages : []
      } as ConversationWithMessages;
    }
  });

  // Create a new conversation
  const createConversationMutation = useMutation({
    mutationFn: async (title: string) => {
      const response = await apiRequest('POST', '/api/conversations', { title });
      const data = await response.json();
      return data as Conversation;
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
      const response = await apiRequest('POST', `/api/conversations/${conversationId}/messages`, { content });
      return response.json();
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
    // Start streaming process
    setIsProcessing(true);
    setStreamingResponse('');
    let finalMessageSaved = false;
    
    try {
      // We need to use fetch directly instead of apiRequest for streaming
      const response = await fetch(`/api/conversations/${conversationId}/messages/stream`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ content }),
        credentials: 'include' // Use include to ensure credentials are sent
      });
      
      if (!response.body) {
        throw new Error('ReadableStream not supported');
      }
      
      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Stream request failed: ${response.status} ${errorText}`);
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
                // Event stream is complete, mark as saved
                finalMessageSaved = true;
                console.log('Stream completed, all data saved on server');
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
      // Keep streaming visible for a moment so user can read it
      // Even if we refresh data, we'll show this message until then
      
      // Keep the streaming message on screen for a second before loading saved messages
      setTimeout(() => {
        // First set processing to false so the streaming UI element is retained
        setIsProcessing(false);
        
        // Then wait to reload conversation data - this gives users time to read the message
        if (finalMessageSaved) {
          setTimeout(() => {
            queryClient.invalidateQueries({ queryKey: ['/api/conversations', currentConversationId] });
          }, 1500);
        }
      }, 500);
    }
  }, [currentConversationId, queryClient]);

  // Create a new conversation
  const createConversation = async (title: string) => {
    if (!title.trim()) {
      throw new Error('Conversation title cannot be empty');
    }
    
    try {
      // Using the apiRequest function with correct parameter order
      const response = await apiRequest('POST', '/api/conversations', { title });
      const data = await response.json() as Conversation;
      queryClient.invalidateQueries({ queryKey: ['/api/conversations'] });
      setCurrentConversationId(data.id);
      return data;
    } catch (error) {
      console.error('Error creating conversation:', error);
      throw error;
    }
  };

  // Set the current conversation by ID
  const setCurrentConversation = (conversationId: number) => {
    setCurrentConversationId(conversationId);
  };

  // Send a message (using streaming by default)
  const sendMessage = async (content: string): Promise<void> => {
    if (!currentConversationId) {
      console.error('No active conversation');
      throw new Error('No active conversation');
    }
    
    try {
      // Use streaming response
      await sendStreamingMessage(currentConversationId, content);
    } catch (error) {
      console.error("Error in sendMessage:", error);
      throw error;
    }
  };

  return (
    <ConversationContext.Provider
      value={{
        conversations: Array.isArray(conversations) ? conversations : [],
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