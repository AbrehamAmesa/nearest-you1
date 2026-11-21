export interface PricingFormula {
  baseFee?: number;
  perKmRate?: number;
  perWorkerRate?: number;
  vehicleFee?: number;
  perSqmRate?: number;
  inspectionFee?: number;
  factors?: string[];
}

export interface ListingMetadata {
  brand?: string;
  sku?: string;
  stockQuantity?: number;
  variants?: string[];
  prepTimeMinutes?: number;
  durationMinutes?: number;
  deliveryAvailable?: boolean;
  immediateAcceptance?: boolean;
  estimatedReadyMinutes?: number;
  estimatedDeliveryMinutes?: number;
  deliveryWindowLabel?: string;
  returnable?: boolean;
  returnWindowDays?: number;
  returnLossPercent?: number;
  returnLossFixedEtb?: number;
  deliveryFeeNonRefundableOnReturn?: boolean;
  returnPolicyNote?: string;
  employmentType?: string;
  contractType?: string;
  vehicleType?: string;
  capacity?: string;
  licenseVerified?: boolean;
  schedule?: string;
  deliveryOptions?: string[];
  cvUrl?: string;
  cvFileName?: string;
  introVideoUrl?: string;
  companyLogoUrl?: string;
  advertiserRole?: string;
  skills?: string;
  experienceSummary?: string;
  availabilityNote?: string;
}

export interface Category {
  id: number;
  slug: string;
  parentId: number | null;
  name: string;
  nameAm: string;
  nameOm?: string | null;
  description: string;
  categoryType: string;
  defaultListingType?: string | null;
  requiresVerification: boolean;
  commissionRate: string;
  minPriceEtb: string;
  status: string;
  displayOrder: number;
}

export interface DocumentType {
  id: number;
  documentCode: string;
  documentName: string;
  documentNameAm?: string | null;
  documentNameOm?: string | null;
  description: string;
  defaultMandatory: boolean;
  defaultRequiresDocumentNumber: boolean;
  status: 'ACTIVE' | 'INACTIVE' | string;
  createdAt: string;
}

export interface CategoryDocumentRequirement {
  id: number;
  categoryId: number;
  documentTypeId?: number | null;
  documentCode: string;
  documentName: string;
  documentNameAm?: string | null;
  documentNameOm?: string | null;
  description: string;
  isMandatory: boolean;
  requiresDocumentNumber: boolean;
  createdAt: string;
}

export interface ProviderDocumentRecord {
  id: number;
  registrationId: number;
  requirementId: number;
  documentName: string;
  documentNumber: string | null;
  fileName: string;
  fileDataUrl: string;
  status: 'SUBMITTED' | 'VERIFIED' | 'REJECTED' | 'REVOKED';
  createdAt: string;
}

export interface ProviderRegistration {
  id: number;
  userUid: string;
  fullName: string;
  phoneNumber: string;
  serviceCategoryId: number;
  faydaIdNumber: string;
  faydaFrontImage?: string;
  profilePhotoImage?: string;
  livenessPassed: boolean;
  livenessScore: number;
  livenessChallenges: string[];
  livenessSelfieImage?: string;
  subCity: string;
  landmark: string;
  latitude: string;
  longitude: string;
  isLiveLocationActive: boolean;
  lastLocationUpdatedAt: string;
  qrVoucherToken?: string | null;
  qrExpiresAt?: string | null;
  vouchedByUid?: string | null;
  vouchedByName?: string | null;
  vouchedByEmail?: string | null;
  vouchedAt?: string | null;
  approvedByUid?: string | null;
  approvedByRole?: string | null;
  status: 'PENDING_PEER_AUTH' | 'PENDING_APPROVAL' | 'PENDING_REVIEW' | 'VERIFIED' | 'REJECTED' | 'REVOKED';
  reviewNotes: string | null;
  reviewedByUid: string | null;
  createdAt: string;
  updatedAt: string;
  documents?: ProviderDocumentRecord[];
}

export interface OnboardingGovernance {
  minAccountAgeDays: number;
  qrExpiryMinutes: number;
  allowedVoucherRoles: string[];
  exceptionalVoucherRoles: string[];
  allowedApproverRoles: string[];
  requirePeerQrAfterFirstProvider: boolean;
}

export interface LiveProviderPublicMarker {
  id: number;
  fullName: string;
  serviceCategoryId: number;
  subCity: string;
  landmark: string;
  latitude: string;
  longitude: string;
  isLiveLocationActive: boolean;
  lastLocationUpdatedAt: string;
  livenessPassed: boolean;
  status: string;
}

