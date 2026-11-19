import React from 'react';
import { X } from 'lucide-react';
import type { Business, Listing } from '../types/nearestyou.ts';
import { calculateDistanceKm, formatEtb } from '../utils/geo.ts';
import { formatPricingModelLabel } from '../utils/i18n.ts';

interface CompareDrawerProps {
  open: boolean;
  onClose: () => void;
  listings: Listing[];
  businessesMap: Map<number, Business>;
  userLat: number;
  userLng: number;
  onRemove: (id: number) => void;
  onSelectListing: (listing: Listing) => void;
}

export const CompareDrawer: React.FC<CompareDrawerProps> = ({
  open,
  onClose,
  listings,
  businessesMap,
  userLat,
  userLng,
  onRemove,
  onSelectListing,
}) => {
  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-[#172B3A]/45 p-4 backdrop-blur-[2px]">
      <div className="w-full max-w-4xl overflow-hidden rounded-xl border border-[#172B3A]/10 bg-white shadow-2xl">
        <div className="flex items-center justify-between border-b border-[#172B3A]/10 px-6 py-4">
          <div>
            <h2 className="font-display text-lg font-semibold text-[#172B3A]">
              Side-by-Side Price & Service Comparison
            </h2>
            <p className="text-xs text-[#172B3A]/60">
              Transparent comparison across base rate, pricing unit, extra fees, and distance
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close comparison"
            className="flex h-10 w-10 items-center justify-center rounded-lg border border-[#172B3A]/10 text-[#172B3A]/70 hover:bg-[#F4F6F5]"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="overflow-x-auto p-6">
          {listings.length === 0 ? (
            <p className="py-10 text-center text-sm text-[#172B3A]/60">
              Select up to 3 listings using "+ Compare" to inspect prices side by side.
            </p>
          ) : (
            <table className="w-full min-w-[600px] border-collapse text-left text-sm">
              <thead>
                <tr className="border-b border-[#172B3A]/10">
                  <th className="py-3 pr-4 text-xs font-semibold text-[#172B3A]/60">Attribute</th>
                  {listings.map((item) => (
                    <th key={item.id} className="px-4 py-3 align-top">
                      <div className="flex items-start justify-between gap-2">
                        <span className="font-semibold text-[#172B3A]">{item.title}</span>
                        <button
                          type="button"
                          onClick={() => onRemove(item.id)}
                          className="text-xs text-[#172B3A]/45 hover:text-red-600"
                        >
                          Remove
                        </button>
                      </div>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-[#172B3A]/10 text-xs">
                <tr>
                  <td className="py-3 pr-4 font-medium text-[#172B3A]/65">Provider</td>
                  {listings.map((item) => {
                    const biz = businessesMap.get(item.businessId);
                    return (
                      <td key={item.id} className="px-4 py-3 text-[#172B3A]">
                        {biz?.businessName || 'Verified Provider'} ·{' '}
                        {biz?.verificationStatus === 'APPROVED' ? 'Verified' : 'Pending'}
                      </td>
                    );
                  })}
                </tr>
                <tr>
                  <td className="py-3 pr-4 font-medium text-[#172B3A]/65">Distance</td>
                  {listings.map((item) => {
                    const biz = businessesMap.get(item.businessId);
                    const dist = biz
                      ? calculateDistanceKm(userLat, userLng, Number(biz.latitude), Number(biz.longitude))
                      : 0;
                    return (
                      <td key={item.id} className="px-4 py-3 font-mono tabular-nums text-[#172B3A]">
                        {dist} km ({biz?.subCity})
                      </td>
                    );
                  })}
                </tr>
                <tr>
                  <td className="py-3 pr-4 font-medium text-[#172B3A]/65">Displayed Price</td>
                  {listings.map((item) => {
                    const active = item.discountPrice || item.basePrice;
                    return (
                      <td key={item.id} className="px-4 py-3 font-mono font-semibold tabular-nums text-[#176B52]">
                        {formatEtb(active)} / {item.pricingUnit}
                        {item.discountPrice && (
                          <span className="ml-2 font-normal text-[#172B3A]/45 line-through">
                            {formatEtb(item.basePrice)}
                          </span>
                        )}
                      </td>
                    );
                  })}
                </tr>
                <tr>
                  <td className="py-3 pr-4 font-medium text-[#172B3A]/65">Pricing Model</td>
                  {listings.map((item) => (
                    <td key={item.id} className="px-4 py-3 text-[#172B3A]">
                      {formatPricingModelLabel(item.pricingModel)}
                    </td>
                  ))}
                </tr>
                <tr>
                  <td className="py-3 pr-4 font-medium text-[#172B3A]/65">Additional Fees / Deposit</td>
                  {listings.map((item) => (
                    <td key={item.id} className="px-4 py-3 font-mono tabular-nums text-[#172B3A]">
                      {item.calloutFee
                        ? `Call-out: ${formatEtb(item.calloutFee)}`
                        : item.depositAmount
                          ? `Deposit: ${formatEtb(item.depositAmount)}`
                          : item.minimumCharge
                            ? `Min charge: ${formatEtb(item.minimumCharge)}`
                            : 'None'}
                    </td>
                  ))}
                </tr>
                <tr>
                  <td className="py-3 pr-4 font-medium text-[#172B3A]/65">Rating & Availability</td>
                  {listings.map((item) => (
                    <td key={item.id} className="px-4 py-3 font-mono tabular-nums text-[#172B3A]">
                      {Number(item.ratingAvg).toFixed(1)} ★ ({item.ratingCount}) · {item.availabilityStatus}
                    </td>
                  ))}
                </tr>
                <tr>
                  <td className="py-3 pr-4" />
                  {listings.map((item) => (
                    <td key={item.id} className="px-4 py-3">
                      <button
                        type="button"
                        onClick={() => {
                          onClose();
                          onSelectListing(item);
                        }}
                        className="rounded-lg bg-[#176B52] px-3 py-2 text-xs font-semibold text-white hover:bg-[#125641]"
                      >
                        Inspect & Proceed
                      </button>
                    </td>
                  ))}
                </tr>
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>
  );
};
