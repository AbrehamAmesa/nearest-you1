import React from 'react';
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
      className="fixed inset-0 z-[1250] flex items-end justify-center overflow-x-hidden bg-slate-900/60 p-2 backdrop-blur-xs sm:items-center sm:p-5"
      onClick={onClose}
    >
      <div
        className="relative flex max-h-[92dvh] w-full max-w-lg flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <LiveChatPanel
          threadKey={target.threadKey}
          businessId={target.businessId}
          listingId={target.listingId}
          orderId={target.orderId}
          bookingId={target.bookingId}
          recipientUid={target.recipientUid}
          title={target.title}
          subtitle={target.subtitle}
          onClose={onClose}
          onMessageSentOrReceived={onMessageReceived}
        />
      </div>
    </div>
  );
};
