/**
 * GLiNER Inference Service
 * Orchestrates model loading, tokenization, processing, and decoding.
 * Uses CDN-loaded ONNX Runtime to avoid Metro bundling issues.
 */

import { getOrt } from './onnxRuntime';
import { initTokenizer } from './tokenizer';
import { prepareBatch } from './processor';
import { decodeTokenLevel } from './decoder';
import { DEFAULT_CONFIG, DEFAULT_THRESHOLD, PII_LABELS } from './config';
import { loadGLiNERModelFiles, checkGLiNERModelExists } from './GLiNERModelManager';
import type { GLiNEREntity, GLiNERConfig } from './types';

let _session: any = null; // ort.InferenceSession (loaded from CDN)
let _ort: any = null;     // ort module (loaded from CDN)
let _config: GLiNERConfig = DEFAULT_CONFIG;
let _initialized = false;

/**
 * Check if GLiNER model is available (downloaded and ready).
 */
export async function isGLiNERAvailable(): Promise<boolean> {
  return checkGLiNERModelExists();
}

/**
 * Initialize (or re-initialize) the GLiNER model.
 * Call this after model download completes.
 */
export async function initGLiNER(): Promise<void> {
  const files = await loadGLiNERModelFiles();
  if (!files) throw new Error('GLiNER model files not found. Download the model first.');

  // Initialize tokenizer
  initTokenizer(files.tokenizerJson);

  // Parse GLiNER config
  const rawConfig = files.glinerConfig;
  _config = {
    spanMode: rawConfig.span_mode || DEFAULT_CONFIG.spanMode,
    maxWidth: rawConfig.max_width || DEFAULT_CONFIG.maxWidth,
    maxLen: rawConfig.max_len || DEFAULT_CONFIG.maxLen,
    maxTypes: rawConfig.max_types || DEFAULT_CONFIG.maxTypes,
    entToken: rawConfig.ent_token || DEFAULT_CONFIG.entToken,
    sepToken: rawConfig.sep_token || DEFAULT_CONFIG.sepToken,
  };

  // Load ONNX Runtime from CDN
  _ort = await getOrt();

  // Create ONNX session
  console.log('[GLiNER] Creating ONNX inference session...');
  _session = await _ort.InferenceSession.create(files.modelBuffer, {
    executionProviders: ['wasm'],
    graphOptimizationLevel: 'all',
  });
  console.log('[GLiNER] Model loaded. Input names:', _session.inputNames);

  _initialized = true;
}

/**
 * Dispose of the ONNX session to free memory.
 */
export async function disposeGLiNER(): Promise<void> {
  if (_session) {
    await _session.release();
    _session = null;
  }
  _initialized = false;
}

/**
 * Run GLiNER PII detection on a text.
 *
 * @param text - Input text to scan for PII
 * @param labels - Entity labels to detect (defaults to PII_LABELS)
 * @param threshold - Confidence threshold (default: 0.3)
 * @returns Array of detected entities
 */
export async function detectPII(
  text: string,
  labels: string[] = PII_LABELS,
  threshold: number = DEFAULT_THRESHOLD,
): Promise<GLiNEREntity[]> {
  if (!_initialized || !_session) {
    await initGLiNER();
  }

  if (!_session) throw new Error('GLiNER session not available');

  // Handle long texts by chunking (model max_len is 2048 tokens)
  // For safety, chunk at ~500 words to stay well within limits
  const words = text.split(/\s+/);
  if (words.length > 500) {
    return detectPIIChunked(text, labels, threshold);
  }

  return runInference(text, labels, threshold);
}

async function runInference(
  text: string,
  labels: string[],
  threshold: number,
): Promise<GLiNEREntity[]> {
  if (!_session || !_ort) throw new Error('GLiNER session not available');

  // Prepare inputs
  const batch = prepareBatch([text], labels, _config.entToken, _config.sepToken);

  const seqLen = batch.inputIds[0].length;
  const batchSize = 1;

  // Create ONNX tensors
  const feeds: Record<string, any> = {
    input_ids: new _ort.Tensor('int64', BigInt64Array.from(batch.inputIds[0].map(BigInt)), [batchSize, seqLen]),
    attention_mask: new _ort.Tensor('int64', BigInt64Array.from(batch.attentionMask[0].map(BigInt)), [batchSize, seqLen]),
    words_mask: new _ort.Tensor('int64', BigInt64Array.from(batch.wordsMask[0].map(BigInt)), [batchSize, seqLen]),
    text_lengths: new _ort.Tensor('int64', BigInt64Array.from(batch.textLengths[0].map(BigInt)), [batchSize, 1]),
  };

  // Run inference
  console.log(`[GLiNER] Running inference on ${text.length} chars, ${labels.length} labels...`);
  const results = await _session.run(feeds);

  // Get output logits — shape: [batch, inputLength, numEntities, 3]
  const outputName = _session.outputNames[0];
  const output = results[outputName];
  const logits = output.data as Float32Array;
  const dims = output.dims;
  console.log(`[GLiNER] Output dims: [${dims.join(', ')}], total elements: ${logits.length}`);

  // dims = [batchSize, inputLength, numEntities, 3]
  const numEntities = Number(dims[2]);
  const inputLength = Number(dims[1]);

  // Decode entities
  const entities = decodeTokenLevel(
    logits,
    batchSize,
    inputLength,
    numEntities,
    labels,
    [text],
    batch.batchWordsStartIdx,
    batch.batchWordsEndIdx,
    batch.batchTokens,
    batch.wordsMask,
    threshold,
  );

  console.log(`[GLiNER] Detected ${entities[0].length} entities`);
  return entities[0];
}

/**
 * Handle long texts by splitting into overlapping chunks.
 */
async function detectPIIChunked(
  text: string,
  labels: string[],
  threshold: number,
): Promise<GLiNEREntity[]> {
  const CHUNK_SIZE = 400; // words
  const OVERLAP = 50;    // words overlap between chunks
  const words = text.split(/\s+/);
  const allEntities: GLiNEREntity[] = [];
  const seenSpans = new Set<string>();

  for (let i = 0; i < words.length; i += CHUNK_SIZE - OVERLAP) {
    const chunkWords = words.slice(i, i + CHUNK_SIZE);
    const chunkText = chunkWords.join(' ');

    // Calculate the character offset of this chunk in the original text
    const chunkStartChar = text.indexOf(chunkWords[0], i > 0 ? text.indexOf(words[i - 1]) : 0);

    const entities = await runInference(chunkText, labels, threshold);

    for (const entity of entities) {
      // Adjust offsets to original text
      const adjustedEntity = {
        ...entity,
        start: entity.start + chunkStartChar,
        end: entity.end + chunkStartChar,
      };

      // Deduplicate across overlapping chunks
      const key = `${adjustedEntity.start}-${adjustedEntity.end}-${adjustedEntity.label}`;
      if (!seenSpans.has(key)) {
        seenSpans.add(key);
        allEntities.push(adjustedEntity);
      }
    }
  }

  return allEntities.sort((a, b) => a.start - b.start);
}
