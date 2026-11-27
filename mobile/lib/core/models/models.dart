double parseDouble(dynamic v, [double fallback = 0.0]) {
  if (v == null) return fallback;
  if (v is num) return v.toDouble();
  if (v is String && v.trim().isNotEmpty) {
    return double.tryParse(v.trim()) ?? fallback;
  }
  return fallback;
}

double? parseNullableDouble(dynamic v) {
  if (v == null) return null;
  if (v is num) return v.toDouble();
  if (v is String && v.trim().isNotEmpty) {
    return double.tryParse(v.trim());
  }
  return null;
}

int parseInt(dynamic v, [int fallback = 0]) {
  if (v == null) return fallback;
  if (v is int) return v;
  if (v is num) return v.toInt();
  if (v is String && v.trim().isNotEmpty) {
    return int.tryParse(v.trim()) ?? double.tryParse(v.trim())?.toInt() ?? fallback;
  }
  return fallback;
}

int? parseNullableInt(dynamic v) {
  if (v == null) return null;
  if (v is int) return v;
  if (v is num) return v.toInt();
  if (v is String && v.trim().isNotEmpty) {
    return int.tryParse(v.trim()) ?? double.tryParse(v.trim())?.toInt();
  }
  return null;
}

bool parseBool(dynamic v, [bool fallback = false]) {
  if (v == null) return fallback;
  if (v is bool) return v;
  if (v is String) {
    final s = v.trim().toLowerCase();
    if (s == 'true') return true;
    if (s == 'false') return false;
  }
  if (v is num) return v != 0;
  return fallback;
}

String parseStr(dynamic v, [String fallback = '']) {
  if (v == null) return fallback;
  return v.toString();
}

String? parseNullableStr(dynamic v) {
  if (v == null) return null;
  final s = v.toString();
  return s.isEmpty ? null : s;
}

Map<String, dynamic> parseMap(dynamic v) {
  if (v is Map<String, dynamic>) return v;
  if (v is Map) return Map<String, dynamic>.from(v);
  return const <String, dynamic>{};
}

List<String> parseStringList(dynamic v) {
  if (v is List) {
    return v.map((e) => e.toString()).where((e) => e.isNotEmpty).toList();
  }
  return const [];
}

class DbUserRecord {
  final int id;
  final String uid;
  final String? firebaseUid;
  final bool hasPassword;
  final String fullName;
  final String email;
  final String? phoneNumber;
  final String preferredLanguage;
  final String defaultSubCity;
  final List<String> roles;
  final bool canVouchEarly;
  final String? faydaIdNumber;
  final String? profilePhotoUrl;
  final String livenessStatus;
  final String providerVerificationStatus;
  final String accountStatus;
  final String? lastSeenAt;
  final bool isActiveLastMinute;
  final String? payoutBankCode;
  final String? payoutBankName;
  final String? payoutAccountNumber;
  final String? payoutAccountName;
  final String? payoutTelebirrNumber;
  final String? payoAccountHandle;
  final String? chapaSubaccountId;
  final String? preferredPayoutGateway;

  const DbUserRecord({
    required this.id,
    required this.uid,
    this.firebaseUid,
    required this.hasPassword,
    required this.fullName,
    required this.email,
    this.phoneNumber,
    required this.preferredLanguage,
    required this.defaultSubCity,
    required this.roles,
    required this.canVouchEarly,
    this.faydaIdNumber,
    this.profilePhotoUrl,
    required this.livenessStatus,
    required this.providerVerificationStatus,
    required this.accountStatus,
    this.lastSeenAt,
    required this.isActiveLastMinute,
    this.payoutBankCode,
    this.payoutBankName,
    this.payoutAccountNumber,
    this.payoutAccountName,
    this.payoutTelebirrNumber,
    this.payoAccountHandle,
    this.chapaSubaccountId,
    this.preferredPayoutGateway,
  });

  bool get isVerifiedProvider =>
      providerVerificationStatus.toUpperCase() == 'VERIFIED';

  bool get isDeliveryPartner =>
      isVerifiedProvider ||
      roles.any((r) => r.toUpperCase().contains('DRIVER') || r.toUpperCase().contains('DELIVERY'));

  Set<String> get allUids => {
        if (uid.isNotEmpty) uid,
        if (firebaseUid != null && firebaseUid!.isNotEmpty) firebaseUid!,
      };

  factory DbUserRecord.fromJson(Map<String, dynamic> j) => DbUserRecord(
        id: parseInt(j['id']),
        uid: parseStr(j['uid']),
        firebaseUid: parseNullableStr(j['firebaseUid']),
        hasPassword: parseBool(j['hasPassword'], true),
        fullName: parseStr(j['fullName'], 'User'),
        email: parseStr(j['email']),
        phoneNumber: parseNullableStr(j['phoneNumber']),
        preferredLanguage: parseStr(j['preferredLanguage'], 'en'),
        defaultSubCity: parseStr(j['defaultSubCity'], 'Bole'),
        roles: parseStringList(j['roles']),
        canVouchEarly: parseBool(j['canVouchEarly']),
        faydaIdNumber: parseNullableStr(j['faydaIdNumber']),
        profilePhotoUrl: parseNullableStr(j['profilePhotoUrl']),
        livenessStatus: parseStr(j['livenessStatus'], 'UNVERIFIED'),
        providerVerificationStatus:
            parseStr(j['providerVerificationStatus'], 'UNVERIFIED'),
        accountStatus: parseStr(j['accountStatus'], 'ACTIVE'),
        lastSeenAt: parseNullableStr(j['lastSeenAt']),
        isActiveLastMinute: parseBool(j['isActiveLastMinute']),
        payoutBankCode: parseNullableStr(j['payoutBankCode']),
        payoutBankName: parseNullableStr(j['payoutBankName']),
        payoutAccountNumber: parseNullableStr(j['payoutAccountNumber']),
        payoutAccountName: parseNullableStr(j['payoutAccountName']),
        payoutTelebirrNumber: parseNullableStr(j['payoutTelebirrNumber']),
        payoAccountHandle: parseNullableStr(j['payoAccountHandle']),
        chapaSubaccountId: parseNullableStr(j['chapaSubaccountId']),
        preferredPayoutGateway: parseNullableStr(j['preferredPayoutGateway']),
      );
}

class DetectedLocation {
  final double lat;
  final double lng;
  final String label;
  final String subCity;
  final String city;
  final String source;
  final String accuracyMode;

  const DetectedLocation({
    required this.lat,
    required this.lng,
    required this.label,
    required this.subCity,
    required this.city,
    required this.source,
    required this.accuracyMode,
  });

  bool get isExactGps => source.toUpperCase() == 'GPS' || accuracyMode.toUpperCase() == 'EXACT';

