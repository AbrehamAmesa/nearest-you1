import 'dart:async';
import 'dart:convert';
import 'package:http/http.dart' as http;
import '../config/app_config.dart';
import '../models/models.dart';

class ApiException implements Exception {
  final int statusCode;
  final String message;

  ApiException(this.statusCode, this.message);

  @override
  String toString() => message;
}

class ApiClient {
  String baseUrl;
  String? authToken;
  final http.Client _http = http.Client();

  ApiClient({String? baseUrl, this.authToken})
      : baseUrl = AppConfig.normalizeBaseUrl(baseUrl ?? AppConfig.defaultApiBaseUrl);

  Map<String, String> _headers({bool jsonBody = true}) {
    final headers = <String, String>{
      'Accept': 'application/json',
    };
    if (jsonBody) {
      headers['Content-Type'] = 'application/json';
    }
    if (authToken != null && authToken!.isNotEmpty) {
      headers['Authorization'] = 'Bearer $authToken';
    }
    return headers;
  }

  Uri _uri(String path, [Map<String, dynamic>? query]) {
    final full = '$baseUrl$path';
    if (query == null || query.isEmpty) {
      return Uri.parse(full);
    }
    final qp = <String, String>{};
    query.forEach((k, v) {
      if (v != null && v.toString().isNotEmpty) {
        qp[k] = v.toString();
      }
    });
    return Uri.parse(full).replace(queryParameters: qp.isEmpty ? null : qp);
  }

  Future<dynamic> _request(
    String method,
    String path, {
    Map<String, dynamic>? query,
    dynamic body,
    Duration timeout = const Duration(seconds: 25),
  }) async {
    final uri = _uri(path, query);
    late http.Response response;
    try {
      switch (method) {
        case 'GET':
          response = await _http.get(uri, headers: _headers(jsonBody: false)).timeout(timeout);
          break;
        case 'POST':
          response = await _http
              .post(uri,
                  headers: _headers(),
                  body: body == null ? null : jsonEncode(body))
              .timeout(timeout);
          break;
        case 'PUT':
          response = await _http
              .put(uri,
                  headers: _headers(),
                  body: body == null ? null : jsonEncode(body))
              .timeout(timeout);
          break;
        case 'PATCH':
          response = await _http
              .patch(uri,
                  headers: _headers(),
                  body: body == null ? null : jsonEncode(body))
              .timeout(timeout);
          break;
        case 'DELETE':
          response = await _http.delete(uri, headers: _headers()).timeout(timeout);
          break;
        default:
          throw UnsupportedError('Unsupported HTTP method $method');
      }
    } on TimeoutException {
      throw ApiException(
        408,
        'Request timed out connecting to $baseUrl. Check your internet or server URL.',
      );
    } catch (e) {
      throw ApiException(0, 'Network error: $e');
    }

    dynamic decoded;
    if (response.body.isNotEmpty) {
      try {
        decoded = jsonDecode(utf8.decode(response.bodyBytes));
      } catch (_) {
        decoded = response.body;
      }
    }

    if (response.statusCode >= 200 && response.statusCode < 300) {
      return decoded;
    }

    String errMsg = 'Request failed (${response.statusCode})';
    if (decoded is Map) {
      errMsg = (decoded['error'] ?? decoded['message'] ?? errMsg).toString();
    } else if (decoded is String && decoded.isNotEmpty) {
      errMsg = decoded;
    }
    throw ApiException(response.statusCode, errMsg);
  }

  // ---------------- Auth & User ----------------

  Future<Map<String, dynamic>> login(String email, String password) async {
    final res = await _request('POST', '/api/v1/auth/login', body: {
      'email': email.trim(),
      'password': password,
    });
    return Map<String, dynamic>.from(res as Map);
  }

  Future<Map<String, dynamic>> register({
    required String fullName,
    required String email,
    required String password,
    String? phoneNumber,
    String preferredLanguage = 'en',
    String defaultSubCity = 'Bole',
    double? defaultLat,
    double? defaultLng,
  }) async {
    final res = await _request('POST', '/api/v1/auth/register', body: {
      'fullName': fullName.trim(),
      'email': email.trim(),
      'password': password,
      if (phoneNumber != null && phoneNumber.trim().isNotEmpty)
        'phoneNumber': phoneNumber.trim(),
      'preferredLanguage': preferredLanguage,
      'defaultSubCity': defaultSubCity,
      if (defaultLat != null) 'defaultLat': defaultLat,
      if (defaultLng != null) 'defaultLng': defaultLng,
    });
    return Map<String, dynamic>.from(res as Map);
  }

