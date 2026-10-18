import { useEffect, useState } from 'react';

// ============================================================
// 图片加载 hook
// 根据 src 异步加载 HTMLImageElement，供 Konva.Image 使用。
// ============================================================

export type ImageStatus = 'idle' | 'loading' | 'loaded' | 'failed';

export function useHtmlImage(src: string | undefined): {
  image: HTMLImageElement | undefined;
  status: ImageStatus;
} {
  const [image, setImage] = useState<HTMLImageElement | undefined>(undefined);
  const [status, setStatus] = useState<ImageStatus>('idle');

  useEffect(() => {
    if (!src) {
      setImage(undefined);
      setStatus('idle');
      return;
    }

    let cancelled = false;
    setStatus('loading');

    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => {
      if (cancelled) return;
      setImage(img);
      setStatus('loaded');
    };
    img.onerror = () => {
      if (cancelled) return;
      setImage(undefined);
      setStatus('failed');
    };
    img.src = src;

    return () => {
      cancelled = true;
    };
  }, [src]);

  return { image, status };
}
