import React, { useMemo } from 'react';
import { motion } from 'motion/react';

// ============================================================
// AuroraBackground — react-bits 风格的极光/科技感动态背景
// 依据 react-bits 官方 "复制组件源码" 的落地方式内置于项目, 仅依赖已安装的
// motion, 无需额外 WebGL 依赖, 保证构建鲁棒。
// 组成: 深色渐变底 + 多个模糊极光光斑 (缓慢漂移) + 网格 + 漂浮粒子。
// ============================================================

interface Blob {
  color: string;
  size: number;
  initial: { x: string; y: string };
  animate: { x: string[]; y: string[] };
  duration: number;
}

const BLOBS: Blob[] = [
  {
    color: 'rgba(99,102,241,0.55)', // indigo
    size: 520,
    initial: { x: '-10%', y: '-15%' },
    animate: { x: ['-10%', '15%', '-5%', '-10%'], y: ['-15%', '10%', '25%', '-15%'] },
    duration: 18,
  },
  {
    color: 'rgba(168,85,247,0.5)', // purple
    size: 460,
    initial: { x: '60%', y: '-10%' },
    animate: { x: ['60%', '40%', '70%', '60%'], y: ['-10%', '20%', '5%', '-10%'] },
    duration: 22,
  },
  {
    color: 'rgba(34,211,238,0.45)', // cyan
    size: 420,
    initial: { x: '30%', y: '55%' },
    animate: { x: ['30%', '55%', '20%', '30%'], y: ['55%', '40%', '65%', '55%'] },
    duration: 26,
  },
  {
    color: 'rgba(236,72,153,0.4)', // pink
    size: 380,
    initial: { x: '75%', y: '55%' },
    animate: { x: ['75%', '60%', '80%', '75%'], y: ['55%', '70%', '45%', '55%'] },
    duration: 20,
  },
];

export const AuroraBackground: React.FC<{ children?: React.ReactNode }> = ({ children }) => {
  // 随机粒子 (仅生成一次)
  const particles = useMemo(
    () =>
      Array.from({ length: 28 }).map((_, i) => ({
        id: i,
        left: Math.random() * 100,
        top: Math.random() * 100,
        size: Math.random() * 2.5 + 1,
        delay: Math.random() * 6,
        duration: Math.random() * 8 + 6,
      })),
    []
  );

  return (
    <div className="relative min-h-screen w-screen overflow-hidden bg-[#070a17]">
      {/* 极光光斑 */}
      <div className="absolute inset-0">
        {BLOBS.map((b, i) => (
          <motion.div
            key={i}
            className="absolute rounded-full"
            style={{
              width: b.size,
              height: b.size,
              background: `radial-gradient(circle at center, ${b.color}, transparent 70%)`,
              filter: 'blur(60px)',
              left: 0,
              top: 0,
            }}
            initial={b.initial}
            animate={b.animate}
            transition={{ duration: b.duration, repeat: Infinity, ease: 'easeInOut' }}
          />
        ))}
      </div>

      {/* 网格叠层 */}
      <div
        className="absolute inset-0 opacity-[0.15]"
        style={{
          backgroundImage:
            'linear-gradient(to right, rgba(148,163,184,0.4) 1px, transparent 1px), linear-gradient(to bottom, rgba(148,163,184,0.4) 1px, transparent 1px)',
          backgroundSize: '44px 44px',
          maskImage: 'radial-gradient(ellipse 80% 60% at 50% 40%, black 40%, transparent 100%)',
          WebkitMaskImage: 'radial-gradient(ellipse 80% 60% at 50% 40%, black 40%, transparent 100%)',
        }}
      />

      {/* 漂浮粒子 */}
      <div className="absolute inset-0">
        {particles.map((p) => (
          <motion.span
            key={p.id}
            className="absolute rounded-full bg-white/70"
            style={{ left: `${p.left}%`, top: `${p.top}%`, width: p.size, height: p.size }}
            animate={{ y: [0, -24, 0], opacity: [0.15, 0.8, 0.15] }}
            transition={{ duration: p.duration, delay: p.delay, repeat: Infinity, ease: 'easeInOut' }}
          />
        ))}
      </div>

      {/* 顶部高光 */}
      <div className="absolute inset-x-0 top-0 h-40 bg-gradient-to-b from-indigo-500/10 to-transparent" />

      {/* 内容 */}
      <div className="relative z-10">{children}</div>
    </div>
  );
};
