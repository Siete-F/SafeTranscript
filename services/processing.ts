/**
 * Local processing pipeline
 * Runs transcription → anonymization → LLM processing on the device.
 *
 * Transcription routing:
 *   1. If local Whisper model is downloaded → local transcription
 *      (non-WAV audio like M4A is auto-converted to WAV via native Expo module)
 *   2. Otherwise → Mistral Voxtral API (requires API key)
 */
import { Platform } from 'react-native';
import { getRecordingById, updateRecording } from '@/db/operations/recordings';
import { getProjectById } from '@/db/operations/projects';
import { getApiKeys } from '@/db/operations/apikeys';
import {
  getSelfHostedTranscriptionUrl,
  getSelfHostedTranscriptionToken,
} from '@/db/operations/settings';
import { getAudioFileUri } from './audioStorage';
import { processTranscription, transcribeWithSelfHosted } from './transcription';
import { anonymizeTranscription, reversePIIMappings } from './anonymization';
import { processWithLLM } from './llm';
import { isWavExtension } from './whisper/audioUtils';
import { transcribeWithWhisper, isWhisperAvailable } from './whisper/whisperInference';

interface PipelineOptions {
  /** Skip transcription and re-use the existing transcription text. */
  skipTranscription?: boolean;
  /** Force transcription via the Mistral Voxtral API, even if local Whisper or self-hosted is available. */
  forceVoxtralApi?: boolean;
  /** Force transcription via the self-hosted endpoint, even if local Whisper is available. */
  forceSelfHosted?: boolean;
}

/**
 * Run the full processing pipeline for a recording.
 * Updates the recording status in the local DB at each step.
 *
 * When `skipTranscription` is true, re-uses the existing transcription
 * and only re-runs anonymization + LLM. Useful for reprocessing when
 * the original audio is no longer accessible (e.g. blob URLs on web).
 */
