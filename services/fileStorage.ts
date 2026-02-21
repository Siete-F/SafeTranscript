/**
 * File-based storage service (native iOS/Android)
 *
 * Stores projects and recordings in a human-readable folder structure:
 *
 *   {storageRoot}/
 *     {project-slug}/
 *       config.json                       — project settings
 *       recordings/
 *         {timestamp}.m4a                 — audio file
 *         {timestamp}.json                — recording metadata
 *       transcriptions/
 *         {timestamp}.txt                 — raw transcription
 *         {timestamp}.segments.json       — transcription segments
 *         {timestamp}.anonymized.txt      — anonymized transcription
 *       llm_responses/
 *         {timestamp}.md                  — LLM output
 *
 * The timestamp in the filename links the audio, transcription, and LLM
 * response together. General settings and API keys stay in SQLite.
 */
import * as FileSystem from 'expo-file-system/legacy';

// ---------------------------------------------------------------------------
// Storage root
// ---------------------------------------------------------------------------

const DEFAULT_ROOT = `${FileSystem.documentDirectory}SafeTranscript/`;

let _storageRoot: string = DEFAULT_ROOT;

export function setStorageRoot(root: string) {
  _storageRoot = root.endsWith('/') ? root : root + '/';
}

export function getStorageRoot(): string {
  return _storageRoot;
}

export function getDefaultStorageRoot(): string {
  return DEFAULT_ROOT;
}

// ---------------------------------------------------------------------------
// Path helpers
// ---------------------------------------------------------------------------

function projectDir(projectFolder: string): string {
  return `${_storageRoot}${projectFolder}/`;
}

function recordingsDir(projectFolder: string): string {
  return `${projectDir(projectFolder)}recordings/`;
}

function transcriptionsDir(projectFolder: string): string {
  return `${projectDir(projectFolder)}transcriptions/`;
}

function llmResponsesDir(projectFolder: string): string {
  return `${projectDir(projectFolder)}llm_responses/`;
}

// ---------------------------------------------------------------------------
// Directory helpers
// ---------------------------------------------------------------------------

async function ensureDir(path: string): Promise<void> {
  const info = await FileSystem.getInfoAsync(path);
  if (!info.exists) {
    await FileSystem.makeDirectoryAsync(path, { intermediates: true });
  }
}

async function ensureProjectDirs(projectFolder: string): Promise<void> {
  await ensureDir(recordingsDir(projectFolder));
  await ensureDir(transcriptionsDir(projectFolder));
  await ensureDir(llmResponsesDir(projectFolder));
}

// ---------------------------------------------------------------------------
// Slugify & timestamp
// ---------------------------------------------------------------------------

/** Convert a project name to a filesystem-safe folder name. */
export function slugify(name: string): string {
  return name
    .toLowerCase()
    .replaceAll(/[^a-z0-9]+/g, '-')
    .replaceAll(/(?:^-+)|(?:-+$)/g, '')
    .substring(0, 100) || 'project';
}

/**
 * Generate a timestamp-based ID for recordings.
 * Format: 2024-01-15T10-30-00-123  (colons/dots replaced with dashes)
 */
export function generateTimestampId(): string {
  const now = new Date();
  return now
    .toISOString()
    .replaceAll(':', '-')
    .replaceAll('.', '-')
    .replace(/Z$/, '');
}

// ---------------------------------------------------------------------------
// Generic file I/O
// ---------------------------------------------------------------------------

async function readJSON<T>(path: string): Promise<T | null> {
  try {
    const info = await FileSystem.getInfoAsync(path);
    if (!info.exists) return null;
    const content = await FileSystem.readAsStringAsync(path);
    return JSON.parse(content);
  } catch {
    return null;
  }
}

async function writeJSON(path: string, data: any): Promise<void> {
  await FileSystem.writeAsStringAsync(path, JSON.stringify(data, null, 2));
}

async function readText(path: string): Promise<string | null> {
  try {
    const info = await FileSystem.getInfoAsync(path);
    if (!info.exists) return null;
    return await FileSystem.readAsStringAsync(path);
  } catch {
    return null;
  }
}

async function writeText(path: string, text: string): Promise<void> {
  await FileSystem.writeAsStringAsync(path, text);
}

async function deleteIfExists(path: string): Promise<void> {
  try {
    const info = await FileSystem.getInfoAsync(path);
    if (info.exists) {
      await FileSystem.deleteAsync(path, { idempotent: true });
    }
  } catch {
    // Ignore
  }
}

