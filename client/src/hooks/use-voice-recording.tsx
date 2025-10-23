import { useState, useRef, useCallback, useEffect } from 'react';
import { useToast } from './use-toast';

interface VoiceRecordingConfig {
  userId: number;
  sessionNumber?: number;
  moduleCode?: string;
  onTranscriptionComplete: (text: string) => void;
}

interface VoiceRecordingState {
  isRecording: boolean;
  isProcessing: boolean;
  transcriptionPreview: string;
  error: string | null;
  retryCount: number;
  isRetryLimitReached: boolean;
}

const MAX_RETRIES = 3;
const PROCESSING_TIMEOUT = 30000; // 30 seconds
const RETRY_DELAYS = [1000, 2000, 3000]; // Exponential backoff in ms

export function useVoiceRecording(config: VoiceRecordingConfig) {
  const { toast } = useToast();
  const [state, setState] = useState<VoiceRecordingState>({
    isRecording: false,
    isProcessing: false,
    transcriptionPreview: '',
    error: null,
    retryCount: 0,
    isRetryLimitReached: false
  });

  const wsRef = useRef<WebSocket | null>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const processingTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const retryTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const isRecordingRef = useRef(false);
  const isProcessingRef = useRef(false);
  const currentRetryCountRef = useRef(0);
  const recordedAudioRef = useRef<{blob: Blob, mimeType: string} | null>(null);

  // Sync refs with state
  useEffect(() => {
    isRecordingRef.current = state.isRecording;
    isProcessingRef.current = state.isProcessing;
    currentRetryCountRef.current = state.retryCount;
  }, [state.isRecording, state.isProcessing, state.retryCount]);

  // Get supported MIME type for cross-browser compatibility
  const getSupportedMimeType = useCallback(() => {
    const types = [
      'audio/webm;codecs=opus',
      'audio/webm',
      'audio/ogg;codecs=opus',
      'audio/mp4',
      'audio/wav'
    ];
    return types.find(type => MediaRecorder.isTypeSupported(type)) || 'audio/webm';
  }, []);

  // Clean up resources
  const cleanupResources = useCallback(() => {
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
      try {
        mediaRecorderRef.current.stop();
      } catch (e) {
        console.warn('[Voice] Error stopping media recorder:', e);
      }
    }
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(track => track.stop());
      streamRef.current = null;
    }
    if (processingTimeoutRef.current) {
      clearTimeout(processingTimeoutRef.current);
      processingTimeoutRef.current = null;
    }
  }, []);

  // Close WebSocket connection
  const closeWebSocket = useCallback(() => {
    if (wsRef.current) {
      try {
        if (wsRef.current.readyState === WebSocket.OPEN) {
          wsRef.current.send(JSON.stringify({ type: 'end' }));
        }
        wsRef.current.close();
      } catch (e) {
        console.warn('[Voice] Error closing WebSocket:', e);
      }
      wsRef.current = null;
    }
  }, []);

  // Send audio for transcription
  const sendAudioForTranscription = useCallback((ws: WebSocket) => {
    const audioData = recordedAudioRef.current;
    if (!audioData || ws.readyState !== WebSocket.OPEN) {
      console.error('[Voice] Cannot send audio - no data or websocket not ready');
      return false;
    }

    const reader = new FileReader();
    reader.onloadend = () => {
      try {
        const base64 = reader.result as string;
        const audioDataStr = base64.split(',')[1];
        
        if (ws.readyState === WebSocket.OPEN) {
          ws.send(JSON.stringify({
            type: 'audio',
            data: audioDataStr,
            mimeType: audioData.mimeType
          }));
          
          ws.send(JSON.stringify({ type: 'stop' }));
          
          // Clear any existing processing timeout before setting a new one
          if (processingTimeoutRef.current) {
            clearTimeout(processingTimeoutRef.current);
            processingTimeoutRef.current = null;
          }
          
          // Set processing timeout
          processingTimeoutRef.current = setTimeout(() => {
            console.warn('[Voice] Processing timeout');
            if (isProcessingRef.current) {
              handleRetry('processing');
            }
          }, PROCESSING_TIMEOUT);
        } else {
          console.warn('[Voice] WebSocket closed before sending audio');
          handleRetry('connection');
        }
      } catch (error) {
        console.error('[Voice] Error sending audio:', error);
        handleRetry('connection');
      }
    };
    reader.onerror = () => {
      console.error('[Voice] Error reading audio blob');
      handleRetry('processing');
    };
    reader.readAsDataURL(audioData.blob);
    return true;
  }, []);

  // Handle retry logic
  const handleRetry = useCallback((errorType: 'connection' | 'processing') => {
    const newRetryCount = currentRetryCountRef.current + 1;
    
    if (newRetryCount > MAX_RETRIES) {
      console.log('[Voice] Max retries reached');
      setState(prev => ({
        ...prev,
        isRecording: false,
        isProcessing: false,
        retryCount: newRetryCount,
        isRetryLimitReached: true,
        error: 'retry_limit_reached'
      }));
      
      toast({
        title: "Voice Recognition Unavailable",
        description: "Voice recognition temporarily unavailable. Please type your response or try the microphone again in a moment.",
        variant: "destructive",
        duration: 6000
      });
      
      cleanupResources();
      closeWebSocket();
      recordedAudioRef.current = null;
      return;
    }

    const delay = RETRY_DELAYS[newRetryCount - 1] || 3000;
    
    setState(prev => ({
      ...prev,
      retryCount: newRetryCount,
      isRecording: false,
      isProcessing: true
    }));

    toast({
      title: "Retrying...",
      description: `Connection issue detected. Retry ${newRetryCount}/${MAX_RETRIES}...`,
      duration: 2000
    });

    // Clean up current WebSocket
    closeWebSocket();

    // Schedule retry - reconnect and resend audio
    retryTimeoutRef.current = setTimeout(() => {
      console.log(`[Voice] Retry attempt ${newRetryCount}/${MAX_RETRIES} - reconnecting...`);
      
      // Only retry if we have recorded audio
      if (recordedAudioRef.current) {
        const ws = connectWebSocket();
        
        // Wait for WebSocket to be ready, then send audio
        const checkConnection = setInterval(() => {
          if (ws.readyState === WebSocket.OPEN) {
            clearInterval(checkConnection);
            sendAudioForTranscription(ws);
          } else if (ws.readyState === WebSocket.CLOSED || ws.readyState === WebSocket.CLOSING) {
            clearInterval(checkConnection);
            handleRetry(errorType);
          }
        }, 100);
        
        // Timeout for connection check
        setTimeout(() => {
          clearInterval(checkConnection);
          if (ws.readyState !== WebSocket.OPEN) {
            console.error('[Voice] Retry connection timeout');
            handleRetry('connection');
          }
        }, 5000);
      } else {
        // No audio to retry, just reset
        setState(prev => ({
          ...prev,
          isProcessing: false,
          error: 'No audio to process'
        }));
      }
    }, delay);
  }, [cleanupResources, closeWebSocket, toast, sendAudioForTranscription]);

  // Initialize WebSocket connection
  const connectWebSocket = useCallback(() => {
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const wsUrl = `${protocol}//${window.location.host}/ws/voice`;
    
    const ws = new WebSocket(wsUrl);
    let sessionStarted = false;
    
    ws.onopen = () => {
      console.log('[Voice] WebSocket connected');
      try {
        ws.send(JSON.stringify({
          type: 'start',
          userId: config.userId,
          ...(config.sessionNumber && { sessionNumber: config.sessionNumber }),
          ...(config.moduleCode && { moduleCode: config.moduleCode })
        }));
      } catch (error) {
        console.error('[Voice] Error sending start message:', error);
        if (isProcessingRef.current && recordedAudioRef.current) {
          handleRetry('connection');
        }
      }
    };

    ws.onmessage = (event) => {
      try {
        const message = JSON.parse(event.data);
        
        switch (message.type) {
          case 'session_started':
            console.log('[Voice] Session started');
            sessionStarted = true;
            // Only clear error, don't reset retry count here (it resets on successful transcription)
            setState(prev => ({
              ...prev,
              error: null
            }));
            break;
            
          case 'transcription_delta':
            setState(prev => ({
              ...prev,
              transcriptionPreview: prev.transcriptionPreview + message.text
            }));
            break;
            
          case 'transcription_complete':
            console.log('[Voice] Transcription complete:', message.text);
            
            // Clear processing timeout
            if (processingTimeoutRef.current) {
              clearTimeout(processingTimeoutRef.current);
              processingTimeoutRef.current = null;
            }
            
            setState(prev => ({
              ...prev,
              isProcessing: false,
              transcriptionPreview: '',
              retryCount: 0,
              error: null
            }));
            
            // Clear recorded audio after successful transcription
            recordedAudioRef.current = null;
            
            config.onTranscriptionComplete(message.text);
            break;
            
          case 'error':
            console.error('[Voice] Server error:', message.message);
            
            // Clear processing timeout
            if (processingTimeoutRef.current) {
              clearTimeout(processingTimeoutRef.current);
              processingTimeoutRef.current = null;
            }
            
            // Determine if error is recoverable
            const isRecoverable = message.message.includes('API') || 
                                 message.message.includes('timeout') ||
                                 message.message.includes('temporary') ||
                                 message.message.includes('unavailable') ||
                                 message.message.includes('rate limit');
            
            if (isRecoverable && recordedAudioRef.current) {
              handleRetry('processing');
            } else {
              setState(prev => ({
                ...prev,
                error: message.message,
                isRecording: false,
                isProcessing: false
              }));
              
              recordedAudioRef.current = null;
              
              toast({
                title: "Voice Error",
                description: message.message,
                variant: "destructive"
              });
            }
            break;
        }
      } catch (error) {
        console.error('[Voice] Error parsing message:', error);
      }
    };

    ws.onerror = (error) => {
      console.error('[Voice] WebSocket error:', error);
      
      // Only trigger retry if we were actively processing recorded audio
      if (isProcessingRef.current && recordedAudioRef.current) {
        handleRetry('connection');
      } else if (isRecordingRef.current || isProcessingRef.current) {
        setState(prev => ({
          ...prev,
          error: 'Connection error',
          isRecording: false,
          isProcessing: false
        }));
        cleanupResources();
      }
    };

    ws.onclose = (event) => {
      console.log('[Voice] WebSocket closed', event.code, event.reason);
      
      // Only handle unexpected closures during active processing
      if (event.code !== 1000 && isProcessingRef.current && recordedAudioRef.current) {
        // If session never started, it's a connection issue
        if (!sessionStarted) {
          handleRetry('connection');
        } else {
          // Session was active, this is unexpected
          handleRetry('connection');
        }
      } else if (event.code !== 1000 && (isRecordingRef.current || isProcessingRef.current)) {
        cleanupResources();
      }
    };

    wsRef.current = ws;
    return ws;
  }, [config, cleanupResources, handleRetry, toast]);

  // Start recording
  const startRecording = useCallback(async () => {
    // Check if retry limit reached
    if (state.isRetryLimitReached) {
      toast({
        title: "Voice Recognition Unavailable",
        description: "Voice recognition temporarily unavailable. Please type your response or try the microphone again in a moment.",
        variant: "destructive",
        duration: 6000
      });
      return;
    }

    try {
      // Request microphone permission
      const stream = await navigator.mediaDevices.getUserMedia({ 
        audio: {
          channelCount: 1,
          sampleRate: 24000,
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true
        } 
      });

      streamRef.current = stream;
      
      // Connect WebSocket
      const ws = connectWebSocket();
      
      // Wait a bit for WebSocket to be ready
      await new Promise(resolve => setTimeout(resolve, 300));
      
      if (ws.readyState !== WebSocket.OPEN) {
        console.warn('[Voice] WebSocket not ready, waiting...');
        // Wait up to 2 seconds for connection
        const maxWait = 2000;
        const startTime = Date.now();
        while (ws.readyState !== WebSocket.OPEN && Date.now() - startTime < maxWait) {
          await new Promise(resolve => setTimeout(resolve, 100));
        }
        
        if (ws.readyState !== WebSocket.OPEN) {
          throw new Error('WebSocket connection timeout');
        }
      }
      
      // Set up MediaRecorder
      const mimeType = getSupportedMimeType();
      const mediaRecorder = new MediaRecorder(stream, {
        mimeType
      });

      mediaRecorderRef.current = mediaRecorder;
      
      // Collect all audio chunks
      const audioChunks: Blob[] = [];

      mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          audioChunks.push(event.data);
        }
      };

      mediaRecorder.onstop = async () => {
        if (audioChunks.length > 0) {
          const audioBlob = new Blob(audioChunks, { type: mimeType });
          
          // Store recorded audio for potential retries
          recordedAudioRef.current = { blob: audioBlob, mimeType };
          
          // Send for transcription
          if (ws.readyState === WebSocket.OPEN) {
            sendAudioForTranscription(ws);
          } else {
            console.warn('[Voice] WebSocket closed, initiating retry');
            handleRetry('connection');
          }
        } else {
          setState(prev => ({
            ...prev,
            isProcessing: false,
            error: 'No audio recorded'
          }));
          toast({
            title: "No Audio Detected",
            description: "Please try speaking again and ensure your microphone is working.",
            variant: "destructive"
          });
        }
      };

      mediaRecorder.start();
      
      setState(prev => ({
        ...prev,
        isRecording: true,
        error: null,
        transcriptionPreview: ''
      }));

      if ('vibrate' in navigator) {
        navigator.vibrate(50);
      }

    } catch (error) {
      console.error('[Voice] Error starting recording:', error);
      const errorMessage = error instanceof Error ? error.message : 'Failed to access microphone';
      
      // Microphone permission errors are not retryable
      setState(prev => ({
        ...prev,
        error: errorMessage,
        isRecording: false
      }));
      
      toast({
        title: "Microphone Error",
        description: errorMessage,
        variant: "destructive"
      });
      
      cleanupResources();
      closeWebSocket();
    }
  }, [state.isRetryLimitReached, connectWebSocket, getSupportedMimeType, toast, handleRetry, cleanupResources, closeWebSocket, sendAudioForTranscription]);

  // Stop recording
  const stopRecording = useCallback(() => {
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
      mediaRecorderRef.current.stop();
    }

    if (streamRef.current) {
      streamRef.current.getTracks().forEach(track => track.stop());
      streamRef.current = null;
    }

    setState(prev => ({
      ...prev,
      isRecording: false,
      isProcessing: true
    }));

    if ('vibrate' in navigator) {
      navigator.vibrate(50);
    }
  }, []);

  // Toggle recording
  const toggleRecording = useCallback(() => {
    if (state.isRecording) {
      stopRecording();
    } else {
      startRecording();
    }
  }, [state.isRecording, startRecording, stopRecording]);

  // Reset retry limit (allow user to try again after some time)
  const resetRetryLimit = useCallback(() => {
    setState(prev => ({
      ...prev,
      retryCount: 0,
      isRetryLimitReached: false,
      error: null
    }));
    recordedAudioRef.current = null;
  }, []);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (retryTimeoutRef.current) {
        clearTimeout(retryTimeoutRef.current);
      }
      cleanupResources();
      closeWebSocket();
      recordedAudioRef.current = null;
    };
  }, [cleanupResources, closeWebSocket]);

  return {
    ...state,
    startRecording,
    stopRecording,
    toggleRecording,
    resetRetryLimit
  };
}
