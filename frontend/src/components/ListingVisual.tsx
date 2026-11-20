import React, { useEffect, useMemo, useState } from 'react';
import {
  Briefcase,
  Building2,
  Calendar,
  ChevronLeft,
  ChevronRight,
  FileText,
  GraduationCap,
  HeartPulse,
  Play,
  ShoppingBag,
  Utensils,
  Wrench,
} from 'lucide-react';
import { getYouTubeThumbnailUrl, MAX_PRODUCT_IMAGES } from '../utils/media.ts';

interface ListingVisualProps {
  imageUrl?: string | null;
  imageUrls?: string[] | null;
  companyLogoUrl?: string | null;
  introVideoUrl?: string | null;
  cvUrl?: string | null;
  title: string;
  listingType: string;
  className?: string;
  autoRotateMs?: number;
  showSlideControls?: boolean;
  activeSlideIndex?: number;
  onSlideChange?: (index: number) => void;
}

const TYPE_META: Record<
  string,
  { bg: string; icon: React.ComponentType<{ className?: string }>; label: string }
> = {
  PRODUCT: { bg: 'from-[#E8EFEA] to-[#D4E2DA]', icon: ShoppingBag, label: 'Retail Product' },
  FOOD: { bg: 'from-[#F5EDE2] to-[#EADACA]', icon: Utensils, label: 'Restaurant Menu' },
  SERVICE: { bg: 'from-[#E4ECEF] to-[#CEDCE2]', icon: Wrench, label: 'Workforce / Service' },
  RENTAL: { bg: 'from-[#EAEBE6] to-[#D7DBD0]', icon: Building2, label: 'Verified Rental' },
  JOB: { bg: 'from-[#E7EAEF] to-[#D3DAE4]', icon: Briefcase, label: 'Job Advertisement' },
  JOB_SEEKER: { bg: 'from-[#E6F1ED] to-[#CEE3DC]', icon: Briefcase, label: 'Job Seeker Profile' },
  HEALTHCARE: { bg: 'from-[#E5F0EC] to-[#CDE2DA]', icon: HeartPulse, label: 'Licensed Healthcare' },
  EDUCATION: { bg: 'from-[#ECEAE4] to-[#DAD6C8]', icon: GraduationCap, label: 'Education & Training' },
  EVENT: { bg: 'from-[#EFEAE6] to-[#DFD5CC]', icon: Calendar, label: 'Events & Production' },
};

