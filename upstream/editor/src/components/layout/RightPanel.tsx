import React from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
  Palette,
  Move,
  Box,
  Settings,
  Type,
  Bold,
  Italic,
  Underline,
  Strikethrough,
  AlignLeft,
  AlignCenter,
  AlignRight,
  AlignJustify,
  Shapes,
  Link2,
  Unlink,
} from 'lucide-react';
import { useEditorStore } from '@/store';
import type { ResumeElement, TextElement, ShapeElement, ImageElement, TextAlign, ShapeType } from '@resume-editor/shared';
import {
  BUSINESS_ICON_PRESETS,
  buildBusinessIconImageUpdates,
  businessIconToDataUrl,
  normalizeElementLinkUrl,
} from '@resume-editor/shared';
import { MIN_ELEMENT_SIZE } from '@resume-editor/canvas-engine';

/** 形状类型选项 */
const SHAPE_TYPE_OPTIONS: { value: ShapeType; label: string }[] = [
  { value: 'rectangle', label: '矩形' },
  { value: 'roundedRectangle', label: '圆角矩形' },
  { value: 'ellipse', label: '椭圆' },
  { value: 'circle', label: '圆形' },
  { value: 'triangle', label: '三角形' },
  { value: 'diamond', label: '菱形' },
  { value: 'parallelogram', label: '平行四边形' },
  { value: 'trapezoid', label: '梯形' },
  { value: 'pentagon', label: '五边形' },
  { value: 'hexagon', label: '六边形' },
  { value: 'star', label: '星形' },
  { value: 'callout', label: '标注框' },
  { value: 'line', label: '分割线' },
];

/** 可选字体族 */
const FONT_FAMILIES: { label: string; value: string }[] = [
  { label: '微软雅黑', value: 'Microsoft YaHei, sans-serif' },
  { label: '宋体', value: 'SimSun, serif' },
  { label: '黑体', value: 'SimHei, sans-serif' },
  { label: '楷体', value: 'KaiTi, serif' },
  { label: 'Arial', value: 'Arial, sans-serif' },
  { label: 'Times New Roman', value: '"Times New Roman", serif' },
  { label: 'Georgia', value: 'Georgia, serif' },
  { label: 'Courier New', value: '"Courier New", monospace' },
];

const TEXT_ALIGNS: { value: TextAlign; icon: React.ReactNode }[] = [
  { value: 'left', icon: <AlignLeft className="w-3.5 h-3.5" /> },
  { value: 'center', icon: <AlignCenter className="w-3.5 h-3.5" /> },
  { value: 'right', icon: <AlignRight className="w-3.5 h-3.5" /> },
  { value: 'justify', icon: <AlignJustify className="w-3.5 h-3.5" /> },
];

/** 跨页查找选中元素 (多页架构下不能只看当前页) */
function findElement(pages: { elements: ResumeElement[] }[], id: string | undefined): ResumeElement | undefined {
  if (!id) return undefined;
  for (const page of pages) {
    const el = page.elements.find((e) => e.id === id);
    if (el) return el;
  }
  return undefined;
}

