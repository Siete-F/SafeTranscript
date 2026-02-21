/**
 * GLiNER Token-Level Decoder
 * Converts ONNX model output logits to entity spans.
 * Adapted from GLiNER.js TokenDecoder (Apache-2.0 / MIT)
 *
 * Output tensor shape: [batchSize, inputLength, numEntities, 3]
 * where the last dim is [start, end, inside] logits.
 */

import type { GLiNEREntity } from './types';

function sigmoid(x: number): number {
  return 1 / (1 + Math.exp(-x));
}

/**
 * Decode token-level model output into entity spans.
 *
 * @param logits - Raw model output, shape [batch, words, entities, 3] flattened
 * @param batchSize - Number of texts in the batch
 * @param inputLength - Number of word positions in output
 * @param numEntities - Number of entity types
 * @param entities - Entity label strings
 * @param texts - Original input texts
 * @param batchWordsStartIdx - Character start indices per word per batch item
 * @param batchWordsEndIdx - Character end indices per word per batch item
 * @param batchTokens - Words per batch item
 * @param wordsMask - Words mask used during processing
 * @param threshold - Confidence threshold (default: 0.3)
 */
export function decodeTokenLevel(
  logits: Float32Array | number[],
  batchSize: number,
  inputLength: number,
  numEntities: number,
  entities: string[],
  texts: string[],
  batchWordsStartIdx: number[][],
  batchWordsEndIdx: number[][],
  batchTokens: string[][],
  wordsMask: number[][],
  threshold: number = 0.3,
): GLiNEREntity[][] {
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
    for (let t = 0; t < mask.length; t++) {
      if (mask[t] > 0) {
        outputPosToTextWord.set(outputIdx, mask[t] - 1); // 0-indexed text word
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
