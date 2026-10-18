import type { AiModelPreset, AiModelProviderPreset } from '../types/ai';

function preset(input: Omit<AiModelPreset, 'id'>): AiModelPreset {
  return {
    ...input,
    id: `${input.providerId}:${input.model}`,
  };
}

export const AI_MODEL_PROVIDERS: AiModelProviderPreset[] = [
  {
    id: 'deepseek',
    label: 'DeepSeek',
    baseUrl: 'https://api.deepseek.com/v1',
    apiKeyLabel: 'DeepSeek API Key',
    models: [
      preset({
        providerId: 'deepseek',
        providerLabel: 'DeepSeek',
        label: 'DeepSeek V4 Flash',
        baseUrl: 'https://api.deepseek.com/v1',
        model: 'deepseek-v4-flash',
        temperature: 0.2,
        maxTokens: 4096,
        supportsJsonMode: true,
        notes: '通用简历润色、改写与结构优化。',
      }),
      preset({
        providerId: 'deepseek',
        providerLabel: 'DeepSeek',
        label: 'DeepSeek V4 Pro',
        baseUrl: 'https://api.deepseek.com/v1',
        model: 'deepseek-v4-pro',
        temperature: 0.2,
        maxTokens: 4096,
        supportsJsonMode: true,
        notes: '适合复杂简历诊断、推理与多步骤建议。',
      }),
    ],
  },
];

export const AI_MODEL_PRESETS: AiModelPreset[] = AI_MODEL_PROVIDERS.flatMap(
  (provider) => provider.models
);

export const DEEPSEEK_V4_MODELS = ['deepseek-v4-flash', 'deepseek-v4-pro'] as const;

export function isSupportedAiModel(model: string | undefined): boolean {
  return DEEPSEEK_V4_MODELS.includes(model?.trim() as (typeof DEEPSEEK_V4_MODELS)[number]);
}

export function resolveAiModelPreset(presetId: string | undefined): AiModelPreset | undefined {
  if (!presetId) return undefined;
  return AI_MODEL_PRESETS.find((presetItem) => presetItem.id === presetId);
}

export function findAiModelPresetByRuntime(input: {
  baseUrl?: string;
  model?: string;
}): AiModelPreset | undefined {
  const baseUrl = input.baseUrl?.trim().replace(/\/$/, '');
  const model = input.model?.trim();
  if (!baseUrl || !model) return undefined;

  return AI_MODEL_PRESETS.find(
    (presetItem) => presetItem.baseUrl.replace(/\/$/, '') === baseUrl && presetItem.model === model
  );
}
