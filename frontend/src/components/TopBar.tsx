import React, { useEffect, useRef, useState } from 'react';
import { ChevronDown, Globe } from 'lucide-react';
import { useAuth } from '../context/AuthContext.tsx';
import { LANGUAGE_LABELS, TRANSLATIONS, type AppLanguage } from '../utils/i18n.ts';

export type AppSection = 'discover' | 'delivery' | 'activity' | 'business' | 'admin';

interface TopBarProps {
  activeSection: AppSection;
  language: AppLanguage;
  onChangeLanguage: (lang: AppLanguage) => void;
  onNavigate: (section: AppSection) => void;
  onOpenAccountModal: () => void;
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
}) => {
  const { firebaseUser, dbUser, isAdmin, openAuthModal } = useAuth();
  const t = TRANSLATIONS[language].nav;
  const [langMenuOpen, setLangMenuOpen] = useState(false);
  const langDropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!langMenuOpen) return;
    const handleOutside = (e: MouseEvent) => {
      if (langDropdownRef.current && !langDropdownRef.current.contains(e.target as Node)) {
        setLangMenuOpen(false);
      }
    };
    const handleEsc = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setLangMenuOpen(false);
    };
    document.addEventListener('mousedown', handleOutside);
    window.addEventListener('keydown', handleEsc);
    return () => {
      document.removeEventListener('mousedown', handleOutside);
      window.removeEventListener('keydown', handleEsc);
    };
  }, [langMenuOpen]);

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
