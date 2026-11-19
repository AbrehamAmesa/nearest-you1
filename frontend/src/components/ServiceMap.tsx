import L from 'leaflet';
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { MapPin, Navigation, Radio } from 'lucide-react';
import type {
  Business,
  Category,
  Listing,
  LiveProviderPublicMarker,
} from '../types/nearestyou.ts';
import { calculateDistanceKm, formatEtb } from '../utils/geo.ts';

function createDivPin(color: string, borderColor: string, innerHtml: string, size = 30) {
  return L.divIcon({
    className: 'ny-leaflet-pin',
    html: `<div style="width:${size}px;height:${size}px;border-radius:9999px;background:${color};border:2.5px solid ${borderColor};box-shadow:0 3px 10px rgba(23,43,58,0.28);display:flex;align-items:center;justify-content:center;color:#ffffff;font-weight:700;font-size:11px;">${innerHtml}</div>`,
    iconSize: [size, size],
    iconAnchor: [size / 2, size / 2],
    popupAnchor: [0, -size / 2],
  });
}

interface DiscoveryMarkerItem {
  key: string;
  kind: 'BUSINESS' | 'LIVE_PROVIDER';
  title: string;
  subtitle: string;
  lat: number;
  lng: number;
  subCity: string;
  landmark: string;
  isLive: boolean;
  lastPingAt: string;
  faydaVerified: boolean;
  livenessVerified: boolean;
  distanceKm: number;
  featuredListing?: Listing;
}

interface ServiceDiscoveryMapProps {
  businesses: Business[];
  listings: Listing[];
  categories: Category[];
  liveProviders: LiveProviderPublicMarker[];
  userLat: number;
  userLng: number;
  onSelectListing: (listing: Listing) => void;
  heightClass?: string;
}

