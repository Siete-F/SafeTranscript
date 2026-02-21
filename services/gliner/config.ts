/**
 * GLiNER PII Model Configuration
 *
 * Two model variants available from onnx-community/gliner_multi-v2.1:
 *   - INT8 (~349 MB): Good balance of size and accuracy
 *   - FP16 (~580 MB): Best accuracy, larger download
 *
 * Both are multilingual (Dutch, English, and 100+ languages) and use
 * the markerV0 span mode with SentencePiece (mDeBERTa-v3) tokenizer.
 */

// --- Model Variant Definitions ---

export type ModelVariantId = 'multi_int8' | 'multi_fp16';

export interface ModelVariant {
  id: ModelVariantId;
  name: string;
  description: string;
  sizeMB: number;
  urls: {
    model: string;
    tokenizer: string;
    glinerConfig: string;
  };
}

const HF_MULTI_BASE =
  'https://huggingface.co/onnx-community/gliner_multi-v2.1/resolve/main';

export const MODEL_VARIANTS: Record<ModelVariantId, ModelVariant> = {
  multi_int8: {
    id: 'multi_int8',
    name: 'GLiNER Multi v2.1 (INT8)',
    description:
      'Multilingual NER — INT8 quantized (~349 MB). Supports 100+ languages including Dutch. Good accuracy-to-size ratio.',
    sizeMB: 349,
    urls: {
      model: `${HF_MULTI_BASE}/onnx/model_int8.onnx`,
      tokenizer: `${HF_MULTI_BASE}/tokenizer.json`,
      glinerConfig: `${HF_MULTI_BASE}/gliner_config.json`,
    },
  },
  multi_fp16: {
    id: 'multi_fp16',
    name: 'GLiNER Multi v2.1 (FP16)',
    description:
      'Multilingual NER — FP16 precision (~580 MB). Best accuracy for Dutch and other languages.',
    sizeMB: 580,
    urls: {
      model: `${HF_MULTI_BASE}/onnx/model_fp16.onnx`,
      tokenizer: `${HF_MULTI_BASE}/tokenizer.json`,
      glinerConfig: `${HF_MULTI_BASE}/gliner_config.json`,
    },
  },
};

export const DEFAULT_VARIANT: ModelVariantId = 'multi_int8';

/** Settings key for storing the selected model variant */
export const SETTING_GLINER_VARIANT = 'gliner_model_variant';

// --- Backward-compatible exports ---

/** Current model files (references default variant) */
export const MODEL_FILES = MODEL_VARIANTS[DEFAULT_VARIANT].urls;

/** Total download size (approximate, for default variant) */
export const MODEL_SIZE_MB = MODEL_VARIANTS[DEFAULT_VARIANT].sizeMB;

/** Default GLiNER config (overridden by downloaded gliner_config.json) */
export const DEFAULT_CONFIG = {
  spanMode: 'markerV0' as const,
  maxWidth: 12,
  maxLen: 384,
  maxTypes: 25,
  entToken: '<<ENT>>',
  sepToken: '<<SEP>>',
};

/** Default inference threshold */
export const DEFAULT_THRESHOLD = 0.4;

/**
 * PII entity labels to detect.
 * Expanded set for better coverage across languages and contexts.
 * These labels are passed to the zero-shot GLiNER model.
 */
export const PII_LABELS = [
  'person',
  'first name',
  'last name',
  'email address',
  'phone number',
  'street address',
  'city',
  'country',
  'credit card number',
  'social security number',
  'passport number',
  'driver license number',
  'date of birth',
  'ip address',
  'bank account number',
  'iban',
  'medical condition',
  'organization',
  'url',
  'username',
  'password',
  'license plate',
];

/** Map GLiNER entity labels to our placeholder types */
export const LABEL_TO_TYPE: Record<string, string> = {
  'person': 'person',
  'first name': 'person',
  'last name': 'person',
  'email address': 'email',
  'phone number': 'phone',
  'street address': 'address',
  'city': 'location',
  'country': 'location',
  'credit card number': 'creditCard',
  'social security number': 'ssn',
  'passport number': 'passport',
  'driver license number': 'driverLicense',
  'date of birth': 'dateOfBirth',
  'ip address': 'ipAddress',
  'bank account number': 'bankAccount',
  'iban': 'bankAccount',
  'medical condition': 'medicalCondition',
  'organization': 'organization',
  'url': 'url',
  'username': 'username',
  'password': 'password',
  'license plate': 'licensePlate',
};

/** IndexedDB storage keys for web platform */
export const IDB_STORE_NAME = 'gliner-pii-model';
export const IDB_DB_NAME = 'safetranscript-gliner';
export const IDB_DB_VERSION = 2;
