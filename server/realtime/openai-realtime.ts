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
      throw new Error('Not connected');
    }

    try {
      // Convert base64 to buffer - this is now the complete audio file
      const audioBuffer = Buffer.from(audioBase64, 'base64');
      
      // Store as complete audio (replacing any previous chunks)
      this.audioChunks = [audioBuffer];
      
      log(`[OpenAI Voice] Received complete audio: ${audioBuffer.length} bytes, type: ${mimeType || 'unknown'}`);
    } catch (error) {
      log(`[OpenAI Voice] Error receiving audio: ${error}`);
      throw error;
    }
  }

  async stopAudio() {
    if (!this.isConnected || this.audioChunks.length === 0) {
      return;
    }

    let tempFilePath: string | null = null;

    try {
      log('[OpenAI Voice] Transcribing audio...');
      
      // Combine all audio chunks
      const completeAudio = Buffer.concat(this.audioChunks);
      
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
      
      log(`[OpenAI Voice] Transcription complete: ${transcriptText.substring(0, 50)}...`);
      
      // Send complete transcription
      this.config.onTranscriptionComplete(transcriptText);
      
      // Clear chunks for next recording
      this.audioChunks = [];
    } catch (error) {
      log(`[OpenAI Voice] Transcription error: ${error}`);
      this.config.onError(error instanceof Error ? error.message : 'Transcription failed');
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
