import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AuthProvider, useAuth } from './context/AuthContext.tsx';
import { TopBar, type AppSection } from './components/TopBar.tsx';
import { CustomerDiscoverView } from './components/CustomerDiscoverView.tsx';
import { DeliveryTransportView } from './components/DeliveryTransportView.tsx';
import { CustomerActivityView, type ActivityTab } from './components/CustomerActivityView.tsx';
import { BusinessPortalView, type BusinessPortalTab } from './components/BusinessPortalView.tsx';
import { AdminPortalView } from './components/AdminPortalView.tsx';
import { CartDrawer } from './components/CartDrawer.tsx';
import { CompareDrawer } from './components/CompareDrawer.tsx';
import { ListingDetailModal } from './components/ListingDetailModal.tsx';
import { AuthModal } from './components/AuthModal.tsx';
import { AccountProfileModal } from './components/AccountProfileModal.tsx';
import { JobSeekerAdvertiseModal } from './components/JobSeekerAdvertiseModal.tsx';
import { PaymentGatewayModal } from './components/PaymentGatewayModal.tsx';
import type { AppNotification, NotificationKind } from './components/NotificationCenter.tsx';
import { useLiveChatInboxListener } from './hooks/useLiveChat.ts';
import type { AppLanguage } from './utils/i18n.ts';
import { catalogApi, engagementApi, mapsApi, paymentApi, userApi } from './api/index.ts';
import type {
  BookingRecord,
  Business,
  CartItem,
  Category,
  CategoryDocumentRequirement,
  DetectedLocation,
  KnownLocationRecord,
  Listing,
  LiveProviderPublicMarker,
  OnboardingGovernance,
  OrderRecord,
  PaymentInitTarget,
  PlatformPolicy,
  RecommendedListingItem,
  ReviewItem,
} from './types/nearestyou.ts';

const DEFAULT_POLICY: PlatformPolicy = {
  currency: 'ETB',
  taxRatePercent: 15,
  defaultCommissionPercent: 10,
  deliveryBaseFee: 80,
  deliveryPerKmRate: 25,
  expressMultiplier: 1.4,
  rideBaseFare: 100,
  ridePerKmRate: 35,
  deliveryMatchRadiusKm: 5,
};

const DEFAULT_GOVERNANCE: OnboardingGovernance = {
  minAccountAgeDays: 30,
  qrExpiryMinutes: 10,
  allowedVoucherRoles: [
    'BUSINESS_OWNER',
    'DELIVERY_PARTNER',
    'PROVIDER',
    'PEER_VOUCHER',
    'PROVIDER_APPROVER',
    'ADMIN',
    'SUPER_ADMIN',
  ],
  exceptionalVoucherRoles: ['PEER_VOUCHER', 'ADMIN', 'SUPER_ADMIN'],
  allowedApproverRoles: ['ADMIN', 'SUPER_ADMIN', 'PROVIDER_APPROVER'],
  requirePeerQrAfterFirstProvider: true,
};

