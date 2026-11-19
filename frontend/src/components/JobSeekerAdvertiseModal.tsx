import React, { useEffect, useMemo, useState } from 'react';
import {
  Briefcase,
  CheckCircle2,
  FileText,
  ImagePlus,
  MapPin,
  Navigation,
  Pencil,
  Trash2,
  Upload,
  Video,
  X,
} from 'lucide-react';
import type { Category, DetectedLocation, Listing } from '../types/nearestyou.ts';
import { ADDIS_SUB_CITIES, formatEtb } from '../utils/geo.ts';
import { getCategoryLabel, type AppLanguage } from '../utils/i18n.ts';
import {
  compressImageFile,
  extractYouTubeVideoId,
  MAX_PRODUCT_IMAGES,
  readFileAsDataUrl,
} from '../utils/media.ts';
import { businessApi, jobSeekerApi } from '../api/index.ts';
import { useAuth } from '../context/AuthContext.tsx';

interface JobSeekerAdvertiseModalProps {
  open: boolean;
  categories: Category[];
  detectedLocation: DetectedLocation;
  language: AppLanguage;
  onClose: () => void;
  onSuccess: () => void;
  onNotify: (msg: string) => void;
  onEditAd?: (ad: Listing) => void;
}

export const JobSeekerAdvertiseModal: React.FC<JobSeekerAdvertiseModalProps> = ({
  open,
  categories,
  detectedLocation,
  language,
  onClose,
  onSuccess,
  onNotify,
  onEditAd,
}) => {
  const { dbUser, firebaseUser, openAuthModal } = useAuth();

  const activeCategories = useMemo(
    () => categories.filter((c) => c.status === 'ACTIVE'),
    [categories]
  );

  const defaultJobCatId = useMemo(() => {
    const match = activeCategories.find(
      (c) =>
        c.categoryType === 'JOB' ||
        c.defaultListingType === 'JOB' ||
        c.slug.toLowerCase().includes('job') ||
        c.slug.toLowerCase().includes('workforce')
    );
    return match?.id || activeCategories[0]?.id || categories[0]?.id || 1;
  }, [activeCategories, categories]);

  const [categoryId, setCategoryId] = useState<number>(defaultJobCatId);
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [skills, setSkills] = useState('');
  const [experienceSummary, setExperienceSummary] = useState('');
  const [availabilityNote, setAvailabilityNote] = useState('');
  const [negotiable, setNegotiable] = useState(false);
  const [expectedPay, setExpectedPay] = useState('500');
  const [pricingUnit, setPricingUnit] = useState('PER_HOUR');
  const [phoneNumber, setPhoneNumber] = useState(dbUser?.phoneNumber || '');
  const [subCity, setSubCity] = useState(
    detectedLocation.subCity || dbUser?.defaultSubCity || ADDIS_SUB_CITIES[0].name
  );
  const [landmark, setLandmark] = useState(detectedLocation.label || '');
  const [latitude, setLatitude] = useState<number>(detectedLocation.lat || 9.005401);
  const [longitude, setLongitude] = useState<number>(detectedLocation.lng || 38.763611);
  const [images, setImages] = useState<string[]>([]);
  const [cvUrl, setCvUrl] = useState('');
  const [cvFileName, setCvFileName] = useState('');
  const [introVideoUrl, setIntroVideoUrl] = useState('');
  const [mediaBusy, setMediaBusy] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [myAds, setMyAds] = useState<Listing[]>([]);
  const [loadingMine, setLoadingMine] = useState(false);

  const loadMine = async () => {
    if (!firebaseUser) return;
    setLoadingMine(true);
    try {
      const res = await jobSeekerApi.getMine();
      setMyAds(Array.isArray(res.data?.listings) ? res.data.listings : []);
    } catch {
      // Ignore quietly on initial open
    } finally {
      setLoadingMine(false);
    }
  };

  useEffect(() => {
    if (open) {
      setCategoryId(defaultJobCatId);
      setPhoneNumber((prev) => prev || dbUser?.phoneNumber || '');
      if (detectedLocation.subCity) {
        setSubCity(detectedLocation.subCity);
      }
      if (detectedLocation.lat && detectedLocation.lng) {
        setLatitude(detectedLocation.lat);
        setLongitude(detectedLocation.lng);
      }
      if (detectedLocation.label && !landmark) {
        setLandmark(detectedLocation.label);
      }
      if (firebaseUser) {
        loadMine();
      }
    }
  }, [open, defaultJobCatId, dbUser?.phoneNumber, detectedLocation, firebaseUser]);

  if (!open) return null;

  const handleUseCurrentGps = () => {
    if (!navigator.geolocation) {
      onNotify('Browser geolocation is unavailable here.');
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const lat = Number(pos.coords.latitude.toFixed(6));
        const lng = Number(pos.coords.longitude.toFixed(6));
        setLatitude(lat);
        setLongitude(lng);
        onNotify(`Updated your ad coordinates (${lat.toFixed(4)}, ${lng.toFixed(4)}).`);
      },
      () => {
        onNotify('Could not access GPS; using selected Addis sub-city coordinates.');
      },
      { enableHighAccuracy: true, timeout: 8000 }
    );
  };

  const handleUploadPhotos = async (files: FileList | null) => {
    if (!files || files.length === 0) return;
    setErrorMsg(null);
    const remaining = MAX_PRODUCT_IMAGES - images.length;
    if (remaining <= 0) {
      setErrorMsg(`Maximum ${MAX_PRODUCT_IMAGES} photos allowed.`);
      return;
    }
    setMediaBusy(true);
    try {
      const chosen = Array.from(files).slice(0, remaining);
      const compressed = await Promise.all(chosen.map((f) => compressImageFile(f)));
      setImages((prev) => {
        const next = [...prev];
        compressed.forEach((src) => {
          if (next.length < MAX_PRODUCT_IMAGES && !next.includes(src)) {
            next.push(src);
          }
        });
        return next;
      });
    } catch (err: unknown) {
      setErrorMsg(err instanceof Error ? err.message : 'Failed to process photo.');
    } finally {
      setMediaBusy(false);
    }
  };

  const handleUploadCv = async (files: FileList | null) => {
    if (!files || files.length === 0) return;
    setErrorMsg(null);
    setMediaBusy(true);
    try {
      const file = files[0];
      const dataUrl = await readFileAsDataUrl(file, 3 * 1024 * 1024);
      setCvUrl(dataUrl);
      setCvFileName(file.name);
    } catch (err: unknown) {
      setErrorMsg(err instanceof Error ? err.message : 'Failed to read CV file.');
    } finally {
      setMediaBusy(false);
    }
  };

  const handlePublish = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);
    if (!firebaseUser) {
      onClose();
      openAuthModal('signin');
      return;
    }
    if (introVideoUrl.trim() && !extractYouTubeVideoId(introVideoUrl.trim())) {
      setErrorMsg('Please enter a valid YouTube link (youtube.com or youtu.be).');
      return;
    }
    if (!negotiable && (!expectedPay || Number(expectedPay) <= 0)) {
      setErrorMsg('Enter an expected pay in ETB or check "Negotiable / Quote on contact".');
      return;
    }

    setSubmitting(true);
    const resolvedPricingModel =
      pricingUnit === 'ONE_TIME_CONTRACT'
        ? 'ONE_TIME_CONTRACT'
        : pricingUnit === 'FULL_TIME'
          ? 'FULL_TIME'
          : pricingUnit === 'PER_HOUR'
            ? 'PER_HOUR'
            : pricingUnit === 'PER_DAY'
              ? 'PER_DAY'
              : pricingUnit === 'PER_MONTH'
                ? 'PER_MONTH'
                : negotiable
                  ? 'QUOTE'
                  : 'FIXED';
    const resolvedUnitLabel =
      pricingUnit === 'ONE_TIME_CONTRACT'
        ? 'contract'
        : pricingUnit === 'FULL_TIME'
          ? 'month (full-time)'
          : pricingUnit === 'PER_HOUR'
            ? 'hour'
            : pricingUnit === 'PER_DAY'
              ? 'day'
              : pricingUnit === 'PER_MONTH'
                ? 'month'
                : 'job';
    try {
      await jobSeekerApi.advertise({
        categoryId,
        title: title.trim(),
        description: description.trim(),
        skills: skills.trim() || undefined,
        experienceSummary: experienceSummary.trim() || undefined,
        availabilityNote: availabilityNote.trim() || undefined,
        pricingModel: resolvedPricingModel,
        pricingUnit: resolvedUnitLabel,
        expectedPay: negotiable ? 0 : Number(expectedPay),
        negotiable,
        phoneNumber: phoneNumber.trim() || undefined,
        subCity,
        landmark: landmark.trim() || subCity,
        latitude,
        longitude,
        imageUrls: images,
        cvUrl: cvUrl || undefined,
        cvFileName: cvFileName || undefined,
        introVideoUrl: introVideoUrl.trim() || undefined,
      });

      onNotify('Your job seeker advertisement is now live and searchable by description!');
      setTitle('');
      setDescription('');
      setSkills('');
      setExperienceSummary('');
      setAvailabilityNote('');
      setImages([]);
      setCvUrl('');
      setCvFileName('');
      setIntroVideoUrl('');
      await loadMine();
      onSuccess();
    } catch (err: unknown) {
      const serverErr =
        (err as { response?: { data?: { error?: string } } })?.response?.data?.error ||
        (err instanceof Error ? err.message : 'Could not publish advertisement.');
      setErrorMsg(serverErr);
    } finally {
      setSubmitting(false);
    }
  };

  const handleToggleAvailability = async (ad: Listing) => {
    const next = ad.availabilityStatus === 'AVAILABLE' ? 'UNAVAILABLE' : 'AVAILABLE';
    try {
      await businessApi.updateAvailability(ad.id, { availabilityStatus: next });
      onNotify(`"${ad.title}" marked ${next}.`);
      await loadMine();
      onSuccess();
    } catch {
      onNotify('Failed to update availability.');
    }
  };

  const handleRemoveAd = async (ad: Listing) => {
    try {
      await jobSeekerApi.remove(ad.id);
      onNotify(`Removed "${ad.title}".`);
      await loadMine();
      onSuccess();
    } catch {
      onNotify('Could not remove advertisement.');
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center overflow-x-hidden bg-[#172B3A]/50 p-0 backdrop-blur-[2px] sm:items-center sm:p-4"
      onClick={onClose}
    >
      <div
        className="max-h-[94dvh] w-full max-w-3xl overflow-x-hidden overflow-y-auto rounded-t-2xl border border-[#172B3A]/10 bg-white shadow-2xl sm:max-h-[92vh] sm:rounded-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="sticky top-0 z-10 flex items-center justify-between gap-2 border-b border-[#172B3A]/10 bg-white px-4 py-3 sm:px-6 sm:py-4">
          <div className="flex min-w-0 flex-1 items-center gap-2.5">
            <Briefcase className="h-5 w-5 shrink-0 text-[#176B52]" />
            <div className="min-w-0">
              <h2 className="truncate font-display text-base font-bold text-[#172B3A] sm:text-lg">
                Advertise Yourself as an Individual Job Seeker
              </h2>
              <p className="text-xs text-[#172B3A]/65">
                No business license required — employers searching words in your description find
                you nearest-first.
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close advertise yourself modal"
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-[#172B3A]/10 text-[#172B3A]/70 hover:bg-[#F4F6F5]"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="space-y-6 p-4 sm:p-6">
          <form onSubmit={handlePublish} className="space-y-4">
            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <label className="block text-xs font-medium text-[#172B3A]/75">
                  Headline / Role You Seek
                </label>
                <input
                  required
                  type="text"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder="e.g., Certified Electrician & Solar Technician"
                  className="mt-1 h-10 w-full rounded-lg border border-[#172B3A]/15 px-3 text-xs focus:border-[#176B52] focus:outline-none"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-[#172B3A]/75">
                  Work Category
                </label>
                <select
                  value={categoryId}
                  onChange={(e) => setCategoryId(Number(e.target.value))}
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

            <div>
              <label className="block text-xs font-medium text-[#172B3A]/75">
                Detailed Searchable Description (Skills, Experience, Tools, Languages)
              </label>
              <textarea
                required
                rows={3}
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Describe what work you do, years of experience, tools you have, neighborhoods you cover, and languages spoken. Employers find you by searching words here!"
                className="mt-1 w-full rounded-lg border border-[#172B3A]/15 px-3 py-2 text-xs focus:border-[#176B52] focus:outline-none"
              />
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <label className="block text-xs font-medium text-[#172B3A]/75">
                  Key Skills (searchable keywords)
                </label>
                <input
                  type="text"
                  value={skills}
                  onChange={(e) => setSkills(e.target.value)}
                  placeholder="e.g., Wiring, Plumbing, Tile Work, Welding, Driving"
                  className="mt-1 h-10 w-full rounded-lg border border-[#172B3A]/15 px-3 text-xs"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-[#172B3A]/75">
                  Experience & Availability
                </label>
                <input
                  type="text"
                  value={experienceSummary}
                  onChange={(e) => setExperienceSummary(e.target.value)}
                  placeholder="e.g., 4 yrs experience · Full-time or daily shift"
                  className="mt-1 h-10 w-full rounded-lg border border-[#172B3A]/15 px-3 text-xs"
                />
              </div>
            </div>

            <div className="rounded-xl border border-[#172B3A]/10 bg-[#F4F6F5]/60 p-4 space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="text-xs font-semibold text-[#172B3A]">
                  Expected Rate / Pay (ETB)
                </span>
                <label className="inline-flex cursor-pointer items-center gap-2 text-xs font-medium text-[#176B52]">
                  <input
                    type="checkbox"
                    checked={negotiable}
                    onChange={(e) => setNegotiable(e.target.checked)}
                    className="h-4 w-4 accent-[#176B52]"
                  />
                  Negotiable / Quote on contact
                </label>
              </div>

              <div className="grid gap-3 sm:grid-cols-2">
                <div>
                  <label className="block text-[11px] text-[#172B3A]/70">
                    Service Delivering / Engagement Type
                  </label>
                  <select
                    value={pricingUnit}
                    onChange={(e) => setPricingUnit(e.target.value)}
                    className="mt-1 h-9 w-full rounded-lg border border-[#172B3A]/15 bg-white px-3 text-xs font-medium"
                  >
                    <option value="ONE_TIME_CONTRACT">One-Time Contract</option>
                    <option value="FULL_TIME">Full-Time</option>
                    <option value="PER_HOUR">Per Hour Payment</option>
                    <option value="PER_DAY">Per Day</option>
                    <option value="PER_MONTH">Per Month</option>
                  </select>
                </div>
                {!negotiable && (
                  <div>
                    <label className="block text-[11px] text-[#172B3A]/70">Amount (ETB)</label>
                    <input
                      type="number"
                      min={1}
                      value={expectedPay}
                      onChange={(e) => setExpectedPay(e.target.value)}
                      className="mt-1 h-9 w-full rounded-lg border border-[#172B3A]/15 bg-white px-3 font-mono text-xs"
                    />
                  </div>
                )}
              </div>
            </div>

            <div className="grid gap-3 sm:grid-cols-3">
              <div>
                <label className="block text-xs font-medium text-[#172B3A]/75">Phone Number</label>
                <input
                  type="text"
                  value={phoneNumber}
                  onChange={(e) => setPhoneNumber(e.target.value)}
                  placeholder="+251 9XX XXX XXX"
                  className="mt-1 h-10 w-full rounded-lg border border-[#172B3A]/15 px-3 font-mono text-xs"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-[#172B3A]/75">Sub-City</label>
                <select
                  value={subCity}
                  onChange={(e) => {
                    const chosen = ADDIS_SUB_CITIES.find((c) => c.name === e.target.value);
                    setSubCity(e.target.value);
                    if (chosen) {
                      setLatitude(chosen.lat);
                      setLongitude(chosen.lng);
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
                <label className="block text-xs font-medium text-[#172B3A]/75">
                  Neighborhood / Landmark
                </label>
                <div className="mt-1 flex gap-1.5">
                  <input
                    type="text"
                    value={landmark}
                    onChange={(e) => setLandmark(e.target.value)}
                    placeholder="Area or street"
                    className="h-10 min-w-0 flex-1 rounded-lg border border-[#172B3A]/15 px-3 text-xs"
                  />
                  <button
                    type="button"
                    onClick={handleUseCurrentGps}
                    title="Use current GPS"
                    className="flex h-10 shrink-0 items-center justify-center rounded-lg border border-[#176B52]/35 bg-emerald-50 px-2.5 text-[#176B52] hover:bg-emerald-100"
                  >
                    <Navigation className="h-4 w-4" />
                  </button>
                </div>
              </div>
            </div>

            <p className="flex items-center gap-1.5 font-mono text-[11px] text-[#172B3A]/60">
              <MapPin className="h-3.5 w-3.5 text-[#176B52]" />
              Location Coordinates: {latitude.toFixed(5)}, {longitude.toFixed(5)}
            </p>

            {/* Optional Media: Photos (up to 5), CV, YouTube Intro */}
            <div className="grid gap-3 sm:grid-cols-3 rounded-xl border border-[#172B3A]/10 bg-[#F4F6F5]/45 p-4">
              <div>
                <label className="flex h-10 cursor-pointer items-center justify-center gap-1.5 rounded-lg border border-dashed border-[#176B52]/45 bg-white px-3 text-xs font-semibold text-[#176B52] hover:bg-emerald-50/40">
                  <ImagePlus className="h-3.5 w-3.5" />
                  <span>Photos ({images.length}/5)</span>
                  <input
                    type="file"
                    accept="image/*"
                    multiple
                    disabled={mediaBusy || images.length >= MAX_PRODUCT_IMAGES}
                    onChange={(e) => handleUploadPhotos(e.target.files)}
                    className="hidden"
                  />
                </label>
              </div>
              <div>
                <label className="flex h-10 cursor-pointer items-center justify-center gap-1.5 rounded-lg border border-dashed border-[#176B52]/45 bg-white px-3 text-xs font-semibold text-[#176B52] hover:bg-emerald-50/40">
                  <Upload className="h-3.5 w-3.5" />
                  <span className="truncate">{cvFileName || 'Upload CV (Optional)'}</span>
                  <input
                    type="file"
                    accept=".pdf,.doc,.docx,image/*"
                    disabled={mediaBusy}
                    onChange={(e) => handleUploadCv(e.target.files)}
                    className="hidden"
                  />
                </label>
              </div>
              <div className="relative">
                <Video className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-[#176B52]" />
                <input
                  type="url"
                  value={introVideoUrl}
                  onChange={(e) => setIntroVideoUrl(e.target.value)}
                  placeholder="YouTube intro link (optional)"
                  className="h-10 w-full rounded-lg border border-[#172B3A]/15 bg-white pl-8 pr-3 text-xs"
                />
              </div>
            </div>

            {images.length > 0 && (
              <div className="grid grid-cols-3 gap-2 sm:grid-cols-5">
                {images.map((src, idx) => (
                  <div key={idx} className="relative h-16 overflow-hidden rounded-lg border border-[#172B3A]/15">
                    <img src={src} alt={`Work sample ${idx + 1}`} className="h-full w-full object-cover" />
                    <button
                      type="button"
                      onClick={() => setImages((prev) => prev.filter((_, i) => i !== idx))}
                      className="absolute right-1 top-1 flex h-5 w-5 items-center justify-center rounded-full bg-[#172B3A]/80 text-white"
                    >
                      <X className="h-3 w-3" />
                    </button>
                  </div>
                ))}
              </div>
            )}

            {errorMsg && (
              <div className="rounded-lg border border-red-200 bg-red-50 px-3.5 py-2.5 text-xs text-red-700">
                {errorMsg}
              </div>
            )}

            <button
              type="submit"
              disabled={submitting || mediaBusy}
              className="flex min-h-[44px] w-full items-center justify-center gap-2 rounded-xl bg-[#176B52] px-5 py-2.5 text-sm font-semibold text-white hover:bg-[#125641] disabled:opacity-50"
            >
              <CheckCircle2 className="h-4 w-4" />
              {submitting ? 'Publishing Advertisement...' : 'Publish Job Seeker Advertisement'}
            </button>
          </form>

          {/* User's Existing Job Seeker Advertisements */}
          {firebaseUser && (
            <div className="border-t border-[#172B3A]/10 pt-5 space-y-3">
              <div className="flex items-center justify-between">
                <h3 className="font-display text-sm font-bold text-[#172B3A]">
                  My Job Seeker Advertisements ({myAds.length})
                </h3>
                {loadingMine && (
                  <span className="text-[11px] text-[#172B3A]/55">Refreshing...</span>
                )}
              </div>
              {myAds.length === 0 ? (
                <p className="rounded-xl border border-[#172B3A]/10 bg-[#F4F6F5]/60 p-4 text-xs text-[#172B3A]/65">
                  You have not published any personal job seeker advertisements yet.
                </p>
              ) : (
                <div className="space-y-2.5">
                  {myAds.map((ad) => (
                    <div
                      key={ad.id}
                      className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-[#172B3A]/10 bg-[#F4F6F5]/50 p-3.5 text-xs"
                    >
                      <div className="min-w-0 flex-1">
                        <p className="font-semibold text-[#172B3A]">{ad.title}</p>
                        <p className="mt-0.5 line-clamp-1 text-[#172B3A]/70">{ad.description}</p>
                        <p className="mt-1 font-mono text-[11px] text-[#176B52]">
                          {ad.isUnpaid && Number(ad.basePrice) === 0
                            ? 'Negotiable'
                            : `${formatEtb(ad.basePrice)} / ${ad.pricingUnit}`}
                          {ad.metadata?.cvFileName && (
                            <span className="ml-2 inline-flex items-center gap-1 text-[#172B3A]/70">
                              <FileText className="h-3 w-3" /> {ad.metadata.cvFileName}
                            </span>
                          )}
                        </p>
                      </div>
                      <div className="flex flex-wrap items-center gap-2 shrink-0">
                        {onEditAd && (
                          <button
                            type="button"
                            onClick={() => {
                              onClose();
                              onEditAd(ad);
                            }}
                            className="inline-flex min-h-[34px] items-center gap-1 rounded-md border border-[#176B52]/30 bg-emerald-50 px-2.5 py-1 font-semibold text-[#176B52] hover:bg-emerald-100"
                          >
                            <Pencil className="h-3 w-3" />
                            Edit
                          </button>
                        )}
                        <button
                          type="button"
                          onClick={() => handleToggleAvailability(ad)}
                          className={`min-h-[34px] rounded-md border px-2.5 py-1 font-semibold ${
                            ad.availabilityStatus === 'AVAILABLE'
                              ? 'border-[#176B52]/30 bg-white text-[#176B52]'
                              : 'border-[#172B3A]/20 bg-white text-[#172B3A]/60'
                          }`}
                        >
                          {ad.availabilityStatus}
                        </button>
                        <button
                          type="button"
                          onClick={() => handleRemoveAd(ad)}
                          aria-label={`Remove ${ad.title}`}
                          className="flex h-8 w-8 items-center justify-center rounded-md border border-red-200 bg-white text-red-700 hover:bg-red-50"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
