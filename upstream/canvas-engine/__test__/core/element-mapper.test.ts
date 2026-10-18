import { describe, expect, it } from 'vitest';
import type { ImageElement, ShapeElement } from '@resume-editor/shared';
import {
  MIN_ELEMENT_SIZE,
  normalizeCornerRadius,
  toImageAttrs,
  toRectAttrs,
} from '../../src/core/element-mapper';

const baseShape: ShapeElement = {
  id: 'shape-1',
  type: 'shape',
  name: '形状',
  left: 0,
  top: 0,
  width: 120,
  height: 80,
  rotation: 0,
  opacity: 1,
  visible: true,
  locked: false,
  zIndex: 0,
  shapeType: 'roundedRectangle',
  fill: '#ffffff',
  strokeColor: '#000000',
  strokeWidth: 1,
  borderRadius: 12,
};

const baseImage: ImageElement = {
  id: 'image-1',
  type: 'image',
  name: '图片',
  left: 0,
  top: 0,
  width: 28,
  height: 28,
  rotation: 0,
  opacity: 1,
  visible: true,
  locked: false,
  zIndex: 0,
  src: '',
  originalWidth: 64,
  originalHeight: 64,
  cropX: 0,
  cropY: 0,
  cropWidth: 64,
  cropHeight: 64,
  borderRadius: 0,
  objectFit: 'contain',
};

describe('element-mapper geometry sanitization', () => {
  it('clamps negative corner radius before passing attrs to Konva Rect', () => {
    const attrs = toRectAttrs({ ...baseShape, width: -10, height: 2, borderRadius: -1 });

    expect(attrs.width).toBe(MIN_ELEMENT_SIZE);
    expect(attrs.height).toBe(MIN_ELEMENT_SIZE);
    expect(attrs.cornerRadius).toBe(0);
  });

  it('caps corner radius to half of the shortest side', () => {
    expect(normalizeCornerRadius(999, 20, 10)).toBe(5);
    expect(toRectAttrs({ ...baseShape, width: 20, height: 10, borderRadius: 999 }).cornerRadius).toBe(5);
  });

  it('sanitizes image attrs used by loaded images and placeholders', () => {
    const attrs = toImageAttrs({ ...baseImage, width: 1, height: -8, borderRadius: -1 });

    expect(attrs.width).toBe(MIN_ELEMENT_SIZE);
    expect(attrs.height).toBe(MIN_ELEMENT_SIZE);
    expect(attrs.cornerRadius).toBe(0);
  });
});
