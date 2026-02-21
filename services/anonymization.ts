/**
 * PII Detection and Anonymization Service
 * Detects and masks personally identifiable information.
 *
 * When GLiNER model is downloaded:
 *   Uses GLiNER for contextual entities (names, organizations, locations)
 *   + regex for structured patterns (emails, phones, credit cards, SSNs, IPs, etc.)
 *   This hybrid approach gives the best coverage.
 *
 * When GLiNER is NOT available:
 *   Falls back to regex-only detection.
 */

import { isGLiNERAvailable, detectPII } from './gliner/GLiNERInference';
import { LABEL_TO_TYPE } from './gliner/config';

export interface AnonymizationResult {
  anonymized: string;
  mappings: Record<string, string>;
}

// --- Regex patterns for structured PII (pattern-based, always reliable) ---

const STRUCTURED_PII_PATTERNS = {
  // International phone: +xx, 7-15 digits with optional separators
  phone: /(?:\+\d{1,3}[-.\s]?)?\(?\d{1,4}\)?[-.\s]?\d{2,4}[-.\s]?\d{3,4}[-.\s]?\d{0,4}\b/g,
  email: /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b/g,
  creditCard: /\b(?:\d{4}[-\s]?){3}\d{4}\b/g,
  // US SSN
  ssn: /\b\d{3}-\d{2}-\d{4}\b/g,
  passport: /\b[A-Z]{1,2}\d{6,9}\b/g,
  // English + Dutch street patterns
  address: /\b\d+\s+[A-Za-z\s]+(?:Street|St|Avenue|Ave|Road|Rd|Boulevard|Blvd|Drive|Dr|Lane|Ln|Court|Ct|Circle|Cir|Terrace|Ter|Way|Park|Parkway|Pkwy|Place|Pl|Square|Sq|Trail|Trl|straat|laan|weg|plein|gracht|kade|singel)\b/gi,
  healthInsuranceId: /\b[A-Z]{2}\d{10}\b/g,
  dateOfBirth: /\b(?:0[1-9]|1[0-2])[-/](?:0[1-9]|[12]\d|3[01])[-/](?:19|20)\d{2}\b/g,
  ipAddress: /\b(?:[0-9]{1,3}\.){3}[0-9]{1,3}\b/g,
  // IBAN (NL, DE, BE, etc.)
  iban: /\b[A-Z]{2}\d{2}\s?[A-Z]{4}\s?[\d\s]{8,26}\b/g,
  // Dutch license plates (common formats)
  licensePlate: /\b\d{1,2}-[A-Z]{2,3}-\d{1,2}\b|\b[A-Z]{2}-\d{2,3}-[A-Z]{1,2}\b/g,
};

/**
 * Context-based PII patterns: match numbers preceded by identifying keywords.
 * Catches things like "BSN is 1234567" or "telefoonnummer is 06123456789"
 */
const CONTEXT_PII_PATTERNS: { type: string; pattern: RegExp }[] = [
  // BSN / social security / sofi preceded by keyword
  { type: 'ssn', pattern: /(?:BSN|bsn|sofi|burgerservicenummer|social\s+security)\s+(?:is|:)?\s*(\d{7,9})/gi },
  // Phone/tel preceded by keyword (any digit sequence 7-15 chars)
  { type: 'phone', pattern: /(?:telefoon(?:nummer)?|phone\s*(?:number)?|tel|mobiel|mobile|nummer)\s+(?:is|:)?\s*(\+?\d[\d\s\-.]{6,17}\d)/gi },
  // Account/IBAN preceded by keyword
  { type: 'bankAccount', pattern: /(?:rekening(?:nummer)?|account\s*(?:number)?|IBAN)\s+(?:is|:)?\s*([A-Z]{2}\d{2}\s?[A-Z]{4}\s?[\d\s]{8,26}|\d{9,17})/gi },
];

interface PiiMatch {
  type: string;
  value: string;
  start: number;
  end: number;
  placeholder: string;
  source: 'gliner' | 'regex';
}