export const RightPanel: React.FC = () => {
  const { document, selection, updateElement } = useEditorStore();
  const selectedElement = findElement(document.pages, selection.selectedIds[0]);
  const multiCount = selection.selectedIds.length;

  return (
    <div className="bg-background border-l border-border h-full overflow-hidden">
      <div className="h-full overflow-y-auto">
        {/* 面板标题 */}
        <div className="px-3 py-2 border-b border-border">
          <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
            属性{multiCount > 1 ? ` · 已选 ${multiCount}` : ''}
          </h3>
        </div>

        <AnimatePresence mode="wait">
          {selectedElement ? (
            <motion.div
              key={selectedElement.id}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              transition={{ duration: 0.2 }}
              className="p-3 space-y-4"
            >
              {/* 基础信息 */}
              <PropertySection title="基础" icon={<Settings className="w-3.5 h-3.5" />}>
                <PropertyRow label="名称">
                  <input
                    className="w-full h-6 text-[11px] bg-muted/50 border border-border rounded px-1.5 focus:outline-none focus:ring-1 focus:ring-primary"
                    value={selectedElement.name}
                    onChange={(e) => updateElement(selectedElement.id, { name: e.target.value })}
                  />
                </PropertyRow>
              </PropertySection>

              {/* 位置与尺寸 */}
              <PropertySection title="布局" icon={<Move className="w-3.5 h-3.5" />}>
                <div className="grid grid-cols-2 gap-2">
                  <PropertyRow label="X">
                    <NumberInput value={selectedElement.left} onChange={(v) => updateElement(selectedElement.id, { left: v })} />
                  </PropertyRow>
                  <PropertyRow label="Y">
                    <NumberInput value={selectedElement.top} onChange={(v) => updateElement(selectedElement.id, { top: v })} />
                  </PropertyRow>
                  <PropertyRow label="W">
                    <NumberInput value={selectedElement.width} min={MIN_ELEMENT_SIZE} onChange={(v) => updateElement(selectedElement.id, { width: v })} />
                  </PropertyRow>
                  <PropertyRow label="H">
                    <NumberInput value={selectedElement.height} min={MIN_ELEMENT_SIZE} onChange={(v) => updateElement(selectedElement.id, { height: v })} />
                  </PropertyRow>
                  <PropertyRow label="旋转">
                    <NumberInput value={selectedElement.rotation} onChange={(v) => updateElement(selectedElement.id, { rotation: v })} suffix="°" />
                  </PropertyRow>
                  <PropertyRow label="透明度">
                    <NumberInput value={Math.round(selectedElement.opacity * 100)} min={0} max={100} onChange={(v) => updateElement(selectedElement.id, { opacity: v / 100 })} suffix="%" />
                  </PropertyRow>
                </div>
              </PropertySection>

              {/* 文字属性 */}
              {selectedElement.type === 'text' && (
                <TextProperties element={selectedElement as TextElement} onChange={(u) => updateElement(selectedElement.id, u)} />
              )}

              {/* 形状属性 */}
              {selectedElement.type === 'shape' && (
                <ShapeProperties element={selectedElement as ShapeElement} onChange={(u) => updateElement(selectedElement.id, u)} />
              )}

              {/* 图片属性 */}
              {selectedElement.type === 'image' && (
                <ImageProperties element={selectedElement as ImageElement} onChange={(u) => updateElement(selectedElement.id, u)} />
              )}

              {/* 外观 */}
              <LinkProperties
                element={selectedElement}
                onChange={(url) => {
                  const normalized = normalizeElementLinkUrl(url);
                  updateElement(selectedElement.id, {
                    link: normalized ? { url, title: selectedElement.link?.title } : undefined,
                  });
                }}
                onClear={() => updateElement(selectedElement.id, { link: undefined })}
              />

              {/* 外观 */}
              <PropertySection title="外观" icon={<Box className="w-3.5 h-3.5" />}>
                <PropertyRow label="可见">
                  <input type="checkbox" className="rounded" checked={selectedElement.visible} onChange={(e) => updateElement(selectedElement.id, { visible: e.target.checked })} />
                </PropertyRow>
                <PropertyRow label="锁定">
                  <input type="checkbox" className="rounded" checked={selectedElement.locked} onChange={(e) => updateElement(selectedElement.id, { locked: e.target.checked })} />
                </PropertyRow>
              </PropertySection>
            </motion.div>
          ) : (
            <motion.div
              key="empty"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.15 }}
              className="p-4 text-center"
            >
              <motion.p className="text-xs text-muted-foreground" initial={{ y: 5 }} animate={{ y: 0 }}>
                选择元素以编辑属性
              </motion.p>

              <div className="mt-4 text-left space-y-3">
                <PropertySection title="页面设置" icon={<Settings className="w-3.5 h-3.5" />}>
                  <PropertyRow label="尺寸">
                    <span className="text-xs text-muted-foreground">
                      {document.pageConfig.width} x {document.pageConfig.height} mm
                    </span>
                  </PropertyRow>
                  <PropertyRow label="页数">
                    <span className="text-xs text-muted-foreground">{document.pages.length} 页</span>
                  </PropertyRow>
                </PropertySection>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
};

// ============================================================
// 文字属性
// ============================================================
const TextProperties: React.FC<{
  element: TextElement;
  onChange: (updates: Partial<TextElement>) => void;
}> = ({ element, onChange }) => (
  <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} transition={{ duration: 0.2 }}>
    <PropertySection title="文字" icon={<Type className="w-3.5 h-3.5" />}>
      <PropertyRow label="字体">
        <select
          className="w-full h-6 text-[11px] bg-muted/50 border border-border rounded px-1 focus:outline-none focus:ring-1 focus:ring-primary"
          value={element.fontFamily}
          onChange={(e) => onChange({ fontFamily: e.target.value })}
        >
          {FONT_FAMILIES.map((f) => (
            <option key={f.value} value={f.value}>
              {f.label}
            </option>
          ))}
        </select>
      </PropertyRow>

      <div className="grid grid-cols-2 gap-2">
        <PropertyRow label="字号">
          <NumberInput value={element.fontSize} min={1} onChange={(v) => onChange({ fontSize: v })} suffix="px" />
        </PropertyRow>
        <PropertyRow label="行高">
          <NumberInput value={element.lineHeight} min={0.1} onChange={(v) => onChange({ lineHeight: v })} step={0.1} />
        </PropertyRow>
        <PropertyRow label="字距">
          <NumberInput value={element.letterSpacing} onChange={(v) => onChange({ letterSpacing: v })} step={0.5} />
        </PropertyRow>
      </div>

      {/* 样式按钮组 B / I / U / S */}
      <PropertyRow label="样式">
        <div className="flex items-center gap-1">
          <ToggleButton active={element.fontWeight === 'bold'} onClick={() => onChange({ fontWeight: element.fontWeight === 'bold' ? 'normal' : 'bold' })}>
            <Bold className="w-3.5 h-3.5" />
          </ToggleButton>
          <ToggleButton active={element.fontStyle === 'italic'} onClick={() => onChange({ fontStyle: element.fontStyle === 'italic' ? 'normal' : 'italic' })}>
            <Italic className="w-3.5 h-3.5" />
          </ToggleButton>
          <ToggleButton active={element.underline} onClick={() => onChange({ underline: !element.underline })}>
            <Underline className="w-3.5 h-3.5" />
          </ToggleButton>
          <ToggleButton active={element.strikethrough} onClick={() => onChange({ strikethrough: !element.strikethrough })}>
            <Strikethrough className="w-3.5 h-3.5" />
          </ToggleButton>
        </div>
      </PropertyRow>

      {/* 对齐按钮组 */}
      <PropertyRow label="对齐">
        <div className="flex items-center gap-1">
          {TEXT_ALIGNS.map((a) => (
            <ToggleButton key={a.value} active={element.textAlign === a.value} onClick={() => onChange({ textAlign: a.value })}>
              {a.icon}
            </ToggleButton>
          ))}
        </div>
      </PropertyRow>

      <PropertyRow label="颜色">
        <ColorInput value={element.color} onChange={(v) => onChange({ color: v })} />
      </PropertyRow>
      <PropertyRow label="背景">
        <ColorInput value={element.backgroundColor || '#ffffff'} onChange={(v) => onChange({ backgroundColor: v })} clearable onClear={() => onChange({ backgroundColor: undefined })} />
      </PropertyRow>
    </PropertySection>
  </motion.div>
);

