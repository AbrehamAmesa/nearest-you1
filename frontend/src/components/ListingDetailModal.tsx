import React, { useMemo, useState } from 'react';
import { ChevronDown, ChevronUp, ExternalLink, FileText, Play, ShieldCheck, Star, X } from 'lucide-react';
import type { Business, Listing, ReviewItem } from '../types/nearestyou.ts';
import { calculateDistanceKm, formatEtb } from '../utils/geo.ts';
import { formatPricingModelLabel } from '../utils/i18n.ts';
import { getListingImages, getYouTubeEmbedUrl } from '../utils/media.ts';
import { ListingVisual } from './ListingVisual.tsx';
import { LiveChatPanel } from './LiveChatPanel.tsx';
import { useAuth } from '../context/AuthContext.tsx';

interface ListingDetailModalProps {
  listing: Listing | null;
  business: Business | null;
  reviews: ReviewItem[];
  userLat: number;
  userLng: number;
  onClose: () => void;
  onAddToCart: (listing: Listing, business: Business, variant?: string) => void;
  onActionSuccess: (message: string) => void;
}

export const ListingDetailModal: React.FC<ListingDetailModalProps> = ({
  listing,
  business,
  reviews,
  userLat,
  userLng,
  onClose,
  onAddToCart,
  onActionSuccess,
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
  const [paymentMethod, setPaymentMethod] = useState<'TELEBIRR' | 'CBE_BIRR' | 'CASH'>('TELEBIRR');
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
  const [submitting, setSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

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
  const isNegotiable = listing.isUnpaid && Number(listing.basePrice) === 0;
  const contactThreadKey = `contact:${business.id}:${listing.id}:${dbUser?.uid || firebaseUser?.uid || 'guest'}`;

  const handleBookOrReserve = async () => {
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
      onActionSuccess(`Application submitted to ${business.businessName}.`);
      onClose();
    } catch (err: unknown) {
      setErrorMsg(err instanceof Error ? err.message : 'Failed to submit application.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-[#172B3A]/45 p-4 backdrop-blur-[2px]">
      <div className="max-h-[92vh] w-full max-w-4xl overflow-y-auto rounded-xl border border-[#172B3A]/10 bg-white shadow-2xl">
        <div className="sticky top-0 z-10 flex items-center justify-between border-b border-[#172B3A]/10 bg-white px-6 py-4">
          <div className="min-w-0">
            <p className="text-xs text-[#172B3A]/60">
              {business.businessName} · {business.subCity} · {distKm} km away
            </p>
            <h2 className="truncate font-display text-xl font-bold text-[#172B3A]">
              {listing.title}
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close listing details"
            className="flex h-10 w-10 items-center justify-center rounded-lg border border-[#172B3A]/10 text-[#172B3A]/70 hover:bg-[#F4F6F5]"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="grid gap-8 p-6 lg:grid-cols-12">
          <div className="space-y-6 lg:col-span-6">
            {(() => {
              const gallery = getListingImages(listing);
              const youtubeEmbed = getYouTubeEmbedUrl(listing.metadata?.introVideoUrl);
              return (
                <>
                  <ListingVisual
                    imageUrl={listing.imageUrl}
                    imageUrls={listing.imageUrls}
                    companyLogoUrl={listing.metadata?.companyLogoUrl}
                    introVideoUrl={listing.metadata?.introVideoUrl}
                    cvUrl={listing.metadata?.cvUrl}
                    title={listing.title}
                    listingType={listing.listingType}
                    className="h-64 w-full rounded-xl"
                    showSlideControls={gallery.length > 1}
                    activeSlideIndex={galleryIndex}
                    onSlideChange={setGalleryIndex}
                  />

                  {gallery.length > 1 && (
                    <div className="grid grid-cols-5 gap-2">
                      {gallery.map((src, idx) => (
                        <button
                          key={`${src.slice(0, 32)}-${idx}`}
                          type="button"
                          onClick={() => setGalleryIndex(idx)}
                          className={`h-14 overflow-hidden rounded-lg border transition-all ${
                            idx === galleryIndex % gallery.length
                              ? 'border-[#176B52] ring-2 ring-[#176B52]/30'
                              : 'border-[#172B3A]/15 opacity-75 hover:opacity-100'
                          }`}
                        >
                          <img
                            src={src}
                            alt={`${listing.title} thumbnail ${idx + 1}`}
                            className="h-full w-full object-cover"
                          />
                        </button>
                      ))}
                    </div>
                  )}

                  {youtubeEmbed && (
                    <div className="overflow-hidden rounded-xl border border-[#172B3A]/10 bg-[#F4F6F5]">
                      <div className="flex items-center justify-between border-b border-[#172B3A]/10 px-3.5 py-2 text-xs">
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
                      <div className="flex min-w-0 items-center gap-2.5">
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
                        className="inline-flex min-h-[34px] items-center gap-1.5 rounded-lg bg-[#176B52] px-3 py-1.5 font-semibold text-white hover:bg-[#125641]"
                      >
                        Download / View CV
                      </a>
                    </div>
                  )}
                </>
              );
            })()}

            <div>
              <div className="flex flex-wrap items-center gap-2 text-xs text-[#172B3A]/65">
                <span className="inline-flex items-center gap-1 font-medium text-[#176B52]">
                  <ShieldCheck className="h-3.5 w-3.5" />
                  {isJobSeeker
                    ? 'Individual Job Seeker'
                    : business.verificationStatus === 'APPROVED'
                      ? 'Verified Business'
                      : business.verificationStatus}
                </span>
                {!isJobSeeker && (
                  <>
                    <span>·</span>
                    <span>License {business.licenseNumber}</span>
                  </>
                )}
                <span>·</span>
                <span className="inline-flex items-center gap-1 font-mono tabular-nums">
                  <Star className="h-3.5 w-3.5 fill-[#F4A62A] text-[#F4A62A]" />
                  {Number(listing.ratingAvg).toFixed(1)} ({listing.ratingCount})
                </span>
              </div>
              <p className="mt-3 text-sm leading-relaxed text-[#172B3A]/85">
                {listing.description}
              </p>
              {(listing.metadata?.skills || listing.metadata?.experienceSummary) && (
                <div className="mt-3 space-y-1 rounded-lg border border-[#172B3A]/10 bg-[#F4F6F5] p-3 text-xs text-[#172B3A]/80">
                  {listing.metadata.skills && (
                    <p>
                      <strong className="text-[#172B3A]">Skills:</strong> {listing.metadata.skills}
                    </p>
                  )}
                  {listing.metadata.experienceSummary && (
                    <p>
                      <strong className="text-[#172B3A]">Experience:</strong>{' '}
                      {listing.metadata.experienceSummary}
                    </p>
                  )}
                </div>
              )}
              <p className="mt-2 text-xs text-[#172B3A]/60">
                Location: {business.landmark}, {business.subCity} · Contact: {business.contactPhone} ·{' '}
                Hours: {business.openingHours}
              </p>
            </div>

            {listing.pricingFormula?.factors && (
              <div className="rounded-xl border border-[#172B3A]/10 bg-[#F4F6F5] p-4">
                <h3 className="text-xs font-semibold text-[#172B3A]">
                  Disclosed Pricing Formula (Mandatory Transparency)
                </h3>
                <ul className="mt-2 space-y-1 text-xs text-[#172B3A]/75">
                  {listing.pricingFormula.factors.map((f, idx) => (
                    <li key={idx}>· {f}</li>
                  ))}
                </ul>
              </div>
            )}

            {!isServiceDelivering && (
              <div className="border-t border-[#172B3A]/10 pt-4">
                <LiveChatPanel
                  compact
                  threadKey={contactThreadKey}
                  businessId={business.id}
                  listingId={listing.id}
                  recipientUid={business.ownerUid}
                  title={`Live Chat · ${business.businessName}`}
                  subtitle="Write a message below for instant replies"
                  placeholder="Write a message to contact or reply..."
                />
              </div>
            )}

            {listingReviews.length > 0 && (
              <div className="border-t border-[#172B3A]/10 pt-4">
                <h3 className="text-xs font-semibold text-[#172B3A]">Verified Customer Reviews</h3>
                <div className="mt-2 space-y-3">
                  {listingReviews.slice(0, 3).map((r) => (
                    <div key={r.id} className="text-xs">
                      <p className="font-medium text-[#172B3A]">
                        {r.customerName} · {r.rating}/5 ★ ·{' '}
                        <span className="font-mono text-[#172B3A]/50">{r.transactionRef}</span>
                      </p>
                      <p className="mt-0.5 text-[#172B3A]/75">{r.comment}</p>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Right Contiguous Transaction / Calculator Module */}
          <div className="lg:col-span-6">
            <div className="rounded-xl border border-[#172B3A]/10 bg-[#F4F6F5]/60 p-5 space-y-5">
              <div className="border-b border-[#172B3A]/10 pb-4">
                <p className="text-xs font-medium text-[#172B3A]/60">
                  {formatPricingModelLabel(listing.pricingModel)} · Currency: {listing.currency}
                </p>
                <div className="mt-1 flex items-baseline gap-3">
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

              {isCartItem && (
                <div className="space-y-4">
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
                      onActionSuccess(`Added "${listing.title}" to cart.`);
                      onClose();
                    }}
                    className="w-full min-h-[44px] rounded-lg bg-[#176B52] px-5 py-3 text-sm font-semibold text-white hover:bg-[#125641]"
                  >
                    Add to Cart · {formatEtb(listing.discountPrice || listing.basePrice)}
                  </button>
                </div>
              )}

              {!isCartItem && !isJob && (
                <div className="space-y-4">
                  {isServiceDelivering && (
                    <div className="space-y-3">
                      <LiveChatPanel
                        threadKey={contactThreadKey}
                        businessId={business.id}
                        listingId={listing.id}
                        recipientUid={business.ownerUid}
                        title={
                          isJobSeeker
                            ? `Contact & Live Chat · ${business.businessName}`
                            : `Contact & Write Message · ${business.businessName}`
                        }
                        subtitle={`${formatPricingModelLabel(listing.pricingModel)} · Instant WebSocket replies`}
                        placeholder="Write a message to contact or reply..."
                      />
                      <button
                        type="button"
                        onClick={() => setShowServiceProposalForm((prev) => !prev)}
                        className="flex w-full items-center justify-between rounded-lg border border-[#172B3A]/15 bg-white px-3.5 py-2.5 text-xs font-semibold text-[#172B3A] hover:bg-[#F4F6F5]"
                      >
                        <span>
                          {isJobSeeker
                            ? 'Send Formal Hire / Contract Proposal (Optional)'
                            : 'Send Formal Service Request / Estimate (Optional)'}
                        </span>
                        {showServiceProposalForm ? (
                          <ChevronUp className="h-4 w-4 text-[#176B52]" />
                        ) : (
                          <ChevronDown className="h-4 w-4 text-[#176B52]" />
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
                            <span className="font-mono font-semibold tabular-nums">{distanceKm} km</span>
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
                            <span className="font-mono font-semibold tabular-nums">{workers} workers</span>
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
                            <span className="font-mono font-semibold tabular-nums">{areaSqm} m²</span>
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

                  {listing.pricingModel !== 'CALCULATED' && listing.listingType !== 'RENTAL' && (
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
                        className="mt-1 w-full rounded-lg border border-[#172B3A]/15 bg-white px-3 py-2 text-sm font-mono tabular-nums"
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
                        className="mt-1 w-full rounded-lg border border-[#172B3A]/15 bg-white px-3 py-2 text-xs font-mono"
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
                          className="mt-1 w-full rounded-lg border border-[#172B3A]/15 bg-white px-3 py-2 text-xs font-mono"
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
                          className="mt-1 w-full rounded-lg border border-[#172B3A]/15 bg-white px-3 py-2 text-xs font-mono"
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
                    <p className="font-semibold text-[#172B3A]">Itemized Estimate Before Confirmation</p>
                    {formulaEstimate.breakdown.map((line, i) => (
                      <div key={i} className="flex justify-between text-[#172B3A]/75">
                        <span>{line.label}</span>
                        <span className="font-mono tabular-nums">{formatEtb(line.amount)}</span>
                      </div>
                    ))}
                    <div className="flex justify-between border-t border-[#172B3A]/10 pt-2 font-semibold text-[#172B3A]">
                      <span>Total Payable</span>
                      <span className="font-mono text-sm tabular-nums text-[#176B52]">
                        {formatEtb(formulaEstimate.total)}
                      </span>
                    </div>
                  </div>

                  <div className="grid grid-cols-3 gap-2">
                    {(['TELEBIRR', 'CBE_BIRR', 'CASH'] as const).map((pm) => (
                      <button
                        key={pm}
                        type="button"
                        onClick={() => setPaymentMethod(pm)}
                        className={`min-h-[38px] rounded-lg border px-2 py-1.5 text-xs font-semibold ${
                          paymentMethod === pm
                            ? 'border-[#176B52] bg-[#176B52]/10 text-[#176B52]'
                            : 'border-[#172B3A]/15 bg-white text-[#172B3A]/75'
                        }`}
                      >
                        {pm === 'CBE_BIRR' ? 'CBE Birr' : pm === 'TELEBIRR' ? 'Telebirr' : 'Cash'}
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
                      className="rounded-lg border border-[#172B3A]/15 bg-white px-3 py-2 text-xs"
                    />
                    <input
                      type="text"
                      value={applicantPhone}
                      onChange={(e) => setApplicantPhone(e.target.value)}
                      placeholder="Phone (+251...)"
                      className="rounded-lg border border-[#172B3A]/15 bg-white px-3 py-2 text-xs"
                    />
                  </div>
                  <div className="grid gap-3 sm:grid-cols-2">
                    <input
                      type="text"
                      value={skills}
                      onChange={(e) => setSkills(e.target.value)}
                      placeholder="Key skills (e.g., Java, Electrical)"
                      className="rounded-lg border border-[#172B3A]/15 bg-white px-3 py-2 text-xs"
                    />
                    <input
                      type="number"
                      min={0}
                      value={experienceYears}
                      onChange={(e) => setExperienceYears(Number(e.target.value))}
                      placeholder="Years experience"
                      className="rounded-lg border border-[#172B3A]/15 bg-white px-3 py-2 text-xs font-mono"
                    />
                  </div>
                  <input
                    type="number"
                    value={expectedComp || Number(listing.basePrice)}
                    onChange={(e) => setExpectedComp(Number(e.target.value))}
                    placeholder="Expected compensation (ETB)"
                    className="w-full rounded-lg border border-[#172B3A]/15 bg-white px-3 py-2 text-xs font-mono"
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
                <div className="rounded-lg border border-red-200 bg-red-50 px-3.5 py-2.5 text-xs text-red-700">
                  {errorMsg}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
