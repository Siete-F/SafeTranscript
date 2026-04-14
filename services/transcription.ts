/**
 * Transcription Service
 * Calls Mistral Voxtral API directly from the device using raw fetch.
 * Handles reading local audio files and sending them as multipart form data.
 */
import { Platform } from 'react-native';

export interface TranscriptionSegment {
  speaker: string;
  timestamp: number;
  endTimestamp?: number;
  text: string;
}

export interface TranscriptionResult {
  fullText: string;
  segments: TranscriptionSegment[];
}

/**
 * Transcribe audio using Mistral Voxtral API
 * @param audioUri Local file URI of the audio file
 * @param mistralApiKey Mistral API key
 * @param sensitiveWords Optional context bias words
 */
export async function processTranscription(
  audioUri: string,
  mistralApiKey: string,
  sensitiveWords?: string[]
): Promise<TranscriptionResult> {
  if (!mistralApiKey) {
    console.warn('[Transcription] No Mistral API key — returning fallback');
    return getFallbackTranscription();
  }

  console.log(`[Transcription] Starting transcription for ${audioUri}`);

  try {
    const formData = new FormData();

    if (Platform.OS === 'web') {
      // On web, fetch the file as a blob
      const response = await fetch(audioUri);
      const blob = await response.blob();
      formData.append('file', blob, `recording-${Date.now()}.m4a`);
    } else {
      // On native, use the file URI directly with React Native's FormData
      formData.append('file', {
        uri: audioUri,
        name: `recording-${Date.now()}.m4a`,
        type: 'audio/m4a',
      } as any);
    }

    formData.append('model', 'voxtral-mini-latest');
    formData.append('diarize', 'true');
    formData.append('timestamp_granularities[]', 'segment');

    if (sensitiveWords && sensitiveWords.length > 0) {
      const biasWords = sensitiveWords.slice(0, 100).join(',');
      formData.append('context_bias', biasWords);
    }

    const response = await fetch('https://api.mistral.ai/v1/audio/transcriptions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${mistralApiKey}`,
      },
      body: formData,
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Mistral transcription API error (${response.status}): ${errorText}`);
    }

    const data = await response.json();
    console.log('[Transcription] API response received');

    const segments = parseTranscriptionResponse(data);
    const fullText = segments.map((seg) => seg.text).join(' ');

    console.log(`[Transcription] Complete: ${segments.length} segments, ${fullText.length} chars`);
    return { fullText, segments };
  } catch (error) {
    console.error('[Transcription] Error:', error);
    throw error;
  }
}

/**
 * Transcribe audio using a self-hosted OpenAI-compatible transcription endpoint.
 * Compatible with vllm (Voxtral) and faster-whisper-server.
 * @param audioUri Local file URI of the audio file
 * @param endpointUrl Base URL of the self-hosted service (e.g. http://192.168.1.100:8000)
 * @param token Optional bearer token for authentication
 * @param sensitiveWords Optional context bias words
 */
export async function transcribeWithSelfHosted(
  audioUri: string,
  endpointUrl: string,
  token?: string | null,
  sensitiveWords?: string[]
): Promise<TranscriptionResult> {
  // Normalise: strip trailing slash then append the standard path
  const base = endpointUrl.replace(/\/+$/, '');
  const url = base.endsWith('/v1/audio/transcriptions')
    ? base
    : `${base}/v1/audio/transcriptions`;

  console.log(`[Transcription] Self-hosted: posting to ${url}`);

  try {
    const formData = new FormData();

    if (Platform.OS === 'web') {
      const response = await fetch(audioUri);
      const blob = await response.blob();
      formData.append('file', blob, `recording-${Date.now()}.m4a`);
    } else {
      formData.append('file', {
        uri: audioUri,
        name: `recording-${Date.now()}.m4a`,
        type: 'audio/m4a',
      } as any);
    }

    // Do not hardcode a model name — the self-hosted server uses its own configured model.
    // timestamp_granularities is sent so servers that support it return segment-level data.
    formData.append('timestamp_granularities[]', 'segment');

    if (sensitiveWords && sensitiveWords.length > 0) {
      const biasWords = sensitiveWords.slice(0, 100).join(',');
      formData.append('context_bias', biasWords);
    }

    const headers: Record<string, string> = {};
    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
    }

    const response = await fetch(url, {
      method: 'POST',
      headers,
      body: formData,
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Self-hosted transcription error (${response.status}): ${errorText}`);
    }

    const data = await response.json();
    console.log('[Transcription] Self-hosted response received');

    const segments = parseTranscriptionResponse(data);
    const fullText = segments.map((seg) => seg.text).join(' ');

    console.log(`[Transcription] Self-hosted complete: ${segments.length} segments, ${fullText.length} chars`);
    return { fullText, segments };
  } catch (error) {
    console.error('[Transcription] Self-hosted error:', error);
    throw error;
  }
}

function parseTranscriptionResponse(response: any): TranscriptionSegment[] {
  const segments: TranscriptionSegment[] = [];

  if (response.segments && Array.isArray(response.segments)) {
    response.segments.forEach((segment: any, index: number) => {
      segments.push({
        speaker: segment.speaker_id || segment.speaker || `speaker_${index}`,
        timestamp: Math.round((segment.start || 0) * 1000),
        endTimestamp: segment.end != null ? Math.round(segment.end * 1000) : undefined,
        text: (segment.text || '').trim(),
      });
    });
  } else if (response.text && typeof response.text === 'string') {
    segments.push({ speaker: 'speaker_0', timestamp: 0, text: response.text.trim() });
  } else if (typeof response === 'string') {
    segments.push({ speaker: 'speaker_0', timestamp: 0, text: response.trim() });
  } else {
    segments.push({ speaker: 'speaker_0', timestamp: 0, text: '[Unexpected transcription format]' });
  }

  return segments;
}

function getFallbackTranscription(): TranscriptionResult {
  return {
    fullText: '[Transcription not available — API key not configured]',
    segments: [
      { speaker: 'Speaker 1', timestamp: 0, text: '[Transcription not available — API key not configured]' },
    ],
  };
}
