import type { ImageElement, ImageRole } from '../types';
import { generateElementId } from './helpers';

export type BusinessIconPresetCategory = 'general' | 'contact' | 'profile' | 'academic' | 'skill';

export interface BusinessIconDefinition {
  glyph: string;
  accentColor: string;
  backgroundColor?: string;
  svg?: string;
}

export interface BusinessIconPreset {
  id: string;
  label: string;
  category: BusinessIconPresetCategory;
  description: string;
  keywords: string[];
  icon: BusinessIconDefinition;
  defaultUrl?: string;
}

const ICON_BASE_SIZE = 64;
const DEFAULT_ICON_SIZE = 28;

const LINK_ICON_SVG = [
  '<svg xmlns="http://www.w3.org/2000/svg" width="64" height="64" viewBox="0 0 64 64" role="img" aria-label="链接">',
  '<rect width="64" height="64" rx="14" fill="transparent"/>',
  '<path d="M25.8 39.7 21.6 44a9.2 9.2 0 0 1-13-13l8.2-8.2a9.2 9.2 0 0 1 13 0 3 3 0 0 1-4.2 4.2 3.2 3.2 0 0 0-4.5 0l-8.2 8.2a3.2 3.2 0 0 0 4.5 4.5l4.2-4.2a3 3 0 0 1 4.2 4.2Z" fill="#2563eb"/>',
  '<path d="M38.2 24.3 42.4 20a9.2 9.2 0 0 1 13 13l-8.2 8.2a9.2 9.2 0 0 1-13 0 3 3 0 0 1 4.2-4.2 3.2 3.2 0 0 0 4.5 0l8.2-8.2a3.2 3.2 0 0 0-4.5-4.5l-4.2 4.2a3 3 0 0 1-4.2-4.2Z" fill="#2563eb"/>',
  '<path d="M24.9 42.1a3 3 0 0 1 0-4.2l13-13a3 3 0 0 1 4.2 4.2l-13 13a3 3 0 0 1-4.2 0Z" fill="#0f172a"/>',
  '</svg>',
].join('');

const GITHUB_ICON_SVG =
  '<svg t="1783741348717" class="icon" viewBox="0 0 1024 1024" version="1.1" xmlns="http://www.w3.org/2000/svg" p-id="1673" width="200" height="200"><path d="M512 85.333333C276.266667 85.333333 85.333333 276.266667 85.333333 512a426.410667 426.410667 0 0 0 291.754667 404.821333c21.333333 3.712 29.312-9.088 29.312-20.309333 0-10.112-0.554667-43.690667-0.554667-79.445333-107.178667 19.754667-134.912-26.112-143.445333-50.133334-4.821333-12.288-25.6-50.133333-43.733333-60.288-14.933333-7.978667-36.266667-27.733333-0.554667-28.245333 33.621333-0.554667 57.6 30.933333 65.621333 43.733333 38.4 64.512 99.754667 46.378667 124.245334 35.2 3.754667-27.733333 14.933333-46.378667 27.221333-57.045333-94.933333-10.666667-194.133333-47.488-194.133333-210.688 0-46.421333 16.512-84.778667 43.733333-114.688-4.266667-10.666667-19.2-54.4 4.266667-113.066667 0 0 35.712-11.178667 117.333333 43.776a395.946667 395.946667 0 0 1 106.666667-14.421333c36.266667 0 72.533333 4.778667 106.666666 14.378667 81.578667-55.466667 117.333333-43.690667 117.333334-43.690667 23.466667 58.666667 8.533333 102.4 4.266666 113.066667 27.178667 29.866667 43.733333 67.712 43.733334 114.645333 0 163.754667-99.712 200.021333-194.645334 210.688 15.445333 13.312 28.8 38.912 28.8 78.933333 0 57.045333-0.554667 102.912-0.554666 117.333334 0 11.178667 8.021333 24.490667 29.354666 20.224A427.349333 427.349333 0 0 0 938.666667 512c0-235.733333-190.933333-426.666667-426.666667-426.666667z" fill="#000000" p-id="1674"></path></svg>';

