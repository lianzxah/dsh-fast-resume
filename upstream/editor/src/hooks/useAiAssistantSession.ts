import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type {
  AiAppliedChange,
  AiEditProposal,
  AiModelConfigResponse,
  AiModelProfile,
  AiModelProfileInput,
  AiModelRuntimeSnapshot,
} from '@resume-editor/shared';
import { aiApi, type AiSessionDTO } from '@/lib/api';
import {
  canAutoApplyProposal,
  canRevertAiChange,
  commitPreparedAiChangeRevert,
  commitPreparedAiEditProposal,
  collectEditorContext,
  executeViewCommand,
  prepareAiChangeRevert,
  prepareAiEditProposal,
} from '@/lib/editor-ai-bridge';
import { useEditorStore } from '@/store';

export interface AiChatMessage {
  id: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  thinking?: {
    label: string;
    content: string;
    status: 'streaming' | 'complete';
  };
}

export interface AiPendingProposal {
  proposal: AiEditProposal;
  model?: AiModelRuntimeSnapshot;
  blockedReason?: string;
}

function createMessage(role: AiChatMessage['role'], content: string, id?: string): AiChatMessage {
  return {
    id: id ?? `${role}-${Date.now()}-${Math.random().toString(36).slice(2)}`,
    role,
    content,
  };
}

function roleFromServer(role: string): AiChatMessage['role'] {
  return role === 'user' || role === 'assistant' || role === 'system' ? role : 'assistant';
}

function appendMessageDelta(
  messages: AiChatMessage[],
  messageId: string,
  delta: string
): AiChatMessage[] {
  return updateAssistantMessage(messages, messageId, (message) => ({
    ...message,
    content: message.content + delta,
  }));
}

function updateAssistantMessage(
  messages: AiChatMessage[],
  messageId: string,
  update: (message: AiChatMessage) => AiChatMessage
): AiChatMessage[] {
  const index = messages.findIndex((message) => message.id === messageId);
  if (index === -1) return [...messages, update(createMessage('assistant', '', messageId))];
  return messages.map((message, messageIndex) =>
    messageIndex === index ? update(message) : message
  );
}

function replaceAppliedChange(
  changes: AiAppliedChange[],
  next: AiAppliedChange
): AiAppliedChange[] {
  return [next, ...changes.filter((change) => change.proposalId !== next.proposalId)];
}