export interface Business {
  id: number;
  ownerUid: string;
  ownerFullName?: string | null;
  providerRegistrationId: number | null;
  businessName: string;
  description: string;
  categoryId: number;
  verificationStatus: 'SUBMITTED' | 'UNDER_REVIEW' | 'APPROVED' | 'REJECTED' | 'REVOKED' | 'SUSPENDED';
  licenseNumber: string;
  contactPhone: string;
  email: string;
  subCity: string;
  woreda: string;
  landmark: string;
  latitude: string;
  longitude: string;
  liveLocationActive: boolean;
  lastLocationPingAt: string;
  faydaVerified: boolean;
  livenessVerified: boolean;
  openingHours: string;
  ratingAvg: string;
  ratingCount: number;
  tinNumber?: string | null;
  profileType?: 'BUSINESS' | 'INDIVIDUAL_JOB_SEEKER' | string | null;
  isFeatured: boolean;
  createdAt: string;
}

export interface Listing {
  id: number;
  businessId: number;
  categoryId: number;
  listingType: string;
  title: string;
  description: string;
  imageUrl: string | null;
  imageUrls?: string[] | null;
  pricingModel: string;
  pricingUnit: string;
  basePrice: string;
  discountPrice: string | null;
  minimumCharge: string | null;
  calloutFee: string | null;
  depositAmount: string | null;
  salaryMax: string | null;
  currency: string;
  isQuoteBased: boolean;
  isUnpaid: boolean;
  pricingFormula: PricingFormula | null;
  metadata: ListingMetadata | null;
  availabilityStatus: string;
  status: string;
  ratingAvg: string;
  ratingCount: number;
  createdAt: string;
}

export interface ReviewItem {
  id: number;
  customerUid: string;
  customerName: string;
  businessId: number;
  listingId: number | null;
  transactionRef: string;
  rating: number;
  comment: string;
  createdAt: string;
}

export interface PlatformPolicy {
  currency: string;
  taxRatePercent: number;
  defaultCommissionPercent: number;
  deliveryBaseFee: number;
  deliveryPerKmRate: number;
  expressMultiplier: number;
  rideBaseFare: number;
  ridePerKmRate: number;
  deliveryMatchRadiusKm?: number;
}

export interface CartItem {
  listing: Listing;
  business: Business;
  quantity: number;
  variant?: string;
}

export interface OrderRecord {
  id: number;
  orderNumber: string;
  customerUid: string;
  customerName: string;
  businessId: number;
  orderType: string;
  itemsSnapshot: Array<{
    listingId: number;
    title: string;
    quantity: number;
    unitPrice: number;
    lineTotal: number;
    variant?: string;
  }>;
  subtotal: string;
  deliveryFee: string;
  taxAmount: string;
  discountAmount: string;
  totalAmount: string;
  currency: string;
  fulfillmentType: string;
  deliveryAddress: string;
  paymentMethod: string;
  paymentStatus: string;
  orderStatus: string;
  immediateAcceptance?: boolean;
  estimatedReadyMinutes?: number | null;
  estimatedDeliveryMinutes?: number | null;
  estimatedReadyAt?: string | null;
  estimatedDeliveryAt?: string | null;
  acceptedAt?: string | null;
  rejectionReason?: string | null;
  returnPolicySnapshot?: {
    deliveryAvailable?: boolean;
    returnable?: boolean;
    returnWindowDays?: number;
    returnLossPercent?: number;
    returnLossFixedEtb?: number;
    deliveryFeeNonRefundableOnReturn?: boolean;
    estimatedItemLossOnReturnEtb?: number;
    estimatedDeliveryLossOnReturnEtb?: number;
    estimatedTotalLossOnReturnEtb?: number;
    returnPolicyNote?: string;
  } | null;
  createdAt: string;
}

export interface BookingRecord {
  id: number;
  bookingReference: string;
  customerUid: string;
  customerName: string;
  businessId: number;
  listingId: number;
  bookingType: string;
  scheduledDate: string;
  endDate: string | null;
  scheduledTime: string;
  parameters: Record<string, number | string> | null;
  priceBreakdown: Array<{ label: string; amount: number }>;
  agreedPrice: string;
  depositAmount: string;
  quotedPrice: string | null;
  quoteApproved: boolean;
  currency: string;
  paymentMethod: string;
  paymentStatus: string;
  bookingStatus: string;
  notes: string | null;
  createdAt: string;
}