const WECHAT_ICON_SVG = [
  '<svg xmlns="http://www.w3.org/2000/svg" width="64" height="64" viewBox="0 0 64 64" role="img" aria-label="微信">',
  '<rect width="64" height="64" rx="14" fill="transparent"/>',
  '<path d="M27 14c-10.5 0-19 6.8-19 15.2 0 4.8 2.8 9 7.1 11.8l-1.5 5.5 6.6-3.2c2.1.7 4.4 1.1 6.8 1.1 10.5 0 19-6.8 19-15.2S37.5 14 27 14Z" fill="#22c55e"/>',
  '<path d="M39 28c9.3 0 17 6.1 17 13.6 0 4.3-2.5 8.1-6.4 10.6l1.3 4.8-5.9-2.8c-1.9.7-3.9 1-6 1-9.3 0-17-6.1-17-13.6S29.7 28 39 28Z" fill="#16a34a"/>',
  '<circle cx="20.5" cy="27" r="2.4" fill="#fff"/><circle cx="33.5" cy="27" r="2.4" fill="#fff"/>',
  '<circle cx="33.5" cy="40.8" r="2.1" fill="#fff"/><circle cx="44.5" cy="40.8" r="2.1" fill="#fff"/>',
  '</svg>',
].join('');

const JOURNAL_ICON_SVG = [
  '<svg xmlns="http://www.w3.org/2000/svg" width="64" height="64" viewBox="0 0 64 64" role="img" aria-label="文献期刊">',
  '<rect width="64" height="64" rx="14" fill="transparent"/>',
  '<path d="M16 10h24l10 10v34H16V10Z" fill="#ede9fe" stroke="#7c3aed" stroke-width="4" stroke-linejoin="round"/>',
  '<path d="M40 10v12h10" fill="none" stroke="#7c3aed" stroke-width="4" stroke-linejoin="round"/>',
  '<path d="M23 31h18M23 39h18M23 47h12" stroke="#4c1d95" stroke-width="4" stroke-linecap="round"/>',
  '<path d="M22 21h11" stroke="#7c3aed" stroke-width="4" stroke-linecap="round"/>',
  '</svg>',
].join('');

const SCHOLAR_ICON_SVG = [
  '<svg xmlns="http://www.w3.org/2000/svg" width="64" height="64" viewBox="0 0 64 64" role="img" aria-label="学术主页">',
  '<rect width="64" height="64" rx="14" fill="transparent"/>',
  '<path d="M8 25 32 13l24 12-24 12L8 25Z" fill="#2563eb"/>',
  '<path d="M18 32v9c0 5 6.3 9 14 9s14-4 14-9v-9l-14 7-14-7Z" fill="#60a5fa"/>',
  '<path d="M52 28v15" stroke="#1e3a8a" stroke-width="4" stroke-linecap="round"/>',
  '</svg>',
].join('');

export const BUSINESS_ICON_PRESETS: readonly BusinessIconPreset[] = [
  {
    id: 'link',
    label: '链接',
    category: 'general',
    description: '通用链接图标',
    keywords: ['link', 'url'],
    icon: { glyph: '↗', accentColor: '#2563eb', svg: LINK_ICON_SVG },
  },
  {
    id: 'github',
    label: 'GitHub',
    category: 'profile',
    description: 'GitHub 代码主页',
    keywords: ['github', 'code'],
    icon: { glyph: 'GH', accentColor: '#24292f', svg: GITHUB_ICON_SVG },
  },
  {
    id: 'wechat',
    label: '微信',
    category: 'contact',
    description: '微信联系方式',
    keywords: ['wechat', 'wx'],
    icon: { glyph: 'WX', accentColor: '#22c55e', svg: WECHAT_ICON_SVG },
  },
  {
    id: 'journal',
    label: '文献期刊',
    category: 'academic',
    description: '文献、论文、期刊入口',
    keywords: ['paper', 'journal', 'publication', 'doi'],
    icon: { glyph: 'DOI', accentColor: '#7c3aed', svg: JOURNAL_ICON_SVG },
  },
  {
    id: 'scholar',
    label: '学术主页',
    category: 'academic',
    description: '学术主页或 Scholar 入口',
    keywords: ['scholar', 'academic'],
    icon: { glyph: 'GS', accentColor: '#2563eb', svg: SCHOLAR_ICON_SVG },
  },
  {
    id: 'leetcode',
    label: 'LeetCode',
    category: 'profile',
    description: 'LeetCode 刷题平台',
    keywords: ['leetcode', 'algorithm'],
    icon: { glyph: 'LC', accentColor: '#f59e0b' },
  },
  {
    id: 'linkedin',
    label: 'LinkedIn',
    category: 'profile',
    description: 'LinkedIn 主页',
    keywords: ['linkedin', 'in'],
    icon: { glyph: 'in', accentColor: '#0a66c2' },
  },
  {
    id: 'twitter',
    label: 'Twitter/X',
    category: 'profile',
    description: 'Twitter 或 X 社交主页',
    keywords: ['twitter', 'x'],
    icon: { glyph: 'X', accentColor: '#111827' },
  },
  {
    id: 'email',
    label: '邮箱',
    category: 'contact',
    description: '邮箱联系方式',
    keywords: ['email', 'mail'],
    icon: { glyph: '@', accentColor: '#2563eb' },
  },
  {
    id: 'phone',
    label: '电话',
    category: 'contact',
    description: '电话联系方式',
    keywords: ['phone', 'mobile'],
    icon: { glyph: 'TEL', accentColor: '#16a34a' },
  },
  {
    id: 'portfolio',
    label: '作品集',
    category: 'profile',
    description: '个人网站或作品集',
    keywords: ['portfolio', 'website'],
    icon: { glyph: 'WWW', accentColor: '#0891b2' },
  },
];

