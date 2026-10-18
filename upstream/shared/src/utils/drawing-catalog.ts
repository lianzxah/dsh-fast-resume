import type { ImageElement, ResumeElement, ShapeElement, ShapeType, TextElement } from '../types';
import { generateElementId } from './helpers';
import {
  createBusinessIconImageElement,
  findBusinessIconPreset,
  renderBusinessIconDefinitionSvg,
  type BusinessIconDefinition,
} from './business-icons';

export type DrawingCatalogCategoryId =
  | 'basic'
  | 'shapes'
  | 'contact-icons'
  | 'profile-icons'
  | 'skill-icons';

export type DrawingCatalogItemKind = 'heading' | 'text' | 'image' | 'shape' | 'icon' | 'linkText' | 'linkIcon';

export interface DrawingCatalogCategory {
  id: DrawingCatalogCategoryId;
  label: string;
  description: string;
}

export type DrawingIconDefinition = BusinessIconDefinition;

export interface DrawingCatalogItem {
  id: string;
  label: string;
  categoryId: DrawingCatalogCategoryId;
  kind: DrawingCatalogItemKind;
  description: string;
  keywords: string[];
  shapeType?: ShapeType;
  icon?: DrawingIconDefinition;
  defaultSize?: number;
}

const DEFAULT_TEXT_FONT_FAMILY = 'Microsoft YaHei, sans-serif';
const ICON_BASE_SIZE = 64;
const DEFAULT_LINK_URL = 'https://example.com';

const CATALOG_ICON_PRESET_BY_ITEM_ID: Record<string, string> = {
  'icon-email': 'email',
  'icon-phone': 'phone',
  'icon-wechat': 'wechat',
  'icon-twitter': 'twitter',
  'icon-linkedin': 'linkedin',
  'icon-github': 'github',
  'icon-leetcode': 'leetcode',
  'icon-scholar': 'scholar',
  'icon-journal': 'journal',
  'icon-portfolio': 'portfolio',
};

function businessIcon(id: string): DrawingIconDefinition {
  const preset = findBusinessIconPreset(id);
  if (!preset) throw new Error(`Missing business icon preset: ${id}`);
  return preset.icon;
}

export const DRAWING_CATALOG_CATEGORIES: readonly DrawingCatalogCategory[] = [
  {
    id: 'basic',
    label: '基础组件',
    description: '标题、正文、图片等高频内容块',
  },
  {
    id: 'shapes',
    label: '图形绘制',
    description: '统一管理矩形、圆形、线条、标注框等绘制组件',
  },
  {
    id: 'contact-icons',
    label: '联系方式 Icon',
    description: '邮箱、电话、微信、社交账号等联系入口',
  },
  {
    id: 'profile-icons',
    label: '主页/作品 Icon',
    description: '代码主页、刷题平台、文献期刊、作品集入口',
  },
  {
    id: 'skill-icons',
    label: '技能 Icon',
    description: '编程、前端、数据库、云服务、AI、语言等技能标识',
  },
];

