import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AuthProvider, useAuth } from './context/AuthContext.tsx';
import { TopBar, type AppSection } from './components/TopBar.tsx';
import { CustomerDiscoverView } from './components/CustomerDiscoverView.tsx';
import { DeliveryTransportView } from './components/DeliveryTransportView.tsx';
import { CustomerActivityView } from './components/CustomerActivityView.tsx';
import { BusinessPortalView } from './components/BusinessPortalView.tsx';
import { AdminPortalView } from './components/AdminPortalView.tsx';
import { CartDrawer } from './components/CartDrawer.tsx';
import { CompareDrawer } from './components/CompareDrawer.tsx';
import { ListingDetailModal } from './components/ListingDetailModal.tsx';
import { AuthModal } from './components/AuthModal.tsx';
import { AccountProfileModal } from './components/AccountProfileModal.tsx';
import { JobSeekerAdvertiseModal } from './components/JobSeekerAdvertiseModal.tsx';
import {
  NotificationCenter,
  type AppNotification,
  type NotificationKind,
} from './components/NotificationCenter.tsx';
import { useLiveChatInboxListener } from './hooks/useLiveChat.ts';
import type { AppLanguage } from './utils/i18n.ts';
import { catalogApi, engagementApi, userApi } from './api/index.ts';
import type {
  Business,
  CartItem,
  Category,
  CategoryDocumentRequirement,
  DetectedLocation,
  Listing,
  LiveProviderPublicMarker,
  OnboardingGovernance,
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
  const [businessInitialTab, setBusinessInitialTab] = useState<'PROVIDER_KYC' | 'CATALOG'>(
    'PROVIDER_KYC'
  );
  const [categories, setCategories] = useState<Category[]>([]);
  const [documentRequirements, setDocumentRequirements] = useState<CategoryDocumentRequirement[]>(
    []
  );
  const [businesses, setBusinesses] = useState<Business[]>([]);
  const [listings, setListings] = useState<Listing[]>([]);
  const [liveProviders, setLiveProviders] = useState<LiveProviderPublicMarker[]>([]);
  const [recommendations, setRecommendations] = useState<RecommendedListingItem[]>([]);
  const [reviews, setReviews] = useState<ReviewItem[]>([]);
  const [policy, setPolicy] = useState<PlatformPolicy>(DEFAULT_POLICY);
  const [governance, setGovernance] = useState<OnboardingGovernance>(DEFAULT_GOVERNANCE);
  const [loadingCatalog, setLoadingCatalog] = useState(true);
  const [catalogError, setCatalogError] = useState<string | null>(null);

  const [detectedLocation, setDetectedLocation] = useState<DetectedLocation>(INITIAL_LOCATION);
  const [detectingLocation, setDetectingLocation] = useState<boolean>(true);
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

  const notificationStorageKey = `ny_notifications_v2_${dbUser?.uid || 'guest'}`;
  const [notifications, setNotifications] = useState<AppNotification[]>(() => {
    if (typeof window === 'undefined') return [];
    try {
      const raw = window.localStorage.getItem('ny_notifications_v2_guest');
      if (!raw) return [];
      const parsed = JSON.parse(raw);
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  });

  useEffect(() => {
    if (typeof window === 'undefined') return;
    try {
      const raw = window.localStorage.getItem(notificationStorageKey);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed)) {
          setNotifications(parsed);
          return;
        }
      }
      setNotifications([]);
    } catch {
      setNotifications([]);
    }
  }, [notificationStorageKey]);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    try {
      const serializable = notifications.slice(-30).map(({ onAction: _omit, ...rest }) => rest);
      window.localStorage.setItem(notificationStorageKey, JSON.stringify(serializable));
    } catch {
      /* ignore storage quota errors */
    }
  }, [notifications, notificationStorageKey]);

  const markNotificationRead = useCallback((id: string) => {
    setNotifications((prev) =>
      prev.map((item) => (item.id === id ? { ...item, read: true } : item))
    );
  }, []);

  const markAllNotificationsRead = useCallback(() => {
    setNotifications((prev) => prev.map((item) => ({ ...item, read: true })));
  }, []);

  const clearReadNotifications = useCallback(() => {
    setNotifications((prev) => prev.filter((item) => !item.read));
  }, []);

  const pushNotification = useCallback(
    (
      input:
        | string
        | {
            kind?: NotificationKind;
            title?: string;
            message: string;
            actionLabel?: string;
            actionTarget?: AppSection;
            onAction?: () => void;
          }
    ) => {
      const rawMessage = typeof input === 'string' ? input : input.message;
      const inferredKind: NotificationKind =
        typeof input !== 'string' && input.kind
          ? input.kind
          : /connection error|failed|cannot|unable|unavailable/i.test(rawMessage)
            ? 'error'
            : /message|chat|reply/i.test(rawMessage)
              ? 'message'
              : /offer|quote|proposal|order|booking|request|application|reserve/i.test(rawMessage)
                ? 'offer'
                : 'success';

      const defaultTitle =
        inferredKind === 'message'
          ? 'Message Delivered'
          : inferredKind === 'offer'
            ? 'Offer & Request Delivered'
            : inferredKind === 'error'
              ? 'Connection Notice'
              : 'Update';

      const id = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
      const timestamp = new Date().toLocaleTimeString([], {
        hour: '2-digit',
        minute: '2-digit',
      });

      const entry: AppNotification = {
        id,
        kind: inferredKind,
        title: (typeof input !== 'string' && input.title) || defaultTitle,
        message: rawMessage,
        timestamp,
        read: false,
        actionLabel: typeof input !== 'string' ? input.actionLabel : undefined,
        actionTarget: typeof input !== 'string' ? input.actionTarget : undefined,
        onAction: typeof input !== 'string' ? input.onAction : undefined,
      };

      setNotifications((prev) => [...prev.slice(-29), entry]);
    },
    []
  );

  const executeNotificationAction = useCallback(
    (item: AppNotification) => {
      markNotificationRead(item.id);
      if (item.onAction) {
        item.onAction();
      } else if (item.actionTarget) {
        setSelectedListing(null);
        setActiveSection(item.actionTarget);
      }
    },
    [markNotificationRead]
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
      setCategories(data.categories || []);
      setDocumentRequirements(data.documentRequirements || []);
      setBusinesses(data.businesses || []);
      setListings(data.listings || []);
      setLiveProviders(data.liveProviders || []);
      setRecommendations(data.recommendations || []);
      setReviews(data.reviews || []);
      if (data.detectedLocation) {
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

  const detectExactLocation = useCallback(
    (userTriggered = false) => {
      if (typeof navigator === 'undefined' || !navigator.geolocation) {
        setDetectingLocation(false);
        if (userTriggered) {
          notify('Browser GPS is unavailable; using backend IP-detected location.');
        }
        return;
      }

      setDetectingLocation(true);
      navigator.geolocation.getCurrentPosition(
        async (pos) => {
          const lat = Number(pos.coords.latitude.toFixed(6));
          const lng = Number(pos.coords.longitude.toFixed(6));
          exactGpsRef.current = { lat, lng };
          try {
            const response = await catalogApi.getCatalog({ lat, lng });
            const data = response.data;
            if (data.detectedLocation) {
              setDetectedLocation(data.detectedLocation);
              if (firebaseUser) {
                userApi
                  .updateProfile({
                    defaultLat: lat,
                    defaultLng: lng,
                    defaultSubCity: data.detectedLocation.subCity || undefined,
                  })
                  .catch(() => {});
              }
            }
            if (data.recommendations) {
              setRecommendations(data.recommendations);
            }
            if (data.categories) setCategories(data.categories);
            if (data.businesses) setBusinesses(data.businesses);
            if (data.listings) setListings(data.listings);
            if (data.liveProviders) setLiveProviders(data.liveProviders);
            if (userTriggered) {
              notify(`Exact location updated: ${data.detectedLocation?.label || `${lat}, ${lng}`}`);
            }
          } catch {
            setDetectedLocation((prev) => ({
              ...prev,
              lat,
              lng,
              source: 'GPS',
              accuracyMode: 'EXACT',
            }));
          } finally {
            setDetectingLocation(false);
          }
        },
        () => {
          setDetectingLocation(false);
          if (userTriggered) {
            notify('GPS permission not granted; using backend-detected location.');
          }
        },
        { enableHighAccuracy: true, timeout: 8000, maximumAge: 60000 }
      );
    },
    [firebaseUser, notify]
  );

  useEffect(() => {
    loadCatalog().then(() => {
      detectExactLocation(false);
    });
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
      notify('You cannot order your own advertisement.');
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
    notify(`Added "${listing.title}" to cart.`);
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
        notify('You can compare up to 3 listings side by side.');
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
  const isVerifiedProvider =
    dbUser?.providerVerificationStatus === 'VERIFIED' || Boolean(dbUser?.isAdmin);

  useLiveChatInboxListener(Boolean(firebaseUser && dbUser), (incomingMsg) => {
    if (!dbUser?.uid || incomingMsg.senderUid === dbUser.uid) return;
    const ownsBusiness = businesses.some(
      (b) => b.id === incomingMsg.businessId && b.ownerUid === dbUser.uid
    );
    const targetSection: AppSection =
      ownsBusiness && isVerifiedProvider ? 'business' : 'activity';
    pushNotification({
      kind: 'message',
      title: `New Message · ${incomingMsg.senderName}`,
      message:
        incomingMsg.body.length > 96
          ? `${incomingMsg.body.slice(0, 93)}...`
          : incomingMsg.body,
      actionLabel: 'Open Messages',
      actionTarget: targetSection,
      onAction: () => {
        setSelectedListing(null);
        if (targetSection === 'business') {
          setBusinessInitialTab('CATALOG');
        }
        setActiveSection(targetSection);
      },
    });
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
            language={language}
            onNotify={notify}
          />
        )}

        {activeSection === 'activity' && Boolean(firebaseUser) && (
          <CustomerActivityView
            businesses={businesses}
            listings={listings}
            language={language}
            onNotify={notify}
            onRefreshCatalog={() => loadCatalog()}
            onOpenJobSeekerAdvertise={handleOpenJobSeekerAdvertise}
            onEditAd={(ad) => {
              setListingInitialEditMode(true);
              setSelectedListing(ad);
            }}
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
        onOrderSuccess={(refs) => {
          pushNotification({
            kind: 'offer',
            title: 'Offer & Order Delivered',
            message: `Order confirmed: ${refs.join(', ')}`,
            actionLabel: 'View Orders',
            actionTarget: 'activity',
            onAction: () => setActiveSection('activity'),
          });
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
        onActionSuccess={notify}
        onMessageDelivered={({ recipientLabel, preview }) => {
          pushNotification({
            kind: 'message',
            title: `Message Delivered · ${recipientLabel}`,
            message: preview.length > 90 ? `${preview.slice(0, 87)}...` : preview,
            actionLabel: 'View Chat',
            actionTarget: 'activity',
            onAction: () => {
              setSelectedListing(null);
              setActiveSection('activity');
            },
          });
        }}
        onListingUpdated={(updated) => {
          setSelectedListing(updated);
          setListings((prev) => prev.map((x) => (x.id === updated.id ? updated : x)));
          loadCatalog();
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

      <NotificationCenter
        notifications={notifications}
        onMarkAsRead={markNotificationRead}
        onMarkAllRead={markAllNotificationsRead}
        onExecuteAction={executeNotificationAction}
        onOpenInbox={() => setNotificationsInboxOpen(true)}
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
