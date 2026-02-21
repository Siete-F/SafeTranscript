
export interface Project {
  id: string;
  name: string;
  description?: string;
  llmProvider: 'openai' | 'gemini' | 'mistral';
  llmModel: string;
  llmPrompt: string;
  enableLlm: boolean;
  enableAnonymization: boolean;
  customFields: CustomField[];
  sensitiveWords: string[];
  recordingCount?: number;
  createdAt: string;
  updatedAt?: string;
}

export interface CustomField {
  name: string;
  type: 'text' | 'number' | 'date';
}

export interface Recording {
  id: string;
  projectId: string;
  status: 'pending' | 'transcribing' | 'anonymizing' | 'processing' | 'done' | 'error' | 'stale';
  audioPath?: string;
  audioDuration?: number;
  customFieldValues: Record<string, any>;
  transcription?: string;
  transcriptionData?: TranscriptionSegment[];
  anonymizedTranscription?: string;
  piiMappings?: Record<string, string>;
  llmOutput?: string;
  errorMessage?: string;
  createdAt: string;
  updatedAt?: string;
}

export interface TranscriptionSegment {
  speaker: string;
  timestamp: number;
  text: string;
}

export interface ApiKeys {
  openaiKey?: string;
  geminiKey?: string;
  mistralKey?: string;
}

export const LLM_PROVIDERS = {
  openai: {
    name: 'OpenAI',
    models: [
      { id: 'gpt-4', name: 'GPT-4 (Smart)' },
      { id: 'gpt-3.5-turbo', name: 'GPT-3.5 Turbo (Fast)' },
    ],
  },
  gemini: {
    name: 'Google Gemini',
    models: [
      { id: 'gemini-2.5-pro', name: 'Gemini 2.5 Pro (Smart)' },
      { id: 'gemini-1.5-flash', name: 'Gemini 1.5 Flash (Fast)' },
    ],
  },
  mistral: {
    name: 'Mistral AI',
    models: [
      { id: 'mistral-large-latest', name: 'Mistral Large (Smart)' },
      { id: 'mistral-small-latest', name: 'Mistral Small (Fast)' },
    ],
  },
};
