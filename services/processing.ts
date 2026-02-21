/**
 * Local processing pipeline
 * Runs transcription → anonymization → LLM processing on the device.
 */
import { getRecordingById, updateRecording } from '@/db/operations/recordings';
import { getProjectById } from '@/db/operations/projects';
import { getApiKeys } from '@/db/operations/apikeys';
import { getAudioFileUri } from './audioStorage';
import { processTranscription } from './transcription';
import { anonymizeTranscription, reversePIIMappings } from './anonymization';
import { processWithLLM } from './llm';

interface PipelineOptions {
  /** Skip transcription and re-use the existing transcription text. */
  skipTranscription?: boolean;
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
    if (!recording || !recording.audioPath) {
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
      const mistralKey = apiKeysRecord.mistralKey;
      if (!mistralKey) {
        throw new Error('Mistral API key not configured. Add it in Settings to enable transcription.');
      }

      const transcriptionData = await processTranscription(
        audioUri,
        mistralKey,
        project.sensitiveWords
      );

      await updateRecording(recordingId, {
        transcription: transcriptionData.fullText,
        transcriptionData: transcriptionData.segments,
      });

      transcriptionText = transcriptionData.fullText;
      console.log(`[Pipeline] Transcription done: ${transcriptionData.segments.length} segments`);
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
