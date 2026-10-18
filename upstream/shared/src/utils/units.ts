// ============================================================
// 单位转换工具
// ============================================================

const MM_PER_INCH = 25.4;
const PT_PER_INCH = 72;

/**
 * 毫米转像素
 * @param mm 毫米值
 * @param dpi DPI (默认96)
 */
export function mmToPx(mm: number, dpi = 96): number {
  return (mm / MM_PER_INCH) * dpi;
}

/**
 * 像素转毫米
 * @param px 像素值
 * @param dpi DPI (默认96)
 */
export function pxToMm(px: number, dpi = 96): number {
  return (px / dpi) * MM_PER_INCH;
}

/**
 * 毫米转磅 (pt)
 * @param mm 毫米值
 */
export function mmToPt(mm: number): number {
  return (mm / MM_PER_INCH) * PT_PER_INCH;
}

/**
 * 磅转毫米
 * @param pt 磅值
 */
export function ptToMm(pt: number): number {
  return (pt / PT_PER_INCH) * MM_PER_INCH;
}

/**
 * 像素转磅
 * @param px 像素值
 * @param dpi DPI (默认96)
 */
export function pxToPt(px: number, dpi = 96): number {
  return (px / dpi) * PT_PER_INCH;
}

/**
 * 磅转像素
 * @param pt 磅值
 * @param dpi DPI (默认96)
 */
export function ptToPx(pt: number, dpi = 96): number {
  return (pt / PT_PER_INCH) * dpi;
}

/** A4 尺寸常量 (mm) */
export const A4_WIDTH_MM = 210;
export const A4_HEIGHT_MM = 297;

/** A4 尺寸 (px, 96 DPI) */
export const A4_WIDTH_PX = mmToPx(A4_WIDTH_MM);
export const A4_HEIGHT_PX = mmToPx(A4_HEIGHT_MM);