  factory DetectedLocation.fromJson(Map<String, dynamic> j) => DetectedLocation(
        lat: parseDouble(j['lat'], 9.0192),
        lng: parseDouble(j['lng'], 38.7525),
        label: parseStr(j['label'], 'Addis Ababa'),
        subCity: parseStr(j['subCity']),
        city: parseStr(j['city'], 'Addis Ababa'),
        source: parseStr(j['source'], 'CITY_CENTER'),
        accuracyMode: parseStr(j['accuracyMode'], 'APPROXIMATE'),
      );
}

class Category {
  final int id;
  final String slug;
  final int? parentId;
  final String name;
  final String nameAm;
  final String? nameOm;
  final String description;
  final String categoryType;
  final String? defaultListingType;
  final bool requiresVerification;
  final double minPriceEtb;
  final String status;
  final int displayOrder;

  const Category({
    required this.id,
    required this.slug,
    this.parentId,
    required this.name,
    required this.nameAm,
    this.nameOm,
    required this.description,
    required this.categoryType,
    this.defaultListingType,
    required this.requiresVerification,
    required this.minPriceEtb,
    required this.status,
    required this.displayOrder,
  });

  String labelFor(String langCode) {
    if (langCode == 'am' && nameAm.isNotEmpty) return nameAm;
    if (langCode == 'om' && (nameOm ?? '').isNotEmpty) return nameOm!;
    return name;
  }

  factory Category.fromJson(Map<String, dynamic> j) => Category(
        id: parseInt(j['id']),
        slug: parseStr(j['slug']),
        parentId: parseNullableInt(j['parentId']),
        name: parseStr(j['name']),
        nameAm: parseStr(j['nameAm']),
        nameOm: parseNullableStr(j['nameOm']),
        description: parseStr(j['description']),
        categoryType: parseStr(j['categoryType']),
        defaultListingType: parseNullableStr(j['defaultListingType']),
        requiresVerification: parseBool(j['requiresVerification']),
        minPriceEtb: parseDouble(j['minPriceEtb']),
        status: parseStr(j['status'], 'ACTIVE'),
        displayOrder: parseInt(j['displayOrder']),
      );
}

class CategoryDocumentRequirement {
  final int id;
  final int categoryId;
  final int? documentTypeId;
  final String documentCode;
  final String documentName;
  final String? documentNameAm;
  final String? documentNameOm;
  final String description;
  final bool isMandatory;
  final bool requiresDocumentNumber;

  const CategoryDocumentRequirement({
    required this.id,
    required this.categoryId,
    this.documentTypeId,
    required this.documentCode,
    required this.documentName,
    this.documentNameAm,
    this.documentNameOm,
    required this.description,
    required this.isMandatory,
    required this.requiresDocumentNumber,
  });

  factory CategoryDocumentRequirement.fromJson(Map<String, dynamic> j) =>
      CategoryDocumentRequirement(
        id: parseInt(j['id']),
        categoryId: parseInt(j['categoryId']),
        documentTypeId: parseNullableInt(j['documentTypeId']),
        documentCode: parseStr(j['documentCode']),
        documentName: parseStr(j['documentName']),
        documentNameAm: parseNullableStr(j['documentNameAm']),
        documentNameOm: parseNullableStr(j['documentNameOm']),
        description: parseStr(j['description']),
        isMandatory: parseBool(j['isMandatory'], true),
        requiresDocumentNumber: parseBool(j['requiresDocumentNumber']),
      );
}

class Business {
  final int id;
  final String ownerUid;
  final String? ownerFullName;
  final int? providerRegistrationId;
  final String businessName;
  final String description;
  final int categoryId;
  final String verificationStatus;
  final String licenseNumber;
  final String contactPhone;
  final String email;
  final String subCity;
  final String woreda;
  final String landmark;
  final double latitude;
  final double longitude;
  final bool liveLocationActive;
  final String lastLocationPingAt;
  final bool faydaVerified;
  final bool livenessVerified;
  final String openingHours;
  final double ratingAvg;
  final int ratingCount;
  final String? tinNumber;
  final String? profileType;
  final bool isFeatured;
  final String? payoutBankCode;
  final String? payoutBankName;
  final String? payoutAccountNumber;
  final String? payoutAccountName;
  final String? payoutTelebirrNumber;
  final String? payoAccountHandle;
  final String? chapaSubaccountId;
  final String? preferredPayoutGateway;

  const Business({
    required this.id,
    required this.ownerUid,
    this.ownerFullName,
    this.providerRegistrationId,
    required this.businessName,
    required this.description,
    required this.categoryId,
    required this.verificationStatus,
    required this.licenseNumber,
    required this.contactPhone,
    required this.email,
    required this.subCity,
    required this.woreda,
    required this.landmark,
    required this.latitude,
    required this.longitude,
    required this.liveLocationActive,
    required this.lastLocationPingAt,
    required this.faydaVerified,
    required this.livenessVerified,
    required this.openingHours,
    required this.ratingAvg,
    required this.ratingCount,
    this.tinNumber,
    this.profileType,
    required this.isFeatured,
    this.payoutBankCode,
    this.payoutBankName,
    this.payoutAccountNumber,
    this.payoutAccountName,
    this.payoutTelebirrNumber,
    this.payoAccountHandle,
    this.chapaSubaccountId,
    this.preferredPayoutGateway,
  });

  bool get isJobSeekerProfile =>
      (profileType ?? '').toUpperCase() == 'INDIVIDUAL_JOB_SEEKER';

  bool get isApproved => verificationStatus.toUpperCase() == 'APPROVED';

  factory Business.fromJson(Map<String, dynamic> j) => Business(
        id: parseInt(j['id']),
        ownerUid: parseStr(j['ownerUid']),
        ownerFullName: parseNullableStr(j['ownerFullName']),
        providerRegistrationId: parseNullableInt(j['providerRegistrationId']),
        businessName: parseStr(j['businessName']),
        description: parseStr(j['description']),
        categoryId: parseInt(j['categoryId']),
        verificationStatus: parseStr(j['verificationStatus']),
        licenseNumber: parseStr(j['licenseNumber']),
        contactPhone: parseStr(j['contactPhone']),
        email: parseStr(j['email']),
        subCity: parseStr(j['subCity']),
        woreda: parseStr(j['woreda']),
        landmark: parseStr(j['landmark']),
        latitude: parseDouble(j['latitude'], 9.0192),
        longitude: parseDouble(j['longitude'], 38.7525),
        liveLocationActive: parseBool(j['liveLocationActive']),
        lastLocationPingAt: parseStr(j['lastLocationPingAt']),
        faydaVerified: parseBool(j['faydaVerified']),
        livenessVerified: parseBool(j['livenessVerified']),
        openingHours: parseStr(j['openingHours']),
        ratingAvg: parseDouble(j['ratingAvg']),
        ratingCount: parseInt(j['ratingCount']),
        tinNumber: parseNullableStr(j['tinNumber']),
        profileType: parseNullableStr(j['profileType']),
        isFeatured: parseBool(j['isFeatured']),
        payoutBankCode: parseNullableStr(j['payoutBankCode']),
        payoutBankName: parseNullableStr(j['payoutBankName']),
        payoutAccountNumber: parseNullableStr(j['payoutAccountNumber']),
        payoutAccountName: parseNullableStr(j['payoutAccountName']),
        payoutTelebirrNumber: parseNullableStr(j['payoutTelebirrNumber']),
        payoAccountHandle: parseNullableStr(j['payoAccountHandle']),
        chapaSubaccountId: parseNullableStr(j['chapaSubaccountId']),
        preferredPayoutGateway: parseNullableStr(j['preferredPayoutGateway']),
      );
}

