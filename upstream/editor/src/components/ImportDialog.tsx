import React, { useState, useCallback, useRef } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
  X,
  Upload,
  FileText,
  FileType,
  File,
  CheckCircle2,
  AlertCircle,
  Loader2,
  ArrowLeft,
  User,
  Briefcase,
  GraduationCap,
  Wrench,
  FolderOpen,
  FileJson,
} from 'lucide-react';
import { useEditorStore } from '@/store';
import type { ParsedResumeBackup, ResumeData } from '@resume-editor/shared';
import {
  MAX_RESUME_BACKUP_FILE_SIZE,
  countResumeDocumentElements,
  parseResumeBackup,
  resumeDataToPages,
} from '@resume-editor/shared';
import { ConfirmDialog } from '@/components/ConfirmDialog';

interface ImportDialogProps {
  open: boolean;
  onClose: () => void;
}

type ImportStep = 'upload' | 'parsing' | 'preview' | 'backup-preview' | 'error';

export const ImportDialog: React.FC<ImportDialogProps> = ({ open, onClose }) => {
  const [step, setStep] = useState<ImportStep>('upload');
  const [parsedData, setParsedData] = useState<ResumeData | null>(null);
  const [parsedBackup, setParsedBackup] = useState<ParsedResumeBackup | null>(null);
  const [confirmBackupOpen, setConfirmBackupOpen] = useState(false);
  const [error, setError] = useState('');
  const [markdownInput, setMarkdownInput] = useState('');
  const [dragOver, setDragOver] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const resetState = useCallback(() => {
    setStep('upload');
    setParsedData(null);
    setParsedBackup(null);
    setConfirmBackupOpen(false);
    setError('');
    setMarkdownInput('');
    setDragOver(false);
  }, []);

  const handleClose = useCallback(() => {
    resetState();
    onClose();
  }, [resetState, onClose]);

  // ============================================================
  // 文件解析
  // ============================================================
  const parseFile = useCallback(async (file: File) => {
    setStep('parsing');
    setError('');
    setParsedData(null);
    setParsedBackup(null);

    if (file.size > MAX_RESUME_BACKUP_FILE_SIZE) {
      setError('文件不能超过 10MB');
      setStep('error');
      return;
    }

    const formData = new FormData();
    formData.append('file', file);

    let endpoint = '/api/import/';
    const ext = file.name.split('.').pop()?.toLowerCase();

    if (ext === 'pdf') endpoint += 'pdf';
    else if (ext === 'docx' || ext === 'doc') endpoint += 'word';
    else if (ext === 'json') {
      try {
        const backup = parseResumeBackup(await file.text());
        setParsedBackup(backup);
        setStep('backup-preview');
      } catch (error) {
        setError(error instanceof Error ? error.message : 'JSON 备份解析失败');
        setStep('error');
      }
      return;
    }
    else if (ext === 'md' || ext === 'markdown') {
      // Markdown 读取文本内容直接发送
      const text = await file.text();
      return parseMarkdownText(text);
    } else {
      setError(`不支持的文件格式: .${ext}`);
      setStep('error');
      return;
    }

    try {
      const res = await fetch(endpoint, { method: 'POST', body: formData });
      const json = await res.json();
      if (json.success) {
        setParsedData(json.data);
        setStep('preview');
      } else {
        setError(json.error || '解析失败');
        setStep('error');
      }
    } catch (err: any) {
      setError(`网络错误: ${err.message}`);
      setStep('error');
    }
  }, []);

  const parseMarkdownText = useCallback(async (text: string) => {
    setStep('parsing');
    try {
      const res = await fetch('/api/import/markdown', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content: text }),
      });
      const json = await res.json();
      if (json.success) {
        setParsedData(json.data);
        setStep('preview');
      } else {
        setError(json.error || '解析失败');
        setStep('error');
      }
    } catch (err: any) {
      setError(`网络错误: ${err.message}`);
      setStep('error');
    }
  }, []);

  // ============================================================
  // 拖拽上传
  // ============================================================
  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setDragOver(false);
      const file = e.dataTransfer.files[0];
      if (file) parseFile(file);
    },
    [parseFile]
  );

  const handleFileSelect = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (file) parseFile(file);
      e.target.value = '';
    },
    [parseFile]
  );

  // ============================================================
  // 确认导入
  // ============================================================
  const handleConfirmImport = useCallback(() => {
    if (!parsedData) return;

    // 将 ResumeData 转换为画布渲染层元素（ResumePage[]）
    const pages = resumeDataToPages(parsedData);

    const store = useEditorStore.getState();
    const doc = {
      ...store.document,
      resumeData: parsedData,
      pages,
    };
    if (parsedData.personalInfo.name) {
      doc.metadata = { ...doc.metadata, title: `${parsedData.personalInfo.name} 的简历` };
    }
    store.setDocument(doc);
    // 标记为待保存，触发自动保存将导入结果持久化
    store.markDirty();
    handleClose();
  }, [parsedData, handleClose]);

  const handleConfirmBackupRestore = useCallback(() => {
    if (!parsedBackup) return;
    useEditorStore.getState().restoreDocument(parsedBackup.document);
    handleClose();
  }, [parsedBackup, handleClose]);

  if (!open) return null;

  return (
    <AnimatePresence>
      <motion.div
        className="fixed inset-0 z-50 flex items-center justify-center"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
      >
        {/* 遮罩 */}
        <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={handleClose} />

        {/* 对话框 */}
        <motion.div
          className="relative bg-background rounded-xl shadow-2xl border border-border w-[560px] max-h-[80vh] overflow-hidden"
          initial={{ scale: 0.95, y: 20 }}
          animate={{ scale: 1, y: 0 }}
          exit={{ scale: 0.95, y: 20 }}
          transition={{ type: 'spring', stiffness: 300, damping: 25 }}
        >
          {/* 头部 */}
          <div className="flex items-center justify-between px-5 py-3 border-b border-border">
            <div className="flex items-center gap-2">
              {(step === 'preview' || step === 'backup-preview') && (
                <button onClick={() => setStep('upload')} className="p-1 rounded hover:bg-accent">
                  <ArrowLeft className="w-4 h-4" />
                </button>
              )}
              <Upload className="w-4 h-4 text-primary" />
              <h2 className="text-sm font-semibold">导入简历</h2>
            </div>
            <button onClick={handleClose} className="p-1 rounded hover:bg-accent text-muted-foreground hover:text-foreground">
              <X className="w-4 h-4" />
            </button>
          </div>

          {/* 内容区 */}
          <div className="p-5 overflow-y-auto max-h-[65vh]">
            <AnimatePresence mode="wait">
              {step === 'upload' && (
                <UploadStep
                  key="upload"
                  dragOver={dragOver}
                  markdownInput={markdownInput}
                  fileInputRef={fileInputRef}
                  onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
                  onDragLeave={() => setDragOver(false)}
                  onDrop={handleDrop}
                  onFileSelect={handleFileSelect}
                  onMarkdownChange={setMarkdownInput}
                  onMarkdownSubmit={() => parseMarkdownText(markdownInput)}
                  onBrowse={() => fileInputRef.current?.click()}
                />
              )}

              {step === 'parsing' && (
                <motion.div key="parsing" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="flex flex-col items-center py-12 gap-3">
                  <Loader2 className="w-8 h-8 text-primary animate-spin" />
                  <p className="text-sm text-muted-foreground">正在解析简历内容...</p>
                </motion.div>
              )}

              {step === 'preview' && parsedData && (
                <PreviewStep key="preview" data={parsedData} onConfirm={handleConfirmImport} />
              )}

              {step === 'backup-preview' && parsedBackup && (
                <BackupPreviewStep
                  key="backup-preview"
                  backup={parsedBackup}
                  onRestore={() => setConfirmBackupOpen(true)}
                />
              )}

              {step === 'error' && (
                <motion.div key="error" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="flex flex-col items-center py-8 gap-3">
                  <AlertCircle className="w-8 h-8 text-destructive" />
                  <p className="text-sm text-destructive text-center">{error}</p>
                  <button
                    className="mt-2 px-4 py-1.5 text-sm bg-primary text-primary-foreground rounded-md hover:bg-primary/90"
                    onClick={() => setStep('upload')}
                  >
                    重试
                  </button>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </motion.div>

        <ConfirmDialog
          open={confirmBackupOpen}
          title="恢复 JSON 备份？"
          description={
            parsedBackup
              ? `当前简历将被“${parsedBackup.document.metadata.title || '未命名简历'}”覆盖。恢复后会自动保存，且仍可立即撤销本次操作。`
              : ''
          }
          confirmLabel="确认恢复"
          onConfirm={handleConfirmBackupRestore}
          onClose={() => setConfirmBackupOpen(false)}
        />
      </motion.div>
    </AnimatePresence>
  );
};

// ============================================================
// 上传步骤
// ============================================================
const UploadStep: React.FC<{
  dragOver: boolean;
  markdownInput: string;
  fileInputRef: React.RefObject<HTMLInputElement | null>;
  onDragOver: (e: React.DragEvent) => void;
  onDragLeave: () => void;
  onDrop: (e: React.DragEvent) => void;
  onFileSelect: (e: React.ChangeEvent<HTMLInputElement>) => void;
  onMarkdownChange: (v: string) => void;
  onMarkdownSubmit: () => void;
  onBrowse: () => void;
}> = ({ dragOver, markdownInput, fileInputRef, onDragOver, onDragLeave, onDrop, onFileSelect, onMarkdownChange, onMarkdownSubmit, onBrowse }) => (
  <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }} className="space-y-4">
    <p className="text-xs text-muted-foreground">支持格式：JSON 备份、PDF、Markdown (.md)、Word (.docx)</p>

    {/* 拖拽上传区 */}
    <div
      className={`border-2 border-dashed rounded-lg p-8 text-center transition-all cursor-pointer ${
        dragOver ? 'border-primary bg-primary/5 scale-[1.01]' : 'border-border hover:border-primary/40 hover:bg-muted/30'
      }`}
      onDragOver={onDragOver}
      onDragLeave={onDragLeave}
      onDrop={onDrop}
      onClick={onBrowse}
    >
      <Upload className="w-8 h-8 text-muted-foreground/50 mx-auto mb-3" />
      <p className="text-sm font-medium text-foreground/70">拖拽文件到此处</p>
      <p className="text-xs text-muted-foreground mt-1">或 点击选择文件 (≤10MB)</p>
      <div className="flex items-center justify-center gap-3 mt-3">
        <span className="inline-flex items-center gap-1 text-[10px] text-muted-foreground bg-muted rounded px-2 py-0.5">
          <File className="w-3 h-3" /> .pdf
        </span>
        <span className="inline-flex items-center gap-1 text-[10px] text-muted-foreground bg-muted rounded px-2 py-0.5">
          <FileText className="w-3 h-3" /> .md
        </span>
        <span className="inline-flex items-center gap-1 text-[10px] text-muted-foreground bg-muted rounded px-2 py-0.5">
          <FileType className="w-3 h-3" /> .docx
        </span>
        <span className="inline-flex items-center gap-1 text-[10px] text-muted-foreground bg-muted rounded px-2 py-0.5">
          <FileJson className="w-3 h-3" /> .json
        </span>
      </div>
    </div>

    <input ref={fileInputRef as React.RefObject<HTMLInputElement>} type="file" accept=".json,.pdf,.md,.markdown,.docx,.doc" className="hidden" onChange={onFileSelect} />

    {/* 分隔线 */}
    <div className="flex items-center gap-3">
      <div className="flex-1 h-px bg-border" />
      <span className="text-[10px] text-muted-foreground">或使用 Markdown 文本导入</span>
      <div className="flex-1 h-px bg-border" />
    </div>

    {/* Markdown 文本输入 */}
    <textarea
      className="w-full h-32 text-xs font-mono bg-muted/30 border border-border rounded-lg p-3 resize-none focus:outline-none focus:ring-1 focus:ring-primary placeholder:text-muted-foreground/50"
      placeholder={`# 张三\n前端工程师 | zhangsan@email.com\n\n## 工作经历\n### XX科技 | 高级前端工程师 | 2022 - 至今\n- 负责核心产品前端架构\n- 性能优化提升60%`}
      value={markdownInput}
      onChange={(e) => onMarkdownChange(e.target.value)}
    />

    {markdownInput.trim() && (
      <motion.button
        initial={{ opacity: 0, y: 5 }}
        animate={{ opacity: 1, y: 0 }}
        className="w-full py-2 bg-primary text-primary-foreground text-sm font-medium rounded-md hover:bg-primary/90 transition-colors"
        onClick={onMarkdownSubmit}
      >
        开始解析
      </motion.button>
    )}
  </motion.div>
);

