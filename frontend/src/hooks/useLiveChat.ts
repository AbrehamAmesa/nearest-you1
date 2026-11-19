import { useCallback, useEffect, useRef, useState } from 'react';
import { engagementApi } from '../api/index.ts';
import { useAuth } from '../context/AuthContext.tsx';
import type { ChatMessage } from '../types/nearestyou.ts';

function buildWebSocketUrl(token: string): string {
  const configuredBase = (import.meta.env.VITE_API_BASE_URL as string | undefined)?.trim();
  const httpBase =
    configuredBase && /^https?:\/\//i.test(configuredBase)
      ? configuredBase.replace(/\/+$/, '')
      : typeof window !== 'undefined'
        ? window.location.origin
        : 'http://localhost:3000';
  const wsBase = httpBase.replace(/^http/i, 'ws');
  return `${wsBase}/api/v1/ws/chat?token=${encodeURIComponent(token)}`;
}

function mergeMessages(existing: ChatMessage[], incoming: ChatMessage[]): ChatMessage[] {
  const byId = new Map<number, ChatMessage>();
  for (const m of existing) byId.set(m.id, m);
  for (const m of incoming) byId.set(m.id, m);
  return Array.from(byId.values()).sort(
    (a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
  );
}

export interface UseLiveChatOptions {
  threadKey: string | null | undefined;
  businessId?: number | null;
  listingId?: number | null;
  orderId?: number | null;
  bookingId?: number | null;
  recipientUid?: string | null;
  enabled?: boolean;
  onMessageReceived?: (msg: ChatMessage) => void;
}

export function useLiveChat({
  threadKey,
  businessId,
  listingId,
  orderId,
  bookingId,
  recipientUid,
  enabled = true,
  onMessageReceived,
}: UseLiveChatOptions) {
  const { dbUser, getAccessToken } = useAuth();
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [loading, setLoading] = useState(false);
  const [sending, setSending] = useState(false);
  const [connected, setConnected] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const wsRef = useRef<WebSocket | null>(null);
  const reconnectTimerRef = useRef<number | null>(null);
  const heartbeatTimerRef = useRef<number | null>(null);
  const attemptRef = useRef(0);
  const mountedRef = useRef(true);
  const activeThreadRef = useRef<string | null | undefined>(threadKey);
  const onMessageRef = useRef(onMessageReceived);

  activeThreadRef.current = threadKey;
  onMessageRef.current = onMessageReceived;

  const fetchThreadHistory = useCallback(async () => {
    if (!enabled || !threadKey || !dbUser) return;
    setLoading(true);
    try {
      const res = await engagementApi.getThreadMessages(threadKey);
      if (!mountedRef.current || activeThreadRef.current !== threadKey) return;
      const list: ChatMessage[] = Array.isArray(res.data?.messages) ? res.data.messages : [];
      setMessages(list);
      setError(null);
    } catch (err: any) {
      if (!mountedRef.current) return;
      const status = err?.response?.status;
      if (status !== 404) {
        setError(err?.response?.data?.error || 'Could not load conversation history.');
      }
    } finally {
      if (mountedRef.current) setLoading(false);
    }
  }, [enabled, threadKey, dbUser]);

  useEffect(() => {
    setMessages([]);
    setError(null);
    if (enabled && threadKey && dbUser) {
      fetchThreadHistory();
    }
  }, [enabled, threadKey, dbUser?.uid, fetchThreadHistory]);

  useEffect(() => {
    mountedRef.current = true;
    if (!enabled || !threadKey || !dbUser) {
      setConnected(false);
      return;
    }

    let cancelled = false;

    const cleanupTimers = () => {
      if (reconnectTimerRef.current !== null) {
        window.clearTimeout(reconnectTimerRef.current);
        reconnectTimerRef.current = null;
      }
      if (heartbeatTimerRef.current !== null) {
        window.clearInterval(heartbeatTimerRef.current);
        heartbeatTimerRef.current = null;
      }
    };

    const connect = async () => {
      if (cancelled || !mountedRef.current) return;
      const token = await getAccessToken();
      if (!token || cancelled || !mountedRef.current) return;

      try {
        const ws = new WebSocket(buildWebSocketUrl(token));
        wsRef.current = ws;

        ws.onopen = () => {
          if (cancelled || !mountedRef.current) {
            ws.close();
            return;
          }
          attemptRef.current = 0;
          setConnected(true);
          if (activeThreadRef.current) {
            ws.send(JSON.stringify({ type: 'join', threadKey: activeThreadRef.current }));
            fetchThreadHistory();
          }
          heartbeatTimerRef.current = window.setInterval(() => {
            if (ws.readyState === WebSocket.OPEN) {
              ws.send(JSON.stringify({ type: 'ping' }));
            }
          }, 25000);
        };

        ws.onmessage = (event) => {
          if (cancelled || !mountedRef.current) return;
          try {
            const payload = JSON.parse(event.data);
            if (payload.type === 'chat:message' && payload.message) {
              const incoming: ChatMessage = payload.message;
              const matchesThread =
                payload.threadKey === activeThreadRef.current ||
                incoming.threadKey === activeThreadRef.current;
              if (matchesThread) {
                setMessages((prev) => mergeMessages(prev, [incoming]));
                setSending(false);
                setError(null);
              }
              onMessageRef.current?.(incoming);
            } else if (payload.type === 'error' && payload.error) {
              setError(String(payload.error));
              setSending(false);
            }
          } catch {
            /* ignore malformed WS frames */
          }
        };

        ws.onclose = () => {
          cleanupTimers();
          if (wsRef.current === ws) wsRef.current = null;
          if (!cancelled && mountedRef.current) {
            setConnected(false);
            const delay = Math.min(12000, 1500 * Math.pow(2, attemptRef.current));
            attemptRef.current += 1;
            reconnectTimerRef.current = window.setTimeout(connect, delay);
          }
        };

        ws.onerror = () => {
          /* onclose handles reconnection */
        };
      } catch {
        setConnected(false);
      }
    };

    connect();

    return () => {
      cancelled = true;
      mountedRef.current = false;
      cleanupTimers();
      if (wsRef.current) {
        try {
          if (wsRef.current.readyState === WebSocket.OPEN && threadKey) {
            wsRef.current.send(JSON.stringify({ type: 'leave', threadKey }));
          }
          wsRef.current.close();
        } catch {
          /* ignore */
        }
        wsRef.current = null;
      }
      setConnected(false);
    };
  }, [enabled, threadKey, dbUser?.uid, getAccessToken, fetchThreadHistory]);

  const sendMessage = useCallback(
    async (rawBody: string): Promise<boolean> => {
      const body = rawBody.trim();
      if (!body || !threadKey || !dbUser) return false;

      setSending(true);
      setError(null);

      try {
        // Persist via REST endpoint and let LiveChatBroker push to both participants' WebSockets
        const res = await engagementApi.sendMessage({
          threadKey,
          businessId: businessId ?? null,
          listingId: listingId ?? null,
          orderId: orderId ?? null,
          bookingId: bookingId ?? null,
          recipientUid: recipientUid ?? null,
          body,
        });
        const saved: ChatMessage | undefined = res.data;
        if (saved && saved.id) {
          setMessages((prev) => mergeMessages(prev, [saved]));
          onMessageRef.current?.(saved);
        } else if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
          wsRef.current.send(
            JSON.stringify({
              type: 'chat:send',
              threadKey,
              businessId,
              listingId,
              orderId,
              bookingId,
              recipientUid,
              body,
            })
          );
        }
        return true;
      } catch (err: any) {
        setError(err?.response?.data?.error || 'Failed to send message. Please try again.');
        return false;
      } finally {
        if (mountedRef.current) setSending(false);
      }
    },
    [threadKey, dbUser, businessId, listingId, orderId, bookingId, recipientUid]
  );

  return {
    messages,
    loading,
    sending,
    connected,
    error,
    sendMessage,
    refresh: fetchThreadHistory,
  };
}