export const DRAWING_CATALOG_ITEMS: readonly DrawingCatalogItem[] = [
  {
    id: 'heading',
    label: '标题',
    categoryId: 'basic',
    kind: 'heading',
    description: '插入一段标题文本',
    keywords: ['title', 'heading'],
  },
  {
    id: 'text',
    label: '正文',
    categoryId: 'basic',
    kind: 'text',
    description: '插入一段正文文本',
    keywords: ['body', 'paragraph'],
  },
  {
    id: 'image',
    label: '图片',
    categoryId: 'basic',
    kind: 'image',
    description: '插入图片占位元素',
    keywords: ['photo', 'image'],
  },
  {
    id: 'link-text',
    label: '文字链接',
    categoryId: 'basic',
    kind: 'linkText',
    description: '插入可在 PDF 中点击跳转的文字链接',
    keywords: ['link', 'url', 'text'],
  },
  {
    id: 'link-icon',
    label: '图标链接',
    categoryId: 'basic',
    kind: 'linkIcon',
    description: '插入可在 PDF 中点击跳转的链接图标',
    keywords: ['link', 'url', 'icon'],
    defaultSize: 28,
  },
  {
    id: 'rectangle',
    label: '矩形',
    categoryId: 'shapes',
    kind: 'shape',
    description: '常规矩形图形',
    keywords: ['rect', 'box'],
    shapeType: 'rectangle',
  },
  {
    id: 'roundedRectangle',
    label: '圆角矩形',
    categoryId: 'shapes',
    kind: 'shape',
    description: '圆角矩形图形',
    keywords: ['rounded', 'box'],
    shapeType: 'roundedRectangle',
  },
  {
    id: 'circle',
    label: '圆形',
    categoryId: 'shapes',
    kind: 'shape',
    description: '圆形图形',
    keywords: ['circle'],
    shapeType: 'circle',
  },
  {
    id: 'ellipse',
    label: '椭圆',
    categoryId: 'shapes',
    kind: 'shape',
    description: '椭圆图形',
    keywords: ['ellipse', 'oval'],
    shapeType: 'ellipse',
  },
  {
    id: 'triangle',
    label: '三角形',
    categoryId: 'shapes',
    kind: 'shape',
    description: '三角形图形',
    keywords: ['triangle'],
    shapeType: 'triangle',
  },
  {
    id: 'diamond',
    label: '菱形',
    categoryId: 'shapes',
    kind: 'shape',
    description: '菱形图形',
    keywords: ['diamond'],
    shapeType: 'diamond',
  },
  {
    id: 'parallelogram',
    label: '平行四边形',
    categoryId: 'shapes',
    kind: 'shape',
    description: '平行四边形图形',
    keywords: ['parallelogram'],
    shapeType: 'parallelogram',
  },
  {
    id: 'trapezoid',
    label: '梯形',
    categoryId: 'shapes',
    kind: 'shape',
    description: '梯形图形',
    keywords: ['trapezoid'],
    shapeType: 'trapezoid',
  },
  {
    id: 'pentagon',
    label: '五边形',
    categoryId: 'shapes',
    kind: 'shape',
    description: '五边形图形',
    keywords: ['pentagon'],
    shapeType: 'pentagon',
  },
  {
    id: 'hexagon',
    label: '六边形',
    categoryId: 'shapes',
    kind: 'shape',
    description: '六边形图形',
    keywords: ['hexagon'],
    shapeType: 'hexagon',
  },
  {
    id: 'star',
    label: '星形',
    categoryId: 'shapes',
    kind: 'shape',
    description: '星形图形',
    keywords: ['star'],
    shapeType: 'star',
  },
  {
    id: 'callout',
    label: '标注框',
    categoryId: 'shapes',
    kind: 'shape',
    description: '用于强调说明的标注框',
    keywords: ['callout', 'note'],
    shapeType: 'callout',
  },
  {
    id: 'line',
    label: '线条',
    categoryId: 'shapes',
    kind: 'shape',
    description: '分割线或连接线',
    keywords: ['line', 'divider'],
    shapeType: 'line',
  },
  {
    id: 'icon-email',
    label: '邮箱',
    categoryId: 'contact-icons',
    kind: 'icon',
    description: '邮箱联系方式图标',
    keywords: ['email', 'mail'],
    icon: businessIcon('email'),
    defaultSize: 28,
  },
  {
    id: 'icon-phone',
    label: '电话',
    categoryId: 'contact-icons',
    kind: 'icon',
    description: '电话联系方式图标',
    keywords: ['phone', 'mobile'],
    icon: businessIcon('phone'),
    defaultSize: 28,
  },
  {
    id: 'icon-wechat',
    label: '微信',
    categoryId: 'contact-icons',
    kind: 'icon',
    description: '微信联系方式图标',
    keywords: ['wechat', 'wx'],
    icon: businessIcon('wechat'),
    defaultSize: 28,
  },
  {
    id: 'icon-twitter',
    label: 'Twitter/X',
    categoryId: 'contact-icons',
    kind: 'icon',
    description: 'Twitter 或 X 社交账号图标',
    keywords: ['twitter', 'x'],
    icon: businessIcon('twitter'),
    defaultSize: 28,
  },
  {
    id: 'icon-linkedin',
    label: 'LinkedIn',
    categoryId: 'contact-icons',
    kind: 'icon',
    description: 'LinkedIn 账号图标',
    keywords: ['linkedin', 'in'],
    icon: businessIcon('linkedin'),
    defaultSize: 28,
  },
  {
    id: 'icon-github',
    label: 'GitHub',
    categoryId: 'profile-icons',
    kind: 'icon',
    description: 'GitHub 代码主页图标',
    keywords: ['github', 'code'],
    icon: businessIcon('github'),
    defaultSize: 28,
  },
  {
    id: 'icon-leetcode',
    label: 'LeetCode',
    categoryId: 'profile-icons',
    kind: 'icon',
    description: 'LeetCode 刷题平台图标',
    keywords: ['leetcode', 'algorithm'],
    icon: businessIcon('leetcode'),
    defaultSize: 28,
  },
  {
    id: 'icon-scholar',
    label: '学术主页',
    categoryId: 'profile-icons',
    kind: 'icon',
    description: '学术主页或 Google Scholar 图标',
    keywords: ['scholar', 'academic'],
    icon: businessIcon('scholar'),
    defaultSize: 28,
  },
  {
    id: 'icon-journal',
    label: '文献期刊',
    categoryId: 'profile-icons',
    kind: 'icon',
    description: '文献、论文、期刊成果图标',
    keywords: ['paper', 'journal', 'publication'],
    icon: businessIcon('journal'),
    defaultSize: 28,
  },
  {
    id: 'icon-portfolio',
    label: '作品集',
    categoryId: 'profile-icons',
    kind: 'icon',
    description: '个人网站或作品集图标',
    keywords: ['portfolio', 'website'],
    icon: businessIcon('portfolio'),
    defaultSize: 28,
  },
  {
    id: 'icon-code',
    label: '编程',
    categoryId: 'skill-icons',
    kind: 'icon',
    description: '通用编程技能图标',
    keywords: ['code', 'programming'],
    icon: { glyph: '</>', accentColor: '#4f46e5' },
    defaultSize: 28,
  },
  {
    id: 'icon-frontend',
    label: '前端',
    categoryId: 'skill-icons',
    kind: 'icon',
    description: '前端开发技能图标',
    keywords: ['frontend', 'react', 'web'],
    icon: { glyph: 'FE', accentColor: '#db2777' },
    defaultSize: 28,
  },
  {
    id: 'icon-database',
    label: '数据库',
    categoryId: 'skill-icons',
    kind: 'icon',
    description: '数据库技能图标',
    keywords: ['database', 'sql'],
    icon: { glyph: 'DB', accentColor: '#0f766e' },
    defaultSize: 28,
  },
  {
    id: 'icon-cloud',
    label: '云服务',
    categoryId: 'skill-icons',
    kind: 'icon',
    description: '云服务或 DevOps 技能图标',
    keywords: ['cloud', 'devops'],
    icon: { glyph: 'C', accentColor: '#0284c7' },
    defaultSize: 28,
  },
  {
    id: 'icon-ai',
    label: 'AI',
    categoryId: 'skill-icons',
    kind: 'icon',
    description: '人工智能或机器学习技能图标',
    keywords: ['ai', 'machine learning'],
    icon: { glyph: 'AI', accentColor: '#9333ea' },
    defaultSize: 28,
  },
  {
    id: 'icon-language',
    label: '语言',
    categoryId: 'skill-icons',
    kind: 'icon',
    description: '语言能力图标',
    keywords: ['language', 'translation'],
    icon: { glyph: 'A+', accentColor: '#ca8a04' },
    defaultSize: 28,
  },
];