export async function anonymizeTranscription(text: string): Promise<AnonymizationResult> {
  // Try hybrid approach (GLiNER + regex) when model is available
  try {
    if (await isGLiNERAvailable()) {
      console.log('[Anonymization] Using hybrid approach (GLiNER + regex)');
      return anonymizeHybrid(text);
    }
  } catch (error) {
    console.warn('[Anonymization] GLiNER failed, falling back to regex:', error);
  }

  console.log('[Anonymization] Using regex fallback');
  return anonymizeWithRegex(text);
}

/**
 * Hybrid anonymization: GLiNER for contextual entities + regex for structured patterns.
 * This gives the best coverage — GLiNER catches names, orgs, locations that regex misses,
 * while regex reliably catches structured patterns like emails, phone numbers, SSNs.
 */
async function anonymizeHybrid(text: string): Promise<AnonymizationResult> {
  const mappings: Record<string, string> = {};
  const counters: Record<string, number> = {};

  // 1. Get GLiNER detections (names, orgs, locations, etc.)
  const glinerEntities = await detectPII(text);
  const allMatches: PiiMatch[] = [];

  for (const entity of glinerEntities) {
    const type = LABEL_TO_TYPE[entity.label] || entity.label;
    if (!counters[type]) counters[type] = 1;
    allMatches.push({
      type,
      value: entity.text,
      start: entity.start,
      end: entity.end,
      placeholder: '', // assigned after dedup
      source: 'gliner',
    });
  }

  // 2. Get regex detections for structured patterns
  for (const [type, pattern] of Object.entries(STRUCTURED_PII_PATTERNS)) {
    let match;
    while ((match = pattern.exec(text)) !== null) {
      allMatches.push({
        type,
        value: match[0],
        start: match.index,
        end: match.index + match[0].length,
        placeholder: '',
        source: 'regex',
      });
    }
  }

  // Context-based patterns (keyword + number)
  for (const { type, pattern } of CONTEXT_PII_PATTERNS) {
    let ctxMatch;
    while ((ctxMatch = pattern.exec(text)) !== null) {
      const value = ctxMatch[1].trim();
      const valueStart = text.indexOf(value, ctxMatch.index);
      allMatches.push({
        type,
        value,
        start: valueStart >= 0 ? valueStart : ctxMatch.index,
        end: (valueStart >= 0 ? valueStart : ctxMatch.index) + value.length,
        placeholder: '',
        source: 'regex',
      });
    }
  }

  // 3. Deduplicate: prefer GLiNER matches over regex for overlapping spans
  const sorted = [...allMatches].sort((a, b) => {
    if (a.start !== b.start) return a.start - b.start;
    // For same start: prefer longer span, then prefer gliner
    if (a.end !== b.end) return b.end - a.end;
    return a.source === 'gliner' ? -1 : 1;
  });

  const deduped: PiiMatch[] = [];
  for (const match of sorted) {
    const overlaps = deduped.some(
      (m) => match.start < m.end && match.end > m.start,
    );
    if (!overlaps) {
      deduped.push(match);
    }
  }

  // 4. Assign placeholders and build anonymized text
  // Sort by position (reverse) so we can replace without shifting offsets
  deduped.sort((a, b) => b.start - a.start);

  let anonymized = text;
  for (const match of deduped) {
    if (!counters[match.type]) counters[match.type] = 1;
    const placeholder = `<${match.type} ${counters[match.type]}>`;
    counters[match.type]++;

    match.placeholder = placeholder;
    mappings[placeholder] = match.value;
    anonymized = anonymized.slice(0, match.start) + placeholder + anonymized.slice(match.end);
  }

  console.log(`[Anonymization] Found ${deduped.length} PII entities (${deduped.filter(m => m.source === 'gliner').length} GLiNER, ${deduped.filter(m => m.source === 'regex').length} regex)`);

  return { anonymized, mappings };
}

