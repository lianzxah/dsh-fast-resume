import { describe, expect, it } from 'vitest';
import {
  DRAWING_CATALOG_CATEGORIES,
  createDrawingElement,
  findDrawingCatalogItem,
  listDrawingCatalogItems,
  renderDrawingIconSvg,
  svgToDataUrl,
} from '../src';

describe('绘制组件目录', () => {
  it('提供多栏目组件管理入口', () => {
    expect(DRAWING_CATALOG_CATEGORIES.map((category) => category.id)).toEqual([
      'basic',
      'shapes',
      'contact-icons',
      'profile-icons',
      'skill-icons',
    ]);
    expect(listDrawingCatalogItems('shapes').every((item) => item.categoryId === 'shapes')).toBe(true);
    expect(listDrawingCatalogItems('contact-icons').length).toBeGreaterThanOrEqual(4);
  });

  it('能根据图形目录项创建形状元素', () => {
    const element = createDrawingElement('roundedRectangle', 12, 24);

    expect(element?.type).toBe('shape');
    if (element?.type !== 'shape') throw new Error('expected shape element');
    expect(element.shapeType).toBe('roundedRectangle');
    expect(element.left).toBe(12);
    expect(element.top).toBe(24);
    expect(element.borderRadius).toBe(12);
  });

  it('能根据 Icon 目录项创建可编辑图片元素', () => {
    const element = createDrawingElement('icon-github', 36, 48);

    expect(element?.type).toBe('image');
    if (element?.type !== 'image') throw new Error('expected image element');
    expect(element.name).toBe('Icon - GitHub');
    expect(element.left).toBe(36);
    expect(element.top).toBe(48);
    expect(element.objectFit).toBe('contain');
    expect(element.width).toBe(28);
    expect(element.height).toBe(28);
    expect(element.src).toMatch(/^data:image\/svg\+xml;charset=utf-8,/);
    expect(element.imageRole).toBe('icon');
    expect(element.iconPresetId).toBe('github');
    expect(decodeURIComponent(element.src)).toContain('viewBox="0 0 1024 1024"');
    expect(decodeURIComponent(element.src)).toContain('M512 85.333333');
  });

  it('能创建默认可切换的图标链接元素', () => {
    const element = createDrawingElement('link-icon', 8, 16);

    expect(element?.type).toBe('image');
    if (element?.type !== 'image') throw new Error('expected image element');
    expect(element.imageRole).toBe('linkIcon');
    expect(element.iconPresetId).toBe('link');
    expect(element.link?.url).toBe('https://example.com');
  });

  it('对不存在的目录项返回 null', () => {
    expect(createDrawingElement('missing-component', 0, 0)).toBeNull();
  });

  it('Icon SVG 输出会转义特殊字符并编码为 data url', () => {
    const codeIcon = findDrawingCatalogItem('icon-code');
    expect(codeIcon).toBeDefined();

    const svg = renderDrawingIconSvg(codeIcon!);
    expect(svg).toContain('&lt;/&gt;');
    expect(svgToDataUrl(svg!)).toContain('%26lt%3B%2F%26gt%3B');
  });

  it('支持目录项直接配置 SVG 源码', () => {
    const githubIcon = findDrawingCatalogItem('icon-github');
    expect(githubIcon).toBeDefined();

    const svg = renderDrawingIconSvg(githubIcon!);
    expect(svg).toContain('aria-label="GitHub"');
    expect(svg).toContain('viewBox="0 0 1024 1024"');
    expect(svg).toContain('M512 85.333333');
  });
});
