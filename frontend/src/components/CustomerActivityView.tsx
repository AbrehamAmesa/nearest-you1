import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertTriangle,
  Briefcase,
  Lock,
  MessageSquare,
  MessageSquareWarning,
  Pencil,
  Radio,
  ShieldCheck,
  Star,
  Trash2,
} from 'lucide-react';
import type {
  BookingRecord,
  Business,
  ChatThreadSummary,
  DeliveryRecord,
  JobApplicationRecord,
  Listing,
  OrderRecord,
} from '../types/nearestyou.ts';
import { formatEtb } from '../utils/geo.ts';
import { TRANSLATIONS, type AppLanguage } from '../utils/i18n.ts';
import { formatEtaClock, formatLastSeenStatus } from '../utils/presence.ts';
import { businessApi, engagementApi, jobSeekerApi } from '../api/index.ts';
import { useAuth } from '../context/AuthContext.tsx';
import { useLiveChatInboxListener } from '../hooks/useLiveChat.ts';
import { ContractOfferSection } from './ContractOfferSection.tsx';
import { LiveChatDrawer, type ActiveChatTarget } from './LiveChatDrawer.tsx';
import { LiveChatPanel } from './LiveChatPanel.tsx';
import { LiveDriverTrackerMap } from './ServiceMap.tsx';

export type ActivityTab =
  | 'ORDERS'
  | 'BOOKINGS'
  | 'DELIVERIES'
  | 'MESSAGES'
  | 'JOBS'
  | 'FAVORITES';

interface CustomerActivityViewProps {
  businesses: Business[];
  listings: Listing[];
  language: AppLanguage;
  requestedTab?: ActivityTab;
  requestedThreadKey?: string | null;
  navSignal?: number;
  onNotify: (msg: string) => void;
  onRefreshCatalog: () => void;
  onOpenJobSeekerAdvertise?: () => void;
  onEditAd?: (ad: Listing) => void;
}