  Map<String, dynamic> _unwrapUserMap(dynamic res) {
    final map = Map<String, dynamic>.from(res as Map);
    if (map['user'] is Map) {
      return Map<String, dynamic>.from(map['user'] as Map);
    }
    return map;
  }

  Future<DbUserRecord> getMe() async {
    final res = await _request('GET', '/api/v1/auth/me');
    return DbUserRecord.fromJson(_unwrapUserMap(res));
  }

  Future<void> changePassword({
    String? currentPassword,
    required String newPassword,
  }) async {
    await _request('POST', '/api/v1/auth/change-password', body: {
      if (currentPassword != null && currentPassword.isNotEmpty)
        'currentPassword': currentPassword,
      'newPassword': newPassword,
    });
  }

  Future<DbUserRecord> updateProfile(Map<String, dynamic> payload) async {
    final res = await _request('PUT', '/api/v1/users/profile', body: payload);
    return DbUserRecord.fromJson(_unwrapUserMap(res));
  }

  Future<void> heartbeat() async {
    await _request('POST', '/api/v1/users/heartbeat');
  }

  Future<Map<String, dynamic>> getWorkspace() async {
    final res = await _request('GET', '/api/v1/me/workspace');
    return Map<String, dynamic>.from(res as Map);
  }

  Future<DbUserRecord> updatePersonalPayoutAccount(
      Map<String, dynamic> payload) async {
    final res = await _request('PUT', '/api/v1/me/payout-account', body: payload);
    return DbUserRecord.fromJson(_unwrapUserMap(res));
  }

  // ---------------- Public Catalog & Maps ----------------

  Future<Map<String, dynamic>> getCatalog({double? lat, double? lng}) async {
    final res = await _request('GET', '/api/v1/catalog', query: {
      if (lat != null) 'lat': lat,
      if (lng != null) 'lng': lng,
    });
    return Map<String, dynamic>.from(res as Map);
  }

  Future<List<KnownLocationRecord>> getKnownLocations({String? q}) async {
    final res = await _request('GET', '/api/v1/catalog/locations', query: {
      if (q != null && q.isNotEmpty) 'q': q,
    });
    final list = res is List
        ? res
        : (res is Map && res['locations'] is List ? res['locations'] as List : []);
    return list
        .map((e) => KnownLocationRecord.fromJson(Map<String, dynamic>.from(e as Map)))
        .toList();
  }

  Future<DetectedLocation> detectLocation({double? lat, double? lng}) async {
    final res = await _request('GET', '/api/v1/catalog/location', query: {
      if (lat != null) 'lat': lat,
      if (lng != null) 'lng': lng,
    });
    return DetectedLocation.fromJson(Map<String, dynamic>.from(res as Map));
  }

  Future<List<RecommendedItem>> getRecommendations({
    double? lat,
    double? lng,
    int limit = 8,
  }) async {
    final res = await _request('GET', '/api/v1/catalog/recommendations', query: {
      if (lat != null) 'lat': lat,
      if (lng != null) 'lng': lng,
      'limit': limit,
    });
    final rawList = res is Map && res['recommendations'] is List
        ? res['recommendations'] as List
        : (res is List ? res : []);
    return rawList
        .map((e) => RecommendedItem.fromJson(Map<String, dynamic>.from(e as Map)))
        .toList();
  }

  Future<Map<String, dynamic>> searchByImage({
    required String imageBase64,
    String mimeType = 'image/jpeg',
    double? lat,
    double? lng,
    double? radiusKm,
  }) async {
    final res = await _request(
      'POST',
      '/api/v1/catalog/image-search',
      body: {
        'imageBase64': imageBase64,
        'mimeType': mimeType,
        if (lat != null) 'lat': lat,
        if (lng != null) 'lng': lng,
        if (radiusKm != null) 'radiusKm': radiusKm,
      },
      timeout: const Duration(seconds: 40),
    );
    return Map<String, dynamic>.from(res as Map);
  }

