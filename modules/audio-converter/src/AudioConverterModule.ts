/**
 * AudioConverter — TypeScript wrapper for the native Android module.
 *
 * Converts audio files (M4A, etc.) to 16 kHz mono WAV for local
 * Whisper transcription using Android's built-in MediaCodec APIs.
 *
 * On iOS the app records directly as WAV, so this module is Android-only.
 * The web stub (audioConverter.web.ts) throws—local Whisper is not
 * supported on web.
 */

import { requireNativeModule } from 'expo-modules-core';
import * as FileSystem from 'expo-file-system/legacy';

const NativeAudioConverter = requireNativeModule('AudioConverter');

/**
 * Convert an audio file (e.g. M4A/AAC) to a 16 kHz mono WAV file.
 *
 * @param inputUri  Source audio file URI (file:// or absolute path)
 * @returns Absolute path to the converted WAV file in the cache directory
 * @throws Error if the native conversion fails
 */
export async function convertToWav(inputUri: string): Promise<string> {
  const inputPath = inputUri.startsWith('file://')
    ? inputUri.replace('file://', '')
    : inputUri;

  // Unique output in the cache directory
  const outputPath = `${FileSystem.cacheDirectory}whisper_${Date.now()}.wav`;

  console.log(`[AudioConverter] Converting to WAV: ${inputPath}`);
  console.log(`[AudioConverter] Output: ${outputPath}`);

  await NativeAudioConverter.convertToWav(inputPath, outputPath);

  // Verify the output file exists
  const fileInfo = await FileSystem.getInfoAsync(outputPath);
  if (!fileInfo.exists) {
    throw new Error('Audio conversion produced no output file.');
  }

  console.log(
    `[AudioConverter] Conversion complete: ${((fileInfo as any).size / 1024).toFixed(0)} KB`,
  );
  return outputPath;
}

/**
 * Delete a temporary WAV file created by convertToWav.
 * Silently ignores errors (file may already be gone).
 */
export async function deleteTempWav(wavPath: string): Promise<void> {
  try {
    await FileSystem.deleteAsync(wavPath, { idempotent: true });
  } catch {
    // Ignore — cache files are cleaned up by the OS eventually
  }
}

export default NativeAudioConverter;
