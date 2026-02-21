/**
 * Project operations – native build (file-based storage).
 *
 * Each project is a folder under the storage root containing a config.json
 * and sub-folders for recordings, transcriptions, and llm_responses.
 * The folder name (slug) is the project ID used throughout the app.
 */
import type { Project } from '@/types';
import * as FileStorage from '@/services/fileStorage';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function configToProject(
  folder: string,
  config: FileStorage.ProjectConfig,
  recordingCount?: number,
): Project {
  return {
    id: folder,
    name: config.name,
    description: config.description,
    llmProvider: config.llmProvider as Project['llmProvider'],
    llmModel: config.llmModel,
    llmPrompt: config.llmPrompt,
    enableLlm: config.enableLlm ?? true,
    enableAnonymization: config.enableAnonymization,
    customFields: (config.customFields ?? []) as Project['customFields'],
    sensitiveWords: config.sensitiveWords ?? [],
    recordingCount,
    createdAt: config.createdAt,
    updatedAt: config.updatedAt,
  };
}

// ---------------------------------------------------------------------------
// CRUD
// ---------------------------------------------------------------------------

/** List all projects with recording counts */
export async function getAllProjects(): Promise<Project[]> {
  const folders = await FileStorage.listProjectFolders();
  const projects: Project[] = [];

  for (const folder of folders) {
    const config = await FileStorage.readProjectConfig(folder);
    if (!config) continue;
    const timestamps = await FileStorage.listRecordingTimestamps(folder);
    projects.push(configToProject(folder, config, timestamps.length));
  }

  return projects.sort((a, b) => a.createdAt.localeCompare(b.createdAt));
}

/** Get a single project by ID (folder name) */
export async function getProjectById(id: string): Promise<Project | null> {
  const config = await FileStorage.readProjectConfig(id);
  if (!config) return null;
  return configToProject(id, config);
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

  // Derive a unique folder slug from the project name
  let folder = FileStorage.slugify(data.name);
  const existing = await FileStorage.listProjectFolders();
  if (existing.includes(folder)) {
    let suffix = 2;
    while (existing.includes(`${folder}-${suffix}`)) suffix++;
    folder = `${folder}-${suffix}`;
  }

  const config: FileStorage.ProjectConfig = {
    name: data.name,
    description: data.description,
    llmProvider: data.llmProvider,
    llmModel: data.llmModel,
    llmPrompt: data.llmPrompt,
    enableLlm: data.enableLlm ?? true,
    enableAnonymization: data.enableAnonymization ?? true,
    customFields: data.customFields ?? [],
    sensitiveWords: data.sensitiveWords ?? [],
    createdAt: now,
    updatedAt: now,
  };

  await FileStorage.writeProjectConfig(folder, config);
  return configToProject(folder, config, 0);
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
  }>,
): Promise<Project | null> {
  const config = await FileStorage.readProjectConfig(id);
  if (!config) return null;

  const updated: FileStorage.ProjectConfig = {
    ...config,
    updatedAt: new Date().toISOString(),
  };

  if (data.name !== undefined) updated.name = data.name;
  if (data.description !== undefined) updated.description = data.description;
  if (data.llmProvider !== undefined) updated.llmProvider = data.llmProvider;
  if (data.llmModel !== undefined) updated.llmModel = data.llmModel;
  if (data.llmPrompt !== undefined) updated.llmPrompt = data.llmPrompt;
  if (data.enableLlm !== undefined) updated.enableLlm = data.enableLlm;
  if (data.enableAnonymization !== undefined) updated.enableAnonymization = data.enableAnonymization;
  if (data.customFields !== undefined) updated.customFields = data.customFields;
  if (data.sensitiveWords !== undefined) updated.sensitiveWords = data.sensitiveWords;

  // If the name changed, try to rename the folder
  let newFolder = id;
  if (data.name !== undefined && data.name !== config.name) {
    const newSlug = FileStorage.slugify(data.name);
    if (newSlug !== id) {
      const existing = await FileStorage.listProjectFolders();
      if (!existing.includes(newSlug)) {
        await FileStorage.renameProjectFolder(id, newSlug);
        newFolder = newSlug;
      }
    }
  }

  await FileStorage.writeProjectConfig(newFolder, updated);
  return configToProject(newFolder, updated);
}

/** Delete a project. Throws if it still has recordings. */
export async function deleteProject(id: string): Promise<void> {
  const timestamps = await FileStorage.listRecordingTimestamps(id);
  if (timestamps.length > 0) {
    throw new Error('Cannot delete project with existing recordings. Delete recordings first.');
  }
  await FileStorage.deleteProjectFolder(id);
}
