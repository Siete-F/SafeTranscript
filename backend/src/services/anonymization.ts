/**
 * PII Detection and Anonymization Service
 * Detects and masks personally identifiable information
 */

export interface AnonymizationResult {
  anonymized: string;
  mappings: Record<string, string>;
}

// Regular expressions for PII detection
const PII_PATTERNS = {
  // Phone numbers: (XXX) XXX-XXXX, XXX-XXX-XXXX, XXX.XXX.XXXX, 1XXXXXXXXXX
  phone: /\b(?:\+?1[-.\s]?)?\(?[0-9]{3}\)?[-.\s]?[0-9]{3}[-.\s]?[0-9]{4}\b/g,

  // Email addresses
  email: /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b/g,

  // Credit card numbers (16 digits, grouped by 4)
  creditCard: /\b(?:\d{4}[-\s]?){3}\d{4}\b/g,

  // SSN (XXX-XX-XXXX)
  ssn: /\b\d{3}-\d{2}-\d{4}\b/g,

  // Passport numbers (simple pattern: 1-9 letters followed by 6-9 digits)
  passport: /\b[A-Z]{1,2}\d{6,9}\b/g,

  // US addresses (simplified)
  address: /\b\d+\s+[A-Za-z\s]+(?:Street|St|Avenue|Ave|Road|Rd|Boulevard|Blvd|Drive|Dr|Lane|Ln|Court|Ct|Circle|Cir|Terrace|Ter|Way|Park|Parkway|Pkwy|Place|Pl|Square|Sq|Trail|Trl|Park)\b/gi,

  // Bank account numbers (9-17 digits)
  bankAccount: /\b\d{9,17}\b(?=.*account|.*account)/gi,

  // Health insurance IDs
  healthInsuranceId: /\b[A-Z]{2}\d{10}\b/g,

  // Date of birth patterns (MM/DD/YYYY, MM-DD-YYYY, YYYY-MM-DD)
  dateOfBirth: /\b(?:0[1-9]|1[0-2])[-\/](?:0[1-9]|[12]\d|3[01])[-\/](?:19|20)\d{2}\b/g,

  // IPv4 addresses
  ipAddress: /\b(?:[0-9]{1,3}\.){3}[0-9]{1,3}\b/g,
};

interface PiiMatch {
  type: string;
  value: string;
  placeholder: string;
}

/**
 * Detect and anonymize PII in text
 * @param text The text to anonymize
 * @param sensitiveWords Additional words to treat as PII (e.g., company names, person names)
 * @returns Anonymized text and mapping of placeholders to original values
 */
export async function anonymizeTranscription(text: string, sensitiveWords: string[] = []): Promise<AnonymizationResult> {
  const mappings: Record<string, string> = {};
  let anonymized = text;

  // Track counters for each PII type
  const counters: Record<string, number> = {
    phone: 1,
    email: 1,
    creditCard: 1,
    ssn: 1,
    passport: 1,
    address: 1,
    bankAccount: 1,
    healthInsuranceId: 1,
    dateOfBirth: 1,
    ipAddress: 1,
    person: 1,
    organization: 1,
  };

  // Find all PII matches
  const matches: PiiMatch[] = [];

  // Check standard patterns
  for (const [type, pattern] of Object.entries(PII_PATTERNS)) {
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

  // Detect person names (capitalized sequences)
  const personPattern = /\b[A-Z][a-z]+(?:\s+[A-Z][a-z]+)*\b/g;
  let match;
  while ((match = personPattern.exec(text)) !== null) {
    // Simple heuristic: if it's capitalized and not in standard patterns, treat as person name
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

  // Check sensitive words provided by user
  for (const word of sensitiveWords) {
    const wordPattern = new RegExp(`\\b${escapeRegex(word)}\\b`, 'gi');
    while ((match = wordPattern.exec(text)) !== null) {
      const found = matches.find((m) => m.value.toLowerCase() === match[0].toLowerCase());
      if (!found) {
        matches.push({
          type: 'organization',
          value: match[0],
          placeholder: `<organization ${counters.organization}>`,
        });
        counters.organization++;
      }
    }
  }

  // Sort matches by position in text (reverse order to maintain correct indices when replacing)
  const sortedMatches = matches.sort((a, b) => {
    const posA = text.indexOf(a.value);
    const posB = text.indexOf(b.value);
    return posB - posA;
  });

  // Remove duplicates (keep first occurrence)
  const seen = new Set<string>();
  const uniqueMatches = sortedMatches.filter((match) => {
    if (seen.has(match.value.toLowerCase())) {
      return false;
    }
    seen.add(match.value.toLowerCase());
    return true;
  });

  // Apply replacements and build mappings
  for (const match of uniqueMatches) {
    // Create case-insensitive replacement
    const regex = new RegExp(`\\b${escapeRegex(match.value)}\\b`, 'gi');
    anonymized = anonymized.replace(regex, match.placeholder);
    mappings[match.placeholder] = match.value;
  }

  return {
    anonymized,
    mappings,
  };
}

/**
 * Simple heuristic to detect if a capitalized phrase is likely a person name
 */
function isLikelyPersonName(text: string): boolean {
  // Skip common non-name words
  const commonWords = [
    'The',
    'And',
    'Or',
    'But',
    'In',
    'On',
    'At',
    'To',
    'For',
    'Of',
    'With',
    'By',
    'From',
    'Is',
    'Are',
    'Was',
    'Were',
    'Been',
    'Be',
    'Have',
    'Has',
    'Had',
    'Do',
    'Does',
    'Did',
    'Will',
    'Would',
    'Should',
    'Could',
    'May',
    'Might',
    'Must',
    'Can',
  ];

  if (commonWords.includes(text)) {
    return false;
  }

  // Check if it has more than one word and length is reasonable
  const words = text.split(/\s+/);
  if (words.length === 1) {
    return false; // Single words less likely to be full names
  }

  // Check if words start with capital letters (common in names)
  return words.every((word) => /^[A-Z]/.test(word) && word.length > 1);
}

/**
 * Escape special regex characters
 */
function escapeRegex(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Reverse anonymization mappings to restore original PII in text
 */
export function reversePIIMappings(text: string, mappings: Record<string, string>): string {
  let result = text;
  for (const [placeholder, original] of Object.entries(mappings)) {
    const regex = new RegExp(escapeRegex(placeholder), 'g');
    result = result.replace(regex, original);
  }
  return result;
}

/**
 * Get statistics about PII found in text
 */
export async function getPIIStats(text: string): Promise<Record<string, number>> {
  const stats: Record<string, number> = {};

  for (const [type, pattern] of Object.entries(PII_PATTERNS)) {
    const matches = text.match(pattern);
    if (matches) {
      stats[type] = matches.length;
    }
  }

  return stats;
}
