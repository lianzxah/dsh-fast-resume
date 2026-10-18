import type {
  AiEditorContext,
  AiAppliedChange,
  AiApplyProposalRequest,
  AiApplyResponse,
  AiEditProposal,
  AiModelConfigResponse,
  AiModelProfile,
  AiModelProfileInput,
  AiStreamFrame,
  AiProposalStatus,
  AiTurnResponse,
  AdminPasswordResetRequest,
  AdminSummaryDTO,
  AdminUserDTO,
  AdminUserUpdateRequest,
  ApiResponse,
  AuthResponse,
  PasswordUpdateRequest,
  ResumeMetaDTO,
  ResumeVersionDTO,
  ResumeDetailDTO,
  ResumeDocument,
  UserDTO,
  UserProfileUpdateRequest,
} from '@resume-editor/shared';

// ============================================================
// 前端 API 客户端
// 统一封装 fetch：注入 JWT、解析 ApiResponse、401 处理。
// ============================================================

const TOKEN_KEY = 'resume-editor-token';

export function getToken(): string | null {
  return localStorage.getItem(TOKEN_KEY);
}

export function setToken(token: string | null): void {
  if (token) localStorage.setItem(TOKEN_KEY, token);
  else localStorage.removeItem(TOKEN_KEY);
}

/** 401 未授权回调 (由 auth-store 注册，用于登出跳转) */
let onUnauthorized: (() => void) | null = null;
export function setUnauthorizedHandler(fn: () => void): void {
  onUnauthorized = fn;
}

class ApiError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.status = status;
  }
}

async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  const token = getToken();
  const headers: Record<string, string> = { ...(options.headers as Record<string, string>) };
  if (!(options.body instanceof FormData)) headers['Content-Type'] = 'application/json';
  if (token) headers['Authorization'] = `Bearer ${token}`;

  const res = await fetch(`/api${path}`, { ...options, headers });

  if (res.status === 401) {
    onUnauthorized?.();
    throw new ApiError('登录已过期，请重新登录', 401);
  }

  const json = (await res.json()) as ApiResponse<T>;
  if (!json.success) throw new ApiError(json.error || '请求失败', res.status);
  return json.data as T;
}

