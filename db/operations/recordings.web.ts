/**
 * Recording operations – web build (SQLite via sql.js).
 * Metro resolves this file instead of recordings.ts for web builds.
 * This is the original SQLite-based implementation, preserved for web.
 */
import { eq } from 'drizzle-orm';
import * as Crypto from 'expo-crypto';
import { db } from '../client';
import * as schema from '../schema';
import type { Recording } from '@/types';
import { deleteAudioFile } from '@/services/audioStorage';

/** Parse a raw DB recording row into the app's Recording type */
function toRecording(row: typeof schema.recordings.$inferSelect): Recording {
  return {
    id: row.id,
    projectId: row.projectId,
    status: row.status as Recording['status'],
    audioPath: row.audioPath ?? undefined,
    audioDuration: row.audioDuration ?? undefined,
    customFieldValues: row.customFieldValues ? JSON.parse(row.customFieldValues) : {},
    transcription: row.transcription ?? undefined,
    transcriptionData: row.transcriptionData ? JSON.parse(row.transcriptionData) : undefined,
    speakerMap: row.speakerMap ? JSON.parse(row.speakerMap) : undefined,
    anonymizedTranscription: row.anonymizedTranscription ?? undefined,
    piiMappings: row.piiMappings ? JSON.parse(row.piiMappings) : undefined,
    llmOutput: row.llmOutput ?? undefined,
    errorMessage: row.errorMessage ?? undefined,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

/** List all recordings for a project */
export async function getRecordingsByProject(projectId: string): Promise<Recording[]> {
  const rows = await db
    .select()
    .from(schema.recordings)
    .where(eq(schema.recordings.projectId, projectId))
    .orderBy(schema.recordings.createdAt);

  return rows.map(toRecording);
}

/** Get a single recording by ID */
export async function getRecordingById(id: string): Promise<Recording | null> {
  const rows = await db
    .select()
    .from(schema.recordings)
    .where(eq(schema.recordings.id, id))
    .limit(1);
  if (rows.length === 0) return null;
  return toRecording(rows[0]);
}

/** Create a new recording */
export async function createRecording(
  projectId: string,
  customFieldValues?: Record<string, any>
): Promise<Recording> {
  const now = new Date().toISOString();
  const id = Crypto.randomUUID();

  const values = {
    id,
    projectId,
    status: 'pending' as const,
    customFieldValues: customFieldValues ? JSON.stringify(customFieldValues) : null,
    createdAt: now,
    updatedAt: now,
  };

  await db.insert(schema.recordings).values(values);

  return toRecording({
    ...values,
    audioPath: null,
    audioDuration: null,
    transcription: null,
    transcriptionData: null,
    anonymizedTranscription: null,
    piiMappings: null,
    llmOutput: null,
    errorMessage: null,
  } as any);
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
    speakerMap: Record<string, string>;
    anonymizedTranscription: string;
    piiMappings: Record<string, string>;
    llmOutput: string;
    errorMessage: string;
  }>
): Promise<void> {
  const updates: Record<string, any> = { updatedAt: new Date().toISOString() };

  if (data.status !== undefined) updates.status = data.status;
  if (data.audioPath !== undefined) updates.audioPath = data.audioPath;
  if (data.audioDuration !== undefined) updates.audioDuration = data.audioDuration;
  if (data.customFieldValues !== undefined) updates.customFieldValues = JSON.stringify(data.customFieldValues);
  if (data.transcription !== undefined) updates.transcription = data.transcription;
  if (data.transcriptionData !== undefined) updates.transcriptionData = JSON.stringify(data.transcriptionData);
  if (data.anonymizedTranscription !== undefined) updates.anonymizedTranscription = data.anonymizedTranscription;
  if (data.piiMappings !== undefined) updates.piiMappings = JSON.stringify(data.piiMappings);
  if (data.llmOutput !== undefined) updates.llmOutput = data.llmOutput;
  if (data.errorMessage !== undefined) updates.errorMessage = data.errorMessage;
  if (data.speakerMap !== undefined) updates.speakerMap = JSON.stringify(data.speakerMap);

  await db.update(schema.recordings).set(updates).where(eq(schema.recordings.id, id));
}

/** Delete a recording and its audio file */
export async function deleteRecording(id: string): Promise<void> {
  const recording = await getRecordingById(id);
  if (recording?.audioPath) {
    await deleteAudioFile(recording.audioPath);
  }
  await db.delete(schema.recordings).where(eq(schema.recordings.id, id));
}

/** Move a recording to a different project and reset its processing state */
export async function moveRecording(id: string, targetProjectId: string): Promise<void> {
  await db
    .update(schema.recordings)
    .set({
      projectId: targetProjectId,
      status: 'pending',
      transcription: null,
      transcriptionData: null,
      anonymizedTranscription: null,
      piiMappings: null,
      llmOutput: null,
      errorMessage: null,
      updatedAt: new Date().toISOString(),
    })
    .where(eq(schema.recordings.id, id));
}
