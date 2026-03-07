/**
 * Local Model Manager
 *
 * Manages on-device transcription model (Whisper via ExecuTorch).
 * This module delegates to the whisper/ sub-module for actual model
 * management and provides backward-compatible exports for the Settings UI.
 *
 * Web is not supported: all helpers return safe no-op values.
 *
 * IMPORTANT – New Architecture required:
 *   react-native-executorch needs Fabric / TurboModules.
 *   Users must create a Development Build (`npx expo run:ios` or `run:android`).
 *   Expo Go will NOT work.
 */

import {
  isWhisperSupported,
} from './whisper/WhisperModelManager';

// Re-export whisper-specific functions for Settings UI
export {
  checkWhisperModelExists,
  downloadWhisperModel,
  deleteWhisperModel,
  getDownloadedWhisperVariant,
} from './whisper/WhisperModelManager';

// Re-export config types and constants
export {
  WHISPER_VARIANTS,
  DEFAULT_WHISPER_VARIANT,
} from './whisper/config';
export type { WhisperVariantId } from './whisper/config';

/**
 * Whether local inference is supported on the current platform.
 */
export const isLocalModelSupported = (): boolean => {
  return isWhisperSupported();
};
