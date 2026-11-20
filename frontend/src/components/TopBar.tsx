import React, { useEffect, useRef, useState } from 'react';
import {
  ArrowRight,
  Bell,
  CheckCheck,
  ChevronDown,
  Globe,
  MessageSquare,
  Trash2,
} from 'lucide-react';
import { useAuth } from '../context/AuthContext.tsx';
import { LANGUAGE_LABELS, TRANSLATIONS, type AppLanguage } from '../utils/i18n.ts';
import type { AppNotification } from './NotificationCenter.tsx';

export type AppSection = 'discover' | 'delivery' | 'activity' | 'business' | 'admin';

interface TopBarProps {
  activeSection: AppSection;
  language: AppLanguage;
  onChangeLanguage: (lang: AppLanguage) => void;
  onNavigate: (section: AppSection) => void;
  onOpenAccountModal: () => void;
  notifications: AppNotification[];
  inboxOpen: boolean;
  onToggleInbox: () => void;
  onCloseInbox: () => void;
  onMarkNotificationRead: (id: string) => void;
  onMarkAllNotificationsRead: () => void;
  onClearReadNotifications: () => void;
  onExecuteNotificationAction: (item: AppNotification) => void;
}

const LANGUAGE_CODES: Record<AppLanguage, string> = {
  en: 'EN',
  am: 'AM',
  om: 'OM',
};

