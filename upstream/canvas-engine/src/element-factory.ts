import type {
  TextElement,
  ImageElement,
  ShapeElement,
  ShapeType,
  FontWeight,
  TextAlign,
} from '@resume-editor/shared';
import { generateElementId } from '@resume-editor/shared';

// ============================================================
// 元素工厂 - 创建默认元素
// ============================================================

export function createTextElement(overrides: Partial<TextElement> = {}): TextElement {
  return {
    id: generateElementId('text'),
    type: 'text',
    name: '文本',
    left: 100,
    top: 100,
    width: 200,
    height: 40,
    rotation: 0,
    opacity: 1,
    visible: true,
    locked: false,
    zIndex: 0,
    content: '双击编辑文本',
    fontSize: 16,
    fontFamily: 'Microsoft YaHei, sans-serif',
    fontWeight: 'normal' as FontWeight,
    fontStyle: 'normal',
    textAlign: 'left' as TextAlign,
    lineHeight: 1.5,
    letterSpacing: 0,
    color: '#333333',
    underline: false,
    strikethrough: false,
    ...overrides,
  };
}

export function createHeadingElement(overrides: Partial<TextElement> = {}): TextElement {
  return createTextElement({
    name: '标题',
    content: '标题文本',
    fontSize: 24,
    fontWeight: 'bold',
    width: 300,
    height: 50,
    ...overrides,
  });
}

export function createImageElement(overrides: Partial<ImageElement> = {}): ImageElement {
  return {
    id: generateElementId('image'),
    type: 'image',
    name: '图片',
    left: 100,
    top: 100,
    width: 200,
    height: 200,
    rotation: 0,
    opacity: 1,
    visible: true,
    locked: false,
    zIndex: 0,
    src: '',
    originalWidth: 200,
    originalHeight: 200,
    cropX: 0,
    cropY: 0,
    cropWidth: 200,
    cropHeight: 200,
    borderRadius: 0,
    objectFit: 'cover',
    ...overrides,
  };
}

export function createShapeElement(
  shapeType: ShapeType = 'rectangle',
  overrides: Partial<ShapeElement> = {}
): ShapeElement {
  return {
    id: generateElementId('shape'),
    type: 'shape',
    name: `形状-${shapeType}`,
    left: 100,
    top: 100,
    width: 150,
    height: 150,
    rotation: 0,
    opacity: 1,
    visible: true,
    locked: false,
    zIndex: 0,
    shapeType,
    fill: '#e5e7eb',
    strokeColor: '#6b7280',
    strokeWidth: 1,
    borderRadius: 0,
    ...overrides,
  };
}

export function createDividerElement(overrides: Partial<ShapeElement> = {}): ShapeElement {
  return createShapeElement('line', {
    name: '分割线',
    width: 400,
    height: 2,
    fill: 'transparent',
    strokeColor: '#d1d5db',
    strokeWidth: 1,
    ...overrides,
  });
}
