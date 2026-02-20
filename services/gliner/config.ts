/**
 * GLiNER PII Model Configuration
 */

const HF_BASE = 'https://huggingface.co/knowledgator/gliner-pii-edge-v1.0/resolve/main';

export const MODEL_FILES = {
  model: `${HF_BASE}/onnx/model_quint8.onnx`,
  tokenizer: `${HF_BASE}/tokenizer.json`,
  glinerConfig: `${HF_BASE}/gliner_config.json`,
} as const;

/** Total download size (approximate) */
export const MODEL_SIZE_MB = 50; // ~46MB model + ~3.5MB tokenizer + config

/** Default GLiNER config (overridden by downloaded gliner_config.json) */
export const DEFAULT_CONFIG = {
  spanMode: 'token_level' as const,
  maxWidth: 12,
  maxLen: 2048,
  maxTypes: 100,
  entToken: '<<ENT>>',
  sepToken: '<<SEP>>',
};

/** Default inference threshold */
export const DEFAULT_THRESHOLD = 0.3;

/**
 * PII entity labels to detect.
 * Using a focused subset for better accuracy and performance.
 */
export const PII_LABELS = [
  'person',
  'email address',
  'phone number',
  'address',
  'credit card',
  'ssn',
  'passport number',
  'driver license',
  'dob',
  'ip address',
  'bank account',
  'medical condition',
  'organization',
  'url',
  'username',
  'password',
];

/** Map GLiNER entity labels to our placeholder types */
export const LABEL_TO_TYPE: Record<string, string> = {
  'person': 'person',
  'email address': 'email',
  'phone number': 'phone',
  'address': 'address',
  'credit card': 'creditCard',
  'ssn': 'ssn',
  'passport number': 'passport',
  'driver license': 'driverLicense',
  'dob': 'dateOfBirth',
  'ip address': 'ipAddress',
  'bank account': 'bankAccount',
  'medical condition': 'medicalCondition',
  'organization': 'organization',
  'url': 'url',
  'username': 'username',
  'password': 'password',
};

/** IndexedDB storage keys for web platform */
export const IDB_STORE_NAME = 'gliner-pii-model';
export const IDB_DB_NAME = 'safetranscript-gliner';
export const IDB_DB_VERSION = 1;
