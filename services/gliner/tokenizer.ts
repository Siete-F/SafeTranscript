/**
 * Minimal BPE Tokenizer
 * Reads HuggingFace tokenizer.json format and provides word-level encoding.
 * Adapted for GLiNER's word-by-word tokenization pattern.
 */

import type { TokenizerData } from './types';

let _tokenizer: BPETokenizer | null = null;

/**
 * Initialize the tokenizer from a downloaded tokenizer.json
 */
export function initTokenizer(tokenizerJson: any): void {
  _tokenizer = new BPETokenizer(tokenizerJson);
}

/**
 * Encode a single word into subword token IDs (without special tokens).
 */
export function encodeWord(word: string): number[] {
  if (!_tokenizer) throw new Error('Tokenizer not initialized');
  return _tokenizer.encodeWord(word);
}

/**
 * Get the token ID for a special token (e.g., <<ENT>>, <<SEP>>, [CLS]).
 */
export function getSpecialTokenId(token: string): number {
  if (!_tokenizer) throw new Error('Tokenizer not initialized');
  return _tokenizer.getTokenId(token);
}

/**
 * Get the [CLS] token ID (typically 1 for DeBERTa/ModernBERT).
 */
export function getClsTokenId(): number {
  if (!_tokenizer) throw new Error('Tokenizer not initialized');
  return _tokenizer.clsTokenId;
}

/**
 * Get the [SEP] token ID.
 */
export function getSepTokenId(): number {
  if (!_tokenizer) throw new Error('Tokenizer not initialized');
  return _tokenizer.sepTokenId;
}

// --- GPT-2 style byte encoder/decoder ---

function buildByteEncoder(): Map<number, string> {
  const bs: number[] = [];
  // Printable ASCII ranges
  for (let i = 33; i <= 126; i++) bs.push(i);   // '!' to '~'
  for (let i = 161; i <= 172; i++) bs.push(i);  // '¡' to '¬'
  for (let i = 174; i <= 255; i++) bs.push(i);  // '®' to 'ÿ'

  const cs = [...bs];
  let n = 0;
  for (let b = 0; b < 256; b++) {
    if (!bs.includes(b)) {
      bs.push(b);
      cs.push(256 + n);
      n++;
    }
  }

  const encoder = new Map<number, string>();
  for (let i = 0; i < bs.length; i++) {
    encoder.set(bs[i], String.fromCharCode(cs[i]));
  }
  return encoder;
}

function buildByteDecoder(encoder: Map<number, string>): Map<string, number> {
  const decoder = new Map<string, number>();
  for (const [k, v] of encoder) {
    decoder.set(v, k);
  }
  return decoder;
}

// --- BPE Tokenizer ---

class BPETokenizer {
  private vocab: Map<string, number>;
  private mergeRanks: Map<string, number>;
  private addedTokens: Map<string, number>;
  private byteEncoder: Map<number, string>;
  private unkTokenId: number;
  public clsTokenId: number;
  public sepTokenId: number;
  private isByteLevelBPE: boolean;
  private addPrefixSpace: boolean;

  constructor(tokenizerJson: any) {
    const model = tokenizerJson.model;

    // Build vocab map
    this.vocab = new Map<string, number>();
    if (model.vocab) {
      for (const [token, id] of Object.entries(model.vocab)) {
        this.vocab.set(token, id as number);
      }
    }

    // Build merge priority map
    this.mergeRanks = new Map<string, number>();
    if (model.merges) {
      for (let i = 0; i < model.merges.length; i++) {
        const merge = model.merges[i];
        if (typeof merge === 'string') {
          this.mergeRanks.set(merge, i);
        } else if (Array.isArray(merge)) {
          // HuggingFace tokenizer.json may store merges as ["Ġ","t"] arrays
          this.mergeRanks.set(merge.join(' '), i);
        }
      }
    }

    // Build added tokens map (special tokens like <<ENT>>, <<SEP>>)
    this.addedTokens = new Map<string, number>();
    if (tokenizerJson.added_tokens) {
      for (const at of tokenizerJson.added_tokens) {
        this.addedTokens.set(at.content, at.id);
        this.vocab.set(at.content, at.id);
      }
    }

    // Detect if byte-level BPE (GPT-2 style)
    const preTokenizer = tokenizerJson.pre_tokenizer;
    this.isByteLevelBPE = preTokenizer?.type === 'ByteLevel' ||
      preTokenizer?.pretokenizers?.some((p: any) => p.type === 'ByteLevel') ||
      model.byte_fallback === true;

    // Check add_prefix_space setting from pre_tokenizer
    this.addPrefixSpace = preTokenizer?.add_prefix_space === true ||
      preTokenizer?.pretokenizers?.some((p: any) => p.type === 'ByteLevel' && p.add_prefix_space === true) ||
      false;

    this.byteEncoder = buildByteEncoder();

    // Known special tokens
    this.unkTokenId = this.vocab.get('[UNK]') ?? this.vocab.get('<unk>') ?? 0;
    this.clsTokenId = this.vocab.get('[CLS]') ?? this.vocab.get('<s>') ?? 1;
    this.sepTokenId = this.vocab.get('[SEP]') ?? this.vocab.get('</s>') ?? 2;

  }