export const ServiceDiscoveryMap: React.FC<ServiceDiscoveryMapProps> = ({
  businesses,
  listings,
  categories,
  liveProviders,
  userLat,
  userLng,
  onSelectListing,
  heightClass = 'h-[360px] sm:h-[460px]',
}) => {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<L.Map | null>(null);
  const layerGroupRef = useRef<L.LayerGroup | null>(null);

  const [viewerCoords, setViewerCoords] = useState<{ lat: number; lng: number }>({
    lat: userLat,
    lng: userLng,
  });

  useEffect(() => {
    setViewerCoords({ lat: userLat, lng: userLng });
  }, [userLat, userLng]);

  const categoryById = useMemo(() => {
    const rec: Record<number, Category> = {};
    categories.forEach((c) => {
      rec[c.id] = c;
    });
    return rec;
  }, [categories]);

  const markerItems = useMemo<DiscoveryMarkerItem[]>(() => {
    const bizItems: DiscoveryMarkerItem[] = businesses
      .filter((b) => Number.isFinite(Number(b.latitude)) && Number.isFinite(Number(b.longitude)))
      .map((biz) => {
        const lat = Number(biz.latitude);
        const lng = Number(biz.longitude);
        const featured = listings.find((l) => l.businessId === biz.id && l.status === 'ACTIVE');
        const cat = categoryById[biz.categoryId];
        return {
          key: `biz-${biz.id}`,
          kind: 'BUSINESS',
          title: biz.businessName,
          subtitle: cat?.name || 'Verified Service',
          lat,
          lng,
          subCity: biz.subCity,
          landmark: biz.landmark,
          isLive: Boolean(biz.liveLocationActive),
          lastPingAt: biz.lastLocationPingAt || biz.createdAt,
          faydaVerified: Boolean(biz.faydaVerified),
          livenessVerified: Boolean(biz.livenessVerified),
          distanceKm: calculateDistanceKm(viewerCoords.lat, viewerCoords.lng, lat, lng),
          featuredListing: featured,
        };
      });

    const providerItems: DiscoveryMarkerItem[] = liveProviders
      .filter((p) => Number.isFinite(Number(p.latitude)) && Number.isFinite(Number(p.longitude)))
      .map((prov) => {
        const lat = Number(prov.latitude);
        const lng = Number(prov.longitude);
        const cat = categoryById[prov.serviceCategoryId];
        return {
          key: `prov-${prov.id}`,
          kind: 'LIVE_PROVIDER',
          title: prov.fullName,
          subtitle: `${cat?.name || 'Independent Provider'} · Live KYC Provider`,
          lat,
          lng,
          subCity: prov.subCity,
          landmark: prov.landmark,
          isLive: Boolean(prov.isLiveLocationActive),
          lastPingAt: prov.lastLocationUpdatedAt,
          faydaVerified: true,
          livenessVerified: Boolean(prov.livenessPassed),
          distanceKm: calculateDistanceKm(viewerCoords.lat, viewerCoords.lng, lat, lng),
        };
      });

    return [...bizItems, ...providerItems];
  }, [businesses, listings, liveProviders, categoryById, viewerCoords]);

  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;

    const map = L.map(containerRef.current, {
      center: [viewerCoords.lat, viewerCoords.lng],
      zoom: 12,
      zoomControl: true,
    });
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '&copy; OpenStreetMap contributors',
      maxZoom: 19,
    }).addTo(map);

    const group = L.layerGroup().addTo(map);
    mapRef.current = map;
    layerGroupRef.current = group;

    const ro = new ResizeObserver(() => {
      map.invalidateSize();
    });
    ro.observe(containerRef.current);

    return () => {
      ro.disconnect();
      map.remove();
      mapRef.current = null;
      layerGroupRef.current = null;
    };
  }, []);

  useEffect(() => {
    if (!mapRef.current) return;
    mapRef.current.panTo([viewerCoords.lat, viewerCoords.lng]);
  }, [viewerCoords.lat, viewerCoords.lng]);

  useEffect(() => {
    const group = layerGroupRef.current;
    if (!group) return;
    group.clearLayers();

    // User reference pin
    L.marker([viewerCoords.lat, viewerCoords.lng], {
      icon: createDivPin('#172B3A', '#FFFFFF', 'ME', 28),
      zIndexOffset: 300,
    })
      .bindPopup('Your Reference GPS Location')
      .addTo(group);

    for (const item of markerItems) {
      const color = item.kind === 'LIVE_PROVIDER' || item.isLive ? '#176B52' : '#F4A62A';
      const marker = L.marker([item.lat, item.lng], {
        icon: createDivPin(color, '#FFFFFF', item.kind === 'LIVE_PROVIDER' ? 'P' : 'B', 30),
        zIndexOffset: item.isLive ? 200 : 50,
      });

      const wrapper = document.createElement('div');
      wrapper.className = 'space-y-1.5 text-xs text-[#172B3A] min-w-[200px]';

      const titleEl = document.createElement('p');
      titleEl.className = 'font-bold text-sm text-[#172B3A] m-0';
      titleEl.textContent = item.title;
      wrapper.appendChild(titleEl);

      const subEl = document.createElement('p');
      subEl.className = 'text-[11px] text-[#172B3A]/70 m-0';
      subEl.textContent = `${item.subtitle} · ${item.distanceKm} km away`;
      wrapper.appendChild(subEl);

      const addrEl = document.createElement('p');
      addrEl.className = 'text-[11px] m-0';
      addrEl.textContent = `${item.landmark}, ${item.subCity}`;
      wrapper.appendChild(addrEl);

      const kycEl = document.createElement('p');
      kycEl.className = 'font-mono text-[10px] text-[#176B52] m-0';
      kycEl.textContent = `${item.faydaVerified ? 'Fayda & Liveness Verified' : 'Verified'} · ${
        item.isLive ? 'Live GPS Tracked' : 'Fixed Pin'
      }`;
      wrapper.appendChild(kycEl);

      if (item.featuredListing) {
        const listingRef = item.featuredListing;
        const box = document.createElement('div');
        box.className = 'border-t border-[#172B3A]/10 pt-1.5 mt-1.5';

        const lstTitle = document.createElement('p');
        lstTitle.className = 'font-semibold text-xs m-0';
        lstTitle.textContent = listingRef.title;
        box.appendChild(lstTitle);

        const lstPrice = document.createElement('p');
        lstPrice.className = 'font-mono font-bold text-[#176B52] text-xs m-0 mt-0.5';
        lstPrice.textContent = `${formatEtb(listingRef.discountPrice || listingRef.basePrice)} / ${listingRef.pricingUnit}`;
        box.appendChild(lstPrice);

        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className =
          'mt-2 w-full rounded bg-[#176B52] px-3 py-2 text-center text-xs font-semibold text-white hover:bg-[#125641] cursor-pointer';
        btn.textContent = 'View Service & Book';
        btn.onclick = () => onSelectListing(listingRef);
        box.appendChild(btn);

        wrapper.appendChild(box);
      }

      marker.bindPopup(wrapper).addTo(group);
    }
  }, [markerItems, viewerCoords.lat, viewerCoords.lng, onSelectListing]);

  const handleUseBrowserGps = () => {
    if (!navigator.geolocation) return;
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setViewerCoords({
          lat: Number(pos.coords.latitude.toFixed(6)),
          lng: Number(pos.coords.longitude.toFixed(6)),
        });
      },
      () => {},
      { enableHighAccuracy: true, timeout: 8000 }
    );
  };

  return (
    <div className="overflow-hidden rounded-2xl border border-[#172B3A]/15 bg-white">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[#172B3A]/10 bg-[#F4F6F5]/70 px-3 py-2.5 text-xs sm:px-4">
        <div className="flex flex-wrap items-center gap-2 text-[#172B3A]/75 sm:gap-3">
          <span className="inline-flex items-center gap-1.5 font-semibold text-[#176B52]">
            <Radio className="h-3.5 w-3.5" />
            Real-Time OpenStreetMap ({markerItems.length})
          </span>
          <span className="hidden sm:inline">·</span>
          <span className="text-[11px]">Green: Live GPS</span>
          <span className="hidden sm:inline">·</span>
          <span className="text-[11px]">Amber: Storefront</span>
        </div>

        <button
          type="button"
          onClick={handleUseBrowserGps}
          className="inline-flex min-h-[40px] items-center gap-1.5 whitespace-nowrap rounded-lg border border-[#172B3A]/15 bg-white px-3 py-1.5 font-semibold text-[#172B3A] hover:bg-[#F4F6F5]"
        >
          <Navigation className="h-3.5 w-3.5 text-[#176B52]" />
          Center on My GPS
        </button>
      </div>

      <div ref={containerRef} className={`w-full ${heightClass}`} />
    </div>
  );
};

