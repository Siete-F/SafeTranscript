import { Mistral } from '@mistralai/mistralai';

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
 * Process audio transcription using Mistral Voxtral Mini Transcribe API
 * Uses client.audio.transcriptions.complete() with voxtral-mini-latest model
 * Supports diarization (speaker detection), timestamps, and context biasing
 * @param audioBuffer The audio file buffer to transcribe
 * @param sensitiveWords Optional array of keywords/terms for context biasing (e.g., proper nouns, technical terms)
 */
export async function processTranscription(audioBuffer: Buffer, sensitiveWords?: string[]): Promise<TranscriptionResult> {
  try {
    const mistralApiKey = process.env.MISTRAL_API_KEY;

    if (!mistralApiKey) {
      console.warn('[Transcription] MISTRAL_API_KEY not configured - returning fallback transcription');
      return getFallbackTranscription();
    }

    console.log(`[Transcription] Starting transcription of ${audioBuffer.length} bytes audio`);
    if (sensitiveWords && sensitiveWords.length > 0) {
      console.log(`[Transcription] Using ${sensitiveWords.length} context bias words`);
    }

    // Initialize Mistral client
    const client = new Mistral({ apiKey: mistralApiKey });
    console.log('[Transcription] Mistral client initialized');

    // Build transcription request options
    const model = 'voxtral-mini-latest';
    const transcribeOptions: any = {
      model,
      file: {
        content: audioBuffer,
        fileName: `recording-${Date.now()}.wav`,
      },
      // Enable speaker diarization
      diarize: true,
      // Request segment-level timestamps
      timestampGranularities: ['segment'],
    };

    // Add context biasing if sensitive words are provided
    // context_bias accepts a comma-separated string of up to 100 words/phrases
    if (sensitiveWords && sensitiveWords.length > 0) {
      const biasWords = sensitiveWords.slice(0, 100).join(',');
      transcribeOptions.contextBias = biasWords;
      console.log(`[Transcription] Context bias set with ${Math.min(sensitiveWords.length, 100)} terms`);
    }

    console.log(`[Transcription] Calling Mistral audio.transcriptions.complete() with model: ${model}`);
    const transcriptionResponse = await client.audio.transcriptions.complete(transcribeOptions);
    console.log('[Transcription] API response received successfully');

    // Parse the response
    const segments = parseTranscriptionResponse(transcriptionResponse);
    const fullText = extractFullText(segments);
    console.log(`[Transcription] Transcription complete: ${segments.length} segments, ${fullText.length} chars total`);

    return { fullText, segments };
  } catch (error) {
    console.error('[Transcription] Transcription error:', error);
    throw error;
  }
}

/**
 * Parse Mistral audio transcription response into segments
 * Handles diarization (speakers), timestamps, and plain text responses
 */
function parseTranscriptionResponse(response: any): TranscriptionSegment[] {
  const segments: TranscriptionSegment[] = [];

  console.log('[Transcription] Parsing response, keys:', Object.keys(response || {}));

  // The SDK response has a .text property with the full transcription
  // and may have .segments with timing/speaker info when timestamps are requested
  if (response.segments && Array.isArray(response.segments)) {
    response.segments.forEach((segment: any, index: number) => {
      segments.push({
        speaker: segment.speaker || `Speaker ${(index % 2) + 1}`,
        timestamp: Math.round((segment.start || 0) * 1000), // Convert seconds to milliseconds
        text: (segment.text || '').trim(),
      });
    });
    console.log(`[Transcription] Parsed ${segments.length} segments from response.segments`);
  } else if (response.text && typeof response.text === 'string') {
    // Fallback: single segment from full text
    segments.push({
      speaker: 'Speaker 1',
      timestamp: 0,
      text: response.text.trim(),
    });
    console.log('[Transcription] Used response.text as single segment');
  } else if (typeof response === 'string') {
    segments.push({
      speaker: 'Speaker 1',
      timestamp: 0,
      text: response.trim(),
    });
    console.log('[Transcription] Response was a plain string');
  } else {
    console.warn('[Transcription] Unexpected response format:', JSON.stringify(response).substring(0, 500));
    segments.push({
      speaker: 'Speaker 1',
      timestamp: 0,
      text: '[Transcription returned unexpected format]',
    });
  }

  return segments;
}

/**
 * Extract full text from segments
 */
function extractFullText(segments: TranscriptionSegment[]): string {
  return segments.map((seg) => seg.text).join(' ');
}

/**
 * Fallback transcription when API key is not configured
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
 * Uses the same endpoint since diarization is enabled by default
 * @param audioBuffer The audio file buffer to transcribe
 * @param sensitiveWords Optional keywords for context biasing
 */
export async function processTranscriptionWithDiarization(audioBuffer: Buffer, sensitiveWords?: string[]): Promise<TranscriptionResult> {
  return processTranscription(audioBuffer, sensitiveWords);
}

/**
 * Get duration of audio in seconds
 * Requires proper audio processing library (e.g., ffprobe)
 */
export async function getAudioDuration(audioBuffer: Buffer): Promise<number> {
  // This would require a proper audio processing library
  // For now, return 0 as placeholder
  return 0;
}
