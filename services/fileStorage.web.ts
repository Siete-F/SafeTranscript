/**
 * File storage service – web stub.
 *
 * On web there is no real filesystem access, so we expose the same API
 * surface but throw when called.  Web builds continue to use the SQLite
 * (sql.js) backed operations in projects.web.ts / recordings.web.ts,
 * so these functions should never actually be reached at runtime.
 */

const DEFAULT_ROOT = '/SafeTranscript/';

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

export function slugify(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .substring(0, 100) || 'project';
}

export function generateTimestampId(): string {
  const now = new Date();
  return now
    .toISOString()
    .replace(/:/g, '-')
    .replace(/\./g, '-')
    .replace(/Z$/, '');
}

// All remaining exports are no-ops / stubs – web uses SQLite instead.

export interface ProjectConfig {
  name: string;
  description?: string;
  llmProvider: string;
  llmModel: string;
  llmPrompt: string;
  enableAnonymization: boolean;
  customFields: { name: string; type: string }[];
  sensitiveWords: string[];
  createdAt: string;
  updatedAt: string;
}

export interface RecordingMeta {
  status: string;
  audioPath?: string;
  audioDuration?: number;
  customFieldValues: Record<string, any>;
  transcriptionSource?: string;
  speakerMap?: Record<string, string>;
  piiMappings?: Record<string, string>;
  errorMessage?: string;
  createdAt: string;
  updatedAt: string;
}

const ID_SEPARATOR = '::';

export function makeRecordingId(projectFolder: string, timestamp: string): string {
  return `${projectFolder}${ID_SEPARATOR}${timestamp}`;
}

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

/* istanbul ignore next – stubs for type-checking only */
export async function listProjectFolders(): Promise<string[]> { return []; }
export async function readProjectConfig(_f: string): Promise<ProjectConfig | null> { return null; }
export async function writeProjectConfig(_f: string, _c: ProjectConfig): Promise<void> {}
export async function deleteProjectFolder(_f: string): Promise<void> {}
export async function renameProjectFolder(_o: string, _n: string): Promise<void> {}
export async function listRecordingTimestamps(_p: string): Promise<string[]> { return []; }
export async function readRecordingMeta(_p: string, _t: string): Promise<RecordingMeta | null> { return null; }
export async function writeRecordingMeta(_p: string, _t: string, _m: RecordingMeta): Promise<void> {}
export async function saveAudio(_p: string, _t: string, _s: string): Promise<string> { return _s; }
export async function getAudioPath(_p: string, _t: string): Promise<string | null> { return null; }
export async function saveTranscription(_p: string, _t: string, _text: string): Promise<void> {}
export async function readTranscription(_p: string, _t: string): Promise<string | null> { return null; }
export async function saveTranscriptionSegments(_p: string, _t: string, _s: any[]): Promise<void> {}
export async function readTranscriptionSegments(_p: string, _t: string): Promise<any[] | null> { return null; }
export async function saveAnonymizedTranscription(_p: string, _t: string, _text: string): Promise<void> {}
export async function readAnonymizedTranscription(_p: string, _t: string): Promise<string | null> { return null; }
export async function saveLlmResponse(_p: string, _t: string, _text: string): Promise<void> {}
export async function readLlmResponse(_p: string, _t: string): Promise<string | null> { return null; }
export async function deleteRecordingFiles(_p: string, _t: string): Promise<void> {}
