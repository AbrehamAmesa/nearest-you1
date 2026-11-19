import { commerceApi } from '../api/index.ts';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertTriangle,
  Car,
  CheckCircle2,
  KeyRound,
  Lock,
  MapPin,
  MessageSquareWarning,
  Navigation,
  Package,
  Radio,
  ShieldCheck,
  Truck,
} from 'lucide-react';
import type { DeliveryRecord, PlatformPolicy } from '../types/nearestyou.ts';
import { ADDIS_SUB_CITIES, formatEtb } from '../utils/geo.ts';
import { TRANSLATIONS, type AppLanguage } from '../utils/i18n.ts';
import { useAuth } from '../context/AuthContext.tsx';
import {
  DeliveryRoutePickerMap,
  type SelectedPlacePoint,
} from './DeliveryRoutePickerMap.tsx';
import { LiveDriverTrackerMap } from './ServiceMap.tsx';

interface DeliveryTransportViewProps {
  policy: PlatformPolicy;
  language: AppLanguage;
  onNotify: (msg: string) => void;
}

const CONFLICT_CATEGORIES = [
  { id: 'PARCEL_MISSING_OR_STOLEN', label: 'Parcel Missing / Suspected Theft' },
  { id: 'DAMAGED_GOODS', label: 'Damaged or Tampered Package' },
  { id: 'HANDOVER_OTP_REFUSAL', label: 'Receiver/Sender OTP Handover Refusal' },
  { id: 'NO_SHOW_OR_DELAY', label: 'Severe Delay or No-Show' },
  { id: 'FARE_OR_ROUTE_DISPUTE', label: 'Route Deviation / Fare Dispute' },
];