  // ---------------- Provider & Business Portal ----------------

  Future<Map<String, dynamic>> getProviderMe() async {
    final res = await _request('GET', '/api/v1/provider/me');
    return Map<String, dynamic>.from(res as Map);
  }

  Map<String, dynamic> _unwrapProviderRegMap(dynamic res) {
    final map = Map<String, dynamic>.from(res as Map);
    final inner = map['registration'];
    if (inner is Map) {
      final innerMap = Map<String, dynamic>.from(inner);
      if (innerMap['registration'] is Map) {
        return Map<String, dynamic>.from(innerMap['registration'] as Map);
      }
      return innerMap;
    }
    return map;
  }

  Future<ProviderRegistration> registerProvider(
      Map<String, dynamic> payload) async {
    final res = await _request('POST', '/api/v1/provider/register',
        body: payload, timeout: const Duration(seconds: 45));
    return ProviderRegistration.fromJson(_unwrapProviderRegMap(res));
  }

  Future<ProviderRegistration> regenerateProviderQr() async {
    final res = await _request('POST', '/api/v1/provider/regenerate-qr');
    return ProviderRegistration.fromJson(_unwrapProviderRegMap(res));
  }

  Future<Map<String, dynamic>> vouchScan(String token) async {
    final res = await _request('POST', '/api/v1/provider/vouch-scan', body: {
      'token': token.trim(),
    });
    return Map<String, dynamic>.from(res as Map);
  }

  Future<List<ProviderRegistration>> getProviderApprovals() async {
    final res = await _request('GET', '/api/v1/provider/approvals');
    final list = res is Map && res['registrations'] is List
        ? res['registrations'] as List
        : (res is List ? res : const []);
    return list
        .map((e) =>
            ProviderRegistration.fromJson(Map<String, dynamic>.from(e as Map)))
        .toList();
  }

  Future<void> approveProvider(int id, String status, {String? notes}) async {
    await _request('POST', '/api/v1/providers/$id/approve', body: {
      'status': status,
      if (notes != null && notes.isNotEmpty) 'reviewNotes': notes,
    });
  }

  Future<void> updateProviderLiveLocation({
    required double latitude,
    required double longitude,
    required bool isLiveLocationActive,
  }) async {
    await _request('POST', '/api/v1/provider/location', body: {
      'latitude': latitude,
      'longitude': longitude,
      'isLiveLocationActive': isLiveLocationActive,
    });
  }

  Future<Map<String, dynamic>> getBusinessPortal() async {
    final res = await _request('GET', '/api/v1/business/portal');
    return Map<String, dynamic>.from(res as Map);
  }

  Future<Business> createBusiness(Map<String, dynamic> payload) async {
    final res = await _request('POST', '/api/v1/businesses', body: payload);
    return Business.fromJson(Map<String, dynamic>.from(res as Map));
  }

  Future<Business> updateBusinessPayoutAccount(
      int businessId, Map<String, dynamic> payload) async {
    final res = await _request(
      'PUT',
      '/api/v1/businesses/$businessId/payout-account',
      body: payload,
    );
    return Business.fromJson(Map<String, dynamic>.from(res as Map));
  }

  Future<Listing> createListing(Map<String, dynamic> payload) async {
    final res = await _request('POST', '/api/v1/listings',
        body: payload, timeout: const Duration(seconds: 35));
    return Listing.fromJson(Map<String, dynamic>.from(res as Map));
  }

  Future<Listing> updateListing(int id, Map<String, dynamic> payload) async {
    final res = await _request('PUT', '/api/v1/listings/$id',
        body: payload, timeout: const Duration(seconds: 35));
    return Listing.fromJson(Map<String, dynamic>.from(res as Map));
  }

  Future<void> updateListingAvailability(int id, String availabilityStatus) async {
    await _request('PATCH', '/api/v1/listings/$id/availability', body: {
      'availabilityStatus': availabilityStatus,
    });
  }

  // ---------------- Job Seeker ----------------

