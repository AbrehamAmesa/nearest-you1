import 'dart:async';
import 'package:flutter/material.dart';
import 'package:geolocator/geolocator.dart';
import 'package:shared_preferences/shared_preferences.dart';
import '../config/app_config.dart';
import '../i18n/app_translations.dart';
import '../models/models.dart';
import '../services/api_client.dart';
import '../services/ws_service.dart';

class AppState extends ChangeNotifier {
  static const _prefBaseUrlKey = 'ny_api_base_url';
  static const _prefTokenKey = 'ny_auth_token';
  static const _prefLangKey = 'ny_language';

  final ApiClient api = ApiClient();
  final LiveWsService ws = LiveWsService();
  StreamSubscription<WsEvent>? _wsSub;
  Timer? _heartbeatTimer;

  bool initialized = false;
  AppLanguage language = AppLanguage.en;
  int activeTabIndex = 0; // 0=Discover, 1=Deliveries, 2=Activity, 3=Business

  // Auth & User
  DbUserRecord? currentUser;
  String? authToken;
  bool authLoading = false;

  // Location & GPS (Instant catalog first, then auto-reorder on GPS lock)
  DetectedLocation? detectedLocation;
  double? gpsLat;
  double? gpsLng;
  bool detectingGps = false;
  String? gpsError;

  // Public Catalog
  bool catalogLoading = false;
  String? catalogError;
  List<Category> categories = [];
  List<CategoryDocumentRequirement> requirements = [];
  List<Business> businesses = [];
  List<Listing> listings = [];
  List<ReviewItem> recentReviews = [];
  List<LiveProviderMarker> liveProviders = [];
  List<RecommendedItem> recommendations = [];
  PlatformPolicy policy = const PlatformPolicy(
    currency: 'ETB',
    taxRatePercent: 15,
    deliveryBaseFee: 70,
    deliveryPerKmRate: 18,
    expressMultiplier: 1.4,
    rideBaseFare: 90,
    ridePerKmRate: 26,
    deliveryMatchRadiusKm: 15,
  );

  // Cart & Compare
  final List<CartItem> cart = [];
  final List<int> compareListingIds = [];

  // User Workspace
  List<OrderRecord> myOrders = [];
  List<BookingRecord> myBookings = [];
  List<DeliveryRecord> myDeliveries = [];
  List<JobApplicationRecord> myApplications = [];
  List<int> favoriteIds = [];
  List<PendingNotificationItem> pendingNotifications = [];
  List<ChatThreadSummary> chatThreads = [];

  // External deep navigation requests (from notifications)
  String? pendingOpenThreadKey;
  String? pendingTrackCode;

  AppState() {
    _wsSub = ws.events.listen(_onWsEvent);
  }

  String t(String key) => AppTranslations.t(language, key);

  int get cartCount => cart.fold<int>(0, (sum, item) => sum + item.quantity);

  double get userLat => gpsLat ?? detectedLocation?.lat ?? AppConfig.addisCenterLat;
  double get userLng => gpsLng ?? detectedLocation?.lng ?? AppConfig.addisCenterLng;
  bool get hasExactGps => gpsLat != null && gpsLng != null;

  Business? businessById(int id) {
    for (final b in businesses) {
      if (b.id == id) return b;
    }
    return null;
  }

  Category? categoryById(int id) {
    for (final c in categories) {
      if (c.id == id) return c;
    }
    return null;
  }

  Listing? listingById(int id) {
    for (final l in listings) {
      if (l.id == id) return l;
    }
    return null;
  }

  double distanceToBusinessKm(Business b) {
    return AppConfig.haversineKm(userLat, userLng, b.latitude, b.longitude);
  }

  Future<void> bootstrap() async {
    final prefs = await SharedPreferences.getInstance();
    final savedUrl = prefs.getString(_prefBaseUrlKey);
    if (savedUrl != null && savedUrl.isNotEmpty) {
      api.baseUrl = AppConfig.normalizeBaseUrl(savedUrl);
    }
    language = AppTranslations.parseLanguage(prefs.getString(_prefLangKey));
    final savedToken = prefs.getString(_prefTokenKey);
    if (savedToken != null && savedToken.isNotEmpty) {
      authToken = savedToken;
      api.authToken = savedToken;
    }
    initialized = true;
    notifyListeners();

    // 1. Load catalog & recommendations IMMEDIATELY without blocking on GPS
    await loadCatalog(silent: false);

    // 2. Restore session if token exists
    if (authToken != null) {
      await refreshUserSession();
    }

    // 3. Detect exact GPS in background and re-order nearest once resolved
    unawaited(refreshExactGps(silent: true));
  }