// ============================================================
// 形状属性
// ============================================================
const ShapeProperties: React.FC<{
  element: ShapeElement;
  onChange: (updates: Partial<ShapeElement>) => void;
}> = ({ element, onChange }) => (
  <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} transition={{ duration: 0.2 }}>
    <PropertySection title="形状" icon={<Shapes className="w-3.5 h-3.5" />}>
      <PropertyRow label="类型">
        <select
          className="w-full h-6 text-[11px] bg-muted/50 border border-border rounded px-1 focus:outline-none focus:ring-1 focus:ring-primary"
          value={element.shapeType}
          onChange={(e) => onChange({ shapeType: e.target.value as ShapeType })}
        >
          {SHAPE_TYPE_OPTIONS.map((s) => (
            <option key={s.value} value={s.value}>{s.label}</option>
          ))}
        </select>
      </PropertyRow>
      <PropertyRow label="填充">
        <ColorInput value={element.fill} onChange={(v) => onChange({ fill: v })} />
      </PropertyRow>
      <PropertyRow label="描边">
        <ColorInput value={element.strokeColor} onChange={(v) => onChange({ strokeColor: v })} />
      </PropertyRow>
      <div className="grid grid-cols-2 gap-2">
        <PropertyRow label="边宽">
          <NumberInput value={element.strokeWidth} min={0} onChange={(v) => onChange({ strokeWidth: v })} suffix="px" />
        </PropertyRow>
        <PropertyRow label="圆角">
          <NumberInput value={element.borderRadius} min={0} onChange={(v) => onChange({ borderRadius: v })} suffix="px" />
        </PropertyRow>
      </div>
    </PropertySection>

    {/* 形状内文本 (双击形状可局部加粗) */}
    <PropertySection title="文本" icon={<Type className="w-3.5 h-3.5" />}>
      <PropertyRow label="内容">
        <input
          className="w-full h-6 text-[11px] bg-muted/50 border border-border rounded px-1.5 focus:outline-none focus:ring-1 focus:ring-primary"
          value={element.text ?? ''}
          placeholder="双击形状也可编辑"
          onChange={(e) => onChange({ text: e.target.value, segments: undefined })}
        />
      </PropertyRow>
      <div className="grid grid-cols-2 gap-2">
        <PropertyRow label="字号">
          <NumberInput value={element.fontSize ?? 14} min={1} onChange={(v) => onChange({ fontSize: v })} suffix="px" />
        </PropertyRow>
      </div>
      <PropertyRow label="样式">
        <div className="flex items-center gap-1">
          <ToggleButton active={element.fontWeight === 'bold'} onClick={() => onChange({ fontWeight: element.fontWeight === 'bold' ? 'normal' : 'bold' })}>
            <Bold className="w-3.5 h-3.5" />
          </ToggleButton>
          <ToggleButton active={element.fontStyle === 'italic'} onClick={() => onChange({ fontStyle: element.fontStyle === 'italic' ? 'normal' : 'italic' })}>
            <Italic className="w-3.5 h-3.5" />
          </ToggleButton>
        </div>
      </PropertyRow>
      <PropertyRow label="对齐">
        <div className="flex items-center gap-1">
          {TEXT_ALIGNS.map((a) => (
            <ToggleButton key={a.value} active={(element.textAlign ?? 'center') === a.value} onClick={() => onChange({ textAlign: a.value })}>
              {a.icon}
            </ToggleButton>
          ))}
        </div>
      </PropertyRow>
      <PropertyRow label="颜色">
        <ColorInput value={element.textColor ?? '#1f2937'} onChange={(v) => onChange({ textColor: v })} />
      </PropertyRow>
    </PropertySection>
  </motion.div>
);

