/**
 * App-level settings stored in SQLite.
 * Used for values that should be slightly more private (storage root path)
 * or that don't belong in the file-based project structure.
 */
import { eq } from 'drizzle-orm';
import { db } from '../client';
import * as schema from '../schema';

/** Get a single setting value by key. */
export async function getSetting(key: string): Promise<string | null> {
  const rows = await db
    .select()
    .from(schema.settings)
    .where(eq(schema.settings.key, key))
    .limit(1);
  return rows.length > 0 ? rows[0].value : null;
}

/** Set a single setting value (upsert). */
export async function setSetting(key: string, value: string): Promise<void> {
  const existing = await getSetting(key);
  if (existing !== null) {
    await db
      .update(schema.settings)
      .set({ value })
      .where(eq(schema.settings.key, key));
  } else {
    await db.insert(schema.settings).values({ key, value });
  }
}

// --- Well-known setting keys ---

export const SETTING_STORAGE_ROOT = 'storage_root';

/** Get the configured storage root path, or null for default. */
export async function getStorageRootSetting(): Promise<string | null> {
  return getSetting(SETTING_STORAGE_ROOT);
}

/** Set the storage root path. */
export async function setStorageRootSetting(path: string): Promise<void> {
  return setSetting(SETTING_STORAGE_ROOT, path);
}
