import { describe, expect, it } from 'vitest';
import {
  BUSINESS_ICON_PRESETS,
  buildBusinessIconImageUpdates,
  businessIconToDataUrl,
  createBusinessIconImageElement,
  findBusinessIconPreset,
  renderBusinessIconSvg,
} from '../src';

describe('business icon presets', () => {
  it('includes common business icons for link icons', () => {
    const ids = BUSINESS_ICON_PRESETS.map((preset) => preset.id);

    expect(ids).toContain('github');
    expect(ids).toContain('wechat');
    expect(ids).toContain('journal');
    expect(ids).toContain('scholar');
  });

  it('renders real SVG presets as data URLs', () => {
    expect(renderBusinessIconSvg('github')).toContain('viewBox="0 0 1024 1024"');
    expect(renderBusinessIconSvg('wechat')).toContain('aria-label="微信"');
    expect(renderBusinessIconSvg('journal')).toContain('aria-label="文献期刊"');
    expect(businessIconToDataUrl('github')).toMatch(/^data:image\/svg\+xml;charset=utf-8,/);
  });

  it('creates editable link icon image elements from presets', () => {
    const element = createBusinessIconImageElement('github', 12, 24, {
      imageRole: 'linkIcon',
      linkUrl: 'https://github.com/example',
    });

    expect(element?.type).toBe('image');
    expect(element?.imageRole).toBe('linkIcon');
    expect(element?.iconPresetId).toBe('github');
    expect(element?.link?.url).toBe('https://github.com/example');
  });

  it('builds image updates without changing the existing link URL', () => {
    const updates = buildBusinessIconImageUpdates('wechat', 'linkIcon');

    expect(updates?.imageRole).toBe('linkIcon');
    expect(updates?.iconPresetId).toBe('wechat');
    expect(updates?.src).toContain('data:image/svg+xml');
    expect(findBusinessIconPreset(updates?.iconPresetId)?.label).toBe('微信');
  });
});
