import { useState, useRef, useCallback, useEffect } from 'react';
import { useToast } from './use-toast';

interface VoiceRecordingConfig {
  userId: number;
  sessionNumber?: number;
  moduleCode?: string;
  onTranscriptionComplete: (text: string) => void;
}

type RecordingState = 'idle' | 'recording' | 'processing';

export function useVoiceRecording(config: VoiceRecordingConfig) {
  const { toast } = useToast();
  const [state, setState] = useState<RecordingState>('idle');
  
  const wsRef = useRef<WebSocket | null>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);

  // Get supported MIME type for cross-browser compatibility
  const getSupportedMimeType = useCallback(() => {
    const types = [
      'audio/webm;codecs=opus',
      'audio/webm',
      'audio/ogg;codecs=opus',
      'audio/mp4'
    ];
    return types.find(type => MediaRecorder.isTypeSupported(type)) || 'audio/webm';
  }, []);

  // Clean up resources
  const cleanup = useCallback(() => {
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
      mediaRecorderRef.current.stop();
    }
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(track => track.stop());
      streamRef.current = null;
    }
    if (wsRef.current) {
      wsRef.current.close();
      wsRef.current = null;
    }
    audioChunksRef.current = [];
  }, []);

  // Connect WebSocket
  const connectWebSocket = useCallback(() => {
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const wsUrl = `${protocol}//${window.location.host}/ws/voice?userId=${config.userId}${config.sessionNumber ? `&sessionNumber=${config.sessionNumber}` : ''}${config.moduleCode ? `&moduleCode=${config.moduleCode}` : ''}`;
    
    const ws = new WebSocket(wsUrl);

    ws.onopen = () => {
      console.log('[Voice] WebSocket connected');
      ws.send(JSON.stringify({ type: 'start' }));
    };

    ws.onmessage = (event) => {
      try {
        const message = JSON.parse(event.data);
        
        if (message.type === 'transcription_complete') {
          console.log('[Voice] Transcription:', message.text);
          config.onTranscriptionComplete(message.text);
          setState('idle');
          cleanup();
        } else if (message.type === 'error') {
          console.error('[Voice] Error:', message.error);
          toast({
            title: "Voice Error",
            description: message.error || "Failed to process voice recording",
            variant: "destructive"
          });
          setState('idle');
          cleanup();
        }
      } catch (error) {
        console.error('[Voice] Failed to parse message:', error);
      }
    };

    ws.onerror = (error) => {
      console.error('[Voice] WebSocket error:', error);
      toast({
        title: "Connection Error",
        description: "Failed to connect to voice service",
        variant: "destructive"
      });
      setState('idle');
      cleanup();
    };

    ws.onclose = () => {
      console.log('[Voice] WebSocket closed');
    };

    wsRef.current = ws;
    return ws;
  }, [config, cleanup, toast]);

  // Start recording
  const startRecording = useCallback(async () => {
    try {
      console.log('[Voice] Starting recording...');
      
      // Request microphone permission
      const stream = await navigator.mediaDevices.getUserMedia({ 
        audio: {
          channelCount: 1,
          sampleRate: 16000,
          echoCancellation: true,
          noiseSuppression: true
        } 
      });

      streamRef.current = stream;
      audioChunksRef.current = [];
      
      // Set up MediaRecorder
      const mimeType = getSupportedMimeType();
      const mediaRecorder = new MediaRecorder(stream, { mimeType });
      mediaRecorderRef.current = mediaRecorder;

      // Collect audio chunks
      mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          audioChunksRef.current.push(event.data);
          console.log('[Voice] Chunk received:', event.data.size, 'bytes');
        }
      };

      // Handle recording stop
      mediaRecorder.onstop = () => {
        console.log('[Voice] Recording stopped, total chunks:', audioChunksRef.current.length);
        
        if (audioChunksRef.current.length === 0) {
          toast({
            title: "No Audio",
            description: "No audio was recorded. Please try again.",
            variant: "destructive"
          });
          setState('idle');
          cleanup();
          return;
        }

        // Create audio blob and send to backend
        const audioBlob = new Blob(audioChunksRef.current, { type: mimeType });
        console.log('[Voice] Audio blob size:', audioBlob.size, 'bytes');

        if (audioBlob.size < 100) {
          toast({
            title: "Recording Too Short",
            description: "Please speak for at least 2 seconds and try again.",
            variant: "destructive"
          });
          setState('idle');
          cleanup();
          return;
        }

        // Send audio via WebSocket
        const reader = new FileReader();
        reader.onloadend = () => {
          const base64 = reader.result as string;
          const audioData = base64.split(',')[1];
          
          if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
            console.log('[Voice] Sending audio to backend...');
            wsRef.current.send(JSON.stringify({
              type: 'audio_data',
              data: audioData,
              mimeType
            }));
          } else {
            toast({
              title: "Connection Error",
              description: "Lost connection to voice service",
              variant: "destructive"
            });
            setState('idle');
            cleanup();
          }
        };
        reader.readAsDataURL(audioBlob);
      };

      // Connect WebSocket and start recording
      connectWebSocket();
      mediaRecorder.start();
      setState('recording');
      
      if ('vibrate' in navigator) {
        navigator.vibrate(50);
      }

    } catch (error) {
      console.error('[Voice] Error starting recording:', error);
      toast({
        title: "Microphone Error",
        description: error instanceof Error ? error.message : "Failed to access microphone",
        variant: "destructive"
      });
      cleanup();
    }
  }, [getSupportedMimeType, connectWebSocket, cleanup, toast]);

  // Stop recording
  const stopRecording = useCallback(() => {
    console.log('[Voice] Stopping recording...');
    
    if (mediaRecorderRef.current && mediaRecorderRef.current.state === 'recording') {
      mediaRecorderRef.current.stop();
      setState('processing');
      
      if ('vibrate' in navigator) {
        navigator.vibrate(50);
      }
    }
    
    // Stop microphone stream
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(track => track.stop());
      streamRef.current = null;
    }
  }, []);

  // Toggle recording
  const toggleRecording = useCallback(() => {
    if (state === 'recording') {
      stopRecording();
    } else if (state === 'idle') {
      startRecording();
    }
  }, [state, startRecording, stopRecording]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      cleanup();
    };
  }, [cleanup]);

  return {
    isRecording: state === 'recording',
    isProcessing: state === 'processing',
    toggleRecording,
    startRecording,
    stopRecording
  };
}
