import OpenAI from 'openai';

export function createGitHubModelsClient() {
  return new OpenAI({
    baseURL: 'https://models.inference.ai.azure.com',
    apiKey: process.env.GITHUB_TOKEN ?? '',
  });
}

export const GITHUB_MODEL = 'gpt-4o-mini';