class Listing {
  final int id;
  final int businessId;
  final int categoryId;
  final String listingType;
  final String title;
  final String description;
  final String? imageUrl;
  final List<String> imageUrls;
  final String pricingModel;
  final String pricingUnit;
  final double basePrice;
  final double? discountPrice;
  final double? minimumCharge;
  final double? calloutFee;
  final double? depositAmount;
  final double? salaryMax;
  final String currency;
  final bool isQuoteBased;
  final bool isUnpaid;
  final Map<String, dynamic>? pricingFormula;
  final Map<String, dynamic>? metadata;
  final String availabilityStatus;
  final String status;
  final double ratingAvg;
  final int ratingCount;
  final String createdAt;

  const Listing({
    required this.id,
    required this.businessId,
    required this.categoryId,
    required this.listingType,
    required this.title,
    required this.description,
    this.imageUrl,
    required this.imageUrls,
    required this.pricingModel,
    required this.pricingUnit,
    required this.basePrice,
    this.discountPrice,
    this.minimumCharge,
    this.calloutFee,
    this.depositAmount,
    this.salaryMax,
    required this.currency,
    required this.isQuoteBased,
    required this.isUnpaid,
    this.pricingFormula,
    this.metadata,
    required this.availabilityStatus,
    required this.status,
    required this.ratingAvg,
    required this.ratingCount,
    required this.createdAt,
  });

  double get effectivePrice {
    if (discountPrice != null && discountPrice! > 0 && discountPrice! < basePrice) {
      return discountPrice!;
    }
    return basePrice;
  }

  List<String> get galleryImages {
    final list = <String>[];
    if (imageUrl != null && imageUrl!.trim().isNotEmpty) {
      list.add(imageUrl!.trim());
    }
    for (final u in imageUrls) {
      final t = u.trim();
      if (t.isNotEmpty && !list.contains(t)) {
        list.add(t);
      }
    }
    return list;
  }

  String? get primaryImage => galleryImages.isEmpty ? null : galleryImages.first;

  bool get isJobSeekerAd =>
      listingType.toUpperCase() == 'JOB_SEEKER' ||
      (metadata?['advertiserRole']?.toString().toUpperCase() == 'JOB_SEEKER');

  bool get isJobListing => listingType.toUpperCase() == 'JOB' && !isJobSeekerAd;

  bool get isCartPurchaseType {
    final t = listingType.toUpperCase();
    return t == 'PRODUCT' || t == 'FOOD' || t == 'HEALTHCARE';
  }

  bool get isRentalOrEvent {
    final t = listingType.toUpperCase();
    return t == 'RENTAL' || t == 'EVENT';
  }

  bool get isCalculatedService {
    final pm = pricingModel.toUpperCase();
    return pm == 'CALCULATED' ||
        (pricingFormula != null && pricingFormula!.isNotEmpty);
  }

  factory Listing.fromJson(Map<String, dynamic> j) => Listing(
        id: parseInt(j['id']),
        businessId: parseInt(j['businessId']),
        categoryId: parseInt(j['categoryId']),
        listingType: parseStr(j['listingType'], 'PRODUCT'),
        title: parseStr(j['title']),
        description: parseStr(j['description']),
        imageUrl: parseNullableStr(j['imageUrl']),
        imageUrls: parseStringList(j['imageUrls']),
        pricingModel: parseStr(j['pricingModel'], 'FIXED'),
        pricingUnit: parseStr(j['pricingUnit'], 'UNIT'),
        basePrice: parseDouble(j['basePrice']),
        discountPrice: parseNullableDouble(j['discountPrice']),
        minimumCharge: parseNullableDouble(j['minimumCharge']),
        calloutFee: parseNullableDouble(j['calloutFee']),
        depositAmount: parseNullableDouble(j['depositAmount']),
        salaryMax: parseNullableDouble(j['salaryMax']),
        currency: parseStr(j['currency'], 'ETB'),
        isQuoteBased: parseBool(j['isQuoteBased']),
        isUnpaid: parseBool(j['isUnpaid']),
        pricingFormula: j['pricingFormula'] is Map
            ? Map<String, dynamic>.from(j['pricingFormula'] as Map)
            : null,
        metadata: j['metadata'] is Map
            ? Map<String, dynamic>.from(j['metadata'] as Map)
            : null,
        availabilityStatus: parseStr(j['availabilityStatus'], 'AVAILABLE'),
        status: parseStr(j['status'], 'ACTIVE'),
        ratingAvg: parseDouble(j['ratingAvg']),
        ratingCount: parseInt(j['ratingCount']),
        createdAt: parseStr(j['createdAt']),
      );
}

class LiveProviderMarker {
  final int id;
  final String fullName;
  final int serviceCategoryId;
  final String subCity;
  final String landmark;
  final double latitude;
  final double longitude;
  final bool isLiveLocationActive;
  final String lastLocationUpdatedAt;
  final bool livenessPassed;
  final String status;

  const LiveProviderMarker({
    required this.id,
    required this.fullName,
    required this.serviceCategoryId,
    required this.subCity,
    required this.landmark,
    required this.latitude,
    required this.longitude,
    required this.isLiveLocationActive,
    required this.lastLocationUpdatedAt,
    required this.livenessPassed,
    required this.status,
  });

  factory LiveProviderMarker.fromJson(Map<String, dynamic> j) =>
      LiveProviderMarker(
        id: parseInt(j['id']),
        fullName: parseStr(j['fullName']),
        serviceCategoryId: parseInt(j['serviceCategoryId']),
        subCity: parseStr(j['subCity']),
        landmark: parseStr(j['landmark']),
        latitude: parseDouble(j['latitude'], 9.0192),
        longitude: parseDouble(j['longitude'], 38.7525),
        isLiveLocationActive: parseBool(j['isLiveLocationActive']),
        lastLocationUpdatedAt: parseStr(j['lastLocationUpdatedAt']),
        livenessPassed: parseBool(j['livenessPassed']),
        status: parseStr(j['status']),
      );
}

class PlatformPolicy {
  final String currency;
  final double taxRatePercent;
  final double deliveryBaseFee;
  final double deliveryPerKmRate;
  final double expressMultiplier;
  final double rideBaseFare;
  final double ridePerKmRate;
  final double deliveryMatchRadiusKm;

  const PlatformPolicy({
    required this.currency,
    required this.taxRatePercent,
    required this.deliveryBaseFee,
    required this.deliveryPerKmRate,
    required this.expressMultiplier,
    required this.rideBaseFare,
    required this.ridePerKmRate,
    required this.deliveryMatchRadiusKm,
  });