// ============================================================
// 预览步骤
// ============================================================
const PreviewStep: React.FC<{ data: ResumeData; onConfirm: () => void }> = ({ data, onConfirm }) => (
  <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }} className="space-y-4">
    <div className="flex items-center gap-2 text-sm font-medium text-green-600">
      <CheckCircle2 className="w-4 h-4" />
      成功识别以下信息
    </div>

    <div className="space-y-3 text-sm">
      {/* 个人信息 */}
      {data.personalInfo.name && (
        <SectionPreview icon={<User className="w-3.5 h-3.5" />} title="个人信息">
          <p className="font-medium">{data.personalInfo.name}</p>
          {data.personalInfo.title && <p className="text-muted-foreground">{data.personalInfo.title}</p>}
          <div className="flex flex-wrap gap-2 mt-1 text-xs text-muted-foreground">
            {data.personalInfo.email && <span>{data.personalInfo.email}</span>}
            {data.personalInfo.phone && <span>{data.personalInfo.phone}</span>}
          </div>
        </SectionPreview>
      )}

      {/* 工作经历 */}
      {data.experience.length > 0 && (
        <SectionPreview icon={<Briefcase className="w-3.5 h-3.5" />} title={`工作经历 (${data.experience.length}条)`}>
          {data.experience.map((exp) => (
            <p key={exp.id} className="text-xs text-muted-foreground">
              {exp.company} | {exp.position} {exp.startDate && `| ${exp.startDate}`}{exp.endDate ? ` - ${exp.endDate}` : ' - 至今'}
            </p>
          ))}
        </SectionPreview>
      )}

      {/* 教育背景 */}
      {data.education.length > 0 && (
        <SectionPreview icon={<GraduationCap className="w-3.5 h-3.5" />} title={`教育背景 (${data.education.length}条)`}>
          {data.education.map((edu) => (
            <p key={edu.id} className="text-xs text-muted-foreground">
              {edu.school} | {edu.major} {edu.degree && `| ${edu.degree}`}
            </p>
          ))}
        </SectionPreview>
      )}

      {/* 技能 */}
      {data.skills.length > 0 && (
        <SectionPreview icon={<Wrench className="w-3.5 h-3.5" />} title={`技能 (${data.skills.reduce((acc, s) => acc + s.items.length, 0)}项)`}>
          <div className="flex flex-wrap gap-1">
            {data.skills.flatMap((g) => g.items).slice(0, 10).map((s, i) => (
              <span key={i} className="text-[10px] bg-muted px-1.5 py-0.5 rounded">{s.name}</span>
            ))}
            {data.skills.flatMap((g) => g.items).length > 10 && (
              <span className="text-[10px] text-muted-foreground">+{data.skills.flatMap((g) => g.items).length - 10}项</span>
            )}
          </div>
        </SectionPreview>
      )}

      {/* 项目 */}
      {data.projects.length > 0 && (
        <SectionPreview icon={<FolderOpen className="w-3.5 h-3.5" />} title={`项目经历 (${data.projects.length}条)`}>
          {data.projects.map((p) => (
            <p key={p.id} className="text-xs text-muted-foreground">{p.name} {p.role && `| ${p.role}`}</p>
          ))}
        </SectionPreview>
      )}
    </div>

    {/* 确认按钮 */}
    <button
      className="w-full py-2.5 bg-primary text-primary-foreground text-sm font-medium rounded-md hover:bg-primary/90 transition-colors mt-4"
      onClick={onConfirm}
    >
      确认导入到编辑器
    </button>
  </motion.div>
);

