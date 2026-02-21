/**
 * Web-specific database client using sql.js (WebAssembly SQLite).
 * Metro automatically resolves this file for web builds instead of client.ts.
 * Data is persisted to localStorage.
 */
import initSqlJs, { type Database } from 'sql.js';
import { drizzle } from 'drizzle-orm/sql-js';
import * as schema from './schema';

const STORAGE_KEY = 'safetranscript_db';

let _sqlDb: Database | null = null;
let _drizzleDb: ReturnType<typeof drizzle<typeof schema>> | null = null;

/**
 * Proxy that forwards all property access to the real drizzle instance.
 * This lets operations import `db` at module level and use it after init.
 */
export const db: ReturnType<typeof drizzle<typeof schema>> = new Proxy({} as any, {
  get(_target, prop) {
    if (!_drizzleDb) throw new Error('Database not initialized. Call initializeDatabase() first.');
    return (_drizzleDb as any)[prop];
  },
});

function loadFromStorage(): Uint8Array | null {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved) {
      return new Uint8Array(JSON.parse(saved));
    }
  } catch {
    // Ignore parse errors
  }
  return null;
}

function saveToStorage() {
  if (!_sqlDb) return;
  try {
    const data = _sqlDb.export();
    localStorage.setItem(STORAGE_KEY, JSON.stringify(Array.from(data)));
  } catch (e) {
    console.warn('[DB Web] Failed to persist database to localStorage:', e);
  }
}

/**
 * Initialize the sql.js database for web. Must be called and awaited before
 * any DB operations.
 */
export async function initializeDatabase() {
  if (_drizzleDb) return;

  const SQL = await initSqlJs({
    locateFile: (file: string) => `https://cdn.jsdelivr.net/npm/sql.js@1.14.0/dist/${file}`,
  });

  const savedData = loadFromStorage();
  _sqlDb = savedData ? new SQL.Database(savedData) : new SQL.Database();

  _sqlDb.run('PRAGMA journal_mode = WAL;');
  _sqlDb.run('PRAGMA foreign_keys = ON;');

  _sqlDb.run(`
    CREATE TABLE IF NOT EXISTS projects (
      id TEXT PRIMARY KEY NOT NULL,
      name TEXT NOT NULL,
      description TEXT,
      llm_provider TEXT NOT NULL,
      llm_model TEXT NOT NULL,
      llm_prompt TEXT NOT NULL,
      enable_llm INTEGER NOT NULL DEFAULT 1,
      enable_anonymization INTEGER NOT NULL DEFAULT 1,
      custom_fields TEXT,
      sensitive_words TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS recordings (
      id TEXT PRIMARY KEY NOT NULL,
      project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
      status TEXT NOT NULL DEFAULT 'pending',
      audio_path TEXT,
      audio_duration INTEGER,
      custom_field_values TEXT,
      transcription TEXT,
      transcription_data TEXT,
      anonymized_transcription TEXT,
      pii_mappings TEXT,
      llm_output TEXT,
      error_message TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS api_keys (
      id TEXT PRIMARY KEY NOT NULL,
      openai_key TEXT,
      gemini_key TEXT,
      mistral_key TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS settings (
      key TEXT PRIMARY KEY NOT NULL,
      value TEXT NOT NULL
    );
  `);

  // Migrate: add enable_llm column if missing (for existing databases)
  try {
    const tableInfo = _sqlDb.exec('PRAGMA table_info(projects)');
    if (tableInfo.length > 0) {
      const columns = tableInfo[0].values.map((row: any) => row[1]);
      if (!columns.includes('enable_llm')) {
        _sqlDb.run('ALTER TABLE projects ADD COLUMN enable_llm INTEGER NOT NULL DEFAULT 1');
      }
    }
  } catch (e) {
    console.warn('[DB Web] Migration warning:', e);
  }

  _drizzleDb = drizzle(_sqlDb, { schema });

  // Persist after init
  saveToStorage();

  // Auto-persist on page unload
  window.addEventListener('beforeunload', saveToStorage);

  // Also persist periodically (every 5 seconds if there were changes)
  setInterval(saveToStorage, 5000);
}
