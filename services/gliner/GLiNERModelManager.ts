/**
 * GLiNER Model Manager — Native Platform (iOS/Android)
 * Downloads and stores model files using expo-file-system.
 * Supports multiple model variants (INT8, FP16).
 */

import * as FileSystem from 'expo-file-system/legacy';
import { MODEL_VARIANTS, DEFAULT_VARIANT } from './config';
import type { ModelVariantId } from './config';

const MODEL_DIR = `${FileSystem.documentDirectory}gliner-pii/`;

/** File that records which variant is currently stored */
const VARIANT_FILE = `${MODEL_DIR}variant.txt`;

async function ensureModelDir(): Promise<void> {
  const info = await FileSystem.getInfoAsync(MODEL_DIR);
  if (!info.exists) {
    await FileSystem.makeDirectoryAsync(MODEL_DIR, { intermediates: true });
  }
}

/**
 * Get the currently downloaded variant, or null if none.
 */
export async function getDownloadedVariant(): Promise<ModelVariantId | null> {
  try {
    const info = await FileSystem.getInfoAsync(VARIANT_FILE);
    if (!info.exists) return null;
    const content = await FileSystem.readAsStringAsync(VARIANT_FILE);
    const id = content.trim() as ModelVariantId;
    return MODEL_VARIANTS[id] ? id : null;
  } catch {
    return null;
  }
}

/**
 * Check if all model files are downloaded.
 */
export async function checkGLiNERModelExists(): Promise<boolean> {
  try {
    const modelInfo = await FileSystem.getInfoAsync(`${MODEL_DIR}model.onnx`);
    const tokenizerInfo = await FileSystem.getInfoAsync(`${MODEL_DIR}tokenizer.json`);
    const configInfo = await FileSystem.getInfoAsync(`${MODEL_DIR}gliner_config.json`);
    return modelInfo.exists && tokenizerInfo.exists && configInfo.exists;
  } catch {
    return false;
  }
}

/**
 * Download model files from HuggingFace.
 * @param onProgress - Progress callback (0 to 1)
 * @param variantId - Which model variant to download (default: multi_int8)
 */
export async function downloadGLiNERModel(
  onProgress: (progress: number) => void,
  variantId: ModelVariantId = DEFAULT_VARIANT,
): Promise<void> {
  const variant = MODEL_VARIANTS[variantId];
  if (!variant) throw new Error(`Unknown model variant: ${variantId}`);

  await ensureModelDir();

  // Download config
  onProgress(0);
  console.log('[GLiNERModelManager] Downloading gliner_config.json...');
  await FileSystem.downloadAsync(variant.urls.glinerConfig, `${MODEL_DIR}gliner_config.json`);
  onProgress(0.02);

  // Download tokenizer
  console.log('[GLiNERModelManager] Downloading tokenizer.json...');
  await FileSystem.downloadAsync(variant.urls.tokenizer, `${MODEL_DIR}tokenizer.json`);
  onProgress(0.1);

  // Download model (with progress)
  console.log(`[GLiNERModelManager] Downloading ${variant.name} (${variant.sizeMB} MB)...`);
  const downloader = FileSystem.createDownloadResumable(
    variant.urls.model,
    `${MODEL_DIR}model.onnx`,
    {},
    (downloadProgress) => {
      const p = downloadProgress.totalBytesWritten / downloadProgress.totalBytesExpectedToWrite;
      onProgress(0.1 + p * 0.9);
    },
  );

  await downloader.downloadAsync();

  // Record which variant was downloaded
  await FileSystem.writeAsStringAsync(VARIANT_FILE, variantId);

  onProgress(1);
  console.log(`[GLiNERModelManager] ${variant.name} downloaded.`);
}

/**
 * Delete all stored model files.
 */
export async function deleteGLiNERModel(): Promise<void> {
  try {
    const info = await FileSystem.getInfoAsync(MODEL_DIR);
    if (info.exists) {
      await FileSystem.deleteAsync(MODEL_DIR, { idempotent: true });
    }
    console.log('[GLiNERModelManager] Model files deleted.');
  } catch (error) {
    console.error('[GLiNERModelManager] Error deleting model:', error);
    throw error;
  }
}

/**
 * Load model files from disk.
 * Returns null if not all files are present.
 */
export async function loadGLiNERModelFiles(): Promise<{
  modelBuffer: ArrayBuffer;
  tokenizerJson: any;
  glinerConfig: any;
} | null> {
  try {
    const exists = await checkGLiNERModelExists();
    if (!exists) return null;

    // Read tokenizer and config as JSON
    const tokenizerStr = await FileSystem.readAsStringAsync(`${MODEL_DIR}tokenizer.json`);
    const configStr = await FileSystem.readAsStringAsync(`${MODEL_DIR}gliner_config.json`);
    const tokenizerJson = JSON.parse(tokenizerStr);
    const glinerConfig = JSON.parse(configStr);

    // Read model as base64 and convert to ArrayBuffer
    const modelBase64 = await FileSystem.readAsStringAsync(`${MODEL_DIR}model.onnx`, {
      encoding: FileSystem.EncodingType.Base64,
    });
    const binaryString = atob(modelBase64);
    const bytes = new Uint8Array(binaryString.length);
    for (let i = 0; i < binaryString.length; i++) {
      bytes[i] = binaryString.codePointAt(i) ?? 0;
    }

    return { modelBuffer: bytes.buffer, tokenizerJson, glinerConfig };
  } catch (error) {
    console.error('[GLiNERModelManager] Error loading model files:', error);
    return null;
  }
}
