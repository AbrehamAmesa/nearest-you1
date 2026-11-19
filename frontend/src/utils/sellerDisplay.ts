import type { Business, Listing } from '../types/nearestyou.ts';

const SERVICE_GIVER_TYPES = new Set([
  'JOB_SEEKER',
  'SERVICE',
  'HEALTHCARE',
  'EDUCATION',
  'TRANSPORT',
  'EVENT',
]);

/**
 * Extracts the advertiser's personal name from their User Profile (`ownerFullName`),
 * falling back to `businessName` only when a separate user profile name is unavailable.
 */
export function getAdvertiserProfileName(
  business?: Pick<Business, 'ownerFullName' | 'businessName'> | null
): string {
  const profileName = business?.ownerFullName?.trim();
  if (profileName && profileName.toLowerCase() !== 'nearest you user') {
    return profileName;
  }
  const bizName = business?.businessName?.trim();
  if (bizName) {
    return bizName;
  }
  return 'Service Giver';
}

/**
 * Service givers (including individual job seekers advertising themselves) display their
 * user profile name publicly on discovery cards, recommendations, and listing previews.
 * Other sellers (retail products, food, rentals, employer job ads) hide their name
 * publicly and display it at message / order communication time only.
 */
export function isServiceGiverOrJobSeeker(
  listing?: Pick<Listing, 'listingType'> | null,
  business?: Pick<Business, 'profileType'> | null
): boolean {
  if (business?.profileType === 'INDIVIDUAL_JOB_SEEKER') {
    return true;
  }
  const type = (listing?.listingType || '').toUpperCase();
  return SERVICE_GIVER_TYPES.has(type);
}

export function getPublicProviderLabel(
  listing?: Pick<Listing, 'listingType'> | null,
  business?: Pick<Business, 'ownerFullName' | 'businessName' | 'profileType'> | null
): string {
  if (isServiceGiverOrJobSeeker(listing, business)) {
    return getAdvertiserProfileName(business);
  }
  const type = (listing?.listingType || '').toUpperCase();
  if (type === 'JOB') return 'Verified Employer';
  if (type === 'RENTAL') return 'Verified Property Host';
  return 'Verified Seller';
}

export function getMessageTimeProviderLabel(
  listing?: Pick<Listing, 'listingType'> | null,
  business?: Pick<Business, 'ownerFullName' | 'businessName' | 'profileType'> | null
): string {
  const profileName = getAdvertiserProfileName(business);
  const bizName = business?.businessName?.trim();
  if (
    bizName &&
    bizName !== profileName &&
    business?.profileType !== 'INDIVIDUAL_JOB_SEEKER' &&
    listing?.listingType !== 'JOB_SEEKER'
  ) {
    return `${profileName} (${bizName})`;
  }
  return profileName;
}

export function getPublicProviderRoleLabel(
  listing?: Pick<Listing, 'listingType'> | null,
  business?: Pick<Business, 'profileType'> | null
): string | null {
  if (
    listing?.listingType === 'JOB_SEEKER' ||
    business?.profileType === 'INDIVIDUAL_JOB_SEEKER'
  ) {
    return 'Job Seeker';
  }
  if (isServiceGiverOrJobSeeker(listing, business)) {
    return 'Service Giver';
  }
  return null;
}
