import { log } from '../vite';
import { writeFile, unlink } from 'fs/promises';
import { join } from 'path';
import { tmpdir } from 'os';
import * as orchestrator from '../orchestrator';

/**
 * Voice capture -> text, using single-pass record-then-transcribe (Whisper).
 *
 * Despite its former name ("OpenAIRealtimeSession") this was never the OpenAI
 * Realtime API — it buffers an audio clip and transcribes it in one call, which
 * is the Tier 1 voice flow. Transcription now goes through the orchestrator, so
 * it runs on the Azure Whisper deployment rather than calling OpenAI directly.
 */

interface VoiceSessionConfig {
  onTranscriptionComplete: (text: string) => void;
  onError: (error: string) => void;
}

export class VoiceTranscriptionSession {
  private config: VoiceSessionConfig;

  constructor(config: VoiceSessionConfig) {
    this.config = config;
  }

  async transcribeAudio(audioBase64: string, mimeType: string) {
    let tempFilePath: string | null = null;

    try {
      // Convert base64 to buffer
      const audioBuffer = Buffer.from(audioBase64, 'base64');
      log(`[Voice] Received audio: ${audioBuffer.length} bytes, type: ${mimeType}`);

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
      log(`[Voice] Saved to temp file: ${tempFilePath}`);

      // Pass the path (not a stream) so the orchestrator can open a fresh
      // stream per attempt when it falls back between providers.
      const rawText = await orchestrator.transcribe(tempFilePath, { language: 'en' });
      const text = rawText.trim();

      if (!text) {
        throw new Error('No speech detected. Please try speaking more clearly.');
      }

      log(`[Voice] Transcription successful: "${text.substring(0, 50)}..."`);
      this.config.onTranscriptionComplete(text);

    } catch (error: any) {
      log(`[Voice] Transcription error: ${error}`);

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
        } else if (error.message.includes('No transcription provider')) {
          // Configuration problem — surface it rather than blaming the audio.
          errorMessage = 'Voice transcription is not configured on the server.';
        }
      }

      this.config.onError(errorMessage);
    } finally {
      // Clean up temp file
      if (tempFilePath) {
        try {
          await unlink(tempFilePath);
          log(`[Voice] Cleaned up: ${tempFilePath}`);
        } catch (e) {
          log(`[Voice] Cleanup failed: ${e}`);
        }
      }
    }
  }
}