// ============================================================
// 图片属性
// ============================================================
const ImageProperties: React.FC<{
  element: ImageElement;
  onChange: (updates: Partial<ImageElement>) => void;
}> = ({ element, onChange }) => {
  const isLinkIcon = element.imageRole === 'linkIcon';

  const applyIconPreset = (presetId: string) => {
    const preset = BUSINESS_ICON_PRESETS.find((item) => item.id === presetId);
    const updates = buildBusinessIconImageUpdates(presetId, 'linkIcon');
    if (!updates || !preset) return;
    onChange({
      ...updates,
      name: `图标链接 - ${preset.label}`,
      link: element.link ? { ...element.link, title: preset.label } : element.link,
    });
  };

  return (
    <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} transition={{ duration: 0.2 }}>
      {isLinkIcon && (
        <PropertySection title="业务图标" icon={<Link2 className="w-3.5 h-3.5" />}>
          <PropertyRow label="图标">
            <select
              className="w-full h-6 text-[11px] bg-muted/50 border border-border rounded px-1 focus:outline-none focus:ring-1 focus:ring-primary"
              value={element.iconPresetId ?? 'link'}
              onChange={(e) => applyIconPreset(e.target.value)}
            >
              {BUSINESS_ICON_PRESETS.map((preset) => (
                <option key={preset.id} value={preset.id}>
                  {preset.label}
                </option>
              ))}
            </select>
          </PropertyRow>
          <div className="grid grid-cols-5 gap-1 pl-1">
            {BUSINESS_ICON_PRESETS.map((preset) => {
              const src = businessIconToDataUrl(preset.id);
              const active = (element.iconPresetId ?? 'link') === preset.id;
              return (
                <button
                  key={preset.id}
                  className={`flex h-8 w-8 items-center justify-center rounded-md border transition-colors ${
                    active ? 'border-primary bg-primary/10' : 'border-border hover:bg-accent'
                  }`}
                  title={preset.label}
                  onClick={() => applyIconPreset(preset.id)}
                >
                  {src ? <img className="h-5 w-5 object-contain" src={src} alt="" draggable={false} /> : null}
                </button>
              );
            })}
          </div>
        </PropertySection>
      )}

      <PropertySection title="图片" icon={<Palette className="w-3.5 h-3.5" />}>
        <PropertyRow label="圆角">
          <NumberInput value={element.borderRadius} min={0} onChange={(v) => onChange({ borderRadius: v })} suffix="px" />
        </PropertyRow>
        <PropertyRow label="填充">
          <select
            className="w-full h-6 text-[11px] bg-muted/50 border border-border rounded px-1 focus:outline-none focus:ring-1 focus:ring-primary"
            value={element.objectFit}
            onChange={(e) => onChange({ objectFit: e.target.value as ImageElement['objectFit'] })}
          >
            <option value="cover">裁剪填充 (cover)</option>
            <option value="contain">完整显示 (contain)</option>
            <option value="fill">拉伸填充 (fill)</option>
          </select>
        </PropertyRow>
      </PropertySection>
    </motion.div>
  );
};

