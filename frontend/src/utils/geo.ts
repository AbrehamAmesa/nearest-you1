export interface AddisSubCity {
  name: string;
  nameAm: string;
  lat: number;
  lng: number;
}

export const ADDIS_SUB_CITIES: AddisSubCity[] = [
  { name: 'Bole', nameAm: 'ቦሌ', lat: 8.9974, lng: 38.7868 },
  { name: 'Kirkos / Kazanchis', nameAm: 'ቂርቆስ / ካዛንቺስ', lat: 9.0155, lng: 38.7681 },
  { name: 'Yeka / Megenagna', nameAm: 'የካ / መገናኛ', lat: 9.0205, lng: 38.7995 },
  { name: 'Arada / Piassa', nameAm: 'አራዳ / ፒያሳ', lat: 9.0331, lng: 38.7501 },
  { name: 'Nifas Silk / Sarbet', nameAm: 'ንፋስ ስልክ / ሳርቤት', lat: 8.9989, lng: 38.7426 },
  { name: 'CMC / Lemi Kura', nameAm: 'ሲኤምሲ / ለሚ ኩራ', lat: 9.0285, lng: 38.8312 },
  { name: 'Akaky Kaliti', nameAm: 'አቃቂ ቃሊቲ', lat: 8.9401, lng: 38.7615 },
];

export function calculateDistanceKm(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number
): number {
  const R = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return Math.round(R * c * 10) / 10;
}

export function formatEtb(amount: number | string | null | undefined): string {
  const numeric = Number(amount ?? 0);
  if (Number.isNaN(numeric)) return '0 ETB';
  return `${numeric.toLocaleString('en-US', {
    minimumFractionDigits: numeric % 1 === 0 ? 0 : 2,
    maximumFractionDigits: 2,
  })} ETB`;
}
