import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion } from 'motion/react';
import {
  BriefcaseBusiness,
  CheckCircle2,
  Clock,
  FileText,
  FileWarning,
  Home,
  KeyRound,
  Loader2,
  LogOut,
  Mail,
  Plus,
  RefreshCw,
  Save,
  Search,
  Settings,
  ShieldCheck,
  SlidersHorizontal,
  Sparkles,
  Trash2,
  User,
  Users,
  WandSparkles,
} from 'lucide-react';
import type {
  AdminSummaryDTO,
  AdminUserDTO,
  AdminUserUpdateRequest,
  AiModelConfigResponse,
  AiModelPresetProviderId,
  AiModelProfile,
  ResumeDocument,
  ResumeMetaDTO,
} from '@resume-editor/shared';
import {
  AI_MODEL_PROVIDERS,
  DEFAULT_PAGE_CONFIG,
  findAiModelPresetByRuntime,
  generateDocumentId,
  generatePageId,
  resolveAiModelPreset,
} from '@resume-editor/shared';
import { adminApi, aiApi, resumeApi, ApiError } from '@/lib/api';
import { useAuthStore } from '@/store';
import { AuthImage } from '@/components/AuthImage';
import { ConfirmDialog } from '@/components/ConfirmDialog';

type HomeView = 'workspace' | 'profile' | 'admin';

interface ProfileFormState {
  displayName: string;
  email: string;
  avatarUrl: string;
}

interface PasswordFormState {
  currentPassword: string;
  nextPassword: string;
  confirmPassword: string;
}

interface ModelFormState {
  id: string;
  providerId: AiModelPresetProviderId;
  presetId: string;
  name: string;
  apiKey: string;
  enabled: boolean;
}

const emptyPasswordForm: PasswordFormState = {
  currentPassword: '',
  nextPassword: '',
  confirmPassword: '',
};

const emptyModelForm: ModelFormState = {
  id: '',
  providerId: AI_MODEL_PROVIDERS[0].id,
  presetId: AI_MODEL_PROVIDERS[0].models[0].id,
  name: '',
  apiKey: '',
  enabled: true,
};

const emptyAdminPasswordForm = {
  nextPassword: '',
  confirmPassword: '',
};

function createDefaultDocument(): ResumeDocument {
  const now = new Date().toISOString();
  return {
    id: generateDocumentId(),
    version: '1.0.0',
    metadata: { title: '未命名简历', author: '', createdAt: now, updatedAt: now },
    pageConfig: DEFAULT_PAGE_CONFIG,
    pages: [{ id: generatePageId(), pageNumber: 1, elements: [] }],
  };
}

function formatDate(value?: string): string {
  if (!value) return '暂无';
  return new Date(value).toLocaleString('zh-CN', {
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  });
}

function initials(name?: string): string {
  return (name || '用户').trim().slice(0, 1).toUpperCase();
}

function scopeLabel(profile: AiModelProfile): string {
  if (profile.scope === 'system') return '系统';
  if (profile.scope === 'environment') return '环境';
  return '个人';
}

