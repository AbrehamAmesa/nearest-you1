import React, { useEffect, useState } from 'react';
import {
  Building2,
  Check,
  CheckCircle2,
  Clock,
  Copy,
  CreditCard,
  Landmark,
  Loader2,
  Receipt,
  ShieldCheck,
  User,
  Wallet,
  X,
} from 'lucide-react';
import { paymentApi } from '../api/index.ts';
import { useAuth } from '../context/AuthContext.tsx';
import type {
  AccountSnapshot,
  DeliveryPaymentSummary,
  PaymentTransactionRecord,
} from '../types/nearestyou.ts';
import { formatEtb } from '../utils/geo.ts';

export interface PaymentReferenceLookup {
  transactionType: 'ORDER' | 'BOOKING' | 'DELIVERY' | 'RIDE';
  referenceId: number;
  referenceCode: string;
  title?: string;
  customerName?: string | null;
  paymentMethod?: string | null;
  paymentStatus?: string | null;
  grossAmount?: number | string | null;
  taxAmount?: number | string | null;
  escrowStatus?: string | null;
  createdAt?: string | null;
}

interface PaymentDetailsModalProps {
  open: boolean;
  transaction?: PaymentTransactionRecord | null;
  txRef?: string | null;
  lookup?: PaymentReferenceLookup | null;
  deliverySummary?: DeliveryPaymentSummary | null;
  viewerRole?: 'RECEIVER' | 'PAYER' | 'PARCEL_RECEIVER' | 'ADMIN';
  onClose: () => void;
}