// ============================================================
// JSON 备份预览
// ============================================================
const BackupPreviewStep: React.FC<{
  backup: ParsedResumeBackup;
  onRestore: () => void;
}> = ({ backup, onRestore }) => {
  const { document, exportedAt, source, schemaVersion } = backup;
  const elementCount = countResumeDocumentElements(document);
  const exportedAtLabel = exportedAt
    ? new Date(exportedAt).toLocaleString('zh-CN', { hour12: false })
    : '旧版备份未记录导出时间';

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -8 }}
      className="space-y-4"
    >
      <div className="flex items-center gap-2 text-sm font-medium text-green-600">
        <CheckCircle2 className="w-4 h-4" />
        JSON 备份校验通过
      </div>

      <div className="rounded-lg border border-border bg-muted/30 p-4">
        <div className="flex items-start gap-3">
          <span className="rounded-lg bg-primary/10 p-2 text-primary">
            <FileJson className="h-5 w-5" />
          </span>
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-semibold">
              {document.metadata.title || '未命名简历'}
            </p>
            <p className="mt-1 text-xs text-muted-foreground">{exportedAtLabel}</p>
          </div>
        </div>

        <dl className="mt-4 grid grid-cols-3 gap-2 text-center">
          <div className="rounded-md bg-background px-2 py-2">
            <dt className="text-[10px] text-muted-foreground">页面</dt>
            <dd className="mt-0.5 text-sm font-semibold">{document.pages.length}</dd>
          </div>
          <div className="rounded-md bg-background px-2 py-2">
            <dt className="text-[10px] text-muted-foreground">画布元素</dt>
            <dd className="mt-0.5 text-sm font-semibold">{elementCount}</dd>
          </div>
          <div className="rounded-md bg-background px-2 py-2">
            <dt className="text-[10px] text-muted-foreground">备份格式</dt>
            <dd className="mt-0.5 text-sm font-semibold">
              {source === 'legacy' ? '旧版' : `v${schemaVersion}`}
            </dd>
          </div>
        </dl>
      </div>

      {source === 'legacy' && (
        <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs leading-5 text-amber-800">
          这是旧版裸 JSON 备份。项目已完成兼容校验，恢复后再次导出会自动升级为带版本信息的新格式。
        </div>
      )}

      <div className="rounded-lg border border-orange-200 bg-orange-50 px-3 py-2 text-xs leading-5 text-orange-800">
        恢复会完整替换当前简历的页面、元素、样式和结构化数据，不会重新排版。
      </div>

      <button
        className="w-full rounded-md bg-primary py-2.5 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
        onClick={onRestore}
      >
        恢复此 JSON 备份
      </button>
    </motion.div>
  );
};

/** 预览段落容器 */
const SectionPreview: React.FC<{ icon: React.ReactNode; title: string; children: React.ReactNode }> = ({ icon, title, children }) => (
  <div className="bg-muted/30 rounded-lg p-3 border border-border/50">
    <div className="flex items-center gap-1.5 text-xs font-medium text-foreground/80 mb-1.5">
      {icon}
      {title}
    </div>
    <div className="space-y-0.5">{children}</div>
  </div>
);
