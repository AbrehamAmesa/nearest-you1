import React, { useEffect, useState } from 'react';
import {
  Camera,
  CheckCircle2,
  KeyRound,
  Landmark,
  Lock,
  LogOut,
  MapPin,
  Phone,
  ShieldCheck,
  User as UserIcon,
  X,
} from 'lucide-react';
import { paymentApi, userApi } from '../api/index.ts';
import type { BankDirectoryItem } from '../types/nearestyou.ts';
import { useAuth } from '../context/AuthContext.tsx';
import { ADDIS_SUB_CITIES } from '../utils/geo.ts';
import type { AppLanguage } from '../utils/i18n.ts';

interface AccountProfileModalProps {
  open: boolean;
  onClose: () => void;
  language: AppLanguage;
  selectedSubCity: string;
  onChangeLanguage: (lang: AppLanguage) => void;
  onChangeSubCity: (name: string) => void;
  onOpenProviderKyc: () => void;
  onOpenActivity: () => void;
  onNotify: (msg: string) => void;
}

async function compressAvatarDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const img = new Image();
      img.onload = () => {
        const maxDim = 256;
        const scale = Math.min(1, maxDim / Math.max(img.width, img.height));
        const width = Math.max(1, Math.round(img.width * scale));
        const height = Math.max(1, Math.round(img.height * scale));
        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        if (!ctx) {
          resolve(String(reader.result));
          return;
        }
        ctx.drawImage(img, 0, 0, width, height);
        resolve(canvas.toDataURL('image/jpeg', 0.82));
      };
      img.onerror = () => reject(new Error('Could not read image file.'));
      img.src = String(reader.result);
    };
    reader.onerror = () => reject(new Error('Could not load image file.'));
    reader.readAsDataURL(file);
  });
}

