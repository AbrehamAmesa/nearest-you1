import React, { useEffect, useState } from 'react';
import { Eye, EyeOff, Lock, Mail, MapPin, Phone, User as UserIcon, X } from 'lucide-react';
import { useAuth } from '../context/AuthContext.tsx';
import { ADDIS_SUB_CITIES } from '../utils/geo.ts';
import type { AppLanguage } from '../utils/i18n.ts';

interface AuthModalProps {
  language: AppLanguage;
  defaultSubCity: string;
  onNotify: (msg: string) => void;
}

const AUTH_COPY: Record<
  AppLanguage,
  {
    signInTitle: string;
    signUpTitle: string;
    resetTitle: string;
    signInTab: string;
    signUpTab: string;
    fullName: string;
    email: string;
    phone: string;
    subCity: string;
    password: string;
    confirmPassword: string;
    forgotPassword: string;
    backToSignIn: string;
    sendResetBtn: string;
    signInBtn: string;
    signUpBtn: string;
    googleSignInBtn: string;
    googleSignUpBtn: string;
    orDivider: string;
    noAccountPrompt: string;
    hasAccountPrompt: string;
  }
> = {
  en: {
    signInTitle: 'Sign In to Nearest You',
    signUpTitle: 'Create Your Account',
    resetTitle: 'Reset Password',
    signInTab: 'Sign In',
    signUpTab: 'Sign Up',
    fullName: 'Full Name',
    email: 'Email Address',
    phone: 'Phone Number',
    subCity: 'Default Addis Ababa Sub-City',
    password: 'Password',
    confirmPassword: 'Confirm Password',
    forgotPassword: 'Forgot password?',
    backToSignIn: 'Back to Sign In',
    sendResetBtn: 'Send Reset Link',
    signInBtn: 'Sign In with Email',
    signUpBtn: 'Create Account',
    googleSignInBtn: 'Continue with Google',
    googleSignUpBtn: 'Sign Up with Google',
    orDivider: 'or',
    noAccountPrompt: "Don't have an account?",
    hasAccountPrompt: 'Already have an account?',
  },
  am: {
    signInTitle: 'ወደ Nearest You ይግቡ',
    signUpTitle: 'አዲስ መለያ ይፍጠሩ',
    resetTitle: 'የይለፍ ቃል ዳግም ያስጀምሩ',
    signInTab: 'ግባ',
    signUpTab: 'ተመዝገብ',
    fullName: 'ሙሉ ስም',
    email: 'ኢሜይል አድራሻ',
    phone: 'ስልክ ቁጥር',
    subCity: 'ነባሪ ክፍለ ከተማ',
    password: 'የይለፍ ቃል',
    confirmPassword: 'የይለፍ ቃል ያረጋግጡ',
    forgotPassword: 'የይለፍ ቃል ረሱ?',
    backToSignIn: 'ወደ መግቢያ ተመለስ',
    sendResetBtn: 'የዳግም ማስጀመሪያ ሊንክ ላክ',
    signInBtn: 'በኢሜይል ግባ',
    signUpBtn: 'መለያ ፍጠር',
    googleSignInBtn: 'በGoogle ቀጥል',
    googleSignUpBtn: 'በGoogle ተመዝገብ',
    orDivider: 'ወይም',
    noAccountPrompt: 'መለያ የለዎትም?',
    hasAccountPrompt: 'መለያ አለዎት?',
  },
  om: {
    signInTitle: 'Gara Nearest You Seenaa',
    signUpTitle: 'Akkaawuntii Haaraa Uumi',
    resetTitle: 'Jecha Darbii Haaromsi',
    signInTab: 'Seeni',
    signUpTab: 'Galmaa’i',
    fullName: 'Maqaa Guutuu',
    email: 'Teessoo Iimeeyilii',
    phone: 'Lakkoofsa Bilbilaa',
    subCity: 'Kutaa Magaalaa Finfinnee',
    password: 'Jecha Darbii',
    confirmPassword: 'Jecha Darbii Mirkaneessi',
    forgotPassword: 'Jecha darbii dagattee?',
    backToSignIn: 'Gara Seensaatti Deebi’i',
    sendResetBtn: 'Liinkii Haaromsaa Ergi',
    signInBtn: 'Iimeeyiliin Seeni',
    signUpBtn: 'Akkaawuntii Uumi',
    googleSignInBtn: 'Google’n Itti Fufi',
    googleSignUpBtn: 'Google’n Galmaa’i',
    orDivider: 'ykn',
    noAccountPrompt: 'Akkaawuntii hin qabduu?',
    hasAccountPrompt: 'Duraan akkaawuntii qabdaa?',
  },
};

