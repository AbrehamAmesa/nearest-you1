import L from 'leaflet';
import React, { useEffect, useRef, useState } from 'react';
import { Crosshair, MapPin, Navigation, Route as RouteIcon, Search } from 'lucide-react';
import { calculateDistanceKm } from '../utils/geo.ts';
import { TRANSLATIONS, type AppLanguage } from '../utils/i18n.ts';
import { mapsApi } from '../api/index.ts';

export interface SelectedPlacePoint {
  label: string;
  lat: number;
  lng: number;
  placeId?: string | null;
}

interface SearchPlaceResult {
  placeId: string;
  displayName: string;
  subCity?: string;
  lat: number;
  lng: number;
  source: string;
}

interface DeliveryRoutePickerMapProps {
  language: AppLanguage;
  activePinMode: 'PICKUP' | 'DESTINATION';
  onChangePinMode: (mode: 'PICKUP' | 'DESTINATION') => void;
  pickup: SelectedPlacePoint | null;
  destination: SelectedPlacePoint | null;
  onSelectPickup: (pt: SelectedPlacePoint) => void;
  onSelectDestination: (pt: SelectedPlacePoint) => void;
  onRouteCalculated: (distanceKm: number, durationMin: number | null, source: 'OSRM' | 'HAVERSINE') => void;
}

const ADDIS_CENTER: [number, number] = [9.0108, 38.7613];

function createRoutePin(bg: string, border: string, label: string) {
  return L.divIcon({
    className: 'ny-route-pin',
    html: `<div style="width:30px;height:30px;border-radius:9999px;background:${bg};border:2.5px solid ${border};color:#ffffff;font-weight:800;font-size:12px;display:flex;align-items:center;justify-content:center;box-shadow:0 3px 10px rgba(0,0,0,0.28);">${label}</div>`,
    iconSize: [30, 30],
    iconAnchor: [15, 15],
  });
}

