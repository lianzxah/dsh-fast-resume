import React, { useEffect, useState } from 'react';
import { getToken } from '@/lib/api';

// ============================================================
// 带鉴权的图片组件
// 缩略图接口需要 Authorization 头，<img src> 无法携带，
// 因此用 fetch 拉取为 blob URL 再渲染。
// ============================================================

interface AuthImageProps {
  src?: string;
  alt?: string;
  className?: string;
  fallback?: React.ReactNode;
}

export const AuthImage: React.FC<AuthImageProps> = ({ src, alt, className, fallback }) => {
  const [url, setUrl] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    if (!src) {
      setFailed(true);
      return;
    }
    let objectUrl: string | null = null;
    let cancelled = false;
    setFailed(false);
    setUrl(null);

    (async () => {
      try {
        const token = getToken();
        const res = await fetch(src, {
          headers: token ? { Authorization: `Bearer ${token}` } : undefined,
        });
        if (!res.ok) throw new Error('load failed');
        const blob = await res.blob();
        if (cancelled) return;
        objectUrl = URL.createObjectURL(blob);
        setUrl(objectUrl);
      } catch {
        if (!cancelled) setFailed(true);
      }
    })();

    return () => {
      cancelled = true;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [src]);

  if (failed || !src) return <>{fallback ?? null}</>;
  if (!url) return <>{fallback ?? null}</>;
  return <img src={url} alt={alt} className={className} />;
};
