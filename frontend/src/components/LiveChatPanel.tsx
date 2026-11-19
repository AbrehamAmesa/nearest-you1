import React, { useEffect, useRef, useState } from 'react';
import { MessageSquare, Send, Wifi, WifiOff } from 'lucide-react';
import { useAuth } from '../context/AuthContext.tsx';
import { useLiveChat } from '../hooks/useLiveChat.ts';
import type { ChatMessage } from '../types/nearestyou.ts';

interface LiveChatPanelProps {
  threadKey: string;
  businessId?: number | null;
  listingId?: number | null;
  orderId?: number | null;
  bookingId?: number | null;
  recipientUid?: string | null;
  title?: string;
  subtitle?: string;
  placeholder?: string;
  compact?: boolean;
  onMessageSentOrReceived?: (msg: ChatMessage) => void;
}

export const LiveChatPanel: React.FC<LiveChatPanelProps> = ({
  threadKey,
  businessId,
  listingId,
  orderId,
  bookingId,
  recipientUid,
  title = 'Live Chat',
  subtitle,
  placeholder = 'Write a message to reply...',
  compact = false,
  onMessageSentOrReceived,
}) => {
  const { dbUser, openAuthModal } = useAuth();
  const [draft, setDraft] = useState('');
  const scrollRef = useRef<HTMLDivElement | null>(null);

  const { messages, loading, sending, connected, error, sendMessage } = useLiveChat({
    threadKey,
    businessId,
    listingId,
    orderId,
    bookingId,
    recipientUid,
    enabled: Boolean(dbUser && threadKey),
    onMessageReceived: onMessageSentOrReceived,
  });

  useEffect(() => {
    const el = scrollRef.current;
    if (el) {
      el.scrollTop = el.scrollHeight;
    }
  }, [messages.length, threadKey]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!draft.trim() || sending) return;
    const text = draft;
    setDraft('');
    const ok = await sendMessage(text);
    if (!ok) {
      setDraft(text);
    }
  };

  if (!dbUser) {
    return (
      <div className="rounded-xl border border-slate-200 bg-slate-50 p-5 text-center">
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

  return (
    <div className="flex flex-col overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
      {/* Header */}
      <div className="flex items-center justify-between gap-2 border-b border-slate-200 bg-[#172B3A] px-3.5 py-2.5 text-white">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <MessageSquare className="h-4 w-4 shrink-0 text-emerald-300" />
            <h4 className="truncate text-sm font-bold">{title}</h4>
          </div>
          {subtitle && (
            <p className="mt-0.5 truncate text-[11px] text-slate-300">{subtitle}</p>
          )}
        </div>
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
      </div>

      {/* Messages Feed */}
      <div
        ref={scrollRef}
        className={`flex-1 space-y-2.5 overflow-y-auto bg-slate-50 p-3.5 ${
          compact ? 'h-56' : 'h-72 sm:h-80'
        }`}
      >
        {loading && messages.length === 0 ? (
          <div className="flex h-full items-center justify-center text-xs text-slate-500">
            Loading conversation...
          </div>
        ) : messages.length === 0 ? (
          <div className="flex h-full flex-col items-center justify-center px-4 text-center">
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
                className={`flex flex-col ${isMine ? 'items-end' : 'items-start'}`}
              >
                <div className="mb-0.5 flex items-center gap-1.5 text-[10px] text-slate-500">
                  <span className="font-semibold text-slate-700">
                    {isMine ? 'You' : msg.senderName}
                  </span>
                  <span className="rounded bg-slate-200/80 px-1 py-0.2 font-semibold text-slate-600">
                    {roleLabel}
                  </span>
                  <span>{timeStr}</span>
                </div>
                <div
                  className={`max-w-[85%] whitespace-pre-wrap break-words rounded-xl px-3.5 py-2 text-xs leading-relaxed shadow-xs ${
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
        <div className="border-t border-red-200 bg-red-50 px-3 py-1.5 text-[11px] font-medium text-red-700">
          {error}
        </div>
      )}

      {/* Composer */}
      <form
        onSubmit={handleSubmit}
        className="flex items-center gap-2 border-t border-slate-200 bg-white p-2.5"
      >
        <input
          type="text"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          placeholder={placeholder}
          disabled={sending}
          className="flex-1 rounded-lg border border-slate-300 bg-slate-50 px-3 py-2 text-xs text-slate-900 placeholder:text-slate-400 focus:border-[#176B52] focus:bg-white focus:outline-none"
        />
        <button
          type="submit"
          disabled={sending || !draft.trim()}
          className="inline-flex shrink-0 items-center gap-1.5 rounded-lg bg-[#176B52] px-3.5 py-2 text-xs font-bold text-white transition hover:bg-[#125541] disabled:cursor-not-allowed disabled:opacity-50"
        >
          <Send className="h-3.5 w-3.5" />
          <span>{sending ? 'Sending...' : 'Send'}</span>
        </button>
      </form>
    </div>
  );
};
