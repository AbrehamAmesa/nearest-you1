import React, { createContext, useContext, useEffect, useState } from 'react';
import {
  EmailAuthProvider,
  createUserWithEmailAndPassword,
  linkWithCredential,
  onAuthStateChanged,
  reauthenticateWithCredential,
  sendPasswordResetEmail,
  signInWithEmailAndPassword,
  signInWithPopup,
  signOut,
  updatePassword,
  updateProfile,
  type User,
} from 'firebase/auth';
import { auth, googleAuthProvider } from '../lib/firebase.ts';
import type { DbUserRecord } from '../types/nearestyou.ts';
import api, { setApiTokenProvider } from '../api/axios.ts';
import { userApi } from '../api/index.ts';

export type AuthModalMode = 'signin' | 'signup' | null;

const DB_TOKEN_STORAGE_KEY = 'ny_db_auth_token';

function getStoredDbToken(): string | null {
  try {
    return typeof window !== 'undefined' ? window.localStorage.getItem(DB_TOKEN_STORAGE_KEY) : null;
  } catch {
    return null;
  }
}

function setStoredDbToken(token: string) {
  try {
    if (typeof window !== 'undefined') {
      window.localStorage.setItem(DB_TOKEN_STORAGE_KEY, token);
    }
  } catch {
    /* ignore storage failures */
  }
}

function clearStoredDbToken() {
  try {
    if (typeof window !== 'undefined') {
      window.localStorage.removeItem(DB_TOKEN_STORAGE_KEY);
    }
  } catch {
    /* ignore storage failures */
  }
}

function buildSessionUserFromDb(record: DbUserRecord): User {
  return {
    uid: record.uid,
    email: record.email,
    displayName: record.fullName,
    photoURL: record.profilePhotoUrl || null,
    emailVerified: true,
    isAnonymous: false,
    providerData: [
      {
        providerId: 'password',
        uid: record.email,
        displayName: record.fullName,
        email: record.email,
        phoneNumber: record.phoneNumber || null,
        photoURL: record.profilePhotoUrl || null,
      },
    ],
  } as unknown as User;
}

export interface SignUpWithEmailPayload {
  fullName: string;
  email: string;
  password: string;
  phoneNumber?: string;
  defaultSubCity?: string;
  defaultLat?: number;
  defaultLng?: number;
  preferredLanguage?: 'en' | 'am' | 'om';
}

export interface UpdateAccountProfilePayload {
  fullName: string;
  phoneNumber?: string;
  preferredLanguage?: 'en' | 'am' | 'om';
  defaultSubCity?: string;
  defaultLat?: number;
  defaultLng?: number;
  profilePhotoUrl?: string;
}

interface AuthContextValue {
  firebaseUser: User | null;
  dbUser: DbUserRecord | null;
  loading: boolean;
  authError: string | null;
  authModalMode: AuthModalMode;
  openAuthModal: (mode?: 'signin' | 'signup') => void;
  closeAuthModal: () => void;
  clearAuthError: () => void;
  isAdmin: boolean;
  hasRole: (role: string) => boolean;
  refreshProfile: () => Promise<void>;
  signInWithGoogle: () => Promise<User | null>;
  signInWithEmail: (email: string, password: string) => Promise<User | null>;
  signUpWithEmail: (payload: SignUpWithEmailPayload) => Promise<User | null>;
  sendPasswordReset: (email: string) => Promise<boolean>;
  updateAccountProfile: (payload: UpdateAccountProfilePayload) => Promise<DbUserRecord | null>;
  updateAccountPassword: (currentPassword: string, newPassword: string) => Promise<boolean>;
  linkEmailPassword: (newPassword: string) => Promise<boolean>;
  logout: () => Promise<void>;
  authFetch: (
    url: string,
    options?: RequestInit
  ) => Promise<{ ok: boolean; status: number; json: () => Promise<any>; data: any }>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [firebaseUser, setFirebaseUser] = useState<User | null>(null);
  const [dbUser, setDbUser] = useState<DbUserRecord | null>(null);
  const [loading, setLoading] = useState(true);
  const [authError, setAuthError] = useState<string | null>(null);
  const [authModalMode, setAuthModalMode] = useState<AuthModalMode>(null);

  const getActiveBearerToken = async (forceRefresh = false): Promise<string | null> => {
    const current = auth.currentUser;
    if (current) {
      return current.getIdToken(forceRefresh);
    }
    return getStoredDbToken();
  };

  useEffect(() => {
    setApiTokenProvider(async () => getActiveBearerToken(false));
  }, []);

