import React, { useEffect, useMemo, useState } from 'react';
import {
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  ExternalLink,
  FileText,
  ImagePlus,
  Lock,
  Pencil,
  Play,
  ShieldAlert,
  ShieldCheck,
  Star,
  Upload,
  User,
  Video,
  X,
} from 'lucide-react';
import type { BookingRecord, Business, Listing, ListingMetadata, ReviewItem } from '../types/nearestyou.ts';
import { calculateDistanceKm, formatEtb } from '../utils/geo.ts';
import { formatPricingModelLabel } from '../utils/i18n.ts';
import {
  compressImageFile,
  extractYouTubeVideoId,
  getListingImages,
  getYouTubeEmbedUrl,
  MAX_PRODUCT_IMAGES,
  readFileAsDataUrl,
} from '../utils/media.ts';
import {
  getAdvertiserProfileName,
  getMessageTimeProviderLabel,
  getPublicProviderLabel,
  getPublicProviderRoleLabel,
  isServiceGiverOrJobSeeker,
} from '../utils/sellerDisplay.ts';
import { businessApi } from '../api/index.ts';
import { calculateReturnLoss, getListingPolicy } from '../utils/listingPolicy.ts';
import { ContractOfferSection } from './ContractOfferSection.tsx';
import { ListingVisual } from './ListingVisual.tsx';
import { LiveChatPanel } from './LiveChatPanel.tsx';
import { useAuth } from '../context/AuthContext.tsx';

interface ListingDetailModalProps {
  listing: Listing | null;
  business: Business | null;
  reviews: ReviewItem[];
  userLat: number;
  userLng: number;
  initialEditMode?: boolean;
  onClose: () => void;
  onAddToCart: (listing: Listing, business: Business, variant?: string) => void;
  onActionSuccess: (message: string) => void;
  onMessageDelivered?: (info: {
    recipientLabel: string;
    preview: string;
    threadKey: string;
  }) => void;
  onListingUpdated?: (updated: Listing) => void;
  onBookingCreated?: (booking: BookingRecord) => void;
}

