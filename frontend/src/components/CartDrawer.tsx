import React, { useMemo, useState } from 'react';
import { Minus, Plus, ShoppingBag, Trash2, X } from 'lucide-react';
import type { CartItem, PlatformPolicy } from '../types/nearestyou.ts';
import { calculateDistanceKm, formatEtb } from '../utils/geo.ts';
import { calculateReturnLoss, getListingPolicy } from '../utils/listingPolicy.ts';
import { getPublicProviderLabel } from '../utils/sellerDisplay.ts';
import { useAuth } from '../context/AuthContext.tsx';

interface CartDrawerProps {
  open: boolean;
  onClose: () => void;
  items: CartItem[];
  onUpdateQty: (listingId: number, delta: number) => void;
  onRemoveItem: (listingId: number) => void;
  onClearCart: () => void;
  userLat: number;
  userLng: number;
  subCityName: string;
  policy: PlatformPolicy;
  onOrderSuccess: (orderNumbers: string[]) => void;
}

export const CartDrawer: React.FC<CartDrawerProps> = ({
  open,
  onClose,
  items,
  onUpdateQty,
  onRemoveItem,
  onClearCart,
  userLat,
  userLng,
  subCityName,
  policy,
  onOrderSuccess,
}) => {
  const { firebaseUser, openAuthModal, authFetch } = useAuth();
  const [fulfillmentType, setFulfillmentType] = useState<'DELIVERY' | 'PICKUP'>('DELIVERY');
  const [deliveryAddress, setDeliveryAddress] = useState(`${subCityName || 'Addis Ababa'}, Near Main Road`);
  const [addressTouched, setAddressTouched] = useState(false);

  React.useEffect(() => {
    if (!addressTouched && subCityName) {
      setDeliveryAddress(`${subCityName}, Near Main Road`);
    }
  }, [subCityName, addressTouched]);
  const [paymentMethod, setPaymentMethod] = useState<'TELEBIRR' | 'CBE_BIRR' | 'BANK_TRANSFER' | 'CASH'>('TELEBIRR');
  const [submitting, setSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const vendorGroups = useMemo(() => {
    const map = new Map<
      number,
      {
        business: CartItem['business'];
        items: CartItem[];
        distanceKm: number;
        subtotal: number;
        discountSavings: number;
        deliverySupported: boolean;
        effectiveFulfillment: 'DELIVERY' | 'PICKUP';
        deliveryFee: number;
        taxAmount: number;
        total: number;
        isFoodOrder: boolean;
        immediateAcceptance: boolean;
        estimatedReadyMinutes: number;
        estimatedDeliveryMinutes: number;
        returnPolicy: {
          returnable: boolean;
          returnWindowDays: number;
          returnLossPercent: number;
          returnLossFixedEtb: number;
          deliveryFeeNonRefundableOnReturn: boolean;
        };
      }
    >();

    for (const item of items) {
      const bId = item.business.id;
      const existing = map.get(bId);
      const orig = Number(item.listing.basePrice);
      const active = item.listing.discountPrice ? Number(item.listing.discountPrice) : orig;
      const lineSub = active * item.quantity;
      const lineSavings = item.listing.discountPrice ? (orig - active) * item.quantity : 0;
      const itemPol = getListingPolicy(item.listing);

      if (!existing) {
        const dist = calculateDistanceKm(
          userLat,
          userLng,
          Number(item.business.latitude),
          Number(item.business.longitude)
        );
        map.set(bId, {
          business: item.business,
          items: [item],
          distanceKm: dist,
          subtotal: lineSub,
          discountSavings: lineSavings,
          deliverySupported: itemPol.deliveryAvailable,
          effectiveFulfillment: 'PICKUP',
          deliveryFee: 0,
          taxAmount: 0,
          total: 0,
          isFoodOrder: itemPol.isFood,
          immediateAcceptance: !itemPol.isFood && itemPol.immediateAcceptance,
          estimatedReadyMinutes: itemPol.estimatedReadyMinutes,
          estimatedDeliveryMinutes: itemPol.estimatedDeliveryMinutes,
          returnPolicy: {
            returnable: itemPol.returnable,
            returnWindowDays: itemPol.returnWindowDays,
            returnLossPercent: itemPol.returnLossPercent,
            returnLossFixedEtb: itemPol.returnLossFixedEtb,
            deliveryFeeNonRefundableOnReturn: itemPol.deliveryFeeNonRefundableOnReturn,
          },
        });
      } else {
        existing.items.push(item);
        existing.subtotal += lineSub;
        existing.discountSavings += lineSavings;
        existing.deliverySupported = existing.deliverySupported && itemPol.deliveryAvailable;
        existing.isFoodOrder = existing.isFoodOrder || itemPol.isFood;
        existing.immediateAcceptance =
          !existing.isFoodOrder && existing.immediateAcceptance && itemPol.immediateAcceptance;
        existing.estimatedReadyMinutes = Math.max(
          existing.estimatedReadyMinutes,
          itemPol.estimatedReadyMinutes
        );
        existing.estimatedDeliveryMinutes = Math.max(
          existing.estimatedDeliveryMinutes,
          itemPol.estimatedDeliveryMinutes
        );
        existing.returnPolicy = {
          returnable: existing.returnPolicy.returnable && itemPol.returnable,
          returnWindowDays: Math.min(
            existing.returnPolicy.returnWindowDays || itemPol.returnWindowDays,
            itemPol.returnWindowDays
          ),
          returnLossPercent: Math.max(
            existing.returnPolicy.returnLossPercent,
            itemPol.returnLossPercent
          ),
          returnLossFixedEtb: Math.max(
            existing.returnPolicy.returnLossFixedEtb,
            itemPol.returnLossFixedEtb
          ),
          deliveryFeeNonRefundableOnReturn:
            existing.returnPolicy.deliveryFeeNonRefundableOnReturn ||
            itemPol.deliveryFeeNonRefundableOnReturn,
        };
      }
    }

    return Array.from(map.values()).map((g) => {
      const effectiveFulfillment: 'DELIVERY' | 'PICKUP' =
        fulfillmentType === 'DELIVERY' && g.deliverySupported ? 'DELIVERY' : 'PICKUP';
      const deliveryFee =
        effectiveFulfillment === 'DELIVERY'
          ? Math.round(policy.deliveryBaseFee + g.distanceKm * policy.deliveryPerKmRate)
          : 0;
      const taxAmount = Math.round(g.subtotal * (policy.taxRatePercent / 100) * 100) / 100;
      const total = Math.round((g.subtotal + deliveryFee + taxAmount) * 100) / 100;
      const returnLoss = calculateReturnLoss(g.subtotal, deliveryFee, g.returnPolicy, 1);
      return { ...g, effectiveFulfillment, deliveryFee, taxAmount, total, returnLoss };
    });
  }, [items, userLat, userLng, fulfillmentType, policy]);

  const anyGroupNeedsDeliveryAddress = vendorGroups.some(
    (g) => g.effectiveFulfillment === 'DELIVERY'
  );
  const grandTotal = vendorGroups.reduce((sum, g) => sum + g.total, 0);

  const handleCheckout = async () => {
    setErrorMsg(null);
    if (!firebaseUser) {
      openAuthModal('signin');
      return;
    }
    if (anyGroupNeedsDeliveryAddress && !deliveryAddress.trim()) {
      setErrorMsg('Please provide your Addis Ababa delivery landmark or street address.');
      return;
    }

    setSubmitting(true);
    try {
      const payload = {
        paymentMethod,
        groups: vendorGroups.map((g) => ({
          businessId: g.business.id,
          orderType: g.isFoodOrder ? 'FOOD' : 'PRODUCT',
          fulfillmentType: g.effectiveFulfillment,
          deliveryAddress:
            g.effectiveFulfillment === 'PICKUP'
              ? `Pickup at ${g.business.landmark}, ${g.business.subCity}`
              : deliveryAddress,
          deliveryFee: g.deliveryFee,
          items: g.items.map((i) => ({
            listingId: i.listing.id,
            quantity: i.quantity,
            variant: i.variant,
          })),
        })),
      };

      const res = await authFetch('/api/v1/orders', {
        method: 'POST',
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Checkout failed.');
      }
      const orderNumbers = (data.orders || []).map((o: { orderNumber: string }) => o.orderNumber);
      onClearCart();
      onOrderSuccess(orderNumbers);
      onClose();
    } catch (err: unknown) {
      setErrorMsg(err instanceof Error ? err.message : 'Unable to complete checkout.');
    } finally {
      setSubmitting(false);
    }
  };

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-[#172B3A]/40 backdrop-blur-[2px]">
      <div className="flex h-full w-full max-w-xl flex-col bg-white shadow-2xl">
        <div className="flex items-center justify-between border-b border-[#172B3A]/10 px-6 py-5">
          <div>
            <h2 className="font-display text-lg font-semibold text-[#172B3A]">
              Multi-Vendor Cart & Checkout
            </h2>
            <p className="text-xs text-[#172B3A]/60">
              Grouped by vendor with transparent ETB pricing and delivery fees
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close cart"
            className="flex h-10 w-10 items-center justify-center rounded-lg border border-[#172B3A]/10 text-[#172B3A]/70 hover:bg-[#F4F6F5] hover:text-[#172B3A]"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-6 py-5 space-y-6">
          {items.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-20 text-center">
              <ShoppingBag className="h-10 w-10 text-[#172B3A]/25" />
              <p className="mt-4 text-sm font-medium text-[#172B3A]">Your cart is empty</p>
              <p className="mt-1 max-w-xs text-xs text-[#172B3A]/60">
                Add retail products or restaurant dishes from verified nearby vendors to compare and check out.
              </p>
            </div>
          ) : (
            <>
              <div className="space-y-2">
                <span className="text-xs font-medium text-[#172B3A]/70">Fulfillment Option</span>
                <div className="grid grid-cols-2 gap-2 rounded-lg bg-[#F4F6F5] p-1">
                  <button
                    type="button"
                    onClick={() => setFulfillmentType('DELIVERY')}
                    className={`min-h-[40px] rounded-md px-3 py-2 text-xs font-semibold transition-colors ${
                      fulfillmentType === 'DELIVERY'
                        ? 'bg-white text-[#176B52] shadow-sm'
                        : 'text-[#172B3A]/70 hover:text-[#172B3A]'
                    }`}
                  >
                    Door-to-Door Delivery
                  </button>
                  <button
                    type="button"
                    onClick={() => setFulfillmentType('PICKUP')}
                    className={`min-h-[40px] rounded-md px-3 py-2 text-xs font-semibold transition-colors ${
                      fulfillmentType === 'PICKUP'
                        ? 'bg-white text-[#176B52] shadow-sm'
                        : 'text-[#172B3A]/70 hover:text-[#172B3A]'
                    }`}
                  >
                    Vendor Store Pickup
                  </button>
                </div>
              </div>

              {anyGroupNeedsDeliveryAddress && (
                <div>
                  <label className="block text-xs font-medium text-[#172B3A]/75">
                    Delivery Landmark / Address ({subCityName})
                  </label>
                  <input
                    type="text"
                    value={deliveryAddress}
                    onChange={(e) => {
                      setAddressTouched(true);
                      setDeliveryAddress(e.target.value);
                    }}
                    placeholder="e.g., Bole Medhanialem, Building 4, Floor 2"
                    className="mt-1.5 w-full rounded-lg border border-[#172B3A]/15 bg-white px-3.5 py-2.5 text-sm text-[#172B3A] focus:border-[#176B52] focus:outline-none"
                  />
                </div>
              )}

              <div className="space-y-5">
                {vendorGroups.map((group) => (
                  <div
                    key={group.business.id}
                    className="rounded-xl border border-[#172B3A]/10 bg-[#F4F6F5]/50 p-4"
                  >
                    <div className="flex items-baseline justify-between border-b border-[#172B3A]/10 pb-3">
                      <div>
                        <h3 className="text-sm font-semibold text-[#172B3A]">
                          {getPublicProviderLabel(group.items[0]?.listing, group.business)}
                        </h3>
                        <p className="text-xs text-[#172B3A]/60">
                          {group.business.subCity} · {group.distanceKm} km away
                        </p>
                      </div>
                      <span className="font-mono text-xs font-medium tabular-nums text-[#176B52]">
                        {formatEtb(group.total)}
                      </span>
                    </div>

                    <div className="divide-y divide-[#172B3A]/10">
                      {group.items.map((item) => {
                        const unitPrice = item.listing.discountPrice
                          ? Number(item.listing.discountPrice)
                          : Number(item.listing.basePrice);
                        return (
                          <div key={item.listing.id} className="flex items-center justify-between gap-3 py-3">
                            <div className="min-w-0 flex-1">
                              <p className="truncate text-sm font-medium text-[#172B3A]">
                                {item.listing.title}
                              </p>
                              <p className="font-mono text-xs tabular-nums text-[#172B3A]/65">
                                {formatEtb(unitPrice)} / {item.listing.pricingUnit}
                              </p>
                            </div>
                            <div className="flex items-center gap-2 shrink-0">
                              <button
                                type="button"
                                onClick={() => onUpdateQty(item.listing.id, -1)}
                                aria-label="Decrease quantity"
                                className="flex h-8 w-8 items-center justify-center rounded-md border border-[#172B3A]/15 bg-white text-[#172B3A] hover:bg-[#F4F6F5]"
                              >
                                <Minus className="h-3.5 w-3.5" />
                              </button>
                              <span className="w-6 text-center font-mono text-xs font-semibold tabular-nums">
                                {item.quantity}
                              </span>
                              <button
                                type="button"
                                onClick={() => onUpdateQty(item.listing.id, 1)}
                                aria-label="Increase quantity"
                                className="flex h-8 w-8 items-center justify-center rounded-md border border-[#172B3A]/15 bg-white text-[#172B3A] hover:bg-[#F4F6F5]"
                              >
                                <Plus className="h-3.5 w-3.5" />
                              </button>
                              <button
                                type="button"
                                onClick={() => onRemoveItem(item.listing.id)}
                                aria-label="Remove item"
                                className="ml-1 flex h-8 w-8 items-center justify-center rounded-md text-[#172B3A]/45 hover:bg-red-50 hover:text-red-600"
                              >
                                <Trash2 className="h-4 w-4" />
                              </button>
                            </div>
                          </div>
                        );
                      })}
                    </div>

                    <div className="mt-3 space-y-1 border-t border-[#172B3A]/10 pt-3 text-xs">
                      <div className="flex justify-between text-[#172B3A]/70">
                        <span>Vendor subtotal</span>
                        <span className="font-mono tabular-nums">{formatEtb(group.subtotal)}</span>
                      </div>
                      {group.discountSavings > 0 && (
                        <div className="flex justify-between text-[#176B52]">
                          <span>Discount savings</span>
                          <span className="font-mono tabular-nums">
                            -{formatEtb(group.discountSavings)}
                          </span>
                        </div>
                      )}
                      <div className="flex justify-between text-[#172B3A]/70">
                        <span>
                          Delivery (
                          {group.effectiveFulfillment === 'DELIVERY'
                            ? `${group.distanceKm} km`
                            : 'Store Pickup'}
                          )
                        </span>
                        <span className="font-mono tabular-nums">{formatEtb(group.deliveryFee)}</span>
                      </div>
                      <div className="flex justify-between text-[#172B3A]/70">
                        <span>VAT ({policy.taxRatePercent}%)</span>
                        <span className="font-mono tabular-nums">{formatEtb(group.taxAmount)}</span>
                      </div>
                      <div className="flex justify-between pt-1 font-semibold text-[#172B3A]">
                        <span>Vendor order total</span>
                        <span className="font-mono tabular-nums">{formatEtb(group.total)}</span>
                      </div>
                    </div>

                    {/* Per-Vendor Acceptance, ETA & Unsatisfied Return Buyer-Loss Disclosure */}
                    <div className="mt-3 space-y-1 rounded-lg border border-[#172B3A]/12 bg-white p-2.5 text-[11px] text-[#172B3A]/80">
                      {!group.deliverySupported && (
                        <p className="font-semibold text-amber-800">
                          Without Delivery — Store Pickup Only at {group.business.landmark},{' '}
                          {group.business.subCity}
                        </p>
                      )}
                      <p>
                        <strong className="text-[#172B3A]">Acceptance &amp; Time:</strong>{' '}
                        {group.isFoodOrder
                          ? `Food Order Request — Seller accepts & confirms prep (~${group.estimatedReadyMinutes}m) and delivery (~${group.estimatedDeliveryMinutes}m) clock time.`
                          : group.immediateAcceptance
                            ? `Immediate Acceptance — Ready in ~${group.estimatedReadyMinutes} min · Deliverable in ~${group.estimatedDeliveryMinutes} min.`
                            : `Order Request — Seller reviews & confirms ready (~${group.estimatedReadyMinutes}m) and delivery (~${group.estimatedDeliveryMinutes}m) time.`}
                      </p>
                      <p>
                        <strong className="text-[#172B3A]">If Unsatisfied (Return Loss):</strong>{' '}
                        {group.returnPolicy.returnable ? (
                          <>
                            Returnable within {group.returnPolicy.returnWindowDays}d.{' '}
                            <span className="font-mono tabular-nums">
                              Item loss: {formatEtb(group.returnLoss.itemLossEtb)} ·{' '}
                              {group.effectiveFulfillment === 'DELIVERY'
                                ? group.returnPolicy.deliveryFeeNonRefundableOnReturn
                                  ? `Delivery fee (${formatEtb(group.deliveryFee)}) non-refundable/lost`
                                  : `Delivery fee (${formatEtb(group.deliveryFee)}) refunded`
                                : 'No delivery fee'}
                              {' · '}
                              Total buyer loss:{' '}
                              <strong className="text-[#172B3A]">
                                {formatEtb(group.returnLoss.totalLossEtb)}
                              </strong>{' '}
                              (Refund: {formatEtb(group.returnLoss.refundEtb)})
                            </span>
                          </>
                        ) : (
                          <span className="font-semibold text-red-700">
                            Non-Returnable (Final Sale) — Buyer loses 100% ({formatEtb(group.returnLoss.totalLossEtb)})
                          </span>
                        )}
                      </p>
                    </div>
                  </div>
                ))}
              </div>

              <div className="space-y-2">
                <span className="text-xs font-medium text-[#172B3A]/75">Ethiopian Payment Method</span>
                <div className="grid grid-cols-2 gap-2">
                  {[
                    { id: 'TELEBIRR', label: 'Telebirr' },
                    { id: 'CBE_BIRR', label: 'CBE Birr' },
                    { id: 'BANK_TRANSFER', label: 'Bank Transfer' },
                    { id: 'CASH', label: 'Cash on Delivery' },
                  ].map((pm) => (
                    <button
                      key={pm.id}
                      type="button"
                      onClick={() => setPaymentMethod(pm.id as typeof paymentMethod)}
                      className={`min-h-[40px] rounded-lg border px-3 py-2 text-xs font-semibold transition-colors ${
                        paymentMethod === pm.id
                          ? 'border-[#176B52] bg-[#176B52]/8 text-[#176B52]'
                          : 'border-[#172B3A]/15 bg-white text-[#172B3A]/75 hover:border-[#172B3A]/30'
                      }`}
                    >
                      {pm.label}
                    </button>
                  ))}
                </div>
              </div>
            </>
          )}

          {errorMsg && (
            <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-xs text-red-700">
              {errorMsg}
            </div>
          )}
        </div>

        {items.length > 0 && (
          <div className="border-t border-[#172B3A]/10 bg-white px-6 py-4">
            <div className="mb-3 flex items-baseline justify-between">
              <span className="text-sm font-medium text-[#172B3A]/75">
                Combined Checkout Total ({vendorGroups.length}{' '}
                {vendorGroups.length === 1 ? 'vendor order' : 'vendor orders'})
              </span>
              <span className="font-mono text-xl font-bold tabular-nums text-[#172B3A]">
                {formatEtb(grandTotal)}
              </span>
            </div>
            <button
              type="button"
              disabled={submitting}
              onClick={handleCheckout}
              className="w-full min-h-[44px] rounded-lg bg-[#176B52] px-5 py-3 text-sm font-semibold text-white transition-colors hover:bg-[#125641] disabled:opacity-50"
            >
              {submitting
                ? 'Processing Vendor Orders...'
                : firebaseUser
                  ? `Confirm & Pay ${formatEtb(grandTotal)}`
                  : 'Sign In with Google to Checkout'}
            </button>
          </div>
        )}
      </div>
    </div>
  );
};
