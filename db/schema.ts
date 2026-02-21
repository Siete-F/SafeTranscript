import { sqliteTable, text, integer } from 'drizzle-orm/sqlite-core';

export const projects = sqliteTable('projects', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  description: text('description'),
  llmProvider: text('llm_provider').notNull(), // 'openai' | 'gemini' | 'mistral'
  llmModel: text('llm_model').notNull(),
  llmPrompt: text('llm_prompt').notNull(),
  enableLlm: integer('enable_llm', { mode: 'boolean' }).notNull().default(true),
  enableAnonymization: integer('enable_anonymization', { mode: 'boolean' }).notNull().default(true),
  customFields: text('custom_fields'),     // JSON string: Array<{ name: string; type: 'text' | 'number' | 'date' }>
  sensitiveWords: text('sensitive_words'),  // JSON string: string[]
  createdAt: text('created_at').notNull(),  // ISO string
  updatedAt: text('updated_at').notNull(),  // ISO string
});

export const recordings = sqliteTable('recordings', {
  id: text('id').primaryKey(),
  projectId: text('project_id').notNull().references(() => projects.id, { onDelete: 'cascade' }),
  status: text('status').notNull().default('pending'), // 'pending' | 'transcribing' | 'anonymizing' | 'processing' | 'done' | 'error' | 'stale'
  audioPath: text('audio_path'),              // local file path (relative to documentDirectory)
  audioDuration: integer('audio_duration'),    // seconds
  customFieldValues: text('custom_field_values'), // JSON string: Record<string, any>
  transcription: text('transcription'),
  transcriptionData: text('transcription_data'),  // JSON string: TranscriptionSegment[]
  anonymizedTranscription: text('anonymized_transcription'),
  piiMappings: text('pii_mappings'),              // JSON string: Record<string, string>
  llmOutput: text('llm_output'),
  errorMessage: text('error_message'),
  createdAt: text('created_at').notNull(),
  updatedAt: text('updated_at').notNull(),
});

export const apiKeys = sqliteTable('api_keys', {
  id: text('id').primaryKey(),
  openaiKey: text('openai_key'),
  geminiKey: text('gemini_key'),
  mistralKey: text('mistral_key'),
  createdAt: text('created_at').notNull(),
  updatedAt: text('updated_at').notNull(),
});

export const settings = sqliteTable('settings', {
  key: text('key').primaryKey(),
  value: text('value').notNull(),
});