  factory PlatformPolicy.fromJson(Map<String, dynamic> j) => PlatformPolicy(
        currency: parseStr(j['currency'], 'ETB'),
        taxRatePercent: parseDouble(j['taxRatePercent'], 15),
        deliveryBaseFee: parseDouble(j['deliveryBaseFee'], 70),
        deliveryPerKmRate: parseDouble(j['deliveryPerKmRate'], 18),
        expressMultiplier: parseDouble(j['expressMultiplier'], 1.4),
        rideBaseFare: parseDouble(j['rideBaseFare'], 90),
        ridePerKmRate: parseDouble(j['ridePerKmRate'], 26),
        deliveryMatchRadiusKm: parseDouble(j['deliveryMatchRadiusKm'], 15),
      );
}

class RecommendedItem {
  final Listing listing;
  final Business business;
  final Category? category;
  final double? distanceKm;
  final double effectivePrice;
  final String? reason;

  const RecommendedItem({
    required this.listing,
    required this.business,
    this.category,
    this.distanceKm,
    required this.effectivePrice,
    this.reason,
  });

  factory RecommendedItem.fromJson(Map<String, dynamic> j) => RecommendedItem(
        listing: Listing.fromJson(parseMap(j['listing'])),
        business: Business.fromJson(parseMap(j['business'])),
        category:
            j['category'] is Map ? Category.fromJson(parseMap(j['category'])) : null,
        distanceKm: parseNullableDouble(j['distanceKm']),
        effectivePrice: parseDouble(j['effectivePrice']),
        reason: parseNullableStr(j['reason']),
      );
}

class ReviewItem {
  final int id;
  final String customerUid;
  final String customerName;
  final int businessId;
  final int? listingId;
  final String transactionRef;
  final int rating;
  final String comment;
  final String createdAt;

  const ReviewItem({
    required this.id,
    required this.customerUid,
    required this.customerName,
    required this.businessId,
    this.listingId,
    required this.transactionRef,
    required this.rating,
    required this.comment,
    required this.createdAt,
  });

  factory ReviewItem.fromJson(Map<String, dynamic> j) => ReviewItem(
        id: parseInt(j['id']),
        customerUid: parseStr(j['customerUid']),
        customerName: parseStr(j['customerName'], 'Customer'),
        businessId: parseInt(j['businessId']),
        listingId: parseNullableInt(j['listingId']),
        transactionRef: parseStr(j['transactionRef']),
        rating: parseInt(j['rating'], 5),
        comment: parseStr(j['comment']),
        createdAt: parseStr(j['createdAt']),
      );
}

class KnownLocationRecord {
  final int id;
  final String code;
  final String name;
  final String? nameAm;
  final String city;
  final String subCity;
  final String category;
  final double latitude;
  final double longitude;

  const KnownLocationRecord({
    required this.id,
    required this.code,
    required this.name,
    this.nameAm,
    required this.city,
    required this.subCity,
    required this.category,
    required this.latitude,
    required this.longitude,
  });

  factory KnownLocationRecord.fromJson(Map<String, dynamic> j) =>
      KnownLocationRecord(
        id: parseInt(j['id']),
        code: parseStr(j['code']),
        name: parseStr(j['name']),
        nameAm: parseNullableStr(j['nameAm']),
        city: parseStr(j['city'], 'Addis Ababa'),
        subCity: parseStr(j['subCity']),
        category: parseStr(j['category']),
        latitude: parseDouble(j['latitude'], 9.0192),
        longitude: parseDouble(j['longitude'], 38.7525),
      );
}

class CartItem {
  final Listing listing;
  final Business business;
  final int quantity;
  final String? variant;

  const CartItem({
    required this.listing,
    required this.business,
    required this.quantity,
    this.variant,
  });

  CartItem copyWith({int? quantity, String? variant}) => CartItem(
        listing: listing,
        business: business,
        quantity: quantity ?? this.quantity,
        variant: variant ?? this.variant,
      );
}

class OrderRecord {
  final int id;
  final String orderNumber;
  final String customerUid;
  final String customerName;
  final int businessId;
  final String orderType;
  final List<Map<String, dynamic>> itemsSnapshot;
  final double subtotal;
  final double deliveryFee;
  final double taxAmount;
  final double discountAmount;
  final double totalAmount;
  final String currency;
  final String fulfillmentType;
  final String deliveryAddress;
  final String paymentMethod;
  final String paymentStatus;
  final String orderStatus;
  final bool immediateAcceptance;
  final int? estimatedReadyMinutes;
  final int? estimatedDeliveryMinutes;
  final String? estimatedReadyAt;
  final String? estimatedDeliveryAt;
  final String? rejectionReason;
  final Map<String, dynamic>? returnPolicySnapshot;
  final String createdAt;

  const OrderRecord({
    required this.id,
    required this.orderNumber,
    required this.customerUid,
    required this.customerName,
    required this.businessId,
    required this.orderType,
    required this.itemsSnapshot,
    required this.subtotal,
    required this.deliveryFee,
    required this.taxAmount,
    required this.discountAmount,
    required this.totalAmount,
    required this.currency,
    required this.fulfillmentType,
    required this.deliveryAddress,
    required this.paymentMethod,
    required this.paymentStatus,
    required this.orderStatus,
    required this.immediateAcceptance,
    this.estimatedReadyMinutes,
    this.estimatedDeliveryMinutes,
    this.estimatedReadyAt,
    this.estimatedDeliveryAt,
    this.rejectionReason,
    this.returnPolicySnapshot,
    required this.createdAt,
  });

  factory OrderRecord.fromJson(Map<String, dynamic> j) => OrderRecord(
        id: parseInt(j['id']),
        orderNumber: parseStr(j['orderNumber']),
        customerUid: parseStr(j['customerUid']),
        customerName: parseStr(j['customerName']),
        businessId: parseInt(j['businessId']),
        orderType: parseStr(j['orderType']),
        itemsSnapshot: (j['itemsSnapshot'] is List)
            ? (j['itemsSnapshot'] as List)
                .map((e) => parseMap(e))
                .toList()
            : const [],
        subtotal: parseDouble(j['subtotal']),
        deliveryFee: parseDouble(j['deliveryFee']),
        taxAmount: parseDouble(j['taxAmount']),
        discountAmount: parseDouble(j['discountAmount']),
        totalAmount: parseDouble(j['totalAmount']),
        currency: parseStr(j['currency'], 'ETB'),
        fulfillmentType: parseStr(j['fulfillmentType']),
        deliveryAddress: parseStr(j['deliveryAddress']),
        paymentMethod: parseStr(j['paymentMethod']),
        paymentStatus: parseStr(j['paymentStatus']),
        orderStatus: parseStr(j['orderStatus']),
        immediateAcceptance: parseBool(j['immediateAcceptance'], true),
        estimatedReadyMinutes: parseNullableInt(j['estimatedReadyMinutes']),
        estimatedDeliveryMinutes: parseNullableInt(j['estimatedDeliveryMinutes']),
        estimatedReadyAt: parseNullableStr(j['estimatedReadyAt']),
        estimatedDeliveryAt: parseNullableStr(j['estimatedDeliveryAt']),
        rejectionReason: parseNullableStr(j['rejectionReason']),
        returnPolicySnapshot: j['returnPolicySnapshot'] is Map
            ? Map<String, dynamic>.from(j['returnPolicySnapshot'] as Map)
            : null,
        createdAt: parseStr(j['createdAt']),
      );
}

