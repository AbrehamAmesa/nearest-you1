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
  Landmark,
  MapPin,
  MessageSquare,
  Navigation,
  Pencil,
  Plus,
  QrCode,
  Radio,
  Receipt,
  ShieldCheck,
  ShieldOff,
  Upload,
  Video,
  Wallet,
  X,
} from 'lucide-react';
import type {
  BankDirectoryItem,
  BookingRecord,
  Business,
  Category,
  CategoryDocumentRequirement,
  ChatThreadSummary,
  CommissionRecord,
  JobApplicationRecord,
  Listing,
  ListingMetadata,
  OnboardingGovernance,
  OrderRecord,
  PaymentTransactionRecord,
  ProviderRegistration,
} from '../types/nearestyou.ts';
import { ADDIS_SUB_CITIES, formatEtb } from '../utils/geo.ts';
import {
  formatPricingModelLabel,
  getCategoryLabel,
  getDocumentLabel,
  type AppLanguage,
} from '../utils/i18n.ts';
import {
  compressImageFile,
  extractYouTubeVideoId,
  MAX_PRODUCT_IMAGES,
  readFileAsDataUrl,
} from '../utils/media.ts';
import { calculateReturnLoss } from '../utils/listingPolicy.ts';
import { formatEtaClock, formatLastSeenStatus } from '../utils/presence.ts';
import { businessApi, engagementApi, paymentApi } from '../api/index.ts';
import { useAuth } from '../context/AuthContext.tsx';
import { useLiveChatInboxListener } from '../hooks/useLiveChat.ts';
import { ContractOfferSection } from './ContractOfferSection.tsx';
import { ListingVisual } from './ListingVisual.tsx';
import { LiveChatDrawer, type ActiveChatTarget } from './LiveChatDrawer.tsx';
import { LiveChatPanel } from './LiveChatPanel.tsx';
import { PaymentDetailsModal, type PaymentReferenceLookup } from './PaymentDetailsModal.tsx';
import { ProviderOnboardingWizard } from './ProviderOnboardingWizard.tsx';
import { RealtimeLocationPickerMap } from './ServiceMap.tsx';

export type BusinessPortalTab =
  | 'PROVIDER_KYC'
  | 'PEER_VOUCH'
  | 'APPROVALS'
  | 'REGISTER'
  | 'CATALOG'
  | 'ORDERS'
  | 'BOOKINGS'
  | 'MESSAGES'
  | 'RECRUITMENT'
  | 'PAYOUTS';

interface BusinessPortalViewProps {
  categories: Category[];
  documentRequirements: CategoryDocumentRequirement[];
  businesses: Business[];
  listings: Listing[];
  governance: OnboardingGovernance;
  language?: AppLanguage;
  initialTab?: BusinessPortalTab;
  requestedTab?: BusinessPortalTab;
  requestedThreadKey?: string | null;
  navSignal?: number;
  paymentRefreshSignal?: number;
  onRefreshCatalog: () => void;
  onNotify: (msg: string) => void;
  onEditListing?: (listing: Listing) => void;
}

