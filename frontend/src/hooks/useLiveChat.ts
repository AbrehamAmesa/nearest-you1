import { useCallback, useEffect, useRef, useState } from 'react';
import { engagementApi } from '../api/index.ts';
import { useAuth } from '../context/AuthContext.tsx';
import type {
  BookingRecord,
  ChatMessage,
  DeliveryRecord,
  JobApplicationRecord,
  OrderRecord,
  PaymentTransactionRecord,
  ServiceContractRecord,
} from '../types/nearestyou.ts';

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

export interface PartnerPresenceInfo {
  uid: string | null;
  name: string | null;
  lastSeenAt: string | null;
  isActiveLastMinute: boolean;
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
  onContractUpdated?: (contract: ServiceContractRecord) => void;
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
  onContractUpdated,
}: UseLiveChatOptions) {
  const { dbUser, getAccessToken } = useAuth();
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [partnerPresence, setPartnerPresence] = useState<PartnerPresenceInfo | null>(null);
  const [loading, setLoading] = useState(false);
  const [sending, setSending] = useState(false);
  const [connected, setConnected] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const wsRef = useRef<WebSocket | null>(null);
  const reconnectTimerRef = useRef<number | null>(null);
  const heartbeatTimerRef = useRef<number | null>(null);
  const presencePollRef = useRef<number | null>(null);
  const attemptRef = useRef(0);
  const mountedRef = useRef(true);
  const activeThreadRef = useRef<string | null | undefined>(threadKey);
  const onMessageRef = useRef(onMessageReceived);
  const onContractRef = useRef(onContractUpdated);

  activeThreadRef.current = threadKey;
  onMessageRef.current = onMessageReceived;
  onContractRef.current = onContractUpdated;

  const fetchThreadHistory = useCallback(
    async (silent = false) => {
      if (!enabled || !threadKey || !dbUser) return;
      if (!silent) setLoading(true);
      try {
        const res = await engagementApi.getThreadMessages(threadKey);
        if (!mountedRef.current || activeThreadRef.current !== threadKey) return;
        const list: ChatMessage[] = Array.isArray(res.data?.messages) ? res.data.messages : [];
        setMessages(list);
        setPartnerPresence({
          uid: res.data?.otherPartyUid ?? null,
          name: res.data?.otherPartyName ?? null,
          lastSeenAt: res.data?.otherPartyLastSeenAt ?? null,
          isActiveLastMinute: Boolean(res.data?.otherPartyActiveLastMinute),
        });
        setError(null);
      } catch (err: any) {
        if (!mountedRef.current || silent) return;
        const status = err?.response?.status;
        if (status !== 404) {
          setError(err?.response?.data?.error || 'Could not load conversation history.');
        }
      } finally {
        if (mountedRef.current && !silent) setLoading(false);
      }
    },
    [enabled, threadKey, dbUser]
  );

  useEffect(() => {
    setMessages([]);
    setPartnerPresence(null);
    setError(null);
    if (enabled && threadKey && dbUser) {
      fetchThreadHistory(false);
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
      if (presencePollRef.current !== null) {
        window.clearInterval(presencePollRef.current);
        presencePollRef.current = null;
      }
    };

    presencePollRef.current = window.setInterval(() => {
      fetchThreadHistory(true);
    }, 25000);

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
            fetchThreadHistory(false);
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
                if (incoming.senderUid && incoming.senderUid !== dbUser.uid) {
                  setPartnerPresence((prev) => ({
                    uid: prev?.uid || incoming.senderUid,
                    name: prev?.name || incoming.senderName,
                    lastSeenAt: incoming.createdAt || new Date().toISOString(),
                    isActiveLastMinute: true,
                  }));
                }
                setSending(false);
                setError(null);
              }
              onMessageRef.current?.(incoming);
            } else if (payload.type === 'contract:updated' && payload.contract) {
              const contract = payload.contract as ServiceContractRecord;
              if (
                !payload.threadKey ||
                payload.threadKey === activeThreadRef.current ||
                contract.threadKey === activeThreadRef.current
              ) {
                onContractRef.current?.(contract);
              }
            } else if (payload.type === 'error' && payload.error) {
              setError(String(payload.error));
              setSending(false);
            }
          } catch {
            /* ignore malformed WS frames */
          }
        };

        ws.onclose = () => {
          if (heartbeatTimerRef.current !== null) {
            window.clearInterval(heartbeatTimerRef.current);
            heartbeatTimerRef.current = null;
          }
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

  const sendVoiceMessage = useCallback(
    async (audioDataUrl: string, durationSeconds: number): Promise<boolean> => {
      if (!audioDataUrl || !threadKey || !dbUser) return false;
      const safeDuration = Math.max(1, Math.min(180, Math.round(durationSeconds || 1)));
      const mins = Math.floor(safeDuration / 60);
      const secs = safeDuration % 60;
      const fallbackBody = `Voice message (${mins}:${secs < 10 ? '0' : ''}${secs})`;

      setSending(true);
      setError(null);

      try {
        const res = await engagementApi.sendMessage({
          threadKey,
          businessId: businessId ?? null,
          listingId: listingId ?? null,
          orderId: orderId ?? null,
          bookingId: bookingId ?? null,
          recipientUid: recipientUid ?? null,
          messageType: 'VOICE',
          body: fallbackBody,
          audioDataUrl,
          audioDurationSeconds: safeDuration,
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
              messageType: 'VOICE',
              body: fallbackBody,
              audioDataUrl,
              audioDurationSeconds: safeDuration,
            })
          );
        }
        return true;
      } catch (err: any) {
        setError(err?.response?.data?.error || 'Failed to send voice message. Please try again.');
        return false;
      } finally {
        if (mountedRef.current) setSending(false);
      }
    },
    [threadKey, dbUser, businessId, listingId, orderId, bookingId, recipientUid]
  );

  return {
    messages,
    partnerPresence,
    loading,
    sending,
    connected,
    error,
    sendMessage,
    sendVoiceMessage,
    refresh: () => fetchThreadHistory(false),
  };
}

