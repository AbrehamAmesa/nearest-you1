import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Html5Qrcode } from 'html5-qrcode';
import {
  AlertCircle,
  Building2,
  Camera,
  CheckCircle2,
  Clock,
  FileText,
  ImagePlus,
  MapPin,
  Navigation,
  Plus,
  QrCode,
  Radio,
  ShieldCheck,
  ShieldOff,
  Upload,
  Video,
  X,
} from 'lucide-react';
import type {
  BookingRecord,
  Business,
  Category,
  CategoryDocumentRequirement,
  CommissionRecord,
  JobApplicationRecord,
  Listing,
  ListingMetadata,
  OnboardingGovernance,
  OrderRecord,
  ProviderRegistration,
} from '../types/nearestyou.ts';
import { ADDIS_SUB_CITIES, formatEtb } from '../utils/geo.ts';
import { getCategoryLabel, getDocumentLabel, type AppLanguage } from '../utils/i18n.ts';
import {
  compressImageFile,
  extractYouTubeVideoId,
  MAX_PRODUCT_IMAGES,
  readFileAsDataUrl,
} from '../utils/media.ts';
import { useAuth } from '../context/AuthContext.tsx';
import { ListingVisual } from './ListingVisual.tsx';
import { ProviderOnboardingWizard } from './ProviderOnboardingWizard.tsx';
import { RealtimeLocationPickerMap } from './ServiceMap.tsx';

type BusinessPortalTab =
  | 'PROVIDER_KYC'
  | 'PEER_VOUCH'
  | 'APPROVALS'
  | 'CATALOG'
  | 'ORDERS'
  | 'BOOKINGS'
  | 'RECRUITMENT'
  | 'REGISTER';

interface BusinessPortalViewProps {
  categories: Category[];
  documentRequirements: CategoryDocumentRequirement[];
  businesses: Business[];
  listings: Listing[];
  governance: OnboardingGovernance;
  language?: AppLanguage;
  initialTab?: BusinessPortalTab;
  onRefreshCatalog: () => void;
  onNotify: (msg: string) => void;
}

