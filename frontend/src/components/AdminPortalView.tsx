import React, { useEffect, useState } from 'react';
import {
  AlertTriangle,
  ArrowRight,
  CheckCircle2,
  Download,
  Edit2,
  FileText,
  KeyRound,
  Landmark,
  MapPin,
  Plus,
  Power,
  Printer,
  RefreshCw,
  ShieldCheck,
  ShieldOff,
  Trash2,
  X,
} from 'lucide-react';
import type {
  AuditLogRecord,
  BankDirectoryItem,
  BookingRecord,
  Business,
  Category,
  CategoryDocumentRequirement,
  CommissionRecord,
  DbUserRecord,
  DeliveryRecord,
  DocumentType,
  GovernmentTaxReport,
  Listing,
  OnboardingGovernance,
  OrderRecord,
  PlatformCommissionAccountConfig,
  PlatformPolicy,
  ProviderRegistration,
} from '../types/nearestyou.ts';
import { adminApi, paymentApi } from '../api/index.ts';
import { formatEtb } from '../utils/geo.ts';
import {
  TRANSLATIONS,
  getCategoryLabel,
  getDocumentLabel,
  type AppLanguage,
} from '../utils/i18n.ts';
import { useAuth } from '../context/AuthContext.tsx';

interface AdminPortalViewProps {
  policy: PlatformPolicy;
  governance: OnboardingGovernance;
  language: AppLanguage;
  onRefreshCatalog: () => void;
  onNotify: (msg: string) => void;
}

const ALL_PLATFORM_ROLES = [
  'CUSTOMER',
  'PROVIDER',
  'BUSINESS_OWNER',
  'DELIVERY_PARTNER',
  'PEER_VOUCHER',
  'PROVIDER_APPROVER',
  'ADMIN',
] as const;

