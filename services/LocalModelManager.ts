
import { Platform } from 'react-native';
import * as FileSystem from 'expo-file-system/legacy';

/**
 * Local Model Manager for Voxtral Mini 4B (ExecuTorch)
 *
 * Handles downloading, checking, and deleting the on-device transcription model.
 * The model (~2.5 GB, quantized) is downloaded on-demand and stored in the
 * app's document directory — it is never bundled in the app binary.
 *
 * Web is not supported: all helpers return safe no-op values so the UI can
 * simply gray-out the "Download Offline Model" option.
 *
 * IMPORTANT – New Architecture required:
 *   react-native-executorch needs Fabric / TurboModules.
 *   Users must create a Development Build (`npx expo run:ios` or `run:android`).
 *   Expo Go will NOT work.
 */

/**
 * CDN URL for the quantised Voxtral Mini 4B model.
 * Replace this placeholder with your actual hosting URL before deployment.
 */
const MODEL_URL = 'https://your-cdn.com/voxtral-mini-4b-q4.pte';
const MODEL_FILENAME = 'voxtral.pte';

/** Minimum total device RAM (bytes) required to run the 4-bit quantised model. */
const MIN_RAM_BYTES = 6 * 1024 * 1024 * 1024; // 6 GB

/**
 * Whether local inference is supported on the current platform.
 * Web never supports local models.
 */
export const isLocalModelSupported = (): boolean => {
  return Platform.OS !== 'web';
};

/**
 * Full filesystem path where the model is (or will be) stored.
 * Returns `null` on web.
 */
export const getModelPath = (): string | null => {
  if (!isLocalModelSupported()) return null;
  return `${FileSystem.documentDirectory}${MODEL_FILENAME}`;
};

/**
 * Check whether the model file already exists on disk.
 */
export const checkModelExists = async (): Promise<boolean> => {
  const modelPath = getModelPath();
  if (!modelPath) return false;

  const info = await FileSystem.getInfoAsync(modelPath);
  return info.exists;
};

/**
 * Download the model file, reporting progress via `onProgress` (0 → 1).
 * Returns the local URI of the downloaded file, or `null` if the platform
 * is unsupported.
 */
export const downloadModel = async (
  onProgress: (progress: number) => void,
): Promise<string | null> => {
  const modelPath = getModelPath();
  if (!modelPath) return null;

  const downloader = FileSystem.createDownloadResumable(
    MODEL_URL,
    modelPath,
    {},
    (downloadProgress) => {
      const p =
        downloadProgress.totalBytesWritten /
        downloadProgress.totalBytesExpectedToWrite;
      onProgress(p);
    },
  );

  const result = await downloader.downloadAsync();
  return result?.uri ?? null;
};

/**
 * Delete the local model file to free up storage.
 */
export const deleteModel = async (): Promise<void> => {
  const modelPath = getModelPath();
  if (!modelPath) return;

  const exists = await checkModelExists();
  if (exists) {
    await FileSystem.deleteAsync(modelPath);
  }
};

/**
 * Basic device RAM check.
 * Returns `true` (optimistic) on native because `expo-device` is not
 * currently installed to read `totalMemory`. Inference failures are
 * caught at runtime instead.
 *
 * TODO: Install `expo-device` and compare `Device.totalMemory` against
 * `MIN_RAM_BYTES` for a real pre-flight check.
 */
export const hasEnoughMemory = async (): Promise<boolean> => {
  return isLocalModelSupported();
};

/**
 * Minimum RAM (in bytes) required for local inference.
 * Exposed so the UI can display a human-readable threshold.
 */
export const MINIMUM_RAM_BYTES = MIN_RAM_BYTES;