export const HomePage: React.FC = () => {
  const navigate = useNavigate();
  const {
    user,
    logout,
    loading: authLoading,
    error: authError,
    refreshUser,
    updateProfile,
    changePassword,
    clearError,
  } = useAuthStore();
  const [view, setView] = useState<HomeView>('workspace');
  const [list, setList] = useState<ResumeMetaDTO[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [query, setQuery] = useState('');
  const [creating, setCreating] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<ResumeMetaDTO | null>(null);
  const [deletingResumeId, setDeletingResumeId] = useState<string | null>(null);
  const [deleteError, setDeleteError] = useState('');
  const deletingResumeIdRef = useRef<string | null>(null);
  const newResumeButtonRef = useRef<HTMLButtonElement>(null);
  const [notice, setNotice] = useState('');
  const [aiConfig, setAiConfig] = useState<AiModelConfigResponse | null>(null);
  const [profileForm, setProfileForm] = useState<ProfileFormState>({
    displayName: '',
    email: '',
    avatarUrl: '',
  });
  const [passwordForm, setPasswordForm] = useState<PasswordFormState>(emptyPasswordForm);
  const [adminSummary, setAdminSummary] = useState<AdminSummaryDTO | null>(null);
  const [adminUsers, setAdminUsers] = useState<AdminUserDTO[]>([]);
  const [adminModels, setAdminModels] = useState<AiModelProfile[]>([]);
  const [adminLoading, setAdminLoading] = useState(false);
  const [modelForm, setModelForm] = useState<ModelFormState>(emptyModelForm);
  const [resetPasswordTarget, setResetPasswordTarget] = useState<AdminUserDTO | null>(null);
  const [adminPasswordForm, setAdminPasswordForm] = useState(emptyAdminPasswordForm);

  const isAdmin = user?.role === 'admin';
  const activeModel = useMemo(
    () =>
      aiConfig?.profiles.find((profile) => profile.id === aiConfig.defaultProfileId) ??
      aiConfig?.profiles[0],
    [aiConfig]
  );
  const selectedModelProvider = useMemo(
    () =>
      AI_MODEL_PROVIDERS.find((provider) => provider.id === modelForm.providerId) ??
      AI_MODEL_PROVIDERS[0],
    [modelForm.providerId]
  );
  const selectedModelPreset = useMemo(
    () => resolveAiModelPreset(modelForm.presetId) ?? selectedModelProvider.models[0],
    [modelForm.presetId, selectedModelProvider]
  );

  const loadResumes = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      setList(await resumeApi.list());
    } catch (e: any) {
      if (!(e instanceof ApiError && e.status === 401)) setError(e?.message || '加载失败');
    } finally {
      setLoading(false);
    }
  }, []);

  const loadAiConfig = useCallback(async () => {
    try {
      setAiConfig(await aiApi.config());
    } catch {
      setAiConfig(null);
    }
  }, []);

  const loadAdminData = useCallback(async () => {
    if (!isAdmin) return;
    setAdminLoading(true);
    try {
      const [summary, users, models] = await Promise.all([
        adminApi.summary(),
        adminApi.users(),
        adminApi.aiModels(),
      ]);
      setAdminSummary(summary);
      setAdminUsers(users);
      setAdminModels(models);
    } catch (e: any) {
      setNotice(e?.message || '后台数据加载失败');
    } finally {
      setAdminLoading(false);
    }
  }, [isAdmin]);

  useEffect(() => {
    void refreshUser().catch(() => undefined);
    void loadResumes();
    void loadAiConfig();
  }, [loadAiConfig, loadResumes, refreshUser]);

  useEffect(() => {
    if (!user) return;
    setProfileForm({
      displayName: user.displayName || user.username,
      email: user.email || '',
      avatarUrl: user.avatarUrl || '',
    });
  }, [user]);

  useEffect(() => {
    if (view === 'admin') void loadAdminData();
  }, [loadAdminData, view]);

  useEffect(() => {
    if (!isAdmin && view === 'admin') setView('workspace');
  }, [isAdmin, view]);

  const filteredList = useMemo(() => {
    const keyword = query.trim().toLowerCase();
    if (!keyword) return list;
    return list.filter((resume) => resume.title.toLowerCase().includes(keyword));
  }, [list, query]);

  const latestResume = list[0];
  const latestVersion = Math.max(0, ...list.map((resume) => resume.currentVersion));

  const handleCreate = async () => {
    setCreating(true);
    setError('');
    try {
      const meta = await resumeApi.create({
        title: '未命名简历',
        document: createDefaultDocument(),
      });
      navigate(`/editor/${meta.id}`);
    } catch (e: any) {
      setError(e?.message || '创建失败');
      setCreating(false);
    }
  };

  const requestResumeDelete = (event: React.MouseEvent, resume: ResumeMetaDTO) => {
    event.stopPropagation();
    setNotice('');
    setDeleteError('');
    setDeleteTarget(resume);
  };

  const closeResumeDeleteDialog = useCallback(() => {
    if (deletingResumeIdRef.current) return;
    setDeleteTarget(null);
    setDeleteError('');
  }, []);

  const confirmResumeDelete = useCallback(async () => {
    if (!deleteTarget || deletingResumeIdRef.current) return;
    const target = deleteTarget;
    deletingResumeIdRef.current = target.id;
    setDeletingResumeId(target.id);
    setDeleteError('');
    try {
      await resumeApi.remove(target.id);
      setList((current) => current.filter((resume) => resume.id !== target.id));
      setDeleteTarget(null);
      setNotice('简历已删除');
    } catch (err: any) {
      setDeleteError(err?.message || '删除失败，请稍后重试');
    } finally {
      deletingResumeIdRef.current = null;
      setDeletingResumeId(null);
    }
  }, [deleteTarget]);

  const handleProfileSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    clearError();
    const ok = await updateProfile({
      displayName: profileForm.displayName,
      email: profileForm.email,
      avatarUrl: profileForm.avatarUrl,
    });
    setNotice(ok ? '个人资料已保存' : '');
  };

  const handlePasswordSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    clearError();
    if (passwordForm.nextPassword !== passwordForm.confirmPassword) {
      setNotice('两次输入的新密码不一致');
      return;
    }
    const ok = await changePassword({
      currentPassword: passwordForm.currentPassword,
      nextPassword: passwordForm.nextPassword,
    });
    if (ok) {
      setPasswordForm(emptyPasswordForm);
      setNotice('密码已更新');
    }
  };

  const handleAdminUserPatch = async (target: AdminUserDTO, patch: AdminUserUpdateRequest) => {
    try {
      const updated = await adminApi.updateUser(target.id, patch);
      setAdminUsers((current) => current.map((item) => (item.id === updated.id ? updated : item)));
      if (updated.id === user?.id) await refreshUser();
      setNotice('用户已更新');
    } catch (e: any) {
      setNotice(e?.message || '更新用户失败');
    }
  };

  const handleAdminUserDelete = async (target: AdminUserDTO) => {
    if (!confirm(`确定删除用户 ${target.displayName}？该用户的简历也会被删除。`)) return;
    try {
      await adminApi.removeUser(target.id);
      setAdminUsers((current) => current.filter((item) => item.id !== target.id));
      void loadAdminData();
      setNotice('用户已删除');
    } catch (e: any) {
      setNotice(e?.message || '删除用户失败');
    }
  };

  const openResetPassword = (target: AdminUserDTO) => {
    setResetPasswordTarget(target);
    setAdminPasswordForm(emptyAdminPasswordForm);
    setNotice('');
  };

  const handleAdminPasswordReset = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!resetPasswordTarget) return;
    if (adminPasswordForm.nextPassword.length < 6) {
      setNotice('新密码至少 6 个字符');
      return;
    }
    if (adminPasswordForm.nextPassword !== adminPasswordForm.confirmPassword) {
      setNotice('两次输入的新密码不一致');
      return;
    }

    try {
      await adminApi.resetUserPassword(resetPasswordTarget.id, {
        nextPassword: adminPasswordForm.nextPassword,
      });
      setResetPasswordTarget(null);
      setAdminPasswordForm(emptyAdminPasswordForm);
      setNotice(`已重置 ${resetPasswordTarget.displayName} 的密码`);
    } catch (e: any) {
      setNotice(e?.message || '重置密码失败');
    }
  };

  const selectModelProvider = (providerId: AiModelPresetProviderId) => {
    const provider =
      AI_MODEL_PROVIDERS.find((item) => item.id === providerId) ?? AI_MODEL_PROVIDERS[0];
    setModelForm((form) => ({
      ...form,
      providerId: provider.id,
      presetId: provider.models[0].id,
      name: '',
    }));
  };

  const editModel = (profile: AiModelProfile) => {
    const preset = findAiModelPresetByRuntime(profile);
    setModelForm({
      id: profile.id,
      providerId: preset?.providerId ?? AI_MODEL_PROVIDERS[0].id,
      presetId: preset?.id ?? '',
      name: profile.name,
      apiKey: '',
      enabled: profile.enabled,
    });
  };

  const handleModelSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    try {
      await adminApi.saveAiModel({
        id: modelForm.id || undefined,
        presetId: modelForm.presetId,
        name: modelForm.name || selectedModelPreset.label,
        provider: 'openai-compatible',
        enabled: modelForm.enabled,
        apiKey: modelForm.apiKey || undefined,
      });
      setModelForm(emptyModelForm);
      await loadAdminData();
      await loadAiConfig();
      setNotice('系统模型已保存');
    } catch (e: any) {
      setNotice(e?.message || '保存模型失败');
    }
  };

  const setDefaultModel = async (profile: AiModelProfile) => {
    try {
      await adminApi.setDefaultAiModel(profile.id);
      await loadAdminData();
      await loadAiConfig();
      setNotice('默认模型已更新');
    } catch (e: any) {
      setNotice(e?.message || '设置默认模型失败');
    }
  };

  const removeModel = async (profile: AiModelProfile) => {
    if (!confirm(`确定删除系统模型 ${profile.name}？`)) return;
    try {
      await adminApi.removeAiModel(profile.id);
      await loadAdminData();
      await loadAiConfig();
      setNotice('系统模型已删除');
    } catch (e: any) {
      setNotice(e?.message || '删除模型失败');
    }
  };

  const navItems = [
    { key: 'workspace' as const, label: '工作台', icon: Home },
    { key: 'profile' as const, label: '个人资料', icon: User },
    ...(isAdmin ? [{ key: 'admin' as const, label: '管理后台', icon: ShieldCheck }] : []),
  ];

  return (
    <div className="min-h-screen bg-[#f7f8fb] text-slate-900 lg:flex">
      <aside className="border-r border-slate-200 bg-white lg:sticky lg:top-0 lg:flex lg:h-screen lg:w-72 lg:shrink-0 lg:flex-col">
        <div className="flex items-center gap-3 border-b border-slate-100 px-4 py-4">
          <AvatarBox
            src={user?.avatarUrl}
            label={user?.displayName || user?.username}
            className="h-10 w-10 text-sm"
          />
          <div className="min-w-0">
            <div className="truncate text-sm font-semibold">
              {user?.displayName || user?.username}
            </div>
            <div className="mt-0.5 flex items-center gap-2 text-xs text-slate-500">
              <span>个人空间</span>
              {isAdmin && (
                <span className="rounded bg-amber-100 px-1.5 py-0.5 text-amber-700">管理员</span>
              )}
            </div>
          </div>
        </div>

        <div className="px-3 py-3">
          <label className="relative block">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              className="h-10 w-full rounded-lg border border-slate-200 bg-slate-50 pl-9 pr-3 text-sm outline-none transition focus:border-violet-400 focus:bg-white focus:ring-2 focus:ring-violet-100"
              placeholder="搜索简历"
            />
          </label>
        </div>

        <nav className="space-y-1 px-3">
          {navItems.map((item) => {
            const Icon = item.icon;
            return (
              <button
                key={item.key}
                onClick={() => setView(item.key)}
                className={`flex h-10 w-full items-center gap-2 rounded-lg px-3 text-sm transition ${
                  view === item.key
                    ? 'bg-slate-900 text-white'
                    : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'
                }`}
              >
                <Icon className="h-4 w-4" />
                {item.label}
              </button>
            );
          })}
        </nav>

        <div className="mt-6 px-4">
          <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
            <div className="flex items-center justify-between text-xs text-slate-500">
              <span>简历资产</span>
              <span>{list.length} 份</span>
            </div>
            <div className="mt-3 grid grid-cols-2 gap-2 text-sm">
              <div className="rounded-md bg-white px-3 py-2">
                <div className="font-semibold">{latestVersion}</div>
                <div className="text-xs text-slate-500">最高版本</div>
              </div>
              <div className="rounded-md bg-white px-3 py-2">
                <div className="truncate font-semibold">{activeModel?.model || '默认'}</div>
                <div className="text-xs text-slate-500">AI 模型</div>
              </div>
            </div>
          </div>
        </div>

        <div className="mt-auto hidden px-4 pb-4 pt-6 lg:block">
          <button
            onClick={() => {
              logout();
              navigate('/login', { replace: true });
            }}
            className="flex h-10 w-full items-center justify-center gap-2 rounded-lg border border-slate-200 bg-white text-sm text-slate-600 hover:bg-slate-50 hover:text-slate-900"
          >
            <LogOut className="h-4 w-4" />
            退出登录
          </button>
        </div>
      </aside>

      <main className="min-w-0 flex-1">
        <header className="flex h-16 items-center gap-3 border-b border-slate-200 bg-white px-5">
          <div className="flex items-center gap-2">
            <BriefcaseBusiness className="h-5 w-5 text-violet-600" />
            <span className="font-semibold">Fast Resume</span>
          </div>
          <div className="ml-auto flex items-center gap-2">
            {notice && (
              <span className="hidden items-center gap-1 rounded-lg bg-emerald-50 px-3 py-1.5 text-xs text-emerald-700 sm:flex">
                <CheckCircle2 className="h-3.5 w-3.5" />
                {notice}
              </span>
            )}
            <button
              onClick={() => {
                void loadResumes();
                void loadAiConfig();
                if (view === 'admin') void loadAdminData();
              }}
              className="grid h-9 w-9 place-items-center rounded-lg border border-slate-200 bg-white text-slate-600 hover:bg-slate-50"
              title="刷新"
            >
              <RefreshCw className="h-4 w-4" />
            </button>
            <button
              ref={newResumeButtonRef}
              onClick={handleCreate}
              disabled={creating}
              className="inline-flex h-9 items-center gap-2 rounded-lg bg-violet-600 px-3 text-sm font-medium text-white shadow-sm hover:bg-violet-700 disabled:opacity-60"
            >
              {creating ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Plus className="h-4 w-4" />
              )}
              新建简历
            </button>
          </div>
        </header>

        <div className="mx-auto max-w-7xl px-5 py-6">
          {view === 'workspace' && (
            <section className="space-y-6">
              <div className="rounded-lg border border-violet-100 bg-[#f2ecff] px-5 py-5">
                <div className="grid gap-3 lg:grid-cols-4">
                  <button
                    onClick={handleCreate}
                    disabled={creating}
                    className="flex min-h-20 items-center gap-3 rounded-lg bg-white px-4 text-left shadow-sm transition hover:-translate-y-0.5 hover:shadow-md disabled:opacity-60"
                  >
                    <span className="grid h-10 w-10 place-items-center rounded-lg bg-violet-600 text-white">
                      <Plus className="h-5 w-5" />
                    </span>
                    <span>
                      <span className="block text-sm font-semibold">新建空白简历</span>
                      <span className="text-xs text-slate-500">从画布开始</span>
                    </span>
                  </button>
                  <button
                    onClick={() => latestResume && navigate(`/editor/${latestResume.id}`)}
                    disabled={!latestResume}
                    className="flex min-h-20 items-center gap-3 rounded-lg bg-white px-4 text-left shadow-sm transition hover:-translate-y-0.5 hover:shadow-md disabled:opacity-50"
                  >
                    <span className="grid h-10 w-10 place-items-center rounded-lg bg-emerald-500 text-white">
                      <Clock className="h-5 w-5" />
                    </span>
                    <span>
                      <span className="block truncate text-sm font-semibold">继续最近编辑</span>
                      <span className="text-xs text-slate-500">
                        {latestResume?.title || '暂无简历'}
                      </span>
                    </span>
                  </button>
                  <button
                    onClick={() => setView('profile')}
                    className="flex min-h-20 items-center gap-3 rounded-lg bg-white px-4 text-left shadow-sm transition hover:-translate-y-0.5 hover:shadow-md"
                  >
                    <span className="grid h-10 w-10 place-items-center rounded-lg bg-sky-500 text-white">
                      <Settings className="h-5 w-5" />
                    </span>
                    <span>
                      <span className="block text-sm font-semibold">账号资料</span>
                      <span className="text-xs text-slate-500">头像与密码</span>
                    </span>
                  </button>
                  <button
                    onClick={() => (isAdmin ? setView('admin') : setView('workspace'))}
                    disabled={!isAdmin}
                    className="flex min-h-20 items-center gap-3 rounded-lg bg-white px-4 text-left shadow-sm transition hover:-translate-y-0.5 hover:shadow-md disabled:opacity-50"
                  >
                    <span className="grid h-10 w-10 place-items-center rounded-lg bg-amber-500 text-white">
                      <ShieldCheck className="h-5 w-5" />
                    </span>
                    <span>
                      <span className="block text-sm font-semibold">管理后台</span>
                      <span className="text-xs text-slate-500">
                        {isAdmin ? '用户与模型' : '管理员可用'}
                      </span>
                    </span>
                  </button>
                </div>
              </div>

              <div className="grid gap-3 md:grid-cols-4">
                <Metric
                  label="简历总数"
                  value={String(list.length)}
                  icon={FileText}
                  tone="violet"
                />
                <Metric
                  label="最近更新"
                  value={formatDate(latestResume?.updatedAt)}
                  icon={Clock}
                  tone="emerald"
                />
                <Metric
                  label="AI 模型"
                  value={activeModel?.model || '环境默认'}
                  icon={Sparkles}
                  tone="sky"
                />
                <Metric
                  label="模型来源"
                  value={activeModel ? scopeLabel(activeModel) : '环境'}
                  icon={SlidersHorizontal}
                  tone="amber"
                />
              </div>

              <div>
                <div className="mb-4 flex items-end justify-between gap-3">
                  <div>
                    <h1 className="text-xl font-semibold">我的简历</h1>
                    <p className="mt-1 text-sm text-slate-500">
                      共 {filteredList.length} 份 · 点击卡片继续编辑
                    </p>
                  </div>
                </div>

                {loading ? (
                  <EmptyState icon={Loader2} text="正在加载简历" spinning />
                ) : error ? (
                  <EmptyState
                    icon={FileWarning}
                    text={error}
                    actionLabel="重试"
                    onAction={loadResumes}
                  />
                ) : (
                  <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 xl:grid-cols-5">
                    <button
                      onClick={handleCreate}
                      disabled={creating}
                      className="aspect-[210/297] rounded-lg border-2 border-dashed border-slate-300 bg-white text-slate-400 transition hover:border-violet-500 hover:bg-violet-50 hover:text-violet-600 disabled:opacity-60"
                    >
                      <span className="grid h-full place-items-center">
                        <span className="flex flex-col items-center gap-2 text-sm font-medium">
                          {creating ? (
                            <Loader2 className="h-7 w-7 animate-spin" />
                          ) : (
                            <Plus className="h-7 w-7" />
                          )}
                          新建简历
                        </span>
                      </span>
                    </button>

                    {filteredList.map((resume) => (
                      <motion.div
                        key={resume.id}
                        initial={{ opacity: 0, y: 10 }}
                        animate={{ opacity: 1, y: 0 }}
                        onClick={() => navigate(`/editor/${resume.id}`)}
                        className="group relative cursor-pointer overflow-hidden rounded-lg border border-slate-200 bg-white transition hover:border-violet-300 hover:shadow-lg"
                      >
                        <div className="aspect-[210/297] overflow-hidden bg-slate-100">
                          <AuthImage
                            src={resume.thumbnail}
                            alt={resume.title}
                            className="h-full w-full object-cover object-top"
                            fallback={
                              <div className="grid h-full place-items-center">
                                <FileText className="h-10 w-10 text-slate-300" />
                              </div>
                            }
                          />
                        </div>
                        <div className="p-3">
                          <p className="truncate text-sm font-medium">{resume.title}</p>
                          <div className="mt-1 flex items-center gap-1 text-xs text-slate-500">
                            <Clock className="h-3.5 w-3.5" />
                            <span className="truncate">{formatDate(resume.updatedAt)}</span>
                            <span className="ml-auto">v{resume.currentVersion}</span>
                          </div>
                        </div>
                        <button
                          onClick={(event) => requestResumeDelete(event, resume)}
                          className="absolute right-2 top-2 grid h-8 w-8 place-items-center rounded-lg bg-white/95 text-slate-400 opacity-100 shadow-sm transition hover:bg-red-50 hover:text-red-600 sm:opacity-0 sm:group-hover:opacity-100 sm:focus:opacity-100"
                          title="删除"
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </motion.div>
                    ))}
                  </div>
                )}
              </div>
            </section>
          )}

          {view === 'profile' && (
            <section className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_360px]">
              <form
                onSubmit={handleProfileSubmit}
                className="rounded-lg border border-slate-200 bg-white p-5"
              >
                <div className="mb-5 flex items-center gap-3">
                  <AvatarBox
                    src={profileForm.avatarUrl}
                    label={profileForm.displayName || user?.username}
                    className="h-12 w-12 font-semibold"
                  />
                  <div>
                    <h1 className="text-xl font-semibold">个人资料</h1>
                    <p className="text-sm text-slate-500">{user?.username}</p>
                  </div>
                </div>

                <div className="grid gap-4 md:grid-cols-2">
                  <Field label="名称" icon={User}>
                    <input
                      value={profileForm.displayName}
                      onChange={(event) =>
                        setProfileForm((form) => ({ ...form, displayName: event.target.value }))
                      }
                      className="field-input"
                      placeholder="你的名称"
                    />
                  </Field>
                  <Field label="邮箱" icon={Mail}>
                    <input
                      value={profileForm.email}
                      onChange={(event) =>
                        setProfileForm((form) => ({ ...form, email: event.target.value }))
                      }
                      className="field-input"
                      placeholder="name@example.com"
                    />
                  </Field>
                  <div className="md:col-span-2">
                    <Field label="头像地址" icon={Sparkles}>
                      <input
                        value={profileForm.avatarUrl}
                        onChange={(event) =>
                          setProfileForm((form) => ({ ...form, avatarUrl: event.target.value }))
                        }
                        className="field-input"
                        placeholder="https://..."
                      />
                    </Field>
                  </div>
                </div>

                {authError && (
                  <p className="mt-4 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600">
                    {authError}
                  </p>
                )}
                <button
                  disabled={authLoading}
                  className="mt-5 inline-flex h-10 items-center gap-2 rounded-lg bg-slate-900 px-4 text-sm font-medium text-white disabled:opacity-60"
                >
                  {authLoading ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Save className="h-4 w-4" />
                  )}
                  保存资料
                </button>
              </form>

              <form
                onSubmit={handlePasswordSubmit}
                className="rounded-lg border border-slate-200 bg-white p-5"
              >
                <div className="mb-5 flex items-center gap-2">
                  <KeyRound className="h-5 w-5 text-violet-600" />
                  <h2 className="font-semibold">修改密码</h2>
                </div>
                <div className="space-y-3">
                  <input
                    type="password"
                    value={passwordForm.currentPassword}
                    onChange={(event) =>
                      setPasswordForm((form) => ({ ...form, currentPassword: event.target.value }))
                    }
                    className="field-input"
                    placeholder="当前密码"
                  />
                  <input
                    type="password"
                    value={passwordForm.nextPassword}
                    onChange={(event) =>
                      setPasswordForm((form) => ({ ...form, nextPassword: event.target.value }))
                    }
                    className="field-input"
                    placeholder="新密码"
                  />
                  <input
                    type="password"
                    value={passwordForm.confirmPassword}
                    onChange={(event) =>
                      setPasswordForm((form) => ({ ...form, confirmPassword: event.target.value }))
                    }
                    className="field-input"
                    placeholder="确认新密码"
                  />
                </div>
                <button
                  disabled={authLoading}
                  className="mt-5 inline-flex h-10 w-full items-center justify-center gap-2 rounded-lg bg-violet-600 px-4 text-sm font-medium text-white disabled:opacity-60"
                >
                  {authLoading ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <KeyRound className="h-4 w-4" />
                  )}
                  更新密码
                </button>
              </form>
            </section>
          )}

          {view === 'admin' && isAdmin && (
            <section className="space-y-5">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <h1 className="text-xl font-semibold">管理后台</h1>
                  <p className="mt-1 text-sm text-slate-500">用户、角色与系统 AI 模型</p>
                </div>
                <button
                  onClick={loadAdminData}
                  className="inline-flex h-9 items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 text-sm text-slate-600 hover:bg-slate-50"
                >
                  {adminLoading ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <RefreshCw className="h-4 w-4" />
                  )}
                  刷新
                </button>
              </div>

              <div className="grid gap-3 md:grid-cols-4">
                <Metric
                  label="用户数"
                  value={String(adminSummary?.userCount ?? adminUsers.length)}
                  icon={Users}
                  tone="violet"
                />
                <Metric
                  label="管理员"
                  value={String(adminSummary?.adminCount ?? 0)}
                  icon={ShieldCheck}
                  tone="amber"
                />
                <Metric
                  label="简历数"
                  value={String(adminSummary?.resumeCount ?? list.length)}
                  icon={FileText}
                  tone="emerald"
                />
                <Metric
                  label="系统模型"
                  value={String(adminSummary?.systemModelCount ?? adminModels.length)}
                  icon={WandSparkles}
                  tone="sky"
                />
              </div>

              {resetPasswordTarget && (
                <form
                  onSubmit={handleAdminPasswordReset}
                  className="grid gap-3 rounded-lg border border-amber-200 bg-amber-50 p-4 md:grid-cols-[1fr_180px_180px_auto_auto]"
                >
                  <div className="min-w-0">
                    <div className="font-semibold text-amber-900">重置用户密码</div>
                    <div className="truncate text-sm text-amber-700">
                      {resetPasswordTarget.displayName} · {resetPasswordTarget.username}
                    </div>
                  </div>
                  <input
                    type="password"
                    value={adminPasswordForm.nextPassword}
                    onChange={(event) =>
                      setAdminPasswordForm((form) => ({
                        ...form,
                        nextPassword: event.target.value,
                      }))
                    }
                    className="field-input"
                    placeholder="新密码"
                  />
                  <input
                    type="password"
                    value={adminPasswordForm.confirmPassword}
                    onChange={(event) =>
                      setAdminPasswordForm((form) => ({
                        ...form,
                        confirmPassword: event.target.value,
                      }))
                    }
                    className="field-input"
                    placeholder="确认新密码"
                  />
                  <button className="h-10 rounded-lg bg-slate-900 px-4 text-sm font-medium text-white">
                    确认重置
                  </button>
                  <button
                    type="button"
                    onClick={() => setResetPasswordTarget(null)}
                    className="h-10 rounded-lg border border-amber-200 bg-white px-4 text-sm text-amber-700 hover:bg-amber-100"
                  >
                    取消
                  </button>
                </form>
              )}

              <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_420px]">
                <div className="overflow-hidden rounded-lg border border-slate-200 bg-white">
                  <div className="border-b border-slate-100 px-4 py-3 font-semibold">注册用户</div>
                  <div className="overflow-x-auto">
                    <table className="w-full min-w-[780px] text-left text-sm">
                      <thead className="bg-slate-50 text-xs uppercase text-slate-500">
                        <tr>
                          <th className="px-4 py-3">用户</th>
                          <th className="px-4 py-3">邮箱</th>
                          <th className="px-4 py-3">角色</th>
                          <th className="px-4 py-3">简历</th>
                          <th className="px-4 py-3">最近更新</th>
                          <th className="px-4 py-3" />
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {adminUsers.map((item) => (
                          <tr key={item.id} className="align-middle">
                            <td className="px-4 py-3">
                              <input
                                defaultValue={item.displayName}
                                onBlur={(event) => {
                                  const displayName = event.target.value.trim();
                                  if (displayName && displayName !== item.displayName) {
                                    void handleAdminUserPatch(item, { displayName });
                                  }
                                }}
                                className="h-9 w-44 rounded-lg border border-transparent bg-transparent px-2 font-medium outline-none focus:border-slate-200 focus:bg-slate-50"
                              />
                              <div className="px-2 text-xs text-slate-500">{item.username}</div>
                            </td>
                            <td className="px-4 py-3">
                              <input
                                defaultValue={item.email || ''}
                                onBlur={(event) => {
                                  const email = event.target.value.trim();
                                  if (email !== (item.email || ''))
                                    void handleAdminUserPatch(item, { email });
                                }}
                                className="h-9 w-52 rounded-lg border border-transparent bg-transparent px-2 outline-none focus:border-slate-200 focus:bg-slate-50"
                                placeholder="未设置"
                              />
                            </td>
                            <td className="px-4 py-3">
                              <select
                                value={item.role}
                                onChange={(event) =>
                                  void handleAdminUserPatch(item, {
                                    role: event.target.value as AdminUserDTO['role'],
                                  })
                                }
                                className="h-9 rounded-lg border border-slate-200 bg-white px-2"
                              >
                                <option value="member">成员</option>
                                <option value="admin">管理员</option>
                              </select>
                            </td>
                            <td className="px-4 py-3">{item.resumeCount}</td>
                            <td className="px-4 py-3 text-slate-500">
                              {formatDate(item.latestResumeUpdatedAt)}
                            </td>
                            <td className="px-4 py-3 text-right">
                              <div className="flex justify-end gap-1">
                                <button
                                  onClick={() => openResetPassword(item)}
                                  className="grid h-8 w-8 place-items-center rounded-lg text-slate-400 hover:bg-amber-50 hover:text-amber-600"
                                  title="重置密码"
                                >
                                  <KeyRound className="h-4 w-4" />
                                </button>
                                <button
                                  disabled={item.id === user?.id}
                                  onClick={() => void handleAdminUserDelete(item)}
                                  className="grid h-8 w-8 place-items-center rounded-lg text-slate-400 hover:bg-red-50 hover:text-red-500 disabled:opacity-40"
                                  title="删除用户"
                                >
                                  <Trash2 className="h-4 w-4" />
                                </button>
                              </div>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>

                <form
                  onSubmit={handleModelSubmit}
                  className="rounded-lg border border-slate-200 bg-white p-4"
                >
                  <div className="mb-4 flex items-center justify-between gap-3">
                    <div>
                      <h2 className="font-semibold">系统 AI 模型</h2>
                      <p className="text-sm text-slate-500">所有用户可选择</p>
                    </div>
                    <button
                      type="button"
                      onClick={() => setModelForm(emptyModelForm)}
                      className="rounded-lg border border-slate-200 px-3 py-1.5 text-sm text-slate-600 hover:bg-slate-50"
                    >
                      清空
                    </button>
                  </div>
                  <div className="space-y-3">
                    <select
                      value={modelForm.providerId}
                      onChange={(event) =>
                        selectModelProvider(event.target.value as AiModelPresetProviderId)
                      }
                      className="field-input"
                    >
                      {AI_MODEL_PROVIDERS.map((provider) => (
                        <option key={provider.id} value={provider.id}>
                          {provider.label}
                        </option>
                      ))}
                    </select>
                    <select
                      value={modelForm.presetId}
                      onChange={(event) => {
                        const preset = resolveAiModelPreset(event.target.value);
                        setModelForm((form) => ({
                          ...form,
                          presetId: event.target.value,
                          providerId: preset?.providerId ?? form.providerId,
                          name: '',
                        }));
                      }}
                      className="field-input"
                    >
                      {!modelForm.presetId && (
                        <option value="" disabled>
                          当前配置未匹配预设
                        </option>
                      )}
                      {selectedModelProvider.models.map((preset) => (
                        <option key={preset.id} value={preset.id}>
                          {preset.label}
                        </option>
                      ))}
                    </select>
                    <input
                      value={modelForm.name}
                      onChange={(event) =>
                        setModelForm((form) => ({ ...form, name: event.target.value }))
                      }
                      className="field-input"
                      placeholder={`显示名称（默认 ${selectedModelPreset.label}）`}
                    />
                    <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-600">
                      <div className="flex justify-between gap-3">
                        <span>Model</span>
                        <span className="truncate font-medium text-slate-900">
                          {selectedModelPreset.model}
                        </span>
                      </div>
                      <div className="mt-1 flex justify-between gap-3">
                        <span>Base URL</span>
                        <span className="truncate font-medium text-slate-900">
                          {selectedModelPreset.baseUrl}
                        </span>
                      </div>
                      <div className="mt-1 text-slate-500">{selectedModelPreset.notes}</div>
                    </div>
                    <input
                      value={modelForm.apiKey}
                      onChange={(event) =>
                        setModelForm((form) => ({ ...form, apiKey: event.target.value }))
                      }
                      className="field-input"
                      type="password"
                      placeholder={`${selectedModelProvider.apiKeyLabel}（留空保持原值）`}
                    />
                    <label className="flex items-center justify-between gap-3 rounded-lg border border-slate-200 px-3 py-2 text-sm">
                      <span>启用该系统模型</span>
                      <input
                        type="checkbox"
                        checked={modelForm.enabled}
                        onChange={(event) =>
                          setModelForm((form) => ({ ...form, enabled: event.target.checked }))
                        }
                      />
                    </label>
                  </div>
                  <button
                    disabled={!modelForm.presetId}
                    className="mt-4 inline-flex h-10 w-full items-center justify-center gap-2 rounded-lg bg-slate-900 text-sm font-medium text-white disabled:opacity-50"
                  >
                    <Save className="h-4 w-4" />
                    {modelForm.id ? '保存模型' : '添加模型'}
                  </button>
                </form>
              </div>

              <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                {adminModels.map((profile) => (
                  <div key={profile.id} className="rounded-lg border border-slate-200 bg-white p-4">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <h3 className="truncate font-semibold">{profile.name}</h3>
                          <span className="rounded bg-violet-100 px-1.5 py-0.5 text-xs text-violet-700">
                            {profile.providerLabel || '兼容'}
                          </span>
                          {profile.isDefault && (
                            <span className="rounded bg-emerald-100 px-1.5 py-0.5 text-xs text-emerald-700">
                              默认
                            </span>
                          )}
                        </div>
                        <p className="mt-1 truncate text-sm text-slate-500">{profile.model}</p>
                      </div>
                      <span className="rounded bg-slate-100 px-2 py-1 text-xs text-slate-600">
                        {profile.enabled ? '启用' : '停用'}
                      </span>
                    </div>
                    <div className="mt-3 space-y-1 text-xs text-slate-500">
                      <div className="truncate">{profile.baseUrl}</div>
                      <div>
                        Key：
                        {profile.apiKeyConfigured ? profile.apiKeyPreview || '已配置' : '未配置'}
                      </div>
                    </div>
                    <div className="mt-4 flex gap-2">
                      <button
                        type="button"
                        onClick={() => editModel(profile)}
                        className="h-8 rounded-lg border border-slate-200 px-3 text-sm hover:bg-slate-50"
                      >
                        编辑
                      </button>
                      <button
                        type="button"
                        disabled={!profile.enabled || profile.isDefault}
                        onClick={() => void setDefaultModel(profile)}
                        className="h-8 rounded-lg border border-slate-200 px-3 text-sm hover:bg-slate-50 disabled:opacity-50"
                      >
                        设为默认
                      </button>
                      <button
                        type="button"
                        onClick={() => void removeModel(profile)}
                        className="ml-auto grid h-8 w-8 place-items-center rounded-lg text-slate-400 hover:bg-red-50 hover:text-red-500"
                        title="删除模型"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </section>
          )}
        </div>
      </main>
      <ConfirmDialog
        open={Boolean(deleteTarget)}
        title="删除这份简历？"
        description={
          <>
            即将永久删除
            <span className="mx-1 font-semibold text-slate-900">
              “{deleteTarget?.title || '未命名简历'}”
            </span>
            及其版本记录。此操作无法撤销。
          </>
        }
        loading={Boolean(deletingResumeId)}
        error={deleteError}
        fallbackFocusRef={newResumeButtonRef}
        onClose={closeResumeDeleteDialog}
        onConfirm={() => void confirmResumeDelete()}
      />
    </div>
  );
};

const toneClass = {
  violet: 'bg-violet-50 text-violet-700',
  emerald: 'bg-emerald-50 text-emerald-700',
  sky: 'bg-sky-50 text-sky-700',
  amber: 'bg-amber-50 text-amber-700',
};

function Metric({
  label,
  value,
  icon: Icon,
  tone,
}: {
  label: string;
  value: string;
  icon: React.ElementType;
  tone: keyof typeof toneClass;
}) {
  return (
    <div className="rounded-lg border border-slate-200 bg-white px-4 py-3">
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <div className="truncate text-lg font-semibold">{value}</div>
          <div className="text-sm text-slate-500">{label}</div>
        </div>
        <span className={`grid h-10 w-10 place-items-center rounded-lg ${toneClass[tone]}`}>
          <Icon className="h-5 w-5" />
        </span>
      </div>
    </div>
  );
}

function Field({
  label,
  icon: Icon,
  children,
}: {
  label: string;
  icon: React.ElementType;
  children: React.ReactNode;
}) {
  return (
    <label className="block">
      <span className="mb-1.5 flex items-center gap-1.5 text-sm font-medium text-slate-700">
        <Icon className="h-4 w-4 text-slate-400" />
        {label}
      </span>
      {children}
    </label>
  );
}

function AvatarBox({
  src,
  label,
  className,
}: {
  src?: string;
  label?: string;
  className?: string;
}) {
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    setFailed(false);
  }, [src]);

  return (
    <div
      className={`grid place-items-center overflow-hidden rounded-lg bg-violet-600 font-semibold text-white ${className ?? ''}`}
    >
      {src && !failed ? (
        <img
          src={src}
          alt={label || 'avatar'}
          className="h-full w-full object-cover"
          referrerPolicy="no-referrer"
          onError={() => setFailed(true)}
        />
      ) : (
        initials(label)
      )}
    </div>
  );
}

function EmptyState({
  icon: Icon,
  text,
  spinning,
  actionLabel,
  onAction,
}: {
  icon: React.ElementType;
  text: string;
  spinning?: boolean;
  actionLabel?: string;
  onAction?: () => void;
}) {
  return (
    <div className="grid min-h-64 place-items-center rounded-lg border border-dashed border-slate-300 bg-white text-slate-400">
      <div className="flex flex-col items-center gap-2">
        <Icon className={`h-8 w-8 ${spinning ? 'animate-spin' : ''}`} />
        <p className="text-sm">{text}</p>
        {actionLabel && onAction && (
          <button onClick={onAction} className="text-sm font-medium text-violet-600">
            {actionLabel}
          </button>
        )}
      </div>
    </div>
  );
}