export const AdminPortalView: React.FC<AdminPortalViewProps> = ({
  policy,
  governance,
  language,
  onRefreshCatalog,
  onNotify,
}) => {
  const t = TRANSLATIONS[language].admin;
  const { firebaseUser, dbUser, refreshProfile, openAuthModal, authFetch } = useAuth();
  const [tab, setTab] = useState<
    'REQUIREMENTS' | 'PROVIDER_KYC' | 'VERIFICATION' | 'CATEGORIES' | 'POLICY' | 'TAX_REPORT' | 'AUDIT'
  >('REQUIREMENTS');
  const [accessDeniedMsg, setAccessDeniedMsg] = useState<string | null>(null);

  const [usersList, setUsersList] = useState<DbUserRecord[]>([]);
  const [businesses, setBusinesses] = useState<Business[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [documentTypes, setDocumentTypes] = useState<DocumentType[]>([]);
  const [requirements, setRequirements] = useState<CategoryDocumentRequirement[]>([]);
  const [providerRegs, setProviderRegs] = useState<ProviderRegistration[]>([]);
  const [listings, setListings] = useState<Listing[]>([]);
  const [orders, setOrders] = useState<OrderRecord[]>([]);
  const [bookings, setBookings] = useState<BookingRecord[]>([]);
  const [deliveries, setDeliveries] = useState<DeliveryRecord[]>([]);
  const [commissions, setCommissions] = useState<CommissionRecord[]>([]);
  const [auditLogs, setAuditLogs] = useState<AuditLogRecord[]>([]);

  // Government Tax Report state
  const [taxReport, setTaxReport] = useState<GovernmentTaxReport | null>(null);
  const [loadingTax, setLoadingTax] = useState(false);
  const [taxFromDate, setTaxFromDate] = useState('');
  const [taxToDate, setTaxToDate] = useState('');
  const [taxPaymentFilter, setTaxPaymentFilter] = useState('ALL');
  const [taxBusinessFilter, setTaxBusinessFilter] = useState('ALL');

  // Step 1: Registered Document Type Master Registry State
  const [editingDocTypeId, setEditingDocTypeId] = useState<number | null>(null);
  const [dtName, setDtName] = useState('');
  const [dtNameAm, setDtNameAm] = useState('');
  const [dtNameOm, setDtNameOm] = useState('');
  const [dtCode, setDtCode] = useState('');
  const [dtDescription, setDtDescription] = useState('');
  const [dtDefaultMandatory, setDtDefaultMandatory] = useState(true);
  const [dtDefaultDocNumber, setDtDefaultDocNumber] = useState(true);
  const [dtStatus, setDtStatus] = useState<'ACTIVE' | 'INACTIVE'>('ACTIVE');

  // Step 2: Service Document Requirement Mapper State
  const [reqCategoryId, setReqCategoryId] = useState<number>(1);
  const [reqDocumentTypeId, setReqDocumentTypeId] = useState<number>(0);
  const [reqDescription, setReqDescription] = useState('');
  const [reqMandatory, setReqMandatory] = useState(true);
  const [reqDocNumber, setReqDocNumber] = useState(true);

  // Image Inspection Modal for KYC
  const [previewImage, setPreviewImage] = useState<{ title: string; url: string } | null>(null);
  const [reviewNoteInput, setReviewNoteInput] = useState<Record<number, string>>({});
  const [conflictNotes, setConflictNotes] = useState<Record<number, string>>({});

  // Dynamic Service Name / Category CRUD State
  const [editingCategoryId, setEditingCategoryId] = useState<number | null>(null);
  const [catName, setCatName] = useState('');
  const [catNameAm, setCatNameAm] = useState('');
  const [catNameOm, setCatNameOm] = useState('');
  const [catDescription, setCatDescription] = useState('');
  const [catType, setCatType] = useState('SERVICE');
  const [catDefaultListingType, setCatDefaultListingType] = useState('SERVICE');
  const [catCommission, setCatCommission] = useState('10');
  const [catMinPrice, setCatMinPrice] = useState('100');
  const [catRequiresVerification, setCatRequiresVerification] = useState(true);
  const [catDisplayOrder, setCatDisplayOrder] = useState('1');
  const [catStatus, setCatStatus] = useState<'ACTIVE' | 'INACTIVE'>('ACTIVE');

  // Policy edit state
  const [taxRate, setTaxRate] = useState(policy.taxRatePercent);
  const [deliveryBase, setDeliveryBase] = useState(policy.deliveryBaseFee);
  const [deliveryPerKm, setDeliveryPerKm] = useState(policy.deliveryPerKmRate);
  const [rideBase, setRideBase] = useState(policy.rideBaseFare);
  const [ridePerKm, setRidePerKm] = useState(policy.ridePerKmRate);
  const [matchRadiusKm, setMatchRadiusKm] = useState(policy.deliveryMatchRadiusKm ?? 5);

  // Onboarding & Peer QR Governance edit state
  const [minAccountAgeDays, setMinAccountAgeDays] = useState(governance.minAccountAgeDays);
  const [qrExpiryMinutes, setQrExpiryMinutes] = useState(governance.qrExpiryMinutes);
  const [allowedVoucherRoles, setAllowedVoucherRoles] = useState<string[]>(
    governance.allowedVoucherRoles
  );
  const [exceptionalVoucherRoles, setExceptionalVoucherRoles] = useState<string[]>(
    governance.exceptionalVoucherRoles
  );
  const [allowedApproverRoles, setAllowedApproverRoles] = useState<string[]>(
    governance.allowedApproverRoles
  );
  const [requirePeerQrAfterFirstProvider, setRequirePeerQrAfterFirstProvider] = useState(
    governance.requirePeerQrAfterFirstProvider
  );

  // Single Platform Commission Collection Account state (Chapa & Payo)
  const [banks, setBanks] = useState<BankDirectoryItem[]>([]);
  const [commAcct, setCommAcct] = useState<PlatformCommissionAccountConfig>({
    accountHolderName: 'Nearest You Platform Commission Pool',
    bankCode: '130',
    bankName: 'Commercial Bank of Ethiopia (CBE)',
    accountNumber: '1000458921403',
    telebirrNumber: '+251911000111',
    chapaSettlementLabel: 'NearestYou-Commission-Main',
    payoAccountHandle: '@nearestyou_commission',
    chapaEnabled: true,
    payoEnabled: true,
  });
  const [savingCommAcct, setSavingCommAcct] = useState(false);

  useEffect(() => {
    setTaxRate(policy.taxRatePercent);
    setDeliveryBase(policy.deliveryBaseFee);
    setDeliveryPerKm(policy.deliveryPerKmRate);
    setRideBase(policy.rideBaseFare);
    setRidePerKm(policy.ridePerKmRate);
    setMatchRadiusKm(policy.deliveryMatchRadiusKm ?? 5);
  }, [policy]);

  useEffect(() => {
    setMinAccountAgeDays(governance.minAccountAgeDays);
    setQrExpiryMinutes(governance.qrExpiryMinutes);
    setAllowedVoucherRoles(governance.allowedVoucherRoles);
    setExceptionalVoucherRoles(governance.exceptionalVoucherRoles);
    setAllowedApproverRoles(governance.allowedApproverRoles);
    setRequirePeerQrAfterFirstProvider(governance.requirePeerQrAfterFirstProvider);
  }, [governance]);

  const loadAdminData = async () => {
    if (!firebaseUser) return;
    setAccessDeniedMsg(null);
    try {
      const res = await authFetch('/api/v1/admin/portal');
      if (res.status === 403) {
        const err = await res.json();
        setAccessDeniedMsg(err.error || 'Administrator privileges required.');
        return;
      }
      if (res.ok) {
        const data = await res.json();
        const docTypes: DocumentType[] = data.documentTypes || [];
        setUsersList(data.users || []);
        setBusinesses(data.businesses || []);
        setCategories(data.categories || []);
        setDocumentTypes(docTypes);
        setRequirements(data.documentRequirements || []);
        setProviderRegs(data.providerRegistrations || []);
        setListings(data.listings || []);
        setOrders(data.orders || []);
        setBookings(data.bookings || []);
        setDeliveries(data.deliveries || []);
        setCommissions(data.commissions || []);
        setAuditLogs(data.auditLogs || []);
        if (
          data.categories?.length &&
          !data.categories.some((c: Category) => c.id === reqCategoryId)
        ) {
          setReqCategoryId(data.categories[0].id);
        }
        const activeDocTypes = docTypes.filter((d) => d.status === 'ACTIVE');
        if (
          activeDocTypes.length &&
          !activeDocTypes.some((d) => d.id === reqDocumentTypeId)
        ) {
          setReqDocumentTypeId(activeDocTypes[0].id);
          setReqMandatory(activeDocTypes[0].defaultMandatory);
          setReqDocNumber(activeDocTypes[0].defaultRequiresDocumentNumber);
        }
      }
      paymentApi
        .getConfig()
        .then((cfgRes) => {
          const cfg = cfgRes.data;
          if (Array.isArray(cfg?.banks)) setBanks(cfg.banks);
          if (cfg?.platformCommissionAccount) {
            setCommAcct((prev) => ({ ...prev, ...cfg.platformCommissionAccount }));
          }
        })
        .catch(() => {});
    } catch (err) {
      console.error(err);
    }
  };

  const loadTaxReport = async () => {
    if (!firebaseUser) return;
    setLoadingTax(true);
    try {
      const params = new URLSearchParams();
      if (taxFromDate) params.set('fromDate', taxFromDate);
      if (taxToDate) params.set('toDate', taxToDate);
      if (taxPaymentFilter !== 'ALL') params.set('paymentMethod', taxPaymentFilter);
      if (taxBusinessFilter !== 'ALL') params.set('businessId', taxBusinessFilter);
      const res = await authFetch(`/api/v1/admin/tax-report?${params.toString()}`);
      if (res.ok) {
        const data = await res.json();
        setTaxReport(data);
      }
    } catch (err) {
      console.error(err);
    } finally {
      setLoadingTax(false);
    }
  };

  useEffect(() => {
    if (firebaseUser) loadAdminData();
  }, [firebaseUser]);

  useEffect(() => {
    if (firebaseUser && tab === 'TAX_REPORT') {
      loadTaxReport();
    }
  }, [firebaseUser, tab, taxFromDate, taxToDate, taxPaymentFilter, taxBusinessFilter]);

  const resetDocTypeForm = () => {
    setEditingDocTypeId(null);
    setDtName('');
    setDtNameAm('');
    setDtNameOm('');
    setDtCode('');
    setDtDescription('');
    setDtDefaultMandatory(true);
    setDtDefaultDocNumber(true);
    setDtStatus('ACTIVE');
  };

  const startEditDocType = (dt: DocumentType) => {
    setEditingDocTypeId(dt.id);
    setDtName(dt.documentName);
    setDtNameAm(dt.documentNameAm || '');
    setDtNameOm(dt.documentNameOm || '');
    setDtCode(dt.documentCode);
    setDtDescription(dt.description || '');
    setDtDefaultMandatory(dt.defaultMandatory);
    setDtDefaultDocNumber(dt.defaultRequiresDocumentNumber);
    setDtStatus(dt.status === 'INACTIVE' ? 'INACTIVE' : 'ACTIVE');
  };

  const handleSaveDocumentType = async (e: React.FormEvent) => {
    e.preventDefault();
    const isEdit = editingDocTypeId !== null;
    const url = isEdit
      ? `/api/v1/admin/document-types/${editingDocTypeId}`
      : '/api/v1/admin/document-types';
    const res = await authFetch(url, {
      method: isEdit ? 'PUT' : 'POST',
      body: JSON.stringify({
        documentName: dtName,
        documentCode: dtCode || undefined,
        documentNameAm: dtNameAm || dtName,
        documentNameOm: dtNameOm || dtName,
        description: dtDescription,
        defaultMandatory: dtDefaultMandatory,
        defaultRequiresDocumentNumber: dtDefaultDocNumber,
        ...(isEdit ? { status: dtStatus } : {}),
      }),
    });
    if (res.ok) {
      const saved: DocumentType = await res.json();
      onNotify(
        isEdit
          ? `Document Type "${saved.documentName}" updated.`
          : `Document Type "${saved.documentName}" registered. You can now map it to services below.`
      );
      if (!isEdit && saved.status === 'ACTIVE') {
        setReqDocumentTypeId(saved.id);
        setReqMandatory(saved.defaultMandatory);
        setReqDocNumber(saved.defaultRequiresDocumentNumber);
      }
      resetDocTypeForm();
      loadAdminData();
      onRefreshCatalog();
    } else {
      const err = await res.json().catch(() => ({}));
      onNotify(err.error || 'Could not save document type.');
    }
  };

  const handleToggleDocTypeStatus = async (dt: DocumentType) => {
    const nextStatus = dt.status === 'ACTIVE' ? 'INACTIVE' : 'ACTIVE';
    const res = await authFetch(`/api/v1/admin/document-types/${dt.id}`, {
      method: 'PUT',
      body: JSON.stringify({
        documentName: dt.documentName,
        documentCode: dt.documentCode,
        documentNameAm: dt.documentNameAm || dt.documentName,
        documentNameOm: dt.documentNameOm || dt.documentName,
        description: dt.description,
        defaultMandatory: dt.defaultMandatory,
        defaultRequiresDocumentNumber: dt.defaultRequiresDocumentNumber,
        status: nextStatus,
      }),
    });
    if (res.ok) {
      onNotify(`Document Type "${dt.documentName}" marked ${nextStatus}.`);
      loadAdminData();
      onRefreshCatalog();
    } else {
      const err = await res.json().catch(() => ({}));
      onNotify(err.error || 'Could not update document type status.');
    }
  };

  const handleDeleteDocType = async (dt: DocumentType) => {
    const res = await authFetch(`/api/v1/admin/document-types/${dt.id}`, { method: 'DELETE' });
    if (res.ok) {
      onNotify(`Document Type "${dt.documentName}" deleted.`);
      if (editingDocTypeId === dt.id) resetDocTypeForm();
      loadAdminData();
      onRefreshCatalog();
    } else {
      const err = await res.json().catch(() => ({}));
      onNotify(err.error || 'Could not delete document type.');
    }
  };

  const handleSelectDocTypeForMapping = (docTypeId: number) => {
    setReqDocumentTypeId(docTypeId);
    const chosen = documentTypes.find((d) => d.id === docTypeId);
    if (chosen) {
      setReqMandatory(chosen.defaultMandatory);
      setReqDocNumber(chosen.defaultRequiresDocumentNumber);
    }
  };

  const handleAddRequirement = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!reqDocumentTypeId) {
      onNotify('Register and select an active Document Type first before mapping.');
      return;
    }
    const chosenDoc = documentTypes.find((d) => d.id === reqDocumentTypeId);
    const res = await authFetch('/api/v1/admin/requirements', {
      method: 'POST',
      body: JSON.stringify({
        categoryId: reqCategoryId,
        documentTypeId: reqDocumentTypeId,
        description: reqDescription,
        isMandatory: reqMandatory,
        requiresDocumentNumber: reqDocNumber,
      }),
    });
    if (res.ok) {
      onNotify(`Mapped "${chosenDoc?.documentName || 'Document Type'}" to service.`);
      setReqDescription('');
      loadAdminData();
      onRefreshCatalog();
    } else {
      const err = await res.json().catch(() => ({}));
      onNotify(err.error || 'Could not map document requirement.');
    }
  };

  const handleDeleteRequirement = async (id: number) => {
    const res = await authFetch(`/api/v1/admin/requirements/${id}`, { method: 'DELETE' });
    if (res.ok) {
      onNotify('Service document mapping removed.');
      loadAdminData();
      onRefreshCatalog();
    }
  };

  const handleVerifyProvider = async (
    regId: number,
    status: 'VERIFIED' | 'REJECTED' | 'REVOKED'
  ) => {
    const res = await authFetch(`/api/v1/admin/providers/${regId}/verify`, {
      method: 'POST',
      body: JSON.stringify({
        status,
        reviewNotes: reviewNoteInput[regId] || undefined,
      }),
    });
    if (res.ok) {
      onNotify(
        status === 'REVOKED'
          ? 'Provider authority and roles revoked.'
          : `Provider KYC registration marked ${status}.`
      );
      await refreshProfile();
      loadAdminData();
      onRefreshCatalog();
    } else {
      const err = await res.json().catch(() => ({}));
      onNotify(err.error || 'Could not update provider verification status.');
    }
  };

  const handleVerifyBusiness = async (
    id: number,
    verificationStatus: 'APPROVED' | 'REJECTED' | 'REVOKED'
  ) => {
    const res = await authFetch(`/api/v1/admin/businesses/${id}/verify`, {
      method: 'POST',
      body: JSON.stringify({ verificationStatus }),
    });
    if (res.ok) {
      onNotify(
        verificationStatus === 'REVOKED'
          ? 'Business approval authority revoked.'
          : `Business verification set to ${verificationStatus}.`
      );
      loadAdminData();
      onRefreshCatalog();
    } else {
      const err = await res.json().catch(() => ({}));
      onNotify(err.error || 'Could not update business verification status.');
    }
  };

  const resetCategoryForm = () => {
    setEditingCategoryId(null);
    setCatName('');
    setCatNameAm('');
    setCatNameOm('');
    setCatDescription('');
    setCatType('SERVICE');
    setCatDefaultListingType('SERVICE');
    setCatCommission('10');
    setCatMinPrice('100');
    setCatRequiresVerification(true);
    setCatDisplayOrder(String(categories.length + 1));
    setCatStatus('ACTIVE');
  };

  const startEditCategory = (c: Category) => {
    setEditingCategoryId(c.id);
    setCatName(c.name);
    setCatNameAm(c.nameAm || '');
    setCatNameOm(c.nameOm || '');
    setCatDescription(c.description || '');
    setCatType(c.categoryType || 'SERVICE');
    setCatDefaultListingType(c.defaultListingType || 'SERVICE');
    setCatCommission(String(c.commissionRate));
    setCatMinPrice(String(c.minPriceEtb));
    setCatRequiresVerification(c.requiresVerification);
    setCatDisplayOrder(String(c.displayOrder || 1));
    setCatStatus(c.status === 'INACTIVE' ? 'INACTIVE' : 'ACTIVE');
  };

  const handleSaveCategory = async (e: React.FormEvent) => {
    e.preventDefault();
    const isEdit = editingCategoryId !== null;
    const url = isEdit
      ? `/api/v1/admin/categories/${editingCategoryId}`
      : '/api/v1/admin/categories';
    const res = await authFetch(url, {
      method: isEdit ? 'PUT' : 'POST',
      body: JSON.stringify({
        name: catName,
        nameAm: catNameAm || catName,
        nameOm: catNameOm || catName,
        description: catDescription,
        categoryType: catType,
        defaultListingType: catDefaultListingType,
        commissionRate: Number(catCommission),
        minPriceEtb: Number(catMinPrice),
        requiresVerification: catRequiresVerification,
        displayOrder: Number(catDisplayOrder) || 1,
        ...(isEdit ? { status: catStatus } : {}),
      }),
    });
    if (res.ok) {
      onNotify(
        isEdit
          ? `Service "${catName}" updated dynamically.`
          : `Service "${catName}" registered dynamically.`
      );
      resetCategoryForm();
      loadAdminData();
      onRefreshCatalog();
    } else {
      const err = await res.json().catch(() => ({}));
      onNotify(err.error || 'Could not save dynamic service.');
    }
  };

  const handleToggleCategoryStatus = async (c: Category) => {
    const nextStatus = c.status === 'ACTIVE' ? 'INACTIVE' : 'ACTIVE';
    const res = await authFetch(`/api/v1/admin/categories/${c.id}/status`, {
      method: 'PATCH',
      body: JSON.stringify({ status: nextStatus }),
    });
    if (res.ok) {
      onNotify(`Service "${c.name}" marked ${nextStatus}.`);
      loadAdminData();
      onRefreshCatalog();
    } else {
      const err = await res.json().catch(() => ({}));
      onNotify(err.error || 'Could not change service status.');
    }
  };

  const handleDeleteCategory = async (c: Category) => {
    const res = await authFetch(`/api/v1/admin/categories/${c.id}`, { method: 'DELETE' });
    if (res.ok) {
      onNotify(`Service "${c.name}" deleted.`);
      if (editingCategoryId === c.id) resetCategoryForm();
      loadAdminData();
      onRefreshCatalog();
    } else {
      const err = await res.json().catch(() => ({}));
      onNotify(err.error || 'Could not delete service.');
    }
  };

  const handleSavePolicy = async (e: React.FormEvent) => {
    e.preventDefault();
    const res = await authFetch('/api/v1/admin/pricing-policy', {
      method: 'PUT',
      body: JSON.stringify({
        currency: 'ETB',
        taxRatePercent: Number(taxRate),
        defaultCommissionPercent: 10,
        deliveryBaseFee: Number(deliveryBase),
        deliveryPerKmRate: Number(deliveryPerKm),
        expressMultiplier: 1.4,
        rideBaseFare: Number(rideBase),
        ridePerKmRate: Number(ridePerKm),
        deliveryMatchRadiusKm: Math.max(1, Number(matchRadiusKm) || 5),
      }),
    });
    if (res.ok) {
      onNotify('Platform pricing, VAT, and delivery match radius updated.');
      onRefreshCatalog();
      loadAdminData();
    }
  };

  const toggleRoleInList = (list: string[], setList: (next: string[]) => void, role: string) => {
    if (list.includes(role)) {
      setList(list.filter((r) => r !== role));
    } else {
      setList([...list, role]);
    }
  };

  const handleSaveGovernance = async (e: React.FormEvent) => {
    e.preventDefault();
    const res = await authFetch('/api/v1/admin/onboarding-governance', {
      method: 'PUT',
      body: JSON.stringify({
        minAccountAgeDays: Math.max(0, Number(minAccountAgeDays) || 30),
        qrExpiryMinutes: Math.max(1, Number(qrExpiryMinutes) || 10),
        allowedVoucherRoles,
        exceptionalVoucherRoles,
        allowedApproverRoles,
        requirePeerQrAfterFirstProvider,
      }),
    });
    if (res.ok) {
      onNotify('Onboarding Peer QR & Role Approval governance saved.');
      onRefreshCatalog();
      loadAdminData();
    } else {
      const err = await res.json();
      onNotify(err.error || 'Could not save onboarding governance.');
    }
  };

  const handleSaveCommissionAccount = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!commAcct.accountNumber.trim()) {
      onNotify('Enter the Platform Commission Collection Account number.');
      return;
    }
    setSavingCommAcct(true);
    try {
      const matchedBank = banks.find((b) => b.code === commAcct.bankCode);
      const res = await adminApi.updateCommissionAccount({
        ...commAcct,
        bankName: matchedBank?.name || commAcct.bankName,
      });
      if (res.data) {
        setCommAcct((prev) => ({ ...prev, ...res.data }));
      }
      onNotify('Single Platform Commission Account updated for Chapa & Payo.');
      loadAdminData();
    } catch (err: any) {
      onNotify(err?.response?.data?.error || 'Could not update platform commission account.');
    } finally {
      setSavingCommAcct(false);
    }
  };

  const handleToggleUserStatus = async (u: DbUserRecord) => {
    const next = u.accountStatus === 'ACTIVE' ? 'SUSPENDED' : 'ACTIVE';
    const res = await authFetch(`/api/v1/admin/users/${u.id}/status`, {
      method: 'POST',
      body: JSON.stringify({ accountStatus: next }),
    });
    const data = await res.json();
    if (res.ok) {
      onNotify(`User ${u.email} marked ${next}.`);
      loadAdminData();
    } else {
      onNotify(data.error || 'Could not update user status.');
    }
  };

  const handleToggleAdminRole = async (u: DbUserRecord) => {
    const nextAdmin = !u.isAdmin;
    const res = await authFetch(`/api/v1/admin/users/${u.id}/admin-role`, {
      method: 'POST',
      body: JSON.stringify({ isAdmin: nextAdmin }),
    });
    const data = await res.json();
    if (res.ok) {
      onNotify(`${u.email} Admin access ${nextAdmin ? 'granted' : 'revoked'}.`);
      await refreshProfile();
      loadAdminData();
    } else {
      onNotify(data.error || 'Could not update admin role.');
    }
  };

  const handleToggleEarlyVouch = async (u: DbUserRecord) => {
    const next = !u.canVouchEarly;
    const res = await authFetch(`/api/v1/admin/users/${u.id}/vouch-early`, {
      method: 'POST',
      body: JSON.stringify({ canVouchEarly: next }),
    });
    const data = await res.json();
    if (res.ok) {
      onNotify(
        `${u.email} 1-month tenure bypass ${next ? 'granted (can vouch early)' : 'revoked'}.`
      );
      await refreshProfile();
      loadAdminData();
    } else {
      onNotify(data.error || 'Could not update early vouch privilege.');
    }
  };

  const handleToggleSpecificRole = async (u: DbUserRecord, role: string) => {
    const current = new Set(u.roles || ['CUSTOMER']);
    if (current.has(role)) current.delete(role);
    else current.add(role);
    const res = await authFetch(`/api/v1/admin/users/${u.id}/roles`, {
      method: 'POST',
      body: JSON.stringify({ roles: Array.from(current) }),
    });
    const data = await res.json();
    if (res.ok) {
      onNotify(`Updated roles for ${u.email}: ${(data.roles || []).join(', ')}`);
      await refreshProfile();
      loadAdminData();
    } else {
      onNotify(data.error || 'Could not update user roles.');
    }
  };

  const handleResolveConflict = async (
    id: number,
    resolution: 'REFUND_SENDER' | 'RELEASE_DRIVER' | 'SPLIT_SETTLEMENT' | 'REASSIGN_DRIVER'
  ) => {
    const note = (conflictNotes[id] || '').trim();
    const res = await authFetch(`/api/v1/admin/deliveries/${id}/resolve-conflict`, {
      method: 'POST',
      body: JSON.stringify({ resolution, note: note || undefined }),
    });
    const data = await res.json();
    if (res.ok) {
      onNotify(`Conflict resolved: ${resolution.replace('_', ' ')}.`);
      loadAdminData();
      if (tab === 'TAX_REPORT') loadTaxReport();
    } else {
      onNotify(data.error || 'Could not resolve delivery conflict.');
    }
  };

  const handleExportTaxCsv = () => {
    if (!taxReport) return;
    const headers = [
      'FiscalReceiptNo',
      'TaxPeriod',
      'TransactionRef',
      'SourceType',
      'BusinessName',
      'TIN',
      'PaymentMethod',
      'TaxableAmountETB',
      'VAT_15_Percent_ETB',
      'WithholdingTax_2_Percent_ETB',
      'TotalTaxDueETB',
      'PlatformCommissionETB',
      'CreatedAt',
    ];
    const rows = taxReport.ledger.map((row) => [
      row.fiscalReceiptNumber || '',
      row.taxPeriod || '',
      row.transactionRef,
      row.transactionType,
      `"${(row.businessName || '').replace(/"/g, '""')}"`,
      row.tinNumber || '',
      row.paymentMethod,
      row.taxableAmount,
      row.vatAmount,
      row.withholdingTaxAmount,
      Number((row.vatAmount + row.withholdingTaxAmount).toFixed(2)),
      row.commissionAmount,
      row.createdAt,
    ]);
    const csv = [headers.join(','), ...rows.map((r) => r.join(','))].join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `nearestyou-mor-tax-report-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const totalPlatformCommission = commissions.reduce((s, c) => s + Number(c.commissionAmount), 0);
  const totalGrossVolume = commissions.reduce((s, c) => s + Number(c.grossAmount), 0);
  const adminUsers = usersList.filter((u) => u.isAdmin || u.roles.includes('ADMIN'));
  const selectedCategoryReqs = requirements.filter((r) => r.categoryId === reqCategoryId);
  const disputedDeliveries = deliveries.filter(
    (d) => d.status === 'DISPUTED' || d.escrowStatus === 'FROZEN_DISPUTE'
  );

  if (!firebaseUser) {
    return (
      <div className="mx-auto max-w-2xl px-4 sm:px-6 py-20 text-center space-y-4">
        <h1 className="font-display text-2xl font-bold text-[#172B3A]">
          Authentication Required
        </h1>
        <p className="text-sm text-[#172B3A]/70">
          Sign in with an authorized platform account to access this console.
        </p>
        <button
          type="button"
          onClick={() => openAuthModal('signin')}
          className="mt-4 min-h-[44px] rounded-lg bg-[#176B52] px-6 py-3 text-sm font-semibold text-white hover:bg-[#125641]"
        >
          Sign In
        </button>
      </div>
    );
  }

  if (accessDeniedMsg) {
    return (
      <div className="mx-auto max-w-xl px-4 sm:px-6 py-20 text-center space-y-4">
        <div className="rounded-2xl border border-amber-200 bg-amber-50 p-6 text-sm text-amber-950">
          <p className="font-display text-lg font-bold">Restricted Access</p>
          <p className="mt-2 text-xs">{accessDeniedMsg}</p>
          <p className="mt-2 text-xs">
            Signed in as: <strong>{firebaseUser.email}</strong>.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-[1440px] space-y-6 sm:space-y-8 px-4 sm:px-6 py-6 sm:py-8">
      {/* Header & Tabs */}
      <div className="flex flex-col gap-4 border-b border-[#172B3A]/10 pb-6 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <h1 className="font-display text-2xl sm:text-3xl font-bold text-[#172B3A]">{t.title}</h1>
          <p className="mt-1 text-sm text-[#172B3A]/70">{t.subtitle}</p>
        </div>

        <div className="flex flex-wrap gap-1 rounded-lg border border-[#172B3A]/10 bg-white p-1">
          {[
            { id: 'REQUIREMENTS', label: `${t.tabRequirements} (${requirements.length})` },
            { id: 'PROVIDER_KYC', label: `${t.tabProviderKyc} (${providerRegs.length})` },
            { id: 'VERIFICATION', label: t.tabBusinessesUsers },
            { id: 'CATEGORIES', label: `${t.tabCategories} (${categories.length})` },
            { id: 'POLICY', label: t.tabPolicy },
            { id: 'TAX_REPORT', label: t.tabTaxReport },
            { id: 'AUDIT', label: `${t.tabAudit} (${auditLogs.length})` },
          ].map((item) => (
            <button
              key={item.id}
              type="button"
              onClick={() => setTab(item.id as typeof tab)}
              className={`min-h-[40px] rounded-md px-3 py-1.5 text-xs font-semibold whitespace-nowrap ${
                tab === item.id
                  ? 'bg-[#176B52] text-white'
                  : 'text-[#172B3A]/70 hover:text-[#172B3A]'
              }`}
            >
              {item.label}
            </button>
          ))}
        </div>
      </div>

      {/* Active Admin Account Strip */}
      <div className="flex flex-wrap items-center justify-between gap-4 rounded-xl border border-[#176B52]/25 bg-white px-5 py-3.5 text-xs">
        <div className="flex flex-wrap items-center gap-3">
          <KeyRound className="h-4 w-4 text-[#176B52]" />
          <span className="font-semibold text-[#172B3A]">
            Active Admin: {dbUser?.email || firebaseUser.email}
          </span>
          <span className="text-[#172B3A]/40">·</span>
          <span className="font-semibold text-[#176B52]">
            Configured Admins ({adminUsers.length}):{' '}
            {adminUsers.map((a) => a.email).join(', ') || dbUser?.email || firebaseUser.email}
          </span>
        </div>
        {disputedDeliveries.length > 0 && (
          <button
            type="button"
            onClick={() => setTab('TAX_REPORT')}
            className="inline-flex items-center gap-1.5 rounded-md bg-red-50 px-3 py-1 font-semibold text-red-700"
          >
            <AlertTriangle className="h-3.5 w-3.5" />
            {disputedDeliveries.length} Frozen Escrow Dispute(s)
          </button>
        )}
      </div>

      {/* KPI Strip */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
        <div className="rounded-xl border border-[#172B3A]/10 bg-white p-5">
          <p className="text-xs text-[#172B3A]/60">Registered Users</p>
          <p className="mt-1 font-mono text-2xl font-bold tabular-nums">{usersList.length}</p>
        </div>
        <div className="rounded-xl border border-[#172B3A]/10 bg-white p-5">
          <p className="text-xs text-[#172B3A]/60">Provider KYC Verified</p>
          <p className="mt-1 font-mono text-2xl font-bold tabular-nums">
            {providerRegs.filter((p) => p.status === 'VERIFIED').length} / {providerRegs.length}
          </p>
        </div>
        <div className="rounded-xl border border-[#172B3A]/10 bg-white p-5">
          <p className="text-xs text-[#172B3A]/60">Approved Businesses</p>
          <p className="mt-1 font-mono text-2xl font-bold tabular-nums">
            {businesses.filter((b) => b.verificationStatus === 'APPROVED').length} /{' '}
            {businesses.length}
          </p>
        </div>
        <div className="rounded-xl border border-[#172B3A]/10 bg-white p-5">
          <p className="text-xs text-[#172B3A]/60">Orders · Bookings · Rides</p>
          <p className="mt-1 font-mono text-2xl font-bold tabular-nums">
            {orders.length} · {bookings.length} · {deliveries.length}
          </p>
        </div>
        <div className="rounded-xl border border-[#172B3A]/10 bg-white p-5">
          <p className="text-xs text-[#172B3A]/60">Platform Commission / GMV</p>
          <p className="mt-1 font-mono text-xl font-bold tabular-nums text-[#176B52]">
            {formatEtb(totalPlatformCommission)}
          </p>
          <p className="font-mono text-[11px] tabular-nums text-[#172B3A]/55">
            GMV: {formatEtb(totalGrossVolume)} · Listings: {listings.length}
          </p>
        </div>
      </div>

      {/* TAB 1: Two-Step Document Type Registry & Service Mapping */}
      {tab === 'REQUIREMENTS' && (
        <div className="space-y-8">
          {/* Workflow Stepper Strip */}
          <div className="flex flex-wrap items-center gap-3 rounded-xl border border-[#176B52]/20 bg-emerald-50/40 px-5 py-3.5 text-xs">
            <span className="inline-flex items-center gap-1.5 font-bold text-[#176B52]">
              <span className="inline-flex h-5 w-5 items-center justify-center rounded-full bg-[#176B52] text-[11px] text-white">
                1
              </span>
              Register Document Types ({documentTypes.length})
            </span>
            <ArrowRight className="h-3.5 w-3.5 text-[#172B3A]/40" />
            <span className="inline-flex items-center gap-1.5 font-bold text-[#172B3A]">
              <span className="inline-flex h-5 w-5 items-center justify-center rounded-full bg-[#172B3A] text-[11px] text-white">
                2
              </span>
              Map Registered Document Types to Dynamic Services ({requirements.length} mapped)
            </span>
          </div>

          {/* STEP 1: Document Type Master Registry */}
          <div className="grid gap-8 lg:grid-cols-12">
            <form
              onSubmit={handleSaveDocumentType}
              className="space-y-4 rounded-2xl border border-[#172B3A]/10 bg-white p-6 lg:col-span-5"
            >
              <div className="flex items-start justify-between gap-2 border-b border-[#172B3A]/10 pb-3">
                <div>
                  <h2 className="flex items-center gap-2 font-display text-lg font-semibold text-[#172B3A]">
                    <Plus className="h-4 w-4 text-[#176B52]" />
                    {editingDocTypeId
                      ? 'Edit Registered Document Type'
                      : '1. Register New Document Type'}
                  </h2>
                  <p className="mt-1 text-xs text-[#172B3A]/65">
                    Define reusable KYC/license document types first (EN, አማርኛ, Afaan Oromoo)
                    before mapping them to services.
                  </p>
                </div>
                {editingDocTypeId && (
                  <button
                    type="button"
                    onClick={resetDocTypeForm}
                    className="rounded-md border border-[#172B3A]/15 px-2.5 py-1 text-[11px] font-semibold text-[#172B3A]/75 hover:bg-[#F4F6F5]"
                  >
                    Cancel
                  </button>
                )}
              </div>

              <div className="grid gap-3 sm:grid-cols-2">
                <div>
                  <label className="block text-xs font-medium text-[#172B3A]/75">
                    Document Name (EN) *
                  </label>
                  <input
                    required
                    type="text"
                    value={dtName}
                    onChange={(e) => setDtName(e.target.value)}
                    placeholder="e.g., Commercial Trade License"
                    className="mt-1 h-10 w-full rounded-lg border border-[#172B3A]/15 px-3 text-xs"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-[#172B3A]/75">
                    Document Code
                  </label>
                  <input
                    type="text"
                    value={dtCode}
                    onChange={(e) => setDtCode(e.target.value.toUpperCase())}
                    placeholder="Auto-generated if blank (e.g., TRADE_LICENSE)"
                    className="mt-1 h-10 w-full rounded-lg border border-[#172B3A]/15 px-3 font-mono text-xs"
                  />
                </div>
              </div>

              <div className="grid gap-3 sm:grid-cols-2">
                <div>
                  <label className="block text-xs font-medium text-[#172B3A]/75">
                    Document Name (አማርኛ)
                  </label>
                  <input
                    type="text"
                    value={dtNameAm}
                    onChange={(e) => setDtNameAm(e.target.value)}
                    placeholder="የንግድ ፈቃድ"
                    className="mt-1 h-10 w-full rounded-lg border border-[#172B3A]/15 px-3 text-xs"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-[#172B3A]/75">
                    Document Name (Afaan Oromoo)
                  </label>
                  <input
                    type="text"
                    value={dtNameOm}
                    onChange={(e) => setDtNameOm(e.target.value)}
                    placeholder="Hayyama Daldalaa"
                    className="mt-1 h-10 w-full rounded-lg border border-[#172B3A]/15 px-3 text-xs"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-medium text-[#172B3A]/75">
                  Default Verification Guidance
                </label>
                <textarea
                  rows={2}
                  value={dtDescription}
                  onChange={(e) => setDtDescription(e.target.value)}
                  placeholder="Default instructions shown to providers when uploading this document..."
                  className="mt-1 w-full rounded-lg border border-[#172B3A]/15 px-3 py-2 text-xs"
                />
              </div>

              <div className="flex flex-wrap gap-4 text-xs">
                <label className="inline-flex cursor-pointer items-center gap-1.5 font-medium">
                  <input
                    type="checkbox"
                    checked={dtDefaultMandatory}
                    onChange={(e) => setDtDefaultMandatory(e.target.checked)}
                    className="h-4 w-4 accent-[#176B52]"
                  />
                  Default Mandatory
                </label>
                <label className="inline-flex cursor-pointer items-center gap-1.5 font-medium">
                  <input
                    type="checkbox"
                    checked={dtDefaultDocNumber}
                    onChange={(e) => setDtDefaultDocNumber(e.target.checked)}
                    className="h-4 w-4 accent-[#176B52]"
                  />
                  Default Require Document #
                </label>
              </div>

              {editingDocTypeId && (
                <div>
                  <label className="block text-xs font-medium text-[#172B3A]/75">Status</label>
                  <select
                    value={dtStatus}
                    onChange={(e) => setDtStatus(e.target.value as 'ACTIVE' | 'INACTIVE')}
                    className="mt-1 h-10 w-full rounded-lg border border-[#172B3A]/15 bg-[#F4F6F5] px-3 text-xs font-semibold"
                  >
                    <option value="ACTIVE">ACTIVE (Available for Service Mapping)</option>
                    <option value="INACTIVE">INACTIVE</option>
                  </select>
                </div>
              )}

              <button
                type="submit"
                className="w-full min-h-[42px] rounded-lg bg-[#172B3A] px-4 py-2 text-xs font-semibold text-white hover:bg-[#176B52]"
              >
                {editingDocTypeId ? 'Update Document Type' : 'Register Document Type'}
              </button>
            </form>

            <div className="rounded-2xl border border-[#172B3A]/10 bg-white p-6 space-y-4 lg:col-span-7">
              <div className="flex items-center justify-between border-b border-[#172B3A]/10 pb-3">
                <div>
                  <h2 className="font-display text-lg font-semibold text-[#172B3A]">
                    Registered Document Type Catalog
                  </h2>
                  <p className="text-xs text-[#172B3A]/60">
                    All reusable document types available to map to dynamic services.
                  </p>
                </div>
                <span className="font-mono text-xs font-semibold text-[#176B52]">
                  {documentTypes.filter((d) => d.status === 'ACTIVE').length} active /{' '}
                  {documentTypes.length} total
                </span>
              </div>

              {documentTypes.length === 0 ? (
                <p className="py-8 text-center text-xs text-[#172B3A]/60">
                  No Document Types registered yet. Register your first Document Type on the left.
                </p>
              ) : (
                <div className="grid gap-3 sm:grid-cols-2">
                  {documentTypes.map((dt) => {
                    const mappedServicesCount = requirements.filter(
                      (r) => r.documentTypeId === dt.id || r.documentCode === dt.documentCode
                    ).length;
                    const isActive = dt.status === 'ACTIVE';
                    return (
                      <div
                        key={dt.id}
                        className={`flex flex-col justify-between gap-3 rounded-xl border p-4 text-xs ${
                          isActive
                            ? 'border-[#172B3A]/10 bg-[#F4F6F5]/50'
                            : 'border-amber-200 bg-amber-50/40 opacity-80'
                        }`}
                      >
                        <div className="space-y-1">
                          <div className="flex items-start justify-between gap-2">
                            <p className="font-semibold text-[#172B3A]">
                              {getDocumentLabel(dt, language)}
                            </p>
                            <span
                              className={`rounded px-1.5 py-0.5 font-mono text-[10px] font-bold ${
                                isActive
                                  ? 'bg-emerald-100 text-[#176B52]'
                                  : 'bg-amber-100 text-amber-900'
                              }`}
                            >
                              {dt.status}
                            </span>
                          </div>
                          <p className="text-[11px] text-[#172B3A]/65">
                            EN: {dt.documentName} · AM: {dt.documentNameAm || dt.documentName} · OM:{' '}
                            {dt.documentNameOm || dt.documentName}
                          </p>
                          <p className="font-mono text-[10px] text-[#172B3A]/55">
                            {dt.documentCode} · {mappedServicesCount} service(s) mapped
                          </p>
                          <p className="text-[11px] text-[#172B3A]/70 line-clamp-2">
                            {dt.description}
                          </p>
                        </div>

                        <div className="flex flex-wrap items-center justify-between gap-1.5 border-t border-[#172B3A]/10 pt-2">
                          <button
                            type="button"
                            disabled={!isActive}
                            onClick={() => handleSelectDocTypeForMapping(dt.id)}
                            className="rounded border border-[#176B52]/30 bg-white px-2 py-1 text-[11px] font-semibold text-[#176B52] hover:bg-emerald-50 disabled:opacity-40"
                          >
                            Select to Map ↓
                          </button>
                          <div className="flex items-center gap-1">
                            <button
                              type="button"
                              onClick={() => startEditDocType(dt)}
                              aria-label={`Edit ${dt.documentName}`}
                              className="rounded p-1.5 text-[#172B3A]/65 hover:bg-white hover:text-[#172B3A]"
                            >
                              <Edit2 className="h-3.5 w-3.5" />
                            </button>
                            <button
                              type="button"
                              onClick={() => handleToggleDocTypeStatus(dt)}
                              aria-label={`Toggle ${dt.documentName} status`}
                              className="rounded p-1.5 text-[#172B3A]/65 hover:bg-white hover:text-[#176B52]"
                            >
                              <Power className="h-3.5 w-3.5" />
                            </button>
                            <button
                              type="button"
                              onClick={() => handleDeleteDocType(dt)}
                              aria-label={`Delete ${dt.documentName}`}
                              className="rounded p-1.5 text-[#172B3A]/55 hover:bg-red-50 hover:text-red-700"
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </button>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>

          {/* STEP 2: Map Registered Document Type to Dynamic Service */}
          <div className="grid gap-8 lg:grid-cols-12">
            <form
              onSubmit={handleAddRequirement}
              className="space-y-4 rounded-2xl border border-[#172B3A]/10 bg-white p-6 lg:col-span-5"
            >
              <div className="border-b border-[#172B3A]/10 pb-3">
                <h2 className="flex items-center gap-2 font-display text-lg font-semibold text-[#172B3A]">
                  <Plus className="h-4 w-4 text-[#176B52]" />
                  2. Map Document Type to Dynamic Service
                </h2>
                <p className="mt-1 text-xs text-[#172B3A]/65">
                  Choose a registered Service Name and pick a registered Document Type above.
                </p>
              </div>

              <div>
                <div className="flex items-center justify-between">
                  <label className="block text-xs font-medium text-[#172B3A]/75">
                    Target Dynamic Service Name
                  </label>
                  <button
                    type="button"
                    onClick={() => setTab('CATEGORIES')}
                    className="text-[11px] font-semibold text-[#176B52] hover:underline"
                  >
                    + Manage Service Names
                  </button>
                </div>
                <select
                  value={reqCategoryId}
                  onChange={(e) => setReqCategoryId(Number(e.target.value))}
                  className="mt-1 h-10 w-full rounded-lg border border-[#172B3A]/15 bg-[#F4F6F5] px-3 text-xs font-semibold"
                >
                  {categories.map((c) => (
                    <option key={c.id} value={c.id}>
                      {getCategoryLabel(c, language)} ({c.status})
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs font-medium text-[#172B3A]/75">
                  Registered Document Type (from Step 1)
                </label>
                <select
                  required
                  value={reqDocumentTypeId || ''}
                  onChange={(e) => handleSelectDocTypeForMapping(Number(e.target.value))}
                  className="mt-1 h-10 w-full rounded-lg border border-[#172B3A]/15 bg-[#F4F6F5] px-3 text-xs font-semibold"
                >
                  <option value="" disabled>
                    Select a registered Document Type...
                  </option>
                  {documentTypes
                    .filter((d) => d.status === 'ACTIVE')
                    .map((dt) => {
                      const alreadyMapped = selectedCategoryReqs.some(
                        (r) => r.documentTypeId === dt.id || r.documentCode === dt.documentCode
                      );
                      return (
                        <option key={dt.id} value={dt.id} disabled={alreadyMapped}>
                          {getDocumentLabel(dt, language)} ({dt.documentCode})
                          {alreadyMapped ? ' — Already Mapped' : ''}
                        </option>
                      );
                    })}
                </select>
              </div>

              <div>
                <label className="block text-xs font-medium text-[#172B3A]/75">
                  Service-Specific Verification Guidance (Optional)
                </label>
                <textarea
                  rows={2}
                  value={reqDescription}
                  onChange={(e) => setReqDescription(e.target.value)}
                  placeholder="Leave blank to inherit the Document Type's default guidance..."
                  className="mt-1 w-full rounded-lg border border-[#172B3A]/15 px-3 py-2 text-xs"
                />
              </div>

              <div className="flex flex-wrap gap-4 text-xs">
                <label className="inline-flex cursor-pointer items-center gap-1.5 font-medium">
                  <input
                    type="checkbox"
                    checked={reqMandatory}
                    onChange={(e) => setReqMandatory(e.target.checked)}
                    className="h-4 w-4 accent-[#176B52]"
                  />
                  Mandatory for this Service
                </label>
                <label className="inline-flex cursor-pointer items-center gap-1.5 font-medium">
                  <input
                    type="checkbox"
                    checked={reqDocNumber}
                    onChange={(e) => setReqDocNumber(e.target.checked)}
                    className="h-4 w-4 accent-[#176B52]"
                  />
                  Require Document / License Number
                </label>
              </div>

              <button
                type="submit"
                disabled={documentTypes.filter((d) => d.status === 'ACTIVE').length === 0}
                className="w-full min-h-[42px] rounded-lg bg-[#176B52] px-4 py-2 text-xs font-semibold text-white hover:bg-[#125641] disabled:opacity-50"
              >
                Map Registered Document to Service
              </button>
            </form>

            <div className="rounded-2xl border border-[#172B3A]/10 bg-white p-6 space-y-4 lg:col-span-7">
              <div className="flex items-center justify-between border-b border-[#172B3A]/10 pb-3">
                <div>
                  <h2 className="font-display text-lg font-semibold text-[#172B3A]">
                    Mapped Requirements for{' '}
                    {getCategoryLabel(
                      categories.find((c) => c.id === reqCategoryId),
                      language,
                      'Selected Service'
                    )}
                  </h2>
                  <p className="text-xs text-[#172B3A]/60">
                    Providers onboarding under this service must upload these documents.
                  </p>
                </div>
                <span className="font-mono text-xs font-semibold text-[#176B52]">
                  {selectedCategoryReqs.length} mapped
                </span>
              </div>

              <div className="space-y-3">
                {selectedCategoryReqs.length === 0 ? (
                  <p className="py-8 text-center text-xs text-[#172B3A]/60">
                    No documents mapped to this service yet. Select a Document Type on the left to
                    map it.
                  </p>
                ) : (
                  selectedCategoryReqs.map((req) => (
                    <div
                      key={req.id}
                      className="flex items-start justify-between gap-4 rounded-xl border border-[#172B3A]/10 bg-[#F4F6F5]/50 p-4 text-xs"
                    >
                      <div>
                        <p className="font-semibold text-[#172B3A]">
                          {getDocumentLabel(req, language)} ·{' '}
                          <span className="font-mono text-[11px] text-[#176B52]">
                            {req.isMandatory ? 'MANDATORY' : 'OPTIONAL'}
                          </span>
                        </p>
                        <p className="mt-0.5 text-[#172B3A]/70">{req.description}</p>
                        <p className="mt-1 font-mono text-[10px] text-[#172B3A]/50">
                          Code: {req.documentCode} · Doc Number:{' '}
                          {req.requiresDocumentNumber ? 'Required' : 'Optional'}
                        </p>
                      </div>
                      <button
                        type="button"
                        onClick={() => handleDeleteRequirement(req.id)}
                        aria-label={`Remove ${req.documentName}`}
                        className="rounded-md p-1.5 text-[#172B3A]/50 hover:bg-red-50 hover:text-red-700"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* TAB 2: Provider KYC & Liveness Queue */}
      {tab === 'PROVIDER_KYC' && (
        <div className="space-y-4">
          {providerRegs.length === 0 ? (
            <div className="rounded-2xl border border-[#172B3A]/10 bg-white p-12 text-center text-xs text-[#172B3A]/60">
              No users have submitted self-service Provider KYC registrations yet.
            </div>
          ) : (
            providerRegs.map((reg) => {
              const cat = categories.find((c) => c.id === reg.serviceCategoryId);
              return (
                <div
                  key={reg.id}
                  className="rounded-2xl border border-[#172B3A]/10 bg-white p-6 space-y-5"
                >
                  <div className="flex flex-wrap items-start justify-between gap-4 border-b border-[#172B3A]/10 pb-4">
                    <div>
                      <div className="flex flex-wrap items-center gap-2 text-xs">
                        <span className="font-display text-lg font-bold text-[#172B3A]">
                          {reg.fullName}
                        </span>
                        <span>·</span>
                        <span className="font-semibold text-[#176B52]">
                          {cat?.name || `Category #${reg.serviceCategoryId}`}
                        </span>
                        <span>·</span>
                        <span className="font-mono font-bold text-[#172B3A]">{reg.status}</span>
                      </div>
                      <p className="mt-1 font-mono text-xs text-[#172B3A]/70">
                        Fayda ID: {reg.faydaIdNumber} · Phone: {reg.phoneNumber} · Alive Score:{' '}
                        {reg.livenessScore}% ({reg.livenessPassed ? 'PASSED' : 'PENDING'})
                      </p>
                      <p className="mt-1 flex items-center gap-1.5 text-xs text-[#172B3A]/70">
                        <MapPin className="h-3.5 w-3.5 text-[#176B52]" />
                        {reg.subCity}, {reg.landmark} · GPS: {Number(reg.latitude).toFixed(5)},{' '}
                        {Number(reg.longitude).toFixed(5)}
                      </p>
                      <div className="mt-1.5 flex flex-wrap gap-2 text-[11px] font-mono text-[#172B3A]/75">
                        {reg.vouchedByName ? (
                          <span className="rounded bg-emerald-50 px-2 py-0.5 text-[#176B52]">
                            Peer Authenticated by: {reg.vouchedByName}{' '}
                            {reg.vouchedAt
                              ? `(${new Date(reg.vouchedAt).toLocaleDateString()})`
                              : ''}
                          </span>
                        ) : reg.status === 'PENDING_PEER_AUTH' ? (
                          <span className="rounded bg-amber-50 px-2 py-0.5 text-amber-900">
                            Awaiting 10-Min Peer QR Scan{' '}
                            {reg.qrExpiresAt
                              ? `(Expires ${new Date(reg.qrExpiresAt).toLocaleTimeString()})`
                              : ''}
                          </span>
                        ) : null}
                        {reg.approvedByRole && (
                          <span className="rounded bg-[#F4F6F5] px-2 py-0.5">
                            Final Approval Role: {reg.approvedByRole}
                          </span>
                        )}
                      </div>
                    </div>

                    <div className="flex flex-wrap items-center gap-2">
                      <input
                        type="text"
                        value={reviewNoteInput[reg.id] || ''}
                        onChange={(e) =>
                          setReviewNoteInput((prev) => ({ ...prev, [reg.id]: e.target.value }))
                        }
                        placeholder={
                          reg.status === 'VERIFIED'
                            ? 'Optional revocation reason...'
                            : 'Optional review note...'
                        }
                        className="h-9 rounded-lg border border-[#172B3A]/15 px-3 text-xs"
                      />
                      {reg.status === 'VERIFIED' ? (
                        <>
                          <span className="inline-flex min-h-[36px] items-center gap-1.5 rounded-lg border border-[#176B52]/30 bg-emerald-50 px-3 py-1.5 text-xs font-semibold text-[#176B52]">
                            <CheckCircle2 className="h-3.5 w-3.5" />
                            Verified Provider
                          </span>
                          <button
                            type="button"
                            onClick={() => handleVerifyProvider(reg.id, 'REVOKED')}
                            className="inline-flex min-h-[36px] items-center gap-1.5 rounded-lg border border-red-300 bg-red-50 px-4 py-1.5 text-xs font-semibold text-red-700 hover:bg-red-100"
                          >
                            <ShieldOff className="h-3.5 w-3.5" />
                            Revoke Authority
                          </button>
                        </>
                      ) : reg.status === 'REJECTED' || reg.status === 'REVOKED' ? (
                        <>
                          <span className="inline-flex min-h-[36px] items-center rounded-lg border border-red-200 bg-red-50 px-3 py-1.5 text-xs font-semibold text-red-700">
                            {reg.status === 'REVOKED' ? 'Authority Revoked' : 'Rejected'}
                          </span>
                          <button
                            type="button"
                            onClick={() => handleVerifyProvider(reg.id, 'VERIFIED')}
                            className="inline-flex min-h-[36px] items-center gap-1.5 rounded-lg bg-[#176B52] px-4 py-1.5 text-xs font-semibold text-white hover:bg-[#125641]"
                          >
                            <CheckCircle2 className="h-3.5 w-3.5" />
                            Re-Approve Provider
                          </button>
                        </>
                      ) : (
                        <>
                          <button
                            type="button"
                            onClick={() => handleVerifyProvider(reg.id, 'VERIFIED')}
                            className="inline-flex min-h-[36px] items-center gap-1.5 rounded-lg bg-[#176B52] px-4 py-1.5 text-xs font-semibold text-white hover:bg-[#125641]"
                          >
                            <CheckCircle2 className="h-3.5 w-3.5" />
                            Approve Provider
                          </button>
                          <button
                            type="button"
                            onClick={() => handleVerifyProvider(reg.id, 'REJECTED')}
                            className="min-h-[36px] rounded-lg border border-[#172B3A]/20 px-4 py-1.5 text-xs font-semibold text-[#172B3A] hover:bg-red-50 hover:text-red-700"
                          >
                            Reject
                          </button>
                        </>
                      )}
                    </div>
                  </div>

                  <div className="grid gap-4 sm:grid-cols-3">
                    {reg.faydaFrontImage && (
                      <div className="space-y-1">
                        <p className="text-[11px] font-semibold text-[#172B3A]/70">
                          Fayda National ID Card
                        </p>
                        <img
                          src={reg.faydaFrontImage}
                          alt="Fayda ID"
                          onClick={() =>
                            setPreviewImage({
                              title: `${reg.fullName} — Fayda ID`,
                              url: reg.faydaFrontImage!,
                            })
                          }
                          className="h-32 w-full cursor-pointer rounded-lg border border-[#172B3A]/10 object-cover"
                        />
                      </div>
                    )}
                    {reg.profilePhotoImage && (
                      <div className="space-y-1">
                        <p className="text-[11px] font-semibold text-[#172B3A]/70">
                          Provider Portrait Photo
                        </p>
                        <img
                          src={reg.profilePhotoImage}
                          alt="Provider Portrait"
                          onClick={() =>
                            setPreviewImage({
                              title: `${reg.fullName} — Portrait`,
                              url: reg.profilePhotoImage!,
                            })
                          }
                          className="h-32 w-full cursor-pointer rounded-lg border border-[#172B3A]/10 object-cover"
                        />
                      </div>
                    )}
                    {reg.livenessSelfieImage && (
                      <div className="space-y-1">
                        <p className="text-[11px] font-semibold text-[#172B3A]/70">
                          Alive / Liveness Frame
                        </p>
                        <img
                          src={reg.livenessSelfieImage}
                          alt="Liveness Frame"
                          onClick={() =>
                            setPreviewImage({
                              title: `${reg.fullName} — Alive Biometric Frame`,
                              url: reg.livenessSelfieImage!,
                            })
                          }
                          className="h-32 w-full cursor-pointer rounded-lg border border-[#176B52]/30 object-cover"
                        />
                      </div>
                    )}
                  </div>

                  <div className="space-y-2">
                    <p className="text-xs font-semibold text-[#172B3A]">
                      Submitted Service Documents ({reg.documents?.length || 0})
                    </p>
                    <div className="grid gap-3 sm:grid-cols-3">
                      {(reg.documents || []).map((doc) => (
                        <div
                          key={doc.id}
                          className="flex items-center justify-between gap-2 rounded-lg border border-[#172B3A]/10 bg-[#F4F6F5]/60 p-3 text-xs"
                        >
                          <div className="min-w-0">
                            <p className="truncate font-semibold text-[#172B3A]">
                              {doc.documentName}
                            </p>
                            <p className="truncate font-mono text-[11px] text-[#172B3A]/65">
                              {doc.documentNumber || doc.fileName}
                            </p>
                          </div>
                          <button
                            type="button"
                            onClick={() =>
                              setPreviewImage({ title: doc.documentName, url: doc.fileDataUrl })
                            }
                            className="inline-flex items-center gap-1 rounded border border-[#172B3A]/15 bg-white px-2.5 py-1 text-[11px] font-semibold text-[#176B52]"
                          >
                            <FileText className="h-3 w-3" />
                            Inspect
                          </button>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              );
            })
          )}
        </div>
      )}

      {/* TAB 3: Businesses & Admin Users */}
      {tab === 'VERIFICATION' && (
        <div className="space-y-8">
          <div className="rounded-2xl border border-[#172B3A]/10 bg-white overflow-hidden">
            <div className="border-b border-[#172B3A]/10 px-5 py-4">
              <h2 className="font-display text-base font-semibold text-[#172B3A]">
                Business Verification Queue
              </h2>
            </div>

            {/* Mobile Cards (< md) */}
            <div className="divide-y divide-[#172B3A]/10 md:hidden">
              {businesses.map((b) => (
                <div key={`mb-${b.id}`} className="p-4 space-y-2.5 text-xs">
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <p className="font-semibold text-[#172B3A]">{b.businessName}</p>
                      <p className="text-[#172B3A]/60">
                        {b.subCity} · {b.landmark}
                      </p>
                    </div>
                    <span className="font-semibold text-[#176B52]">{b.verificationStatus}</span>
                  </div>
                  <p className="font-mono text-[11px] text-[#172B3A]/75">
                    {b.licenseNumber} {b.tinNumber ? `· TIN ${b.tinNumber}` : ''} ·{' '}
                    {Number(b.latitude).toFixed(4)}, {Number(b.longitude).toFixed(4)}
                  </p>
                  <div className="flex flex-wrap items-center gap-2 pt-1">
                    {b.verificationStatus === 'APPROVED' ? (
                      <>
                        <span className="inline-flex min-h-[40px] flex-1 items-center justify-center gap-1 rounded-lg border border-[#176B52]/30 bg-emerald-50 px-3 py-1.5 font-semibold text-[#176B52]">
                          <CheckCircle2 className="h-3.5 w-3.5" />
                          Approved
                        </span>
                        <button
                          type="button"
                          onClick={() => handleVerifyBusiness(b.id, 'REVOKED')}
                          className="inline-flex min-h-[40px] flex-1 items-center justify-center gap-1 rounded-lg border border-red-300 bg-red-50 px-3 py-1.5 font-semibold text-red-700"
                        >
                          <ShieldOff className="h-3.5 w-3.5" />
                          Revoke Authority
                        </button>
                      </>
                    ) : b.verificationStatus === 'REJECTED' ||
                      b.verificationStatus === 'REVOKED' ||
                      b.verificationStatus === 'SUSPENDED' ? (
                      <button
                        type="button"
                        onClick={() => handleVerifyBusiness(b.id, 'APPROVED')}
                        className="min-h-[40px] w-full rounded-lg bg-[#176B52] px-3 py-1.5 font-semibold text-white"
                      >
                        Re-Approve
                      </button>
                    ) : (
                      <>
                        <button
                          type="button"
                          onClick={() => handleVerifyBusiness(b.id, 'APPROVED')}
                          className="min-h-[40px] flex-1 rounded-lg bg-[#176B52] px-3 py-1.5 font-semibold text-white"
                        >
                          Approve
                        </button>
                        <button
                          type="button"
                          onClick={() => handleVerifyBusiness(b.id, 'REJECTED')}
                          className="min-h-[40px] flex-1 rounded-lg border border-[#172B3A]/20 px-3 py-1.5 font-semibold text-[#172B3A]"
                        >
                          Reject
                        </button>
                      </>
                    )}
                  </div>
                </div>
              ))}
            </div>

            {/* Desktop Table (>= md) */}
            <div className="hidden md:block overflow-x-auto">
              <table className="w-full min-w-[760px] text-left text-xs">
                <thead className="border-b border-[#172B3A]/10 bg-[#F4F6F5] text-[#172B3A]/70">
                  <tr>
                    <th className="px-4 py-3 font-semibold">Business & Sub-City</th>
                    <th className="px-4 py-3 font-semibold">License · TIN · GPS</th>
                    <th className="px-4 py-3 font-semibold">Status</th>
                    <th className="px-4 py-3 font-semibold text-right">Moderation</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#172B3A]/10">
                  {businesses.map((b) => (
                    <tr key={b.id} className="hover:bg-[#F4F6F5]/45">
                      <td className="px-4 py-3">
                        <p className="font-semibold text-[#172B3A]">{b.businessName}</p>
                        <p className="text-[#172B3A]/60">
                          {b.subCity} · {b.landmark}
                        </p>
                      </td>
                      <td className="px-4 py-3 font-mono">
                        <p>
                          {b.licenseNumber} {b.tinNumber ? `· TIN ${b.tinNumber}` : ''}
                        </p>
                        <p className="text-[11px] text-[#172B3A]/55">
                          {Number(b.latitude).toFixed(4)}, {Number(b.longitude).toFixed(4)}
                        </p>
                      </td>
                      <td className="px-4 py-3 font-semibold text-[#176B52]">
                        {b.verificationStatus}
                      </td>
                      <td className="px-4 py-3 text-right space-x-2">
                        {b.verificationStatus === 'APPROVED' ? (
                          <>
                            <span className="inline-flex items-center gap-1 rounded-md border border-[#176B52]/30 bg-emerald-50 px-2.5 py-1 font-semibold text-[#176B52]">
                              <CheckCircle2 className="h-3.5 w-3.5" />
                              Approved
                            </span>
                            <button
                              type="button"
                              onClick={() => handleVerifyBusiness(b.id, 'REVOKED')}
                              className="inline-flex items-center gap-1 rounded-md border border-red-300 bg-red-50 px-3 py-1.5 font-semibold text-red-700 hover:bg-red-100"
                            >
                              <ShieldOff className="h-3.5 w-3.5" />
                              Revoke Authority
                            </button>
                          </>
                        ) : b.verificationStatus === 'REJECTED' ||
                          b.verificationStatus === 'REVOKED' ||
                          b.verificationStatus === 'SUSPENDED' ? (
                          <button
                            type="button"
                            onClick={() => handleVerifyBusiness(b.id, 'APPROVED')}
                            className="rounded-md bg-[#176B52] px-3 py-1.5 font-semibold text-white hover:bg-[#125641]"
                          >
                            Re-Approve
                          </button>
                        ) : (
                          <>
                            <button
                              type="button"
                              onClick={() => handleVerifyBusiness(b.id, 'APPROVED')}
                              className="rounded-md bg-[#176B52] px-3 py-1.5 font-semibold text-white hover:bg-[#125641]"
                            >
                              Approve
                            </button>
                            <button
                              type="button"
                              onClick={() => handleVerifyBusiness(b.id, 'REJECTED')}
                              className="rounded-md border border-[#172B3A]/20 px-3 py-1.5 font-semibold text-[#172B3A] hover:bg-red-50 hover:text-red-700"
                            >
                              Reject
                            </button>
                          </>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          <div className="rounded-2xl border border-[#172B3A]/10 bg-white overflow-hidden">
            <div className="border-b border-[#172B3A]/10 px-5 py-4 flex items-center justify-between">
              <div>
                <h2 className="font-display text-base font-semibold text-[#172B3A]">
                  Platform Users, Roles & Peer QR Exemptions
                </h2>
                <p className="text-xs text-[#172B3A]/60">
                  Configure roles (Provider, Delivery Partner, Peer Voucher, Provider Approver,
                  Admin) and exceptional 1-month tenure bypass for QR authentication.
                </p>
              </div>
              <ShieldCheck className="h-5 w-5 text-[#176B52]" />
            </div>

            {/* Mobile Cards (< md) */}
            <div className="divide-y divide-[#172B3A]/10 md:hidden">
              {usersList.map((u) => {
                const isProtectedSuper = u.roles?.includes('SUPER_ADMIN');
                const isSelf = u.uid === dbUser?.uid;
                return (
                  <div key={`mu-${u.id}`} className="p-4 space-y-3 text-xs">
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <p className="font-semibold text-[#172B3A]">{u.fullName}</p>
                        <p className="text-[#172B3A]/60">{u.email}</p>
                      </div>
                      <span className="font-mono text-[11px] font-bold text-[#176B52]">
                        {u.accountStatus}
                      </span>
                    </div>
                    <p className="font-mono text-[11px] text-[#172B3A]/70">
                      KYC: {u.providerVerificationStatus} · Liveness: {u.livenessStatus}
                    </p>
                    <div className="flex flex-wrap gap-1.5">
                      {(
                        [
                          'PROVIDER',
                          'BUSINESS_OWNER',
                          'DELIVERY_PARTNER',
                          'PEER_VOUCHER',
                          'PROVIDER_APPROVER',
                          'ADMIN',
                        ] as const
                      ).map((r) => {
                        const active = u.roles?.includes(r);
                        const disabled = r === 'ADMIN' && (isProtectedSuper || isSelf);
                        return (
                          <button
                            key={r}
                            type="button"
                            disabled={disabled}
                            onClick={() => handleToggleSpecificRole(u, r)}
                            className={`min-h-[36px] rounded border px-2.5 py-1 text-[10px] font-semibold disabled:opacity-45 ${
                              active
                                ? 'border-[#176B52] bg-[#176B52]/10 text-[#176B52]'
                                : 'border-[#172B3A]/15 bg-white text-[#172B3A]/60'
                            }`}
                          >
                            {active ? '✓ ' : '+ '}
                            {r.replace('_', ' ')}
                          </button>
                        );
                      })}
                    </div>
                    <div className="grid grid-cols-3 gap-2">
                      <button
                        type="button"
                        onClick={() => handleToggleEarlyVouch(u)}
                        className={`min-h-[40px] rounded-lg border px-2 py-1 text-[11px] font-semibold ${
                          u.canVouchEarly
                            ? 'border-[#F4A62A] bg-amber-50 text-amber-900'
                            : 'border-[#172B3A]/15 text-[#172B3A]/70'
                        }`}
                      >
                        {u.canVouchEarly ? '✓ Early Vouch' : 'Early Vouch'}
                      </button>
                      <button
                        type="button"
                        disabled={isProtectedSuper || isSelf}
                        onClick={() => handleToggleAdminRole(u)}
                        className="min-h-[40px] rounded-lg border border-[#176B52]/30 px-2 py-1 text-[11px] font-semibold text-[#176B52] disabled:opacity-40"
                      >
                        {u.isAdmin ? 'Revoke Admin' : 'Make Admin'}
                      </button>
                      <button
                        type="button"
                        disabled={isProtectedSuper || isSelf}
                        onClick={() => handleToggleUserStatus(u)}
                        className="min-h-[40px] rounded-lg border border-[#172B3A]/15 px-2 py-1 text-[11px] font-medium disabled:opacity-40"
                      >
                        {u.accountStatus === 'ACTIVE' ? 'Suspend' : 'Restore'}
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Desktop Table (>= md) */}
            <div className="hidden md:block overflow-x-auto">
              <table className="w-full min-w-[880px] text-left text-xs">
                <thead className="border-b border-[#172B3A]/10 bg-[#F4F6F5] text-[#172B3A]/70">
                  <tr>
                    <th className="px-4 py-3 font-semibold">Name & Email</th>
                    <th className="px-4 py-3 font-semibold">Roles & QR Governance</th>
                    <th className="px-4 py-3 font-semibold">Provider KYC / Liveness</th>
                    <th className="px-4 py-3 font-semibold">Account Status</th>
                    <th className="px-4 py-3 font-semibold text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#172B3A]/10">
                  {usersList.map((u) => {
                    const isProtectedSuper = u.roles?.includes('SUPER_ADMIN');
                    const isSelf = u.uid === dbUser?.uid;
                    return (
                      <tr key={u.id}>
                        <td className="px-4 py-3">
                          <p className="font-semibold text-[#172B3A]">{u.fullName}</p>
                          <p className="text-[#172B3A]/60">{u.email}</p>
                        </td>
                        <td className="px-4 py-3 text-[#172B3A]/75 space-y-1.5">
                          <p className="font-semibold text-[#176B52]">
                            {isProtectedSuper
                              ? 'SUPER ADMIN'
                              : u.isAdmin
                                ? 'ADMIN USER'
                                : 'Standard User'}
                            {u.canVouchEarly ? ' · 1-Mo QR Bypass' : ''}
                          </p>
                          <div className="flex flex-wrap gap-1.5">
                            {(
                              [
                                'PROVIDER',
                                'BUSINESS_OWNER',
                                'DELIVERY_PARTNER',
                                'PEER_VOUCHER',
                                'PROVIDER_APPROVER',
                                'ADMIN',
                              ] as const
                            ).map((r) => {
                              const active = u.roles?.includes(r);
                              const disabled = r === 'ADMIN' && (isProtectedSuper || isSelf);
                              return (
                                <button
                                  key={r}
                                  type="button"
                                  disabled={disabled}
                                  onClick={() => handleToggleSpecificRole(u, r)}
                                  className={`rounded border px-2 py-0.5 text-[10px] font-semibold disabled:opacity-45 ${
                                    active
                                      ? 'border-[#176B52] bg-[#176B52]/10 text-[#176B52]'
                                      : 'border-[#172B3A]/15 bg-white text-[#172B3A]/60'
                                  }`}
                                >
                                  {active ? '✓ ' : '+ '}
                                  {r.replace('_', ' ')}
                                </button>
                              );
                            })}
                          </div>
                        </td>
                        <td className="px-4 py-3 font-mono text-[11px]">
                          {u.providerVerificationStatus} · Liveness: {u.livenessStatus}
                        </td>
                        <td className="px-4 py-3 font-semibold">{u.accountStatus}</td>
                        <td className="px-4 py-3 text-right">
                          <div className="flex flex-wrap justify-end gap-1.5">
                            <button
                              type="button"
                              onClick={() => handleToggleEarlyVouch(u)}
                              className={`rounded-md border px-2.5 py-1 text-[11px] font-semibold ${
                                u.canVouchEarly
                                  ? 'border-[#F4A62A] bg-amber-50 text-amber-900'
                                  : 'border-[#172B3A]/15 text-[#172B3A]/75 hover:bg-[#F4F6F5]'
                              }`}
                            >
                              {u.canVouchEarly ? '✓ Early Vouch' : 'Allow Early Vouch'}
                            </button>
                            <button
                              type="button"
                              disabled={isProtectedSuper || isSelf}
                              onClick={() => handleToggleAdminRole(u)}
                              className="rounded-md border border-[#176B52]/30 px-2.5 py-1 text-[11px] font-semibold text-[#176B52] hover:bg-emerald-50 disabled:opacity-40"
                            >
                              {u.isAdmin ? 'Revoke Admin' : 'Make Admin'}
                            </button>
                            <button
                              type="button"
                              disabled={isProtectedSuper || isSelf}
                              onClick={() => handleToggleUserStatus(u)}
                              className="rounded-md border border-[#172B3A]/15 px-2.5 py-1 text-[11px] font-medium hover:bg-[#F4F6F5] disabled:opacity-40"
                            >
                              {u.accountStatus === 'ACTIVE' ? 'Suspend' : 'Restore'}
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {tab === 'CATEGORIES' && (
        <div className="grid gap-8 lg:grid-cols-12">
          <form
            onSubmit={handleSaveCategory}
            className="space-y-4 rounded-2xl border border-[#172B3A]/10 bg-white p-6 lg:col-span-5"
          >
            <div className="flex items-start justify-between gap-2 border-b border-[#172B3A]/10 pb-3">
              <div>
                <h2 className="font-display text-lg font-semibold text-[#172B3A]">
                  {editingCategoryId
                    ? 'Edit / Rename Dynamic Service'
                    : 'Register Dynamic Service Name'}
                </h2>
                <p className="mt-1 text-xs text-[#172B3A]/65">
                  All service names (such as Shops & Retail, Water Delivery, Healthcare, or custom
                  services) are managed dynamically here in EN, አማርኛ, and Afaan Oromoo.
                </p>
              </div>
              {editingCategoryId && (
                <button
                  type="button"
                  onClick={resetCategoryForm}
                  className="rounded-md border border-[#172B3A]/15 px-2.5 py-1 text-[11px] font-semibold text-[#172B3A]/75 hover:bg-[#F4F6F5]"
                >
                  Cancel
                </button>
              )}
            </div>

            <div>
              <label className="block text-xs font-medium text-[#172B3A]/75">
                Service Name (English) *
              </label>
              <input
                required
                type="text"
                value={catName}
                onChange={(e) => setCatName(e.target.value)}
                placeholder="e.g., Shops & Retail, Water Delivery, Veterinary Clinic"
                className="mt-1 h-10 w-full rounded-lg border border-[#172B3A]/15 px-3 text-xs"
              />
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <label className="block text-xs font-medium text-[#172B3A]/75">
                  Service Name (አማርኛ)
                </label>
                <input
                  type="text"
                  value={catNameAm}
                  onChange={(e) => setCatNameAm(e.target.value)}
                  placeholder="e.g., ሱቆች እና ችርቻሮ"
                  className="mt-1 h-10 w-full rounded-lg border border-[#172B3A]/15 px-3 text-xs"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-[#172B3A]/75">
                  Service Name (Afaan Oromoo)
                </label>
                <input
                  type="text"
                  value={catNameOm}
                  onChange={(e) => setCatNameOm(e.target.value)}
                  placeholder="e.g., Suuqiiwwanii fi Daldala"
                  className="mt-1 h-10 w-full rounded-lg border border-[#172B3A]/15 px-3 text-xs"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-medium text-[#172B3A]/75">
                Service Description
              </label>
              <textarea
                rows={2}
                value={catDescription}
                onChange={(e) => setCatDescription(e.target.value)}
                placeholder="Brief summary of providers and offerings in this service..."
                className="mt-1 w-full rounded-lg border border-[#172B3A]/15 px-3 py-2 text-xs"
              />
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <label className="block text-xs font-medium text-[#172B3A]/75">
                  Dynamic Service Code / Type
                </label>
                <input
                  type="text"
                  list="dynamic-service-types"
                  value={catType}
                  onChange={(e) => setCatType(e.target.value.toUpperCase())}
                  placeholder="SERVICE, RETAIL, LOGISTICS..."
                  className="mt-1 h-10 w-full rounded-lg border border-[#172B3A]/15 px-3 font-mono text-xs"
                />
                <datalist id="dynamic-service-types">
                  <option value="RETAIL" />
                  <option value="FOOD" />
                  <option value="SERVICE" />
                  <option value="DELIVERY" />
                  <option value="RENTAL" />
                  <option value="JOB" />
                  <option value="HEALTHCARE" />
                  <option value="EDUCATION" />
                  <option value="AGRICULTURE" />
                  <option value="EVENTS" />
                </datalist>
              </div>
              <div>
                <label className="block text-xs font-medium text-[#172B3A]/75">
                  Default Workflow / Listing Mode
                </label>
                <select
                  value={catDefaultListingType}
                  onChange={(e) => setCatDefaultListingType(e.target.value)}
                  className="mt-1 h-10 w-full rounded-lg border border-[#172B3A]/15 bg-[#F4F6F5] px-2 text-xs font-semibold"
                >
                  <option value="PRODUCT">PRODUCT (Cart / Retail Checkout)</option>
                  <option value="FOOD">FOOD (Menu / Prep Time Order)</option>
                  <option value="SERVICE">SERVICE (Quote / On-Site Booking)</option>
                  <option value="RENTAL">RENTAL (Date Range Reservation)</option>
                  <option value="JOB">JOB (Recruitment & Application)</option>
                  <option value="HEALTHCARE">HEALTHCARE (Clinic / Pharmacy Booking)</option>
                  <option value="EDUCATION">EDUCATION (Training / Event Seat)</option>
                  <option value="TRANSPORT">TRANSPORT (Courier / Driver Dispatch)</option>
                </select>
              </div>
            </div>

            <div className="grid gap-3 sm:grid-cols-3">
              <div>
                <label className="block text-xs font-medium text-[#172B3A]/75">
                  Commission %
                </label>
                <input
                  type="number"
                  step="0.5"
                  min={0}
                  max={50}
                  value={catCommission}
                  onChange={(e) => setCatCommission(e.target.value)}
                  className="mt-1 h-10 w-full rounded-lg border border-[#172B3A]/15 px-3 font-mono text-xs"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-[#172B3A]/75">
                  Min Price (ETB)
                </label>
                <input
                  type="number"
                  min={0}
                  value={catMinPrice}
                  onChange={(e) => setCatMinPrice(e.target.value)}
                  className="mt-1 h-10 w-full rounded-lg border border-[#172B3A]/15 px-3 font-mono text-xs"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-[#172B3A]/75">
                  Display Order
                </label>
                <input
                  type="number"
                  min={1}
                  value={catDisplayOrder}
                  onChange={(e) => setCatDisplayOrder(e.target.value)}
                  className="mt-1 h-10 w-full rounded-lg border border-[#172B3A]/15 px-3 font-mono text-xs"
                />
              </div>
            </div>

            <div className="flex flex-wrap items-center justify-between gap-3 text-xs">
              <label className="inline-flex cursor-pointer items-center gap-2 font-medium">
                <input
                  type="checkbox"
                  checked={catRequiresVerification}
                  onChange={(e) => setCatRequiresVerification(e.target.checked)}
                  className="h-4 w-4 accent-[#176B52]"
                />
                Require KYC & Document Verification
              </label>

              {editingCategoryId && (
                <select
                  value={catStatus}
                  onChange={(e) => setCatStatus(e.target.value as 'ACTIVE' | 'INACTIVE')}
                  className="h-9 rounded-lg border border-[#172B3A]/15 bg-[#F4F6F5] px-2.5 text-xs font-semibold"
                >
                  <option value="ACTIVE">ACTIVE</option>
                  <option value="INACTIVE">INACTIVE</option>
                </select>
              )}
            </div>

            <button
              type="submit"
              className="w-full min-h-[42px] rounded-lg bg-[#176B52] px-4 py-2 text-xs font-semibold text-white hover:bg-[#125641]"
            >
              {editingCategoryId ? 'Save Service Changes' : 'Register Dynamic Service'}
            </button>
          </form>

          <div className="rounded-2xl border border-[#172B3A]/10 bg-white overflow-hidden lg:col-span-7">
            <div className="flex items-center justify-between border-b border-[#172B3A]/10 px-5 py-4">
              <div>
                <h3 className="font-display text-base font-semibold text-[#172B3A]">
                  Registered Dynamic Services ({categories.length})
                </h3>
                <p className="text-xs text-[#172B3A]/60">
                  Rename services, map documents, or toggle availability without static presets.
                </p>
              </div>
            </div>

            {/* Mobile Cards (< md) */}
            <div className="divide-y divide-[#172B3A]/10 md:hidden">
              {categories.map((c) => {
                const mappedDocs = requirements.filter((r) => r.categoryId === c.id).length;
                const isActive = c.status === 'ACTIVE';
                return (
                  <div key={`mc-${c.id}`} className="p-4 space-y-2.5 text-xs">
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <p className="font-semibold text-[#172B3A]">{c.name}</p>
                        <p className="text-[#172B3A]/65">
                          {c.nameAm} · {c.nameOm || c.name}
                        </p>
                      </div>
                      <span
                        className={`rounded px-2 py-0.5 font-mono text-[10px] font-bold ${
                          isActive
                            ? 'bg-emerald-100 text-[#176B52]'
                            : 'bg-amber-100 text-amber-900'
                        }`}
                      >
                        {c.status}
                      </span>
                    </div>
                    <p className="font-mono text-[11px] text-[#172B3A]/65">
                      {c.categoryType} → {c.defaultListingType || 'SERVICE'} · {c.commissionRate}%
                      · {formatEtb(c.minPriceEtb)} · {mappedDocs} doc(s)
                    </p>
                    <div className="flex flex-wrap gap-2">
                      <button
                        type="button"
                        onClick={() => {
                          setReqCategoryId(c.id);
                          setTab('REQUIREMENTS');
                        }}
                        className="rounded border border-[#176B52]/30 px-2.5 py-1 text-[11px] font-semibold text-[#176B52]"
                      >
                        Map Docs
                      </button>
                      <button
                        type="button"
                        onClick={() => startEditCategory(c)}
                        className="rounded border border-[#172B3A]/15 px-2.5 py-1 text-[11px] font-semibold text-[#172B3A]"
                      >
                        Edit
                      </button>
                      <button
                        type="button"
                        onClick={() => handleToggleCategoryStatus(c)}
                        className="rounded border border-[#172B3A]/15 px-2.5 py-1 text-[11px] font-medium"
                      >
                        {isActive ? 'Deactivate' : 'Activate'}
                      </button>
                      <button
                        type="button"
                        onClick={() => handleDeleteCategory(c)}
                        className="rounded border border-red-200 px-2.5 py-1 text-[11px] font-medium text-red-700"
                      >
                        Delete
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Desktop Table (>= md) */}
            <div className="hidden md:block overflow-x-auto">
              <table className="w-full min-w-[720px] text-left text-xs">
                <thead className="border-b border-[#172B3A]/10 bg-[#F4F6F5] text-[#172B3A]/70">
                  <tr>
                    <th className="px-4 py-3 font-semibold">Service Name (EN / AM / OM)</th>
                    <th className="px-4 py-3 font-semibold">Type & Mode</th>
                    <th className="px-4 py-3 font-semibold">Fee / Min</th>
                    <th className="px-4 py-3 font-semibold">Docs / Status</th>
                    <th className="px-4 py-3 font-semibold text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#172B3A]/10">
                  {categories.map((c) => {
                    const mappedDocs = requirements.filter((r) => r.categoryId === c.id).length;
                    const isActive = c.status === 'ACTIVE';
                    return (
                      <tr key={c.id} className={!isActive ? 'bg-amber-50/30 opacity-80' : ''}>
                        <td className="px-4 py-3">
                          <p className="font-semibold text-[#172B3A]">{c.name}</p>
                          <p className="text-[11px] text-[#172B3A]/60">
                            AM: {c.nameAm} · OM: {c.nameOm || c.name}
                          </p>
                        </td>
                        <td className="px-4 py-3 font-mono text-[11px]">
                          <p className="font-semibold text-[#172B3A]">{c.categoryType}</p>
                          <p className="text-[#172B3A]/60">{c.defaultListingType || 'SERVICE'}</p>
                        </td>
                        <td className="px-4 py-3 font-mono tabular-nums text-[11px]">
                          <p>{c.commissionRate}%</p>
                          <p className="text-[#172B3A]/60">{formatEtb(c.minPriceEtb)}</p>
                        </td>
                        <td className="px-4 py-3 font-mono text-[11px]">
                          <p>{mappedDocs} doc(s)</p>
                          <span
                            className={`inline-block rounded px-1.5 py-0.5 text-[10px] font-bold ${
                              isActive
                                ? 'bg-emerald-100 text-[#176B52]'
                                : 'bg-amber-100 text-amber-900'
                            }`}
                          >
                            {c.status}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-right">
                          <div className="flex flex-wrap justify-end gap-1">
                            <button
                              type="button"
                              onClick={() => {
                                setReqCategoryId(c.id);
                                setTab('REQUIREMENTS');
                              }}
                              className="rounded border border-[#176B52]/30 px-2 py-1 text-[11px] font-semibold text-[#176B52] hover:bg-emerald-50"
                            >
                              Map Docs
                            </button>
                            <button
                              type="button"
                              onClick={() => startEditCategory(c)}
                              aria-label={`Edit ${c.name}`}
                              className="rounded p-1.5 text-[#172B3A]/65 hover:bg-[#F4F6F5] hover:text-[#172B3A]"
                            >
                              <Edit2 className="h-3.5 w-3.5" />
                            </button>
                            <button
                              type="button"
                              onClick={() => handleToggleCategoryStatus(c)}
                              aria-label={`Toggle ${c.name} status`}
                              className="rounded p-1.5 text-[#172B3A]/65 hover:bg-[#F4F6F5] hover:text-[#176B52]"
                            >
                              <Power className="h-3.5 w-3.5" />
                            </button>
                            <button
                              type="button"
                              onClick={() => handleDeleteCategory(c)}
                              aria-label={`Delete ${c.name}`}
                              className="rounded p-1.5 text-[#172B3A]/55 hover:bg-red-50 hover:text-red-700"
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {tab === 'POLICY' && (
        <div className="grid gap-8 lg:grid-cols-2">
          <form
            onSubmit={handleSavePolicy}
            className="space-y-4 rounded-2xl border border-[#172B3A]/10 bg-white p-6"
          >
            <h2 className="font-display text-lg font-semibold text-[#172B3A]">
              Pricing, Delivery Radius & Fee Rules
            </h2>
            <p className="text-xs text-[#172B3A]/65">
              Changes apply strictly to new transactions; confirmed orders retain historical agreed
              prices.
            </p>
            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <label className="block text-xs font-medium text-[#172B3A]/75">VAT Rate (%)</label>
                <input
                  type="number"
                  value={taxRate}
                  onChange={(e) => setTaxRate(Number(e.target.value))}
                  className="mt-1 h-10 w-full rounded-lg border border-[#172B3A]/15 px-3 font-mono text-xs"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-[#172B3A]/75">
                  Delivery Match Radius (km)
                </label>
                <input
                  type="number"
                  min={1}
                  max={50}
                  step={0.5}
                  value={matchRadiusKm}
                  onChange={(e) => setMatchRadiusKm(Number(e.target.value))}
                  className="mt-1 h-10 w-full rounded-lg border border-[#172B3A]/15 px-3 font-mono text-xs"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-[#172B3A]/75">
                  Delivery Base Fee (ETB)
                </label>
                <input
                  type="number"
                  value={deliveryBase}
                  onChange={(e) => setDeliveryBase(Number(e.target.value))}
                  className="mt-1 h-10 w-full rounded-lg border border-[#172B3A]/15 px-3 font-mono text-xs"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-[#172B3A]/75">
                  Delivery Per-km (ETB)
                </label>
                <input
                  type="number"
                  value={deliveryPerKm}
                  onChange={(e) => setDeliveryPerKm(Number(e.target.value))}
                  className="mt-1 h-10 w-full rounded-lg border border-[#172B3A]/15 px-3 font-mono text-xs"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-[#172B3A]/75">
                  Ride Base Fare (ETB)
                </label>
                <input
                  type="number"
                  value={rideBase}
                  onChange={(e) => setRideBase(Number(e.target.value))}
                  className="mt-1 h-10 w-full rounded-lg border border-[#172B3A]/15 px-3 font-mono text-xs"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-[#172B3A]/75">
                  Ride Per-km (ETB)
                </label>
                <input
                  type="number"
                  value={ridePerKm}
                  onChange={(e) => setRidePerKm(Number(e.target.value))}
                  className="mt-1 h-10 w-full rounded-lg border border-[#172B3A]/15 px-3 font-mono text-xs"
                />
              </div>
            </div>
            <button
              type="submit"
              className="min-h-[44px] rounded-lg bg-[#176B52] px-5 py-2.5 text-xs font-semibold text-white hover:bg-[#125641]"
            >
              Save Platform Pricing & Radius Policy
            </button>
          </form>

          {/* Onboarding Governance & Peer QR Policy */}
          <form
            onSubmit={handleSaveGovernance}
            className="space-y-4 rounded-2xl border border-[#172B3A]/10 bg-white p-6"
          >
            <h2 className="font-display text-lg font-semibold text-[#172B3A]">
              Peer QR Authentication & Approver Role Governance
            </h2>
            <p className="text-xs text-[#172B3A]/65">
              Control who can scan 10-minute Peer QR codes to authenticate new service providers
              (requiring 1-month tenure unless granted an exceptional role) and who performs final
              role-based KYC approval.
            </p>

            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <label className="block text-xs font-medium text-[#172B3A]/75">
                  Minimum Account Age to Vouch (Days)
                </label>
                <input
                  type="number"
                  min={0}
                  max={365}
                  value={minAccountAgeDays}
                  onChange={(e) => setMinAccountAgeDays(Number(e.target.value))}
                  className="mt-1 h-10 w-full rounded-lg border border-[#172B3A]/15 px-3 font-mono text-xs"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-[#172B3A]/75">
                  QR Token Expiry (Minutes)
                </label>
                <input
                  type="number"
                  min={1}
                  max={60}
                  value={qrExpiryMinutes}
                  onChange={(e) => setQrExpiryMinutes(Number(e.target.value))}
                  className="mt-1 h-10 w-full rounded-lg border border-[#172B3A]/15 px-3 font-mono text-xs"
                />
              </div>
            </div>

            <label className="inline-flex cursor-pointer items-center gap-2 text-xs font-medium text-[#172B3A]">
              <input
                type="checkbox"
                checked={requirePeerQrAfterFirstProvider}
                onChange={(e) => setRequirePeerQrAfterFirstProvider(e.target.checked)}
                className="h-4 w-4 accent-[#176B52]"
              />
              Require Peer QR Vouching after First Provider Bootstrap
            </label>

            <div className="space-y-2 border-t border-[#172B3A]/10 pt-3">
              <p className="text-xs font-semibold text-[#172B3A]">
                Roles Permitted to Scan Peer QR Codes
              </p>
              <div className="flex flex-wrap gap-2">
                {ALL_PLATFORM_ROLES.map((r) => (
                  <label
                    key={`av-${r}`}
                    className="inline-flex cursor-pointer items-center gap-1.5 rounded border border-[#172B3A]/15 bg-[#F4F6F5] px-2.5 py-1 text-[11px] font-medium"
                  >
                    <input
                      type="checkbox"
                      checked={allowedVoucherRoles.includes(r)}
                      onChange={() =>
                        toggleRoleInList(allowedVoucherRoles, setAllowedVoucherRoles, r)
                      }
                      className="accent-[#176B52]"
                    />
                    {r}
                  </label>
                ))}
              </div>
            </div>

            <div className="space-y-2">
              <p className="text-xs font-semibold text-[#172B3A]">
                Exceptional Voucher Roles (Bypass {minAccountAgeDays}-Day Age Rule)
              </p>
              <div className="flex flex-wrap gap-2">
                {ALL_PLATFORM_ROLES.map((r) => (
                  <label
                    key={`ev-${r}`}
                    className="inline-flex cursor-pointer items-center gap-1.5 rounded border border-[#172B3A]/15 bg-amber-50/60 px-2.5 py-1 text-[11px] font-medium"
                  >
                    <input
                      type="checkbox"
                      checked={exceptionalVoucherRoles.includes(r)}
                      onChange={() =>
                        toggleRoleInList(exceptionalVoucherRoles, setExceptionalVoucherRoles, r)
                      }
                      className="accent-[#176B52]"
                    />
                    {r}
                  </label>
                ))}
              </div>
            </div>

            <div className="space-y-2">
              <p className="text-xs font-semibold text-[#172B3A]">
                Roles Authorized for Final Provider KYC Approval
              </p>
              <div className="flex flex-wrap gap-2">
                {ALL_PLATFORM_ROLES.map((r) => (
                  <label
                    key={`ap-${r}`}
                    className="inline-flex cursor-pointer items-center gap-1.5 rounded border border-[#172B3A]/15 bg-emerald-50/50 px-2.5 py-1 text-[11px] font-medium"
                  >
                    <input
                      type="checkbox"
                      checked={allowedApproverRoles.includes(r)}
                      onChange={() =>
                        toggleRoleInList(allowedApproverRoles, setAllowedApproverRoles, r)
                      }
                      className="accent-[#176B52]"
                    />
                    {r}
                  </label>
                ))}
              </div>
            </div>

            <button
              type="submit"
              className="min-h-[44px] rounded-lg bg-[#172B3A] px-5 py-2.5 text-xs font-semibold text-white hover:bg-[#176B52]"
            >
              Save Peer QR & Approver Governance
            </button>
          </form>

          {/* Single Platform Commission Collection Account (Chapa & Payo) */}
          <form
            onSubmit={handleSaveCommissionAccount}
            className="space-y-4 rounded-2xl border border-[#176B52]/25 bg-white p-6 lg:col-span-2"
          >
            <div className="flex flex-wrap items-start justify-between gap-3 border-b border-[#172B3A]/10 pb-3">
              <div>
                <h2 className="flex items-center gap-2 font-display text-lg font-semibold text-[#172B3A]">
                  <Landmark className="h-5 w-5 text-[#176B52]" />
                  Single Platform Commission Collection Account (Chapa &amp; Payo)
                </h2>
                <p className="mt-1 text-xs text-[#172B3A]/65">
                  All platform commission across every merchant order, service booking, and delivery
                  routes into this single centralized account while service providers collect their
                  net sales in their own accounts.
                </p>
              </div>
              <div className="flex flex-wrap items-center gap-4 text-xs font-semibold">
                <label className="inline-flex cursor-pointer items-center gap-1.5">
                  <input
                    type="checkbox"
                    checked={commAcct.chapaEnabled}
                    onChange={(e) =>
                      setCommAcct((p) => ({ ...p, chapaEnabled: e.target.checked }))
                    }
                    className="h-4 w-4 accent-[#176B52]"
                  />
                  Chapa Enabled
                </label>
                <label className="inline-flex cursor-pointer items-center gap-1.5">
                  <input
                    type="checkbox"
                    checked={commAcct.payoEnabled}
                    onChange={(e) =>
                      setCommAcct((p) => ({ ...p, payoEnabled: e.target.checked }))
                    }
                    className="h-4 w-4 accent-[#176B52]"
                  />
                  Payo Enabled
                </label>
              </div>
            </div>

            <div className="grid gap-4 sm:grid-cols-3">
              <div>
                <label className="block text-xs font-medium text-[#172B3A]/75">
                  Commission Account Holder
                </label>
                <input
                  required
                  type="text"
                  value={commAcct.accountHolderName}
                  onChange={(e) =>
                    setCommAcct((p) => ({ ...p, accountHolderName: e.target.value }))
                  }
                  className="mt-1 h-10 w-full rounded-lg border border-[#172B3A]/15 px-3 text-xs"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-[#172B3A]/75">
                  Ethiopian Settlement Bank
                </label>
                <select
                  value={commAcct.bankCode}
                  onChange={(e) => {
                    const code = e.target.value;
                    const matched = banks.find((b) => b.code === code);
                    setCommAcct((p) => ({
                      ...p,
                      bankCode: code,
                      bankName: matched?.name || p.bankName,
                    }));
                  }}
                  className="mt-1 h-10 w-full rounded-lg border border-[#172B3A]/15 bg-[#F4F6F5] px-3 text-xs"
                >
                  {(banks.length > 0
                    ? banks
                    : [
                        { code: '130', name: 'Commercial Bank of Ethiopia (CBE)', currency: 'ETB' },
                        { code: '855', name: 'Telebirr', currency: 'ETB' },
                      ]
                  ).map((b) => (
                    <option key={b.code} value={b.code}>
                      {b.name}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-[#172B3A]/75">
                  Central Commission Account Number
                </label>
                <input
                  required
                  type="text"
                  value={commAcct.accountNumber}
                  onChange={(e) =>
                    setCommAcct((p) => ({ ...p, accountNumber: e.target.value }))
                  }
                  className="mt-1 h-10 w-full rounded-lg border border-[#172B3A]/15 px-3 font-mono text-xs"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-[#172B3A]/75">
                  Telebirr Commission Wallet
                </label>
                <input
                  type="tel"
                  value={commAcct.telebirrNumber || ''}
                  onChange={(e) =>
                    setCommAcct((p) => ({ ...p, telebirrNumber: e.target.value }))
                  }
                  placeholder="+251 9..."
                  className="mt-1 h-10 w-full rounded-lg border border-[#172B3A]/15 px-3 font-mono text-xs"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-[#172B3A]/75">
                  Chapa Settlement Label
                </label>
                <input
                  type="text"
                  value={commAcct.chapaSettlementLabel || ''}
                  onChange={(e) =>
                    setCommAcct((p) => ({ ...p, chapaSettlementLabel: e.target.value }))
                  }
                  className="mt-1 h-10 w-full rounded-lg border border-[#172B3A]/15 px-3 font-mono text-xs"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-[#172B3A]/75">
                  Payo Pool Account Handle
                </label>
                <input
                  type="text"
                  value={commAcct.payoAccountHandle || ''}
                  onChange={(e) =>
                    setCommAcct((p) => ({ ...p, payoAccountHandle: e.target.value }))
                  }
                  className="mt-1 h-10 w-full rounded-lg border border-[#172B3A]/15 px-3 font-mono text-xs"
                />
              </div>
            </div>

            <button
              type="submit"
              disabled={savingCommAcct}
              className="min-h-[44px] rounded-lg bg-[#176B52] px-5 py-2.5 text-xs font-semibold text-white hover:bg-[#125641] disabled:opacity-60"
            >
              {savingCommAcct
                ? 'Saving Commission Account...'
                : 'Save Single Platform Commission Account'}
            </button>
          </form>
        </div>
      )}

      {/* TAB 6: GOVERNMENT TAX CONTROL REPORT & ESCROW DISPUTE RESOLUTION */}
      {tab === 'TAX_REPORT' && (
        <div className="space-y-8">
          <div className="rounded-2xl border border-[#172B3A]/10 bg-white p-6 space-y-5">
            <div className="flex flex-wrap items-start justify-between gap-4 border-b border-[#172B3A]/10 pb-4">
              <div>
                <h2 className="flex items-center gap-2 font-display text-xl font-bold text-[#172B3A]">
                  <Landmark className="h-5 w-5 text-[#176B52]" />
                  {t.taxReportTitle}
                </h2>
                <p className="mt-1 text-xs text-[#172B3A]/70">{t.taxReportSubtitle}</p>
              </div>
              <div className="flex flex-wrap gap-2 print:hidden">
                <button
                  type="button"
                  onClick={loadTaxReport}
                  className="inline-flex min-h-[38px] items-center gap-1.5 rounded-lg border border-[#172B3A]/15 px-3 py-1.5 text-xs font-semibold text-[#172B3A] hover:bg-[#F4F6F5]"
                >
                  <RefreshCw className="h-3.5 w-3.5" />
                  {t.refreshReport}
                </button>
                <button
                  type="button"
                  onClick={handleExportTaxCsv}
                  disabled={!taxReport}
                  className="inline-flex min-h-[38px] items-center gap-1.5 rounded-lg bg-[#176B52] px-3.5 py-1.5 text-xs font-semibold text-white hover:bg-[#125641] disabled:opacity-50"
                >
                  <Download className="h-3.5 w-3.5" />
                  {t.exportCsv}
                </button>
                <button
                  type="button"
                  onClick={() => window.print()}
                  className="inline-flex min-h-[38px] items-center gap-1.5 rounded-lg bg-[#172B3A] px-3.5 py-1.5 text-xs font-semibold text-white"
                >
                  <Printer className="h-3.5 w-3.5" />
                  {t.printReport}
                </button>
              </div>
            </div>

            {/* Tax Filters */}
            <div className="grid gap-3 sm:grid-cols-4 print:hidden">
              <div>
                <label className="block text-[11px] font-medium text-[#172B3A]/65">From Date</label>
                <input
                  type="date"
                  value={taxFromDate}
                  onChange={(e) => setTaxFromDate(e.target.value)}
                  className="mt-1 h-9 w-full rounded-lg border border-[#172B3A]/15 px-2.5 text-xs"
                />
              </div>
              <div>
                <label className="block text-[11px] font-medium text-[#172B3A]/65">To Date</label>
                <input
                  type="date"
                  value={taxToDate}
                  onChange={(e) => setTaxToDate(e.target.value)}
                  className="mt-1 h-9 w-full rounded-lg border border-[#172B3A]/15 px-2.5 text-xs"
                />
              </div>
              <div>
                <label className="block text-[11px] font-medium text-[#172B3A]/65">
                  Payment Channel
                </label>
                <select
                  value={taxPaymentFilter}
                  onChange={(e) => setTaxPaymentFilter(e.target.value)}
                  className="mt-1 h-9 w-full rounded-lg border border-[#172B3A]/15 bg-[#F4F6F5] px-2.5 text-xs"
                >
                  <option value="ALL">All Payment Methods</option>
                  <option value="CHAPA">Chapa Split Pay</option>
                  <option value="PAYO">Payo Direct Transfer</option>
                  <option value="TELEBIRR">Telebirr (Digital)</option>
                  <option value="CBE_BIRR">CBE Birr (Digital)</option>
                  <option value="DIGITAL_BANK">Digital Bank</option>
                  <option value="CASH">Cash (Tracked)</option>
                </select>
              </div>
              <div>
                <label className="block text-[11px] font-medium text-[#172B3A]/65">
                  Taxpayer / Business
                </label>
                <select
                  value={taxBusinessFilter}
                  onChange={(e) => setTaxBusinessFilter(e.target.value)}
                  className="mt-1 h-9 w-full rounded-lg border border-[#172B3A]/15 bg-[#F4F6F5] px-2.5 text-xs"
                >
                  <option value="ALL">All Registered Businesses & Couriers</option>
                  {businesses.map((b) => (
                    <option key={b.id} value={String(b.id)}>
                      {b.businessName} {b.tinNumber ? `(TIN ${b.tinNumber})` : ''}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            {loadingTax && !taxReport ? (
              <p className="py-8 text-center text-xs text-[#172B3A]/60">
                Aggregating government tax ledger...
              </p>
            ) : (
              taxReport && (
                <>
                  {/* 6 Fiscal KPI Cards */}
                  <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-6">
                    <div className="rounded-xl border border-[#176B52]/30 bg-emerald-50/40 p-4">
                      <p className="text-[11px] font-medium text-[#172B3A]/70">{t.totalTaxDue}</p>
                      <p className="mt-1 font-mono text-lg font-bold tabular-nums text-[#176B52]">
                        {formatEtb(taxReport.summary.totalTaxDueEtb)}
                      </p>
                    </div>
                    <div className="rounded-xl border border-[#172B3A]/10 bg-[#F4F6F5]/60 p-4">
                      <p className="text-[11px] font-medium text-[#172B3A]/70">{t.vatCollected}</p>
                      <p className="mt-1 font-mono text-lg font-bold tabular-nums text-[#172B3A]">
                        {formatEtb(taxReport.summary.totalVatCollectedEtb)}
                      </p>
                    </div>
                    <div className="rounded-xl border border-[#172B3A]/10 bg-[#F4F6F5]/60 p-4">
                      <p className="text-[11px] font-medium text-[#172B3A]/70">{t.whtCollected}</p>
                      <p className="mt-1 font-mono text-lg font-bold tabular-nums text-[#172B3A]">
                        {formatEtb(taxReport.summary.totalWithholdingTaxEtb)}
                      </p>
                    </div>
                    <div className="rounded-xl border border-[#172B3A]/10 bg-[#F4F6F5]/60 p-4">
                      <p className="text-[11px] font-medium text-[#172B3A]/70">{t.taxableBase}</p>
                      <p className="mt-1 font-mono text-lg font-bold tabular-nums text-[#172B3A]">
                        {formatEtb(taxReport.summary.totalTaxableBaseEtb)}
                      </p>
                    </div>
                    <div className="rounded-xl border border-[#172B3A]/10 bg-[#F4F6F5]/60 p-4">
                      <p className="text-[11px] font-medium text-[#172B3A]/70">
                        {t.digitalCompliance}
                      </p>
                      <p className="mt-1 font-mono text-lg font-bold tabular-nums text-[#176B52]">
                        {taxReport.summary.digitalComplianceRatePercent}%
                      </p>
                    </div>
                    <div className="rounded-xl border border-[#172B3A]/10 bg-[#F4F6F5]/60 p-4">
                      <p className="text-[11px] font-medium text-[#172B3A]/70">{t.escrowHeldKpi}</p>
                      <p className="mt-1 font-mono text-sm font-bold tabular-nums text-[#172B3A]">
                        {formatEtb(taxReport.summary.escrowHeldTotalEtb)}
                      </p>
                      <p className="font-mono text-[11px] font-semibold text-red-700">
                        Disputes: {taxReport.summary.activeDisputeCount}
                      </p>
                    </div>
                  </div>

                  {/* Digital vs Cash Tax Audit Strip */}
                  <div className="grid gap-4 sm:grid-cols-2 text-xs">
                    <div className="rounded-xl border border-[#176B52]/20 bg-emerald-50/30 p-4 flex justify-between gap-3">
                      <div>
                        <p className="font-semibold text-[#176B52]">
                          Digital Payments (Chapa / Payo / Telebirr / CBE / Bank)
                        </p>
                        <p className="text-[#172B3A]/65">
                          Gross Traceable Volume: {formatEtb(taxReport.summary.digitalGrossEtb)}
                        </p>
                        <p className="mt-0.5 font-mono text-[11px] text-[#176B52]">
                          Chapa: {formatEtb(taxReport.summary.chapaGrossEtb || 0)} · Payo:{' '}
                          {formatEtb(taxReport.summary.payoGrossEtb || 0)}
                        </p>
                      </div>
                      <p className="font-mono font-bold text-[#176B52] tabular-nums shrink-0">
                        {taxReport.summary.digitalComplianceRatePercent}% Traceable
                      </p>
                    </div>
                    <div className="rounded-xl border border-amber-200 bg-amber-50/40 p-4 flex justify-between gap-3">
                      <div>
                        <p className="font-semibold text-amber-900">
                          Cash / COD Declared Transactions
                        </p>
                        <p className="text-[#172B3A]/65">
                          Gross Cash Volume: {formatEtb(taxReport.summary.cashGrossEtb)}
                        </p>
                      </div>
                      <p className="font-mono font-bold text-amber-900 tabular-nums shrink-0">
                        Commission: {formatEtb(taxReport.summary.totalPlatformCommissionEtb)}
                      </p>
                    </div>
                  </div>
                </>
              )
            )}
          </div>

          {/* Anti-Theft Escrow & Structured Conflict Resolution Queue */}
          <div className="rounded-2xl border border-[#172B3A]/10 bg-white p-6 space-y-4">
            <h3 className="flex items-center gap-2 font-display text-lg font-bold text-[#172B3A]">
              <AlertTriangle className="h-5 w-5 text-red-600" />
              {t.disputesQueueTitle} ({disputedDeliveries.length})
            </h3>
            {disputedDeliveries.length === 0 ? (
              <p className="text-xs text-[#172B3A]/60">
                No frozen delivery or conflict disputes currently pending investigation.
              </p>
            ) : (
              <div className="space-y-4">
                {disputedDeliveries.map((d) => (
                  <div
                    key={d.id}
                    className="space-y-3 rounded-xl border border-red-200 bg-red-50/40 p-4 text-xs"
                  >
                    <div className="flex flex-wrap items-start justify-between gap-2">
                      <div className="space-y-1">
                        <p className="font-mono font-bold text-[#172B3A]">
                          {d.trackingCode} · {d.pickupLocation} → {d.destinationLocation}
                        </p>
                        <div className="flex flex-wrap gap-2 text-[11px] font-mono">
                          <span className="rounded bg-red-100 px-2 py-0.5 font-semibold text-red-800">
                            Category: {d.conflictCategory || 'HANDOVER_DISPUTE'}
                          </span>
                          <span className="rounded bg-white px-2 py-0.5 font-semibold text-[#172B3A]">
                            Raised By: {d.conflictRaisedByRole || 'PARTY'}
                          </span>
                          <span className="rounded bg-white px-2 py-0.5 font-semibold text-[#176B52]">
                            Status: {d.conflictStatus || 'OPEN'}
                          </span>
                        </div>
                      </div>
                      <div className="font-mono font-bold text-red-800">
                        Escrow Frozen: {formatEtb(d.escrowAmount || d.totalFee)} · Value:{' '}
                        {formatEtb(d.declaredValue || 0)}
                      </div>
                    </div>

                    <p className="text-red-900">
                      <strong>Claim:</strong> {d.disputeReason || 'Dispute reported'}
                    </p>
                    {d.conflictCounterStatement && (
                      <p className="rounded-lg border border-[#172B3A]/15 bg-white p-2.5 text-[#172B3A]">
                        <strong>Opposing Counter-Statement:</strong> {d.conflictCounterStatement}
                      </p>
                    )}

                    <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                      <input
                        type="text"
                        value={conflictNotes[d.id] || ''}
                        onChange={(e) =>
                          setConflictNotes((prev) => ({ ...prev, [d.id]: e.target.value }))
                        }
                        placeholder="Optional investigation resolution note..."
                        className="h-10 flex-1 rounded-lg border border-[#172B3A]/15 bg-white px-3 text-xs"
                      />
                      <div className="flex flex-wrap gap-2">
                        <button
                          type="button"
                          onClick={() => handleResolveConflict(d.id, 'REFUND_SENDER')}
                          className="min-h-[38px] rounded-lg bg-red-700 px-3 py-1.5 font-semibold text-white hover:bg-red-800"
                        >
                          {t.resolveRefund}
                        </button>
                        <button
                          type="button"
                          onClick={() => handleResolveConflict(d.id, 'RELEASE_DRIVER')}
                          className="min-h-[38px] rounded-lg bg-[#176B52] px-3 py-1.5 font-semibold text-white hover:bg-[#125641]"
                        >
                          {t.resolveRelease}
                        </button>
                        <button
                          type="button"
                          onClick={() => handleResolveConflict(d.id, 'SPLIT_SETTLEMENT')}
                          className="min-h-[38px] rounded-lg bg-[#F4A62A] px-3 py-1.5 font-bold text-[#172B3A]"
                        >
                          Split Settlement
                        </button>
                        <button
                          type="button"
                          onClick={() => handleResolveConflict(d.id, 'REASSIGN_DRIVER')}
                          className="min-h-[38px] rounded-lg bg-[#172B3A] px-3 py-1.5 font-semibold text-white"
                        >
                          Reassign Driver
                        </button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Registered Taxpayer Breakdown */}
          {taxReport && (
            <div className="rounded-2xl border border-[#172B3A]/10 bg-white overflow-hidden">
              <div className="border-b border-[#172B3A]/10 px-5 py-4">
                <h3 className="font-display text-base font-bold text-[#172B3A]">
                  {t.taxpayerBreakdownTitle}
                </h3>
              </div>

              {/* Mobile Cards (< md) */}
              <div className="divide-y divide-[#172B3A]/10 md:hidden">
                {taxReport.taxpayers.length === 0 ? (
                  <p className="p-6 text-center text-xs text-[#172B3A]/60">
                    No taxable transactions matched the selected filters.
                  </p>
                ) : (
                  taxReport.taxpayers.map((tp, idx) => (
                    <div key={`mtp-${idx}`} className="p-4 space-y-1.5 text-xs">
                      <div className="flex justify-between gap-2">
                        <span className="font-semibold text-[#172B3A]">{tp.businessName}</span>
                        <span className="font-mono font-bold text-[#176B52]">
                          {formatEtb(tp.totalTaxDue)}
                        </span>
                      </div>
                      <p className="font-mono text-[11px] text-[#172B3A]/65">
                        TIN: {tp.tinNumber || 'PENDING-TIN'} · {tp.transactionCount} tx · Base:{' '}
                        {formatEtb(tp.taxableAmount)}
                      </p>
                    </div>
                  ))
                )}
              </div>

              {/* Desktop Table (>= md) */}
              <div className="hidden md:block overflow-x-auto">
                <table className="w-full min-w-[820px] text-left text-xs">
                  <thead className="border-b border-[#172B3A]/10 bg-[#F4F6F5] text-[#172B3A]/70">
                    <tr>
                      <th className="px-4 py-3 font-semibold">Taxpayer / Entity</th>
                      <th className="px-4 py-3 font-semibold">TIN & Trade License</th>
                      <th className="px-4 py-3 font-semibold text-right">Tx Count</th>
                      <th className="px-4 py-3 font-semibold text-right">Taxable Base</th>
                      <th className="px-4 py-3 font-semibold text-right">VAT (15%)</th>
                      <th className="px-4 py-3 font-semibold text-right">WHT (2%)</th>
                      <th className="px-4 py-3 font-semibold text-right">Total Tax Due</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#172B3A]/10">
                    {taxReport.taxpayers.length === 0 ? (
                      <tr>
                        <td colSpan={7} className="px-4 py-8 text-center text-[#172B3A]/60">
                          No taxable transactions matched the selected filters.
                        </td>
                      </tr>
                    ) : (
                      taxReport.taxpayers.map((tp, idx) => (
                        <tr key={idx}>
                          <td className="px-4 py-3">
                            <p className="font-semibold text-[#172B3A]">{tp.businessName}</p>
                            <p className="text-[#172B3A]/60">{tp.subCity}</p>
                          </td>
                          <td className="px-4 py-3 font-mono text-[11px]">
                            <p>TIN: {tp.tinNumber || 'PENDING-TIN'}</p>
                            <p className="text-[#172B3A]/55">{tp.licenseNumber}</p>
                          </td>
                          <td className="px-4 py-3 text-right font-mono tabular-nums">
                            {tp.transactionCount}
                          </td>
                          <td className="px-4 py-3 text-right font-mono tabular-nums">
                            {formatEtb(tp.taxableAmount)}
                          </td>
                          <td className="px-4 py-3 text-right font-mono tabular-nums">
                            {formatEtb(tp.vatAmount)}
                          </td>
                          <td className="px-4 py-3 text-right font-mono tabular-nums">
                            {formatEtb(tp.withholdingTaxAmount)}
                          </td>
                          <td className="px-4 py-3 text-right font-mono font-bold tabular-nums text-[#176B52]">
                            {formatEtb(tp.totalTaxDue)}
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* Itemized Government Fiscal Receipt Ledger */}
          {taxReport && (
            <div className="rounded-2xl border border-[#172B3A]/10 bg-white overflow-hidden">
              <div className="border-b border-[#172B3A]/10 px-5 py-4">
                <h3 className="font-display text-base font-bold text-[#172B3A]">
                  {t.fiscalLedgerTitle} ({taxReport.ledger.length})
                </h3>
              </div>

              {/* Mobile Cards (< md) */}
              <div className="divide-y divide-[#172B3A]/10 md:hidden">
                {taxReport.ledger.map((row) => (
                  <div key={`mled-${row.id}`} className="p-4 space-y-1.5 text-xs">
                    <div className="flex justify-between gap-2 font-mono">
                      <span className="font-semibold text-[#172B3A]">
                        {row.fiscalReceiptNumber || `NY-REC-${row.id}`}
                      </span>
                      <span className="font-bold text-[#176B52]">
                        {formatEtb(row.vatAmount + row.withholdingTaxAmount)}
                      </span>
                    </div>
                    <p className="text-[#172B3A]/80">
                      {row.businessName} · {row.transactionType} · {row.paymentMethod}
                    </p>
                    <p className="font-mono text-[11px] text-[#172B3A]/60">
                      Base: {formatEtb(row.taxableAmount)} · VAT: {formatEtb(row.vatAmount)}
                    </p>
                  </div>
                ))}
              </div>

              {/* Desktop Table (>= md) */}
              <div className="hidden md:block overflow-x-auto">
                <table className="w-full min-w-[900px] text-left text-xs">
                  <thead className="border-b border-[#172B3A]/10 bg-[#F4F6F5] text-[#172B3A]/70">
                    <tr>
                      <th className="px-4 py-3 font-semibold">Fiscal Receipt</th>
                      <th className="px-4 py-3 font-semibold">Tx Ref & Source</th>
                      <th className="px-4 py-3 font-semibold">Taxpayer / TIN</th>
                      <th className="px-4 py-3 font-semibold">Payment &amp; Split Accounts</th>
                      <th className="px-4 py-3 font-semibold text-right">Taxable</th>
                      <th className="px-4 py-3 font-semibold text-right">VAT 15%</th>
                      <th className="px-4 py-3 font-semibold text-right">WHT 2%</th>
                      <th className="px-4 py-3 font-semibold text-right">Total Tax</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#172B3A]/10">
                    {taxReport.ledger.map((row) => (
                      <tr key={row.id}>
                        <td className="px-4 py-3 font-mono font-semibold text-[#172B3A]">
                          <p>{row.fiscalReceiptNumber || `NY-REC-${row.id}`}</p>
                          <p className="text-[10px] text-[#172B3A]/55">{row.taxPeriod}</p>
                        </td>
                        <td className="px-4 py-3 font-mono text-[11px]">
                          <p>{row.transactionRef}</p>
                          <p className="text-[#172B3A]/55">{row.transactionType}</p>
                        </td>
                        <td className="px-4 py-3">
                          <p className="font-medium text-[#172B3A]">{row.businessName}</p>
                          <p className="font-mono text-[10px] text-[#172B3A]/55">
                            TIN: {row.tinNumber || 'Platform'}
                          </p>
                        </td>
                        <td className="px-4 py-3 font-mono text-[11px]">
                          <p className="font-semibold text-[#172B3A]">
                            {row.gateway || row.paymentMethod}
                          </p>
                          {row.providerPayoutAccount && (
                            <p className="text-[10px] text-[#176B52] truncate max-w-[200px]">
                              Provider: {row.providerPayoutAccount}
                            </p>
                          )}
                          {row.platformCommissionAccount && (
                            <p className="text-[10px] text-[#172B3A]/55 truncate max-w-[200px]">
                              Comm: {row.platformCommissionAccount}
                            </p>
                          )}
                        </td>
                        <td className="px-4 py-3 text-right font-mono tabular-nums">
                          {formatEtb(row.taxableAmount)}
                        </td>
                        <td className="px-4 py-3 text-right font-mono tabular-nums">
                          {formatEtb(row.vatAmount)}
                        </td>
                        <td className="px-4 py-3 text-right font-mono tabular-nums">
                          {formatEtb(row.withholdingTaxAmount)}
                        </td>
                        <td className="px-4 py-3 text-right font-mono font-bold tabular-nums text-[#176B52]">
                          {formatEtb(row.vatAmount + row.withholdingTaxAmount)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      )}

      {tab === 'AUDIT' && (
        <div className="overflow-x-auto rounded-2xl border border-[#172B3A]/10 bg-white">
          <table className="w-full min-w-[720px] text-left text-xs">
            <thead className="border-b border-[#172B3A]/10 bg-[#F4F6F5] text-[#172B3A]/70">
              <tr>
                <th className="px-4 py-3 font-semibold">Timestamp</th>
                <th className="px-4 py-3 font-semibold">Action</th>
                <th className="px-4 py-3 font-semibold">Entity</th>
                <th className="px-4 py-3 font-semibold">Details</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#172B3A]/10">
              {auditLogs.length === 0 ? (
                <tr>
                  <td colSpan={4} className="px-4 py-10 text-center text-[#172B3A]/60">
                    No audit actions logged yet.
                  </td>
                </tr>
              ) : (
                auditLogs.map((log) => (
                  <tr key={log.id}>
                    <td className="px-4 py-3 font-mono text-[#172B3A]/65">
                      {new Date(log.createdAt).toLocaleString()}
                    </td>
                    <td className="px-4 py-3 font-semibold text-[#172B3A]">{log.action}</td>
                    <td className="px-4 py-3 font-mono">
                      {log.entityType} #{log.entityId}
                    </td>
                    <td className="px-4 py-3 font-mono text-[11px] text-[#172B3A]/70">
                      {JSON.stringify(log.details || {})}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      )}

      {previewImage && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-[#172B3A]/70 p-4">
          <div className="w-full max-w-xl overflow-hidden rounded-2xl bg-white shadow-2xl">
            <div className="flex items-center justify-between border-b border-[#172B3A]/10 px-5 py-3">
              <p className="font-display text-sm font-semibold text-[#172B3A]">
                {previewImage.title}
              </p>
              <button
                type="button"
                onClick={() => setPreviewImage(null)}
                className="rounded-lg p-1.5 hover:bg-[#F4F6F5]"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="bg-[#F4F6F5] p-4">
              <img
                src={previewImage.url}
                alt={previewImage.title}
                className="max-h-[70vh] w-full rounded-lg object-contain"
              />
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