/** Regex-only anonymization (fallback when model not downloaded) */
async function anonymizeWithRegex(text: string): Promise<AnonymizationResult> {
  const mappings: Record<string, string> = {};
  let anonymized = text;

  const counters: Record<string, number> = {
    phone: 1, email: 1, creditCard: 1, ssn: 1, passport: 1,
    address: 1, bankAccount: 1, healthInsuranceId: 1, dateOfBirth: 1,
    ipAddress: 1, person: 1, iban: 1, licensePlate: 1,
  };

  const matches: { type: string; value: string; placeholder: string }[] = [];

  for (const [type, pattern] of Object.entries(STRUCTURED_PII_PATTERNS)) {
    let match;
    while ((match = pattern.exec(text)) !== null) {
      matches.push({
        type,
        value: match[0],
        placeholder: `<${type} ${counters[type]}>`,
      });
      counters[type]++;
    }
  }

  // Context-based patterns (keyword + number)
  for (const { type, pattern } of CONTEXT_PII_PATTERNS) {
    if (!counters[type]) counters[type] = 1;
    let ctxMatch;
    while ((ctxMatch = pattern.exec(text)) !== null) {
      const value = ctxMatch[1].trim();
      if (!matches.some((m) => m.value === value)) {
        matches.push({
          type,
          value,
          placeholder: `<${type} ${counters[type]}>`,
        });
        counters[type]++;
      }
    }
  }

  // Detect person names (capitalized sequences)
  const personPattern = /\b[A-Z][a-z]+(?:\s+[A-Z][a-z]+)*\b/g;
  let match;
  while ((match = personPattern.exec(text)) !== null) {
    const value = match[0];
    if (!matches.some((m) => m.value === value) && isLikelyPersonName(value)) {
      matches.push({
        type: 'person',
        value,
        placeholder: `<person ${counters.person}>`,
      });
      counters.person++;
    }
  }

  const sortedMatches = matches.sort((a, b) => {
    const posA = text.indexOf(a.value);
    const posB = text.indexOf(b.value);
    return posB - posA;
  });

  const seen = new Set<string>();
  const uniqueMatches = sortedMatches.filter((match) => {
    if (seen.has(match.value.toLowerCase())) return false;
    seen.add(match.value.toLowerCase());
    return true;
  });

  for (const match of uniqueMatches) {
    const regex = new RegExp(`\\b${escapeRegex(match.value)}\\b`, 'gi');
    anonymized = anonymized.replace(regex, match.placeholder);
    mappings[match.placeholder] = match.value;
  }

  return { anonymized, mappings };
}

function isLikelyPersonName(text: string): boolean {
  const commonWords = [
    'The', 'And', 'Or', 'But', 'In', 'On', 'At', 'To', 'For', 'Of', 'With',
    'By', 'From', 'Is', 'Are', 'Was', 'Were', 'Been', 'Be', 'Have', 'Has',
    'Had', 'Do', 'Does', 'Did', 'Will', 'Would', 'Should', 'Could', 'May',
    'Might', 'Must', 'Can',
    // Dutch common words
    'Het', 'Een', 'Dat', 'Die', 'Dit', 'Met', 'Van', 'Voor', 'Naar', 'Maar',
  ];
  if (commonWords.includes(text)) return false;
  const words = text.split(/\s+/);
  if (words.length === 1) return false;
  return words.every((word) => /^[A-Z]/.test(word) && word.length > 1);
}

function escapeRegex(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

export function reversePIIMappings(text: string, mappings: Record<string, string>): string {
  let result = text;
  for (const [placeholder, original] of Object.entries(mappings)) {
    const regex = new RegExp(escapeRegex(placeholder), 'g');
    result = result.replace(regex, original);
  }
  return result;
}

export async function getPIIStats(text: string): Promise<Record<string, number>> {
  const stats: Record<string, number> = {};
  for (const [type, pattern] of Object.entries(STRUCTURED_PII_PATTERNS)) {
    const matches = text.match(pattern);
    if (matches) stats[type] = matches.length;
  }
  return stats;
}