  Future<void> setLanguage(AppLanguage lang) async {
    language = lang;
    notifyListeners();
    final prefs = await SharedPreferences.getInstance();
    await prefs.setString(_prefLangKey, lang.name);
    if (currentUser != null) {
      try {
        await api.updateProfile({'preferredLanguage': lang.name});
      } catch (_) {}
    }
  }

  Future<void> updateServerUrl(String url) async {
    final normalized = AppConfig.normalizeBaseUrl(url);
    api.baseUrl = normalized;
    final prefs = await SharedPreferences.getInstance();
    await prefs.setString(_prefBaseUrlKey, normalized);
    if (authToken != null) {
      ws.disconnect();
      ws.connect(api.baseUrl, authToken);
    }
    notifyListeners();
    await loadCatalog(silent: false);
    if (authToken != null) {
      await refreshUserSession();
    }
  }

  void setTabIndex(int idx) {
    activeTabIndex = idx.clamp(0, 3);
    notifyListeners();
  }

  Future<void> loadCatalog({bool silent = true}) async {
    if (!silent) {
      catalogLoading = true;
      catalogError = null;
      notifyListeners();
    }
    try {
      final data = await api.getCatalog(lat: gpsLat, lng: gpsLng);
      final rawCats = (data['categories'] as List?) ?? const [];
      final rawReqs = (data['requirements'] as List?) ?? const [];
      final rawBiz = (data['businesses'] as List?) ?? const [];
      final rawListings = (data['listings'] as List?) ?? const [];
      final rawReviews = (data['recentReviews'] as List?) ?? const [];
      final rawProviders = (data['liveProviders'] as List?) ?? const [];
      final rawRecs = (data['recommendations'] as List?) ?? const [];

      categories = rawCats
          .map((e) => Category.fromJson(Map<String, dynamic>.from(e as Map)))
          .where((c) => c.status.toUpperCase() == 'ACTIVE')
          .toList();
      requirements = rawReqs
          .map((e) => CategoryDocumentRequirement.fromJson(
              Map<String, dynamic>.from(e as Map)))
          .toList();
      businesses = rawBiz
          .map((e) => Business.fromJson(Map<String, dynamic>.from(e as Map)))
          .toList();
      listings = rawListings
          .map((e) => Listing.fromJson(Map<String, dynamic>.from(e as Map)))
          .toList();
      recentReviews = rawReviews
          .map((e) => ReviewItem.fromJson(Map<String, dynamic>.from(e as Map)))
          .toList();
      liveProviders = rawProviders
          .map((e) =>
              LiveProviderMarker.fromJson(Map<String, dynamic>.from(e as Map)))
          .toList();
      recommendations = rawRecs
          .map((e) =>
              RecommendedItem.fromJson(Map<String, dynamic>.from(e as Map)))
          .toList();
      if (data['policy'] is Map) {
        policy = PlatformPolicy.fromJson(
            Map<String, dynamic>.from(data['policy'] as Map));
      }
      if (data['detectedLocation'] is Map) {
        detectedLocation = DetectedLocation.fromJson(
            Map<String, dynamic>.from(data['detectedLocation'] as Map));
      }
      catalogError = null;
    } catch (e) {
      catalogError = e.toString();
    } finally {
      catalogLoading = false;
      notifyListeners();
    }
  }

