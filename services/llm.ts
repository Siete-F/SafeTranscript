/**
 * LLM Processing Service
 * Calls OpenAI, Gemini, or Mistral APIs directly from the device.
 * Uses raw fetch instead of SDKs for maximum React Native compatibility.
 */

export interface ApiKeyRecord {
  openaiKey?: string;
  geminiKey?: string;
  mistralKey?: string;
}

/**
 * Process text with an LLM using the configured provider
 */
export async function processWithLLM(
  text: string,
  provider: string,
  model: string,
  prompt: string,
  apiKeys: ApiKeyRecord
): Promise<string> {
  const fullPrompt = `${prompt}\n\nText to process:\n${text}`;

  console.log(`[LLM] Processing with ${provider}/${model}`);

  switch (provider) {
    case 'openai':
      return callOpenAI(fullPrompt, model, apiKeys.openaiKey);
    case 'gemini':
      return callGemini(fullPrompt, model, apiKeys.geminiKey);
    case 'mistral':
      return callMistral(fullPrompt, model, apiKeys.mistralKey);
    default:
      throw new Error(`Unsupported LLM provider: ${provider}`);
  }
}

async function callOpenAI(prompt: string, model: string, apiKey?: string): Promise<string> {
  if (!apiKey) throw new Error('OpenAI API key not configured. Add it in Settings.');

  const response = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model,
      messages: [{ role: 'user', content: prompt }],
      temperature: 0.7,
    }),
  });

  if (!response.ok) {
    const err = await response.text();
    throw new Error(`OpenAI API error (${response.status}): ${err}`);
  }

  const data = await response.json();
  return data.choices?.[0]?.message?.content || '';
}

async function callGemini(prompt: string, model: string, apiKey?: string): Promise<string> {
  if (!apiKey) throw new Error('Gemini API key not configured. Add it in Settings.');

  const response = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: { temperature: 0.7 },
      }),
    }
  );

  if (!response.ok) {
    const err = await response.text();
    throw new Error(`Gemini API error (${response.status}): ${err}`);
  }

  const data = await response.json();
  return data.candidates?.[0]?.content?.parts?.[0]?.text || '';
}

async function callMistral(prompt: string, model: string, apiKey?: string): Promise<string> {
  if (!apiKey) throw new Error('Mistral API key not configured. Add it in Settings.');

  const response = await fetch('https://api.mistral.ai/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model,
      messages: [{ role: 'user', content: prompt }],
      temperature: 0.7,
    }),
  });

  if (!response.ok) {
    const err = await response.text();
    throw new Error(`Mistral API error (${response.status}): ${err}`);
  }

  const data = await response.json();
  return data.choices?.[0]?.message?.content || '';
}