  Future<List<Listing>> getMyJobSeekerAds() async {
    final res = await _request('GET', '/api/v1/job-seekers/mine');
    final list = res is Map && res['listings'] is List
        ? res['listings'] as List
        : (res is List ? res : []);
    return list
        .map((e) => Listing.fromJson(Map<String, dynamic>.from(e as Map)))
        .toList();
  }

  Future<Map<String, dynamic>> advertiseAsJobSeeker(
      Map<String, dynamic> payload) async {
    final res = await _request('POST', '/api/v1/job-seekers/advertise',
        body: payload, timeout: const Duration(seconds: 40));
    return Map<String, dynamic>.from(res as Map);
  }

  Future<void> deleteJobSeekerAd(int id) async {
    await _request('DELETE', '/api/v1/job-seekers/$id');
  }

  // ---------------- Orders, Bookings & Deliveries ----------------

  Future<List<OrderRecord>> createOrder({
    required List<Map<String, dynamic>> groups,
    required String paymentMethod,
  }) async {
    final res = await _request('POST', '/api/v1/orders', body: {
      'groups': groups,
      'paymentMethod': paymentMethod,
    });
    final list = res is Map && res['orders'] is List
        ? res['orders'] as List
        : (res is List ? res : [res]);
    return list
        .map((e) => OrderRecord.fromJson(Map<String, dynamic>.from(e as Map)))
        .toList();
  }

  Future<OrderRecord> updateOrderStatus(
    int id, {
    required String orderStatus,
    int? estimatedReadyMinutes,
    int? estimatedDeliveryMinutes,
    String? rejectionReason,
  }) async {
    final res = await _request('POST', '/api/v1/orders/$id/status', body: {
      'orderStatus': orderStatus,
      if (estimatedReadyMinutes != null)
        'estimatedReadyMinutes': estimatedReadyMinutes,
      if (estimatedDeliveryMinutes != null)
        'estimatedDeliveryMinutes': estimatedDeliveryMinutes,
      if (rejectionReason != null && rejectionReason.isNotEmpty)
        'rejectionReason': rejectionReason,
    });
    return OrderRecord.fromJson(Map<String, dynamic>.from(res as Map));
  }

  Future<BookingRecord> createBooking(Map<String, dynamic> payload) async {
    final res = await _request('POST', '/api/v1/bookings', body: payload);
    return BookingRecord.fromJson(Map<String, dynamic>.from(res as Map));
  }

  Future<BookingRecord> updateBookingStatus(
    int id, {
    String? bookingStatus,
    double? quotedPrice,
    bool? quoteApproved,
  }) async {
    final res = await _request('POST', '/api/v1/bookings/$id/status', body: {
      if (bookingStatus != null) 'bookingStatus': bookingStatus,
      if (quotedPrice != null) 'quotedPrice': quotedPrice,
      if (quoteApproved != null) 'quoteApproved': quoteApproved,
    });
    return BookingRecord.fromJson(Map<String, dynamic>.from(res as Map));
  }

  Future<List<DeliveryRecord>> getDeliveries({
    double? lat,
    double? lng,
    double? radiusKm,
  }) async {
    final res = await _request('GET', '/api/v1/deliveries', query: {
      if (lat != null) 'lat': lat,
      if (lng != null) 'lng': lng,
      if (radiusKm != null) 'radiusKm': radiusKm,
    });
    final list = res is List
        ? res
        : (res is Map && res['deliveries'] is List
            ? res['deliveries'] as List
            : []);
    return list
        .map((e) => DeliveryRecord.fromJson(Map<String, dynamic>.from(e as Map)))
        .toList();
  }

  Future<DeliveryRecord> trackDelivery(String trackingCode,
      {String? receiverPhone}) async {
    final res = await _request(
      'GET',
      '/api/v1/deliveries/track/${Uri.encodeComponent(trackingCode.trim())}',
      query: {
        if (receiverPhone != null && receiverPhone.trim().isNotEmpty)
          'receiverPhone': receiverPhone.trim(),
      },
    );
    return DeliveryRecord.fromJson(Map<String, dynamic>.from(res as Map));
  }

  Future<DeliveryRecord> createDelivery(Map<String, dynamic> payload) async {
    final res = await _request('POST', '/api/v1/deliveries', body: payload);
    return DeliveryRecord.fromJson(Map<String, dynamic>.from(res as Map));
  }