export const CustomerActivityView: React.FC<CustomerActivityViewProps> = ({
  businesses,
  listings,
  language,
  requestedTab,
  requestedThreadKey,
  navSignal = 0,
  onNotify,
  onRefreshCatalog,
  onOpenJobSeekerAdvertise,
  onEditAd,
}) => {
  const t = TRANSLATIONS[language].activity;
  const { dbUser, firebaseUser, openAuthModal, authFetch } = useAuth();
  const [tab, setTab] = useState<ActivityTab>(requestedTab || 'ORDERS');
  const [loading, setLoading] = useState(false);
  const [orders, setOrders] = useState<OrderRecord[]>([]);
  const [bookings, setBookings] = useState<BookingRecord[]>([]);
  const [deliveries, setDeliveries] = useState<DeliveryRecord[]>([]);
  const [applications, setApplications] = useState<JobApplicationRecord[]>([]);
  const [myJobSeekerAds, setMyJobSeekerAds] = useState<Listing[]>([]);
  const [favIds, setFavIds] = useState<number[]>([]);
  const [threads, setThreads] = useState<ChatThreadSummary[]>([]);
  const [selectedThreadKey, setSelectedThreadKey] = useState<string | null>(
    requestedThreadKey ?? null
  );
  const [chatDrawerTarget, setChatDrawerTarget] = useState<ActiveChatTarget | null>(null);
  const [nowTick, setNowTick] = useState(() => Date.now());
  const [contractRefreshSignal, setContractRefreshSignal] = useState(0);
  const chatSectionRef = useRef<HTMLDivElement>(null);

  // Verified review modal state
  const [reviewTarget, setReviewTarget] = useState<{
    businessId: number;
    listingId?: number;
    transactionRef: string;
  } | null>(null);
  const [rating, setRating] = useState(5);
  const [comment, setComment] = useState('');

  // Anti-theft conflict / dispute modal state
  const [disputeTarget, setDisputeTarget] = useState<DeliveryRecord | null>(null);
  const [disputeCategory, setDisputeCategory] = useState<string>('PARCEL_MISSING_OR_STOLEN');
  const [disputeReason, setDisputeReason] = useState('');
  const [counterTarget, setCounterTarget] = useState<DeliveryRecord | null>(null);
  const [counterText, setCounterText] = useState('');

  // Live Driver Tracking state
  const [trackingCodeOpen, setTrackingCodeOpen] = useState<string | null>(null);
  const [liveTrackData, setLiveTrackData] = useState<Partial<DeliveryRecord> | null>(null);

  useEffect(() => {
    const id = window.setInterval(() => setNowTick(Date.now()), 15000);
    return () => window.clearInterval(id);
  }, []);

  const loadThreadsOnly = async () => {
    if (!firebaseUser) return;
    try {
      const res = await engagementApi.getChatThreads();
      const nextThreads: ChatThreadSummary[] = Array.isArray(res.data) ? res.data : [];
      setThreads(nextThreads);
      setSelectedThreadKey((prev) => prev || nextThreads[0]?.threadKey || null);
    } catch {
      /* ignore */
    }
  };

  const loadThreadsRef = useRef(loadThreadsOnly);
  loadThreadsRef.current = loadThreadsOnly;
  const loadWorkspaceRef = useRef<() => Promise<void>>(async () => {});

  useLiveChatInboxListener(Boolean(firebaseUser), {
    onIncomingMessage: () => {
      loadThreadsRef.current();
    },
    onContractUpdated: () => {
      setContractRefreshSignal((n) => n + 1);
      loadThreadsRef.current();
    },
    onOrderUpdated: () => {
      loadWorkspaceRef.current();
    },
    onBookingUpdated: () => {
      loadWorkspaceRef.current();
    },
    onApplicationUpdated: () => {
      loadWorkspaceRef.current();
    },
    onDeliveryUpdated: () => {
      loadWorkspaceRef.current();
    },
  });

  const loadWorkspace = async () => {
    if (!firebaseUser) return;
    setLoading(true);
    try {
      const [workspaceResult, seekerResult, threadsResult] = await Promise.allSettled([
        authFetch('/api/v1/me/workspace'),
        jobSeekerApi.getMine(),
        engagementApi.getChatThreads(),
      ]);
      if (workspaceResult.status === 'fulfilled' && workspaceResult.value.ok) {
        const data = await workspaceResult.value.json();
        setOrders(data.orders || []);
        setBookings(data.bookings || []);
        setDeliveries(data.deliveries || []);
        setApplications(data.applications || []);
        setFavIds((data.favorites || []).map((f: { listingId: number }) => f.listingId));
      }
      if (seekerResult.status === 'fulfilled') {
        setMyJobSeekerAds(seekerResult.value.data?.listings || []);
      }
      if (threadsResult.status === 'fulfilled') {
        const nextThreads: ChatThreadSummary[] = Array.isArray(threadsResult.value.data)
          ? threadsResult.value.data
          : [];
        setThreads(nextThreads);
        setSelectedThreadKey((prev) => prev || nextThreads[0]?.threadKey || null);
      }
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  loadWorkspaceRef.current = loadWorkspace;

  useEffect(() => {
    if (firebaseUser) loadWorkspace();
  }, [firebaseUser]);

  useEffect(() => {
    if (navSignal <= 0) return;
    if (requestedTab) {
      setTab(requestedTab);
    }
    if (requestedThreadKey) {
      setSelectedThreadKey(requestedThreadKey);
      loadThreadsRef.current();
      window.requestAnimationFrame(() => {
        chatSectionRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
      });
    }
    if (
      requestedTab === 'ORDERS' ||
      requestedTab === 'BOOKINGS' ||
      requestedTab === 'DELIVERIES' ||
      requestedTab === 'JOBS'
    ) {
      loadWorkspaceRef.current();
    }
  }, [navSignal, requestedTab, requestedThreadKey]);

  useEffect(() => {
    if (!firebaseUser) {
      setMyJobSeekerAds([]);
      return;
    }
    jobSeekerApi
      .getMine()
      .then((res) => setMyJobSeekerAds(res.data?.listings || []))
      .catch(() => {});
  }, [firebaseUser, listings]);

  useEffect(() => {
    if (!trackingCodeOpen || !firebaseUser) {
      setLiveTrackData(null);
      return;
    }
    let active = true;
    const fetchLive = async () => {
      try {
        const res = await authFetch(`/api/v1/deliveries/track/${encodeURIComponent(trackingCodeOpen)}`);
        if (res.ok && active) {
          const data = await res.json();
          setLiveTrackData(data);
        }
      } catch {}
    };
    fetchLive();
    const timer = setInterval(fetchLive, 5000);
    return () => {
      active = false;
      clearInterval(timer);
    };
  }, [trackingCodeOpen, firebaseUser, authFetch]);

  const bizById = useMemo(() => {
    const rec: Record<number, Business> = {};
    businesses.forEach((b) => {
      rec[b.id] = b;
    });
    return rec;
  }, [businesses]);

  const listingById = useMemo(() => {
    const rec: Record<number, Listing> = {};
    listings.forEach((l) => {
      rec[l.id] = l;
    });
    return rec;
  }, [listings]);

  const handleApproveQuote = async (bookingId: number) => {
    const res = await authFetch(`/api/v1/bookings/${bookingId}/status`, {
      method: 'POST',
      body: JSON.stringify({ quoteApproved: true, bookingStatus: 'CONFIRMED' }),
    });
    if (res.ok) {
      onNotify('Revised quotation approved and booking confirmed.');
      loadWorkspace();
    }
  };

  const handleCancelOrder = async (orderId: number) => {
    const res = await authFetch(`/api/v1/orders/${orderId}/status`, {
      method: 'POST',
      body: JSON.stringify({ orderStatus: 'CANCELLED' }),
    });
    if (res.ok) {
      onNotify('Order cancelled.');
      loadWorkspace();
    } else {
      const err = await res.json().catch(() => ({}));
      onNotify(err.error || 'Could not cancel order.');
    }
  };

  const handleSubmitReview = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!reviewTarget || !comment.trim()) return;
    const res = await authFetch('/api/v1/reviews', {
      method: 'POST',
      body: JSON.stringify({
        businessId: reviewTarget.businessId,
        listingId: reviewTarget.listingId,
        transactionRef: reviewTarget.transactionRef,
        rating,
        comment,
      }),
    });
    if (res.ok) {
      onNotify('Verified transaction review published.');
      setReviewTarget(null);
      setComment('');
      onRefreshCatalog();
    }
  };

  const handleReportTheft = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!disputeTarget || !disputeReason.trim()) return;
    const res = await authFetch(`/api/v1/deliveries/${disputeTarget.id}/conflict`, {
      method: 'POST',
      body: JSON.stringify({ reason: disputeReason.trim(), category: disputeCategory }),
    });
    const data = await res.json();
    if (res.ok) {
      onNotify(`Conflict opened & Escrow frozen on ${disputeTarget.trackingCode}.`);
      setDisputeTarget(null);
      setDisputeReason('');
      loadWorkspace();
    } else {
      onNotify(data.error || 'Could not report conflict.');
    }
  };

  const handleSubmitCounterStatement = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!counterTarget || !counterText.trim()) return;
    const res = await authFetch(`/api/v1/deliveries/${counterTarget.id}/conflict-statement`, {
      method: 'POST',
      body: JSON.stringify({ statement: counterText.trim() }),
    });
    const data = await res.json();
    if (res.ok) {
      onNotify(`Counter-statement recorded for ${counterTarget.trackingCode}.`);
      setCounterTarget(null);
      setCounterText('');
      loadWorkspace();
    } else {
      onNotify(data.error || 'Could not submit counter-statement.');
    }
  };

  if (!firebaseUser) {
    return (
      <div className="mx-auto max-w-2xl px-4 sm:px-6 py-20 text-center">
        <h1 className="font-display text-2xl font-bold text-[#172B3A]">{t.signInPromptTitle}</h1>
        <p className="mt-2 text-sm text-[#172B3A]/70">{t.signInPromptDesc}</p>
        <div className="mt-6 flex flex-wrap items-center justify-center gap-3">
          <button
            type="button"
            onClick={() => openAuthModal('signin')}
            className="min-h-[44px] rounded-lg border border-[#172B3A]/20 bg-white px-6 py-3 text-sm font-semibold text-[#172B3A] hover:bg-[#F4F6F5]"
          >
            {TRANSLATIONS[language].nav.signIn}
          </button>
          <button
            type="button"
            onClick={() => openAuthModal('signup')}
            className="min-h-[44px] rounded-lg bg-[#176B52] px-6 py-3 text-sm font-semibold text-white hover:bg-[#125641]"
          >
            {TRANSLATIONS[language].nav.signUp}
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-[1440px] space-y-6 px-4 sm:px-6 py-6 sm:py-8">
      <div className="flex flex-col gap-4 border-b border-[#172B3A]/10 pb-6 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="font-display text-3xl font-bold text-[#172B3A]">{t.title}</h1>
          <p className="mt-1 text-sm text-[#172B3A]/70">{t.subtitle}</p>
        </div>

        <div className="flex flex-wrap gap-1 rounded-lg border border-[#172B3A]/10 bg-white p-1">
          {[
            { id: 'ORDERS', label: `${t.tabOrders} (${orders.length})` },
            { id: 'BOOKINGS', label: `${t.tabBookings} (${bookings.length})` },
            { id: 'DELIVERIES', label: `${t.tabDeliveries} (${deliveries.length})` },
            { id: 'MESSAGES', label: `${t.tabMessages} (${threads.length})` },
            { id: 'JOBS', label: `${t.tabJobs} (${applications.length})` },
            { id: 'FAVORITES', label: `${t.tabSaved} (${favIds.length})` },
          ].map((item) => (
            <button
              key={item.id}
              type="button"
              onClick={() => setTab(item.id as typeof tab)}
              className={`min-h-[38px] rounded-md px-3 py-1.5 text-xs font-semibold whitespace-nowrap ${
                tab === item.id
                  ? 'bg-[#176B52] text-white'
                  : 'text-[#172B3A]/70 hover:text-[#172B3A]'
              }`}
            >
              {item.label}
            </button>
          ))}
        </div>
      </div>

      {loading ? (
        <div className="rounded-xl border border-[#172B3A]/10 bg-white p-12 text-center text-sm text-[#172B3A]/60">
          Loading PostgreSQL transaction history...
        </div>
      ) : (
        <>
          {tab === 'ORDERS' && (
            <div className="space-y-4">
              {orders.length === 0 ? (
                <div className="rounded-xl border border-[#172B3A]/10 bg-white p-12 text-center text-sm text-[#172B3A]/65">
                  No product or restaurant orders yet.
                </div>
              ) : (
                orders.map((ord) => {
                  const biz = bizById[ord.businessId];
                  const snap = ord.returnPolicySnapshot;
                  const canCancel = ['REQUESTED', 'PENDING', 'CONFIRMED', 'ACCEPTED'].includes(
                    ord.orderStatus
                  );
                  return (
                    <div
                      key={ord.id}
                      className="rounded-xl border border-[#172B3A]/10 bg-white p-5"
                    >
                      <div className="flex flex-wrap items-baseline justify-between gap-2 border-b border-[#172B3A]/10 pb-3">
                        <div>
                          <span className="font-mono text-sm font-bold text-[#172B3A]">
                            {ord.orderNumber}
                          </span>
                          <span className="mx-2 text-[#172B3A]/35">·</span>
                          <span className="text-sm font-medium text-[#172B3A]">
                            {biz?.businessName || 'Vendor'}
                          </span>
                          <span className="mx-2 text-[#172B3A]/35">·</span>
                          <span className="text-xs font-semibold text-[#176B52]">
                            {ord.orderStatus}
                          </span>
                        </div>
                        <span className="font-mono text-base font-bold tabular-nums text-[#172B3A]">
                          {formatEtb(ord.totalAmount)}
                        </span>
                      </div>

                      <div className="mt-3 space-y-1 text-xs text-[#172B3A]/75">
                        {ord.itemsSnapshot.map((it, idx) => (
                          <div key={idx} className="flex justify-between">
                            <span>
                              {it.quantity} × {it.title} {it.variant ? `(${it.variant})` : ''}
                            </span>
                            <span className="font-mono tabular-nums">{formatEtb(it.lineTotal)}</span>
                          </div>
                        ))}
                        <div className="flex flex-wrap justify-between gap-2 pt-2 text-[#172B3A]/60">
                          <span>
                            Payment: {ord.paymentMethod} · {ord.fulfillmentType} ({ord.deliveryAddress})
                          </span>
                          <span className="font-mono tabular-nums">
                            Delivery {formatEtb(ord.deliveryFee)} + VAT {formatEtb(ord.taxAmount)}
                          </span>
                        </div>
                      </div>

                      {/* Order Acceptance & Approximate Ready / Delivery Time */}
                      <div className="mt-3 space-y-1 rounded-lg border border-[#172B3A]/10 bg-[#F4F6F5]/65 p-3 text-xs text-[#172B3A]/80">
                        <p>
                          <strong className="text-[#172B3A]">Acceptance &amp; Time:</strong>{' '}
                          {ord.orderStatus === 'REQUESTED' || ord.orderStatus === 'PENDING'
                            ? 'Order Request sent — waiting for seller acceptance & confirmed ready/delivery time.'
                            : ord.orderStatus === 'REJECTED'
                              ? `Order Rejected${ord.rejectionReason ? `: ${ord.rejectionReason}` : '.'}`
                              : ord.immediateAcceptance
                                ? 'Immediate Acceptance'
                                : 'Accepted by seller'}
                          {(ord.estimatedReadyAt || ord.estimatedReadyMinutes) &&
                            ord.orderStatus !== 'REJECTED' &&
                            ord.orderStatus !== 'CANCELLED' && (
                              <span className="ml-1 font-mono tabular-nums text-[#176B52]">
                                · Ready: {formatEtaClock(ord.estimatedReadyAt, ord.estimatedReadyMinutes)}
                                {ord.fulfillmentType === 'DELIVERY' &&
                                  ` · Delivery: ${formatEtaClock(
                                    ord.estimatedDeliveryAt,
                                    ord.estimatedDeliveryMinutes
                                  )}`}
                              </span>
                            )}
                        </p>
                        {snap && (
                          <p>
                            <strong className="text-[#172B3A]">If Unsatisfied (Return Loss):</strong>{' '}
                            {snap.returnable ? (
                              <span className="font-mono tabular-nums">
                                Returnable within {snap.returnWindowDays ?? 3}d · Item deduction:{' '}
                                {formatEtb(snap.estimatedItemLossOnReturnEtb ?? 0)} ·{' '}
                                {ord.fulfillmentType === 'DELIVERY'
                                  ? snap.deliveryFeeNonRefundableOnReturn
                                    ? `Loses delivery fee (${formatEtb(snap.estimatedDeliveryLossOnReturnEtb ?? 0)})`
                                    : 'Delivery fee refunded'
                                  : 'Store pickup'}
                                {' · '}
                                Total buyer loss:{' '}
                                <strong>{formatEtb(snap.estimatedTotalLossOnReturnEtb ?? 0)}</strong>
                              </span>
                            ) : (
                              <span className="font-semibold text-red-700">
                                Non-Returnable (Final Sale · Loss:{' '}
                                {formatEtb(snap.estimatedTotalLossOnReturnEtb ?? ord.totalAmount)})
                              </span>
                            )}
                          </p>
                        )}
                      </div>

                      <div className="mt-4 flex flex-wrap justify-end gap-2">
                        {canCancel && (
                          <button
                            type="button"
                            onClick={() => handleCancelOrder(ord.id)}
                            className="inline-flex items-center gap-1.5 rounded-lg border border-red-200 px-3 py-1.5 text-xs font-semibold text-red-700 hover:bg-red-50"
                          >
                            Cancel Order
                          </button>
                        )}
                        <button
                          type="button"
                          onClick={() =>
                            setChatDrawerTarget({
                              threadKey: `order:${ord.id}`,
                              orderId: ord.id,
                              businessId: ord.businessId,
                              recipientUid: biz?.ownerUid,
                              title: `Order ${ord.orderNumber} · ${t.liveChat}`,
                              subtitle: biz?.businessName || 'Vendor',
                            })
                          }
                          className="inline-flex items-center gap-1.5 rounded-lg bg-[#176B52] px-3.5 py-1.5 text-xs font-semibold text-white hover:bg-[#125641]"
                        >
                          <MessageSquare className="h-3.5 w-3.5" />
                          {t.liveChat}
                        </button>
                        <button
                          type="button"
                          onClick={() =>
                            setReviewTarget({
                              businessId: ord.businessId,
                              listingId: ord.itemsSnapshot[0]?.listingId,
                              transactionRef: ord.orderNumber,
                            })
                          }
                          className="inline-flex items-center gap-1.5 rounded-lg border border-[#172B3A]/15 px-3 py-1.5 text-xs font-semibold text-[#172B3A] hover:bg-[#F4F6F5]"
                        >
                          <Star className="h-3.5 w-3.5 text-[#F4A62A]" />
                          Submit Verified Review
                        </button>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          )}

          {tab === 'BOOKINGS' && (
            <div className="space-y-4">
              <ContractOfferSection
                refreshSignal={contractRefreshSignal}
                onContractChanged={() => {
                  setContractRefreshSignal((n) => n + 1);
                  loadWorkspace();
                }}
              />

              {bookings.length === 0 ? (
                <div className="rounded-xl border border-[#172B3A]/10 bg-white p-12 text-center text-sm text-[#172B3A]/65">
                  No service bookings or rental reservations yet.
                </div>
              ) : (
                bookings.map((b) => {
                  const biz = bizById[b.businessId];
                  const listing = listingById[b.listingId];
                  return (
                    <div
                      key={b.id}
                      className="rounded-xl border border-[#172B3A]/10 bg-white p-5"
                    >
                      <div className="flex flex-wrap items-baseline justify-between gap-2 border-b border-[#172B3A]/10 pb-3">
                        <div>
                          <span className="font-mono text-sm font-bold text-[#172B3A]">
                            {b.bookingReference}
                          </span>
                          <span className="mx-2 text-[#172B3A]/35">·</span>
                          <span className="text-sm font-semibold text-[#172B3A]">
                            {listing?.title || b.bookingType}
                          </span>
                          <span className="mx-2 text-[#172B3A]/35">·</span>
                          <span className="text-xs font-semibold text-[#176B52]">
                            {b.bookingStatus}
                          </span>
                        </div>
                        <span className="font-mono text-base font-bold tabular-nums text-[#172B3A]">
                          {formatEtb(b.agreedPrice)}
                        </span>
                      </div>

                      <div className="mt-3 space-y-1 text-xs text-[#172B3A]/75">
                        <p>
                          Provider: {biz?.businessName} · Date: {b.scheduledDate}
                          {b.endDate ? ` to ${b.endDate}` : ` at ${b.scheduledTime}`}
                        </p>
                        {b.priceBreakdown.map((p, idx) => (
                          <div key={idx} className="flex justify-between">
                            <span>{p.label}</span>
                            <span className="font-mono tabular-nums">{formatEtb(p.amount)}</span>
                          </div>
                        ))}
                      </div>

                      <div className="mt-4 flex flex-wrap justify-end gap-2">
                        <button
                          type="button"
                          onClick={() =>
                            setChatDrawerTarget({
                              threadKey: `booking:${b.id}`,
                              bookingId: b.id,
                              businessId: b.businessId,
                              listingId: b.listingId,
                              recipientUid: biz?.ownerUid,
                              title: `${b.bookingReference} · ${t.liveChat}`,
                              subtitle: `${listing?.title || b.bookingType} · ${biz?.businessName || 'Provider'}`,
                              enableContracts: true,
                              isOwner: false,
                            })
                          }
                          className="inline-flex items-center gap-1.5 rounded-lg bg-[#176B52] px-3.5 py-1.5 text-xs font-semibold text-white hover:bg-[#125641]"
                        >
                          <MessageSquare className="h-3.5 w-3.5" />
                          {t.liveChat} &amp; Contracts
                        </button>
                        {b.bookingStatus === 'QUOTED' && !b.quoteApproved && (
                          <button
                            type="button"
                            onClick={() => handleApproveQuote(b.id)}
                            className="rounded-lg bg-[#176B52] px-3.5 py-1.5 text-xs font-semibold text-white"
                          >
                            Approve Revised Quote ({formatEtb(b.quotedPrice || b.agreedPrice)})
                          </button>
                        )}
                        <button
                          type="button"
                          onClick={() =>
                            setReviewTarget({
                              businessId: b.businessId,
                              listingId: b.listingId,
                              transactionRef: b.bookingReference,
                            })
                          }
                          className="inline-flex items-center gap-1.5 rounded-lg border border-[#172B3A]/15 px-3 py-1.5 text-xs font-semibold text-[#172B3A] hover:bg-[#F4F6F5]"
                        >
                          <Star className="h-3.5 w-3.5 text-[#F4A62A]" />
                          Submit Verified Review
                        </button>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          )}

          {tab === 'DELIVERIES' && (
            <div className="space-y-4">
              {deliveries.length === 0 ? (
                <div className="rounded-xl border border-[#172B3A]/10 bg-white p-12 text-center text-sm text-[#172B3A]/65">
                  No delivery or ride requests yet.
                </div>
              ) : (
                deliveries.map((d) => (
                  <div
                    key={d.id}
                    className="rounded-xl border border-[#172B3A]/10 bg-white p-5 space-y-4"
                  >
                    <div className="flex flex-wrap justify-between gap-3 border-b border-[#172B3A]/10 pb-3">
                      <div>
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="font-mono text-sm font-bold text-[#172B3A]">
                            {d.trackingCode}
                          </span>
                          <span className="text-[#172B3A]/35">·</span>
                          <span className="text-xs font-semibold text-[#176B52]">{d.status}</span>
                          <span className="text-[#172B3A]/35">·</span>
                          <span className="inline-flex items-center gap-1 font-mono text-xs font-semibold text-[#172B3A]">
                            <ShieldCheck className="h-3.5 w-3.5 text-[#176B52]" />
                            {t.escrowHeld}: {d.escrowStatus || 'HELD_IN_ESCROW'}
                          </span>
                        </div>
                        <p className="mt-1 text-xs text-[#172B3A]/75">
                          {d.pickupLocation} → {d.destinationLocation} ({d.distanceKm} km ·{' '}
                          {d.vehicleType})
                        </p>
                        {d.receiverName && (
                          <p className="mt-0.5 text-xs text-[#172B3A]/60">
                            Receiver: {d.receiverName} ({d.receiverPhone}) · Declared Value:{' '}
                            <span className="font-mono font-semibold">
                              {formatEtb(d.declaredValue || 0)}
                            </span>{' '}
                            · VAT:{' '}
                            <span className="font-mono">{formatEtb(d.taxAmount || 0)}</span>
                          </p>
                        )}
                      </div>
                      <span className="font-mono text-base font-bold tabular-nums text-[#176B52]">
                        {formatEtb(d.totalFee)}
                      </span>
                    </div>

                    {d.status === 'DISPUTED' || d.escrowStatus === 'FROZEN_DISPUTE' ? (
                      <div className="space-y-2 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-xs text-red-900">
                        <div className="flex items-start gap-2 font-semibold">
                          <Lock className="h-4 w-4 shrink-0 mt-0.5" />
                          <div>
                            <p>
                              {t.disputeFrozenBadge}{' '}
                              {d.conflictCategory ? `(${d.conflictCategory})` : ''} —{' '}
                              {d.disputeReason || 'Pending Admin review'}
                            </p>
                            {d.conflictCounterStatement && (
                              <p className="mt-1 font-normal text-[#172B3A]">
                                Counter-Statement: {d.conflictCounterStatement}
                              </p>
                            )}
                          </div>
                        </div>
                        {d.conflictRaisedByRole === 'DRIVER' &&
                          d.conflictStatus !== 'RESOLVED' &&
                          !d.conflictCounterStatement && (
                            <button
                              type="button"
                              onClick={() => setCounterTarget(d)}
                              className="inline-flex min-h-[38px] items-center gap-1.5 rounded-md border border-[#172B3A]/20 bg-white px-3 py-1.5 text-xs font-semibold text-[#172B3A] hover:bg-[#F4F6F5]"
                            >
                              <MessageSquareWarning className="h-3.5 w-3.5" />
                              Submit Sender Counter-Statement
                            </button>
                          )}
                      </div>
                    ) : (
                      <div className="grid gap-3 sm:grid-cols-2 text-xs">
                        <div className="rounded-lg border border-[#172B3A]/10 bg-[#F4F6F5]/70 p-3">
                          <p className="text-[11px] text-[#172B3A]/65">{t.pickupOtpHint}</p>
                          <p className="mt-1 font-mono text-base font-bold text-[#172B3A]">
                            {d.pickupOtp || 'Verified'}
                          </p>
                        </div>
                        <div className="rounded-lg border border-[#176B52]/25 bg-emerald-50/40 p-3">
                          <p className="text-[11px] text-[#176B52]">{t.deliveryOtpHint}</p>
                          <p className="mt-1 font-mono text-base font-bold text-[#176B52]">
                            {d.deliveryOtp || 'Verified'}
                          </p>
                        </div>
                      </div>
                    )}

                    {d.conflictResolution && (
                      <div className="rounded-lg border border-[#176B52]/25 bg-emerald-50/50 px-3 py-2 text-xs font-semibold text-[#176B52]">
                        Admin Conflict Resolution: {d.conflictResolution}
                      </div>
                    )}

                    {trackingCodeOpen === d.trackingCode && (
                      <div className="pt-1">
                        <LiveDriverTrackerMap
                          pickupLat={liveTrackData?.pickupLat ? Number(liveTrackData.pickupLat) : d.pickupLat ? Number(d.pickupLat) : null}
                          pickupLng={liveTrackData?.pickupLng ? Number(liveTrackData.pickupLng) : d.pickupLng ? Number(d.pickupLng) : null}
                          pickupLabel={d.pickupLocation}
                          destinationLat={liveTrackData?.destinationLat ? Number(liveTrackData.destinationLat) : d.destinationLat ? Number(d.destinationLat) : null}
                          destinationLng={liveTrackData?.destinationLng ? Number(liveTrackData.destinationLng) : d.destinationLng ? Number(d.destinationLng) : null}
                          destinationLabel={d.destinationLocation}
                          driverLat={liveTrackData?.driverLat ? Number(liveTrackData.driverLat) : d.driverLat ? Number(d.driverLat) : null}
                          driverLng={liveTrackData?.driverLng ? Number(liveTrackData.driverLng) : d.driverLng ? Number(d.driverLng) : null}
                          driverName={liveTrackData?.driverName || d.driverName}
                          driverUpdatedAt={liveTrackData?.driverLocationUpdatedAt || d.driverLocationUpdatedAt}
                          heightClass="h-[240px] sm:h-[300px]"
                        />
                      </div>
                    )}

                    <div className="flex flex-wrap items-center justify-end gap-2">
                      {d.status !== 'CANCELLED' && (
                        <button
                          type="button"
                          onClick={() =>
                            setTrackingCodeOpen((prev) =>
                              prev === d.trackingCode ? null : d.trackingCode
                            )
                          }
                          className={`inline-flex min-h-[40px] items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-semibold ${
                            trackingCodeOpen === d.trackingCode
                              ? 'border-[#176B52] bg-[#176B52] text-white'
                              : 'border-[#176B52]/30 bg-emerald-50/60 text-[#176B52] hover:bg-emerald-100/70'
                          }`}
                        >
                          <Radio className="h-3.5 w-3.5" />
                          {trackingCodeOpen === d.trackingCode
                            ? 'Hide Live Driver Map'
                            : 'Track Driver Live'}
                        </button>
                      )}

                      {d.status !== 'COMPLETED' &&
                        d.status !== 'CANCELLED' &&
                        d.status !== 'DISPUTED' && (
                          <button
                            type="button"
                            onClick={() => setDisputeTarget(d)}
                            className="inline-flex min-h-[40px] items-center gap-1.5 rounded-lg border border-red-200 bg-red-50/60 px-3 py-1.5 text-xs font-semibold text-red-700 hover:bg-red-100"
                          >
                            <AlertTriangle className="h-3.5 w-3.5" />
                            {t.reportTheftBtn}
                          </button>
                        )}
                    </div>
                  </div>
                ))
              )}
            </div>
          )}

          {tab === 'MESSAGES' && (
            <div className="grid gap-5 lg:grid-cols-12">
              <div className="min-w-0 space-y-2 rounded-xl border border-[#172B3A]/10 bg-white p-3.5 lg:col-span-5">
                <div className="flex items-center justify-between border-b border-[#172B3A]/10 pb-2.5">
                  <h2 className="font-display text-sm font-bold text-[#172B3A]">
                    {t.tabMessages} ({threads.length})
                  </h2>
                  <button
                    type="button"
                    onClick={loadThreadsOnly}
                    className="text-xs font-semibold text-[#176B52] hover:underline"
                  >
                    Refresh
                  </button>
                </div>
                {threads.length === 0 ? (
                  <p className="py-8 text-center text-xs text-[#172B3A]/60">
                    No active conversations yet. Open any order or service listing and click Contact
                    or Live Chat.
                  </p>
                ) : (
                  <div className="max-h-[420px] space-y-2 overflow-y-auto overflow-x-hidden pr-1">
                    {threads.map((th) => {
                      const active = selectedThreadKey === th.threadKey;
                      const presence = formatLastSeenStatus(
                        th.otherPartyLastSeenAt,
                        th.otherPartyActiveLastMinute,
                        nowTick
                      );
                      return (
                        <button
                          key={th.threadKey}
                          type="button"
                          onClick={() => setSelectedThreadKey(th.threadKey)}
                          className={`w-full min-w-0 rounded-lg border p-3 text-left transition ${
                            active
                              ? 'border-[#176B52] bg-emerald-50/60'
                              : 'border-[#172B3A]/10 bg-[#F4F6F5]/50 hover:bg-[#F4F6F5]'
                          }`}
                        >
                          <div className="flex items-center justify-between gap-2">
                            <span className="truncate text-xs font-bold text-[#172B3A]">
                              {th.otherPartyName || th.businessName}
                            </span>
                            <span className="shrink-0 font-mono text-[10px] font-semibold text-[#176B52]">
                              {th.orderNumber
                                ? th.orderNumber
                                : th.bookingReference
                                  ? th.bookingReference
                                  : 'SERVICE CHAT'}
                            </span>
                          </div>
                          <p className="mt-0.5 flex items-center gap-1.5 text-[10px] text-[#172B3A]/65">
                            <span
                              aria-hidden="true"
                              className={`h-1.5 w-1.5 shrink-0 rounded-full ${
                                presence.isActiveNow ? 'bg-emerald-500 animate-pulse' : 'bg-slate-400'
                              }`}
                            />
                            <span className={presence.isActiveNow ? 'font-semibold text-[#176B52]' : ''}>
                              {presence.label}
                            </span>
                          </p>
                          {th.listingTitle && (
                            <p className="mt-0.5 truncate text-[11px] font-medium text-[#172B3A]/75">
                              {th.listingTitle}
                            </p>
                          )}
                          <p className="mt-1 line-clamp-1 text-[11px] text-[#172B3A]/65">
                            {th.lastMessage?.senderName}: {th.lastMessage?.body}
                          </p>
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>

              <div ref={chatSectionRef} className="min-w-0 space-y-4 lg:col-span-7">
                {(() => {
                  const selected =
                    threads.find((th) => th.threadKey === selectedThreadKey) ||
                    (selectedThreadKey ? null : threads[0]);
                  const activeThreadKey = selected?.threadKey || selectedThreadKey;
                  if (!activeThreadKey) {
                    return (
                      <div className="flex h-72 items-center justify-center rounded-xl border border-[#172B3A]/10 bg-white p-8 text-center text-xs text-[#172B3A]/60">
                        Select a conversation on the left to read messages and reply live.
                      </div>
                    );
                  }
                  const selectedBiz = selected?.businessId ? bizById[selected.businessId] : undefined;
                  const myUids = new Set(
                    [dbUser?.uid, dbUser?.firebaseUid, firebaseUser?.uid].filter(Boolean) as string[]
                  );
                  const isThreadOwner = Boolean(
                    selected?.viewerIsOwner || (selectedBiz && myUids.has(selectedBiz.ownerUid))
                  );
                  return (
                    <>
                      <LiveChatPanel
                        threadKey={activeThreadKey}
                        businessId={selected?.businessId}
                        listingId={selected?.listingId}
                        orderId={selected?.orderId}
                        bookingId={selected?.bookingId}
                        recipientUid={selected?.otherPartyUid}
                        title={
                          selected
                            ? selected.otherPartyName || selected.businessName
                            : activeThreadKey.startsWith('order:')
                              ? 'Order Live Chat'
                              : activeThreadKey.startsWith('booking:')
                                ? 'Booking Live Chat'
                                : 'Direct Message'
                        }
                        subtitle={
                          selected
                            ? selected.orderNumber
                              ? `Order ${selected.orderNumber} (${selected.orderStatus || 'ACTIVE'})`
                              : selected.listingTitle || selected.businessName
                            : 'Loading conversation...'
                        }
                        initialLastSeenAt={selected?.otherPartyLastSeenAt}
                        initialActiveLastMinute={selected?.otherPartyActiveLastMinute}
                        placeholder={TRANSLATIONS[language].discover.writeReply}
                        onMessageSentOrReceived={() => loadThreadsOnly()}
                        onContractUpdated={() => setContractRefreshSignal((n) => n + 1)}
                      />
                      {!selected?.orderId && (
                        <ContractOfferSection
                          threadKey={activeThreadKey}
                          businessId={selected?.businessId}
                          listingId={selected?.listingId}
                          bookingId={selected?.bookingId}
                          recipientUid={selected?.otherPartyUid}
                          defaultTitle={
                            selected?.listingTitle || selected?.businessName || 'Service Request'
                          }
                          isOwner={isThreadOwner}
                          compact
                          refreshSignal={contractRefreshSignal}
                          onContractChanged={() => {
                            setContractRefreshSignal((n) => n + 1);
                            loadThreadsOnly();
                          }}
                        />
                      )}
                    </>
                  );
                })()}
              </div>
            </div>
          )}

          {tab === 'JOBS' && (
            <div className="space-y-6">
              <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-[#172B3A]/10 bg-white p-5">
                <div>
                  <h2 className="font-display text-base font-bold text-[#172B3A]">
                    My Job Seeker Advertisements ({myJobSeekerAds.length})
                  </h2>
                  <p className="text-xs text-[#172B3A]/65">
                    Advertise your skills & experience so nearby employers find you by searching
                    your description.
                  </p>
                </div>
                {onOpenJobSeekerAdvertise && (
                  <button
                    type="button"
                    onClick={onOpenJobSeekerAdvertise}
                    className="inline-flex min-h-[40px] items-center gap-1.5 rounded-lg bg-[#176B52] px-4 py-2 text-xs font-semibold text-white hover:bg-[#125641]"
                  >
                    <Briefcase className="h-3.5 w-3.5" />
                    Advertise Yourself (Job Seeker)
                  </button>
                )}
              </div>

              {myJobSeekerAds.length > 0 && (
                <div className="space-y-3">
                  {myJobSeekerAds.map((ad) => (
                    <div
                      key={`seeker-${ad.id}`}
                      className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-[#176B52]/20 bg-white p-4 text-xs"
                    >
                      <div className="min-w-0 flex-1">
                        <p className="font-semibold text-[#172B3A]">{ad.title}</p>
                        <p className="mt-1 line-clamp-2 text-[#172B3A]/70">{ad.description}</p>
                        <p className="mt-1 font-mono text-[11px] text-[#176B52]">
                          {ad.isUnpaid && Number(ad.basePrice) === 0
                            ? 'Negotiable'
                            : `${formatEtb(ad.basePrice)} / ${ad.pricingUnit}`}
                        </p>
                      </div>
                      <div className="flex flex-wrap items-center gap-2">
                        {onEditAd && (
                          <button
                            type="button"
                            onClick={() => onEditAd(ad)}
                            className="inline-flex min-h-[34px] items-center gap-1 rounded-md border border-[#176B52]/30 bg-emerald-50 px-2.5 py-1 font-semibold text-[#176B52] hover:bg-emerald-100"
                          >
                            <Pencil className="h-3 w-3" />
                            View / Edit
                          </button>
                        )}
                        <button
                          type="button"
                          onClick={async () => {
                            const next =
                              ad.availabilityStatus === 'AVAILABLE' ? 'UNAVAILABLE' : 'AVAILABLE';
                            await businessApi.updateAvailability(ad.id, { availabilityStatus: next });
                            onNotify(`"${ad.title}" marked ${next}.`);
                            await loadWorkspace();
                            onRefreshCatalog();
                          }}
                          className="min-h-[34px] rounded-md border border-[#176B52]/30 px-2.5 py-1 font-semibold text-[#176B52]"
                        >
                          {ad.availabilityStatus}
                        </button>
                        <button
                          type="button"
                          onClick={async () => {
                            await jobSeekerApi.remove(ad.id);
                            onNotify(`Removed "${ad.title}".`);
                            await loadWorkspace();
                            onRefreshCatalog();
                          }}
                          aria-label={`Remove ${ad.title}`}
                          className="flex h-8 w-8 items-center justify-center rounded-md border border-red-200 text-red-700 hover:bg-red-50"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}

              <div className="space-y-3">
                <h3 className="font-display text-sm font-bold text-[#172B3A]">
                  Submitted Job Applications ({applications.length})
                </h3>
                {applications.length === 0 ? (
                  <div className="rounded-xl border border-[#172B3A]/10 bg-white p-10 text-center text-sm text-[#172B3A]/65">
                    No job applications submitted yet.
                  </div>
                ) : (
                  applications.map((a) => {
                    const job = listingById[a.listingId];
                    const biz = bizById[a.businessId];
                    return (
                      <div key={a.id} className="rounded-xl border border-[#172B3A]/10 bg-white p-5">
                        <div className="flex flex-wrap justify-between gap-2">
                          <div>
                            <p className="text-sm font-semibold text-[#172B3A]">
                              {job?.title || 'Vacancy'} · {biz?.businessName}
                            </p>
                            <p className="mt-1 text-xs text-[#172B3A]/70">
                              Skills: {a.skills} · Expected: {formatEtb(a.expectedCompensation)}
                            </p>
                          </div>
                          <span className="text-xs font-semibold text-[#176B52]">
                            {a.applicationStatus}
                          </span>
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
            </div>
          )}

          {tab === 'FAVORITES' && (
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {favIds.length === 0 ? (
                <div className="col-span-full rounded-xl border border-[#172B3A]/10 bg-white p-12 text-center text-sm text-[#172B3A]/65">
                  Save products, services, or rentals from Discover to see them here.
                </div>
              ) : (
                favIds.map((id) => {
                  const l = listingById[id];
                  if (!l) return null;
                  return (
                    <div key={id} className="rounded-xl border border-[#172B3A]/10 bg-white p-5">
                      <p className="font-semibold text-[#172B3A]">{l.title}</p>
                      <p className="mt-1 font-mono text-sm font-bold text-[#176B52]">
                        {formatEtb(l.discountPrice || l.basePrice)} / {l.pricingUnit}
                      </p>
                    </div>
                  );
                })
              )}
            </div>
          )}
        </>
      )}

      {reviewTarget && (
        <div className="fixed inset-0 z-50 flex items-end justify-center overflow-x-hidden bg-[#172B3A]/45 p-2 sm:items-center sm:p-4">
          <form
            onSubmit={handleSubmitReview}
            className="w-full max-w-md space-y-4 overflow-x-hidden rounded-xl bg-white p-5 shadow-2xl sm:p-6"
          >
            <h2 className="font-display text-lg font-semibold text-[#172B3A]">
              Verified Transaction Review
            </h2>
            <p className="font-mono text-xs text-[#172B3A]/60">
              Reference: {reviewTarget.transactionRef}
            </p>
            <div>
              <label className="block text-xs font-medium text-[#172B3A]/75">Rating (1–5)</label>
              <select
                value={rating}
                onChange={(e) => setRating(Number(e.target.value))}
                className="mt-1 w-full rounded-lg border border-[#172B3A]/15 px-3 py-2 text-sm"
              >
                {[5, 4, 3, 2, 1].map((n) => (
                  <option key={n} value={n}>
                    {n} Stars
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-[#172B3A]/75">
                Written Feedback
              </label>
              <textarea
                required
                rows={3}
                value={comment}
                onChange={(e) => setComment(e.target.value)}
                placeholder="Share accuracy of pricing, timeliness, and quality..."
                className="mt-1 w-full rounded-lg border border-[#172B3A]/15 px-3 py-2 text-xs"
              />
            </div>
            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setReviewTarget(null)}
                className="rounded-lg border border-[#172B3A]/15 px-4 py-2 text-xs font-semibold"
              >
                Cancel
              </button>
              <button
                type="submit"
                className="rounded-lg bg-[#176B52] px-4 py-2 text-xs font-semibold text-white"
              >
                Publish Review
              </button>
            </div>
          </form>
        </div>
      )}

      {disputeTarget && (
        <div className="fixed inset-0 z-50 flex items-end justify-center overflow-x-hidden bg-[#172B3A]/50 p-2 sm:items-center sm:p-4">
          <form
            onSubmit={handleReportTheft}
            className="w-full max-w-md space-y-4 overflow-x-hidden rounded-xl bg-white p-5 shadow-2xl sm:p-6"
          >
            <h2 className="font-display text-lg font-bold text-red-700">
              {t.reportTheftBtn} · {disputeTarget.trackingCode}
            </h2>
            <p className="text-xs text-[#172B3A]/75">
              Immediately freezes Escrow ({formatEtb(disputeTarget.escrowAmount || disputeTarget.totalFee)})
              until Platform Admin investigates and resolves the conflict.
            </p>
            <div>
              <label className="block text-xs font-medium text-[#172B3A]/75">Conflict Category</label>
              <select
                value={disputeCategory}
                onChange={(e) => setDisputeCategory(e.target.value)}
                className="mt-1 h-10 w-full rounded-lg border border-[#172B3A]/20 bg-[#F4F6F5] px-3 text-xs font-medium"
              >
                <option value="PARCEL_MISSING_OR_STOLEN">Missing or Stolen Parcel</option>
                <option value="WRONG_OR_DAMAGED_ITEM">Damaged or Wrong Item</option>
                <option value="HANDOVER_OTP_DISPUTE">Handover / OTP Refusal</option>
                <option value="UNRESPONSIVE_PARTY">Driver / Receiver Unreachable</option>
                <option value="FARE_OR_ROUTE_CONFLICT">Route Deviation / Fare Conflict</option>
              </select>
            </div>
            <textarea
              required
              rows={3}
              value={disputeReason}
              onChange={(e) => setDisputeReason(e.target.value)}
              placeholder="Explain missing parcel, wrong item, unauthorized handover, or damage..."
              className="w-full rounded-lg border border-[#172B3A]/20 p-3 text-xs"
            />
            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setDisputeTarget(null)}
                className="min-h-[40px] rounded-lg border border-[#172B3A]/15 px-4 py-2 text-xs font-semibold"
              >
                Cancel
              </button>
              <button
                type="submit"
                className="min-h-[40px] rounded-lg bg-red-700 px-4 py-2 text-xs font-semibold text-white"
              >
                Open Conflict & Freeze Escrow
              </button>
            </div>
          </form>
        </div>
      )}

      {counterTarget && (
        <div className="fixed inset-0 z-50 flex items-end justify-center overflow-x-hidden bg-[#172B3A]/50 p-2 sm:items-center sm:p-4">
          <form
            onSubmit={handleSubmitCounterStatement}
            className="w-full max-w-md space-y-4 overflow-x-hidden rounded-xl bg-white p-5 shadow-2xl sm:p-6"
          >
            <h2 className="font-display text-lg font-bold text-[#172B3A]">
              Submit Counter-Statement · {counterTarget.trackingCode}
            </h2>
            <p className="text-xs text-[#172B3A]/75">
              Driver reported ({counterTarget.conflictCategory}): {counterTarget.disputeReason}
            </p>
            <textarea
              required
              rows={3}
              value={counterText}
              onChange={(e) => setCounterText(e.target.value)}
              placeholder="Provide sender/receiver evidence for Admin resolution..."
              className="w-full rounded-lg border border-[#172B3A]/20 p-3 text-xs"
            />
            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setCounterTarget(null)}
                className="min-h-[40px] rounded-lg border border-[#172B3A]/15 px-4 py-2 text-xs font-semibold"
              >
                Cancel
              </button>
              <button
                type="submit"
                className="min-h-[40px] rounded-lg bg-[#176B52] px-4 py-2 text-xs font-semibold text-white"
              >
                Submit Counter-Statement
              </button>
            </div>
          </form>
        </div>
      )}
      <LiveChatDrawer
        target={chatDrawerTarget}
        onClose={() => setChatDrawerTarget(null)}
        onMessageReceived={() => loadThreadsOnly()}
      />
    </div>
  );
};
