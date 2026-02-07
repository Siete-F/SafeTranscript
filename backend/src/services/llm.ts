import { gateway } from '@specific-dev/framework';
import { generateText } from 'ai';
import type { App } from '../index.js';
import * as schema from '../db/schema.js';

export interface ApiKeyRecord {
  openaiKey?: string;
  geminiKey?: string;
  mistralKey?: string;
}

/**
 * Process text with LLM using configured provider
 * Supports OpenAI, Gemini, and Mistral
 */
export async function processWithLLM(
  app: App,
  text: string,
  provider: string,
  model: string,
  prompt: string,
  apiKeys?: ApiKeyRecord
): Promise<string> {
  try {
    app.logger.info(
      { provider, model },
      'Processing text with LLM'
    );

    // Build the full prompt
    const fullPrompt = `${prompt}\n\nText to process:\n${text}`;

    // Use the framework gateway for LLM access
    // The gateway handles authentication automatically
    const { text: response } = await generateText({
      model: gateway(`${provider}/${model}`),
      prompt: fullPrompt,
      temperature: 0.7,
    });

    app.logger.info(
      { provider, model, responseLength: response.length },
      'LLM processing completed'
    );

    return response;
  } catch (error) {
    app.logger.error(
      { provider, model, err: error },
      'LLM processing failed'
    );
    throw new Error(`Failed to process with ${provider} ${model}: ${(error as Error).message}`);
  }
}

/**
 * Get available models for each provider
 */
export const AVAILABLE_MODELS = {
  openai: [
    'gpt-4o',
    'gpt-4-turbo',
    'gpt-4',
    'gpt-3.5-turbo',
  ],
  gemini: [
    'gemini-2.0-flash',
    'gemini-1.5-pro',
    'gemini-1.5-flash',
    'gemini-pro',
  ],
  mistral: [
    'mistral-large-latest',
    'mistral-medium-latest',
    'mistral-small-latest',
  ],
};

/**
 * Validate that the selected model is available for the provider
 */
export function validateModel(provider: string, model: string): boolean {
  const models = AVAILABLE_MODELS[provider as keyof typeof AVAILABLE_MODELS];
  if (!models) {
    return false;
  }
  return models.includes(model);
}

/**
 * Get provider from model string
 */
export function getProviderFromModel(model: string): string {
  if (model.startsWith('gpt-') || model.startsWith('text-')) {
    return 'openai';
  }
  if (model.startsWith('gemini-')) {
    return 'gemini';
  }
  if (model.startsWith('mistral-')) {
    return 'mistral';
  }
  return 'openai'; // default
}

/**
 * Check if API keys are configured for a provider
 */
export function hasApiKeysForProvider(apiKeys: ApiKeyRecord | undefined, provider: string): boolean {
  if (!apiKeys) {
    // If using framework gateway, API keys are managed automatically
    return true;
  }

  switch (provider) {
    case 'openai':
      return !!apiKeys.openaiKey;
    case 'gemini':
      return !!apiKeys.geminiKey;
    case 'mistral':
      return !!apiKeys.mistralKey;
    default:
      return false;
  }
}

/**
 * Process text with streaming (for real-time updates)
 */
export async function processWithLLMStreaming(
  provider: string,
  model: string,
  prompt: string,
  text: string,
  onChunk: (chunk: string) => void
): Promise<string> {
  // This would be used for streaming responses
  // Implementation depends on the framework's streaming capabilities

  // For now, fall back to non-streaming
  return processWithLLM(
    {} as App, // This would need to be passed in properly in real implementation
    text,
    provider,
    model,
    prompt
  );
}

/**
 * Batch process multiple texts with LLM
 */
export async function batchProcessWithLLM(
  app: App,
  texts: string[],
  provider: string,
  model: string,
  prompt: string,
  apiKeys?: ApiKeyRecord
): Promise<string[]> {
  const results: string[] = [];

  for (const text of texts) {
    try {
      const result = await processWithLLM(app, text, provider, model, prompt, apiKeys);
      results.push(result);
    } catch (error) {
      app.logger.error(
        { text: text.substring(0, 100), err: error },
        'Batch processing failed for item'
      );
      results.push(''); // Add empty string for failed items
    }
  }

  return results;
}
