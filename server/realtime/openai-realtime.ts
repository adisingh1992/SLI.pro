import OpenAI from 'openai';
import { log } from '../vite';
import { writeFile, unlink } from 'fs/promises';
import { join } from 'path';
import { tmpdir } from 'os';
import { createReadStream } from 'fs';

interface RealtimeSessionConfig {
  onTranscriptionComplete: (text: string) => void;
  onError: (error: string) => void;
}

export class OpenAIRealtimeSession {
  private openai: OpenAI;
  private config: RealtimeSessionConfig;

  constructor(config: RealtimeSessionConfig) {
    this.openai = new OpenAI({ 
      apiKey: process.env.OPENAI_API_KEY 
    });
    this.config = config;
  }

  async transcribeAudio(audioBase64: string, mimeType: string) {
    let tempFilePath: string | null = null;

    try {
      // Convert base64 to buffer
      const audioBuffer = Buffer.from(audioBase64, 'base64');
      log(`[OpenAI Voice] Received audio: ${audioBuffer.length} bytes, type: ${mimeType}`);
      
      // Validate audio size
      if (audioBuffer.length < 100) {
        throw new Error('Audio too short. Please speak for at least 2 seconds.');
      }
      
      if (audioBuffer.length > 25 * 1024 * 1024) {
        throw new Error('Audio too long. Please record a shorter message.');
      }
      
      // Create temporary file
      const timestamp = Date.now();
      const randomId = Math.random().toString(36).substring(7);
      const extension = mimeType.includes('webm') ? 'webm' : 
                       mimeType.includes('ogg') ? 'ogg' : 
                       mimeType.includes('mp4') ? 'mp4' : 'webm';
      tempFilePath = join(tmpdir(), `voice-${timestamp}-${randomId}.${extension}`);
      
      await writeFile(tempFilePath, audioBuffer);
      log(`[OpenAI Voice] Saved to temp file: ${tempFilePath}`);
      
      // Transcribe using Whisper API
      const transcription = await this.openai.audio.transcriptions.create({
        file: createReadStream(tempFilePath),
        model: 'whisper-1',
        language: 'en'
      });

      const text = transcription.text.trim();
      
      if (!text) {
        throw new Error('No speech detected. Please try speaking more clearly.');
      }
      
      log(`[OpenAI Voice] Transcription successful: "${text.substring(0, 50)}..."`);
      this.config.onTranscriptionComplete(text);
      
    } catch (error: any) {
      log(`[OpenAI Voice] Transcription error: ${error}`);
      
      let errorMessage = 'Failed to process audio. Please try again.';
      
      if (error?.status === 429) {
        errorMessage = 'Service busy. Please try again in a moment.';
      } else if (error?.status === 503 || error?.status === 502) {
        errorMessage = 'Service temporarily unavailable. Please try again.';
      } else if (error instanceof Error) {
        if (error.message.includes('too short') || error.message.includes('No speech')) {
          errorMessage = error.message;
        } else if (error.message.includes('format') || error.message.includes('decode')) {
          errorMessage = 'Invalid audio format. Please try again.';
        }
      }
      
      this.config.onError(errorMessage);
    } finally {
      // Clean up temp file
      if (tempFilePath) {
        try {
          await unlink(tempFilePath);
          log(`[OpenAI Voice] Cleaned up: ${tempFilePath}`);
        } catch (e) {
          log(`[OpenAI Voice] Cleanup failed: ${e}`);
        }
      }
    }
  }
}