const ROUTINE_NON_NOTIFICATION_RE =
  /^(Added ".*" to cart\.|You cannot order your own advertisement\.|You can compare up to 3 listings|Welcome back,|Account created for |Signed in as |Signed out\.|Profile updated\.|Account security updated\.|Password reset link sent|Exact location updated|Browser GPS is unavailable|Browser geolocation is unavailable|GPS permission not granted|Could not access GPS|Updated your ad coordinates|Live GPS ping sent|Real-time service GPS broadcast updated|Unable to read device GPS|QR voucher token copied\.|Alive \/ Liveness biometric test passed|Liveness verification frame sealed\.|Fresh .*Peer QR voucher generated\.|Saved changes to |Removed "|".*" marked (AVAILABLE|UNAVAILABLE|ACTIVE|PAUSED|INACTIVE)|Service ".*" (marked|deleted)|Document Type ".*" (marked|deleted)|Mapped ".*" to service|Service document mapping removed|Platform pricing.*updated|Onboarding Peer QR.*saved|User .* marked |.* Admin access (granted|revoked)|Updated roles for |.* early vouch|Enter a Delivery Tracking Code|Select or pin both Start|Enter the 6-digit handover OTP|Register and select an active Document Type first|Verified transaction review published\.)/i;

function classifyNecessaryNotification(
  rawMessage: string,
  explicitKind?: NotificationKind
): { necessary: true; kind: NotificationKind; defaultTitle: string } | { necessary: false } {
  const msg = rawMessage.trim();
  if (!msg) return { necessary: false };

  if (explicitKind === 'message') {
    return { necessary: true, kind: 'message', defaultTitle: 'Message Delivered' };
  }
  if (explicitKind === 'offer') {
    return { necessary: true, kind: 'offer', defaultTitle: 'Offer & Request Delivered' };
  }
  if (explicitKind === 'error') {
    return { necessary: true, kind: 'error', defaultTitle: 'Connection Notice' };
  }

  if (ROUTINE_NON_NOTIFICATION_RE.test(msg)) {
    return { necessary: false };
  }

  if (/\b(new message|message delivered|chat reply|replied to)\b/i.test(msg)) {
    return { necessary: true, kind: 'message', defaultTitle: 'Message Delivered' };
  }

  if (
    /\b(order|booking|service request|application offer|revised quotation|quotation|escrow|conflict|counter-statement|dispatched|assignment updated|kyc submitted|first-provider registration|peer authenticated|provider registration|provider kyc|provider authority|business verification|business approval|registered with live coordinates|applicant status)\b/i.test(
      msg
    )
  ) {
    return { necessary: true, kind: 'offer', defaultTitle: 'Offer & Request Delivered' };
  }

  if (
    /\b(connection error|failed to|could not|unable to|transition rejected|approval action failed|request failed)\b/i.test(
      msg
    )
  ) {
    return { necessary: true, kind: 'error', defaultTitle: 'Connection Notice' };
  }

  return { necessary: false };
}

function filterNecessaryNotifications(items: unknown): AppNotification[] {
  if (!Array.isArray(items)) return [];
  return items.filter(
    (item): item is AppNotification =>
      Boolean(item) &&
      typeof item === 'object' &&
      typeof (item as AppNotification).message === 'string' &&
      ((item as AppNotification).kind === 'message' ||
        (item as AppNotification).kind === 'offer' ||
        (item as AppNotification).kind === 'error') &&
      !ROUTINE_NON_NOTIFICATION_RE.test((item as AppNotification).message.trim())
  );
}

const INITIAL_LOCATION: DetectedLocation = {
  lat: 9.005401,
  lng: 38.763611,
  label: 'Addis Ababa',
  subCity: '',
  city: 'Addis Ababa',
  source: 'CITY_CENTER',
  accuracyMode: 'APPROXIMATE',
};

function NearestYouWorkspace() {
  const { firebaseUser, dbUser, isAdmin, openAuthModal } = useAuth();
  const [activeSection, setActiveSection] = useState<AppSection>('discover');
  const [businessInitialTab, setBusinessInitialTab] = useState<BusinessPortalTab>(
    'PROVIDER_KYC'
  );
  const [activityNav, setActivityNav] = useState<{
    tab?: ActivityTab;
    threadKey?: string | null;
    signal: number;
  }>({ signal: 0 });
  const [businessNav, setBusinessNav] = useState<{
    tab?: BusinessPortalTab;
    threadKey?: string | null;
    signal: number;
  }>({ signal: 0 });
  const [categories, setCategories] = useState<Category[]>([]);
  const [documentRequirements, setDocumentRequirements] = useState<CategoryDocumentRequirement[]>(
    []
  );
  const [businesses, setBusinesses] = useState<Business[]>([]);
  const [listings, setListings] = useState<Listing[]>([]);
  const [liveProviders, setLiveProviders] = useState<LiveProviderPublicMarker[]>([]);
  const [recommendations, setRecommendations] = useState<RecommendedListingItem[]>([]);
  const [reviews, setReviews] = useState<ReviewItem[]>([]);
  const [knownLocations, setKnownLocations] = useState<KnownLocationRecord[]>([]);
  const [policy, setPolicy] = useState<PlatformPolicy>(DEFAULT_POLICY);
  const [governance, setGovernance] = useState<OnboardingGovernance>(DEFAULT_GOVERNANCE);
  const [loadingCatalog, setLoadingCatalog] = useState(true);
  const [catalogError, setCatalogError] = useState<string | null>(null);

  const [detectedLocation, setDetectedLocation] = useState<DetectedLocation>(INITIAL_LOCATION);
  const [detectingLocation, setDetectingLocation] = useState<boolean>(true);
  const [gpsError, setGpsError] = useState<string | null>(null);
  const exactGpsRef = useRef<{ lat: number; lng: number } | null>(null);

  const [profileSubCity, setProfileSubCity] = useState<string>('Addis Ababa');
  const [language, setLanguage] = useState<AppLanguage>(() => {
    const saved = typeof window !== 'undefined' ? window.localStorage.getItem('ny_lang') : null;
    return saved === 'am' || saved === 'om' ? saved : 'en';
  });
  const handleChangeLanguage = useCallback(
    (nextLang: AppLanguage) => {
      setLanguage(nextLang);
      try {
        window.localStorage.setItem('ny_lang', nextLang);
      } catch {}
      if (firebaseUser) {
        userApi.updateProfile({ preferredLanguage: nextLang }).catch(() => {});
      }
    },
    [firebaseUser]
  );
  const [cart, setCart] = useState<CartItem[]>([]);
  const [compareIds, setCompareIds] = useState<number[]>([]);
  const [favoriteIds, setFavoriteIds] = useState<number[]>([]);

  const [cartOpen, setCartOpen] = useState(false);
  const [compareOpen, setCompareOpen] = useState(false);
  const [accountOpen, setAccountOpen] = useState(false);
  const [jobSeekerModalOpen, setJobSeekerModalOpen] = useState(false);
  const [selectedListing, setSelectedListing] = useState<Listing | null>(null);
  const [listingInitialEditMode, setListingInitialEditMode] = useState(false);
  const [notificationsInboxOpen, setNotificationsInboxOpen] = useState(false);
  const [paymentTargets, setPaymentTargets] = useState<PaymentInitTarget[]>([]);
  const [paymentRefreshSignal, setPaymentRefreshSignal] = useState(0);

  const notificationStorageKey = `ny_notifications_v2_${dbUser?.uid || 'guest'}`;
  const dismissedStorageKey = `ny_dismissed_notif_ids_${dbUser?.uid || 'guest'}`;
  const dismissedEventIdsRef = useRef<Set<string>>(new Set());

  const [notifications, setNotifications] = useState<AppNotification[]>(() => {
    if (typeof window === 'undefined') return [];
    try {
      const raw = window.localStorage.getItem('ny_notifications_v2_guest');
      if (!raw) return [];
      return filterNecessaryNotifications(JSON.parse(raw));
    } catch {
      return [];
    }
  });
  const notificationsRef = useRef(notifications);
  notificationsRef.current = notifications;

  useEffect(() => {
    if (typeof window === 'undefined') return;
    try {
      const rawDismissed = window.localStorage.getItem(dismissedStorageKey);
      if (rawDismissed) {
        const parsed = JSON.parse(rawDismissed);
        dismissedEventIdsRef.current = Array.isArray(parsed)
          ? new Set(parsed.filter((x): x is string => typeof x === 'string'))
          : new Set();
      } else {
        dismissedEventIdsRef.current = new Set();
      }
    } catch {
      dismissedEventIdsRef.current = new Set();
    }
    try {
      const raw = window.localStorage.getItem(notificationStorageKey);
      if (raw) {
        setNotifications(filterNecessaryNotifications(JSON.parse(raw)));
        return;
      }
      setNotifications([]);
    } catch {
      setNotifications([]);
    }
  }, [notificationStorageKey, dismissedStorageKey]);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    try {
      const serializable = notifications.slice(-30).map(({ onAction: _omit, ...rest }) => rest);
      window.localStorage.setItem(notificationStorageKey, JSON.stringify(serializable));
    } catch {
      /* ignore storage quota errors */
    }
  }, [notifications, notificationStorageKey]);

  const recordDismissedEventIds = useCallback(
    (eventIds: Array<string | undefined>) => {
      const valid = eventIds.filter((x): x is string => Boolean(x && x.trim()));
      if (valid.length === 0) return;
      valid.forEach((id) => dismissedEventIdsRef.current.add(id));
      if (dismissedEventIdsRef.current.size > 200) {
        dismissedEventIdsRef.current = new Set(
          Array.from(dismissedEventIdsRef.current).slice(-200)
        );
      }
      if (typeof window !== 'undefined') {
        try {
          window.localStorage.setItem(
            dismissedStorageKey,
            JSON.stringify(Array.from(dismissedEventIdsRef.current))
          );
        } catch {
          /* ignore quota error */
        }
      }
    },
    [dismissedStorageKey]
  );

  const markNotificationRead = useCallback(
    (id: string) => {
      const target = notificationsRef.current.find((item) => item.id === id);
      if (target?.eventId) {
        recordDismissedEventIds([target.eventId]);
      }
      setNotifications((prev) =>
        prev.map((item) => (item.id === id ? { ...item, read: true } : item))
      );
    },
    [recordDismissedEventIds]
  );

  const markAllNotificationsRead = useCallback(() => {
    recordDismissedEventIds(notificationsRef.current.map((item) => item.eventId));
    setNotifications((prev) => prev.map((item) => ({ ...item, read: true })));
  }, [recordDismissedEventIds]);

  const clearReadNotifications = useCallback(() => {
    recordDismissedEventIds(
      notificationsRef.current.filter((item) => item.read).map((item) => item.eventId)
    );
    setNotifications((prev) => prev.filter((item) => !item.read));
  }, [recordDismissedEventIds]);

  const pushNotification = useCallback(
    (
      input:
        | string
        | {
            eventId?: string;
            kind?: NotificationKind;
            title?: string;
            message: string;
            actionLabel?: string;
            actionTarget?: AppSection;
            targetTab?: string;
            threadKey?: string;
            onAction?: () => void;
          }
    ) => {
      const rawMessage = typeof input === 'string' ? input : input.message;
      const explicitKind = typeof input !== 'string' ? input.kind : undefined;
      const classification = classifyNecessaryNotification(rawMessage, explicitKind);
      if (!classification.necessary) {
        return;
      }

      const eventId = typeof input !== 'string' ? input.eventId : undefined;
      if (eventId && dismissedEventIdsRef.current.has(eventId)) {
        return;
      }

      const id = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
      const timestamp = new Date().toLocaleTimeString([], {
        hour: '2-digit',
        minute: '2-digit',
      });

      const entry: AppNotification = {
        id,
        eventId,
        kind: classification.kind,
        title: (typeof input !== 'string' && input.title) || classification.defaultTitle,
        message: rawMessage,
        timestamp,
        read: false,
        actionLabel: typeof input !== 'string' ? input.actionLabel : undefined,
        actionTarget: typeof input !== 'string' ? input.actionTarget : undefined,
        targetTab: typeof input !== 'string' ? input.targetTab : undefined,
        threadKey: typeof input !== 'string' ? input.threadKey : undefined,
        onAction: typeof input !== 'string' ? input.onAction : undefined,
      };

      setNotifications((prev) => {
        if (eventId && prev.some((n) => n.eventId === eventId)) {
          return prev;
        }
        return [...prev.slice(-29), entry];
      });
    },
    []
  );

  const isVerifiedProvider =
    dbUser?.providerVerificationStatus === 'VERIFIED' || Boolean(dbUser?.isAdmin);

  const executeNotificationAction = useCallback(
    (item: AppNotification) => {
      markNotificationRead(item.id);
      setSelectedListing(null);
      setCartOpen(false);
      setCompareOpen(false);
      setAccountOpen(false);
      setJobSeekerModalOpen(false);
      setNotificationsInboxOpen(false);

      if (item.actionTarget === 'business') {
        const resolvedTab =
          (item.targetTab as BusinessPortalTab | undefined) ||
          (item.kind === 'message' || item.threadKey
            ? 'MESSAGES'
            : isVerifiedProvider
              ? 'CATALOG'
              : 'PROVIDER_KYC');
        setBusinessNav((prev) => ({
          tab: resolvedTab,
          threadKey: item.threadKey ?? null,
          signal: prev.signal + 1,
        }));
        setActiveSection('business');
        return;
      }

      if (item.actionTarget === 'activity') {
        const resolvedTab =
          (item.targetTab as ActivityTab | undefined) ||
          (item.kind === 'message' || item.threadKey ? 'MESSAGES' : 'ORDERS');
        setActivityNav((prev) => ({
          tab: resolvedTab,
          threadKey: item.threadKey ?? null,
          signal: prev.signal + 1,
        }));
        setActiveSection('activity');
        return;
      }

      if (item.actionTarget) {
        setActiveSection(item.actionTarget);
        return;
      }

      if (item.threadKey) {
        setActivityNav((prev) => ({
          tab: 'MESSAGES',
          threadKey: item.threadKey ?? null,
          signal: prev.signal + 1,
        }));
        setActiveSection('activity');
        return;
      }

      if (item.onAction) {
        item.onAction();
      }
    },
    [markNotificationRead, isVerifiedProvider]
  );

  const notify = useCallback(
    (msg: string) => {
      pushNotification(msg);
    },
    [pushNotification]
  );

  useEffect(() => {
    if (dbUser?.defaultSubCity) {
      setProfileSubCity(dbUser.defaultSubCity);
    }
  }, [dbUser?.defaultSubCity]);

  useEffect(() => {
    if (!firebaseUser && activeSection !== 'discover') {
      setActiveSection('discover');
      return;
    }
    if (activeSection === 'admin' && (!firebaseUser || !isAdmin)) {
      setActiveSection('discover');
    }
  }, [activeSection, firebaseUser, isAdmin]);

  const loadCatalog = useCallback(async (coords?: { lat: number; lng: number }) => {
    setCatalogError(null);
    const targetCoords = coords || exactGpsRef.current || undefined;
    try {
      const response = await catalogApi.getCatalog(targetCoords);
      const data = response.data;
      const staleNonGpsResult = !coords && !targetCoords && Boolean(exactGpsRef.current);
      setCategories(data.categories || []);
      setDocumentRequirements(data.documentRequirements || []);
      setBusinesses(data.businesses || []);
      setListings(data.listings || []);
      setLiveProviders(data.liveProviders || []);
      if (!staleNonGpsResult) {
        setRecommendations(data.recommendations || []);
      }
      setReviews(data.reviews || []);
      if (Array.isArray(data.knownLocations)) {
        setKnownLocations(data.knownLocations);
      }
      if (!staleNonGpsResult && data.detectedLocation) {
        setDetectedLocation(data.detectedLocation);
        if (data.detectedLocation.subCity) {
          setProfileSubCity((prev) =>
            prev === 'Addis Ababa' ? data.detectedLocation.subCity : prev
          );
        }
      }
      const policyRow = (data.settings || []).find(
        (s: { settingKey: string; settingValue: PlatformPolicy }) =>
          s.settingKey === 'pricing_policy'
      );
      if (policyRow?.settingValue) {
        setPolicy({ ...DEFAULT_POLICY, ...policyRow.settingValue });
      }
      if (data.onboardingGovernance) {
        setGovernance({ ...DEFAULT_GOVERNANCE, ...data.onboardingGovernance });
      }
    } catch (err: unknown) {
      setCatalogError(err instanceof Error ? err.message : 'Failed to load the catalog from the API.');
    } finally {
      setLoadingCatalog(false);
    }
  }, []);

  const firebaseUserRef = useRef(firebaseUser);
  firebaseUserRef.current = firebaseUser;

  const detectExactLocation = useCallback((userTriggered = false) => {
    if (typeof navigator === 'undefined' || !navigator.geolocation) {
      setDetectingLocation(false);
      if (userTriggered) {
        setGpsError('Browser geolocation is unavailable on this device.');
      }
      return;
    }

    setGpsError(null);
    setDetectingLocation(true);
    let settled = false;
    const safetyTimer = window.setTimeout(
      () => {
        if (!settled) {
          settled = true;
          setDetectingLocation(false);
          if (userTriggered) {
            setGpsError(
              'Exact GPS took too long to respond. Showing all listings; click Update Exact GPS to retry.'
            );
          }
        }
      },
      userTriggered ? 13000 : 5000
    );

    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        if (settled) return;
        settled = true;
        window.clearTimeout(safetyTimer);

        const lat = Number(pos.coords.latitude.toFixed(6));
        const lng = Number(pos.coords.longitude.toFixed(6));
        const accuracyMeters = Number.isFinite(pos.coords.accuracy)
          ? Math.round(pos.coords.accuracy)
          : undefined;
        exactGpsRef.current = { lat, lng };

        // Immediately apply GPS coordinates so already-rendered listings re-order nearest-first right away
        setDetectedLocation((prev) => ({
          ...prev,
          lat,
          lng,
          label: `${lat.toFixed(5)}, ${lng.toFixed(5)}`,
          source: 'GPS',
          accuracyMode: 'EXACT',
          accuracyMeters,
        }));
        setDetectingLocation(false);

        try {
          const [recResult, browserGeoResult] = await Promise.allSettled([
            catalogApi.getRecommendations({ lat, lng, limit: 6 }),
            mapsApi.reverseGeocode(lat, lng),
          ]);

          const recData = recResult.status === 'fulfilled' ? recResult.value.data : null;
          const browserGeo =
            browserGeoResult.status === 'fulfilled' ? browserGeoResult.value.data : null;

          const backendLoc = recData?.detectedLocation;
          const exactLabel =
            (browserGeo?.exactLabel && browserGeo.exactLabel.trim()) ||
            (backendLoc?.label && backendLoc.label.trim()) ||
            `${lat.toFixed(5)}, ${lng.toFixed(5)}`;
          const resolvedSubCity =
            (browserGeo?.subCity && browserGeo.subCity.trim()) ||
            (backendLoc?.subCity && backendLoc.subCity.trim()) ||
            '';
          const resolvedCity =
            (browserGeo?.city && browserGeo.city.trim()) ||
            (backendLoc?.city && backendLoc.city.trim()) ||
            'Addis Ababa';

          setDetectedLocation({
            lat,
            lng,
            label: exactLabel,
            subCity: resolvedSubCity,
            city: resolvedCity,
            source: 'GPS',
            accuracyMode: 'EXACT',
            accuracyMeters,
          });

          if (resolvedSubCity) {
            setProfileSubCity((prev) => (prev === 'Addis Ababa' ? resolvedSubCity : prev));
          }

          if (firebaseUserRef.current) {
            userApi
              .updateProfile({
                defaultLat: lat,
                defaultLng: lng,
                defaultSubCity: resolvedSubCity || undefined,
              })
              .catch(() => {});
          }

          if (Array.isArray(recData?.recommendations)) {
            setRecommendations(recData.recommendations);
          }
        } catch {
          // Coordinates already applied above; reverse-geocode label stays coordinate fallback
        }
      },
      (err) => {
        if (settled) return;
        settled = true;
        window.clearTimeout(safetyTimer);
        setDetectingLocation(false);
        if (userTriggered) {
          if (err.code === err.PERMISSION_DENIED) {
            setGpsError(
              'Location permission denied. Allow GPS access in your browser settings to show your exact location.'
            );
          } else if (err.code === err.TIMEOUT) {
            setGpsError(
              'Exact GPS timed out. Enable device location services and click Update Exact GPS again.'
            );
          } else {
            setGpsError('Could not acquire exact GPS coordinates on this device.');
          }
        }
      },
      {
        enableHighAccuracy: userTriggered,
        timeout: userTriggered ? 12000 : 4500,
        maximumAge: userTriggered ? 0 : 120000,
      }
    );
  }, []);

  useEffect(() => {
    void loadCatalog();
    detectExactLocation(false);
  }, [loadCatalog, detectExactLocation]);

  useEffect(() => {
    if (firebaseUser) {
      userApi
        .getWorkspace()
        .then((r) => r.data)
        .then((data) => {
          if (data?.favorites) {
            setFavoriteIds(data.favorites.map((f: { listingId: number }) => f.listingId));
          }
        })
        .catch(() => {});
    } else {
      setFavoriteIds([]);
    }
  }, [firebaseUser]);

  const businessMap = useMemo(() => {
    const m = new Map<number, Business>();
    businesses.forEach((b) => m.set(b.id, b));
    return m;
  }, [businesses]);

  const handleAddToCart = (listing: Listing, business: Business, variant?: string) => {
    const isOwnListing = Boolean(
      business.ownerUid &&
        ((dbUser?.uid && business.ownerUid === dbUser.uid) ||
          (firebaseUser?.uid && business.ownerUid === firebaseUser.uid))
    );
    if (isOwnListing) {
      setListingInitialEditMode(false);
      setSelectedListing(listing);
      return;
    }
    setCart((prev) => {
      const idx = prev.findIndex((i) => i.listing.id === listing.id && i.variant === variant);
      if (idx >= 0) {
        const next = [...prev];
        next[idx] = { ...next[idx], quantity: next[idx].quantity + 1 };
        return next;
      }
      return [...prev, { listing, business, quantity: 1, variant }];
    });
  };

  const handleUpdateQty = (listingId: number, delta: number) => {
    setCart((prev) =>
      prev
        .map((i) => (i.listing.id === listingId ? { ...i, quantity: i.quantity + delta } : i))
        .filter((i) => i.quantity > 0)
    );
  };

  const handleToggleCompare = (id: number) => {
    setCompareIds((prev) => {
      if (prev.includes(id)) return prev.filter((x) => x !== id);
      if (prev.length >= 3) {
        return prev;
      }
      return [...prev, id];
    });
  };

  const handleToggleFavorite = async (id: number) => {
    if (!firebaseUser) {
      openAuthModal('signin');
      return;
    }
    const response = await engagementApi.toggleFavorite(id);
    if (response.status >= 200 && response.status < 300) {
      const data = response.data;
      setFavoriteIds((prev) => (data.saved ? [...prev, id] : prev.filter((x) => x !== id)));
    }
  };

  const cartCount = cart.reduce((s, i) => s + i.quantity, 0);
  const comparedListings = listings.filter((l) => compareIds.includes(l.id));
  const activeLocationLabel = detectedLocation.label || detectedLocation.city || 'Addis Ababa';

  useEffect(() => {
    if (!firebaseUser || !dbUser) return;
    userApi.heartbeat().catch(() => {});
    const timer = window.setInterval(() => {
      userApi.heartbeat().catch(() => {});
    }, 30000);
    return () => window.clearInterval(timer);
  }, [firebaseUser, dbUser?.uid]);

  useEffect(() => {
    if (!firebaseUser || typeof window === 'undefined') return;
    const params = new URLSearchParams(window.location.search);
    const txRef = params.get('paymentTxRef') || params.get('trx_ref');
    if (!txRef) return;
    params.delete('paymentTxRef');
    params.delete('trx_ref');
    const cleanSearch = params.toString();
    const cleanUrl = `${window.location.pathname}${cleanSearch ? `?${cleanSearch}` : ''}${window.location.hash}`;
    window.history.replaceState({}, '', cleanUrl);
    paymentApi
      .verify(txRef)
      .then((res) => {
        const tx = res.data;
        pushNotification({
          eventId: `payment:${tx.txRef}:${tx.status}`,
          kind: 'offer',
          title: `Payment ${tx.status} · ${tx.gateway}`,
          message: `${tx.referenceCode} settled (${Number(tx.grossAmount).toLocaleString()} ETB).`,
          actionLabel: 'View Activity',
          actionTarget: 'activity',
          targetTab: tx.transactionType === 'BOOKING' ? 'BOOKINGS' : tx.transactionType === 'ORDER' ? 'ORDERS' : 'DELIVERIES',
        });
        setPaymentRefreshSignal((n) => n + 1);
      })
      .catch(() => {});
  }, [firebaseUser, pushNotification]);

  useEffect(() => {
    if (!firebaseUser || !dbUser?.uid) return;
    let cancelled = false;
    engagementApi
      .getPendingNotifications()
      .then((res) => {
        if (cancelled) return;
        const list = Array.isArray(res.data) ? res.data : [];
        for (const row of list) {
          if (!row || typeof row !== 'object' || typeof row.message !== 'string') continue;
          const kind: NotificationKind =
            row.kind === 'message' || row.kind === 'error' || row.kind === 'offer'
              ? row.kind
              : 'offer';
          const actionTarget: AppSection | undefined =
            row.actionTarget === 'business' ||
            row.actionTarget === 'activity' ||
            row.actionTarget === 'delivery' ||
            row.actionTarget === 'discover' ||
            row.actionTarget === 'admin'
              ? row.actionTarget
              : undefined;
          pushNotification({
            eventId: typeof row.eventId === 'string' ? row.eventId : undefined,
            kind,
            title: typeof row.title === 'string' ? row.title : undefined,
            message: row.message,
            actionLabel: typeof row.actionLabel === 'string' ? row.actionLabel : undefined,
            actionTarget,
            targetTab: typeof row.targetTab === 'string' ? row.targetTab : undefined,
            threadKey: typeof row.threadKey === 'string' ? row.threadKey : undefined,
          });
        }
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [firebaseUser, dbUser?.uid, pushNotification]);

  const myUids = useMemo(
    () =>
      new Set(
        [dbUser?.uid, dbUser?.firebaseUid, firebaseUser?.uid].filter(Boolean) as string[]
      ),
    [dbUser?.uid, dbUser?.firebaseUid, firebaseUser?.uid]
  );

  useLiveChatInboxListener(Boolean(firebaseUser && dbUser), {
    onIncomingMessage: (incomingMsg, meta) => {
      if (myUids.size === 0 || myUids.has(incomingMsg.senderUid)) return;
      const ownsBusiness = meta?.ownerUid
        ? myUids.has(meta.ownerUid)
        : businesses.some((b) => b.id === incomingMsg.businessId && myUids.has(b.ownerUid));
      const threadKey =
        meta?.threadKey ||
        incomingMsg.threadKey ||
        (incomingMsg.orderId
          ? `order:${incomingMsg.orderId}`
          : incomingMsg.bookingId
            ? `booking:${incomingMsg.bookingId}`
            : `contact:${incomingMsg.businessId}:${incomingMsg.listingId || 0}:${incomingMsg.senderUid}`);
      const targetSection: AppSection = ownsBusiness ? 'business' : 'activity';
      pushNotification({
        eventId: `msg:${incomingMsg.id}`,
        kind: 'message',
        title: `New Message · ${incomingMsg.senderName}`,
        message:
          incomingMsg.body.length > 96
            ? `${incomingMsg.body.slice(0, 93)}...`
            : incomingMsg.body,
        actionLabel: 'Open Message',
        actionTarget: targetSection,
        targetTab: 'MESSAGES',
        threadKey,
      });
    },
    onContractUpdated: (contract, event) => {
      if (myUids.size === 0) return;
      if (event?.actorUid) {
        if (myUids.has(event.actorUid)) return;
      } else if (myUids.has(contract.offeredByUid)) {
        return;
      }
      const ownsBusiness = myUids.has(contract.serviceGiverUid);
      const targetSection: AppSection = ownsBusiness ? 'business' : 'activity';
      pushNotification({
        eventId: `contract:${contract.id}:${contract.status}`,
        kind: 'offer',
        title: `Contract ${contract.status} · ${contract.contractReference}`,
        message: `${contract.title} · ${Number(contract.agreedAmount).toLocaleString()} ETB (${contract.contractType.replace(/_/g, ' ')})`,
        actionLabel: 'Open Contract',
        actionTarget: targetSection,
        targetTab: 'MESSAGES',
        threadKey: contract.threadKey,
      });
    },
    onOrderUpdated: (event) => {
      if (myUids.size === 0) return;
      if (event.actorUid && myUids.has(event.actorUid)) return;
      const o = event.order;
      const status = (o.orderStatus || '').toUpperCase();
      const threadKey = event.threadKey || `order:${o.id}`;
      const isReceiver = Boolean(event.ownerUid && myUids.has(event.ownerUid));
      const isRequester = Boolean(event.customerUid && myUids.has(event.customerUid));

      if (isReceiver && !isRequester) {
        const isReq = status === 'REQUESTED' || status === 'PENDING';
        const isImmediate = Boolean(o.immediateAcceptance && status === 'ACCEPTED');
        pushNotification({
          eventId: `order:${o.id}:${status}`,
          kind: status === 'CANCELLED' ? 'error' : 'offer',
          title: `${isReq ? 'New Order Request' : isImmediate ? 'New Immediate Order' : `Order ${status.replace(/_/g, ' ')}`} · ${o.orderNumber}`,
          message: `${o.customerName} · ${Number(o.totalAmount).toLocaleString()} ETB (${o.fulfillmentType})`,
          actionLabel: isReq ? 'Review Order' : 'Open Orders',
          actionTarget: 'business',
          targetTab: 'ORDERS',
          threadKey,
        });
        return;
      }

      if (isRequester) {
        const bizLabel = event.businessName || 'Seller';
        const etaParts: string[] = [];
        if (o.estimatedReadyMinutes) etaParts.push(`Ready ~${o.estimatedReadyMinutes}m`);
        if (o.estimatedDeliveryMinutes && o.fulfillmentType === 'DELIVERY') {
          etaParts.push(`Delivery ~${o.estimatedDeliveryMinutes}m`);
        }
        const detail =
          status === 'REJECTED'
            ? `${bizLabel}${o.rejectionReason ? `: ${o.rejectionReason}` : ' declined the order.'}`
            : `${bizLabel} · ${status.replace(/_/g, ' ')}${etaParts.length > 0 ? ` (${etaParts.join(' · ')})` : ''}`;
        pushNotification({
          eventId: `order:${o.id}:${status}`,
          kind: status === 'REJECTED' ? 'error' : 'offer',
          title: `Order ${status.replace(/_/g, ' ')} · ${o.orderNumber}`,
          message: detail,
          actionLabel: 'View Order',
          actionTarget: 'activity',
          targetTab: 'ORDERS',
          threadKey,
        });
      }
    },
    onBookingUpdated: (event) => {
      if (myUids.size === 0) return;
      if (event.actorUid && myUids.has(event.actorUid)) return;
      const b = event.booking;
      const status = (b.bookingStatus || '').toUpperCase();
      const threadKey = event.threadKey || `booking:${b.id}`;
      const isReceiver = Boolean(event.ownerUid && myUids.has(event.ownerUid));
      const isRequester = Boolean(event.customerUid && myUids.has(event.customerUid));
      const serviceLabel = event.listingTitle || b.bookingType;

      if (isReceiver && !isRequester) {
        pushNotification({
          eventId: `booking:${b.id}:${status}`,
          kind: status === 'CANCELLED' ? 'error' : 'offer',
          title: `Service Request ${status} · ${b.bookingReference}`,
          message: `${b.customerName} · ${serviceLabel} (${Number(b.agreedPrice).toLocaleString()} ETB)`,
          actionLabel: 'View Request',
          actionTarget: 'business',
          targetTab: 'BOOKINGS',
          threadKey,
        });
        return;
      }

      if (isRequester) {
        const bizLabel = event.businessName || 'Provider';
        const displayPrice = b.quotedPrice ? Number(b.quotedPrice) : Number(b.agreedPrice);
        pushNotification({
          eventId: `booking:${b.id}:${status}`,
          kind: status === 'CANCELLED' ? 'error' : 'offer',
          title: `${status === 'QUOTED' ? 'Quote Received' : `Booking ${status}`} · ${b.bookingReference}`,
          message: `${bizLabel} · ${serviceLabel} (${displayPrice.toLocaleString()} ETB)`,
          actionLabel: 'View Booking',
          actionTarget: 'activity',
          targetTab: 'BOOKINGS',
          threadKey,
        });
      }
    },
    onApplicationUpdated: (event) => {
      if (myUids.size === 0) return;
      if (event.actorUid && myUids.has(event.actorUid)) return;
      const app = event.application;
      const status = (app.applicationStatus || '').toUpperCase();
      const isEmployer = Boolean(event.ownerUid && myUids.has(event.ownerUid));
      const isApplicant = Boolean(event.applicantUid && myUids.has(event.applicantUid));

      if (isEmployer && !isApplicant) {
        pushNotification({
          eventId: `app:${app.id}:${status}`,
          kind: 'offer',
          title: `New Job Application · ${app.applicantName}`,
          message: `${event.listingTitle || 'Job Vacancy'} · Expected ${Number(app.expectedCompensation).toLocaleString()} ETB`,
          actionLabel: 'Review Applicant',
          actionTarget: 'business',
          targetTab: 'RECRUITMENT',
        });
        return;
      }

      if (isApplicant) {
        pushNotification({
          eventId: `app:${app.id}:${status}`,
          kind: status === 'REJECTED' ? 'error' : 'offer',
          title: `Application ${status.replace(/_/g, ' ')}`,
          message: `${event.listingTitle || 'Job'} · ${event.businessName || 'Employer'}`,
          actionLabel: 'View Application',
          actionTarget: 'activity',
          targetTab: 'JOBS',
        });
      }
    },
    onDeliveryUpdated: (event) => {
      if (myUids.size === 0) return;
      if (event.actorUid && myUids.has(event.actorUid)) return;
      const d = event.delivery;
      const status = (d.status || '').toUpperCase();
      const isDriver = Boolean(d.driverUid && myUids.has(d.driverUid));
      const isSender = Boolean(d.customerUid && myUids.has(d.customerUid));
      const actionKey = `${d.id}:${status}:${event.action || ''}`;

      if (isDriver && !isSender) {
        pushNotification({
          eventId: `delivery:driver:${actionKey}`,
          kind: status === 'DISPUTED' || status === 'CANCELLED' ? 'error' : 'offer',
          title: `Dispatch ${d.trackingCode} · ${event.action || status}`,
          message:
            event.action === 'DISPUTED' && d.disputeReason
              ? `Dispute opened: ${d.disputeReason}`
              : `${d.pickupLocation || ''} → ${d.destinationLocation || ''}`,
          actionLabel: 'Open Dispatch',
          actionTarget: 'delivery',
        });
        return;
      }

      if (isSender) {
        pushNotification({
          eventId: `delivery:customer:${actionKey}`,
          kind: status === 'DISPUTED' || status === 'CANCELLED' ? 'error' : 'offer',
          title: `Delivery ${d.trackingCode} · ${status.replace(/_/g, ' ')}`,
          message: d.driverName
            ? `Partner: ${d.driverName} · ${d.pickupLocation || ''} → ${d.destinationLocation || ''}`
            : `${d.pickupLocation || ''} → ${d.destinationLocation || ''}`,
          actionLabel: 'View Delivery',
          actionTarget: 'activity',
          targetTab: 'DELIVERIES',
        });
      }
    },
  });

  const handleOpenJobSeekerAdvertise = () => {
    if (!firebaseUser) {
      openAuthModal('signin');
      return;
    }
    setJobSeekerModalOpen(true);
  };

  return (
    <div className="min-h-screen flex flex-col bg-[#F4F6F5] overflow-x-hidden">
      <TopBar
        activeSection={activeSection}
        language={language}
        onChangeLanguage={handleChangeLanguage}
        onNavigate={(next) => {
          if (next === 'business') {
            setBusinessInitialTab(isVerifiedProvider ? 'CATALOG' : 'PROVIDER_KYC');
          }
          setActiveSection(next);
        }}
        onOpenAccountModal={() => setAccountOpen(true)}
        notifications={notifications}
        inboxOpen={notificationsInboxOpen}
        onToggleInbox={() => setNotificationsInboxOpen((prev) => !prev)}
        onCloseInbox={() => setNotificationsInboxOpen(false)}
        onMarkNotificationRead={markNotificationRead}
        onMarkAllNotificationsRead={markAllNotificationsRead}
        onClearReadNotifications={clearReadNotifications}
        onExecuteNotificationAction={executeNotificationAction}
      />

      {catalogError && (
        <div className="mx-auto mt-4 w-full max-w-[1440px] px-4 sm:px-6">
          <div className="flex items-center justify-between rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-xs text-red-700">
            <span>{catalogError}</span>
            <button
              type="button"
              onClick={() => loadCatalog()}
              className="font-semibold underline"
            >
              Retry
            </button>
          </div>
        </div>
      )}

      <main className="flex-1">
        {activeSection === 'discover' && (
          <CustomerDiscoverView
            categories={categories}
            businesses={businesses}
            listings={listings}
            liveProviders={liveProviders}
            recommendations={recommendations}
            detectedLocation={detectedLocation}
            detectingLocation={detectingLocation}
            gpsError={gpsError}
            loading={loadingCatalog}
            isSignedIn={Boolean(firebaseUser)}
            isVerifiedProvider={isVerifiedProvider}
            userLat={detectedLocation.lat}
            userLng={detectedLocation.lng}
            cartCount={cartCount}
            compareIds={compareIds}
            favoriteIds={favoriteIds}
            language={language}
            onRefreshLocation={() => detectExactLocation(true)}
            onOpenCart={() => setCartOpen(true)}
            onOpenCompare={() => setCompareOpen(true)}
            onToggleCompare={handleToggleCompare}
            onToggleFavorite={handleToggleFavorite}
            onSelectListing={(listing) => {
              setListingInitialEditMode(false);
              setSelectedListing(listing);
            }}
            onAddToCart={handleAddToCart}
            onGoToDelivery={() => setActiveSection('delivery')}
            onGoToBecomeProvider={() => {
              setBusinessInitialTab(isVerifiedProvider ? 'CATALOG' : 'PROVIDER_KYC');
              setActiveSection('business');
            }}
            onOpenJobSeekerAdvertise={handleOpenJobSeekerAdvertise}
          />
        )}

        {activeSection === 'delivery' && Boolean(firebaseUser) && (
          <DeliveryTransportView
            policy={policy}
            knownLocations={knownLocations}
            language={language}
            onNotify={notify}
            onOpenPayment={(target) => setPaymentTargets([target])}
          />
        )}

        {activeSection === 'activity' && Boolean(firebaseUser) && (
          <CustomerActivityView
            businesses={businesses}
            listings={listings}
            language={language}
            requestedTab={activityNav.tab}
            requestedThreadKey={activityNav.threadKey}
            navSignal={activityNav.signal}
            onNotify={notify}
            onRefreshCatalog={() => loadCatalog()}
            onOpenJobSeekerAdvertise={handleOpenJobSeekerAdvertise}
            onEditAd={(ad) => {
              setListingInitialEditMode(true);
              setSelectedListing(ad);
            }}
            onOpenPayment={(target) => setPaymentTargets([target])}
            paymentRefreshSignal={paymentRefreshSignal}
          />
        )}

        {activeSection === 'business' && Boolean(firebaseUser) && (
          <BusinessPortalView
            categories={categories}
            documentRequirements={documentRequirements}
            businesses={businesses}
            listings={listings}
            governance={governance}
            language={language}
            initialTab={businessInitialTab}
            requestedTab={businessNav.tab}
            requestedThreadKey={businessNav.threadKey}
            navSignal={businessNav.signal}
            onRefreshCatalog={() => loadCatalog()}
            onNotify={notify}
            onEditListing={(item) => {
              setListingInitialEditMode(true);
              setSelectedListing(item);
            }}
          />
        )}

        {activeSection === 'admin' && firebaseUser && isAdmin && (
          <AdminPortalView
            policy={policy}
            governance={governance}
            language={language}
            onRefreshCatalog={() => loadCatalog()}
            onNotify={notify}
          />
        )}
      </main>

      <footer className="border-t border-[#172B3A]/10 bg-white">
        <div className="mx-auto flex max-w-[1440px] flex-col gap-3 px-6 py-6 text-xs text-[#172B3A]/60 sm:flex-row sm:items-center sm:justify-between">
          <p>Nearest You — Everything You Need, Just Around You · Addis Ababa, Ethiopia</p>
          <p>Fayda ID Verified · Real-Time Service Locations · ETB Currency</p>
        </div>
      </footer>

      <CartDrawer
        open={cartOpen}
        onClose={() => setCartOpen(false)}
        items={cart}
        onUpdateQty={handleUpdateQty}
        onRemoveItem={(id) => setCart((p) => p.filter((x) => x.listing.id !== id))}
        onClearCart={() => setCart([])}
        userLat={detectedLocation.lat}
        userLng={detectedLocation.lng}
        subCityName={activeLocationLabel}
        policy={policy}
        onOrderSuccess={(createdOrders: OrderRecord[]) => {
          createdOrders.forEach((order) => {
            pushNotification({
              eventId: `order:${order.id}:${order.orderStatus || 'REQUESTED'}`,
              kind: 'offer',
              title: `${order.immediateAcceptance ? 'Immediate Order Accepted' : 'Order Request Sent'} · ${order.orderNumber}`,
              message: `${Number(order.totalAmount).toLocaleString()} ETB (${order.fulfillmentType})${
                order.estimatedReadyMinutes ? ` · Ready ~${order.estimatedReadyMinutes}m` : ''
              }`,
              actionLabel: 'View Order',
              actionTarget: 'activity',
              targetTab: 'ORDERS',
              threadKey: `order:${order.id}`,
            });
          });
          const pendingGatewayTargets: PaymentInitTarget[] = createdOrders
            .filter(
              (o) =>
                (o.paymentMethod === 'CHAPA' || o.paymentMethod === 'PAYO') &&
                o.paymentStatus === 'PENDING_PAYMENT'
            )
            .map((o) => ({
              gateway: o.paymentMethod as 'CHAPA' | 'PAYO',
              transactionType: 'ORDER',
              referenceId: o.id,
              referenceCode: o.orderNumber,
              title: `Order ${o.orderNumber} (${businessMap.get(o.businessId)?.businessName || 'Vendor'})`,
              amountEtb: Number(o.totalAmount),
            }));
          if (pendingGatewayTargets.length > 0) {
            setPaymentTargets(pendingGatewayTargets);
          }
          setActivityNav((prev) => ({
            tab: 'ORDERS',
            threadKey: null,
            signal: prev.signal + 1,
          }));
          setActiveSection('activity');
        }}
      />

      <CompareDrawer
        open={compareOpen}
        onClose={() => setCompareOpen(false)}
        listings={comparedListings}
        businessesMap={businessMap}
        userLat={detectedLocation.lat}
        userLng={detectedLocation.lng}
        onRemove={(id) => setCompareIds((p) => p.filter((x) => x !== id))}
        onSelectListing={(listing) => {
          setListingInitialEditMode(false);
          setSelectedListing(listing);
        }}
      />

      <ListingDetailModal
        listing={selectedListing}
        business={selectedListing ? businessMap.get(selectedListing.businessId) || null : null}
        reviews={reviews}
        userLat={detectedLocation.lat}
        userLng={detectedLocation.lng}
        initialEditMode={listingInitialEditMode}
        onClose={() => {
          setSelectedListing(null);
          setListingInitialEditMode(false);
        }}
        onAddToCart={handleAddToCart}
        onActionSuccess={(msg) => {
          if (/^Service request |^Booking /i.test(msg)) {
            pushNotification({
              kind: 'offer',
              title: 'Service Request Sent',
              message: msg,
              actionLabel: 'View Bookings',
              actionTarget: 'activity',
              targetTab: 'BOOKINGS',
            });
          } else if (/^Application offer /i.test(msg)) {
            pushNotification({
              kind: 'offer',
              title: 'Application Submitted',
              message: msg,
              actionLabel: 'View Applications',
              actionTarget: 'activity',
              targetTab: 'JOBS',
            });
          } else {
            notify(msg);
          }
        }}
        onMessageDelivered={({ recipientLabel, preview, threadKey }) => {
          pushNotification({
            kind: 'message',
            title: `Message Delivered · ${recipientLabel}`,
            message: preview.length > 90 ? `${preview.slice(0, 87)}...` : preview,
            actionLabel: 'Open Message',
            actionTarget: 'activity',
            targetTab: 'MESSAGES',
            threadKey,
          });
        }}
        onListingUpdated={(updated) => {
          setSelectedListing(updated);
          setListings((prev) => prev.map((x) => (x.id === updated.id ? updated : x)));
          loadCatalog();
        }}
        onBookingCreated={(booking: BookingRecord) => {
          if (booking.paymentMethod === 'CHAPA' || booking.paymentMethod === 'PAYO') {
            setPaymentTargets([
              {
                gateway: booking.paymentMethod,
                transactionType: 'BOOKING',
                referenceId: booking.id,
                referenceCode: booking.bookingReference,
                title: `Service Booking ${booking.bookingReference}`,
                amountEtb: Number(booking.quotedPrice || booking.agreedPrice),
              },
            ]);
          }
        }}
      />

      <AuthModal
        language={language}
        defaultSubCity={profileSubCity}
        onNotify={notify}
      />

      <AccountProfileModal
        open={accountOpen}
        onClose={() => setAccountOpen(false)}
        language={language}
        selectedSubCity={profileSubCity}
        onChangeLanguage={handleChangeLanguage}
        onChangeSubCity={setProfileSubCity}
        onOpenProviderKyc={() => {
          setBusinessInitialTab(isVerifiedProvider ? 'CATALOG' : 'PROVIDER_KYC');
          setActiveSection('business');
        }}
        onOpenActivity={() => setActiveSection('activity')}
        onNotify={notify}
      />

      <JobSeekerAdvertiseModal
        open={jobSeekerModalOpen}
        categories={categories}
        detectedLocation={detectedLocation}
        language={language}
        onClose={() => setJobSeekerModalOpen(false)}
        onSuccess={() => loadCatalog()}
        onNotify={notify}
        onEditAd={(ad) => {
          setListingInitialEditMode(true);
          setSelectedListing(ad);
        }}
      />

      <PaymentGatewayModal
        targets={paymentTargets}
        onClose={() => setPaymentTargets([])}
        onPaymentSettled={(tx) => {
          setPaymentRefreshSignal((n) => n + 1);
          pushNotification({
            eventId: `payment-settled:${tx.txRef}`,
            kind: 'offer',
            title: `Payment Verified · ${tx.gateway}`,
            message: `${tx.referenceCode} paid (${Number(tx.grossAmount).toLocaleString()} ETB). Provider sales routed & platform commission collected.`,
            actionLabel: 'View Activity',
            actionTarget: 'activity',
            targetTab:
              tx.transactionType === 'BOOKING'
                ? 'BOOKINGS'
                : tx.transactionType === 'ORDER'
                  ? 'ORDERS'
                  : 'DELIVERIES',
          });
          loadCatalog();
        }}
        onNotify={notify}
      />
    </div>
  );
}

export default function App() {
  return (
    <AuthProvider>
      <NearestYouWorkspace />
    </AuthProvider>
  );
}