async function streamAiRequest(
  path: string,
  body: unknown,
  onFrame: (frame: AiStreamFrame) => void | Promise<void>,
  signal?: AbortSignal
): Promise<Omit<AiTurnResponse, 'events'>> {
  const token = getToken();
  const res = await fetch(`/api${path}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify(body),
    signal,
  });
  if (res.status === 401) {
    onUnauthorized?.();
    throw new ApiError('登录已过期，请重新登录', 401);
  }
  if (!res.ok || !res.body) {
    const payload = (await res.json().catch(() => null)) as ApiResponse<unknown> | null;
    throw new ApiError(payload?.error || 'AI 流式请求失败', res.status);
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  let completed: Omit<AiTurnResponse, 'events'> | null = null;
  const consumeFrame = async (rawFrame: string) => {
    const data = rawFrame
      .split(/\r?\n/)
      .filter((line) => line.startsWith('data:'))
      .map((line) => line.slice(5).trimStart())
      .join('\n');
    if (!data) return;
    const frame = JSON.parse(data) as AiStreamFrame;
    await onFrame(frame);
    if (frame.type === 'done') completed = frame.response;
  };
  while (true) {
    const { value, done } = await reader.read();
    buffer += decoder.decode(value, { stream: !done });
    const frames = buffer.split(/\r?\n\r?\n/);
    buffer = frames.pop() ?? '';
    for (const rawFrame of frames) {
      await consumeFrame(rawFrame);
    }
    if (done) break;
  }
  if (buffer.trim()) await consumeFrame(buffer);
  if (!completed) throw new Error('AI 流式响应未正常结束');
  return completed;
}

// ------------------------------------------------------------
// 鉴权
// ------------------------------------------------------------
export const authApi = {
  register: (username: string, password: string) =>
    request<AuthResponse>('/auth/register', {
      method: 'POST',
      body: JSON.stringify({ username, password }),
    }),
  login: (username: string, password: string) =>
    request<AuthResponse>('/auth/login', {
      method: 'POST',
      body: JSON.stringify({ username, password }),
    }),
  me: () => request<UserDTO>('/auth/me'),
  updateProfile: (payload: UserProfileUpdateRequest) =>
    request<UserDTO>('/auth/me', { method: 'PUT', body: JSON.stringify(payload) }),
  changePassword: (payload: PasswordUpdateRequest) =>
    request<{ updatedAt: string }>('/auth/password', {
      method: 'PUT',
      body: JSON.stringify(payload),
    }),
};

// ------------------------------------------------------------
// 简历
// ------------------------------------------------------------
export interface SaveResumePayload {
  title?: string;
  document: ResumeDocument;
  thumbnail?: string;
  createVersion?: boolean;
  message?: string;
}

export const resumeApi = {
  list: () => request<ResumeMetaDTO[]>('/resumes'),
  get: (id: string) => request<ResumeDetailDTO>(`/resumes/${id}`),
  create: (payload: { title: string; document: ResumeDocument; thumbnail?: string }) =>
    request<ResumeMetaDTO>('/resumes', { method: 'POST', body: JSON.stringify(payload) }),
  update: (id: string, payload: SaveResumePayload) =>
    request<ResumeMetaDTO>(`/resumes/${id}`, { method: 'PUT', body: JSON.stringify(payload) }),
  remove: (id: string) => request<{ id: string }>(`/resumes/${id}`, { method: 'DELETE' }),
  versions: (id: string) => request<ResumeVersionDTO[]>(`/resumes/${id}/versions`),
  getVersion: (id: string, version: number) =>
    request<{ document: ResumeDocument; version: number }>(`/resumes/${id}/versions/${version}`),
  restore: (id: string, version: number) =>
    request<{ meta: ResumeMetaDTO; document: ResumeDocument }>(
      `/resumes/${id}/versions/${version}/restore`,
      {
        method: 'POST',
      }
    ),
};

// ------------------------------------------------------------
// AI 助手
// ------------------------------------------------------------
export interface AiSessionDTO {
  id: string;
  resumeId: string;
  title?: string;
  createdAt: string;
  updatedAt: string;
}

export interface AiMessageDTO {
  id: string;
  role: string;
  content: string;
  thinkingLabel?: string;
  thinkingContent?: string;
  createdAt: string;
}

export interface AiProposalDTO {
  id: string;
  sessionId: string;
  status: AiProposalStatus;
  risk: 'low' | 'medium' | 'high';
  proposal: AiEditProposal;
  createdAt: string;
  updatedAt: string;
}

export const aiApi = {
  config: () => request<AiModelConfigResponse>('/ai/config'),
  saveDefaultProfile: (payload: AiModelProfileInput) =>
    request<AiModelProfile>('/ai/config/default', { method: 'PUT', body: JSON.stringify(payload) }),
  setDefaultProfile: (profileId: string) =>
    request<AiModelProfile>('/ai/config/default-profile', {
      method: 'PUT',
      body: JSON.stringify({ profileId }),
    }),
  testProfile: (payload: AiModelProfileInput) =>
    request<{ ok: boolean; message: string }>('/ai/config/test', {
      method: 'POST',
      body: JSON.stringify(payload),
    }),
  listSessions: (resumeId: string) =>
    request<AiSessionDTO[]>(`/ai/sessions?resumeId=${encodeURIComponent(resumeId)}`),
  createSession: (payload: { resumeId: string; title?: string }) =>
    request<AiSessionDTO>('/ai/sessions', { method: 'POST', body: JSON.stringify(payload) }),
  deleteSession: (sessionId: string) =>
    request<{ id: string }>(`/ai/sessions/${sessionId}`, { method: 'DELETE' }),
  messages: (sessionId: string) => request<AiMessageDTO[]>(`/ai/sessions/${sessionId}/messages`),
  proposals: (sessionId: string) => request<AiProposalDTO[]>(`/ai/sessions/${sessionId}/proposals`),
  sendMessage: (
    sessionId: string,
    payload: {
      resumeId: string;
      message: string;
      context: AiEditorContext;
      modelProfileId?: string;
    },
    signal?: AbortSignal
  ) =>
    request<AiTurnResponse>(`/ai/sessions/${sessionId}/messages`, {
      method: 'POST',
      body: JSON.stringify(payload),
      signal,
    }),
  streamMessage: (
    sessionId: string,
    payload: {
      resumeId: string;
      message: string;
      context: AiEditorContext;
      modelProfileId?: string;
    },
    onFrame: (frame: AiStreamFrame) => void | Promise<void>,
    signal?: AbortSignal
  ) => streamAiRequest(`/ai/sessions/${sessionId}/messages/stream`, payload, onFrame, signal),
  applyProposal: (sessionId: string, proposalId: string, payload: AiApplyProposalRequest) =>
    request<AiApplyResponse>(`/ai/sessions/${sessionId}/proposals/${proposalId}/apply`, {
      method: 'POST',
      body: JSON.stringify(payload),
    }),
  declineProposal: (sessionId: string, proposalId: string) =>
    request<AiProposalDTO>(`/ai/sessions/${sessionId}/proposals/${proposalId}/decline`, {
      method: 'POST',
    }),
  changes: (sessionId: string) => request<AiAppliedChange[]>(`/ai/sessions/${sessionId}/changes`),
  cancelAppliedProposal: (sessionId: string, changeId: string, attemptId: string) =>
    request<{ id: string }>(`/ai/sessions/${sessionId}/changes/${changeId}/cancel`, {
      method: 'POST',
      body: JSON.stringify({ attemptId }),
    }),
  revertChange: (sessionId: string, changeId: string, attemptId: string) =>
    request<AiAppliedChange>(`/ai/sessions/${sessionId}/changes/${changeId}/revert`, {
      method: 'POST',
      body: JSON.stringify({ attemptId }),
    }),
  restoreChange: (sessionId: string, changeId: string, attemptId: string) =>
    request<AiAppliedChange>(`/ai/sessions/${sessionId}/changes/${changeId}/restore`, {
      method: 'POST',
      body: JSON.stringify({ attemptId }),
    }),
};

// ------------------------------------------------------------
// 管理后台
// ------------------------------------------------------------
export const adminApi = {
  summary: () => request<AdminSummaryDTO>('/admin/summary'),
  users: () => request<AdminUserDTO[]>('/admin/users'),
  updateUser: (id: string, payload: AdminUserUpdateRequest) =>
    request<AdminUserDTO>(`/admin/users/${id}`, { method: 'PATCH', body: JSON.stringify(payload) }),
  resetUserPassword: (id: string, payload: AdminPasswordResetRequest) =>
    request<{ id: string; updatedAt: string }>(`/admin/users/${id}/password`, {
      method: 'POST',
      body: JSON.stringify(payload),
    }),
  removeUser: (id: string) => request<{ id: string }>(`/admin/users/${id}`, { method: 'DELETE' }),
  aiModels: () => request<AiModelProfile[]>('/admin/ai-models'),
  saveAiModel: (payload: AiModelProfileInput) =>
    request<AiModelProfile>(payload.id ? `/admin/ai-models/${payload.id}` : '/admin/ai-models', {
      method: payload.id ? 'PUT' : 'POST',
      body: JSON.stringify(payload),
    }),
  setDefaultAiModel: (id: string) =>
    request<AiModelProfile>(`/admin/ai-models/${id}/default`, { method: 'POST' }),
  removeAiModel: (id: string) =>
    request<{ id: string }>(`/admin/ai-models/${id}`, { method: 'DELETE' }),
};

export { ApiError };
