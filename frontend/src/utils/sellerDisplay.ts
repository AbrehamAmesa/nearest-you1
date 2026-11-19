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
 * Service givers (including individual job seekers advertising themselves) display their
 * name publicly on discovery cards, recommendations, and listing previews.
 * Other sellers (retail products, food, rentals, employer job ads) hide their seller name
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
  business?: Pick<Business, 'businessName' | 'profileType'> | null
): string {
  if (isServiceGiverOrJobSeeker(listing, business) && business?.businessName) {
    return business.businessName;
  }
  const type = (listing?.listingType || '').toUpperCase();
  if (type === 'JOB') return 'Verified Employer';
  if (type === 'RENTAL') return 'Verified Property Host';
  return 'Verified Seller';
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
