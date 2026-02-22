/**
 * Whisper Local Inference
 *
 * Uses react-native-executorch's SpeechToTextModule to run Whisper
 * inference on-device. Provides batch transcription from audio files.
 *
 * The audio must be a WAV file recorded at 16kHz mono (LPCM).
 * The WAV file is read and converted to Float32Array before passing
 * to the model's transcribe() method.
 *
 * Only works on native platforms (iOS/Android) with New Architecture.
 * Web is not supported.
 */

import { Platform } from 'react-native';
import { getWhisperModelPaths, getDownloadedWhisperVariant } from './WhisperModelManager';
import { readWavAsFloat32, isWavExtension } from './audioUtils';
import type { TranscriptionResult, TranscriptionSegment } from '@/services/transcription';

/** Singleton module instance — loaded once, reused for all transcriptions */
let sttModule: any = null;
let loadedVariant: string | null = null;
let isLoading = false;

/**
 * Check whether the react-native-executorch native module is available.
 * Returns false when running in Expo Go or if the dev build was not rebuilt
 * after installing the package.
 */
function isExecutorchLinked(): boolean {
  try {
    // TurboModuleRegistry lookup – returns null when not linked
    const { TurboModuleRegistry } = require('react-native');
    // react-native-executorch registers 'ETInstaller' as its TurboModule name
    // (see node_modules/react-native-executorch/src/native/NativeETInstaller.ts)
    const nativeModule =
      TurboModuleRegistry.get('ETInstaller') ??
      TurboModuleRegistry.get('ExpoExecutorch') ??
      TurboModuleRegistry.get('RnExecutorch') ??
      TurboModuleRegistry.get('ETModule');
    return nativeModule != null;
  } catch {
    return false;
  }
}

/**
 * Load the Whisper model into memory if not already loaded.
 * Uses local file paths from WhisperModelManager.
 * Returns true if model is ready for inference.
 */
export async function ensureWhisperLoaded(): Promise<boolean> {
  if (Platform.OS === 'web') return false;
  if (sttModule && loadedVariant) return true;
  if (isLoading) return false; // Prevent concurrent loads

  // Early-exit with a clear message when the native module is missing
  // (e.g. running in Expo Go instead of a Development Build)
  if (!isExecutorchLinked()) {
    console.warn(
      '[WhisperInference] react-native-executorch is not linked. ' +
        'Local Whisper transcription requires a Development Build ' +
        '(npx expo run:android / run:ios). Expo Go is not supported.',
    );
    return false;
  }

  try {
    isLoading = true;

    const paths = await getWhisperModelPaths();
    if (!paths) {
      console.log('[WhisperInference] No model files found on disk.');
      return false;
    }

    const variant = await getDownloadedWhisperVariant();
    console.log(`[WhisperInference] Loading Whisper ${variant} model...`);

    // Dynamically import SpeechToTextModule — safe now that we verified
    // the native module is linked above.
    const { SpeechToTextModule } = require('react-native-executorch');
    const module = new SpeechToTextModule();

    // Pass local file:// URIs — ResourceFetcher handles them as LOCAL_FILE
    await module.load({
      isMultilingual: true,
      encoderSource: `file://${paths.encoder}`,
      decoderSource: `file://${paths.decoder}`,
      tokenizerSource: `file://${paths.tokenizer}`,
    });

    sttModule = module;
    loadedVariant = variant;
    console.log(`[WhisperInference] Model loaded successfully.`);
    return true;
  } catch (error) {
    console.error('[WhisperInference] Failed to load model:', error);
    sttModule = null;
    loadedVariant = null;
    return false;
  } finally {
    isLoading = false;
  }
}

/**
 * Unload the Whisper model from memory to free resources.
 */
export function unloadWhisper(): void {
  if (sttModule) {
    try {
      sttModule.delete();
    } catch (e) {
      console.warn('[WhisperInference] Error unloading model:', e);
    }
    sttModule = null;
    loadedVariant = null;
  }
}