  Future<DeliveryRecord> transitionDelivery(
    int id, {
    required String status,
    String? otp,
    double? driverLat,
    double? driverLng,
  }) async {
    final res = await _request('POST', '/api/v1/deliveries/$id/transition', body: {
      'status': status,
      if (otp != null && otp.isNotEmpty) 'otp': otp,
      if (driverLat != null) 'driverLat': driverLat,
      if (driverLng != null) 'driverLng': driverLng,
    });
    return DeliveryRecord.fromJson(Map<String, dynamic>.from(res as Map));
  }

  Future<void> updateDriverLocation(int id, double lat, double lng) async {
    await _request('POST', '/api/v1/deliveries/$id/driver-location', body: {
      'latitude': lat,
      'longitude': lng,
    });
  }

  Future<DeliveryRecord> raiseDispute(int id, String reason,
      {String? category}) async {
    final res = await _request('POST', '/api/v1/deliveries/$id/dispute', body: {
      'reason': reason,
      if (category != null) 'category': category,
    });
    return DeliveryRecord.fromJson(Map<String, dynamic>.from(res as Map));
  }

  Future<DeliveryRecord> raiseConflict(int id, String reason,
      {String? category}) async {
    final res = await _request('POST', '/api/v1/deliveries/$id/conflict', body: {
      'reason': reason,
      if (category != null) 'category': category,
    });
    return DeliveryRecord.fromJson(Map<String, dynamic>.from(res as Map));
  }

  Future<DeliveryRecord> submitConflictStatement(
      int id, String statement) async {
    final res = await _request(
      'POST',
      '/api/v1/deliveries/$id/conflict-statement',
      body: {'statement': statement},
    );
    return DeliveryRecord.fromJson(Map<String, dynamic>.from(res as Map));
  }

  // ---------------- Engagement: Favorites, Notifications, Chat, Voice, Contracts, Jobs, Reviews ----------------

  Future<bool?> toggleFavorite(int listingId) async {
    final res = await _request('POST', '/api/v1/favorites/toggle', body: {
      'listingId': listingId,
    });
    if (res is Map && res.containsKey('saved')) {
      return parseBool(res['saved']);
    }
    return null;
  }

  Future<List<PendingNotificationItem>> getPendingNotifications() async {
    final res = await _request('GET', '/api/v1/notifications/pending');
    final list = res is List
        ? res
        : (res is Map && res['notifications'] is List
            ? res['notifications'] as List
            : []);
    return list
        .map((e) =>
            PendingNotificationItem.fromJson(Map<String, dynamic>.from(e as Map)))
        .toList();
  }

  Future<List<ChatThreadSummary>> getChatThreads() async {
    final res = await _request('GET', '/api/v1/messages/threads');
    final list = res is Map && res['threads'] is List
        ? res['threads'] as List
        : (res is List ? res : []);
    return list
        .map((e) =>
            ChatThreadSummary.fromJson(Map<String, dynamic>.from(e as Map)))
        .toList();
  }

  Future<Map<String, dynamic>> getThreadMessages(String threadKey) async {
    final res = await _request('GET', '/api/v1/messages/thread', query: {
      'threadKey': threadKey,
    });
    return Map<String, dynamic>.from(res as Map);
  }

  Future<ChatMessage> sendMessage(Map<String, dynamic> payload) async {
    final res = await _request('POST', '/api/v1/messages',
        body: payload, timeout: const Duration(seconds: 35));
    final map = Map<String, dynamic>.from(res as Map);
    final msgJson = map['message'] is Map
        ? Map<String, dynamic>.from(map['message'] as Map)
        : map;
    return ChatMessage.fromJson(msgJson);
  }

  Future<List<ServiceContractRecord>> getContracts({
    String? threadKey,
    int? listingId,
  }) async {
    final res = await _request('GET', '/api/v1/contracts', query: {
      if (threadKey != null) 'threadKey': threadKey,
      if (listingId != null) 'listingId': listingId,
    });
    final list = res is Map && res['contracts'] is List
        ? res['contracts'] as List
        : (res is List ? res : []);
    return list
        .map((e) =>
            ServiceContractRecord.fromJson(Map<String, dynamic>.from(e as Map)))
        .toList();
  }

