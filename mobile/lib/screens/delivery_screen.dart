import 'package:flutter/material.dart';
import 'package:flutter_map/flutter_map.dart';
import 'package:latlong2/latlong.dart';
import 'package:provider/provider.dart';
import '../core/config/app_config.dart';
import '../core/models/models.dart';
import '../core/providers/app_state.dart';
import '../core/theme/app_theme.dart';
import '../widgets/payment_details_sheet.dart';
import '../widgets/payment_gateway_sheet.dart';
import 'auth_sheet.dart';

class DeliveryScreen extends StatefulWidget {
  const DeliveryScreen({super.key});

  @override
  State<DeliveryScreen> createState() => _DeliveryScreenState();
}

class _DeliveryScreenState extends State<DeliveryScreen>
    with SingleTickerProviderStateMixin {
  late TabController _tabCtrl;

  // Request tab
  String _requestType = 'DELIVERY';
  String _vehicleType = 'MOTORBIKE';
  String _urgency = 'STANDARD';
  String _paymentMethod = 'CHAPA';
  double _pickupLat = 9.0192;
  double _pickupLng = 38.7525;
  double _destLat = 9.0054;
  double _destLng = 38.7890;
  String _pickupLabel = 'Meskel Square, Addis Ababa';
  String _destLabel = 'Bole Medhanialem, Addis Ababa';
  bool _pinTargetIsPickup = true;
  double _distanceKm = 4.6;
  List<LatLng> _routePoints = [];
  bool _calculatingRoute = false;
  bool _submittingRequest = false;

  final _pickupSearchCtrl = TextEditingController();
  final _destSearchCtrl = TextEditingController();
  final _detailsCtrl = TextEditingController();
  final _receiverNameCtrl = TextEditingController();
  final _receiverPhoneCtrl = TextEditingController();
  final _declaredValueCtrl = TextEditingController(text: '1000');

  List<OsmPlaceResult> _searchResults = [];
  bool _searchingPickup = true;

  // Track Live tab
  final _trackCodeCtrl = TextEditingController();
  final _trackPhoneCtrl = TextEditingController();
  DeliveryRecord? _trackedDelivery;
  bool _trackingLoading = false;
  String? _trackError;

  // Partner Queue tab
  List<DeliveryRecord> _partnerDeliveries = [];
  bool _partnerLoading = false;
  String? _partnerError;

  @override
  void initState() {
    super.initState();
    _tabCtrl = TabController(length: 3, vsync: this);
    _recalculateRoute();
  }

  @override
  void dispose() {
    _tabCtrl.dispose();
    _pickupSearchCtrl.dispose();
    _destSearchCtrl.dispose();
    _detailsCtrl.dispose();
    _receiverNameCtrl.dispose();
    _receiverPhoneCtrl.dispose();
    _declaredValueCtrl.dispose();
    _trackCodeCtrl.dispose();
    _trackPhoneCtrl.dispose();
    super.dispose();
  }

  Future<void> _recalculateRoute() async {
    final app = context.read<AppState>();
    setState(() => _calculatingRoute = true);
    final route = await app.api.getOsrmRoute(
      _pickupLat,
      _pickupLng,
      _destLat,
      _destLng,
    );
    if (!mounted) return;
    if (route != null) {
      setState(() {
        _distanceKm = route.distanceKm < 0.2 ? 0.2 : route.distanceKm;
        _routePoints =
            route.geometry.map((p) => LatLng(p[0], p[1])).toList();
        _calculatingRoute = false;
      });
    } else {
      final fallback = AppConfig.haversineKm(
          _pickupLat, _pickupLng, _destLat, _destLng);
      setState(() {
        _distanceKm = fallback < 0.2 ? 0.2 : fallback;
        _routePoints = [
          LatLng(_pickupLat, _pickupLng),
          LatLng(_destLat, _destLng),
        ];
        _calculatingRoute = false;
      });
    }
  }

  Future<void> _searchPlaces(String query, bool isPickup) async {
    final app = context.read<AppState>();
    setState(() => _searchingPickup = isPickup);
    final res = await app.api.searchOsmPlaces(query);
    if (mounted) {
      setState(() => _searchResults = res);
    }
  }

  void _applyPlace(OsmPlaceResult place) {
    setState(() {
      if (_searchingPickup) {
        _pickupLat = place.lat;
        _pickupLng = place.lng;
        _pickupLabel = place.displayName;
        _pickupSearchCtrl.text = place.displayName;
      } else {
        _destLat = place.lat;
        _destLng = place.lng;
        _destLabel = place.displayName;
        _destSearchCtrl.text = place.displayName;
      }
      _searchResults = [];
    });
    _recalculateRoute();
  }

  double _estimatedFare(PlatformPolicy p) {
    final base = _requestType == 'RIDE' ? p.rideBaseFare : p.deliveryBaseFee;
    final perKm = _requestType == 'RIDE' ? p.ridePerKmRate : p.deliveryPerKmRate;
    final vehicleMult = _vehicleType == 'VAN'
        ? 1.8
        : (_vehicleType == 'CAR' ? 1.35 : 1.0);
    final urgMult = _urgency == 'EXPRESS' ? p.expressMultiplier : 1.0;
    final sub = (base + _distanceKm * perKm) * vehicleMult * urgMult;
    final vat = sub * (p.taxRatePercent / 100.0);
    return (sub + vat).roundToDouble();
  }

  Future<void> _submitDispatch() async {
    final app = context.read<AppState>();
    if (app.currentUser == null) {
      final ok = await AuthSheet.show(context);
      if (ok != true || !mounted) return;
    }
    if (_detailsCtrl.text.trim().isEmpty) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('Please enter package or ride details.')),
      );
      return;
    }
    setState(() => _submittingRequest = true);
    try {
      final created = await app.api.createDelivery({
        'requestType': _requestType,
        'pickupLocation': _pickupLabel,
        'pickupLat': _pickupLat,
        'pickupLng': _pickupLng,
        'destinationLocation': _destLabel,
        'destinationLat': _destLat,
        'destinationLng': _destLng,
        'packageOrRideDetails': _detailsCtrl.text.trim(),
        if (_receiverNameCtrl.text.trim().isNotEmpty)
          'receiverName': _receiverNameCtrl.text.trim(),
        if (_receiverPhoneCtrl.text.trim().isNotEmpty)
          'receiverPhone': _receiverPhoneCtrl.text.trim(),
        'declaredValue': double.tryParse(_declaredValueCtrl.text) ?? 0,
        'vehicleType': _vehicleType,
        'urgency': _urgency,
        'distanceKm': double.parse(_distanceKm.toStringAsFixed(2)),
        'paymentMethod': _paymentMethod,
      });
      await app.refreshWorkspace();
      if (!mounted) return;
      _trackCodeCtrl.text = created.trackingCode;
      setState(() => _trackedDelivery = created);

      if (_paymentMethod == 'CHAPA' || _paymentMethod == 'PAYO') {
        await PaymentGatewaySheet.show(
          context,
          gateway: _paymentMethod,
          transactionType: created.requestType,
          referenceId: created.id,
          referenceCode: created.trackingCode,
          title: '${created.requestType} ${created.trackingCode}',
          amountEtb: created.totalFee,
        );
      }
      _tabCtrl.animateTo(1);
    } catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(context)
            .showSnackBar(SnackBar(content: Text(e.toString())));
      }
    } finally {
      if (mounted) setState(() => _submittingRequest = false);
    }
  }

  Future<void> _trackNow([String? overrideCode]) async {
    final code = (overrideCode ?? _trackCodeCtrl.text).trim();
    if (code.isEmpty) return;
    final app = context.read<AppState>();
    setState(() {
      _trackingLoading = true;
      _trackError = null;
    });
    try {
      final d = await app.api.trackDelivery(
        code,
        receiverPhone: _trackPhoneCtrl.text.trim(),
      );
      if (mounted) {
        setState(() {
          _trackedDelivery = d;
          _trackingLoading = false;
        });
      }
    } catch (e) {
      if (mounted) {
        setState(() {
          _trackError = e.toString();
          _trackingLoading = false;
        });
      }
    }
  }

  Future<void> _loadPartnerQueue() async {
    final app = context.read<AppState>();
    if (app.currentUser == null) return;
    setState(() {
      _partnerLoading = true;
      _partnerError = null;
    });
    try {
      final list = await app.api.getDeliveries(
        lat: app.userLat,
        lng: app.userLng,
      );
      if (mounted) {
        setState(() {
          _partnerDeliveries = list;
          _partnerLoading = false;
        });
      }
    } catch (e) {
      if (mounted) {
        setState(() {
          _partnerError = e.toString();
          _partnerLoading = false;
        });
      }
    }
  }

  Future<void> _partnerTransition(DeliveryRecord d, String nextStatus,
      {bool needsOtp = false}) async {
    String? otp;
    if (needsOtp) {
      final ctrl = TextEditingController();
      final ok = await showDialog<bool>(
        context: context,
        builder: (ctx) => AlertDialog(
          title: Text('Enter ${nextStatus == 'IN_TRANSIT' ? 'Pickup' : 'Receiver'} OTP'),
          content: TextField(
            controller: ctrl,
            keyboardType: TextInputType.number,
            decoration: const InputDecoration(labelText: '6-digit OTP'),
          ),
          actions: [
            TextButton(
              onPressed: () => Navigator.pop(ctx, false),
              child: const Text('Cancel'),
            ),
            ElevatedButton(
              onPressed: () => Navigator.pop(ctx, true),
              child: const Text('Verify'),
            ),
          ],
        ),
      );
      if (ok != true) return;
      otp = ctrl.text.trim();
    }
    final app = context.read<AppState>();
    try {
      await app.api.transitionDelivery(
        d.id,
        status: nextStatus,
        otp: otp,
        driverLat: app.userLat,
        driverLng: app.userLng,
      );
      await _loadPartnerQueue();
      await app.refreshWorkspace();
    } catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(context)
            .showSnackBar(SnackBar(content: Text(e.toString())));
      }
    }
  }

  Future<void> _raiseDisputeOrConflict(DeliveryRecord d) async {
    final ctrl = TextEditingController();
    final ok = await showDialog<bool>(
      context: context,
      builder: (ctx) => AlertDialog(
        title: const Text('Report Issue / Freeze Escrow'),
        content: TextField(
          controller: ctrl,
          maxLines: 3,
          decoration: const InputDecoration(
            labelText: 'Reason / Details',
            hintText: 'Describe missing item, delay, or conflict...',
          ),
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(ctx, false),
            child: const Text('Cancel'),
          ),
          ElevatedButton(
            style: ElevatedButton.styleFrom(backgroundColor: AppTheme.danger),
            onPressed: () => Navigator.pop(ctx, true),
            child: const Text('Freeze Escrow'),
          ),
        ],
      ),
    );
    if (ok == true && ctrl.text.trim().isNotEmpty) {
      final app = context.read<AppState>();
      try {
        await app.api.raiseDispute(d.id, ctrl.text.trim());
        await _trackNow(d.trackingCode);
      } catch (e) {
        if (mounted) {
          ScaffoldMessenger.of(context)
              .showSnackBar(SnackBar(content: Text(e.toString())));
        }
      }
    }
  }

  @override
  Widget build(BuildContext context) {
    final app = context.watch<AppState>();
    if (app.pendingTrackCode != null) {
      final code = app.pendingTrackCode!;
      app.consumeNotificationNavigation();
      WidgetsBinding.instance.addPostFrameCallback((_) {
        _trackCodeCtrl.text = code;
        _tabCtrl.animateTo(1);
        _trackNow(code);
      });
    }

    return Column(
      children: [
        Container(
          color: Colors.white,
          child: TabBar(
            controller: _tabCtrl,
            labelColor: AppTheme.primary,
            indicatorColor: AppTheme.primary,
            onTap: (i) {
              if (i == 2) _loadPartnerQueue();
            },
            tabs: [
              Tab(text: app.t('tab_request_ride')),
              Tab(text: app.t('tab_track_live')),
              Tab(text: app.t('tab_partner')),
            ],
          ),
        ),
        Expanded(
          child: TabBarView(
            controller: _tabCtrl,
            children: [
              _buildRequestTab(app),
              _buildTrackTab(app),
              _buildPartnerTab(app),
            ],
          ),
        ),
      ],
    );
  }

  Widget _buildRequestTab(AppState app) {
    final bottomPad = app.cartCount > 0 ? 84.0 : 20.0;
    return ListView(
      padding: EdgeInsets.fromLTRB(14, 12, 14, bottomPad),
      children: [
        SegmentedButton<String>(
          segments: const [
            ButtonSegment(
                value: 'DELIVERY',
                label: Text('Package Delivery'),
                icon: Icon(Icons.inventory_2_outlined, size: 17)),
            ButtonSegment(
                value: 'RIDE',
                label: Text('Passenger Ride'),
                icon: Icon(Icons.directions_car_outlined, size: 17)),
          ],
          selected: {_requestType},
          onSelectionChanged: (s) => setState(() => _requestType = s.first),
        ),
        const SizedBox(height: 10),

        // Interactive Map Pin Selector
        ClipRRect(
          borderRadius: BorderRadius.circular(14),
          child: SizedBox(
            height: 200,
            child: FlutterMap(
              options: MapOptions(
                initialCenter: LatLng(_pickupLat, _pickupLng),
                initialZoom: 12.3,
                onTap: (_, pt) {
                  setState(() {
                    if (_pinTargetIsPickup) {
                      _pickupLat = pt.latitude;
                      _pickupLng = pt.longitude;
                      _pickupLabel =
                          'Pinned (${pt.latitude.toStringAsFixed(4)}, ${pt.longitude.toStringAsFixed(4)})';
                    } else {
                      _destLat = pt.latitude;
                      _destLng = pt.longitude;
                      _destLabel =
                          'Pinned (${pt.latitude.toStringAsFixed(4)}, ${pt.longitude.toStringAsFixed(4)})';
                    }
                  });
                  _recalculateRoute();
                },
              ),
              children: [
                TileLayer(
                  urlTemplate:
                      'https://tile.openstreetmap.org/{z}/{x}/{y}.png',
                  userAgentPackageName: 'com.nearestyou.mobile',
                ),
                if (_routePoints.isNotEmpty)
                  PolylineLayer(
                    polylines: [
                      Polyline(
                        points: _routePoints,
                        strokeWidth: 4,
                        color: AppTheme.primary,
                      ),
                    ],
                  ),
                MarkerLayer(
                  markers: [
                    Marker(
                      point: LatLng(_pickupLat, _pickupLng),
                      width: 34,
                      height: 34,
                      child: const Icon(Icons.trip_origin_rounded,
                          color: Colors.green, size: 28),
                    ),
                    Marker(
                      point: LatLng(_destLat, _destLng),
                      width: 34,
                      height: 34,
                      child: const Icon(Icons.location_on_rounded,
                          color: AppTheme.danger, size: 32),
                    ),
                  ],
                ),
              ],
            ),
          ),
        ),
        const SizedBox(height: 8),
        Row(
          children: [
            ChoiceChip(
              selected: _pinTargetIsPickup,
              onSelected: (_) => setState(() => _pinTargetIsPickup = true),
              label: const Text('Tap Map: Pickup'),
            ),
            const SizedBox(width: 8),
            ChoiceChip(
              selected: !_pinTargetIsPickup,
              onSelected: (_) => setState(() => _pinTargetIsPickup = false),
              label: const Text('Tap Map: Destination'),
            ),
            const Spacer(),
            Text(
              _calculatingRoute
                  ? '...'
                  : '${_distanceKm.toStringAsFixed(1)} km',
              style: const TextStyle(
                  fontWeight: FontWeight.w800, color: AppTheme.primary),
            ),
          ],
        ),
        const SizedBox(height: 10),
        TextField(
          controller: _pickupSearchCtrl,
          decoration: InputDecoration(
            labelText: 'Pickup: $_pickupLabel',
            hintText: 'Search Addis street / landmark...',
            suffixIcon: IconButton(
              icon: const Icon(Icons.search_rounded),
              onPressed: () => _searchPlaces(_pickupSearchCtrl.text, true),
            ),
          ),
          onSubmitted: (v) => _searchPlaces(v, true),
        ),
        const SizedBox(height: 8),
        TextField(
          controller: _destSearchCtrl,
          decoration: InputDecoration(
            labelText: 'Destination: $_destLabel',
            hintText: 'Search destination...',
            suffixIcon: IconButton(
              icon: const Icon(Icons.search_rounded),
              onPressed: () => _searchPlaces(_destSearchCtrl.text, false),
            ),
          ),
          onSubmitted: (v) => _searchPlaces(v, false),
        ),
        if (_searchResults.isNotEmpty)
          Card(
            margin: const EdgeInsets.only(top: 6),
            child: Column(
              children: _searchResults
                  .take(4)
                  .map(
                    (r) => ListTile(
                      dense: true,
                      leading: const Icon(Icons.place_outlined, size: 18),
                      title: Text(r.displayName,
                          maxLines: 2,
                          overflow: TextOverflow.ellipsis,
                          style: const TextStyle(fontSize: 12)),
                      onTap: () => _applyPlace(r),
                    ),
                  )
                  .toList(),
            ),
          ),
        const SizedBox(height: 10),
        TextField(
          controller: _detailsCtrl,
          decoration: InputDecoration(
            labelText: _requestType == 'RIDE'
                ? 'Passenger & Trip Notes *'
                : 'Package Description & Weight *',
          ),
        ),
        const SizedBox(height: 8),
        if (_requestType == 'DELIVERY') ...[
          Row(
            children: [
              Expanded(
                child: TextField(
                  controller: _receiverNameCtrl,
                  decoration: const InputDecoration(labelText: 'Receiver Name'),
                ),
              ),
              const SizedBox(width: 8),
              Expanded(
                child: TextField(
                  controller: _receiverPhoneCtrl,
                  keyboardType: TextInputType.phone,
                  decoration:
                      const InputDecoration(labelText: 'Receiver Phone (OTP)'),
                ),
              ),
            ],
          ),
          const SizedBox(height: 8),
        ],
        Row(
          children: [
            Expanded(
              child: DropdownButtonFormField<String>(
                initialValue: _vehicleType,
                decoration: const InputDecoration(labelText: 'Vehicle'),
                items: const [
                  DropdownMenuItem(value: 'MOTORBIKE', child: Text('Motorbike')),
                  DropdownMenuItem(value: 'CAR', child: Text('Car')),
                  DropdownMenuItem(value: 'VAN', child: Text('Van / Truck')),
                ],
                onChanged: (v) =>
                    setState(() => _vehicleType = v ?? 'MOTORBIKE'),
              ),
            ),
            const SizedBox(width: 8),
            Expanded(
              child: DropdownButtonFormField<String>(
                initialValue: _urgency,
                decoration: const InputDecoration(labelText: 'Priority'),
                items: const [
                  DropdownMenuItem(value: 'STANDARD', child: Text('Standard')),
                  DropdownMenuItem(value: 'EXPRESS', child: Text('Express')),
                ],
                onChanged: (v) => setState(() => _urgency = v ?? 'STANDARD'),
              ),
            ),
          ],
        ),
        const SizedBox(height: 8),
        DropdownButtonFormField<String>(
          initialValue: _paymentMethod,
          decoration: const InputDecoration(labelText: 'Payment Method'),
          items: const [
            DropdownMenuItem(value: 'CHAPA', child: Text('Chapa (Escrow)')),
            DropdownMenuItem(value: 'PAYO', child: Text('Payo Transfer')),
            DropdownMenuItem(value: 'TELEBIRR', child: Text('Telebirr')),
            DropdownMenuItem(value: 'CASH', child: Text('Cash on Delivery')),
          ],
          onChanged: (v) => setState(() => _paymentMethod = v ?? 'CHAPA'),
        ),
        const SizedBox(height: 14),
        SizedBox(
          width: double.infinity,
          child: ElevatedButton.icon(
            onPressed: _submittingRequest ? null : _submitDispatch,
            icon: const Icon(Icons.shield_outlined),
            label: Text(
              _submittingRequest
                  ? 'Dispatching...'
                  : 'Confirm Protected Dispatch (${AppConfig.formatEtb(_estimatedFare(app.policy))})',
            ),
          ),
        ),
      ],
    );
  }

  Widget _buildTrackTab(AppState app) {
    final d = _trackedDelivery;
    return ListView(
      padding: const EdgeInsets.all(14),
      children: [
        TextField(
          controller: _trackCodeCtrl,
          decoration: const InputDecoration(
            labelText: 'Tracking Code * (e.g. DLV-...)',
            prefixIcon: Icon(Icons.qr_code_2_rounded),
          ),
        ),
        const SizedBox(height: 8),
        TextField(
          controller: _trackPhoneCtrl,
          keyboardType: TextInputType.phone,
          decoration: const InputDecoration(
            labelText: 'Receiver Phone (optional for receiver details & OTP)',
            prefixIcon: Icon(Icons.phone_outlined),
          ),
        ),
        const SizedBox(height: 10),
        ElevatedButton.icon(
          onPressed: _trackingLoading ? null : () => _trackNow(),
          icon: const Icon(Icons.track_changes_rounded),
          label: Text(_trackingLoading ? 'Tracking...' : 'Track Live'),
        ),
        if (_trackError != null) ...[
          const SizedBox(height: 10),
          Text(_trackError!, style: const TextStyle(color: AppTheme.danger)),
        ],
        if (d != null) ...[
          const SizedBox(height: 14),
          if (d.pickupLat != null && d.destinationLat != null)
            ClipRRect(
              borderRadius: BorderRadius.circular(14),
              child: SizedBox(
                height: 190,
                child: FlutterMap(
                  options: MapOptions(
                    initialCenter: LatLng(d.pickupLat!, d.pickupLng!),
                    initialZoom: 12.5,
                  ),
                  children: [
                    TileLayer(
                      urlTemplate:
                          'https://tile.openstreetmap.org/{z}/{x}/{y}.png',
                      userAgentPackageName: 'com.nearestyou.mobile',
                    ),
                    MarkerLayer(
                      markers: [
                        Marker(
                          point: LatLng(d.pickupLat!, d.pickupLng!),
                          width: 32,
                          height: 32,
                          child: const Icon(Icons.trip_origin_rounded,
                              color: Colors.green, size: 26),
                        ),
                        Marker(
                          point: LatLng(d.destinationLat!, d.destinationLng!),
                          width: 32,
                          height: 32,
                          child: const Icon(Icons.location_on_rounded,
                              color: AppTheme.danger, size: 30),
                        ),
                        if (d.driverLat != null && d.driverLng != null)
                          Marker(
                            point: LatLng(d.driverLat!, d.driverLng!),
                            width: 34,
                            height: 34,
                            child: const Icon(Icons.delivery_dining_rounded,
                                color: AppTheme.primary, size: 30),
                          ),
                      ],
                    ),
                  ],
                ),
              ),
            ),
          const SizedBox(height: 12),
          Card(
            child: Padding(
              padding: const EdgeInsets.all(14),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Row(
                    mainAxisAlignment: MainAxisAlignment.spaceBetween,
                    children: [
                      Text(d.trackingCode,
                          style: const TextStyle(
                              fontWeight: FontWeight.w800, fontSize: 15)),
                      Chip(
                        label: Text(d.status,
                            style: const TextStyle(
                                fontWeight: FontWeight.w700, fontSize: 11.5)),
                      ),
                    ],
                  ),
                  Text('From: ${d.pickupLocation}',
                      style: const TextStyle(fontSize: 12.5)),
                  Text('To: ${d.destinationLocation}',
                      style: const TextStyle(fontSize: 12.5)),
                  const SizedBox(height: 6),
                  Text(
                    'Total: ${AppConfig.formatEtb(d.totalFee)} · Escrow: ${d.escrowStatus ?? 'N/A'}',
                    style: const TextStyle(
                        fontWeight: FontWeight.w700, color: AppTheme.primary),
                  ),
                  if (d.pickupOtp != null)
                    Padding(
                      padding: const EdgeInsets.only(top: 6),
                      child: Text('Pickup OTP: ${d.pickupOtp}',
                          style: const TextStyle(
                              fontWeight: FontWeight.w800,
                              color: AppTheme.ink)),
                    ),
                  if (d.deliveryOtp != null)
                    Padding(
                      padding: const EdgeInsets.only(top: 2),
                      child: Text('Receiver Delivery OTP: ${d.deliveryOtp}',
                          style: const TextStyle(
                              fontWeight: FontWeight.w800,
                              color: AppTheme.primary)),
                    ),
                  const SizedBox(height: 12),
                  Wrap(
                    spacing: 8,
                    runSpacing: 8,
                    children: [
                      // Parcel receiver / sender / driver can inspect Payment Details!
                      ElevatedButton.icon(
                        onPressed: () => PaymentDetailsSheet.show(
                          context,
                          transactionType: d.requestType,
                          referenceId: d.id,
                          title: 'Payment Details · ${d.trackingCode}',
                          preloadedSummary: d.paymentDetails,
                        ),
                        icon: const Icon(Icons.receipt_long_rounded, size: 17),
                        label: Text(app.t('open_payment_details')),
                      ),
                      if (d.status != 'DELIVERED' && d.status != 'DISPUTED')
                        OutlinedButton.icon(
                          onPressed: () => _raiseDisputeOrConflict(d),
                          icon: const Icon(Icons.gavel_rounded,
                              size: 17, color: AppTheme.danger),
                          label: const Text('Freeze Escrow',
                              style: TextStyle(color: AppTheme.danger)),
                        ),
                    ],
                  ),
                ],
              ),
            ),
          ),
        ],
      ],
    );
  }

  Widget _buildPartnerTab(AppState app) {
    if (app.currentUser == null) {
      return Center(
        child: ElevatedButton(
          onPressed: () => AuthSheet.show(context),
          child: const Text('Sign In to View Partner Dispatch Queue'),
        ),
      );
    }

    return RefreshIndicator(
      onRefresh: _loadPartnerQueue,
      child: ListView(
        padding: const EdgeInsets.all(14),
        children: [
          Row(
            children: [
              Expanded(
                child: Text(
                  'Nearby Dispatch Queue (${_partnerDeliveries.length})',
                  style: const TextStyle(
                      fontWeight: FontWeight.w800, fontSize: 16),
                ),
              ),
              IconButton(
                onPressed: _loadPartnerQueue,
                icon: const Icon(Icons.refresh_rounded),
              ),
            ],
          ),
          if (_partnerError != null)
            Text(_partnerError!,
                style: const TextStyle(color: AppTheme.danger)),
          if (_partnerLoading)
            const Center(
                child: Padding(
              padding: EdgeInsets.all(24),
              child: CircularProgressIndicator(),
            ))
          else
            ..._partnerDeliveries.map((d) {
              final isMine =
                  app.currentUser!.allUids.contains(d.driverUid ?? '');
              return Card(
                margin: const EdgeInsets.only(bottom: 10),
                child: Padding(
                  padding: const EdgeInsets.all(12),
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Row(
                        mainAxisAlignment: MainAxisAlignment.spaceBetween,
                        children: [
                          Text(d.trackingCode,
                              style: const TextStyle(
                                  fontWeight: FontWeight.w800, fontSize: 14)),
                          Text(d.status,
                              style: const TextStyle(
                                  fontWeight: FontWeight.w800,
                                  fontSize: 12,
                                  color: AppTheme.primary)),
                        ],
                      ),
                      Text(d.packageOrRideDetails,
                          style: const TextStyle(fontSize: 12.5)),
                      Text('Pickup: ${d.pickupLocation}',
                          style: const TextStyle(
                              fontSize: 11.5, color: AppTheme.mutedInk)),
                      Text('Drop: ${d.destinationLocation}',
                          style: const TextStyle(
                              fontSize: 11.5, color: AppTheme.mutedInk)),
                      const SizedBox(height: 6),
                      Text(
                        '${AppConfig.formatEtb(d.totalFee)} · ${d.distanceKm.toStringAsFixed(1)} km',
                        style: const TextStyle(
                            fontWeight: FontWeight.w800,
                            color: AppTheme.primary),
                      ),
                      const SizedBox(height: 8),
                      Wrap(
                        spacing: 8,
                        children: [
                          if (d.status == 'REQUESTED' ||
                              d.status == 'PENDING_DRIVER')
                            ElevatedButton(
                              onPressed: () =>
                                  _partnerTransition(d, 'ASSIGNED'),
                              child: const Text('Accept Job'),
                            ),
                          if (isMine && d.status == 'ASSIGNED')
                            ElevatedButton(
                              onPressed: () => _partnerTransition(
                                d,
                                'IN_TRANSIT',
                                needsOtp: d.pickupOtpRequired,
                              ),
                              child: const Text('Confirm Pickup (OTP)'),
                            ),
                          if (isMine && d.status == 'IN_TRANSIT')
                            ElevatedButton(
                              onPressed: () => _partnerTransition(
                                d,
                                'DELIVERED',
                                needsOtp: d.deliveryOtpRequired,
                              ),
                              child: const Text('Complete Dropoff (OTP)'),
                            ),
                          OutlinedButton(
                            onPressed: () => PaymentDetailsSheet.show(
                              context,
                              transactionType: d.requestType,
                              referenceId: d.id,
                              title: 'Payment · ${d.trackingCode}',
                              preloadedSummary: d.paymentDetails,
                            ),
                            child: const Text('Payment Details'),
                          ),
                        ],
                      ),
                    ],
                  ),
                ),
              );
            }),
        ],
      ),
    );
  }
}
