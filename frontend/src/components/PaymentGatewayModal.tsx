import React, { useCallback, useEffect, useState } from 'react';
import {
  Building2,
  Check,
  CheckCircle2,
  Copy,
  CreditCard,
  ExternalLink,
  Landmark,
  Loader2,
  ShieldCheck,
  Upload,
  Wallet,
  X,
} from 'lucide-react';
import { paymentApi } from '../api/index.ts';
import type {
  PaymentGatewayConfig,
  PaymentInitTarget,
  PaymentTransactionRecord,
} from '../types/nearestyou.ts';
import { formatEtb } from '../utils/geo.ts';
import { compressImageFile } from '../utils/media.ts';
import { useAuth } from '../context/AuthContext.tsx';

interface PaymentGatewayModalProps {
  targets: PaymentInitTarget[];
  onClose: () => void;
  onPaymentSettled: (tx: PaymentTransactionRecord) => void;
  onNotify: (msg: string) => void;
}

export const PaymentGatewayModal: React.FC<PaymentGatewayModalProps> = ({
  targets,
  onClose,
  onPaymentSettled,
  onNotify,
}) => {
  const { dbUser, firebaseUser } = useAuth();
  const [activeIdx, setActiveIdx] = useState(0);
  const [selectedGateway, setSelectedGateway] = useState<'CHAPA' | 'PAYO'>(
    targets[0]?.gateway || 'CHAPA'
  );
  const [gatewayConfig, setGatewayConfig] = useState<PaymentGatewayConfig | null>(null);
  const [txMap, setTxMap] = useState<Record<number, PaymentTransactionRecord>>({});
  const [paidIds, setPaidIds] = useState<Record<number, boolean>>({});
  const [initializing, setInitializing] = useState(false);
  const [processing, setProcessing] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [copiedKey, setCopiedKey] = useState<string | null>(null);

  // Chapa simulator selection when CHAPA_SECRET_KEY is not configured in dev
  const [chapaRail, setChapaRail] = useState<'telebirr' | 'cbebirr' | 'card'>('telebirr');

  // Payo dual-leg receipt state
  const [payoReceiptRef, setPayoReceiptRef] = useState('');
  const [payoReceiptImage, setPayoReceiptImage] = useState('');
  const [providerLegChecked, setProviderLegChecked] = useState(true);
  const [commissionLegChecked, setCommissionLegChecked] = useState(true);
  const [payoNotes, setPayoNotes] = useState('');

  const currentTarget = targets[activeIdx] || null;
  const currentTx = currentTarget ? txMap[activeIdx] || null : null;

  useEffect(() => {
    paymentApi
      .getConfig()
      .then((res) => setGatewayConfig(res.data))
      .catch(() => {});
  }, []);

  useEffect(() => {
    if (targets.length > 0) {
      setActiveIdx(0);
      setSelectedGateway(targets[0].gateway || 'CHAPA');
      setTxMap({});
      setPaidIds({});
      setErrorMsg(null);
    }
  }, [targets]);

  useEffect(() => {
    if (!gatewayConfig) return;
    const chapaAvailable = gatewayConfig.gateways?.chapa?.enabled !== false;
    const payoAvailable = gatewayConfig.gateways?.payo?.enabled !== false;
    if (selectedGateway === 'CHAPA' && !chapaAvailable && payoAvailable) setSelectedGateway('PAYO');
    else if (selectedGateway === 'PAYO' && !payoAvailable && chapaAvailable) setSelectedGateway('CHAPA');
  }, [gatewayConfig, selectedGateway]);

  const initForCurrentTarget = useCallback(
    async (gw: 'CHAPA' | 'PAYO', idx: number, target: PaymentInitTarget) => {
      setInitializing(true);
      setErrorMsg(null);
      try {
        const res = await paymentApi.initialize({
          gateway: gw,
          transactionType: target.transactionType,
          referenceId: target.referenceId,
          returnUrl: typeof window !== 'undefined' ? window.location.origin : undefined,
          customerEmail: dbUser?.email || firebaseUser?.email || undefined,
          phoneNumber: dbUser?.phoneNumber || undefined,
        });
        const tx: PaymentTransactionRecord = res.data;
        setTxMap((prev) => ({ ...prev, [idx]: tx }));
        if (tx.status === 'PAID') {
          setPaidIds((prev) => ({ ...prev, [idx]: true }));
        }
      } catch (err: any) {
        const msg =
          err?.response?.data?.error ||
          err?.message ||
          'Could not initialize payment session.';
        setErrorMsg(msg);
      } finally {
        setInitializing(false);
      }
    },
    [dbUser?.email, dbUser?.phoneNumber, firebaseUser?.email]
  );

  useEffect(() => {
    if (!currentTarget) return;
    const existing = txMap[activeIdx];
    if (!existing || existing.gateway !== selectedGateway) {
      initForCurrentTarget(selectedGateway, activeIdx, currentTarget);
    }
  }, [activeIdx, selectedGateway, currentTarget, txMap, initForCurrentTarget]);

  useEffect(() => {
    if (!currentTx || currentTx.gateway !== 'PAYO' || currentTx.status !== 'AWAITING_RECEIPT') return;
    const timer = window.setInterval(async () => {
      try {
        const response = await paymentApi.verify(currentTx.txRef);
        const refreshed: PaymentTransactionRecord = response.data;
        setTxMap((prev) => ({ ...prev, [activeIdx]: refreshed }));
        if (refreshed.status === 'PAID') {
          const nextPaid = { ...paidIds, [activeIdx]: true };
          setPaidIds(nextPaid);
          onPaymentSettled(refreshed);
          const nextUnpaidIdx = targets.findIndex((_, i) => i !== activeIdx && !nextPaid[i]);
          if (nextUnpaidIdx >= 0) {
            setActiveIdx(nextUnpaidIdx);
            setSelectedGateway(targets[nextUnpaidIdx].gateway || 'CHAPA');
          } else {
            onNotify(`Payment verified by Payo (${refreshed.txRef}). Your booking is now confirmed.`);
            onClose();
          }
        }
      } catch {
        // Temporary polling failures do not change the payment state.
      }
    }, 5000);
    return () => window.clearInterval(timer);
  }, [currentTx?.txRef, currentTx?.gateway, currentTx?.status, activeIdx, paidIds, targets, onPaymentSettled, onNotify, onClose]);

  if (!currentTarget) return null;

  const handleCopy = (key: string, val?: string | null) => {
    if (!val || typeof navigator === 'undefined' || !navigator.clipboard) return;
    navigator.clipboard.writeText(val).then(() => {
      setCopiedKey(key);
      window.setTimeout(() => setCopiedKey(null), 1500);
    });
  };

  const handleAdvanceOrClose = (settledTx: PaymentTransactionRecord, nextPaidMap: Record<number, boolean>) => {
    onPaymentSettled(settledTx);
    const nextUnpaidIdx = targets.findIndex((_, i) => i !== activeIdx && !nextPaidMap[i]);
    if (nextUnpaidIdx >= 0) {
      setActiveIdx(nextUnpaidIdx);
      setSelectedGateway(targets[nextUnpaidIdx].gateway || selectedGateway);
      setPayoReceiptRef('');
      setPayoReceiptImage('');
      setPayoNotes('');
    } else {
      onNotify(
        `Payment verified via ${settledTx.gateway} (${settledTx.txRef}). The booking payment status has been updated.`
      );
      onClose();
    }
  };

  const handleVerifyChapa = async () => {
    if (!currentTx) return;
    setProcessing(true);
    setErrorMsg(null);
    try {
      const res = await paymentApi.verify(currentTx.txRef);
      const settled: PaymentTransactionRecord = res.data;
      setTxMap((prev) => ({ ...prev, [activeIdx]: settled }));
      const nextPaid = { ...paidIds, [activeIdx]: true };
      setPaidIds(nextPaid);
      handleAdvanceOrClose(settled, nextPaid);
    } catch (err: any) {
      setErrorMsg(err?.response?.data?.error || 'Chapa verification failed.');
    } finally {
      setProcessing(false);
    }
  };

  const handleConfirmPayo = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!currentTx) return;
    if (!payoReceiptRef.trim()) {
      setErrorMsg('Enter your Payo / bank transfer reference number (e.g., FT2411...) to verify.');
      return;
    }
    setProcessing(true);
    setErrorMsg(null);
    try {
      const res = await paymentApi.confirmPayo(currentTx.txRef, {
        receiptReference: payoReceiptRef.trim(),
        receiptImageUrl: payoReceiptImage || undefined,
        providerTransferConfirmed: providerLegChecked,
        commissionTransferConfirmed: commissionLegChecked,
        notes: payoNotes.trim() || undefined,
      });
      const settled: PaymentTransactionRecord = res.data;
      setTxMap((prev) => ({ ...prev, [activeIdx]: settled }));
      const nextPaid = { ...paidIds, [activeIdx]: true };
      setPaidIds(nextPaid);
      handleAdvanceOrClose(settled, nextPaid);
    } catch (err: any) {
      setErrorMsg(err?.response?.data?.error || 'Payo confirmation failed.');
    } finally {
      setProcessing(false);
    }
  };

  const handleUploadReceipt = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const dataUrl = await compressImageFile(file);
      setPayoReceiptImage(dataUrl);
    } catch {
      setErrorMsg('Could not read the selected receipt image.');
    }
  };

  const isAdminViewer = Boolean(dbUser?.isAdmin);
  const providerAcc = currentTx?.providerPayoutAccountSnapshot;
  const commissionAcc = isAdminViewer
    ? currentTx?.platformCommissionAccountSnapshot || gatewayConfig?.platformCommissionAccount
    : null;
  const chapaEnabled = gatewayConfig?.gateways?.chapa?.enabled !== false;
  const payoEnabled = gatewayConfig?.gateways?.payo?.enabled !== false;

  return (
    <div
      className="fixed inset-0 z-[70] flex items-center justify-center bg-[#172B3A]/60 p-3 sm:p-5 overflow-y-auto backdrop-blur-[2px]"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Chapa and Payo Payment Checkout"
        className="w-full max-w-2xl rounded-2xl border border-[#172B3A]/15 bg-white shadow-2xl my-auto overflow-hidden"
      >
        {/* Header */}
        <div className="flex items-start justify-between gap-3 border-b border-[#172B3A]/10 bg-[#172B3A] px-5 py-4 text-white">
          <div className="min-w-0">
            <div className="flex items-center gap-2 text-xs text-emerald-300 font-semibold">
              <ShieldCheck className="h-4 w-4 shrink-0" />
              Secure Booking Payment · Chapa &amp; Payo
            </div>
            <h2 className="mt-0.5 truncate font-display text-lg font-bold">
              {currentTarget.title}
            </h2>
            <p className="font-mono text-[11px] text-white/70">
              {currentTarget.transactionType} · {currentTarget.referenceCode} ·{' '}
              {formatEtb(currentTarget.amountEtb)}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close payment modal"
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-white/10 text-white hover:bg-white/20"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="max-h-[82vh] overflow-y-auto p-5 space-y-5">
          {/* Multi-vendor checkout switcher */}
          {targets.length > 1 && (
            <div className="space-y-1.5">
              <p className="text-[11px] font-semibold text-[#172B3A]/70">
                Vendor Settlements ({Object.keys(paidIds).filter((k) => paidIds[Number(k)]).length}/
                {targets.length} Completed)
              </p>
              <div className="flex flex-wrap gap-2">
                {targets.map((tg, idx) => {
                  const isPaid = Boolean(paidIds[idx]);
                  const active = idx === activeIdx;
                  return (
                    <button
                      key={`${tg.transactionType}-${tg.referenceId}`}
                      type="button"
                      onClick={() => {
                        setActiveIdx(idx);
                        setSelectedGateway(tg.gateway || selectedGateway);
                      }}
                      className={`inline-flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-semibold transition ${
                        active
                          ? 'border-[#176B52] bg-emerald-50 text-[#176B52]'
                          : isPaid
                            ? 'border-emerald-200 bg-emerald-50/50 text-[#176B52]/75'
                            : 'border-[#172B3A]/15 bg-white text-[#172B3A]/75'
                      }`}
                    >
                      {isPaid && <CheckCircle2 className="h-3.5 w-3.5 text-[#176B52]" />}
                      {tg.referenceCode} · {formatEtb(tg.amountEtb)}
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {/* Gateway Switcher */}
          <div className="grid grid-cols-2 gap-2.5">
            <button
              type="button"
              disabled={!chapaEnabled || initializing}
              onClick={() => setSelectedGateway('CHAPA')}
              className={`flex flex-col items-start rounded-xl border p-3 text-left transition ${
                selectedGateway === 'CHAPA'
                  ? 'border-[#176B52] bg-emerald-50/70 ring-1 ring-[#176B52]'
                  : 'border-[#172B3A]/15 bg-white hover:border-[#172B3A]/35'
              } disabled:opacity-45`}
            >
              <div className="flex w-full items-center justify-between">
                <span className="inline-flex items-center gap-1.5 text-xs font-bold text-[#172B3A]">
                  <CreditCard className="h-4 w-4 text-[#176B52]" />
                  Chapa Checkout
                </span>
                <span className="font-mono text-[10px] font-semibold text-[#176B52]">
                  {gatewayConfig?.gateways?.chapa?.mode || 'SANDBOX'}
                </span>
              </div>
              <p className="mt-1 text-[11px] text-[#172B3A]/65">
Hosted payment page with server-side transaction verification.
              </p>
            </button>

            <button
              type="button"
              disabled={!payoEnabled || initializing}
              onClick={() => setSelectedGateway('PAYO')}
              className={`flex flex-col items-start rounded-xl border p-3 text-left transition ${
                selectedGateway === 'PAYO'
                  ? 'border-[#176B52] bg-emerald-50/70 ring-1 ring-[#176B52]'
                  : 'border-[#172B3A]/15 bg-white hover:border-[#172B3A]/35'
              } disabled:opacity-45`}
            >
              <div className="flex w-full items-center justify-between">
                <span className="inline-flex items-center gap-1.5 text-xs font-bold text-[#172B3A]">
                  <Wallet className="h-4 w-4 text-[#176B52]" />
                  Payo Bank Transfer
                </span>
                <span className="font-mono text-[10px] font-semibold text-[#176B52]">
                  {gatewayConfig?.gateways?.payo?.mode || 'DIRECT'}
                </span>
              </div>
              <p className="mt-1 text-[11px] text-[#172B3A]/65">
Customer pays by bank transfer; Payo verifies the receipt and notifies Nearest You.
              </p>
            </button>
          </div>
          {!chapaEnabled && !payoEnabled && (
            <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs leading-5 text-amber-900">
              Online payments are not configured yet. Add your Chapa test credentials or Payo project API key to the backend environment, then restart the service.
            </div>
          )}

          {initializing ? (
            <div className="flex items-center justify-center gap-2 rounded-xl border border-[#172B3A]/10 bg-[#F4F6F5]/60 py-10 text-xs font-semibold text-[#172B3A]/70">
              <Loader2 className="h-4 w-4 animate-spin text-[#176B52]" />
              Preparing secure payment session...
            </div>
          ) : currentTx ? (
            <>
              {selectedGateway === 'CHAPA' && (
                <>
              {/* Chapa settlement breakdown */}
              <div className={`grid gap-3 ${isAdminViewer ? 'sm:grid-cols-2' : 'grid-cols-1'}`}>
                {/* Leg 1: Service Provider's Own Account */}
                <div className="rounded-xl border border-[#176B52]/25 bg-emerald-50/40 p-3.5 space-y-2">
                  <div className="flex items-center justify-between gap-2">
                    <span className="inline-flex items-center gap-1.5 text-[11px] font-bold text-[#176B52]">
                      <Building2 className="h-3.5 w-3.5" />
                      Service Provider Own Account
                    </span>
                    <span className="font-mono text-sm font-bold text-[#172B3A]">
                      {formatEtb(
                        isAdminViewer
                          ? Number(currentTx.providerAmount)
                          : Number(currentTx.grossAmount)
                      )}
                    </span>
                  </div>

                  <div className="space-y-1 text-[11px] text-[#172B3A]/80">
                    <p className="font-semibold text-[#172B3A]">
                      {providerAcc?.accountName || providerAcc?.ownerLabel || 'Service Provider'}
                    </p>
                    {providerAcc?.bankName && (
                      <p>
                        Bank: <span className="font-medium">{providerAcc.bankName}</span>
                      </p>
                    )}
                    {providerAcc?.accountNumber ? (
                      <div className="flex items-center justify-between gap-2 rounded bg-white/80 px-2 py-1 font-mono text-[11px]">
                        <span>Acct: {providerAcc.accountNumber}</span>
                        <button
                          type="button"
                          onClick={() => handleCopy('prov-acct', providerAcc.accountNumber)}
                          className="text-[#176B52] hover:underline"
                        >
                          {copiedKey === 'prov-acct' ? (
                            <Check className="h-3.5 w-3.5" />
                          ) : (
                            <Copy className="h-3.5 w-3.5" />
                          )}
                        </button>
                      </div>
                    ) : (
                      <p className="text-[11px] text-amber-800">
                        {providerAcc?.summaryLabel ||
                          'Provider payout account pending setup (escrow tracked).'}
                      </p>
                    )}
                    {providerAcc?.telebirrNumber && (
                      <div className="flex items-center justify-between gap-2 rounded bg-white/80 px-2 py-1 font-mono text-[11px]">
                        <span>Telebirr: {providerAcc.telebirrNumber}</span>
                        <button
                          type="button"
                          onClick={() => handleCopy('prov-tel', providerAcc.telebirrNumber)}
                          className="text-[#176B52]"
                        >
                          {copiedKey === 'prov-tel' ? (
                            <Check className="h-3.5 w-3.5" />
                          ) : (
                            <Copy className="h-3.5 w-3.5" />
                          )}
                        </button>
                      </div>
                    )}
                    {providerAcc?.payoAccountHandle && (
                      <p className="font-mono text-[10px] text-[#172B3A]/70">
                        Payo ID: {providerAcc.payoAccountHandle}
                      </p>
                    )}
                    {currentTx.chapaSubaccountId && (
                      <p className="font-mono text-[10px] text-[#176B52]">
                        Chapa Subaccount: {currentTx.chapaSubaccountId}
                      </p>
                    )}
                  </div>
                </div>

                {/* Leg 2: Single Platform Commission Account (Admin Only) */}
                {isAdminViewer && (
                  <div className="rounded-xl border border-[#172B3A]/15 bg-[#F4F6F5]/70 p-3.5 space-y-2">
                    <div className="flex items-center justify-between gap-2">
                      <span className="inline-flex items-center gap-1.5 text-[11px] font-bold text-[#172B3A]">
                        <Landmark className="h-3.5 w-3.5 text-[#C88A1E]" />
                        Platform Commission Account
                      </span>
                      <span className="font-mono text-sm font-bold text-[#172B3A]">
                        {formatEtb(Number(currentTx.commissionAmount))}
                      </span>
                    </div>

                    <div className="space-y-1 text-[11px] text-[#172B3A]/80">
                      <p className="font-semibold text-[#172B3A]">
                        {commissionAcc?.accountHolderName || 'Nearest You Platform Commission Pool'}
                      </p>
                      <p>
                        Bank:{' '}
                        <span className="font-medium">
                          {commissionAcc?.bankName || 'Commercial Bank of Ethiopia (CBE)'}
                        </span>
                      </p>
                      {commissionAcc?.accountNumber && (
                        <div className="flex items-center justify-between gap-2 rounded bg-white px-2 py-1 font-mono text-[11px]">
                          <span>Acct: {commissionAcc.accountNumber}</span>
                          <button
                            type="button"
                            onClick={() => handleCopy('plat-acct', commissionAcc.accountNumber)}
                            className="text-[#176B52]"
                          >
                            {copiedKey === 'plat-acct' ? (
                              <Check className="h-3.5 w-3.5" />
                            ) : (
                              <Copy className="h-3.5 w-3.5" />
                            )}
                          </button>
                        </div>
                      )}
                      {commissionAcc?.telebirrNumber && (
                        <div className="flex items-center justify-between gap-2 rounded bg-white px-2 py-1 font-mono text-[11px]">
                          <span>Telebirr: {commissionAcc.telebirrNumber}</span>
                          <button
                            type="button"
                            onClick={() => handleCopy('plat-tel', commissionAcc.telebirrNumber)}
                            className="text-[#176B52]"
                          >
                            {copiedKey === 'plat-tel' ? (
                              <Check className="h-3.5 w-3.5" />
                            ) : (
                              <Copy className="h-3.5 w-3.5" />
                            )}
                          </button>
                        </div>
                      )}
                      {commissionAcc?.payoAccountHandle && (
                        <p className="font-mono text-[10px] text-[#172B3A]/70">
                          Payo Pool Handle: {commissionAcc.payoAccountHandle}
                        </p>
                      )}
                    </div>
                  </div>
                )}
              </div>

                </>
              )}

              {/* CHAPA FLOW */}
              {selectedGateway === 'CHAPA' && (
                <div className="rounded-xl border border-[#172B3A]/15 bg-white p-4 space-y-3">
                  <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[#172B3A]/10 pb-2.5">
                    <div>
                      <h3 className="text-xs font-bold text-[#172B3A]">
                        Chapa Hosted Checkout ({currentTx.gatewayMode})
                      </h3>
                      <p className="font-mono text-[11px] text-[#172B3A]/60">
                        Ref: {currentTx.txRef} · Total {formatEtb(Number(currentTx.grossAmount))}
                      </p>
                    </div>
                    <span className="rounded-md bg-emerald-50 px-2 py-1 font-mono text-[10px] font-bold text-[#176B52]">
                      {currentTx.status}
                    </span>
                  </div>

                  {currentTx.gatewayCheckoutUrl ? (
                    <div className="space-y-3">
                      <p className="text-xs text-[#172B3A]/75">
                        Click below to complete your payment on Chapa&apos;s hosted checkout page
                        (Telebirr, CBE Birr, Awash, Abyssinia, or Card). Once done, return here and
                        click Verify.
                      </p>
                      <div className="flex flex-wrap gap-2">
                        <a
                          href={currentTx.gatewayCheckoutUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex min-h-[42px] items-center gap-1.5 rounded-lg bg-[#172B3A] px-4 py-2 text-xs font-semibold text-white hover:bg-[#176B52]"
                        >
                          <ExternalLink className="h-3.5 w-3.5" />
                          Proceed to Chapa Checkout
                        </a>
                        <button
                          type="button"
                          disabled={processing}
                          onClick={handleVerifyChapa}
                          className="inline-flex min-h-[42px] items-center gap-1.5 rounded-lg bg-[#176B52] px-4 py-2 text-xs font-semibold text-white hover:bg-[#125641] disabled:opacity-60"
                        >
                          {processing && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
                          Verify Chapa Payment
                        </button>
                      </div>
                    </div>
                  ) : (
                    <div className="space-y-3">
                      <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs leading-5 text-amber-900">
                        Chapa test credentials are not configured on this backend. Add a Chapa TEST secret key to enable the real hosted sandbox checkout. Nearest You will not simulate or mark a payment as successful without provider verification.
                      </div>
                      <button
                        type="button"
                        disabled={processing}
                        onClick={handleVerifyChapa}
                        className="w-full min-h-[44px] inline-flex items-center justify-center gap-2 rounded-lg bg-[#176B52] px-4 py-2.5 text-xs font-semibold text-white hover:bg-[#125641] disabled:opacity-60"
                      >
                        {processing && <Loader2 className="h-4 w-4 animate-spin" />}
                        {processing
                          ? 'Verifying Chapa Split...'
                          : `Authorize & Verify ${formatEtb(Number(currentTx.grossAmount))} via Chapa`}
                      </button>
                    </div>
                  )}
                </div>
              )}

              {/* PAYO FLOW */}
              {selectedGateway === 'PAYO' && (
                <div className="rounded-xl border border-[#172B3A]/15 bg-white p-4 space-y-3">
                  <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[#172B3A]/10 pb-2.5">
                    <div>
                      <h3 className="text-xs font-bold text-[#172B3A]">Payo Bank Transfer ({currentTx.gatewayMode})</h3>
                      <p className="font-mono text-[11px] text-[#172B3A]/60">
                        Ref: {currentTx.txRef} · Total {formatEtb(Number(currentTx.grossAmount))}
                      </p>
                    </div>
                    <span className={`rounded-full px-2.5 py-1 text-[10px] font-bold ${currentTx.status === 'PAID' ? 'bg-emerald-100 text-emerald-800' : 'bg-amber-100 text-amber-800'}`}>
                      {currentTx.status === 'PAID' ? 'PAID' : currentTx.status === 'FAILED' ? 'EXPIRED' : 'AWAITING VERIFICATION'}
                    </span>
                  </div>
                  <p className="text-xs leading-5 text-[#172B3A]/75">
                    Payo securely displays the bank account, transfer reference and receipt-upload form. Complete the transfer on the Payo page. Nearest You will confirm this booking only after Payo approves the receipt and sends a valid signed webhook.
                  </p>
                  {currentTx.gatewayCheckoutUrl ? (
                    <a href={currentTx.gatewayCheckoutUrl} target="_blank" rel="noopener noreferrer"
                      className="inline-flex w-full min-h-[44px] items-center justify-center gap-2 rounded-lg bg-[#172B3A] px-4 py-2.5 text-xs font-semibold text-white hover:bg-[#176B52]">
                      <ExternalLink className="h-4 w-4" /> Open secure Payo payment page
                    </a>
                  ) : (
                    <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs text-amber-900">
                      Payo has not returned a hosted payment link. Check that PAYO_API_KEY and the Payo project are configured on the backend.
                    </div>
                  )}
                  <div className="rounded-lg border border-[#176B52]/20 bg-emerald-50/50 p-3 text-xs text-[#172B3A]/80">
                    <strong>Automatic confirmation is enabled.</strong> This window checks the payment status every five seconds. Do not submit a receipt reference here as proof of payment.
                  </div>
                  <button type="button" onClick={async () => {
                    setProcessing(true);
                    try {
                      const response = await paymentApi.verify(currentTx.txRef);
                      const refreshed: PaymentTransactionRecord = response.data;
                      setTxMap((prev) => ({ ...prev, [activeIdx]: refreshed }));
                      if (refreshed.status === 'PAID') {
                        const nextPaid = { ...paidIds, [activeIdx]: true };
                        setPaidIds(nextPaid);
                        handleAdvanceOrClose(refreshed, nextPaid);
                      } else {
                        setErrorMsg('Payo has not approved this payment yet. This page will continue checking automatically.');
                      }
                    } catch (err: any) {
                      setErrorMsg(err?.response?.data?.error || 'Could not refresh Payo payment status.');
                    } finally {
                      setProcessing(false);
                    }
                  }} disabled={processing} className="w-full min-h-[42px] rounded-lg border border-[#176B52]/40 px-4 py-2 text-xs font-semibold text-[#176B52] disabled:opacity-60">
                    {processing ? 'Checking payment…' : 'Check payment status now'}
                  </button>
                </div>
              )}
            </>
          ) : null}

          {errorMsg && (
            <div className="rounded-xl border border-red-200 bg-red-50 px-3.5 py-2.5 text-xs text-red-800">
              {errorMsg}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
