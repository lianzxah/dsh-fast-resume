import { create } from 'zustand';
import type { PasswordUpdateRequest, UserDTO, UserProfileUpdateRequest } from '@resume-editor/shared';
import { authApi, getToken, setToken, setUnauthorizedHandler } from '@/lib/api';

// ============================================================
// 鉴权状态 Store
// ============================================================

const USER_KEY = 'resume-editor-user';

function loadUser(): UserDTO | null {
  try {
    const raw = localStorage.getItem(USER_KEY);
    return raw ? (JSON.parse(raw) as UserDTO) : null;
  } catch {
    return null;
  }
}

interface AuthState {
  user: UserDTO | null;
  token: string | null;
  loading: boolean;
  error: string | null;
  login: (username: string, password: string) => Promise<boolean>;
  register: (username: string, password: string) => Promise<boolean>;
  refreshUser: () => Promise<void>;
  updateProfile: (payload: UserProfileUpdateRequest) => Promise<boolean>;
  changePassword: (payload: PasswordUpdateRequest) => Promise<boolean>;
  logout: () => void;
  clearError: () => void;
}

export const useAuthStore = create<AuthState>((set) => ({
  user: loadUser(),
  token: getToken(),
  loading: false,
  error: null,

  login: async (username, password) => {
    set({ loading: true, error: null });
    try {
      const { token, user } = await authApi.login(username, password);
      setToken(token);
      localStorage.setItem(USER_KEY, JSON.stringify(user));
      set({ token, user, loading: false });
      return true;
    } catch (e: any) {
      set({ loading: false, error: e.message || '登录失败' });
      return false;
    }
  },

  register: async (username, password) => {
    set({ loading: true, error: null });
    try {
      const { token, user } = await authApi.register(username, password);
      setToken(token);
      localStorage.setItem(USER_KEY, JSON.stringify(user));
      set({ token, user, loading: false });
      return true;
    } catch (e: any) {
      set({ loading: false, error: e.message || '注册失败' });
      return false;
    }
  },

  refreshUser: async () => {
    const user = await authApi.me();
    localStorage.setItem(USER_KEY, JSON.stringify(user));
    set({ user });
  },

  updateProfile: async (payload) => {
    set({ loading: true, error: null });
    try {
      const user = await authApi.updateProfile(payload);
      localStorage.setItem(USER_KEY, JSON.stringify(user));
      set({ user, loading: false });
      return true;
    } catch (e: any) {
      set({ loading: false, error: e.message || '保存资料失败' });
      return false;
    }
  },

  changePassword: async (payload) => {
    set({ loading: true, error: null });
    try {
      await authApi.changePassword(payload);
      set({ loading: false });
      return true;
    } catch (e: any) {
      set({ loading: false, error: e.message || '修改密码失败' });
      return false;
    }
  },

  logout: () => {
    setToken(null);
    localStorage.removeItem(USER_KEY);
    set({ token: null, user: null });
  },

  clearError: () => set({ error: null }),
}));

// 注册 401 处理：自动登出
setUnauthorizedHandler(() => {
  useAuthStore.getState().logout();
});