class BookingRecord {
  final int id;
  final String bookingReference;
  final String customerUid;
  final String customerName;
  final int businessId;
  final int listingId;
  final String bookingType;
  final String scheduledDate;
  final String? endDate;
  final String scheduledTime;
  final Map<String, dynamic>? parameters;
  final List<Map<String, dynamic>> priceBreakdown;
  final double agreedPrice;
  final double depositAmount;
  final double? quotedPrice;
  final bool quoteApproved;
  final String currency;
  final String paymentMethod;
  final String paymentStatus;
  final String bookingStatus;
  final String? notes;
  final String createdAt;

  const BookingRecord({
    required this.id,
    required this.bookingReference,
    required this.customerUid,
    required this.customerName,
    required this.businessId,
    required this.listingId,
    required this.bookingType,
    required this.scheduledDate,
    this.endDate,
    required this.scheduledTime,
    this.parameters,
    required this.priceBreakdown,
    required this.agreedPrice,
    required this.depositAmount,
    this.quotedPrice,
    required this.quoteApproved,
    required this.currency,
    required this.paymentMethod,
    required this.paymentStatus,
    required this.bookingStatus,
    this.notes,
    required this.createdAt,
  });

  factory BookingRecord.fromJson(Map<String, dynamic> j) => BookingRecord(
        id: parseInt(j['id']),
        bookingReference: parseStr(j['bookingReference']),
        customerUid: parseStr(j['customerUid']),
        customerName: parseStr(j['customerName']),
        businessId: parseInt(j['businessId']),
        listingId: parseInt(j['listingId']),
        bookingType: parseStr(j['bookingType']),
        scheduledDate: parseStr(j['scheduledDate']),
        endDate: parseNullableStr(j['endDate']),
        scheduledTime: parseStr(j['scheduledTime']),
        parameters: j['parameters'] is Map
            ? Map<String, dynamic>.from(j['parameters'] as Map)
            : null,
        priceBreakdown: (j['priceBreakdown'] is List)
            ? (j['priceBreakdown'] as List).map((e) => parseMap(e)).toList()
            : const [],
        agreedPrice: parseDouble(j['agreedPrice']),
        depositAmount: parseDouble(j['depositAmount']),
        quotedPrice: parseNullableDouble(j['quotedPrice']),
        quoteApproved: parseBool(j['quoteApproved']),
        currency: parseStr(j['currency'], 'ETB'),
        paymentMethod: parseStr(j['paymentMethod']),
        paymentStatus: parseStr(j['paymentStatus']),
        bookingStatus: parseStr(j['bookingStatus']),
        notes: parseNullableStr(j['notes']),
        createdAt: parseStr(j['createdAt']),
      );
}

class DeliveryRecord {
  final int id;
  final String trackingCode;
  final String requestType;
  final String customerUid;
  final String customerName;
  final String? driverUid;
  final String? driverName;
  final String pickupLocation;
  final double? pickupLat;
  final double? pickupLng;
  final String destinationLocation;
  final double? destinationLat;
  final double? destinationLng;
  final String packageOrRideDetails;
  final String? receiverName;
  final String? receiverPhone;
  final double? declaredValue;
  final String vehicleType;
  final String urgency;
  final double distanceKm;
  final List<Map<String, dynamic>> priceBreakdown;
  final double taxAmount;
  final double totalFee;
  final String currency;
  final String paymentMethod;
  final String? pickupOtp;
  final String? deliveryOtp;
  final bool pickupOtpRequired;
  final bool deliveryOtpRequired;
  final String? escrowStatus;
  final double escrowAmount;
  final String? disputeReason;
  final double? driverLat;
  final double? driverLng;
  final String? driverLocationUpdatedAt;
  final double? distanceToPickupKm;
  final String? conflictStatus;
  final String? conflictCategory;
  final String? conflictRaisedByUid;
  final String? conflictRaisedByRole;
  final String? conflictCounterStatement;
  final String? conflictResolution;
  final Map<String, dynamic>? paymentDetails;
  final String status;
  final String createdAt;

  const DeliveryRecord({
    required this.id,
    required this.trackingCode,
    required this.requestType,
    required this.customerUid,
    required this.customerName,
    this.driverUid,
    this.driverName,
    required this.pickupLocation,
    this.pickupLat,
    this.pickupLng,
    required this.destinationLocation,
    this.destinationLat,
    this.destinationLng,
    required this.packageOrRideDetails,
    this.receiverName,
    this.receiverPhone,
    this.declaredValue,
    required this.vehicleType,
    required this.urgency,
    required this.distanceKm,
    required this.priceBreakdown,
    required this.taxAmount,
    required this.totalFee,
    required this.currency,
    required this.paymentMethod,
    this.pickupOtp,
    this.deliveryOtp,
    required this.pickupOtpRequired,
    required this.deliveryOtpRequired,
    this.escrowStatus,
    required this.escrowAmount,
    this.disputeReason,
    this.driverLat,
    this.driverLng,
    this.driverLocationUpdatedAt,
    this.distanceToPickupKm,
    this.conflictStatus,
    this.conflictCategory,
    this.conflictRaisedByUid,
    this.conflictRaisedByRole,
    this.conflictCounterStatement,
    this.conflictResolution,
    this.paymentDetails,
    required this.status,
    required this.createdAt,
  });

