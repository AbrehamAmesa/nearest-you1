import type { Listing, PlatformPolicy } from '../types/nearestyou.ts';

export interface ListingCommercialPolicy {
  isFood: boolean;
  deliveryAvailable: boolean;
  freeDeliveryMaxKm: number;
  immediateAcceptance: boolean;
  estimatedReadyMinutes: number;
  estimatedDeliveryMinutes: number;
  deliveryWindowLabel: string;
  returnable: boolean;
  returnWindowDays: number;
  returnLossPercent: number;
  returnLossFixedEtb: number;
  deliveryFeeNonRefundableOnReturn: boolean;
  returnPolicyNote: string;
}

export interface ReturnLossBreakdown {
  returnable: boolean;
  itemLossEtb: number;
  deliveryFeeLostEtb: number;
  totalLossEtb: number;
  refundEtb: number;
}

function toPositiveNumber(value: unknown, fallback: number): number {
  if (typeof value === 'number' && Number.isFinite(value)) return Math.max(0, value);
  if (typeof value === 'string' && value.trim() !== '') {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return Math.max(0, parsed);
  }
  return fallback;
}

export function getListingPolicy(listing?: Pick<Listing, 'listingType' | 'metadata'> | null): ListingCommercialPolicy {
  const isFood = (listing?.listingType || '').toUpperCase() === 'FOOD';
  const meta = listing?.metadata || {};

  const deliveryAvailable = meta.deliveryAvailable !== false;
  const freeDeliveryMaxKm = deliveryAvailable ? toPositiveNumber(meta.freeDeliveryMaxKm, 0) : 0;
  const immediateAcceptance = isFood ? false : meta.immediateAcceptance !== false;
  const estimatedReadyMinutes = Math.max(
    5,
    Math.round(toPositiveNumber(meta.estimatedReadyMinutes ?? meta.prepTimeMinutes, isFood ? 25 : 15))
  );
  const estimatedDeliveryMinutes = Math.max(
    estimatedReadyMinutes,
    Math.round(toPositiveNumber(meta.estimatedDeliveryMinutes ?? meta.durationMinutes, isFood ? 45 : 60))
  );
  const returnable = meta.returnable !== false;
  const returnWindowDays = returnable
    ? Math.max(1, Math.round(toPositiveNumber(meta.returnWindowDays, isFood ? 1 : 3)))
    : 0;
  const returnLossPercent = returnable
    ? Math.min(100, toPositiveNumber(meta.returnLossPercent, 0))
    : 100;
  const returnLossFixedEtb = returnable
    ? toPositiveNumber(meta.returnLossFixedEtb, 0)
    : 0;
  const deliveryFeeNonRefundableOnReturn = !returnable || meta.deliveryFeeNonRefundableOnReturn !== false;

  return {
    isFood,
    deliveryAvailable,
    freeDeliveryMaxKm,
    immediateAcceptance,
    estimatedReadyMinutes,
    estimatedDeliveryMinutes,
    deliveryWindowLabel: meta.deliveryWindowLabel?.trim() || '',
    returnable,
    returnWindowDays,
    returnLossPercent,
    returnLossFixedEtb,
    deliveryFeeNonRefundableOnReturn,
    returnPolicyNote: meta.returnPolicyNote?.trim() || '',
  };
}

export function calculateDeliveryFeeForDistance(
  distanceKm: number,
  deliverySupported: boolean,
  freeDeliveryMaxKm: number,
  policy: Pick<PlatformPolicy, 'deliveryBaseFee' | 'deliveryPerKmRate'>
): { coveredByProvider: boolean; feeEtb: number } {
  if (!deliverySupported) {
    return { coveredByProvider: false, feeEtb: 0 };
  }
  const safeMaxKm = Math.max(0, Number(freeDeliveryMaxKm) || 0);
  const safeDistance = Math.max(0, Number(distanceKm) || 0);
  if (safeMaxKm > 0 && safeDistance <= safeMaxKm) {
    return { coveredByProvider: true, feeEtb: 0 };
  }
  return {
    coveredByProvider: false,
    feeEtb: Math.round(policy.deliveryBaseFee + safeDistance * policy.deliveryPerKmRate),
  };
}

export function calculateReturnLoss(
  subtotalEtb: number,
  deliveryFeeEtb: number,
  policy: Pick<
    ListingCommercialPolicy,
    'returnable' | 'returnLossPercent' | 'returnLossFixedEtb' | 'deliveryFeeNonRefundableOnReturn'
  >,
  quantityMultiplier = 1
): ReturnLossBreakdown {
  const safeSub = Math.max(0, subtotalEtb);
  const safeDeliv = Math.max(0, deliveryFeeEtb);

  if (!policy.returnable) {
    const totalLossEtb = Math.round((safeSub + safeDeliv) * 100) / 100;
    return {
      returnable: false,
      itemLossEtb: Math.round(safeSub * 100) / 100,
      deliveryFeeLostEtb: Math.round(safeDeliv * 100) / 100,
      totalLossEtb,
      refundEtb: 0,
    };
  }

  const rawItemLoss =
    safeSub * (Math.min(100, Math.max(0, policy.returnLossPercent)) / 100) +
    Math.max(0, policy.returnLossFixedEtb) * Math.max(1, quantityMultiplier);
  const itemLossEtb = Math.round(Math.min(safeSub, rawItemLoss) * 100) / 100;
  const deliveryFeeLostEtb = policy.deliveryFeeNonRefundableOnReturn
    ? Math.round(safeDeliv * 100) / 100
    : 0;
  const totalLossEtb = Math.round((itemLossEtb + deliveryFeeLostEtb) * 100) / 100;
  const refundEtb = Math.max(0, Math.round((safeSub + safeDeliv - totalLossEtb) * 100) / 100);

  return {
    returnable: true,
    itemLossEtb,
    deliveryFeeLostEtb,
    totalLossEtb,
    refundEtb,
  };
}
