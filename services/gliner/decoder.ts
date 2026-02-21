/**
 * GLiNER Decoder
 * Converts ONNX model output logits to entity spans.
 * Supports both token-level and span-level (markerV0) modes.
 * Adapted from GLiNER.js TokenDecoder / SpanDecoder (Apache-2.0 / MIT)
 */

import type { GLiNEREntity } from './types';

function sigmoid(x: number): number {
  return 1 / (1 + Math.exp(-x));
}

// =====================================================================
// Span-level decoder (markerV0) — used by gliner_multi-v2.1
// Output tensor shape: [batchSize, numSpans, numEntities]
// =====================================================================

interface SpanDecodeOptions {
  logits: Float32Array | number[];
  batchSize: number;
  numSpans: number;
  numEntities: number;
  entities: string[];
  texts: string[];
  batchWordsStartIdx: number[][];
  batchWordsEndIdx: number[][];
  spanIdx: number[][][];
  spanMask: number[][];
  threshold?: number;
}

/**
 * Decode span-level model output into entity spans.
 */
export function decodeSpanLevel(opts: SpanDecodeOptions): GLiNEREntity[][] {
  const {
    logits, batchSize, numSpans, numEntities,
    entities, texts, batchWordsStartIdx, batchWordsEndIdx,
    spanIdx, spanMask, threshold = 0.4,
  } = opts;
  const batchStride = numSpans * numEntities;
  const results: GLiNEREntity[][] = [];

  for (let b = 0; b < batchSize; b++) {
    const candidates: GLiNEREntity[] = [];
    const text = texts[b];
    const batchOffset = b * batchStride;

    for (let s = 0; s < numSpans; s++) {
      if (spanMask[b][s] === 0) continue;

      const [startWord, endWord] = spanIdx[b][s];

      // Find best entity for this span
      let bestScore = -Infinity;
      let bestEntity = -1;

      for (let e = 0; e < numEntities; e++) {
        const logit = Number(logits[batchOffset + s * numEntities + e]);
        const score = sigmoid(logit);
        if (score > bestScore) {
          bestScore = score;
          bestEntity = e;
        }
      }

      if (bestScore > threshold && bestEntity >= 0) {
        const charStart = batchWordsStartIdx[b][startWord];
        const charEnd = batchWordsEndIdx[b][endWord];

        if (charStart === undefined || charEnd === undefined) continue;

        const entityText = text.slice(charStart, charEnd);

        candidates.push({
          text: entityText,
          label: entities[bestEntity],
          start: charStart,
          end: charEnd,
          score: bestScore,
        });
      }
    }

    results.push(greedySearch(candidates));
  }

  return results;
}

// =====================================================================
// Token-level decoder — used by older models (gliner-pii-edge-v1.0)
// Output tensor shape: [batchSize, inputLength, numEntities, 3]
// where the last dim is [start, end, inside] logits.
// =====================================================================

interface TokenDecodeOptions {
  logits: Float32Array | number[];
  batchSize: number;
  inputLength: number;
  numEntities: number;
  entities: string[];
  texts: string[];
  batchWordsStartIdx: number[][];
  batchWordsEndIdx: number[][];
  batchTokens: string[][];
  wordsMask: number[][];
  threshold?: number;
}

/**
 * Decode token-level model output into entity spans.
 */
export function decodeTokenLevel(opts: TokenDecodeOptions): GLiNEREntity[][] {
  const {
    logits, batchSize, inputLength, numEntities,
    entities, texts, batchWordsStartIdx, batchWordsEndIdx,
    batchTokens: _batchTokens, wordsMask, threshold = 0.3,
  } = opts;

  // Strides for [batch, inputLength, numEntities, 3] layout
  const numPositions = 3;
  const entityStride = numPositions;                          // stride to next entity
  const tokenStride = numEntities * numPositions;             // stride to next word
  const batchStride = inputLength * numEntities * numPositions; // stride to next batch

  const results: GLiNEREntity[][] = [];

  for (let b = 0; b < batchSize; b++) {
    const batchOffset = b * batchStride;
    const mask = wordsMask[b];

    // The model output is WORD-LEVEL: `inputLength` = number of word positions.
    // Output position 0 = first text word, position 1 = second text word, etc.
    // Build a sequential mapping from output position → text word index.
    const outputPosToTextWord = new Map<number, number>();
    let outputIdx = 0;
    for (const [, val] of mask.entries()) {
      if (val > 0) {
        outputPosToTextWord.set(outputIdx, val - 1); // 0-indexed text word
        outputIdx++;
      }
    }

    const starts: { word: number; entity: number; score: number }[] = [];
    const ends: { word: number; entity: number; score: number }[] = [];
    const insideMap = new Map<string, number>(); // "word-entity" -> score

    for (let w = 0; w < inputLength; w++) {
      const textWord = outputPosToTextWord.get(w);
      if (textWord === undefined) continue; // skip unmapped positions

      for (let e = 0; e < numEntities; e++) {
        const base = batchOffset + w * tokenStride + e * entityStride;
        const startProb = sigmoid(logits[base + 0]);
        const endProb = sigmoid(logits[base + 1]);
        const insideProb = sigmoid(logits[base + 2]);

        if (startProb >= threshold) {
          starts.push({ word: textWord, entity: e, score: startProb });
        }
        if (endProb >= threshold) {
          ends.push({ word: textWord, entity: e, score: endProb });
        }
        insideMap.set(`${textWord}-${e}`, insideProb);
      }
    }

    // Match start-end pairs for same entity type
    const candidates: GLiNEREntity[] = [];

    for (const s of starts) {
      for (const en of ends) {
        if (en.entity !== s.entity) continue;
        if (en.word < s.word) continue;

        // Validate inside tokens for multi-word spans
        let valid = true;
        let insideTotal = 0;
        let insideCount = 0;

        for (let w = s.word + 1; w < en.word; w++) {
          const iScore = insideMap.get(`${w}-${s.entity}`) ?? 0;
          if (iScore < threshold) {
            valid = false;
            break;
          }
          insideTotal += iScore;
          insideCount++;
        }

        if (!valid) continue;

        const avgScore = insideCount > 0
          ? (s.score + en.score + insideTotal) / (2 + insideCount)
          : (s.score + en.score) / 2;

        // Map word indices to character offsets
        const charStart = batchWordsStartIdx[b][s.word];
        const charEnd = batchWordsEndIdx[b][en.word];

        if (charStart === undefined || charEnd === undefined) continue;

        const spanText = texts[b].slice(charStart, charEnd);

        candidates.push({
          text: spanText,
          label: entities[s.entity],
          start: charStart,
          end: charEnd,
          score: avgScore,
        });
      }
    }

    results.push(greedySearch(candidates));
  }

  return results;
}

/**
 * Remove overlapping spans, keeping the highest-scoring ones.
 * Flat NER mode: no overlapping spans allowed.
 */
function greedySearch(candidates: GLiNEREntity[]): GLiNEREntity[] {
  const sorted = [...candidates].sort((a, b) => b.score - a.score);
  const accepted: GLiNEREntity[] = [];

  for (const candidate of sorted) {
    const overlaps = accepted.some(
      a => candidate.start < a.end && candidate.end > a.start
    );
    if (!overlaps) {
      accepted.push(candidate);
    }
  }

  return accepted.sort((a, b) => a.start - b.start);
}
