import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  ArrowRight,
  Bookmark,
  Briefcase,
  Camera,
  Compass,
  LayoutGrid,
  Map as MapIcon,
  MapPin,
  Navigation,
  Radio,
  RotateCcw,
  Scale,
  ScanSearch,
  Search,
  ShieldCheck,
  ShoppingCart,
  SlidersHorizontal,
  SplitSquareHorizontal,
  Star,
  X,
} from 'lucide-react';
import type {
  Business,
  Category,
  DetectedLocation,
  ImageSearchAnalysis,
  ImageSearchResultItem,
  Listing,
  LiveProviderPublicMarker,
  RecommendedListingItem,
} from '../types/nearestyou.ts';
import { calculateDistanceKm, formatEtb } from '../utils/geo.ts';
import {
  formatPricingModelLabel,
  getCategoryLabel,
  TRANSLATIONS,
  type AppLanguage,
} from '../utils/i18n.ts';
import { catalogApi } from '../api/index.ts';
import heroAddisMarketplaceImg from '../assets/images/hero_addis_marketplace_1794751692104.jpg';
import { ImageSearchModal } from './ImageSearchModal.tsx';
import { ListingVisual } from './ListingVisual.tsx';
import { ServiceDiscoveryMap } from './ServiceMap.tsx';
import { useAuth } from '../context/AuthContext.tsx';

interface CustomerDiscoverViewProps {
  categories: Category[];
  businesses: Business[];
  listings: Listing[];
  liveProviders: LiveProviderPublicMarker[];
  recommendations: RecommendedListingItem[];
  detectedLocation: DetectedLocation;
  detectingLocation: boolean;
  loading: boolean;
  isSignedIn: boolean;
  isVerifiedProvider?: boolean;
  userLat: number;
  userLng: number;
  cartCount: number;
  compareIds: number[];
  favoriteIds: number[];
  language: AppLanguage;
  onRefreshLocation: () => void;
  onOpenCart: () => void;
  onOpenCompare: () => void;
  onToggleCompare: (id: number) => void;
  onToggleFavorite: (id: number) => void;
  onSelectListing: (listing: Listing) => void;
  onAddToCart: (listing: Listing, business: Business) => void;
  onGoToDelivery: () => void;
  onGoToBecomeProvider: () => void;
  onOpenJobSeekerAdvertise: () => void;
}

const SEARCH_STOP_WORDS = new Set([
  'i',
  'me',
  'my',
  'a',
  'an',
  'the',
  'for',
  'with',
  'and',
  'or',
  'in',
  'on',
  'at',
  'to',
  'of',
  'who',
  'need',
  'looking',
  'want',
  'find',
  'hire',
]);

function matchesSearchTokens(haystack: string, queryLower: string): boolean {
  if (!queryLower) return true;
  if (haystack.includes(queryLower)) return true;
  const cleaned = queryLower.replace(/[^\p{L}\p{N}\s]/gu, ' ').trim();
  if (!cleaned) return false;
  const rawParts = cleaned.split(/\s+/).filter(Boolean);
  const meaningful = rawParts.filter((w) => !SEARCH_STOP_WORDS.has(w));
  const tokens = meaningful.length > 0 ? meaningful : rawParts;
  if (tokens.length === 0) return true;
  return tokens.every(
    (token) =>
      haystack.includes(token) || (token.length >= 6 && haystack.includes(token.slice(0, 5)))
  );
}

