/**
 * GLiNER Inference Service
 * Orchestrates model loading, tokenization, processing, and decoding.
 * Supports both token_level and markerV0 (span) modes, auto-detected from model.
 * Uses CDN-loaded ONNX Runtime to avoid Metro bundling issues.
 */

import { getOrt } from './onnxRuntime';
import { initTokenizer } from './tokenizer';
import { prepareBatch, prepareSpanBatch } from './processor';
import { decodeTokenLevel, decodeSpanLevel } from './decoder';
import { DEFAULT_CONFIG, DEFAULT_THRESHOLD, PII_LABELS } from './config';
import { loadGLiNERModelFiles, checkGLiNERModelExists } from './GLiNERModelManager';
import type { GLiNEREntity, GLiNERConfig } from './types';

let _session: any = null; // ort.InferenceSession (loaded from CDN)
let _ort: any = null;     // ort module (loaded from CDN)
let _config: GLiNERConfig = DEFAULT_CONFIG;
let _initialized = false;
let _isSpanMode = false;  // auto-detected from model inputs or config

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

  // Initialize tokenizer (auto-detects BPE vs Unigram)
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

  // Detect span mode from config
  _isSpanMode = _config.spanMode === 'markerV0' || _config.spanMode === 'span_level';
  console.log(`[GLiNER] Span mode: ${_config.spanMode} (isSpan: ${_isSpanMode})`);

  // Load ONNX Runtime from CDN
  _ort = await getOrt();

  // Create ONNX session
  console.log('[GLiNER] Creating ONNX inference session...');
  _session = await _ort.InferenceSession.create(files.modelBuffer, {
    executionProviders: ['wasm'],
    graphOptimizationLevel: 'all',
  });
  console.log('[GLiNER] Model loaded. Input names:', _session.inputNames);

  // Also detect span mode from model input names (belt and suspenders)
  const inputNames: string[] = _session.inputNames;
  if (inputNames.includes('span_idx') || inputNames.includes('span_mask')) {
    _isSpanMode = true;
    console.log('[GLiNER] Detected span_idx/span_mask in model inputs — using span mode');
  }

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
 * @param threshold - Confidence threshold (default from config)
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

  // Chunk at smaller threshold for markerV0 (max_len=384 tokens)
  const maxWords = _isSpanMode ? 200 : 500;
  const words = text.split(/\s+/);
  if (words.length > maxWords) {
    return detectPIIChunked(text, labels, threshold, maxWords);
  }

  return runInference(text, labels, threshold);
}

async function runInference(
  text: string,
  labels: string[],
  threshold: number,
): Promise<GLiNEREntity[]> {
  if (!_session || !_ort) throw new Error('GLiNER session not available');

  if (_isSpanMode) {
    return runSpanInference(text, labels, threshold);
  } else {
    return runTokenInference(text, labels, threshold);
  }
}

/**
 * Span-level (markerV0) inference — used by gliner_multi-v2.1
 */
async function runSpanInference(
  text: string,
  labels: string[],
  threshold: number,
): Promise<GLiNEREntity[]> {
  const batch = prepareSpanBatch(
    [text], labels, _config.maxWidth, _config.entToken, _config.sepToken,
  );

  const seqLen = batch.inputIds[0].length;
  const batchSize = 1;
  const numSpans = batch.spanIdx![0].length;

  // Create ONNX tensors
  const feeds: Record<string, any> = {
    input_ids: new _ort.Tensor('int64', BigInt64Array.from(batch.inputIds[0].map(BigInt)), [batchSize, seqLen]),
    attention_mask: new _ort.Tensor('int64', BigInt64Array.from(batch.attentionMask[0].map(BigInt)), [batchSize, seqLen]),
    words_mask: new _ort.Tensor('int64', BigInt64Array.from(batch.wordsMask[0].map(BigInt)), [batchSize, seqLen]),
    text_lengths: new _ort.Tensor('int64', BigInt64Array.from(batch.textLengths[0].map(BigInt)), [batchSize, 1]),
  };

  // Add span tensors — flatten [numSpans, 2] to a single BigInt64Array
  const spanIdxFlat = new BigInt64Array(numSpans * 2);
  for (let s = 0; s < numSpans; s++) {
    spanIdxFlat[s * 2] = BigInt(batch.spanIdx![0][s][0]);
    spanIdxFlat[s * 2 + 1] = BigInt(batch.spanIdx![0][s][1]);
  }
  feeds.span_idx = new _ort.Tensor('int64', spanIdxFlat, [batchSize, numSpans, 2]);
  feeds.span_mask = new _ort.Tensor('int64', BigInt64Array.from(batch.spanMask![0].map(BigInt)), [batchSize, numSpans]);

  console.log(`[GLiNER] Running span inference on ${text.length} chars, ${labels.length} labels, ${numSpans} spans...`);
  const results = await _session.run(feeds);

  const outputName = _session.outputNames[0];
  const output = results[outputName];
  const logits = output.data as Float32Array;
  const dims = output.dims;
  console.log(`[GLiNER] Output dims: [${dims.join(', ')}], total elements: ${logits.length}`);

  const numEntities = Number(dims[2]);

  const entities = decodeSpanLevel({
    logits,
    batchSize,
    numSpans,
    numEntities,
    entities: labels,
    texts: [text],
    batchWordsStartIdx: batch.batchWordsStartIdx,
    batchWordsEndIdx: batch.batchWordsEndIdx,
    spanIdx: batch.spanIdx!,
    spanMask: batch.spanMask!,
    threshold,
  });

  console.log(`[GLiNER] Detected ${entities[0].length} entities`);
  return entities[0];
}