export const AuthModal: React.FC<AuthModalProps> = ({
  language,
  defaultSubCity,
  onNotify,
}) => {
  const {
    authModalMode,
    openAuthModal,
    closeAuthModal,
    authError,
    clearAuthError,
    signInWithGoogle,
    signInWithEmail,
    signUpWithEmail,
    sendPasswordReset,
  } = useAuth();

  const copy = AUTH_COPY[language];
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [phoneNumber, setPhoneNumber] = useState('');
  const [subCity, setSubCity] = useState(defaultSubCity);
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [forgotMode, setForgotMode] = useState(false);
  const [localError, setLocalError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    setSubCity(defaultSubCity);
  }, [defaultSubCity]);

  useEffect(() => {
    if (authModalMode) {
      setLocalError(null);
      setForgotMode(false);
    }
  }, [authModalMode]);

  useEffect(() => {
    if (!authModalMode) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') closeAuthModal();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [authModalMode, closeAuthModal]);

  if (!authModalMode) return null;

  const activeError = localError || authError;

  const switchMode = (next: 'signin' | 'signup') => {
    setLocalError(null);
    setForgotMode(false);
    clearAuthError();
    openAuthModal(next);
  };

  const handleSignInSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLocalError(null);
    if (!email.trim() || !password) {
      setLocalError('Please enter your email and password.');
      return;
    }
    setSubmitting(true);
    try {
      const user = await signInWithEmail(email, password);
      if (user) {
        onNotify(`Welcome back, ${user.displayName || user.email || 'User'}.`);
        setPassword('');
      }
    } finally {
      setSubmitting(false);
    }
  };

  const handleSignUpSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLocalError(null);
    if (!fullName.trim()) {
      setLocalError('Please enter your full name.');
      return;
    }
    if (!email.trim()) {
      setLocalError('Please enter a valid email address.');
      return;
    }
    if (password.length < 6) {
      setLocalError('Password must be at least 6 characters long.');
      return;
    }
    if (password !== confirmPassword) {
      setLocalError('Passwords do not match.');
      return;
    }

    const sc = ADDIS_SUB_CITIES.find((c) => c.name === subCity) || ADDIS_SUB_CITIES[0];
    setSubmitting(true);
    try {
      const user = await signUpWithEmail({
        fullName,
        email,
        password,
        phoneNumber,
        defaultSubCity: sc.name,
        defaultLat: sc.lat,
        defaultLng: sc.lng,
        preferredLanguage: language,
      });
      if (user) {
        onNotify(`Account created for ${fullName.trim()}.`);
        setPassword('');
        setConfirmPassword('');
      }
    } finally {
      setSubmitting(false);
    }
  };

  const handleResetSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLocalError(null);
    if (!email.trim()) {
      setLocalError('Enter your account email to receive a password reset link.');
      return;
    }
    setSubmitting(true);
    try {
      const ok = await sendPasswordReset(email);
      if (ok) {
        onNotify(`Password reset link sent to ${email.trim()}.`);
        setForgotMode(false);
      }
    } finally {
      setSubmitting(false);
    }
  };

  const handleGoogleAuth = async () => {
    setLocalError(null);
    setSubmitting(true);
    try {
      const user = await signInWithGoogle();
      if (user) {
        onNotify(`Signed in as ${user.displayName || user.email}.`);
      }
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-[#172B3A]/55 p-4 overflow-y-auto"
      onClick={(e) => {
        if (e.target === e.currentTarget) closeAuthModal();
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="auth-modal-title"
        className="w-full max-w-md rounded-2xl border border-[#172B3A]/10 bg-white p-6 shadow-2xl space-y-5 my-auto"
      >
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2 id="auth-modal-title" className="font-display text-xl font-bold text-[#172B3A]">
              {forgotMode
                ? copy.resetTitle
                : authModalMode === 'signin'
                  ? copy.signInTitle
                  : copy.signUpTitle}
            </h2>
            <p className="mt-0.5 text-xs text-[#172B3A]/65">
              Nearest You · Addis Ababa, Ethiopia
            </p>
          </div>
          <button
            type="button"
            onClick={closeAuthModal}
            aria-label="Close authentication modal"
            className="flex h-9 w-9 items-center justify-center rounded-lg text-[#172B3A]/60 hover:bg-[#F4F6F5] hover:text-[#172B3A]"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Mode Switcher: Sign In vs Sign Up */}
        {!forgotMode && (
          <div className="grid grid-cols-2 gap-1 rounded-xl border border-[#172B3A]/10 bg-[#F4F6F5] p-1">
            <button
              type="button"
              onClick={() => switchMode('signin')}
              className={`min-h-[38px] rounded-lg text-xs font-semibold transition-colors ${
                authModalMode === 'signin'
                  ? 'bg-white text-[#172B3A] shadow-sm'
                  : 'text-[#172B3A]/65 hover:text-[#172B3A]'
              }`}
            >
              {copy.signInTab}
            </button>
            <button
              type="button"
              onClick={() => switchMode('signup')}
              className={`min-h-[38px] rounded-lg text-xs font-semibold transition-colors ${
                authModalMode === 'signup'
                  ? 'bg-white text-[#176B52] shadow-sm'
                  : 'text-[#172B3A]/65 hover:text-[#172B3A]'
              }`}
            >
              {copy.signUpTab}
            </button>
          </div>
        )}

        {activeError && (
          <div
            role="alert"
            className="rounded-xl border border-red-200 bg-red-50 px-3.5 py-2.5 text-xs text-red-800"
          >
            {activeError}
          </div>
        )}

        {forgotMode ? (
          <form onSubmit={handleResetSubmit} className="space-y-4">
            <div>
              <label className="block text-xs font-medium text-[#172B3A]/75">{copy.email}</label>
              <div className="relative mt-1">
                <Mail className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[#172B3A]/45" />
                <input
                  required
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="name@example.com"
                  className="h-11 w-full rounded-lg border border-[#172B3A]/15 pl-9 pr-3 text-sm focus:border-[#176B52] focus:outline-none"
                />
              </div>
            </div>
            <button
              type="submit"
              disabled={submitting}
              className="w-full min-h-[44px] rounded-lg bg-[#176B52] px-4 py-2.5 text-sm font-semibold text-white hover:bg-[#125641] disabled:opacity-60"
            >
              {submitting ? '...' : copy.sendResetBtn}
            </button>
            <button
              type="button"
              onClick={() => {
                setForgotMode(false);
                setLocalError(null);
                clearAuthError();
              }}
              className="w-full text-center text-xs font-semibold text-[#176B52] hover:underline"
            >
              {copy.backToSignIn}
            </button>
          </form>
        ) : authModalMode === 'signin' ? (
          <div className="space-y-4">
            <form onSubmit={handleSignInSubmit} className="space-y-3.5">
              <div>
                <label className="block text-xs font-medium text-[#172B3A]/75">{copy.email}</label>
                <div className="relative mt-1">
                  <Mail className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[#172B3A]/45" />
                  <input
                    required
                    type="email"
                    autoComplete="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="name@example.com"
                    className="h-11 w-full rounded-lg border border-[#172B3A]/15 pl-9 pr-3 text-sm focus:border-[#176B52] focus:outline-none"
                  />
                </div>
              </div>

              <div>
                <div className="flex items-center justify-between">
                  <label className="block text-xs font-medium text-[#172B3A]/75">
                    {copy.password}
                  </label>
                  <button
                    type="button"
                    onClick={() => {
                      setForgotMode(true);
                      setLocalError(null);
                      clearAuthError();
                    }}
                    className="text-[11px] font-semibold text-[#176B52] hover:underline"
                  >
                    {copy.forgotPassword}
                  </button>
                </div>
                <div className="relative mt-1">
                  <Lock className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[#172B3A]/45" />
                  <input
                    required
                    type={showPassword ? 'text' : 'password'}
                    autoComplete="current-password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="••••••••"
                    className="h-11 w-full rounded-lg border border-[#172B3A]/15 pl-9 pr-10 text-sm focus:border-[#176B52] focus:outline-none"
                  />
                  <button
                    type="button"
                    aria-label={showPassword ? 'Hide password' : 'Show password'}
                    onClick={() => setShowPassword((prev) => !prev)}
                    className="absolute right-2.5 top-1/2 -translate-y-1/2 rounded p-1 text-[#172B3A]/50 hover:text-[#172B3A]"
                  >
                    {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>
              </div>

              <button
                type="submit"
                disabled={submitting}
                className="w-full min-h-[44px] rounded-lg bg-[#176B52] px-4 py-2.5 text-sm font-semibold text-white hover:bg-[#125641] disabled:opacity-60"
              >
                {submitting ? 'Signing in...' : copy.signInBtn}
              </button>
            </form>

            <div className="relative flex items-center py-1">
              <div className="flex-grow border-t border-[#172B3A]/10" />
              <span className="mx-3 shrink-0 text-[11px] uppercase tracking-wider text-[#172B3A]/45">
                {copy.orDivider}
              </span>
              <div className="flex-grow border-t border-[#172B3A]/10" />
            </div>

            <button
              type="button"
              disabled={submitting}
              onClick={handleGoogleAuth}
              className="flex w-full min-h-[44px] items-center justify-center gap-2.5 rounded-lg border border-[#172B3A]/15 bg-white px-4 py-2.5 text-sm font-semibold text-[#172B3A] hover:bg-[#F4F6F5] disabled:opacity-60"
            >
              <svg className="h-4 w-4" viewBox="0 0 24 24" aria-hidden="true">
                <path
                  fill="#4285F4"
                  d="M23.745 12.27c0-.7-.06-1.4-.19-2.07H12v4.51h6.6c-.29 1.52-1.14 2.82-2.4 3.68v3.05h3.88c2.27-2.09 3.665-5.17 3.665-9.17Z"
                />
                <path
                  fill="#34A853"
                  d="M12 24c3.3 0 6.08-1.09 8.1-2.96l-3.88-3.05c-1.08.72-2.46 1.15-4.22 1.15-3.24 0-5.99-2.19-6.97-5.13H1.04v3.14C3.06 21.15 7.22 24 12 24Z"
                />
                <path
                  fill="#FBBC05"
                  d="M5.03 14.01A7.18 7.18 0 0 1 4.65 12c0-.7.13-1.37.38-2.01V6.85H1.04A11.97 11.97 0 0 0 0 12c0 1.94.46 3.77 1.04 5.15l3.99-3.14Z"
                />
                <path
                  fill="#EA4335"
                  d="M12 4.75c1.8 0 3.41.62 4.68 1.84l3.51-3.51C18.07 1.19 15.3 0 12 0 7.22 0 3.06 2.85 1.04 6.85l3.99 3.14c.98-2.94 3.73-5.24 6.97-5.24Z"
                />
              </svg>
              {copy.googleSignInBtn}
            </button>

            <p className="text-center text-xs text-[#172B3A]/65">
              {copy.noAccountPrompt}{' '}
              <button
                type="button"
                onClick={() => switchMode('signup')}
                className="font-semibold text-[#176B52] hover:underline"
              >
                {copy.signUpTab}
              </button>
            </p>
          </div>
        ) : (
          <div className="space-y-4">
            <form onSubmit={handleSignUpSubmit} className="space-y-3">
              <div>
                <label className="block text-xs font-medium text-[#172B3A]/75">
                  {copy.fullName} *
                </label>
                <div className="relative mt-1">
                  <UserIcon className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[#172B3A]/45" />
                  <input
                    required
                    type="text"
                    autoComplete="name"
                    value={fullName}
                    onChange={(e) => setFullName(e.target.value)}
                    placeholder="Abebe Bikila"
                    className="h-10 w-full rounded-lg border border-[#172B3A]/15 pl-9 pr-3 text-sm focus:border-[#176B52] focus:outline-none"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-medium text-[#172B3A]/75">
                  {copy.email} *
                </label>
                <div className="relative mt-1">
                  <Mail className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[#172B3A]/45" />
                  <input
                    required
                    type="email"
                    autoComplete="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="name@example.com"
                    className="h-10 w-full rounded-lg border border-[#172B3A]/15 pl-9 pr-3 text-sm focus:border-[#176B52] focus:outline-none"
                  />
                </div>
              </div>

              <div className="grid gap-3 sm:grid-cols-2">
                <div>
                  <label className="block text-xs font-medium text-[#172B3A]/75">
                    {copy.phone}
                  </label>
                  <div className="relative mt-1">
                    <Phone className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-[#172B3A]/45" />
                    <input
                      type="tel"
                      autoComplete="tel"
                      value={phoneNumber}
                      onChange={(e) => setPhoneNumber(e.target.value)}
                      placeholder="+251 9..."
                      className="h-10 w-full rounded-lg border border-[#172B3A]/15 pl-8 pr-2.5 text-xs focus:border-[#176B52] focus:outline-none"
                    />
                  </div>
                </div>
                <div>
                  <label className="block text-xs font-medium text-[#172B3A]/75">
                    {copy.subCity}
                  </label>
                  <div className="relative mt-1">
                    <MapPin className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-[#176B52]" />
                    <select
                      value={subCity}
                      onChange={(e) => setSubCity(e.target.value)}
                      className="h-10 w-full rounded-lg border border-[#172B3A]/15 bg-[#F4F6F5] pl-8 pr-2 text-xs font-medium focus:border-[#176B52] focus:outline-none"
                    >
                      {ADDIS_SUB_CITIES.map((sc) => (
                        <option key={sc.name} value={sc.name}>
                          {sc.name}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>
              </div>

              <div className="grid gap-3 sm:grid-cols-2">
                <div>
                  <label className="block text-xs font-medium text-[#172B3A]/75">
                    {copy.password} *
                  </label>
                  <div className="relative mt-1">
                    <Lock className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-[#172B3A]/45" />
                    <input
                      required
                      minLength={6}
                      type={showPassword ? 'text' : 'password'}
                      autoComplete="new-password"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      placeholder="Min 6 chars"
                      className="h-10 w-full rounded-lg border border-[#172B3A]/15 pl-8 pr-8 text-xs focus:border-[#176B52] focus:outline-none"
                    />
                    <button
                      type="button"
                      aria-label={showPassword ? 'Hide password' : 'Show password'}
                      onClick={() => setShowPassword((prev) => !prev)}
                      className="absolute right-2 top-1/2 -translate-y-1/2 text-[#172B3A]/45 hover:text-[#172B3A]"
                    >
                      {showPassword ? (
                        <EyeOff className="h-3.5 w-3.5" />
                      ) : (
                        <Eye className="h-3.5 w-3.5" />
                      )}
                    </button>
                  </div>
                </div>
                <div>
                  <label className="block text-xs font-medium text-[#172B3A]/75">
                    {copy.confirmPassword} *
                  </label>
                  <input
                    required
                    minLength={6}
                    type={showPassword ? 'text' : 'password'}
                    autoComplete="new-password"
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    placeholder="Repeat password"
                    className="mt-1 h-10 w-full rounded-lg border border-[#172B3A]/15 px-3 text-xs focus:border-[#176B52] focus:outline-none"
                  />
                </div>
              </div>

              <button
                type="submit"
                disabled={submitting}
                className="w-full min-h-[44px] rounded-lg bg-[#176B52] px-4 py-2.5 text-sm font-semibold text-white hover:bg-[#125641] disabled:opacity-60"
              >
                {submitting ? 'Creating account...' : copy.signUpBtn}
              </button>
            </form>

            <div className="relative flex items-center py-0.5">
              <div className="flex-grow border-t border-[#172B3A]/10" />
              <span className="mx-3 shrink-0 text-[11px] uppercase tracking-wider text-[#172B3A]/45">
                {copy.orDivider}
              </span>
              <div className="flex-grow border-t border-[#172B3A]/10" />
            </div>

            <button
              type="button"
              disabled={submitting}
              onClick={handleGoogleAuth}
              className="flex w-full min-h-[42px] items-center justify-center gap-2.5 rounded-lg border border-[#172B3A]/15 bg-white px-4 py-2 text-xs font-semibold text-[#172B3A] hover:bg-[#F4F6F5] disabled:opacity-60"
            >
              <svg className="h-4 w-4" viewBox="0 0 24 24" aria-hidden="true">
                <path
                  fill="#4285F4"
                  d="M23.745 12.27c0-.7-.06-1.4-.19-2.07H12v4.51h6.6c-.29 1.52-1.14 2.82-2.4 3.68v3.05h3.88c2.27-2.09 3.665-5.17 3.665-9.17Z"
                />
                <path
                  fill="#34A853"
                  d="M12 24c3.3 0 6.08-1.09 8.1-2.96l-3.88-3.05c-1.08.72-2.46 1.15-4.22 1.15-3.24 0-5.99-2.19-6.97-5.13H1.04v3.14C3.06 21.15 7.22 24 12 24Z"
                />
                <path
                  fill="#FBBC05"
                  d="M5.03 14.01A7.18 7.18 0 0 1 4.65 12c0-.7.13-1.37.38-2.01V6.85H1.04A11.97 11.97 0 0 0 0 12c0 1.94.46 3.77 1.04 5.15l3.99-3.14Z"
                />
                <path
                  fill="#EA4335"
                  d="M12 4.75c1.8 0 3.41.62 4.68 1.84l3.51-3.51C18.07 1.19 15.3 0 12 0 7.22 0 3.06 2.85 1.04 6.85l3.99 3.14c.98-2.94 3.73-5.24 6.97-5.24Z"
                />
              </svg>
              {copy.googleSignUpBtn}
            </button>

            <p className="text-center text-xs text-[#172B3A]/65">
              {copy.hasAccountPrompt}{' '}
              <button
                type="button"
                onClick={() => switchMode('signin')}
                className="font-semibold text-[#176B52] hover:underline"
              >
                {copy.signInTab}
              </button>
            </p>
          </div>
        )}
      </div>
    </div>
  );
};
