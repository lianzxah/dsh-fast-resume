import React, { useEffect, useState } from 'react';
import { DEEPSEEK_V4_MODELS } from '@resume-editor/shared';
import {
  Brain,
  Check,
  Loader2,
  MessageSquare,
  Plus,
  RefreshCw,
  RotateCcw,
  Save,
  Send,
  Settings,
  Sparkles,
  Trash2,
  X,
} from 'lucide-react';
import { useAiAssistantSession, type AiChatMessage } from '@/hooks/useAiAssistantSession';
import { useEditorStore } from '@/store';

const AiConversationMessage = React.memo<{ message: AiChatMessage }>(({ message }) => {
  const isUser = message.role === 'user';
  const isSystem = message.role === 'system';
  const isThinking = message.thinking?.status === 'streaming';

  return (
    <div className={`flex ${isUser ? 'justify-end' : 'justify-start'}`}>
      <div
        className={`flex max-w-[78%] flex-col space-y-1.5 ${isUser ? 'items-end' : 'items-start'}`}
      >
        {message.thinking && (
          <details
            open={isThinking ? true : undefined}
            className="rounded border border-violet-500/20 bg-violet-500/5 px-2.5 py-2 text-xs"
          >
            <summary className="flex cursor-pointer list-none items-center gap-1.5 font-medium text-violet-700">
              {isThinking ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <Brain className="h-3.5 w-3.5" />
              )}
              {isThinking ? message.thinking.label : '查看本轮深度分析'}
            </summary>
            <div className="mt-2 whitespace-pre-wrap leading-5 text-muted-foreground">
              {message.thinking.content || '正在建立分析与优化计划…'}
            </div>
          </details>
        )}
        {message.content && (
          <div
            className={`whitespace-pre-wrap rounded px-2.5 py-1.5 text-xs leading-5 ${
              isUser
                ? 'bg-primary text-primary-foreground'
                : isSystem
                  ? 'bg-emerald-500/10 text-emerald-700'
                  : 'bg-muted text-foreground'
            }`}
          >
            {message.content}
          </div>
        )}
      </div>
    </div>
  );
});

AiConversationMessage.displayName = 'AiConversationMessage';

