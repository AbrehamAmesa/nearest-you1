import React, { useState } from 'react';
import { ChevronDown, ChevronUp, FileText } from 'lucide-react';
import { LiveChatPanel } from './LiveChatPanel.tsx';
import { ContractOfferSection } from './ContractOfferSection.tsx';
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
  initialLastSeenAt?: string | null;
  initialActiveLastMinute?: boolean;
  enableContracts?: boolean;
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
  const [showContracts, setShowContracts] = useState(false);
  const [contractSignal, setContractSignal] = useState(0);

  if (!target) return null;

  const canShowContracts =
    Boolean(target.enableContracts) ||
    (!target.orderId &&
      (target.threadKey.startsWith('contact:') ||
        target.threadKey.startsWith('booking:') ||
        Boolean(target.bookingId)));

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
          initialLastSeenAt={target.initialLastSeenAt}
          initialActiveLastMinute={target.initialActiveLastMinute}
          onClose={onClose}
          onMessageSentOrReceived={onMessageReceived}
          onContractUpdated={() => setContractSignal((n) => n + 1)}
        />

        {canShowContracts && (
          <div className="border-t border-slate-200 bg-slate-50">
            <button
              type="button"
              onClick={() => setShowContracts((v) => !v)}
              className="flex w-full items-center justify-between px-3.5 py-2.5 text-left text-xs font-semibold text-[#172B3A] hover:bg-slate-100"
            >
              <span className="inline-flex items-center gap-1.5">
                <FileText className="h-3.5 w-3.5 text-[#176B52]" />
                <span>Contract Offers & Acceptance</span>
              </span>
              {showContracts ? (
                <ChevronUp className="h-4 w-4 text-slate-500" />
              ) : (
                <ChevronDown className="h-4 w-4 text-slate-500" />
              )}
            </button>
            {showContracts && (
              <div className="max-h-64 overflow-y-auto px-3 pb-3">
                <ContractOfferSection
                  threadKey={target.threadKey}
                  businessId={target.businessId}
                  listingId={target.listingId}
                  bookingId={target.bookingId}
                  recipientUid={target.recipientUid}
                  compact
                  refreshSignal={contractSignal}
                  onContractChanged={() => setContractSignal((n) => n + 1)}
                />
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
};
