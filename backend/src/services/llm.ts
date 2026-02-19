import OpenAI from 'openai';
import { GoogleGenerativeAI } from '@google/generative-ai';
import { Mistral } from '@mistralai/mistralai';
import type { App } from '../index.js';

export interface ApiKeyRecord {
  openaiKey?: string;
  geminiKey?: string;
  mistralKey?: string;
}

/**
 * Process text with LLM using configured provider
 * Supports OpenAI, Gemini, and Mistral via their native SDKs
 */
export async function processWithLLM(
  app: App,
  text: string,
  provider: string,
  model: string,
  prompt: string,
  apiKeys?: ApiKeyRecord
): Promise<string> {
  const fullPrompt = `${prompt}\n\nText to process:\n${text}`;

  app.logger.info({ provider, model }, 'Processing text with LLM');

  try {
    let response: string;

    switch (provider) {
      case 'openai': {
        const apiKey = apiKeys?.openaiKey || process.env.OPENAI_API_KEY;
        if (!apiKey) throw new Error('OpenAI API key not configured. Add it in Settings → API Keys.');
        const client = new OpenAI({ apiKey });
        const result = await client.chat.completions.create({
          model,
          messages: [{ role: 'user', content: fullPrompt }],
          temperature: 0.7,
        });
        response = result.choices[0]?.message?.content || '';
        break;
      }
      case 'gemini': {
        const apiKey = apiKeys?.geminiKey || process.env.GEMINI_API_KEY;
        if (!apiKey) throw new Error('Gemini API key not configured. Add it in Settings → API Keys.');
        const genAI = new GoogleGenerativeAI(apiKey);
        const genModel = genAI.getGenerativeModel({ model });
        const result = await genModel.generateContent(fullPrompt);
        response = result.response.text();
        break;
      }
      case 'mistral': {
        const apiKey = apiKeys?.mistralKey || process.env.MISTRAL_API_KEY;
        if (!apiKey) throw new Error('Mistral API key not configured. Add it in Settings → API Keys.');
        const client = new Mistral({ apiKey });
        const result = await client.chat.complete({
          model,
          messages: [{ role: 'user', content: fullPrompt }],
          temperature: 0.7,
        });
        response = result.choices?.[0]?.message?.content as string || '';
        break;
      }
      default:
        throw new Error(`Unsupported LLM provider: ${provider}`);
    }

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
  // Check user-provided keys first, then fall back to environment variables
  switch (provider) {
    case 'openai':
      return !!(apiKeys?.openaiKey || process.env.OPENAI_API_KEY);
    case 'gemini':
      return !!(apiKeys?.geminiKey || process.env.GEMINI_API_KEY);
    case 'mistral':
      return !!(apiKeys?.mistralKey || process.env.MISTRAL_API_KEY);
    default:
      return false;
  }
}

/**
 * Process text with streaming (for real-time updates)
 */
export async function processWithLLMStreaming(
  app: App,
  text: string,
  provider: string,
  model: string,
  prompt: string,
  apiKeys?: ApiKeyRecord
): Promise<string> {
  // For now, fall back to non-streaming
  return processWithLLM(app, text, provider, model, prompt, apiKeys);
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