export const BusinessPortalView: React.FC<BusinessPortalViewProps> = ({
  categories,
  documentRequirements,
  businesses,
  listings,
  governance,
  language = 'en',
  initialTab = 'PROVIDER_KYC',
  requestedTab,
  requestedThreadKey,
  navSignal = 0,
  paymentRefreshSignal = 0,
  onRefreshCatalog,
  onNotify,
  onEditListing,
}) => {
  const { firebaseUser, dbUser, isAdmin, refreshProfile, openAuthModal, authFetch } = useAuth();
  const activeCategories = useMemo(
    () => categories.filter((c) => c.status === 'ACTIVE'),
    [categories]
  );
  const [tab, setTab] = useState<BusinessPortalTab>(requestedTab || initialTab);
  const [ownedBusinesses, setOwnedBusinesses] = useState<Business[]>([]);
  const [orders, setOrders] = useState<OrderRecord[]>([]);
  const [bookings, setBookings] = useState<BookingRecord[]>([]);
  const [applications, setApplications] = useState<JobApplicationRecord[]>([]);
  const [commissions, setCommissions] = useState<CommissionRecord[]>([]);
  const [paymentTransactions, setPaymentTransactions] = useState<PaymentTransactionRecord[]>([]);
  const [banks, setBanks] = useState<BankDirectoryItem[]>([]);
  const [payoutBizId, setPayoutBizId] = useState<number>(0);
  const [payoutBankCode, setPayoutBankCode] = useState('130');
  const [payoutBankName, setPayoutBankName] = useState('Commercial Bank of Ethiopia (CBE)');
  const [payoutAccountNumber, setPayoutAccountNumber] = useState('');
  const [payoutAccountName, setPayoutAccountName] = useState('');
  const [payoutTelebirrNumber, setPayoutTelebirrNumber] = useState('');
  const [payoAccountHandle, setPayoAccountHandle] = useState('');
  const [preferredPayoutGateway, setPreferredPayoutGateway] = useState<'BOTH' | 'CHAPA' | 'PAYO'>('BOTH');
  const [savingPayout, setSavingPayout] = useState(false);

  const [providerReg, setProviderReg] = useState<ProviderRegistration | null>(null);
  const [portalReqs, setPortalReqs] = useState<CategoryDocumentRequirement[]>(documentRequirements);
  const [threads, setThreads] = useState<ChatThreadSummary[]>([]);
  const [selectedThreadKey, setSelectedThreadKey] = useState<string | null>(
    requestedThreadKey ?? null
  );
  const [chatDrawerTarget, setChatDrawerTarget] = useState<ActiveChatTarget | null>(null);
  const [paymentDetailsModal, setPaymentDetailsModal] = useState<{
    transaction?: PaymentTransactionRecord | null;
    lookup?: PaymentReferenceLookup | null;
  } | null>(null);
  const [nowTick, setNowTick] = useState(() => Date.now());
  const [contractRefreshSignal, setContractRefreshSignal] = useState(0);
  const chatSectionRef = useRef<HTMLDivElement>(null);

  // Per-order seller acceptance ETA & rejection inputs
  const [orderReadyMins, setOrderReadyMins] = useState<Record<number, string>>({});
  const [orderDeliveryMins, setOrderDeliveryMins] = useState<Record<number, string>>({});
  const [orderRejectReason, setOrderRejectReason] = useState<Record<number, string>>({});

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
  const [deliveryAvailable, setDeliveryAvailable] = useState(true);
  const [freeDeliveryMaxKm, setFreeDeliveryMaxKm] = useState('0');
  const [taxResponsibility, setTaxResponsibility] = useState<'SELLER' | 'BUYER' | ''>('');
  const [taxConfirmed, setTaxConfirmed] = useState(false);
  const [immediateAcceptance, setImmediateAcceptance] = useState(true);
  const [estimatedReadyMinutes, setEstimatedReadyMinutes] = useState('15');
  const [estimatedDeliveryMinutes, setEstimatedDeliveryMinutes] = useState('45');
  const [returnable, setReturnable] = useState(true);
  const [returnWindowDays, setReturnWindowDays] = useState('3');
  const [returnLossPercent, setReturnLossPercent] = useState('0');
  const [returnLossFixedEtb, setReturnLossFixedEtb] = useState('0');
  const [deliveryFeeNonRefundableOnReturn, setDeliveryFeeNonRefundableOnReturn] = useState(true);
  const [returnPolicyNote, setReturnPolicyNote] = useState('');
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
  const loadPortalRef = useRef<() => Promise<void>>(async () => {});

  useLiveChatInboxListener(Boolean(firebaseUser), {
    onIncomingMessage: () => {
      loadThreadsRef.current();
    },
    onContractUpdated: () => {
      setContractRefreshSignal((n) => n + 1);
      loadThreadsRef.current();
    },
    onOrderUpdated: () => {
      loadPortalRef.current();
    },
    onBookingUpdated: () => {
      loadPortalRef.current();
    },
    onApplicationUpdated: () => {
      loadPortalRef.current();
    },
    onPaymentSettled: () => {
      loadPortalRef.current();
    },
  });

  const loadPortalData = async () => {
    if (!firebaseUser) return;
    try {
      const [portalRes, meRes, threadsRes, banksRes] = await Promise.allSettled([
        authFetch('/api/v1/business/portal'),
        authFetch('/api/v1/auth/me'),
        engagementApi.getChatThreads(),
        paymentApi.getBanks(),
      ]);
      if (portalRes.status === 'fulfilled' && portalRes.value.ok) {
        const data = await portalRes.value.json();
        setOwnedBusinesses(data.ownedBusinesses || []);
        setOrders(data.orders || []);
        setBookings(data.bookings || []);
        setApplications(data.applications || []);
        setCommissions(data.commissions || []);
        setPaymentTransactions(data.paymentTransactions || []);
        setProviderReg(data.providerRegistration || null);
        if (data.documentRequirements) {
          setPortalReqs(data.documentRequirements);
        }
      }
      if (meRes.status === 'fulfilled' && meRes.value.ok) {
        const meData = await meRes.value.json();
        if (meData.voucherEligibility) {
          setVoucherEligibility(meData.voucherEligibility);
        }
      }
      if (threadsRes.status === 'fulfilled') {
        const nextThreads: ChatThreadSummary[] = Array.isArray(threadsRes.value.data)
          ? threadsRes.value.data
          : [];
        setThreads(nextThreads);
        setSelectedThreadKey((prev) => prev || nextThreads[0]?.threadKey || null);
      }
      if (banksRes.status === 'fulfilled' && Array.isArray(banksRes.value.data)) {
        setBanks(banksRes.value.data);
      }
    } catch (err) {
      console.error(err);
    }
  };

  loadPortalRef.current = loadPortalData;

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

  const prevInitialTabRef = useRef(initialTab);
  useEffect(() => {
    if (prevInitialTabRef.current !== initialTab) {
      prevInitialTabRef.current = initialTab;
      setTab(initialTab);
    }
  }, [initialTab]);

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
      requestedTab === 'RECRUITMENT'
    ) {
      loadPortalRef.current();
    }
  }, [navSignal, requestedTab, requestedThreadKey]);

  useEffect(() => {
    setPortalReqs(documentRequirements);
  }, [documentRequirements]);

  useEffect(() => {
    if (firebaseUser) loadPortalData();
  }, [firebaseUser, paymentRefreshSignal]);

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
    if (ownedBusinesses.length > 0 && !ownedBusinesses.some((b) => b.id === payoutBizId)) {
      const firstBiz = ownedBusinesses[0];
      setPayoutBizId(firstBiz.id);
      setPayoutBankCode(firstBiz.payoutBankCode || '130');
      setPayoutBankName(firstBiz.payoutBankName || 'Commercial Bank of Ethiopia (CBE)');
      setPayoutAccountNumber(firstBiz.payoutAccountNumber || '');
      setPayoutAccountName(firstBiz.payoutAccountName || firstBiz.businessName);
      setPayoutTelebirrNumber(firstBiz.payoutTelebirrNumber || firstBiz.contactPhone || '');
      setPayoAccountHandle(firstBiz.payoAccountHandle || '');
      const gw = firstBiz.preferredPayoutGateway;
      setPreferredPayoutGateway(gw === 'CHAPA' || gw === 'PAYO' ? gw : 'BOTH');
    }
  }, [ownedBusinesses, categories, selectedBizId, payoutBizId]);

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
    if (isProductMode && (listingType === 'PRODUCT' || listingType === 'FOOD')) {
      if (!taxResponsibility) {
        setValidationError(
          'Please select whether tax (VAT) is paid by the seller or added for the buyer.'
        );
        return;
      }
      if (!taxConfirmed) {
        setValidationError(
          'Please confirm your tax responsibility setting first before publishing this advertisement.'
        );
        return;
      }
      const readyMin = Math.max(5, Math.round(Number(estimatedReadyMinutes) || 15));
      const delivMin = Math.max(readyMin, Math.round(Number(estimatedDeliveryMinutes) || 45));
      metadataPayload.deliveryAvailable = deliveryAvailable;
      metadataPayload.freeDeliveryMaxKm = deliveryAvailable
        ? Math.max(0, Number(freeDeliveryMaxKm) || 0)
        : 0;
      metadataPayload.taxResponsibility = taxResponsibility;
      metadataPayload.taxConfirmedBySeller = true;
      metadataPayload.immediateAcceptance =
        listingType === 'FOOD' ? false : immediateAcceptance;
      metadataPayload.estimatedReadyMinutes = readyMin;
      metadataPayload.estimatedDeliveryMinutes = delivMin;
      metadataPayload.returnable = returnable;
      metadataPayload.returnWindowDays = returnable
        ? Math.max(1, Math.round(Number(returnWindowDays) || 3))
        : 0;
      metadataPayload.returnLossPercent = returnable
        ? Math.min(100, Math.max(0, Number(returnLossPercent) || 0))
        : 100;
      metadataPayload.returnLossFixedEtb = returnable
        ? Math.max(0, Number(returnLossFixedEtb) || 0)
        : 0;
      metadataPayload.deliveryFeeNonRefundableOnReturn =
        !returnable || deliveryFeeNonRefundableOnReturn;
      if (returnPolicyNote.trim()) {
        metadataPayload.returnPolicyNote = returnPolicyNote.trim();
      }
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
    setFreeDeliveryMaxKm('0');
    setTaxResponsibility('');
    setTaxConfirmed(false);
    setReturnPolicyNote('');
    onRefreshCatalog();
  };

  const handleUpdateOrderStatus = async (
    orderId: number,
    orderStatus: string,
    extra?: {
      estimatedReadyMinutes?: number;
      estimatedDeliveryMinutes?: number;
      rejectionReason?: string;
    }
  ) => {
    const res = await authFetch(`/api/v1/orders/${orderId}/status`, {
      method: 'POST',
      body: JSON.stringify({
        orderStatus,
        ...(extra?.estimatedReadyMinutes !== undefined
          ? { estimatedReadyMinutes: extra.estimatedReadyMinutes }
          : {}),
        ...(extra?.estimatedDeliveryMinutes !== undefined
          ? { estimatedDeliveryMinutes: extra.estimatedDeliveryMinutes }
          : {}),
        ...(extra?.rejectionReason ? { rejectionReason: extra.rejectionReason } : {}),
      }),
    });
    if (res.ok) {
      onNotify(`Order status updated to ${orderStatus}.`);
      loadPortalData();
    } else {
      const err = await res.json().catch(() => ({}));
      onNotify(err.error || 'Could not update order status.');
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

  const handleSelectPayoutBusiness = (bizId: number) => {
    setPayoutBizId(bizId);
    const biz = ownedBusinesses.find((b) => b.id === bizId);
    if (!biz) return;
    setPayoutBankCode(biz.payoutBankCode || '130');
    setPayoutBankName(biz.payoutBankName || 'Commercial Bank of Ethiopia (CBE)');
    setPayoutAccountNumber(biz.payoutAccountNumber || '');
    setPayoutAccountName(biz.payoutAccountName || biz.businessName);
    setPayoutTelebirrNumber(biz.payoutTelebirrNumber || biz.contactPhone || '');
    setPayoAccountHandle(biz.payoAccountHandle || '');
    const gw = biz.preferredPayoutGateway;
    setPreferredPayoutGateway(gw === 'CHAPA' || gw === 'PAYO' ? gw : 'BOTH');
  };

  const handleSaveBusinessPayout = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!payoutBizId) return;
    if (!payoutAccountNumber.trim() && !payoutTelebirrNumber.trim() && !payoAccountHandle.trim()) {
      onNotify('Enter a bank account number, Telebirr number, or Payo handle first.');
      return;
    }
    setSavingPayout(true);
    try {
      const matchedBank = banks.find((b) => b.code === payoutBankCode);
      const res = await businessApi.updatePayoutAccount(payoutBizId, {
        payoutBankCode,
        payoutBankName: matchedBank?.name || payoutBankName,
        payoutAccountNumber: payoutAccountNumber.trim(),
        payoutAccountName: payoutAccountName.trim(),
        payoutTelebirrNumber: payoutTelebirrNumber.trim(),
        payoAccountHandle: payoAccountHandle.trim(),
        preferredPayoutGateway,
      });
      const subId = res.data?.chapaSubaccountId;
      onNotify(
        subId
          ? `Business payout account saved & Chapa Subaccount (${subId}) provisioned.`
          : 'Business sales payout account saved.'
      );
      await loadPortalData();
      onRefreshCatalog();
    } catch (err: any) {
      onNotify(err?.response?.data?.error || 'Could not save business payout account.');
    } finally {
      setSavingPayout(false);
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
    { id: 'BOOKINGS', label: `Service Requests & Bookings (${bookings.length})` },
    { id: 'MESSAGES', label: `Messages & Live Chat (${threads.length})` },
    { id: 'PAYOUTS', label: `My Sales Account & Ledger (${paymentTransactions.length})` },
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
            className="min-w-0 space-y-4 rounded-2xl border border-[#172B3A]/10 bg-white p-4 sm:p-6 lg:col-span-5"
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
                <label className="block text-xs font-medium text-[#172B3A]/75">
                  {isWorkforceMode ? 'Service Payment / Engagement Type' : 'Pricing Model'}
                </label>
                <select
                  value={pricingModel}
                  onChange={(e) => {
                    const nextModel = e.target.value;
                    setPricingModel(nextModel);
                    if (nextModel === 'ONE_TIME_CONTRACT') setPricingUnit('contract');
                    else if (nextModel === 'FULL_TIME') setPricingUnit('month');
                    else if (nextModel === 'PER_HOUR') setPricingUnit('hour');
                    else if (nextModel === 'PER_DAY') setPricingUnit('day');
                    else if (nextModel === 'PER_MONTH') setPricingUnit('month');
                    else if (nextModel === 'PER_SESSION') setPricingUnit('session');
                    else if (nextModel === 'PER_UNIT') setPricingUnit('item');
                  }}
                  className="mt-1 h-10 w-full rounded-lg border border-[#172B3A]/15 bg-[#F4F6F5] px-3 text-xs"
                >
                  <option value="ONE_TIME_CONTRACT">One-Time Contract</option>
                  <option value="FULL_TIME">Full-Time</option>
                  <option value="PER_HOUR">Per Hour Payment</option>
                  <option value="PER_DAY">Per Day</option>
                  <option value="PER_MONTH">Per Month</option>
                  <option value="PER_SESSION">Per Session</option>
                  <option value="FIXED">Fixed Price</option>
                  <option value="PER_UNIT">Per Unit</option>
                  <option value="CALCULATED">Calculated Formula</option>
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

            {isProductMode && (listingType === 'PRODUCT' || listingType === 'FOOD') && (
              <div className="space-y-3 rounded-xl border border-[#172B3A]/12 bg-[#F4F6F5]/65 p-3.5 text-xs">
                <p className="font-bold text-[#172B3A]">
                  Delivery Availability, Acceptance Time &amp; Unsatisfied Return Policy
                </p>

                <div className="grid gap-2.5 sm:grid-cols-2">
                  <div>
                    <label className="block text-[11px] font-medium text-[#172B3A]/75">
                      Delivery Support
                    </label>
                    <select
                      value={deliveryAvailable ? 'WITH_DELIVERY' : 'PICKUP_ONLY'}
                      onChange={(e) => setDeliveryAvailable(e.target.value === 'WITH_DELIVERY')}
                      className="mt-1 h-9 w-full rounded-lg border border-[#172B3A]/15 bg-white px-2.5 text-xs"
                    >
                      <option value="WITH_DELIVERY">With Delivery</option>
                      <option value="PICKUP_ONLY">Without Delivery (Pickup Only)</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-[11px] font-medium text-[#172B3A]/75">
                      Order Acceptance
                    </label>
                    {listingType === 'FOOD' ? (
                      <p className="mt-1.5 text-[11px] font-medium text-amber-800">
                        Food Order Request (Seller accepts &amp; sets time)
                      </p>
                    ) : (
                      <select
                        value={immediateAcceptance ? 'IMMEDIATE' : 'REQUEST'}
                        onChange={(e) => setImmediateAcceptance(e.target.value === 'IMMEDIATE')}
                        className="mt-1 h-9 w-full rounded-lg border border-[#172B3A]/15 bg-white px-2.5 text-xs"
                      >
                        <option value="IMMEDIATE">Immediate Acceptance</option>
                        <option value="REQUEST">Order Request (Seller Accepts)</option>
                      </select>
                    )}
                  </div>
                </div>

                <div className="grid gap-2.5 sm:grid-cols-2">
                  <div>
                    <label className="block text-[11px] font-medium text-[#172B3A]/75">
                      Approx. Ready Time (min)
                    </label>
                    <input
                      type="number"
                      min={5}
                      value={estimatedReadyMinutes}
                      onChange={(e) => setEstimatedReadyMinutes(e.target.value)}
                      className="mt-1 h-9 w-full rounded-lg border border-[#172B3A]/15 bg-white px-2.5 font-mono text-xs"
                    />
                  </div>
                  <div>
                    <label className="block text-[11px] font-medium text-[#172B3A]/75">
                      Approx. Delivery Time (min)
                    </label>
                    <input
                      type="number"
                      min={5}
                      disabled={!deliveryAvailable}
                      value={estimatedDeliveryMinutes}
                      onChange={(e) => setEstimatedDeliveryMinutes(e.target.value)}
                      className="mt-1 h-9 w-full rounded-lg border border-[#172B3A]/15 bg-white px-2.5 font-mono text-xs disabled:bg-slate-100"
                    />
                  </div>
                </div>

                {deliveryAvailable && (
                  <div className="rounded-lg border border-[#176B52]/20 bg-white p-2.5">
                    <label className="block text-[11px] font-semibold text-[#172B3A]">
                      Provider-Covered Delivery Radius (0 to X km)
                    </label>
                    <div className="mt-1 flex items-center gap-2">
                      <span className="font-mono text-[11px] text-[#172B3A]/70">0 km →</span>
                      <input
                        type="number"
                        min={0}
                        step="0.5"
                        value={freeDeliveryMaxKm}
                        onChange={(e) => setFreeDeliveryMaxKm(e.target.value)}
                        placeholder="0"
                        className="h-9 w-28 rounded-lg border border-[#172B3A]/15 bg-[#F4F6F5]/40 px-2.5 font-mono text-xs"
                      />
                      <span className="font-mono text-[11px] text-[#172B3A]/70">km</span>
                    </div>
                    <p className="mt-1 text-[10px] text-[#172B3A]/65">
                      {Number(freeDeliveryMaxKm) > 0
                        ? `0 to ${Number(freeDeliveryMaxKm)} km delivery is covered by you (0 ETB for buyer). Beyond ${Number(freeDeliveryMaxKm)} km, buyer pays distance delivery.`
                        : 'Set X > 0 to cover delivery from 0 to X km; when 0, buyer pays distance delivery (no extra delivery fee needed).'}
                    </p>
                  </div>
                )}

                <div className="space-y-2 rounded-lg border border-[#F4A62A]/45 bg-amber-50/50 p-3">
                  <p className="text-[11px] font-bold text-[#172B3A]">
                    Tax Responsibility (Required — Seller Must Confirm First)
                  </p>
                  <div className="grid gap-2 sm:grid-cols-2">
                    <label
                      className={`flex cursor-pointer items-start gap-2 rounded-lg border p-2.5 transition-colors ${
                        taxResponsibility === 'SELLER'
                          ? 'border-[#176B52] bg-emerald-50/70'
                          : 'border-[#172B3A]/15 bg-white hover:border-[#172B3A]/30'
                      }`}
                    >
                      <input
                        type="radio"
                        name="publishTaxResponsibility"
                        checked={taxResponsibility === 'SELLER'}
                        onChange={() => {
                          setTaxResponsibility('SELLER');
                          setTaxConfirmed(false);
                        }}
                        className="mt-0.5 accent-[#176B52]"
                      />
                      <div>
                        <p className="text-[11px] font-bold text-[#172B3A]">
                          Tax from Seller (Included)
                        </p>
                        <p className="text-[10px] text-[#172B3A]/70">
                          Buyer pays only the visible amount; no tax will be added at checkout.
                        </p>
                      </div>
                    </label>
                    <label
                      className={`flex cursor-pointer items-start gap-2 rounded-lg border p-2.5 transition-colors ${
                        taxResponsibility === 'BUYER'
                          ? 'border-[#176B52] bg-emerald-50/70'
                          : 'border-[#172B3A]/15 bg-white hover:border-[#172B3A]/30'
                      }`}
                    >
                      <input
                        type="radio"
                        name="publishTaxResponsibility"
                        checked={taxResponsibility === 'BUYER'}
                        onChange={() => {
                          setTaxResponsibility('BUYER');
                          setTaxConfirmed(false);
                        }}
                        className="mt-0.5 accent-[#176B52]"
                      />
                      <div>
                        <p className="text-[11px] font-bold text-[#172B3A]">
                          Tax from Buyer (Added)
                        </p>
                        <p className="text-[10px] text-[#172B3A]/70">
                          VAT is added on top of the visible price at checkout.
                        </p>
                      </div>
                    </label>
                  </div>
                  <label className="flex cursor-pointer items-start gap-2 pt-1 text-[11px] font-semibold text-[#172B3A]">
                    <input
                      type="checkbox"
                      checked={taxConfirmed}
                      disabled={!taxResponsibility}
                      onChange={(e) => setTaxConfirmed(e.target.checked)}
                      className="mt-0.5 h-3.5 w-3.5 accent-[#176B52]"
                    />
                    <span>
                      {taxResponsibility === 'SELLER'
                        ? 'I confirm that tax is from the seller: buyer pays only the visible amount and no tax will be added at checkout.'
                        : taxResponsibility === 'BUYER'
                          ? 'I confirm that tax is from the buyer: VAT will be added on top of the visible price at checkout.'
                          : 'Select one of the tax options above, then check here to confirm before publishing.'}
                    </span>
                  </label>
                </div>

                <div className="space-y-2 border-t border-[#172B3A]/10 pt-2">
                  <label className="block text-[11px] font-medium text-[#172B3A]/75">
                    Unsatisfied Buyer Return Policy
                  </label>
                  <select
                    value={returnable ? 'RETURNABLE' : 'NON_RETURNABLE'}
                    onChange={(e) => setReturnable(e.target.value === 'RETURNABLE')}
                    className="h-9 w-full rounded-lg border border-[#172B3A]/15 bg-white px-2.5 text-xs"
                  >
                    <option value="RETURNABLE">Can Be Returned (Specify Loss Below)</option>
                    <option value="NON_RETURNABLE">Cannot Be Returned (Final Sale — 100% Loss)</option>
                  </select>

                  {returnable && (
                    <div className="grid gap-2 sm:grid-cols-3">
                      <div>
                        <label className="block text-[10px] font-medium text-[#172B3A]/70">
                          Window (Days)
                        </label>
                        <input
                          type="number"
                          min={1}
                          value={returnWindowDays}
                          onChange={(e) => setReturnWindowDays(e.target.value)}
                          className="mt-1 h-9 w-full rounded-lg border border-[#172B3A]/15 bg-white px-2 font-mono text-xs"
                        />
                      </div>
                      <div>
                        <label className="block text-[10px] font-medium text-[#172B3A]/70">
                          Buyer Loss (%)
                        </label>
                        <input
                          type="number"
                          min={0}
                          max={100}
                          value={returnLossPercent}
                          onChange={(e) => setReturnLossPercent(e.target.value)}
                          className="mt-1 h-9 w-full rounded-lg border border-[#172B3A]/15 bg-white px-2 font-mono text-xs"
                        />
                      </div>
                      <div>
                        <label className="block text-[10px] font-medium text-[#172B3A]/70">
                          Fixed Loss (ETB)
                        </label>
                        <input
                          type="number"
                          min={0}
                          value={returnLossFixedEtb}
                          onChange={(e) => setReturnLossFixedEtb(e.target.value)}
                          className="mt-1 h-9 w-full rounded-lg border border-[#172B3A]/15 bg-white px-2 font-mono text-xs"
                        />
                      </div>
                    </div>
                  )}

                  <label className="inline-flex cursor-pointer items-center gap-2 text-[11px] font-medium text-[#172B3A]">
                    <input
                      type="checkbox"
                      checked={!returnable || deliveryFeeNonRefundableOnReturn}
                      disabled={!returnable}
                      onChange={(e) => setDeliveryFeeNonRefundableOnReturn(e.target.checked)}
                      className="h-3.5 w-3.5 accent-[#176B52]"
                    />
                    Buyer loses delivery fee if returned unsatisfied
                  </label>

                  <input
                    type="text"
                    value={returnPolicyNote}
                    onChange={(e) => setReturnPolicyNote(e.target.value)}
                    placeholder="Return condition note (optional)"
                    className="h-9 w-full rounded-lg border border-[#172B3A]/15 bg-white px-2.5 text-xs"
                  />

                  {(() => {
                    const sampleItem = Number(discountPrice || basePrice) || 0;
                    const freeKm = deliveryAvailable ? Math.max(0, Number(freeDeliveryMaxKm) || 0) : 0;
                    const sampleDeliv = deliveryAvailable && freeKm === 0 ? 120 : 0;
                    const loss = calculateReturnLoss(sampleItem, sampleDeliv, {
                      returnable,
                      returnLossPercent: Number(returnLossPercent) || 0,
                      returnLossFixedEtb: Number(returnLossFixedEtb) || 0,
                      deliveryFeeNonRefundableOnReturn:
                        !returnable || deliveryFeeNonRefundableOnReturn,
                    });
                    return (
                      <p className="rounded bg-white px-2.5 py-1.5 font-mono text-[11px] tabular-nums text-[#172B3A]/80 border border-[#172B3A]/10">
                        Sample return loss (1 unit @ {formatEtb(sampleItem)}
                        {freeKm > 0
                          ? ` + 0 ETB delivery within 0–${freeKm} km`
                          : ` + ${formatEtb(sampleDeliv)} delivery`}
                        ): Buyer loses {formatEtb(loss.totalLossEtb)} · Refund {formatEtb(loss.refundEtb)}
                      </p>
                    );
                  })()}
                </div>
              </div>
            )}

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

          <div className="min-w-0 space-y-3 lg:col-span-7">
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
                      <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
                        <span className="text-[#172B3A]/70">
                          {formatPricingModelLabel(item.pricingModel, language)} / {item.pricingUnit}
                        </span>
                        <div className="flex items-center gap-2">
                          {onEditListing && (
                            <button
                              type="button"
                              onClick={() => onEditListing(item)}
                              className="inline-flex min-h-[38px] items-center gap-1 rounded-md border border-[#176B52]/30 bg-emerald-50 px-3 py-1 font-semibold text-[#176B52] hover:bg-emerald-100"
                            >
                              <Pencil className="h-3 w-3" />
                              View &amp; Edit
                            </button>
                          )}
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
                            {formatPricingModelLabel(item.pricingModel, language)} / {item.pricingUnit}
                          </td>
                          <td className="px-4 py-3 font-mono font-semibold tabular-nums text-[#176B52]">
                            {formatEtb(item.discountPrice || item.basePrice)}
                          </td>
                          <td className="px-4 py-3 text-right">
                            <div className="inline-flex items-center justify-end gap-1.5">
                              {onEditListing && (
                                <button
                                  type="button"
                                  onClick={() => onEditListing(item)}
                                  className="inline-flex items-center gap-1 rounded-md border border-[#176B52]/30 bg-emerald-50 px-2.5 py-1 font-semibold text-[#176B52] hover:bg-emerald-100"
                                >
                                  <Pencil className="h-3 w-3" />
                                  Edit
                                </button>
                              )}
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
                            </div>
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
              orders.map((o) => {
                const isPendingRequest = o.orderStatus === 'REQUESTED' || o.orderStatus === 'PENDING';
                const readyMinVal =
                  orderReadyMins[o.id] ?? String(o.estimatedReadyMinutes ?? (o.orderType === 'FOOD' ? 25 : 15));
                const deliveryMinVal =
                  orderDeliveryMins[o.id] ?? String(o.estimatedDeliveryMinutes ?? (o.orderType === 'FOOD' ? 45 : 60));
                const rejectReasonVal = orderRejectReason[o.id] ?? '';
                const snap = o.returnPolicySnapshot;

                return (
                  <div key={o.id} className="rounded-xl border border-[#172B3A]/10 bg-white p-4 text-xs space-y-3">
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-mono font-bold text-[#172B3A]">{o.orderNumber}</span>
                      <span className="font-mono font-bold text-[#176B52]">{formatEtb(o.totalAmount)}</span>
                    </div>
                    <p className="text-[#172B3A]/75">
                      {o.customerName} · {o.fulfillmentType} ({o.deliveryAddress}) ·{' '}
                      <strong className="text-[#176B52]">{o.orderStatus}</strong>
                    </p>
                    <p className="font-mono text-[11px] text-[#172B3A]/75">
                      Payment: {o.paymentMethod} ·{' '}
                      <strong
                        className={
                          o.paymentStatus === 'SUCCESSFUL' ? 'text-[#176B52]' : 'text-amber-700'
                        }
                      >
                        {o.paymentStatus}
                      </strong>
                    </p>
                    <p className="font-mono text-[11px] tabular-nums text-[#172B3A]/70">
                      {o.immediateAcceptance ? 'Immediate Acceptance' : 'Order Request'} · Ready:{' '}
                      {formatEtaClock(o.estimatedReadyAt, o.estimatedReadyMinutes)}
                      {o.fulfillmentType === 'DELIVERY' &&
                        ` · Delivery: ${formatEtaClock(o.estimatedDeliveryAt, o.estimatedDeliveryMinutes)}`}
                    </p>
                    {snap && (
                      <p className="text-[11px] text-[#172B3A]/65">
                        Return Policy:{' '}
                        {snap.returnable
                          ? `${snap.returnWindowDays}d · Loss ${formatEtb(snap.estimatedTotalLossOnReturnEtb ?? 0)}${
                              snap.deliveryFeeNonRefundableOnReturn ? ' (loses delivery fee)' : ''
                            }`
                          : 'Non-Returnable'}
                      </p>
                    )}
                    {o.rejectionReason && (
                      <p className="text-[11px] font-medium text-red-700">
                        Rejected: {o.rejectionReason}
                      </p>
                    )}

                    {isPendingRequest && (
                      <div className="space-y-2 rounded-lg border border-amber-200 bg-amber-50/70 p-3">
                        <p className="font-semibold text-amber-950">
                          Review Order Request &amp; Confirm Ready / Delivery Time
                        </p>
                        <div className="grid grid-cols-2 gap-2">
                          <div>
                            <label className="block text-[10px] font-medium text-[#172B3A]/75">
                              Ready in (min)
                            </label>
                            <input
                              type="number"
                              min={5}
                              value={readyMinVal}
                              onChange={(e) =>
                                setOrderReadyMins((p) => ({ ...p, [o.id]: e.target.value }))
                              }
                              className="mt-0.5 h-8 w-full rounded border border-[#172B3A]/20 bg-white px-2 font-mono text-xs"
                            />
                          </div>
                          <div>
                            <label className="block text-[10px] font-medium text-[#172B3A]/75">
                              Deliverable in (min)
                            </label>
                            <input
                              type="number"
                              min={5}
                              value={deliveryMinVal}
                              onChange={(e) =>
                                setOrderDeliveryMins((p) => ({ ...p, [o.id]: e.target.value }))
                              }
                              className="mt-0.5 h-8 w-full rounded border border-[#172B3A]/20 bg-white px-2 font-mono text-xs"
                            />
                          </div>
                        </div>
                        <input
                          type="text"
                          value={rejectReasonVal}
                          onChange={(e) =>
                            setOrderRejectReason((p) => ({ ...p, [o.id]: e.target.value }))
                          }
                          placeholder="Optional rejection reason..."
                          className="h-8 w-full rounded border border-[#172B3A]/20 bg-white px-2 text-xs"
                        />
                        <div className="flex flex-wrap gap-2">
                          <button
                            type="button"
                            onClick={() =>
                              handleUpdateOrderStatus(o.id, 'ACCEPTED', {
                                estimatedReadyMinutes: Math.max(5, Number(readyMinVal) || 20),
                                estimatedDeliveryMinutes: Math.max(5, Number(deliveryMinVal) || 45),
                              })
                            }
                            className="min-h-[36px] rounded bg-[#176B52] px-3 py-1 text-[11px] font-semibold text-white hover:bg-[#125641]"
                          >
                            Accept Order
                          </button>
                          <button
                            type="button"
                            onClick={() =>
                              handleUpdateOrderStatus(o.id, 'REJECTED', {
                                rejectionReason: rejectReasonVal.trim() || 'Declined by seller',
                              })
                            }
                            className="min-h-[36px] rounded border border-red-200 bg-white px-3 py-1 text-[11px] font-semibold text-red-700 hover:bg-red-50"
                          >
                            Reject
                          </button>
                        </div>
                      </div>
                    )}

                    <div className="flex flex-wrap gap-2">
                      {(() => {
                        const matchedPtx = paymentTransactions.find(
                          (ptx) => ptx.transactionType === 'ORDER' && ptx.referenceId === o.id
                        );
                        if (o.paymentStatus !== 'SUCCESSFUL' && !matchedPtx) return null;
                        return (
                          <button
                            type="button"
                            onClick={() =>
                              setPaymentDetailsModal({
                                transaction: matchedPtx || null,
                                lookup: matchedPtx
                                  ? null
                                  : {
                                      transactionType: 'ORDER',
                                      referenceId: o.id,
                                      referenceCode: o.orderNumber,
                                      customerName: o.customerName,
                                      paymentMethod: o.paymentMethod,
                                      paymentStatus: o.paymentStatus,
                                      grossAmount: o.totalAmount,
                                      taxAmount: o.taxAmount,
                                      createdAt: o.createdAt,
                                    },
                              })
                            }
                            className="inline-flex min-h-[38px] items-center gap-1.5 rounded border border-[#176B52]/30 bg-emerald-50/70 px-3 py-1 text-[11px] font-semibold text-[#176B52] hover:bg-emerald-100"
                          >
                            <Receipt className="h-3.5 w-3.5" />
                            Payment Details
                          </button>
                        );
                      })()}
                      <button
                        type="button"
                        onClick={() =>
                          setChatDrawerTarget({
                            threadKey: `order:${o.id}`,
                            orderId: o.id,
                            businessId: o.businessId,
                            recipientUid: o.customerUid,
                            title: `Order ${o.orderNumber} · Live Chat`,
                            subtitle: o.customerName,
                          })
                        }
                        className="inline-flex min-h-[38px] items-center gap-1.5 rounded bg-[#176B52] px-3 py-1 text-[11px] font-semibold text-white hover:bg-[#125641]"
                      >
                        <MessageSquare className="h-3.5 w-3.5" />
                        Live Chat
                      </button>
                      {!isPendingRequest &&
                        o.orderStatus !== 'REJECTED' &&
                        o.orderStatus !== 'CANCELLED' &&
                        o.orderStatus !== 'COMPLETED' &&
                        ['PREPARING', 'READY', 'OUT_FOR_DELIVERY', 'COMPLETED'].map((st) => (
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
                );
              })
            )}
          </div>

          <div className="hidden md:block overflow-x-auto rounded-2xl border border-[#172B3A]/10 bg-white">
            <table className="w-full min-w-[780px] text-left text-xs">
              <thead className="border-b border-[#172B3A]/10 bg-[#F4F6F5] text-[#172B3A]/70">
                <tr>
                  <th className="px-4 py-3 font-semibold">Order Ref &amp; Policy</th>
                  <th className="px-4 py-3 font-semibold">Customer &amp; ETA</th>
                  <th className="px-4 py-3 font-semibold">Total (ETB)</th>
                  <th className="px-4 py-3 font-semibold">Status</th>
                  <th className="px-4 py-3 font-semibold text-right">Acceptance, Fulfillment &amp; Chat</th>
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
                  orders.map((o) => {
                    const isPendingRequest =
                      o.orderStatus === 'REQUESTED' || o.orderStatus === 'PENDING';
                    const readyMinVal =
                      orderReadyMins[o.id] ??
                      String(o.estimatedReadyMinutes ?? (o.orderType === 'FOOD' ? 25 : 15));
                    const deliveryMinVal =
                      orderDeliveryMins[o.id] ??
                      String(o.estimatedDeliveryMinutes ?? (o.orderType === 'FOOD' ? 45 : 60));
                    const rejectReasonVal = orderRejectReason[o.id] ?? '';
                    const snap = o.returnPolicySnapshot;

                    return (
                      <tr key={o.id} className="align-top">
                        <td className="px-4 py-3">
                          <p className="font-mono font-semibold text-[#172B3A]">{o.orderNumber}</p>
                          <p className="mt-0.5 text-[11px] text-[#172B3A]/65">
                            {o.immediateAcceptance ? 'Immediate Acceptance' : 'Order Request'} ·{' '}
                            {o.orderType}
                          </p>
                          {snap && (
                            <p className="mt-0.5 text-[10px] text-[#172B3A]/60">
                              {snap.returnable
                                ? `Return ${snap.returnWindowDays}d (Loss ${formatEtb(snap.estimatedTotalLossOnReturnEtb ?? 0)})`
                                : 'Non-Returnable'}
                            </p>
                          )}
                        </td>
                        <td className="px-4 py-3">
                          <p className="font-medium text-[#172B3A]">
                            {o.customerName} · {o.fulfillmentType}
                          </p>
                          <p className="text-[11px] text-[#172B3A]/65">{o.deliveryAddress}</p>
                          <p className="mt-0.5 font-mono text-[11px] tabular-nums text-[#176B52]">
                            Ready: {formatEtaClock(o.estimatedReadyAt, o.estimatedReadyMinutes)}
                            {o.fulfillmentType === 'DELIVERY' &&
                              ` · Delivery: ${formatEtaClock(o.estimatedDeliveryAt, o.estimatedDeliveryMinutes)}`}
                          </p>
                          {o.rejectionReason && (
                            <p className="mt-0.5 text-[11px] text-red-700">
                              Reason: {o.rejectionReason}
                            </p>
                          )}
                        </td>
                        <td className="px-4 py-3 font-mono font-semibold tabular-nums">
                          {formatEtb(o.totalAmount)}
                        </td>
                        <td className="px-4 py-3">
                          <p className="font-semibold text-[#176B52]">{o.orderStatus}</p>
                          <p
                            className={`mt-0.5 font-mono text-[10px] font-semibold ${
                              o.paymentStatus === 'SUCCESSFUL'
                                ? 'text-[#176B52]'
                                : 'text-amber-700'
                            }`}
                          >
                            {o.paymentMethod} · {o.paymentStatus}
                          </p>
                        </td>
                        <td className="px-4 py-3 text-right">
                          <div className="inline-flex flex-col items-end gap-2">
                            {isPendingRequest && (
                              <div className="flex flex-wrap items-center justify-end gap-1.5 rounded-lg border border-amber-200 bg-amber-50/70 p-2">
                                <label className="text-[10px] text-[#172B3A]/75">
                                  Ready
                                  <input
                                    type="number"
                                    min={5}
                                    value={readyMinVal}
                                    onChange={(e) =>
                                      setOrderReadyMins((p) => ({ ...p, [o.id]: e.target.value }))
                                    }
                                    className="ml-1 h-7 w-14 rounded border border-[#172B3A]/20 bg-white px-1.5 font-mono text-[11px]"
                                  />
                                  m
                                </label>
                                <label className="text-[10px] text-[#172B3A]/75">
                                  Deliv
                                  <input
                                    type="number"
                                    min={5}
                                    value={deliveryMinVal}
                                    onChange={(e) =>
                                      setOrderDeliveryMins((p) => ({ ...p, [o.id]: e.target.value }))
                                    }
                                    className="ml-1 h-7 w-14 rounded border border-[#172B3A]/20 bg-white px-1.5 font-mono text-[11px]"
                                  />
                                  m
                                </label>
                                <input
                                  type="text"
                                  value={rejectReasonVal}
                                  onChange={(e) =>
                                    setOrderRejectReason((p) => ({ ...p, [o.id]: e.target.value }))
                                  }
                                  placeholder="Reject reason"
                                  className="h-7 w-28 rounded border border-[#172B3A]/20 bg-white px-2 text-[11px]"
                                />
                                <button
                                  type="button"
                                  onClick={() =>
                                    handleUpdateOrderStatus(o.id, 'ACCEPTED', {
                                      estimatedReadyMinutes: Math.max(5, Number(readyMinVal) || 20),
                                      estimatedDeliveryMinutes: Math.max(
                                        5,
                                        Number(deliveryMinVal) || 45
                                      ),
                                    })
                                  }
                                  className="rounded bg-[#176B52] px-2.5 py-1 text-[11px] font-semibold text-white hover:bg-[#125641]"
                                >
                                  Accept Order
                                </button>
                                <button
                                  type="button"
                                  onClick={() =>
                                    handleUpdateOrderStatus(o.id, 'REJECTED', {
                                      rejectionReason:
                                        rejectReasonVal.trim() || 'Declined by seller',
                                    })
                                  }
                                  className="rounded border border-red-200 bg-white px-2.5 py-1 text-[11px] font-semibold text-red-700 hover:bg-red-50"
                                >
                                  Reject
                                </button>
                              </div>
                            )}

                            <div className="inline-flex flex-wrap items-center justify-end gap-1.5">
                              {(() => {
                                const matchedPtx = paymentTransactions.find(
                                  (ptx) => ptx.transactionType === 'ORDER' && ptx.referenceId === o.id
                                );
                                if (o.paymentStatus !== 'SUCCESSFUL' && !matchedPtx) return null;
                                return (
                                  <button
                                    type="button"
                                    onClick={() =>
                                      setPaymentDetailsModal({
                                        transaction: matchedPtx || null,
                                        lookup: matchedPtx
                                          ? null
                                          : {
                                              transactionType: 'ORDER',
                                              referenceId: o.id,
                                              referenceCode: o.orderNumber,
                                              customerName: o.customerName,
                                              paymentMethod: o.paymentMethod,
                                              paymentStatus: o.paymentStatus,
                                              grossAmount: o.totalAmount,
                                              taxAmount: o.taxAmount,
                                              createdAt: o.createdAt,
                                            },
                                      })
                                    }
                                    className="inline-flex items-center gap-1 rounded border border-[#176B52]/30 bg-emerald-50/70 px-2.5 py-1 text-[11px] font-semibold text-[#176B52] hover:bg-emerald-100"
                                  >
                                    <Receipt className="h-3 w-3" />
                                    Payment Details
                                  </button>
                                );
                              })()}
                              <button
                                type="button"
                                onClick={() =>
                                  setChatDrawerTarget({
                                    threadKey: `order:${o.id}`,
                                    orderId: o.id,
                                    businessId: o.businessId,
                                    recipientUid: o.customerUid,
                                    title: `Order ${o.orderNumber} · Live Chat`,
                                    subtitle: o.customerName,
                                  })
                                }
                                className="inline-flex items-center gap-1 rounded bg-[#176B52] px-2.5 py-1 text-[11px] font-semibold text-white hover:bg-[#125641]"
                              >
                                <MessageSquare className="h-3 w-3" />
                                Live Chat
                              </button>
                              {!isPendingRequest &&
                                o.orderStatus !== 'REJECTED' &&
                                o.orderStatus !== 'CANCELLED' &&
                                o.orderStatus !== 'COMPLETED' &&
                                ['PREPARING', 'READY', 'OUT_FOR_DELIVERY', 'COMPLETED'].map(
                                  (st) => (
                                    <button
                                      key={st}
                                      type="button"
                                      onClick={() => handleUpdateOrderStatus(o.id, st)}
                                      className="rounded border border-[#172B3A]/15 px-2 py-1 text-[11px] font-medium hover:bg-[#F4F6F5]"
                                    >
                                      {st.replace(/_/g, ' ')}
                                    </button>
                                  )
                                )}
                            </div>
                          </div>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {tab === 'BOOKINGS' && (
        <div className="space-y-4">
          <ContractOfferSection
            isOwner
            refreshSignal={contractRefreshSignal}
            onContractChanged={() => {
              setContractRefreshSignal((n) => n + 1);
              loadPortalData();
            }}
          />

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
                  <p className="font-mono text-[11px] text-[#172B3A]/75">
                    Payment: {b.paymentMethod} ·{' '}
                    <strong
                      className={
                        b.paymentStatus === 'SUCCESSFUL' ? 'text-[#176B52]' : 'text-amber-700'
                      }
                    >
                      {b.paymentStatus}
                    </strong>
                  </p>
                  <div className="flex flex-wrap gap-2">
                    {(() => {
                      const matchedPtx = paymentTransactions.find(
                        (ptx) => ptx.transactionType === 'BOOKING' && ptx.referenceId === b.id
                      );
                      if (b.paymentStatus !== 'SUCCESSFUL' && !matchedPtx) return null;
                      return (
                        <button
                          type="button"
                          onClick={() =>
                            setPaymentDetailsModal({
                              transaction: matchedPtx || null,
                              lookup: matchedPtx
                                ? null
                                : {
                                    transactionType: 'BOOKING',
                                    referenceId: b.id,
                                    referenceCode: b.bookingReference,
                                    customerName: b.customerName,
                                    paymentMethod: b.paymentMethod,
                                    paymentStatus: b.paymentStatus,
                                    grossAmount: b.quotedPrice || b.agreedPrice,
                                    createdAt: b.createdAt,
                                  },
                            })
                          }
                          className="inline-flex min-h-[38px] items-center gap-1.5 rounded border border-[#176B52]/30 bg-emerald-50/70 px-3 py-1.5 font-semibold text-[#176B52] hover:bg-emerald-100"
                        >
                          <Receipt className="h-3.5 w-3.5" />
                          Payment Details
                        </button>
                      );
                    })()}
                    <button
                      type="button"
                      onClick={() =>
                        setChatDrawerTarget({
                          threadKey: `booking:${b.id}`,
                          bookingId: b.id,
                          businessId: b.businessId,
                          listingId: b.listingId,
                          recipientUid: b.customerUid,
                          title: `${b.bookingReference} · Live Chat`,
                          subtitle: b.customerName,
                          enableContracts: true,
                          isOwner: true,
                        })
                      }
                      className="inline-flex min-h-[38px] items-center gap-1.5 rounded bg-[#176B52] px-3 py-1.5 font-semibold text-white hover:bg-[#125641]"
                    >
                      <MessageSquare className="h-3.5 w-3.5" />
                      Live Chat &amp; Contracts
                    </button>
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
                      className="min-h-[38px] rounded bg-[#172B3A] px-3 py-1.5 font-semibold text-white"
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
                  <th className="px-4 py-3 font-semibold">Reference</th>
                  <th className="px-4 py-3 font-semibold">Schedule</th>
                  <th className="px-4 py-3 font-semibold">Agreed Price</th>
                  <th className="px-4 py-3 font-semibold">Status</th>
                  <th className="px-4 py-3 font-semibold text-right">Actions &amp; Live Chat</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#172B3A]/10">
                {bookings.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="px-4 py-10 text-center text-[#172B3A]/60">
                      No service requests or bookings yet.
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
                      <td className="px-4 py-3">
                        <p className="font-semibold text-[#176B52]">{b.bookingStatus}</p>
                        <p
                          className={`mt-0.5 font-mono text-[10px] font-semibold ${
                            b.paymentStatus === 'SUCCESSFUL' ? 'text-[#176B52]' : 'text-amber-700'
                          }`}
                        >
                          {b.paymentMethod} · {b.paymentStatus}
                        </p>
                      </td>
                      <td className="px-4 py-3 text-right">
                        <div className="inline-flex flex-wrap items-center justify-end gap-1.5">
                          {(() => {
                            const matchedPtx = paymentTransactions.find(
                              (ptx) => ptx.transactionType === 'BOOKING' && ptx.referenceId === b.id
                            );
                            if (b.paymentStatus !== 'SUCCESSFUL' && !matchedPtx) return null;
                            return (
                              <button
                                type="button"
                                onClick={() =>
                                  setPaymentDetailsModal({
                                    transaction: matchedPtx || null,
                                    lookup: matchedPtx
                                      ? null
                                      : {
                                          transactionType: 'BOOKING',
                                          referenceId: b.id,
                                          referenceCode: b.bookingReference,
                                          customerName: b.customerName,
                                          paymentMethod: b.paymentMethod,
                                          paymentStatus: b.paymentStatus,
                                          grossAmount: b.quotedPrice || b.agreedPrice,
                                          createdAt: b.createdAt,
                                        },
                                  })
                                }
                                className="inline-flex items-center gap-1 rounded border border-[#176B52]/30 bg-emerald-50/70 px-2.5 py-1 font-semibold text-[#176B52] hover:bg-emerald-100"
                              >
                                <Receipt className="h-3 w-3" />
                                Payment Details
                              </button>
                            );
                          })()}
                          <button
                            type="button"
                            onClick={() =>
                              setChatDrawerTarget({
                                threadKey: `booking:${b.id}`,
                                bookingId: b.id,
                                businessId: b.businessId,
                                listingId: b.listingId,
                                recipientUid: b.customerUid,
                                title: `${b.bookingReference} · Live Chat`,
                                subtitle: b.customerName,
                                enableContracts: true,
                                isOwner: true,
                              })
                            }
                            className="inline-flex items-center gap-1 rounded bg-[#176B52] px-2.5 py-1 font-semibold text-white hover:bg-[#125641]"
                          >
                            <MessageSquare className="h-3 w-3" />
                            Live Chat &amp; Contracts
                          </button>
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
                            className="rounded bg-[#172B3A] px-2.5 py-1 font-semibold text-white"
                          >
                            Complete
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {tab === 'MESSAGES' && (
        <div className="grid gap-5 lg:grid-cols-12">
          <div className="min-w-0 space-y-2 rounded-2xl border border-[#172B3A]/10 bg-white p-3.5 sm:p-4 lg:col-span-5">
            <div className="flex items-center justify-between border-b border-[#172B3A]/10 pb-2.5">
              <h2 className="font-display text-sm font-bold text-[#172B3A]">
                Client Inquiries &amp; Order Live Chats ({threads.length})
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
              <p className="py-10 text-center text-xs text-[#172B3A]/60">
                No client messages or order chats yet. Incoming messages from customers appear here
                automatically in real time.
              </p>
            ) : (
              <div className="max-h-[440px] space-y-2 overflow-y-auto overflow-x-hidden pr-1">
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
                          {th.otherPartyName || 'Client'}
                        </span>
                        <span className="shrink-0 font-mono text-[10px] font-semibold text-[#176B52]">
                          {th.orderNumber
                            ? th.orderNumber
                            : th.bookingReference
                              ? th.bookingReference
                              : 'CONTACT'}
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
                  <div className="flex h-72 items-center justify-center rounded-2xl border border-[#172B3A]/10 bg-white p-8 text-center text-xs text-[#172B3A]/60">
                    Select a client conversation on the left to write a reply.
                  </div>
                );
              }
              return (
                <>
                  <LiveChatPanel
                    threadKey={activeThreadKey}
                    businessId={selected?.businessId}
                    listingId={selected?.listingId}
                    orderId={selected?.orderId}
                    bookingId={selected?.bookingId}
                    recipientUid={selected?.otherPartyUid}
                    title={`Reply to ${selected?.otherPartyName || 'Client'}`}
                    subtitle={
                      selected
                        ? selected.orderNumber
                          ? `Order ${selected.orderNumber} (${selected.orderStatus || 'ACTIVE'})`
                          : selected.listingTitle || selected.businessName
                        : 'Loading conversation...'
                    }
                    initialLastSeenAt={selected?.otherPartyLastSeenAt}
                    initialActiveLastMinute={selected?.otherPartyActiveLastMinute}
                    placeholder="Write a message to reply..."
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
                      isOwner
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

      {tab === 'PAYOUTS' && (
        <div className="space-y-6">
          <div className="grid gap-6 lg:grid-cols-12">
            <form
              onSubmit={handleSaveBusinessPayout}
              className="space-y-4 rounded-2xl border border-[#172B3A]/10 bg-white p-5 sm:p-6 lg:col-span-5"
            >
              <div className="border-b border-[#172B3A]/10 pb-3">
                <h2 className="flex items-center gap-2 font-display text-lg font-bold text-[#172B3A]">
                  <Landmark className="h-5 w-5 text-[#176B52]" />
                  Service Provider Own Sales Account
                </h2>
                <p className="mt-1 text-xs text-[#172B3A]/65">
                  Configure your business&apos;s own Ethiopian bank, Telebirr, and Payo details so
                  your sales settle directly to your account via Chapa &amp; Payo.
                </p>
              </div>

              {ownedBusinesses.length === 0 ? (
                <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-xs text-amber-950">
                  Register a business first to bind a storefront payout account, or set your personal
                  driver/freelancer payout account under Account Profile → Payout Account.
                </div>
              ) : (
                <>
                  <div>
                    <label className="block text-xs font-medium text-[#172B3A]/75">
                      Select Business
                    </label>
                    <select
                      value={payoutBizId}
                      onChange={(e) => handleSelectPayoutBusiness(Number(e.target.value))}
                      className="mt-1 h-10 w-full rounded-lg border border-[#172B3A]/15 bg-[#F4F6F5] px-3 text-xs font-semibold"
                    >
                      {ownedBusinesses.map((b) => (
                        <option key={b.id} value={b.id}>
                          {b.businessName} ({b.subCity})
                        </option>
                      ))}
                    </select>
                  </div>

                  {(() => {
                    const activeBiz = ownedBusinesses.find((b) => b.id === payoutBizId);
                    if (!activeBiz?.chapaSubaccountId) return null;
                    return (
                      <div className="rounded-lg border border-[#176B52]/25 bg-emerald-50/50 px-3 py-2 font-mono text-[11px] font-semibold text-[#176B52]">
                        Active Chapa Subaccount ID: {activeBiz.chapaSubaccountId}
                      </div>
                    );
                  })()}

                  <div className="grid gap-3 sm:grid-cols-2">
                    <div>
                      <label className="block text-xs font-medium text-[#172B3A]/75">
                        Settlement Bank
                      </label>
                      <select
                        value={payoutBankCode}
                        onChange={(e) => {
                          const code = e.target.value;
                          setPayoutBankCode(code);
                          const bk = banks.find((x) => x.code === code);
                          if (bk) setPayoutBankName(bk.name);
                        }}
                        className="mt-1 h-10 w-full rounded-lg border border-[#172B3A]/15 bg-[#F4F6F5] px-3 text-xs"
                      >
                        {(banks.length > 0
                          ? banks
                          : [
                              {
                                code: '130',
                                name: 'Commercial Bank of Ethiopia (CBE)',
                                currency: 'ETB',
                              },
                              { code: '855', name: 'Telebirr', currency: 'ETB' },
                            ]
                        ).map((bk) => (
                          <option key={bk.code} value={bk.code}>
                            {bk.name}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-[#172B3A]/75">
                        Account Number
                      </label>
                      <input
                        type="text"
                        value={payoutAccountNumber}
                        onChange={(e) => setPayoutAccountNumber(e.target.value)}
                        placeholder="e.g., 1000234567890"
                        className="mt-1 h-10 w-full rounded-lg border border-[#172B3A]/15 px-3 font-mono text-xs"
                      />
                    </div>
                  </div>

                  <div className="grid gap-3 sm:grid-cols-2">
                    <div>
                      <label className="block text-xs font-medium text-[#172B3A]/75">
                        Account Holder Name
                      </label>
                      <input
                        type="text"
                        value={payoutAccountName}
                        onChange={(e) => setPayoutAccountName(e.target.value)}
                        placeholder="Legal account name"
                        className="mt-1 h-10 w-full rounded-lg border border-[#172B3A]/15 px-3 text-xs"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-[#172B3A]/75">
                        Telebirr Wallet Number
                      </label>
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
                      <label className="block text-xs font-medium text-[#172B3A]/75">
                        Payo Account Handle
                      </label>
                      <input
                        type="text"
                        value={payoAccountHandle}
                        onChange={(e) => setPayoAccountHandle(e.target.value)}
                        placeholder="@business_payo"
                        className="mt-1 h-10 w-full rounded-lg border border-[#172B3A]/15 px-3 font-mono text-xs"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-[#172B3A]/75">
                        Preferred Payout Gateway
                      </label>
                      <select
                        value={preferredPayoutGateway}
                        onChange={(e) =>
                          setPreferredPayoutGateway(e.target.value as 'BOTH' | 'CHAPA' | 'PAYO')
                        }
                        className="mt-1 h-10 w-full rounded-lg border border-[#172B3A]/15 bg-[#F4F6F5] px-3 text-xs font-semibold"
                      >
                        <option value="BOTH">Both Chapa &amp; Payo</option>
                        <option value="CHAPA">Chapa Split Pay</option>
                        <option value="PAYO">Payo Direct</option>
                      </select>
                    </div>
                  </div>

                  <button
                    type="submit"
                    disabled={savingPayout}
                    className="w-full min-h-[44px] rounded-lg bg-[#176B52] px-4 py-2.5 text-xs font-semibold text-white hover:bg-[#125641] disabled:opacity-60"
                  >
                    {savingPayout
                      ? 'Saving & Provisioning Subaccount...'
                      : 'Save My Business Sales Account'}
                  </button>
                </>
              )}
            </form>

            <div className="space-y-4 rounded-2xl border border-[#172B3A]/10 bg-white p-5 sm:p-6 lg:col-span-7">
              <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[#172B3A]/10 pb-3">
                <div>
                  <h2 className="flex items-center gap-2 font-display text-lg font-bold text-[#172B3A]">
                    <Wallet className="h-5 w-5 text-[#176B52]" />
                    Chapa &amp; Payo Settlement Ledger ({paymentTransactions.length})
                  </h2>
                  <p className="mt-0.5 text-xs text-[#172B3A]/65">
                    {isAdmin || dbUser?.isAdmin
                      ? 'Shows net sales routed to provider accounts and platform commission collected.'
                      : 'Shows verified payouts and net sales routed directly to your own account.'}
                  </p>
                </div>
              </div>

              {paymentTransactions.length === 0 ? (
                <p className="py-12 text-center text-xs text-[#172B3A]/60">
                  No Chapa or Payo split payment transactions recorded yet.
                </p>
              ) : (
                <>
                  <div className="space-y-3 md:hidden">
                    {paymentTransactions.map((ptx) => (
                      <div
                        key={`mptx-${ptx.id}`}
                        className="rounded-xl border border-[#172B3A]/10 bg-[#F4F6F5]/50 p-3.5 text-xs space-y-1.5"
                      >
                        <div className="flex items-center justify-between gap-2 font-mono">
                          <span className="font-bold text-[#172B3A]">{ptx.txRef}</span>
                          <span className="font-bold text-[#176B52]">
                            {ptx.gateway} · {ptx.status}
                          </span>
                        </div>
                        <p className="text-[#172B3A]/75">
                          {ptx.transactionType} {ptx.referenceCode} · Gross:{' '}
                          <span className="font-mono font-semibold">
                            {formatEtb(Number(ptx.grossAmount))}
                          </span>
                        </p>
                        <p className="font-mono text-[11px] text-[#176B52]">
                          Your Net: {formatEtb(Number(ptx.providerAmount))} ({ptx.providerLegStatus})
                        </p>
                        {(isAdmin || dbUser?.isAdmin) && (
                          <p className="font-mono text-[11px] text-[#172B3A]/65">
                            Platform Comm: {formatEtb(Number(ptx.commissionAmount))} (
                            {ptx.commissionLegStatus})
                          </p>
                        )}
                        <div className="pt-1.5">
                          <button
                            type="button"
                            onClick={() => setPaymentDetailsModal({ transaction: ptx })}
                            className="inline-flex min-h-[36px] items-center gap-1.5 rounded-lg border border-[#176B52]/30 bg-white px-3 py-1 text-[11px] font-semibold text-[#176B52] hover:bg-emerald-50"
                          >
                            <Receipt className="h-3.5 w-3.5" />
                            Open Payment Details
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>

                  <div className="hidden md:block overflow-x-auto">
                    <table className="w-full min-w-[740px] text-left text-xs">
                      <thead className="border-b border-[#172B3A]/10 bg-[#F4F6F5] text-[#172B3A]/70">
                        <tr>
                          <th className="px-3 py-2.5 font-semibold">Tx Ref &amp; Order</th>
                          <th className="px-3 py-2.5 font-semibold">Gateway</th>
                          <th className="px-3 py-2.5 font-semibold text-right">Gross</th>
                          {(isAdmin || dbUser?.isAdmin) && (
                            <th className="px-3 py-2.5 font-semibold text-right">
                              Platform Commission
                            </th>
                          )}
                          <th className="px-3 py-2.5 font-semibold text-right">Your Net Sales</th>
                          <th className="px-3 py-2.5 font-semibold">Status</th>
                          <th className="px-3 py-2.5 font-semibold text-right">Receipt</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-[#172B3A]/10">
                        {paymentTransactions.map((ptx) => (
                          <tr
                            key={ptx.id}
                            onClick={() => setPaymentDetailsModal({ transaction: ptx })}
                            className="cursor-pointer transition-colors hover:bg-[#F4F6F5]/70"
                          >
                            <td className="px-3 py-2.5 font-mono text-[11px]">
                              <p className="font-semibold text-[#172B3A]">{ptx.txRef}</p>
                              <p className="text-[#172B3A]/60">
                                {ptx.transactionType} · {ptx.referenceCode}
                              </p>
                            </td>
                            <td className="px-3 py-2.5 font-mono text-[11px]">
                              <p className="font-semibold">{ptx.gateway}</p>
                              <p className="text-[10px] text-[#172B3A]/55">{ptx.gatewayMode}</p>
                            </td>
                            <td className="px-3 py-2.5 text-right font-mono tabular-nums">
                              {formatEtb(Number(ptx.grossAmount))}
                            </td>
                            {(isAdmin || dbUser?.isAdmin) && (
                              <td className="px-3 py-2.5 text-right font-mono tabular-nums text-[#172B3A]/75">
                                <p>{formatEtb(Number(ptx.commissionAmount))}</p>
                                <p className="text-[10px] text-[#172B3A]/50">
                                  {ptx.commissionLegStatus}
                                </p>
                              </td>
                            )}
                            <td className="px-3 py-2.5 text-right font-mono font-bold tabular-nums text-[#176B52]">
                              <p>{formatEtb(Number(ptx.providerAmount))}</p>
                              <p className="text-[10px] font-normal text-[#176B52]">
                                {ptx.providerPayoutAccountSnapshot?.summaryLabel ||
                                  ptx.providerLegStatus}
                              </p>
                            </td>
                            <td className="px-3 py-2.5 font-mono text-[11px] font-semibold text-[#176B52]">
                              {ptx.status}
                            </td>
                            <td className="px-3 py-2.5 text-right">
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setPaymentDetailsModal({ transaction: ptx });
                                }}
                                className="inline-flex items-center gap-1 rounded border border-[#176B52]/30 bg-emerald-50/70 px-2.5 py-1 text-[11px] font-semibold text-[#176B52] hover:bg-emerald-100"
                              >
                                <Receipt className="h-3 w-3" />
                                Details
                              </button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </>
              )}
            </div>
          </div>
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
      <LiveChatDrawer
        target={chatDrawerTarget}
        onClose={() => setChatDrawerTarget(null)}
        onMessageReceived={() => loadThreadsOnly()}
      />
      <PaymentDetailsModal
        open={Boolean(paymentDetailsModal)}
        transaction={paymentDetailsModal?.transaction}
        lookup={paymentDetailsModal?.lookup}
        viewerRole={isAdmin || dbUser?.isAdmin ? 'ADMIN' : 'RECEIVER'}
        onClose={() => setPaymentDetailsModal(null)}
      />
    </div>
  );
};