export interface DeliveryRecord {
  id: number;
  trackingCode: string;
  requestType: 'DELIVERY' | 'RIDE';
  customerUid: string;
  customerName: string;
  driverUid: string | null;
  driverName: string | null;
  pickupLocation: string;
  pickupLat?: string | null;
  pickupLng?: string | null;
  pickupPlaceId?: string | null;
  destinationLocation: string;
  destinationLat?: string | null;
  destinationLng?: string | null;
  destinationPlaceId?: string | null;
  packageOrRideDetails: string;
  receiverName?: string | null;
  receiverPhone?: string | null;
  declaredValue?: string;
  vehicleType: string;
  urgency: string;
  distanceKm: string;
  priceBreakdown: Array<{ label: string; amount: number }>;
  taxAmount?: string;
  totalFee: string;
  currency: string;
  paymentMethod: string;
  pickupOtp?: string | null;
  deliveryOtp?: string | null;
  pickupOtpRequired?: boolean;
  deliveryOtpRequired?: boolean;
  escrowStatus?: 'HELD_IN_ESCROW' | 'COD_TRACKED' | 'RELEASED' | 'FROZEN_DISPUTE' | 'REFUNDED' | 'CANCELLED' | string;
  escrowAmount?: string;
  pickupConfirmedAt?: string | null;
  deliveredConfirmedAt?: string | null;
  disputeReason?: string | null;
  driverLat?: string | null;
  driverLng?: string | null;
  driverLocationUpdatedAt?: string | null;
  distanceToPickupKm?: number | null;
  conflictStatus?: 'NONE' | 'OPEN' | 'ESCALATED' | 'RESOLVED' | string;
  conflictCategory?: string | null;
  conflictRaisedByUid?: string | null;
  conflictRaisedByRole?: string | null;
  conflictCounterStatement?: string | null;
  conflictResolution?: string | null;
  conflictResolvedAt?: string | null;
  status: string;
  createdAt: string;
}

export interface JobApplicationRecord {
  id: number;
  listingId: number;
  businessId: number;
  applicantUid: string;
  applicantName: string;
  applicantPhone: string;
  skills: string;
  experienceYears: number;
  expectedCompensation: string;
  coverLetter: string;
  applicationStatus: string;
  createdAt: string;
}

export interface CommissionRecord {
  id: number;
  transactionRef: string;
  transactionType: string;
  businessId: number | null;
  grossAmount: string;
  taxableAmount?: string;
  vatAmount?: string;
  withholdingTaxAmount?: string;
  commissionRate: string;
  commissionAmount: string;
  providerAmount: string;
  fiscalReceiptNumber?: string | null;
  taxPeriod?: string | null;
  currency: string;
  paymentMethod: string;
  status: string;
  createdAt: string;
}

export interface GovernmentTaxReport {
  generatedAt: string;
  authority: string;
  currency: string;
  summary: {
    totalTransactions: number;
    totalGrossVolumeEtb: number;
    totalTaxableBaseEtb: number;
    totalVatCollectedEtb: number;
    totalWithholdingTaxEtb: number;
    totalTaxDueEtb: number;
    totalPlatformCommissionEtb: number;
    totalProviderNetEtb: number;
    digitalGrossEtb: number;
    cashGrossEtb: number;
    digitalComplianceRatePercent: number;
    escrowHeldTotalEtb: number;
    activeDisputeCount: number;
  };
  taxpayers: Array<{
    taxpayerKey: string;
    businessId: number | null;
    businessName: string;
    tinNumber: string;
    licenseNumber: string;
    subCity: string;
    transactionCount: number;
    grossAmount: number;
    taxableAmount: number;
    vatAmount: number;
    withholdingTaxAmount: number;
    commissionAmount: number;
    totalTaxDue: number;
  }>;
  ledger: Array<{
    id: number;
    transactionRef: string;
    transactionType: string;
    businessId: number | null;
    businessName: string;
    tinNumber: string;
    fiscalReceiptNumber: string;
    taxPeriod: string;
    grossAmount: number;
    taxableAmount: number;
    vatAmount: number;
    withholdingTaxAmount: number;
    commissionAmount: number;
    providerAmount: number;
    paymentMethod: string;
    status: string;
    createdAt: string;
  }>;
}