export function listDrawingCatalogItems(categoryId?: DrawingCatalogCategoryId): DrawingCatalogItem[] {
  if (!categoryId) return [...DRAWING_CATALOG_ITEMS];
  return DRAWING_CATALOG_ITEMS.filter((item) => item.categoryId === categoryId);
}

export function findDrawingCatalogItem(id: string): DrawingCatalogItem | undefined {
  return DRAWING_CATALOG_ITEMS.find((item) => item.id === id);
}

export function createDrawingElement(itemId: string, x: number, y: number): ResumeElement | null {
  const item = findDrawingCatalogItem(itemId);
  if (!item) {
    if (itemId === 'shape') return createShapeElement('rectangle', '矩形', x, y);
    return null;
  }

  switch (item.kind) {
    case 'heading':
      return createHeadingElement(x, y);
    case 'text':
      return createTextElement(x, y);
    case 'image':
      return createImageElement(x, y);
    case 'linkText':
      return createLinkTextElement(x, y);
    case 'linkIcon':
      return createLinkIconElement(item, x, y);
    case 'shape':
      if (!item.shapeType) return null;
      return createShapeElement(item.shapeType, item.label, x, y);
    case 'icon':
      return createIconElement(item, x, y);
    default:
      return null;
  }
}

export function renderDrawingIconSvg(item: DrawingCatalogItem): string | null {
  if (item.kind !== 'icon' || !item.icon) return null;
  return renderBusinessIconDefinitionSvg(item.icon, item.label);
}

export function svgToDataUrl(svg: string): string {
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
}

function createTextElement(x: number, y: number): TextElement {
  return {
    id: generateElementId('text'),
    type: 'text',
    name: '正文',
    left: x,
    top: y,
    width: 400,
    height: 60,
    rotation: 0,
    opacity: 1,
    visible: true,
    locked: false,
    zIndex: 0,
    content: '在此输入正文内容...',
    fontSize: 14,
    fontFamily: DEFAULT_TEXT_FONT_FAMILY,
    fontWeight: 'normal',
    fontStyle: 'normal',
    textAlign: 'left',
    lineHeight: 1.6,
    letterSpacing: 0,
    color: '#374151',
    underline: false,
    strikethrough: false,
  };
}

