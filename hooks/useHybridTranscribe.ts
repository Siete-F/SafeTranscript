
import { useState, useCallback } from 'react';
import { Platform } from 'react-native';
import { checkModelExists, isLocalModelSupported, getModelPath } from '@/services/LocalModelManager';
import { authenticatedPost } from '@/utils/api';

/**
 * Transcription result returned by the hybrid hook.
 */
export interface HybridTranscriptionResult {
  text: string;
  source: 'local' | 'api';
}

/**
 * useHybridTranscribe – unified transcription hook
 *
 * Platform behaviour:
 *   • Mobile (iOS / Android): if the local Voxtral Mini 4B model has been
 *     downloaded via LocalModelManager, transcription runs on-device through
 *     react-native-executorch.  If the model is absent, or if inference fails,
 *     the hook falls back to the existing server-side Batch API.
 *   • Web: only the Batch API path is used.
 *
 * Post-processing: after recording completes, the full audio buffer can be
 * passed to `transcribe()` for a single batch-style local pass that "cleans
 * up" any real-time jitter.
 *
 * NOTE: react-native-executorch requires the React Native New Architecture
 * (Fabric + TurboModules). A Development Build is required — Expo Go is
 * not supported.
 */
export const useHybridTranscribe = () => {
  const [isLocalReady, setIsLocalReady] = useState(false);

  /**
   * Refresh the local-model readiness flag.
   * Call this after downloading / deleting the model, or on mount.
   */
  const refreshLocalStatus = useCallback(async () => {
    if (!isLocalModelSupported()) {
      setIsLocalReady(false);
      return;
    }
    const exists = await checkModelExists();
    setIsLocalReady(exists);
  }, []);

  /**
   * Send audio to the backend Batch API for transcription.
   */
  const callBatchApi = async (
    audioUri: string,
    recordingId: string,
  ): Promise<HybridTranscriptionResult> => {
    const result = await authenticatedPost<{ transcription: string }>(
      `/api/recordings/${recordingId}/transcribe`,
      { audioUri },
    );
    return { text: result.transcription, source: 'api' };
  };

  /**
   * Attempt local (on-device) transcription using react-native-executorch.
   *
   * The library is conditionally required so that web builds never try to
   * resolve the native module.
   */
  const callLocalModel = async (
    audioUri: string,
  ): Promise<HybridTranscriptionResult> => {
    // Dynamic require keeps the native module out of the web bundle.
    // eslint-disable-next-line @typescript-eslint/no-var-requires, @typescript-eslint/no-require-imports
    const { transcribeAudio } = require('react-native-executorch');

    const modelPath = getModelPath();
    if (!modelPath) {
      throw new Error('Model path unavailable');
    }

    const result = await transcribeAudio({
      modelSource: `file://${modelPath}`,
      audioUri,
    });

    return { text: result.text ?? result, source: 'local' };
  };

  /**
   * Transcribe audio.
   *
   * @param audioUri    – file URI of the recorded audio
   * @param recordingId – backend recording id (used for the API fallback)
   * @param forceApi    – skip local model even if available
   */
  const transcribe = useCallback(
    async (
      audioUri: string,
      recordingId: string,
      forceApi = false,
    ): Promise<HybridTranscriptionResult> => {
      // Web — always use the API
      if (Platform.OS === 'web' || forceApi || !isLocalReady) {
        return callBatchApi(audioUri, recordingId);
      }

      // Mobile — try local, fall back to API on failure
      try {
        return await callLocalModel(audioUri);
      } catch (error) {
        console.warn('[useHybridTranscribe] Local inference failed, falling back to API', error);
        return callBatchApi(audioUri, recordingId);
      }
    },
    [isLocalReady],
  );

  return {
    /** Run transcription (local when possible, API otherwise). */
    transcribe,
    /** Whether the on-device model is ready for use. */
    isLocalReady,
    /** Re-check local model availability. */
    refreshLocalStatus,
  };
};