export interface IncomingMessageMeta {
  threadKey?: string | null;
  ownerUid?: string | null;
}

export interface ContractUpdatedWsEvent {
  type: 'contract:updated';
  threadKey?: string | null;
  actorUid?: string | null;
  contract: ServiceContractRecord;
}

export interface OrderUpdatedWsEvent {
  type: 'order:updated';
  action?: string;
  actorUid?: string | null;
  threadKey?: string | null;
  businessId?: number;
  businessName?: string;
  ownerUid?: string | null;
  customerUid?: string | null;
  order: OrderRecord;
}

export interface BookingUpdatedWsEvent {
  type: 'booking:updated';
  action?: string;
  actorUid?: string | null;
  threadKey?: string | null;
  businessId?: number;
  businessName?: string;
  listingTitle?: string;
  ownerUid?: string | null;
  customerUid?: string | null;
  booking: BookingRecord;
}

export interface ApplicationUpdatedWsEvent {
  type: 'application:updated';
  action?: string;
  actorUid?: string | null;
  businessId?: number;
  businessName?: string;
  listingTitle?: string;
  ownerUid?: string | null;
  applicantUid?: string | null;
  application: JobApplicationRecord;
}

export interface DeliveryUpdatedWsEvent {
  type: 'delivery:updated';
  action?: string;
  actorUid?: string | null;
  delivery: Partial<DeliveryRecord> & { id: number; trackingCode: string; status: string };
}

export interface PaymentSettledWsEvent {
  type: 'payment:settled';
  actorUid?: string | null;
  ownerUid?: string | null;
  customerUid?: string | null;
  providerUid?: string | null;
  payment: PaymentTransactionRecord;
}

export interface InboxListenerHandlers {
  onIncomingMessage?: (msg: ChatMessage, meta?: IncomingMessageMeta) => void;
  onContractUpdated?: (contract: ServiceContractRecord, event?: ContractUpdatedWsEvent) => void;
  onOrderUpdated?: (event: OrderUpdatedWsEvent) => void;
  onBookingUpdated?: (event: BookingUpdatedWsEvent) => void;
  onApplicationUpdated?: (event: ApplicationUpdatedWsEvent) => void;
  onDeliveryUpdated?: (event: DeliveryUpdatedWsEvent) => void;
  onPaymentSettled?: (event: PaymentSettledWsEvent) => void;
}

export function useLiveChatInboxListener(
  enabled: boolean,
  handlers: InboxListenerHandlers
) {
  const { dbUser, getAccessToken } = useAuth();
  const [connected, setConnected] = useState(false);
  const handlersRef = useRef(handlers);
  handlersRef.current = handlers;

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
              handlersRef.current.onIncomingMessage?.(payload.message as ChatMessage, {
                threadKey: payload.threadKey ?? null,
                ownerUid: payload.ownerUid ?? null,
              });
            } else if (payload.type === 'contract:updated' && payload.contract) {
              handlersRef.current.onContractUpdated?.(
                payload.contract as ServiceContractRecord,
                payload as ContractUpdatedWsEvent
              );
            } else if (payload.type === 'order:updated' && payload.order) {
              handlersRef.current.onOrderUpdated?.(payload as OrderUpdatedWsEvent);
            } else if (payload.type === 'booking:updated' && payload.booking) {
              handlersRef.current.onBookingUpdated?.(payload as BookingUpdatedWsEvent);
            } else if (payload.type === 'application:updated' && payload.application) {
              handlersRef.current.onApplicationUpdated?.(payload as ApplicationUpdatedWsEvent);
            } else if (payload.type === 'delivery:updated' && payload.delivery) {
              handlersRef.current.onDeliveryUpdated?.(payload as DeliveryUpdatedWsEvent);
            } else if (payload.type === 'payment:settled' && payload.payment) {
              handlersRef.current.onPaymentSettled?.(payload as PaymentSettledWsEvent);
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
