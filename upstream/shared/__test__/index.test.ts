import { describe, it, expect } from 'vitest';
import {
  mmToPx,
  pxToMm,
  mmToPt,
  ptToMm,
  A4_WIDTH_MM,
  A4_HEIGHT_MM,
  generateId,
  generateElementId,
  generatePageId,
  hexToRgb,
  rgbToHex,
  lightenColor,
  darkenColor,
  clamp,
} from '../src';

describe('单位转换', () => {
  it('mmToPx: A4 宽度应为约 793.7px (96 DPI)', () => {
    const px = mmToPx(210, 96);
    expect(px).toBeCloseTo(793.7, 0);
  });

  it('pxToMm: 793.7px 应约为 210mm', () => {
    const mm = pxToMm(793.7, 96);
    expect(mm).toBeCloseTo(210, 0);
  });

  it('mmToPt: 25.4mm 应为 72pt', () => {
    expect(mmToPt(25.4)).toBeCloseTo(72, 1);
  });

  it('ptToMm: 72pt 应为 25.4mm', () => {
    expect(ptToMm(72)).toBeCloseTo(25.4, 1);
  });

  it('A4 常量正确', () => {
    expect(A4_WIDTH_MM).toBe(210);
    expect(A4_HEIGHT_MM).toBe(297);
  });
});

describe('ID 生成', () => {
  it('generateId 返回非空字符串', () => {
    const id = generateId();
    expect(id).toBeTruthy();
    expect(typeof id).toBe('string');
  });

  it('generateId 带前缀', () => {
    const id = generateId('test');
    expect(id.startsWith('test_')).toBe(true);
  });

  it('generateElementId 带元素类型前缀', () => {
    const id = generateElementId('text');
    expect(id.startsWith('el_text_')).toBe(true);
  });

  it('generatePageId 带 page 前缀', () => {
    const id = generatePageId();
    expect(id.startsWith('page_')).toBe(true);
  });

  it('每次生成的 ID 不同', () => {
    const ids = new Set(Array.from({ length: 100 }, () => generateId()));
    expect(ids.size).toBe(100);
  });
});

describe('颜色工具', () => {
  it('hexToRgb 正确解析', () => {
    expect(hexToRgb('#ff0000')).toEqual({ r: 255, g: 0, b: 0 });
    expect(hexToRgb('#00ff00')).toEqual({ r: 0, g: 255, b: 0 });
    expect(hexToRgb('#0000ff')).toEqual({ r: 0, g: 0, b: 255 });
  });

  it('rgbToHex 正确转换', () => {
    expect(rgbToHex(255, 0, 0)).toBe('#ff0000');
    expect(rgbToHex(0, 255, 0)).toBe('#00ff00');
  });

  it('lightenColor 使颜色变亮', () => {
    const lighter = lightenColor('#000000', 50);
    const rgb = hexToRgb(lighter);
    expect(rgb!.r).toBeGreaterThan(0);
  });

  it('darkenColor 使颜色变暗', () => {
    const darker = darkenColor('#ffffff', 50);
    const rgb = hexToRgb(darker);
    expect(rgb!.r).toBeLessThan(255);
  });
});

describe('工具函数', () => {
  it('clamp 限制数值范围', () => {
    expect(clamp(5, 0, 10)).toBe(5);
    expect(clamp(-5, 0, 10)).toBe(0);
    expect(clamp(15, 0, 10)).toBe(10);
  });
});