export const ListingDetailModal: React.FC<ListingDetailModalProps> = ({
  listing,
  business,
  reviews,
  userLat,
  userLng,
  initialEditMode = false,
  onClose,
  onAddToCart,
  onActionSuccess,
  onMessageDelivered,
  onListingUpdated,
  onBookingCreated,
}) => {
  const { firebaseUser, dbUser, openAuthModal, authFetch } = useAuth();
  const todayIso = new Date().toISOString().slice(0, 10);
  const twoDaysLaterIso = new Date(Date.now() + 2 * 86400000).toISOString().slice(0, 10);
  const [selectedVariant, setSelectedVariant] = useState<string>('');
  const [galleryIndex, setGalleryIndex] = useState(0);
  const [scheduledDate, setScheduledDate] = useState(todayIso);
  const [endDate, setEndDate] = useState(twoDaysLaterIso);
  const [scheduledTime, setScheduledTime] = useState('10:00');
  const [distanceKm, setDistanceKm] = useState(5);
  const [workers, setWorkers] = useState(2);
  const [areaSqm, setAreaSqm] = useState(35);
  const [units, setUnits] = useState(1);
  const [paymentMethod, setPaymentMethod] = useState<'CHAPA' | 'PAYO' | 'TELEBIRR' | 'CBE_BIRR' | 'CASH'>('CHAPA');
  const [notes, setNotes] = useState('');

  // Workforce application state
  const [applicantName, setApplicantName] = useState(dbUser?.fullName || '');
  const [applicantPhone, setApplicantPhone] = useState(dbUser?.phoneNumber || '');
  const [skills, setSkills] = useState('');
  const [experienceYears, setExperienceYears] = useState(1);
  const [expectedComp, setExpectedComp] = useState(0);
  const [coverLetter, setCoverLetter] = useState('');

  // Service proposal / collapsible contract state
  const [showServiceProposalForm, setShowServiceProposalForm] = useState(false);
  const [contractRefreshSignal, setContractRefreshSignal] = useState(0);
  const [submitting, setSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // Owner non-sensitive Edit state
  const [editMode, setEditMode] = useState(initialEditMode);
  const [editTitle, setEditTitle] = useState('');
  const [editDescription, setEditDescription] = useState('');
  const [editPricingModel, setEditPricingModel] = useState('FIXED');
  const [editPricingUnit, setEditPricingUnit] = useState('item');
  const [editBasePrice, setEditBasePrice] = useState('');
  const [editDiscountPrice, setEditDiscountPrice] = useState('');
  const [editCalloutFee, setEditCalloutFee] = useState('');
  const [editDepositAmount, setEditDepositAmount] = useState('');
  const [editNegotiable, setEditNegotiable] = useState(false);
  const [editAvailabilityStatus, setEditAvailabilityStatus] = useState('AVAILABLE');
  const [editStatus, setEditStatus] = useState<'ACTIVE' | 'DRAFT'>('ACTIVE');
  const [editImages, setEditImages] = useState<string[]>([]);
  const [editImageUrlInput, setEditImageUrlInput] = useState('');
  const [editSkills, setEditSkills] = useState('');
  const [editExperienceSummary, setEditExperienceSummary] = useState('');
  const [editIntroVideoUrl, setEditIntroVideoUrl] = useState('');
  const [editCvUrl, setEditCvUrl] = useState('');
  const [editCvFileName, setEditCvFileName] = useState('');
  const [editCompanyLogoUrl, setEditCompanyLogoUrl] = useState('');
  const [editDeliveryAvailable, setEditDeliveryAvailable] = useState(true);
  const [editFreeDeliveryMaxKm, setEditFreeDeliveryMaxKm] = useState('0');
  const [editTaxResponsibility, setEditTaxResponsibility] = useState<'SELLER' | 'BUYER'>('BUYER');
  const [editTaxConfirmed, setEditTaxConfirmed] = useState(true);
  const [editImmediateAcceptance, setEditImmediateAcceptance] = useState(true);
  const [editEstimatedReadyMinutes, setEditEstimatedReadyMinutes] = useState('15');
  const [editEstimatedDeliveryMinutes, setEditEstimatedDeliveryMinutes] = useState('45');
  const [editReturnable, setEditReturnable] = useState(true);
  const [editReturnWindowDays, setEditReturnWindowDays] = useState('3');
  const [editReturnLossPercent, setEditReturnLossPercent] = useState('0');
  const [editReturnLossFixedEtb, setEditReturnLossFixedEtb] = useState('0');
  const [editDeliveryFeeNonRefundable, setEditDeliveryFeeNonRefundable] = useState(true);
  const [editReturnPolicyNote, setEditReturnPolicyNote] = useState('');
  const [editMediaBusy, setEditMediaBusy] = useState(false);
  const [editSaving, setEditSaving] = useState(false);
  const [editError, setEditError] = useState<string | null>(null);

  const isOwner = Boolean(
    business?.ownerUid &&
      ((dbUser?.uid && business.ownerUid === dbUser.uid) ||
        (firebaseUser?.uid && business.ownerUid === firebaseUser.uid))
  );

  useEffect(() => {
    if (!listing) return;
    const pol = getListingPolicy(listing);
    setGalleryIndex(0);
    setErrorMsg(null);
    setEditError(null);
    setEditMode(Boolean(initialEditMode && isOwner));
    setEditTitle(listing.title || '');
    setEditDescription(listing.description || '');
    setEditPricingModel(listing.pricingModel || 'FIXED');
    setEditPricingUnit(listing.pricingUnit || 'item');
    setEditBasePrice(listing.basePrice ? String(listing.basePrice) : '0');
    setEditDiscountPrice(listing.discountPrice ? String(listing.discountPrice) : '');
    setEditCalloutFee(listing.calloutFee ? String(listing.calloutFee) : '');
    setEditDepositAmount(listing.depositAmount ? String(listing.depositAmount) : '');
    setEditNegotiable(Boolean(listing.isUnpaid && Number(listing.basePrice) === 0));
    setEditAvailabilityStatus(listing.availabilityStatus || 'AVAILABLE');
    setEditStatus(listing.status === 'DRAFT' ? 'DRAFT' : 'ACTIVE');
    setEditImages(getListingImages(listing));
    setEditImageUrlInput('');
    setEditSkills(listing.metadata?.skills || '');
    setEditExperienceSummary(listing.metadata?.experienceSummary || '');
    setEditIntroVideoUrl(listing.metadata?.introVideoUrl || '');
    setEditCvUrl(listing.metadata?.cvUrl || '');
    setEditCvFileName(listing.metadata?.cvFileName || '');
    setEditCompanyLogoUrl(listing.metadata?.companyLogoUrl || '');
    setEditDeliveryAvailable(pol.deliveryAvailable);
    setEditFreeDeliveryMaxKm(String(pol.freeDeliveryMaxKm || 0));
    setEditTaxResponsibility(pol.taxResponsibility);
    setEditTaxConfirmed(pol.taxConfirmedBySeller);
    setEditImmediateAcceptance(pol.immediateAcceptance);
    setEditEstimatedReadyMinutes(String(pol.estimatedReadyMinutes));
    setEditEstimatedDeliveryMinutes(String(pol.estimatedDeliveryMinutes));
    setEditReturnable(pol.returnable);
    setEditReturnWindowDays(String(pol.returnWindowDays || (pol.isFood ? 1 : 3)));
    setEditReturnLossPercent(String(pol.returnLossPercent));
    setEditReturnLossFixedEtb(String(pol.returnLossFixedEtb));
    setEditDeliveryFeeNonRefundable(pol.deliveryFeeNonRefundableOnReturn);
    setEditReturnPolicyNote(pol.returnPolicyNote);
  }, [listing, initialEditMode, isOwner]);

  useEffect(() => {
    if (!listing) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [listing, onClose]);

  const formulaEstimate = useMemo(() => {
    if (!listing) return { breakdown: [], total: 0 };
    const base = listing.discountPrice ? Number(listing.discountPrice) : Number(listing.basePrice);
    const callout = Number(listing.calloutFee ?? 0);
    const deposit = Number(listing.depositAmount ?? 0);
    const breakdown: Array<{ label: string; amount: number }> = [];
    let total = 0;

    if (listing.pricingModel === 'CALCULATED' && listing.pricingFormula) {
      const f = listing.pricingFormula;
      if (f.baseFee) {
        breakdown.push({ label: 'Base moving / setup fee', amount: f.baseFee });
        total += f.baseFee;
      }
      if (f.perKmRate) {
        const dAmt = distanceKm * f.perKmRate;
        breakdown.push({ label: `Distance (${distanceKm} km × ${f.perKmRate} ETB)`, amount: dAmt });
        total += dAmt;
      }
      if (f.perWorkerRate) {
        const wAmt = workers * f.perWorkerRate;
        breakdown.push({ label: `Crew (${workers} workers × ${f.perWorkerRate} ETB)`, amount: wAmt });
        total += wAmt;
      }
      if (f.vehicleFee) {
        breakdown.push({ label: 'Dedicated vehicle fee', amount: f.vehicleFee });
        total += f.vehicleFee;
      }
      if (f.perSqmRate) {
        const areaAmt = areaSqm * f.perSqmRate;
        breakdown.push({ label: `Surface area (${areaSqm} m² × ${f.perSqmRate} ETB)`, amount: areaAmt });
        total += areaAmt;
      }
    } else if (listing.listingType === 'RENTAL') {
      const s = new Date(scheduledDate);
      const e = new Date(endDate || scheduledDate);
      const days = Math.max(1, Math.ceil((e.getTime() - s.getTime()) / (1000 * 60 * 60 * 24)) + 1);
      if (listing.pricingModel === 'PER_MONTH') {
        const months = Math.max(1, Math.ceil(days / 30));
        const rent = months * base;
        breakdown.push({ label: `Monthly rental (${months} mo × ${formatEtb(base)})`, amount: rent });
        total += rent;
      } else {
        const rent = days * base;
        breakdown.push({ label: `Daily rental (${days} days × ${formatEtb(base)})`, amount: rent });
        total += rent;
      }
      if (deposit > 0) {
        breakdown.push({ label: 'Refundable security deposit', amount: deposit });
        total += deposit;
      }
    } else {
      const svcAmt = units * base;
      breakdown.push({ label: `${units} ${listing.pricingUnit} × ${formatEtb(base)}`, amount: svcAmt });
      total += svcAmt;
      if (callout > 0) {
        breakdown.push({ label: 'Call-out / inspection fee', amount: callout });
        total += callout;
      }
    }

    return { breakdown, total };
  }, [listing, distanceKm, workers, areaSqm, units, scheduledDate, endDate]);

  if (!listing || !business) return null;

  const distKm = calculateDistanceKm(userLat, userLng, Number(business.latitude), Number(business.longitude));
  const listingReviews = reviews.filter((r) => r.businessId === business.id);
  const variants = listing.metadata?.variants || [];
  const activeVariant = selectedVariant || variants[0] || undefined;

  const ensureAuth = async () => {
    if (!firebaseUser) {
      openAuthModal('signin');
      return false;
    }
    return true;
  };

  const isCartItem = listing.listingType === 'PRODUCT' || listing.listingType === 'FOOD';
  const isJob = listing.listingType === 'JOB';
  const isRental = listing.listingType === 'RENTAL';
  const isEvent = listing.listingType === 'EVENT';
  const isJobSeeker =
    listing.listingType === 'JOB_SEEKER' || business.profileType === 'INDIVIDUAL_JOB_SEEKER';
  const isServiceDelivering = !isCartItem && !isJob && !isRental && !isEvent;
  const isWorkforceOrSeeker = isJobSeeker || isServiceDelivering || isEvent;
  const isNegotiable = listing.isUnpaid && Number(listing.basePrice) === 0;
  const contactThreadKey = `contact:${business.id}:${listing.id}:${dbUser?.uid || firebaseUser?.uid || 'guest'}`;
  const showProviderName = isServiceGiverOrJobSeeker(listing, business);
  const providerLabel = getPublicProviderLabel(listing, business);
  const providerRole = getPublicProviderRoleLabel(listing, business);
  const advertiserProfileName = getAdvertiserProfileName(business);
  const messageTimeLabel = getMessageTimeProviderLabel(listing, business);
  const headerProviderLabel = showProviderName || isOwner ? advertiserProfileName : providerLabel;

  const handleBookOrReserve = async () => {
    if (isOwner) {
      setErrorMsg('You cannot send a service request or booking to your own advertisement.');
      return;
    }
    setErrorMsg(null);
    if (!(await ensureAuth())) return;
    setSubmitting(true);
    try {
      const res = await authFetch('/api/v1/bookings', {
        method: 'POST',
        body: JSON.stringify({
          listingId: listing.id,
          scheduledDate,
          endDate: isRental ? endDate : undefined,
          scheduledTime,
          parameters: { distanceKm, workers, areaSqm, units },
          paymentMethod,
          notes,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Request failed.');
      onBookingCreated?.(data as BookingRecord);
      onActionSuccess(
        isServiceDelivering
          ? `Service request ${data.bookingReference} sent (${formatEtb(data.agreedPrice)}).`
          : `Booking ${data.bookingReference} confirmed for ${formatEtb(data.agreedPrice)}.`
      );
      onClose();
    } catch (err: unknown) {
      setErrorMsg(err instanceof Error ? err.message : 'Unable to complete request.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleApplyJob = async () => {
    if (isOwner) {
      setErrorMsg('You cannot apply to your own job advertisement.');
      return;
    }
    setErrorMsg(null);
    if (!(await ensureAuth())) return;
    setSubmitting(true);
    try {
      const res = await authFetch(`/api/v1/jobs/${listing.id}/applications`, {
        method: 'POST',
        body: JSON.stringify({
          applicantName: applicantName || dbUser?.fullName || firebaseUser?.displayName || 'Applicant',
          applicantPhone,
          skills: skills || 'Verified local experience',
          experienceYears,
          expectedCompensation: expectedComp || Number(listing.basePrice),
          coverLetter: coverLetter || 'Interested in this position via Nearest You.',
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Application failed.');
      onActionSuccess(`Application offer submitted for "${listing.title}".`);
      onClose();
    } catch (err: unknown) {
      setErrorMsg(err instanceof Error ? err.message : 'Failed to submit application.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleEditUploadPhotos = async (files: FileList | null) => {
    if (!files || files.length === 0) return;
    setEditError(null);
    const remaining = MAX_PRODUCT_IMAGES - editImages.length;
    if (remaining <= 0) {
      setEditError(`Maximum ${MAX_PRODUCT_IMAGES} images allowed.`);
      return;
    }
    setEditMediaBusy(true);
    try {
      const chosen = Array.from(files).slice(0, remaining);
      const compressed = await Promise.all(chosen.map((f) => compressImageFile(f)));
      setEditImages((prev) => {
        const next = [...prev];
        compressed.forEach((src) => {
          if (next.length < MAX_PRODUCT_IMAGES && !next.includes(src)) {
            next.push(src);
          }
        });
        return next;
      });
    } catch (err: unknown) {
      setEditError(err instanceof Error ? err.message : 'Failed to process selected image(s).');
    } finally {
      setEditMediaBusy(false);
    }
  };

  const handleEditAddImageUrl = () => {
    setEditError(null);
    const trimmed = editImageUrlInput.trim();
    if (!trimmed) return;
    if (editImages.length >= MAX_PRODUCT_IMAGES) {
      setEditError(`Maximum ${MAX_PRODUCT_IMAGES} images allowed.`);
      return;
    }
    if (!editImages.includes(trimmed)) {
      setEditImages((prev) => [...prev, trimmed]);
    }
    setEditImageUrlInput('');
  };

  const handleEditUploadCv = async (files: FileList | null) => {
    if (!files || files.length === 0) return;
    setEditError(null);
    setEditMediaBusy(true);
    try {
      const file = files[0];
      const dataUrl = await readFileAsDataUrl(file, 3 * 1024 * 1024);
      setEditCvUrl(dataUrl);
      setEditCvFileName(file.name);
    } catch (err: unknown) {
      setEditError(err instanceof Error ? err.message : 'Failed to read CV document.');
    } finally {
      setEditMediaBusy(false);
    }
  };

  const handleEditUploadLogo = async (files: FileList | null) => {
    if (!files || files.length === 0) return;
    setEditError(null);
    setEditMediaBusy(true);
    try {
      const compressed = await compressImageFile(files[0], 600, 0.85);
      setEditCompanyLogoUrl(compressed);
    } catch (err: unknown) {
      setEditError(err instanceof Error ? err.message : 'Failed to read company logo.');
    } finally {
      setEditMediaBusy(false);
    }
  };

  const handleSaveEdit = async (e: React.FormEvent) => {
    e.preventDefault();
    setEditError(null);

    if (!editTitle.trim() || !editDescription.trim()) {
      setEditError('Title and description are required.');
      return;
    }
    if (editIntroVideoUrl.trim() && !extractYouTubeVideoId(editIntroVideoUrl.trim())) {
      setEditError('Please enter a valid YouTube video URL (youtube.com or youtu.be).');
      return;
    }
    if (editImages.length > MAX_PRODUCT_IMAGES) {
      setEditError(`Maximum ${MAX_PRODUCT_IMAGES} images allowed per advertisement.`);
      return;
    }

    const numericBase = editNegotiable && isJobSeeker ? 0 : Number(editBasePrice);
    if ((!editNegotiable || !isJobSeeker) && (Number.isNaN(numericBase) || numericBase <= 0)) {
      setEditError('Base price must be greater than 0 ETB.');
      return;
    }

    const safeMeta: ListingMetadata = { ...(listing.metadata || {}) };
    if (isJob) {
      safeMeta.companyLogoUrl = editCompanyLogoUrl.trim() || undefined;
    }
    if (isCartItem) {
      if (!editTaxConfirmed) {
        setEditError('Please confirm whether tax is covered by the seller or added for the buyer before saving.');
        return;
      }
      const readyMin = Math.max(5, Math.round(Number(editEstimatedReadyMinutes) || 15));
      const delivMin = Math.max(readyMin, Math.round(Number(editEstimatedDeliveryMinutes) || 45));
      safeMeta.deliveryAvailable = editDeliveryAvailable;
      safeMeta.freeDeliveryMaxKm = editDeliveryAvailable
        ? Math.max(0, Number(editFreeDeliveryMaxKm) || 0)
        : 0;
      safeMeta.taxResponsibility = editTaxResponsibility;
      safeMeta.taxConfirmedBySeller = true;
      safeMeta.immediateAcceptance =
        listing.listingType === 'FOOD' ? false : editImmediateAcceptance;
      safeMeta.estimatedReadyMinutes = readyMin;
      safeMeta.estimatedDeliveryMinutes = delivMin;
      safeMeta.returnable = editReturnable;
      safeMeta.returnWindowDays = editReturnable
        ? Math.max(1, Math.round(Number(editReturnWindowDays) || 3))
        : 0;
      safeMeta.returnLossPercent = editReturnable
        ? Math.min(100, Math.max(0, Number(editReturnLossPercent) || 0))
        : 100;
      safeMeta.returnLossFixedEtb = editReturnable
        ? Math.max(0, Number(editReturnLossFixedEtb) || 0)
        : 0;
      safeMeta.deliveryFeeNonRefundableOnReturn = !editReturnable || editDeliveryFeeNonRefundable;
      safeMeta.returnPolicyNote = editReturnPolicyNote.trim() || undefined;
    }
    if (isWorkforceOrSeeker) {
      safeMeta.skills = editSkills.trim() || undefined;
      safeMeta.experienceSummary = editExperienceSummary.trim() || undefined;
      safeMeta.introVideoUrl = editIntroVideoUrl.trim() || undefined;
      safeMeta.cvUrl = editCvUrl.trim() || undefined;
      safeMeta.cvFileName = editCvUrl.trim() ? editCvFileName || 'CV-Document' : undefined;
    }

    const finalImages = isJob ? [] : editImages.slice(0, MAX_PRODUCT_IMAGES);
    const primaryImage =
      finalImages[0] || (isJob && editCompanyLogoUrl.trim() ? editCompanyLogoUrl.trim() : null);

    setEditSaving(true);
    try {
      const res = await businessApi.updateListing(listing.id, {
        title: editTitle.trim(),
        description: editDescription.trim(),
        imageUrl: primaryImage,
        imageUrls: finalImages,
        pricingModel: editPricingModel,
        pricingUnit: editPricingUnit.trim() || 'item',
        basePrice: numericBase,
        discountPrice: editDiscountPrice ? Number(editDiscountPrice) : null,
        calloutFee: editCalloutFee ? Number(editCalloutFee) : null,
        depositAmount: editDepositAmount ? Number(editDepositAmount) : null,
        isQuoteBased: editNegotiable && isJobSeeker ? true : listing.isQuoteBased,
        isUnpaid: editNegotiable && isJobSeeker,
        metadata: safeMeta,
        availabilityStatus: editAvailabilityStatus,
        status: editStatus,
      });
      const updated: Listing = res.data;
      onListingUpdated?.(updated);
      onActionSuccess(`Saved changes to "${updated.title}".`);
      setEditMode(false);
    } catch (err: unknown) {
      const serverErr =
        (err as { response?: { data?: { error?: string } } })?.response?.data?.error ||
        (err instanceof Error ? err.message : 'Unable to save advertisement changes.');
      setEditError(serverErr);
    } finally {
      setEditSaving(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center overflow-x-hidden bg-[#172B3A]/45 p-0 backdrop-blur-[2px] sm:items-center sm:p-4"
      onClick={onClose}
    >
      <div
        className="max-h-[94dvh] w-full max-w-4xl overflow-x-hidden overflow-y-auto rounded-t-2xl border border-[#172B3A]/10 bg-white shadow-2xl sm:max-h-[92vh] sm:rounded-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="sticky top-0 z-10 flex items-center justify-between gap-2 border-b border-[#172B3A]/10 bg-white px-4 py-3 sm:px-6 sm:py-4">
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-[#172B3A]/65">
              {(showProviderName || isOwner) && (
                <span className="inline-flex items-center gap-1 font-semibold text-[#176B52]">
                  <User className="h-3.5 w-3.5 shrink-0" />
                  <span className="truncate">{headerProviderLabel}</span>
                </span>
              )}
              {!showProviderName && !isOwner && (
                <span className="font-medium text-[#172B3A]/70">{headerProviderLabel}</span>
              )}
              {providerRole && (
                <span className="rounded bg-[#176B52]/10 px-1.5 py-0.5 text-[10px] font-semibold text-[#176B52]">
                  {providerRole}
                </span>
              )}
              <span>·</span>
              <span>{business.subCity}</span>
              <span>·</span>
              <span className="font-mono tabular-nums">{distKm} km away</span>
            </div>
            <h2 className="mt-0.5 truncate font-display text-base font-bold text-[#172B3A] sm:text-xl">
              {listing.title}
            </h2>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            {isOwner && (
              <button
                type="button"
                onClick={() => setEditMode((prev) => !prev)}
                className={`inline-flex h-9 shrink-0 items-center gap-1.5 whitespace-nowrap rounded-lg px-3 text-xs font-semibold transition sm:h-10 ${
                  editMode
                    ? 'border border-[#172B3A]/20 bg-[#F4F6F5] text-[#172B3A]'
                    : 'bg-[#176B52] text-white hover:bg-[#125641]'
                }`}
              >
                <Pencil className="h-3.5 w-3.5" />
                <span>{editMode ? 'Preview Ad' : 'Edit Ad'}</span>
              </button>
            )}
            <button
              type="button"
              onClick={onClose}
              aria-label="Close listing details"
              className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-[#172B3A]/10 text-[#172B3A]/70 hover:bg-[#F4F6F5] sm:h-10 sm:w-10"
            >
              <X className="h-5 w-5" />
            </button>
          </div>
        </div>

        <div className="grid gap-5 p-4 sm:gap-7 sm:p-6 lg:grid-cols-12">
          <div className="min-w-0 space-y-5 sm:space-y-6 lg:col-span-5">
            {(() => {
              const gallery = getListingImages(listing);
              const youtubeEmbed = getYouTubeEmbedUrl(listing.metadata?.introVideoUrl);
              return (
                <>
                  <div className="rounded-xl border border-[#172B3A]/10 bg-[#F4F6F5]/80 p-3 sm:p-4">
                    <ListingVisual
                      imageUrl={listing.imageUrl}
                      imageUrls={listing.imageUrls}
                      companyLogoUrl={listing.metadata?.companyLogoUrl}
                      introVideoUrl={listing.metadata?.introVideoUrl}
                      cvUrl={listing.metadata?.cvUrl}
                      title={listing.title}
                      listingType={listing.listingType}
                      className="mx-auto aspect-[3/4] w-full max-w-[260px] rounded-xl border border-[#172B3A]/10 shadow-xs sm:max-w-[290px]"
                      showSlideControls={gallery.length > 1}
                      activeSlideIndex={galleryIndex}
                      onSlideChange={setGalleryIndex}
                    />
                  </div>

                  {gallery.length > 1 && (
                    <div className="grid grid-cols-4 gap-2 sm:grid-cols-5">
                      {gallery.map((src, idx) => (
                        <button
                          key={`${src.slice(0, 32)}-${idx}`}
                          type="button"
                          onClick={() => setGalleryIndex(idx)}
                          className={`aspect-[3/4] overflow-hidden rounded-lg border transition-all ${
                            idx === galleryIndex % gallery.length
                              ? 'border-[#176B52] ring-2 ring-[#176B52]/30'
                              : 'border-[#172B3A]/15 opacity-75 hover:opacity-100'
                          }`}
                        >
                          <img
                            src={src}
                            alt={`${listing.title} thumbnail ${idx + 1}`}
                            referrerPolicy="no-referrer"
                            className="h-full w-full object-cover object-[50%_20%]"
                          />
                        </button>
                      ))}
                    </div>
                  )}

                  {youtubeEmbed && (
                    <div className="overflow-hidden rounded-xl border border-[#172B3A]/10 bg-[#F4F6F5]">
                      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[#172B3A]/10 px-3.5 py-2 text-xs">
                        <span className="inline-flex items-center gap-1.5 font-semibold text-[#172B3A]">
                          <Play className="h-3.5 w-3.5 text-[#176B52]" />
                          Workforce Intro Video (YouTube)
                        </span>
                        <a
                          href={listing.metadata?.introVideoUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center gap-1 font-medium text-[#176B52] hover:underline"
                        >
                          Open on YouTube
                          <ExternalLink className="h-3 w-3" />
                        </a>
                      </div>
                      <div className="aspect-video w-full bg-black">
                        <iframe
                          src={youtubeEmbed}
                          title={`${listing.title} intro video`}
                          allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                          allowFullScreen
                          className="h-full w-full border-0"
                        />
                      </div>
                    </div>
                  )}

                  {listing.metadata?.cvUrl && (
                    <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-[#176B52]/20 bg-[#F4F6F5] px-4 py-3 text-xs">
                      <div className="flex min-w-0 flex-1 items-center gap-2.5">
                        <FileText className="h-4 w-4 shrink-0 text-[#176B52]" />
                        <div className="min-w-0">
                          <p className="font-semibold text-[#172B3A]">Workforce CV / Portfolio</p>
                          <p className="truncate text-[11px] text-[#172B3A]/65">
                            {listing.metadata.cvFileName || 'Candidate CV document'}
                          </p>
                        </div>
                      </div>
                      <a
                        href={listing.metadata.cvUrl}
                        download={listing.metadata.cvFileName || `cv-${listing.id}`}
                        className="inline-flex min-h-[34px] shrink-0 items-center gap-1.5 rounded-lg bg-[#176B52] px-3 py-1.5 font-semibold text-white hover:bg-[#125641]"
                      >
                        Download / View CV
                      </a>
                    </div>
                  )}
                </>
              );
            })()}

            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2 text-xs text-[#172B3A]/65">
                <span className="inline-flex items-center gap-1 font-medium text-[#176B52]">
                  <ShieldCheck className="h-3.5 w-3.5" />
                  {isJobSeeker
                    ? 'Individual Job Seeker'
                    : showProviderName
                      ? business.verificationStatus === 'APPROVED'
                        ? 'Verified Service Giver'
                        : business.verificationStatus
                      : business.verificationStatus === 'APPROVED'
                        ? providerLabel
                        : business.verificationStatus}
                </span>
                {(showProviderName || isOwner) && (
                  <>
                    <span>·</span>
                    <span className="font-semibold text-[#172B3A]">
                      {advertiserProfileName}
                      {business.businessName &&
                      business.businessName !== advertiserProfileName &&
                      !isJobSeeker
                        ? ` (${business.businessName})`
                        : ''}
                    </span>
                  </>
                )}
                {!isJobSeeker && (showProviderName || isOwner) && (
                  <>
                    <span>·</span>
                    <span className="break-words">License {business.licenseNumber}</span>
                  </>
                )}
                <span>·</span>
                <span className="inline-flex items-center gap-1 font-mono tabular-nums">
                  <Star className="h-3.5 w-3.5 fill-[#F4A62A] text-[#F4A62A]" />
                  {Number(listing.ratingAvg).toFixed(1)} ({listing.ratingCount})
                </span>
              </div>
              <p className="mt-3 break-words text-sm leading-relaxed text-[#172B3A]/85">
                {listing.description}
              </p>
              {(listing.metadata?.skills || listing.metadata?.experienceSummary) && (
                <div className="mt-3 space-y-1 rounded-lg border border-[#172B3A]/10 bg-[#F4F6F5] p-3 text-xs text-[#172B3A]/80">
                  {listing.metadata.skills && (
                    <p className="break-words">
                      <strong className="text-[#172B3A]">Skills:</strong> {listing.metadata.skills}
                    </p>
                  )}
                  {listing.metadata.experienceSummary && (
                    <p className="break-words">
                      <strong className="text-[#172B3A]">Experience:</strong>{' '}
                      {listing.metadata.experienceSummary}
                    </p>
                  )}
                </div>
              )}
              <p className="mt-2 break-words text-xs text-[#172B3A]/60">
                Location: {business.landmark}, {business.subCity}
                {(showProviderName || isOwner) && ` · Contact: ${business.contactPhone}`} · Hours:{' '}
                {business.openingHours}
              </p>
              {!showProviderName && !isOwner && (
                <p className="mt-1.5 text-[11px] font-medium text-[#176B52]">
                  Seller identity is revealed when you start a message or place an order.
                </p>
              )}
            </div>

            {listing.pricingFormula?.factors && (
              <div className="rounded-xl border border-[#172B3A]/10 bg-[#F4F6F5] p-4">
                <h3 className="text-xs font-semibold text-[#172B3A]">
                  Disclosed Pricing Formula (Mandatory Transparency)
                </h3>
                <ul className="mt-2 space-y-1 text-xs text-[#172B3A]/75">
                  {listing.pricingFormula.factors.map((f, idx) => (
                    <li key={idx} className="break-words">
                      · {f}
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {listingReviews.length > 0 && (
              <div className="border-t border-[#172B3A]/10 pt-4">
                <h3 className="text-xs font-semibold text-[#172B3A]">Verified Customer Reviews</h3>
                <div className="mt-2 space-y-3">
                  {listingReviews.slice(0, 3).map((r) => (
                    <div key={r.id} className="text-xs">
                      <p className="break-words font-medium text-[#172B3A]">
                        {r.customerName} · {r.rating}/5 ★ ·{' '}
                        <span className="font-mono text-[#172B3A]/50">{r.transactionRef}</span>
                      </p>
                      <p className="mt-0.5 break-words text-[#172B3A]/75">{r.comment}</p>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Right Contiguous Module: Owner View/Edit OR Customer Contact & Transaction */}
          <div className="min-w-0 lg:col-span-7">
            <div className="min-w-0 space-y-4 rounded-xl border border-[#172B3A]/10 bg-[#F4F6F5]/60 p-3.5 sm:space-y-5 sm:p-5">
              <div className="border-b border-[#172B3A]/10 pb-4">
                <p className="text-xs font-medium text-[#172B3A]/60">
                  {formatPricingModelLabel(listing.pricingModel)} · Currency: {listing.currency}
                </p>
                <div className="mt-1 flex flex-wrap items-baseline gap-x-3 gap-y-1">
                  <span className="font-mono text-2xl font-bold tabular-nums text-[#176B52]">
                    {isNegotiable
                      ? 'Negotiable'
                      : formatEtb(listing.discountPrice || listing.basePrice)}
                  </span>
                  {!isNegotiable && (
                    <span className="text-sm text-[#172B3A]/70">/ {listing.pricingUnit}</span>
                  )}
                  {listing.discountPrice && (
                    <span className="font-mono text-sm tabular-nums text-[#172B3A]/45 line-through">
                      {formatEtb(listing.basePrice)}
                    </span>
                  )}
                  {listing.salaryMax && (
                    <span className="font-mono text-sm tabular-nums text-[#172B3A]/75">
                      – {formatEtb(listing.salaryMax)}
                    </span>
                  )}
                </div>
                {listing.calloutFee && (
                  <p className="mt-1 font-mono text-xs tabular-nums text-[#172B3A]/70">
                    + Call-out fee: {formatEtb(listing.calloutFee)}
                  </p>
                )}
                {listing.depositAmount && (
                  <p className="mt-1 font-mono text-xs tabular-nums text-[#172B3A]/70">
                    Refundable security deposit: {formatEtb(listing.depositAmount)}
                  </p>
                )}
              </div>

              {isOwner ? (
                editMode ? (
                  <form onSubmit={handleSaveEdit} className="space-y-3.5">
                    <div className="flex items-center justify-between gap-2">
                      <h3 className="font-display text-sm font-bold text-[#172B3A]">
                        Edit Advertisement Details
                      </h3>
                      <span className="text-[11px] font-medium text-[#176B52]">
                        Non-sensitive fields
                      </span>
                    </div>

                    <div>
                      <label className="block text-xs font-medium text-[#172B3A]/75">
                        Advertisement Title
                      </label>
                      <input
                        required
                        type="text"
                        value={editTitle}
                        onChange={(e) => setEditTitle(e.target.value)}
                        className="mt-1 h-10 w-full min-w-0 rounded-lg border border-[#172B3A]/15 bg-white px-3 text-xs focus:border-[#176B52] focus:outline-none"
                      />
                    </div>

                    <div>
                      <label className="block text-xs font-medium text-[#172B3A]/75">
                        Description
                      </label>
                      <textarea
                        required
                        rows={3}
                        value={editDescription}
                        onChange={(e) => setEditDescription(e.target.value)}
                        className="mt-1 w-full min-w-0 rounded-lg border border-[#172B3A]/15 bg-white px-3 py-2 text-xs focus:border-[#176B52] focus:outline-none"
                      />
                    </div>

                    <div className="grid gap-3 sm:grid-cols-2">
                      <div>
                        <label className="block text-xs font-medium text-[#172B3A]/75">
                          Pricing / Engagement Type
                        </label>
                        <select
                          value={editPricingModel}
                          onChange={(e) => {
                            const next = e.target.value;
                            setEditPricingModel(next);
                            if (next === 'ONE_TIME_CONTRACT') setEditPricingUnit('contract');
                            else if (next === 'FULL_TIME') setEditPricingUnit('month');
                            else if (next === 'PER_HOUR') setEditPricingUnit('hour');
                            else if (next === 'PER_DAY') setEditPricingUnit('day');
                            else if (next === 'PER_MONTH') setEditPricingUnit('month');
                            else if (next === 'PER_SESSION') setEditPricingUnit('session');
                            else if (next === 'PER_UNIT') setEditPricingUnit('item');
                          }}
                          className="mt-1 h-10 w-full rounded-lg border border-[#172B3A]/15 bg-white px-3 text-xs font-medium"
                        >
                          <option value="ONE_TIME_CONTRACT">One-Time Contract</option>
                          <option value="FULL_TIME">Full-Time</option>
                          <option value="PER_HOUR">Per Hour Payment</option>
                          <option value="PER_DAY">Per Day</option>
                          <option value="PER_MONTH">Per Month</option>
                          <option value="PER_SESSION">Per Session</option>
                          <option value="FIXED">Fixed Price</option>
                          <option value="PER_UNIT">Per Unit</option>
                          <option value="CALCULATED">Calculated Rate</option>
                          <option value="QUOTE">Quote / Negotiable</option>
                        </select>
                      </div>
                      <div>
                        <label className="block text-xs font-medium text-[#172B3A]/75">
                          Pricing Unit
                        </label>
                        <input
                          required
                          type="text"
                          value={editPricingUnit}
                          onChange={(e) => setEditPricingUnit(e.target.value)}
                          className="mt-1 h-10 w-full rounded-lg border border-[#172B3A]/15 bg-white px-3 text-xs"
                        />
                      </div>
                    </div>

                    {isJobSeeker && (
                      <label className="inline-flex cursor-pointer items-center gap-2 text-xs font-medium text-[#176B52]">
                        <input
                          type="checkbox"
                          checked={editNegotiable}
                          onChange={(e) => setEditNegotiable(e.target.checked)}
                          className="h-4 w-4 accent-[#176B52]"
                        />
                        Negotiable / Quote on contact
                      </label>
                    )}

                    <div className="grid gap-3 sm:grid-cols-2">
                      {(!editNegotiable || !isJobSeeker) && (
                        <div>
                          <label className="block text-xs font-medium text-[#172B3A]/75">
                            Price (ETB)
                          </label>
                          <input
                            type="number"
                            min={1}
                            step="any"
                            value={editBasePrice}
                            onChange={(e) => setEditBasePrice(e.target.value)}
                            className="mt-1 h-10 w-full rounded-lg border border-[#172B3A]/15 bg-white px-3 font-mono text-xs"
                          />
                        </div>
                      )}
                      {!isJobSeeker && (
                        <div>
                          <label className="block text-xs font-medium text-[#172B3A]/75">
                            Discount Price (Optional)
                          </label>
                          <input
                            type="number"
                            min={0}
                            step="any"
                            value={editDiscountPrice}
                            onChange={(e) => setEditDiscountPrice(e.target.value)}
                            placeholder="Optional"
                            className="mt-1 h-10 w-full rounded-lg border border-[#172B3A]/15 bg-white px-3 font-mono text-xs"
                          />
                        </div>
                      )}
                    </div>

                    {!isJobSeeker && !isJob && (
                      <div className="grid gap-3 sm:grid-cols-2">
                        <div>
                          <label className="block text-xs font-medium text-[#172B3A]/75">
                            Call-out Fee (ETB)
                          </label>
                          <input
                            type="number"
                            min={0}
                            step="any"
                            value={editCalloutFee}
                            onChange={(e) => setEditCalloutFee(e.target.value)}
                            placeholder="Optional"
                            className="mt-1 h-10 w-full rounded-lg border border-[#172B3A]/15 bg-white px-3 font-mono text-xs"
                          />
                        </div>
                        <div>
                          <label className="block text-xs font-medium text-[#172B3A]/75">
                            Deposit (ETB)
                          </label>
                          <input
                            type="number"
                            min={0}
                            step="any"
                            value={editDepositAmount}
                            onChange={(e) => setEditDepositAmount(e.target.value)}
                            placeholder="Optional"
                            className="mt-1 h-10 w-full rounded-lg border border-[#172B3A]/15 bg-white px-3 font-mono text-xs"
                          />
                        </div>
                      </div>
                    )}

                    {isWorkforceOrSeeker && (
                      <div className="space-y-3 rounded-lg border border-[#172B3A]/10 bg-white p-3">
                        <div className="grid gap-2.5 sm:grid-cols-2">
                          <div>
                            <label className="block text-[11px] font-medium text-[#172B3A]/75">
                              Skills (Searchable)
                            </label>
                            <input
                              type="text"
                              value={editSkills}
                              onChange={(e) => setEditSkills(e.target.value)}
                              placeholder="e.g., Electrical, Plumbing"
                              className="mt-1 h-9 w-full rounded-lg border border-[#172B3A]/15 px-2.5 text-xs"
                            />
                          </div>
                          <div>
                            <label className="block text-[11px] font-medium text-[#172B3A]/75">
                              Experience Summary
                            </label>
                            <input
                              type="text"
                              value={editExperienceSummary}
                              onChange={(e) => setEditExperienceSummary(e.target.value)}
                              placeholder="Years & shift preference"
                              className="mt-1 h-9 w-full rounded-lg border border-[#172B3A]/15 px-2.5 text-xs"
                            />
                          </div>
                        </div>

                        <div className="grid gap-2.5 sm:grid-cols-2">
                          <div>
                            <label className="block text-[11px] font-medium text-[#172B3A]/75">
                              CV Document
                            </label>
                            <div className="mt-1 flex flex-wrap items-center gap-2">
                              <label className="inline-flex cursor-pointer items-center gap-1.5 rounded-lg border border-[#176B52]/30 bg-[#F4F6F5] px-2.5 py-1.5 text-[11px] font-semibold text-[#176B52]">
                                <Upload className="h-3.5 w-3.5" />
                                {editCvUrl ? 'Replace CV' : 'Upload CV'}
                                <input
                                  type="file"
                                  accept=".pdf,.doc,.docx,image/*"
                                  disabled={editMediaBusy}
                                  className="sr-only"
                                  onChange={(e) => {
                                    handleEditUploadCv(e.target.files);
                                    e.target.value = '';
                                  }}
                                />
                              </label>
                              {editCvUrl && (
                                <button
                                  type="button"
                                  onClick={() => {
                                    setEditCvUrl('');
                                    setEditCvFileName('');
                                  }}
                                  className="text-[11px] font-medium text-red-600 hover:underline"
                                >
                                  Remove CV
                                </button>
                              )}
                            </div>
                            {editCvFileName && (
                              <p className="mt-1 truncate text-[10px] text-[#176B52]">
                                {editCvFileName}
                              </p>
                            )}
                          </div>
                          <div>
                            <label className="block text-[11px] font-medium text-[#172B3A]/75">
                              YouTube Intro Link
                            </label>
                            <div className="relative mt-1">
                              <Video className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-[#176B52]" />
                              <input
                                type="url"
                                value={editIntroVideoUrl}
                                onChange={(e) => setEditIntroVideoUrl(e.target.value)}
                                placeholder="https://youtube.com/watch?v=..."
                                className="h-9 w-full rounded-lg border border-[#172B3A]/15 pl-8 pr-2.5 text-xs"
                              />
                            </div>
                          </div>
                        </div>
                      </div>
                    )}

                    {isJob && (
                      <div className="space-y-2 rounded-lg border border-[#172B3A]/10 bg-white p-3">
                        <label className="block text-[11px] font-medium text-[#172B3A]/75">
                          Company Logo
                        </label>
                        <div className="flex flex-wrap items-center gap-2">
                          <label className="inline-flex cursor-pointer items-center gap-1.5 rounded-lg border border-[#176B52]/30 bg-[#F4F6F5] px-2.5 py-1.5 text-[11px] font-semibold text-[#176B52]">
                            <Upload className="h-3.5 w-3.5" />
                            Upload Logo
                            <input
                              type="file"
                              accept="image/*"
                              disabled={editMediaBusy}
                              className="sr-only"
                              onChange={(e) => {
                                handleEditUploadLogo(e.target.files);
                                e.target.value = '';
                              }}
                            />
                          </label>
                          <input
                            type="url"
                            value={editCompanyLogoUrl.startsWith('data:') ? '' : editCompanyLogoUrl}
                            onChange={(e) => setEditCompanyLogoUrl(e.target.value)}
                            placeholder="Or paste logo URL..."
                            className="h-9 min-w-0 flex-1 rounded-lg border border-[#172B3A]/15 px-2.5 text-xs"
                          />
                        </div>
                      </div>
                    )}

                    {!isJob && (
                      <div className="space-y-2 rounded-lg border border-[#172B3A]/10 bg-white p-3">
                        <div className="flex items-center justify-between gap-2 text-xs">
                          <span className="inline-flex items-center gap-1.5 font-semibold text-[#172B3A]">
                            <ImagePlus className="h-3.5 w-3.5 text-[#176B52]" />
                            Photos ({editImages.length}/{MAX_PRODUCT_IMAGES})
                          </span>
                        </div>
                        <div className="flex flex-wrap items-center gap-2">
                          <label className="inline-flex cursor-pointer items-center gap-1.5 rounded-lg border border-[#176B52]/30 bg-[#F4F6F5] px-2.5 py-1.5 text-[11px] font-semibold text-[#176B52]">
                            <Upload className="h-3.5 w-3.5" />
                            Add Photos
                            <input
                              type="file"
                              accept="image/*"
                              multiple
                              disabled={editMediaBusy || editImages.length >= MAX_PRODUCT_IMAGES}
                              className="sr-only"
                              onChange={(e) => {
                                handleEditUploadPhotos(e.target.files);
                                e.target.value = '';
                              }}
                            />
                          </label>
                          <div className="flex min-w-0 flex-1 items-center gap-1.5">
                            <input
                              type="url"
                              value={editImageUrlInput}
                              onChange={(e) => setEditImageUrlInput(e.target.value)}
                              placeholder="Or paste image URL..."
                              className="h-9 min-w-0 flex-1 rounded-lg border border-[#172B3A]/15 px-2.5 text-xs"
                            />
                            <button
                              type="button"
                              onClick={handleEditAddImageUrl}
                              disabled={
                                editImages.length >= MAX_PRODUCT_IMAGES || !editImageUrlInput.trim()
                              }
                              className="h-9 shrink-0 rounded-lg border border-[#172B3A]/15 px-2.5 text-xs font-semibold text-[#172B3A] disabled:opacity-45"
                            >
                              Add
                            </button>
                          </div>
                        </div>
                        {editImages.length > 0 && (
                          <div className="grid grid-cols-4 gap-2 pt-1 sm:grid-cols-5">
                            {editImages.map((src, idx) => (
                              <div
                                key={`${src.slice(0, 24)}-${idx}`}
                                className="relative aspect-[3/4] overflow-hidden rounded-lg border border-[#172B3A]/15"
                              >
                                <img
                                  src={src}
                                  alt={`Edit preview ${idx + 1}`}
                                  referrerPolicy="no-referrer"
                                  className="h-full w-full object-cover object-[50%_20%]"
                                />
                                <button
                                  type="button"
                                  onClick={() =>
                                    setEditImages((prev) => prev.filter((_, i) => i !== idx))
                                  }
                                  aria-label={`Remove photo ${idx + 1}`}
                                  className="absolute right-1 top-1 flex h-5 w-5 items-center justify-center rounded-full bg-[#172B3A]/80 text-white"
                                >
                                  <X className="h-3 w-3" />
                                </button>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    )}

                    {isCartItem && (
                      <div className="space-y-3 rounded-lg border border-[#172B3A]/12 bg-white p-3">
                        <p className="text-xs font-bold text-[#172B3A]">
                          Delivery, Order Acceptance &amp; Unsatisfied Return Policy
                        </p>

                        <div className="grid gap-2.5 sm:grid-cols-2">
                          <div>
                            <label className="block text-[11px] font-medium text-[#172B3A]/75">
                              Delivery Availability
                            </label>
                            <select
                              value={editDeliveryAvailable ? 'WITH_DELIVERY' : 'PICKUP_ONLY'}
                              onChange={(e) =>
                                setEditDeliveryAvailable(e.target.value === 'WITH_DELIVERY')
                              }
                              className="mt-1 h-9 w-full rounded-lg border border-[#172B3A]/15 px-2.5 text-xs"
                            >
                              <option value="WITH_DELIVERY">With Delivery Available</option>
                              <option value="PICKUP_ONLY">Without Delivery (Store Pickup Only)</option>
                            </select>
                          </div>

                          <div>
                            <label className="block text-[11px] font-medium text-[#172B3A]/75">
                              Order Acceptance Mode
                            </label>
                            {listing.listingType === 'FOOD' ? (
                              <p className="mt-1.5 text-[11px] font-medium text-amber-800">
                                Food Order Request (Seller reviews &amp; confirms ready/delivery time)
                              </p>
                            ) : (
                              <select
                                value={editImmediateAcceptance ? 'IMMEDIATE' : 'REQUEST'}
                                onChange={(e) =>
                                  setEditImmediateAcceptance(e.target.value === 'IMMEDIATE')
                                }
                                className="mt-1 h-9 w-full rounded-lg border border-[#172B3A]/15 px-2.5 text-xs"
                              >
                                <option value="IMMEDIATE">Immediate Acceptance on Checkout</option>
                                <option value="REQUEST">Order Request (Seller Accepts First)</option>
                              </select>
                            )}
                          </div>
                        </div>

                        <div className="grid gap-2.5 sm:grid-cols-2">
                          <div>
                            <label className="block text-[11px] font-medium text-[#172B3A]/75">
                              Approx. Ready Time (minutes)
                            </label>
                            <input
                              type="number"
                              min={5}
                              value={editEstimatedReadyMinutes}
                              onChange={(e) => setEditEstimatedReadyMinutes(e.target.value)}
                              className="mt-1 h-9 w-full rounded-lg border border-[#172B3A]/15 px-2.5 font-mono text-xs"
                            />
                          </div>
                          <div>
                            <label className="block text-[11px] font-medium text-[#172B3A]/75">
                              Approx. Delivery Time (minutes)
                            </label>
                            <input
                              type="number"
                              min={5}
                              disabled={!editDeliveryAvailable}
                              value={editEstimatedDeliveryMinutes}
                              onChange={(e) => setEditEstimatedDeliveryMinutes(e.target.value)}
                              className="mt-1 h-9 w-full rounded-lg border border-[#172B3A]/15 px-2.5 font-mono text-xs disabled:bg-slate-100"
                            />
                          </div>
                        </div>

                        {editDeliveryAvailable && (
                          <div className="rounded-lg border border-[#176B52]/20 bg-[#F4F6F5]/60 p-2.5">
                            <label className="block text-[11px] font-semibold text-[#172B3A]">
                              Provider-Covered Delivery Radius (0 to X km)
                            </label>
                            <div className="mt-1 flex items-center gap-2">
                              <span className="font-mono text-[11px] text-[#172B3A]/70">0 km →</span>
                              <input
                                type="number"
                                min={0}
                                step="0.5"
                                value={editFreeDeliveryMaxKm}
                                onChange={(e) => setEditFreeDeliveryMaxKm(e.target.value)}
                                className="h-9 w-28 rounded-lg border border-[#172B3A]/15 bg-white px-2.5 font-mono text-xs"
                              />
                              <span className="font-mono text-[11px] text-[#172B3A]/70">km</span>
                            </div>
                            <p className="mt-1 text-[10px] text-[#172B3A]/65">
                              {Number(editFreeDeliveryMaxKm) > 0
                                ? `0 to ${Number(editFreeDeliveryMaxKm)} km delivery is from you (0 ETB for buyer); beyond ${Number(editFreeDeliveryMaxKm)} km buyer pays.`
                                : 'When 0 km, buyer pays distance delivery (no extra flat fee needed).'}
                            </p>
                          </div>
                        )}

                        <div className="space-y-2 rounded-lg border border-[#F4A62A]/45 bg-amber-50/50 p-2.5">
                          <p className="text-[11px] font-bold text-[#172B3A]">
                            Tax Responsibility (Seller Must Confirm First)
                          </p>
                          <div className="grid gap-2 sm:grid-cols-2">
                            <label
                              className={`flex cursor-pointer items-start gap-2 rounded-lg border p-2 transition-colors ${
                                editTaxResponsibility === 'SELLER'
                                  ? 'border-[#176B52] bg-emerald-50/70'
                                  : 'border-[#172B3A]/15 bg-white'
                              }`}
                            >
                              <input
                                type="radio"
                                name="editTaxResponsibility"
                                checked={editTaxResponsibility === 'SELLER'}
                                onChange={() => {
                                  setEditTaxResponsibility('SELLER');
                                  setEditTaxConfirmed(false);
                                }}
                                className="mt-0.5 accent-[#176B52]"
                              />
                              <div>
                                <p className="text-[11px] font-bold text-[#172B3A]">
                                  Tax from Seller (Included)
                                </p>
                                <p className="text-[10px] text-[#172B3A]/70">
                                  Buyer pays only the visible amount; no tax added.
                                </p>
                              </div>
                            </label>
                            <label
                              className={`flex cursor-pointer items-start gap-2 rounded-lg border p-2 transition-colors ${
                                editTaxResponsibility === 'BUYER'
                                  ? 'border-[#176B52] bg-emerald-50/70'
                                  : 'border-[#172B3A]/15 bg-white'
                              }`}
                            >
                              <input
                                type="radio"
                                name="editTaxResponsibility"
                                checked={editTaxResponsibility === 'BUYER'}
                                onChange={() => {
                                  setEditTaxResponsibility('BUYER');
                                  setEditTaxConfirmed(false);
                                }}
                                className="mt-0.5 accent-[#176B52]"
                              />
                              <div>
                                <p className="text-[11px] font-bold text-[#172B3A]">
                                  Tax from Buyer (Added)
                                </p>
                                <p className="text-[10px] text-[#172B3A]/70">
                                  VAT added on top of visible price at checkout.
                                </p>
                              </div>
                            </label>
                          </div>
                          <label className="flex cursor-pointer items-start gap-2 text-[11px] font-semibold text-[#172B3A]">
                            <input
                              type="checkbox"
                              checked={editTaxConfirmed}
                              onChange={(e) => setEditTaxConfirmed(e.target.checked)}
                              className="mt-0.5 h-3.5 w-3.5 accent-[#176B52]"
                            />
                            <span>
                              {editTaxResponsibility === 'SELLER'
                                ? 'I confirm tax is from the seller (buyer pays only visible amount, no tax added).'
                                : 'I confirm tax is from the buyer (VAT added at checkout).'}
                            </span>
                          </label>
                        </div>

                        <div className="space-y-2 border-t border-[#172B3A]/10 pt-2.5">
                          <label className="block text-[11px] font-medium text-[#172B3A]/75">
                            If Buyer Is Unsatisfied (Returnability)
                          </label>
                          <select
                            value={editReturnable ? 'RETURNABLE' : 'NON_RETURNABLE'}
                            onChange={(e) => setEditReturnable(e.target.value === 'RETURNABLE')}
                            className="h-9 w-full rounded-lg border border-[#172B3A]/15 px-2.5 text-xs"
                          >
                            <option value="RETURNABLE">Returnable within Return Window</option>
                            <option value="NON_RETURNABLE">Cannot Be Returned (Final Sale — 100% Loss)</option>
                          </select>

                          {editReturnable && (
                            <div className="grid gap-2 sm:grid-cols-3">
                              <div>
                                <label className="block text-[10px] font-medium text-[#172B3A]/70">
                                  Window (Days)
                                </label>
                                <input
                                  type="number"
                                  min={1}
                                  value={editReturnWindowDays}
                                  onChange={(e) => setEditReturnWindowDays(e.target.value)}
                                  className="mt-1 h-9 w-full rounded-lg border border-[#172B3A]/15 px-2 font-mono text-xs"
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
                                  value={editReturnLossPercent}
                                  onChange={(e) => setEditReturnLossPercent(e.target.value)}
                                  className="mt-1 h-9 w-full rounded-lg border border-[#172B3A]/15 px-2 font-mono text-xs"
                                />
                              </div>
                              <div>
                                <label className="block text-[10px] font-medium text-[#172B3A]/70">
                                  Fixed Deduction (ETB)
                                </label>
                                <input
                                  type="number"
                                  min={0}
                                  value={editReturnLossFixedEtb}
                                  onChange={(e) => setEditReturnLossFixedEtb(e.target.value)}
                                  className="mt-1 h-9 w-full rounded-lg border border-[#172B3A]/15 px-2 font-mono text-xs"
                                />
                              </div>
                            </div>
                          )}

                          <label className="inline-flex cursor-pointer items-center gap-2 text-[11px] font-medium text-[#172B3A]">
                            <input
                              type="checkbox"
                              checked={!editReturnable || editDeliveryFeeNonRefundable}
                              disabled={!editReturnable}
                              onChange={(e) => setEditDeliveryFeeNonRefundable(e.target.checked)}
                              className="h-3.5 w-3.5 accent-[#176B52]"
                            />
                            Buyer loses delivery fee if returned unsatisfied
                          </label>

                          <input
                            type="text"
                            value={editReturnPolicyNote}
                            onChange={(e) => setEditReturnPolicyNote(e.target.value)}
                            placeholder="Condition note (e.g., original seal/packaging required)"
                            className="h-9 w-full rounded-lg border border-[#172B3A]/15 px-2.5 text-xs"
                          />

                          {(() => {
                            const sampleItem = Number(editDiscountPrice || editBasePrice) || 0;
                            const freeKm = editDeliveryAvailable
                              ? Math.max(0, Number(editFreeDeliveryMaxKm) || 0)
                              : 0;
                            const sampleDeliv = editDeliveryAvailable && freeKm === 0 ? 120 : 0;
                            const loss = calculateReturnLoss(sampleItem, sampleDeliv, {
                              returnable: editReturnable,
                              returnLossPercent: Number(editReturnLossPercent) || 0,
                              returnLossFixedEtb: Number(editReturnLossFixedEtb) || 0,
                              deliveryFeeNonRefundableOnReturn:
                                !editReturnable || editDeliveryFeeNonRefundable,
                            });
                            return (
                              <p className="rounded bg-[#F4F6F5] px-2.5 py-1.5 font-mono text-[11px] tabular-nums text-[#172B3A]/80">
                                Preview (1 unit @ {formatEtb(sampleItem)}
                                {freeKm > 0
                                  ? ` + 0 ETB delivery within 0–${freeKm} km`
                                  : ` + ${formatEtb(sampleDeliv)} delivery`}
                                ): Buyer loses {formatEtb(loss.totalLossEtb)} · Refund{' '}
                                {formatEtb(loss.refundEtb)}
                              </p>
                            );
                          })()}
                        </div>
                      </div>
                    )}

                    <div className="grid gap-3 sm:grid-cols-2">
                      <div>
                        <label className="block text-xs font-medium text-[#172B3A]/75">
                          Availability
                        </label>
                        <select
                          value={editAvailabilityStatus}
                          onChange={(e) => setEditAvailabilityStatus(e.target.value)}
                          className="mt-1 h-10 w-full rounded-lg border border-[#172B3A]/15 bg-white px-3 text-xs font-medium"
                        >
                          <option value="AVAILABLE">AVAILABLE</option>
                          <option value="UNAVAILABLE">UNAVAILABLE</option>
                          {isCartItem && <option value="OUT_OF_STOCK">OUT_OF_STOCK</option>}
                        </select>
                      </div>
                      <div>
                        <label className="block text-xs font-medium text-[#172B3A]/75">
                          Listing Visibility
                        </label>
                        <select
                          value={editStatus}
                          onChange={(e) =>
                            setEditStatus(e.target.value === 'DRAFT' ? 'DRAFT' : 'ACTIVE')
                          }
                          className="mt-1 h-10 w-full rounded-lg border border-[#172B3A]/15 bg-white px-3 text-xs font-medium"
                        >
                          <option value="ACTIVE">ACTIVE (Visible in Search)</option>
                          <option value="DRAFT">DRAFT (Hidden)</option>
                        </select>
                      </div>
                    </div>

                    {/* Protected Sensitive Fields (Read-Only) */}
                    <div className="rounded-lg border border-amber-200 bg-amber-50/80 p-3 text-[11px] text-amber-950">
                      <p className="flex items-center gap-1.5 font-semibold">
                        <Lock className="h-3.5 w-3.5 shrink-0 text-amber-700" />
                        Protected Fields (Cannot Be Edited)
                      </p>
                      <p className="mt-1 break-words opacity-85">
                        Profile: <strong>{business.businessName}</strong> · Type:{' '}
                        <strong>{listing.listingType}</strong> · Currency:{' '}
                        <strong>{listing.currency}</strong> · Verification:{' '}
                        <strong>{business.verificationStatus}</strong>
                        {!isJobSeeker && ` · License: ${business.licenseNumber}`}
                      </p>
                      <p className="mt-0.5 text-[10px] opacity-75">
                        Identity, verification status, category, license, and currency are locked
                        for marketplace safety.
                      </p>
                    </div>

                    {editError && (
                      <div className="rounded-lg border border-red-200 bg-red-50 px-3.5 py-2.5 text-xs text-red-700 break-words">
                        {editError}
                      </div>
                    )}

                    <div className="flex flex-wrap gap-2">
                      <button
                        type="submit"
                        disabled={editSaving || editMediaBusy}
                        className="inline-flex min-h-[42px] flex-1 items-center justify-center gap-1.5 rounded-lg bg-[#176B52] px-4 py-2 text-xs font-semibold text-white hover:bg-[#125641] disabled:opacity-50"
                      >
                        <CheckCircle2 className="h-4 w-4" />
                        {editSaving ? 'Saving Changes...' : 'Save Advertisement Changes'}
                      </button>
                      <button
                        type="button"
                        onClick={() => setEditMode(false)}
                        className="min-h-[42px] rounded-lg border border-[#172B3A]/20 bg-white px-4 py-2 text-xs font-semibold text-[#172B3A] hover:bg-[#F4F6F5]"
                      >
                        Cancel
                      </button>
                    </div>
                  </form>
                ) : (
                  <div className="space-y-4">
                    <div className="rounded-xl border border-[#176B52]/25 bg-white p-4 space-y-2">
                      <div className="flex items-center gap-2 text-xs font-bold text-[#176B52]">
                        <ShieldAlert className="h-4 w-4 shrink-0" />
                        <span>This is your advertisement</span>
                      </div>
                      <p className="text-xs leading-relaxed text-[#172B3A]/75">
                        You cannot send messages, orders, or service requests to yourself. Clients
                        who contact you appear in your Messages &amp; Live Chat inbox.
                      </p>
                    </div>

                    <div className="rounded-lg border border-[#172B3A]/10 bg-white p-3.5 text-xs space-y-1.5">
                      <div className="flex justify-between gap-2">
                        <span className="text-[#172B3A]/65">Availability</span>
                        <span className="font-semibold text-[#176B52]">
                          {listing.availabilityStatus}
                        </span>
                      </div>
                      <div className="flex justify-between gap-2">
                        <span className="text-[#172B3A]/65">Status</span>
                        <span className="font-semibold text-[#172B3A]">{listing.status}</span>
                      </div>
                      {isCartItem && (() => {
                        const pol = getListingPolicy(listing);
                        return (
                          <>
                            <div className="flex justify-between gap-2">
                              <span className="text-[#172B3A]/65">Delivery</span>
                              <span className="font-semibold text-[#172B3A]">
                                {pol.deliveryAvailable
                                  ? `With Delivery (~${pol.estimatedDeliveryMinutes} min${
                                      pol.freeDeliveryMaxKm > 0
                                        ? ` · Free 0–${pol.freeDeliveryMaxKm} km`
                                        : ' · Buyer pays delivery'
                                    })`
                                  : 'Without Delivery (Pickup Only)'}
                              </span>
                            </div>
                            <div className="flex justify-between gap-2">
                              <span className="text-[#172B3A]/65">Tax / VAT</span>
                              <span className="font-semibold text-[#172B3A]">
                                {pol.taxResponsibility === 'SELLER'
                                  ? 'From Seller (Buyer pays visible amount only)'
                                  : 'From Buyer (+VAT added at checkout)'}
                              </span>
                            </div>
                            <div className="flex justify-between gap-2">
                              <span className="text-[#172B3A]/65">Return if Unsatisfied</span>
                              <span className="font-semibold text-[#172B3A]">
                                {pol.returnable
                                  ? `${pol.returnWindowDays}d · ${pol.returnLossPercent}% + ${formatEtb(pol.returnLossFixedEtb)} loss`
                                  : 'Non-Returnable'}
                              </span>
                            </div>
                          </>
                        );
                      })()}
                      <div className="flex justify-between gap-2">
                        <span className="text-[#172B3A]/65">Verification (Locked)</span>
                        <span className="font-semibold text-[#172B3A]">
                          {business.verificationStatus}
                        </span>
                      </div>
                    </div>

                    <button
                      type="button"
                      onClick={() => setEditMode(true)}
                      className="flex min-h-[44px] w-full items-center justify-center gap-2 rounded-lg bg-[#176B52] px-5 py-3 text-sm font-semibold text-white hover:bg-[#125641]"
                    >
                      <Pencil className="h-4 w-4" />
                      Edit Advertisement (Non-Sensitive Fields)
                    </button>
                  </div>
                )
              ) : (
                <>
                  {isCartItem && (
                    <div className="space-y-4">
                      {(() => {
                        const pol = getListingPolicy(listing);
                        const itemPrice = Number(listing.discountPrice || listing.basePrice) || 0;
                        const sampleDeliveryFee =
                          pol.deliveryAvailable && pol.freeDeliveryMaxKm === 0 ? 120 : 0;
                        const loss = calculateReturnLoss(itemPrice, sampleDeliveryFee, pol, 1);
                        return (
                          <div className="space-y-2 rounded-xl border border-[#172B3A]/12 bg-white p-3.5 text-xs">
                            <p className="font-bold text-[#172B3A]">
                              Delivery, Tax, Acceptance &amp; Unsatisfied Return Disclosure
                            </p>
                            <div className="space-y-1 text-[#172B3A]/80">
                              <p>
                                <strong className="text-[#172B3A]">Delivery:</strong>{' '}
                                {pol.deliveryAvailable
                                  ? `With Delivery · Ready in ~${pol.estimatedReadyMinutes} min · Deliverable in ~${pol.estimatedDeliveryMinutes} min · ${
                                      pol.freeDeliveryMaxKm > 0
                                        ? `Free from 0–${pol.freeDeliveryMaxKm} km (covered by provider); buyer pays beyond ${pol.freeDeliveryMaxKm} km`
                                        : 'Buyer pays distance delivery fee'
                                    }`
                                  : `Without Delivery (Store Pickup Only at ${business.landmark}, ${business.subCity}) · Ready in ~${pol.estimatedReadyMinutes} min`}
                              </p>
                              <p>
                                <strong className="text-[#172B3A]">Tax / VAT:</strong>{' '}
                                {pol.taxResponsibility === 'SELLER'
                                  ? 'Tax is covered by Seller — Buyer pays only the visible price (no extra tax added at checkout).'
                                  : 'Tax is paid by Buyer — Platform VAT is added on top of the visible price at checkout.'}
                              </p>
                              <p>
                                <strong className="text-[#172B3A]">Order Acceptance:</strong>{' '}
                                {pol.isFood
                                  ? 'Order Request — Seller reviews your order and confirms exact prep & delivery time.'
                                  : pol.immediateAcceptance
                                    ? `Immediate Acceptance — Confirmed on checkout with ~${pol.estimatedReadyMinutes} min ready / ~${pol.estimatedDeliveryMinutes} min delivery.`
                                    : 'Order Request — Seller accepts/rejects and confirms ready & delivery time.'}
                              </p>
                              <p>
                                <strong className="text-[#172B3A]">If Unsatisfied (Returns):</strong>{' '}
                                {pol.returnable
                                  ? `Returnable within ${pol.returnWindowDays} day(s). Deduction: ${pol.returnLossPercent}% item fee${pol.returnLossFixedEtb > 0 ? ` + ${formatEtb(pol.returnLossFixedEtb)}` : ''}. ${
                                      pol.deliveryAvailable
                                        ? pol.deliveryFeeNonRefundableOnReturn
                                          ? 'Buyer loses the delivery fee upon return.'
                                          : 'Delivery fee is refunded on return.'
                                        : ''
                                    }`
                                  : 'Non-Returnable (Final Sale). Buyer bears 100% of item and delivery cost if unsatisfied.'}
                              </p>
                              <p className="font-mono text-[11px] tabular-nums text-[#176B52]">
                                Sample buyer loss (1 unit @ {formatEtb(itemPrice)}
                                {pol.deliveryAvailable
                                  ? pol.freeDeliveryMaxKm > 0
                                    ? ` + 0 ETB delivery within 0–${pol.freeDeliveryMaxKm} km`
                                    : ` + ${formatEtb(sampleDeliveryFee)} est. delivery`
                                  : ''}
                                ):{' '}
                                <strong>{formatEtb(loss.totalLossEtb)} lost</strong> (Refund:{' '}
                                <strong>{formatEtb(loss.refundEtb)}</strong>)
                              </p>
                              {pol.returnPolicyNote && (
                                <p className="text-[11px] text-[#172B3A]/65">
                                  Seller note: {pol.returnPolicyNote}
                                </p>
                              )}
                            </div>
                          </div>
                        );
                      })()}

                      {variants.length > 0 && (
                        <div>
                          <span className="block text-xs font-medium text-[#172B3A]/75">
                            Select Variant / Option
                          </span>
                          <div className="mt-2 flex flex-wrap gap-2">
                            {variants.map((v) => (
                              <button
                                key={v}
                                type="button"
                                onClick={() => setSelectedVariant(v)}
                                className={`min-h-[36px] rounded-lg border px-3 py-1.5 text-xs font-medium ${
                                  activeVariant === v
                                    ? 'border-[#176B52] bg-[#176B52] text-white'
                                    : 'border-[#172B3A]/15 bg-white text-[#172B3A]'
                                }`}
                              >
                                {v}
                              </button>
                            ))}
                          </div>
                        </div>
                      )}

                      <button
                        type="button"
                        onClick={() => {
                          onAddToCart(listing, business, activeVariant);
                          onClose();
                        }}
                        className="w-full min-h-[44px] rounded-lg bg-[#176B52] px-5 py-3 text-sm font-semibold text-white hover:bg-[#125641]"
                      >
                        Add to Cart · {formatEtb(listing.discountPrice || listing.basePrice)}{' '}
                        {getListingPolicy(listing).taxResponsibility === 'SELLER'
                          ? '(No extra tax)'
                          : '(+VAT)'}
                      </button>
                    </div>
                  )}

                  {!isCartItem && !isJob && (
                    <div className="min-w-0 space-y-4">
                      {isServiceDelivering && (
                        <div className="min-w-0 space-y-3">
                          <LiveChatPanel
                            threadKey={contactThreadKey}
                            businessId={business.id}
                            listingId={listing.id}
                            recipientUid={business.ownerUid}
                            title={
                              isJobSeeker
                                ? `Contact & Live Chat · ${advertiserProfileName}`
                                : `Contact & Write Message · ${messageTimeLabel}`
                            }
                            maskedTitle="Contact & Write Message"
                            revealTitleOnMessage={!showProviderName}
                            subtitle={`${formatPricingModelLabel(listing.pricingModel)} · Instant WebSocket replies`}
                            placeholder="Write a message to contact or reply..."
                            onMessageSent={(text) =>
                              onMessageDelivered?.({
                                recipientLabel: messageTimeLabel,
                                preview: text,
                                threadKey: contactThreadKey,
                              })
                            }
                            onContractUpdated={() => setContractRefreshSignal((n) => n + 1)}
                          />

                          <ContractOfferSection
                            threadKey={contactThreadKey}
                            businessId={business.id}
                            listingId={listing.id}
                            recipientUid={business.ownerUid}
                            defaultContractType={listing.pricingModel}
                            defaultTitle={listing.title}
                            defaultAmount={Number(listing.discountPrice || listing.basePrice || 0)}
                            isOwner={isOwner}
                            compact
                            refreshSignal={contractRefreshSignal}
                            onContractChanged={() => setContractRefreshSignal((n) => n + 1)}
                          />

                          <button
                            type="button"
                            onClick={() => setShowServiceProposalForm((prev) => !prev)}
                            className="flex w-full items-center justify-between gap-2 rounded-lg border border-[#172B3A]/15 bg-white px-3.5 py-2.5 text-left text-xs font-semibold text-[#172B3A] hover:bg-[#F4F6F5]"
                          >
                            <span className="min-w-0 break-words">
                              {isJobSeeker
                                ? 'Schedule Visit / Dated Engagement Request (Optional)'
                                : 'Schedule Service Date & Estimate Request (Optional)'}
                            </span>
                            {showServiceProposalForm ? (
                              <ChevronUp className="h-4 w-4 shrink-0 text-[#176B52]" />
                            ) : (
                              <ChevronDown className="h-4 w-4 shrink-0 text-[#176B52]" />
                            )}
                          </button>
                        </div>
                      )}

                      {(!isServiceDelivering || showServiceProposalForm) && (
                        <div className="space-y-4">
                          {listing.pricingModel === 'CALCULATED' && listing.pricingFormula && (
                            <div className="space-y-3 rounded-lg border border-[#172B3A]/10 bg-white p-4">
                              <p className="text-xs font-semibold text-[#172B3A]">
                                Interactive Price Calculator
                              </p>
                              {listing.pricingFormula.perKmRate && (
                                <div>
                                  <div className="flex justify-between text-xs">
                                    <span>Distance</span>
                                    <span className="font-mono font-semibold tabular-nums">
                                      {distanceKm} km
                                    </span>
                                  </div>
                                  <input
                                    type="range"
                                    min={1}
                                    max={40}
                                    value={distanceKm}
                                    onChange={(e) => setDistanceKm(Number(e.target.value))}
                                    className="mt-1 w-full accent-[#176B52]"
                                  />
                                </div>
                              )}
                              {listing.pricingFormula.perWorkerRate && (
                                <div>
                                  <div className="flex justify-between text-xs">
                                    <span>Crew / Workers</span>
                                    <span className="font-mono font-semibold tabular-nums">
                                      {workers} workers
                                    </span>
                                  </div>
                                  <input
                                    type="range"
                                    min={1}
                                    max={8}
                                    value={workers}
                                    onChange={(e) => setWorkers(Number(e.target.value))}
                                    className="mt-1 w-full accent-[#176B52]"
                                  />
                                </div>
                              )}
                              {listing.pricingFormula.perSqmRate && (
                                <div>
                                  <div className="flex justify-between text-xs">
                                    <span>Surface Area</span>
                                    <span className="font-mono font-semibold tabular-nums">
                                      {areaSqm} m²
                                    </span>
                                  </div>
                                  <input
                                    type="range"
                                    min={10}
                                    max={250}
                                    step={5}
                                    value={areaSqm}
                                    onChange={(e) => setAreaSqm(Number(e.target.value))}
                                    className="mt-1 w-full accent-[#176B52]"
                                  />
                                </div>
                              )}
                            </div>
                          )}

                          {listing.pricingModel !== 'CALCULATED' &&
                            listing.listingType !== 'RENTAL' && (
                              <div>
                                <label className="block text-xs font-medium text-[#172B3A]/75">
                                  Duration / Quantity ({listing.pricingUnit}s)
                                </label>
                                <input
                                  type="number"
                                  min={1}
                                  max={24}
                                  value={units}
                                  onChange={(e) => setUnits(Math.max(1, Number(e.target.value)))}
                                  className="mt-1 w-full rounded-lg border border-[#172B3A]/15 bg-white px-3 py-2 font-mono text-sm tabular-nums"
                                />
                              </div>
                            )}

                          <div className="grid gap-3 sm:grid-cols-2">
                            <div>
                              <label className="block text-xs font-medium text-[#172B3A]/75">
                                {listing.listingType === 'RENTAL' ? 'Start Date' : 'Preferred Date'}
                              </label>
                              <input
                                type="date"
                                value={scheduledDate}
                                onChange={(e) => setScheduledDate(e.target.value)}
                                className="mt-1 w-full rounded-lg border border-[#172B3A]/15 bg-white px-3 py-2 font-mono text-xs"
                              />
                            </div>
                            {listing.listingType === 'RENTAL' ? (
                              <div>
                                <label className="block text-xs font-medium text-[#172B3A]/75">
                                  End Date (Overlap Protected)
                                </label>
                                <input
                                  type="date"
                                  value={endDate}
                                  onChange={(e) => setEndDate(e.target.value)}
                                  className="mt-1 w-full rounded-lg border border-[#172B3A]/15 bg-white px-3 py-2 font-mono text-xs"
                                />
                              </div>
                            ) : (
                              <div>
                                <label className="block text-xs font-medium text-[#172B3A]/75">
                                  Preferred Time
                                </label>
                                <input
                                  type="time"
                                  value={scheduledTime}
                                  onChange={(e) => setScheduledTime(e.target.value)}
                                  className="mt-1 w-full rounded-lg border border-[#172B3A]/15 bg-white px-3 py-2 font-mono text-xs"
                                />
                              </div>
                            )}
                          </div>

                          <div>
                            <label className="block text-xs font-medium text-[#172B3A]/75">
                              Service / Reservation Notes
                            </label>
                            <input
                              type="text"
                              value={notes}
                              onChange={(e) => setNotes(e.target.value)}
                              placeholder="Floor level, gate instructions, or special needs"
                              className="mt-1 w-full rounded-lg border border-[#172B3A]/15 bg-white px-3 py-2 text-xs"
                            />
                          </div>

                          {/* Transparent Itemized Breakdown */}
                          <div className="space-y-1.5 rounded-lg border border-[#172B3A]/10 bg-white p-3.5 text-xs">
                            <p className="font-semibold text-[#172B3A]">
                              Itemized Estimate Before Confirmation
                            </p>
                            {formulaEstimate.breakdown.map((line, i) => (
                              <div
                                key={i}
                                className="flex justify-between gap-2 text-[#172B3A]/75"
                              >
                                <span className="min-w-0 break-words">{line.label}</span>
                                <span className="shrink-0 font-mono tabular-nums">
                                  {formatEtb(line.amount)}
                                </span>
                              </div>
                            ))}
                            <div className="flex justify-between gap-2 border-t border-[#172B3A]/10 pt-2 font-semibold text-[#172B3A]">
                              <span>Total Payable</span>
                              <span className="shrink-0 font-mono text-sm tabular-nums text-[#176B52]">
                                {formatEtb(formulaEstimate.total)}
                              </span>
                            </div>
                          </div>

                          <div className="grid grid-cols-2 gap-1.5 sm:grid-cols-5 sm:gap-2">
                            {([
                              { id: 'CHAPA', label: 'Chapa' },
                              { id: 'PAYO', label: 'Payo' },
                              { id: 'TELEBIRR', label: 'Telebirr' },
                              { id: 'CBE_BIRR', label: 'CBE Birr' },
                              { id: 'CASH', label: 'Cash' },
                            ] as const).map((pm) => (
                              <button
                                key={pm.id}
                                type="button"
                                onClick={() => setPaymentMethod(pm.id)}
                                className={`min-h-[38px] min-w-0 truncate rounded-lg border px-2 py-1.5 text-xs font-semibold ${
                                  paymentMethod === pm.id
                                    ? 'border-[#176B52] bg-[#176B52]/10 text-[#176B52]'
                                    : 'border-[#172B3A]/15 bg-white text-[#172B3A]/75'
                                }`}
                              >
                                {pm.label}
                              </button>
                            ))}
                          </div>

                          <button
                            type="button"
                            disabled={submitting}
                            onClick={handleBookOrReserve}
                            className="w-full min-h-[44px] rounded-lg bg-[#176B52] px-5 py-3 text-sm font-semibold text-white hover:bg-[#125641] disabled:opacity-50"
                          >
                            {submitting
                              ? 'Sending...'
                              : isJobSeeker
                                ? isNegotiable
                                  ? 'Send Hire Proposal (Negotiable)'
                                  : `Send Hire Proposal · ${formatEtb(formulaEstimate.total)}`
                                : isServiceDelivering
                                  ? listing.isQuoteBased
                                    ? `Send Service Quote Request · Est. ${formatEtb(formulaEstimate.total)}`
                                    : `Send Service Request · ${formatEtb(formulaEstimate.total)}`
                                  : listing.listingType === 'RENTAL'
                                    ? `Reserve Dates · ${formatEtb(formulaEstimate.total)}`
                                    : `Confirm Booking · ${formatEtb(formulaEstimate.total)}`}
                          </button>
                        </div>
                      )}
                    </div>
                  )}

                  {isJob && (
                    <div className="space-y-3">
                      <p className="text-xs font-medium text-[#172B3A]/75">
                        Employment Type: {listing.metadata?.employmentType || 'Contract'} ·{' '}
                        {listing.metadata?.contractType || 'Verified Vacancy'}
                      </p>
                      <div className="grid gap-3 sm:grid-cols-2">
                        <input
                          type="text"
                          value={applicantName}
                          onChange={(e) => setApplicantName(e.target.value)}
                          placeholder="Full name"
                          className="min-w-0 rounded-lg border border-[#172B3A]/15 bg-white px-3 py-2 text-xs"
                        />
                        <input
                          type="text"
                          value={applicantPhone}
                          onChange={(e) => setApplicantPhone(e.target.value)}
                          placeholder="Phone (+251...)"
                          className="min-w-0 rounded-lg border border-[#172B3A]/15 bg-white px-3 py-2 text-xs"
                        />
                      </div>
                      <div className="grid gap-3 sm:grid-cols-2">
                        <input
                          type="text"
                          value={skills}
                          onChange={(e) => setSkills(e.target.value)}
                          placeholder="Key skills (e.g., Java, Electrical)"
                          className="min-w-0 rounded-lg border border-[#172B3A]/15 bg-white px-3 py-2 text-xs"
                        />
                        <input
                          type="number"
                          min={0}
                          value={experienceYears}
                          onChange={(e) => setExperienceYears(Number(e.target.value))}
                          placeholder="Years experience"
                          className="min-w-0 rounded-lg border border-[#172B3A]/15 bg-white px-3 py-2 font-mono text-xs"
                        />
                      </div>
                      <input
                        type="number"
                        value={expectedComp || Number(listing.basePrice)}
                        onChange={(e) => setExpectedComp(Number(e.target.value))}
                        placeholder="Expected compensation (ETB)"
                        className="w-full rounded-lg border border-[#172B3A]/15 bg-white px-3 py-2 font-mono text-xs"
                      />
                      <textarea
                        rows={3}
                        value={coverLetter}
                        onChange={(e) => setCoverLetter(e.target.value)}
                        placeholder="Brief experience summary and availability..."
                        className="w-full rounded-lg border border-[#172B3A]/15 bg-white px-3 py-2 text-xs"
                      />
                      <button
                        type="button"
                        disabled={submitting}
                        onClick={handleApplyJob}
                        className="w-full min-h-[44px] rounded-lg bg-[#176B52] px-5 py-3 text-sm font-semibold text-white hover:bg-[#125641] disabled:opacity-50"
                      >
                        {submitting ? 'Submitting Application...' : 'Submit Job Application'}
                      </button>
                    </div>
                  )}

                  {errorMsg && (
                    <div className="rounded-lg border border-red-200 bg-red-50 px-3.5 py-2.5 text-xs text-red-700 break-words">
                      {errorMsg}
                    </div>
                  )}

                  {!isServiceDelivering && (
                    <div className="min-w-0 border-t border-[#172B3A]/10 pt-4">
                      <LiveChatPanel
                        compact
                        threadKey={contactThreadKey}
                        businessId={business.id}
                        listingId={listing.id}
                        recipientUid={business.ownerUid}
                        title={`Live Chat · ${messageTimeLabel}`}
                        maskedTitle={isJob ? 'Message Employer' : 'Message Seller'}
                        revealTitleOnMessage={!showProviderName}
                        subtitle={
                          !showProviderName
                            ? 'Seller name is revealed when you send a message'
                            : 'Write a message below for instant replies'
                        }
                        placeholder="Write a message to contact or reply..."
                        onMessageSent={(text) =>
                          onMessageDelivered?.({
                            recipientLabel: messageTimeLabel,
                            preview: text,
                            threadKey: contactThreadKey,
                          })
                        }
                      />
                    </div>
                  )}
                </>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