export interface AuditLogRecord {
  id: number;
  actorUid: string;
  actorEmail: string | null;
  action: string;
  entityType: string;
  entityId: string;
  details: Record<string, unknown> | null;
  createdAt: string;
}

export interface DbUserRecord {
  id: number;
  uid: string;
  firebaseUid?: string | null;
  hasPassword?: boolean;
  fullName: string;
  email: string;
  phoneNumber: string | null;
  preferredLanguage: string;
  defaultSubCity: string;
  roles: string[];
  isAdmin: boolean;
  canVouchEarly?: boolean;
  faydaIdNumber: string | null;
  profilePhotoUrl: string | null;
  livenessStatus: string;
  livenessVerifiedAt: string | null;
  providerVerificationStatus: string;
  accountStatus: string;
  lastSeenAt?: string | null;
  isActiveLastMinute?: boolean;
  createdAt: string;
}

export interface DetectedLocation {
  lat: number;
  lng: number;
  label: string;
  subCity?: string;
  city?: string;
  source: 'GPS' | 'IP_GEOLOCATION' | 'SAVED_PROFILE' | 'CITY_CENTER' | string;
  accuracyMode?: 'EXACT' | 'APPROXIMATE' | 'SAVED' | string;
  accuracyMeters?: number;
}

export interface RecommendedListingItem {
  listing: Listing;
  business: Business;
  category?: Category | null;
  distanceKm: number;
  effectivePrice: number | string;
  reason?: string;
}

export interface ImageSearchAnalysis {
  detectedItem: string;
  primaryQuery: string;
  categoryHint?: string;
  keywords: string[];
  summary?: string;
}

export interface ImageSearchResultItem {
  listing: Listing;
  business: Business;
  category?: Category | null;
  distanceKm: number;
  effectivePrice: number | string;
  matchScore?: number;
  visualImageMatch?: boolean;
}

export interface ChatMessage {
  id: number;
  senderUid: string;
  senderName: string;
  senderRole?: 'CUSTOMER' | 'PROVIDER' | 'ADMIN' | string | null;
  recipientUid?: string | null;
  businessId: number;
  listingId: number | null;
  orderId?: number | null;
  bookingId?: number | null;
  threadKey?: string | null;
  body: string;
  createdAt: string;
}

export interface ChatThreadSummary {
  threadKey: string;
  threadType: 'ORDER' | 'BOOKING' | 'SERVICE_CONTACT' | string;
  businessId: number;
  businessName: string;
  listingId: number | null;
  listingTitle: string | null;
  orderId: number | null;
  orderNumber: string | null;
  orderStatus: string | null;
  bookingId: number | null;
  bookingReference: string | null;
  otherPartyUid: string | null;
  otherPartyName: string | null;
  otherPartyLastSeenAt?: string | null;
  otherPartyActiveLastMinute?: boolean;
  viewerIsOwner?: boolean;
  messageCount: number;
  lastMessage: ChatMessage;
}

export interface ServiceContractRecord {
  id: number;
  contractReference: string;
  threadKey: string;
  businessId: number;
  listingId: number | null;
  bookingId: number | null;
  serviceGiverUid: string;
  serviceGiverName: string;
  clientUid: string;
  clientName: string;
  offeredByUid: string;
  offeredByRole: 'CUSTOMER' | 'PROVIDER' | string;
  contractType: 'ONE_TIME_CONTRACT' | 'FULL_TIME' | 'PER_HOUR' | 'PER_DAY' | 'PER_MONTH' | string;
  title: string;
  scopeSummary: string;
  deliverables?: string | null;
  paymentSchedule: 'ON_COMPLETION' | 'MILESTONE' | 'UPFRONT_ESCROW' | 'MONTHLY' | 'WEEKLY' | string;
  agreedAmount: string;
  hourlyRate?: string | null;
  estimatedHours?: number | null;
  startDate?: string | null;
  endDate?: string | null;
  status:
    | 'OFFERED'
    | 'COUNTERED'
    | 'ACCEPTED'
    | 'ACTIVE'
    | 'COMPLETED'
    | 'DECLINED'
    | 'CANCELLED'
    | string;
  counterNotes?: string | null;
  acceptedAt?: string | null;
  completedAt?: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface KnownLocationRecord {
  id: number;
  code: string;
  name: string;
  nameAm?: string | null;
  city: string;
  subCity: string;
  category: string;
  latitude: string | number;
  longitude: string | number;
  active: boolean;
  createdAt?: string;
}