// ============================================================
// 链接属性
// ============================================================
const LinkProperties: React.FC<{
  element: ResumeElement;
  onChange: (url: string) => void;
  onClear: () => void;
}> = ({ element, onChange, onClear }) => {
  const [draft, setDraft] = React.useState(element.link?.url ?? '');

  React.useEffect(() => {
    setDraft(element.link?.url ?? '');
  }, [element.id, element.link?.url]);

  const valid = !draft.trim() || Boolean(normalizeElementLinkUrl(draft));

  return (
    <PropertySection title="链接" icon={<Link2 className="w-3.5 h-3.5" />}>
      <PropertyRow label="URL">
        <div className="flex items-center gap-1">
          <input
            className={`h-6 w-36 rounded border bg-muted/50 px-1.5 text-[10px] focus:outline-none focus:ring-1 focus:ring-primary ${
              valid ? 'border-border' : 'border-destructive/70'
            }`}
            value={draft}
            placeholder="https://example.com"
            onChange={(e) => {
              setDraft(e.target.value);
              onChange(e.target.value);
            }}
            onBlur={() => {
              const normalized = normalizeElementLinkUrl(draft);
              if (normalized && normalized !== draft) {
                setDraft(normalized);
                onChange(normalized);
              }
            }}
          />
          <button
            className="flex h-6 w-6 items-center justify-center rounded border border-border text-muted-foreground hover:bg-accent hover:text-foreground"
            title="清除链接"
            onClick={() => {
              setDraft('');
              onClear();
            }}
          >
            <Unlink className="h-3.5 w-3.5" />
          </button>
        </div>
      </PropertyRow>
    </PropertySection>
  );
};

// ============================================================
// 子组件
// ============================================================

const PropertySection: React.FC<{
  title: string;
  icon: React.ReactNode;
  children: React.ReactNode;
}> = ({ title, icon, children }) => (
  <motion.div className="space-y-2" initial={{ opacity: 0, x: 10 }} animate={{ opacity: 1, x: 0 }} transition={{ duration: 0.2, delay: 0.05 }}>
    <div className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
      {icon}
      {title}
    </div>
    <div className="space-y-1.5 pl-1">{children}</div>
  </motion.div>
);

const PropertyRow: React.FC<{
  label: string;
  children: React.ReactNode;
}> = ({ label, children }) => (
  <div className="flex items-center justify-between gap-2">
    <span className="text-[11px] text-muted-foreground min-w-[32px]">{label}</span>
    <div className="flex-1 flex justify-end">{children}</div>
  </div>
);

const NumberInput: React.FC<{
  value: number;
  onChange: (value: number) => void;
  suffix?: string;
  step?: number;
  min?: number;
  max?: number;
}> = ({ value, onChange, suffix, step = 1, min, max }) => (
  <div className="flex items-center gap-0.5">
    <input
      type="number"
      className="w-16 h-6 text-[11px] text-right bg-muted/50 border border-border rounded px-1 focus:outline-none focus:ring-1 focus:ring-primary transition-shadow"
      value={Math.round(value * 10) / 10}
      step={step}
      min={min}
      max={max}
      onChange={(e) => {
        const parsed = parseFloat(e.target.value);
        const numeric = Number.isFinite(parsed) ? parsed : 0;
        const withMin = min === undefined ? numeric : Math.max(min, numeric);
        const withMax = max === undefined ? withMin : Math.min(max, withMin);
        onChange(withMax);
      }}
    />
    {suffix && <span className="text-[10px] text-muted-foreground">{suffix}</span>}
  </div>
);

const ColorInput: React.FC<{
  value: string;
  onChange: (value: string) => void;
  clearable?: boolean;
  onClear?: () => void;
}> = ({ value, onChange, clearable, onClear }) => (
  <div className="flex items-center gap-1">
    <input type="color" className="w-8 h-6 rounded border border-border cursor-pointer" value={value} onChange={(e) => onChange(e.target.value)} />
    <input
      className="w-16 h-6 text-[10px] bg-muted/50 border border-border rounded px-1 focus:outline-none focus:ring-1 focus:ring-primary"
      value={value}
      onChange={(e) => onChange(e.target.value)}
    />
    {clearable && (
      <button className="text-[10px] text-muted-foreground hover:text-foreground px-1" title="清除" onClick={onClear}>
        ✕
      </button>
    )}
  </div>
);

const ToggleButton: React.FC<{
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}> = ({ active, onClick, children }) => (
  <button
    className={`w-6 h-6 flex items-center justify-center rounded border transition-colors ${
      active ? 'bg-primary/10 border-primary text-primary' : 'border-border text-muted-foreground hover:text-foreground hover:bg-accent'
    }`}
    onClick={onClick}
  >
    {children}
  </button>
);
