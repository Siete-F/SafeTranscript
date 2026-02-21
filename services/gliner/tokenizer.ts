/**
 * Multi-algorithm Tokenizer
 * Supports both BPE (GPT-2 / ModernBERT) and Unigram (SentencePiece / mDeBERTa-v3).
 * Reads HuggingFace tokenizer.json format and provides word-level encoding.
 * Adapted for GLiNER's word-by-word tokenization pattern.
 */

interface TokenizerBase {
  clsTokenId: number;
  sepTokenId: number;
  getTokenId(token: string): number;
  encodeWord(word: string): number[];
}

let _tokenizer: TokenizerBase | null = null;

/**
 * Initialize the tokenizer from a downloaded tokenizer.json.
 * Auto-detects BPE vs Unigram model type.
 */
export function initTokenizer(tokenizerJson: any): void {
  const modelType = tokenizerJson.model?.type;
  if (modelType === 'Unigram') {
    console.log('[Tokenizer] Using Unigram (SentencePiece) tokenizer');
    _tokenizer = new UnigramTokenizer(tokenizerJson);
  } else {
    console.log('[Tokenizer] Using BPE tokenizer');
    _tokenizer = new BPETokenizer(tokenizerJson);
  }
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

// =====================================================================
// Unigram (SentencePiece) Tokenizer — used by mDeBERTa-v3 models
// =====================================================================

class UnigramTokenizer implements TokenizerBase {
  /** piece string → token ID */
  private readonly vocab: Map<string, number>;
  /** piece string → log probability score */
  private readonly scores: Map<string, number>;
  /** special / added tokens */
  private readonly addedTokens: Map<string, number>;
  /** byte fallback tokens: byte value → token ID */
  private readonly byteTokens: Map<number, number>;
  private readonly unkTokenId: number;
  public clsTokenId: number;
  public sepTokenId: number;
  private readonly maxPieceLength: number;

  constructor(tokenizerJson: any) {
    const model = tokenizerJson.model;
    this.vocab = new Map();
    this.scores = new Map();
    this.byteTokens = new Map();
    this.maxPieceLength = 0;

    // Build vocab from Unigram model.vocab: [[piece, score], ...]
    if (model.vocab) {
      for (let idx = 0; idx < model.vocab.length; idx++) {
        const [piece, score] = model.vocab[idx];
        if (!this.vocab.has(piece)) {
          this.vocab.set(piece, idx);
          this.scores.set(piece, score as number);
          if (piece.length > this.maxPieceLength) {
            this.maxPieceLength = piece.length;
          }
        }
        // Detect byte fallback tokens like <0x41>
        const byteMatch = /^<0x([0-9A-Fa-f]{2})>$/.exec(piece as string);
        if (byteMatch) {
          this.byteTokens.set(Number.parseInt(byteMatch[1], 16), idx);
        }
      }
    }

    // Build added tokens map (<<ENT>>, <<SEP>>, [CLS], etc.)
    this.addedTokens = new Map();
    if (tokenizerJson.added_tokens) {
      for (const at of tokenizerJson.added_tokens) {
        this.addedTokens.set(at.content, at.id);
      }
    }

    this.unkTokenId = model.unk_id ?? this.addedTokens.get('<unk>') ?? this.vocab.get('<unk>') ?? 0;
    this.clsTokenId = this.addedTokens.get('[CLS]') ?? this.addedTokens.get('<s>') ?? this.vocab.get('[CLS]') ?? 1;
    this.sepTokenId = this.addedTokens.get('[SEP]') ?? this.addedTokens.get('</s>') ?? this.vocab.get('[SEP]') ?? 2;
  }

  getTokenId(token: string): number {
    return this.addedTokens.get(token) ?? this.vocab.get(token) ?? this.unkTokenId;
  }

  encodeWord(word: string): number[] {
    if (this.addedTokens.has(word)) {
      return [this.addedTokens.get(word)!];
    }

    // SentencePiece convention: prepend ▁ (U+2581) for word boundary,
    // replace internal spaces with ▁
    const normalized = word.normalize('NFKC');
    const input = '\u2581' + normalized.replaceAll(' ', '\u2581');

    return this.viterbi(input);
  }

  /**
   * Viterbi search for optimal Unigram tokenization.
   * Finds the segmentation that maximizes the sum of log probabilities.
   */
  private viterbi(text: string): number[] {
    const n = text.length;
    if (n === 0) return [];

    // best[i] represents the best tokenization of text[0:i]
    const best: Array<{ score: number; prev: number; id: number }> = new Array(n + 1);
    best[0] = { score: 0, prev: 0, id: -1 };
    for (let i = 1; i <= n; i++) {
      best[i] = { score: -Infinity, prev: 0, id: this.unkTokenId };
    }

    for (let i = 0; i < n; i++) {
      if (best[i].score === -Infinity && i > 0) continue;

      const maxLen = Math.min(this.maxPieceLength, n - i);
      for (let len = 1; len <= maxLen; len++) {
        const piece = text.slice(i, i + len);
        const score = this.scores.get(piece);
        if (score !== undefined) {
          const newScore = best[i].score + score;
          if (newScore > best[i + len].score) {
            best[i + len] = {
              score: newScore,
              prev: i,
              id: this.vocab.get(piece)!,
            };
          }
        }
      }

      // Byte fallback: if position i+1 has no valid tokenization,
      // encode the character at position i as UTF-8 bytes
      if (best[i + 1].score === -Infinity) {
        const char = text[i];
        const bytes = new TextEncoder().encode(char);
        const byteIds = Array.from(bytes).map(b => this.byteTokens.get(b));

        if (byteIds.every(id => id !== undefined)) {
          // Use byte-level encoding; set best[i+1] using the first byte,
          // and for multi-byte chars, chain through intermediate positions
          const charLen = char.length; // JS string length (1 or 2 for surrogate pairs)
          const fallbackScore = best[i].score - 100; // large penalty
          if (fallbackScore > best[i + charLen].score) {
            // Store all byte token IDs for this character
            best[i + charLen] = {
              score: fallbackScore,
              prev: i,
              id: -2, // marker for byte fallback
            };
            // We'll handle multi-byte in backtracking
          }
        } else {
          // No byte tokens available — use unk
          best[i + 1] = {
            score: best[i].score - 200,
            prev: i,
            id: this.unkTokenId,
          };
        }
      }
    }

    // Backtrack to get token IDs
    const tokens: number[] = [];
    let pos = n;
    while (pos > 0) {
      const entry = best[pos];
      if (entry.id === -2) {
        // Byte fallback: encode the character(s) as byte tokens
        const prevPos = entry.prev;
        const substr = text.slice(prevPos, pos);
        const bytes = new TextEncoder().encode(substr);
        for (const b of bytes) {
          const byteId = this.byteTokens.get(b);
          tokens.unshift(byteId ?? this.unkTokenId);
        }
      } else {
        tokens.unshift(entry.id);
      }
      pos = entry.prev;
    }

    return tokens;
  }
}

// =====================================================================
// GPT-2 style byte encoder/decoder (for BPE tokenizer)
// =====================================================================

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
    encoder.set(bs[i], String.fromCodePoint(cs[i]));
  }
  return encoder;
}