export async function runProcessingPipeline(
  recordingId: string,
  projectId: string,
  options?: PipelineOptions,
): Promise<void> {
  const pipelineStart = Date.now();

  try {
    console.log(`[Pipeline] Starting for recording ${recordingId}`);

    const recording = await getRecordingById(recordingId);
    if (!recording?.audioPath) {
      console.warn('[Pipeline] Aborting — recording or audio path missing');
      return;
    }

    const project = await getProjectById(projectId);
    if (!project) {
      console.warn('[Pipeline] Aborting — project not found');
      return;
    }

    const apiKeysRecord = await getApiKeys();

    // Step 1: Transcribe (or re-use existing)
    let transcriptionText: string;

    if (options?.skipTranscription && recording.transcription) {
      console.log('[Pipeline] Step 1/3: Transcription (skipped — re-using existing)');
      transcriptionText = recording.transcription;
    } else {
      console.log('[Pipeline] Step 1/3: Transcription');
      await updateRecording(recordingId, { status: 'transcribing' });

      const audioUri = getAudioFileUri(recording.audioPath);

      // Determine transcription method: local Whisper → self-hosted → Mistral cloud API
      const useLocalWhisper = !options?.forceVoxtralApi && !options?.forceSelfHosted && await shouldUseLocalWhisper(audioUri);

      let transcriptionData;
      let transcriptionSource: 'whisper' | 'voxtral-api' | 'self-hosted';

      if (useLocalWhisper) {
        console.log('[Pipeline] Using LOCAL Whisper model for transcription');
        transcriptionData = await transcribeWithWhisper(audioUri, 'nl');
        transcriptionSource = 'whisper';
      } else if (!options?.forceVoxtralApi && await shouldUseSelfHosted()) {
        console.log('[Pipeline] Using SELF-HOSTED endpoint for transcription');
        const selfHostedUrl = await getSelfHostedTranscriptionUrl();
        const selfHostedToken = await getSelfHostedTranscriptionToken();
        transcriptionData = await transcribeWithSelfHosted(
          audioUri,
          selfHostedUrl!,
          selfHostedToken ?? undefined,
          project.sensitiveWords,
        );
        transcriptionSource = 'self-hosted';
      } else {
        console.log('[Pipeline] Using Mistral API for transcription');
        const mistralKey = apiKeysRecord.mistralKey;
        if (!mistralKey) {
          throw new Error(
            'No transcription method available. Options: (1) download the Whisper model in Settings ' +
            'for local transcription, (2) configure a self-hosted endpoint in Settings, or ' +
            '(3) add a Mistral API key for cloud transcription.',
          );
        }
        transcriptionData = await processTranscription(
          audioUri,
          mistralKey,
          project.sensitiveWords,
        );
        transcriptionSource = 'voxtral-api';
      }

      // Build default speaker map from unique speaker IDs
      const seenSpeakers = new Set<string>();
      const uniqueSpeakers: string[] = [];
      for (const seg of transcriptionData.segments) {
        if (!seenSpeakers.has(seg.speaker)) {
          seenSpeakers.add(seg.speaker);
          uniqueSpeakers.push(seg.speaker);
        }
      }
      let speakerMap: Record<string, string> | undefined;
      if (uniqueSpeakers.length > 1) {
        speakerMap = {};
        uniqueSpeakers.forEach((id, i) => { speakerMap![id] = `Speaker ${i + 1}`; });
      }

      await updateRecording(recordingId, {
        transcription: transcriptionData.fullText,
        transcriptionData: transcriptionData.segments,
        transcriptionSource,
        ...(speakerMap && { speakerMap }),
      });

      transcriptionText = transcriptionData.fullText;
      console.log(`[Pipeline] Transcription done (${transcriptionSource}): ${transcriptionData.segments.length} segments, ${uniqueSpeakers.length} speakers`);
    }

    // Step 2: Anonymize (if enabled AND LLM is enabled)
    let anonymizedText: string | undefined;
    let piiMappings: Record<string, string> | undefined;

    if (project.enableLlm && project.enableAnonymization) {
      console.log('[Pipeline] Step 2/3: Anonymization');
      await updateRecording(recordingId, { status: 'anonymizing' });

      const result = await anonymizeTranscription(transcriptionText);
      anonymizedText = result.anonymized;
      piiMappings = result.mappings;

      await updateRecording(recordingId, {
        anonymizedTranscription: anonymizedText,
        piiMappings,
      });

      console.log(`[Pipeline] Anonymization done: ${Object.keys(piiMappings).length} PII items`);
    } else {
      console.log('[Pipeline] Step 2/3: Anonymization skipped');
    }

    // Step 3: LLM Processing (if enabled)
    if (project.enableLlm) {
      console.log(`[Pipeline] Step 3/3: LLM (${project.llmProvider}/${project.llmModel})`);
      await updateRecording(recordingId, { status: 'processing' });

      const textToProcess = project.enableAnonymization && anonymizedText
        ? anonymizedText
        : transcriptionText;

      const llmOutput = await processWithLLM(
        textToProcess,
        project.llmProvider,
        project.llmModel,
        project.llmPrompt,
        apiKeysRecord
      );

      let finalOutput = llmOutput;
      if (project.enableAnonymization && piiMappings) {
        finalOutput = reversePIIMappings(llmOutput, piiMappings);
      }

      await updateRecording(recordingId, {
        llmOutput: finalOutput,
        status: 'done',
      });
    } else {
      console.log('[Pipeline] Step 3/3: LLM skipped (disabled for project)');
      await updateRecording(recordingId, {
        status: 'done',
      });
    }

    const totalMs = Date.now() - pipelineStart;
    console.log(`[Pipeline] Completed in ${totalMs}ms`);
  } catch (error) {
    const totalMs = Date.now() - pipelineStart;
    console.error(`[Pipeline] Failed after ${totalMs}ms:`, error);
    await updateRecording(recordingId, {
      status: 'error',
      errorMessage: (error as Error).message,
    });
  }
}

/**
 * Determine if local Whisper transcription should be used.
 * Requires: model downloaded + native platform.
 * On Android, non-WAV audio (M4A) is automatically converted to WAV.
 */
async function shouldUseLocalWhisper(audioUri: string): Promise<boolean> {
  if (Platform.OS === 'web') return false;

  try {
    // Check if Whisper model files are on disk AND native module is linked
    const available = await isWhisperAvailable();
    if (!available) {
      console.log('[Pipeline] Whisper not available (model missing or native module not linked) — using API.');
      return false;
    }

    if (!isWavExtension(audioUri)) {
      console.log('[Pipeline] Audio is not WAV — will convert to WAV for local Whisper.');
    }

    return true;
  } catch (error) {
    console.warn('[Pipeline] Error checking local Whisper availability:', error);
    return false;
  }
}

/**
 * Determine if the self-hosted transcription endpoint should be used.
 * Returns true when a non-empty endpoint URL is saved in settings.
 */
async function shouldUseSelfHosted(): Promise<boolean> {
  try {
    const url = await getSelfHostedTranscriptionUrl();
    return !!url && url.trim().length > 0;
  } catch (error) {
    console.warn('[Pipeline] Error checking self-hosted availability:', error);
    return false;
  }
}