function formatDateTime(iso?: string | null): string {
  if (!iso) return '—';
  const dt = new Date(iso);
  if (Number.isNaN(dt.getTime())) return iso;
  return dt.toLocaleString([], {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function renderAccountDetails(snapshot?: AccountSnapshot | null, emptyLabel = 'Pending account setup') {
  if (!snapshot) {
    return <p className="text-[11px] text-[#172B3A]/60">{emptyLabel}</p>;
  }
  const holder = snapshot.accountName || snapshot.accountHolderName || snapshot.ownerLabel;
  return (
    <div className="space-y-1 text-[11px] text-[#172B3A]/85">
      {holder && <p className="font-semibold text-[#172B3A]">{holder}</p>}
      {snapshot.bankName && (
        <p>
          Bank: <span className="font-medium">{snapshot.bankName}</span>
          {snapshot.accountNumber ? ` · Acct ${snapshot.accountNumber}` : ''}
        </p>
      )}
      {!snapshot.bankName && snapshot.accountNumber && (
        <p>Account: {snapshot.accountNumber}</p>
      )}
      {snapshot.telebirrNumber && <p>Telebirr: {snapshot.telebirrNumber}</p>}
      {snapshot.payoAccountHandle && <p>Payo Handle: {snapshot.payoAccountHandle}</p>}
      {snapshot.chapaSubaccountId && (
        <p className="font-mono text-[10px] text-[#176B52]">
          Chapa Subaccount: {snapshot.chapaSubaccountId}
        </p>
      )}
      {snapshot.chapaSettlementLabel && <p>{snapshot.chapaSettlementLabel}</p>}
      {snapshot.summaryLabel && !snapshot.bankName && !snapshot.telebirrNumber && !snapshot.payoAccountHandle && (
        <p className="text-[#172B3A]/70">{snapshot.summaryLabel}</p>
      )}
    </div>
  );
}

export const PaymentDetailsModal: React.FC<PaymentDetailsModalProps> = ({
  open,
  transaction: propTx,
  txRef,
  lookup,
  deliverySummary,
  viewerRole = 'RECEIVER',
  onClose,
}) => {
  const { dbUser } = useAuth();
  const canViewCommission = viewerRole === 'ADMIN' || Boolean(dbUser?.isAdmin);
  const [fetchedTx, setFetchedTx] = useState<PaymentTransactionRecord | null>(null);
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [copiedKey, setCopiedKey] = useState<string | null>(null);

  useEffect(() => {
    if (!open) {
      setFetchedTx(null);
      setErrorMsg(null);
      setLoading(false);
      return;
    }
    if (propTx) {
      setFetchedTx(propTx);
      setErrorMsg(null);
      setLoading(false);
      return;
    }
    if (deliverySummary) {
      setFetchedTx(null);
      setErrorMsg(null);
      setLoading(false);
      return;
    }

    let cancelled = false;
    if (txRef) {
      setLoading(true);
      setErrorMsg(null);
      paymentApi
        .getByTxRef(txRef)
        .then((res) => {
          if (!cancelled) setFetchedTx(res.data as PaymentTransactionRecord);
        })
        .catch((err: any) => {
          if (!cancelled) {
            setErrorMsg(err?.response?.data?.error || 'Could not load payment details.');
          }
        })
        .finally(() => {
          if (!cancelled) setLoading(false);
        });
    } else if (lookup) {
      setLoading(true);
      setErrorMsg(null);
      paymentApi
        .getByReference(lookup.transactionType, lookup.referenceId)
        .then((res) => {
          if (cancelled) return;
          const rows: PaymentTransactionRecord[] = Array.isArray(res.data) ? res.data : [];
          const best = rows.find((r) => r.status === 'PAID') || rows[0] || null;
          setFetchedTx(best);
        })
        .catch((err: any) => {
          if (!cancelled) {
            setErrorMsg(err?.response?.data?.error || 'Could not load payment details.');
          }
        })
        .finally(() => {
          if (!cancelled) setLoading(false);
        });
    }
    return () => {
      cancelled = true;
    };
  }, [open, propTx, txRef, lookup?.transactionType, lookup?.referenceId, deliverySummary]);

  if (!open) return null;

  const activeTx = propTx || fetchedTx;

  const handleCopy = (key: string, val?: string | null) => {
    if (!val || typeof navigator === 'undefined' || !navigator.clipboard) return;
    navigator.clipboard.writeText(val).then(() => {
      setCopiedKey(key);
      window.setTimeout(() => setCopiedKey(null), 1500);
    });
  };

  // Resolve unified display model whether backed by PaymentTransactionRecord, DeliveryPaymentSummary, or fallback lookup
  const statusUpper = (
    activeTx?.status ||
    deliverySummary?.paymentStatus ||
    lookup?.paymentStatus ||
    'PENDING'
  ).toUpperCase();
  const isPaid =
    statusUpper === 'PAID' ||
    statusUpper === 'SUCCESSFUL' ||
    statusUpper === 'RELEASED';

  const gatewayLabel =
    activeTx?.gateway ||
    deliverySummary?.gateway ||
    deliverySummary?.paymentMethod ||
    lookup?.paymentMethod ||
    'DIGITAL';
  const gatewayMode = activeTx?.gatewayMode || deliverySummary?.gatewayMode || null;
  const displayTxRef = activeTx?.txRef || deliverySummary?.txRef || txRef || null;
  const displayRefCode =
    activeTx?.referenceCode || deliverySummary?.referenceCode || lookup?.referenceCode || '—';
  const displayType =
    activeTx?.transactionType || lookup?.transactionType || 'DELIVERY';
  const grossAmount = Number(
    activeTx?.grossAmount ?? deliverySummary?.grossAmount ?? lookup?.grossAmount ?? 0
  );
  const taxAmount = Number(
    activeTx?.taxAmount ?? deliverySummary?.taxAmount ?? lookup?.taxAmount ?? 0
  );
  const commissionAmount =
    activeTx?.commissionAmount != null
      ? Number(activeTx.commissionAmount)
      : deliverySummary?.commissionAmount != null
        ? Number(deliverySummary.commissionAmount)
        : null;
  const providerAmount =
    activeTx?.providerAmount != null
      ? Number(activeTx.providerAmount)
      : deliverySummary?.providerAmount != null
        ? Number(deliverySummary.providerAmount)
        : null;
  const paidAt = activeTx?.paidAt || deliverySummary?.paidAt || lookup?.createdAt || null;
  const customerName =
    activeTx?.customerName || deliverySummary?.customerName || lookup?.customerName || 'Customer';
  const customerEmail = activeTx?.customerEmail || deliverySummary?.customerEmail || null;
  const gatewayTransactionId =
    activeTx?.gatewayTransactionId || deliverySummary?.gatewayTransactionId || null;
  const payerReceiptRef =
    activeTx?.payerReceiptReference || deliverySummary?.payerReceiptReference || null;
  const payerReceiptImg =
    activeTx?.payerReceiptImageUrl || deliverySummary?.payerReceiptImageUrl || null;
  const providerSnap =
    activeTx?.providerPayoutAccountSnapshot || deliverySummary?.providerPayoutAccountSnapshot || null;
  const platformSnap =
    activeTx?.platformCommissionAccountSnapshot ||
    deliverySummary?.platformCommissionAccountSnapshot ||
    null;
  const commissionLegStatus =
    activeTx?.commissionLegStatus || deliverySummary?.commissionLegStatus || null;
  const providerLegStatus =
    activeTx?.providerLegStatus || deliverySummary?.providerLegStatus || null;
  const escrowStatus = deliverySummary?.escrowStatus || lookup?.escrowStatus || null;

  return (
    <div
      className="fixed inset-0 z-[1250] flex items-center justify-center overflow-y-auto bg-[#172B3A]/65 p-3 sm:p-5 backdrop-blur-[2px]"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="my-auto w-full max-w-2xl overflow-hidden rounded-2xl border border-[#172B3A]/15 bg-white shadow-2xl">
        {/* Header */}
        <div className="flex items-start justify-between gap-3 border-b border-[#172B3A]/10 bg-[#172B3A] px-5 py-4 text-white">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <span className="inline-flex h-7 w-7 items-center justify-center rounded-lg bg-[#176B52] text-white">
                <Receipt className="h-4 w-4" />
              </span>
              <h2 className="font-display text-base font-bold sm:text-lg">
                Payment Details · {displayRefCode}
              </h2>
              <span
                className={`rounded-md px-2 py-0.5 font-mono text-[10px] font-bold uppercase ${
                  isPaid
                    ? 'bg-emerald-400/20 text-emerald-200 border border-emerald-300/30'
                    : 'bg-amber-400/20 text-amber-200 border border-amber-300/30'
                }`}
              >
                {statusUpper}
              </span>
            </div>
            <p className="mt-1 text-xs text-white/75">
              {viewerRole === 'PARCEL_RECEIVER'
                ? 'Verified payment confirmation for your incoming parcel'
                : viewerRole === 'PAYER'
                  ? 'Verified payment receipt and transaction confirmation'
                  : 'Verified incoming payment receipt and settlement breakdown'}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close payment details"
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-white/10 text-white hover:bg-white/20"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="max-h-[78dvh] overflow-y-auto p-5 space-y-4 text-xs">
          {loading ? (
            <div className="flex flex-col items-center justify-center gap-2 py-12 text-[#172B3A]/70">
              <Loader2 className="h-6 w-6 animate-spin text-[#176B52]" />
              <p>Loading verified payment details...</p>
            </div>
          ) : errorMsg ? (
            <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-red-800">
              {errorMsg}
            </div>
          ) : (
            <>
              {/* Top Status & Amount Banner */}
              <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-[#176B52]/25 bg-emerald-50/50 p-4">
                <div className="space-y-1">
                  <div className="inline-flex items-center gap-1.5 font-semibold text-[#176B52]">
                    {isPaid ? (
                      <CheckCircle2 className="h-4 w-4 shrink-0" />
                    ) : (
                      <Clock className="h-4 w-4 shrink-0 text-amber-700" />
                    )}
                    <span>
                      {isPaid
                        ? `Paid & Verified via ${gatewayLabel}${gatewayMode ? ` (${gatewayMode})` : ''}`
                        : `Payment Status: ${statusUpper} (${gatewayLabel})`}
                    </span>
                  </div>
                  <p className="text-[11px] text-[#172B3A]/75">
                    {displayType} Reference: <strong className="font-mono">{displayRefCode}</strong>
                    {escrowStatus ? ` · Escrow: ${escrowStatus}` : ''}
                  </p>
                </div>

                <div className="text-left sm:text-right font-mono">
                  <p className="text-[10px] uppercase tracking-wide text-[#172B3A]/60">
                    Gross Paid
                  </p>
                  <p className="text-xl font-bold tabular-nums text-[#172B3A]">
                    {formatEtb(grossAmount)}
                  </p>
                </div>
              </div>

              {/* Financial Breakdown */}
              {(() => {
                const showProviderNet =
                  providerAmount !== null &&
                  viewerRole !== 'PARCEL_RECEIVER' &&
                  (viewerRole === 'RECEIVER' || canViewCommission);
                const showCommission =
                  canViewCommission &&
                  commissionAmount !== null &&
                  viewerRole !== 'PARCEL_RECEIVER';
                const colClass =
                  showProviderNet && showCommission
                    ? 'sm:grid-cols-3'
                    : showProviderNet || showCommission
                      ? 'sm:grid-cols-2'
                      : 'grid-cols-1';
                return (
                  <div className={`grid gap-3 ${colClass}`}>
                    <div className="rounded-xl border border-[#172B3A]/10 bg-[#F4F6F5]/70 p-3.5">
                      <p className="text-[10px] font-semibold uppercase tracking-wide text-[#172B3A]/60">
                        Gross Amount &amp; VAT
                      </p>
                      <p className="mt-1 font-mono text-base font-bold tabular-nums text-[#172B3A]">
                        {formatEtb(grossAmount)}
                      </p>
                      <p className="mt-0.5 font-mono text-[11px] text-[#172B3A]/65">
                        Includes Tax/VAT: {formatEtb(taxAmount)}
                      </p>
                    </div>

                    {showProviderNet && (
                      <div className="rounded-xl border border-[#176B52]/25 bg-emerald-50/40 p-3.5">
                        <p className="text-[10px] font-semibold uppercase tracking-wide text-[#176B52]">
                          {viewerRole === 'RECEIVER' ? 'Your Net Sales' : 'Provider Net Sales'}
                        </p>
                        <p className="mt-1 font-mono text-base font-bold tabular-nums text-[#176B52]">
                          {formatEtb(providerAmount!)}
                        </p>
                        {providerLegStatus && (
                          <p className="mt-0.5 font-mono text-[10px] text-[#176B52]">
                            {providerLegStatus}
                          </p>
                        )}
                      </div>
                    )}

                    {showCommission && (
                      <div className="rounded-xl border border-[#172B3A]/10 bg-[#F4F6F5]/70 p-3.5">
                        <p className="text-[10px] font-semibold uppercase tracking-wide text-[#172B3A]/60">
                          Platform Commission
                          {activeTx?.commissionRate != null
                            ? ` (${Number(activeTx.commissionRate).toFixed(2)}%)`
                            : ''}
                        </p>
                        <p className="mt-1 font-mono text-base font-bold tabular-nums text-[#172B3A]">
                          {formatEtb(commissionAmount!)}
                        </p>
                        {commissionLegStatus && (
                          <p className="mt-0.5 font-mono text-[10px] text-[#172B3A]/65">
                            {commissionLegStatus}
                          </p>
                        )}
                      </div>
                    )}
                  </div>
                );
              })()}

              {/* Metadata & References */}
              <div className="rounded-xl border border-[#172B3A]/10 bg-white p-4 space-y-2.5">
                <h3 className="flex items-center gap-1.5 font-display text-xs font-bold uppercase tracking-wide text-[#172B3A]">
                  <CreditCard className="h-3.5 w-3.5 text-[#176B52]" />
                  Transaction &amp; Payer Verification
                </h3>

                <div className="grid gap-2.5 sm:grid-cols-2">
                  <div>
                    <p className="text-[10px] text-[#172B3A]/55">Sender / Payer</p>
                    <p className="flex items-center gap-1 font-semibold text-[#172B3A]">
                      <User className="h-3 w-3 text-[#176B52]" />
                      {customerName}
                    </p>
                    {customerEmail && viewerRole !== 'PARCEL_RECEIVER' && (
                      <p className="text-[11px] text-[#172B3A]/65">{customerEmail}</p>
                    )}
                  </div>

                  <div>
                    <p className="text-[10px] text-[#172B3A]/55">Paid / Settled Timestamp</p>
                    <p className="font-mono font-semibold text-[#172B3A]">
                      {formatDateTime(paidAt)}
                    </p>
                  </div>

                  {displayTxRef && (
                    <div>
                      <p className="text-[10px] text-[#172B3A]/55">Gateway Tx Reference</p>
                      <div className="flex items-center gap-1.5">
                        <span className="font-mono font-bold text-[#172B3A]">{displayTxRef}</span>
                        <button
                          type="button"
                          onClick={() => handleCopy('txRef', displayTxRef)}
                          className="inline-flex items-center gap-1 rounded border border-[#172B3A]/15 px-1.5 py-0.5 text-[10px] font-semibold text-[#172B3A] hover:bg-[#F4F6F5]"
                        >
                          {copiedKey === 'txRef' ? (
                            <Check className="h-3 w-3 text-[#176B52]" />
                          ) : (
                            <Copy className="h-3 w-3" />
                          )}
                          Copy
                        </button>
                      </div>
                    </div>
                  )}

                  {gatewayTransactionId && (
                    <div>
                      <p className="text-[10px] text-[#172B3A]/55">
                        {gatewayLabel} Settlement ID
                      </p>
                      <p className="font-mono font-semibold text-[#172B3A]">
                        {gatewayTransactionId}
                      </p>
                    </div>
                  )}

                  {payerReceiptRef && (
                    <div>
                      <p className="text-[10px] text-[#172B3A]/55">Payer Receipt / FT Reference</p>
                      <p className="font-mono font-semibold text-[#176B52]">{payerReceiptRef}</p>
                    </div>
                  )}
                </div>
              </div>

              {/* Settlement Account Snapshots (hidden for anonymous parcel receiver; Platform Pool hidden for non-admins) */}
              {viewerRole !== 'PARCEL_RECEIVER' && (providerSnap || (canViewCommission && platformSnap)) && (
                <div className={`grid gap-3 ${canViewCommission && platformSnap && providerSnap ? 'sm:grid-cols-2' : 'grid-cols-1'}`}>
                  {providerSnap && (
                    <div className="rounded-xl border border-[#176B52]/20 bg-emerald-50/25 p-3.5 space-y-1.5">
                      <p className="flex items-center gap-1.5 font-semibold text-[#176B52]">
                        <Building2 className="h-3.5 w-3.5" />
                        Receiver Payout Account
                      </p>
                      {renderAccountDetails(providerSnap)}
                    </div>
                  )}

                  {canViewCommission && platformSnap && (
                    <div className="rounded-xl border border-[#172B3A]/15 bg-[#F4F6F5]/60 p-3.5 space-y-1.5">
                      <p className="flex items-center gap-1.5 font-semibold text-[#172B3A]">
                        <Landmark className="h-3.5 w-3.5 text-[#176B52]" />
                        Platform Commission Pool
                      </p>
                      {renderAccountDetails(platformSnap, 'Platform Commission Pool')}
                    </div>
                  )}
                </div>
              )}

              {/* Uploaded Receipt Proof Image if available */}
              {payerReceiptImg && (
                <div className="rounded-xl border border-[#172B3A]/10 bg-[#F4F6F5] p-3.5 space-y-2">
                  <p className="flex items-center gap-1.5 font-semibold text-[#172B3A]">
                    <ShieldCheck className="h-4 w-4 text-[#176B52]" />
                    Submitted Transfer Receipt Proof
                  </p>
                  <img
                    src={payerReceiptImg}
                    alt="Payment transfer receipt"
                    className="max-h-72 w-full rounded-lg border border-[#172B3A]/10 bg-white object-contain"
                  />
                </div>
              )}

              {!activeTx && !deliverySummary?.txRef && lookup && (
                <div className="flex items-start gap-2 rounded-xl border border-[#172B3A]/10 bg-[#F4F6F5] p-3 text-[11px] text-[#172B3A]/75">
                  <Wallet className="mt-0.5 h-4 w-4 shrink-0 text-[#176B52]" />
                  <span>
                    Settled directly via <strong>{gatewayLabel}</strong> ({statusUpper}). Chapa &amp;
                    Payo receipts include full gateway reference IDs when processed via online
                    checkout.
                  </span>
                </div>
              )}
            </>
          )}
        </div>

        <div className="flex justify-end border-t border-[#172B3A]/10 bg-[#F4F6F5] px-5 py-3">
          <button
            type="button"
            onClick={onClose}
            className="min-h-[40px] rounded-lg bg-[#172B3A] px-5 py-2 text-xs font-semibold text-white hover:bg-[#176B52]"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
};
