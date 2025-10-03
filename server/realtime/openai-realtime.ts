import OpenAI from 'openai';
import { log } from '../vite';
import { Readable } from 'stream';

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

  async sendAudio(audioBase64: string) {
    if (!this.isConnected) {
      throw new Error('Not connected');
    }

    try {
      // Convert base64 to buffer and store
      const audioBuffer = Buffer.from(audioBase64, 'base64');
      this.audioChunks.push(audioBuffer);
      
      // Send delta feedback to frontend (empty for now, will transcribe on stop)
      this.config.onTranscriptionDelta('');
    } catch (error) {
      log(`[OpenAI Voice] Error receiving audio: ${error}`);
      throw error;
    }
  }

  async stopAudio() {
    if (!this.isConnected || this.audioChunks.length === 0) {
      return;
    }

    try {
      log('[OpenAI Voice] Transcribing audio...');
      
      // Combine all audio chunks
      const completeAudio = Buffer.concat(this.audioChunks);
      
      // Create a readable stream from the buffer
      const audioStream = Readable.from(completeAudio);
      
      // Use Whisper API for transcription
      const transcription = await this.openai.audio.transcriptions.create({
        file: audioStream as any,
        model: 'whisper-1',
        response_format: 'text'
      });

      const transcriptText = typeof transcription === 'string' ? transcription : transcription.text;
      
      log(`[OpenAI Voice] Transcription complete: ${transcriptText.substring(0, 50)}...`);
      
      // Send complete transcription
      this.config.onTranscriptionComplete(transcriptText);
      
      // Clear chunks for next recording
      this.audioChunks = [];
    } catch (error) {
      log(`[OpenAI Voice] Transcription error: ${error}`);
      this.config.onError(error instanceof Error ? error.message : 'Transcription failed');
    }
  }

  async disconnect() {
    this.isConnected = false;
    this.audioChunks = [];
    log('[OpenAI Voice] Session disconnected');
  }
}
