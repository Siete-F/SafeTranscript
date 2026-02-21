/**
 * GLiNER Processor
 * Prepares input tensors for the ONNX model.
 * Supports both token_level and markerV0 (span) modes.
 * Adapted from GLiNER.js TokenProcessor / SpanProcessor (Apache-2.0 / MIT)
 */

import type { ProcessorOutput } from './types';
import { encodeWord, getSpecialTokenId, getClsTokenId } from './tokenizer';

/** Split text into words with character offsets */
function splitWords(text: string): [string, number, number][] {
  const words: [string, number, number][] = [];
  const regex = /\w+(?:[-_]\w+)*|\S/g;
  let match;
  while ((match = regex.exec(text)) !== null) {
    words.push([match[0], match.index, match.index + match[0].length]);
  }
  return words;
}

/**
 * Build the common token sequence shared by both modes:
 * [CLS] <<ENT>> label1_tokens <<ENT>> label2_tokens ... <<SEP>> word1_tokens word2_tokens ...
 */
function buildTokenSequence(
  text: string,
  entities: string[],
  entToken: string,
  sepToken: string,
): {
  inputIds: number[];
  attentionMask: number[];
  wordsMask: number[];
  words: [string, number, number][];
  wordsStartIdx: number[];
  wordsEndIdx: number[];
  tokens: string[];
} {
  const entTokenId = getSpecialTokenId(entToken);
  const sepTokenId = getSpecialTokenId(sepToken);
  const clsTokenId = getClsTokenId();

  // Build entity prompt: <<ENT>> label1 <<ENT>> label2 ... <<SEP>>
  const promptTokenIds: number[] = [];
  for (const entity of entities) {
    promptTokenIds.push(entTokenId);
    // Split multi-word labels and tokenize each word
    const labelWords = entity.split(/\s+/);
    for (const lw of labelWords) {
      const labelIds = encodeWord(lw);
      promptTokenIds.push(...labelIds);
    }
  }
  promptTokenIds.push(sepTokenId);

  const words = splitWords(text);
  const inputIds: number[] = [clsTokenId];
  const attentionMask: number[] = [1];
  const wordsMask: number[] = [0]; // [CLS] is not a word
  const wordsStartIdx: number[] = [];
  const wordsEndIdx: number[] = [];
  const tokens: string[] = [];

  // Add prompt tokens (all get wordsMask = 0)
  for (const id of promptTokenIds) {
    inputIds.push(id);
    attentionMask.push(1);
    wordsMask.push(0);
  }

  // Add text word tokens
  let wordCounter = 1;
  for (const [word, startIdx, endIdx] of words) {
    const wordTokenIds = encodeWord(word);
    for (let j = 0; j < wordTokenIds.length; j++) {
      inputIds.push(wordTokenIds[j]);
      attentionMask.push(1);
      wordsMask.push(j === 0 ? wordCounter : 0);
    }
    wordsStartIdx.push(startIdx);
    wordsEndIdx.push(endIdx);
    tokens.push(word);
    wordCounter++;
  }

  return { inputIds, attentionMask, wordsMask, words, wordsStartIdx, wordsEndIdx, tokens };
}

/**
 * Prepare a batch of texts for token-level GLiNER inference.
 * Output shape: [batch, inputLength, numEntities, 3]
 */