  const getUnifiedFailureMessage = (err: unknown): string => {
    const error = err as any;
    const code = error?.code as string | undefined;
    const backendMessage = error?.response?.data?.error || error?.response?.data?.message;
    const status = error?.response?.status;

    if (code === 'auth/popup-blocked') {
      return 'The browser blocked the Google sign-in popup. Allow popups for this site or sign in with your email and password.';
    }
    if (code === 'auth/popup-closed-by-user') {
      return 'Google sign-in was cancelled. You can try again or use your email and password.';
    }
    if (
      code === 'auth/unauthorized-domain' ||
      code === 'auth/operation-not-allowed' ||
      code === 'auth/configuration-not-found'
    ) {
      return 'Google sign-in is unavailable right now. Please sign in or create an account using your email and password.';
    }
    if (
      code === 'auth/invalid-credential' ||
      code === 'auth/wrong-password' ||
      code === 'auth/user-not-found' ||
      status === 401
    ) {
      return 'Invalid email or password. Please check your credentials and try again.';
    }
    if (code === 'auth/email-already-in-use' || status === 409) {
      return 'An account with this email already exists. Try signing in instead.';
    }
    if (code === 'auth/weak-password') {
      return 'Password is too weak. Use at least 6 characters.';
    }
    if (code === 'auth/invalid-email') {
      return 'Please enter a valid email address.';
    }
    if (code === 'auth/too-many-requests') {
      return 'Too many failed attempts. Please wait a moment and try again.';
    }
    if (code === 'auth/requires-recent-login') {
      return 'For security, please sign out and sign back in before changing your password.';
    }
    if (code === 'auth/network-request-failed') {
      return 'Unable to reach the sign-in service. Check your connection or try email and password.';
    }
    if (backendMessage && !/firebase/i.test(String(backendMessage))) {
      return String(backendMessage);
    }
    if (status === 403) {
      return 'Account is suspended by platform administration.';
    }
    if (status && status >= 500) {
      return 'Authentication service is temporarily unavailable. Please try again shortly.';
    }
    return error?.message && !/firebase/i.test(String(error.message))
      ? String(error.message)
      : 'Authentication failed. Please check your details and try again.';
  };

  const syncBackendProfile = async (
    user: User,
    forceRefresh = false,
    silent = false
  ): Promise<DbUserRecord | null> => {
    try {
      const token = await user.getIdToken(forceRefresh);
      const response = await api.get('/api/v1/auth/me', {
        headers: { Authorization: `Bearer ${token}` },
      });
      const synced: DbUserRecord = response.data.user;
      clearStoredDbToken();
      setDbUser(synced);
      setAuthError(null);
      return synced;
    } catch (err: unknown) {
      if (!silent) {
        console.error('[Nearest You Auth] Profile sync failed:', err);
        setAuthError(getUnifiedFailureMessage(err));
      }
      setDbUser(null);
      return null;
    }
  };

  const restoreDatabaseSession = async (): Promise<boolean> => {
    const dbToken = getStoredDbToken();
    if (!dbToken) return false;
    try {
      const response = await api.get('/api/v1/auth/me', {
        headers: { Authorization: `Bearer ${dbToken}` },
      });
      const synced: DbUserRecord | undefined = response.data?.user;
      if (synced) {
        setDbUser(synced);
        setFirebaseUser(buildSessionUserFromDb(synced));
        setAuthError(null);
        return true;
      }
      clearStoredDbToken();
      return false;
    } catch (err: any) {
      const status = err?.response?.status;
      if (status === 401 || status === 403) {
        clearStoredDbToken();
      }
      return false;
    }
  };