interface RealtimeLocationPickerMapProps {
  latitude: number;
  longitude: number;
  isLiveActive: boolean;
  onChangeCoordinates: (lat: number, lng: number) => void;
  onToggleLive?: (active: boolean) => void;
  heightClass?: string;
}

export const RealtimeLocationPickerMap: React.FC<RealtimeLocationPickerMapProps> = ({
  latitude,
  longitude,
  isLiveActive,
  onChangeCoordinates,
  onToggleLive,
  heightClass = 'h-[280px] sm:h-[320px]',
}) => {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<L.Map | null>(null);
  const markerRef = useRef<L.Marker | null>(null);
  const onChangeRef = useRef(onChangeCoordinates);
  onChangeRef.current = onChangeCoordinates;

  const [trackingWatchId, setTrackingWatchId] = useState<number | null>(null);
  const [gpsStatus, setGpsStatus] = useState<string>('Tap map or lock live GPS');

  useEffect(() => {
    return () => {
      if (trackingWatchId !== null && navigator.geolocation) {
        navigator.geolocation.clearWatch(trackingWatchId);
      }
    };
  }, [trackingWatchId]);

  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;

    const map = L.map(containerRef.current, {
      center: [latitude, longitude],
      zoom: 13,
      zoomControl: true,
    });
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '&copy; OpenStreetMap contributors',
      maxZoom: 19,
    }).addTo(map);

    const marker = L.marker([latitude, longitude], {
      icon: createDivPin('#176B52', '#FFFFFF', 'PIN', 32),
    }).addTo(map);

    map.on('click', (e: L.LeafletMouseEvent) => {
      const nextLat = Number(e.latlng.lat.toFixed(6));
      const nextLng = Number(e.latlng.lng.toFixed(6));
      onChangeRef.current(nextLat, nextLng);
      setGpsStatus(`Pinned (${nextLat.toFixed(5)}, ${nextLng.toFixed(5)})`);
    });

    mapRef.current = map;
    markerRef.current = marker;

    const ro = new ResizeObserver(() => {
      map.invalidateSize();
    });
    ro.observe(containerRef.current);

    return () => {
      ro.disconnect();
      map.remove();
      mapRef.current = null;
      markerRef.current = null;
    };
  }, []);

  useEffect(() => {
    if (markerRef.current && mapRef.current) {
      markerRef.current.setLatLng([latitude, longitude]);
      mapRef.current.panTo([latitude, longitude]);
    }
  }, [latitude, longitude]);

  const handleLockRealtimeGps = () => {
    if (!navigator.geolocation) {
      setGpsStatus('Browser geolocation unavailable; tap map to pin coordinates.');
      return;
    }
    setGpsStatus('Acquiring real-time GPS...');
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const lat = Number(pos.coords.latitude.toFixed(6));
        const lng = Number(pos.coords.longitude.toFixed(6));
        onChangeCoordinates(lat, lng);
        onToggleLive?.(true);
        setGpsStatus(`Live GPS locked (${lat.toFixed(5)}, ${lng.toFixed(5)})`);
      },
      () => {
        setGpsStatus('Location permission denied; tap map to place pin.');
      },
      { enableHighAccuracy: true, timeout: 8000 }
    );

    if (trackingWatchId === null) {
      const watchId = navigator.geolocation.watchPosition(
        (pos) => {
          onChangeCoordinates(
            Number(pos.coords.latitude.toFixed(6)),
            Number(pos.coords.longitude.toFixed(6))
          );
        },
        () => {},
        { enableHighAccuracy: true, maximumAge: 5000 }
      );
      setTrackingWatchId(watchId);
    }
  };

  return (
    <div className="space-y-2.5">
      <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-[#172B3A]/10 bg-[#F4F6F5] px-3 py-2 text-xs">
        <div className="flex flex-wrap items-center gap-2 font-mono text-[11px] text-[#172B3A]">
          <MapPin className="h-3.5 w-3.5 text-[#176B52]" />
          <span className="tabular-nums">
            {latitude.toFixed(6)}, {longitude.toFixed(6)}
          </span>
          <span className="hidden sm:inline">·</span>
          <span className="text-[#176B52]">{gpsStatus}</span>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {onToggleLive && (
            <label className="inline-flex min-h-[40px] cursor-pointer items-center gap-1.5 text-xs font-medium text-[#172B3A]">
              <input
                type="checkbox"
                checked={isLiveActive}
                onChange={(e) => onToggleLive(e.target.checked)}
                className="h-4 w-4 accent-[#176B52]"
              />
              Real-Time Active
            </label>
          )}
          <button
            type="button"
            onClick={handleLockRealtimeGps}
            className="inline-flex min-h-[44px] items-center gap-1.5 whitespace-nowrap rounded-lg bg-[#176B52] px-3.5 py-2 text-xs font-semibold text-white hover:bg-[#125641]"
          >
            <Navigation className="h-3.5 w-3.5" />
            Use Real-Time GPS
          </button>
        </div>
      </div>

      <div
        ref={containerRef}
        className={`w-full overflow-hidden rounded-xl border border-[#172B3A]/15 ${heightClass}`}
      />
    </div>
  );
};