export function useAiAssistantSession() {
  const resumeId = useEditorStore((state) => state.resumeId);
  const resumeIdRef = useRef(resumeId);
  resumeIdRef.current = resumeId;
  const [sessions, setSessions] = useState<AiSessionDTO[]>([]);
  const [activeSessionId, setActiveSessionIdState] = useState<string | null>(null);
  const [messages, setMessages] = useState<AiChatMessage[]>([]);
  const [pendingProposals, setPendingProposals] = useState<AiPendingProposal[]>([]);
  const [appliedChanges, setAppliedChanges] = useState<AiAppliedChange[]>([]);
  const [config, setConfig] = useState<AiModelConfigResponse | null>(null);
  const [activeModelProfileId, setActiveModelProfileId] = useState<string | undefined>();
  const [isSending, setIsSending] = useState(false);
  const [isConfigSaving, setIsConfigSaving] = useState(false);
  const [applyingProposalIds, setApplyingProposalIds] = useState<Set<string>>(() => new Set());
  const [revertingChangeIds, setRevertingChangeIds] = useState<Set<string>>(() => new Set());
  const [deletingSessionIds, setDeletingSessionIds] = useState<Set<string>>(() => new Set());
  const [error, setError] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const sendingRef = useRef(false);
  const activeRequestIdRef = useRef<string | null>(null);
  const sendingSessionRef = useRef<string | null>(null);
  const lastUserMessageRef = useRef<string | null>(null);
  const thinkingBufferRef = useRef<{ messageId: string; text: string }>({
    messageId: '',
    text: '',
  });
  const thinkingRafRef = useRef<number | null>(null);
  const activeThinkingMessageIdRef = useRef<string | null>(null);
  const applyingProposalIdsRef = useRef(new Set<string>());
  const revertingChangeIdsRef = useRef(new Set<string>());
  const deletingSessionIdsRef = useRef(new Set<string>());

  const activeSession = useMemo(
    () => sessions.find((session) => session.id === activeSessionId) ?? null,
    [activeSessionId, sessions]
  );

  const activeModel = useMemo(
    () =>
      config?.profiles.find((profile) => profile.id === activeModelProfileId) ??
      config?.profiles[0] ??
      null,
    [activeModelProfileId, config]
  );

  const flushThinking = useCallback(() => {
    thinkingRafRef.current = null;
    const { messageId, text } = thinkingBufferRef.current;
    if (!messageId || !text) return;
    thinkingBufferRef.current = { messageId: '', text: '' };
    setMessages((current) =>
      updateAssistantMessage(current, messageId, (message) => ({
        ...message,
        thinking: {
          label: message.thinking?.label || '正在深度分析',
          content: (message.thinking?.content ?? '') + text,
          status: message.thinking?.status ?? 'streaming',
        },
      }))
    );
  }, []);

  const queueThinkingDelta = useCallback(
    (messageId: string, delta: string) => {
      if (thinkingBufferRef.current.messageId !== messageId) {
        flushThinking();
        thinkingBufferRef.current = { messageId, text: '' };
      }
      thinkingBufferRef.current.text += delta;
      if (thinkingRafRef.current === null) {
        thinkingRafRef.current = requestAnimationFrame(flushThinking);
      }
    },
    [flushThinking]
  );

  useEffect(
    () => () => {
      if (thinkingRafRef.current !== null) cancelAnimationFrame(thinkingRafRef.current);
    },
    []
  );

  const refreshConfig = useCallback(async () => {
    const next = await aiApi.config();
    setConfig(next);
    setActiveModelProfileId((current) =>
      current && next.profiles.some((profile) => profile.id === current)
        ? current
        : (next.defaultProfileId ?? next.profiles[0]?.id)
    );
    return next;
  }, []);

  useEffect(() => {
    void refreshConfig().catch((e: any) => setError(e?.message || 'AI 配置加载失败'));
  }, [refreshConfig]);

  const setActiveSessionId = useCallback((id: string | null) => {
    if (sendingRef.current) return;
    setActiveSessionIdState(id);
    setPendingProposals([]);
    setMessages([]);
    setAppliedChanges([]);
    thinkingBufferRef.current = { messageId: '', text: '' };
    activeThinkingMessageIdRef.current = null;
  }, []);

  const ensureSession = useCallback(
    async (isCurrentRequest: () => boolean) => {
      if (!resumeId) throw new Error('当前简历尚未保存，无法使用 AI 助手');
      if (activeSession?.resumeId === resumeId) return activeSession.id;

      const expectedResumeId = resumeId;
      const session = await aiApi.createSession({ resumeId, title: 'AI 简历优化' });
      if (!isCurrentRequest() || resumeIdRef.current !== expectedResumeId) return null;
      setSessions((current) => [session, ...current]);
      setActiveSessionIdState(session.id);
      return session.id;
    },
    [activeSession, resumeId]
  );

  useEffect(() => {
    abortRef.current?.abort();
    abortRef.current = null;
    activeRequestIdRef.current = null;
    sendingRef.current = false;
    sendingSessionRef.current = null;
    setIsSending(false);
    thinkingBufferRef.current = { messageId: '', text: '' };
    activeThinkingMessageIdRef.current = null;
    setSessions([]);
    setActiveSessionIdState(null);
    setMessages([]);
    setPendingProposals([]);
    setAppliedChanges([]);
    if (!resumeId) return;
    let cancelled = false;
    aiApi
      .listSessions(resumeId)
      .then((list) => {
        if (cancelled) return;
        setSessions(list);
        setActiveSessionIdState((current) =>
          current && list.some((session) => session.id === current)
            ? current
            : (list[0]?.id ?? null)
        );
      })
      .catch(() => {
        if (!cancelled) setSessions([]);
      });
    return () => {
      cancelled = true;
    };
  }, [resumeId]);

  useEffect(() => {
    if (!activeSessionId || sendingSessionRef.current === activeSessionId) return;
    let cancelled = false;
    Promise.all([
      aiApi.messages(activeSessionId),
      aiApi.changes(activeSessionId),
      aiApi.proposals(activeSessionId),
    ])
      .then(([messageList, changeList, proposalList]) => {
        if (cancelled) return;
        setMessages(
          messageList.map((message) => ({
            id: message.id,
            role: roleFromServer(message.role),
            content: message.content,
            thinking:
              message.thinkingLabel || message.thinkingContent
                ? {
                    label: message.thinkingLabel || '深度分析',
                    content: message.thinkingContent || '',
                    status: 'complete',
                  }
                : undefined,
          }))
        );
        setAppliedChanges(
          changeList.map((change) =>
            change.status === 'reverted' && canRevertAiChange({ ...change, status: 'applied' }).ok
              ? { ...change, status: 'applied' }
              : change
          )
        );
        setPendingProposals(
          proposalList.map((item) => ({
            proposal: item.proposal,
            blockedReason: canAutoApplyProposal(item.proposal).message,
          }))
        );
      })
      .catch((e: any) => {
        if (!cancelled) setError(e?.message || 'AI 会话加载失败');
      });
    return () => {
      cancelled = true;
    };
  }, [activeSessionId]);

  const startNewSession = useCallback(() => {
    setActiveSessionId(null);
  }, [setActiveSessionId]);

  const deleteSession = useCallback(
    async (sessionId: string) => {
      if (deletingSessionIdsRef.current.has(sessionId)) return;
      deletingSessionIdsRef.current.add(sessionId);
      setDeletingSessionIds((current) => new Set(current).add(sessionId));
      try {
        if (activeSessionId === sessionId) abortRef.current?.abort();
        await aiApi.deleteSession(sessionId);
        setSessions((current) => current.filter((session) => session.id !== sessionId));
        if (activeSessionId === sessionId) setActiveSessionId(null);
      } catch (e: any) {
        setError(e?.message || '删除 AI 会话失败');
        throw e;
      } finally {
        deletingSessionIdsRef.current.delete(sessionId);
        setDeletingSessionIds((current) => {
          const next = new Set(current);
          next.delete(sessionId);
          return next;
        });
      }
    },
    [activeSessionId, setActiveSessionId]
  );

  const persistAppliedProposal = useCallback(
    async (
      sessionId: string,
      proposal: AiEditProposal,
      model: AiModelRuntimeSnapshot | undefined,
      result: ReturnType<typeof prepareAiEditProposal>,
      attemptId: string
    ) => {
      if (!resumeId) throw new Error('当前简历尚未保存');
      return aiApi.applyProposal(sessionId, proposal.id, {
        attemptId,
        resumeId,
        title: proposal.title,
        commandTypes: result.commandTypes,
        changedElementIds: result.changedElementIds,
        beforeHash: result.beforeHash,
        afterHash: result.afterHash,
        beforeDocument: result.beforeDocument,
        afterDocument: result.afterDocument,
        textHeightAdjustments: result.textHeightAdjustments,
        model,
      });
    },
    [resumeId]
  );

  const applyProposal = useCallback(
    async (
      proposal: AiEditProposal,
      model?: AiModelRuntimeSnapshot,
      explicitSessionId?: string
    ) => {
      const sessionId = explicitSessionId ?? activeSessionId;
      if (!sessionId) throw new Error('缺少 AI 会话，无法应用提案');
      if (applyingProposalIdsRef.current.has(proposal.id)) return;

      applyingProposalIdsRef.current.add(proposal.id);
      setApplyingProposalIds((current) => new Set(current).add(proposal.id));
      try {
        const result = prepareAiEditProposal(proposal);
        const attemptId = crypto.randomUUID();
        const response = await persistAppliedProposal(
          sessionId,
          proposal,
          model,
          result,
          attemptId
        );
        try {
          commitPreparedAiEditProposal(proposal, result);
        } catch (commitError) {
          if (response.change.id && response.change.attemptId === attemptId) {
            await aiApi
              .cancelAppliedProposal(sessionId, response.change.id, attemptId)
              .catch(() => undefined);
          }
          throw commitError;
        }
        setPendingProposals((current) =>
          current.filter((item) => item.proposal.id !== proposal.id)
        );
        setAppliedChanges((current) => replaceAppliedChange(current, response.change));
        setMessages((current) => [
          ...current,
          createMessage(
            'system',
            `已应用 ${result.changedElementIds.length} 处 AI 修改，可在变更记录中精准回退。`
          ),
        ]);

        return result;
      } catch (e: any) {
        setError(e?.message || '应用 AI 提案失败');
        throw e;
      } finally {
        applyingProposalIdsRef.current.delete(proposal.id);
        setApplyingProposalIds((current) => {
          const next = new Set(current);
          next.delete(proposal.id);
          return next;
        });
      }
    },
    [activeSessionId, persistAppliedProposal, resumeId]
  );

  const declineProposal = useCallback(
    async (proposalId: string) => {
      if (activeSessionId) await aiApi.declineProposal(activeSessionId, proposalId);
      setPendingProposals((current) => current.filter((item) => item.proposal.id !== proposalId));
      setMessages((current) => [...current, createMessage('system', '已拒绝该 AI 提案。')]);
    },
    [activeSessionId]
  );

  const revertChange = useCallback(
    async (change: AiAppliedChange) => {
      const changeKey = change.id ?? change.proposalId;
      if (revertingChangeIdsRef.current.has(changeKey)) return;
      const validation = canRevertAiChange(change);
      if (!validation.ok) {
        const message = validation.message || '该 AI 修改当前不可回退';
        setError(message);
        throw new Error(message);
      }

      revertingChangeIdsRef.current.add(changeKey);
      setRevertingChangeIds((current) => new Set(current).add(changeKey));
      try {
        const prepared = prepareAiChangeRevert(change);
        if (!activeSessionId || !change.id) throw new Error('AI 回退记录不完整');
        const attemptId = crypto.randomUUID();
        const response = await aiApi.revertChange(activeSessionId, change.id, attemptId);
        try {
          commitPreparedAiChangeRevert(change, prepared);
        } catch (commitError) {
          if (response.revertAttemptId === attemptId) {
            await aiApi.restoreChange(activeSessionId, change.id, attemptId).catch(() => undefined);
          }
          throw commitError;
        }
        const revertedAt = new Date().toISOString();
        setAppliedChanges((current) =>
          current.map((item) =>
            item.proposalId === change.proposalId
              ? { ...item, status: 'reverted', revertedAt }
              : item
          )
        );
        setMessages((current) => [
          ...current,
          createMessage('system', `已回退 AI 修改：${change.title || change.proposalId}`),
        ]);
      } catch (e: any) {
        setError(e?.message || '回退 AI 修改失败');
        throw e;
      } finally {
        revertingChangeIdsRef.current.delete(changeKey);
        setRevertingChangeIds((current) => {
          const next = new Set(current);
          next.delete(changeKey);
          return next;
        });
      }
    },
    [activeSessionId]
  );

  const sendMessage = useCallback(
    async (content: string) => {
      const trimmed = content.trim();
      if (!trimmed || sendingRef.current) return;

      sendingRef.current = true;
      const requestId = crypto.randomUUID();
      activeRequestIdRef.current = requestId;
      const isCurrentRequest = () => activeRequestIdRef.current === requestId;
      setError(null);
      lastUserMessageRef.current = trimmed;
      setIsSending(true);

      const controller = new AbortController();
      abortRef.current = controller;
      const assistantMessageId = `assistant-stream-${crypto.randomUUID()}`;
      const proposals: AiEditProposal[] = [];
      let streamError = '';

      try {
        const sessionId = await ensureSession(isCurrentRequest);
        if (!sessionId || !isCurrentRequest()) return;
        sendingSessionRef.current = sessionId;
        setMessages((current) => [...current, createMessage('user', trimmed)]);
        const context = collectEditorContext();
        if (!context.resumeId) throw new Error('当前简历尚未关联保存记录');

        const response = await aiApi.streamMessage(
          sessionId,
          {
            resumeId: context.resumeId,
            message: trimmed,
            context,
            modelProfileId: activeModelProfileId,
          },
          async (frame) => {
            if (frame.type !== 'event' || !isCurrentRequest()) return;
            const event = frame.event;
            if (event.type === 'thinking.started') {
              activeThinkingMessageIdRef.current = assistantMessageId;
              setMessages((current) =>
                updateAssistantMessage(current, assistantMessageId, (message) => ({
                  ...message,
                  thinking: {
                    label: event.label,
                    content: message.thinking?.content ?? '',
                    status: 'streaming',
                  },
                }))
              );
            }
            if (event.type === 'thinking.delta') queueThinkingDelta(assistantMessageId, event.text);
            if (event.type === 'thinking.done') {
              flushThinking();
              setMessages((current) =>
                updateAssistantMessage(current, assistantMessageId, (message) => ({
                  ...message,
                  thinking: message.thinking
                    ? { ...message.thinking, status: 'complete' }
                    : undefined,
                }))
              );
            }
            if (event.type === 'message.delta') {
              setMessages((current) => appendMessageDelta(current, assistantMessageId, event.text));
            }
            if (event.type === 'question') {
              setMessages((current) =>
                appendMessageDelta(current, assistantMessageId, event.question)
              );
            }
            if (event.type === 'view.command') executeViewCommand(event.command);
            if (event.type === 'edit.proposal') proposals.push(event.proposal);
            if (event.type === 'error') {
              streamError = event.message;
              setError(event.message);
            }
          },
          controller.signal
        );

        if (!isCurrentRequest()) return;

        for (const proposal of proposals) {
          const autoCheck = canAutoApplyProposal(proposal);
          if (autoCheck.ok) {
            await applyProposal(proposal, response.model, sessionId);
          } else {
            setPendingProposals((current) => [
              ...current.filter((item) => item.proposal.id !== proposal.id),
              { proposal, model: response.model, blockedReason: autoCheck.message },
            ]);
          }
        }

        if (response.status === 'failed') {
          setMessages((current) =>
            updateAssistantMessage(current, assistantMessageId, (message) => ({
              ...message,
              content: message.content || streamError || 'AI 请求失败',
            }))
          );
        }
      } catch (e: any) {
        if (!isCurrentRequest()) return;
        const message = e?.name === 'AbortError' ? 'AI 请求已取消' : e?.message || 'AI 请求失败';
        setError(message);
        setMessages((current) => [...current, createMessage('system', message)]);
      } finally {
        if (isCurrentRequest()) {
          flushThinking();
          if (activeThinkingMessageIdRef.current === assistantMessageId) {
            setMessages((current) =>
              updateAssistantMessage(current, assistantMessageId, (message) => ({
                ...message,
                thinking: message.thinking
                  ? { ...message.thinking, status: 'complete' }
                  : undefined,
              }))
            );
            activeThinkingMessageIdRef.current = null;
          }
          abortRef.current = null;
          sendingSessionRef.current = null;
          activeRequestIdRef.current = null;
          sendingRef.current = false;
          setIsSending(false);
        }
      }
    },
    [activeModelProfileId, applyProposal, ensureSession, flushThinking, queueThinkingDelta]
  );

  const cancelSend = useCallback(() => abortRef.current?.abort(), []);

  const retryLastMessage = useCallback(() => {
    if (lastUserMessageRef.current) void sendMessage(lastUserMessageRef.current);
  }, [sendMessage]);

  const saveModelProfile = useCallback(
    async (payload: AiModelProfileInput) => {
      setIsConfigSaving(true);
      try {
        const profile = await aiApi.saveDefaultProfile(payload);
        const next = await refreshConfig();
        setActiveModelProfileId(profile.id || next.defaultProfileId);
        setMessages((current) => [
          ...current,
          createMessage('system', `已切换模型：${profile.model}`),
        ]);
      } finally {
        setIsConfigSaving(false);
      }
    },
    [refreshConfig]
  );

  const selectModelProfile = useCallback(
    async (profile: AiModelProfile) => {
      setActiveModelProfileId(profile.id);
      await aiApi.setDefaultProfile(profile.id);
      const next = await refreshConfig();
      setActiveModelProfileId(next.defaultProfileId ?? profile.id);
    },
    [refreshConfig]
  );

  return {
    activeSession,
    sessions,
    messages,
    pendingProposals,
    appliedChanges,
    config,
    activeModel,
    activeModelProfileId,
    isSending,
    isConfigSaving,
    applyingProposalIds,
    revertingChangeIds,
    deletingSessionIds,
    error,
    sendMessage,
    cancelSend,
    retryLastMessage,
    applyProposal,
    declineProposal,
    revertChange,
    deleteSession,
    saveModelProfile,
    selectModelProfile,
    setActiveSessionId,
    startNewSession,
  };
}
