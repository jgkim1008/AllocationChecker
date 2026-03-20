import OpenAI from 'openai';

export const FALLBACK_MODELS = [
  'gpt-4o-mini',
  'gpt-4o',
  'Meta-Llama-3.1-70B-Instruct',
  'Mistral-large',
  'Phi-3.5-mini-instruct',
] as const;

export type GitHubModel = (typeof FALLBACK_MODELS)[number];

export function createGitHubModelsClient() {
  return new OpenAI({
    baseURL: 'https://models.inference.ai.azure.com',
    apiKey: process.env.GITHUB_TOKEN ?? '',
  });
}

/** 429/401 등 quota 오류 시 다음 모델로 자동 폴백 */
export async function createCompletion(
  params: Omit<OpenAI.Chat.ChatCompletionCreateParamsNonStreaming, 'model'>,
  preferredModel: GitHubModel = FALLBACK_MODELS[0]
): Promise<{ result: OpenAI.Chat.ChatCompletion; modelUsed: GitHubModel }> {
  const client = createGitHubModelsClient();
  const startIndex = FALLBACK_MODELS.indexOf(preferredModel);
  const modelsToTry = [
    ...FALLBACK_MODELS.slice(startIndex),
    ...FALLBACK_MODELS.slice(0, startIndex),
  ];

  let lastError: unknown;
  for (const model of modelsToTry) {
    try {
      const result = await client.chat.completions.create({ ...params, model });
      return { result, modelUsed: model };
    } catch (err: unknown) {
      const status = (err as { status?: number })?.status;
      if (status === 429 || status === 401 || status === 403) {
        lastError = err;
        continue;
      }
      throw err;
    }
  }
  throw lastError;
}

/** 스트리밍 버전: 첫 번째로 성공한 모델로 스트림 반환 */
export async function createStreamingCompletion(
  params: Omit<OpenAI.Chat.ChatCompletionCreateParamsStreaming, 'model' | 'stream'>,
  preferredModel: GitHubModel = FALLBACK_MODELS[0]
): Promise<{ stream: AsyncIterable<OpenAI.Chat.ChatCompletionChunk>; modelUsed: GitHubModel }> {
  const client = createGitHubModelsClient();
  const startIndex = FALLBACK_MODELS.indexOf(preferredModel);
  const modelsToTry = [
    ...FALLBACK_MODELS.slice(startIndex),
    ...FALLBACK_MODELS.slice(0, startIndex),
  ];

  let lastError: unknown;
  for (const model of modelsToTry) {
    try {
      const stream = await client.chat.completions.create({ ...params, model, stream: true });
      return { stream, modelUsed: model };
    } catch (err: unknown) {
      const status = (err as { status?: number })?.status;
      if (status === 429 || status === 401 || status === 403) {
        lastError = err;
        continue;
      }
      throw err;
    }
  }
  throw lastError;
}
