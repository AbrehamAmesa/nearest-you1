import React from 'react';
import {
  ArrowRight,
  Bell,
  CheckCheck,
  MessageSquare,
} from 'lucide-react';
import type { AppSection } from './TopBar.tsx';

export type NotificationKind = 'message' | 'offer' | 'success' | 'error';

export interface AppNotification {
  id: string;
  kind: NotificationKind;
  title: string;
  message: string;
  timestamp: string;
  read: boolean;
  actionLabel?: string;
  actionTarget?: AppSection;
  onAction?: () => void;
}

interface NotificationCenterProps {
  notifications: AppNotification[];
  onMarkAsRead: (id: string) => void;
  onMarkAllRead: () => void;
  onExecuteAction: (item: AppNotification) => void;
  onOpenInbox?: () => void;
}

export const NotificationCenter: React.FC<NotificationCenterProps> = ({
  notifications,
  onMarkAsRead,
  onMarkAllRead,
  onExecuteAction,
  onOpenInbox,
}) => {
  const unread = notifications.filter((n) => !n.read);
  if (unread.length === 0) return null;

  const visibleUnread = unread.slice(-2).reverse();
  const hiddenCount = Math.max(0, unread.length - visibleUnread.length);

  return (
    <div
      aria-live="polite"
      className="pointer-events-none fixed inset-x-3 bottom-4 z-[1300] flex flex-col gap-2.5 sm:inset-x-auto sm:bottom-5 sm:right-5 sm:w-[400px]"
    >
      {hiddenCount > 0 && (
        <div className="pointer-events-auto flex items-center justify-between gap-2 rounded-xl border border-[#172B3A]/20 bg-[#172B3A] px-3.5 py-2 text-xs text-white shadow-lg">
          <span className="inline-flex items-center gap-2 font-semibold">
            <Bell className="h-3.5 w-3.5 text-[#F4A62A]" />
            <span>
              +{hiddenCount} more unread {hiddenCount === 1 ? 'notification' : 'notifications'}
            </span>
          </span>
          <div className="flex items-center gap-2 shrink-0">
            {onOpenInbox && (
              <button
                type="button"
                onClick={onOpenInbox}
                className="rounded-md bg-white/15 px-2 py-1 text-[11px] font-semibold text-white hover:bg-white/25"
              >
                View All
              </button>
            )}
            <button
              type="button"
              onClick={onMarkAllRead}
              className="rounded-md bg-[#176B52] px-2 py-1 text-[11px] font-semibold text-white hover:bg-[#125641]"
            >
              Mark all read
            </button>
          </div>
        </div>
      )}

      {visibleUnread.map((item) => {
        const isMessage = item.kind === 'message';
        const isOffer = item.kind === 'offer';
        const isError = item.kind === 'error';

        const headerBg = isMessage
          ? 'bg-[#176B52] text-white'
          : isOffer
            ? 'bg-[#172B3A] text-white'
            : isError
              ? 'bg-red-800 text-white'
              : 'bg-[#172B3A] text-white';

        const borderClass = isMessage
          ? 'border-[#176B52]/35'
          : isOffer
            ? 'border-[#F4A62A]/60'
            : isError
              ? 'border-red-300'
              : 'border-[#172B3A]/20';

        const kindBadgeLabel = isMessage
          ? 'Unread Message'
          : isOffer
            ? 'Unread Offer / Request'
            : isError
              ? 'Unread Alert'
              : 'Unread Notification';

        const HeaderIcon = isMessage ? MessageSquare : Bell;

        return (
          <div
            key={item.id}
            role="status"
            className={`pointer-events-auto w-full overflow-hidden rounded-2xl border bg-white shadow-2xl ${borderClass}`}
          >
            {/* Top Band with Message or Bell Icon + Mark Read */}
            <div className={`flex items-center justify-between gap-2 px-3.5 py-2 ${headerBg}`}>
              <div className="flex min-w-0 items-center gap-2">
                <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-lg bg-white/15">
                  <HeaderIcon
                    className={`h-3.5 w-3.5 ${isOffer ? 'text-[#F4A62A]' : 'text-white'}`}
                  />
                </span>
                <span className="truncate text-[11px] font-bold tracking-wide uppercase">
                  {kindBadgeLabel}
                </span>
              </div>

              <div className="flex shrink-0 items-center gap-2">
                <span className="font-mono text-[10px] tabular-nums opacity-85">
                  {item.timestamp}
                </span>
                <button
                  type="button"
                  onClick={() => onMarkAsRead(item.id)}
                  aria-label="Mark notification as read"
                  className="inline-flex items-center gap-1 rounded-md bg-white/15 px-2 py-0.5 text-[11px] font-semibold text-white transition-colors hover:bg-white/25"
                >
                  <CheckCheck className="h-3 w-3" />
                  <span>Mark read</span>
                </button>
              </div>
            </div>

            {/* Body */}
            <div className="space-y-2 px-3.5 py-3 text-[#172B3A]">
              <div className="flex items-start justify-between gap-2">
                <p className="min-w-0 break-words text-xs font-bold text-[#172B3A]">
                  {item.title}
                </p>
              </div>
              <p className="break-words text-xs leading-relaxed text-[#172B3A]/80">
                {item.message}
              </p>

              <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
                {(item.onAction || item.actionTarget) && item.actionLabel ? (
                  <button
                    type="button"
                    onClick={() => onExecuteAction(item)}
                    className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-[11px] font-semibold text-white transition-colors ${
                      isMessage
                        ? 'bg-[#176B52] hover:bg-[#125641]'
                        : 'bg-[#172B3A] hover:bg-[#172B3A]/90'
                    }`}
                  >
                    <HeaderIcon className="h-3 w-3" />
                    <span>{item.actionLabel}</span>
                    <ArrowRight className="h-3 w-3" />
                  </button>
                ) : (
                  <span className="text-[10px] font-medium text-[#172B3A]/50">
                    Stays visible until marked as read
                  </span>
                )}

                <button
                  type="button"
                  onClick={() => onMarkAsRead(item.id)}
                  className="inline-flex items-center gap-1 rounded-lg border border-[#172B3A]/15 bg-[#F4F6F5] px-2.5 py-1 text-[11px] font-semibold text-[#172B3A] hover:bg-[#E8ECEA]"
                >
                  <CheckCheck className="h-3 w-3 text-[#176B52]" />
                  <span>Read &amp; Dismiss</span>
                </button>
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
};
