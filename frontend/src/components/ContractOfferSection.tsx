import React, { useCallback, useEffect, useState } from 'react';
import { CheckCircle2, ChevronDown, ChevronUp, FileText, RefreshCw, XCircle } from 'lucide-react';
import { engagementApi } from '../api/index.ts';
import { useAuth } from '../context/AuthContext.tsx';
import type { ServiceContractRecord } from '../types/nearestyou.ts';
import { formatEtb } from '../utils/geo.ts';

interface ContractOfferSectionProps {
  threadKey?: string | null;
  businessId?: number | null;
  listingId?: number | null;
  bookingId?: number | null;
  recipientUid?: string | null;
  defaultContractType?: string;
  defaultTitle?: string;
  defaultAmount?: number;
  isOwner?: boolean;
  compact?: boolean;
  refreshSignal?: number;
  onContractChanged?: (contract: ServiceContractRecord) => void;
}

const CONTRACT_TYPE_OPTIONS = [
  { value: 'ONE_TIME_CONTRACT', label: 'One-Time Contract' },
  { value: 'PER_HOUR', label: 'Per Hour Rate' },
  { value: 'FULL_TIME', label: 'Full-Time Engagement' },
  { value: 'PER_DAY', label: 'Per Day Rate' },
  { value: 'PER_MONTH', label: 'Monthly Retainer' },
];

const PAYMENT_SCHEDULE_OPTIONS = [
  { value: 'ON_COMPLETION', label: 'On Completion' },
  { value: 'MILESTONE', label: 'Milestone Based' },
  { value: 'UPFRONT_ESCROW', label: 'Upfront Escrow' },
  { value: 'WEEKLY', label: 'Weekly Payout' },
  { value: 'MONTHLY', label: 'Monthly Payout' },
];

function normalizeDefaultContractType(raw?: string): string {
  const upper = (raw || '').toUpperCase();
  if (upper.includes('HOUR')) return 'PER_HOUR';
  if (upper.includes('FULL')) return 'FULL_TIME';
  if (upper.includes('DAY')) return 'PER_DAY';
  if (upper.includes('MONTH')) return 'PER_MONTH';
  return 'ONE_TIME_CONTRACT';
}

function formatContractTypeLabel(code: string): string {
  return (
    CONTRACT_TYPE_OPTIONS.find((o) => o.value === code)?.label ||
    code.replace(/_/g, ' ')
  );
}

function formatPaymentScheduleLabel(code: string): string {
  return (
    PAYMENT_SCHEDULE_OPTIONS.find((o) => o.value === code)?.label ||
    code.replace(/_/g, ' ')
  );
}

function statusTextTone(status: string): string {
  switch (status) {
    case 'ACCEPTED':
    case 'ACTIVE':
    case 'COMPLETED':
      return 'text-[#176B52]';
    case 'COUNTERED':
    case 'OFFERED':
      return 'text-amber-700';
    case 'DECLINED':
    case 'CANCELLED':
      return 'text-red-700';
    default:
      return 'text-[#172B3A]';
  }
}

