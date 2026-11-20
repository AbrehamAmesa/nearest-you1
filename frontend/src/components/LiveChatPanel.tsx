import React, { useEffect, useRef, useState } from 'react';
import { MessageSquare, Send, ShieldAlert, Wifi, WifiOff, X } from 'lucide-react';
import { useAuth } from '../context/AuthContext.tsx';
import { useLiveChat } from '../hooks/useLiveChat.ts';
import type { ChatMessage, ServiceContractRecord } from '../types/nearestyou.ts';
import { formatLastSeenStatus } from '../utils/presence.ts';

interface LiveChatPanelProps {
  threadKey: string;
  businessId?: number | null;
  listingId?: number | null;
  orderId?: number | null;
  bookingId?: number | null;
  recipientUid?: string | null;
  title?: string;
  maskedTitle?: string;
  revealTitleOnMessage?: boolean;
  subtitle?: string;
  initialLastSeenAt?: string | null;
  initialActiveLastMinute?: boolean;
  placeholder?: string;
  compact?: boolean;
  onClose?: () => void;
  onMessageSent?: (text: string) => void;
  onMessageSentOrReceived?: (msg: ChatMessage) => void;
  onContractUpdated?: (contract: ServiceContractRecord) => void;
}

export const LiveChatPanel: React.FC<LiveChatPanelProps> = ({
  threadKey,
  businessId,
  listingId,
  orderId,
  bookingId,
  recipientUid,
  title = 'Live Chat',
  maskedTitle,
  revealTitleOnMessage = false,
  subtitle,
  initialLastSeenAt = null,
  initialActiveLastMinute = false,
  placeholder = 'Write a message to reply...',
  compact = false,
  onClose,
  onMessageSent,
  onMessageSentOrReceived,
  onContractUpdated,
}) => {
  const { dbUser, firebaseUser, openAuthModal } = useAuth();
  const [draft, setDraft] = useState('');
  const [nowTick, setNowTick] = useState(() => Date.now());
  const scrollRef = useRef<HTMLDivElement | null>(null);

  const isSelfRecipient = Boolean(
    recipientUid &&
      ((dbUser?.uid && recipientUid === dbUser.uid) ||
        (firebaseUser?.uid && recipientUid === firebaseUser.uid))
  );

  const { messages, partnerPresence, loading, sending, connected, error, sendMessage } = useLiveChat({
    threadKey,
    businessId,
    listingId,
    orderId,
    bookingId,
    recipientUid,
    enabled: Boolean(dbUser && threadKey && !isSelfRecipient),
    onMessageReceived: onMessageSentOrReceived,
    onContractUpdated,
  });

  useEffect(() => {
    const id = window.setInterval(() => setNowTick(Date.now()), 15000);
    return () => window.clearInterval(id);
  }, []);

  useEffect(() => {
    const el = scrollRef.current;
    if (el) {
      el.scrollTop = el.scrollHeight;
    }
  }, [messages.length, threadKey]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!draft.trim() || sending || isSelfRecipient) return;
    const text = draft;
    setDraft('');
    const ok = await sendMessage(text);
    if (!ok) {
      setDraft(text);
    } else {
      onMessageSent?.(text.trim());
    }
  };

  const displayHeaderTitle =
    revealTitleOnMessage && messages.length === 0 && maskedTitle ? maskedTitle : title;

  const effectiveLastSeen = partnerPresence?.lastSeenAt ?? initialLastSeenAt;
  const effectiveActiveLastMinute =
    partnerPresence !== null ? partnerPresence.isActiveLastMinute : initialActiveLastMinute;
  const presenceDisplay = formatLastSeenStatus(effectiveLastSeen, effectiveActiveLastMinute, nowTick);

  if (!dbUser) {
    return (
      <div className="w-full min-w-0 rounded-xl border border-slate-200 bg-slate-50 p-4 text-center sm:p-5">
        <MessageSquare className="mx-auto mb-2 h-8 w-8 text-[#176B52]" />
        <p className="text-sm font-bold text-[#172B3A]">Sign in to contact & start live chat</p>
        <p className="mt-1 text-xs text-slate-600">
          Direct messages and instant replies are synced to your account.
        </p>
        <button
          type="button"
          onClick={() => openAuthModal('signin')}
          className="mt-3 rounded-lg bg-[#176B52] px-4 py-2 text-xs font-bold text-white hover:bg-[#125541]"
        >
          Sign In / Sign Up
        </button>
      </div>
    );
  }

  if (isSelfRecipient) {
    return (
      <div className="w-full min-w-0 rounded-xl border border-slate-200 bg-slate-50 p-4 text-center sm:p-5">
        <ShieldAlert className="mx-auto mb-2 h-7 w-7 text-[#176B52]" />
        <p className="text-xs font-bold text-[#172B3A]">You created this advertisement</p>
        <p className="mt-1 text-[11px] text-slate-600">
          Sending messages to yourself is disabled. Client inquiries appear in your Messages inbox.
        </p>
      </div>
    );
  }

  return (
    <div className="flex w-full min-w-0 max-w-full flex-col overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
      {/* Header */}
      <div className="flex w-full min-w-0 items-center justify-between gap-2 border-b border-slate-200 bg-[#172B3A] px-3 py-2.5 text-white sm:px-3.5">
        <div className="min-w-0 flex-1">
          <div className="flex min-w-0 items-center gap-2">
            <MessageSquare className="h-4 w-4 shrink-0 text-emerald-300" />
            <h4 className="truncate text-xs font-bold sm:text-sm">{displayHeaderTitle}</h4>
          </div>
          <div className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[11px] text-slate-300">
            <span className="inline-flex items-center gap-1.5 font-medium">
              <span
                aria-hidden="true"
                className={`h-2 w-2 shrink-0 rounded-full ${
                  presenceDisplay.isActiveNow ? 'bg-emerald-400 animate-pulse' : 'bg-slate-400'
                }`}
              />
              <span className={presenceDisplay.isActiveNow ? 'text-emerald-200 font-semibold' : ''}>
                {presenceDisplay.label}
              </span>
            </span>
            {subtitle && (
              <>
                <span aria-hidden="true" className="text-slate-500">·</span>
                <span className="truncate">{subtitle}</span>
              </>
            )}
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-1.5">
          <span
            className={`inline-flex shrink-0 items-center gap-1 rounded-md px-2 py-0.5 text-[10px] font-bold ${
              connected
                ? 'bg-emerald-500/20 text-emerald-200'
                : 'bg-amber-500/20 text-amber-200'
            }`}
          >
            {connected ? <Wifi className="h-3 w-3" /> : <WifiOff className="h-3 w-3" />}
            {connected ? 'Live' : 'Connecting'}
          </span>
          {onClose && (
            <button
              type="button"
              onClick={onClose}
              aria-label="Close live chat"
              className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg text-slate-300 transition hover:bg-white/10 hover:text-white"
            >
              <X className="h-4 w-4" />
            </button>
          )}
        </div>
      </div>

      {/* Messages Feed */}
      <div
        ref={scrollRef}
        className={`w-full min-w-0 flex-1 space-y-2.5 overflow-x-hidden overflow-y-auto bg-slate-50 p-3 sm:p-3.5 ${
          compact ? 'h-52 sm:h-56' : 'h-64 sm:h-80'
        }`}
      >
        {loading && messages.length === 0 ? (
          <div className="flex h-full items-center justify-center text-xs text-slate-500">
            Loading conversation...
          </div>
        ) : messages.length === 0 ? (
          <div className="flex h-full flex-col items-center justify-center px-3 text-center">
            <MessageSquare className="mb-2 h-7 w-7 text-slate-300" />
            <p className="text-xs font-semibold text-slate-600">No messages yet</p>
            <p className="mt-0.5 text-[11px] text-slate-500">
              Write a message below to ask questions, agree on scope, or coordinate directly.
            </p>
          </div>
        ) : (
          messages.map((msg) => {
            const isMine = msg.senderUid === dbUser.uid;
            const roleLabel =
              msg.senderRole === 'PROVIDER'
                ? 'Provider'
                : msg.senderRole === 'ADMIN'
                  ? 'Admin'
                  : 'Customer';
            const timeStr = new Date(msg.createdAt).toLocaleTimeString([], {
              hour: '2-digit',
              minute: '2-digit',
            });

            return (
              <div
                key={msg.id}
                className={`flex w-full min-w-0 flex-col ${isMine ? 'items-end' : 'items-start'}`}
              >
                <div className="mb-0.5 flex max-w-full flex-wrap items-center gap-x-1.5 gap-y-0.5 text-[10px] text-slate-500">
                  <span className="truncate font-semibold text-slate-700">
                    {isMine ? 'You' : msg.senderName}
                  </span>
                  <span className="rounded bg-slate-200/80 px-1 py-0.2 font-semibold text-slate-600">
                    {roleLabel}
                  </span>
                  <span className="shrink-0">{timeStr}</span>
                </div>
                <div
                  className={`max-w-[88%] min-w-0 whitespace-pre-wrap break-words [overflow-wrap:anywhere] rounded-xl px-3 py-2 text-xs leading-relaxed shadow-xs sm:max-w-[85%] sm:px-3.5 ${
                    isMine
                      ? 'rounded-tr-sm bg-[#176B52] text-white'
                      : 'rounded-tl-sm border border-slate-200 bg-white text-slate-800'
                  }`}
                >
                  {msg.body}
                </div>
              </div>
            );
          })
        )}
      </div>

      {/* Error Notice */}
      {error && (
        <div className="border-t border-red-200 bg-red-50 px-3 py-1.5 text-[11px] font-medium text-red-700 break-words">
          {error}
        </div>
      )}

      {/* Composer */}
      <form
        onSubmit={handleSubmit}
        className="flex w-full min-w-0 items-center gap-2 border-t border-slate-200 bg-white p-2 sm:p-2.5"
      >
        <input
          type="text"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          placeholder={placeholder}
          disabled={sending}
          className="min-w-0 w-full flex-1 rounded-lg border border-slate-300 bg-slate-50 px-3 py-2 text-xs text-slate-900 placeholder:text-slate-400 focus:border-[#176B52] focus:bg-white focus:outline-none"
        />
        <button
          type="submit"
          disabled={sending || !draft.trim()}
          className="inline-flex shrink-0 items-center gap-1.5 rounded-lg bg-[#176B52] px-3 py-2 text-xs font-bold text-white transition hover:bg-[#125641] disabled:cursor-not-allowed disabled:opacity-50 sm:px-3.5"
        >
          <Send className="h-3.5 w-3.5" />
          <span>{sending ? 'Sending...' : 'Send'}</span>
        </button>
      </form>
    </div>
  );
};
