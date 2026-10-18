// ============================================================
// 前后端共享 API DTO
// ============================================================

/** 通用 API 响应包裹 */
export interface ApiResponse<T = unknown> {
  success: boolean;
  data?: T;
  error?: string;
}

// ------------------------------------------------------------
// 鉴权
// ------------------------------------------------------------

export type UserRole = 'admin' | 'member';

/** 用户信息 (不含敏感字段) */
export interface UserDTO {
  id: string;
  username: string;
  displayName: string;
  email?: string;
  avatarUrl?: string;
  role: UserRole;
  createdAt: string;
  updatedAt: string;
}

/** 登录 / 注册请求 */
export interface AuthRequest {
  username: string;
  password: string;
}

/** 登录 / 注册响应 */
export interface AuthResponse {
  token: string;
  user: UserDTO;
}

export interface UserProfileUpdateRequest {
  displayName?: string;
  email?: string;
  avatarUrl?: string;
}

export interface PasswordUpdateRequest {
  currentPassword: string;
  nextPassword: string;
}

// ------------------------------------------------------------
// 管理后台
// ------------------------------------------------------------

export interface AdminUserDTO extends UserDTO {
  resumeCount: number;
  latestResumeUpdatedAt?: string;
}

export interface AdminUserUpdateRequest {
  displayName?: string;
  email?: string;
  avatarUrl?: string;
  role?: UserRole;
}

export interface AdminPasswordResetRequest {
  nextPassword: string;
}

export interface AdminSummaryDTO {
  userCount: number;
  adminCount: number;
  resumeCount: number;
  systemModelCount: number;
}

// ------------------------------------------------------------
// 简历元数据与版本
// ------------------------------------------------------------

/** 简历列表项元数据 (不含完整文档内容) */
export interface ResumeMetaDTO {
  id: string;
  title: string;
  /** 缩略图访问路径 (相对 /api) */
  thumbnail?: string;
  createdAt: string;
  updatedAt: string;
  tags?: string[];
  /** 当前版本号 */
  currentVersion: number;
}

/** 版本快照元数据 */
export interface ResumeVersionDTO {
  id: string;
  resumeId: string;
  version: number;
  message?: string;
  createdAt: string;
  thumbnail?: string;
}

/** 创建简历请求 */
export interface CreateResumeRequest {
  title: string;
  /** 完整文档 JSON (ResumeDocument) */
  document: unknown;
  thumbnail?: string;
}

/** 更新 / 自动保存简历请求 */
export interface UpdateResumeRequest {
  title?: string;
  document: unknown;
  thumbnail?: string;
  /** 是否生成新的版本快照 (手动保存 = true, 自动保存 = false) */
  createVersion?: boolean;
  /** 版本备注 */
  message?: string;
}

/** 简历详情 (含完整文档) */
export interface ResumeDetailDTO extends ResumeMetaDTO {
  document: unknown;
}