export const CustomerDiscoverView: React.FC<CustomerDiscoverViewProps> = ({
  categories,
  businesses,
  listings,
  liveProviders,
  recommendations,
  detectedLocation,
  detectingLocation,
  loading,
  isSignedIn,
  isVerifiedProvider = false,
  userLat,
  userLng,
  cartCount,
  compareIds,
  favoriteIds,
  language,
  onRefreshLocation,
  onOpenCart,
  onOpenCompare,
  onToggleCompare,
  onToggleFavorite,
  onSelectListing,
  onAddToCart,
  onGoToDelivery,
  onGoToBecomeProvider,
  onOpenJobSeekerAdvertise,
}) => {
  const { dbUser, firebaseUser } = useAuth();
  const currentUids = useMemo(() => {
    const ids = new Set<string>();
    if (dbUser?.uid) ids.add(dbUser.uid);
    if (firebaseUser?.uid) ids.add(firebaseUser.uid);
    return ids;
  }, [dbUser?.uid, firebaseUser?.uid]);
  const t = TRANSLATIONS[language].discover;
  const [searchQuery, setSearchQuery] = useState('');
  const [activeCategorySlug, setActiveCategorySlug] = useState<string>('ALL');
  const [maxRadiusKm, setMaxRadiusKm] = useState<number>(25);
  const [sortBy, setSortBy] = useState<
    'DISTANCE' | 'PRICE_ASC' | 'PRICE_DESC' | 'RATING' | 'NEWEST'
  >('DISTANCE');

  // Expanded Filtration Options (collapsed by default on mobile phones for cleaner scroll)
  const [viewMode, setViewMode] = useState<'GRID' | 'SPLIT' | 'MAP'>('SPLIT');
  const [filtersOpen, setFiltersOpen] = useState<boolean>(() =>
    typeof window !== 'undefined' ? window.innerWidth >= 768 : true
  );
  const [listingTypeFilter, setListingTypeFilter] = useState<string>('ALL');
  const [pricingModelFilter, setPricingModelFilter] = useState<string>('ALL');
  const [minPriceEtb, setMinPriceEtb] = useState<string>('');
  const [maxPriceEtb, setMaxPriceEtb] = useState<string>('');
  const [minRating, setMinRating] = useState<number>(0);
  const [verifiedOnly, setVerifiedOnly] = useState(true);
  const [faydaLivenessOnly, setFaydaLivenessOnly] = useState(false);
  const [liveLocationOnly, setLiveLocationOnly] = useState(false);
  const [availableOnly, setAvailableOnly] = useState(true);
  const [deliveryOnly, setDeliveryOnly] = useState(false);
  const [discountedOnly, setDiscountedOnly] = useState(false);

  const [backendSearchRows, setBackendSearchRows] = useState<Array<{
    listing: Listing;
    business: Business;
    category?: Category | null;
    distanceKm: number;
    effectivePrice: number;
  }> | null>(null);
  const searchSeqRef = useRef(0);

  const [imageModalOpen, setImageModalOpen] = useState(false);
  const [imageModalMode, setImageModalMode] = useState<'camera' | 'upload'>('camera');
  const [visualSearch, setVisualSearch] = useState<{
    previewUrl: string;
    analysis: ImageSearchAnalysis;
    results: ImageSearchResultItem[];
  } | null>(null);

  const businessById = useMemo(() => {
    const rec: Record<number, Business> = {};
    businesses.forEach((b) => {
      rec[b.id] = b;
    });
    return rec;
  }, [businesses]);

  const categoryById = useMemo(() => {
    const rec: Record<number, Category> = {};
    categories.forEach((c) => {
      rec[c.id] = c;
    });
    return rec;
  }, [categories]);

  const activeCategoryObj = useMemo(() => {
    if (activeCategorySlug === 'ALL') return undefined;
    return categories.find((c) => c.slug === activeCategorySlug);
  }, [categories, activeCategorySlug]);

  // Query backend /api/v1/catalog/search nearest-first whenever user enters a search query
  useEffect(() => {
    const trimmed = searchQuery.trim();
    if (!trimmed) {
      setBackendSearchRows(null);
      return;
    }

    const currentSeq = ++searchSeqRef.current;
    const timer = setTimeout(() => {
      catalogApi
        .search({
          q: trimmed,
          categoryId: activeCategoryObj?.id,
          listingType: listingTypeFilter !== 'ALL' ? listingTypeFilter : undefined,
          lat: userLat,
          lng: userLng,
          radiusKm: maxRadiusKm,
          minPrice: minPriceEtb ? Number(minPriceEtb) : undefined,
          maxPrice: maxPriceEtb ? Number(maxPriceEtb) : undefined,
          minRating: minRating > 0 ? minRating : undefined,
          verifiedOnly,
          availableOnly,
          sortBy: 'NEAREST',
        })
        .then((res) => {
          if (searchSeqRef.current !== currentSeq) return;
          const rows = Array.isArray(res.data?.results) ? res.data.results : [];
          setBackendSearchRows(
            rows.map((r: any) => ({
              listing: r.listing,
              business: r.business,
              category: r.category || categoryById[r.listing?.categoryId],
              distanceKm: Number(r.distanceKm ?? 0),
              effectivePrice: Number(r.effectivePrice ?? r.listing?.discountPrice ?? r.listing?.basePrice ?? 0),
            }))
          );
        })
        .catch(() => {
          if (searchSeqRef.current === currentSeq) {
            setBackendSearchRows(null);
          }
        });
    }, 220);

    return () => clearTimeout(timer);
  }, [
    searchQuery,
    activeCategoryObj?.id,
    listingTypeFilter,
    userLat,
    userLng,
    maxRadiusKm,
    minPriceEtb,
    maxPriceEtb,
    minRating,
    verifiedOnly,
    availableOnly,
    categoryById,
  ]);

  const dynamicServiceTypes = useMemo(() => {
    const types = new Set<string>();
    categories
      .filter((c) => c.status === 'ACTIVE')
      .forEach((c) => {
        if (c.defaultListingType) types.add(c.defaultListingType);
        else if (c.categoryType) types.add(c.categoryType);
      });
    listings.forEach((l) => {
      if (l.listingType) types.add(l.listingType);
    });
    return Array.from(types);
  }, [categories, listings]);

  const enrichedListings = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    const minP = minPriceEtb ? Number(minPriceEtb) : null;
    const maxP = maxPriceEtb ? Number(maxPriceEtb) : null;

    // When visual image/camera search is active and user hasn't typed a new text query, display matched items nearest-first
    if (!q && visualSearch) {
      return visualSearch.results
        .filter(({ listing, business }) => {
          if (verifiedOnly && business.verificationStatus !== 'APPROVED') return false;
          if (faydaLivenessOnly && (!business.faydaVerified || !business.livenessVerified)) return false;
          if (liveLocationOnly && !business.liveLocationActive) return false;
          if (availableOnly && listing.availabilityStatus !== 'AVAILABLE') return false;
          if (listingTypeFilter !== 'ALL' && listing.listingType !== listingTypeFilter) return false;
          if (pricingModelFilter !== 'ALL' && listing.pricingModel !== pricingModelFilter) return false;
          if (discountedOnly && !listing.discountPrice) return false;
          const cat = categoryById[listing.categoryId];
          if (activeCategorySlug !== 'ALL' && cat?.slug !== activeCategorySlug) return false;
          const effective = listing.discountPrice ? Number(listing.discountPrice) : Number(listing.basePrice);
          if (minP !== null && Number.isFinite(minP) && effective < minP) return false;
          if (maxP !== null && Number.isFinite(maxP) && effective > maxP) return false;
          if (minRating > 0 && Number(listing.ratingAvg) < minRating) return false;
          return true;
        })
        .map((row) => ({
          item: row.listing,
          biz: row.business,
          cat: row.category || categoryById[row.listing.categoryId],
          distanceKm: Number(row.distanceKm ?? 0),
          effectivePrice: Number(row.effectivePrice ?? row.listing.discountPrice ?? row.listing.basePrice),
          visualImageMatch: Boolean(row.visualImageMatch),
        }))
        .sort((a, b) => a.distanceKm - b.distanceKm);
    }

    // When backend search results exist for the active query, refine with client-only toggles and preserve nearest-first order
    if (q && backendSearchRows !== null) {
      return backendSearchRows
        .filter(({ listing, business }) => {
          if (faydaLivenessOnly && (!business.faydaVerified || !business.livenessVerified)) return false;
          if (liveLocationOnly && !business.liveLocationActive) return false;
          if (pricingModelFilter !== 'ALL' && listing.pricingModel !== pricingModelFilter) return false;
          if (discountedOnly && !listing.discountPrice) return false;
          if (deliveryOnly) {
            const opts = listing.metadata?.deliveryOptions || [];
            const supportsDelivery =
              opts.some((d) => d.toLowerCase().includes('delivery')) ||
              listing.listingType === 'PRODUCT' ||
              listing.listingType === 'FOOD';
            if (!supportsDelivery) return false;
          }
          return true;
        })
        .map((row) => ({
          item: row.listing,
          biz: row.business,
          cat: row.category || categoryById[row.listing.categoryId],
          distanceKm: row.distanceKm,
          effectivePrice: row.effectivePrice,
          visualImageMatch: false,
        }))
        .sort((a, b) => a.distanceKm - b.distanceKm);
    }

    return listings
      .filter((item) => {
        if (item.status !== 'ACTIVE') return false;
        const biz = businessById[item.businessId];
        if (!biz) return false;
        if (verifiedOnly && biz.verificationStatus !== 'APPROVED') return false;
        if (faydaLivenessOnly && (!biz.faydaVerified || !biz.livenessVerified)) return false;
        if (liveLocationOnly && !biz.liveLocationActive) return false;
        if (availableOnly && item.availabilityStatus !== 'AVAILABLE') return false;

        if (listingTypeFilter !== 'ALL' && item.listingType !== listingTypeFilter) return false;
        if (pricingModelFilter !== 'ALL' && item.pricingModel !== pricingModelFilter) return false;
        if (discountedOnly && !item.discountPrice) return false;
        if (deliveryOnly) {
          const opts = item.metadata?.deliveryOptions || [];
          const supportsDelivery =
            opts.some((d) => d.toLowerCase().includes('delivery')) ||
            item.listingType === 'PRODUCT' ||
            item.listingType === 'FOOD';
          if (!supportsDelivery) return false;
        }

        const cat = categoryById[item.categoryId];
        if (activeCategorySlug !== 'ALL' && cat?.slug !== activeCategorySlug) return false;

        const effective = item.discountPrice ? Number(item.discountPrice) : Number(item.basePrice);
        if (minP !== null && Number.isFinite(minP) && effective < minP) return false;
        if (maxP !== null && Number.isFinite(maxP) && effective > maxP) return false;
        if (minRating > 0 && Number(item.ratingAvg) < minRating) return false;

        const dist = calculateDistanceKm(userLat, userLng, Number(biz.latitude), Number(biz.longitude));
        if (dist > maxRadiusKm) return false;

        if (q) {
          const metaText = [
            item.metadata?.skills,
            item.metadata?.experienceSummary,
            item.metadata?.availabilityNote,
            item.metadata?.cvFileName,
            item.metadata?.employmentType,
          ]
            .filter(Boolean)
            .join(' ');
          const hay =
            `${item.title} ${item.description} ${metaText} ${item.listingType} ${item.pricingModel} ${item.pricingUnit} ${biz.businessName} ${biz.description} ${biz.subCity} ${biz.woreda} ${biz.landmark} ${biz.licenseNumber} ${cat?.name || ''} ${cat?.nameAm || ''} ${getCategoryLabel(cat, 'om')}`.toLowerCase();
          if (!matchesSearchTokens(hay, q)) return false;
        }
        return true;
      })
      .map((item) => {
        const biz = businessById[item.businessId]!;
        const cat = categoryById[item.categoryId];
        const distanceKm = calculateDistanceKm(
          userLat,
          userLng,
          Number(biz.latitude),
          Number(biz.longitude)
        );
        const effectivePrice = item.discountPrice
          ? Number(item.discountPrice)
          : Number(item.basePrice);
        return { item, biz, cat, distanceKm, effectivePrice, visualImageMatch: false };
      })
      .sort((a, b) => {
        // Active search always prioritizes nearest results first
        if (q || sortBy === 'DISTANCE') return a.distanceKm - b.distanceKm;
        if (sortBy === 'PRICE_ASC') return a.effectivePrice - b.effectivePrice;
        if (sortBy === 'PRICE_DESC') return b.effectivePrice - a.effectivePrice;
        if (sortBy === 'NEWEST') {
          return new Date(b.item.createdAt).getTime() - new Date(a.item.createdAt).getTime();
        }
        return Number(b.item.ratingAvg) - Number(a.item.ratingAvg);
      });
  }, [
    listings,
    businessById,
    categoryById,
    backendSearchRows,
    visualSearch,
    searchQuery,
    activeCategorySlug,
    maxRadiusKm,
    sortBy,
    listingTypeFilter,
    pricingModelFilter,
    minPriceEtb,
    maxPriceEtb,
    minRating,
    verifiedOnly,
    faydaLivenessOnly,
    liveLocationOnly,
    availableOnly,
    deliveryOnly,
    discountedOnly,
    userLat,
    userLng,
  ]);

  // Backend-resolved recommendations shown before searching; falls back cleanly to nearest listings if backend list isn't populated yet
  const effectiveRecommendations = useMemo(() => {
    if (recommendations && recommendations.length > 0) {
      return recommendations.map((rec) => ({
        listing: rec.listing,
        business: rec.business,
        category: rec.category || categoryById[rec.listing.categoryId],
        distanceKm: Number(rec.distanceKm ?? 0),
        reason: rec.reason || '',
      }));
    }
    return listings
      .filter((item) => item.status === 'ACTIVE' && businessById[item.businessId])
      .map((item) => {
        const business = businessById[item.businessId]!;
        return {
          listing: item,
          business,
          category: categoryById[item.categoryId],
          distanceKm: calculateDistanceKm(
            userLat,
            userLng,
            Number(business.latitude),
            Number(business.longitude)
          ),
          reason: business.liveLocationActive
            ? 'Live GPS provider nearby'
            : 'Nearest active service to your location',
        };
      })
      .sort((a, b) => a.distanceKm - b.distanceKm)
      .slice(0, 6);
  }, [recommendations, listings, businessById, categoryById, userLat, userLng]);

  const filteredBusinessesForMap = useMemo(() => {
    const ids = new Set(enrichedListings.map((e) => e.biz.id));
    return businesses.filter((b) => ids.has(b.id));
  }, [enrichedListings, businesses]);

  const filteredProvidersForMap = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return liveProviders.filter((p) => {
      const cat = categoryById[p.serviceCategoryId];
      if (activeCategorySlug !== 'ALL' && cat?.slug !== activeCategorySlug) return false;
      if (liveLocationOnly && !p.isLiveLocationActive) return false;
      const dist = calculateDistanceKm(userLat, userLng, Number(p.latitude), Number(p.longitude));
      if (dist > maxRadiusKm) return false;
      if (q) {
        const hay = `${p.fullName} ${p.subCity} ${p.landmark} ${cat?.name || ''}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [
    liveProviders,
    categoryById,
    activeCategorySlug,
    liveLocationOnly,
    userLat,
    userLng,
    maxRadiusKm,
    searchQuery,
  ]);

  const resetAllFilters = () => {
    setSearchQuery('');
    setBackendSearchRows(null);
    setVisualSearch(null);
    setActiveCategorySlug('ALL');
    setMaxRadiusKm(25);
    setListingTypeFilter('ALL');
    setPricingModelFilter('ALL');
    setMinPriceEtb('');
    setMaxPriceEtb('');
    setMinRating(0);
    setVerifiedOnly(true);
    setFaydaLivenessOnly(false);
    setLiveLocationOnly(false);
    setAvailableOnly(true);
    setDeliveryOnly(false);
    setDiscountedOnly(false);
    setSortBy('DISTANCE');
  };

  const handleSearchInput = (value: string) => {
    setSearchQuery(value);
    if (value.trim().length > 0) {
      setVisualSearch(null);
      setSortBy('DISTANCE');
    }
  };

  const isSearching = searchQuery.trim().length > 0 || visualSearch !== null;
  const locationDisplay = detectedLocation.label || detectedLocation.city || 'Addis Ababa';

  return (
    <div className="space-y-10 overflow-x-hidden pb-16">
      {/* Hero Section */}
      <section className="mx-auto max-w-[1440px] px-4 pt-5 sm:px-6 sm:pt-8">
        <div className="grid items-stretch gap-6 lg:grid-cols-12 lg:gap-8">
          <div className="flex flex-col justify-between rounded-2xl border border-[#172B3A]/10 bg-white p-5 sm:p-8 lg:col-span-7">
            <div className="space-y-4">
              <div className="flex flex-wrap items-center justify-between gap-3 text-xs font-medium text-[#172B3A]/65">
                <span>{t.locationHeader}</span>
                <div className="flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    onClick={onOpenJobSeekerAdvertise}
                    className="inline-flex min-h-[38px] items-center gap-1.5 rounded-md border border-[#172B3A]/20 bg-white px-3 py-1.5 text-xs font-semibold text-[#172B3A] hover:border-[#176B52] hover:text-[#176B52] whitespace-nowrap shrink-0"
                  >
                    <Briefcase className="h-3.5 w-3.5 text-[#176B52]" />
                    {t.advertiseSelf}
                  </button>
                  {isSignedIn && !isVerifiedProvider && (
                    <button
                      type="button"
                      onClick={onGoToBecomeProvider}
                      className="inline-flex min-h-[38px] items-center gap-1 rounded-md border border-[#176B52]/30 bg-emerald-50/70 px-3 py-1.5 text-xs font-semibold text-[#176B52] hover:bg-emerald-100/70 whitespace-nowrap shrink-0"
                    >
                      <ShieldCheck className="h-3.5 w-3.5" />
                      {t.becomeProvider}
                    </button>
                  )}
                </div>
              </div>

              <h1
                className="font-display text-3xl font-bold tracking-tight text-[#172B3A] sm:text-4xl lg:text-[42px] lg:leading-[1.12]"
                style={{ textWrap: 'balance' }}
              >
                {t.heroTitle}
              </h1>

              <p className="max-w-xl text-[15px] leading-relaxed text-[#172B3A]/75">
                {t.heroSubtitle}
              </p>
            </div>

            <div className="mt-7 space-y-3.5">
              {/* Backend-Resolved Exact Location Readout (No manual sub-city dropdown) */}
              <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-[#176B52]/20 bg-[#F4F6F5] px-3.5 py-2.5 text-xs">
                <div className="flex min-w-0 items-center gap-2 text-[#172B3A]">
                  <MapPin className="h-4 w-4 shrink-0 text-[#176B52]" />
                  <span className="font-medium text-[#172B3A]/70">{t.detectedLocationLabel}:</span>
                  <span className="truncate font-semibold text-[#172B3A]">
                    {detectingLocation && detectedLocation.source === 'CITY_CENTER'
                      ? t.detectingLocation
                      : locationDisplay}
                  </span>
                  <span className="hidden font-mono text-[11px] text-[#176B52] tabular-nums sm:inline">
                    ({detectedLocation.lat.toFixed(4)}, {detectedLocation.lng.toFixed(4)})
                  </span>
                </div>

                <button
                  type="button"
                  onClick={onRefreshLocation}
                  className="inline-flex min-h-[34px] items-center gap-1.5 rounded-md border border-[#172B3A]/15 bg-white px-2.5 py-1 text-[11px] font-semibold text-[#176B52] hover:bg-emerald-50/60 whitespace-nowrap shrink-0"
                >
                  <Navigation className="h-3 w-3" />
                  {t.refreshGps}
                </button>
              </div>

              {/* Full-Width Nearest-First Search Input + Scan Image / Open Camera Actions */}
              <div className="flex flex-col gap-2.5 sm:flex-row sm:items-center">
                <div className="relative flex-1">
                  <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-[#172B3A]/45" />
                  <input
                    type="search"
                    value={searchQuery}
                    onChange={(e) => handleSearchInput(e.target.value)}
                    placeholder={t.searchPlaceholder}
                    className="h-12 w-full rounded-lg border border-[#172B3A]/15 bg-[#F4F6F5] pl-10 pr-4 text-sm text-[#172B3A] placeholder:text-[#172B3A]/45 focus:border-[#176B52] focus:bg-white focus:outline-none"
                  />
                </div>

                <div className="flex items-center gap-2 shrink-0">
                  <button
                    type="button"
                    onClick={() => {
                      setImageModalMode('upload');
                      setImageModalOpen(true);
                    }}
                    className="inline-flex h-12 flex-1 sm:flex-initial items-center justify-center gap-1.5 rounded-lg border border-[#172B3A]/15 bg-[#F4F6F5] px-3.5 text-xs font-semibold text-[#172B3A] hover:border-[#176B52] hover:bg-white whitespace-nowrap"
                  >
                    <ScanSearch className="h-4 w-4 text-[#176B52]" />
                    <span>{t.scanImageBtn}</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => {
                      setImageModalMode('camera');
                      setImageModalOpen(true);
                    }}
                    className="inline-flex h-12 flex-1 sm:flex-initial items-center justify-center gap-1.5 rounded-lg bg-[#176B52] px-3.5 text-xs font-semibold text-white hover:bg-[#125641] whitespace-nowrap"
                  >
                    <Camera className="h-4 w-4" />
                    <span>{t.openCameraBtn}</span>
                  </button>
                </div>
              </div>

              <div className="flex flex-wrap items-center justify-between gap-3 pt-1">
                <div className="flex flex-wrap items-center gap-2 text-xs text-[#172B3A]/70">
                  <span>{t.radius}</span>
                  {[3, 5, 10, 25].map((km) => (
                    <button
                      key={km}
                      type="button"
                      onClick={() => setMaxRadiusKm(km)}
                      className={`min-h-[34px] rounded-md px-2.5 py-1 font-mono text-xs font-medium transition-colors whitespace-nowrap shrink-0 ${
                        maxRadiusKm === km
                          ? 'bg-[#176B52] text-white'
                          : 'bg-[#F4F6F5] text-[#172B3A]/75 hover:text-[#172B3A]'
                      }`}
                    >
                      {km === 25 ? t.allAddis : `${km} km`}
                    </button>
                  ))}
                </div>

                {isSignedIn && (
                  <button
                    type="button"
                    onClick={onGoToDelivery}
                    className="inline-flex min-h-[38px] items-center gap-1.5 text-xs font-semibold text-[#176B52] hover:underline whitespace-nowrap shrink-0"
                  >
                    {t.requestCourier}
                    <ArrowRight className="h-3.5 w-3.5" />
                  </button>
                )}
              </div>
            </div>
          </div>

          <div className="relative min-h-[280px] overflow-hidden rounded-2xl border border-[#172B3A]/10 bg-[#172B3A] lg:col-span-5">
            <img
              src={heroAddisMarketplaceImg}
              alt="Commercial avenue in Addis Ababa, Ethiopia"
              referrerPolicy="no-referrer"
              className="h-full w-full object-cover lg:h-full"
            />
            <div className="absolute inset-0 bg-gradient-to-t from-[#172B3A]/85 via-[#172B3A]/20 to-transparent" />
            <div className="absolute inset-x-0 bottom-0 p-6 text-white">
              <p className="text-xs font-medium text-[#F4A62A]">{t.heroImageBadge}</p>
              <p className="mt-1 font-display text-lg font-semibold leading-snug">
                {t.heroImageCaption}
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* Pre-Search Location-Based Recommendations */}
      {!isSearching && !loading && effectiveRecommendations.length > 0 && (
        <section className="mx-auto max-w-[1440px] px-4 sm:px-6 space-y-4">
          <div className="flex flex-wrap items-end justify-between gap-2">
            <div>
              <div className="flex items-center gap-2 text-xs font-semibold text-[#176B52]">
                <Compass className="h-4 w-4" />
                <span>
                  {locationDisplay} · {t.nearestFirstBadge}
                </span>
              </div>
              <h2 className="mt-1 font-display text-xl font-bold text-[#172B3A]">
                {t.recommendedTitle}
              </h2>
              <p className="text-xs text-[#172B3A]/65">{t.recommendedSubtitle}</p>
            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {effectiveRecommendations.slice(0, 6).map(({ listing, business, category, distanceKm, reason }) => {
              const isOrderable = listing.listingType === 'PRODUCT' || listing.listingType === 'FOOD';
              const isOwnListing = Boolean(business.ownerUid && currentUids.has(business.ownerUid));
              return (
                <div
                  key={`rec-${listing.id}`}
                  className="flex min-w-0 items-stretch gap-3.5 rounded-xl border border-[#176B52]/20 bg-white p-3.5 transition-shadow hover:shadow-md"
                >
                  <button
                    type="button"
                    onClick={() => onSelectListing(listing)}
                    className="w-24 shrink-0 overflow-hidden rounded-lg text-left"
                  >
                    <ListingVisual
                      imageUrl={listing.imageUrl}
                      imageUrls={listing.imageUrls}
                      companyLogoUrl={listing.metadata?.companyLogoUrl}
                      introVideoUrl={listing.metadata?.introVideoUrl}
                      cvUrl={listing.metadata?.cvUrl}
                      title={listing.title}
                      listingType={listing.listingType}
                      className="h-full min-h-[92px] w-full"
                    />
                  </button>

                  <div className="flex min-w-0 flex-1 flex-col justify-between">
                    <div>
                      <div className="flex items-center justify-between gap-2 text-[11px]">
                        <span className="truncate font-semibold text-[#176B52]">
                          {getCategoryLabel(category, language, listing.listingType)}
                        </span>
                        <span className="shrink-0 font-mono font-bold tabular-nums text-[#172B3A]">
                          {distanceKm} km
                        </span>
                      </div>
                      <button
                        type="button"
                        onClick={() => onSelectListing(listing)}
                        className="mt-0.5 block w-full truncate text-left font-display text-sm font-bold text-[#172B3A] hover:text-[#176B52]"
                      >
                        {listing.title}
                      </button>
                      <p className="truncate text-[11px] text-[#172B3A]/65">
                        {business.businessName} · {business.subCity}
                      </p>
                      {reason && (
                        <p className="mt-0.5 truncate text-[10px] font-medium text-[#176B52]/85">
                          {reason}
                        </p>
                      )}
                    </div>

                    <div className="mt-2 flex items-center justify-between gap-2 border-t border-[#172B3A]/10 pt-2">
                      <span className="font-mono text-xs font-bold tabular-nums text-[#172B3A]">
                        {listing.isUnpaid && Number(listing.basePrice) === 0
                          ? t.negotiable
                          : formatEtb(listing.discountPrice || listing.basePrice)}
                      </span>
                      <button
                        type="button"
                        onClick={() =>
                          isOwnListing
                            ? onSelectListing(listing)
                            : isOrderable
                              ? onAddToCart(listing, business)
                              : onSelectListing(listing)
                        }
                        className={`rounded-md px-2.5 py-1 text-[11px] font-semibold whitespace-nowrap ${
                          isOwnListing
                            ? 'border border-[#176B52]/35 bg-emerald-50 text-[#176B52] hover:bg-emerald-100'
                            : 'bg-[#176B52] text-white hover:bg-[#125641]'
                        }`}
                      >
                        {isOwnListing
                          ? 'My Ad · View / Edit'
                          : isOrderable
                            ? t.addToCart
                            : listing.listingType === 'JOB'
                              ? t.viewApply
                              : listing.listingType === 'RENTAL'
                                ? t.reserveDates
                                : listing.listingType === 'EVENT'
                                  ? t.bookNow
                                  : t.contactMessage}
                      </button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </section>
      )}

      {/* Main Catalog & Real-Time Map Workspace */}
      <section className="mx-auto max-w-[1440px] px-4 sm:px-6 space-y-5">
        {/* Category Segmented Navigation + View Mode & Workspace Actions */}
        <div className="flex flex-col gap-4 border-b border-[#172B3A]/10 pb-4 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex items-center gap-1.5 overflow-x-auto pb-1">
            <button
              type="button"
              onClick={() => setActiveCategorySlug('ALL')}
              className={`min-h-[40px] rounded-lg px-3.5 py-2 text-xs font-semibold transition-colors whitespace-nowrap shrink-0 ${
                activeCategorySlug === 'ALL'
                  ? 'bg-[#172B3A] text-white'
                  : 'bg-white text-[#172B3A]/75 hover:bg-white/80 hover:text-[#172B3A]'
              }`}
            >
              {t.allServices}
            </button>
            {categories
              .filter((c) => c.status === 'ACTIVE')
              .map((cat) => (
                <button
                  key={cat.id}
                  type="button"
                  onClick={() => setActiveCategorySlug(cat.slug)}
                  className={`min-h-[40px] rounded-lg px-3.5 py-2 text-xs font-semibold transition-colors whitespace-nowrap shrink-0 ${
                    activeCategorySlug === cat.slug
                      ? 'bg-[#176B52] text-white'
                      : 'bg-white text-[#172B3A]/75 hover:text-[#172B3A]'
                  }`}
                >
                  {getCategoryLabel(cat, language)}
                </button>
              ))}
          </div>

          <div className="flex flex-wrap items-center gap-2 shrink-0">
            <div className="inline-flex rounded-lg border border-[#172B3A]/15 bg-white p-0.5">
              {[
                { id: 'GRID', label: t.viewCards, icon: LayoutGrid },
                { id: 'SPLIT', label: t.viewSplit, icon: SplitSquareHorizontal },
                { id: 'MAP', label: t.viewMap, icon: MapIcon },
              ].map((m) => {
                const Icon = m.icon;
                return (
                  <button
                    key={m.id}
                    type="button"
                    onClick={() => setViewMode(m.id as typeof viewMode)}
                    className={`inline-flex min-h-[34px] items-center gap-1.5 rounded-md px-2.5 py-1 text-xs font-semibold ${
                      viewMode === m.id
                        ? 'bg-[#172B3A] text-white'
                        : 'text-[#172B3A]/70 hover:text-[#172B3A]'
                    }`}
                  >
                    <Icon className="h-3.5 w-3.5" />
                    {m.label}
                  </button>
                );
              })}
            </div>

            <button
              type="button"
              onClick={onOpenCompare}
              className="inline-flex min-h-[40px] items-center gap-2 rounded-lg border border-[#172B3A]/15 bg-white px-3.5 py-2 text-xs font-semibold text-[#172B3A] hover:bg-[#F4F6F5] whitespace-nowrap shrink-0"
            >
              <Scale className="h-3.5 w-3.5 text-[#176B52]" />
              {t.compare} ({compareIds.length}/3)
            </button>
            <button
              type="button"
              onClick={onOpenCart}
              className="inline-flex min-h-[40px] items-center gap-2 rounded-lg bg-[#F4A62A] px-4 py-2 text-xs font-bold text-[#172B3A] hover:bg-[#e5981d] whitespace-nowrap shrink-0"
            >
              <ShoppingCart className="h-3.5 w-3.5" />
              {t.cart} ({cartCount})
            </button>
          </div>
        </div>

        {/* Advanced Filtration Panel */}
        <div className="rounded-2xl border border-[#172B3A]/10 bg-white p-4 space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={() => setFiltersOpen((o) => !o)}
                className="inline-flex min-h-[40px] items-center gap-1.5 text-xs font-semibold text-[#172B3A] hover:text-[#176B52]"
              >
                <SlidersHorizontal className="h-3.5 w-3.5 text-[#176B52]" />
                {filtersOpen ? t.hideFilters : t.showFilters}
              </button>
              <span className="text-xs text-[#172B3A]/55 tabular-nums">
                · {enrichedListings.length} {t.matchingListings} · {filteredProvidersForMap.length}{' '}
                {t.liveProvidersNearby}
              </span>
            </div>

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={resetAllFilters}
                className="inline-flex items-center gap-1 rounded-md px-2.5 py-1 text-xs font-medium text-[#172B3A]/70 hover:bg-[#F4F6F5]"
              >
                <RotateCcw className="h-3 w-3" />
                {t.reset}
              </button>

              <select
                aria-label="Sort listings"
                value={isSearching ? 'DISTANCE' : sortBy}
                disabled={isSearching}
                onChange={(e) => setSortBy(e.target.value as typeof sortBy)}
                className="h-9 rounded-lg border border-[#172B3A]/15 bg-[#F4F6F5] px-3 text-xs font-semibold text-[#172B3A] focus:outline-none disabled:opacity-75"
              >
                <option value="DISTANCE">{t.sortDistance}</option>
                <option value="PRICE_ASC">{t.sortPriceAsc}</option>
                <option value="PRICE_DESC">{t.sortPriceDesc}</option>
                <option value="RATING">{t.sortRating}</option>
                <option value="NEWEST">{t.sortNewest}</option>
              </select>
            </div>
          </div>

          {filtersOpen && (
            <div className="space-y-3 border-t border-[#172B3A]/10 pt-3">
              <div className="grid gap-3 sm:grid-cols-2 md:grid-cols-5">
                <div>
                  <label className="block text-[11px] font-medium text-[#172B3A]/65">
                    {t.serviceType}
                  </label>
                  <select
                    value={listingTypeFilter}
                    onChange={(e) => setListingTypeFilter(e.target.value)}
                    className="mt-1 h-9 w-full rounded-lg border border-[#172B3A]/15 bg-[#F4F6F5] px-2.5 text-xs"
                  >
                    <option value="ALL">{t.allTypes}</option>
                    {dynamicServiceTypes.map((typeCode) => (
                      <option key={typeCode} value={typeCode}>
                        {typeCode}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-[11px] font-medium text-[#172B3A]/65">
                    {t.pricingModel}
                  </label>
                  <select
                    value={pricingModelFilter}
                    onChange={(e) => setPricingModelFilter(e.target.value)}
                    className="mt-1 h-9 w-full rounded-lg border border-[#172B3A]/15 bg-[#F4F6F5] px-2.5 text-xs"
                  >
                    <option value="ALL">{t.allPricingModels}</option>
                    <option value="ONE_TIME_CONTRACT">{t.oneTimeContract}</option>
                    <option value="FULL_TIME">{t.fullTime}</option>
                    <option value="PER_HOUR">{t.perHour}</option>
                    <option value="PER_DAY">Per Day</option>
                    <option value="PER_MONTH">Per Month</option>
                    <option value="PER_SESSION">Per Session</option>
                    <option value="FIXED">Fixed Price</option>
                    <option value="PER_UNIT">Per Unit</option>
                    <option value="CALCULATED">Calculated Rate</option>
                  </select>
                </div>

                <div>
                  <label className="block text-[11px] font-medium text-[#172B3A]/65">
                    {t.minPrice}
                  </label>
                  <input
                    type="number"
                    min={0}
                    value={minPriceEtb}
                    onChange={(e) => setMinPriceEtb(e.target.value)}
                    placeholder="100"
                    className="mt-1 h-9 w-full rounded-lg border border-[#172B3A]/15 px-2.5 font-mono text-xs"
                  />
                </div>

                <div>
                  <label className="block text-[11px] font-medium text-[#172B3A]/65">
                    {t.maxPrice}
                  </label>
                  <input
                    type="number"
                    min={0}
                    value={maxPriceEtb}
                    onChange={(e) => setMaxPriceEtb(e.target.value)}
                    placeholder="25000"
                    className="mt-1 h-9 w-full rounded-lg border border-[#172B3A]/15 px-2.5 font-mono text-xs"
                  />
                </div>

                <div>
                  <label className="block text-[11px] font-medium text-[#172B3A]/65">
                    {t.minRating}
                  </label>
                  <select
                    value={minRating}
                    onChange={(e) => setMinRating(Number(e.target.value))}
                    className="mt-1 h-9 w-full rounded-lg border border-[#172B3A]/15 bg-[#F4F6F5] px-2.5 text-xs"
                  >
                    <option value={0}>{t.anyRating}</option>
                    <option value={4.5}>4.5+</option>
                    <option value={4.8}>4.8+</option>
                  </select>
                </div>
              </div>

              <div className="flex flex-wrap items-center gap-x-5 gap-y-2 pt-1 text-xs text-[#172B3A]/80">
                <label className="inline-flex cursor-pointer items-center gap-1.5 font-medium">
                  <input
                    type="checkbox"
                    checked={verifiedOnly}
                    onChange={(e) => setVerifiedOnly(e.target.checked)}
                    className="h-3.5 w-3.5 rounded accent-[#176B52]"
                  />
                  {t.approvedOnly}
                </label>

                <label className="inline-flex cursor-pointer items-center gap-1.5 font-medium">
                  <input
                    type="checkbox"
                    checked={faydaLivenessOnly}
                    onChange={(e) => setFaydaLivenessOnly(e.target.checked)}
                    className="h-3.5 w-3.5 rounded accent-[#176B52]"
                  />
                  {t.faydaVerifiedOnly}
                </label>

                <label className="inline-flex cursor-pointer items-center gap-1.5 font-medium">
                  <input
                    type="checkbox"
                    checked={liveLocationOnly}
                    onChange={(e) => setLiveLocationOnly(e.target.checked)}
                    className="h-3.5 w-3.5 rounded accent-[#176B52]"
                  />
                  {t.liveGpsOnly}
                </label>

                <label className="inline-flex cursor-pointer items-center gap-1.5 font-medium">
                  <input
                    type="checkbox"
                    checked={availableOnly}
                    onChange={(e) => setAvailableOnly(e.target.checked)}
                    className="h-3.5 w-3.5 rounded accent-[#176B52]"
                  />
                  {t.availableNow}
                </label>

                <label className="inline-flex cursor-pointer items-center gap-1.5 font-medium">
                  <input
                    type="checkbox"
                    checked={deliveryOnly}
                    onChange={(e) => setDeliveryOnly(e.target.checked)}
                    className="h-3.5 w-3.5 rounded accent-[#176B52]"
                  />
                  {t.deliverySupported}
                </label>

                <label className="inline-flex cursor-pointer items-center gap-1.5 font-medium">
                  <input
                    type="checkbox"
                    checked={discountedOnly}
                    onChange={(e) => setDiscountedOnly(e.target.checked)}
                    className="h-3.5 w-3.5 rounded accent-[#176B52]"
                  />
                  {t.discountedOnly}
                </label>
              </div>
            </div>
          )}
        </div>

        {/* SEARCH RESULTS RENDER FIRST (BEFORE THE MAP) */}
        {viewMode !== 'MAP' && (
          <div className="space-y-4">
            {visualSearch && (
              <div className="flex flex-wrap items-center justify-between gap-4 rounded-xl border border-[#176B52]/25 bg-white p-4">
                <div className="flex min-w-0 items-center gap-3.5">
                  <img
                    src={visualSearch.previewUrl}
                    alt={visualSearch.analysis.detectedItem}
                    className="h-14 w-14 shrink-0 rounded-lg border border-[#172B3A]/10 object-cover"
                  />
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2 text-xs">
                      <span className="font-semibold text-[#176B52]">{t.visualMatchBanner}:</span>
                      <span className="font-display text-sm font-bold text-[#172B3A]">
                        {visualSearch.analysis.detectedItem}
                      </span>
                      {visualSearch.analysis.categoryHint && (
                        <span className="text-[#172B3A]/60">
                          · {visualSearch.analysis.categoryHint}
                        </span>
                      )}
                    </div>
                    {visualSearch.analysis.summary && (
                      <p className="mt-0.5 truncate text-xs text-[#172B3A]/70">
                        {visualSearch.analysis.summary}
                      </p>
                    )}
                    {visualSearch.analysis.keywords.length > 0 && (
                      <p className="mt-1 font-mono text-[11px] text-[#176B52]">
                        {visualSearch.analysis.keywords.slice(0, 6).join(' · ')}
                      </p>
                    )}
                  </div>
                </div>

                <button
                  type="button"
                  onClick={() => setVisualSearch(null)}
                  className="inline-flex min-h-[36px] items-center gap-1.5 rounded-lg border border-[#172B3A]/15 bg-[#F4F6F5] px-3 py-1.5 text-xs font-semibold text-[#172B3A] hover:bg-white whitespace-nowrap shrink-0"
                >
                  <X className="h-3.5 w-3.5" />
                  {t.clearImageSearch}
                </button>
              </div>
            )}

            <div className="flex flex-wrap items-center justify-between gap-2">
              <h2 className="font-display text-lg font-bold text-[#172B3A]">
                {t.resultsHeading}{' '}
                <span className="font-mono text-sm font-semibold text-[#176B52] tabular-nums">
                  ({enrichedListings.length})
                </span>
              </h2>
              {(isSearching || sortBy === 'DISTANCE') && (
                <span className="font-mono text-xs font-medium text-[#176B52]">
                  {t.nearestFirstBadge} · {locationDisplay}
                </span>
              )}
            </div>

            {loading ? (
              <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
                {[1, 2, 3, 4, 5, 6].map((n) => (
                  <div
                    key={n}
                    className="h-96 animate-pulse rounded-xl border border-[#172B3A]/10 bg-white p-4"
                  >
                    <div className="h-48 rounded-lg bg-[#E6EAE8]" />
                    <div className="mt-4 h-4 w-2/3 rounded bg-[#E6EAE8]" />
                    <div className="mt-2 h-3 w-full rounded bg-[#E6EAE8]" />
                    <div className="mt-6 h-8 w-1/2 rounded bg-[#E6EAE8]" />
                  </div>
                ))}
              </div>
            ) : enrichedListings.length === 0 ? (
              <div className="rounded-2xl border border-[#172B3A]/10 bg-white px-6 py-16 text-center">
                <p className="font-display text-lg font-semibold text-[#172B3A]">
                  {t.noResults} ({maxRadiusKm} km · {locationDisplay})
                </p>
                <p className="mt-1 text-sm text-[#172B3A]/65">{t.noResultsHint}</p>
                <button
                  type="button"
                  onClick={resetAllFilters}
                  className="mt-4 min-h-[40px] rounded-lg bg-[#176B52] px-4 py-2 text-xs font-semibold text-white hover:bg-[#125641]"
                >
                  {t.resetAll}
                </button>
              </div>
            ) : (
              <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
                {enrichedListings.map(({ item, biz, cat, distanceKm, visualImageMatch }) => {
                  const isCompared = compareIds.includes(item.id);
                  const isSaved = favoriteIds.includes(item.id);
                  const isOrderable = item.listingType === 'PRODUCT' || item.listingType === 'FOOD';
                  const isOwnListing = Boolean(biz.ownerUid && currentUids.has(biz.ownerUid));

                  return (
                    <article
                      key={item.id}
                      className="group flex min-w-0 flex-col justify-between overflow-hidden rounded-xl border border-[#172B3A]/10 bg-white transition-transform duration-150 hover:-translate-y-0.5 hover:shadow-md"
                    >
                      <div>
                        <div onClick={() => onSelectListing(item)} className="cursor-pointer">
                          <ListingVisual
                            imageUrl={item.imageUrl}
                            imageUrls={item.imageUrls}
                            companyLogoUrl={item.metadata?.companyLogoUrl}
                            introVideoUrl={item.metadata?.introVideoUrl}
                            cvUrl={item.metadata?.cvUrl}
                            title={item.title}
                            listingType={item.listingType}
                            className="h-52 w-full"
                          />
                        </div>

                        <div className="p-5">
                          {/* Zero-Pill Metadata Line */}
                          <div className="flex flex-wrap items-center gap-1.5 text-xs text-[#172B3A]/60">
                            <span className="font-medium text-[#176B52]">
                              {item.listingType === 'JOB_SEEKER' ||
                              biz.profileType === 'INDIVIDUAL_JOB_SEEKER'
                                ? t.jobSeekerBadge
                                : getCategoryLabel(cat, language, item.listingType)}
                            </span>
                            <span aria-hidden="true">·</span>
                            <span>{biz.subCity}</span>
                            <span aria-hidden="true">·</span>
                            <span className="font-mono tabular-nums">{distanceKm} km</span>
                            {biz.liveLocationActive && (
                              <>
                                <span aria-hidden="true">·</span>
                                <span className="inline-flex items-center gap-1 font-medium text-[#176B52]">
                                  <Radio className="h-3 w-3" />
                                  {t.liveGps}
                                </span>
                              </>
                            )}
                          </div>

                          <h3
                            onClick={() => onSelectListing(item)}
                            className="mt-2 cursor-pointer font-display text-lg font-semibold text-[#172B3A] group-hover:text-[#176B52]"
                          >
                            {item.title}
                          </h3>

                          <p className="mt-1 line-clamp-2 text-xs leading-relaxed text-[#172B3A]/70">
                            {item.description}
                          </p>
                          {item.metadata?.skills && (
                            <p className="mt-1 truncate text-[11px] font-medium text-[#172B3A]/65">
                              Skills: {item.metadata.skills}
                            </p>
                          )}

                          {/* Mandatory Explicit Pricing Block */}
                          <div className="mt-4 border-t border-[#172B3A]/10 pt-3">
                            <div className="flex items-baseline justify-between gap-2">
                              <div>
                                {item.isUnpaid && Number(item.basePrice) === 0 ? (
                                  <span className="font-mono text-base font-bold text-[#176B52]">
                                    {t.negotiable}
                                  </span>
                                ) : (
                                  <>
                                    <span className="font-mono text-lg font-bold tabular-nums text-[#172B3A]">
                                      {formatEtb(item.discountPrice || item.basePrice)}
                                    </span>
                                    <span className="ml-1 text-xs text-[#172B3A]/65">
                                      / {item.pricingUnit}
                                    </span>
                                  </>
                                )}
                                {item.discountPrice && (
                                  <span className="ml-2 font-mono text-xs tabular-nums text-[#172B3A]/45 line-through">
                                    {formatEtb(item.basePrice)}
                                  </span>
                                )}
                                {item.salaryMax && (
                                  <span className="ml-1 font-mono text-xs tabular-nums text-[#172B3A]/70">
                                    – {formatEtb(item.salaryMax)}
                                  </span>
                                )}
                              </div>

                              <span className="inline-flex items-center gap-1 font-mono text-xs tabular-nums text-[#172B3A]/75">
                                <Star className="h-3.5 w-3.5 fill-[#F4A62A] text-[#F4A62A]" />
                                {Number(item.ratingAvg).toFixed(1)}
                              </span>
                            </div>

                            <p className="mt-1 font-mono text-[11px] tabular-nums text-[#172B3A]/60">
                              {biz.businessName} · {formatPricingModelLabel(item.pricingModel, language)} ·{' '}
                              {biz.profileType === 'INDIVIDUAL_JOB_SEEKER'
                                ? biz.faydaVerified
                                  ? t.faydaLiveVerified
                                  : t.jobSeekerBadge
                                : biz.faydaVerified && biz.livenessVerified
                                  ? t.faydaLiveVerified
                                  : biz.verificationStatus}
                            </p>
                            {(visualImageMatch || item.metadata?.cvUrl || item.metadata?.introVideoUrl) && (
                              <p className="mt-1 flex flex-wrap items-center gap-2 text-[11px] font-medium text-[#176B52]">
                                {visualImageMatch && <span>Matched uploaded photo</span>}
                                {item.metadata?.cvUrl && <span>CV attached</span>}
                                {item.metadata?.introVideoUrl && <span>YouTube intro video</span>}
                              </p>
                            )}
                          </div>
                        </div>
                      </div>

                      <div className="flex items-center justify-between gap-2 border-t border-[#172B3A]/10 bg-[#F4F6F5]/45 px-5 py-3">
                        <div className="flex items-center gap-2">
                          <button
                            type="button"
                            onClick={() => onToggleCompare(item.id)}
                            className={`min-h-[36px] rounded-md px-2.5 py-1 text-xs font-medium transition-colors ${
                              isCompared
                                ? 'bg-[#172B3A] text-white'
                                : 'text-[#172B3A]/70 hover:bg-white hover:text-[#172B3A]'
                            }`}
                          >
                            {isCompared ? t.comparing : t.addCompare}
                          </button>
                          <button
                            type="button"
                            onClick={() => onToggleFavorite(item.id)}
                            aria-label={isSaved ? 'Remove from favorites' : 'Save to favorites'}
                            className={`flex h-9 w-9 items-center justify-center rounded-md transition-colors ${
                              isSaved
                                ? 'text-[#F4A62A]'
                                : 'text-[#172B3A]/45 hover:bg-white hover:text-[#172B3A]'
                            }`}
                          >
                            <Bookmark className={`h-4 w-4 ${isSaved ? 'fill-[#F4A62A]' : ''}`} />
                          </button>
                        </div>

                        {isOwnListing ? (
                          <button
                            type="button"
                            onClick={() => onSelectListing(item)}
                            className="min-h-[38px] rounded-lg border border-[#176B52]/35 bg-emerald-50 px-3.5 py-1.5 text-xs font-semibold text-[#176B52] transition-colors hover:bg-emerald-100 whitespace-nowrap shrink-0"
                          >
                            My Ad · View / Edit
                          </button>
                        ) : isOrderable ? (
                          <button
                            type="button"
                            onClick={() => onAddToCart(item, biz)}
                            className="min-h-[38px] rounded-lg bg-[#176B52] px-3.5 py-1.5 text-xs font-semibold text-white transition-colors hover:bg-[#125641] whitespace-nowrap shrink-0"
                          >
                            {t.addToCart}
                          </button>
                        ) : (
                          <button
                            type="button"
                            onClick={() => onSelectListing(item)}
                            className="min-h-[38px] rounded-lg bg-[#176B52] px-3.5 py-1.5 text-xs font-semibold text-white transition-colors hover:bg-[#125641] whitespace-nowrap shrink-0"
                          >
                            {item.listingType === 'JOB'
                              ? t.viewApply
                              : item.listingType === 'RENTAL'
                                ? t.reserveDates
                                : item.listingType === 'EVENT'
                                  ? t.bookNow
                                  : t.contactMessage}
                          </button>
                        )}
                      </div>
                    </article>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/* Real-Time OpenStreetMap Section (Positioned BELOW Search Results) */}
        {(viewMode === 'MAP' || viewMode === 'SPLIT') && (
          <div className="space-y-3 pt-2">
            <h2 className="font-display text-lg font-bold text-[#172B3A]">{t.mapHeading}</h2>
            <ServiceDiscoveryMap
              businesses={filteredBusinessesForMap}
              listings={listings}
              categories={categories}
              liveProviders={filteredProvidersForMap}
              userLat={userLat}
              userLng={userLng}
              onSelectListing={onSelectListing}
              heightClass={viewMode === 'MAP' ? 'h-[420px] sm:h-[560px]' : 'h-[340px] sm:h-[420px]'}
            />
          </div>
        )}
      </section>

      <ImageSearchModal
        open={imageModalOpen}
        initialMode={imageModalMode}
        userLat={userLat}
        userLng={userLng}
        radiusKm={maxRadiusKm}
        language={language}
        onClose={() => setImageModalOpen(false)}
        onResults={({ previewUrl, analysis, results }) => {
          setSearchQuery('');
          setBackendSearchRows(null);
          setSortBy('DISTANCE');
          setVisualSearch({ previewUrl, analysis, results });
        }}
      />
    </div>
  );
};