export function prepareBatch(
  texts: string[],
  entities: string[],
  entToken: string = '<<ENT>>',
  sepToken: string = '<<SEP>>',
): ProcessorOutput {
  const allInputIds: number[][] = [];
  const allAttentionMask: number[][] = [];
  const allWordsMask: number[][] = [];
  const allTextLengths: number[][] = [];
  const allBatchTokens: string[][] = [];
  const allWordsStartIdx: number[][] = [];
  const allWordsEndIdx: number[][] = [];

  for (const text of texts) {
    const seq = buildTokenSequence(text, entities, entToken, sepToken);
    allInputIds.push(seq.inputIds);
    allAttentionMask.push(seq.attentionMask);
    allWordsMask.push(seq.wordsMask);
    allTextLengths.push([seq.words.length]);
    allBatchTokens.push(seq.tokens);
    allWordsStartIdx.push(seq.wordsStartIdx);
    allWordsEndIdx.push(seq.wordsEndIdx);
  }

  // Pad all sequences in the batch to the same length
  const maxLen = Math.max(...allInputIds.map(ids => ids.length));
  for (let i = 0; i < texts.length; i++) {
    while (allInputIds[i].length < maxLen) {
      allInputIds[i].push(0);
      allAttentionMask[i].push(0);
      allWordsMask[i].push(0);
    }
  }

  return {
    inputIds: allInputIds,
    attentionMask: allAttentionMask,
    wordsMask: allWordsMask,
    textLengths: allTextLengths,
    batchTokens: allBatchTokens,
    batchWordsStartIdx: allWordsStartIdx,
    batchWordsEndIdx: allWordsEndIdx,
  };
}

/**
 * Prepare a batch of texts for markerV0 (span-level) GLiNER inference.
 * Adds span_idx and span_mask tensors for all candidate spans.
 * Output shape: [batch, numSpans, numEntities]
 */
export function prepareSpanBatch(
  texts: string[],
  entities: string[],
  maxWidth: number = 12,
  entToken: string = '<<ENT>>',
  sepToken: string = '<<SEP>>',
): ProcessorOutput {
  const allInputIds: number[][] = [];
  const allAttentionMask: number[][] = [];
  const allWordsMask: number[][] = [];
  const allTextLengths: number[][] = [];
  const allBatchTokens: string[][] = [];
  const allWordsStartIdx: number[][] = [];
  const allWordsEndIdx: number[][] = [];
  const allSpanIdx: number[][][] = [];
  const allSpanMask: number[][] = [];

  for (const text of texts) {
    const seq = buildTokenSequence(text, entities, entToken, sepToken);
    allInputIds.push(seq.inputIds);
    allAttentionMask.push(seq.attentionMask);
    allWordsMask.push(seq.wordsMask);
    allTextLengths.push([seq.words.length]);
    allBatchTokens.push(seq.tokens);
    allWordsStartIdx.push(seq.wordsStartIdx);
    allWordsEndIdx.push(seq.wordsEndIdx);

    // Generate all candidate spans (start, end) up to maxWidth
    const numWords = seq.words.length;
    const spanIdx: number[][] = [];
    const spanMask: number[] = [];

    for (let i = 0; i < numWords; i++) {
      for (let w = 0; w < maxWidth; w++) {
        const end = i + w;
        if (end < numWords) {
          spanIdx.push([i, end]);
          spanMask.push(1);
        } else {
          spanIdx.push([0, 0]);
          spanMask.push(0);
        }
      }
    }

    // Handle edge case: no words → at least one dummy span
    if (spanIdx.length === 0) {
      spanIdx.push([0, 0]);
      spanMask.push(0);
    }

    allSpanIdx.push(spanIdx);
    allSpanMask.push(spanMask);
  }

  // Pad token sequences to same length
  const maxLen = Math.max(...allInputIds.map(ids => ids.length));
  for (let i = 0; i < texts.length; i++) {
    while (allInputIds[i].length < maxLen) {
      allInputIds[i].push(0);
      allAttentionMask[i].push(0);
      allWordsMask[i].push(0);
    }
  }

  // Pad span sequences to same length
  const maxSpans = Math.max(...allSpanIdx.map(s => s.length));
  for (let i = 0; i < texts.length; i++) {
    while (allSpanIdx[i].length < maxSpans) {
      allSpanIdx[i].push([0, 0]);
      allSpanMask[i].push(0);
    }
  }

  return {
    inputIds: allInputIds,
    attentionMask: allAttentionMask,
    wordsMask: allWordsMask,
    textLengths: allTextLengths,
    batchTokens: allBatchTokens,
    batchWordsStartIdx: allWordsStartIdx,
    batchWordsEndIdx: allWordsEndIdx,
    spanIdx: allSpanIdx,
    spanMask: allSpanMask,
  };
}
