import { describe, expect, it } from 'vitest';
import { DEFAULT_PAGE_CONFIG } from '@resume-editor/shared';
import { getPageMetrics } from '../../src/core/page-metrics';

describe('getPageMetrics', () => {
  it('converts A4 page config to px metrics', () => {
    const metrics = getPageMetrics(DEFAULT_PAGE_CONFIG);

    expect(metrics.widthPx).toBe(794);
    expect(metrics.heightPx).toBe(1123);
    expect(metrics.backgroundColor).toBe('#ffffff');
  });
});