export const ListingVisual: React.FC<ListingVisualProps> = ({
  imageUrl,
  imageUrls,
  companyLogoUrl,
  introVideoUrl,
  cvUrl,
  title,
  listingType,
  className = 'h-48 w-full',
  autoRotateMs = 5000,
  showSlideControls = false,
  activeSlideIndex,
  onSlideChange,
}) => {
  const [failedSrcs, setFailedSrcs] = useState<Record<string, boolean>>({});
  const [internalIdx, setInternalIdx] = useState(0);

  const meta = TYPE_META[listingType] || TYPE_META.PRODUCT;
  const Icon = meta.icon;
  const isJob = listingType === 'JOB';

  const slides = useMemo(() => {
    const out: string[] = [];
    const pushIfValid = (src?: string | null) => {
      if (!src || !src.trim()) return;
      const clean = src.trim();
      if (!failedSrcs[clean] && !out.includes(clean)) {
        out.push(clean);
      }
    };
    if (Array.isArray(imageUrls)) {
      imageUrls.forEach(pushIfValid);
    }
    pushIfValid(imageUrl);
    if (out.length === 0 && companyLogoUrl) {
      pushIfValid(companyLogoUrl);
    }
    return out.slice(0, MAX_PRODUCT_IMAGES);
  }, [imageUrls, imageUrl, companyLogoUrl, failedSrcs]);

  const currentIdx =
    activeSlideIndex !== undefined && slides.length > 0
      ? activeSlideIndex % slides.length
      : slides.length > 0
        ? internalIdx % slides.length
        : 0;

  useEffect(() => {
    if (slides.length <= 1) return;
    const timer = setInterval(() => {
      const next = (currentIdx + 1) % slides.length;
      setInternalIdx(next);
      onSlideChange?.(next);
    }, autoRotateMs);
    return () => clearInterval(timer);
  }, [slides.length, autoRotateMs, currentIdx, onSlideChange]);

  const handleMarkFailed = (src: string) => {
    setFailedSrcs((prev) => ({ ...prev, [src]: true }));
  };

  const handleStep = (e: React.MouseEvent, delta: number) => {
    e.stopPropagation();
    if (slides.length <= 1) return;
    const next = (currentIdx + delta + slides.length) % slides.length;
    setInternalIdx(next);
    onSlideChange?.(next);
  };

  // Job Advertisement with Company Logo (logo-first clean containment)
  if (isJob && slides.length === 1 && (companyLogoUrl === slides[0] || !imageUrls?.length)) {
    return (
      <div
        className={`relative flex items-center justify-center overflow-hidden border-b border-[#172B3A]/10 bg-[#F4F6F5] p-5 ${className}`}
      >
        <img
          src={slides[0]}
          alt={`${title} company logo`}
          referrerPolicy="no-referrer"
          onError={() => handleMarkFailed(slides[0])}
          className="max-h-full max-w-[78%] object-contain"
        />
        <span className="absolute bottom-2 right-2 rounded bg-white/90 px-2 py-0.5 text-[10px] font-semibold text-[#172B3A]/70 shadow-sm">
          Company Logo
        </span>
      </div>
    );
  }

  // Multi-image or single product/service photo (auto-rotates when > 1 image)
  if (slides.length > 0) {
    return (
      <div className={`relative overflow-hidden bg-[#ECEFED] ${className}`}>
        {slides.map((src, idx) => (
          <img
            key={`${src.slice(0, 48)}-${idx}`}
            src={src}
            alt={`${title} (${idx + 1}/${slides.length})`}
            referrerPolicy="no-referrer"
            onError={() => handleMarkFailed(src)}
            className={`absolute inset-0 h-full w-full object-cover object-[50%_20%] transition-all duration-500 ${
              idx === currentIdx
                ? 'opacity-100 scale-100 group-hover:scale-[1.02]'
                : 'opacity-0 pointer-events-none scale-[1.01]'
            }`}
          />
        ))}

        {slides.length > 1 && (
          <>
            <span className="absolute right-2 top-2 rounded bg-[#172B3A]/75 px-1.5 py-0.5 font-mono text-[10px] font-semibold text-white">
              {currentIdx + 1}/{slides.length}
            </span>

            <div className="absolute inset-x-0 bottom-2 flex items-center justify-center gap-1.5">
              {slides.map((_, idx) => (
                <button
                  key={idx}
                  type="button"
                  aria-label={`View image ${idx + 1}`}
                  onClick={(e) => {
                    e.stopPropagation();
                    setInternalIdx(idx);
                    onSlideChange?.(idx);
                  }}
                  className={`h-1.5 rounded-full transition-all ${
                    idx === currentIdx ? 'w-4 bg-white' : 'w-1.5 bg-white/55 hover:bg-white/80'
                  }`}
                />
              ))}
            </div>

            {showSlideControls && (
              <>
                <button
                  type="button"
                  aria-label="Previous image"
                  onClick={(e) => handleStep(e, -1)}
                  className="absolute left-2 top-1/2 -translate-y-1/2 flex h-8 w-8 items-center justify-center rounded-full bg-[#172B3A]/65 text-white hover:bg-[#172B3A]"
                >
                  <ChevronLeft className="h-4 w-4" />
                </button>
                <button
                  type="button"
                  aria-label="Next image"
                  onClick={(e) => handleStep(e, 1)}
                  className="absolute right-2 top-1/2 -translate-y-1/2 flex h-8 w-8 items-center justify-center rounded-full bg-[#172B3A]/65 text-white hover:bg-[#172B3A]"
                >
                  <ChevronRight className="h-4 w-4" />
                </button>
              </>
            )}
          </>
        )}
      </div>
    );
  }

  // Workforce / Service without photos, but with YouTube Intro Video thumbnail
  const ytThumb = getYouTubeThumbnailUrl(introVideoUrl);
  if (ytThumb && !failedSrcs[ytThumb]) {
    return (
      <div className={`relative overflow-hidden bg-[#172B3A] ${className}`}>
        <img
          src={ytThumb}
          alt={`${title} intro video`}
          referrerPolicy="no-referrer"
          onError={() => handleMarkFailed(ytThumb)}
          className="h-full w-full object-cover opacity-90 transition-transform duration-300 group-hover:scale-[1.02]"
        />
        <div className="absolute inset-0 flex items-center justify-center bg-[#172B3A]/25">
          <span className="flex h-11 w-11 items-center justify-center rounded-full bg-[#176B52]/95 text-white shadow-lg">
            <Play className="ml-0.5 h-5 w-5 fill-white" />
          </span>
        </div>
        <div className="absolute bottom-2 left-2 flex items-center gap-2 text-[10px] font-semibold text-white">
          <span className="rounded bg-[#172B3A]/80 px-2 py-0.5">YouTube Intro</span>
          {cvUrl && <span className="rounded bg-[#176B52]/90 px-2 py-0.5">CV Attached</span>}
        </div>
      </div>
    );
  }

  // Clean category fallback (and Workforce CV / Video summary when provided)
  return (
    <div
      className={`relative flex flex-col items-center justify-center bg-gradient-to-br ${meta.bg} px-4 text-center ${className}`}
    >
      <Icon className="h-8 w-8 text-[#176B52]/80" />
      <span className="mt-2 text-xs font-medium tracking-wide text-[#172B3A]/75">
        {meta.label}
      </span>
      {(cvUrl || introVideoUrl) && (
        <div className="mt-2 flex flex-wrap items-center justify-center gap-2 text-[11px] font-semibold text-[#176B52]">
          {cvUrl && (
            <span className="inline-flex items-center gap-1 rounded bg-white/80 px-2 py-0.5">
              <FileText className="h-3 w-3" />
              CV Included
            </span>
          )}
          {introVideoUrl && (
            <span className="inline-flex items-center gap-1 rounded bg-white/80 px-2 py-0.5">
              <Play className="h-3 w-3" />
              Intro Video
            </span>
          )}
        </div>
      )}
    </div>
  );
};
