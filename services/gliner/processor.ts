/**
 * GLiNER Token-Level Processor
 * Prepares input tensors for the ONNX model.
 * Adapted from GLiNER.js TokenProcessor (Apache-2.0 / MIT)
 */

import type { ProcessorOutput } from './types';
import { encodeWord, getSpecialTokenId, getClsTokenId } from './tokenizer';

/** Split text into words with character offsets */
function splitWords(text: string): Array<[string, number, number]> {
  const words: Array<[string, number, number]> = [];
  const regex = /\w+(?:[-_]\w+)*|\S/g;
  let match;
  while ((match = regex.exec(text)) !== null) {
    words.push([match[0], match.index, match.index + match[0].length]);
  }
  return words;
}

/**
 * Prepare a batch of texts for token-level GLiNER inference.
 *
 * @param texts - Array of input texts
 * @param entities - Array of entity label strings (e.g., ["person", "email address"])
 * @param entToken - Entity marker token (default: "<<ENT>>")
 * @param sepToken - Separator token (default: "<<SEP>>")
 */
export function prepareBatch(
  texts: string[],
  entities: string[],
  entToken: string = '<<ENT>>',
  sepToken: string = '<<SEP>>',
): ProcessorOutput {
  const entTokenId = getSpecialTokenId(entToken);
  const sepTokenId = getSpecialTokenId(sepToken);
  const clsTokenId = getClsTokenId();

  // Build entity prompt: <<ENT>> label1 <<ENT>> label2 ... <<SEP>>
  const promptTokenIds: number[] = [];
  for (const entity of entities) {
    promptTokenIds.push(entTokenId);
    const labelIds = encodeWord(entity);
    promptTokenIds.push(...labelIds);
  }
  promptTokenIds.push(sepTokenId);

  const allInputIds: number[][] = [];
  const allAttentionMask: number[][] = [];
  const allWordsMask: number[][] = [];
  const allTextLengths: number[][] = [];
  const allBatchTokens: string[][] = [];
  const allWordsStartIdx: number[][] = [];
  const allWordsEndIdx: number[][] = [];

  for (const text of texts) {
    const words = splitWords(text);
    const inputIds: number[] = [clsTokenId]; // Start with [CLS]
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
    let wordCounter = 1; // 1-indexed word counter
    for (const [word, startIdx, endIdx] of words) {
      const wordTokenIds = encodeWord(word);
      for (let j = 0; j < wordTokenIds.length; j++) {
        inputIds.push(wordTokenIds[j]);
        attentionMask.push(1);
        // Only the first subword of each word gets the word index
        wordsMask.push(j === 0 ? wordCounter : 0);
      }
      wordsStartIdx.push(startIdx);
      wordsEndIdx.push(endIdx);
      tokens.push(word);
      wordCounter++;
    }

    allInputIds.push(inputIds);
    allAttentionMask.push(attentionMask);
    allWordsMask.push(wordsMask);
    allTextLengths.push([words.length]);
    allBatchTokens.push(tokens);
    allWordsStartIdx.push(wordsStartIdx);
    allWordsEndIdx.push(wordsEndIdx);
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