  factory DeliveryRecord.fromJson(Map<String, dynamic> j) => DeliveryRecord(
        id: parseInt(j['id']),
        trackingCode: parseStr(j['trackingCode']),
        requestType: parseStr(j['requestType'], 'DELIVERY'),
        customerUid: parseStr(j['customerUid']),
        customerName: parseStr(j['customerName']),
        driverUid: parseNullableStr(j['driverUid']),
        driverName: parseNullableStr(j['driverName']),
        pickupLocation: parseStr(j['pickupLocation']),
        pickupLat: parseNullableDouble(j['pickupLat']),
        pickupLng: parseNullableDouble(j['pickupLng']),
        destinationLocation: parseStr(j['destinationLocation']),
        destinationLat: parseNullableDouble(j['destinationLat']),
        destinationLng: parseNullableDouble(j['destinationLng']),
        packageOrRideDetails: parseStr(j['packageOrRideDetails']),
        receiverName: parseNullableStr(j['receiverName']),
        receiverPhone: parseNullableStr(j['receiverPhone']),
        declaredValue: parseNullableDouble(j['declaredValue']),
        vehicleType: parseStr(j['vehicleType'], 'MOTORBIKE'),
        urgency: parseStr(j['urgency'], 'STANDARD'),
        distanceKm: parseDouble(j['distanceKm']),
        priceBreakdown: (j['priceBreakdown'] is List)
            ? (j['priceBreakdown'] as List).map((e) => parseMap(e)).toList()
            : const [],
        taxAmount: parseDouble(j['taxAmount']),
        totalFee: parseDouble(j['totalFee']),
        currency: parseStr(j['currency'], 'ETB'),
        paymentMethod: parseStr(j['paymentMethod']),
        pickupOtp: parseNullableStr(j['pickupOtp']),
        deliveryOtp: parseNullableStr(j['deliveryOtp']),
        pickupOtpRequired: parseBool(j['pickupOtpRequired']),
        deliveryOtpRequired: parseBool(j['deliveryOtpRequired']),
        escrowStatus: parseNullableStr(j['escrowStatus']),
        escrowAmount: parseDouble(j['escrowAmount']),
        disputeReason: parseNullableStr(j['disputeReason']),
        driverLat: parseNullableDouble(j['driverLat']),
        driverLng: parseNullableDouble(j['driverLng']),
        driverLocationUpdatedAt: parseNullableStr(j['driverLocationUpdatedAt']),
        distanceToPickupKm: parseNullableDouble(j['distanceToPickupKm']),
        conflictStatus: parseNullableStr(j['conflictStatus']),
        conflictCategory: parseNullableStr(j['conflictCategory']),
        conflictRaisedByUid: parseNullableStr(j['conflictRaisedByUid']),
        conflictRaisedByRole: parseNullableStr(j['conflictRaisedByRole']),
        conflictCounterStatement:
            parseNullableStr(j['conflictCounterStatement']),
        conflictResolution: parseNullableStr(j['conflictResolution']),
        paymentDetails: j['paymentDetails'] is Map
            ? Map<String, dynamic>.from(j['paymentDetails'] as Map)
            : null,
        status: parseStr(j['status']),
        createdAt: parseStr(j['createdAt']),
      );
}

class JobApplicationRecord {
  final int id;
  final int listingId;
  final int businessId;
  final String applicantUid;
  final String applicantName;
  final String applicantPhone;
  final String skills;
  final int experienceYears;
  final double expectedCompensation;
  final String coverLetter;
  final String applicationStatus;
  final String createdAt;

  const JobApplicationRecord({
    required this.id,
    required this.listingId,
    required this.businessId,
    required this.applicantUid,
    required this.applicantName,
    required this.applicantPhone,
    required this.skills,
    required this.experienceYears,
    required this.expectedCompensation,
    required this.coverLetter,
    required this.applicationStatus,
    required this.createdAt,
  });

  factory JobApplicationRecord.fromJson(Map<String, dynamic> j) =>
      JobApplicationRecord(
        id: parseInt(j['id']),
        listingId: parseInt(j['listingId']),
        businessId: parseInt(j['businessId']),
        applicantUid: parseStr(j['applicantUid']),
        applicantName: parseStr(j['applicantName']),
        applicantPhone: parseStr(j['applicantPhone']),
        skills: parseStr(j['skills']),
        experienceYears: parseInt(j['experienceYears']),
        expectedCompensation: parseDouble(j['expectedCompensation']),
        coverLetter: parseStr(j['coverLetter']),
        applicationStatus: parseStr(j['applicationStatus']),
        createdAt: parseStr(j['createdAt']),
      );
}

class ChatMessage {
  final int id;
  final String senderUid;
  final String senderName;
  final String? senderRole;
  final String? recipientUid;
  final int businessId;
  final int? listingId;
  final int? orderId;
  final int? bookingId;
  final String? threadKey;
  final String messageType; // TEXT | VOICE
  final String body;
  final String? audioDataUrl;
  final int? audioDurationSeconds;
  final String createdAt;

  const ChatMessage({
    required this.id,
    required this.senderUid,
    required this.senderName,
    this.senderRole,
    this.recipientUid,
    required this.businessId,
    this.listingId,
    this.orderId,
    this.bookingId,
    this.threadKey,
    required this.messageType,
    required this.body,
    this.audioDataUrl,
    this.audioDurationSeconds,
    required this.createdAt,
  });

  bool get isVoice =>
      messageType.toUpperCase() == 'VOICE' ||
      (audioDataUrl != null && audioDataUrl!.isNotEmpty);

  factory ChatMessage.fromJson(Map<String, dynamic> j) => ChatMessage(
        id: parseInt(j['id']),
        senderUid: parseStr(j['senderUid']),
        senderName: parseStr(j['senderName']),
        senderRole: parseNullableStr(j['senderRole']),
        recipientUid: parseNullableStr(j['recipientUid']),
        businessId: parseInt(j['businessId']),
        listingId: parseNullableInt(j['listingId']),
        orderId: parseNullableInt(j['orderId']),
        bookingId: parseNullableInt(j['bookingId']),
        threadKey: parseNullableStr(j['threadKey']),
        messageType: parseStr(j['messageType'], 'TEXT'),
        body: parseStr(j['body']),
        audioDataUrl: parseNullableStr(j['audioDataUrl']),
        audioDurationSeconds: parseNullableInt(j['audioDurationSeconds']),
        createdAt: parseStr(j['createdAt']),
      );
}

class ChatThreadSummary {
  final String threadKey;
  final String threadType;
  final int businessId;
  final String businessName;
  final int? listingId;
  final String? listingTitle;
  final int? orderId;
  final String? orderNumber;
  final String? orderStatus;
  final int? bookingId;
  final String? bookingReference;
  final String? otherPartyUid;
  final String? otherPartyName;
  final String? otherPartyLastSeenAt;
  final bool otherPartyActiveLastMinute;
  final bool viewerIsOwner;
  final int messageCount;
  final ChatMessage lastMessage;

  const ChatThreadSummary({
    required this.threadKey,
    required this.threadType,
    required this.businessId,
    required this.businessName,
    this.listingId,
    this.listingTitle,
    this.orderId,
    this.orderNumber,
    this.orderStatus,
    this.bookingId,
    this.bookingReference,
    this.otherPartyUid,
    this.otherPartyName,
    this.otherPartyLastSeenAt,
    required this.otherPartyActiveLastMinute,
    required this.viewerIsOwner,
    required this.messageCount,
    required this.lastMessage,
  });