/**
 * Transcribe a WAV audio file using the local Whisper model.
 *
 * @param audioUri - Path to an audio file (WAV preferred; M4A/other formats will be converted)
 * @param language - Language code for transcription (default: 'nl' for Dutch)
 * @returns TranscriptionResult compatible with the processing pipeline
 * @throws Error if model is not loaded or inference fails
 */
export async function transcribeWithWhisper(
  audioUri: string,
  language: string = 'nl',
): Promise<TranscriptionResult> {
  // Ensure model is loaded
  const loaded = await ensureWhisperLoaded();
  if (!loaded || !sttModule) {
    const reason = isExecutorchLinked()
      ? 'Whisper model is not loaded. Please download the model in Settings first.'
      : 'Local Whisper requires a Development Build (npx expo run:android / run:ios). Expo Go is not supported.';
    throw new Error(reason);
  }

  // If audio is not WAV, convert it first (e.g. M4A on Android)
  let wavUri = audioUri;
  let tempWavPath: string | null = null;

  if (!isWavExtension(audioUri)) {
    console.log('[WhisperInference] Audio is not WAV — converting with MediaCodec...');
    // Lazy require to avoid loading native AudioConverter module at file evaluation time
    const { convertToWav } = require('@/services/audioConverter') as { convertToWav: (uri: string) => Promise<string> };
    const converted = await convertToWav(audioUri);
    tempWavPath = converted;
    wavUri = converted;
    console.log(`[WhisperInference] Converted to WAV: ${converted}`);
  }

  try {
    console.log(`[WhisperInference] Reading WAV file: ${wavUri}`);
    const waveform = await readWavAsFloat32(wavUri);
    console.log(`[WhisperInference] Waveform: ${waveform.length} samples (${(waveform.length / 16000).toFixed(1)}s at 16kHz)`);

    console.log(`[WhisperInference] Starting transcription (language: ${language})...`);
    const startTime = Date.now();

    const text = await sttModule.transcribe(waveform, { language });

    const elapsed = Date.now() - startTime;
    console.log(`[WhisperInference] Transcription complete in ${elapsed}ms: ${text.length} chars`);

    // Convert to TranscriptionResult format
    // Whisper batch mode returns a single text block — create one segment
    const segments: TranscriptionSegment[] = splitIntoSegments(text);

    return {
      fullText: text.trim(),
      segments,
    };
  } finally {
    // Clean up temporary WAV file if we converted
    if (tempWavPath) {
      const { deleteTempWav } = require('@/services/audioConverter');
      await deleteTempWav(tempWavPath);
    }
  }
}

/**
 * Split transcription text into segments.
 * Whisper batch mode returns a single text block, so we split by sentences
 * and create segments with estimated timestamps.
 */
function splitIntoSegments(text: string): TranscriptionSegment[] {
  if (!text?.trim()) {
    return [{ speaker: 'Speaker 1', timestamp: 0, text: '[No speech detected]' }];
  }

  // Split by sentence boundaries
  const sentences = text
    .split(/(?<=[.!?])\s+/)
    .map((s) => s.trim())
    .filter((s) => s.length > 0);

  if (sentences.length === 0) {
    return [{ speaker: 'Speaker 1', timestamp: 0, text: text.trim() }];
  }

  // Create segments with estimated timestamps (evenly spaced)
  return sentences.map((sentence, index) => ({
    speaker: 'Speaker 1',
    timestamp: index * 5000, // Estimate 5 seconds per sentence
    text: sentence,
  }));
}

/**
 * Check if local Whisper transcription is available.
 * Returns true if the native module is linked AND model files are on disk.
 */
export async function isWhisperAvailable(): Promise<boolean> {
  if (Platform.OS === 'web') return false;
  if (!isExecutorchLinked()) return false;
  const paths = await getWhisperModelPaths();
  return paths !== null;
}
