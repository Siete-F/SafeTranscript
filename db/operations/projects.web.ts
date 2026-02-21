/**
 * Project operations – web build (SQLite via sql.js).
 * Metro resolves this file instead of projects.ts for web builds.
 * This is the original SQLite-based implementation, preserved for web.
 */
import { eq, sql } from 'drizzle-orm';
import * as Crypto from 'expo-crypto';
import { db } from '../client';
import * as schema from '../schema';
import type { Project } from '@/types';

/** Parse a raw DB project row into the app's Project type */
function toProject(row: typeof schema.projects.$inferSelect, recordingCount?: number): Project {
  return {
    id: row.id,
    name: row.name,
    description: row.description ?? undefined,
    llmProvider: row.llmProvider as Project['llmProvider'],
    llmModel: row.llmModel,
    llmPrompt: row.llmPrompt,
    enableLlm: (row as any).enableLlm ?? true,
    enableAnonymization: row.enableAnonymization,
    customFields: row.customFields ? JSON.parse(row.customFields) : [],
    sensitiveWords: row.sensitiveWords ? JSON.parse(row.sensitiveWords) : [],
    recordingCount,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

/** List all projects with recording counts */
export async function getAllProjects(): Promise<Project[]> {
  const rows = await db.select().from(schema.projects).orderBy(schema.projects.createdAt);

  // Get recording counts in one query
  const counts = await db
    .select({
      projectId: schema.recordings.projectId,
      count: sql<number>`count(*)`.as('count'),
    })
    .from(schema.recordings)
    .groupBy(schema.recordings.projectId);

  const countMap = new Map(counts.map((c) => [c.projectId, c.count]));

  return rows.map((row) => toProject(row, countMap.get(row.id) ?? 0));
}

/** Get a single project by ID */
export async function getProjectById(id: string): Promise<Project | null> {
  const rows = await db
    .select()
    .from(schema.projects)
    .where(eq(schema.projects.id, id))
    .limit(1);
  if (rows.length === 0) return null;
  return toProject(rows[0]);
}

/** Create a new project */
export async function createProject(data: {
  name: string;
  description?: string;
  llmProvider: string;
  llmModel: string;
  llmPrompt: string;
  enableLlm?: boolean;
  enableAnonymization?: boolean;
  customFields?: any[];
  sensitiveWords?: string[];
}): Promise<Project> {
  const now = new Date().toISOString();
  const id = Crypto.randomUUID();

  const values = {
    id,
    name: data.name,
    description: data.description ?? null,
    llmProvider: data.llmProvider,
    llmModel: data.llmModel,
    llmPrompt: data.llmPrompt,
    enableLlm: data.enableLlm ?? true,
    enableAnonymization: data.enableAnonymization ?? true,
    customFields: data.customFields ? JSON.stringify(data.customFields) : null,
    sensitiveWords: data.sensitiveWords ? JSON.stringify(data.sensitiveWords) : null,
    createdAt: now,
    updatedAt: now,
  };

  await db.insert(schema.projects).values(values);

  return toProject({ ...values, enableAnonymization: values.enableAnonymization } as any);
}

/** Update an existing project */
export async function updateProject(
  id: string,
  data: Partial<{
    name: string;
    description: string;
    llmProvider: string;
    llmModel: string;
    llmPrompt: string;
    enableLlm: boolean;
    enableAnonymization: boolean;
    customFields: any[];
    sensitiveWords: string[];
  }>
): Promise<Project | null> {
  const updates: Record<string, any> = { updatedAt: new Date().toISOString() };

  if (data.name !== undefined) updates.name = data.name;
  if (data.description !== undefined) updates.description = data.description;
  if (data.llmProvider !== undefined) updates.llmProvider = data.llmProvider;
  if (data.llmModel !== undefined) updates.llmModel = data.llmModel;
  if (data.llmPrompt !== undefined) updates.llmPrompt = data.llmPrompt;
  if (data.enableLlm !== undefined) updates.enableLlm = data.enableLlm;
  if (data.enableAnonymization !== undefined) updates.enableAnonymization = data.enableAnonymization;
  if (data.customFields !== undefined) updates.customFields = JSON.stringify(data.customFields);
  if (data.sensitiveWords !== undefined) updates.sensitiveWords = JSON.stringify(data.sensitiveWords);

  await db.update(schema.projects).set(updates).where(eq(schema.projects.id, id));

  return getProjectById(id);
}

/** Delete a project. Throws if it still has recordings. */
export async function deleteProject(id: string): Promise<void> {
  const [countRow] = await db
    .select({ count: sql<number>`count(*)` })
    .from(schema.recordings)
    .where(eq(schema.recordings.projectId, id));

  if (countRow && countRow.count > 0) {
    throw new Error('Cannot delete project with existing recordings. Delete recordings first.');
  }

  await db.delete(schema.projects).where(eq(schema.projects.id, id));
}