  Future<ServiceContractRecord> createContract(
      Map<String, dynamic> payload) async {
    final res = await _request('POST', '/api/v1/contracts', body: payload);
    final map = Map<String, dynamic>.from(res as Map);
    final item = map['contract'] is Map
        ? Map<String, dynamic>.from(map['contract'] as Map)
        : map;
    return ServiceContractRecord.fromJson(item);
  }

  Future<ServiceContractRecord> respondContract(
      int id, Map<String, dynamic> payload) async {
    final res =
        await _request('POST', '/api/v1/contracts/$id/respond', body: payload);
    final map = Map<String, dynamic>.from(res as Map);
    final item = map['contract'] is Map
        ? Map<String, dynamic>.from(map['contract'] as Map)
        : map;
    return ServiceContractRecord.fromJson(item);
  }

  Future<JobApplicationRecord> applyForJob(
      int listingId, Map<String, dynamic> payload) async {
    final res = await _request('POST', '/api/v1/jobs/$listingId/applications',
        body: payload);
    return JobApplicationRecord.fromJson(Map<String, dynamic>.from(res as Map));
  }

  Future<JobApplicationRecord> updateApplicationStatus(
      int appId, String status) async {
    final res = await _request('POST', '/api/v1/applications/$appId/status',
        body: {'applicationStatus': status});
    return JobApplicationRecord.fromJson(Map<String, dynamic>.from(res as Map));
  }

  Future<ReviewItem> createReview(Map<String, dynamic> payload) async {
    final res = await _request('POST', '/api/v1/reviews', body: payload);
    return ReviewItem.fromJson(Map<String, dynamic>.from(res as Map));
  }

  // ---------------- Payments (Chapa & Payo) ----------------

  Future<Map<String, dynamic>> getPaymentConfig() async {
    final res = await _request('GET', '/api/v1/payments/config');
    return Map<String, dynamic>.from(res as Map);
  }

  Future<List<BankDirectoryItem>> getBanks() async {
    final res = await _request('GET', '/api/v1/payments/banks');
    final list = res is List ? res : [];
    return list
        .map((e) => BankDirectoryItem.fromJson(Map<String, dynamic>.from(e as Map)))
        .toList();
  }

  Future<PaymentTransactionRecord> initializePayment({
    required String gateway,
    required String transactionType,
    required int referenceId,
    String? returnUrl,
    String? customerEmail,
    String? phoneNumber,
  }) async {
    final res = await _request('POST', '/api/v1/payments/initialize', body: {
      'gateway': gateway,
      'transactionType': transactionType,
      'referenceId': referenceId,
      if (returnUrl != null) 'returnUrl': returnUrl,
      if (customerEmail != null && customerEmail.isNotEmpty)
        'customerEmail': customerEmail,
      if (phoneNumber != null && phoneNumber.isNotEmpty)
        'phoneNumber': phoneNumber,
    });
    return PaymentTransactionRecord.fromJson(
        Map<String, dynamic>.from(res as Map));
  }

  Future<PaymentTransactionRecord> verifyPayment(String txRef) async {
    final res = await _request(
      'POST',
      '/api/v1/payments/${Uri.encodeComponent(txRef)}/verify',
    );
    return PaymentTransactionRecord.fromJson(
        Map<String, dynamic>.from(res as Map));
  }

  Future<PaymentTransactionRecord> confirmPayoPayment(
    String txRef, {
    required String receiptReference,
    String? receiptImageUrl,
    bool providerTransferConfirmed = true,
    bool commissionTransferConfirmed = true,
    String? notes,
  }) async {
    final res = await _request(
      'POST',
      '/api/v1/payments/payo/${Uri.encodeComponent(txRef)}/confirm',
      body: {
        'receiptReference': receiptReference,
        if (receiptImageUrl != null && receiptImageUrl.isNotEmpty)
          'receiptImageUrl': receiptImageUrl,
        'providerTransferConfirmed': providerTransferConfirmed,
        'commissionTransferConfirmed': commissionTransferConfirmed,
        if (notes != null && notes.isNotEmpty) 'notes': notes,
      },
    );
    return PaymentTransactionRecord.fromJson(
        Map<String, dynamic>.from(res as Map));
  }