  getTokenId(token: string): number {
    return this.addedTokens.get(token) ?? this.vocab.get(token) ?? this.unkTokenId;
  }

  encodeWord(word: string): number[] {
    // Check if the word itself is an added/special token
    if (this.addedTokens.has(word)) {
      return [this.addedTokens.get(word)!];
    }

    if (this.isByteLevelBPE) {
      return this.encodeByteLevelBPE(word);
    } else {
      return this.encodeWordPieceFallback(word);
    }
  }

  private encodeByteLevelBPE(word: string): number[] {
    // ByteLevel pre-tokenizer with add_prefix_space: prepend space to each word
    // This converts "Jan" → " Jan" → "ĠJan" in byte-level encoding
    const toEncode = this.addPrefixSpace ? ' ' + word : word;

    // Convert word to byte-level characters
    const encoder = new TextEncoder();
    const bytes = encoder.encode(toEncode);
    let symbols: string[] = [];
    for (const b of bytes) {
      symbols.push(this.byteEncoder.get(b) ?? String.fromCharCode(b));
    }

    if (symbols.length === 0) return [this.unkTokenId];
    if (symbols.length === 1) {
      const id = this.vocab.get(symbols[0]);
      return id !== undefined ? [id] : [this.unkTokenId];
    }

    // Apply BPE merges
    symbols = this.applyBPE(symbols);

    // Convert to IDs
    return symbols.map(s => this.vocab.get(s) ?? this.unkTokenId);
  }

  private encodeWordPieceFallback(word: string): number[] {
    // WordPiece-style: try whole word first, then split with ## prefix
    if (this.vocab.has(word)) {
      return [this.vocab.get(word)!];
    }

    const tokens: number[] = [];
    let start = 0;

    while (start < word.length) {
      let end = word.length;
      let found = false;

      while (start < end) {
        const substr = start > 0 ? '##' + word.slice(start, end) : word.slice(start, end);
        if (this.vocab.has(substr)) {
          tokens.push(this.vocab.get(substr)!);
          found = true;
          break;
        }
        end--;
      }

      if (!found) {
        tokens.push(this.unkTokenId);
        start++;
      } else {
        start = end;
      }
    }

    return tokens;
  }

  private applyBPE(symbols: string[]): string[] {
    if (symbols.length <= 1) return symbols;

    while (true) {
      // Find the best merge (lowest rank)
      let bestPair: string | null = null;
      let bestRank = Infinity;

      for (let i = 0; i < symbols.length - 1; i++) {
        const pair = `${symbols[i]} ${symbols[i + 1]}`;
        const rank = this.mergeRanks.get(pair);
        if (rank !== undefined && rank < bestRank) {
          bestPair = pair;
          bestRank = rank;
        }
      }

      if (bestPair === null) break;

      // Apply the merge
      const [a, b] = bestPair.split(' ');
      const merged = a + b;
      const newSymbols: string[] = [];
      let i = 0;

      while (i < symbols.length) {
        if (i < symbols.length - 1 && symbols[i] === a && symbols[i + 1] === b) {
          newSymbols.push(merged);
          i += 2;
        } else {
          newSymbols.push(symbols[i]);
          i++;
        }
      }

      symbols = newSymbols;
      if (symbols.length <= 1) break;
    }

    return symbols;
  }
}