// ---------------------------------------------------------------------------
// Project config
// ---------------------------------------------------------------------------

export interface ProjectConfig {
  name: string;
  description?: string;
  llmProvider: string;
  llmModel: string;
  llmPrompt: string;
  enableLlm: boolean;
  enableAnonymization: boolean;
  customFields: { name: string; type: string }[];
  sensitiveWords: string[];
  createdAt: string;
  updatedAt: string;
}

/** List all project folder names under the storage root. */
export async function listProjectFolders(): Promise<string[]> {
  await ensureDir(_storageRoot);
  const entries = await FileSystem.readDirectoryAsync(_storageRoot);
  const folders: string[] = [];
  for (const entry of entries) {
    const info = await FileSystem.getInfoAsync(`${_storageRoot}${entry}`);
    if (info.isDirectory) {
      // Only include folders that contain a config.json
      const configInfo = await FileSystem.getInfoAsync(`${_storageRoot}${entry}/config.json`);
      if (configInfo.exists) {
        folders.push(entry);
      }
    }
  }
  return folders.sort((a, b) => a.localeCompare(b));
}

export async function readProjectConfig(projectFolder: string): Promise<ProjectConfig | null> {
  return readJSON<ProjectConfig>(`${projectDir(projectFolder)}config.json`);
}

export async function writeProjectConfig(projectFolder: string, config: ProjectConfig): Promise<void> {
  await ensureProjectDirs(projectFolder);
  await writeJSON(`${projectDir(projectFolder)}config.json`, config);
}

export async function deleteProjectFolder(projectFolder: string): Promise<void> {
  const dir = projectDir(projectFolder);
  await deleteIfExists(dir);
}

export async function renameProjectFolder(oldFolder: string, newFolder: string): Promise<void> {
  if (oldFolder === newFolder) return;
  await FileSystem.moveAsync({
    from: projectDir(oldFolder),
    to: projectDir(newFolder),
  });
}

// ---------------------------------------------------------------------------
// Recording metadata
// ---------------------------------------------------------------------------

export interface RecordingMeta {
  status: string;
  audioPath?: string;
  audioDuration?: number;
  customFieldValues: Record<string, any>;
  piiMappings?: Record<string, string>;
  errorMessage?: string;
  createdAt: string;
  updatedAt: string;
}

/**
 * List all recording timestamps in a project.
 * Looks for .json metadata files in the recordings/ folder.
 */
export async function listRecordingTimestamps(projectFolder: string): Promise<string[]> {
  const dir = recordingsDir(projectFolder);
  await ensureDir(dir);
  const entries = await FileSystem.readDirectoryAsync(dir);
  const timestamps: string[] = [];
  for (const entry of entries) {
    if (entry.endsWith('.json')) {
      timestamps.push(entry.replace('.json', ''));
    }
  }
  return timestamps.sort((a, b) => a.localeCompare(b));
}

export async function readRecordingMeta(projectFolder: string, timestamp: string): Promise<RecordingMeta | null> {
  return readJSON<RecordingMeta>(`${recordingsDir(projectFolder)}${timestamp}.json`);
}

export async function writeRecordingMeta(projectFolder: string, timestamp: string, meta: RecordingMeta): Promise<void> {
  await ensureDir(recordingsDir(projectFolder));
  await writeJSON(`${recordingsDir(projectFolder)}${timestamp}.json`, meta);
}

// ---------------------------------------------------------------------------
// Audio files
// ---------------------------------------------------------------------------

const AUDIO_EXTENSIONS = new Set(['m4a', 'mp3', 'wav', 'caf', 'aac']);

function getAudioExtension(uri: string): string {
  const match = /\.(\w+)(?:\?.*)?$/.exec(uri);
  const ext = match?.[1]?.toLowerCase();
  return ext && AUDIO_EXTENSIONS.has(ext) ? ext : 'm4a';
}

/** Save an audio file into the project's recordings/ folder. */
export async function saveAudio(projectFolder: string, timestamp: string, sourceUri: string): Promise<string> {
  const dir = recordingsDir(projectFolder);
  await ensureDir(dir);
  const ext = getAudioExtension(sourceUri);
  const destPath = `${dir}${timestamp}.${ext}`;
  await FileSystem.copyAsync({ from: sourceUri, to: destPath });
  return destPath;
}

