import 'dart:convert';
import 'package:file_picker/file_picker.dart';
import 'package:flutter/material.dart';
import 'package:image_picker/image_picker.dart';
import 'package:mobile_scanner/mobile_scanner.dart';
import 'package:provider/provider.dart';
import 'package:qr_flutter/qr_flutter.dart';
import '../core/config/app_config.dart';
import '../core/models/models.dart';
import '../core/providers/app_state.dart';
import '../core/theme/app_theme.dart';
import '../widgets/live_chat_sheet.dart';
import '../widgets/payment_details_sheet.dart';
import 'auth_sheet.dart';

class BusinessScreen extends StatefulWidget {
  const BusinessScreen({super.key});

  @override
  State<BusinessScreen> createState() => _BusinessScreenState();
}

class _BusinessScreenState extends State<BusinessScreen>
    with SingleTickerProviderStateMixin {
  late TabController _tabCtrl;
  bool _loading = false;
  String? _error;

  ProviderRegistration? _providerReg;
  List<ProviderRegistration> _pendingApprovals = [];
  List<Business> _myBusinesses = [];
  List<Listing> _myListings = [];
  List<OrderRecord> _incomingOrders = [];
  List<BookingRecord> _incomingBookings = [];
  List<JobApplicationRecord> _incomingApplications = [];
  List<PaymentTransactionRecord> _settlements = [];
  List<BankDirectoryItem> _banks = [];

  @override
  void initState() {
    super.initState();
    _tabCtrl = TabController(length: 4, vsync: this);
    _loadPortal();
  }

  @override
  void dispose() {
    _tabCtrl.dispose();
    super.dispose();
  }

  Future<void> _loadPortal() async {
    final app = context.read<AppState>();
    if (app.currentUser == null) return;
    setState(() {
      _loading = true;
      _error = null;
    });
    try {
      await app.loadCatalog(silent: true);
      final portal = await app.api.getBusinessPortal();
      final provMe = await app.api.getProviderMe();
      final banks = await app.api.getBanks();
      List<ProviderRegistration> approvals = [];
      try {
        approvals = await app.api.getProviderApprovals();
      } catch (_) {}
      List<PaymentTransactionRecord> settlements = [];
      try {
        settlements = await app.api.getProviderSettlements();
      } catch (_) {}

      if (!mounted) return;
      ProviderRegistration? parsedReg;
      final rawReg = provMe['registration'];
      if (rawReg is Map) {
        final outer = Map<String, dynamic>.from(rawReg);
        final inner = outer['registration'] is Map
            ? Map<String, dynamic>.from(outer['registration'] as Map)
            : outer;
        parsedReg = ProviderRegistration.fromJson(inner);
      }
      final parsedBusinesses =
          ((portal['ownedBusinesses'] ?? portal['businesses']) as List? ??
                  const [])
              .map((e) => Business.fromJson(Map<String, dynamic>.from(e as Map)))
              .toList();
      final ownedBizIds = parsedBusinesses.map((b) => b.id).toSet();
      final portalListings = (portal['listings'] as List?)
              ?.map((e) => Listing.fromJson(Map<String, dynamic>.from(e as Map)))
              .toList() ??
          app.listings
              .where((l) => ownedBizIds.contains(l.businessId))
              .toList();

      setState(() {
        _providerReg = parsedReg;
        _pendingApprovals = approvals;
        _myBusinesses = parsedBusinesses;
        _myListings = portalListings;
        _incomingOrders = ((portal['orders'] as List?) ?? const [])
            .map((e) => OrderRecord.fromJson(Map<String, dynamic>.from(e as Map)))
            .toList();
        _incomingBookings = ((portal['bookings'] as List?) ?? const [])
            .map((e) =>
                BookingRecord.fromJson(Map<String, dynamic>.from(e as Map)))
            .toList();
        _incomingApplications =
            ((portal['applications'] ?? portal['jobApplications']) as List? ??
                    const [])
                .map((e) => JobApplicationRecord.fromJson(
                    Map<String, dynamic>.from(e as Map)))
                .toList();
        _settlements = settlements;
        _banks = banks;
        _loading = false;
      });
    } catch (e) {
      if (mounted) {
        setState(() {
          _error = e.toString();
          _loading = false;
        });
      }
    }
  }

  Future<String?> _pickImageDataUrl({bool camera = false}) async {
    final picker = ImagePicker();
    final file = await picker.pickImage(
      source: camera ? ImageSource.camera : ImageSource.gallery,
      maxWidth: 1024,
      imageQuality: 75,
    );
    if (file == null) return null;
    final bytes = await file.readAsBytes();
    return 'data:image/jpeg;base64,${base64Encode(bytes)}';
  }

  Future<void> _openProviderRegistrationDialog() async {
    final app = context.read<AppState>();
    final nameCtrl = TextEditingController(text: app.currentUser?.fullName ?? '');
    final phoneCtrl =
        TextEditingController(text: app.currentUser?.phoneNumber ?? '');
    final faydaCtrl = TextEditingController();
    final landmarkCtrl = TextEditingController();
    String subCity = AppConfig.addisSubCities.first;
    int? catId = app.categories.isNotEmpty ? app.categories.first.id : null;
    String? faydaFront;
    String? profilePhoto;
    String? selfiePhoto;
    final Map<int, ({String fileName, String dataUrl, String docNo})> docs = {};

    await showModalBottomSheet(
      context: context,
      isScrollControlled: true,
      backgroundColor: Colors.white,
      shape: const RoundedRectangleBorder(
        borderRadius: BorderRadius.vertical(top: Radius.circular(22)),
      ),
      builder: (ctx) => StatefulBuilder(
        builder: (ctx, setSheet) {
          final reqs = app.requirements
              .where((r) => r.categoryId == catId)
              .toList();
          return DraggableScrollableSheet(
            initialChildSize: 0.9,
            minChildSize: 0.5,
            maxChildSize: 0.96,
            expand: false,
            builder: (_, sc) => Padding(
              padding: EdgeInsets.fromLTRB(
                  18, 12, 18, MediaQuery.of(ctx).viewInsets.bottom + 24),
              child: ListView(
                controller: sc,
                children: [
                  const Text(
                    'Service Provider Verification (Fayda KYC)',
                    style: TextStyle(fontSize: 18, fontWeight: FontWeight.w800),
                  ),
                  const SizedBox(height: 12),
                  TextField(
                    controller: nameCtrl,
                    decoration: const InputDecoration(labelText: 'Full Name *'),
                  ),
                  const SizedBox(height: 8),
                  TextField(
                    controller: phoneCtrl,
                    decoration:
                        const InputDecoration(labelText: 'Phone Number *'),
                  ),
                  const SizedBox(height: 8),
                  if (app.categories.isNotEmpty)
                    DropdownButtonFormField<int>(
                      value: catId,
                      decoration:
                          const InputDecoration(labelText: 'Primary Category *'),
                      items: app.categories
                          .map((c) => DropdownMenuItem(
                                value: c.id,
                                child: Text(c.labelFor(app.language.name)),
                              ))
                          .toList(),
                      onChanged: (v) => setSheet(() => catId = v),
                    ),
                  const SizedBox(height: 8),
                  TextField(
                    controller: faydaCtrl,
                    decoration: const InputDecoration(
                        labelText: 'Fayda National ID Number *'),
                  ),
                  const SizedBox(height: 8),
                  Row(
                    children: [
                      Expanded(
                        child: DropdownButtonFormField<String>(
                          value: subCity,
                          decoration:
                              const InputDecoration(labelText: 'Sub-City *'),
                          items: AppConfig.addisSubCities
                              .map((s) =>
                                  DropdownMenuItem(value: s, child: Text(s)))
                              .toList(),
                          onChanged: (v) =>
                              setSheet(() => subCity = v ?? 'Bole'),
                        ),
                      ),
                      const SizedBox(width: 8),
                      Expanded(
                        child: TextField(
                          controller: landmarkCtrl,
                          decoration:
                              const InputDecoration(labelText: 'Landmark *'),
                        ),
                      ),
                    ],
                  ),
                  const SizedBox(height: 12),
                  Wrap(
                    spacing: 8,
                    runSpacing: 8,
                    children: [
                      OutlinedButton.icon(
                        onPressed: () async {
                          final img = await _pickImageDataUrl();
                          if (img != null) setSheet(() => faydaFront = img);
                        },
                        icon: Icon(
                          faydaFront != null
                              ? Icons.check_circle_rounded
                              : Icons.badge_outlined,
                          color:
                              faydaFront != null ? AppTheme.primary : null,
                        ),
                        label: const Text('Fayda ID Photo *'),
                      ),
                      OutlinedButton.icon(
                        onPressed: () async {
                          final img = await _pickImageDataUrl();
                          if (img != null) setSheet(() => profilePhoto = img);
                        },
                        icon: Icon(
                          profilePhoto != null
                              ? Icons.check_circle_rounded
                              : Icons.person_outline_rounded,
                          color:
                              profilePhoto != null ? AppTheme.primary : null,
                        ),
                        label: const Text('Profile Photo *'),
                      ),
                      OutlinedButton.icon(
                        onPressed: () async {
                          final img = await _pickImageDataUrl(camera: true);
                          if (img != null) setSheet(() => selfiePhoto = img);
                        },
                        icon: Icon(
                          selfiePhoto != null
                              ? Icons.check_circle_rounded
                              : Icons.face_retouching_natural_rounded,
                          color:
                              selfiePhoto != null ? AppTheme.primary : null,
                        ),
                        label: const Text('Liveness Selfie (Camera) *'),
                      ),
                    ],
                  ),
                  if (reqs.isNotEmpty) ...[
                    const SizedBox(height: 14),
                    const Text('Category Documents',
                        style: TextStyle(fontWeight: FontWeight.w800)),
                    ...reqs.map((r) {
                      final uploaded = docs[r.id];
                      return ListTile(
                        contentPadding: EdgeInsets.zero,
                        title: Text(r.documentName,
                            style: const TextStyle(fontSize: 13)),
                        subtitle: Text(
                          uploaded?.fileName ??
                              (r.isMandatory ? 'Mandatory' : 'Optional'),
                          style: const TextStyle(fontSize: 11.5),
                        ),
                        trailing: OutlinedButton(
                          onPressed: () async {
                            final res = await FilePicker.platform.pickFiles(
                              withData: true,
                            );
                            if (res != null &&
                                res.files.isNotEmpty &&
                                res.files.first.bytes != null) {
                              final f = res.files.first;
                              setSheet(() {
                                docs[r.id] = (
                                  fileName: f.name,
                                  dataUrl:
                                      'data:application/octet-stream;base64,${base64Encode(f.bytes!)}',
                                  docNo: ''
                                );
                              });
                            }
                          },
                          child: const Text('Upload'),
                        ),
                      );
                    }),
                  ],
                  const SizedBox(height: 16),
                  ElevatedButton(
                    onPressed: () async {
                      if (catId == null ||
                          faydaFront == null ||
                          profilePhoto == null ||
                          selfiePhoto == null ||
                          faydaCtrl.text.trim().isEmpty) {
                        ScaffoldMessenger.of(ctx).showSnackBar(
                          const SnackBar(
                              content: Text(
                                  'Complete Fayda ID, photos, and selfie.')),
                        );
                        return;
                      }
                      await app.api.registerProvider({
                        'fullName': nameCtrl.text.trim(),
                        'phoneNumber': phoneCtrl.text.trim(),
                        'serviceCategoryId': catId,
                        'faydaIdNumber': faydaCtrl.text.trim(),
                        'faydaFrontImage': faydaFront,
                        'profilePhotoImage': profilePhoto,
                        'livenessPassed': true,
                        'livenessScore': 95,
                        'livenessChallenges': ['LOOK_LEFT', 'BLINK', 'SMILE'],
                        'livenessSelfieImage': selfiePhoto,
                        'subCity': subCity,
                        'landmark': landmarkCtrl.text.trim().isEmpty
                            ? subCity
                            : landmarkCtrl.text.trim(),
                        'latitude': app.userLat,
                        'longitude': app.userLng,
                        'isLiveLocationActive': true,
                        'documents': docs.entries
                            .map((e) => {
                                  'requirementId': e.key,
                                  'fileName': e.value.fileName,
                                  'fileDataUrl': e.value.dataUrl,
                                })
                            .toList(),
                      });
                      if (ctx.mounted) Navigator.pop(ctx);
                      await _loadPortal();
                    },
                    child: const Text('Submit Provider Verification'),
                  ),
                ],
              ),
            ),
          );
        },
      ),
    );
  }

  Future<void> _openQrScannerForVouch() async {
    bool scanned = false;
    await showModalBottomSheet(
      context: context,
      isScrollControlled: true,
      builder: (ctx) => SizedBox(
        height: 420,
        child: Column(
          children: [
            const Padding(
              padding: EdgeInsets.all(14),
              child: Text(
                'Scan Peer Provider QR Code to Vouch',
                style: TextStyle(fontWeight: FontWeight.w800, fontSize: 15),
              ),
            ),
            Expanded(
              child: MobileScanner(
                onDetect: (capture) async {
                  if (scanned) return;
                  final code = capture.barcodes.firstOrNull?.rawValue;
                  if (code == null || code.isEmpty) return;
                  scanned = true;
                  Navigator.pop(ctx);
                  try {
                    await context.read<AppState>().api.vouchScan(code);
                    if (mounted) {
                      ScaffoldMessenger.of(context).showSnackBar(
                        const SnackBar(
                            content: Text('Provider vouched successfully!')),
                      );
                    }
                    await _loadPortal();
                  } catch (e) {
                    if (mounted) {
                      ScaffoldMessenger.of(context)
                          .showSnackBar(SnackBar(content: Text(e.toString())));
                    }
                  }
                },
              ),
            ),
          ],
        ),
      ),
    );
  }

  Future<void> _openCreateBusinessDialog() async {
    final app = context.read<AppState>();
    final nameCtrl = TextEditingController();
    final descCtrl = TextEditingController();
    final licenseCtrl = TextEditingController();
    final tinCtrl = TextEditingController();
    final phoneCtrl =
        TextEditingController(text: app.currentUser?.phoneNumber ?? '');
    final landmarkCtrl = TextEditingController();
    String subCity = AppConfig.addisSubCities.first;
    int? catId = app.categories.isNotEmpty ? app.categories.first.id : null;

    await showDialog(
      context: context,
      builder: (ctx) => StatefulBuilder(
        builder: (ctx, setDlg) => AlertDialog(
          title: const Text('Register Business / Shop'),
          content: SingleChildScrollView(
            child: Column(
              mainAxisSize: MainAxisSize.min,
              children: [
                TextField(
                  controller: nameCtrl,
                  decoration:
                      const InputDecoration(labelText: 'Business Name *'),
                ),
                const SizedBox(height: 8),
                if (app.categories.isNotEmpty)
                  DropdownButtonFormField<int>(
                    value: catId,
                    decoration: const InputDecoration(labelText: 'Category *'),
                    items: app.categories
                        .map((c) => DropdownMenuItem(
                              value: c.id,
                              child: Text(c.labelFor(app.language.name)),
                            ))
                        .toList(),
                    onChanged: (v) => setDlg(() => catId = v),
                  ),
                const SizedBox(height: 8),
                TextField(
                  controller: licenseCtrl,
                  decoration:
                      const InputDecoration(labelText: 'License Number *'),
                ),
                const SizedBox(height: 8),
                TextField(
                  controller: tinCtrl,
                  decoration: const InputDecoration(labelText: 'TIN Number'),
                ),
                const SizedBox(height: 8),
                TextField(
                  controller: phoneCtrl,
                  decoration:
                      const InputDecoration(labelText: 'Contact Phone *'),
                ),
                const SizedBox(height: 8),
                DropdownButtonFormField<String>(
                  value: subCity,
                  decoration: const InputDecoration(labelText: 'Sub-City *'),
                  items: AppConfig.addisSubCities
                      .map((s) => DropdownMenuItem(value: s, child: Text(s)))
                      .toList(),
                  onChanged: (v) => setDlg(() => subCity = v ?? 'Bole'),
                ),
                const SizedBox(height: 8),
                TextField(
                  controller: landmarkCtrl,
                  decoration: const InputDecoration(labelText: 'Landmark *'),
                ),
                const SizedBox(height: 8),
                TextField(
                  controller: descCtrl,
                  maxLines: 2,
                  decoration: const InputDecoration(labelText: 'Description *'),
                ),
              ],
            ),
          ),
          actions: [
            TextButton(
              onPressed: () => Navigator.pop(ctx),
              child: const Text('Cancel'),
            ),
            ElevatedButton(
              onPressed: () async {
                if (nameCtrl.text.trim().isEmpty ||
                    licenseCtrl.text.trim().isEmpty ||
                    catId == null) {
                  return;
                }
                await app.api.createBusiness({
                  'businessName': nameCtrl.text.trim(),
                  'description': descCtrl.text.trim().isEmpty
                      ? nameCtrl.text.trim()
                      : descCtrl.text.trim(),
                  'categoryId': catId,
                  'licenseNumber': licenseCtrl.text.trim(),
                  if (tinCtrl.text.trim().isNotEmpty)
                    'tinNumber': tinCtrl.text.trim(),
                  'contactPhone': phoneCtrl.text.trim(),
                  'subCity': subCity,
                  'landmark': landmarkCtrl.text.trim().isEmpty
                      ? subCity
                      : landmarkCtrl.text.trim(),
                  'latitude': app.userLat,
                  'longitude': app.userLng,
                  'liveLocationActive': true,
                });
                if (ctx.mounted) Navigator.pop(ctx);
                await _loadPortal();
                await app.loadCatalog(silent: true);
              },
              child: const Text('Register'),
            ),
          ],
        ),
      ),
    );
  }

  Future<void> _openBusinessPayoutDialog(Business b) async {
    final app = context.read<AppState>();
    String? bankCode = b.payoutBankCode;
    final accNoCtrl = TextEditingController(text: b.payoutAccountNumber ?? '');
    final accNameCtrl =
        TextEditingController(text: b.payoutAccountName ?? b.businessName);
    final teleCtrl =
        TextEditingController(text: b.payoutTelebirrNumber ?? b.contactPhone);
    final payoCtrl = TextEditingController(text: b.payoAccountHandle ?? '');
    String gateway = b.preferredPayoutGateway ?? 'BOTH';

    await showDialog(
      context: context,
      builder: (ctx) => StatefulBuilder(
        builder: (ctx, setDlg) => AlertDialog(
          title: Text('Payout Account · ${b.businessName}'),
          content: SingleChildScrollView(
            child: Column(
              mainAxisSize: MainAxisSize.min,
              children: [
                if (_banks.isNotEmpty)
                  DropdownButtonFormField<String>(
                    value: _banks.any((bk) => bk.code == bankCode)
                        ? bankCode
                        : null,
                    decoration: const InputDecoration(labelText: 'Bank'),
                    items: _banks
                        .map((bk) => DropdownMenuItem(
                            value: bk.code, child: Text(bk.name)))
                        .toList(),
                    onChanged: (v) => setDlg(() => bankCode = v),
                  ),
                const SizedBox(height: 8),
                TextField(
                  controller: accNoCtrl,
                  decoration:
                      const InputDecoration(labelText: 'Bank Account Number'),
                ),
                const SizedBox(height: 8),
                TextField(
                  controller: accNameCtrl,
                  decoration:
                      const InputDecoration(labelText: 'Account Holder Name'),
                ),
                const SizedBox(height: 8),
                TextField(
                  controller: teleCtrl,
                  decoration:
                      const InputDecoration(labelText: 'Telebirr Number'),
                ),
                const SizedBox(height: 8),
                TextField(
                  controller: payoCtrl,
                  decoration:
                      const InputDecoration(labelText: 'Payo Account Handle'),
                ),
                const SizedBox(height: 8),
                DropdownButtonFormField<String>(
                  value: gateway,
                  decoration:
                      const InputDecoration(labelText: 'Preferred Gateway'),
                  items: const [
                    DropdownMenuItem(value: 'BOTH', child: Text('Chapa + Payo')),
                    DropdownMenuItem(value: 'CHAPA', child: Text('Chapa')),
                    DropdownMenuItem(value: 'PAYO', child: Text('Payo')),
                  ],
                  onChanged: (v) => setDlg(() => gateway = v ?? 'BOTH'),
                ),
              ],
            ),
          ),
          actions: [
            TextButton(
              onPressed: () => Navigator.pop(ctx),
              child: const Text('Cancel'),
            ),
            ElevatedButton(
              onPressed: () async {
                String? bankName;
                for (final bk in _banks) {
                  if (bk.code == bankCode) bankName = bk.name;
                }
                await app.api.updateBusinessPayoutAccount(b.id, {
                  if (bankCode != null) 'bankCode': bankCode,
                  if (bankName != null) 'bankName': bankName,
                  'accountNumber': accNoCtrl.text.trim(),
                  'accountName': accNameCtrl.text.trim(),
                  'telebirrNumber': teleCtrl.text.trim(),
                  'payoAccountHandle': payoCtrl.text.trim(),
                  'preferredPayoutGateway': gateway,
                });
                if (ctx.mounted) Navigator.pop(ctx);
                await _loadPortal();
              },
              child: const Text('Save'),
            ),
          ],
        ),
      ),
    );
  }

  Future<void> _openCreateOrEditListingDialog({Listing? existing}) async {
    final app = context.read<AppState>();
    if (_myBusinesses.isEmpty) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('Register a business first.')),
      );
      return;
    }

    int bizId = existing?.businessId ?? _myBusinesses.first.id;
    int catId = existing?.categoryId ??
        (_myBusinesses.firstWhere((b) => b.id == bizId).categoryId);
    String listingType = existing?.listingType ?? 'PRODUCT';
    String pricingModel = existing?.pricingModel ?? 'FIXED';
    final titleCtrl = TextEditingController(text: existing?.title ?? '');
    final descCtrl = TextEditingController(text: existing?.description ?? '');
    final priceCtrl = TextEditingController(
        text: existing != null ? existing.basePrice.round().toString() : '');
    final freeKmCtrl = TextEditingController(
      text: (existing?.metadata?['freeDeliveryMaxKm'] ?? '0').toString(),
    );
    bool deliveryAvailable =
        existing?.metadata?['deliveryAvailable'] != false;
    String taxResponsibility =
        (existing?.metadata?['taxResponsibility'] ?? 'SELLER')
            .toString()
            .toUpperCase();
    bool taxConfirmed = existing?.metadata?['taxConfirmedBySeller'] == true;
    final List<String> imgs = List.from(existing?.galleryImages ?? const []);

    await showModalBottomSheet(
      context: context,
      isScrollControlled: true,
      backgroundColor: Colors.white,
      shape: const RoundedRectangleBorder(
        borderRadius: BorderRadius.vertical(top: Radius.circular(22)),
      ),
      builder: (ctx) => StatefulBuilder(
        builder: (ctx, setSheet) => DraggableScrollableSheet(
          initialChildSize: 0.9,
          minChildSize: 0.5,
          maxChildSize: 0.96,
          expand: false,
          builder: (_, sc) => Padding(
            padding: EdgeInsets.fromLTRB(
                18, 12, 18, MediaQuery.of(ctx).viewInsets.bottom + 24),
            child: ListView(
              controller: sc,
              children: [
                Text(
                  existing == null
                      ? 'Publish New Listing'
                      : 'Edit Listing · ${existing.title}',
                  style: const TextStyle(
                      fontSize: 18, fontWeight: FontWeight.w800),
                ),
                const SizedBox(height: 10),
                if (existing == null)
                  DropdownButtonFormField<int>(
                    value: bizId,
                    decoration: const InputDecoration(labelText: 'Business'),
                    items: _myBusinesses
                        .map((b) => DropdownMenuItem(
                            value: b.id, child: Text(b.businessName)))
                        .toList(),
                    onChanged: (v) => setSheet(() {
                      bizId = v ?? bizId;
                      final match = _myBusinesses
                          .where((b) => b.id == bizId)
                          .toList();
                      if (match.isNotEmpty) {
                        catId = match.first.categoryId;
                      }
                    }),
                  ),
                const SizedBox(height: 8),
                DropdownButtonFormField<String>(
                  value: listingType,
                  decoration: const InputDecoration(labelText: 'Listing Type'),
                  items: const [
                    DropdownMenuItem(value: 'PRODUCT', child: Text('Product')),
                    DropdownMenuItem(value: 'FOOD', child: Text('Food / Meal')),
                    DropdownMenuItem(value: 'SERVICE', child: Text('Service')),
                    DropdownMenuItem(value: 'RENTAL', child: Text('Rental')),
                    DropdownMenuItem(value: 'JOB', child: Text('Job Opening')),
                    DropdownMenuItem(value: 'EVENT', child: Text('Event')),
                  ],
                  onChanged: (v) =>
                      setSheet(() => listingType = v ?? 'PRODUCT'),
                ),
                const SizedBox(height: 8),
                TextField(
                  controller: titleCtrl,
                  decoration: const InputDecoration(labelText: 'Title *'),
                ),
                const SizedBox(height: 8),
                TextField(
                  controller: descCtrl,
                  maxLines: 3,
                  decoration: const InputDecoration(labelText: 'Description *'),
                ),
                const SizedBox(height: 8),
                Row(
                  children: [
                    Expanded(
                      child: DropdownButtonFormField<String>(
                        value: pricingModel,
                        decoration:
                            const InputDecoration(labelText: 'Pricing Model'),
                        items: const [
                          DropdownMenuItem(
                              value: 'FIXED', child: Text('Fixed')),
                          DropdownMenuItem(
                              value: 'PER_UNIT', child: Text('Per Unit')),
                          DropdownMenuItem(
                              value: 'PER_HOUR', child: Text('Per Hour')),
                          DropdownMenuItem(
                              value: 'PER_DAY', child: Text('Per Day')),
                          DropdownMenuItem(
                              value: 'PER_MONTH', child: Text('Per Month')),
                        ],
                        onChanged: (v) =>
                            setSheet(() => pricingModel = v ?? 'FIXED'),
                      ),
                    ),
                    const SizedBox(width: 8),
                    Expanded(
                      child: TextField(
                        controller: priceCtrl,
                        keyboardType: TextInputType.number,
                        decoration:
                            const InputDecoration(labelText: 'Price (ETB) *'),
                      ),
                    ),
                  ],
                ),
                const SizedBox(height: 10),
                SwitchListTile(
                  contentPadding: EdgeInsets.zero,
                  value: deliveryAvailable,
                  onChanged: (v) => setSheet(() => deliveryAvailable = v),
                  title: const Text('Delivery Supported'),
                ),
                if (deliveryAvailable)
                  TextField(
                    controller: freeKmCtrl,
                    keyboardType: TextInputType.number,
                    decoration: const InputDecoration(
                      labelText: '0 – X km Covered by Provider',
                      helperText:
                          'Buyers within 0 to X km pay 0 ETB delivery fee.',
                    ),
                  ),
                const SizedBox(height: 12),
                // Mandatory Tax Responsibility Confirmation (Seller vs Buyer)
                Container(
                  padding: const EdgeInsets.all(12),
                  decoration: BoxDecoration(
                    color: AppTheme.surfaceBg,
                    borderRadius: BorderRadius.circular(12),
                    border: Border.all(color: AppTheme.border),
                  ),
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      const Text(
                        'Tax Responsibility (Must Confirm) *',
                        style: TextStyle(
                            fontWeight: FontWeight.w800, fontSize: 13),
                      ),
                      const SizedBox(height: 6),
                      SegmentedButton<String>(
                        segments: const [
                          ButtonSegment(
                              value: 'SELLER', label: Text('Tax from Seller')),
                          ButtonSegment(
                              value: 'BUYER', label: Text('Tax from Buyer')),
                        ],
                        selected: {taxResponsibility},
                        onSelectionChanged: (s) =>
                            setSheet(() => taxResponsibility = s.first),
                      ),
                      const SizedBox(height: 4),
                      Text(
                        taxResponsibility == 'SELLER'
                            ? 'Buyer pays only the visible amount; no extra tax is added at checkout.'
                            : 'Platform VAT (${app.policy.taxRatePercent.round()}%) is added at checkout.',
                        style: const TextStyle(
                            fontSize: 11.5, color: AppTheme.mutedInk),
                      ),
                      CheckboxListTile(
                        contentPadding: EdgeInsets.zero,
                        value: taxConfirmed,
                        onChanged: (v) =>
                            setSheet(() => taxConfirmed = v ?? false),
                        title: const Text(
                          'I confirm this tax configuration applies to buyers',
                          style: TextStyle(
                              fontSize: 12.5, fontWeight: FontWeight.w600),
                        ),
                      ),
                    ],
                  ),
                ),
                const SizedBox(height: 10),
                OutlinedButton.icon(
                  onPressed: imgs.length >= 5
                      ? null
                      : () async {
                          final url = await _pickImageDataUrl();
                          if (url != null) setSheet(() => imgs.add(url));
                        },
                  icon: const Icon(Icons.add_photo_alternate_outlined),
                  label: Text('Add Product/Service Photo (${imgs.length}/5)'),
                ),
                const SizedBox(height: 14),
                ElevatedButton(
                  onPressed: () async {
                    if (!taxConfirmed) {
                      ScaffoldMessenger.of(ctx).showSnackBar(
                        const SnackBar(
                            content: Text(
                                'Please confirm Seller vs Buyer tax responsibility.')),
                      );
                      return;
                    }
                    final price = double.tryParse(priceCtrl.text.trim()) ?? 0;
                    if (titleCtrl.text.trim().isEmpty || price <= 0) return;

                    final meta = <String, dynamic>{
                      ...(existing?.metadata ?? const {}),
                      'deliveryAvailable': deliveryAvailable,
                      'freeDeliveryMaxKm':
                          double.tryParse(freeKmCtrl.text.trim()) ?? 0,
                      'taxResponsibility': taxResponsibility,
                      'taxConfirmedBySeller': true,
                    };

                    if (existing == null) {
                      await app.api.createListing({
                        'businessId': bizId,
                        'categoryId': catId,
                        'listingType': listingType,
                        'title': titleCtrl.text.trim(),
                        'description': descCtrl.text.trim(),
                        if (imgs.isNotEmpty) 'imageUrl': imgs.first,
                        'imageUrls': imgs,
                        'pricingModel': pricingModel,
                        'pricingUnit': 'UNIT',
                        'basePrice': price,
                        'isQuoteBased': false,
                        'isUnpaid': false,
                        'metadata': meta,
                        'status': 'ACTIVE',
                      });
                    } else {
                      await app.api.updateListing(existing.id, {
                        'title': titleCtrl.text.trim(),
                        'description': descCtrl.text.trim(),
                        if (imgs.isNotEmpty) 'imageUrl': imgs.first,
                        'imageUrls': imgs,
                        'pricingModel': pricingModel,
                        'pricingUnit': existing.pricingUnit,
                        'basePrice': price,
                        'metadata': meta,
                        'availabilityStatus': existing.availabilityStatus,
                        'status': 'ACTIVE',
                      });
                    }
                    if (ctx.mounted) Navigator.pop(ctx);
                    await _loadPortal();
                    await app.loadCatalog(silent: true);
                  },
                  child: Text(
                      existing == null ? 'Publish Listing' : 'Save Changes'),
                ),
              ],
            ),
          ),
        ),
      ),
    );
  }

  Future<void> _acceptOrderDialog(OrderRecord o) async {
    final readyCtrl = TextEditingController(
        text: (o.estimatedReadyMinutes ?? 20).toString());
    final delivCtrl = TextEditingController(
        text: (o.estimatedDeliveryMinutes ?? 45).toString());
    final ok = await showDialog<bool>(
      context: context,
      builder: (ctx) => AlertDialog(
        title: Text('Accept ${o.orderNumber}'),
        content: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            TextField(
              controller: readyCtrl,
              keyboardType: TextInputType.number,
              decoration:
                  const InputDecoration(labelText: 'Estimated Ready (mins)'),
            ),
            const SizedBox(height: 8),
            TextField(
              controller: delivCtrl,
              keyboardType: TextInputType.number,
              decoration:
                  const InputDecoration(labelText: 'Estimated Delivery (mins)'),
            ),
          ],
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(ctx, false),
            child: const Text('Cancel'),
          ),
          ElevatedButton(
            onPressed: () => Navigator.pop(ctx, true),
            child: const Text('Accept Order'),
          ),
        ],
      ),
    );
    if (ok == true) {
      await context.read<AppState>().api.updateOrderStatus(
            o.id,
            orderStatus: 'PREPARING',
            estimatedReadyMinutes: int.tryParse(readyCtrl.text) ?? 20,
            estimatedDeliveryMinutes: int.tryParse(delivCtrl.text) ?? 45,
          );
      await _loadPortal();
    }
  }

  @override
  Widget build(BuildContext context) {
    final app = context.watch<AppState>();
    if (app.currentUser == null) {
      return Center(
        child: Padding(
          padding: const EdgeInsets.all(24),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              const Icon(Icons.storefront_rounded,
                  size: 56, color: AppTheme.primary),
              const SizedBox(height: 12),
              const Text(
                'Business & Provider Hub',
                style: TextStyle(fontSize: 18, fontWeight: FontWeight.w800),
              ),
              const SizedBox(height: 6),
              const Text(
                'Sign in to complete Fayda verification, scan Peer QR vouchers, register businesses, publish listings, and manage orders.',
                textAlign: TextAlign.center,
                style: TextStyle(color: AppTheme.mutedInk),
              ),
              const SizedBox(height: 16),
              ElevatedButton(
                onPressed: () => AuthSheet.show(context),
                child: Text(app.t('sign_in')),
              ),
            ],
          ),
        ),
      );
    }

    return Column(
      children: [
        Container(
          color: Colors.white,
          child: TabBar(
            controller: _tabCtrl,
            isScrollable: true,
            labelColor: AppTheme.primary,
            indicatorColor: AppTheme.primary,
            tabs: [
              const Tab(text: 'KYC & Peer QR'),
              Tab(text: 'Businesses (${_myBusinesses.length})'),
              Tab(text: 'Listings (${_myListings.length})'),
              Tab(text: 'Orders & Payouts (${_incomingOrders.length})'),
            ],
          ),
        ),
        if (_loading) const LinearProgressIndicator(minHeight: 2),
        if (_error != null)
          Container(
            width: double.infinity,
            padding: const EdgeInsets.all(8),
            color: const Color(0xFFFFEBEE),
            child: Text(_error!,
                style: const TextStyle(color: AppTheme.danger, fontSize: 12)),
          ),
        Expanded(
          child: TabBarView(
            controller: _tabCtrl,
            children: [
              _buildKycTab(app),
              _buildBusinessesTab(app),
              _buildListingsTab(app),
              _buildOperationsTab(app),
            ],
          ),
        ),
      ],
    );
  }

  Widget _buildKycTab(AppState app) {
    final reg = _providerReg;
    return RefreshIndicator(
      onRefresh: _loadPortal,
      child: ListView(
        padding: const EdgeInsets.all(14),
        children: [
          Card(
            child: Padding(
              padding: const EdgeInsets.all(14),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  const Text('Provider KYC Status',
                      style:
                          TextStyle(fontWeight: FontWeight.w800, fontSize: 15)),
                  const SizedBox(height: 6),
                  if (reg == null) ...[
                    const Text(
                      'Submit your Fayda ID, biometric selfie, and category documents to verify as a provider or delivery partner.',
                      style: TextStyle(fontSize: 12.5, color: AppTheme.mutedInk),
                    ),
                    const SizedBox(height: 12),
                    ElevatedButton.icon(
                      onPressed: _openProviderRegistrationDialog,
                      icon: const Icon(Icons.verified_user_outlined),
                      label: const Text('Start Provider Verification'),
                    ),
                  ] else ...[
                    Text('Status: ${reg.status}',
                        style: const TextStyle(
                            fontWeight: FontWeight.w800,
                            color: AppTheme.primary)),
                    Text('Fayda ID: ${reg.faydaIdNumber}'),
                    Text('Area: ${reg.subCity} (${reg.landmark})'),
                    if (reg.qrVoucherToken != null &&
                        reg.qrVoucherToken!.isNotEmpty) ...[
                      const SizedBox(height: 12),
                      Center(
                        child: QrImageView(
                          data: reg.qrVoucherToken!,
                          size: 165,
                        ),
                      ),
                      const SizedBox(height: 6),
                      Center(
                        child: TextButton.icon(
                          onPressed: () async {
                            await app.api.regenerateProviderQr();
                            await _loadPortal();
                          },
                          icon: const Icon(Icons.refresh_rounded, size: 17),
                          label: const Text('Regenerate Peer QR'),
                        ),
                      ),
                    ],
                    if (reg.status == 'VERIFIED') ...[
                      const SizedBox(height: 8),
                      ElevatedButton.icon(
                        onPressed: () async {
                          await app.api.updateProviderLiveLocation(
                            latitude: app.userLat,
                            longitude: app.userLng,
                            isLiveLocationActive: !reg.isLiveLocationActive,
                          );
                          await _loadPortal();
                        },
                        icon: const Icon(Icons.gps_fixed_rounded),
                        label: Text(reg.isLiveLocationActive
                            ? 'Live GPS Active · Pause'
                            : 'Activate Live GPS'),
                      ),
                    ],
                  ],
                ],
              ),
            ),
          ),
          const SizedBox(height: 12),
          Card(
            child: ListTile(
              leading: const Icon(Icons.qr_code_scanner_rounded,
                  color: AppTheme.primary),
              title: const Text('Vouch Another Provider (Scan QR)',
                  style: TextStyle(fontWeight: FontWeight.w700)),
              subtitle: const Text(
                  'Verified users can vouch for new applicants by scanning their QR.'),
              trailing: ElevatedButton(
                onPressed: _openQrScannerForVouch,
                child: const Text('Scan'),
              ),
            ),
          ),
          if (_pendingApprovals.isNotEmpty) ...[
            const SizedBox(height: 14),
            const Text('Provider Approvals (Your Approver Role)',
                style: TextStyle(fontWeight: FontWeight.w800, fontSize: 15)),
            const SizedBox(height: 6),
            ..._pendingApprovals.map((p) => Card(
                  margin: const EdgeInsets.only(bottom: 8),
                  child: ListTile(
                    title: Text(p.fullName,
                        style: const TextStyle(fontWeight: FontWeight.w700)),
                    subtitle: Text('${p.subCity} · ${p.status}'),
                    trailing: Row(
                      mainAxisSize: MainAxisSize.min,
                      children: [
                        IconButton(
                          icon: const Icon(Icons.check_circle_rounded,
                              color: AppTheme.primary),
                          onPressed: () async {
                            await app.api.approveProvider(p.id, 'VERIFIED');
                            await _loadPortal();
                          },
                        ),
                        IconButton(
                          icon: const Icon(Icons.cancel_rounded,
                              color: AppTheme.danger),
                          onPressed: () async {
                            await app.api.approveProvider(p.id, 'REJECTED');
                            await _loadPortal();
                          },
                        ),
                      ],
                    ),
                  ),
                )),
          ],
        ],
      ),
    );
  }

  Widget _buildBusinessesTab(AppState app) {
    return ListView(
      padding: const EdgeInsets.all(14),
      children: [
        ElevatedButton.icon(
          onPressed: _openCreateBusinessDialog,
          icon: const Icon(Icons.add_business_rounded),
          label: const Text('Register New Business'),
        ),
        const SizedBox(height: 12),
        ..._myBusinesses.map((b) => Card(
              margin: const EdgeInsets.only(bottom: 10),
              child: Padding(
                padding: const EdgeInsets.all(12),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Row(
                      mainAxisAlignment: MainAxisAlignment.spaceBetween,
                      children: [
                        Expanded(
                          child: Text(b.businessName,
                              style: const TextStyle(
                                  fontWeight: FontWeight.w800, fontSize: 15)),
                        ),
                        Text(b.verificationStatus,
                            style: const TextStyle(
                                fontWeight: FontWeight.w800,
                                fontSize: 11.5,
                                color: AppTheme.primary)),
                      ],
                    ),
                    Text('${b.subCity} · License: ${b.licenseNumber}',
                        style: const TextStyle(
                            fontSize: 12, color: AppTheme.mutedInk)),
                    const SizedBox(height: 8),
                    OutlinedButton.icon(
                      onPressed: () => _openBusinessPayoutDialog(b),
                      icon: const Icon(Icons.account_balance_rounded, size: 17),
                      label: Text(b.payoutAccountNumber != null
                          ? 'Payout: ${b.payoutBankName ?? b.payoutBankCode} (${b.payoutAccountNumber})'
                          : 'Configure Chapa / Payo Payout Account'),
                    ),
                  ],
                ),
              ),
            )),
      ],
    );
  }

  Widget _buildListingsTab(AppState app) {
    return ListView(
      padding: const EdgeInsets.all(14),
      children: [
        ElevatedButton.icon(
          onPressed: () => _openCreateOrEditListingDialog(),
          icon: const Icon(Icons.add_circle_outline_rounded),
          label: const Text('Publish Product / Service / Job'),
        ),
        const SizedBox(height: 12),
        ..._myListings.map((l) => Card(
              margin: const EdgeInsets.only(bottom: 10),
              child: ListTile(
                title: Text(l.title,
                    style: const TextStyle(fontWeight: FontWeight.w700)),
                subtitle: Text(
                    '${AppConfig.formatEtb(l.effectivePrice)} · ${l.availabilityStatus} · Tax: ${l.metadata?['taxResponsibility'] ?? 'BUYER'}'),
                trailing: Wrap(
                  spacing: 4,
                  children: [
                    IconButton(
                      icon: const Icon(Icons.edit_outlined),
                      onPressed: () =>
                          _openCreateOrEditListingDialog(existing: l),
                    ),
                    IconButton(
                      icon: Icon(
                        l.availabilityStatus == 'AVAILABLE'
                            ? Icons.toggle_on_rounded
                            : Icons.toggle_off_rounded,
                        color: AppTheme.primary,
                        size: 28,
                      ),
                      onPressed: () async {
                        final next = l.availabilityStatus == 'AVAILABLE'
                            ? 'BUSY'
                            : 'AVAILABLE';
                        await app.api.updateListingAvailability(l.id, next);
                        await _loadPortal();
                      },
                    ),
                  ],
                ),
              ),
            )),
      ],
    );
  }

  Widget _buildOperationsTab(AppState app) {
    return RefreshIndicator(
      onRefresh: _loadPortal,
      child: ListView(
        padding: const EdgeInsets.all(14),
        children: [
          const Text('Incoming Orders',
              style: TextStyle(fontWeight: FontWeight.w800, fontSize: 15)),
          const SizedBox(height: 6),
          if (_incomingOrders.isEmpty)
            const Text('No incoming orders.',
                style: TextStyle(fontSize: 12.5, color: AppTheme.mutedInk))
          else
            ..._incomingOrders.map((o) => Card(
                  margin: const EdgeInsets.only(bottom: 8),
                  child: Padding(
                    padding: const EdgeInsets.all(12),
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Row(
                          mainAxisAlignment: MainAxisAlignment.spaceBetween,
                          children: [
                            Text('${o.orderNumber} · ${o.customerName}',
                                style: const TextStyle(
                                    fontWeight: FontWeight.w800)),
                            Text(o.orderStatus,
                                style: const TextStyle(
                                    fontWeight: FontWeight.w800,
                                    color: AppTheme.primary,
                                    fontSize: 12)),
                          ],
                        ),
                        Text(
                            '${AppConfig.formatEtb(o.totalAmount)} · ${o.paymentStatus}',
                            style: const TextStyle(fontSize: 12.5)),
                        const SizedBox(height: 6),
                        Wrap(
                          spacing: 6,
                          runSpacing: 6,
                          children: [
                            if (o.orderStatus == 'PENDING' ||
                                o.orderStatus == 'PLACED' ||
                                o.orderStatus == 'CONFIRMED')
                              ElevatedButton(
                                onPressed: () => _acceptOrderDialog(o),
                                child: const Text('Accept & Set ETA'),
                              ),
                            if (o.orderStatus == 'PREPARING')
                              ElevatedButton(
                                onPressed: () async {
                                  await app.api.updateOrderStatus(o.id,
                                      orderStatus: 'READY');
                                  await _loadPortal();
                                },
                                child: const Text('Mark Ready'),
                              ),
                            if (o.orderStatus == 'READY')
                              ElevatedButton(
                                onPressed: () async {
                                  await app.api.updateOrderStatus(o.id,
                                      orderStatus: 'COMPLETED');
                                  await _loadPortal();
                                },
                                child: const Text('Complete'),
                              ),
                            OutlinedButton(
                              onPressed: () => PaymentDetailsSheet.show(
                                context,
                                transactionType: 'ORDER',
                                referenceId: o.id,
                                title: 'Payment · ${o.orderNumber}',
                              ),
                              child: const Text('Payment Details'),
                            ),
                            OutlinedButton(
                              onPressed: () => LiveChatSheet.show(
                                context,
                                orderId: o.id,
                                businessId: o.businessId,
                                title: o.customerName,
                                subtitle: o.orderNumber,
                              ),
                              child: const Text('Live Chat'),
                            ),
                          ],
                        ),
                      ],
                    ),
                  ),
                )),
          const Divider(height: 24),
          const Text('Incoming Bookings',
              style: TextStyle(fontWeight: FontWeight.w800, fontSize: 15)),
          const SizedBox(height: 6),
          ..._incomingBookings.map((b) => Card(
                margin: const EdgeInsets.only(bottom: 8),
                child: ListTile(
                  title: Text('${b.bookingReference} · ${b.customerName}',
                      style: const TextStyle(fontWeight: FontWeight.w700)),
                  subtitle: Text('${b.scheduledDate} · ${b.bookingStatus}'),
                  trailing: b.bookingStatus == 'PENDING'
                      ? ElevatedButton(
                          onPressed: () async {
                            await app.api.updateBookingStatus(b.id,
                                bookingStatus: 'CONFIRMED');
                            await _loadPortal();
                          },
                          child: const Text('Confirm'),
                        )
                      : null,
                ),
              )),
          const Divider(height: 24),
          const Text('Job Applications Received',
              style: TextStyle(fontWeight: FontWeight.w800, fontSize: 15)),
          const SizedBox(height: 6),
          ..._incomingApplications.map((a) => Card(
                margin: const EdgeInsets.only(bottom: 8),
                child: ListTile(
                  title: Text('${a.applicantName} · ${a.skills}',
                      style: const TextStyle(fontWeight: FontWeight.w700)),
                  subtitle: Text(
                      '${a.experienceYears}y exp · ${a.applicationStatus}'),
                  trailing: a.applicationStatus == 'SUBMITTED'
                      ? Row(
                          mainAxisSize: MainAxisSize.min,
                          children: [
                            IconButton(
                              icon: const Icon(Icons.check_rounded,
                                  color: AppTheme.primary),
                              onPressed: () async {
                                await app.api
                                    .updateApplicationStatus(a.id, 'SHORTLISTED');
                                await _loadPortal();
                              },
                            ),
                            IconButton(
                              icon: const Icon(Icons.close_rounded,
                                  color: AppTheme.danger),
                              onPressed: () async {
                                await app.api
                                    .updateApplicationStatus(a.id, 'REJECTED');
                                await _loadPortal();
                              },
                            ),
                          ],
                        )
                      : null,
                ),
              )),
          const Divider(height: 24),
          const Text('Provider Settlements',
              style: TextStyle(fontWeight: FontWeight.w800, fontSize: 15)),
          const SizedBox(height: 6),
          if (_settlements.isEmpty)
            const Text('No settlements yet.',
                style: TextStyle(fontSize: 12.5, color: AppTheme.mutedInk))
          else
            ..._settlements.map((s) => Card(
                  margin: const EdgeInsets.only(bottom: 8),
                  child: ListTile(
                    onTap: () => PaymentDetailsSheet.show(
                      context,
                      preloadedTx: s,
                      title: 'Settlement · ${s.referenceCode}',
                    ),
                    title: Text('${s.referenceCode} · ${s.gateway}',
                        style: const TextStyle(fontWeight: FontWeight.w700)),
                    subtitle: Text('Status: ${s.providerLegStatus}'),
                    trailing: Text(
                      AppConfig.formatEtb(s.providerAmount),
                      style: const TextStyle(
                          fontWeight: FontWeight.w800,
                          color: AppTheme.primary),
                    ),
                  ),
                )),
        ],
      ),
    );
  }
}