  Future<void> refreshExactGps({bool silent = false}) async {
    if (!silent) {
      detectingGps = true;
      gpsError = null;
      notifyListeners();
    }
    try {
      final serviceEnabled = await Geolocator.isLocationServiceEnabled();
      if (!serviceEnabled) {
        gpsError = 'Location services are disabled on this device.';
        detectingGps = false;
        notifyListeners();
        return;
      }
      var perm = await Geolocator.checkPermission();
      if (perm == LocationPermission.denied) {
        perm = await Geolocator.requestPermission();
      }
      if (perm == LocationPermission.denied ||
          perm == LocationPermission.deniedForever) {
        gpsError = 'Location permission denied. Using Addis Ababa default.';
        detectingGps = false;
        notifyListeners();
        return;
      }
      final pos = await Geolocator.getCurrentPosition(
        locationSettings: const LocationSettings(
          accuracy: LocationAccuracy.high,
          timeLimit: Duration(seconds: 12),
        ),
      );
      gpsLat = pos.latitude;
      gpsLng = pos.longitude;
      gpsError = null;
      notifyListeners();

      // Re-fetch catalog & recommendations sorted nearest to exact GPS
      await loadCatalog(silent: true);
      try {
        detectedLocation =
            await api.detectLocation(lat: gpsLat, lng: gpsLng);
      } catch (_) {}
      // If user is a verified provider with live location active, ping location
      if (currentUser?.isVerifiedProvider == true) {
        try {
          await api.updateProviderLiveLocation(
            latitude: pos.latitude,
            longitude: pos.longitude,
            isLiveLocationActive: true,
          );
        } catch (_) {}
      }
    } catch (e) {
      if (!silent) {
        gpsError = 'Could not acquire GPS fix: $e';
      }
    } finally {
      detectingGps = false;
      notifyListeners();
    }
  }

  Future<void> signInWithEmail(String email, String password) async {
    authLoading = true;
    notifyListeners();
    try {
      final res = await api.login(email, password);
      await _applyAuthResponse(res);
    } finally {
      authLoading = false;
      notifyListeners();
    }
  }

  Future<void> signUpWithEmail({
    required String fullName,
    required String email,
    required String password,
    String? phoneNumber,
    String defaultSubCity = 'Bole',
  }) async {
    authLoading = true;
    notifyListeners();
    try {
      final res = await api.register(
        fullName: fullName,
        email: email,
        password: password,
        phoneNumber: phoneNumber,
        preferredLanguage: language.name,
        defaultSubCity: defaultSubCity,
        defaultLat: gpsLat,
        defaultLng: gpsLng,
      );
      await _applyAuthResponse(res);
    } finally {
      authLoading = false;
      notifyListeners();
    }
  }

  Future<void> _applyAuthResponse(Map<String, dynamic> res) async {
    final token = (res['token'] ?? '').toString();
    if (token.isEmpty) {
      throw ApiException(500, 'Authentication token missing in server response.');
    }
    authToken = token;
    api.authToken = token;
    final prefs = await SharedPreferences.getInstance();
    await prefs.setString(_prefTokenKey, token);

    if (res['user'] is Map) {
      currentUser =
          DbUserRecord.fromJson(Map<String, dynamic>.from(res['user'] as Map));
    } else {
      currentUser = await api.getMe();
    }
    _startAuthenticatedServices();
    await refreshWorkspace();
    notifyListeners();
  }

  Future<void> refreshUserSession() async {
    try {
      currentUser = await api.getMe();
      _startAuthenticatedServices();
      await refreshWorkspace();
    } on ApiException catch (e) {
      if (e.statusCode == 401 || e.statusCode == 403) {
        await signOut();
      }
    } catch (_) {}
    notifyListeners();
  }

  void _startAuthenticatedServices() {
    if (authToken != null && authToken!.isNotEmpty) {
      ws.connect(api.baseUrl, authToken);
      _heartbeatTimer?.cancel();
      _heartbeatTimer = Timer.periodic(const Duration(seconds: 45), (_) async {
        try {
          await api.heartbeat();
        } catch (_) {}
      });
    }
  }

  Future<void> refreshWorkspace() async {
    if (currentUser == null) return;
    try {
      final wsData = await api.getWorkspace();
      myOrders = ((wsData['orders'] as List?) ?? const [])
          .map((e) => OrderRecord.fromJson(Map<String, dynamic>.from(e as Map)))
          .toList();
      myBookings = ((wsData['bookings'] as List?) ?? const [])
          .map((e) => BookingRecord.fromJson(Map<String, dynamic>.from(e as Map)))
          .toList();
      myDeliveries = ((wsData['deliveries'] as List?) ?? const [])
          .map((e) => DeliveryRecord.fromJson(Map<String, dynamic>.from(e as Map)))
          .toList();
      myApplications = ((wsData['jobApplications'] as List?) ?? const [])
          .map((e) =>
              JobApplicationRecord.fromJson(Map<String, dynamic>.from(e as Map)))
          .toList();
      favoriteIds = ((wsData['favoriteIds'] as List?) ?? const [])
          .map((e) => parseInt(e))
          .toList();
    } catch (_) {}
    await Future.wait([
      refreshNotifications(),
      refreshChatThreads(),
    ]);
    notifyListeners();
  }