export const DeliveryRoutePickerMap: React.FC<DeliveryRoutePickerMapProps> = ({
  language,
  activePinMode,
  onChangePinMode,
  pickup,
  destination,
  onSelectPickup,
  onSelectDestination,
  onRouteCalculated,
}) => {
  const t = TRANSLATIONS[language].delivery;

  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<L.Map | null>(null);
  const layerGroupRef = useRef<L.LayerGroup | null>(null);

  const activeModeRef = useRef(activePinMode);
  activeModeRef.current = activePinMode;
  const onSelectPickupRef = useRef(onSelectPickup);
  onSelectPickupRef.current = onSelectPickup;
  const onSelectDestinationRef = useRef(onSelectDestination);
  onSelectDestinationRef.current = onSelectDestination;
  const onChangePinModeRef = useRef(onChangePinMode);
  onChangePinModeRef.current = onChangePinMode;
  const onRouteCalcRef = useRef(onRouteCalculated);
  onRouteCalcRef.current = onRouteCalculated;

  const [knownPlaces, setKnownPlaces] = useState<SelectedPlacePoint[]>([]);
  const [loadingPlaces, setLoadingPlaces] = useState(false);

  const [pickupQuery, setPickupQuery] = useState('');
  const [pickupSuggestions, setPickupSuggestions] = useState<SearchPlaceResult[]>([]);
  const [destQuery, setDestQuery] = useState('');
  const [destSuggestions, setDestSuggestions] = useState<SearchPlaceResult[]>([]);

  const [computingRoute, setComputingRoute] = useState(false);
  const [routeNotice, setRouteNotice] = useState<string | null>(null);
  const [routeCoords, setRouteCoords] = useState<Array<[number, number]>>([]);

  // Load curated Addis Ababa places from free /api/v1/maps/search endpoint
  useEffect(() => {
    let active = true;
    setLoadingPlaces(true);
    mapsApi.searchPlaces('')
      .then((response) => response.data)
      .then((data) => {
        if (!active) return;
        const pts: SelectedPlacePoint[] = (data.results || []).map((r: SearchPlaceResult) => ({
          label: r.displayName,
          lat: Number(r.lat),
          lng: Number(r.lng),
          placeId: r.placeId,
        }));
        setKnownPlaces(pts);
      })
      .catch(() => {})
      .finally(() => {
        if (active) setLoadingPlaces(false);
      });
    return () => {
      active = false;
    };
  }, []);

  // Debounced Nominatim + Curated Search for Pickup
  useEffect(() => {
    const q = pickupQuery.trim();
    if (q.length < 2) {
      setPickupSuggestions([]);
      return;
    }
    let cancelled = false;
    const timer = setTimeout(() => {
      mapsApi.searchPlaces(q)
        .then((response) => response.data)
        .then((data) => {
          if (!cancelled) setPickupSuggestions(data.results || []);
        })
        .catch(() => {
          if (!cancelled) setPickupSuggestions([]);
        });
    }, 280);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [pickupQuery]);

  // Debounced Nominatim + Curated Search for Destination
  useEffect(() => {
    const q = destQuery.trim();
    if (q.length < 2) {
      setDestSuggestions([]);
      return;
    }
    let cancelled = false;
    const timer = setTimeout(() => {
      mapsApi.searchPlaces(q)
        .then((response) => response.data)
        .then((data) => {
          if (!cancelled) setDestSuggestions(data.results || []);
        })
        .catch(() => {
          if (!cancelled) setDestSuggestions([]);
        });
    }, 280);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [destQuery]);

  // Initialize Leaflet Map once
  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;

    const map = L.map(containerRef.current, {
      center: ADDIS_CENTER,
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

    map.on('click', async (ev: L.LeafletMouseEvent) => {
      const lat = Number(ev.latlng.lat.toFixed(6));
      const lng = Number(ev.latlng.lng.toFixed(6));
      let label = `Pinned (${lat.toFixed(4)}, ${lng.toFixed(4)})`;
      let placeId: string | null = null;
      try {
        const response = await mapsApi.reverseGeocode(lat, lng);
        if (response.status >= 200 && response.status < 300) {
          const data = response.data;
          if (data.formattedAddress) label = data.formattedAddress;
          if (data.placeId) placeId = data.placeId;
        }
      } catch {}

      const pt: SelectedPlacePoint = { label, lat, lng, placeId };
      if (activeModeRef.current === 'PICKUP') {
        onSelectPickupRef.current(pt);
        onChangePinModeRef.current('DESTINATION');
      } else {
        onSelectDestinationRef.current(pt);
      }
    });

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

  // Compute free OSRM driving route when pickup & destination are selected
  useEffect(() => {
    setRouteNotice(null);
    if (!pickup || !destination) {
      setRouteCoords([]);
      return;
    }
    let cancelled = false;
    setComputingRoute(true);

    mapsApi.getRoute(pickup.lat, pickup.lng, destination.lat, destination.lng)
      .then((response) => response.data)
      .then((data) => {
        if (cancelled) return;
        setComputingRoute(false);
        if (data && Number.isFinite(Number(data.distanceKm))) {
          const geom = Array.isArray(data.geometry) ? data.geometry : [];
          setRouteCoords(geom);
          onRouteCalcRef.current(
            Number(data.distanceKm),
            data.durationMin != null ? Number(data.durationMin) : null,
            data.source === 'OSRM' ? 'OSRM' : 'HAVERSINE'
          );
          if (data.source !== 'OSRM') {
            setRouteNotice('Using straight-line road estimate (OSRM offline fallback).');
          }
          return;
        }
        const fallbackKm = Math.max(
          0.5,
          Number(calculateDistanceKm(pickup.lat, pickup.lng, destination.lat, destination.lng).toFixed(2))
        );
        setRouteCoords([
          [pickup.lat, pickup.lng],
          [destination.lat, destination.lng],
        ]);
        onRouteCalcRef.current(fallbackKm, null, 'HAVERSINE');
      })
      .catch(() => {
        if (cancelled) return;
        setComputingRoute(false);
        const fallbackKm = Math.max(
          0.5,
          Number(calculateDistanceKm(pickup.lat, pickup.lng, destination.lat, destination.lng).toFixed(2))
        );
        setRouteCoords([
          [pickup.lat, pickup.lng],
          [destination.lat, destination.lng],
        ]);
        onRouteCalcRef.current(fallbackKm, null, 'HAVERSINE');
      });

    return () => {
      cancelled = true;
    };
  }, [pickup?.lat, pickup?.lng, destination?.lat, destination?.lng]);

  // Render markers & route polyline on Leaflet
  useEffect(() => {
    const map = mapRef.current;
    const group = layerGroupRef.current;
    if (!map || !group) return;

    group.clearLayers();
    const pts: L.LatLngExpression[] = [];

    if (pickup) {
      pts.push([pickup.lat, pickup.lng]);
      L.marker([pickup.lat, pickup.lng], {
        icon: createRoutePin('#176B52', '#FFFFFF', 'A'),
      })
        .bindPopup(`Pickup: ${pickup.label}`)
        .addTo(group);
    }

    if (destination) {
      pts.push([destination.lat, destination.lng]);
      L.marker([destination.lat, destination.lng], {
        icon: createRoutePin('#F4A62A', '#172B3A', 'B'),
      })
        .bindPopup(`Destination: ${destination.label}`)
        .addTo(group);
    }

    if (routeCoords.length >= 2) {
      L.polyline(routeCoords, {
        color: '#176B52',
        weight: 5,
        opacity: 0.88,
      }).addTo(group);
    }

    if (pts.length === 2) {
      map.fitBounds(L.latLngBounds(pts), { padding: [40, 40], maxZoom: 15 });
    } else if (pts.length === 1) {
      map.panTo(pts[0]);
    }
  }, [pickup, destination, routeCoords]);

  const handleSelectSuggestion = (s: SearchPlaceResult, target: 'PICKUP' | 'DESTINATION') => {
    const pt: SelectedPlacePoint = {
      label: s.displayName,
      lat: Number(Number(s.lat).toFixed(6)),
      lng: Number(Number(s.lng).toFixed(6)),
      placeId: s.placeId,
    };
    if (target === 'PICKUP') {
      onSelectPickup(pt);
      setPickupQuery('');
      setPickupSuggestions([]);
    } else {
      onSelectDestination(pt);
      setDestQuery('');
      setDestSuggestions([]);
    }
    mapRef.current?.panTo([pt.lat, pt.lng]);
  };

  const handleKnownPlaceDropdown = (value: string, target: 'PICKUP' | 'DESTINATION') => {
    const idx = Number(value);
    const chosen = knownPlaces[idx];
    if (!chosen) return;
    if (target === 'PICKUP') {
      onSelectPickup(chosen);
    } else {
      onSelectDestination(chosen);
    }
    mapRef.current?.panTo([chosen.lat, chosen.lng]);
  };

  return (
    <div className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-2">
        {/* START / PICKUP */}
        <div className="space-y-2 rounded-xl border border-[#176B52]/25 bg-[#F4F6F5]/60 p-3.5">
          <div className="flex items-center justify-between gap-2">
            <span className="inline-flex items-center gap-1.5 text-xs font-bold text-[#176B52]">
              <MapPin className="h-3.5 w-3.5" />
              {t.pickupTitle}
            </span>
            <button
              type="button"
              onClick={() => onChangePinMode('PICKUP')}
              className={`inline-flex min-h-[36px] items-center gap-1 rounded px-2.5 py-1 text-[11px] font-semibold ${
                activePinMode === 'PICKUP'
                  ? 'bg-[#176B52] text-white'
                  : 'border border-[#172B3A]/15 bg-white text-[#172B3A]/75'
              }`}
            >
              <Crosshair className="h-3 w-3" />
              {t.pinOnMap}
            </button>
          </div>

          <select
            aria-label={t.pickupTitle}
            defaultValue=""
            onChange={(e) => {
              if (e.target.value !== '') handleKnownPlaceDropdown(e.target.value, 'PICKUP');
            }}
            className="h-11 w-full rounded-lg border border-[#172B3A]/15 bg-white px-2.5 text-xs font-medium text-[#172B3A]"
          >
            <option value="" disabled>
              {loadingPlaces ? '...' : `${t.selectFromMapPlaces} (${knownPlaces.length})`}
            </option>
            {knownPlaces.map((kp, i) => (
              <option key={`p-${i}-${kp.placeId || kp.label}`} value={String(i)}>
                {kp.label}
              </option>
            ))}
          </select>

          <div className="relative">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-[#172B3A]/45" />
            <input
              type="text"
              value={pickupQuery}
              onChange={(e) => setPickupQuery(e.target.value)}
              placeholder={t.searchMapPlaces}
              className="h-10 w-full rounded-lg border border-[#172B3A]/15 bg-white pl-8 pr-2.5 text-xs"
            />
            {pickupSuggestions.length > 0 && (
              <ul className="absolute z-[500] mt-1 max-h-48 w-full overflow-y-auto rounded-lg border border-[#172B3A]/15 bg-white shadow-lg">
                {pickupSuggestions.map((s) => (
                  <li key={s.placeId}>
                    <button
                      type="button"
                      onClick={() => handleSelectSuggestion(s, 'PICKUP')}
                      className="min-h-[40px] w-full px-3 py-2 text-left text-xs hover:bg-[#F4F6F5]"
                    >
                      {s.displayName}
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>

          {pickup && (
            <p className="truncate font-mono text-[11px] font-semibold text-[#172B3A]">
              ✓ {pickup.label} ({pickup.lat.toFixed(4)}, {pickup.lng.toFixed(4)})
            </p>
          )}
        </div>

        {/* DESTINATION */}
        <div className="space-y-2 rounded-xl border border-[#F4A62A]/45 bg-[#F4F6F5]/60 p-3.5">
          <div className="flex items-center justify-between gap-2">
            <span className="inline-flex items-center gap-1.5 text-xs font-bold text-[#172B3A]">
              <Navigation className="h-3.5 w-3.5 text-[#F4A62A]" />
              {t.destinationTitle}
            </span>
            <button
              type="button"
              onClick={() => onChangePinMode('DESTINATION')}
              className={`inline-flex min-h-[36px] items-center gap-1 rounded px-2.5 py-1 text-[11px] font-semibold ${
                activePinMode === 'DESTINATION'
                  ? 'bg-[#F4A62A] text-[#172B3A]'
                  : 'border border-[#172B3A]/15 bg-white text-[#172B3A]/75'
              }`}
            >
              <Crosshair className="h-3 w-3" />
              {t.pinOnMap}
            </button>
          </div>

          <select
            aria-label={t.destinationTitle}
            defaultValue=""
            onChange={(e) => {
              if (e.target.value !== '') handleKnownPlaceDropdown(e.target.value, 'DESTINATION');
            }}
            className="h-11 w-full rounded-lg border border-[#172B3A]/15 bg-white px-2.5 text-xs font-medium text-[#172B3A]"
          >
            <option value="" disabled>
              {loadingPlaces ? '...' : `${t.selectFromMapPlaces} (${knownPlaces.length})`}
            </option>
            {knownPlaces.map((kp, i) => (
              <option key={`d-${i}-${kp.placeId || kp.label}`} value={String(i)}>
                {kp.label}
              </option>
            ))}
          </select>

          <div className="relative">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-[#172B3A]/45" />
            <input
              type="text"
              value={destQuery}
              onChange={(e) => setDestQuery(e.target.value)}
              placeholder={t.searchMapPlaces}
              className="h-10 w-full rounded-lg border border-[#172B3A]/15 bg-white pl-8 pr-2.5 text-xs"
            />
            {destSuggestions.length > 0 && (
              <ul className="absolute z-[500] mt-1 max-h-48 w-full overflow-y-auto rounded-lg border border-[#172B3A]/15 bg-white shadow-lg">
                {destSuggestions.map((s) => (
                  <li key={s.placeId}>
                    <button
                      type="button"
                      onClick={() => handleSelectSuggestion(s, 'DESTINATION')}
                      className="min-h-[40px] w-full px-3 py-2 text-left text-xs hover:bg-[#F4F6F5]"
                    >
                      {s.displayName}
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>

          {destination && (
            <p className="truncate font-mono text-[11px] font-semibold text-[#172B3A]">
              ✓ {destination.label} ({destination.lat.toFixed(4)}, {destination.lng.toFixed(4)})
            </p>
          )}
        </div>
      </div>

      {/* Interactive Free OpenStreetMap + Leaflet Canvas */}
      <div className="relative h-[280px] w-full overflow-hidden rounded-xl border border-[#172B3A]/15 bg-[#E6EAE8] sm:h-[340px]">
        <div ref={containerRef} className="h-full w-full" />

        <div className="pointer-events-none absolute left-3 top-3 z-[400] rounded-lg bg-white/95 px-3 py-1.5 text-[11px] font-semibold text-[#172B3A] shadow">
          {activePinMode === 'PICKUP'
            ? `📍 ${t.pinOnMap}: ${t.pickupTitle}`
            : `🏁 ${t.pinOnMap}: ${t.destinationTitle}`}
        </div>
      </div>

      {computingRoute && (
        <p className="flex items-center gap-1.5 text-xs font-medium text-[#176B52]">
          <RouteIcon className="h-3.5 w-3.5 animate-pulse" />
          {t.calculatingRoute}
        </p>
      )}
      {routeNotice && (
        <p className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900">
          {routeNotice}
        </p>
      )}
    </div>
  );
};