function createHeadingElement(x: number, y: number): TextElement {
  return {
    id: generateElementId('text'),
    type: 'text',
    name: '标题',
    left: x,
    top: y,
    width: 300,
    height: 40,
    rotation: 0,
    opacity: 1,
    visible: true,
    locked: false,
    zIndex: 0,
    content: '标题文本',
    fontSize: 24,
    fontFamily: DEFAULT_TEXT_FONT_FAMILY,
    fontWeight: 'bold',
    fontStyle: 'normal',
    textAlign: 'left',
    lineHeight: 1.3,
    letterSpacing: 1,
    color: '#1a1a1a',
    underline: false,
    strikethrough: false,
  };
}

function createLinkTextElement(x: number, y: number): TextElement {
  return {
    id: generateElementId('text'),
    type: 'text',
    name: '文字链接',
    link: { url: DEFAULT_LINK_URL, title: '链接' },
    left: x,
    top: y,
    width: 220,
    height: 28,
    rotation: 0,
    opacity: 1,
    visible: true,
    locked: false,
    zIndex: 0,
    content: '链接文字',
    fontSize: 14,
    fontFamily: DEFAULT_TEXT_FONT_FAMILY,
    fontWeight: 'normal',
    fontStyle: 'normal',
    textAlign: 'left',
    lineHeight: 1.4,
    letterSpacing: 0,
    color: '#2563eb',
    underline: true,
    strikethrough: false,
  };
}

function createImageElement(x: number, y: number): ImageElement {
  return {
    id: generateElementId('image'),
    type: 'image',
    name: '图片',
    left: x,
    top: y,
    width: 150,
    height: 150,
    rotation: 0,
    opacity: 1,
    visible: true,
    locked: false,
    zIndex: 0,
    src: '',
    originalWidth: 150,
    originalHeight: 150,
    cropX: 0,
    cropY: 0,
    cropWidth: 150,
    cropHeight: 150,
    borderRadius: 0,
    objectFit: 'cover',
  };
}

function createLinkIconElement(item: DrawingCatalogItem, x: number, y: number): ImageElement {
  const size = item.defaultSize ?? 28;
  const icon = createBusinessIconImageElement('link', x, y, {
    name: '图标链接',
    width: size,
    height: size,
    imageRole: 'linkIcon',
    linkUrl: DEFAULT_LINK_URL,
  });

  if (!icon) return createImageElement(x, y);
  return icon;
}

function createShapeElement(shapeType: ShapeType, label: string, x: number, y: number): ShapeElement {
  if (shapeType === 'line') {
    return {
      id: generateElementId('shape'),
      type: 'shape',
      name: label,
      left: x,
      top: y,
      width: 300,
      height: 2,
      rotation: 0,
      opacity: 1,
      visible: true,
      locked: false,
      zIndex: 0,
      shapeType,
      fill: 'transparent',
      strokeColor: '#d1d5db',
      strokeWidth: 1,
      borderRadius: 0,
    };
  }

  const compactShapes: readonly ShapeType[] = [
    'circle',
    'ellipse',
    'diamond',
    'pentagon',
    'hexagon',
    'star',
    'triangle',
  ];
  const square = compactShapes.includes(shapeType);

  return {
    id: generateElementId('shape'),
    type: 'shape',
    name: label,
    left: x,
    top: y,
    width: square ? 100 : 120,
    height: square ? 100 : 80,
    rotation: 0,
    opacity: 1,
    visible: true,
    locked: false,
    zIndex: 0,
    shapeType,
    fill: '#dbeafe',
    strokeColor: '#60a5fa',
    strokeWidth: 1,
    borderRadius: shapeType === 'roundedRectangle' ? 12 : 0,
  };
}

function createIconElement(item: DrawingCatalogItem, x: number, y: number): ImageElement | null {
  const svg = renderDrawingIconSvg(item);
  if (!svg) return null;
  const size = item.defaultSize ?? 28;

  return {
    id: generateElementId('image'),
    type: 'image',
    name: `Icon - ${item.label}`,
    imageRole: 'icon',
    iconPresetId: CATALOG_ICON_PRESET_BY_ITEM_ID[item.id],
    left: x,
    top: y,
    width: size,
    height: size,
    rotation: 0,
    opacity: 1,
    visible: true,
    locked: false,
    zIndex: 0,
    src: svgToDataUrl(svg),
    originalWidth: ICON_BASE_SIZE,
    originalHeight: ICON_BASE_SIZE,
    cropX: 0,
    cropY: 0,
    cropWidth: ICON_BASE_SIZE,
    cropHeight: ICON_BASE_SIZE,
    borderRadius: 0,
    objectFit: 'contain',
  };
}
