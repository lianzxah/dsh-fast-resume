// ============================================================
// 文档解析中间表示 (IR)
// docx / pdf / 纯文本 统一先解析为 DocBlock[]，再由 IR → ResumeData，
// 从而解耦「不同来源的提取逻辑」与「简历语义映射逻辑」，便于扩展与复用。
// ============================================================

/** IR 块类型 */
export type DocBlockType = 'heading' | 'paragraph' | 'list-item';

/** 文档结构块 */
export interface DocBlock {
  type: DocBlockType;
  /** heading 级别 (1-6)；paragraph / list-item 可省略 */
  level?: number;
  /** 文本内容 (已去除前后空白) */
  text: string;
  /** 该块是否整体加粗 (用于纯文本 / PDF 按字号推断的标题标记) */
  bold?: boolean;
}

/** 解析后的结构化文档 */
export interface ParsedDocument {
  blocks: DocBlock[];
  /** 原始纯文本 (用于启发式兜底) */
  rawText: string;
}
