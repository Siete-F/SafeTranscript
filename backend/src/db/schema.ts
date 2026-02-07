import {
  pgTable,
  uuid,
  text,
  integer,
  boolean,
  jsonb,
  timestamp,
  uniqueIndex,
} from 'drizzle-orm/pg-core';
import { relations } from 'drizzle-orm';
import type { InferSelectModel, InferInsertModel } from 'drizzle-orm';

// Projects table
export const projects = pgTable(
  'projects',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: text('user_id').notNull(),
    name: text('name').notNull(),
    description: text('description'),
    llmProvider: text('llm_provider', {
      enum: ['openai', 'gemini', 'mistral'],
    }).notNull(),
    llmModel: text('llm_model').notNull(),
    llmPrompt: text('llm_prompt').notNull(),
    enableAnonymization: boolean('enable_anonymization').default(true).notNull(),
    customFields: jsonb('custom_fields').$type<Array<{ name: string; type: 'text' | 'number' | 'date' }>>(),
    sensitiveWords: jsonb('sensitive_words').$type<string[]>(),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .defaultNow()
      .$onUpdate(() => new Date())
      .notNull(),
  },
  (table) => [uniqueIndex('projects_user_id_idx').on(table.userId)]
);

// Recordings table
export const recordings = pgTable('recordings', {
  id: uuid('id').primaryKey().defaultRandom(),
  projectId: uuid('project_id').notNull().references(() => projects.id, { onDelete: 'cascade' }),
  userId: text('user_id').notNull(),
  status: text('status', {
    enum: ['pending', 'transcribing', 'anonymizing', 'processing', 'done', 'error'],
  })
    .default('pending')
    .notNull(),
  audioUrl: text('audio_url'),
  audioDuration: integer('audio_duration'), // in seconds
  customFieldValues: jsonb('custom_field_values').$type<Record<string, any>>(),
  transcription: text('transcription'),
  transcriptionData: jsonb('transcription_data').$type<Array<{ speaker: string; timestamp: number; text: string }>>(),
  anonymizedTranscription: text('anonymized_transcription'),
  piiMappings: jsonb('pii_mappings').$type<Record<string, string>>(),
  llmOutput: text('llm_output'),
  errorMessage: text('error_message'),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true })
    .defaultNow()
    .$onUpdate(() => new Date())
    .notNull(),
});

// API Keys table
export const apiKeys = pgTable(
  'api_keys',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: text('user_id').notNull().unique(),
    openaiKey: text('openai_key'),
    geminiKey: text('gemini_key'),
    mistralKey: text('mistral_key'),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .defaultNow()
      .$onUpdate(() => new Date())
      .notNull(),
  },
  (table) => [uniqueIndex('api_keys_user_id_idx').on(table.userId)]
);

// Relations
export const projectsRelations = relations(projects, ({ many }) => ({
  recordings: many(recordings),
}));

export const recordingsRelations = relations(recordings, ({ one }) => ({
  project: one(projects, {
    fields: [recordings.projectId],
    references: [projects.id],
  }),
}));

// Type exports
export type Project = InferSelectModel<typeof projects>;
export type NewProject = InferInsertModel<typeof projects>;
export type Recording = InferSelectModel<typeof recordings>;
export type NewRecording = InferInsertModel<typeof recordings>;
export type ApiKey = InferSelectModel<typeof apiKeys>;
export type NewApiKey = InferInsertModel<typeof apiKeys>;