export const TopBar: React.FC<TopBarProps> = ({
  activeSection,
  language,
  onChangeLanguage,
  onNavigate,
  onOpenAccountModal,
  notifications,
  inboxOpen,
  onToggleInbox,
  onCloseInbox,
  onMarkNotificationRead,
  onMarkAllNotificationsRead,
  onClearReadNotifications,
  onExecuteNotificationAction,
}) => {
  const { firebaseUser, dbUser, isAdmin, openAuthModal } = useAuth();
  const t = TRANSLATIONS[language].nav;
  const [langMenuOpen, setLangMenuOpen] = useState(false);
  const langDropdownRef = useRef<HTMLDivElement>(null);
  const inboxDropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!langMenuOpen && !inboxOpen) return;
    const handleOutside = (e: MouseEvent) => {
      if (
        langMenuOpen &&
        langDropdownRef.current &&
        !langDropdownRef.current.contains(e.target as Node)
      ) {
        setLangMenuOpen(false);
      }
      if (
        inboxOpen &&
        inboxDropdownRef.current &&
        !inboxDropdownRef.current.contains(e.target as Node)
      ) {
        onCloseInbox();
      }
    };
    const handleEsc = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setLangMenuOpen(false);
        onCloseInbox();
      }
    };
    document.addEventListener('mousedown', handleOutside);
    window.addEventListener('keydown', handleEsc);
    return () => {
      document.removeEventListener('mousedown', handleOutside);
      window.removeEventListener('keydown', handleEsc);
    };
  }, [langMenuOpen, inboxOpen, onCloseInbox]);

  const navItems: Array<{ id: AppSection; label: string }> = [
    { id: 'discover', label: t.discover },
    { id: 'delivery', label: t.delivery },
    { id: 'activity', label: t.activity },
    { id: 'business', label: t.business },
    { id: 'admin', label: t.admin },
  ];

  const visibleNavItems = navItems.filter((item) => {
    if (item.id === 'discover') return true;
    if (!firebaseUser) return false;
    if (item.id === 'admin') return Boolean(isAdmin);
    return true;
  });

  const avatarUrl = dbUser?.profilePhotoUrl || firebaseUser?.photoURL || '';
  const accountFirstName = (
    dbUser?.fullName ||
    firebaseUser?.displayName ||
    firebaseUser?.email?.split('@')[0] ||
    t.profile
  ).split(' ')[0];

  const unreadCount = notifications.filter((n) => !n.read).length;
  const unreadMessagesCount = notifications.filter((n) => !n.read && n.kind === 'message').length;
  const hasReadItems = notifications.some((n) => n.read);
  const orderedNotifications = [...notifications].reverse();

  return (
    <header className="sticky top-0 z-30 border-b border-[#172B3A]/10 bg-white/95 backdrop-blur-sm">
      <div className="mx-auto flex max-w-[1440px] items-center justify-between gap-2 px-3 py-2.5 sm:gap-6 sm:px-6 sm:py-3.5">
        <button
          type="button"
          onClick={() => onNavigate('discover')}
          className="font-display text-base font-bold tracking-tight text-[#172B3A] whitespace-nowrap shrink-0 sm:text-xl focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[#176B52]"
        >
          Nearest You
        </button>

        <nav
          aria-label="Primary"
          className="hidden md:flex items-center gap-6 overflow-x-auto text-sm font-medium"
        >
          {visibleNavItems.map((item) => {
            const isActive = activeSection === item.id;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => onNavigate(item.id)}
                className={`relative py-1 whitespace-nowrap shrink-0 transition-colors duration-150 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[#176B52] ${
                  isActive
                    ? 'text-[#176B52] font-semibold'
                    : 'text-[#172B3A]/70 hover:text-[#172B3A]'
                }`}
              >
                {item.label}
                {isActive && (
                  <span className="absolute inset-x-0 -bottom-[15px] h-0.5 bg-[#176B52]" />
                )}
              </button>
            );
          })}
        </nav>

        <div className="flex items-center gap-1.5 sm:gap-2 shrink-0">
          {/* Persistent Bell & Message Notification Inbox */}
          <div ref={inboxDropdownRef} className="relative">
            <button
              type="button"
              aria-label={`Notifications (${unreadCount} unread)`}
              aria-expanded={inboxOpen}
              onClick={onToggleInbox}
              className={`relative inline-flex min-h-[40px] items-center gap-1.5 rounded-lg border px-2.5 py-2 text-xs font-bold transition-colors whitespace-nowrap ${
                unreadCount > 0
                  ? 'border-[#176B52]/35 bg-emerald-50 text-[#176B52] hover:bg-emerald-100/70'
                  : 'border-[#172B3A]/15 bg-[#F4F6F5] text-[#172B3A] hover:bg-white'
              }`}
            >
              {unreadMessagesCount > 0 ? (
                <MessageSquare className="h-4 w-4 text-[#176B52]" />
              ) : (
                <Bell className="h-4 w-4 text-[#176B52]" />
              )}
              {unreadCount > 0 && (
                <span className="inline-flex min-w-[18px] items-center justify-center rounded-md bg-[#176B52] px-1.5 py-0.5 font-mono text-[10px] font-bold tabular-nums text-white">
                  {unreadCount}
                </span>
              )}
            </button>

            {inboxOpen && (
              <div className="fixed inset-x-3 top-[60px] z-50 overflow-hidden rounded-2xl border border-[#172B3A]/15 bg-white shadow-2xl sm:absolute sm:inset-x-auto sm:right-0 sm:top-auto sm:mt-2 sm:w-[390px]">
                <div className="flex items-center justify-between gap-2 border-b border-[#172B3A]/10 bg-[#172B3A] px-4 py-3 text-white">
                  <div className="flex items-center gap-2">
                    <Bell className="h-4 w-4 text-[#F4A62A]" />
                    <span className="text-xs font-bold">
                      Notifications {unreadCount > 0 ? `(${unreadCount} unread)` : ''}
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    {unreadCount > 0 && (
                      <button
                        type="button"
                        onClick={onMarkAllNotificationsRead}
                        className="inline-flex items-center gap-1 rounded-md bg-[#176B52] px-2 py-1 text-[10px] font-semibold text-white hover:bg-[#125641]"
                      >
                        <CheckCheck className="h-3 w-3" />
                        Mark all read
                      </button>
                    )}
                    {hasReadItems && (
                      <button
                        type="button"
                        onClick={onClearReadNotifications}
                        aria-label="Clear read notifications"
                        className="inline-flex items-center gap-1 rounded-md bg-white/15 px-2 py-1 text-[10px] font-semibold text-white hover:bg-white/25"
                      >
                        <Trash2 className="h-3 w-3" />
                        Clear read
                      </button>
                    )}
                  </div>
                </div>

                <div className="max-h-[65vh] divide-y divide-[#172B3A]/10 overflow-y-auto">
                  {orderedNotifications.length === 0 ? (
                    <div className="px-4 py-8 text-center">
                      <Bell className="mx-auto mb-2 h-6 w-6 text-[#172B3A]/30" />
                      <p className="text-xs font-semibold text-[#172B3A]/75">No notifications yet</p>
                      <p className="mt-0.5 text-[11px] text-[#172B3A]/55">
                        Delivered messages, offers, and updates stay here until you mark them as read.
                      </p>
                    </div>
                  ) : (
                    orderedNotifications.map((item) => {
                      const isMessage = item.kind === 'message';
                      const ItemIcon = isMessage ? MessageSquare : Bell;
                      return (
                        <div
                          key={item.id}
                          className={`flex items-start gap-3 px-4 py-3 transition-colors ${
                            !item.read
                              ? isMessage
                                ? 'bg-emerald-50/70'
                                : 'bg-amber-50/60'
                              : 'bg-white opacity-75'
                          }`}
                        >
                          <div
                            className={`mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-xl border ${
                              !item.read
                                ? isMessage
                                  ? 'border-[#176B52]/30 bg-[#176B52] text-white'
                                  : 'border-[#F4A62A]/50 bg-[#172B3A] text-[#F4A62A]'
                                : 'border-[#172B3A]/15 bg-[#F4F6F5] text-[#172B3A]/60'
                            }`}
                          >
                            <ItemIcon className="h-3.5 w-3.5" />
                          </div>

                          <div className="min-w-0 flex-1">
                            <div className="flex items-center justify-between gap-2">
                              <p className="truncate text-xs font-bold text-[#172B3A]">
                                {item.title}
                              </p>
                              <span className="shrink-0 font-mono text-[10px] tabular-nums text-[#172B3A]/50">
                                {item.timestamp}
                              </span>
                            </div>
                            <p className="mt-0.5 break-words text-xs leading-relaxed text-[#172B3A]/80">
                              {item.message}
                            </p>
                            <div className="mt-2 flex flex-wrap items-center gap-2">
                              {(item.onAction || item.actionTarget) && item.actionLabel && (
                                <button
                                  type="button"
                                  onClick={() => {
                                    onExecuteNotificationAction(item);
                                    onCloseInbox();
                                  }}
                                  className="inline-flex items-center gap-1 rounded-md bg-[#176B52] px-2.5 py-1 text-[10px] font-semibold text-white hover:bg-[#125641]"
                                >
                                  <span>{item.actionLabel}</span>
                                  <ArrowRight className="h-3 w-3" />
                                </button>
                              )}
                              {!item.read ? (
                                <button
                                  type="button"
                                  onClick={() => onMarkNotificationRead(item.id)}
                                  className="inline-flex items-center gap-1 rounded-md border border-[#172B3A]/15 bg-white px-2 py-1 text-[10px] font-semibold text-[#172B3A] hover:bg-[#F4F6F5]"
                                >
                                  <CheckCheck className="h-3 w-3 text-[#176B52]" />
                                  <span>Mark as read</span>
                                </button>
                              ) : (
                                <span className="inline-flex items-center gap-1 text-[10px] font-medium text-[#176B52]">
                                  <CheckCheck className="h-3 w-3" />
                                  Read
                                </span>
                              )}
                            </div>
                          </div>
                        </div>
                      );
                    })
                  )}
                </div>
              </div>
            )}
          </div>

          {/* Language Dropdown next to Sign In / Account — defaults to EN */}
          <div ref={langDropdownRef} className="relative">
            <button
              type="button"
              aria-label={t.languageLabel}
              aria-haspopup="listbox"
              aria-expanded={langMenuOpen}
              onClick={() => setLangMenuOpen((prev) => !prev)}
              className="inline-flex min-h-[40px] items-center gap-1.5 rounded-lg border border-[#172B3A]/15 bg-[#F4F6F5] px-2.5 py-2 text-xs font-bold text-[#172B3A] hover:bg-white transition-colors whitespace-nowrap"
            >
              <Globe className="h-3.5 w-3.5 text-[#176B52]" />
              <span>{LANGUAGE_CODES[language]}</span>
              <ChevronDown className="h-3.5 w-3.5 text-[#172B3A]/60" />
            </button>

            {langMenuOpen && (
              <ul
                role="listbox"
                aria-label={t.languageLabel}
                className="absolute right-0 mt-1.5 w-44 rounded-xl border border-[#172B3A]/10 bg-white p-1 shadow-xl z-50"
              >
                {(['en', 'am', 'om'] as const).map((lang) => {
                  const selected = language === lang;
                  return (
                    <li key={lang}>
                      <button
                        type="button"
                        role="option"
                        aria-selected={selected}
                        onClick={() => {
                          onChangeLanguage(lang);
                          setLangMenuOpen(false);
                        }}
                        className={`flex w-full items-center justify-between rounded-lg px-3 py-2 text-left text-xs font-medium transition-colors ${
                          selected
                            ? 'bg-[#176B52] text-white font-semibold'
                            : 'text-[#172B3A] hover:bg-[#F4F6F5]'
                        }`}
                      >
                        <span>{LANGUAGE_LABELS[lang]}</span>
                        <span className="font-mono text-[10px] opacity-80">
                          {LANGUAGE_CODES[lang]}
                        </span>
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>

          {firebaseUser ? (
            <button
              type="button"
              onClick={onOpenAccountModal}
              className="inline-flex min-h-[40px] items-center gap-2 rounded-lg bg-[#176B52] px-3 py-1.5 text-xs sm:text-sm font-semibold text-white transition-colors duration-150 hover:bg-[#125641] whitespace-nowrap shrink-0 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#176B52]"
            >
              {avatarUrl ? (
                <img
                  src={avatarUrl}
                  alt={accountFirstName}
                  className="h-6 w-6 rounded-full border border-white/40 object-cover"
                />
              ) : (
                <span className="flex h-6 w-6 items-center justify-center rounded-full bg-white/20 text-xs font-bold">
                  {accountFirstName.charAt(0).toUpperCase()}
                </span>
              )}
              <span>{accountFirstName}</span>
            </button>
          ) : (
            <>
              <button
                type="button"
                onClick={() => openAuthModal('signin')}
                className="min-h-[40px] rounded-lg border border-[#172B3A]/20 bg-white px-3 py-2 text-xs sm:text-sm font-semibold text-[#172B3A] transition-colors duration-150 hover:bg-[#F4F6F5] whitespace-nowrap shrink-0 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#176B52]"
              >
                {t.signIn}
              </button>
              <button
                type="button"
                onClick={() => openAuthModal('signup')}
                className="min-h-[40px] rounded-lg bg-[#176B52] px-3 sm:px-4 py-2 text-xs sm:text-sm font-semibold text-white transition-colors duration-150 hover:bg-[#125641] whitespace-nowrap shrink-0 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#176B52]"
              >
                {t.signUp}
              </button>
            </>
          )}
        </div>
      </div>

      {/* Mobile bottom-row navigation only under md breakpoint */}
      <nav
        aria-label="Mobile Navigation"
        className="flex md:hidden items-center gap-4 overflow-x-auto border-t border-[#172B3A]/10 px-4 py-1.5 text-xs font-medium"
      >
        {visibleNavItems.map((item) => {
          const isActive = activeSection === item.id;
          return (
            <button
              key={item.id}
              type="button"
              onClick={() => onNavigate(item.id)}
              className={`min-h-[40px] px-1 whitespace-nowrap shrink-0 ${
                isActive ? 'text-[#176B52] font-semibold border-b-2 border-[#176B52]' : 'text-[#172B3A]/70'
              }`}
            >
              {item.label}
            </button>
          );
        })}
      </nav>
    </header>
  );
};