// =====================================================================
// BPE Tokenizer — used by GPT-2 / ModernBERT models
// =====================================================================

class BPETokenizer implements TokenizerBase {
  private readonly vocab: Map<string, number>;
  private readonly mergeRanks: Map<string, number>;
  private readonly addedTokens: Map<string, number>;
  private readonly byteEncoder: Map<number, string>;
  private readonly unkTokenId: number;
  public clsTokenId: number;
  public sepTokenId: number;
  private readonly isByteLevelBPE: boolean;
  private readonly addPrefixSpace: boolean;

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
      symbols.push(this.byteEncoder.get(b) ?? String.fromCodePoint(b));
    }

    if (symbols.length === 0) return [this.unkTokenId];
    if (symbols.length === 1) {
      const id = this.vocab.get(symbols[0]);
      return id === undefined ? [this.unkTokenId] : [id];
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

      if (found) {
        start = end;
      } else {
        tokens.push(this.unkTokenId);
        start++;
      }
    }

    return tokens;
  }

  private findBestMergePair(symbols: string[]): string | null {
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

    return bestPair;
  }

  private applyBPE(symbols: string[]): string[] {
    if (symbols.length <= 1) return symbols;

    let bestPair = this.findBestMergePair(symbols);

    while (bestPair !== null) {

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
      bestPair = this.findBestMergePair(symbols);
      if (symbols.length <= 1) break;
    }

    return symbols;
  }
}
