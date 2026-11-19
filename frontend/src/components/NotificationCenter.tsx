import React from 'react';
import {
  AlertCircle,
  ArrowRight,
  BadgeCheck,
  CheckCheck,
  CheckCircle2,
  MessageSquare,
  X,
} from 'lucide-react';

export type NotificationKind = 'message' | 'offer' | 'success' | 'error';

export interface AppNotification {
  id: string;
  kind: NotificationKind;
  title: string;
  message: string;
  timestamp: string;
  actionLabel?: string;
  onAction?: () => void;
}

interface NotificationCenterProps {
  notifications: AppNotification[];
  onDismiss: (id: string) => void;
}

export const NotificationCenter: React.FC<NotificationCenterProps> = ({
  notifications,
  onDismiss,
}) => {
  if (notifications.length === 0) return null;

  return (
    <div
      aria-live="polite"
      className="pointer-events-none fixed inset-x-3 bottom-4 z-[1300] flex flex-col gap-2.5 sm:inset-x-auto sm:bottom-5 sm:right-5 sm:w-[390px]"
    >
      {notifications.map((item) => {
        const isMessage = item.kind === 'message';
        const isOffer = item.kind === 'offer';
        const isError = item.kind === 'error';

        const containerClasses = isMessage
          ? 'border-[#176B52]/35 bg-white text-[#172B3A] shadow-2xl ring-1 ring-[#176B52]/10'
          : isOffer
            ? 'border-[#F4A62A]/60 bg-[#FFFDF8] text-[#172B3A] shadow-2xl ring-1 ring-[#F4A62A]/20'
            : isError
              ? 'border-red-300 bg-red-50 text-red-950 shadow-2xl'
              : 'border-[#172B3A]/15 bg-[#172B3A] text-white shadow-2xl';

        const iconBoxClasses = isMessage
          ? 'bg-emerald-50 text-[#176B52] border border-[#176B52]/20'
          : isOffer
            ? 'bg-amber-50 text-[#B7740B] border border-[#F4A62A]/40'
            : isError
              ? 'bg-red-100 text-red-700 border border-red-200'
              : 'bg-white/10 text-[#F4A62A] border border-white/15';

        const Icon = isMessage
          ? MessageSquare
          : isOffer
            ? BadgeCheck
            : isError
              ? AlertCircle
              : CheckCircle2;

        return (
          <div
            key={item.id}
            role="status"
            className={`pointer-events-auto flex w-full items-start gap-3 rounded-2xl border p-3.5 transition-all duration-200 ${containerClasses}`}
          >
            <div
              className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl ${iconBoxClasses}`}
            >
              <Icon className="h-4 w-4" />
            </div>

            <div className="min-w-0 flex-1">
              <div className="flex items-center justify-between gap-2">
                <span
                  className={`inline-flex items-center gap-1 text-xs font-bold ${
                    isMessage
                      ? 'text-[#176B52]'
                      : isOffer
                        ? 'text-[#B7740B]'
                        : isError
                          ? 'text-red-800'
                          : 'text-white'
                  }`}
                >
                  {item.title}
                  {(isMessage || isOffer) && (
                    <CheckCheck className="h-3.5 w-3.5 shrink-0 opacity-85" />
                  )}
                </span>
                <span
                  className={`shrink-0 font-mono text-[10px] tabular-nums ${
                    isMessage || isOffer
                      ? 'text-[#172B3A]/45'
                      : isError
                        ? 'text-red-700/70'
                        : 'text-white/60'
                  }`}
                >
                  {item.timestamp}
                </span>
              </div>

              <p
                className={`mt-1 break-words text-xs leading-relaxed ${
                  isMessage || isOffer
                    ? 'text-[#172B3A]/85'
                    : isError
                      ? 'text-red-900'
                      : 'text-white/90'
                }`}
              >
                {item.message}
              </p>

              {item.onAction && item.actionLabel && (
                <button
                  type="button"
                  onClick={() => {
                    item.onAction?.();
                    onDismiss(item.id);
                  }}
                  className={`mt-2 inline-flex items-center gap-1 rounded-lg px-2.5 py-1 text-[11px] font-semibold transition-colors ${
                    isMessage
                      ? 'bg-[#176B52] text-white hover:bg-[#125641]'
                      : isOffer
                        ? 'bg-[#172B3A] text-white hover:bg-[#172B3A]/90'
                        : 'bg-white/15 text-white hover:bg-white/25'
                  }`}
                >
                  <span>{item.actionLabel}</span>
                  <ArrowRight className="h-3 w-3" />
                </button>
              )}
            </div>

            <button
              type="button"
              onClick={() => onDismiss(item.id)}
              aria-label="Dismiss notification"
              className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-lg transition-colors ${
                isMessage || isOffer
                  ? 'text-[#172B3A]/45 hover:bg-[#F4F6F5] hover:text-[#172B3A]'
                  : isError
                    ? 'text-red-700/70 hover:bg-red-100'
                    : 'text-white/65 hover:bg-white/10 hover:text-white'
              }`}
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
        );
      })}
    </div>
  );
};
