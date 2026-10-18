import { describe, expect, it } from 'vitest';
import {
  AI_MODEL_PRESETS,
  AI_MODEL_PROVIDERS,
  findAiModelPresetByRuntime,
  isSupportedAiModel,
  resolveAiModelPreset,
} from '../src';

describe('ai model presets', () => {
  it('only exposes the two supported DeepSeek V4 runtime models', () => {
    expect(AI_MODEL_PROVIDERS.map((provider) => provider.id)).toEqual(['deepseek']);
    expect(AI_MODEL_PRESETS.map((preset) => preset.model)).toEqual([
      'deepseek-v4-flash',
      'deepseek-v4-pro',
    ]);

    for (const preset of AI_MODEL_PRESETS) {
      expect(preset.id).toBe(`${preset.providerId}:${preset.model}`);
      expect(preset.baseUrl).toMatch(/^https:\/\//);
      expect(preset.model.length).toBeGreaterThan(0);
      expect(preset.temperature).toBeGreaterThanOrEqual(0);
      expect(typeof preset.supportsJsonMode).toBe('boolean');
    }
  });

  it('resolves presets by id and runtime config', () => {
    const preset = resolveAiModelPreset('deepseek:deepseek-v4-flash');

    expect(preset?.model).toBe('deepseek-v4-flash');
    expect(
      findAiModelPresetByRuntime({
        baseUrl: 'https://api.deepseek.com/v1/',
        model: 'deepseek-v4-flash',
      })?.id
    ).toBe('deepseek:deepseek-v4-flash');
    expect(isSupportedAiModel('deepseek-v4-pro')).toBe(true);
    expect(isSupportedAiModel('deepseek-chat')).toBe(false);
    expect(isSupportedAiModel('gpt-4o-mini')).toBe(false);
  });
});