  factory ChatThreadSummary.fromJson(Map<String, dynamic> j) =>
      ChatThreadSummary(
        threadKey: parseStr(j['threadKey']),
        threadType: parseStr(j['threadType'], 'SERVICE_CONTACT'),
        businessId: parseInt(j['businessId']),
        businessName: parseStr(j['businessName']),
        listingId: parseNullableInt(j['listingId']),
        listingTitle: parseNullableStr(j['listingTitle']),
        orderId: parseNullableInt(j['orderId']),
        orderNumber: parseNullableStr(j['orderNumber']),
        orderStatus: parseNullableStr(j['orderStatus']),
        bookingId: parseNullableInt(j['bookingId']),
        bookingReference: parseNullableStr(j['bookingReference']),
        otherPartyUid: parseNullableStr(j['otherPartyUid']),
        otherPartyName: parseNullableStr(j['otherPartyName']),
        otherPartyLastSeenAt: parseNullableStr(j['otherPartyLastSeenAt']),
        otherPartyActiveLastMinute: parseBool(j['otherPartyActiveLastMinute']),
        viewerIsOwner: parseBool(j['viewerIsOwner']),
        messageCount: parseInt(j['messageCount']),
        lastMessage: ChatMessage.fromJson(parseMap(j['lastMessage'])),
      );
}

class ServiceContractRecord {
  final int id;
  final String contractReference;
  final String threadKey;
  final int businessId;
  final int? listingId;
  final int? bookingId;
  final String serviceGiverUid;
  final String serviceGiverName;
  final String clientUid;
  final String clientName;
  final String offeredByUid;
  final String offeredByRole;
  final String contractType;
  final String title;
  final String scopeSummary;
  final String? deliverables;
  final String paymentSchedule;
  final double agreedAmount;
  final double? hourlyRate;
  final int? estimatedHours;
  final String? startDate;
  final String? endDate;
  final String status;
  final String? counterNotes;
  final String createdAt;

  const ServiceContractRecord({
    required this.id,
    required this.contractReference,
    required this.threadKey,
    required this.businessId,
    this.listingId,
    this.bookingId,
    required this.serviceGiverUid,
    required this.serviceGiverName,
    required this.clientUid,
    required this.clientName,
    required this.offeredByUid,
    required this.offeredByRole,
    required this.contractType,
    required this.title,
    required this.scopeSummary,
    this.deliverables,
    required this.paymentSchedule,
    required this.agreedAmount,
    this.hourlyRate,
    this.estimatedHours,
    this.startDate,
    this.endDate,
    required this.status,
    this.counterNotes,
    required this.createdAt,
  });

  factory ServiceContractRecord.fromJson(Map<String, dynamic> j) =>
      ServiceContractRecord(
        id: parseInt(j['id']),
        contractReference: parseStr(j['contractReference']),
        threadKey: parseStr(j['threadKey']),
        businessId: parseInt(j['businessId']),
        listingId: parseNullableInt(j['listingId']),
        bookingId: parseNullableInt(j['bookingId']),
        serviceGiverUid: parseStr(j['serviceGiverUid']),
        serviceGiverName: parseStr(j['serviceGiverName']),
        clientUid: parseStr(j['clientUid']),
        clientName: parseStr(j['clientName']),
        offeredByUid: parseStr(j['offeredByUid']),
        offeredByRole: parseStr(j['offeredByRole']),
        contractType: parseStr(j['contractType']),
        title: parseStr(j['title']),
        scopeSummary: parseStr(j['scopeSummary']),
        deliverables: parseNullableStr(j['deliverables']),
        paymentSchedule: parseStr(j['paymentSchedule'], 'ON_COMPLETION'),
        agreedAmount: parseDouble(j['agreedAmount']),
        hourlyRate: parseNullableDouble(j['hourlyRate']),
        estimatedHours: parseNullableInt(j['estimatedHours']),
        startDate: parseNullableStr(j['startDate']),
        endDate: parseNullableStr(j['endDate']),
        status: parseStr(j['status']),
        counterNotes: parseNullableStr(j['counterNotes']),
        createdAt: parseStr(j['createdAt']),
      );
}

class ProviderRegistration {
  final int id;
  final String userUid;
  final String fullName;
  final String phoneNumber;
  final int serviceCategoryId;
  final String faydaIdNumber;
  final bool livenessPassed;
  final int livenessScore;
  final String subCity;
  final String landmark;
  final double latitude;
  final double longitude;
  final bool isLiveLocationActive;
  final String? qrVoucherToken;
  final String? qrExpiresAt;
  final String? vouchedByName;
  final String? approvedByRole;
  final String status;
  final String? reviewNotes;
  final String createdAt;

  const ProviderRegistration({
    required this.id,
    required this.userUid,
    required this.fullName,
    required this.phoneNumber,
    required this.serviceCategoryId,
    required this.faydaIdNumber,
    required this.livenessPassed,
    required this.livenessScore,
    required this.subCity,
    required this.landmark,
    required this.latitude,
    required this.longitude,
    required this.isLiveLocationActive,
    this.qrVoucherToken,
    this.qrExpiresAt,
    this.vouchedByName,
    this.approvedByRole,
    required this.status,
    this.reviewNotes,
    required this.createdAt,
  });

  factory ProviderRegistration.fromJson(Map<String, dynamic> j) =>
      ProviderRegistration(
        id: parseInt(j['id']),
        userUid: parseStr(j['userUid']),
        fullName: parseStr(j['fullName']),
        phoneNumber: parseStr(j['phoneNumber']),
        serviceCategoryId: parseInt(j['serviceCategoryId']),
        faydaIdNumber: parseStr(j['faydaIdNumber']),
        livenessPassed: parseBool(j['livenessPassed']),
        livenessScore: parseInt(j['livenessScore']),
        subCity: parseStr(j['subCity']),
        landmark: parseStr(j['landmark']),
        latitude: parseDouble(j['latitude'], 9.0192),
        longitude: parseDouble(j['longitude'], 38.7525),
        isLiveLocationActive: parseBool(j['isLiveLocationActive']),
        qrVoucherToken: parseNullableStr(j['qrVoucherToken']),
        qrExpiresAt: parseNullableStr(j['qrExpiresAt']),
        vouchedByName: parseNullableStr(j['vouchedByName']),
        approvedByRole: parseNullableStr(j['approvedByRole']),
        status: parseStr(j['status']),
        reviewNotes: parseNullableStr(j['reviewNotes']),
        createdAt: parseStr(j['createdAt']),
      );
}

class AccountSnapshot {
  final String? ownerLabel;
  final String? accountHolderName;
  final String? bankCode;
  final String? bankName;
  final String? accountNumber;
  final String? accountName;
  final String? telebirrNumber;
  final String? payoAccountHandle;
  final String? chapaSettlementLabel;
  final String? chapaSubaccountId;
  final String? preferredPayoutGateway;
  final bool isConfigured;
  final String? summaryLabel;

  const AccountSnapshot({
    this.ownerLabel,
    this.accountHolderName,
    this.bankCode,
    this.bankName,
    this.accountNumber,
    this.accountName,
    this.telebirrNumber,
    this.payoAccountHandle,
    this.chapaSettlementLabel,
    this.chapaSubaccountId,
    this.preferredPayoutGateway,
    required this.isConfigured,
    this.summaryLabel,
  });

