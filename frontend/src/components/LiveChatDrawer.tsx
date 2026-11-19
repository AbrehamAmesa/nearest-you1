import React from 'react';
import { X } from 'lucide-react';
import { LiveChatPanel } from './LiveChatPanel.tsx';
import type { ChatMessage } from '../types/nearestyou.ts';

export interface ActiveChatTarget {
  threadKey: string;
  title: string;
  subtitle?: string;
  businessId?: number | null;
  listingId?: number | null;
  orderId?: number | null;
  bookingId?: number | null;
  recipientUid?: string | null;
}

interface LiveChatDrawerProps {
  target: ActiveChatTarget | null;
  onClose: () => void;
  onMessageReceived?: (msg: ChatMessage) => void;
}

export const LiveChatDrawer: React.FC<LiveChatDrawerProps> = ({
  target,
  onClose,
  onMessageReceived,
}) => {
  if (!target) return null;

  return (
    <div
      className="fixed inset-0 z-[1250] flex items-center justify-center bg-slate-900/60 p-3 backdrop-blur-xs sm:p-5"
      onClick={onClose}
    >
      <div
        className="relative w-full max-w-lg overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <button
          type="button"
          onClick={onClose}
          aria-label="Close live chat"
          className="absolute right-3 top-2.5 z-10 rounded-lg p-1.5 text-slate-300 transition hover:bg-white/10 hover:text-white"
        >
          <X className="h-4 w-4" />
        </button>
        <LiveChatPanel
          threadKey={target.threadKey}
          businessId={target.businessId}
          listingId={target.listingId}
          orderId={target.orderId}
          bookingId={target.bookingId}
          recipientUid={target.recipientUid}
          title={target.title}
          subtitle={target.subtitle}
          onMessageSentOrReceived={onMessageReceived}
        />
      </div>
    </div>
  );
};