  Future<void> refreshNotifications() async {
    if (currentUser == null) {
      pendingNotifications = [];
      return;
    }
    try {
      pendingNotifications = await api.getPendingNotifications();
    } catch (_) {}
    notifyListeners();
  }

  Future<void> refreshChatThreads() async {
    if (currentUser == null) {
      chatThreads = [];
      return;
    }
    try {
      chatThreads = await api.getChatThreads();
    } catch (_) {}
    notifyListeners();
  }

  Future<void> signOut() async {
    currentUser = null;
    authToken = null;
    api.authToken = null;
    myOrders = [];
    myBookings = [];
    myDeliveries = [];
    myApplications = [];
    favoriteIds = [];
    pendingNotifications = [];
    chatThreads = [];
    _heartbeatTimer?.cancel();
    _heartbeatTimer = null;
    ws.disconnect();
    final prefs = await SharedPreferences.getInstance();
    await prefs.remove(_prefTokenKey);
    notifyListeners();
  }

  void _onWsEvent(WsEvent event) {
    if (currentUser == null) return;
    switch (event.type) {
      case 'chat:message':
        unawaited(refreshChatThreads());
        unawaited(refreshNotifications());
        break;
      case 'order:updated':
      case 'booking:updated':
      case 'application:updated':
      case 'delivery:updated':
      case 'payment:settled':
      case 'contract:updated':
        unawaited(refreshWorkspace());
        break;
    }
  }

  // ---------------- Cart & Compare ----------------

  void addToCart(Listing listing, Business business,
      {int quantity = 1, String? variant}) {
    final idx = cart.indexWhere(
        (c) => c.listing.id == listing.id && c.variant == variant);
    if (idx >= 0) {
      cart[idx] =
          cart[idx].copyWith(quantity: cart[idx].quantity + quantity);
    } else {
      cart.add(CartItem(
          listing: listing,
          business: business,
          quantity: quantity,
          variant: variant));
    }
    notifyListeners();
  }

  void updateCartQuantity(int listingId, String? variant, int nextQty) {
    final idx = cart.indexWhere(
        (c) => c.listing.id == listingId && c.variant == variant);
    if (idx < 0) return;
    if (nextQty <= 0) {
      cart.removeAt(idx);
    } else {
      cart[idx] = cart[idx].copyWith(quantity: nextQty);
    }
    notifyListeners();
  }

  void clearCart() {
    cart.clear();
    notifyListeners();
  }

  void toggleCompare(int listingId) {
    if (compareListingIds.contains(listingId)) {
      compareListingIds.remove(listingId);
    } else if (compareListingIds.length < 3) {
      compareListingIds.add(listingId);
    }
    notifyListeners();
  }

  Future<void> toggleFavorite(int listingId) async {
    if (currentUser == null) return;
    if (favoriteIds.contains(listingId)) {
      favoriteIds.remove(listingId);
    } else {
      favoriteIds.add(listingId);
    }
    notifyListeners();
    try {
      final serverFavs = await api.toggleFavorite(listingId);
      if (serverFavs.isNotEmpty) {
        favoriteIds = serverFavs;
      }
      notifyListeners();
    } catch (_) {}
  }

  void navigateFromNotification({String? threadKey, String? trackingCode, int tab = 2}) {
    pendingOpenThreadKey = threadKey;
    pendingTrackCode = trackingCode;
    activeTabIndex = tab;
    notifyListeners();
  }

  void consumeNotificationNavigation() {
    pendingOpenThreadKey = null;
    pendingTrackCode = null;
  }

  @override
  void dispose() {
    _wsSub?.cancel();
    _heartbeatTimer?.cancel();
    ws.dispose();
    super.dispose();
  }
}