export const AccountProfileModal: React.FC<AccountProfileModalProps> = ({
  open,
  onClose,
  language,
  selectedSubCity,
  onChangeLanguage,
  onChangeSubCity,
  onOpenProviderKyc,
  onOpenActivity,
  onNotify,
}) => {
  const {
    firebaseUser,
    dbUser,
    authError,
    clearAuthError,
    updateAccountProfile,
    updateAccountPassword,
    linkEmailPassword,
    sendPasswordReset,
    refreshProfile,
    logout,
  } = useAuth();

  const [tab, setTab] = useState<'PROFILE' | 'PAYOUT' | 'SECURITY' | 'ROLES'>('PROFILE');
  const [fullName, setFullName] = useState('');
  const [phoneNumber, setPhoneNumber] = useState('');
  const [defaultSubCity, setDefaultSubCity] = useState(selectedSubCity);
  const [preferredLanguage, setPreferredLanguage] = useState<AppLanguage>(language);
  const [profilePhotoUrl, setProfilePhotoUrl] = useState('');

  // Personal payout account state (drivers & independent service givers)
  const [banks, setBanks] = useState<BankDirectoryItem[]>([]);
  const [payoutBankCode, setPayoutBankCode] = useState('130');
  const [payoutBankName, setPayoutBankName] = useState('Commercial Bank of Ethiopia (CBE)');
  const [payoutAccountNumber, setPayoutAccountNumber] = useState('');
  const [payoutAccountName, setPayoutAccountName] = useState('');
  const [payoutTelebirrNumber, setPayoutTelebirrNumber] = useState('');
  const [payoAccountHandle, setPayoAccountHandle] = useState('');
  const [preferredPayoutGateway, setPreferredPayoutGateway] = useState<'BOTH' | 'CHAPA' | 'PAYO'>('BOTH');

  // Security tab state
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmNewPassword, setConfirmNewPassword] = useState('');

  const [saving, setSaving] = useState(false);
  const [localMsg, setLocalMsg] = useState<{ type: 'ok' | 'err'; text: string } | null>(null);

  useEffect(() => {
    if (!open || !firebaseUser) return;
    setFullName(dbUser?.fullName || firebaseUser.displayName || '');
    setPhoneNumber(dbUser?.phoneNumber || '');
    setDefaultSubCity(dbUser?.defaultSubCity || selectedSubCity);
    const dbLang = dbUser?.preferredLanguage;
    setPreferredLanguage(
      dbLang === 'am' || dbLang === 'om' || dbLang === 'en' ? dbLang : language
    );
    setProfilePhotoUrl(dbUser?.profilePhotoUrl || firebaseUser.photoURL || '');
    setPayoutBankCode(dbUser?.payoutBankCode || '130');
    setPayoutBankName(dbUser?.payoutBankName || 'Commercial Bank of Ethiopia (CBE)');
    setPayoutAccountNumber(dbUser?.payoutAccountNumber || '');
    setPayoutAccountName(dbUser?.payoutAccountName || dbUser?.fullName || '');
    setPayoutTelebirrNumber(dbUser?.payoutTelebirrNumber || dbUser?.phoneNumber || '');
    setPayoAccountHandle(dbUser?.payoAccountHandle || '');
    const prefGw = dbUser?.preferredPayoutGateway;
    setPreferredPayoutGateway(
      prefGw === 'CHAPA' || prefGw === 'PAYO' ? prefGw : 'BOTH'
    );
    setCurrentPassword('');
    setNewPassword('');
    setConfirmNewPassword('');
    setLocalMsg(null);
    clearAuthError();
    paymentApi
      .getBanks()
      .then((res) => {
        if (Array.isArray(res.data)) setBanks(res.data);
      })
      .catch(() => {});
  }, [open, firebaseUser, dbUser]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  if (!open || !firebaseUser) return null;

  const providerIds = (firebaseUser.providerData || []).map((p) => p.providerId);
  const hasPasswordProvider = Boolean(dbUser?.hasPassword || providerIds.includes('password'));
  const hasGoogleProvider = providerIds.includes('google.com');

  const handlePhotoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const compressed = await compressAvatarDataUrl(file);
      setProfilePhotoUrl(compressed);
      setLocalMsg(null);
    } catch {
      setLocalMsg({ type: 'err', text: 'Could not process the selected photo.' });
    }
  };

  const handleSaveProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    setLocalMsg(null);
    if (!fullName.trim()) {
      setLocalMsg({ type: 'err', text: 'Full Name is required.' });
      return;
    }
    const sc = ADDIS_SUB_CITIES.find((c) => c.name === defaultSubCity) || ADDIS_SUB_CITIES[0];
    setSaving(true);
    try {
      const updated = await updateAccountProfile({
        fullName: fullName.trim(),
        phoneNumber: phoneNumber.trim(),
        preferredLanguage,
        defaultSubCity: sc.name,
        defaultLat: sc.lat,
        defaultLng: sc.lng,
        profilePhotoUrl,
      });
      if (updated) {
        onChangeLanguage(preferredLanguage);
        onChangeSubCity(sc.name);
        setLocalMsg({ type: 'ok', text: 'Profile saved and synchronized.' });
        onNotify('Profile updated.');
      }
    } finally {
      setSaving(false);
    }
  };

  const handlePasswordSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLocalMsg(null);
    if (newPassword.length < 6) {
      setLocalMsg({ type: 'err', text: 'New password must be at least 6 characters.' });
      return;
    }
    if (newPassword !== confirmNewPassword) {
      setLocalMsg({ type: 'err', text: 'New passwords do not match.' });
      return;
    }
    setSaving(true);
    try {
      const ok = hasPasswordProvider
        ? await updateAccountPassword(currentPassword, newPassword)
        : await linkEmailPassword(newPassword);
      if (ok) {
        setCurrentPassword('');
        setNewPassword('');
        setConfirmNewPassword('');
        setLocalMsg({
          type: 'ok',
          text: hasPasswordProvider
            ? 'Password updated successfully.'
            : 'Email & password sign-in linked to your account.',
        });
        onNotify('Account security updated.');
      }
    } finally {
      setSaving(false);
    }
  };

  const handleSendReset = async () => {
    if (!firebaseUser.email) return;
    setLocalMsg(null);
    setSaving(true);
    try {
      const ok = await sendPasswordReset(firebaseUser.email);
      if (ok) {
        setLocalMsg({
          type: 'ok',
          text: `Password reset email sent to ${firebaseUser.email}.`,
        });
      }
    } finally {
      setSaving(false);
    }
  };

  const handleSavePayoutAccount = async (e: React.FormEvent) => {
    e.preventDefault();
    setLocalMsg(null);
    if (!payoutAccountNumber.trim() && !payoutTelebirrNumber.trim() && !payoAccountHandle.trim()) {
      setLocalMsg({
        type: 'err',
        text: 'Enter at least one payout account (Bank Account, Telebirr, or Payo handle).',
      });
      return;
    }
    setSaving(true);
    try {
      const matchedBank = banks.find((b) => b.code === payoutBankCode);
      const res = await userApi.updatePayoutAccount({
        payoutBankCode,
        payoutBankName: matchedBank?.name || payoutBankName,
        payoutAccountNumber: payoutAccountNumber.trim(),
        payoutAccountName: payoutAccountName.trim() || fullName.trim(),
        payoutTelebirrNumber: payoutTelebirrNumber.trim(),
        payoAccountHandle: payoAccountHandle.trim(),
        preferredPayoutGateway,
      });
      await refreshProfile();
      const subId = res.data?.chapaSubaccountId;
      setLocalMsg({
        type: 'ok',
        text: subId
          ? `Own payout account saved & Chapa subaccount (${subId}) provisioned.`
          : 'Own payout account saved for direct sales settlement.',
      });
      onNotify('Personal sales payout account saved.');
    } catch (err: any) {
      setLocalMsg({
        type: 'err',
        text: err?.response?.data?.error || 'Could not save payout account.',
      });
    } finally {
      setSaving(false);
    }
  };

  const displayInitial = (fullName || firebaseUser.email || 'U').charAt(0).toUpperCase();

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-[#172B3A]/55 p-4 overflow-y-auto"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="profile-modal-title"
        className="w-full max-w-lg rounded-2xl border border-[#172B3A]/10 bg-white p-6 shadow-2xl space-y-5 my-auto"
      >
        {/* Modal Header */}
        <div className="flex items-start justify-between gap-3 border-b border-[#172B3A]/10 pb-4">
          <div className="flex items-center gap-3 min-w-0">
            {profilePhotoUrl ? (
              <img
                src={profilePhotoUrl}
                alt={fullName || 'Profile'}
                className="h-12 w-12 shrink-0 rounded-full border border-[#172B3A]/15 object-cover"
              />
            ) : (
              <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-[#176B52] font-display text-lg font-bold text-white">
                {displayInitial}
              </div>
            )}
            <div className="min-w-0">
              <h2
                id="profile-modal-title"
                className="truncate font-display text-lg font-bold text-[#172B3A]"
              >
                {dbUser?.fullName || firebaseUser.displayName || 'Account Profile'}
              </h2>
              <p className="truncate text-xs text-[#172B3A]/65">{firebaseUser.email}</p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close profile management"
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-[#172B3A]/60 hover:bg-[#F4F6F5] hover:text-[#172B3A]"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Navigation Tabs */}
        <div className="grid grid-cols-4 gap-1 rounded-xl border border-[#172B3A]/10 bg-[#F4F6F5] p-1 text-[11px] sm:text-xs">
          {[
            { id: 'PROFILE', label: 'Edit Profile' },
            { id: 'PAYOUT', label: 'Payout Account' },
            { id: 'SECURITY', label: 'Security' },
            { id: 'ROLES', label: 'Roles & KYC' },
          ].map((item) => (
            <button
              key={item.id}
              type="button"
              onClick={() => {
                setTab(item.id as typeof tab);
                setLocalMsg(null);
              }}
              className={`min-h-[36px] rounded-lg px-1 font-semibold transition-colors ${
                tab === item.id
                  ? 'bg-white text-[#176B52] shadow-sm'
                  : 'text-[#172B3A]/65 hover:text-[#172B3A]'
              }`}
            >
              {item.label}
            </button>
          ))}
        </div>

        {(localMsg || authError) && (
          <div
            role="status"
            className={`rounded-xl border px-3.5 py-2.5 text-xs ${
              localMsg?.type === 'ok'
                ? 'border-emerald-200 bg-emerald-50 text-[#176B52]'
                : 'border-red-200 bg-red-50 text-red-800'
            }`}
          >
            {localMsg?.text || authError}
          </div>
        )}

        {/* TAB 1: Profile Details */}
        {tab === 'PROFILE' && (
          <form onSubmit={handleSaveProfile} className="space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-[#172B3A]/10 bg-[#F4F6F5]/60 p-3 text-xs">
              <div className="flex items-center gap-2 text-[#172B3A]/75">
                <Camera className="h-4 w-4 text-[#176B52]" />
                <span>Profile Photo</span>
              </div>
              <div className="flex items-center gap-2">
                <label className="cursor-pointer rounded-lg border border-[#176B52]/30 bg-white px-3 py-1.5 font-semibold text-[#176B52] hover:bg-emerald-50">
                  Upload Photo
                  <input
                    type="file"
                    accept="image/*"
                    onChange={handlePhotoUpload}
                    className="hidden"
                  />
                </label>
                {profilePhotoUrl && (
                  <button
                    type="button"
                    onClick={() => setProfilePhotoUrl('')}
                    className="rounded-lg border border-[#172B3A]/15 bg-white px-2.5 py-1.5 font-medium text-[#172B3A]/70 hover:bg-red-50 hover:text-red-700"
                  >
                    Remove
                  </button>
                )}
              </div>
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <label className="block text-xs font-medium text-[#172B3A]/75">Full Name *</label>
                <div className="relative mt-1">
                  <UserIcon className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-[#172B3A]/45" />
                  <input
                    required
                    type="text"
                    value={fullName}
                    onChange={(e) => setFullName(e.target.value)}
                    className="h-10 w-full rounded-lg border border-[#172B3A]/15 pl-8 pr-3 text-xs focus:border-[#176B52] focus:outline-none"
                  />
                </div>
              </div>
              <div>
                <label className="block text-xs font-medium text-[#172B3A]/75">
                  Phone Number
                </label>
                <div className="relative mt-1">
                  <Phone className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-[#172B3A]/45" />
                  <input
                    type="tel"
                    value={phoneNumber}
                    onChange={(e) => setPhoneNumber(e.target.value)}
                    placeholder="+251 9..."
                    className="h-10 w-full rounded-lg border border-[#172B3A]/15 pl-8 pr-3 text-xs focus:border-[#176B52] focus:outline-none"
                  />
                </div>
              </div>
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <label className="block text-xs font-medium text-[#172B3A]/75">
                  Default Sub-City
                </label>
                <div className="relative mt-1">
                  <MapPin className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-[#176B52]" />
                  <select
                    value={defaultSubCity}
                    onChange={(e) => setDefaultSubCity(e.target.value)}
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

              <div>
                <label className="block text-xs font-medium text-[#172B3A]/75">
                  Preferred Language
                </label>
                <select
                  value={preferredLanguage}
                  onChange={(e) => setPreferredLanguage(e.target.value as AppLanguage)}
                  className="mt-1 h-10 w-full rounded-lg border border-[#172B3A]/15 bg-[#F4F6F5] px-3 text-xs font-semibold focus:border-[#176B52] focus:outline-none"
                >
                  <option value="en">EN · English</option>
                  <option value="am">AM · አማርኛ</option>
                  <option value="om">OM · Afaan Oromoo</option>
                </select>
              </div>
            </div>

            <button
              type="submit"
              disabled={saving}
              className="w-full min-h-[42px] rounded-lg bg-[#176B52] px-4 py-2 text-xs font-semibold text-white hover:bg-[#125641] disabled:opacity-60"
            >
              {saving ? 'Saving Profile...' : 'Save Profile Changes'}
            </button>
          </form>
        )}

        {/* TAB 1B: Personal Payout Collection Account (Drivers & Individual Service Givers) */}
        {tab === 'PAYOUT' && (
          <form onSubmit={handleSavePayoutAccount} className="space-y-3.5 text-xs">
            <div className="rounded-xl border border-[#176B52]/20 bg-emerald-50/40 p-3 space-y-1">
              <p className="flex items-center gap-1.5 font-semibold text-[#176B52]">
                <Landmark className="h-3.5 w-3.5" />
                Your Own Sales &amp; Earnings Collection Account
              </p>
              <p className="text-[11px] text-[#172B3A]/75">
                Earnings from your deliveries, rides, or individual services settle into this
                account via Chapa &amp; Payo.
              </p>
              {dbUser?.chapaSubaccountId && (
                <p className="font-mono text-[11px] font-semibold text-[#176B52]">
                  Chapa Subaccount ID: {dbUser.chapaSubaccountId}
                </p>
              )}
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <label className="block font-medium text-[#172B3A]/75">Ethiopian Bank</label>
                <select
                  value={payoutBankCode}
                  onChange={(e) => {
                    const code = e.target.value;
                    setPayoutBankCode(code);
                    const b = banks.find((x) => x.code === code);
                    if (b) setPayoutBankName(b.name);
                  }}
                  className="mt-1 h-10 w-full rounded-lg border border-[#172B3A]/15 bg-[#F4F6F5] px-2.5 text-xs"
                >
                  {(banks.length > 0
                    ? banks
                    : [
                        { code: '130', name: 'Commercial Bank of Ethiopia (CBE)', currency: 'ETB' },
                        { code: '855', name: 'Telebirr', currency: 'ETB' },
                      ]
                  ).map((b) => (
                    <option key={b.code} value={b.code}>
                      {b.name}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block font-medium text-[#172B3A]/75">Account Number</label>
                <input
                  type="text"
                  value={payoutAccountNumber}
                  onChange={(e) => setPayoutAccountNumber(e.target.value)}
                  placeholder="e.g., 1000123456789"
                  className="mt-1 h-10 w-full rounded-lg border border-[#172B3A]/15 px-3 font-mono text-xs"
                />
              </div>
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <label className="block font-medium text-[#172B3A]/75">Account Holder Name</label>
                <input
                  type="text"
                  value={payoutAccountName}
                  onChange={(e) => setPayoutAccountName(e.target.value)}
                  placeholder="Registered bank account name"
                  className="mt-1 h-10 w-full rounded-lg border border-[#172B3A]/15 px-3 text-xs"
                />
              </div>
              <div>
                <label className="block font-medium text-[#172B3A]/75">Telebirr Number</label>
                <input
                  type="tel"
                  value={payoutTelebirrNumber}
                  onChange={(e) => setPayoutTelebirrNumber(e.target.value)}
                  placeholder="+251 9..."
                  className="mt-1 h-10 w-full rounded-lg border border-[#172B3A]/15 px-3 font-mono text-xs"
                />
              </div>
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <label className="block font-medium text-[#172B3A]/75">Payo Account / Handle</label>
                <input
                  type="text"
                  value={payoAccountHandle}
                  onChange={(e) => setPayoAccountHandle(e.target.value)}
                  placeholder="@payo_handle or phone"
                  className="mt-1 h-10 w-full rounded-lg border border-[#172B3A]/15 px-3 font-mono text-xs"
                />
              </div>
              <div>
                <label className="block font-medium text-[#172B3A]/75">Preferred Gateway</label>
                <select
                  value={preferredPayoutGateway}
                  onChange={(e) =>
                    setPreferredPayoutGateway(e.target.value as 'BOTH' | 'CHAPA' | 'PAYO')
                  }
                  className="mt-1 h-10 w-full rounded-lg border border-[#172B3A]/15 bg-[#F4F6F5] px-2.5 text-xs font-semibold"
                >
                  <option value="BOTH">Both Chapa &amp; Payo</option>
                  <option value="CHAPA">Chapa Split Pay</option>
                  <option value="PAYO">Payo Direct</option>
                </select>
              </div>
            </div>

            <button
              type="submit"
              disabled={saving}
              className="w-full min-h-[42px] rounded-lg bg-[#176B52] px-4 py-2 text-xs font-semibold text-white hover:bg-[#125641] disabled:opacity-60"
            >
              {saving ? 'Saving & Provisioning Chapa Subaccount...' : 'Save Own Payout Account'}
            </button>
          </form>
        )}

        {/* TAB 2: Security & Password */}
        {tab === 'SECURITY' && (
          <div className="space-y-4">
            <div className="rounded-xl border border-[#172B3A]/10 bg-[#F4F6F5]/60 p-3.5 text-xs space-y-2">
              <p className="font-semibold text-[#172B3A] flex items-center gap-1.5">
                <KeyRound className="h-3.5 w-3.5 text-[#176B52]" />
                Connected Sign-In Methods
              </p>
              <div className="flex flex-wrap gap-2">
                {hasPasswordProvider && (
                  <span className="inline-flex items-center gap-1 rounded-md border border-[#176B52]/30 bg-white px-2.5 py-1 font-medium text-[#176B52]">
                    <CheckCircle2 className="h-3 w-3" />
                    Email & Password
                  </span>
                )}
                {hasGoogleProvider && (
                  <span className="inline-flex items-center gap-1 rounded-md border border-[#176B52]/30 bg-white px-2.5 py-1 font-medium text-[#176B52]">
                    <CheckCircle2 className="h-3 w-3" />
                    Google Account
                  </span>
                )}
              </div>
            </div>

            <form onSubmit={handlePasswordSubmit} className="space-y-3">
              <p className="text-xs font-semibold text-[#172B3A]">
                {hasPasswordProvider
                  ? 'Change Account Password'
                  : 'Add Email & Password Sign-In to This Account'}
              </p>

              {hasPasswordProvider && (
                <div>
                  <label className="block text-xs font-medium text-[#172B3A]/75">
                    Current Password
                  </label>
                  <div className="relative mt-1">
                    <Lock className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-[#172B3A]/45" />
                    <input
                      required
                      type="password"
                      value={currentPassword}
                      onChange={(e) => setCurrentPassword(e.target.value)}
                      placeholder="Current password"
                      className="h-10 w-full rounded-lg border border-[#172B3A]/15 pl-8 pr-3 text-xs"
                    />
                  </div>
                </div>
              )}

              <div className="grid gap-3 sm:grid-cols-2">
                <div>
                  <label className="block text-xs font-medium text-[#172B3A]/75">
                    New Password (min 6 chars)
                  </label>
                  <input
                    required
                    minLength={6}
                    type="password"
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    placeholder="New password"
                    className="mt-1 h-10 w-full rounded-lg border border-[#172B3A]/15 px-3 text-xs"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-[#172B3A]/75">
                    Confirm New Password
                  </label>
                  <input
                    required
                    minLength={6}
                    type="password"
                    value={confirmNewPassword}
                    onChange={(e) => setConfirmNewPassword(e.target.value)}
                    placeholder="Repeat password"
                    className="mt-1 h-10 w-full rounded-lg border border-[#172B3A]/15 px-3 text-xs"
                  />
                </div>
              </div>

              <div className="flex flex-wrap gap-2">
                <button
                  type="submit"
                  disabled={saving}
                  className="flex-1 min-h-[40px] rounded-lg bg-[#172B3A] px-4 py-2 text-xs font-semibold text-white hover:bg-[#176B52] disabled:opacity-60"
                >
                  {saving
                    ? 'Updating...'
                    : hasPasswordProvider
                      ? 'Update Password'
                      : 'Set Password'}
                </button>
                {hasPasswordProvider && firebaseUser.email && (
                  <button
                    type="button"
                    disabled={saving}
                    onClick={handleSendReset}
                    className="min-h-[40px] rounded-lg border border-[#172B3A]/15 px-3 py-2 text-xs font-semibold text-[#172B3A] hover:bg-[#F4F6F5]"
                  >
                    Email Reset Link
                  </button>
                )}
              </div>
            </form>
          </div>
        )}

        {/* TAB 3: Roles & KYC Summary */}
        {tab === 'ROLES' && (
          <div className="space-y-4 text-xs">
            <div className="rounded-xl border border-[#172B3A]/10 bg-[#F4F6F5]/60 p-4 space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-[#172B3A]/65">Account Status</span>
                <span className="font-mono font-bold text-[#176B52]">
                  {dbUser?.accountStatus || 'ACTIVE'}
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-[#172B3A]/65">Provider KYC</span>
                <span className="font-mono font-semibold text-[#172B3A]">
                  {dbUser?.providerVerificationStatus || 'UNREGISTERED'}
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-[#172B3A]/65">Alive / Liveness Check</span>
                <span className="font-mono font-semibold text-[#172B3A]">
                  {dbUser?.livenessStatus || 'NOT_STARTED'}
                </span>
              </div>
              {dbUser?.faydaIdNumber && (
                <div className="flex items-center justify-between">
                  <span className="text-[#172B3A]/65">Fayda ID</span>
                  <span className="font-mono font-semibold text-[#172B3A]">
                    {dbUser.faydaIdNumber}
                  </span>
                </div>
              )}
              {dbUser?.createdAt && (
                <div className="flex items-center justify-between">
                  <span className="text-[#172B3A]/65">Member Since</span>
                  <span className="font-mono text-[#172B3A]">
                    {new Date(dbUser.createdAt).toLocaleDateString()}
                  </span>
                </div>
              )}
              <div className="border-t border-[#172B3A]/10 pt-2">
                <p className="text-[#172B3A]/65 mb-1.5">Active Platform Roles</p>
                <div className="flex flex-wrap gap-1.5">
                  {(dbUser?.roles || ['CUSTOMER']).map((role) => (
                    <span
                      key={role}
                      className="inline-flex items-center gap-1 rounded border border-[#176B52]/25 bg-white px-2 py-0.5 font-mono text-[11px] font-semibold text-[#176B52]"
                    >
                      <ShieldCheck className="h-3 w-3" />
                      {role}
                    </span>
                  ))}
                </div>
              </div>
            </div>

            <div
              className={`grid gap-2 ${
                dbUser?.providerVerificationStatus === 'VERIFIED' ? 'grid-cols-1' : 'grid-cols-2'
              }`}
            >
              {dbUser?.providerVerificationStatus !== 'VERIFIED' && (
                <button
                  type="button"
                  onClick={() => {
                    onClose();
                    onOpenProviderKyc();
                  }}
                  className="min-h-[40px] rounded-lg border border-[#176B52]/30 bg-emerald-50/50 px-3 py-2 font-semibold text-[#176B52] hover:bg-emerald-50"
                >
                  Provider KYC & QR
                </button>
              )}
              <button
                type="button"
                onClick={() => {
                  onClose();
                  onOpenActivity();
                }}
                className="min-h-[40px] rounded-lg border border-[#172B3A]/15 px-3 py-2 font-semibold text-[#172B3A] hover:bg-[#F4F6F5]"
              >
                My Activity
              </button>
            </div>
          </div>
        )}

        {/* Footer Sign Out */}
        <div className="flex items-center justify-between border-t border-[#172B3A]/10 pt-3">
          <span className="text-[11px] text-[#172B3A]/55">
            {dbUser?.defaultSubCity || selectedSubCity} ·{' '}
            {preferredLanguage.toUpperCase()}
          </span>
          <button
            type="button"
            onClick={async () => {
              await logout();
              onClose();
              onNotify('Signed out.');
            }}
            className="inline-flex min-h-[38px] items-center gap-1.5 rounded-lg bg-[#172B3A] px-4 py-1.5 text-xs font-semibold text-white hover:bg-[#176B52]"
          >
            <LogOut className="h-3.5 w-3.5" />
            Sign Out
          </button>
        </div>
      </div>
    </div>
  );
};
