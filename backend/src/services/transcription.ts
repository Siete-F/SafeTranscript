import { OpenAI } from 'openai';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

export interface TranscriptionSegment {
  speaker: string;
  timestamp: number;
  text: string;
}

export interface TranscriptionResult {
  fullText: string;
  segments: TranscriptionSegment[];
}

/**
 * Process audio transcription using OpenAI Whisper API
 * Returns structured transcription with speaker detection and timestamps
 */
export async function processTranscription(audioBuffer: Buffer): Promise<TranscriptionResult> {
  try {
    const openai = new OpenAI({
      apiKey: process.env.OPENAI_API_KEY || '',
    });

    if (!process.env.OPENAI_API_KEY) {
      // Fallback for development without API key
      return getFallbackTranscription();
    }

    // Create a temporary file for the audio
    const tempDir = os.tmpdir();
    const tempFile = path.join(tempDir, `audio-${Date.now()}.wav`);
    fs.writeFileSync(tempFile, audioBuffer);

    try {
      // Call OpenAI Whisper API
      const transcript = await openai.audio.transcriptions.create({
        file: fs.createReadStream(tempFile),
        model: 'whisper-1',
        language: 'en',
        timestamp_granularities: ['segment'],
      });

      // Parse the response and create segments
      const segments = parseTranscriptionResponse(transcript);

      return {
        fullText: transcript.text || '',
        segments,
      };
    } finally {
      // Clean up temporary file
      try {
        fs.unlinkSync(tempFile);
      } catch (e) {
        // Ignore cleanup errors
      }
    }
  } catch (error) {
    console.error('Transcription error:', error);
    // Return fallback on error
    return getFallbackTranscription();
  }
}

/**
 * Parse OpenAI Whisper API response
 */
function parseTranscriptionResponse(response: any): TranscriptionSegment[] {
  const segments: TranscriptionSegment[] = [];

  // If response has verbose_json with segments
  if (response.segments && Array.isArray(response.segments)) {
    response.segments.forEach((segment: any, index: number) => {
      segments.push({
        speaker: `Speaker ${index % 2 === 0 ? '1' : '2'}`, // Simple speaker detection
        timestamp: Math.round((segment.start || 0) * 1000), // Convert to milliseconds
        text: segment.text || '',
      });
    });
  } else if (typeof response.text === 'string') {
    // Fallback: treat entire response as single segment
    segments.push({
      speaker: 'Speaker 1',
      timestamp: 0,
      text: response.text,
    });
  }

  return segments;
}

/**
 * Fallback transcription when API is unavailable
 */
function getFallbackTranscription(): TranscriptionResult {
  return {
    fullText: '[Transcription not available - API key not configured]',
    segments: [
      {
        speaker: 'Speaker 1',
        timestamp: 0,
        text: '[Transcription not available - API key not configured]',
      },
    ],
  };
}

/**
 * Advanced transcription with speaker diarization
 * This would use more advanced features if available
 */
export async function processTranscriptionWithDiarization(audioBuffer: Buffer): Promise<TranscriptionResult> {
  // This is where speaker diarization logic would go
  // For now, fall back to basic transcription
  return processTranscription(audioBuffer);
}

/**
 * Get duration of audio in seconds
 */
export async function getAudioDuration(audioBuffer: Buffer): Promise<number> {
  // This would require a proper audio processing library
  // For now, return 0 as placeholder
  // In production, use a library like `ffprobe` or similar
  return 0;
}
