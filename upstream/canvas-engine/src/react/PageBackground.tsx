import React, { useMemo } from 'react';
import { Group, Rect, Line } from 'react-konva';
import type { PageMetrics } from '../core/page-metrics';

// ============================================================
// 页面背景层
// 绘制页面底色、网格、边距参考线 (均不参与事件)。
// ============================================================

interface PageBackgroundProps {
  metrics: PageMetrics;
  showGrid?: boolean;
  showGuides?: boolean;
  gridSize?: number;
}

export const PageBackground: React.FC<PageBackgroundProps> = ({
  metrics,
  showGrid = false,
  showGuides = true,
  gridSize = 20,
}) => {
  const { widthPx, heightPx, margins, backgroundColor } = metrics;

  const gridLines = useMemo(() => {
    if (!showGrid) return [];
    const lines: number[][] = [];
    for (let x = gridSize; x < widthPx; x += gridSize) {
      lines.push([x, 0, x, heightPx]);
    }
    for (let y = gridSize; y < heightPx; y += gridSize) {
      lines.push([0, y, widthPx, y]);
    }
    return lines;
  }, [showGrid, gridSize, widthPx, heightPx]);

  return (
    <Group listening={false}>
      {/* 页面底色 */}
      <Rect x={0} y={0} width={widthPx} height={heightPx} fill={backgroundColor} />

      {/* 网格 */}
      {gridLines.map((pts, i) => (
        <Line key={`grid-${i}`} points={pts} stroke="#eef2f7" strokeWidth={1} />
      ))}

      {/* 边距参考线 */}
      {showGuides && (
        <Rect
          x={margins.left}
          y={margins.top}
          width={widthPx - margins.left - margins.right}
          height={heightPx - margins.top - margins.bottom}
          stroke="#dbe2ea"
          strokeWidth={1}
          dash={[4, 4]}
        />
      )}
    </Group>
  );
};