export function useLiveChatInboxListener(
  enabled: boolean,
  onIncomingMessage: (msg: ChatMessage) => void
) {
  const { dbUser, getAccessToken } = useAuth();
  const [connected, setConnected] = useState(false);
  const callbackRef = useRef(onIncomingMessage);
  callbackRef.current = onIncomingMessage;

  useEffect(() => {
    if (!enabled || !dbUser) {
      setConnected(false);
      return;
    }

    let cancelled = false;
    let ws: WebSocket | null = null;
    let reconnectTimer: number | null = null;
    let heartbeatTimer: number | null = null;
    let attempts = 0;

    const connect = async () => {
      if (cancelled) return;
      const token = await getAccessToken();
      if (!token || cancelled) return;
      try {
        ws = new WebSocket(buildWebSocketUrl(token));
        ws.onopen = () => {
          if (cancelled) {
            ws?.close();
            return;
          }
          attempts = 0;
          setConnected(true);
          heartbeatTimer = window.setInterval(() => {
            if (ws && ws.readyState === WebSocket.OPEN) {
              ws.send(JSON.stringify({ type: 'ping' }));
            }
          }, 25000);
        };
        ws.onmessage = (event) => {
          if (cancelled) return;
          try {
            const payload = JSON.parse(event.data);
            if (payload.type === 'chat:message' && payload.message) {
              callbackRef.current(payload.message as ChatMessage);
            }
          } catch {
            /* ignore */
          }
        };
        ws.onclose = () => {
          if (heartbeatTimer !== null) window.clearInterval(heartbeatTimer);
          setConnected(false);
          if (!cancelled) {
            const delay = Math.min(12000, 1500 * Math.pow(2, attempts));
            attempts += 1;
            reconnectTimer = window.setTimeout(connect, delay);
          }
        };
      } catch {
        setConnected(false);
      }
    };

    connect();

    return () => {
      cancelled = true;
      if (reconnectTimer !== null) window.clearTimeout(reconnectTimer);
      if (heartbeatTimer !== null) window.clearInterval(heartbeatTimer);
      try {
        ws?.close();
      } catch {
        /* ignore */
      }
      setConnected(false);
    };
  }, [enabled, dbUser?.uid, getAccessToken]);

  return { connected };
}