export const ContractOfferSection: React.FC<ContractOfferSectionProps> = ({
  threadKey,
  businessId,
  listingId,
  bookingId,
  recipientUid,
  defaultContractType,
  defaultTitle,
  defaultAmount,
  isOwner = false,
  compact = false,
  refreshSignal = 0,
  onContractChanged,
}) => {
  const { dbUser, firebaseUser, openAuthModal } = useAuth();
  const currentUid = dbUser?.uid || firebaseUser?.uid || null;

  const [contracts, setContracts] = useState<ServiceContractRecord[]>([]);
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  // Proposal form state
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [contractType, setContractType] = useState(() =>
    normalizeDefaultContractType(defaultContractType)
  );
  const [title, setTitle] = useState(defaultTitle || 'Service Agreement');
  const [scopeSummary, setScopeSummary] = useState('');
  const [deliverables, setDeliverables] = useState('');
  const [paymentSchedule, setPaymentSchedule] = useState('ON_COMPLETION');
  const [agreedAmount, setAgreedAmount] = useState(
    defaultAmount && defaultAmount > 0 ? String(Math.round(defaultAmount)) : ''
  );
  const [hourlyRate, setHourlyRate] = useState(
    defaultAmount && defaultAmount > 0 ? String(Math.round(defaultAmount)) : ''
  );
  const [estimatedHours, setEstimatedHours] = useState('8');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [submitting, setSubmitting] = useState(false);

  // Per-contract action & counter state
  const [actingId, setActingId] = useState<number | null>(null);
  const [counterOpenId, setCounterOpenId] = useState<number | null>(null);
  const [counterAmount, setCounterAmount] = useState('');
  const [counterSchedule, setCounterSchedule] = useState('');
  const [counterDeliverables, setCounterDeliverables] = useState('');
  const [counterNotes, setCounterNotes] = useState('');

  useEffect(() => {
    setContractType(normalizeDefaultContractType(defaultContractType));
  }, [defaultContractType]);

  useEffect(() => {
    if (defaultTitle) {
      setTitle(defaultTitle);
    }
  }, [defaultTitle]);

  useEffect(() => {
    if (defaultAmount && defaultAmount > 0) {
      setAgreedAmount((prev) => (prev ? prev : String(Math.round(defaultAmount))));
      setHourlyRate((prev) => (prev ? prev : String(Math.round(defaultAmount))));
    }
  }, [defaultAmount]);

  useEffect(() => {
    if (contractType === 'PER_HOUR') {
      const rate = Number(hourlyRate);
      const hrs = Number(estimatedHours);
      if (Number.isFinite(rate) && rate > 0 && Number.isFinite(hrs) && hrs > 0) {
        setAgreedAmount(String(Math.round(rate * hrs)));
      }
    }
  }, [contractType, hourlyRate, estimatedHours]);

  const loadContracts = useCallback(async () => {
    if (!dbUser) {
      setContracts([]);
      return;
    }
    if (!threadKey && !listingId) {
      setContracts([]);
      return;
    }
    setLoading(true);
    try {
      const params: { threadKey?: string; listingId?: number } = {};
      if (threadKey) params.threadKey = threadKey;
      if (!threadKey && listingId) params.listingId = listingId;
      const res = await engagementApi.getContracts(params);
      setContracts(Array.isArray(res.data?.contracts) ? res.data.contracts : []);
    } catch {
      // Silently preserve existing state if transient error
    } finally {
      setLoading(false);
    }
  }, [dbUser, threadKey, listingId]);

  useEffect(() => {
    loadContracts();
  }, [loadContracts, refreshSignal]);

  const canCreateOffer = Boolean(
    dbUser && (!isOwner || recipientUid || (threadKey && threadKey.startsWith('contact:')))
  );

  const handleCreateOffer = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!dbUser) {
      openAuthModal('signin');
      return;
    }
    setErrorMsg(null);
    setSuccessMsg(null);

    const parsedAmount = Number(agreedAmount);
    if (!title.trim() || !scopeSummary.trim()) {
      setErrorMsg('Please provide a contract title and clear scope summary.');
      return;
    }
    if (!Number.isFinite(parsedAmount) || parsedAmount <= 0) {
      setErrorMsg('Contract agreed amount must be greater than 0 ETB.');
      return;
    }

    setSubmitting(true);
    try {
      const payload: Record<string, unknown> = {
        contractType,
        title: title.trim(),
        scopeSummary: scopeSummary.trim(),
        deliverables: deliverables.trim() || null,
        paymentSchedule,
        agreedAmount: parsedAmount,
        startDate: startDate || null,
        endDate: endDate || null,
      };
      if (threadKey) payload.threadKey = threadKey;
      if (businessId) payload.businessId = businessId;
      if (listingId) payload.listingId = listingId;
      if (bookingId) payload.bookingId = bookingId;
      if (recipientUid) payload.recipientUid = recipientUid;
      if (contractType === 'PER_HOUR') {
        const rate = Number(hourlyRate);
        const hrs = Number(estimatedHours);
        if (Number.isFinite(rate) && rate > 0) payload.hourlyRate = rate;
        if (Number.isFinite(hrs) && hrs > 0) payload.estimatedHours = Math.round(hrs);
      }

      const res = await engagementApi.createContract(payload);
      const created = res.data?.contract as ServiceContractRecord | undefined;
      if (created) {
        setContracts((prev) => [created, ...prev.filter((c) => c.id !== created.id)]);
        onContractChanged?.(created);
      } else {
        await loadContracts();
      }
      setScopeSummary('');
      setDeliverables('');
      setShowCreateForm(false);
      setSuccessMsg('Contract offer submitted and posted to the conversation timeline.');
    } catch (err: unknown) {
      const msg =
        (err as { response?: { data?: { error?: string } } })?.response?.data?.error ||
        (err instanceof Error ? err.message : 'Could not submit contract offer.');
      setErrorMsg(msg);
    } finally {
      setSubmitting(false);
    }
  };

  const handleRespond = async (
    contract: ServiceContractRecord,
    action: 'ACCEPT' | 'COUNTER' | 'DECLINE' | 'CANCEL' | 'START' | 'COMPLETE'
  ) => {
    setErrorMsg(null);
    setSuccessMsg(null);

    const payload: Record<string, unknown> = { action };
    if (action === 'COUNTER') {
      const parsed = Number(counterAmount);
      if (!Number.isFinite(parsed) || parsed <= 0) {
        setErrorMsg('Counter-offer amount must be greater than 0 ETB.');
        return;
      }
      payload.counterAmount = parsed;
      if (counterSchedule) payload.nextPaymentSchedule = counterSchedule;
      if (counterDeliverables.trim()) payload.deliverables = counterDeliverables.trim();
      if (counterNotes.trim()) payload.counterNotes = counterNotes.trim();
    }

    setActingId(contract.id);
    try {
      const res = await engagementApi.respondContract(contract.id, payload);
      const updated = res.data?.contract as ServiceContractRecord | undefined;
      if (updated) {
        setContracts((prev) => prev.map((c) => (c.id === updated.id ? updated : c)));
        onContractChanged?.(updated);
      } else {
        await loadContracts();
      }
      setCounterOpenId(null);
      setCounterNotes('');
      setCounterDeliverables('');
      const actionVerb =
        action === 'ACCEPT'
          ? 'accepted'
          : action === 'COUNTER'
            ? 'countered'
            : action === 'DECLINE'
              ? 'declined'
              : action === 'CANCEL'
                ? 'withdrawn'
                : action === 'START'
                  ? 'started'
                  : 'marked completed';
      setSuccessMsg(`Contract ${contract.contractReference} ${actionVerb}.`);
    } catch (err: unknown) {
      const msg =
        (err as { response?: { data?: { error?: string } } })?.response?.data?.error ||
        (err instanceof Error ? err.message : 'Unable to update contract status.');
      setErrorMsg(msg);
    } finally {
      setActingId(null);
    }
  };

  if (!dbUser) {
    return (
      <div className="rounded-xl border border-[#172B3A]/10 bg-[#F4F6F5] p-4 text-center">
        <FileText className="mx-auto mb-1.5 h-6 w-6 text-[#176B52]" />
        <p className="text-xs font-semibold text-[#172B3A]">Sign in to propose or manage contracts</p>
        <button
          type="button"
          onClick={() => openAuthModal('signin')}
          className="mt-2.5 rounded-lg bg-[#176B52] px-3.5 py-1.5 text-xs font-semibold text-white hover:bg-[#125641]"
        >
          Sign In
        </button>
      </div>
    );
  }

  return (
    <div className="w-full min-w-0 space-y-3 rounded-xl border border-[#172B3A]/12 bg-white p-3.5 sm:p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="min-w-0">
          <div className="flex items-center gap-1.5">
            <FileText className="h-4 w-4 shrink-0 text-[#176B52]" />
            <h4 className="text-xs font-bold text-[#172B3A] sm:text-sm">
              Service Contracts & Terms
            </h4>
          </div>
          <p className="text-[11px] text-[#172B3A]/60">
            Propose formal terms, counter-offer, accept, and track delivery milestones
          </p>
        </div>

        <div className="flex shrink-0 items-center gap-1.5">
          <button
            type="button"
            onClick={loadContracts}
            disabled={loading}
            aria-label="Refresh contracts"
            className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-[#172B3A]/15 text-[#172B3A]/70 hover:bg-[#F4F6F5] disabled:opacity-50"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} />
          </button>

          {canCreateOffer && (
            <button
              type="button"
              onClick={() => setShowCreateForm((v) => !v)}
              className="inline-flex items-center gap-1 whitespace-nowrap rounded-lg bg-[#176B52] px-3 py-1.5 text-xs font-semibold text-white hover:bg-[#125641]"
            >
              <span>{showCreateForm ? 'Close Form' : 'Propose Contract'}</span>
              {showCreateForm ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
            </button>
          )}
        </div>
      </div>

      {isOwner && !canCreateOffer && (
        <p className="text-[11px] text-[#172B3A]/65">
          To propose a contract offer to a client, open any client inquiry in your Messages inbox or Bookings list.
        </p>
      )}

      {errorMsg && (
        <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">
          {errorMsg}
        </div>
      )}
      {successMsg && (
        <div className="rounded-lg border border-[#176B52]/25 bg-[#176B52]/8 px-3 py-2 text-xs font-medium text-[#176B52]">
          {successMsg}
        </div>
      )}

      {showCreateForm && canCreateOffer && (
        <form
          onSubmit={handleCreateOffer}
          className="space-y-3 rounded-lg border border-[#172B3A]/15 bg-[#F4F6F5]/60 p-3 sm:p-4"
        >
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <label className="block text-[11px] font-semibold text-[#172B3A]/75">
                Contract Delivering Type
              </label>
              <select
                value={contractType}
                onChange={(e) => setContractType(e.target.value)}
                className="mt-1 w-full rounded-lg border border-[#172B3A]/15 bg-white px-2.5 py-2 text-xs text-[#172B3A]"
              >
                {CONTRACT_TYPE_OPTIONS.map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    {opt.label}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-[11px] font-semibold text-[#172B3A]/75">
                Payment Schedule
              </label>
              <select
                value={paymentSchedule}
                onChange={(e) => setPaymentSchedule(e.target.value)}
                className="mt-1 w-full rounded-lg border border-[#172B3A]/15 bg-white px-2.5 py-2 text-xs text-[#172B3A]"
              >
                {PAYMENT_SCHEDULE_OPTIONS.map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    {opt.label}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div>
            <label className="block text-[11px] font-semibold text-[#172B3A]/75">
              Contract Title
            </label>
            <input
              type="text"
              required
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="e.g., Full Bathroom Plumbing Repair & Pipe Replacement"
              className="mt-1 w-full rounded-lg border border-[#172B3A]/15 bg-white px-3 py-2 text-xs text-[#172B3A]"
            />
          </div>

          {contractType === 'PER_HOUR' ? (
            <div className="grid gap-3 sm:grid-cols-3">
              <div>
                <label className="block text-[11px] font-semibold text-[#172B3A]/75">
                  Hourly Rate (ETB)
                </label>
                <input
                  type="number"
                  min={1}
                  required
                  value={hourlyRate}
                  onChange={(e) => setHourlyRate(e.target.value)}
                  className="mt-1 w-full rounded-lg border border-[#172B3A]/15 bg-white px-2.5 py-2 font-mono text-xs tabular-nums text-[#172B3A]"
                />
              </div>
              <div>
                <label className="block text-[11px] font-semibold text-[#172B3A]/75">
                  Estimated Hours
                </label>
                <input
                  type="number"
                  min={1}
                  required
                  value={estimatedHours}
                  onChange={(e) => setEstimatedHours(e.target.value)}
                  className="mt-1 w-full rounded-lg border border-[#172B3A]/15 bg-white px-2.5 py-2 font-mono text-xs tabular-nums text-[#172B3A]"
                />
              </div>
              <div>
                <label className="block text-[11px] font-semibold text-[#172B3A]/75">
                  Total Agreed (ETB)
                </label>
                <input
                  type="number"
                  min={1}
                  required
                  value={agreedAmount}
                  onChange={(e) => setAgreedAmount(e.target.value)}
                  className="mt-1 w-full rounded-lg border border-[#172B3A]/15 bg-white px-2.5 py-2 font-mono text-xs font-semibold tabular-nums text-[#176B52]"
                />
              </div>
            </div>
          ) : (
            <div>
              <label className="block text-[11px] font-semibold text-[#172B3A]/75">
                Agreed Contract Amount (ETB)
              </label>
              <input
                type="number"
                min={1}
                required
                value={agreedAmount}
                onChange={(e) => setAgreedAmount(e.target.value)}
                placeholder="e.g., 3500"
                className="mt-1 w-full rounded-lg border border-[#172B3A]/15 bg-white px-3 py-2 font-mono text-xs font-semibold tabular-nums text-[#172B3A]"
              />
            </div>
          )}

          <div>
            <label className="block text-[11px] font-semibold text-[#172B3A]/75">
              Scope of Work & Terms
            </label>
            <textarea
              required
              rows={compact ? 2 : 3}
              value={scopeSummary}
              onChange={(e) => setScopeSummary(e.target.value)}
              placeholder="Describe tasks covered, materials included/excluded, quality expectations..."
              className="mt-1 w-full rounded-lg border border-[#172B3A]/15 bg-white px-3 py-2 text-xs text-[#172B3A]"
            />
          </div>

          <div>
            <label className="block text-[11px] font-semibold text-[#172B3A]/75">
              Deliverables / Milestones (optional)
            </label>
            <input
              type="text"
              value={deliverables}
              onChange={(e) => setDeliverables(e.target.value)}
              placeholder="e.g., Inspection report, installation complete, 7-day workmanship check"
              className="mt-1 w-full rounded-lg border border-[#172B3A]/15 bg-white px-3 py-2 text-xs text-[#172B3A]"
            />
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <label className="block text-[11px] font-semibold text-[#172B3A]/75">
                Start Date (optional)
              </label>
              <input
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                className="mt-1 w-full rounded-lg border border-[#172B3A]/15 bg-white px-2.5 py-2 text-xs text-[#172B3A]"
              />
            </div>
            <div>
              <label className="block text-[11px] font-semibold text-[#172B3A]/75">
                Target End Date (optional)
              </label>
              <input
                type="date"
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
                className="mt-1 w-full rounded-lg border border-[#172B3A]/15 bg-white px-2.5 py-2 text-xs text-[#172B3A]"
              />
            </div>
          </div>

          <div className="flex flex-wrap justify-end gap-2 pt-1">
            <button
              type="button"
              onClick={() => setShowCreateForm(false)}
              className="rounded-lg border border-[#172B3A]/15 bg-white px-3 py-1.5 text-xs font-semibold text-[#172B3A]/75 hover:bg-[#F4F6F5]"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={submitting}
              className="rounded-lg bg-[#176B52] px-4 py-1.5 text-xs font-semibold text-white hover:bg-[#125641] disabled:opacity-50"
            >
              {submitting ? 'Sending Offer...' : 'Send Contract Offer'}
            </button>
          </div>
        </form>
      )}

      {/* Existing Contracts List */}
      {loading && contracts.length === 0 ? (
        <p className="py-2 text-xs text-[#172B3A]/55">Loading contract history...</p>
      ) : contracts.length === 0 ? (
        <p className="text-xs text-[#172B3A]/60">
          No formal contract offers on this service yet. Propose one above to lock scope, schedule, and ETB terms.
        </p>
      ) : (
        <div className="space-y-2.5">
          {contracts.map((c) => {
            const isPendingTurn = c.status === 'OFFERED' || c.status === 'COUNTERED';
            const isOfferor = Boolean(currentUid && c.offeredByUid === currentUid);
            const isCounterparty = Boolean(
              currentUid &&
                !isOfferor &&
                (currentUid === c.clientUid || currentUid === c.serviceGiverUid)
            );
            const busy = actingId === c.id;
            const counterFormOpen = counterOpenId === c.id;

            return (
              <div
                key={c.id}
                className="space-y-2 rounded-lg border border-[#172B3A]/12 bg-[#F4F6F5]/40 p-3"
              >
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="text-xs font-bold text-[#172B3A]">{c.title}</p>
                    <p className="mt-0.5 text-[11px] text-[#172B3A]/65">
                      <span className="font-mono">{c.contractReference}</span> ·{' '}
                      <span className={`font-semibold ${statusTextTone(c.status)}`}>
                        {c.status}
                      </span>{' '}
                      · {formatContractTypeLabel(c.contractType)} ·{' '}
                      {formatPaymentScheduleLabel(c.paymentSchedule)}
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="font-mono text-sm font-bold tabular-nums text-[#176B52]">
                      {formatEtb(c.agreedAmount)}
                    </p>
                    {c.contractType === 'PER_HOUR' && c.hourlyRate && c.estimatedHours && (
                      <p className="font-mono text-[10px] tabular-nums text-[#172B3A]/60">
                        {formatEtb(c.hourlyRate)}/hr × {c.estimatedHours} hrs
                      </p>
                    )}
                  </div>
                </div>

                <p className="text-[11px] text-[#172B3A]/75">
                  Service Giver: <strong className="font-semibold">{c.serviceGiverName}</strong> · Client:{' '}
                  <strong className="font-semibold">{c.clientName}</strong>
                </p>

                <p className="text-xs leading-relaxed text-[#172B3A]/85">{c.scopeSummary}</p>

                {c.deliverables && (
                  <p className="text-[11px] text-[#172B3A]/70">
                    Deliverables: {c.deliverables}
                  </p>
                )}

                {(c.startDate || c.endDate) && (
                  <p className="font-mono text-[11px] tabular-nums text-[#172B3A]/60">
                    Timeline: {c.startDate || 'TBD'} → {c.endDate || 'Open'}
                  </p>
                )}

                {c.counterNotes && (
                  <p className="rounded bg-white px-2.5 py-1.5 text-[11px] text-[#172B3A]/80 border border-[#172B3A]/10">
                    Note: {c.counterNotes}
                  </p>
                )}

                {/* Turn-based workflow controls */}
                {isPendingTurn && isOfferor && (
                  <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
                    <span className="text-[11px] font-medium text-amber-700">
                      Offer sent · Awaiting response from counterparty
                    </span>
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => handleRespond(c, 'CANCEL')}
                      className="rounded-lg border border-red-200 bg-white px-2.5 py-1 text-[11px] font-semibold text-red-700 hover:bg-red-50 disabled:opacity-50"
                    >
                      {busy ? 'Working...' : 'Withdraw Offer'}
                    </button>
                  </div>
                )}

                {isPendingTurn && isCounterparty && (
                  <div className="space-y-2 pt-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <button
                        type="button"
                        disabled={busy}
                        onClick={() => handleRespond(c, 'ACCEPT')}
                        className="inline-flex items-center gap-1 rounded-lg bg-[#176B52] px-3 py-1.5 text-xs font-semibold text-white hover:bg-[#125641] disabled:opacity-50"
                      >
                        <CheckCircle2 className="h-3.5 w-3.5" />
                        <span>{busy ? 'Processing...' : 'Accept Contract'}</span>
                      </button>
                      <button
                        type="button"
                        disabled={busy}
                        onClick={() => {
                          if (counterFormOpen) {
                            setCounterOpenId(null);
                          } else {
                            setCounterOpenId(c.id);
                            setCounterAmount(String(c.agreedAmount));
                            setCounterSchedule(c.paymentSchedule);
                            setCounterDeliverables(c.deliverables || '');
                            setCounterNotes('');
                          }
                        }}
                        className="rounded-lg border border-[#172B3A]/20 bg-white px-3 py-1.5 text-xs font-semibold text-[#172B3A] hover:bg-[#F4F6F5] disabled:opacity-50"
                      >
                        {counterFormOpen ? 'Close Counter' : 'Counter Offer'}
                      </button>
                      <button
                        type="button"
                        disabled={busy}
                        onClick={() => handleRespond(c, 'DECLINE')}
                        className="inline-flex items-center gap-1 rounded-lg border border-red-200 bg-white px-3 py-1.5 text-xs font-semibold text-red-700 hover:bg-red-50 disabled:opacity-50"
                      >
                        <XCircle className="h-3.5 w-3.5" />
                        <span>Decline</span>
                      </button>
                    </div>

                    {counterFormOpen && (
                      <div className="space-y-2 rounded-lg border border-[#172B3A]/15 bg-white p-3">
                        <div className="grid gap-2 sm:grid-cols-2">
                          <div>
                            <label className="block text-[11px] font-semibold text-[#172B3A]/75">
                              Counter Amount (ETB)
                            </label>
                            <input
                              type="number"
                              min={1}
                              value={counterAmount}
                              onChange={(e) => setCounterAmount(e.target.value)}
                              className="mt-1 w-full rounded-lg border border-[#172B3A]/15 px-2.5 py-1.5 font-mono text-xs tabular-nums"
                            />
                          </div>
                          <div>
                            <label className="block text-[11px] font-semibold text-[#172B3A]/75">
                              Payment Schedule
                            </label>
                            <select
                              value={counterSchedule}
                              onChange={(e) => setCounterSchedule(e.target.value)}
                              className="mt-1 w-full rounded-lg border border-[#172B3A]/15 px-2.5 py-1.5 text-xs"
                            >
                              {PAYMENT_SCHEDULE_OPTIONS.map((opt) => (
                                <option key={opt.value} value={opt.value}>
                                  {opt.label}
                                </option>
                              ))}
                            </select>
                          </div>
                        </div>
                        <div>
                          <label className="block text-[11px] font-semibold text-[#172B3A]/75">
                            Updated Deliverables (optional)
                          </label>
                          <input
                            type="text"
                            value={counterDeliverables}
                            onChange={(e) => setCounterDeliverables(e.target.value)}
                            className="mt-1 w-full rounded-lg border border-[#172B3A]/15 px-2.5 py-1.5 text-xs"
                          />
                        </div>
                        <div>
                          <label className="block text-[11px] font-semibold text-[#172B3A]/75">
                            Counter-Offer Reason / Note
                          </label>
                          <input
                            type="text"
                            value={counterNotes}
                            onChange={(e) => setCounterNotes(e.target.value)}
                            placeholder="Explain proposed rate or terms adjustment..."
                            className="mt-1 w-full rounded-lg border border-[#172B3A]/15 px-2.5 py-1.5 text-xs"
                          />
                        </div>
                        <div className="flex justify-end gap-2">
                          <button
                            type="button"
                            onClick={() => setCounterOpenId(null)}
                            className="rounded-lg border border-[#172B3A]/15 px-3 py-1 text-xs font-semibold text-[#172B3A]/70"
                          >
                            Cancel
                          </button>
                          <button
                            type="button"
                            disabled={busy}
                            onClick={() => handleRespond(c, 'COUNTER')}
                            className="rounded-lg bg-[#176B52] px-3 py-1 text-xs font-semibold text-white hover:bg-[#125641] disabled:opacity-50"
                          >
                            {busy ? 'Sending...' : 'Send Counter-Offer'}
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                )}

                {c.status === 'ACCEPTED' && (
                  <div className="flex flex-wrap items-center gap-2 pt-1">
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => handleRespond(c, 'START')}
                      className="rounded-lg bg-[#172B3A] px-3 py-1.5 text-xs font-semibold text-white hover:bg-[#172B3A]/90 disabled:opacity-50"
                    >
                      Start Work
                    </button>
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => handleRespond(c, 'COMPLETE')}
                      className="rounded-lg bg-[#176B52] px-3 py-1.5 text-xs font-semibold text-white hover:bg-[#125641] disabled:opacity-50"
                    >
                      Mark Completed
                    </button>
                  </div>
                )}

                {c.status === 'ACTIVE' && (
                  <div className="flex flex-wrap items-center gap-2 pt-1">
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => handleRespond(c, 'COMPLETE')}
                      className="rounded-lg bg-[#176B52] px-3 py-1.5 text-xs font-semibold text-white hover:bg-[#125641] disabled:opacity-50"
                    >
                      Mark Completed
                    </button>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};