  factory AccountSnapshot.fromJson(Map<String, dynamic> j) => AccountSnapshot(
        ownerLabel: parseNullableStr(j['ownerLabel']),
        accountHolderName: parseNullableStr(j['accountHolderName']),
        bankCode: parseNullableStr(j['bankCode']),
        bankName: parseNullableStr(j['bankName']),
        accountNumber: parseNullableStr(j['accountNumber']),
        accountName: parseNullableStr(j['accountName']),
        telebirrNumber: parseNullableStr(j['telebirrNumber']),
        payoAccountHandle: parseNullableStr(j['payoAccountHandle']),
        chapaSettlementLabel: parseNullableStr(j['chapaSettlementLabel']),
        chapaSubaccountId: parseNullableStr(j['chapaSubaccountId']),
        preferredPayoutGateway: parseNullableStr(j['preferredPayoutGateway']),
        isConfigured: parseBool(j['isConfigured']),
        summaryLabel: parseNullableStr(j['summaryLabel']),
      );
}

class PaymentTransactionRecord {
  final int id;
  final String txRef;
  final String gateway;
  final String gatewayMode;
  final String transactionType;
  final int referenceId;
  final String referenceCode;
  final String customerUid;
  final String? customerEmail;
  final String? customerName;
  final String? providerUid;
  final int? businessId;
  final String currency;
  final double grossAmount;
  final double providerAmount;
  final double taxAmount;
  final AccountSnapshot? providerPayoutAccountSnapshot;
  final String? gatewayCheckoutUrl;
  final String? gatewayTransactionId;
  final String? payerReceiptReference;
  final String? payerReceiptImageUrl;
  final String providerLegStatus;
  final String status;
  final String? paidAt;
  final String createdAt;

  // Notice: Platform commission fields are deliberately omitted from the non-admin mobile model.

  const PaymentTransactionRecord({
    required this.id,
    required this.txRef,
    required this.gateway,
    required this.gatewayMode,
    required this.transactionType,
    required this.referenceId,
    required this.referenceCode,
    required this.customerUid,
    this.customerEmail,
    this.customerName,
    this.providerUid,
    this.businessId,
    required this.currency,
    required this.grossAmount,
    required this.providerAmount,
    required this.taxAmount,
    this.providerPayoutAccountSnapshot,
    this.gatewayCheckoutUrl,
    this.gatewayTransactionId,
    this.payerReceiptReference,
    this.payerReceiptImageUrl,
    required this.providerLegStatus,
    required this.status,
    this.paidAt,
    required this.createdAt,
  });

  bool get isPaid =>
      status.toUpperCase() == 'PAID' ||
      status.toUpperCase() == 'SETTLED' ||
      status.toUpperCase() == 'SUCCESS' ||
      status.toUpperCase() == 'COMPLETED';

  factory PaymentTransactionRecord.fromJson(Map<String, dynamic> j) =>
      PaymentTransactionRecord(
        id: parseInt(j['id']),
        txRef: parseStr(j['txRef']),
        gateway: parseStr(j['gateway']),
        gatewayMode: parseStr(j['gatewayMode']),
        transactionType: parseStr(j['transactionType']),
        referenceId: parseInt(j['referenceId']),
        referenceCode: parseStr(j['referenceCode']),
        customerUid: parseStr(j['customerUid']),
        customerEmail: parseNullableStr(j['customerEmail']),
        customerName: parseNullableStr(j['customerName']),
        providerUid: parseNullableStr(j['providerUid']),
        businessId: parseNullableInt(j['businessId']),
        currency: parseStr(j['currency'], 'ETB'),
        grossAmount: parseDouble(j['grossAmount']),
        providerAmount: parseDouble(j['providerAmount']),
        taxAmount: parseDouble(j['taxAmount']),
        providerPayoutAccountSnapshot: j['providerPayoutAccountSnapshot'] is Map
            ? AccountSnapshot.fromJson(
                parseMap(j['providerPayoutAccountSnapshot']))
            : null,
        gatewayCheckoutUrl: parseNullableStr(j['gatewayCheckoutUrl']),
        gatewayTransactionId: parseNullableStr(j['gatewayTransactionId']),
        payerReceiptReference: parseNullableStr(j['payerReceiptReference']),
        payerReceiptImageUrl: parseNullableStr(j['payerReceiptImageUrl']),
        providerLegStatus: parseStr(j['providerLegStatus']),
        status: parseStr(j['status']),
        paidAt: parseNullableStr(j['paidAt']),
        createdAt: parseStr(j['createdAt']),
      );
}

class BankDirectoryItem {
  final String code;
  final String name;
  final String currency;

  const BankDirectoryItem({
    required this.code,
    required this.name,
    required this.currency,
  });

  factory BankDirectoryItem.fromJson(Map<String, dynamic> j) =>
      BankDirectoryItem(
        code: parseStr(j['code']),
        name: parseStr(j['name']),
        currency: parseStr(j['currency'], 'ETB'),
      );
}

class PendingNotificationItem {
  final String id;
  final String kind; // MESSAGE | ORDER | BOOKING | APPLICATION | DELIVERY | PAYMENT
  final String title;
  final String subtitle;
  final String createdAt;
  final String? threadKey;
  final int? orderId;
  final int? bookingId;
  final int? deliveryId;
  final String? trackingCode;
  final String? txRef;
  final String? transactionType;
  final int? referenceId;

  const PendingNotificationItem({
    required this.id,
    required this.kind,
    required this.title,
    required this.subtitle,
    required this.createdAt,
    this.threadKey,
    this.orderId,
    this.bookingId,
    this.deliveryId,
    this.trackingCode,
    this.txRef,
    this.transactionType,
    this.referenceId,
  });

  factory PendingNotificationItem.fromJson(Map<String, dynamic> j) =>
      PendingNotificationItem(
        id: parseStr(j['id'], DateTime.now().millisecondsSinceEpoch.toString()),
        kind: parseStr(j['kind'] ?? j['type'], 'SYSTEM').toUpperCase(),
        title: parseStr(j['title'], 'Update'),
        subtitle: parseStr(j['subtitle'] ?? j['message'] ?? j['body']),
        createdAt: parseStr(j['createdAt']),
        threadKey: parseNullableStr(j['threadKey']),
        orderId: parseNullableInt(j['orderId']),
        bookingId: parseNullableInt(j['bookingId']),
        deliveryId: parseNullableInt(j['deliveryId']),
        trackingCode: parseNullableStr(j['trackingCode']),
        txRef: parseNullableStr(j['txRef']),
        transactionType: parseNullableStr(j['transactionType']),
        referenceId: parseNullableInt(j['referenceId']),
      );
}

class OsmPlaceResult {
  final String placeId;
  final String displayName;
  final String subCity;
  final double lat;
  final double lng;

  const OsmPlaceResult({
    required this.placeId,
    required this.displayName,
    required this.subCity,
    required this.lat,
    required this.lng,
  });
}

class OsrmRouteResult {
  final double distanceKm;
  final double durationMin;
  final List<List<double>> geometry; // [[lat, lng], ...]

  const OsrmRouteResult({
    required this.distanceKm,
    required this.durationMin,
    required this.geometry,
  });
}
