/**
 * Storage migration service (native iOS/Android only)
 *
 * Handles:
 *  - Validating a new storage root path
 *  - Detecting whether an existing SafeTranscript folder structure lives there
 *  - Copying all data from the current root to a new root
 *  - Switching to a new (empty) root without copying
 */
import * as FileSystem from 'expo-file-system/legacy';
import {
  getStorageRoot,
  setStorageRoot,
  listProjectFolders,
} from './fileStorage';
import { setStorageRootSetting } from '@/db/operations/settings';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type MigrationChoice = 'copy' | 'clean';

export interface DetectionResult {
  /** Whether the target directory exists and contains a valid structure */
  hasExistingData: boolean;
  /** Number of project folders found (with config.json) */
  projectCount: number;
  /** Names of the detected projects */
  projectNames: string[];
}

// ---------------------------------------------------------------------------
// Path helpers
// ---------------------------------------------------------------------------

/** Normalise a user-entered path so it always ends with '/' */
export function normalisePath(input: string): string {
  let p = input.trim();
  if (!p) return '';
  // Ensure it ends with /
  if (!p.endsWith('/')) p += '/';
  return p;
}

/** Basic validation – the path must be non-empty and writable. */
export async function validatePath(path: string): Promise<{ valid: boolean; error?: string }> {
  if (!path?.trim()) {
    return { valid: false, error: 'Path cannot be empty.' };
  }

  const normalised = normalisePath(path);

  // Try to create the directory (intermediates) – this also tests write access
  try {
    await FileSystem.makeDirectoryAsync(normalised, { intermediates: true });
  } catch (e: any) {
    return {
      valid: false,
      error: `Cannot create directory: ${e.message ?? e}`,
    };
  }

  // Verify we can write a small probe file
  const probe = `${normalised}.st_probe_${Date.now()}`;
  try {
    await FileSystem.writeAsStringAsync(probe, 'ok');
    await FileSystem.deleteAsync(probe, { idempotent: true });
  } catch (e: any) {
    return {
      valid: false,
      error: `Directory is not writable: ${e.message ?? e}`,
    };
  }

  return { valid: true };
}

// ---------------------------------------------------------------------------
// Detection – does the target already contain SafeTranscript data?
// ---------------------------------------------------------------------------

/**
 * Scan the target directory for project folders (folders containing config.json).
 */
export async function detectExistingData(targetRoot: string): Promise<DetectionResult> {
  const normalised = normalisePath(targetRoot);
  const result: DetectionResult = {
    hasExistingData: false,
    projectCount: 0,
    projectNames: [],
  };

  try {
    const info = await FileSystem.getInfoAsync(normalised);
    if (!info.exists || !info.isDirectory) return result;

    const entries = await FileSystem.readDirectoryAsync(normalised);

    for (const entry of entries) {
      const entryPath = `${normalised}${entry}`;
      const entryInfo = await FileSystem.getInfoAsync(entryPath);
      if (!entryInfo.isDirectory) continue;

      // Check for config.json inside the folder
      const configPath = `${entryPath}/config.json`;
      const configInfo = await FileSystem.getInfoAsync(configPath);
      if (configInfo.exists) {
        result.projectNames.push(entry);
      }
    }

    result.projectCount = result.projectNames.length;
    result.hasExistingData = result.projectCount > 0;
  } catch {
    // If we can't read the dir, treat it as empty
  }

  return result;
}

// ---------------------------------------------------------------------------
// Copy all data from current root → new root
// ---------------------------------------------------------------------------

/**
 * Recursively copy a directory tree.
 * Uses FileSystem.copyAsync for files and manual recursion for dirs.
 */
async function copyDirRecursive(src: string, dest: string): Promise<void> {
  await FileSystem.makeDirectoryAsync(dest, { intermediates: true });

  const entries = await FileSystem.readDirectoryAsync(src);
  for (const entry of entries) {
    const srcPath = `${src}${entry}`;
    const destPath = `${dest}${entry}`;
    const info = await FileSystem.getInfoAsync(srcPath);

    if (info.isDirectory) {
      await copyDirRecursive(`${srcPath}/`, `${destPath}/`);
    } else {
      await FileSystem.copyAsync({ from: srcPath, to: destPath });
    }
  }
}

/**
 * Copy all project data from the current storage root to a new location.
 * @returns Number of projects copied.
 */
export async function copyDataToNewRoot(newRoot: string): Promise<number> {
  const normalised = normalisePath(newRoot);
  const currentRoot = getStorageRoot();

  if (normalised === currentRoot) {
    throw new Error('New path is the same as the current storage root.');
  }

  // Ensure the destination exists
  await FileSystem.makeDirectoryAsync(normalised, { intermediates: true });

  // Get all project folders from the current root
  const folders = await listProjectFolders();

  for (const folder of folders) {
    const srcDir = `${currentRoot}${folder}/`;
    const destDir = `${normalised}${folder}/`;

    // Check the source actually exists before copying
    const srcInfo = await FileSystem.getInfoAsync(srcDir);
    if (srcInfo.exists && srcInfo.isDirectory) {
      await copyDirRecursive(srcDir, destDir);
    }
  }

  return folders.length;
}

// ---------------------------------------------------------------------------
// Switch storage root (the main entry point for the settings screen)
// ---------------------------------------------------------------------------

/**
 * Change the storage root.
 *
 * @param newRoot       The new path to use.
 * @param choice        'copy' = copy existing data first, 'clean' = start fresh.
 * @param skipChoice    If true, the caller already determined the path has
 *                      existing data and no copy is needed (auto-adopt).
 * @returns A summary message for display.
 */
export async function changeStorageRoot(
  newRoot: string,
  choice: MigrationChoice | 'adopt',
): Promise<string> {
  const normalised = normalisePath(newRoot);
  const currentRoot = getStorageRoot();

  if (normalised === currentRoot) {
    throw new Error('New path is the same as the current storage root.');
  }

  // Validate writable
  const validation = await validatePath(normalised);
  if (!validation.valid) {
    throw new Error(validation.error);
  }

  let message = '';

  if (choice === 'copy') {
    const count = await copyDataToNewRoot(normalised);
    message = `Copied ${count} project(s) to the new location.`;
  } else if (choice === 'adopt') {
    const detection = await detectExistingData(normalised);
    message = `Opened existing data with ${detection.projectCount} project(s).`;
  } else {
    // 'clean' – just ensure the directory exists
    await FileSystem.makeDirectoryAsync(normalised, { intermediates: true });
    message = 'Started with a clean storage location.';
  }

  // Persist to SQLite and update the in-memory value
  await setStorageRootSetting(normalised);
  setStorageRoot(normalised);

  return message;
}