export const AiAssistantPanel: React.FC = () => {
  const [draft, setDraft] = useState('');
  const [settingsOpen, setSettingsOpen] = useState(false);
  const {
    activeSession,
    sessions,
    messages,
    pendingProposals,
    appliedChanges,
    config,
    activeModel,
    isSending,
    isConfigSaving,
    error,
    sendMessage,
    cancelSend,
    retryLastMessage,
    applyProposal,
    applyingProposalIds,
    declineProposal,
    revertChange,
    revertingChangeIds,
    deleteSession,
    deletingSessionIds,
    saveModelProfile,
    selectModelProfile,
    setActiveSessionId,
    startNewSession,
  } = useAiAssistantSession();
  const selectedCount = useEditorStore((state) => state.selection.selectedIds.length);
  const resumeId = useEditorStore((state) => state.resumeId);
  const [modelForm, setModelForm] = useState({
    id: '',
    name: '',
    baseUrl: '',
    model: '',
    temperature: 0.2,
    maxTokens: '',
    apiKey: '',
    supportsJsonMode: true,
  });

  useEffect(() => {
    if (!activeModel) return;
    setModelForm({
      id: activeModel.readonly ? '' : activeModel.id,
      name: activeModel.readonly ? `${activeModel.model} 配置` : activeModel.name,
      baseUrl: activeModel.baseUrl,
      model: activeModel.model,
      temperature: activeModel.temperature,
      maxTokens: activeModel.maxTokens ? String(activeModel.maxTokens) : '',
      apiKey: '',
      supportsJsonMode: activeModel.supportsJsonMode,
    });
  }, [activeModel]);

  const submit = () => {
    const value = draft.trim();
    if (!value) return;
    setDraft('');
    void sendMessage(value);
  };

  const saveConfig = () => {
    void saveModelProfile({
      id: modelForm.id || undefined,
      name: modelForm.name || modelForm.model,
      provider: 'openai-compatible',
      baseUrl: modelForm.baseUrl,
      model: modelForm.model,
      temperature: modelForm.temperature,
      maxTokens: modelForm.maxTokens ? Number(modelForm.maxTokens) : undefined,
      supportsJsonMode: modelForm.supportsJsonMode,
      apiKey: modelForm.apiKey || undefined,
      enabled: true,
    });
  };

  return (
    <div className="h-full min-h-0 flex bg-background">
      <aside className="w-48 shrink-0 border-r border-border bg-muted/20 flex flex-col min-h-0">
        <div className="h-8 px-2 border-b border-border flex items-center justify-between">
          <span className="text-xs font-medium truncate">AI 对话</span>
          <button
            className="w-6 h-6 inline-flex items-center justify-center rounded hover:bg-accent text-muted-foreground disabled:opacity-50"
            onClick={startNewSession}
            disabled={isSending}
            title="新建对话"
          >
            <Plus className="w-3.5 h-3.5" />
          </button>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto p-1.5 space-y-1">
          {sessions.length === 0 ? (
            <div className="h-full grid place-items-center text-muted-foreground">
              <MessageSquare className="w-4 h-4" />
            </div>
          ) : (
            sessions.map((session) => {
              const deleting = deletingSessionIds.has(session.id);
              return (
                <div
                  key={session.id}
                  className={`group flex items-center rounded transition-colors ${
                    activeSession?.id === session.id
                      ? 'bg-primary/10 text-primary'
                      : 'text-muted-foreground hover:bg-accent hover:text-foreground'
                  }`}
                >
                  <button
                    className="min-w-0 flex-1 text-left px-2 py-1.5 text-xs truncate"
                    onClick={() => setActiveSessionId(session.id)}
                    disabled={isSending}
                  >
                    {session.title || 'AI 对话'}
                  </button>
                  <button
                    className="mr-1 hidden h-5 w-5 shrink-0 items-center justify-center rounded text-muted-foreground hover:bg-destructive/10 hover:text-destructive group-hover:inline-flex disabled:inline-flex disabled:opacity-50"
                    disabled={deleting || isSending}
                    title={isSending ? '请先取消当前 AI 请求' : '删除会话'}
                    onClick={() => {
                      if (!confirm('删除该 AI 会话及其消息和提案？已应用但未回退的会话不能删除。'))
                        return;
                      void deleteSession(session.id).catch(() => undefined);
                    }}
                  >
                    {deleting ? (
                      <Loader2 className="h-3 w-3 animate-spin" />
                    ) : (
                      <Trash2 className="h-3 w-3" />
                    )}
                  </button>
                </div>
              );
            })
          )}
        </div>
      </aside>

      <section className="flex-1 min-w-0 min-h-0 flex flex-col">
        <div className="h-9 shrink-0 px-3 border-b border-border bg-muted/30 flex items-center gap-2">
          <Sparkles className="w-3.5 h-3.5 text-primary" />
          <span className="text-xs font-medium truncate">
            {activeSession?.title || 'AI 简历助手'}
          </span>
          <select
            className="ml-auto h-6 max-w-56 rounded border border-border bg-background px-1.5 text-[11px] text-foreground"
            value={activeModel?.id ?? ''}
            onChange={(event) => {
              const profile = config?.profiles.find((item) => item.id === event.target.value);
              if (profile) void selectModelProfile(profile);
            }}
            title="选择模型"
          >
            {config?.profiles.map((profile) => (
              <option key={profile.id} value={profile.id}>
                {profile.model}
              </option>
            ))}
          </select>
          <button
            className="w-6 h-6 inline-flex items-center justify-center rounded text-muted-foreground hover:bg-accent hover:text-foreground"
            onClick={() => setSettingsOpen((open) => !open)}
            title="模型设置"
          >
            <Settings className="w-3.5 h-3.5" />
          </button>
          {selectedCount > 0 && (
            <span className="text-[11px] text-primary bg-primary/10 rounded px-1.5 py-0.5">
              已选 {selectedCount}
            </span>
          )}
        </div>

        {settingsOpen && (
          <div className="shrink-0 border-b border-border bg-background px-3 py-2 grid grid-cols-[minmax(160px,1fr)_minmax(140px,1fr)_88px_120px_auto] gap-2 items-center">
            <input
              value={modelForm.baseUrl}
              onChange={(event) =>
                setModelForm((form) => ({ ...form, baseUrl: event.target.value }))
              }
              className="h-7 rounded border border-border bg-muted/40 px-2 text-xs"
              placeholder="Base URL"
            />
            <select
              value={modelForm.model}
              onChange={(event) => setModelForm((form) => ({ ...form, model: event.target.value }))}
              className="h-7 rounded border border-border bg-muted/40 px-2 text-xs"
              title="DeepSeek V4 模型"
            >
              {DEEPSEEK_V4_MODELS.map((model) => (
                <option key={model} value={model}>
                  {model}
                </option>
              ))}
            </select>
            <input
              value={modelForm.temperature}
              onChange={(event) =>
                setModelForm((form) => ({ ...form, temperature: Number(event.target.value) }))
              }
              className="h-7 rounded border border-border bg-muted/40 px-2 text-xs"
              type="number"
              min={0}
              max={2}
              step={0.1}
              title="Temperature"
            />
            <input
              value={modelForm.apiKey}
              onChange={(event) =>
                setModelForm((form) => ({ ...form, apiKey: event.target.value }))
              }
              className="h-7 rounded border border-border bg-muted/40 px-2 text-xs"
              type="password"
              placeholder={
                activeModel?.apiKeyConfigured ? activeModel.apiKeyPreview || '已配置' : 'API Key'
              }
            />
            <button
              className="h-7 px-2 inline-flex items-center gap-1 rounded bg-primary text-primary-foreground text-xs disabled:opacity-50"
              disabled={isConfigSaving || !modelForm.baseUrl || !modelForm.model}
              onClick={saveConfig}
              title="保存模型配置"
            >
              {isConfigSaving ? (
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
              ) : (
                <Save className="w-3.5 h-3.5" />
              )}
              保存
            </button>
          </div>
        )}

        <div className="min-h-0 flex-1 overflow-y-auto px-3 py-2 space-y-2">
          {messages.length === 0 ? (
            <div className="h-full grid place-items-center text-muted-foreground/60">
              <Sparkles className="w-8 h-8" />
            </div>
          ) : (
            messages.map((message) => <AiConversationMessage key={message.id} message={message} />)
          )}

          {pendingProposals.map(({ proposal, model, blockedReason }) => (
            <div
              key={proposal.id}
              className="border border-border rounded bg-background p-2 text-xs space-y-2"
            >
              <div className="flex items-start gap-2">
                <Sparkles className="w-3.5 h-3.5 mt-0.5 text-primary" />
                <div className="min-w-0 flex-1">
                  <div className="font-medium truncate">{proposal.title}</div>
                  <div className="text-muted-foreground leading-5">{proposal.rationale}</div>
                  {blockedReason && <div className="text-amber-700 leading-5">{blockedReason}</div>}
                  <div className="text-muted-foreground/80 leading-5">
                    模型：{model?.model || activeModel?.model || '未记录'}
                  </div>
                </div>
              </div>
              <div className="space-y-1">
                {proposal.preview.summary.map((line) => (
                  <div key={line} className="text-muted-foreground leading-5">
                    {line}
                  </div>
                ))}
                {proposal.preview.beforeAfter?.slice(0, 2).map((diff) => (
                  <div key={diff.elementId} className="grid grid-cols-2 gap-2">
                    <div className="rounded bg-muted/50 p-1.5 line-clamp-4">{diff.before}</div>
                    <div className="rounded bg-primary/5 p-1.5 line-clamp-4">{diff.after}</div>
                  </div>
                ))}
              </div>
              <div className="flex justify-end gap-1.5">
                <button
                  className="h-7 px-2 inline-flex items-center gap-1 rounded border border-border hover:bg-accent"
                  onClick={() => void declineProposal(proposal.id)}
                >
                  <X className="w-3.5 h-3.5" />
                  拒绝
                </button>
                <button
                  className="h-7 px-2 inline-flex items-center gap-1 rounded bg-primary text-primary-foreground hover:bg-primary/90"
                  disabled={applyingProposalIds.has(proposal.id)}
                  onClick={() => void applyProposal(proposal, model).catch(() => undefined)}
                >
                  {applyingProposalIds.has(proposal.id) ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <Check className="h-3.5 w-3.5" />
                  )}
                  {applyingProposalIds.has(proposal.id) ? '应用中' : '应用'}
                </button>
              </div>
            </div>
          ))}

          {appliedChanges.length > 0 && (
            <div className="rounded border border-border bg-muted/20 p-2 text-xs space-y-1.5">
              <div className="flex items-center gap-1.5 font-medium">
                <RotateCcw className="h-3.5 w-3.5 text-primary" />
                AI 变更记录
              </div>
              {appliedChanges.slice(0, 8).map((change) => {
                const changeKey = change.id ?? change.proposalId;
                const reverting = revertingChangeIds.has(changeKey);
                return (
                  <div
                    key={changeKey}
                    className="flex items-center gap-2 rounded bg-background px-2 py-1.5"
                  >
                    <div className="min-w-0 flex-1">
                      <div className="truncate">{change.title || 'AI 简历优化'}</div>
                      <div className="text-[10px] text-muted-foreground">
                        {change.changedElementIds.length} 处修改 ·{' '}
                        {change.status === 'reverted' ? '已回退' : '已应用'}
                      </div>
                    </div>
                    {change.status !== 'reverted' && (
                      <button
                        className="inline-flex h-6 items-center gap-1 rounded border border-border px-1.5 hover:bg-accent disabled:opacity-50"
                        disabled={reverting}
                        onClick={() => void revertChange(change).catch(() => undefined)}
                      >
                        {reverting ? (
                          <Loader2 className="h-3 w-3 animate-spin" />
                        ) : (
                          <RotateCcw className="h-3 w-3" />
                        )}
                        回退
                      </button>
                    )}
                  </div>
                );
              })}
            </div>
          )}

          {error && (
            <div className="flex items-center gap-2 text-xs text-destructive">
              <span className="truncate">{error}</span>
              <button
                className="inline-flex items-center gap-1 hover:underline"
                onClick={retryLastMessage}
              >
                <RefreshCw className="w-3 h-3" />
                重试
              </button>
            </div>
          )}
        </div>

        <div className="h-12 shrink-0 px-3 border-t border-border flex items-center gap-2">
          <textarea
            value={draft}
            disabled={!resumeId || isSending}
            onChange={(event) => setDraft(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter' && !event.shiftKey) {
                event.preventDefault();
                submit();
              }
            }}
            placeholder={resumeId ? '输入 AI 指令...' : '保存简历后可用'}
            className="flex-1 h-8 resize-none rounded border border-border bg-muted/50 px-2 py-1 text-sm leading-5 focus:outline-none focus:ring-1 focus:ring-primary disabled:opacity-50"
          />
          <button
            className="w-8 h-8 inline-flex items-center justify-center rounded bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
            disabled={(!draft.trim() && !isSending) || !resumeId}
            onClick={isSending ? cancelSend : submit}
            title={isSending ? '取消' : '发送'}
          >
            {isSending ? <X className="w-4 h-4" /> : <Send className="w-4 h-4" />}
          </button>
        </div>
      </section>
    </div>
  );
};