/** Find the audio file for a recording (any supported extension). */
export async function getAudioPath(projectFolder: string, timestamp: string): Promise<string | null> {
  const dir = recordingsDir(projectFolder);
  try {
    const entries = await FileSystem.readDirectoryAsync(dir);
    for (const entry of entries) {
      const ext = entry.split('.').pop()?.toLowerCase();
      const baseName = entry.substring(0, entry.length - (ext ? ext.length + 1 : 0));
      if (baseName === timestamp && ext && AUDIO_EXTENSIONS.has(ext)) {
        return `${dir}${entry}`;
      }
    }
  } catch {
    // Directory might not exist yet
  }
  return null;
}

// ---------------------------------------------------------------------------
// Transcription files
// ---------------------------------------------------------------------------

export async function saveTranscription(projectFolder: string, timestamp: string, text: string): Promise<void> {
  const dir = transcriptionsDir(projectFolder);
  await ensureDir(dir);
  await writeText(`${dir}${timestamp}.txt`, text);
}

export async function readTranscription(projectFolder: string, timestamp: string): Promise<string | null> {
  return readText(`${transcriptionsDir(projectFolder)}${timestamp}.txt`);
}

export async function saveTranscriptionSegments(projectFolder: string, timestamp: string, segments: any[]): Promise<void> {
  const dir = transcriptionsDir(projectFolder);
  await ensureDir(dir);
  await writeJSON(`${dir}${timestamp}.segments.json`, segments);
}

export async function readTranscriptionSegments(projectFolder: string, timestamp: string): Promise<any[] | null> {
  return readJSON<any[]>(`${transcriptionsDir(projectFolder)}${timestamp}.segments.json`);
}

export async function saveAnonymizedTranscription(projectFolder: string, timestamp: string, text: string): Promise<void> {
  const dir = transcriptionsDir(projectFolder);
  await ensureDir(dir);
  await writeText(`${dir}${timestamp}.anonymized.txt`, text);
}

export async function readAnonymizedTranscription(projectFolder: string, timestamp: string): Promise<string | null> {
  return readText(`${transcriptionsDir(projectFolder)}${timestamp}.anonymized.txt`);
}

// ---------------------------------------------------------------------------
// LLM response files
// ---------------------------------------------------------------------------

export async function saveLlmResponse(projectFolder: string, timestamp: string, text: string): Promise<void> {
  const dir = llmResponsesDir(projectFolder);
  await ensureDir(dir);
  await writeText(`${dir}${timestamp}.md`, text);
}

export async function readLlmResponse(projectFolder: string, timestamp: string): Promise<string | null> {
  return readText(`${llmResponsesDir(projectFolder)}${timestamp}.md`);
}

// ---------------------------------------------------------------------------
// Delete all files for a recording
// ---------------------------------------------------------------------------

export async function deleteRecordingFiles(projectFolder: string, timestamp: string): Promise<void> {
  // Audio (any extension)
  const audioPath = await getAudioPath(projectFolder, timestamp);
  if (audioPath) await deleteIfExists(audioPath);

  // Metadata
  await deleteIfExists(`${recordingsDir(projectFolder)}${timestamp}.json`);

  // Transcriptions
  await deleteIfExists(`${transcriptionsDir(projectFolder)}${timestamp}.txt`);
  await deleteIfExists(`${transcriptionsDir(projectFolder)}${timestamp}.segments.json`);
  await deleteIfExists(`${transcriptionsDir(projectFolder)}${timestamp}.anonymized.txt`);

  // LLM response
  await deleteIfExists(`${llmResponsesDir(projectFolder)}${timestamp}.md`);
}

// ---------------------------------------------------------------------------
// Composite Recording ID helpers
// ---------------------------------------------------------------------------

const ID_SEPARATOR = '::';

/** Build a composite recording ID from project folder and timestamp. */
export function makeRecordingId(projectFolder: string, timestamp: string): string {
  return `${projectFolder}${ID_SEPARATOR}${timestamp}`;
}

/** Parse a composite recording ID into its parts. */
export function parseRecordingId(id: string): { projectFolder: string; timestamp: string } {
  const idx = id.indexOf(ID_SEPARATOR);
  if (idx === -1) {
    throw new Error(`Invalid recording ID format: ${id}`);
  }
  return {
    projectFolder: id.substring(0, idx),
    timestamp: id.substring(idx + ID_SEPARATOR.length),
  };
}
