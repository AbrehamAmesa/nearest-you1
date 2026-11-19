import type { Listing } from '../types/nearestyou.ts';

export const MAX_PRODUCT_IMAGES = 5;

export function extractYouTubeVideoId(rawUrl?: string | null): string | null {
  if (!rawUrl || !rawUrl.trim()) return null;
  const trimmed = rawUrl.trim();
  const directMatch = trimmed.match(/^[A-Za-z0-9_-]{11}$/);
  if (directMatch) return directMatch[0];

  try {
    const parsed = new URL(trimmed.startsWith('http') ? trimmed : `https://${trimmed}`);
    const host = parsed.hostname.replace(/^www\./, '').toLowerCase();
    if (host === 'youtu.be') {
      const id = parsed.pathname.split('/').filter(Boolean)[0];
      return id && /^[A-Za-z0-9_-]{11}$/.test(id) ? id : null;
    }
    if (host === 'youtube.com' || host === 'm.youtube.com' || host === 'youtube-nocookie.com') {
      const v = parsed.searchParams.get('v');
      if (v && /^[A-Za-z0-9_-]{11}$/.test(v)) return v;
      const parts = parsed.pathname.split('/').filter(Boolean);
      if ((parts[0] === 'embed' || parts[0] === 'shorts' || parts[0] === 'live') && parts[1]) {
        return /^[A-Za-z0-9_-]{11}$/.test(parts[1]) ? parts[1] : null;
      }
    }
  } catch {
    return null;
  }
  return null;
}

export function getYouTubeEmbedUrl(rawUrl?: string | null): string | null {
  const id = extractYouTubeVideoId(rawUrl);
  return id ? `https://www.youtube.com/embed/${id}` : null;
}

export function getYouTubeThumbnailUrl(rawUrl?: string | null): string | null {
  const id = extractYouTubeVideoId(rawUrl);
  return id ? `https://img.youtube.com/vi/${id}/hqdefault.jpg` : null;
}

export function getListingImages(listing: Pick<Listing, 'imageUrl' | 'imageUrls' | 'listingType' | 'metadata'>): string[] {
  const merged: string[] = [];
  const addUnique = (val?: string | null) => {
    if (!val || !val.trim()) return;
    const clean = val.trim();
    if (!merged.includes(clean)) {
      merged.push(clean);
    }
  };

  if (Array.isArray(listing.imageUrls)) {
    listing.imageUrls.forEach(addUnique);
  }
  addUnique(listing.imageUrl);

  if (listing.listingType === 'JOB' && listing.metadata?.companyLogoUrl) {
    addUnique(listing.metadata.companyLogoUrl);
  }

  return merged.slice(0, MAX_PRODUCT_IMAGES);
}

export function compressImageFile(file: File, maxDimension = 900, quality = 0.82): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error('Failed to read image file.'));
    reader.onload = () => {
      const src = typeof reader.result === 'string' ? reader.result : '';
      if (!src) {
        reject(new Error('Empty image data.'));
        return;
      }
      const img = new Image();
      img.onerror = () => reject(new Error('Unsupported or corrupted image file.'));
      img.onload = () => {
        const longest = Math.max(img.width, img.height, 1);
        const scale = longest > maxDimension ? maxDimension / longest : 1;
        const targetW = Math.max(1, Math.round(img.width * scale));
        const targetH = Math.max(1, Math.round(img.height * scale));
        const canvas = document.createElement('canvas');
        canvas.width = targetW;
        canvas.height = targetH;
        const ctx = canvas.getContext('2d');
        if (!ctx) {
          resolve(src);
          return;
        }
        ctx.fillStyle = '#FFFFFF';
        ctx.fillRect(0, 0, targetW, targetH);
        ctx.drawImage(img, 0, 0, targetW, targetH);
        const isPng = file.type === 'image/png';
        resolve(canvas.toDataURL(isPng ? 'image/png' : 'image/jpeg', isPng ? undefined : quality));
      };
      img.src = src;
    };
    reader.readAsDataURL(file);
  });
}

export function readFileAsDataUrl(file: File, maxBytes = 3 * 1024 * 1024): Promise<string> {
  return new Promise((resolve, reject) => {
    if (file.size > maxBytes) {
      reject(new Error(`File "${file.name}" exceeds the ${Math.round(maxBytes / (1024 * 1024))} MB limit.`));
      return;
    }
    const reader = new FileReader();
    reader.onerror = () => reject(new Error(`Could not read "${file.name}".`));
    reader.onload = () => {
      if (typeof reader.result === 'string') {
        resolve(reader.result);
      } else {
        reject(new Error('Unexpected file reader result.'));
      }
    };
    reader.readAsDataURL(file);
  });
}
