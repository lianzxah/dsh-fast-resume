import React from 'react';
import { Image as KonvaImage, Rect } from 'react-konva';
import type Konva from 'konva';
import type { ImageElement } from '@resume-editor/shared';
import { toImageAttrs } from '../core/element-mapper';
import { useHtmlImage } from './useHtmlImage';

// ============================================================
// 图片元素节点
// 加载完成渲染 Konva.Image, 未加载/失败时渲染占位矩形。
// ============================================================

interface ImageElementNodeProps {
  element: ImageElement;
  konvaProps: Record<string, unknown>;
  setRef: (node: Konva.Node | null) => void;
}

/** 计算 cover 模式下的裁剪区域 */
function getCoverCrop(img: HTMLImageElement, width: number, height: number) {
  const imgRatio = img.width / img.height;
  const targetRatio = width / height;
  let cropWidth: number;
  let cropHeight: number;
  if (imgRatio > targetRatio) {
    cropHeight = img.height;
    cropWidth = img.height * targetRatio;
  } else {
    cropWidth = img.width;
    cropHeight = img.width / targetRatio;
  }
  return {
    x: (img.width - cropWidth) / 2,
    y: (img.height - cropHeight) / 2,
    width: cropWidth,
    height: cropHeight,
  };
}

export const ImageElementNode: React.FC<ImageElementNodeProps> = ({ element, konvaProps, setRef }) => {
  const { image, status } = useHtmlImage(element.src);
  const attrs = toImageAttrs(element);

  if (status === 'loaded' && image) {
    const crop = element.objectFit === 'cover' ? getCoverCrop(image, element.width, element.height) : undefined;
    return (
      <KonvaImage
        ref={setRef as never}
        {...attrs}
        image={image}
        crop={crop}
        {...konvaProps}
      />
    );
  }

  // 占位矩形
  return (
    <Rect
      ref={setRef as never}
      {...attrs}
      fill="#f1f5f9"
      stroke="#cbd5e1"
      strokeWidth={1}
      dash={[6, 4]}
      {...konvaProps}
    />
  );
};
