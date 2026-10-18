import React, { useState } from 'react';
import { useNavigate, Navigate } from 'react-router-dom';
import { motion } from 'motion/react';
import { Loader2, User, Lock } from 'lucide-react';
import { useAuthStore } from '@/store';
import { AuroraBackground } from '@/components/AuroraBackground';

export const LoginPage: React.FC = () => {
  const navigate = useNavigate();
  const { token, loading, error, login, register, clearError } = useAuthStore();
  const [mode, setMode] = useState<'login' | 'register'>('login');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');

  if (token) return <Navigate to="/" replace />;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const ok =
      mode === 'login' ? await login(username, password) : await register(username, password);
    if (ok) navigate('/', { replace: true });
  };

  const switchMode = (m: 'login' | 'register') => {
    setMode(m);
    clearError();
  };

  return (
    <AuroraBackground>
      <div className="min-h-screen w-full flex items-center justify-center px-4">
        <motion.div
          initial={{ opacity: 0, y: 30, scale: 0.96 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          transition={{ duration: 0.5, ease: 'easeOut' }}
          className="w-[380px] relative"
        >
          {/* 卡片外发光 */}
          <div className="absolute -inset-0.5 bg-gradient-to-r from-indigo-500/40 via-purple-500/40 to-cyan-500/40 rounded-3xl blur-lg opacity-60" />

          {/* 玻璃拟态卡片 */}
          <div className="relative bg-white/[0.06] backdrop-blur-2xl rounded-3xl border border-white/10 p-8 shadow-2xl">
            <div className="flex flex-col items-center mb-7">
              <motion.div
                className="w-14 h-14 rounded-2xl overflow-hidden mb-4 shadow-lg shadow-indigo-500/30"
                animate={{
                  boxShadow: [
                    '0 0 20px rgba(99,102,241,0.3)',
                    '0 0 34px rgba(168,85,247,0.5)',
                    '0 0 20px rgba(99,102,241,0.3)',
                  ],
                }}
                transition={{ duration: 3, repeat: Infinity }}
              >
                <img src="/resume-editor-icon.png" alt="" className="h-full w-full object-cover" />
              </motion.div>
              <h1 className="text-2xl font-bold bg-gradient-to-r from-white via-indigo-100 to-purple-200 bg-clip-text text-transparent tracking-wide">
                Fast Resume
              </h1>
              <p className="text-xs text-slate-400 mt-1.5">
                {mode === 'login' ? '登录以继续编辑你的简历' : '创建账号，开启简历创作'}
              </p>
            </div>

            {/* Tab 切换 */}
            <div className="relative flex bg-white/5 rounded-xl p-1 mb-6 border border-white/10">
              {(['login', 'register'] as const).map((m) => (
                <button
                  key={m}
                  className={`flex-1 relative py-2 text-sm rounded-lg transition-colors z-10 ${
                    mode === m ? 'text-white font-medium' : 'text-slate-400 hover:text-slate-200'
                  }`}
                  onClick={() => switchMode(m)}
                >
                  {mode === m && (
                    <motion.div
                      layoutId="auth-tab"
                      className="absolute inset-0 bg-gradient-to-r from-indigo-500 to-purple-600 rounded-lg shadow-lg shadow-indigo-500/30 -z-10"
                      transition={{ type: 'spring', stiffness: 380, damping: 30 }}
                    />
                  )}
                  {m === 'login' ? '登录' : '注册'}
                </button>
              ))}
            </div>

            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className="text-xs text-slate-400 ml-1">用户名</label>
                <div className="mt-1.5 relative group">
                  <User className="w-4 h-4 text-slate-500 absolute left-3 top-1/2 -translate-y-1/2 group-focus-within:text-indigo-400 transition-colors" />
                  <input
                    className="w-full h-11 pl-10 pr-3 text-sm text-white bg-white/5 border border-white/10 rounded-xl placeholder:text-slate-500 focus:outline-none focus:border-indigo-400/60 focus:bg-white/[0.08] focus:ring-2 focus:ring-indigo-500/20 transition-all"
                    value={username}
                    autoFocus
                    onChange={(e) => setUsername(e.target.value)}
                    placeholder="至少 2 个字符"
                  />
                </div>
              </div>
              <div>
                <label className="text-xs text-slate-400 ml-1">密码</label>
                <div className="mt-1.5 relative group">
                  <Lock className="w-4 h-4 text-slate-500 absolute left-3 top-1/2 -translate-y-1/2 group-focus-within:text-indigo-400 transition-colors" />
                  <input
                    type="password"
                    className="w-full h-11 pl-10 pr-3 text-sm text-white bg-white/5 border border-white/10 rounded-xl placeholder:text-slate-500 focus:outline-none focus:border-indigo-400/60 focus:bg-white/[0.08] focus:ring-2 focus:ring-indigo-500/20 transition-all"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="至少 6 个字符"
                  />
                </div>
              </div>

              {error && (
                <motion.p
                  initial={{ opacity: 0, x: -6 }}
                  animate={{ opacity: 1, x: 0 }}
                  className="text-xs text-rose-400 bg-rose-500/10 border border-rose-500/20 rounded-lg px-3 py-2"
                >
                  {error}
                </motion.p>
              )}

              <motion.button
                type="submit"
                disabled={loading}
                whileHover={{ scale: 1.02 }}
                whileTap={{ scale: 0.98 }}
                className="w-full h-11 flex items-center justify-center gap-2 bg-gradient-to-r from-indigo-500 to-purple-600 text-white text-sm font-semibold rounded-xl shadow-lg shadow-indigo-500/30 hover:shadow-purple-500/40 transition-shadow disabled:opacity-60"
              >
                {loading && <Loader2 className="w-4 h-4 animate-spin" />}
                {mode === 'login' ? '登录' : '注册并登录'}
              </motion.button>
            </form>

            <p className="text-center text-[11px] text-slate-500 mt-6">
              Fast Resume · 让简历创作更快一步 ✦
            </p>
          </div>
        </motion.div>
      </div>
    </AuroraBackground>
  );
};
