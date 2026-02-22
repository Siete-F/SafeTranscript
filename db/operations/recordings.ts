/**
 * Recording operations – native build (file-based storage).
 *
 * Each recording is identified by a composite ID: "{projectFolder}::{timestamp}"
 * Files are stored in the project folder structure:
 *   recordings/{timestamp}.json   – metadata
 *   recordings/{timestamp}.m4a    – audio
 *   transcriptions/{timestamp}.txt – raw transcription
 *   transcriptions/{timestamp}.segments.json – structured segments
 *   transcriptions/{timestamp}.anonymized.txt – anonymized text
 *   llm_responses/{timestamp}.md  – LLM output
 */
import type { Recording } from '@/types';
import * as FileStorage from '@/services/fileStorage';

// ---------------------------------------------------------------------------
// Build a Recording object from the filesystem
// ---------------------------------------------------------------------------

async function buildRecording(
  projectFolder: string,
  timestamp: string,
): Promise<Recording> {
  const meta = await FileStorage.readRecordingMeta(projectFolder, timestamp);
  const transcription = await FileStorage.readTranscription(projectFolder, timestamp);
  const transcriptionData = await FileStorage.readTranscriptionSegments(projectFolder, timestamp);
  const anonymized = await FileStorage.readAnonymizedTranscription(projectFolder, timestamp);
  const llmOutput = await FileStorage.readLlmResponse(projectFolder, timestamp);
  const audioPath = meta?.audioPath ?? (await FileStorage.getAudioPath(projectFolder, timestamp));

  return {
    id: FileStorage.makeRecordingId(projectFolder, timestamp),
    projectId: projectFolder,
    status: (meta?.status as Recording['status']) ?? 'pending',
    audioPath: audioPath ?? undefined,
    audioDuration: meta?.audioDuration,
    customFieldValues: meta?.customFieldValues ?? {},
    transcription: transcription ?? undefined,
    transcriptionData: transcriptionData ?? undefined,
    transcriptionSource: (meta?.transcriptionSource as Recording['transcriptionSource']) ?? undefined,
    anonymizedTranscription: anonymized ?? undefined,
    piiMappings: meta?.piiMappings,
    llmOutput: llmOutput ?? undefined,
    errorMessage: meta?.errorMessage ?? undefined,
    createdAt: meta?.createdAt ?? '',
    updatedAt: meta?.updatedAt,
  };
}

// ---------------------------------------------------------------------------
// CRUD
// ---------------------------------------------------------------------------

/** List all recordings for a project */
export async function getRecordingsByProject(projectId: string): Promise<Recording[]> {
  const timestamps = await FileStorage.listRecordingTimestamps(projectId);
  const recordings = await Promise.all(
    timestamps.map((ts) => buildRecording(projectId, ts)),
  );
  return recordings.sort((a, b) => a.createdAt.localeCompare(b.createdAt));
}

/** Get a single recording by composite ID */
export async function getRecordingById(id: string): Promise<Recording | null> {
  try {
    const { projectFolder, timestamp } = FileStorage.parseRecordingId(id);
    return await buildRecording(projectFolder, timestamp);
  } catch {
    return null;
  }
}

/** Create a new recording */
export async function createRecording(
  projectId: string,
  customFieldValues?: Record<string, any>,
): Promise<Recording> {
  const timestamp = FileStorage.generateTimestampId();
  const now = new Date().toISOString();

  const meta: FileStorage.RecordingMeta = {
    status: 'pending',
    customFieldValues: customFieldValues ?? {},
    createdAt: now,
    updatedAt: now,
  };

  await FileStorage.writeRecordingMeta(projectId, timestamp, meta);

  return {
    id: FileStorage.makeRecordingId(projectId, timestamp),
    projectId,
    status: 'pending',
    customFieldValues: customFieldValues ?? {},
    createdAt: now,
    updatedAt: now,
  };
}

/** Update a recording (used by processing pipeline and other operations) */
export async function updateRecording(
  id: string,
  data: Partial<{
    status: string;
    audioPath: string;
    audioDuration: number;
    customFieldValues: Record<string, any>;
    transcription: string;
    transcriptionData: any[];
    transcriptionSource: string;
    anonymizedTranscription: string;
    piiMappings: Record<string, string>;
    llmOutput: string;
    errorMessage: string;
  }>,
): Promise<void> {
  const { projectFolder, timestamp } = FileStorage.parseRecordingId(id);

  // --- Update metadata JSON ---
  const meta = (await FileStorage.readRecordingMeta(projectFolder, timestamp)) ?? {
    status: 'pending',
    customFieldValues: {},
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  meta.updatedAt = new Date().toISOString();
  if (data.status !== undefined) meta.status = data.status;
  if (data.audioPath !== undefined) meta.audioPath = data.audioPath;
  if (data.audioDuration !== undefined) meta.audioDuration = data.audioDuration;
  if (data.customFieldValues !== undefined) meta.customFieldValues = data.customFieldValues;
  if (data.piiMappings !== undefined) meta.piiMappings = data.piiMappings;
  if (data.errorMessage !== undefined) meta.errorMessage = data.errorMessage;
  if (data.transcriptionSource !== undefined) meta.transcriptionSource = data.transcriptionSource;

  await FileStorage.writeRecordingMeta(projectFolder, timestamp, meta);

  // --- Write content files ---
  if (data.transcription !== undefined) {
    await FileStorage.saveTranscription(projectFolder, timestamp, data.transcription);
  }
  if (data.transcriptionData !== undefined) {
    await FileStorage.saveTranscriptionSegments(projectFolder, timestamp, data.transcriptionData);
  }
  if (data.anonymizedTranscription !== undefined) {
    await FileStorage.saveAnonymizedTranscription(projectFolder, timestamp, data.anonymizedTranscription);
  }
  if (data.llmOutput !== undefined) {
    await FileStorage.saveLlmResponse(projectFolder, timestamp, data.llmOutput);
  }
}

/** Delete a recording and all its files */
export async function deleteRecording(id: string): Promise<void> {
  const { projectFolder, timestamp } = FileStorage.parseRecordingId(id);
  await FileStorage.deleteRecordingFiles(projectFolder, timestamp);
}

/** Move a recording to a different project and reset its processing state */
export async function moveRecording(id: string, targetProjectId: string): Promise<void> {
  const recording = await getRecordingById(id);
  if (!recording) return;

  const { projectFolder: srcFolder, timestamp } = FileStorage.parseRecordingId(id);

  // Copy audio
  const audioPath = await FileStorage.getAudioPath(srcFolder, timestamp);
  if (audioPath) {
    await FileStorage.saveAudio(targetProjectId, timestamp, audioPath);
  }

  // Write fresh metadata (reset processing state)
  const srcMeta = await FileStorage.readRecordingMeta(srcFolder, timestamp);
  const newMeta: FileStorage.RecordingMeta = {
    status: 'pending',
    customFieldValues: srcMeta?.customFieldValues ?? {},
    createdAt: srcMeta?.createdAt ?? new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
  if (audioPath) {
    const destAudio = await FileStorage.getAudioPath(targetProjectId, timestamp);
    if (destAudio) newMeta.audioPath = destAudio;
  }
  await FileStorage.writeRecordingMeta(targetProjectId, timestamp, newMeta);

  // Delete from source
  await FileStorage.deleteRecordingFiles(srcFolder, timestamp);
}
