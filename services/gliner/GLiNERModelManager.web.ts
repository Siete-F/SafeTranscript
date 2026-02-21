/**
 * GLiNER Model Manager — Web Platform
 * Downloads and stores model files using IndexedDB for persistence.
 */

import { MODEL_FILES, MODEL_SIZE_MB, IDB_DB_NAME, IDB_STORE_NAME, IDB_DB_VERSION } from './config';

// --- IndexedDB Helpers ---

function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(IDB_DB_NAME, IDB_DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(IDB_STORE_NAME)) {
        db.createObjectStore(IDB_STORE_NAME);
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

function idbGet(db: IDBDatabase, key: string): Promise<any> {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(IDB_STORE_NAME, 'readonly');
    const store = tx.objectStore(IDB_STORE_NAME);
    const request = store.get(key);
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

function idbPut(db: IDBDatabase, key: string, value: any): Promise<void> {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(IDB_STORE_NAME, 'readwrite');
    const store = tx.objectStore(IDB_STORE_NAME);
    const request = store.put(value, key);
    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
  });
}

function idbDelete(db: IDBDatabase, key: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(IDB_STORE_NAME, 'readwrite');
    const store = tx.objectStore(IDB_STORE_NAME);
    const request = store.delete(key);
    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
  });
}

// --- Public API ---

/**
 * Check if all model files are downloaded and stored.
 */
export async function checkGLiNERModelExists(): Promise<boolean> {
  try {
    const db = await openDB();
    const model = await idbGet(db, 'model');
    const tokenizer = await idbGet(db, 'tokenizer');
    const config = await idbGet(db, 'glinerConfig');
    db.close();
    return model != null && tokenizer != null && config != null;
  } catch (error) {
    console.error('[GLiNERModelManager] Error checking model:', error);
    return false;
  }
}

/**
 * Download model files from HuggingFace and store in IndexedDB.
 * @param onProgress - Progress callback (0 to 1)
 */
export async function downloadGLiNERModel(
  onProgress: (progress: number) => void,
): Promise<void> {
  const db = await openDB();

  try {
    // Download config first (smallest)
    onProgress(0);
    console.log('[GLiNERModelManager] Downloading gliner_config.json...');
    const configRes = await fetch(MODEL_FILES.glinerConfig);
    if (!configRes.ok) throw new Error(`Failed to download config: ${configRes.status}`);
    const configJson = await configRes.json();
    await idbPut(db, 'glinerConfig', configJson);
    onProgress(0.02);

    // Download tokenizer.json (~3.5MB)
    console.log('[GLiNERModelManager] Downloading tokenizer.json...');
    const tokenizerRes = await fetch(MODEL_FILES.tokenizer);
    if (!tokenizerRes.ok) throw new Error(`Failed to download tokenizer: ${tokenizerRes.status}`);
    const tokenizerJson = await tokenizerRes.json();
    await idbPut(db, 'tokenizer', tokenizerJson);
    onProgress(0.1);

    // Download model.onnx (~46MB) with progress tracking
    console.log('[GLiNERModelManager] Downloading model_quint8.onnx...');
    const modelRes = await fetch(MODEL_FILES.model);
    if (!modelRes.ok) throw new Error(`Failed to download model: ${modelRes.status}`);

    const contentLength = modelRes.headers.get('content-length');
    const totalBytes = contentLength ? parseInt(contentLength, 10) : MODEL_SIZE_MB * 1024 * 1024;

    const reader = modelRes.body?.getReader();
    if (!reader) {
      // Fallback: download all at once
      const buffer = await modelRes.arrayBuffer();
      await idbPut(db, 'model', buffer);
      onProgress(1);
      return;
    }

    const chunks: Uint8Array[] = [];
    let receivedBytes = 0;
    let readResult = await reader.read();

    while (!readResult.done) {
      const value = readResult.value;
      chunks.push(value);
      receivedBytes += value.length;
      // Model download is 10%-100% of total progress
      const modelProgress = receivedBytes / totalBytes;
      onProgress(0.1 + modelProgress * 0.9);
      readResult = await reader.read();
    }

    // Combine chunks into a single ArrayBuffer
    const modelBuffer = new Uint8Array(receivedBytes);
    let offset = 0;
    for (const chunk of chunks) {
      modelBuffer.set(chunk, offset);
      offset += chunk.length;
    }

    await idbPut(db, 'model', modelBuffer.buffer);
    onProgress(1);
    console.log('[GLiNERModelManager] All files downloaded and stored.');
  } finally {
    db.close();
  }
}

/**
 * Delete all stored model files.
 */
export async function deleteGLiNERModel(): Promise<void> {
  try {
    const db = await openDB();
    await idbDelete(db, 'model');
    await idbDelete(db, 'tokenizer');
    await idbDelete(db, 'glinerConfig');
    db.close();
    console.log('[GLiNERModelManager] Model files deleted.');
  } catch (error) {
    console.error('[GLiNERModelManager] Error deleting model:', error);
    throw error;
  }
}

/**
 * Load model files from IndexedDB.
 * Returns null if not all files are present.
 */
export async function loadGLiNERModelFiles(): Promise<{
  modelBuffer: ArrayBuffer;
  tokenizerJson: any;
  glinerConfig: any;
} | null> {
  try {
    const db = await openDB();
    const modelBuffer = await idbGet(db, 'model');
    const tokenizerJson = await idbGet(db, 'tokenizer');
    const glinerConfig = await idbGet(db, 'glinerConfig');
    db.close();

    if (!modelBuffer || !tokenizerJson || !glinerConfig) return null;

    return { modelBuffer, tokenizerJson, glinerConfig };
  } catch (error) {
    console.error('[GLiNERModelManager] Error loading model files:', error);
    return null;
  }
}