  const refreshProfile = async () => {
    const current = auth.currentUser;
    if (current) {
      await syncBackendProfile(current, false);
      return;
    }
    await restoreDatabaseSession();
  };

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(
      auth,
      async (user) => {
        if (user) {
          setFirebaseUser(user);
          await syncBackendProfile(user);
        } else {
          const restored = await restoreDatabaseSession();
          if (!restored) {
            setFirebaseUser(null);
            setDbUser(null);
          }
        }
        setLoading(false);
      },
      async (error) => {
        console.warn('[Nearest You Auth] Primary auth listener unavailable, checking session:', error);
        const restored = await restoreDatabaseSession();
        if (!restored) {
          setFirebaseUser(null);
          setDbUser(null);
        }
        setLoading(false);
      }
    );
    return () => unsubscribe();
  }, []);

  const openAuthModal = (mode: 'signin' | 'signup' = 'signin') => {
    setAuthError(null);
    setAuthModalMode(mode);
  };

  const closeAuthModal = () => {
    setAuthError(null);
    setAuthModalMode(null);
  };

  const clearAuthError = () => setAuthError(null);

  const signInWithGoogle = async () => {
    setAuthError(null);
    try {
      const cred = await signInWithPopup(auth, googleAuthProvider);
      const synced = await syncBackendProfile(cred.user);
      if (!synced) {
        await signOut(auth).catch(() => {});
        setFirebaseUser(null);
        setAuthError('Google sign-in could not be verified right now. Please sign in with your email and password.');
        return null;
      }
      setFirebaseUser(cred.user);
      setAuthModalMode(null);
      return cred.user;
    } catch (err: unknown) {
      console.warn('[Nearest You Auth] Google sign-in failed:', err);
      setAuthError(getUnifiedFailureMessage(err));
      return null;
    }
  };

  const signInWithEmail = async (email: string, password: string) => {
    setAuthError(null);
    const trimmedEmail = email.trim();
    let firebaseErr: unknown = null;

    // 1. Try primary auth provider first
    try {
      const cred = await signInWithEmailAndPassword(auth, trimmedEmail, password);
      const synced = await syncBackendProfile(cred.user, false, true);
      if (synced) {
        // Keep database password hash synchronized silently for cross-side sign-in continuity
        api
          .post(
            '/api/v1/auth/sync-credentials',
            { password },
            { headers: { Authorization: `Bearer ${await cred.user.getIdToken(false)}` } }
          )
          .catch(() => {});
        setFirebaseUser(cred.user);
        setAuthModalMode(null);
        return cred.user;
      }
      await signOut(auth).catch(() => {});
    } catch (err: unknown) {
      firebaseErr = err;
    }

    // 2. Transparent fallback to database email & password authentication
    try {
      const res = await userApi.login({ email: trimmedEmail, password });
      const token: string | undefined = res.data?.token;
      const user: DbUserRecord | undefined = res.data?.user;
      if (token && user) {
        setStoredDbToken(token);
        const sessionUser = buildSessionUserFromDb(user);
        setDbUser(user);
        setFirebaseUser(sessionUser);
        setAuthError(null);
        setAuthModalMode(null);
        return sessionUser;
      }
    } catch (dbErr: unknown) {
      const dbStatus = (dbErr as any)?.response?.status;
      if (dbStatus === 403) {
        setAuthError(getUnifiedFailureMessage(dbErr));
        return null;
      }
      if (!firebaseErr || (firebaseErr as any)?.code === 'auth/operation-not-allowed') {
        setAuthError(getUnifiedFailureMessage(dbErr));
        return null;
      }
      setAuthError(getUnifiedFailureMessage(dbErr || firebaseErr));
      return null;
    }

    setAuthError(getUnifiedFailureMessage(firebaseErr));
    return null;
  };

  const signUpWithEmail = async (payload: SignUpWithEmailPayload) => {
    setAuthError(null);
    const trimmedEmail = payload.email.trim();
    const trimmedName = payload.fullName.trim();

    // 1. Try primary auth provider first
    try {
      const cred = await createUserWithEmailAndPassword(auth, trimmedEmail, payload.password);
      if (trimmedName) {
        await updateProfile(cred.user, { displayName: trimmedName }).catch(() => {});
      }
      const token = await cred.user.getIdToken(true);
      const authMeRes = await api.get('/api/v1/auth/me', {
        headers: { Authorization: `Bearer ${token}` },
      });
      const profileRes = await api.put(
        '/api/v1/users/profile',
        {
          fullName: trimmedName,
          phoneNumber: payload.phoneNumber?.trim() || '',
          preferredLanguage: payload.preferredLanguage || 'en',
          defaultSubCity: payload.defaultSubCity || 'Bole',
          defaultLat: payload.defaultLat,
          defaultLng: payload.defaultLng,
        },
        { headers: { Authorization: `Bearer ${token}` } }
      );
      // Store BCrypt password hash in database too so user can sign in from either side
      if (!authMeRes.data?.user?.hasPassword) {
        await api
          .post(
            '/api/v1/auth/sync-credentials',
            { password: payload.password },
            { headers: { Authorization: `Bearer ${token}` } }
          )
          .catch(() => {});
      }

      clearStoredDbToken();
      if (profileRes.data?.user) {
        setDbUser(profileRes.data.user);
      } else {
        await syncBackendProfile(cred.user, false, true);
      }
      setFirebaseUser(auth.currentUser || cred.user);
      setAuthModalMode(null);
      return auth.currentUser || cred.user;
    } catch (err: any) {
      const code = err?.code as string | undefined;
      if (
        code === 'auth/email-already-in-use' ||
        code === 'auth/weak-password' ||
        code === 'auth/invalid-email'
      ) {
        setAuthError(getUnifiedFailureMessage(err));
        return null;
      }
      // Clean up partial client session before database registration fallback
      if (auth.currentUser) {
        await signOut(auth).catch(() => {});
      }
    }

    // 2. Transparent fallback to database registration
    try {
      const res = await userApi.register({
        fullName: trimmedName,
        email: trimmedEmail,
        password: payload.password,
        phoneNumber: payload.phoneNumber?.trim() || '',
        preferredLanguage: payload.preferredLanguage || 'en',
        defaultSubCity: payload.defaultSubCity || 'Bole',
        defaultLat: payload.defaultLat,
        defaultLng: payload.defaultLng,
      });
      const token: string | undefined = res.data?.token;
      const user: DbUserRecord | undefined = res.data?.user;
      if (token && user) {
        setStoredDbToken(token);
        const sessionUser = buildSessionUserFromDb(user);
        setDbUser(user);
        setFirebaseUser(sessionUser);
        setAuthError(null);
        setAuthModalMode(null);
        return sessionUser;
      }
      setAuthError('Account creation failed. Please try again.');
      return null;
    } catch (dbErr: unknown) {
      setAuthError(getUnifiedFailureMessage(dbErr));
      return null;
    }
  };

  const sendPasswordReset = async (email: string) => {
    setAuthError(null);
    try {
      await sendPasswordResetEmail(auth, email.trim());
      return true;
    } catch (err: any) {
      const code = err?.code as string | undefined;
      if (code === 'auth/invalid-email') {
        setAuthError('Please enter a valid email address.');
      } else {
        setAuthError(
          'Password reset email could not be sent right now. If you remember your current password, sign in and update it under Security.'
        );
      }
      return false;
    }
  };

  const updateAccountProfile = async (payload: UpdateAccountProfilePayload) => {
    setAuthError(null);
    const current = auth.currentUser;
    const dbToken = getStoredDbToken();
    if (!current && !dbToken) {
      setAuthError('You must be signed in to update your profile.');
      return null;
    }
    try {
      if (current && payload.fullName.trim()) {
        await updateProfile(current, {
          displayName: payload.fullName.trim(),
        }).catch(() => {});
      }
      const token = current ? await current.getIdToken(false) : dbToken!;
      const res = await api.put(
        '/api/v1/users/profile',
        {
          fullName: payload.fullName.trim(),
          phoneNumber: payload.phoneNumber?.trim() ?? '',
          preferredLanguage: payload.preferredLanguage,
          defaultSubCity: payload.defaultSubCity,
          defaultLat: payload.defaultLat,
          defaultLng: payload.defaultLng,
          profilePhotoUrl: payload.profilePhotoUrl,
        },
        { headers: { Authorization: `Bearer ${token}` } }
      );
      const updatedUser: DbUserRecord | null = res.data?.user || null;
      if (updatedUser) {
        setDbUser(updatedUser);
        if (!current) {
          setFirebaseUser(buildSessionUserFromDb(updatedUser));
        } else {
          setFirebaseUser(auth.currentUser);
        }
      } else if (current) {
        await syncBackendProfile(current, false);
      }
      return updatedUser;
    } catch (err: unknown) {
      setAuthError(getUnifiedFailureMessage(err));
      return null;
    }
  };

  const updateAccountPassword = async (currentPassword: string, newPassword: string) => {
    setAuthError(null);
    const current = auth.currentUser;
    const dbToken = getStoredDbToken();

    if (current && current.email) {
      let firebaseUpdated = false;
      try {
        const credential = EmailAuthProvider.credential(current.email, currentPassword);
        await reauthenticateWithCredential(current, credential);
        await updatePassword(current, newPassword);
        firebaseUpdated = true;
      } catch (err: any) {
        const code = err?.code as string | undefined;
        // If Firebase rejects because provider disabled or user only has DB password, try DB endpoint below
        if (code === 'auth/requires-recent-login' || code === 'auth/too-many-requests') {
          setAuthError(getUnifiedFailureMessage(err));
          return false;
        }
        if (code === 'auth/wrong-password' || code === 'auth/invalid-credential') {
          // Verify whether currentPassword matches DB password before failing
          try {
            const dbRes = await userApi.changePassword({ currentPassword, newPassword });
            if (dbRes.data?.user) setDbUser(dbRes.data.user);
            return true;
          } catch (dbErr) {
            setAuthError(getUnifiedFailureMessage(dbErr));
            return false;
          }
        }
      }

      if (firebaseUpdated) {
        await userApi.syncCredentials(newPassword).catch(() => {});
        return true;
      }
    }

    if (!current && !dbToken) {
      setAuthError('Signed-in account required to update password.');
      return false;
    }

    try {
      const res = await userApi.changePassword({ currentPassword, newPassword });
      if (res.data?.user) {
        setDbUser(res.data.user);
      }
      return true;
    } catch (err: unknown) {
      setAuthError(getUnifiedFailureMessage(err));
      return false;
    }
  };

  const linkEmailPassword = async (newPassword: string) => {
    setAuthError(null);
    const current = auth.currentUser;
    const dbToken = getStoredDbToken();
    if (!current && !dbToken) {
      setAuthError('Signed-in account is required.');
      return false;
    }

    if (current && current.email) {
      try {
        const credential = EmailAuthProvider.credential(current.email, newPassword);
        await linkWithCredential(current, credential);
        setFirebaseUser(auth.currentUser);
      } catch {
        /* Fallback cleanly to storing password in database so email+password sign-in works */
      }
    }

    try {
      const res = await userApi.changePassword({ newPassword });
      if (res.data?.user) {
        setDbUser(res.data.user);
      }
      return true;
    } catch (err: unknown) {
      setAuthError(getUnifiedFailureMessage(err));
      return false;
    }
  };

  const logout = async () => {
    clearStoredDbToken();
    await signOut(auth).catch(() => {});
    setFirebaseUser(null);
    setDbUser(null);
    setAuthError(null);
  };

  // Compatibility adapter for existing components. All HTTP traffic is Axios-based.
  const authFetch = async (url: string, options: RequestInit = {}) => {
    const current = auth.currentUser;
    const dbToken = getStoredDbToken();
    if (!current && !dbToken) throw new Error('AUTH_REQUIRED');

    const execute = async (forceRefresh: boolean) => {
      const token = current ? await current.getIdToken(forceRefresh) : getStoredDbToken();
      if (!token) throw new Error('AUTH_REQUIRED');
      const headers = new Headers(options.headers || {});
      headers.set('Authorization', `Bearer ${token}`);
      const method = (options.method || 'GET').toUpperCase();
      let data: any = options.body;
      if (typeof data === 'string') {
        try {
          data = JSON.parse(data);
        } catch {
          /* retain non-JSON body */
        }
      }
      try {
        const response = await api.request({
          url,
          method,
          data: method === 'GET' || method === 'HEAD' ? undefined : data,
          headers: Object.fromEntries(headers.entries()),
        });
        return {
          ok: true,
          status: response.status,
          data: response.data,
          json: async () => response.data,
        };
      } catch (error: any) {
        const response = error?.response;
        if (!response) throw error;
        return {
          ok: false,
          status: response.status,
          data: response.data,
          json: async () => response.data,
        };
      }
    };
    const first = await execute(false);
    return first.status === 401 && current ? execute(true) : first;
  };

  const isAdmin = Boolean(
    dbUser?.isAdmin ||
      dbUser?.roles?.includes('ADMIN') ||
      dbUser?.roles?.includes('SUPER_ADMIN')
  );

  const hasRole = (role: string) => {
    if (!dbUser) return false;
    if (isAdmin) return true;
    return Boolean(dbUser.roles?.includes(role));
  };

  return (
    <AuthContext.Provider
      value={{
        firebaseUser,
        dbUser,
        loading,
        authError,
        authModalMode,
        openAuthModal,
        closeAuthModal,
        clearAuthError,
        isAdmin,
        hasRole,
        refreshProfile,
        signInWithGoogle,
        signInWithEmail,
        signUpWithEmail,
        sendPasswordReset,
        updateAccountProfile,
        updateAccountPassword,
        linkEmailPassword,
        logout,
        authFetch,
      }}
    >
      {authError && authModalMode === null && (
        <div
          role="alert"
          aria-live="assertive"
          className="fixed left-1/2 top-4 z-[1000] flex w-[min(92vw,680px)] -translate-x-1/2 items-start gap-3 rounded-xl border border-red-300 bg-red-50 px-4 py-3 text-sm text-red-900 shadow-xl"
        >
          <span className="mt-0.5 shrink-0 font-bold">Authentication issue:</span>
          <span className="min-w-0 flex-1 break-words">{authError}</span>
          <button
            type="button"
            aria-label="Dismiss authentication error"
            onClick={() => setAuthError(null)}
            className="shrink-0 rounded px-2 py-1 font-semibold hover:bg-red-100"
          >
            Dismiss
          </button>
        </div>
      )}
      {children}
    </AuthContext.Provider>
  );
};

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside AuthProvider');
  return ctx;
}
