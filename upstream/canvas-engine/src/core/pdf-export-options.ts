export type PdfExportPreset = 'compact' | 'balanced' | 'high';

export interface PdfExportOptions {
  /** Fail export when any rendered image cannot be loaded. */
  failOnImageError?: boolean;
  /** PDF 画质/体积预设，默认 balanced。显式渲染参数会覆盖预设。 */
  preset?: PdfExportPreset;
  /** 输出像素倍率。 */
  pixelRatio?: number;
  /** 是否绘制页面背景。 */
  background?: boolean;
  /** 页面栅格图格式。 */
  mimeType?: 'image/png' | 'image/jpeg';
  /** JPEG 编码质量，范围 0–1。 */
  quality?: number;
}

export interface ResolvedPdfRenderOptions {
  pixelRatio: number;
  background: boolean;
  mimeType: 'image/png' | 'image/jpeg';
  quality: number;
}

const PDF_EXPORT_PRESETS: Record<PdfExportPreset, ResolvedPdfRenderOptions> = {
  compact: {
    pixelRatio: 1.25,
    background: true,
    mimeType: 'image/jpeg',
    quality: 0.78,
  },
  balanced: {
    pixelRatio: 1.5,
    background: true,
    mimeType: 'image/jpeg',
    quality: 0.88,
  },
  high: {
    pixelRatio: 2,
    background: true,
    mimeType: 'image/jpeg',
    quality: 0.94,
  },
};

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

/** 将 PDF 预设与显式覆盖合并为安全的渲染参数。 */
export function resolvePdfRenderOptions(options: PdfExportOptions = {}): ResolvedPdfRenderOptions {
  const preset = PDF_EXPORT_PRESETS[options.preset ?? 'balanced'] ?? PDF_EXPORT_PRESETS.balanced;
  return {
    pixelRatio: clamp(options.pixelRatio ?? preset.pixelRatio, 0.1, 4),
    background: options.background ?? preset.background,
    mimeType: options.mimeType ?? preset.mimeType,
    quality: clamp(options.quality ?? preset.quality, 0.1, 1),
  };
}
