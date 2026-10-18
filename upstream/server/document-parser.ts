import type { ParsedDocument, DocBlock, ResumeData } from '@resume-editor/shared';
import {
  parseDocumentToResumeData,
  plainTextToParsedDocument,
  markdownToParsedDocument,
  isResumeDataSparse,
} from '@resume-editor/shared';

// ============================================================
// 文档解析服务
// docx / pdf / markdown / plaintext → ParsedDocument(IR) → ResumeData
// 关键改进：不再把富文档「压平成纯文本再套 Markdown 规则」，
// 而是尽量保留标题/加粗/列表等结构信息，从根本上解决「只解析出标题」。
// ============================================================

// ------------------------------------------------------------
// HTML → IR (用于 docx: mammoth.convertToHtml 保留结构)
// ------------------------------------------------------------

const HTML_ENTITIES: Record<string, string> = {
  '&amp;': '&',
  '&lt;': '<',
  '&gt;': '>',
  '&quot;': '"',
  '&#39;': "'",
  '&apos;': "'",
  '&nbsp;': ' ',
};

function decodeEntities(s: string): string {
  return s
    .replace(/&#(\d+);/g, (_, code) => String.fromCharCode(Number(code)))
    .replace(/&[a-z]+;/gi, (m) => HTML_ENTITIES[m.toLowerCase()] ?? m);
}

/** 去除标签得到纯文本 */
function stripTags(html: string): string {
  return decodeEntities(html.replace(/<[^>]+>/g, '')).replace(/\s+/g, ' ').trim();
}

/** 内容是否整体加粗 (mammoth 用 <strong>) */
function isMostlyBold(inner: string): boolean {
  const text = stripTags(inner);
  if (!text) return false;
  const boldText = stripTags(inner.replace(/<(?!\/?(strong|b)\b)[^>]+>/g, ''));
  // 粗略：<strong>/<b> 覆盖的文本长度接近整体
  const boldMatches = inner.match(/<(strong|b)\b[^>]*>(.*?)<\/\1>/gis);
  if (!boldMatches) return false;
  const boldLen = boldMatches.map((m) => stripTags(m)).join('').length;
  return boldLen >= text.length * 0.6 || boldText.length >= text.length * 0.6;
}

/** mammoth 生成的 HTML → IR */
export function htmlToParsedDocument(html: string): ParsedDocument {
  const blocks: DocBlock[] = [];
  const rawParts: string[] = [];

  // 匹配块级标签: h1-h6 / p / li
  const blockRe = /<(h[1-6]|p|li)\b[^>]*>([\s\S]*?)<\/\1>/gi;
  let m: RegExpExecArray | null;
  while ((m = blockRe.exec(html)) !== null) {
    const tag = m[1].toLowerCase();
    const inner = m[2];
    const text = stripTags(inner);
    if (!text) continue;
    rawParts.push(text);

    if (/^h[1-6]$/.test(tag)) {
      blocks.push({ type: 'heading', level: Number(tag[1]), text });
    } else if (tag === 'li') {
      blocks.push({ type: 'list-item', text });
    } else {
      blocks.push({ type: 'paragraph', text, bold: isMostlyBold(inner) });
    }
  }

  return { blocks, rawText: rawParts.join('\n') };
}

/** 提取 docx 为 IR：优先 convertToHtml 保留结构 */
export async function docxToParsedDocument(buffer: ArrayBuffer): Promise<ParsedDocument> {
  const mammoth = await import('mammoth');
  const nodeBuffer = Buffer.from(buffer);
  try {
    const { value: html } = await mammoth.convertToHtml({ buffer: nodeBuffer });
    const parsed = htmlToParsedDocument(html);
    if (parsed.blocks.length > 0) return parsed;
  } catch {
    // 忽略，走纯文本兜底
  }
  // 兜底：提取纯文本
  const { value: text } = await mammoth.extractRawText({ buffer: nodeBuffer });
  return plainTextToParsedDocument(text);
}

// ------------------------------------------------------------
// PDF → IR (pdfjs-dist: 按字号推断标题层级)
// ------------------------------------------------------------

interface PdfLine {
  text: string;
  fontSize: number;
}

/** 提取 pdf 为 IR：按行聚合文本，用字号相对大小推断标题 */
export async function pdfToParsedDocument(buffer: ArrayBuffer): Promise<ParsedDocument> {
  // 使用 legacy 构建以适配 Node 环境
  const pdfjs: any = await import('pdfjs-dist/legacy/build/pdf.mjs');
  const loadingTask = pdfjs.getDocument({
    data: new Uint8Array(buffer),
    useWorkerFetch: false,
    isEvalSupported: false,
    useSystemFonts: true,
  });
  try {
  const pdf = await loadingTask.promise;

  const lines: PdfLine[] = [];

  for (let p = 1; p <= pdf.numPages; p++) {
    const page = await pdf.getPage(p);
    const content = await page.getTextContent();

    // 按 y 坐标聚合为行
    type Item = { str: string; x: number; y: number; h: number };
    const items: Item[] = content.items
      .filter((it: any) => typeof it.str === 'string')
      .map((it: any) => ({
        str: it.str,
        x: it.transform[4],
        y: Math.round(it.transform[5]),
        h: Math.abs(it.transform[0]) || Math.abs(it.transform[3]) || it.height || 12,
      }));

    // 分组：y 相近视为同一行 (阈值 3px)
    const rows = new Map<number, Item[]>();
    for (const it of items) {
      let key = it.y;
      for (const existing of rows.keys()) {
        if (Math.abs(existing - it.y) <= 3) {
          key = existing;
          break;
        }
      }
      const arr = rows.get(key) ?? [];
      arr.push(it);
      rows.set(key, arr);
    }

    // 行按 y 从大到小 (PDF 坐标系原点在左下)
    const sortedKeys = [...rows.keys()].sort((a, b) => b - a);
    for (const key of sortedKeys) {
      const rowItems = rows.get(key)!.sort((a, b) => a.x - b.x);
      const text = rowItems.map((i) => i.str).join('').replace(/\s+/g, ' ').trim();
      if (!text) continue;
      const fontSize = Math.max(...rowItems.map((i) => i.h));
      lines.push({ text, fontSize });
    }
  }

  // 统计正文字号 (出现最多的字号)
  const freq = new Map<number, number>();
  for (const l of lines) {
    const fs = Math.round(l.fontSize);
    freq.set(fs, (freq.get(fs) ?? 0) + 1);
  }
  let bodyFont = 12;
  let maxCount = 0;
  for (const [fs, count] of freq) {
    if (count > maxCount) {
      maxCount = count;
      bodyFont = fs;
    }
  }

  const blocks: DocBlock[] = [];
  for (const l of lines) {
    const listMatch = l.text.match(/^[-*•·]\s*(.+)/);
    if (listMatch) {
      blocks.push({ type: 'list-item', text: listMatch[1].trim() });
      continue;
    }
    // 字号明显大于正文 → 标题
    if (l.fontSize >= bodyFont * 1.25 && l.text.length <= 30) {
      const level = l.fontSize >= bodyFont * 1.6 ? 1 : 2;
      blocks.push({ type: 'heading', level, text: l.text });
    } else {
      blocks.push({ type: 'paragraph', text: l.text });
    }
  }

  return { blocks, rawText: lines.map((l) => l.text).join('\n') };
  } finally { await loadingTask.destroy(); }
}

// ------------------------------------------------------------
// 统一映射 (含纯文本启发式兜底)
// ------------------------------------------------------------

/** IR → ResumeData，结果过稀疏时用纯文本重解析兜底 */
export function toResumeDataWithFallback(parsed: ParsedDocument): ResumeData {
  const structural = parseDocumentToResumeData(parsed);
  if (!isResumeDataSparse(structural)) return structural;
  const fallback = parseDocumentToResumeData(plainTextToParsedDocument(parsed.rawText));
  return isResumeDataSparse(fallback) ? structural : fallback;
}

/** Markdown 文本 → ResumeData (走统一 IR 管线) */
export function parseMarkdown(text: string): ResumeData {
  return toResumeDataWithFallback(markdownToParsedDocument(text));
}