interface LiveDriverTrackerMapProps {
  pickupLat?: number | null;
  pickupLng?: number | null;
  pickupLabel: string;
  destinationLat?: number | null;
  destinationLng?: number | null;
  destinationLabel: string;
  driverLat?: number | null;
  driverLng?: number | null;
  driverName?: string | null;
  driverUpdatedAt?: string | null;
  heightClass?: string;
}

export const LiveDriverTrackerMap: React.FC<LiveDriverTrackerMapProps> = ({
  pickupLat,
  pickupLng,
  pickupLabel,
  destinationLat,
  destinationLng,
  destinationLabel,
  driverLat,
  driverLng,
  driverName,
  driverUpdatedAt,
  heightClass = 'h-[280px] sm:h-[340px]',
}) => {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<L.Map | null>(null);
  const layerRef = useRef<L.LayerGroup | null>(null);

  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;
    const initLat = driverLat ?? pickupLat ?? 9.0108;
    const initLng = driverLng ?? pickupLng ?? 38.7613;

    const map = L.map(containerRef.current, {
      center: [initLat, initLng],
      zoom: 13,
      zoomControl: true,
    });
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '&copy; OpenStreetMap contributors',
      maxZoom: 19,
    }).addTo(map);
    const layer = L.layerGroup().addTo(map);

    mapRef.current = map;
    layerRef.current = layer;

    const ro = new ResizeObserver(() => {
      map.invalidateSize();
    });
    ro.observe(containerRef.current);

    return () => {
      ro.disconnect();
      map.remove();
      mapRef.current = null;
      layerRef.current = null;
    };
  }, []);

  useEffect(() => {
    const map = mapRef.current;
    const layer = layerRef.current;
    if (!map || !layer) return;

    layer.clearLayers();
    const boundsPoints: L.LatLngExpression[] = [];

    if (pickupLat != null && pickupLng != null && Number.isFinite(pickupLat) && Number.isFinite(pickupLng)) {
      const pt: L.LatLngExpression = [pickupLat, pickupLng];
      boundsPoints.push(pt);
      L.marker(pt, { icon: createDivPin('#176B52', '#FFFFFF', 'A', 28) })
        .bindPopup(`Pickup: ${pickupLabel}`)
        .addTo(layer);
    }

    if (
      destinationLat != null &&
      destinationLng != null &&
      Number.isFinite(destinationLat) &&
      Number.isFinite(destinationLng)
    ) {
      const pt: L.LatLngExpression = [destinationLat, destinationLng];
      boundsPoints.push(pt);
      L.marker(pt, { icon: createDivPin('#F4A62A', '#172B3A', 'B', 28) })
        .bindPopup(`Destination: ${destinationLabel}`)
        .addTo(layer);
    }

    if (
      pickupLat != null &&
      pickupLng != null &&
      destinationLat != null &&
      destinationLng != null
    ) {
      L.polyline(
        [
          [pickupLat, pickupLng],
          [destinationLat, destinationLng],
        ],
        { color: '#172B3A', weight: 3, dashArray: '6 6', opacity: 0.55 }
      ).addTo(layer);
    }

    if (driverLat != null && driverLng != null && Number.isFinite(driverLat) && Number.isFinite(driverLng)) {
      const dPt: L.LatLngExpression = [driverLat, driverLng];
      boundsPoints.push(dPt);
      const driverIcon = L.divIcon({
        className: 'ny-driver-live-pin',
        html: `<div style="position:relative;width:36px;height:36px;display:flex;align-items:center;justify-content:center;">
          <span style="position:absolute;inset:0;border-radius:9999px;background:rgba(23,107,82,0.28);animation:ping 1.5s infinite;"></span>
          <span style="position:relative;width:28px;height:28px;border-radius:9999px;background:#172B3A;border:2.5px solid #F4A62A;color:#FFFFFF;font-size:10px;font-weight:800;display:flex;align-items:center;justify-content:center;">DRV</span>
        </div>`,
        iconSize: [36, 36],
        iconAnchor: [18, 18],
      });
      L.marker(dPt, { icon: driverIcon, zIndexOffset: 500 })
        .bindPopup(
          `${driverName || 'Assigned Driver'} · Live GPS (${driverLat.toFixed(5)}, ${driverLng.toFixed(5)})`
        )
        .addTo(layer);
    }

    if (boundsPoints.length >= 2) {
      map.fitBounds(L.latLngBounds(boundsPoints), { padding: [36, 36], maxZoom: 15 });
    } else if (boundsPoints.length === 1) {
      map.setView(boundsPoints[0], 14);
    }
  }, [
    pickupLat,
    pickupLng,
    pickupLabel,
    destinationLat,
    destinationLng,
    destinationLabel,
    driverLat,
    driverLng,
    driverName,
  ]);

  return (
    <div className="overflow-hidden rounded-xl border border-[#172B3A]/15 bg-white">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[#172B3A]/10 bg-[#F4F6F5] px-3 py-2 text-xs">
        <span className="inline-flex items-center gap-1.5 font-semibold text-[#176B52]">
          <Radio className="h-3.5 w-3.5" />
          Live Driver Telemetry {driverName ? `· ${driverName}` : ''}
        </span>
        <span className="font-mono text-[11px] text-[#172B3A]/70">
          {driverLat != null && driverLng != null
            ? `${driverLat.toFixed(5)}, ${driverLng.toFixed(5)}${
                driverUpdatedAt ? ` · ${new Date(driverUpdatedAt).toLocaleTimeString()}` : ''
              }`
            : 'Waiting for driver GPS signal...'}
        </span>
      </div>
      <div ref={containerRef} className={`w-full ${heightClass}`} />
    </div>
  );
};
