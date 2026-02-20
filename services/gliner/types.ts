/**
 * GLiNER Type Definitions
 * Adapted from GLiNER.js (Apache-2.0 / MIT)
 */

export interface GLiNEREntity {
  text: string;
  label: string;
  start: number;
  end: number;
  score: number;
}

export interface GLiNERConfig {
  spanMode: 'token_level' | 'span_level';
  maxWidth: number;
  maxLen: number;
  maxTypes: number;
  entToken: string;
  sepToken: string;
}

export interface TokenizerData {
  vocab: Map<string, number>;
  merges: string[];
  addedTokens: Map<string, number>;
  unkTokenId: number;
  byteEncoder: Map<number, string>;
  byteDecoder: Map<string, number>;
}

export interface ProcessorOutput {
  inputIds: number[][];
  attentionMask: number[][];
  wordsMask: number[][];
  textLengths: number[][];
  batchTokens: string[][];
  batchWordsStartIdx: number[][];
  batchWordsEndIdx: number[][];
}

export interface ModelFiles {
  modelBuffer: ArrayBuffer;
  tokenizerJson: any;
  glinerConfig: GLiNERConfig;
}