export const DeliveryTransportView: React.FC<DeliveryTransportViewProps> = ({
  policy,
  language,
  onNotify,
}) => {
  const t = TRANSLATIONS[language].delivery;
  const { firebaseUser, dbUser, isAdmin, hasRole, openAuthModal, authFetch } = useAuth();

  const [mode, setMode] = useState<'CUSTOMER' | 'TRACK' | 'PARTNER'>('CUSTOMER');
  const [requestType, setRequestType] = useState<'DELIVERY' | 'RIDE'>('DELIVERY');

  const [activePinMode, setActivePinMode] = useState<'PICKUP' | 'DESTINATION'>('PICKUP');
  const [pickup, setPickup] = useState<SelectedPlacePoint | null>(null);
  const [destination, setDestination] = useState<SelectedPlacePoint | null>(null);
  const [distanceKm, setDistanceKm] = useState<number>(4.5);
  const [durationMin, setDurationMin] = useState<number | null>(null);
  const [routeSource, setRouteSource] = useState<'OSRM' | 'HAVERSINE' | null>(null);

  const [details, setDetails] = useState('');
  const [receiverName, setReceiverName] = useState('');
  const [receiverPhone, setReceiverPhone] = useState('');
  const [declaredValue, setDeclaredValue] = useState<string>('0');

  const [vehicleType, setVehicleType] = useState<'MOTORCYCLE' | 'CAR' | 'VAN' | 'TRUCK'>(
    'MOTORCYCLE'
  );
  const [urgency, setUrgency] = useState<'STANDARD' | 'EXPRESS'>('STANDARD');
  const [paymentMethod, setPaymentMethod] = useState<'TELEBIRR' | 'CBE_BIRR' | 'CASH'>('TELEBIRR');
  const [submitting, setSubmitting] = useState(false);

  const isVerifiedPartner =
    isAdmin ||
    hasRole('DELIVERY_PARTNER') ||
    dbUser?.providerVerificationStatus === 'VERIFIED';

  // Partner GPS + Nearest Matching Radius
  const [partnerAvailable, setPartnerAvailable] = useState(true);
  const [driverGps, setDriverGps] = useState<{ lat: number; lng: number } | null>(null);
  const [gpsStatusText, setGpsStatusText] = useState<string>('Detecting GPS...');
  const [matchRadiusKm, setMatchRadiusKm] = useState<number>(policy.deliveryMatchRadiusKm || 5);
  const [queue, setQueue] = useState<DeliveryRecord[]>([]);
  const [loadingQueue, setLoadingQueue] = useState(false);
  const [claimingId, setClaimingId] = useState<number | null>(null);
  const [broadcastingGpsId, setBroadcastingGpsId] = useState<number | null>(null);
  const [otpInputs, setOtpInputs] = useState<Record<number, string>>({});

  // Live Driver Tracker Tab State (Sender & Receiver)
  const [trackCodeInput, setTrackCodeInput] = useState('');
  const [trackPhoneInput, setTrackPhoneInput] = useState('');
  const [activeTrackQuery, setActiveTrackQuery] = useState<{
    code: string;
    phone: string;
  } | null>(null);
  const [trackedDelivery, setTrackedDelivery] = useState<
    (Partial<DeliveryRecord> & { viewerRole?: string }) | null
  >(null);
  const [trackError, setTrackError] = useState<string | null>(null);
  const [loadingTrack, setLoadingTrack] = useState(false);

  // Structured Conflict & Counter-Statement Modals
  const [conflictTarget, setConflictTarget] = useState<DeliveryRecord | null>(null);
  const [conflictCategory, setConflictCategory] = useState<string>('HANDOVER_OTP_REFUSAL');
  const [conflictReason, setConflictReason] = useState('');
  const [counterTarget, setCounterTarget] = useState<DeliveryRecord | null>(null);
  const [counterText, setCounterText] = useState('');

  const driverGpsRef = useRef(driverGps);
  driverGpsRef.current = driverGps;

  // Acquire partner GPS coordinates automatically when entering PARTNER tab
  const refreshPartnerGps = useCallback(() => {
    if (typeof navigator === 'undefined' || !navigator.geolocation) {
      setDriverGps({ lat: ADDIS_SUB_CITIES[0].lat, lng: ADDIS_SUB_CITIES[0].lng });
      setGpsStatusText('Using Addis fallback center (manual hub selector available)');
      return;
    }
    setGpsStatusText('Acquiring live GPS...');
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const lat = Number(pos.coords.latitude.toFixed(6));
        const lng = Number(pos.coords.longitude.toFixed(6));
        setDriverGps({ lat, lng });
        setGpsStatusText(`Live GPS: ${lat.toFixed(5)}, ${lng.toFixed(5)}`);
      },
      () => {
        setDriverGps((prev) =>
          prev || { lat: ADDIS_SUB_CITIES[0].lat, lng: ADDIS_SUB_CITIES[0].lng }
        );
        setGpsStatusText('GPS permission blocked; select hub or tap Allow Location');
      },
      { enableHighAccuracy: true, timeout: 7000 }
    );
  }, []);

  useEffect(() => {
    if (mode === 'PARTNER' && !driverGps) {
      refreshPartnerGps();
    }
  }, [mode, driverGps, refreshPartnerGps]);

  const loadQueue = useCallback(async () => {
    if (!firebaseUser) return;
    setLoadingQueue(true);
    try {
      const coords = driverGpsRef.current;
      const params = new URLSearchParams();
      if (coords) {
        params.set('lat', String(coords.lat));
        params.set('lng', String(coords.lng));
      }
      const qs = params.toString();
      const res = await authFetch(`/api/v1/deliveries${qs ? `?${qs}` : ''}`);
      if (res.ok) {
        const data = await res.json();
        setQueue(data.deliveries || []);
        if (data.matchRadiusKm) {
          setMatchRadiusKm(Number(data.matchRadiusKm));
        }
        if (!coords && data.driverLat && data.driverLng) {
          setDriverGps({ lat: Number(data.driverLat), lng: Number(data.driverLng) });
        }
      }
    } catch (err) {
      console.error(err);
    } finally {
      setLoadingQueue(false);
    }
  }, [firebaseUser, authFetch]);

  useEffect(() => {
    if (firebaseUser) {
      loadQueue();
    }
  }, [firebaseUser, driverGps?.lat, driverGps?.lng, loadQueue]);

  // Real-time driver location auto-broadcast while Partner is online with active ASSIGNED/PICKED_UP trips
  const activeAssignedDeliveries = useMemo(() => {
    if (!dbUser) return [];
    return queue.filter(
      (d) =>
        d.driverUid === dbUser.uid &&
        (d.status === 'ASSIGNED' || d.status === 'PICKED_UP')
    );
  }, [queue, dbUser]);

  const sendDriverLocationPing = useCallback(
    async (deliveryId: number, lat: number, lng: number, quiet = true) => {
      try {
        const res = await authFetch(`/api/v1/deliveries/${deliveryId}/driver-location`, {
          method: 'POST',
          body: JSON.stringify({ latitude: lat, longitude: lng }),
        });
        if (res.ok && !quiet) {
          onNotify(`Live GPS ping sent (${lat.toFixed(5)}, ${lng.toFixed(5)})`);
          loadQueue();
        }
      } catch {}
    },
    [authFetch, onNotify, loadQueue]
  );

  useEffect(() => {
    if (!firebaseUser || !partnerAvailable || activeAssignedDeliveries.length === 0) {
      return;
    }

    let watchId: number | null = null;
    if (typeof navigator !== 'undefined' && navigator.geolocation) {
      watchId = navigator.geolocation.watchPosition(
        (pos) => {
          const lat = Number(pos.coords.latitude.toFixed(6));
          const lng = Number(pos.coords.longitude.toFixed(6));
          setDriverGps({ lat, lng });
          setGpsStatusText(`Live GPS: ${lat.toFixed(5)}, ${lng.toFixed(5)}`);
        },
        () => {},
        { enableHighAccuracy: true, maximumAge: 5000 }
      );
    }

    const pushAll = () => {
      const coords = driverGpsRef.current;
      if (!coords) return;
      activeAssignedDeliveries.forEach((d) => {
        sendDriverLocationPing(d.id, coords.lat, coords.lng, true);
      });
    };

    pushAll();
    const timer = setInterval(pushAll, 10000);
    return () => {
      clearInterval(timer);
      if (watchId !== null && typeof navigator !== 'undefined' && navigator.geolocation) {
        navigator.geolocation.clearWatch(watchId);
      }
    };
  }, [firebaseUser, partnerAvailable, activeAssignedDeliveries, sendDriverLocationPing]);

  // Live Driver Tracking Poll (Sender & Receiver)
  const fetchLiveTrack = useCallback(
    async (code: string, phone: string, showSpinner = false) => {
      const cleanCode = code.trim();
      if (!cleanCode) return;
      if (showSpinner) setLoadingTrack(true);
      setTrackError(null);
      try {
        const res = await commerceApi.trackDelivery(cleanCode, phone.trim() ? { receiverPhone: phone.trim() } : undefined);
        const data = res.data;
        setTrackedDelivery(data);
        setTrackError(null);
      } catch (err) {
        setTrackError(err instanceof Error ? err.message : 'Tracking fetch failed.');
      } finally {
        if (showSpinner) setLoadingTrack(false);
      }
    },
    [firebaseUser, authFetch]
  );

  useEffect(() => {
    if (!activeTrackQuery) return;
    fetchLiveTrack(activeTrackQuery.code, activeTrackQuery.phone, true);
    const timer = setInterval(() => {
      fetchLiveTrack(activeTrackQuery.code, activeTrackQuery.phone, false);
    }, 5000);
    return () => clearInterval(timer);
  }, [activeTrackQuery, fetchLiveTrack]);

  const handleStartLiveTrack = (e: React.FormEvent) => {
    e.preventDefault();
    if (!trackCodeInput.trim()) {
      onNotify('Enter a Delivery Tracking Code (e.g., NY-DEL-...) first.');
      return;
    }
    setActiveTrackQuery({
      code: trackCodeInput.trim(),
      phone: trackPhoneInput.trim(),
    });
  };

  const estimate = useMemo(() => {
    const baseFee = requestType === 'RIDE' ? policy.rideBaseFare : policy.deliveryBaseFee;
    const perKm = requestType === 'RIDE' ? policy.ridePerKmRate : policy.deliveryPerKmRate;
    const vehicleMult =
      vehicleType === 'TRUCK' ? 2.2 : vehicleType === 'VAN' ? 1.6 : vehicleType === 'CAR' ? 1.25 : 1.0;
    const distanceFee = Math.round(distanceKm * perKm * vehicleMult);
    const expressFee =
      urgency === 'EXPRESS'
        ? Math.round((baseFee + distanceFee) * (policy.expressMultiplier - 1))
        : 0;
    const taxableSubtotal = baseFee + distanceFee + expressFee;
    const vatAmount = Math.round(taxableSubtotal * ((policy.taxRatePercent || 15) / 100) * 100) / 100;
    const total = Math.round((taxableSubtotal + vatAmount) * 100) / 100;
    return { baseFee, perKm, vehicleMult, distanceFee, expressFee, taxableSubtotal, vatAmount, total };
  }, [requestType, vehicleType, urgency, distanceKm, policy]);

  const handleSubmitRequest = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!pickup || !destination) {
      onNotify('Select or pin both Start (Pickup) and Destination locations on the map first.');
      return;
    }
    if (!firebaseUser) {
      openAuthModal('signin');
      return;
    }

    setSubmitting(true);
    try {
      const res = await authFetch('/api/v1/deliveries', {
        method: 'POST',
        body: JSON.stringify({
          requestType,
          pickupLocation: pickup.label,
          pickupLat: pickup.lat,
          pickupLng: pickup.lng,
          pickupPlaceId: pickup.placeId || null,
          destinationLocation: destination.label,
          destinationLat: destination.lat,
          destinationLng: destination.lng,
          destinationPlaceId: destination.placeId || null,
          packageOrRideDetails: details,
          receiverName: receiverName.trim() || undefined,
          receiverPhone: receiverPhone.trim() || undefined,
          declaredValue: Number(declaredValue) || 0,
          vehicleType,
          urgency,
          distanceKm,
          paymentMethod,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to submit request.');
      onNotify(
        `${data.trackingCode} dispatched (${formatEtb(data.totalFee)}). Pickup OTP: ${data.pickupOtp} · Receiver OTP: ${data.deliveryOtp}`
      );
      setDetails('');
      await loadQueue();
    } catch (err: unknown) {
      onNotify(err instanceof Error ? err.message : 'Request failed.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleTransition = async (id: number, status: string, requiresOtp = false) => {
    const otp = (otpInputs[id] || '').trim();
    if (requiresOtp && otp.length < 4) {
      onNotify('Enter the 6-digit handover OTP code first.');
      return;
    }
    if (status === 'ASSIGNED') {
      setClaimingId(id);
    }
    try {
      const bodyPayload: Record<string, unknown> = {
        status,
        otp: requiresOtp ? otp : undefined,
      };
      if (status === 'ASSIGNED' && driverGps) {
        bodyPayload.driverLat = driverGps.lat;
        bodyPayload.driverLng = driverGps.lng;
      }
      const res = await authFetch(`/api/v1/deliveries/${id}/transition`, {
        method: 'POST',
        body: JSON.stringify(bodyPayload),
      });
      const data = await res.json();
      if (res.ok) {
        setOtpInputs((prev) => {
          const next = { ...prev };
          delete next[id];
          return next;
        });
        onNotify(`Assignment updated to ${status.replace('_', ' ')} (${data.escrowStatus || ''}).`);
        await loadQueue();
      } else {
        onNotify(data.error || 'Transition rejected.');
        if (res.status === 409) {
          await loadQueue();
        }
      }
    } catch (err) {
      console.error(err);
    } finally {
      if (status === 'ASSIGNED') {
        setClaimingId(null);
      }
    }
  };

  const handleManualBroadcastGps = async (deliveryId: number) => {
    setBroadcastingGpsId(deliveryId);
    const finishPing = async (lat: number, lng: number) => {
      setDriverGps({ lat, lng });
      setGpsStatusText(`Live GPS: ${lat.toFixed(5)}, ${lng.toFixed(5)}`);
      await sendDriverLocationPing(deliveryId, lat, lng, false);
      setBroadcastingGpsId(null);
    };

    if (typeof navigator !== 'undefined' && navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        (pos) => finishPing(Number(pos.coords.latitude.toFixed(6)), Number(pos.coords.longitude.toFixed(6))),
        () => {
          const fallback = driverGps || { lat: ADDIS_SUB_CITIES[0].lat, lng: ADDIS_SUB_CITIES[0].lng };
          finishPing(fallback.lat, fallback.lng);
        },
        { enableHighAccuracy: true, timeout: 6000 }
      );
    } else {
      const fallback = driverGps || { lat: ADDIS_SUB_CITIES[0].lat, lng: ADDIS_SUB_CITIES[0].lng };
      await finishPing(fallback.lat, fallback.lng);
    }
  };

  const handleOpenConflict = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!conflictTarget || !conflictReason.trim()) return;
    const res = await authFetch(`/api/v1/deliveries/${conflictTarget.id}/conflict`, {
      method: 'POST',
      body: JSON.stringify({
        reason: conflictReason.trim(),
        category: conflictCategory,
      }),
    });
    const data = await res.json();
    if (res.ok) {
      onNotify(`Conflict opened & Escrow frozen on ${conflictTarget.trackingCode}.`);
      setConflictTarget(null);
      setConflictReason('');
      await loadQueue();
    } else {
      onNotify(data.error || 'Could not freeze escrow.');
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
      onNotify(`Driver counter-statement recorded for ${counterTarget.trackingCode}.`);
      setCounterTarget(null);
      setCounterText('');
      await loadQueue();
    } else {
      onNotify(data.error || 'Could not submit counter-statement.');
    }
  };

  const myCustomerDeliveries = useMemo(() => {
    if (!dbUser) return [];
    return queue.filter((d) => d.customerUid === dbUser.uid);
  }, [queue, dbUser]);

  return (
    <div className="mx-auto max-w-[1440px] space-y-6 sm:space-y-8 px-4 sm:px-6 py-6 sm:py-8">
      <div className="flex flex-col gap-4 border-b border-[#172B3A]/10 pb-6 lg:flex-row lg:items-center sm:justify-between">
        <div>
          <h1 className="font-display text-2xl sm:text-3xl font-bold text-[#172B3A]">{t.title}</h1>
          <p className="mt-1 text-sm text-[#172B3A]/70">{t.subtitle}</p>
        </div>

        <div className="flex flex-wrap gap-1 rounded-lg bg-white p-1 border border-[#172B3A]/10 shrink-0">
          <button
            type="button"
            onClick={() => setMode('CUSTOMER')}
            className={`min-h-[44px] rounded-md px-3.5 py-2 text-xs font-semibold transition-colors whitespace-nowrap ${
              mode === 'CUSTOMER' ? 'bg-[#176B52] text-white' : 'text-[#172B3A]/70 hover:text-[#172B3A]'
            }`}
          >
            {t.tabCustomer}
          </button>
          <button
            type="button"
            onClick={() => setMode('TRACK')}
            className={`min-h-[44px] inline-flex items-center gap-1.5 rounded-md px-3.5 py-2 text-xs font-semibold transition-colors whitespace-nowrap ${
              mode === 'TRACK' ? 'bg-[#176B52] text-white' : 'text-[#172B3A]/70 hover:text-[#172B3A]'
            }`}
          >
            <Radio className="h-3.5 w-3.5" />
            {t.tabTrackLive}
          </button>
          <button
            type="button"
            onClick={() => setMode('PARTNER')}
            className={`min-h-[44px] rounded-md px-3.5 py-2 text-xs font-semibold transition-colors whitespace-nowrap ${
              mode === 'PARTNER' ? 'bg-[#176B52] text-white' : 'text-[#172B3A]/70 hover:text-[#172B3A]'
            }`}
          >
            {t.tabPartner}
          </button>
        </div>
      </div>

      {mode === 'CUSTOMER' ? (
        <div className="space-y-8">
          <div className="grid gap-8 lg:grid-cols-12">
            <form
              onSubmit={handleSubmitRequest}
              className="space-y-5 rounded-2xl border border-[#172B3A]/10 bg-white p-4 sm:p-6 lg:col-span-7"
            >
              <div className="grid grid-cols-2 gap-2 rounded-lg bg-[#F4F6F5] p-1">
                <button
                  type="button"
                  onClick={() => {
                    setRequestType('DELIVERY');
                    setVehicleType('MOTORCYCLE');
                  }}
                  className={`min-h-[44px] rounded-md px-3 py-2 text-xs font-semibold ${
                    requestType === 'DELIVERY'
                      ? 'bg-white text-[#176B52] shadow-sm'
                      : 'text-[#172B3A]/70'
                  }`}
                >
                  {t.independentDelivery}
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setRequestType('RIDE');
                    setVehicleType('CAR');
                  }}
                  className={`min-h-[44px] rounded-md px-3 py-2 text-xs font-semibold ${
                    requestType === 'RIDE'
                      ? 'bg-white text-[#176B52] shadow-sm'
                      : 'text-[#172B3A]/70'
                  }`}
                >
                  {t.passengerRide}
                </button>
              </div>

              {/* Free OpenStreetMap + OSRM Route Picker */}
              <DeliveryRoutePickerMap
                language={language}
                activePinMode={activePinMode}
                onChangePinMode={setActivePinMode}
                pickup={pickup}
                destination={destination}
                onSelectPickup={setPickup}
                onSelectDestination={setDestination}
                onRouteCalculated={(km, durMin, src) => {
                  setDistanceKm(km);
                  setDurationMin(durMin);
                  setRouteSource(src);
                }}
              />

              {/* Calculated Route Kilometer Readout */}
              <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-[#176B52]/25 bg-emerald-50/50 px-4 py-3 text-xs">
                <span className="font-semibold text-[#172B3A]">{t.distanceFromMap}</span>
                <div className="flex items-center gap-3 font-mono font-bold tabular-nums text-[#176B52]">
                  <span>{distanceKm} km</span>
                  {durationMin && <span className="text-[#172B3A]/70">· ~{durationMin} min</span>}
                  {routeSource === 'OSRM' && (
                    <span className="text-[11px] font-medium text-[#176B52]">
                      · OpenStreetMap / OSRM Route
                    </span>
                  )}
                </div>
              </div>

              <div>
                <label className="block text-xs font-medium text-[#172B3A]/75">
                  {t.packageDetails}
                </label>
                <input
                  required
                  type="text"
                  value={details}
                  onChange={(e) => setDetails(e.target.value)}
                  placeholder="e.g., Sealed electronics box #44, 2.5 kg"
                  className="mt-1.5 h-11 w-full rounded-lg border border-[#172B3A]/15 bg-[#F4F6F5] px-3 text-sm"
                />
              </div>

              {/* Anti-Theft Receiver Identity & Declared Value */}
              <div className="grid gap-3 sm:grid-cols-3">
                <div>
                  <label className="block text-xs font-medium text-[#172B3A]/75">
                    {t.receiverName}
                  </label>
                  <input
                    required={requestType === 'DELIVERY'}
                    type="text"
                    value={receiverName}
                    onChange={(e) => setReceiverName(e.target.value)}
                    placeholder="Abebe Bikila"
                    className="mt-1 h-11 w-full rounded-lg border border-[#172B3A]/15 bg-[#F4F6F5] px-3 text-xs"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-[#172B3A]/75">
                    {t.receiverPhone}
                  </label>
                  <input
                    required={requestType === 'DELIVERY'}
                    type="tel"
                    value={receiverPhone}
                    onChange={(e) => setReceiverPhone(e.target.value)}
                    placeholder="+251 9..."
                    className="mt-1 h-11 w-full rounded-lg border border-[#172B3A]/15 bg-[#F4F6F5] px-3 font-mono text-xs"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-[#172B3A]/75">
                    {t.declaredValue}
                  </label>
                  <input
                    type="number"
                    min={0}
                    value={declaredValue}
                    onChange={(e) => setDeclaredValue(e.target.value)}
                    className="mt-1 h-11 w-full rounded-lg border border-[#172B3A]/15 bg-[#F4F6F5] px-3 font-mono text-xs"
                  />
                </div>
              </div>

              <div className="grid gap-4 sm:grid-cols-2">
                <div>
                  <span className="block text-xs font-medium text-[#172B3A]/75">
                    {t.vehicleCategory}
                  </span>
                  <div className="mt-1.5 grid grid-cols-2 gap-2">
                    {[
                      { id: 'MOTORCYCLE', label: 'Motorcycle', icon: Package },
                      { id: 'CAR', label: 'Car', icon: Car },
                      { id: 'VAN', label: 'Van', icon: Navigation },
                      { id: 'TRUCK', label: 'Truck', icon: Truck },
                    ].map((v) => {
                      const Icon = v.icon;
                      return (
                        <button
                          key={v.id}
                          type="button"
                          onClick={() => setVehicleType(v.id as typeof vehicleType)}
                          className={`flex min-h-[44px] items-center gap-2 rounded-lg border px-3 py-2 text-xs font-semibold ${
                            vehicleType === v.id
                              ? 'border-[#176B52] bg-[#176B52]/10 text-[#176B52]'
                              : 'border-[#172B3A]/15 bg-white text-[#172B3A]/75'
                          }`}
                        >
                          <Icon className="h-3.5 w-3.5" />
                          {v.label}
                        </button>
                      );
                    })}
                  </div>
                </div>

                <div className="space-y-3">
                  <div className="grid grid-cols-2 gap-2">
                    {(['STANDARD', 'EXPRESS'] as const).map((u) => (
                      <button
                        key={u}
                        type="button"
                        onClick={() => setUrgency(u)}
                        className={`min-h-[44px] rounded-lg border px-3 py-1.5 text-xs font-semibold ${
                          urgency === u
                            ? 'border-[#172B3A] bg-[#172B3A] text-white'
                            : 'border-[#172B3A]/15 bg-white text-[#172B3A]/75'
                        }`}
                      >
                        {u === 'STANDARD' ? t.standard : t.express}
                      </button>
                    ))}
                  </div>

                  <div className="grid grid-cols-3 gap-2">
                    {(['TELEBIRR', 'CBE_BIRR', 'CASH'] as const).map((pm) => (
                      <button
                        key={pm}
                        type="button"
                        onClick={() => setPaymentMethod(pm)}
                        className={`min-h-[44px] rounded-lg border px-2 py-2 text-xs font-semibold ${
                          paymentMethod === pm
                            ? 'border-[#176B52] bg-[#176B52]/10 text-[#176B52]'
                            : 'border-[#172B3A]/15 bg-white text-[#172B3A]/75'
                        }`}
                      >
                        {pm === 'CBE_BIRR' ? 'CBE Birr' : pm === 'TELEBIRR' ? 'Telebirr' : 'Cash'}
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              <button
                type="submit"
                disabled={submitting}
                className="w-full min-h-[44px] rounded-lg bg-[#176B52] px-5 py-3 text-sm font-semibold text-white hover:bg-[#125641] disabled:opacity-50"
              >
                {submitting
                  ? '...'
                  : firebaseUser
                    ? `${requestType === 'RIDE' ? t.confirmRide : t.confirmDelivery} · ${formatEtb(estimate.total)}`
                    : `${t.signInToConfirm} · ${formatEtb(estimate.total)}`}
              </button>
            </form>

            {/* Transparent Fare Breakdown + Anti-Theft Protection Panel */}
            <div className="space-y-6 rounded-2xl border border-[#172B3A]/10 bg-white p-4 sm:p-6 lg:col-span-5">
              <div>
                <h2 className="font-display text-lg font-semibold text-[#172B3A]">
                  {t.fareBreakdownTitle}
                </h2>
                <p className="mt-1 text-xs text-[#172B3A]/60">{t.fareBreakdownSubtitle}</p>

                <div className="mt-5 space-y-3 border-t border-[#172B3A]/10 pt-4 text-sm">
                  <div className="flex justify-between">
                    <span className="text-[#172B3A]/70">{t.baseFee}</span>
                    <span className="font-mono tabular-nums">{formatEtb(estimate.baseFee)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-[#172B3A]/70">
                      {t.distanceCharge} ({distanceKm} km × {estimate.perKm} × {estimate.vehicleMult}x)
                    </span>
                    <span className="font-mono tabular-nums">{formatEtb(estimate.distanceFee)}</span>
                  </div>
                  {estimate.expressFee > 0 && (
                    <div className="flex justify-between">
                      <span className="text-[#172B3A]/70">{t.expressSurcharge}</span>
                      <span className="font-mono tabular-nums">
                        {formatEtb(estimate.expressFee)}
                      </span>
                    </div>
                  )}
                  <div className="flex justify-between">
                    <span className="text-[#172B3A]/70">{t.vatLabel}</span>
                    <span className="font-mono tabular-nums">{formatEtb(estimate.vatAmount)}</span>
                  </div>
                  <div className="flex justify-between border-t border-[#172B3A]/10 pt-3 font-semibold text-[#172B3A]">
                    <span>{t.guaranteedTotal}</span>
                    <span className="font-mono text-xl tabular-nums text-[#176B52]">
                      {formatEtb(estimate.total)}
                    </span>
                  </div>
                </div>
              </div>

              <div className="space-y-2.5 border-t border-[#172B3A]/10 pt-5 text-xs text-[#172B3A]/80">
                <h3 className="flex items-center gap-1.5 font-display text-sm font-bold text-[#172B3A]">
                  <ShieldCheck className="h-4 w-4 text-[#176B52]" />
                  {t.antiTheftTitle}
                </h3>
                <p>· {t.antiTheft1}</p>
                <p>· {t.antiTheft2}</p>
                <p>· {t.antiTheft3}</p>
                <p>· {t.antiTheft4}</p>
              </div>
            </div>
          </div>

          {/* Sender's Recent Escrow Dispatches & Handover OTP Codes */}
          {myCustomerDeliveries.length > 0 && (
            <div className="rounded-2xl border border-[#172B3A]/10 bg-white p-4 sm:p-6 space-y-4">
              <h2 className="font-display text-lg font-bold text-[#172B3A]">
                Active Escrow Dispatches & Security OTP Codes
              </h2>
              <div className="grid gap-4 md:grid-cols-2">
                {myCustomerDeliveries.slice(0, 4).map((d) => (
                  <div
                    key={d.id}
                    className="rounded-xl border border-[#172B3A]/10 bg-[#F4F6F5]/60 p-4 text-xs space-y-2.5"
                  >
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <span className="font-mono font-bold text-[#172B3A]">
                        {d.trackingCode} · {d.status}
                      </span>
                      <span className="font-mono font-semibold text-[#176B52]">
                        {t.escrowStatus}: {d.escrowStatus || 'HELD_IN_ESCROW'}
                      </span>
                    </div>
                    <p className="text-[#172B3A]/75">
                      {d.pickupLocation} → {d.destinationLocation} ({d.distanceKm} km)
                    </p>
                    {d.receiverName && (
                      <p className="text-[#172B3A]/65">
                        Receiver: {d.receiverName} ({d.receiverPhone}) · Value:{' '}
                        {formatEtb(d.declaredValue || 0)}
                      </p>
                    )}
                    <div className="grid grid-cols-2 gap-2 pt-1 font-mono">
                      <div className="rounded-lg border border-[#172B3A]/15 bg-white px-3 py-2">
                        <span className="block text-[10px] text-[#172B3A]/60">
                          {t.pickupOtpLabel}
                        </span>
                        <span className="text-sm font-bold text-[#172B3A]">
                          {d.pickupOtp || 'Verified'}
                        </span>
                      </div>
                      <div className="rounded-lg border border-[#176B52]/30 bg-white px-3 py-2">
                        <span className="block text-[10px] text-[#176B52]">
                          {t.deliveryOtpLabel}
                        </span>
                        <span className="text-sm font-bold text-[#176B52]">
                          {d.deliveryOtp || 'Verified'}
                        </span>
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => {
                        setTrackCodeInput(d.trackingCode);
                        setTrackPhoneInput(d.receiverPhone || '');
                        setActiveTrackQuery({
                          code: d.trackingCode,
                          phone: d.receiverPhone || '',
                        });
                        setMode('TRACK');
                      }}
                      className="inline-flex min-h-[40px] items-center gap-1.5 rounded-lg border border-[#176B52]/30 bg-white px-3 py-1.5 text-xs font-semibold text-[#176B52] hover:bg-emerald-50"
                    >
                      <Radio className="h-3.5 w-3.5" />
                      {t.tabTrackLive}
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      ) : mode === 'TRACK' ? (
        <div className="space-y-6">
          <form
            onSubmit={handleStartLiveTrack}
            className="rounded-2xl border border-[#172B3A]/10 bg-white p-4 sm:p-6 space-y-4"
          >
            <div>
              <h2 className="font-display text-lg font-bold text-[#172B3A]">
                Real-Time Sender & Receiver Driver Tracking
              </h2>
              <p className="mt-1 text-xs text-[#172B3A]/65">
                Both Sender and Receiver can track the assigned driver live on OpenStreetMap. Receivers
                without an account enter the Tracking Code plus their registered Receiver Phone number.
              </p>
            </div>

            {myCustomerDeliveries.length > 0 && (
              <div className="flex flex-wrap items-center gap-2 text-xs">
                <span className="text-[#172B3A]/65 font-medium">Your dispatches:</span>
                {myCustomerDeliveries.slice(0, 5).map((d) => (
                  <button
                    key={d.id}
                    type="button"
                    onClick={() => {
                      setTrackCodeInput(d.trackingCode);
                      setTrackPhoneInput(d.receiverPhone || '');
                      setActiveTrackQuery({
                        code: d.trackingCode,
                        phone: d.receiverPhone || '',
                      });
                    }}
                    className="min-h-[36px] rounded-lg border border-[#176B52]/30 bg-emerald-50/50 px-3 py-1 font-mono text-[11px] font-semibold text-[#176B52] hover:bg-emerald-100"
                  >
                    {d.trackingCode} ({d.status})
                  </button>
                ))}
              </div>
            )}

            <div className="grid gap-3 sm:grid-cols-12">
              <div className="sm:col-span-5">
                <label className="block text-xs font-medium text-[#172B3A]/75">
                  Delivery Tracking Code
                </label>
                <input
                  required
                  type="text"
                  value={trackCodeInput}
                  onChange={(e) => setTrackCodeInput(e.target.value)}
                  placeholder="NY-DEL-..."
                  className="mt-1 h-11 w-full rounded-lg border border-[#172B3A]/15 bg-[#F4F6F5] px-3 font-mono text-xs"
                />
              </div>
              <div className="sm:col-span-4">
                <label className="block text-xs font-medium text-[#172B3A]/75">
                  Receiver Phone (Required for Guest Receiver)
                </label>
                <input
                  type="tel"
                  value={trackPhoneInput}
                  onChange={(e) => setTrackPhoneInput(e.target.value)}
                  placeholder="+251 9..."
                  className="mt-1 h-11 w-full rounded-lg border border-[#172B3A]/15 bg-[#F4F6F5] px-3 font-mono text-xs"
                />
              </div>
              <div className="flex items-end sm:col-span-3">
                <button
                  type="submit"
                  disabled={loadingTrack}
                  className="w-full min-h-[44px] rounded-lg bg-[#176B52] px-4 py-2.5 text-xs font-semibold text-white hover:bg-[#125641] disabled:opacity-50"
                >
                  {loadingTrack ? 'Connecting...' : 'Start 5s Live Tracking'}
                </button>
              </div>
            </div>

            {trackError && (
              <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-xs text-red-800">
                {trackError}
              </div>
            )}
          </form>

          {trackedDelivery && (
            <div className="rounded-2xl border border-[#176B52]/25 bg-white p-4 sm:p-6 space-y-5">
              <div className="flex flex-wrap items-start justify-between gap-4 border-b border-[#172B3A]/10 pb-4">
                <div className="space-y-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-mono text-base font-bold text-[#172B3A]">
                      {trackedDelivery.trackingCode}
                    </span>
                    <span className="rounded bg-[#176B52]/10 px-2 py-0.5 font-mono text-[11px] font-bold text-[#176B52]">
                      {trackedDelivery.status}
                    </span>
                    {trackedDelivery.viewerRole && (
                      <span className="rounded bg-[#172B3A]/10 px-2 py-0.5 font-mono text-[11px] font-semibold text-[#172B3A]">
                        Viewer: {trackedDelivery.viewerRole}
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-[#172B3A]/75">
                    {trackedDelivery.pickupLocation} → {trackedDelivery.destinationLocation} (
                    {trackedDelivery.distanceKm} km)
                  </p>
                </div>

                <div className="text-left sm:text-right font-mono text-xs">
                  <p className="font-semibold text-[#176B52]">
                    Escrow: {trackedDelivery.escrowStatus}
                  </p>
                  <p className="text-[#172B3A]/65">
                    Driver: {trackedDelivery.driverName || 'Waiting for nearest <5 km partner'}
                  </p>
                </div>
              </div>

              <LiveDriverTrackerMap
                pickupLat={
                  trackedDelivery.pickupLat ? Number(trackedDelivery.pickupLat) : null
                }
                pickupLng={
                  trackedDelivery.pickupLng ? Number(trackedDelivery.pickupLng) : null
                }
                pickupLabel={trackedDelivery.pickupLocation || 'Pickup'}
                destinationLat={
                  trackedDelivery.destinationLat ? Number(trackedDelivery.destinationLat) : null
                }
                destinationLng={
                  trackedDelivery.destinationLng ? Number(trackedDelivery.destinationLng) : null
                }
                destinationLabel={trackedDelivery.destinationLocation || 'Destination'}
                driverLat={
                  trackedDelivery.driverLat ? Number(trackedDelivery.driverLat) : null
                }
                driverLng={
                  trackedDelivery.driverLng ? Number(trackedDelivery.driverLng) : null
                }
                driverName={trackedDelivery.driverName}
                driverUpdatedAt={trackedDelivery.driverLocationUpdatedAt}
                heightClass="h-[300px] sm:h-[380px]"
              />

              <div className="grid gap-4 sm:grid-cols-2">
                {trackedDelivery.deliveryOtp && (
                  <div className="rounded-xl border border-[#176B52]/30 bg-emerald-50/40 p-4 text-xs">
                    <p className="font-semibold text-[#176B52]">
                      Receiver Delivery Verification OTP
                    </p>
                    <p className="mt-1 font-mono text-xl font-bold text-[#176B52]">
                      {trackedDelivery.deliveryOtp}
                    </p>
                    <p className="mt-1 text-[11px] text-[#172B3A]/70">
                      Share this 6-digit code with the driver ONLY upon physically inspecting and
                      receiving the parcel.
                    </p>
                  </div>
                )}

                {trackedDelivery.pickupOtp && (
                  <div className="rounded-xl border border-[#172B3A]/15 bg-[#F4F6F5] p-4 text-xs">
                    <p className="font-semibold text-[#172B3A]">Sender Pickup Handover OTP</p>
                    <p className="mt-1 font-mono text-xl font-bold text-[#172B3A]">
                      {trackedDelivery.pickupOtp}
                    </p>
                    <p className="mt-1 text-[11px] text-[#172B3A]/70">
                      Visible strictly to the Sender. Never shared with Receiver.
                    </p>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      ) : (
        <div className="space-y-6">
          {/* Driver Real-Time GPS & Configurable Match Radius Header */}
          <div className="flex flex-col gap-4 rounded-xl border border-[#172B3A]/10 bg-white p-4 sm:p-5 lg:flex-row lg:items-center lg:justify-between">
            <div className="space-y-1">
              <h2 className="font-display text-lg font-semibold text-[#172B3A]">
                {t.partnerQueueTitle}
              </h2>
              <p className="text-xs text-[#172B3A]/65">
                {t.partnerQueueSubtitle} · Nearest visibility limit:{' '}
                <strong className="font-mono text-[#176B52]">&lt; {matchRadiusKm} km</strong>{' '}
                (Admin-configured)
              </p>
              <div className="flex flex-wrap items-center gap-2 pt-1 text-[11px] font-mono text-[#172B3A]/75">
                <MapPin className="h-3.5 w-3.5 text-[#176B52]" />
                <span>{gpsStatusText}</span>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-2.5">
              <select
                aria-label="Fallback Addis Sub-City GPS"
                value=""
                onChange={(e) => {
                  const found = ADDIS_SUB_CITIES.find((s) => s.name === e.target.value);
                  if (found) {
                    setDriverGps({ lat: found.lat, lng: found.lng });
                    setGpsStatusText(`Active Hub GPS: ${found.name} (${found.lat.toFixed(4)}, ${found.lng.toFixed(4)})`);
                  }
                }}
                className="h-11 rounded-lg border border-[#172B3A]/15 bg-[#F4F6F5] px-3 text-xs font-medium text-[#172B3A]"
              >
                <option value="" disabled>
                  Set Sub-City GPS Hub...
                </option>
                {ADDIS_SUB_CITIES.map((s) => (
                  <option key={s.name} value={s.name}>
                    {s.name} ({s.lat.toFixed(3)}, {s.lng.toFixed(3)})
                  </option>
                ))}
              </select>

              <button
                type="button"
                onClick={refreshPartnerGps}
                className="min-h-[44px] inline-flex items-center gap-1.5 rounded-lg border border-[#172B3A]/15 bg-white px-3.5 py-2 text-xs font-semibold text-[#172B3A] hover:bg-[#F4F6F5]"
              >
                <Navigation className="h-3.5 w-3.5 text-[#176B52]" />
                Refresh GPS
              </button>

              <button
                type="button"
                onClick={() => setPartnerAvailable((v) => !v)}
                className={`min-h-[44px] rounded-lg px-4 py-2 text-xs font-semibold whitespace-nowrap ${
                  partnerAvailable
                    ? 'bg-[#176B52] text-white'
                    : 'border border-[#172B3A]/15 bg-[#F4F6F5] text-[#172B3A]'
                }`}
              >
                {partnerAvailable ? 'Online & Broadcasting GPS' : 'Offline'}
              </button>

              {!firebaseUser && (
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => openAuthModal('signin')}
                    className="min-h-[44px] rounded-lg border border-[#172B3A]/20 bg-white px-4 py-2 text-xs font-semibold text-[#172B3A]"
                  >
                    Sign In
                  </button>
                  <button
                    type="button"
                    onClick={() => openAuthModal('signup')}
                    className="min-h-[44px] rounded-lg bg-[#172B3A] px-4 py-2 text-xs font-semibold text-white"
                  >
                    Sign Up
                  </button>
                </div>
              )}
            </div>
          </div>

          {!firebaseUser ? (
            <div className="rounded-xl border border-[#172B3A]/10 bg-white p-10 text-center text-sm text-[#172B3A]/70">
              Sign in with Email & Password or Google to view live delivery & ride assignments within{' '}
              {matchRadiusKm} km.
            </div>
          ) : !isVerifiedPartner ? (
            <div className="rounded-xl border border-amber-200 bg-amber-50 p-6 text-xs text-amber-950">
              <p className="font-semibold">
                Fayda + Liveness + Peer QR Verified Delivery Partner Required
              </p>
              <p className="mt-1 opacity-85">
                Anti-theft policy requires Provider KYC verification (including 10-minute Peer QR
                authentication & role-based approval) or the{' '}
                <span className="font-mono font-semibold">DELIVERY_PARTNER</span> role before open
                dispatch jobs within {matchRadiusKm} km become visible.
              </p>
            </div>
          ) : loadingQueue ? (
            <div className="rounded-xl border border-[#172B3A]/10 bg-white p-10 text-center text-sm text-[#172B3A]/60">
              Scanning PostgreSQL dispatch queue within {matchRadiusKm} km...
            </div>
          ) : queue.length === 0 ? (
            <div className="rounded-xl border border-[#172B3A]/10 bg-white p-10 text-center text-sm text-[#172B3A]/60">
              No active delivery requests currently within {matchRadiusKm} km of your GPS position.
            </div>
          ) : (
            <>
              {/* Mobile Card Dispatch View (< md) */}
              <div className="space-y-4 md:hidden">
                {queue.map((d) => (
                  <div
                    key={`m-${d.id}`}
                    className="rounded-xl border border-[#172B3A]/10 bg-white p-4 space-y-3 text-xs"
                  >
                    <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[#172B3A]/10 pb-2.5">
                      <div>
                        <p className="font-mono font-bold text-[#172B3A]">{d.trackingCode}</p>
                        <p className="text-[11px] font-medium text-[#176B52]">
                          {d.escrowStatus || 'HELD_IN_ESCROW'} · {d.status.replace('_', ' ')}
                        </p>
                      </div>
                      <div className="text-right font-mono">
                        <p className="font-bold text-[#176B52]">{formatEtb(d.totalFee)}</p>
                        {d.distanceToPickupKm != null && (
                          <p className="text-[11px] font-semibold text-[#172B3A]">
                            {d.distanceToPickupKm} km to pickup
                          </p>
                        )}
                      </div>
                    </div>

                    <div className="space-y-1">
                      <p className="font-semibold text-[#172B3A]">
                        {d.pickupLocation} → {d.destinationLocation}
                      </p>
                      <p className="text-[#172B3A]/65">
                        {d.packageOrRideDetails} · {d.vehicleType} · {d.distanceKm} km route · Value:{' '}
                        {formatEtb(d.declaredValue || 0)}
                      </p>
                    </div>

                    <div className="flex flex-col gap-2 pt-1">
                      {d.status === 'REQUESTED' && (
                        <button
                          type="button"
                          disabled={claimingId === d.id}
                          onClick={() => handleTransition(d.id, 'ASSIGNED', false)}
                          className="min-h-[44px] w-full rounded-lg bg-[#176B52] px-4 py-2 font-semibold text-white hover:bg-[#125641] disabled:opacity-50"
                        >
                          {claimingId === d.id ? 'Claiming...' : t.acceptJob}
                        </button>
                      )}

                      {(d.status === 'ASSIGNED' || d.status === 'PICKED_UP') && (
                        <>
                          <button
                            type="button"
                            disabled={broadcastingGpsId === d.id}
                            onClick={() => handleManualBroadcastGps(d.id)}
                            className="inline-flex min-h-[44px] w-full items-center justify-center gap-1.5 rounded-lg border border-[#176B52]/30 bg-emerald-50/50 px-3 py-2 font-semibold text-[#176B52]"
                          >
                            <Radio className="h-3.5 w-3.5" />
                            {broadcastingGpsId === d.id ? 'Sending GPS...' : 'Broadcast Live GPS'}
                          </button>

                          <div className="flex items-center gap-2 rounded-lg border border-[#172B3A]/20 bg-[#F4F6F5] px-3 py-2">
                            <KeyRound className="h-4 w-4 text-[#176B52]" />
                            <input
                              type="text"
                              maxLength={6}
                              value={otpInputs[d.id] || ''}
                              onChange={(e) =>
                                setOtpInputs((prev) => ({ ...prev, [d.id]: e.target.value }))
                              }
                              placeholder="Enter 6-digit Handover OTP"
                              className="w-full bg-transparent font-mono text-xs focus:outline-none"
                            />
                          </div>

                          {d.status === 'ASSIGNED' && (
                            <button
                              type="button"
                              onClick={() => handleTransition(d.id, 'PICKED_UP', true)}
                              className="min-h-[44px] w-full rounded-lg bg-[#172B3A] px-3 py-2 font-semibold text-white"
                            >
                              {t.confirmPickupOtp}
                            </button>
                          )}

                          {d.status === 'PICKED_UP' && (
                            <button
                              type="button"
                              onClick={() => handleTransition(d.id, 'COMPLETED', true)}
                              className="min-h-[44px] w-full rounded-lg bg-[#F4A62A] px-3 py-2 font-bold text-[#172B3A]"
                            >
                              {t.confirmDeliveryOtp}
                            </button>
                          )}

                          <button
                            type="button"
                            onClick={() => setConflictTarget(d)}
                            className="inline-flex min-h-[44px] w-full items-center justify-center gap-1.5 rounded-lg border border-red-200 px-3 py-2 font-semibold text-red-700 hover:bg-red-50"
                          >
                            <AlertTriangle className="h-3.5 w-3.5" />
                            Open Conflict / Freeze
                          </button>
                        </>
                      )}

                      {d.status === 'DISPUTED' && (
                        <div className="space-y-2 rounded-lg border border-red-200 bg-red-50 p-3 text-red-900">
                          <p className="inline-flex items-center gap-1 font-mono font-bold">
                            <Lock className="h-3.5 w-3.5" />
                            CONFLICT FROZEN ({d.conflictStatus || 'OPEN'})
                          </p>
                          <p>{d.disputeReason}</p>
                          {d.conflictRaisedByRole === 'SENDER' &&
                            !d.conflictCounterStatement &&
                            d.conflictStatus !== 'RESOLVED' && (
                              <button
                                type="button"
                                onClick={() => setCounterTarget(d)}
                                className="inline-flex min-h-[44px] w-full items-center justify-center gap-1.5 rounded-lg bg-[#172B3A] px-3 py-2 font-semibold text-white"
                              >
                                <MessageSquareWarning className="h-3.5 w-3.5" />
                                Submit Driver Counter-Statement
                              </button>
                            )}
                        </div>
                      )}
                    </div>
                  </div>
                ))}
              </div>

              {/* Desktop Dispatch Table (>= md) */}
              <div className="hidden md:block overflow-x-auto rounded-xl border border-[#172B3A]/10 bg-white">
                <table className="w-full min-w-[960px] text-left text-xs">
                  <thead className="border-b border-[#172B3A]/10 bg-[#F4F6F5] text-[#172B3A]/70">
                    <tr>
                      <th className="px-4 py-3 font-semibold">Ref & Escrow</th>
                      <th className="px-4 py-3 font-semibold">Route & Declared Value</th>
                      <th className="px-4 py-3 font-semibold">Nearest Pickup & Vehicle</th>
                      <th className="px-4 py-3 font-semibold">Fee (incl. VAT)</th>
                      <th className="px-4 py-3 font-semibold">Status</th>
                      <th className="px-4 py-3 font-semibold text-right">
                        Live GPS & OTP Handover
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#172B3A]/10">
                    {queue.map((d) => (
                      <tr key={d.id} className="hover:bg-[#F4F6F5]/50">
                        <td className="px-4 py-3.5">
                          <p className="font-mono font-semibold text-[#172B3A]">{d.trackingCode}</p>
                          <p className="text-[11px] font-medium text-[#176B52]">
                            {d.escrowStatus || 'HELD_IN_ESCROW'}
                          </p>
                        </td>
                        <td className="px-4 py-3.5">
                          <p className="font-medium text-[#172B3A]">
                            {d.pickupLocation} → {d.destinationLocation}
                          </p>
                          <p className="text-[#172B3A]/60">
                            {d.packageOrRideDetails} · Value: {formatEtb(d.declaredValue || 0)}
                          </p>
                        </td>
                        <td className="px-4 py-3.5 font-mono tabular-nums text-[#172B3A]">
                          <p>
                            {d.vehicleType} · {d.distanceKm} km route
                          </p>
                          {d.distanceToPickupKm != null && (
                            <p className="text-[11px] font-semibold text-[#176B52]">
                              {d.distanceToPickupKm} km from your GPS
                            </p>
                          )}
                        </td>
                        <td className="px-4 py-3.5 font-mono font-semibold tabular-nums text-[#176B52]">
                          {formatEtb(d.totalFee)}
                        </td>
                        <td className="px-4 py-3.5 font-medium text-[#172B3A]">
                          {d.status.replace('_', ' ')}
                        </td>
                        <td className="px-4 py-3.5 text-right">
                          <div className="flex flex-wrap items-center justify-end gap-2">
                            {d.status === 'REQUESTED' && (
                              <button
                                type="button"
                                disabled={claimingId === d.id}
                                onClick={() => handleTransition(d.id, 'ASSIGNED', false)}
                                className="min-h-[38px] rounded-md bg-[#176B52] px-3.5 py-1.5 font-semibold text-white hover:bg-[#125641] disabled:opacity-50"
                              >
                                {claimingId === d.id ? 'Claiming...' : t.acceptJob}
                              </button>
                            )}

                            {(d.status === 'ASSIGNED' || d.status === 'PICKED_UP') && (
                              <>
                                <button
                                  type="button"
                                  disabled={broadcastingGpsId === d.id}
                                  onClick={() => handleManualBroadcastGps(d.id)}
                                  className="inline-flex min-h-[38px] items-center gap-1 rounded-md border border-[#176B52]/30 bg-emerald-50/60 px-2.5 py-1.5 font-semibold text-[#176B52] hover:bg-emerald-100"
                                >
                                  <Radio className="h-3.5 w-3.5" />
                                  {broadcastingGpsId === d.id ? 'Pinging...' : 'Send GPS'}
                                </button>

                                <div className="inline-flex min-h-[38px] items-center gap-1 rounded-md border border-[#172B3A]/20 bg-white px-2 py-1">
                                  <KeyRound className="h-3.5 w-3.5 text-[#176B52]" />
                                  <input
                                    type="text"
                                    maxLength={6}
                                    value={otpInputs[d.id] || ''}
                                    onChange={(e) =>
                                      setOtpInputs((prev) => ({
                                        ...prev,
                                        [d.id]: e.target.value,
                                      }))
                                    }
                                    placeholder="6-digit OTP"
                                    className="w-24 font-mono text-xs focus:outline-none"
                                  />
                                </div>

                                {d.status === 'ASSIGNED' && (
                                  <button
                                    type="button"
                                    onClick={() => handleTransition(d.id, 'PICKED_UP', true)}
                                    className="min-h-[38px] rounded-md bg-[#172B3A] px-3 py-1.5 font-semibold text-white"
                                  >
                                    {t.confirmPickupOtp}
                                  </button>
                                )}

                                {d.status === 'PICKED_UP' && (
                                  <button
                                    type="button"
                                    onClick={() => handleTransition(d.id, 'COMPLETED', true)}
                                    className="min-h-[38px] rounded-md bg-[#F4A62A] px-3 py-1.5 font-bold text-[#172B3A]"
                                  >
                                    {t.confirmDeliveryOtp}
                                  </button>
                                )}

                                <button
                                  type="button"
                                  onClick={() => setConflictTarget(d)}
                                  className="inline-flex min-h-[38px] items-center gap-1 rounded-md border border-red-200 px-2.5 py-1.5 font-semibold text-red-700 hover:bg-red-50"
                                >
                                  <AlertTriangle className="h-3 w-3" />
                                  Conflict
                                </button>
                              </>
                            )}

                            {d.status === 'COMPLETED' && (
                              <span className="inline-flex items-center gap-1 font-mono font-semibold text-[#176B52]">
                                <CheckCircle2 className="h-3.5 w-3.5" />
                                {d.escrowStatus || 'RELEASED'}
                              </span>
                            )}

                            {d.status === 'DISPUTED' && (
                              <div className="flex flex-wrap items-center justify-end gap-2">
                                <span className="inline-flex items-center gap-1 font-mono font-semibold text-red-700">
                                  <Lock className="h-3.5 w-3.5" />
                                  FROZEN ({d.conflictStatus || 'OPEN'})
                                </span>
                                {d.conflictRaisedByRole === 'SENDER' &&
                                  !d.conflictCounterStatement &&
                                  d.conflictStatus !== 'RESOLVED' && (
                                    <button
                                      type="button"
                                      onClick={() => setCounterTarget(d)}
                                      className="inline-flex min-h-[36px] items-center gap-1 rounded-md bg-[#172B3A] px-2.5 py-1 text-[11px] font-semibold text-white"
                                    >
                                      <MessageSquareWarning className="h-3 w-3" />
                                      Counter-Statement
                                    </button>
                                  )}
                              </div>
                            )}
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </div>
      )}

      {/* Structured Conflict Modal */}
      {conflictTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-[#172B3A]/50 p-4">
          <form
            onSubmit={handleOpenConflict}
            className="w-full max-w-md space-y-4 rounded-xl bg-white p-6 shadow-2xl"
          >
            <h3 className="font-display text-lg font-bold text-red-700">
              {t.reportTheftFreeze} · {conflictTarget.trackingCode}
            </h3>
            <p className="text-xs text-[#172B3A]/75">
              Freezing immediately locks Escrow payouts, notifies the Sender, and routes the conflict
              case to Platform Admin resolution.
            </p>
            <div>
              <label className="block text-xs font-medium text-[#172B3A]/75">Conflict Category</label>
              <select
                value={conflictCategory}
                onChange={(e) => setConflictCategory(e.target.value)}
                className="mt-1 h-11 w-full rounded-lg border border-[#172B3A]/15 bg-[#F4F6F5] px-3 text-xs font-medium"
              >
                {CONFLICT_CATEGORIES.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.label}
                  </option>
                ))}
              </select>
            </div>
            <textarea
              required
              rows={3}
              value={conflictReason}
              onChange={(e) => setConflictReason(e.target.value)}
              placeholder="Describe suspected theft, OTP refusal, receiver absence, or route dispute..."
              className="w-full rounded-lg border border-[#172B3A]/20 p-3 text-xs"
            />
            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setConflictTarget(null)}
                className="min-h-[44px] rounded-lg border border-[#172B3A]/15 px-4 py-2 text-xs font-semibold"
              >
                Cancel
              </button>
              <button
                type="submit"
                className="min-h-[44px] rounded-lg bg-red-700 px-4 py-2 text-xs font-semibold text-white"
              >
                Freeze Escrow Now
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Driver Opposing Counter-Statement Modal */}
      {counterTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-[#172B3A]/50 p-4">
          <form
            onSubmit={handleSubmitCounterStatement}
            className="w-full max-w-md space-y-4 rounded-xl bg-white p-6 shadow-2xl"
          >
            <h3 className="font-display text-lg font-bold text-[#172B3A]">
              Driver Counter-Statement · {counterTarget.trackingCode}
            </h3>
            <p className="text-xs text-[#172B3A]/75">
              Sender claim: <strong>{counterTarget.disputeReason}</strong>
            </p>
            <textarea
              required
              rows={3}
              value={counterText}
              onChange={(e) => setCounterText(e.target.value)}
              placeholder="Provide GPS evidence, handover notes, or receiver refusal details for Admin review..."
              className="w-full rounded-lg border border-[#172B3A]/20 p-3 text-xs"
            />
            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setCounterTarget(null)}
                className="min-h-[44px] rounded-lg border border-[#172B3A]/15 px-4 py-2 text-xs font-semibold"
              >
                Cancel
              </button>
              <button
                type="submit"
                className="min-h-[44px] rounded-lg bg-[#176B52] px-4 py-2 text-xs font-semibold text-white"
              >
                Submit Counter-Statement
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
};

