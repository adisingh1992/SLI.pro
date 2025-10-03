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
}

export function useVoiceRecording(config: VoiceRecordingConfig) {
  const { toast } = useToast();
  const [state, setState] = useState<VoiceRecordingState>({
    isRecording: false,
    isProcessing: false,
    transcriptionPreview: '',
    error: null
  });

  const wsRef = useRef<WebSocket | null>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);

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

  // Initialize WebSocket connection
  const connectWebSocket = useCallback(() => {
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const wsUrl = `${protocol}//${window.location.host}/ws/voice`;
    
    const ws = new WebSocket(wsUrl);
    
    ws.onopen = () => {
      console.log('[Voice] WebSocket connected');
      // Start voice session (either foundation session or enhancement module)
      ws.send(JSON.stringify({
        type: 'start',
        userId: config.userId,
        ...(config.sessionNumber && { sessionNumber: config.sessionNumber }),
        ...(config.moduleCode && { moduleCode: config.moduleCode })
      }));
    };

    ws.onmessage = (event) => {
      const message = JSON.parse(event.data);
      
      switch (message.type) {
        case 'session_started':
          console.log('[Voice] Session started');
          break;
          
        case 'transcription_delta':
          // Update preview with streaming text
          setState(prev => ({
            ...prev,
            transcriptionPreview: prev.transcriptionPreview + message.text
          }));
          break;
          
        case 'transcription_complete':
          console.log('[Voice] Transcription complete:', message.text);
          setState(prev => ({
            ...prev,
            isProcessing: false,
            transcriptionPreview: ''
          }));
          config.onTranscriptionComplete(message.text);
          break;
          
        case 'error':
          console.error('[Voice] Error:', message.message);
          setState(prev => ({
            ...prev,
            error: message.message,
            isRecording: false,
            isProcessing: false
          }));
          toast({
            title: "Voice Error",
            description: message.message,
            variant: "destructive"
          });
          break;
      }
    };

    ws.onerror = (error) => {
      console.error('[Voice] WebSocket error:', error);
      setState(prev => ({
        ...prev,
        error: 'Connection error',
        isRecording: false,
        isProcessing: false
      }));
      toast({
        title: "Connection Error",
        description: "Voice connection lost. Please try again.",
        variant: "destructive"
      });
      
      // Clean up on error
      if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
        mediaRecorderRef.current.stop();
      }
      if (streamRef.current) {
        streamRef.current.getTracks().forEach(track => track.stop());
        streamRef.current = null;
      }
    };

    ws.onclose = (event) => {
      console.log('[Voice] WebSocket closed', event.code, event.reason);
      
      // Only show error if it was unexpected AND the user is actively recording
      // Don't show errors for normal closures (1000) or when navigating away from the page
      if (event.code !== 1000 && state.isRecording) {
        setState(prev => ({
          ...prev,
          error: 'Connection closed unexpectedly',
          isRecording: false,
          isProcessing: false
        }));
        toast({
          title: "Connection Closed",
          description: "Voice connection was interrupted. Please try again.",
          variant: "destructive"
        });
      }
      
      // Clean up on close
      if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
        mediaRecorderRef.current.stop();
      }
      if (streamRef.current) {
        streamRef.current.getTracks().forEach(track => track.stop());
        streamRef.current = null;
      }
    };

    wsRef.current = ws;
    return ws;
  }, [config, toast]);

  // Start recording
  const startRecording = useCallback(async () => {
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
      
      // Set up MediaRecorder
      const mimeType = getSupportedMimeType();
      const mediaRecorder = new MediaRecorder(stream, {
        mimeType
      });

      mediaRecorderRef.current = mediaRecorder;
      
      // Collect all audio chunks
      const audioChunks: Blob[] = [];

      // Collect audio chunks (don't send yet)
      mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          audioChunks.push(event.data);
        }
      };

      // Send complete audio when recording stops
      mediaRecorder.onstop = async () => {
        if (audioChunks.length > 0 && ws.readyState === WebSocket.OPEN) {
          // Combine all chunks into a single blob
          const audioBlob = new Blob(audioChunks, { type: mimeType });
          
          // Convert complete blob to base64
          const reader = new FileReader();
          reader.onloadend = () => {
            const base64 = reader.result as string;
            const audioData = base64.split(',')[1]; // Remove data:audio/... prefix
            
            // Send complete audio file
            ws.send(JSON.stringify({
              type: 'audio',
              data: audioData,
              mimeType: mimeType
            }));
            
            // Signal stop/transcribe
            ws.send(JSON.stringify({ type: 'stop' }));
          };
          reader.readAsDataURL(audioBlob);
        }
      };

      // Start recording (will collect until stopped)
      mediaRecorder.start();
      
      setState(prev => ({
        ...prev,
        isRecording: true,
        error: null,
        transcriptionPreview: ''
      }));

      // Add haptic feedback for mobile
      if ('vibrate' in navigator) {
        navigator.vibrate(50);
      }

    } catch (error) {
      console.error('[Voice] Error starting recording:', error);
      const errorMessage = error instanceof Error ? error.message : 'Failed to access microphone';
      
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
    }
  }, [connectWebSocket, getSupportedMimeType, toast]);

  // Stop recording
  const stopRecording = useCallback(() => {
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
      mediaRecorderRef.current.stop();
      // Note: The actual audio data and stop signal are sent in the onstop handler
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

    // Add haptic feedback for mobile
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

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
        mediaRecorderRef.current.stop();
      }
      if (streamRef.current) {
        streamRef.current.getTracks().forEach(track => track.stop());
      }
      if (wsRef.current) {
        wsRef.current.send(JSON.stringify({ type: 'end' }));
        wsRef.current.close();
      }
    };
  }, []);

  return {
    ...state,
    startRecording,
    stopRecording,
    toggleRecording
  };
}