/**
 * Token-level inference — used by older models (gliner-pii-edge-v1.0)
 */
async function runTokenInference(
  text: string,
  labels: string[],
  threshold: number,
): Promise<GLiNEREntity[]> {
  const batch = prepareBatch([text], labels, _config.entToken, _config.sepToken);

  const seqLen = batch.inputIds[0].length;
  const batchSize = 1;

  const feeds: Record<string, any> = {
    input_ids: new _ort.Tensor('int64', BigInt64Array.from(batch.inputIds[0].map(BigInt)), [batchSize, seqLen]),
    attention_mask: new _ort.Tensor('int64', BigInt64Array.from(batch.attentionMask[0].map(BigInt)), [batchSize, seqLen]),
    words_mask: new _ort.Tensor('int64', BigInt64Array.from(batch.wordsMask[0].map(BigInt)), [batchSize, seqLen]),
    text_lengths: new _ort.Tensor('int64', BigInt64Array.from(batch.textLengths[0].map(BigInt)), [batchSize, 1]),
  };

  console.log(`[GLiNER] Running token inference on ${text.length} chars, ${labels.length} labels...`);
  const results = await _session.run(feeds);

  const outputName = _session.outputNames[0];
  const output = results[outputName];
  const logits = output.data as Float32Array;
  const dims = output.dims;
  console.log(`[GLiNER] Output dims: [${dims.join(', ')}], total elements: ${logits.length}`);

  const numEntities = Number(dims[2]);
  const inputLength = Number(dims[1]);

  const entities = decodeTokenLevel({
    logits,
    batchSize,
    inputLength,
    numEntities,
    entities: labels,
    texts: [text],
    batchWordsStartIdx: batch.batchWordsStartIdx,
    batchWordsEndIdx: batch.batchWordsEndIdx,
    batchTokens: batch.batchTokens,
    wordsMask: batch.wordsMask,
    threshold,
  });

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
  chunkSize: number = 200,
): Promise<GLiNEREntity[]> {
  const OVERLAP = 50;
  const words = text.split(/\s+/);
  const allEntities: GLiNEREntity[] = [];
  const seenSpans = new Set<string>();

  for (let i = 0; i < words.length; i += chunkSize - OVERLAP) {
    const chunkWords = words.slice(i, i + chunkSize);
    const chunkText = chunkWords.join(' ');

    // Calculate the character offset of this chunk in the original text
    const chunkStartChar = text.indexOf(chunkWords[0], i > 0 ? text.indexOf(words[i - 1]) : 0);

    const entities = await runInference(chunkText, labels, threshold);

    for (const entity of entities) {
      const adjustedEntity = {
        ...entity,
        start: entity.start + chunkStartChar,
        end: entity.end + chunkStartChar,
      };

      const key = `${adjustedEntity.start}-${adjustedEntity.end}-${adjustedEntity.label}`;
      if (!seenSpans.has(key)) {
        seenSpans.add(key);
        allEntities.push(adjustedEntity);
      }
    }
  }

  return allEntities.sort((a, b) => a.start - b.start);
}