  Future<List<PaymentTransactionRecord>> getMyPayments() async {
    final res = await _request('GET', '/api/v1/payments/mine');
    final list = res is List ? res : [];
    return list
        .map((e) =>
            PaymentTransactionRecord.fromJson(Map<String, dynamic>.from(e as Map)))
        .toList();
  }

  Future<List<PaymentTransactionRecord>> getProviderSettlements() async {
    final res = await _request('GET', '/api/v1/payments/provider-settlements');
    final list = res is List ? res : [];
    return list
        .map((e) =>
            PaymentTransactionRecord.fromJson(Map<String, dynamic>.from(e as Map)))
        .toList();
  }

  Future<PaymentTransactionRecord> getPaymentByTxRef(String txRef) async {
    final res = await _request(
      'GET',
      '/api/v1/payments/by-tx/${Uri.encodeComponent(txRef)}',
    );
    return PaymentTransactionRecord.fromJson(
        Map<String, dynamic>.from(res as Map));
  }

  Future<List<PaymentTransactionRecord>> getPaymentsByReference({
    required String transactionType,
    required int referenceId,
  }) async {
    final res = await _request('GET', '/api/v1/payments/by-reference', query: {
      'transactionType': transactionType,
      'referenceId': referenceId,
    });
    final list = res is List ? res : [];
    return list
        .map((e) =>
            PaymentTransactionRecord.fromJson(Map<String, dynamic>.from(e as Map)))
        .toList();
  }

  // ---------------- OpenStreetMap / OSRM ----------------

  Future<List<OsmPlaceResult>> searchOsmPlaces(String query) async {
    final q = query.trim().isNotEmpty
        ? '${query.trim()}, Addis Ababa, Ethiopia'
        : 'Addis Ababa, Ethiopia';
    final uri = Uri.parse('https://nominatim.openstreetmap.org/search').replace(
      queryParameters: {
        'q': q,
        'format': 'jsonv2',
        'limit': '8',
        'addressdetails': '1',
        'viewbox': '38.55,9.15,38.95,8.85',
        'bounded': '0',
      },
    );
    final res = await _http.get(uri, headers: {
      'User-Agent': 'NearestYouMobile/1.0',
      'Accept-Language': 'en',
    }).timeout(const Duration(seconds: 20));
    if (res.statusCode < 200 || res.statusCode >= 300) return const [];
    final list = jsonDecode(utf8.decode(res.bodyBytes)) as List;
    return list.map((item) {
      final m = Map<String, dynamic>.from(item as Map);
      final addr = parseMap(m['address']);
      return OsmPlaceResult(
        placeId: parseStr(m['place_id']),
        displayName: parseStr(m['display_name']),
        subCity: parseStr(addr['suburb'] ?? addr['city_district']),
        lat: parseDouble(m['lat'], 9.0192),
        lng: parseDouble(m['lon'], 38.7525),
      );
    }).toList();
  }

  Future<OsrmRouteResult?> getOsrmRoute(
      double fromLat, double fromLng, double toLat, double toLng) async {
    final uri = Uri.parse(
      'https://router.project-osrm.org/route/v1/driving/$fromLng,$fromLat;$toLng,$toLat',
    ).replace(queryParameters: {
      'overview': 'full',
      'geometries': 'geojson',
      'steps': 'false',
    });
    try {
      final res = await _http.get(uri).timeout(const Duration(seconds: 20));
      if (res.statusCode < 200 || res.statusCode >= 300) return null;
      final map = jsonDecode(utf8.decode(res.bodyBytes)) as Map;
      final routes = map['routes'] as List?;
      if (routes == null || routes.isEmpty) return null;
      final r = Map<String, dynamic>.from(routes.first as Map);
      final coords = (parseMap(r['geometry'])['coordinates'] as List?) ?? const [];
      final poly = coords
          .map((c) {
            final pair = c as List;
            return [parseDouble(pair[1]), parseDouble(pair[0])];
          })
          .toList();
      return OsrmRouteResult(
        distanceKm: parseDouble(r['distance']) / 1000.0,
        durationMin: parseDouble(r['duration']) / 60.0,
        geometry: poly,
      );
    } catch (_) {
      return null;
    }
  }
}
