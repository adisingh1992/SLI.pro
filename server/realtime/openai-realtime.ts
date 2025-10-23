import OpenAI from 'openai';
import { log } from '../vite';
import { writeFile, unlink } from 'fs/promises';
import { join } from 'path';
import { tmpdir } from 'os';

interface RealtimeSessionConfig {
  onTranscriptionDelta: (text: string) => void;
  onTranscriptionComplete: (text: string) => void;
  onError: (error: string) => void;
}

export class OpenAIRealtimeSession {
  private openai: OpenAI;
  private config: RealtimeSessionConfig;
  private isConnected: boolean = false;
  private audioChunks: Buffer[] = [];

  constructor(config: RealtimeSessionConfig) {
    // the newest OpenAI model is "gpt-5" which was released August 7, 2025. do not change this unless explicitly requested by the user
    this.openai = new OpenAI({ 
      apiKey: process.env.OPENAI_API_KEY 
    });
    this.config = config;
  }

  async connect() {
    try {
      log('[OpenAI Voice] Session initialized');
      this.isConnected = true;
      this.audioChunks = [];
    } catch (error) {
      log(`[OpenAI Voice] Connection error: ${error}`);
      this.config.onError(error instanceof Error ? error.message : 'Connection failed');
      throw error;
    }
  }

  async sendAudio(audioBase64: string, mimeType?: string) {
    if (!this.isConnected) {
      const errorMsg = 'Session not connected. Please try again.';
      log(`[OpenAI Voice] ${errorMsg}`);
      this.config.onError(errorMsg);
      throw new Error(errorMsg);
    }

    try {
      // Convert base64 to buffer - this is now the complete audio file
      const audioBuffer = Buffer.from(audioBase64, 'base64');
      
      // Validate audio size
      if (audioBuffer.length === 0) {
        const errorMsg = 'No audio data received';
        log(`[OpenAI Voice] ${errorMsg}`);
        this.config.onError(errorMsg);
        throw new Error(errorMsg);
      }
      
      // Check if audio is too large (OpenAI has a 25MB limit)
      const maxSize = 25 * 1024 * 1024; // 25MB
      if (audioBuffer.length > maxSize) {
        const errorMsg = 'Audio recording too long. Please record a shorter message.';
        log(`[OpenAI Voice] ${errorMsg} (${audioBuffer.length} bytes)`);
        this.config.onError(errorMsg);
        throw new Error(errorMsg);
      }
      
      // Store as complete audio (replacing any previous chunks)
      this.audioChunks = [audioBuffer];
      
      log(`[OpenAI Voice] Received complete audio: ${audioBuffer.length} bytes, type: ${mimeType || 'unknown'}`);
    } catch (error) {
      log(`[OpenAI Voice] Error receiving audio: ${error}`);
      if (error instanceof Error && error.message.includes('Audio recording too long')) {
        throw error;
      }
      const errorMsg = 'Failed to process audio data. Please try again.';
      this.config.onError(errorMsg);
      throw new Error(errorMsg);
    }
  }

  async stopAudio() {
    if (!this.isConnected) {
      log('[OpenAI Voice] Cannot stop audio - session not connected');
      return;
    }
    
    if (this.audioChunks.length === 0) {
      log('[OpenAI Voice] Cannot transcribe - no audio data');
      this.config.onError('No audio data to transcribe');
      return;
    }

    let tempFilePath: string | null = null;

    try {
      log('[OpenAI Voice] Transcribing audio...');
      
      // Combine all audio chunks
      const completeAudio = Buffer.concat(this.audioChunks);
      
      // Validate audio size again
      if (completeAudio.length < 100) {
        const errorMsg = 'Audio too short. Please speak for at least a second.';
        log(`[OpenAI Voice] ${errorMsg}`);
        this.config.onError(errorMsg);
        this.audioChunks = [];
        return;
      }
      
      // Create a temporary file with .webm extension
      const timestamp = Date.now();
      const randomId = Math.random().toString(36).substring(7);
      tempFilePath = join(tmpdir(), `voice-recording-${timestamp}-${randomId}.webm`);
      
      // Write audio buffer to temporary file
      await writeFile(tempFilePath, completeAudio);
      
      log(`[OpenAI Voice] Created temp file: ${tempFilePath}, size: ${completeAudio.length} bytes`);
      
      // Use Whisper API for transcription with the file
      const transcription = await this.openai.audio.transcriptions.create({
        file: await import('fs').then(fs => fs.createReadStream(tempFilePath!)),
        model: 'whisper-1',
        response_format: 'verbose_json'
      });

      const transcriptText = transcription.text;
      
      // Validate transcription result
      if (!transcriptText || transcriptText.trim().length === 0) {
        const errorMsg = 'No speech detected. Please try speaking more clearly.';
        log(`[OpenAI Voice] ${errorMsg}`);
        this.config.onError(errorMsg);
        this.audioChunks = [];
        return;
      }
      
      log(`[OpenAI Voice] Transcription complete: ${transcriptText.substring(0, 50)}...`);
      
      // Send complete transcription
      this.config.onTranscriptionComplete(transcriptText);
      
      // Clear chunks for next recording
      this.audioChunks = [];
    } catch (error: any) {
      log(`[OpenAI Voice] Transcription error: ${error}`);
      
      // Categorize error for better user feedback
      let userErrorMessage = 'Voice processing failed. Please try again.';
      
      if (error?.error?.type === 'invalid_request_error') {
        userErrorMessage = 'Invalid audio format. Please check your microphone and try again.';
      } else if (error?.status === 429) {
        userErrorMessage = 'API rate limit reached. Please try again in a moment.';
      } else if (error?.status === 503 || error?.status === 502) {
        userErrorMessage = 'API temporary unavailable. Please try again.';
      } else if (error?.code === 'ECONNREFUSED' || error?.code === 'ETIMEDOUT') {
        userErrorMessage = 'API connection timeout. Please check your internet and try again.';
      } else if (error instanceof Error) {
        // Check for specific known error messages
        if (error.message.includes('timeout')) {
          userErrorMessage = 'API request timeout. Please try again.';
        } else if (error.message.includes('network')) {
          userErrorMessage = 'Network error. Please check your connection and try again.';
        } else if (error.message.includes('Audio too short') || error.message.includes('No speech detected')) {
          userErrorMessage = error.message;
        }
      }
      
      this.config.onError(userErrorMessage);
      this.audioChunks = [];
    } finally {
      // Clean up temporary file
      if (tempFilePath) {
        try {
          await unlink(tempFilePath);
          log(`[OpenAI Voice] Cleaned up temp file: ${tempFilePath}`);
        } catch (cleanupError) {
          log(`[OpenAI Voice] Failed to cleanup temp file: ${cleanupError}`);
        }
      }
    }
  }

  async disconnect() {
    this.isConnected = false;
    this.audioChunks = [];
    log('[OpenAI Voice] Session disconnected');
  }
}
