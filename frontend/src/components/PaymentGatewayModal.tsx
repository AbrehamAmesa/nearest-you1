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
        `Payment verified via ${settledTx.gateway} (${settledTx.txRef}). Provider sales settled & platform commission collected.`
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

  const providerAcc = currentTx?.providerPayoutAccountSnapshot;
  const commissionAcc =
    currentTx?.platformCommissionAccountSnapshot || gatewayConfig?.platformCommissionAccount;
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
        aria-label="Chapa and Payo Split Payment Checkout"
        className="w-full max-w-2xl rounded-2xl border border-[#172B3A]/15 bg-white shadow-2xl my-auto overflow-hidden"
      >
        {/* Header */}
        <div className="flex items-start justify-between gap-3 border-b border-[#172B3A]/10 bg-[#172B3A] px-5 py-4 text-white">
          <div className="min-w-0">
            <div className="flex items-center gap-2 text-xs text-emerald-300 font-semibold">
              <ShieldCheck className="h-4 w-4 shrink-0" />
              Split Settlement Checkout · Chapa &amp; Payo
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
                  Chapa Split Pay
                </span>
                <span className="font-mono text-[10px] font-semibold text-[#176B52]">
                  {gatewayConfig?.gateways?.chapa?.mode || 'SANDBOX'}
                </span>
              </div>
              <p className="mt-1 text-[11px] text-[#172B3A]/65">
                Auto-splits subaccount net sales to provider &amp; commission to platform.
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
                  Payo Direct Transfer
                </span>
                <span className="font-mono text-[10px] font-semibold text-[#176B52]">
                  {gatewayConfig?.gateways?.payo?.mode || 'DIRECT'}
                </span>
              </div>
              <p className="mt-1 text-[11px] text-[#172B3A]/65">
                Settles sales directly to provider&apos;s own bank/Telebirr + commission leg.
              </p>
            </button>
          </div>

          {initializing ? (
            <div className="flex items-center justify-center gap-2 rounded-xl border border-[#172B3A]/10 bg-[#F4F6F5]/60 py-10 text-xs font-semibold text-[#172B3A]/70">
              <Loader2 className="h-4 w-4 animate-spin text-[#176B52]" />
              Preparing split routing between Provider Account &amp; Platform Commission Account...
            </div>
          ) : currentTx ? (
            <>
              {/* Dual-Account Split Breakdown */}
              <div className="grid gap-3 sm:grid-cols-2">
                {/* Leg 1: Service Provider's Own Account */}
                <div className="rounded-xl border border-[#176B52]/25 bg-emerald-50/40 p-3.5 space-y-2">
                  <div className="flex items-center justify-between gap-2">
                    <span className="inline-flex items-center gap-1.5 text-[11px] font-bold text-[#176B52]">
                      <Building2 className="h-3.5 w-3.5" />
                      Service Provider Own Account
                    </span>
                    <span className="font-mono text-sm font-bold text-[#172B3A]">
                      {formatEtb(Number(currentTx.providerAmount))}
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

                {/* Leg 2: Single Platform Commission Account */}
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
              </div>

              {/* CHAPA FLOW */}
              {selectedGateway === 'CHAPA' && (
                <div className="rounded-xl border border-[#172B3A]/15 bg-white p-4 space-y-3">
                  <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[#172B3A]/10 pb-2.5">
                    <div>
                      <h3 className="text-xs font-bold text-[#172B3A]">
                        Chapa Split Checkout ({currentTx.gatewayMode})
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
                      <p className="text-xs text-[#172B3A]/75">
                        Chapa Sandbox Split Checkout: choose your Ethiopian payment channel below to
                        simulate Chapa split authorization ({formatEtb(Number(currentTx.providerAmount))}{' '}
                        to provider subaccount, {formatEtb(Number(currentTx.commissionAmount))} to
                        platform commission account).
                      </p>
                      <div className="grid grid-cols-3 gap-2">
                        {[
                          { id: 'telebirr', label: 'Telebirr' },
                          { id: 'cbebirr', label: 'CBE Birr / Bank' },
                          { id: 'card', label: 'Ethiopian Card' },
                        ].map((rail) => (
                          <button
                            key={rail.id}
                            type="button"
                            onClick={() => setChapaRail(rail.id as typeof chapaRail)}
                            className={`min-h-[38px] rounded-lg border px-2 py-1.5 text-xs font-semibold ${
                              chapaRail === rail.id
                                ? 'border-[#176B52] bg-emerald-50 text-[#176B52]'
                                : 'border-[#172B3A]/15 bg-[#F4F6F5]/50 text-[#172B3A]/75'
                            }`}
                          >
                            {rail.label}
                          </button>
                        ))}
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
                <form
                  onSubmit={handleConfirmPayo}
                  className="rounded-xl border border-[#172B3A]/15 bg-white p-4 space-y-3"
                >
                  <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[#172B3A]/10 pb-2.5">
                    <div>
                      <h3 className="text-xs font-bold text-[#172B3A]">
                        Payo Dual-Account Direct Settlement ({currentTx.gatewayMode})
                      </h3>
                      <p className="font-mono text-[11px] text-[#172B3A]/60">
                        Ref: {currentTx.txRef} · Total {formatEtb(Number(currentTx.grossAmount))}
                      </p>
                    </div>
                    {currentTx.gatewayCheckoutUrl && (
                      <a
                        href={currentTx.gatewayCheckoutUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1 rounded-lg bg-[#172B3A] px-3 py-1.5 text-[11px] font-semibold text-white hover:bg-[#176B52]"
                      >
                        <ExternalLink className="h-3 w-3" />
                        Open Payo Hosted Link
                      </a>
                    )}
                  </div>

                  <div className="space-y-2 text-xs text-[#172B3A]/80">
                    <label className="flex items-start gap-2 rounded-lg border border-[#172B3A]/10 bg-[#F4F6F5]/50 p-2.5">
                      <input
                        type="checkbox"
                        checked={providerLegChecked}
                        onChange={(e) => setProviderLegChecked(e.target.checked)}
                        className="mt-0.5 accent-[#176B52]"
                      />
                      <span>
                        <strong>Leg 1 (Provider Sales):</strong> Transfer{' '}
                        <span className="font-mono font-bold">
                          {formatEtb(Number(currentTx.providerAmount))}
                        </span>{' '}
                        directly to{' '}
                        <span className="font-semibold">
                          {providerAcc?.summaryLabel || 'Service Provider Account'}
                        </span>
                      </span>
                    </label>
                    <label className="flex items-start gap-2 rounded-lg border border-[#172B3A]/10 bg-[#F4F6F5]/50 p-2.5">
                      <input
                        type="checkbox"
                        checked={commissionLegChecked}
                        onChange={(e) => setCommissionLegChecked(e.target.checked)}
                        className="mt-0.5 accent-[#176B52]"
                      />
                      <span>
                        <strong>Leg 2 (Platform Commission):</strong> Transfer{' '}
                        <span className="font-mono font-bold">
                          {formatEtb(Number(currentTx.commissionAmount))}
                        </span>{' '}
                        to Single Platform Account ({commissionAcc?.bankName || 'CBE'} ·{' '}
                        {commissionAcc?.accountNumber || '1000458921403'})
                      </span>
                    </label>
                  </div>

                  <div className="grid gap-3 sm:grid-cols-2">
                    <div>
                      <label className="block text-[11px] font-semibold text-[#172B3A]/75">
                        Payo / Bank Receipt Reference *
                      </label>
                      <input
                        required
                        type="text"
                        value={payoReceiptRef}
                        onChange={(e) => setPayoReceiptRef(e.target.value)}
                        placeholder="e.g., FT2411209876 or PAYO-88421"
                        className="mt-1 h-10 w-full rounded-lg border border-[#172B3A]/15 px-3 font-mono text-xs focus:border-[#176B52] focus:outline-none"
                      />
                    </div>
                    <div>
                      <label className="block text-[11px] font-semibold text-[#172B3A]/75">
                        Upload Receipt Screenshot (Optional)
                      </label>
                      <label className="mt-1 flex h-10 cursor-pointer items-center justify-center gap-1.5 rounded-lg border border-dashed border-[#176B52]/40 bg-emerald-50/40 px-3 text-xs font-semibold text-[#176B52] hover:bg-emerald-50">
                        <Upload className="h-3.5 w-3.5" />
                        {payoReceiptImage ? 'Receipt Attached' : 'Attach Receipt Image'}
                        <input
                          type="file"
                          accept="image/*"
                          onChange={handleUploadReceipt}
                          className="hidden"
                        />
                      </label>
                    </div>
                  </div>

                  <div>
                    <input
                      type="text"
                      value={payoNotes}
                      onChange={(e) => setPayoNotes(e.target.value)}
                      placeholder="Optional transfer note (e.g., CBE Mobile + Telebirr ref)"
                      className="h-9 w-full rounded-lg border border-[#172B3A]/15 px-3 text-xs focus:border-[#176B52] focus:outline-none"
                    />
                  </div>

                  <button
                    type="submit"
                    disabled={processing}
                    className="w-full min-h-[44px] inline-flex items-center justify-center gap-2 rounded-lg bg-[#176B52] px-4 py-2.5 text-xs font-semibold text-white hover:bg-[#125641] disabled:opacity-60"
                  >
                    {processing && <Loader2 className="h-4 w-4 animate-spin" />}
                    {processing
                      ? 'Confirming Payo Settlement...'
                      : `Confirm Payo Split Payment (${formatEtb(Number(currentTx.grossAmount))})`}
                  </button>
                </form>
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