export function listBusinessIconPresets(category?: BusinessIconPresetCategory): BusinessIconPreset[] {
  if (!category) return [...BUSINESS_ICON_PRESETS];
  return BUSINESS_ICON_PRESETS.filter((preset) => preset.category === category);
}

export function findBusinessIconPreset(id: string | undefined): BusinessIconPreset | undefined {
  if (!id) return undefined;
  return BUSINESS_ICON_PRESETS.find((preset) => preset.id === id);
}

export function renderBusinessIconDefinitionSvg(icon: BusinessIconDefinition, label: string): string | null {
  if (icon.svg) return normalizeRawSvgIcon(icon.svg, label);

  const { glyph, accentColor, backgroundColor = 'transparent' } = icon;
  const fontSize = glyph.length >= 3 ? 17 : glyph.length === 2 ? 22 : 28;
  const escapedGlyph = escapeXml(glyph);
  const escapedLabel = escapeXml(label);

  return [
    `<svg xmlns="http://www.w3.org/2000/svg" width="${ICON_BASE_SIZE}" height="${ICON_BASE_SIZE}" viewBox="0 0 ${ICON_BASE_SIZE} ${ICON_BASE_SIZE}" role="img" aria-label="${escapedLabel}">`,
    `<rect width="${ICON_BASE_SIZE}" height="${ICON_BASE_SIZE}" rx="14" fill="${backgroundColor}"/>`,
    `<circle cx="32" cy="32" r="24" fill="${accentColor}" opacity="0.12"/>`,
    `<text x="32" y="39" text-anchor="middle" font-family="Arial, Helvetica, sans-serif" font-size="${fontSize}" font-weight="700" fill="${accentColor}">${escapedGlyph}</text>`,
    '</svg>',
  ].join('');
}

export function renderBusinessIconSvg(presetId: string): string | null {
  const preset = findBusinessIconPreset(presetId);
  if (!preset) return null;
  return renderBusinessIconDefinitionSvg(preset.icon, preset.label);
}

export function businessIconToDataUrl(presetId: string): string | null {
  const svg = renderBusinessIconSvg(presetId);
  return svg ? svgToDataUrl(svg) : null;
}

export function buildBusinessIconImageUpdates(
  presetId: string,
  imageRole?: ImageRole
): Partial<ImageElement> | null {
  const preset = findBusinessIconPreset(presetId);
  const src = businessIconToDataUrl(presetId);
  if (!preset || !src) return null;

  return {
    imageRole,
    iconPresetId: preset.id,
    src,
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

export function createBusinessIconImageElement(
  presetId: string,
  x: number,
  y: number,
  options: {
    name?: string;
    width?: number;
    height?: number;
    imageRole?: ImageRole;
    linkUrl?: string;
  } = {}
): ImageElement | null {
  const preset = findBusinessIconPreset(presetId);
  const updates = buildBusinessIconImageUpdates(presetId, options.imageRole);
  if (!preset || !updates?.src) return null;

  const width = options.width ?? DEFAULT_ICON_SIZE;
  const height = options.height ?? width;

  return {
    id: generateElementId('image'),
    type: 'image',
    name: options.name ?? preset.label,
    link: options.linkUrl ? { url: options.linkUrl, title: preset.label } : undefined,
    left: x,
    top: y,
    width,
    height,
    rotation: 0,
    opacity: 1,
    visible: true,
    locked: false,
    zIndex: 0,
    src: updates.src,
    imageRole: options.imageRole,
    iconPresetId: preset.id,
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

function svgToDataUrl(svg: string): string {
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
}

function normalizeRawSvgIcon(svg: string, label: string): string | null {
  const cleaned = svg
    .trim()
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/\son[a-z]+\s*=\s*"[^"]*"/gi, '')
    .replace(/\son[a-z]+\s*=\s*'[^']*'/gi, '');

  if (!/^<svg\b/i.test(cleaned)) return null;
  if (/\srole\s*=/.test(cleaned)) return cleaned;

  return cleaned.replace(/^<svg\b/i, `<svg role="img" aria-label="${escapeXml(label)}"`);
}

function escapeXml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}