export const BusinessPortalView: React.FC<BusinessPortalViewProps> = ({
  categories,
  documentRequirements,
  businesses,
  listings,
  governance,
  language = 'en',
  initialTab = 'PROVIDER_KYC',
  onRefreshCatalog,
  onNotify,
}) => {
  const { firebaseUser, dbUser, isAdmin, refreshProfile, openAuthModal, authFetch } = useAuth();
  const activeCategories = useMemo(
    () => categories.filter((c) => c.status === 'ACTIVE'),
    [categories]
  );
  const [tab, setTab] = useState<BusinessPortalTab>(initialTab);
  const [ownedBusinesses, setOwnedBusinesses] = useState<Business[]>([]);
  const [orders, setOrders] = useState<OrderRecord[]>([]);
  const [bookings, setBookings] = useState<BookingRecord[]>([]);
  const [applications, setApplications] = useState<JobApplicationRecord[]>([]);
  const [commissions, setCommissions] = useState<CommissionRecord[]>([]);
  const [providerReg, setProviderReg] = useState<ProviderRegistration | null>(null);
  const [portalReqs, setPortalReqs] = useState<CategoryDocumentRequirement[]>(documentRequirements);

  // Real-time location broadcasting state
  const [pingingLocation, setPingingLocation] = useState(false);

  // Register Business State
  const [bizName, setBizName] = useState('');
  const [bizDesc, setBizDesc] = useState('');
  const [bizCatId, setBizCatId] = useState<number>(activeCategories[0]?.id || categories[0]?.id || 1);
  const [licenseNumber, setLicenseNumber] = useState('');
  const [contactPhone, setContactPhone] = useState(dbUser?.phoneNumber || '');
  const [bizEmail, setBizEmail] = useState('');
  const [subCity, setSubCity] = useState(ADDIS_SUB_CITIES[0].name);
  const [landmark, setLandmark] = useState('');
  const [bizLat, setBizLat] = useState<number>(ADDIS_SUB_CITIES[0].lat);
  const [bizLng, setBizLng] = useState<number>(ADDIS_SUB_CITIES[0].lng);
  const [bizLiveActive, setBizLiveActive] = useState(true);

  // Publish Listing State
  const [selectedBizId, setSelectedBizId] = useState<number>(0);
  const [listingCategoryId, setListingCategoryId] = useState<number>(
    activeCategories[0]?.id || categories[0]?.id || 1
  );
  const [listingType, setListingType] = useState(
    activeCategories[0]?.defaultListingType || 'PRODUCT'
  );
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [pricingModel, setPricingModel] = useState('FIXED');
  const [pricingUnit, setPricingUnit] = useState('item');
  const [basePrice, setBasePrice] = useState<string>('');
  const [discountPrice, setDiscountPrice] = useState<string>('');
  const [calloutFee, setCalloutFee] = useState<string>('');
  const [depositAmount, setDepositAmount] = useState<string>('');
  const [publishStatus, setPublishStatus] = useState<'ACTIVE' | 'DRAFT'>('ACTIVE');
  const [productImages, setProductImages] = useState<string[]>([]);
  const [imageUrlInput, setImageUrlInput] = useState('');
  const [companyLogoUrl, setCompanyLogoUrl] = useState('');
  const [cvUrl, setCvUrl] = useState('');
  const [cvFileName, setCvFileName] = useState('');
  const [introVideoUrl, setIntroVideoUrl] = useState('');
  const [mediaBusy, setMediaBusy] = useState(false);
  const [validationError, setValidationError] = useState<string | null>(null);
  const [validationSuccess, setValidationSuccess] = useState<string | null>(null);

  // Peer QR Vouch & Role-Based Approvals state
  const [voucherEligibility, setVoucherEligibility] = useState<{
    eligible: boolean;
    reason?: string;
    accountAgeDays: number;
    exceptional: boolean;
  } | null>(null);
  const [qrInputToken, setQrInputToken] = useState('');
  const [scanningCamera, setScanningCamera] = useState(false);
  const [vouchResult, setVouchResult] = useState<{
    fullName: string;
    status: string;
    vouchedByName: string;
  } | null>(null);
  const [vouchError, setVouchError] = useState<string | null>(null);
  const [vouchSubmitting, setVouchSubmitting] = useState(false);
  const qrScannerRef = useRef<Html5Qrcode | null>(null);

  const [approvalsQueue, setApprovalsQueue] = useState<ProviderRegistration[]>([]);
  const [loadingApprovals, setLoadingApprovals] = useState(false);
  const [approvalNotes, setApprovalNotes] = useState<Record<number, string>>({});
  const [inspectDocModal, setInspectDocModal] = useState<{ title: string; url: string } | null>(null);

  const canApproveProviders = Boolean(
    isAdmin || dbUser?.roles?.some((r) => governance.allowedApproverRoles.includes(r))
  );

  const loadPortalData = async () => {
    if (!firebaseUser) return;
    try {
      const [portalRes, meRes] = await Promise.all([
        authFetch('/api/v1/business/portal'),
        authFetch('/api/v1/auth/me'),
      ]);
      if (portalRes.ok) {
        const data = await portalRes.json();
        setOwnedBusinesses(data.ownedBusinesses || []);
        setOrders(data.orders || []);
        setBookings(data.bookings || []);
        setApplications(data.applications || []);
        setCommissions(data.commissions || []);
        setProviderReg(data.providerRegistration || null);
        if (data.documentRequirements) {
          setPortalReqs(data.documentRequirements);
        }
      }
      if (meRes.ok) {
        const meData = await meRes.json();
        if (meData.voucherEligibility) {
          setVoucherEligibility(meData.voucherEligibility);
        }
      }
    } catch (err) {
      console.error(err);
    }
  };

  const loadApprovalsQueue = async () => {
    if (!firebaseUser || !canApproveProviders) return;
    setLoadingApprovals(true);
    try {
      const res = await authFetch('/api/v1/provider/approvals');
      if (res.ok) {
        const data = await res.json();
        setApprovalsQueue(data.registrations || []);
      }
    } catch (err) {
      console.error(err);
    } finally {
      setLoadingApprovals(false);
    }
  };

  useEffect(() => {
    setTab(initialTab);
  }, [initialTab]);

  useEffect(() => {
    setPortalReqs(documentRequirements);
  }, [documentRequirements]);

  useEffect(() => {
    if (firebaseUser) loadPortalData();
  }, [firebaseUser]);

  useEffect(() => {
    if (firebaseUser && tab === 'APPROVALS' && canApproveProviders) {
      loadApprovalsQueue();
    }
  }, [firebaseUser, tab, canApproveProviders]);

  useEffect(() => {
    if (tab !== 'PEER_VOUCH' && qrScannerRef.current) {
      qrScannerRef.current.stop().catch(() => {});
      qrScannerRef.current = null;
      setScanningCamera(false);
    }
    return () => {
      if (qrScannerRef.current) {
        qrScannerRef.current.stop().catch(() => {});
        qrScannerRef.current = null;
      }
    };
  }, [tab]);

  useEffect(() => {
    if (ownedBusinesses.length > 0 && !ownedBusinesses.some((b) => b.id === selectedBizId)) {
      const firstBiz = ownedBusinesses[0];
      setSelectedBizId(firstBiz.id);
      setListingCategoryId(firstBiz.categoryId);
      const matchedCat = categories.find((c) => c.id === firstBiz.categoryId);
      if (matchedCat?.defaultListingType) {
        setListingType(matchedCat.defaultListingType);
      }
    }
  }, [ownedBusinesses, categories, selectedBizId]);

  useEffect(() => {
    const pool = activeCategories.length > 0 ? activeCategories : categories;
    if (pool.length > 0 && !pool.some((c) => c.id === bizCatId)) {
      setBizCatId(pool[0].id);
    }
    if (pool.length > 0 && !pool.some((c) => c.id === listingCategoryId)) {
      setListingCategoryId(pool[0].id);
      if (pool[0].defaultListingType) {
        setListingType(pool[0].defaultListingType);
      }
    }
  }, [activeCategories, categories, bizCatId, listingCategoryId]);

  const handleBroadcastLiveLocation = () => {
    if (!navigator.geolocation) {
      onNotify('Browser geolocation is unavailable in this environment.');
      return;
    }
    setPingingLocation(true);
    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        try {
          const lat = Number(pos.coords.latitude.toFixed(6));
          const lng = Number(pos.coords.longitude.toFixed(6));
          const res = await authFetch('/api/v1/provider/location', {
            method: 'POST',
            body: JSON.stringify({ latitude: lat, longitude: lng, isLiveLocationActive: true }),
          });
          if (res.ok) {
            onNotify(`Real-time service GPS broadcast updated (${lat.toFixed(5)}, ${lng.toFixed(5)}).`);
            loadPortalData();
            onRefreshCatalog();
          }
        } finally {
          setPingingLocation(false);
        }
      },
      () => {
        setPingingLocation(false);
        onNotify('Unable to read device GPS. Use the interactive map pin inside KYC or Business Registration.');
      },
      { enableHighAccuracy: true, timeout: 8000 }
    );
  };

  const handleRegisterBusiness = async (e: React.FormEvent) => {
    e.preventDefault();
    const res = await authFetch('/api/v1/businesses', {
      method: 'POST',
      body: JSON.stringify({
        businessName: bizName,
        description: bizDesc,
        categoryId: bizCatId,
        licenseNumber,
        contactPhone,
        email: bizEmail || firebaseUser?.email || 'owner@business.et',
        subCity,
        landmark,
        latitude: String(bizLat),
        longitude: String(bizLng),
        liveLocationActive: bizLiveActive,
      }),
    });
    const data = await res.json();
    if (res.ok) {
      onNotify(
        `Business "${data.businessName}" registered with live coordinates (Status: ${data.verificationStatus}).`
      );
      setBizName('');
      setBizDesc('');
      setLicenseNumber('');
      setLandmark('');
      await refreshProfile();
      await loadPortalData();
      onRefreshCatalog();
      setTab('CATALOG');
    } else {
      onNotify(data.error || 'Failed to register business.');
    }
  };

  const isJobMode = listingType === 'JOB';
  const isWorkforceMode = ['SERVICE', 'HEALTHCARE', 'EDUCATION', 'TRANSPORT', 'EVENT'].includes(
    listingType
  );
  const isProductMode = !isJobMode && !isWorkforceMode;

  const handleUploadProductImages = async (files: FileList | null) => {
    if (!files || files.length === 0) return;
    setValidationError(null);
    const remaining = MAX_PRODUCT_IMAGES - productImages.length;
    if (remaining <= 0) {
      setValidationError(`Maximum ${MAX_PRODUCT_IMAGES} images allowed per product.`);
      return;
    }
    const chosen = Array.from(files).slice(0, remaining);
    if (files.length > remaining) {
      setValidationError(
        `Only ${remaining} more image slot(s) available (max ${MAX_PRODUCT_IMAGES} per listing).`
      );
    }
    setMediaBusy(true);
    try {
      const compressed = await Promise.all(chosen.map((f) => compressImageFile(f)));
      setProductImages((prev) => {
        const next = [...prev];
        compressed.forEach((url) => {
          if (next.length < MAX_PRODUCT_IMAGES && !next.includes(url)) {
            next.push(url);
          }
        });
        return next;
      });
    } catch (err: unknown) {
      setValidationError(err instanceof Error ? err.message : 'Failed to process selected image(s).');
    } finally {
      setMediaBusy(false);
    }
  };

  const handleAddProductImageUrl = () => {
    setValidationError(null);
    const trimmed = imageUrlInput.trim();
    if (!trimmed) return;
    if (productImages.length >= MAX_PRODUCT_IMAGES) {
      setValidationError(`Maximum ${MAX_PRODUCT_IMAGES} images allowed per listing.`);
      return;
    }
    if (!productImages.includes(trimmed)) {
      setProductImages((prev) => [...prev, trimmed]);
    }
    setImageUrlInput('');
  };

  const handleUploadCompanyLogo = async (files: FileList | null) => {
    if (!files || files.length === 0) return;
    setValidationError(null);
    setMediaBusy(true);
    try {
      const compressed = await compressImageFile(files[0], 600, 0.85);
      setCompanyLogoUrl(compressed);
    } catch (err: unknown) {
      setValidationError(err instanceof Error ? err.message : 'Failed to process company logo.');
    } finally {
      setMediaBusy(false);
    }
  };

  const handleUploadCvFile = async (files: FileList | null) => {
    if (!files || files.length === 0) return;
    setValidationError(null);
    setMediaBusy(true);
    try {
      const file = files[0];
      const dataUrl = await readFileAsDataUrl(file, 3 * 1024 * 1024);
      setCvUrl(dataUrl);
      setCvFileName(file.name);
    } catch (err: unknown) {
      setValidationError(err instanceof Error ? err.message : 'Failed to upload CV document.');
    } finally {
      setMediaBusy(false);
    }
  };

  const handlePublishListing = async (e: React.FormEvent) => {
    e.preventDefault();
    setValidationError(null);
    setValidationSuccess(null);

    if (!selectedBizId) {
      setValidationError('Register and verify a business profile before publishing listings.');
      return;
    }

    if (productImages.length > MAX_PRODUCT_IMAGES) {
      setValidationError(`Maximum ${MAX_PRODUCT_IMAGES} images allowed per product listing.`);
      return;
    }

    if (introVideoUrl.trim() && !extractYouTubeVideoId(introVideoUrl.trim())) {
      setValidationError('Please enter a valid YouTube video URL (youtube.com or youtu.be) for your intro video.');
      return;
    }

    const parsedPrice = Number(basePrice);
    const metadataPayload: ListingMetadata = {};
    if (isJobMode && companyLogoUrl.trim()) {
      metadataPayload.companyLogoUrl = companyLogoUrl.trim();
    }
    if (isWorkforceMode) {
      if (cvUrl.trim()) {
        metadataPayload.cvUrl = cvUrl.trim();
        metadataPayload.cvFileName = cvFileName || 'CV-Document';
      }
      if (introVideoUrl.trim()) {
        metadataPayload.introVideoUrl = introVideoUrl.trim();
      }
    }

    const finalImages = isJobMode ? [] : productImages.slice(0, MAX_PRODUCT_IMAGES);
    const primaryImage = finalImages[0] || (isJobMode && companyLogoUrl.trim() ? companyLogoUrl.trim() : null);

    const res = await authFetch('/api/v1/listings', {
      method: 'POST',
      body: JSON.stringify({
        businessId: selectedBizId,
        categoryId: listingCategoryId,
        listingType,
        title,
        description,
        imageUrl: primaryImage,
        imageUrls: finalImages,
        pricingModel,
        pricingUnit,
        basePrice: Number.isNaN(parsedPrice) ? 0 : parsedPrice,
        discountPrice: discountPrice ? Number(discountPrice) : null,
        calloutFee: calloutFee ? Number(calloutFee) : null,
        depositAmount: depositAmount ? Number(depositAmount) : null,
        currency: 'ETB',
        pricingFormula:
          pricingModel === 'CALCULATED'
            ? {
                baseFee: parsedPrice,
                perKmRate: 80,
                factors: [`Base: ${parsedPrice} ETB`, 'Distance: 80 ETB/km'],
              }
            : null,
        metadata: Object.keys(metadataPayload).length > 0 ? metadataPayload : null,
        status: publishStatus,
      }),
    });

    const data = await res.json();
    if (!res.ok) {
      setValidationError(data.error || 'Mandatory pricing validation rejected this listing.');
      return;
    }

    setValidationSuccess(
      `Published "${data.title}" at ${formatEtb(data.basePrice)} / ${data.pricingUnit}.`
    );
    setTitle('');
    setDescription('');
    setProductImages([]);
    setImageUrlInput('');
    setCompanyLogoUrl('');
    setCvUrl('');
    setCvFileName('');
    setIntroVideoUrl('');
    onRefreshCatalog();
  };

  const handleUpdateOrderStatus = async (orderId: number, orderStatus: string) => {
    const res = await authFetch(`/api/v1/orders/${orderId}/status`, {
      method: 'POST',
      body: JSON.stringify({ orderStatus }),
    });
    if (res.ok) {
      onNotify(`Order status updated to ${orderStatus}.`);
      loadPortalData();
    }
  };

  const handleUpdateBooking = async (bookingId: number, patch: Record<string, unknown>) => {
    const res = await authFetch(`/api/v1/bookings/${bookingId}/status`, {
      method: 'POST',
      body: JSON.stringify(patch),
    });
    if (res.ok) {
      onNotify('Booking updated.');
      loadPortalData();
    }
  };

  const handleUpdateApplication = async (appId: number, applicationStatus: string) => {
    const res = await authFetch(`/api/v1/applications/${appId}/status`, {
      method: 'POST',
      body: JSON.stringify({ applicationStatus }),
    });
    if (res.ok) {
      onNotify(`Applicant status updated to ${applicationStatus}.`);
      loadPortalData();
    }
  };

  const handleSubmitQrToken = async (rawToken: string) => {
    if (!rawToken.trim()) return;
    setVouchSubmitting(true);
    setVouchError(null);
    setVouchResult(null);
    try {
      const res = await authFetch('/api/v1/provider/vouch-scan', {
        method: 'POST',
        body: JSON.stringify({ token: rawToken.trim() }),
      });
      const data = await res.json();
      if (!res.ok) {
        setVouchError(data.error || 'Peer QR authentication failed.');
        return;
      }
      setVouchResult(data.registration);
      setQrInputToken('');
      onNotify(
        `Peer authenticated "${data.registration?.fullName}". KYC forwarded to Approvers!`
      );
      if (qrScannerRef.current) {
        qrScannerRef.current.stop().catch(() => {});
        qrScannerRef.current = null;
        setScanningCamera(false);
      }
    } catch (err: unknown) {
      setVouchError(err instanceof Error ? err.message : 'Failed to process QR code.');
    } finally {
      setVouchSubmitting(false);
    }
  };

  const handleToggleQrScanner = async () => {
    if (scanningCamera && qrScannerRef.current) {
      await qrScannerRef.current.stop().catch(() => {});
      qrScannerRef.current = null;
      setScanningCamera(false);
      return;
    }
    setVouchError(null);
    try {
      setScanningCamera(true);
      setTimeout(async () => {
        try {
          const scanner = new Html5Qrcode('ny-qr-reader');
          qrScannerRef.current = scanner;
          await scanner.start(
            { facingMode: 'environment' },
            { fps: 10, qrbox: { width: 220, height: 220 } },
            (decodedText) => {
              handleSubmitQrToken(decodedText);
            },
            () => {}
          );
        } catch (err: unknown) {
          setScanningCamera(false);
          setVouchError(
            err instanceof Error
              ? err.message
              : 'Camera QR scanner unavailable; paste token manually below.'
          );
        }
      }, 60);
    } catch {
      setScanningCamera(false);
    }
  };

  const handleApproveRejectReg = async (
    regId: number,
    status: 'VERIFIED' | 'REJECTED' | 'REVOKED'
  ) => {
    const res = await authFetch(`/api/v1/providers/${regId}/approve`, {
      method: 'POST',
      body: JSON.stringify({
        status,
        reviewNotes: approvalNotes[regId] || undefined,
      }),
    });
    const data = await res.json();
    if (res.ok) {
      onNotify(
        status === 'REVOKED'
          ? `Provider authority revoked for registration #${regId}.`
          : `Provider registration #${regId} marked ${status}.`
      );
      loadApprovalsQueue();
      loadPortalData();
      onRefreshCatalog();
    } else {
      onNotify(data.error || 'Approval action failed.');
    }
  };

  const handleToggleAvailability = async (listing: Listing) => {
    const next = listing.availabilityStatus === 'AVAILABLE' ? 'UNAVAILABLE' : 'AVAILABLE';
    const res = await authFetch(`/api/v1/listings/${listing.id}/availability`, {
      method: 'PATCH',
      body: JSON.stringify({ availabilityStatus: next }),
    });
    if (res.ok) {
      onNotify(`"${listing.title}" marked ${next}.`);
      onRefreshCatalog();
    }
  };

  const totalGross = commissions.reduce((s, c) => s + Number(c.grossAmount), 0);
  const totalNet = commissions.reduce((s, c) => s + Number(c.providerAmount), 0);
  const ownedBusinessIds = new Set(ownedBusinesses.map((b) => b.id));
  const portalListings = listings.filter((l) => ownedBusinessIds.has(l.businessId));
  const isKycVerified =
    providerReg?.status === 'VERIFIED' || dbUser?.providerVerificationStatus === 'VERIFIED';
  const isProviderVerified = isKycVerified || Boolean(dbUser?.isAdmin);

  useEffect(() => {
    if (isKycVerified && tab === 'PROVIDER_KYC') {
      setTab(ownedBusinesses.length > 0 ? 'CATALOG' : 'REGISTER');
    }
  }, [isKycVerified, tab, ownedBusinesses.length]);

  if (!firebaseUser) {
    return (
      <div className="mx-auto max-w-2xl px-4 sm:px-6 py-20 text-center">
        <h1 className="font-display text-2xl font-bold text-[#172B3A]">
          Become a Service Provider & Business Portal
        </h1>
        <p className="mt-2 text-sm text-[#172B3A]/70">
          Sign in or create an account to self-register as a verified service provider using your
          Fayda ID, complete the live Alive camera check, upload required service documents, and pin
          your real-time location.
        </p>
        <div className="mt-6 flex flex-wrap items-center justify-center gap-3">
          <button
            type="button"
            onClick={() => openAuthModal('signin')}
            className="min-h-[44px] rounded-lg border border-[#172B3A]/20 bg-white px-6 py-3 text-sm font-semibold text-[#172B3A] hover:bg-[#F4F6F5]"
          >
            Sign In
          </button>
          <button
            type="button"
            onClick={() => openAuthModal('signup')}
            className="min-h-[44px] rounded-lg bg-[#176B52] px-6 py-3 text-sm font-semibold text-white hover:bg-[#125641]"
          >
            Sign Up as Provider
          </button>
        </div>
      </div>
    );
  }

  const portalTabs: Array<{ id: BusinessPortalTab; label: string }> = [
    ...(!isKycVerified ? [{ id: 'PROVIDER_KYC' as BusinessPortalTab, label: 'Provider KYC & QR' }] : []),
    { id: 'PEER_VOUCH', label: 'Authenticate Peer (Scan QR)' },
    ...(canApproveProviders
      ? [{ id: 'APPROVALS' as BusinessPortalTab, label: `Provider Approvals` }]
      : []),
    { id: 'REGISTER', label: 'Register Business' },
    { id: 'CATALOG', label: 'Catalog & Pricing' },
    { id: 'ORDERS', label: `Orders (${orders.length})` },
    { id: 'BOOKINGS', label: `Bookings (${bookings.length})` },
    { id: 'RECRUITMENT', label: `Applicants (${applications.length})` },
  ];

  return (
    <div className="mx-auto max-w-[1440px] space-y-6 px-4 sm:px-6 py-6 sm:py-8">
      <div className="flex flex-col gap-4 border-b border-[#172B3A]/10 pb-6">
        <div>
          <h1 className="font-display text-2xl sm:text-3xl font-bold text-[#172B3A]">
            Provider Onboarding & Business Portal
          </h1>
          <p className="mt-1 text-sm text-[#172B3A]/70">
            Self-register with Fayda ID + Alive Check + Service Documents + 10-min Peer QR
            Authentication, then publish services with upfront ETB pricing.
          </p>
        </div>

        <div className="flex items-center gap-1.5 overflow-x-auto rounded-lg border border-[#172B3A]/10 bg-white p-1.5">
          {portalTabs.map((t) => (
            <button
              key={t.id}
              type="button"
              onClick={() => setTab(t.id)}
              className={`min-h-[42px] rounded-md px-3 py-2 text-xs font-semibold whitespace-nowrap shrink-0 ${
                tab === t.id ? 'bg-[#176B52] text-white' : 'text-[#172B3A]/75 hover:text-[#172B3A]'
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>
      </div>

      {/* Real-Time Provider GPS & KYC Status Bar */}
      <div className="flex flex-wrap items-center justify-between gap-4 rounded-xl border border-[#172B3A]/10 bg-white px-5 py-3.5 text-xs">
        <div className="flex flex-wrap items-center gap-3">
          <span className="inline-flex items-center gap-1.5 font-semibold text-[#172B3A]">
            <ShieldCheck className="h-4 w-4 text-[#176B52]" />
            Provider KYC:{' '}
            <span className="text-[#176B52]">
              {providerReg?.status || dbUser?.providerVerificationStatus || 'UNREGISTERED'}
            </span>
          </span>
          {providerReg && (
            <>
              <span className="text-[#172B3A]/35">·</span>
              <span className="inline-flex items-center gap-1 font-mono text-[#172B3A]/75">
                <Radio className="h-3.5 w-3.5 text-[#176B52]" />
                Live Pin: {Number(providerReg.latitude).toFixed(5)},{' '}
                {Number(providerReg.longitude).toFixed(5)} (Updated{' '}
                {new Date(providerReg.lastLocationUpdatedAt).toLocaleTimeString()})
              </span>
            </>
          )}
        </div>

        <button
          type="button"
          disabled={pingingLocation}
          onClick={handleBroadcastLiveLocation}
          className="inline-flex items-center gap-1.5 rounded-lg border border-[#176B52]/35 bg-emerald-50/70 px-3 py-1.5 font-semibold text-[#176B52] hover:bg-emerald-100/80 disabled:opacity-50"
        >
          <Navigation className="h-3.5 w-3.5" />
          {pingingLocation ? 'Syncing GPS...' : 'Broadcast Real-Time GPS Now'}
        </button>
      </div>

      {/* Revenue & Settlement Strip */}
      <div className="grid gap-4 sm:grid-cols-4">
        <div className="rounded-xl border border-[#172B3A]/10 bg-white p-5">
          <p className="text-xs text-[#172B3A]/60">My Businesses</p>
          <p className="mt-1 font-mono text-2xl font-bold tabular-nums text-[#172B3A]">
            {ownedBusinesses.length}
          </p>
        </div>
        <div className="rounded-xl border border-[#172B3A]/10 bg-white p-5">
          <p className="text-xs text-[#172B3A]/60">My Catalog Listings</p>
          <p className="mt-1 font-mono text-2xl font-bold tabular-nums text-[#172B3A]">
            {portalListings.length}
          </p>
        </div>
        <div className="rounded-xl border border-[#172B3A]/10 bg-white p-5">
          <p className="text-xs text-[#172B3A]/60">Gross Merchant Volume</p>
          <p className="mt-1 font-mono text-2xl font-bold tabular-nums text-[#172B3A]">
            {formatEtb(totalGross)}
          </p>
        </div>
        <div className="rounded-xl border border-[#172B3A]/10 bg-white p-5">
          <p className="text-xs text-[#172B3A]/60">Net Provider Settlement</p>
          <p className="mt-1 font-mono text-2xl font-bold tabular-nums text-[#176B52]">
            {formatEtb(totalNet)}
          </p>
        </div>
      </div>

      {tab === 'PROVIDER_KYC' && (
        <ProviderOnboardingWizard
          categories={categories}
          requirements={portalReqs}
          existingRegistration={providerReg}
          governance={governance}
          language={language}
          onSuccess={async () => {
            await refreshProfile();
            await loadPortalData();
            onRefreshCatalog();
          }}
          onNotify={onNotify}
        />
      )}

      {tab === 'PEER_VOUCH' && (
        <div className="grid gap-6 lg:grid-cols-12">
          <div className="space-y-4 rounded-2xl border border-[#172B3A]/10 bg-white p-5 sm:p-6 lg:col-span-6">
            <div className="border-b border-[#172B3A]/10 pb-3">
              <h2 className="flex items-center gap-2 font-display text-lg font-bold text-[#172B3A]">
                <QrCode className="h-5 w-5 text-[#176B52]" />
                Authenticate New Service Provider (Scan 10-Min QR)
              </h2>
              <p className="mt-1 text-xs text-[#172B3A]/65">
                Active users registered for at least{' '}
                <strong>{governance.minAccountAgeDays} days (~1 month)</strong> (or holding an
                Admin-configured early voucher role) can vouch for a joining provider via their
                10-minute QR voucher.
              </p>
            </div>

            {voucherEligibility && (
              <div
                className={`rounded-xl border p-4 text-xs space-y-1 ${
                  voucherEligibility.eligible
                    ? 'border-[#176B52]/30 bg-emerald-50/70 text-[#172B3A]'
                    : 'border-amber-200 bg-amber-50 text-amber-950'
                }`}
              >
                <p className="font-semibold flex items-center gap-1.5">
                  <Clock className="h-3.5 w-3.5 text-[#176B52]" />
                  {voucherEligibility.eligible
                    ? voucherEligibility.exceptional
                      ? 'Eligible (Admin Exceptional Early Voucher Role Active)'
                      : `Eligible (${voucherEligibility.accountAgeDays} days tenure >= ${governance.minAccountAgeDays} days)`
                    : 'Not Yet Eligible to Vouch'}
                </p>
                {voucherEligibility.reason && (
                  <p className="text-[11px] opacity-85">{voucherEligibility.reason}</p>
                )}
              </div>
            )}

            <div className="space-y-3">
              <button
                type="button"
                onClick={handleToggleQrScanner}
                className="inline-flex min-h-[44px] w-full items-center justify-center gap-2 rounded-xl bg-[#176B52] px-4 py-2.5 text-xs font-semibold text-white hover:bg-[#125641]"
              >
                <Camera className="h-4 w-4" />
                {scanningCamera ? 'Stop QR Camera Scanner' : 'Open Camera to Scan Provider QR'}
              </button>

              {scanningCamera && (
                <div
                  id="ny-qr-reader"
                  className="overflow-hidden rounded-xl border border-[#172B3A]/15 bg-[#172B3A]"
                />
              )}
            </div>
          </div>

          <div className="space-y-4 rounded-2xl border border-[#172B3A]/10 bg-white p-5 sm:p-6 lg:col-span-6">
            <div className="border-b border-[#172B3A]/10 pb-3">
              <h3 className="font-display text-base font-bold text-[#172B3A]">
                Or Paste Provider QR Token Directly
              </h3>
              <p className="mt-1 text-xs text-[#172B3A]/65">
                If scanning from another screen or without a camera, paste the applicant&apos;s{' '}
                <span className="font-mono">NY-VOUCH-...</span> code before the 10-minute timer
                expires.
              </p>
            </div>

            <form
              onSubmit={(e) => {
                e.preventDefault();
                handleSubmitQrToken(qrInputToken);
              }}
              className="space-y-3"
            >
              <input
                type="text"
                required
                value={qrInputToken}
                onChange={(e) => setQrInputToken(e.target.value)}
                placeholder="Paste NY-VOUCH-... token or JSON QR payload"
                className="h-11 w-full rounded-lg border border-[#172B3A]/15 bg-[#F4F6F5] px-3 font-mono text-xs"
              />
              <button
                type="submit"
                disabled={vouchSubmitting}
                className="min-h-[44px] w-full rounded-lg bg-[#172B3A] px-4 py-2.5 text-xs font-semibold text-white hover:bg-[#172B3A]/90 disabled:opacity-50"
              >
                {vouchSubmitting
                  ? 'Verifying Eligibility & QR...'
                  : 'Authenticate Provider & Forward for Final Approval'}
              </button>
            </form>

            {vouchError && (
              <div className="flex items-start gap-2 rounded-xl border border-red-200 bg-red-50 p-3.5 text-xs text-red-800">
                <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" />
                <span>{vouchError}</span>
              </div>
            )}

            {vouchResult && (
              <div className="flex items-start gap-2 rounded-xl border border-[#176B52]/30 bg-emerald-50 p-4 text-xs text-[#172B3A]">
                <CheckCircle2 className="h-4 w-4 shrink-0 mt-0.5 text-[#176B52]" />
                <div>
                  <p className="font-bold text-[#176B52]">Peer Authentication Recorded</p>
                  <p className="mt-1">
                    <strong>{vouchResult.fullName}</strong> is now{' '}
                    <span className="font-mono font-bold">{vouchResult.status}</span> (vouched by{' '}
                    {vouchResult.vouchedByName}). Authorized Approvers can now inspect final data
                    and approve activation.
                  </p>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {tab === 'APPROVALS' && canApproveProviders && (
        <div className="space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-[#172B3A]/10 bg-white p-4 text-xs">
            <div>
              <h2 className="font-display text-base font-bold text-[#172B3A]">
                Role-Gated Final Provider Approvals Queue ({approvalsQueue.length})
              </h2>
              <p className="text-[#172B3A]/65">
                Final applicant KYC data is visible here only after peer QR authentication
                succeeds (or first-user Admin bootstrap).
              </p>
            </div>
            <button
              type="button"
              onClick={loadApprovalsQueue}
              className="min-h-[40px] rounded-lg border border-[#172B3A]/15 px-3 py-1.5 font-semibold text-[#172B3A] hover:bg-[#F4F6F5]"
            >
              Refresh Queue
            </button>
          </div>

          {loadingApprovals ? (
            <div className="rounded-xl border border-[#172B3A]/10 bg-white p-10 text-center text-xs text-[#172B3A]/60">
              Loading peer-authenticated provider registrations...
            </div>
          ) : approvalsQueue.length === 0 ? (
            <div className="rounded-xl border border-[#172B3A]/10 bg-white p-10 text-center text-xs text-[#172B3A]/60">
              No provider registrations are currently awaiting final role approval.
            </div>
          ) : (
            approvalsQueue.map((reg) => {
              const cat = categories.find((c) => c.id === reg.serviceCategoryId);
              return (
                <div
                  key={reg.id}
                  className="space-y-4 rounded-2xl border border-[#172B3A]/10 bg-white p-5 text-xs"
                >
                  <div className="flex flex-col gap-4 border-b border-[#172B3A]/10 pb-4 md:flex-row md:items-start md:justify-between">
                    <div className="space-y-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="font-display text-lg font-bold text-[#172B3A]">
                          {reg.fullName}
                        </span>
                        <span className="font-semibold text-[#176B52]">
                          · {cat?.name || `Category #${reg.serviceCategoryId}`}
                        </span>
                        <span className="rounded bg-[#F4F6F5] px-2 py-0.5 font-mono font-bold text-[#172B3A]">
                          {reg.status}
                        </span>
                      </div>
                      <p className="font-mono text-[#172B3A]/75">
                        Fayda: {reg.faydaIdNumber} · Phone: {reg.phoneNumber} · Alive:{' '}
                        {reg.livenessScore}%
                      </p>
                      <p className="flex items-center gap-1 text-[#172B3A]/70">
                        <MapPin className="h-3.5 w-3.5 text-[#176B52]" />
                        {reg.subCity}, {reg.landmark} ({Number(reg.latitude).toFixed(4)},{' '}
                        {Number(reg.longitude).toFixed(4)})
                      </p>
                      {reg.vouchedByName && (
                        <p className="font-medium text-[#176B52]">
                          ✓ Vouched via QR by {reg.vouchedByName} ({reg.vouchedByEmail})
                        </p>
                      )}
                    </div>

                    <div className="flex flex-wrap items-center gap-2">
                      <input
                        type="text"
                        value={approvalNotes[reg.id] || ''}
                        onChange={(e) =>
                          setApprovalNotes((prev) => ({ ...prev, [reg.id]: e.target.value }))
                        }
                        placeholder={
                          reg.status === 'VERIFIED'
                            ? 'Optional revocation reason...'
                            : 'Optional approval note...'
                        }
                        className="h-10 rounded-lg border border-[#172B3A]/15 px-3 text-xs"
                      />
                      {reg.status === 'VERIFIED' ? (
                        <>
                          <span className="inline-flex min-h-[42px] items-center gap-1.5 rounded-lg border border-[#176B52]/30 bg-emerald-50 px-3.5 py-2 font-semibold text-[#176B52]">
                            <CheckCircle2 className="h-3.5 w-3.5" />
                            Verified Provider
                          </span>
                          <button
                            type="button"
                            onClick={() => handleApproveRejectReg(reg.id, 'REVOKED')}
                            className="inline-flex min-h-[42px] items-center gap-1.5 rounded-lg border border-red-300 bg-red-50 px-4 py-2 font-semibold text-red-700 hover:bg-red-100"
                          >
                            <ShieldOff className="h-3.5 w-3.5" />
                            Revoke Authority
                          </button>
                        </>
                      ) : reg.status === 'REJECTED' || reg.status === 'REVOKED' ? (
                        <>
                          <span className="inline-flex min-h-[42px] items-center rounded-lg border border-red-200 bg-red-50 px-3 py-2 font-semibold text-red-700">
                            {reg.status === 'REVOKED' ? 'Authority Revoked' : 'Rejected'}
                          </span>
                          <button
                            type="button"
                            onClick={() => handleApproveRejectReg(reg.id, 'VERIFIED')}
                            className="inline-flex min-h-[42px] items-center gap-1.5 rounded-lg bg-[#176B52] px-4 py-2 font-semibold text-white hover:bg-[#125641]"
                          >
                            <CheckCircle2 className="h-3.5 w-3.5" />
                            Re-Approve Provider
                          </button>
                        </>
                      ) : (
                        <>
                          <button
                            type="button"
                            onClick={() => handleApproveRejectReg(reg.id, 'VERIFIED')}
                            className="inline-flex min-h-[42px] items-center gap-1.5 rounded-lg bg-[#176B52] px-4 py-2 font-semibold text-white hover:bg-[#125641]"
                          >
                            <CheckCircle2 className="h-3.5 w-3.5" />
                            Approve Provider
                          </button>
                          <button
                            type="button"
                            onClick={() => handleApproveRejectReg(reg.id, 'REJECTED')}
                            className="min-h-[42px] rounded-lg border border-red-200 px-4 py-2 font-semibold text-red-700 hover:bg-red-50"
                          >
                            Reject
                          </button>
                        </>
                      )}
                    </div>
                  </div>

                  <div className="grid gap-3 sm:grid-cols-3">
                    {reg.faydaFrontImage && (
                      <img
                        src={reg.faydaFrontImage}
                        alt="Fayda ID"
                        onClick={() =>
                          setInspectDocModal({ title: `${reg.fullName} — Fayda ID`, url: reg.faydaFrontImage! })
                        }
                        className="h-28 w-full cursor-pointer rounded-lg border border-[#172B3A]/10 object-cover"
                      />
                    )}
                    {reg.profilePhotoImage && (
                      <img
                        src={reg.profilePhotoImage}
                        alt="Portrait"
                        onClick={() =>
                          setInspectDocModal({ title: `${reg.fullName} — Portrait`, url: reg.profilePhotoImage! })
                        }
                        className="h-28 w-full cursor-pointer rounded-lg border border-[#172B3A]/10 object-cover"
                      />
                    )}
                    {reg.livenessSelfieImage && (
                      <img
                        src={reg.livenessSelfieImage}
                        alt="Alive Frame"
                        onClick={() =>
                          setInspectDocModal({ title: `${reg.fullName} — Alive Frame`, url: reg.livenessSelfieImage! })
                        }
                        className="h-28 w-full cursor-pointer rounded-lg border border-[#176B52]/30 object-cover"
                      />
                    )}
                  </div>

                  {(reg.documents || []).length > 0 && (
                    <div className="grid gap-2 sm:grid-cols-3">
                      {(reg.documents || []).map((doc) => (
                        <button
                          key={doc.id}
                          type="button"
                          onClick={() => setInspectDocModal({ title: doc.documentName, url: doc.fileDataUrl })}
                          className="flex min-h-[42px] items-center justify-between gap-2 rounded-lg border border-[#172B3A]/10 bg-[#F4F6F5] px-3 py-2 text-left hover:bg-white"
                        >
                          <span className="truncate font-semibold text-[#172B3A]">{doc.documentName}</span>
                          <FileText className="h-3.5 w-3.5 shrink-0 text-[#176B52]" />
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              );
            })
          )}
        </div>
      )}

      {tab === 'CATALOG' && (
        <div className="grid gap-8 lg:grid-cols-12">
          <form
            onSubmit={handlePublishListing}
            className="space-y-4 rounded-2xl border border-[#172B3A]/10 bg-white p-6 lg:col-span-5"
          >
            <div className="border-b border-[#172B3A]/10 pb-3">
              <h2 className="flex items-center gap-2 font-display text-lg font-semibold text-[#172B3A]">
                <Plus className="h-4 w-4 text-[#176B52]" />
                Publish Listing (Mandatory Pricing Engine)
              </h2>
              <p className="mt-0.5 text-xs text-[#172B3A]/60">
                Only approved businesses with upfront ETB pricing can publish active services.
              </p>
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <label className="block text-xs font-medium text-[#172B3A]/75">Business Profile</label>
                <select
                  value={selectedBizId}
                  onChange={(e) => {
                    const nextId = Number(e.target.value);
                    setSelectedBizId(nextId);
                    const picked = ownedBusinesses.find((b) => b.id === nextId);
                    if (picked) {
                      setListingCategoryId(picked.categoryId);
                      const cat = categories.find((c) => c.id === picked.categoryId);
                      if (cat?.defaultListingType) {
                        setListingType(cat.defaultListingType);
                      }
                    }
                  }}
                  className="mt-1 h-10 w-full rounded-lg border border-[#172B3A]/15 bg-[#F4F6F5] px-3 text-xs font-medium"
                >
                  {ownedBusinesses.length === 0 ? (
                    <option value={0}>No registered business yet — register in "Register Business"</option>
                  ) : (
                    ownedBusinesses.map((b) => (
                      <option key={b.id} value={b.id}>
                        {b.businessName} ({b.verificationStatus})
                      </option>
                    ))
                  )}
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-[#172B3A]/75">
                  Service Name (Dynamic)
                </label>
                <select
                  value={listingCategoryId}
                  onChange={(e) => {
                    const nextCatId = Number(e.target.value);
                    setListingCategoryId(nextCatId);
                    const pickedCat = categories.find((c) => c.id === nextCatId);
                    if (pickedCat) {
                      setListingType(pickedCat.defaultListingType || pickedCat.categoryType || 'SERVICE');
                    }
                  }}
                  className="mt-1 h-10 w-full rounded-lg border border-[#172B3A]/15 bg-[#F4F6F5] px-3 text-xs font-medium"
                >
                  {(activeCategories.length > 0 ? activeCategories : categories).map((c) => (
                    <option key={c.id} value={c.id}>
                      {getCategoryLabel(c, language)}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <label className="block text-xs font-medium text-[#172B3A]/75">
                  Fulfillment / Workflow Mode
                </label>
                <select
                  value={listingType}
                  onChange={(e) => setListingType(e.target.value)}
                  className="mt-1 h-10 w-full rounded-lg border border-[#172B3A]/15 bg-[#F4F6F5] px-3 text-xs"
                >
                  {Array.from(
                    new Set([
                      ...activeCategories.map((c) => c.defaultListingType || c.categoryType),
                      'PRODUCT',
                      'FOOD',
                      'SERVICE',
                      'RENTAL',
                      'JOB',
                      'HEALTHCARE',
                      'EDUCATION',
                      'TRANSPORT',
                    ])
                  )
                    .filter(Boolean)
                    .map((mode) => (
                      <option key={mode} value={mode}>
                        {mode}
                      </option>
                    ))}
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-[#172B3A]/75">Pricing Model</label>
                <select
                  value={pricingModel}
                  onChange={(e) => setPricingModel(e.target.value)}
                  className="mt-1 h-10 w-full rounded-lg border border-[#172B3A]/15 bg-[#F4F6F5] px-3 text-xs"
                >
                  <option value="FIXED">Fixed</option>
                  <option value="PER_UNIT">Per unit</option>
                  <option value="PER_HOUR">Per hour</option>
                  <option value="PER_DAY">Per day</option>
                  <option value="PER_MONTH">Per month</option>
                  <option value="PER_SESSION">Per session</option>
                  <option value="CALCULATED">Calculated formula</option>
                </select>
              </div>
            </div>

            <div>
              <label className="block text-xs font-medium text-[#172B3A]/75">Listing Title</label>
              <input
                required
                type="text"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="e.g., Commercial Plumbing Inspection"
                className="mt-1 h-10 w-full rounded-lg border border-[#172B3A]/15 px-3 text-xs"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-[#172B3A]/75">
                {isJobMode
                  ? 'Job Description & Requirements'
                  : isWorkforceMode
                    ? 'Service / Workforce Description'
                    : 'Product Description'}
              </label>
              <textarea
                required
                rows={2}
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder={
                  isJobMode
                    ? 'Role responsibilities, qualifications, schedule, and location...'
                    : isWorkforceMode
                      ? 'Describe your skills, tools, availability, or what is included...'
                      : 'Clear specifications, condition, and what is included...'
                }
                className="mt-1 w-full rounded-lg border border-[#172B3A]/15 px-3 py-2 text-xs"
              />
            </div>

            {/* Adaptive Media Uploader: Max 5 Product Images / Workforce CV+YouTube / Job Company Logo */}
            <div className="space-y-3 rounded-xl border border-[#172B3A]/10 bg-[#F4F6F5]/75 p-3.5">
              {isJobMode && (
                <div className="space-y-2.5">
                  <div className="flex items-center justify-between gap-2">
                    <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-[#172B3A]">
                      <Building2 className="h-3.5 w-3.5 text-[#176B52]" />
                      Company Logo (Recommended for Job Ad)
                    </span>
                    <span className="text-[11px] text-[#172B3A]/60">Description + Logo is enough</span>
                  </div>

                  <div className="flex flex-wrap items-center gap-3">
                    <label className="inline-flex cursor-pointer items-center gap-1.5 rounded-lg border border-[#176B52]/30 bg-white px-3 py-2 text-xs font-semibold text-[#176B52] hover:bg-emerald-50/60">
                      <Upload className="h-3.5 w-3.5" />
                      Upload Logo
                      <input
                        type="file"
                        accept="image/*"
                        className="sr-only"
                        onChange={(e) => {
                          handleUploadCompanyLogo(e.target.files);
                          e.target.value = '';
                        }}
                      />
                    </label>
                    <input
                      type="url"
                      value={companyLogoUrl.startsWith('data:') ? '' : companyLogoUrl}
                      onChange={(e) => setCompanyLogoUrl(e.target.value)}
                      placeholder="Or paste company logo image URL..."
                      className="h-9 min-w-[180px] flex-1 rounded-lg border border-[#172B3A]/15 bg-white px-3 text-xs"
                    />
                  </div>

                  {companyLogoUrl && (
                    <div className="flex items-center justify-between gap-3 rounded-lg border border-[#172B3A]/10 bg-white p-2.5">
                      <div className="flex items-center gap-2.5">
                        <img
                          src={companyLogoUrl}
                          alt="Company logo preview"
                          className="h-12 w-12 rounded border border-[#172B3A]/10 bg-[#F4F6F5] object-contain p-1"
                        />
                        <span className="text-xs font-medium text-[#172B3A]">Company logo attached</span>
                      </div>
                      <button
                        type="button"
                        onClick={() => setCompanyLogoUrl('')}
                        className="rounded p-1 text-[#172B3A]/60 hover:bg-red-50 hover:text-red-600"
                        aria-label="Remove company logo"
                      >
                        <X className="h-4 w-4" />
                      </button>
                    </div>
                  )}
                </div>
              )}

              {isWorkforceMode && (
                <div className="space-y-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-[#172B3A]">
                      <FileText className="h-3.5 w-3.5 text-[#176B52]" />
                      Workforce CV & YouTube Intro Link
                    </span>
                    <span className="text-[11px] text-[#172B3A]/60">Photos optional</span>
                  </div>

                  <div className="grid gap-2.5 sm:grid-cols-2">
                    <div>
                      <label className="block text-[11px] font-medium text-[#172B3A]/75">
                        CV / Resume (PDF or Image)
                      </label>
                      <div className="mt-1 flex items-center gap-2">
                        <label className="inline-flex cursor-pointer items-center gap-1.5 rounded-lg border border-[#176B52]/30 bg-white px-3 py-2 text-xs font-semibold text-[#176B52] hover:bg-emerald-50/60">
                          <Upload className="h-3.5 w-3.5" />
                          {cvUrl ? 'Replace CV' : 'Upload CV'}
                          <input
                            type="file"
                            accept=".pdf,image/*"
                            className="sr-only"
                            onChange={(e) => {
                              handleUploadCvFile(e.target.files);
                              e.target.value = '';
                            }}
                          />
                        </label>
                        {cvUrl && (
                          <button
                            type="button"
                            onClick={() => {
                              setCvUrl('');
                              setCvFileName('');
                            }}
                            className="inline-flex items-center gap-1 text-[11px] font-medium text-red-600 hover:underline"
                          >
                            <X className="h-3.5 w-3.5" />
                            Clear
                          </button>
                        )}
                      </div>
                      {cvFileName && (
                        <p className="mt-1 truncate text-[11px] font-medium text-[#176B52]">
                          Attached: {cvFileName}
                        </p>
                      )}
                    </div>

                    <div>
                      <label className="block text-[11px] font-medium text-[#172B3A]/75">
                        YouTube Intro Video Link
                      </label>
                      <div className="relative mt-1">
                        <Video className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-[#172B3A]/45" />
                        <input
                          type="url"
                          value={introVideoUrl}
                          onChange={(e) => setIntroVideoUrl(e.target.value)}
                          placeholder="https://youtube.com/watch?v=..."
                          className="h-9 w-full rounded-lg border border-[#172B3A]/15 bg-white pl-8 pr-3 text-xs"
                        />
                      </div>
                      {introVideoUrl.trim() && (
                        <p
                          className={`mt-1 text-[11px] font-medium ${
                            extractYouTubeVideoId(introVideoUrl)
                              ? 'text-[#176B52]'
                              : 'text-amber-700'
                          }`}
                        >
                          {extractYouTubeVideoId(introVideoUrl)
                            ? 'Valid YouTube intro video linked'
                            : 'Enter a valid youtube.com or youtu.be link'}
                        </p>
                      )}
                    </div>
                  </div>
                </div>
              )}

              {(isProductMode || isWorkforceMode) && (
                <div className={isWorkforceMode ? 'border-t border-[#172B3A]/10 pt-3 space-y-2.5' : 'space-y-2.5'}>
                  <div className="flex items-center justify-between gap-2">
                    <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-[#172B3A]">
                      <ImagePlus className="h-3.5 w-3.5 text-[#176B52]" />
                      {isWorkforceMode
                        ? 'Optional Work Sample Photos (Max 5)'
                        : 'Product Images (Max 5 per Product)'}
                    </span>
                    <span className="font-mono text-[11px] font-semibold text-[#176B52]">
                      {productImages.length}/{MAX_PRODUCT_IMAGES}
                    </span>
                  </div>

                  <div className="flex flex-wrap items-center gap-2">
                    <label
                      className={`inline-flex items-center gap-1.5 rounded-lg border px-3 py-2 text-xs font-semibold ${
                        productImages.length >= MAX_PRODUCT_IMAGES || mediaBusy
                          ? 'cursor-not-allowed border-[#172B3A]/15 bg-white/60 text-[#172B3A]/40'
                          : 'cursor-pointer border-[#176B52]/30 bg-white text-[#176B52] hover:bg-emerald-50/60'
                      }`}
                    >
                      <Upload className="h-3.5 w-3.5" />
                      {mediaBusy ? 'Processing...' : 'Add Photos'}
                      <input
                        type="file"
                        accept="image/*"
                        multiple
                        disabled={productImages.length >= MAX_PRODUCT_IMAGES || mediaBusy}
                        className="sr-only"
                        onChange={(e) => {
                          handleUploadProductImages(e.target.files);
                          e.target.value = '';
                        }}
                      />
                    </label>

                    <div className="flex min-w-[200px] flex-1 items-center gap-1.5">
                      <input
                        type="url"
                        value={imageUrlInput}
                        onChange={(e) => setImageUrlInput(e.target.value)}
                        disabled={productImages.length >= MAX_PRODUCT_IMAGES}
                        placeholder="Or paste product image URL..."
                        className="h-9 flex-1 rounded-lg border border-[#172B3A]/15 bg-white px-2.5 text-xs disabled:opacity-50"
                      />
                      <button
                        type="button"
                        onClick={handleAddProductImageUrl}
                        disabled={productImages.length >= MAX_PRODUCT_IMAGES || !imageUrlInput.trim()}
                        className="h-9 rounded-lg border border-[#172B3A]/15 bg-white px-2.5 text-xs font-semibold text-[#172B3A] hover:bg-[#F4F6F5] disabled:opacity-45"
                      >
                        Add
                      </button>
                    </div>
                  </div>

                  {productImages.length > 0 && (
                    <div className="grid grid-cols-5 gap-2 pt-1">
                      {productImages.map((src, idx) => (
                        <div
                          key={`${src.slice(0, 32)}-${idx}`}
                          className="relative h-16 overflow-hidden rounded-lg border border-[#172B3A]/15 bg-white"
                        >
                          <img
                            src={src}
                            alt={`Product upload ${idx + 1}`}
                            className="h-full w-full object-cover"
                          />
                          <span className="absolute bottom-1 left-1 rounded bg-[#172B3A]/75 px-1 font-mono text-[10px] font-semibold text-white">
                            {idx + 1}
                          </span>
                          <button
                            type="button"
                            onClick={() =>
                              setProductImages((prev) => prev.filter((_, i) => i !== idx))
                            }
                            aria-label={`Remove image ${idx + 1}`}
                            className="absolute right-1 top-1 flex h-5 w-5 items-center justify-center rounded-full bg-[#172B3A]/80 text-white hover:bg-red-600"
                          >
                            <X className="h-3 w-3" />
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>

            <div className="grid gap-3 sm:grid-cols-3">
              <div>
                <label className="block text-xs font-medium text-[#172B3A]/75">Base Price (ETB)</label>
                <input
                  type="number"
                  value={basePrice}
                  onChange={(e) => setBasePrice(e.target.value)}
                  className="mt-1 h-10 w-full rounded-lg border border-[#172B3A]/15 px-3 font-mono text-xs"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-[#172B3A]/75">Pricing Unit</label>
                <input
                  type="text"
                  value={pricingUnit}
                  onChange={(e) => setPricingUnit(e.target.value)}
                  placeholder="hour, item, day"
                  className="mt-1 h-10 w-full rounded-lg border border-[#172B3A]/15 px-3 text-xs"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-[#172B3A]/75">Discount (ETB)</label>
                <input
                  type="number"
                  value={discountPrice}
                  onChange={(e) => setDiscountPrice(e.target.value)}
                  placeholder="Optional"
                  className="mt-1 h-10 w-full rounded-lg border border-[#172B3A]/15 px-3 font-mono text-xs"
                />
              </div>
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <label className="block text-xs font-medium text-[#172B3A]/75">Call-out Fee (ETB)</label>
                <input
                  type="number"
                  value={calloutFee}
                  onChange={(e) => setCalloutFee(e.target.value)}
                  placeholder="Optional"
                  className="mt-1 h-10 w-full rounded-lg border border-[#172B3A]/15 px-3 font-mono text-xs"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-[#172B3A]/75">Deposit (ETB)</label>
                <input
                  type="number"
                  value={depositAmount}
                  onChange={(e) => setDepositAmount(e.target.value)}
                  placeholder="For rentals"
                  className="mt-1 h-10 w-full rounded-lg border border-[#172B3A]/15 px-3 font-mono text-xs"
                />
              </div>
            </div>

            <div className="flex items-center gap-4 text-xs">
              <label className="inline-flex items-center gap-1.5">
                <input
                  type="radio"
                  checked={publishStatus === 'ACTIVE'}
                  onChange={() => setPublishStatus('ACTIVE')}
                  className="accent-[#176B52]"
                />
                Publish Active
              </label>
              <label className="inline-flex items-center gap-1.5">
                <input
                  type="radio"
                  checked={publishStatus === 'DRAFT'}
                  onChange={() => setPublishStatus('DRAFT')}
                  className="accent-[#176B52]"
                />
                Save as Draft
              </label>
            </div>

            {validationError && (
              <div className="flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 p-3 text-xs text-red-700">
                <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" />
                <span>{validationError}</span>
              </div>
            )}

            {validationSuccess && (
              <div className="flex items-start gap-2 rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-xs text-[#176B52]">
                <CheckCircle2 className="h-4 w-4 shrink-0 mt-0.5" />
                <span>{validationSuccess}</span>
              </div>
            )}

            <button
              type="submit"
              className="w-full min-h-[42px] rounded-lg bg-[#176B52] px-4 py-2.5 text-xs font-semibold text-white hover:bg-[#125641]"
            >
              Validate Pricing & Publish Listing
            </button>
          </form>

          <div className="space-y-3 lg:col-span-7">
            <div className="md:hidden space-y-3">
              {portalListings.length === 0 ? (
                <div className="rounded-2xl border border-[#172B3A]/10 bg-white p-8 text-center text-xs text-[#172B3A]/60">
                  No listings published for your owned businesses yet.
                </div>
              ) : (
                portalListings.map((item) => {
                  const biz = ownedBusinesses.find((b) => b.id === item.businessId);
                  return (
                    <div key={item.id} className="rounded-xl border border-[#172B3A]/10 bg-white p-4 text-xs space-y-2">
                      <div className="flex items-start justify-between gap-3">
                        <div className="flex min-w-0 items-center gap-3">
                          <ListingVisual
                            imageUrl={item.imageUrl}
                            imageUrls={item.imageUrls}
                            companyLogoUrl={item.metadata?.companyLogoUrl}
                            introVideoUrl={item.metadata?.introVideoUrl}
                            cvUrl={item.metadata?.cvUrl}
                            title={item.title}
                            listingType={item.listingType}
                            className="h-12 w-12 shrink-0 rounded-lg"
                          />
                          <div className="min-w-0">
                            <p className="truncate font-semibold text-[#172B3A]">{item.title}</p>
                            <p className="truncate text-[#172B3A]/60">{biz?.businessName}</p>
                          </div>
                        </div>
                        <span className="shrink-0 font-mono font-bold text-[#176B52]">
                          {formatEtb(item.discountPrice || item.basePrice)}
                        </span>
                      </div>
                      <div className="flex items-center justify-between gap-2 pt-1">
                        <span className="text-[#172B3A]/70">
                          {item.pricingModel} / {item.pricingUnit}
                        </span>
                        <button
                          type="button"
                          onClick={() => handleToggleAvailability(item)}
                          className={`min-h-[38px] rounded-md border px-3 py-1 font-medium ${
                            item.availabilityStatus === 'AVAILABLE'
                              ? 'border-[#176B52]/30 text-[#176B52]'
                              : 'border-[#172B3A]/20 text-[#172B3A]/60'
                          }`}
                        >
                          {item.availabilityStatus}
                        </button>
                      </div>
                    </div>
                  );
                })
              )}
            </div>

            <div className="hidden md:block overflow-x-auto rounded-2xl border border-[#172B3A]/10 bg-white">
              <table className="w-full min-w-[600px] text-left text-xs">
                <thead className="border-b border-[#172B3A]/10 bg-[#F4F6F5] text-[#172B3A]/70">
                  <tr>
                    <th className="px-4 py-3 font-semibold">Listing & Provider</th>
                    <th className="px-4 py-3 font-semibold">Model</th>
                    <th className="px-4 py-3 font-semibold">Price (ETB)</th>
                    <th className="px-4 py-3 font-semibold text-right">Availability</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#172B3A]/10">
                  {portalListings.length === 0 ? (
                    <tr>
                      <td colSpan={4} className="px-4 py-10 text-center text-[#172B3A]/60">
                        No listings published for your owned businesses yet.
                      </td>
                    </tr>
                  ) : (
                    portalListings.map((item) => {
                      const biz = ownedBusinesses.find((b) => b.id === item.businessId);
                      return (
                        <tr key={item.id} className="hover:bg-[#F4F6F5]/45">
                          <td className="px-4 py-3">
                            <div className="flex items-center gap-3">
                              <ListingVisual
                                imageUrl={item.imageUrl}
                                imageUrls={item.imageUrls}
                                companyLogoUrl={item.metadata?.companyLogoUrl}
                                introVideoUrl={item.metadata?.introVideoUrl}
                                cvUrl={item.metadata?.cvUrl}
                                title={item.title}
                                listingType={item.listingType}
                                className="h-11 w-11 shrink-0 rounded-lg"
                              />
                              <div className="min-w-0">
                                <p className="font-semibold text-[#172B3A]">{item.title}</p>
                                <p className="text-[#172B3A]/60">{biz?.businessName}</p>
                              </div>
                            </div>
                          </td>
                          <td className="px-4 py-3 text-[#172B3A]/75">
                            {item.pricingModel} / {item.pricingUnit}
                          </td>
                          <td className="px-4 py-3 font-mono font-semibold tabular-nums text-[#176B52]">
                            {formatEtb(item.discountPrice || item.basePrice)}
                          </td>
                          <td className="px-4 py-3 text-right">
                            <button
                              type="button"
                              onClick={() => handleToggleAvailability(item)}
                              className={`rounded-md border px-2.5 py-1 font-medium ${
                                item.availabilityStatus === 'AVAILABLE'
                                  ? 'border-[#176B52]/30 text-[#176B52]'
                                  : 'border-[#172B3A]/20 text-[#172B3A]/60'
                              }`}
                            >
                              {item.availabilityStatus}
                            </button>
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {tab === 'ORDERS' && (
        <div className="space-y-3">
          <div className="md:hidden space-y-3">
            {orders.length === 0 ? (
              <div className="rounded-2xl border border-[#172B3A]/10 bg-white p-8 text-center text-xs text-[#172B3A]/60">
                No vendor orders placed yet.
              </div>
            ) : (
              orders.map((o) => (
                <div key={o.id} className="rounded-xl border border-[#172B3A]/10 bg-white p-4 text-xs space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="font-mono font-bold text-[#172B3A]">{o.orderNumber}</span>
                    <span className="font-mono font-bold text-[#176B52]">{formatEtb(o.totalAmount)}</span>
                  </div>
                  <p className="text-[#172B3A]/75">
                    {o.customerName} · {o.deliveryAddress} · <strong>{o.orderStatus}</strong>
                  </p>
                  <div className="flex flex-wrap gap-2">
                    {['PREPARING', 'READY', 'OUT_FOR_DELIVERY', 'COMPLETED'].map((st) => (
                      <button
                        key={st}
                        type="button"
                        onClick={() => handleUpdateOrderStatus(o.id, st)}
                        className="min-h-[38px] rounded border border-[#172B3A]/15 px-2.5 py-1 text-[11px] font-medium hover:bg-[#F4F6F5]"
                      >
                        {st.replace(/_/g, ' ')}
                      </button>
                    ))}
                  </div>
                </div>
              ))
            )}
          </div>
          <div className="hidden md:block overflow-x-auto rounded-2xl border border-[#172B3A]/10 bg-white">
            <table className="w-full min-w-[700px] text-left text-xs">
              <thead className="border-b border-[#172B3A]/10 bg-[#F4F6F5] text-[#172B3A]/70">
                <tr>
                  <th className="px-4 py-3 font-semibold">Order Ref</th>
                  <th className="px-4 py-3 font-semibold">Customer</th>
                  <th className="px-4 py-3 font-semibold">Total (ETB)</th>
                  <th className="px-4 py-3 font-semibold">Status</th>
                  <th className="px-4 py-3 font-semibold text-right">Fulfillment Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#172B3A]/10">
                {orders.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="px-4 py-10 text-center text-[#172B3A]/60">
                      No vendor orders placed yet.
                    </td>
                  </tr>
                ) : (
                  orders.map((o) => (
                    <tr key={o.id}>
                      <td className="px-4 py-3 font-mono font-semibold">{o.orderNumber}</td>
                      <td className="px-4 py-3">
                        {o.customerName} · {o.deliveryAddress}
                      </td>
                      <td className="px-4 py-3 font-mono font-semibold tabular-nums">
                        {formatEtb(o.totalAmount)}
                      </td>
                      <td className="px-4 py-3 font-semibold text-[#176B52]">{o.orderStatus}</td>
                      <td className="px-4 py-3 text-right space-x-2">
                        {['PREPARING', 'READY', 'OUT_FOR_DELIVERY', 'COMPLETED'].map((st) => (
                          <button
                            key={st}
                            type="button"
                            onClick={() => handleUpdateOrderStatus(o.id, st)}
                            className="rounded border border-[#172B3A]/15 px-2 py-1 text-[11px] font-medium hover:bg-[#F4F6F5]"
                          >
                            {st.replace(/_/g, ' ')}
                          </button>
                        ))}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {tab === 'BOOKINGS' && (
        <div className="space-y-3">
          <div className="md:hidden space-y-3">
            {bookings.length === 0 ? (
              <div className="rounded-2xl border border-[#172B3A]/10 bg-white p-8 text-center text-xs text-[#172B3A]/60">
                No bookings or rental reservations yet.
              </div>
            ) : (
              bookings.map((b) => (
                <div key={b.id} className="rounded-xl border border-[#172B3A]/10 bg-white p-4 text-xs space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="font-mono font-bold text-[#172B3A]">{b.bookingReference}</span>
                    <span className="font-mono font-bold text-[#176B52]">{formatEtb(b.agreedPrice)}</span>
                  </div>
                  <p className="text-[#172B3A]/75">
                    {b.scheduledDate} {b.endDate ? `→ ${b.endDate}` : `(${b.scheduledTime})`} ·{' '}
                    <strong>{b.bookingStatus}</strong>
                  </p>
                  <div className="flex flex-wrap gap-2">
                    <button
                      type="button"
                      onClick={() => handleUpdateBooking(b.id, { bookingStatus: 'CONFIRMED' })}
                      className="min-h-[38px] rounded border border-[#172B3A]/15 px-3 py-1.5 font-medium"
                    >
                      Confirm
                    </button>
                    <button
                      type="button"
                      onClick={() =>
                        handleUpdateBooking(b.id, {
                          bookingStatus: 'QUOTED',
                          quotedPrice: Number(b.agreedPrice) + 250,
                          quoteApproved: false,
                        })
                      }
                      className="min-h-[38px] rounded border border-[#172B3A]/15 px-3 py-1.5 font-medium"
                    >
                      +250 ETB Quote
                    </button>
                    <button
                      type="button"
                      onClick={() => handleUpdateBooking(b.id, { bookingStatus: 'COMPLETED' })}
                      className="min-h-[38px] rounded bg-[#176B52] px-3 py-1.5 font-semibold text-white"
                    >
                      Complete
                    </button>
                  </div>
                </div>
              ))
            )}
          </div>
          <div className="hidden md:block overflow-x-auto rounded-2xl border border-[#172B3A]/10 bg-white">
            <table className="w-full min-w-[700px] text-left text-xs">
              <thead className="border-b border-[#172B3A]/10 bg-[#F4F6F5] text-[#172B3A]/70">
                <tr>
                  <th className="px-4 py-3 font-semibold">Booking Ref</th>
                  <th className="px-4 py-3 font-semibold">Schedule</th>
                  <th className="px-4 py-3 font-semibold">Agreed Price</th>
                  <th className="px-4 py-3 font-semibold">Status</th>
                  <th className="px-4 py-3 font-semibold text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#172B3A]/10">
                {bookings.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="px-4 py-10 text-center text-[#172B3A]/60">
                      No bookings or rental reservations yet.
                    </td>
                  </tr>
                ) : (
                  bookings.map((b) => (
                    <tr key={b.id}>
                      <td className="px-4 py-3 font-mono font-semibold">{b.bookingReference}</td>
                      <td className="px-4 py-3">
                        {b.scheduledDate} {b.endDate ? `→ ${b.endDate}` : `(${b.scheduledTime})`}
                      </td>
                      <td className="px-4 py-3 font-mono font-semibold tabular-nums">
                        {formatEtb(b.agreedPrice)}
                      </td>
                      <td className="px-4 py-3 font-semibold text-[#176B52]">{b.bookingStatus}</td>
                      <td className="px-4 py-3 text-right space-x-2">
                        <button
                          type="button"
                          onClick={() => handleUpdateBooking(b.id, { bookingStatus: 'CONFIRMED' })}
                          className="rounded border border-[#172B3A]/15 px-2.5 py-1 font-medium hover:bg-[#F4F6F5]"
                        >
                          Confirm
                        </button>
                        <button
                          type="button"
                          onClick={() =>
                            handleUpdateBooking(b.id, {
                              bookingStatus: 'QUOTED',
                              quotedPrice: Number(b.agreedPrice) + 250,
                              quoteApproved: false,
                            })
                          }
                          className="rounded border border-[#172B3A]/15 px-2.5 py-1 font-medium hover:bg-[#F4F6F5]"
                        >
                          Send +250 ETB Quote
                        </button>
                        <button
                          type="button"
                          onClick={() => handleUpdateBooking(b.id, { bookingStatus: 'COMPLETED' })}
                          className="rounded bg-[#176B52] px-2.5 py-1 font-semibold text-white"
                        >
                          Complete
                        </button>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {tab === 'RECRUITMENT' && (
        <div className="space-y-3">
          <div className="md:hidden space-y-3">
            {applications.length === 0 ? (
              <div className="rounded-2xl border border-[#172B3A]/10 bg-white p-8 text-center text-xs text-[#172B3A]/60">
                No job applications received yet.
              </div>
            ) : (
              applications.map((a) => (
                <div key={a.id} className="rounded-xl border border-[#172B3A]/10 bg-white p-4 text-xs space-y-2.5">
                  <div className="flex items-center justify-between">
                    <span className="font-semibold text-[#172B3A]">{a.applicantName}</span>
                    <span className="font-mono font-bold text-[#176B52]">
                      {formatEtb(a.expectedCompensation)}
                    </span>
                  </div>
                  <p className="text-[#172B3A]/70">
                    {a.skills} ({a.experienceYears} yrs) · <strong>{a.applicationStatus}</strong>
                  </p>
                  <div className="flex flex-wrap gap-1.5">
                    {['SHORTLISTED', 'INTERVIEW_SCHEDULED', 'ACCEPTED', 'REJECTED'].map((st) => (
                      <button
                        key={st}
                        type="button"
                        onClick={() => handleUpdateApplication(a.id, st)}
                        className="min-h-[38px] rounded border border-[#172B3A]/15 px-2.5 py-1 text-[11px] font-medium"
                      >
                        {st.replace('_', ' ')}
                      </button>
                    ))}
                  </div>
                </div>
              ))
            )}
          </div>
          <div className="hidden md:block overflow-x-auto rounded-2xl border border-[#172B3A]/10 bg-white">
            <table className="w-full min-w-[700px] text-left text-xs">
              <thead className="border-b border-[#172B3A]/10 bg-[#F4F6F5] text-[#172B3A]/70">
                <tr>
                  <th className="px-4 py-3 font-semibold">Applicant</th>
                  <th className="px-4 py-3 font-semibold">Skills & Experience</th>
                  <th className="px-4 py-3 font-semibold">Expected Pay</th>
                  <th className="px-4 py-3 font-semibold">Status</th>
                  <th className="px-4 py-3 font-semibold text-right">Pipeline</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#172B3A]/10">
                {applications.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="px-4 py-10 text-center text-[#172B3A]/60">
                      No job applications received yet.
                    </td>
                  </tr>
                ) : (
                  applications.map((a) => (
                    <tr key={a.id}>
                      <td className="px-4 py-3 font-semibold">{a.applicantName}</td>
                      <td className="px-4 py-3">
                        {a.skills} ({a.experienceYears} yrs)
                      </td>
                      <td className="px-4 py-3 font-mono tabular-nums">
                        {formatEtb(a.expectedCompensation)}
                      </td>
                      <td className="px-4 py-3 font-semibold text-[#176B52]">
                        {a.applicationStatus}
                      </td>
                      <td className="px-4 py-3 text-right space-x-1.5">
                        {['SHORTLISTED', 'INTERVIEW_SCHEDULED', 'ACCEPTED', 'REJECTED'].map((st) => (
                          <button
                            key={st}
                            type="button"
                            onClick={() => handleUpdateApplication(a.id, st)}
                            className="rounded border border-[#172B3A]/15 px-2 py-1 text-[11px] font-medium hover:bg-[#F4F6F5]"
                          >
                            {st.replace('_', ' ')}
                          </button>
                        ))}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {tab === 'REGISTER' && (
        <div className="space-y-6">
          {!isProviderVerified && (
            <div className="flex flex-wrap items-center justify-between gap-4 rounded-2xl border border-amber-200 bg-amber-50 p-5 text-xs text-amber-950">
              <div>
                <p className="font-semibold">
                  Complete Provider Self-Registration First (Fayda ID + Alive Test + Required Docs)
                </p>
                <p className="mt-1 opacity-85">
                  Every user must self-register with their Fayda National ID, pass the live Alive
                  camera check, and upload Admin-mapped category documents before owning a business.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setTab('PROVIDER_KYC')}
                className="rounded-lg bg-[#176B52] px-4 py-2 font-semibold text-white hover:bg-[#125641]"
              >
                Go to Provider Self-Registration
              </button>
            </div>
          )}

          <form
            onSubmit={handleRegisterBusiness}
            className="max-w-3xl space-y-4 rounded-2xl border border-[#172B3A]/10 bg-white p-6"
          >
            <h2 className="font-display text-lg font-semibold text-[#172B3A]">
              Register New Ethiopian Business & Real-Time Location
            </h2>
            <p className="text-xs text-[#172B3A]/65">
              Pin your exact storefront or service headquarters on OpenStreetMap so customers find
              you with real-time coordinates.
            </p>

            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <label className="block text-xs font-medium text-[#172B3A]/75">Business Name</label>
                <input
                  required
                  type="text"
                  value={bizName}
                  onChange={(e) => setBizName(e.target.value)}
                  placeholder="e.g., Nile Fresh Market"
                  className="mt-1 h-10 w-full rounded-lg border border-[#172B3A]/15 px-3 text-xs"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-[#172B3A]/75">
                  Primary Service Name
                </label>
                <select
                  value={bizCatId}
                  onChange={(e) => setBizCatId(Number(e.target.value))}
                  className="mt-1 h-10 w-full rounded-lg border border-[#172B3A]/15 bg-[#F4F6F5] px-3 text-xs"
                >
                  {(activeCategories.length > 0 ? activeCategories : categories).map((c) => (
                    <option key={c.id} value={c.id}>
                      {getCategoryLabel(c, language)}
                    </option>
                  ))}
                </select>
                {portalReqs.some((r) => r.categoryId === bizCatId) && (
                  <p className="mt-1 text-[11px] text-[#176B52]">
                    Mapped Docs:{' '}
                    {portalReqs
                      .filter((r) => r.categoryId === bizCatId)
                      .map((r) => getDocumentLabel(r, language))
                      .join(', ')}
                  </p>
                )}
              </div>
            </div>

            <div>
              <label className="block text-xs font-medium text-[#172B3A]/75">Description</label>
              <textarea
                required
                rows={2}
                value={bizDesc}
                onChange={(e) => setBizDesc(e.target.value)}
                className="mt-1 w-full rounded-lg border border-[#172B3A]/15 px-3 py-2 text-xs"
              />
            </div>

            <div className="grid gap-4 sm:grid-cols-3">
              <div>
                <label className="block text-xs font-medium text-[#172B3A]/75">License Number</label>
                <input
                  required
                  type="text"
                  value={licenseNumber}
                  onChange={(e) => setLicenseNumber(e.target.value)}
                  placeholder="Trade / business license ref #"
                  className="mt-1 h-10 w-full rounded-lg border border-[#172B3A]/15 px-3 font-mono text-xs"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-[#172B3A]/75">Addis Sub-City</label>
                <select
                  value={subCity}
                  onChange={(e) => {
                    const chosen = ADDIS_SUB_CITIES.find((c) => c.name === e.target.value);
                    setSubCity(e.target.value);
                    if (chosen) {
                      setBizLat(chosen.lat);
                      setBizLng(chosen.lng);
                    }
                  }}
                  className="mt-1 h-10 w-full rounded-lg border border-[#172B3A]/15 bg-[#F4F6F5] px-3 text-xs"
                >
                  {ADDIS_SUB_CITIES.map((c) => (
                    <option key={c.name} value={c.name}>
                      {c.name}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-[#172B3A]/75">Contact Phone</label>
                <input
                  required
                  type="text"
                  value={contactPhone}
                  onChange={(e) => setContactPhone(e.target.value)}
                  placeholder="+251 9XX XXX XXX"
                  className="mt-1 h-10 w-full rounded-lg border border-[#172B3A]/15 px-3 text-xs"
                />
              </div>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <label className="block text-xs font-medium text-[#172B3A]/75">Landmark</label>
                <input
                  required
                  type="text"
                  value={landmark}
                  onChange={(e) => setLandmark(e.target.value)}
                  placeholder="Street or nearest recognizable landmark"
                  className="mt-1 h-10 w-full rounded-lg border border-[#172B3A]/15 px-3 text-xs"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-[#172B3A]/75">Business Email</label>
                <input
                  type="email"
                  value={bizEmail}
                  onChange={(e) => setBizEmail(e.target.value)}
                  placeholder="owner@company.et"
                  className="mt-1 h-10 w-full rounded-lg border border-[#172B3A]/15 px-3 text-xs"
                />
              </div>
            </div>

            <RealtimeLocationPickerMap
              latitude={bizLat}
              longitude={bizLng}
              isLiveActive={bizLiveActive}
              onChangeCoordinates={(lat, lng) => {
                setBizLat(lat);
                setBizLng(lng);
              }}
              onToggleLive={setBizLiveActive}
              heightClass="h-[280px]"
            />

            <button
              type="submit"
              className="min-h-[44px] rounded-lg bg-[#176B52] px-5 py-2.5 text-xs font-semibold text-white hover:bg-[#125641]"
            >
              Submit Business for Verification
            </button>
          </form>
        </div>
      )}

      {inspectDocModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-[#172B3A]/70 p-4">
          <div className="w-full max-w-xl overflow-hidden rounded-2xl bg-white shadow-2xl">
            <div className="flex items-center justify-between border-b border-[#172B3A]/10 px-5 py-3">
              <p className="font-display text-sm font-semibold text-[#172B3A]">
                {inspectDocModal.title}
              </p>
              <button
                type="button"
                onClick={() => setInspectDocModal(null)}
                className="flex h-9 w-9 items-center justify-center rounded-lg hover:bg-[#F4F6F5]"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="bg-[#F4F6F5] p-4">
              <img
                src={inspectDocModal.url}
                alt={inspectDocModal.title}
                className="max-h-[70vh] w-full rounded-lg object-contain"
              />
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
