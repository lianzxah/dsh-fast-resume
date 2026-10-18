import { describe, expect, it } from 'vitest';
import { resolvePdfRenderOptions } from '../../src/core/pdf-export-options';

describe('resolvePdfRenderOptions', () => {
  it('uses the balanced JPEG preset by default', () => {
    expect(resolvePdfRenderOptions()).toEqual({
      pixelRatio: 1.5,
      background: true,
      mimeType: 'image/jpeg',
      quality: 0.88,
    });
  });

  it('supports compact and high quality presets', () => {
    expect(resolvePdfRenderOptions({ preset: 'compact' })).toMatchObject({
      pixelRatio: 1.25,
      mimeType: 'image/jpeg',
      quality: 0.78,
    });
    expect(resolvePdfRenderOptions({ preset: 'high' })).toMatchObject({
      pixelRatio: 2,
      mimeType: 'image/jpeg',
      quality: 0.94,
    });
  });

  it('applies explicit overrides and clamps unsafe numeric values', () => {
    expect(
      resolvePdfRenderOptions({
        preset: 'compact',
        pixelRatio: 20,
        quality: -1,
        mimeType: 'image/png',
        background: false,
      })
    ).toEqual({
      pixelRatio: 4,
      background: false,
      mimeType: 'image/png',
      quality: 0.1,
    });
  });

  it('falls back to balanced for an unknown runtime preset', () => {
    expect(resolvePdfRenderOptions({ preset: 'unexpected' as never })).toMatchObject({
      pixelRatio: 1.5,
      quality: 0.88,
    });
  });
});
