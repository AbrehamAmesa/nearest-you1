import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import 'package:url_launcher/url_launcher.dart';
import '../core/config/app_config.dart';
import '../core/i18n/app_translations.dart';
import '../core/models/models.dart';
import '../core/providers/app_state.dart';
import '../core/theme/app_theme.dart';
import '../core/utils/listing_policy.dart';
import '../widgets/live_chat_sheet.dart';
import '../widgets/payment_gateway_sheet.dart';
import '../widgets/smart_image.dart';
import 'auth_sheet.dart';

class ListingDetailSheet extends StatefulWidget {
  final Listing listing;
  final Business business;

  const ListingDetailSheet({
    super.key,
    required this.listing,
    required this.business,
  });

  static Future<void> show(
    BuildContext context, {
    required Listing listing,
    required Business business,
  }) {
    return showModalBottomSheet(
      context: context,
      isScrollControlled: true,
      backgroundColor: Colors.white,
      shape: const RoundedRectangleBorder(
        borderRadius: BorderRadius.vertical(top: Radius.circular(22)),
      ),
      builder: (_) => ListingDetailSheet(listing: listing, business: business),
    );
  }

  @override
  State<ListingDetailSheet> createState() => _ListingDetailSheetState();
}

class _ListingDetailSheetState extends State<ListingDetailSheet> {
  // Booking / Rental / Calculated fields
  final _dateCtrl = TextEditingController(
      text: DateTime.now()
          .add(const Duration(days: 1))
          .toIso8601String()
          .split('T')
          .first);
  final _endDateCtrl = TextEditingController(
      text: DateTime.now()
          .add(const Duration(days: 2))
          .toIso8601String()
          .split('T')
          .first);
  final _timeCtrl = TextEditingController(text: '10:00');
  final _notesCtrl = TextEditingController();
  final _paramDistanceCtrl = TextEditingController(text: '5');
  final _paramWorkersCtrl = TextEditingController(text: '1');
  final _paramAreaCtrl = TextEditingController(text: '20');
  final _paramHoursCtrl = TextEditingController(text: '2');
  String _paymentMethod = 'CHAPA';

  // Job Application fields
  final _appNameCtrl = TextEditingController();
  final _appPhoneCtrl = TextEditingController();
  final _appSkillsCtrl = TextEditingController();
  final _appExpCtrl = TextEditingController(text: '2');
  final _appPayCtrl = TextEditingController();
  final _appCoverCtrl = TextEditingController();

  // Review fields
  int _reviewRating = 5;
  final _reviewTxCtrl = TextEditingController();
  final _reviewCommentCtrl = TextEditingController();

  bool _busy = false;
  String? _statusMsg;

  @override
  void initState() {
    super.initState();
    final app = context.read<AppState>();
    if (app.currentUser != null) {
      _appNameCtrl.text = app.currentUser!.fullName;
      _appPhoneCtrl.text = app.currentUser!.phoneNumber ?? '';
    }
    if (widget.listing.basePrice > 0) {
      _appPayCtrl.text = widget.listing.basePrice.round().toString();
    }
  }

  @override
  void dispose() {
    _dateCtrl.dispose();
    _endDateCtrl.dispose();
    _timeCtrl.dispose();
    _notesCtrl.dispose();
    _paramDistanceCtrl.dispose();
    _paramWorkersCtrl.dispose();
    _paramAreaCtrl.dispose();
    _paramHoursCtrl.dispose();
    _appNameCtrl.dispose();
    _appPhoneCtrl.dispose();
    _appSkillsCtrl.dispose();
    _appExpCtrl.dispose();
    _appPayCtrl.dispose();
    _appCoverCtrl.dispose();
    _reviewTxCtrl.dispose();
    _reviewCommentCtrl.dispose();
    super.dispose();
  }

  double _estimatedServiceTotal() {
    final l = widget.listing;
    final pf = l.pricingFormula;
    if (pf == null || pf.isEmpty) {
      return l.effectivePrice;
    }
    final base = parseDouble(pf['baseFee'], l.effectivePrice);
    final perKm = parseDouble(pf['perKmRate']) *
        (double.tryParse(_paramDistanceCtrl.text) ?? 0);
    final perWorker = parseDouble(pf['perWorkerRate']) *
        (double.tryParse(_paramWorkersCtrl.text) ?? 1);
    final perSqm = parseDouble(pf['perSqmRate']) *
        (double.tryParse(_paramAreaCtrl.text) ?? 0);
    final vehicle = parseDouble(pf['vehicleFee']);
    final inspect = parseDouble(pf['inspectionFee']);
    final total = base + perKm + perWorker + perSqm + vehicle + inspect;
    final minCharge = l.minimumCharge ?? 0;
    return total < minCharge ? minCharge : total;
  }

  Future<void> _submitBooking() async {
    final app = context.read<AppState>();
    if (app.currentUser == null) {
      final ok = await AuthSheet.show(context);
      if (ok != true || !mounted) return;
    }
    setState(() {
      _busy = true;
      _statusMsg = null;
    });
    try {
      final booking = await app.api.createBooking({
        'listingId': widget.listing.id,
        'scheduledDate': _dateCtrl.text.trim(),
        if (widget.listing.isRentalOrEvent) 'endDate': _endDateCtrl.text.trim(),
        'scheduledTime': _timeCtrl.text.trim(),
        'parameters': {
          'distanceKm': double.tryParse(_paramDistanceCtrl.text) ?? 5,
          'workers': int.tryParse(_paramWorkersCtrl.text) ?? 1,
          'areaSqm': double.tryParse(_paramAreaCtrl.text) ?? 20,
          'hours': int.tryParse(_paramHoursCtrl.text) ?? 2,
        },
        'paymentMethod': _paymentMethod,
        'notes': _notesCtrl.text.trim(),
      });
      await app.refreshWorkspace();
      if (!mounted) return;
      if (_paymentMethod == 'CHAPA' || _paymentMethod == 'PAYO') {
        await PaymentGatewaySheet.show(
          context,
          gateway: _paymentMethod,
          transactionType: 'BOOKING',
          referenceId: booking.id,
          referenceCode: booking.bookingReference,
          title: widget.listing.title,
          amountEtb: booking.agreedPrice > 0
              ? booking.agreedPrice
              : _estimatedServiceTotal(),
        );
      }
      setState(() => _statusMsg =
          'Booking ${booking.bookingReference} created! Track it in My Activity.');
    } catch (e) {
      setState(() => _statusMsg = e.toString());
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  Future<void> _submitJobApplication() async {
    final app = context.read<AppState>();
    if (app.currentUser == null) {
      final ok = await AuthSheet.show(context);
      if (ok != true || !mounted) return;
    }
    if (_appNameCtrl.text.trim().isEmpty ||
        _appPhoneCtrl.text.trim().isEmpty ||
        _appSkillsCtrl.text.trim().isEmpty ||
        _appCoverCtrl.text.trim().isEmpty) {
      setState(() => _statusMsg = 'Please fill all required job application fields.');
      return;
    }
    setState(() {
      _busy = true;
      _statusMsg = null;
    });
    try {
      await app.api.applyForJob(widget.listing.id, {
        'applicantName': _appNameCtrl.text.trim(),
        'applicantPhone': _appPhoneCtrl.text.trim(),
        'skills': _appSkillsCtrl.text.trim(),
        'experienceYears': int.tryParse(_appExpCtrl.text) ?? 1,
        'expectedCompensation': double.tryParse(_appPayCtrl.text) ?? 0,
        'coverLetter': _appCoverCtrl.text.trim(),
      });
      await app.refreshWorkspace();
      setState(() => _statusMsg = 'Application submitted successfully!');
    } catch (e) {
      setState(() => _statusMsg = e.toString());
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  Future<void> _submitReview() async {
    final app = context.read<AppState>();
    if (app.currentUser == null) {
      await AuthSheet.show(context);
      return;
    }
    if (_reviewTxCtrl.text.trim().isEmpty ||
        _reviewCommentCtrl.text.trim().isEmpty) {
      setState(() =>
          _statusMsg = 'Enter your Order/Booking Ref and review comment.');
      return;
    }
    setState(() {
      _busy = true;
      _statusMsg = null;
    });
    try {
      await app.api.createReview({
        'businessId': widget.business.id,
        'listingId': widget.listing.id,
        'transactionRef': _reviewTxCtrl.text.trim(),
        'rating': _reviewRating,
        'comment': _reviewCommentCtrl.text.trim(),
      });
      _reviewCommentCtrl.clear();
      await app.loadCatalog(silent: true);
      setState(() => _statusMsg = 'Verified review published!');
    } catch (e) {
      setState(() => _statusMsg = e.toString());
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  Future<void> _openChat() async {
    final app = context.read<AppState>();
    if (app.currentUser == null) {
      final ok = await AuthSheet.show(context);
      if (ok != true || !mounted) return;
    }
    await LiveChatSheet.show(
      context,
      businessId: widget.business.id,
      listingId: widget.listing.id,
      recipientUid: widget.business.ownerUid,
      title: widget.business.businessName,
      subtitle: widget.listing.title,
      defaultAmount: widget.listing.effectivePrice,
      defaultContractType: widget.listing.pricingModel,
    );
  }

  @override
  Widget build(BuildContext context) {
    final app = context.watch<AppState>();
    final l = widget.listing;
    final b = widget.business;
    final pol = ListingCommercialPolicy.fromListing(
      listingType: l.listingType,
      metadata: l.metadata,
    );
    final distKm = app.distanceToBusinessKm(b);
    final isFav = app.favoriteIds.contains(l.id);
    final isComparing = app.compareListingIds.contains(l.id);
    final reviews = app.recentReviews
        .where((r) => r.listingId == l.id || r.businessId == b.id)
        .take(5)
        .toList();
    final images = l.galleryImages;
    final introVideoUrl = l.metadata?['introVideoUrl']?.toString();

    return DraggableScrollableSheet(
      initialChildSize: 0.88,
      minChildSize: 0.5,
      maxChildSize: 0.96,
      expand: false,
      builder: (_, scrollCtrl) => Padding(
        padding: EdgeInsets.fromLTRB(
            18, 12, 18, MediaQuery.of(context).viewInsets.bottom + 24),
        child: ListView(
          controller: scrollCtrl,
          children: [
            Center(
              child: Container(
                width: 42,
                height: 4,
                decoration: BoxDecoration(
                  color: AppTheme.border,
                  borderRadius: BorderRadius.circular(4),
                ),
              ),
            ),
            const SizedBox(height: 12),
            if (images.isNotEmpty)
              SizedBox(
                height: 200,
                child: PageView.builder(
                  itemCount: images.length,
                  itemBuilder: (_, i) => SmartImage(
                    source: images[i],
                    width: double.infinity,
                    height: 200,
                    borderRadius: BorderRadius.circular(14),
                  ),
                ),
              ),
            const SizedBox(height: 12),
            Row(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(
                        l.title,
                        style: const TextStyle(
                            fontSize: 20, fontWeight: FontWeight.w800),
                      ),
                      const SizedBox(height: 4),
                      Text(
                        '${b.businessName} · ${b.subCity} (${distKm.toStringAsFixed(1)} km away)',
                        style: const TextStyle(
                            fontSize: 13, color: AppTheme.mutedInk),
                      ),
                    ],
                  ),
                ),
                IconButton(
                  onPressed: () {
                    if (app.currentUser == null) {
                      AuthSheet.show(context);
                    } else {
                      app.toggleFavorite(l.id);
                    }
                  },
                  icon: Icon(
                    isFav ? Icons.favorite_rounded : Icons.favorite_border_rounded,
                    color: isFav ? AppTheme.danger : AppTheme.mutedInk,
                  ),
                ),
              ],
            ),
            const SizedBox(height: 8),
            Wrap(
              spacing: 6,
              runSpacing: 6,
              children: [
                Chip(
                  label: Text(
                    l.isUnpaid
                        ? 'Unpaid / Volunteer'
                        : l.isQuoteBased
                            ? 'Quote / Negotiable'
                            : '${AppConfig.formatEtb(l.effectivePrice)} / ${l.pricingUnit}',
                    style: const TextStyle(
                        fontWeight: FontWeight.w800, color: AppTheme.primary),
                  ),
                  backgroundColor: AppTheme.primaryLight,
                  side: BorderSide.none,
                ),
                Chip(
                  label: Text(
                    AppTranslations.formatPricingModel(l.pricingModel),
                    style: const TextStyle(fontSize: 12),
                  ),
                ),
                if (b.faydaVerified)
                  const Chip(
                    avatar: Icon(Icons.verified_user_rounded,
                        size: 16, color: AppTheme.primary),
                    label: Text('Fayda Verified', style: TextStyle(fontSize: 12)),
                  ),
                if (b.liveLocationActive)
                  const Chip(
                    avatar: Icon(Icons.gps_fixed_rounded,
                        size: 16, color: AppTheme.primary),
                    label: Text('Live GPS', style: TextStyle(fontSize: 12)),
                  ),
              ],
            ),
            const SizedBox(height: 10),
            Text(l.description, style: const TextStyle(fontSize: 13.5)),
            const SizedBox(height: 12),
            // Commercial disclosures: Seller vs Buyer tax, 0-X km delivery, Ready/Delivery ETA, Return policy
            if (l.isCartPurchaseType || pol.deliveryAvailable)
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
                    Text(
                      pol.isSellerTax
                          ? 'Tax from Seller: Visible price is final (0 ETB extra tax added)'
                          : 'Tax from Buyer: +${app.policy.taxRatePercent.round()}% VAT applies at checkout',
                      style: TextStyle(
                        fontSize: 12.5,
                        fontWeight: FontWeight.w700,
                        color: pol.isSellerTax ? AppTheme.primary : AppTheme.ink,
                      ),
                    ),
                    const SizedBox(height: 4),
                    Text(
                      pol.deliveryAvailable
                          ? (pol.freeDeliveryMaxKm > 0
                              ? 'Provider covers delivery for 0 – ${pol.freeDeliveryMaxKm.toStringAsFixed(1)} km (beyond that buyer pays distance rate)'
                              : 'Delivery available at standard distance rate')
                          : 'Self-pickup only (no delivery)',
                      style: const TextStyle(
                          fontSize: 12, color: AppTheme.mutedInk),
                    ),
                    const SizedBox(height: 4),
                    Text(
                      'Ready in ~${pol.estimatedReadyMinutes} min · Delivery ~${pol.estimatedDeliveryMinutes} min',
                      style: const TextStyle(
                          fontSize: 12, color: AppTheme.mutedInk),
                    ),
                    const SizedBox(height: 4),
                    Text(
                      pol.returnable
                          ? 'Returns within ${pol.returnWindowDays} day(s) (${pol.returnLossPercent.round()}% return fee)'
                          : 'Non-returnable item',
                      style: const TextStyle(
                          fontSize: 12, color: AppTheme.mutedInk),
                    ),
                  ],
                ),
              ),
            if (introVideoUrl != null && introVideoUrl.isNotEmpty) ...[
              const SizedBox(height: 10),
              OutlinedButton.icon(
                onPressed: () => launchUrl(Uri.parse(introVideoUrl),
                    mode: LaunchMode.externalApplication),
                icon: const Icon(Icons.play_circle_outline_rounded),
                label: const Text('Watch Intro Video (YouTube)'),
              ),
            ],
            const SizedBox(height: 12),
            Row(
              children: [
                Expanded(
                  child: OutlinedButton.icon(
                    onPressed: _openChat,
                    icon: const Icon(Icons.forum_outlined, size: 18),
                    label: const Text('Live Chat & Contract'),
                  ),
                ),
                const SizedBox(width: 8),
                OutlinedButton(
                  onPressed: () => app.toggleCompare(l.id),
                  child: Text(isComparing ? 'Comparing ✓' : '+ Compare'),
                ),
              ],
            ),
            if (_statusMsg != null) ...[
              const SizedBox(height: 10),
              Container(
                padding: const EdgeInsets.all(10),
                decoration: BoxDecoration(
                  color: AppTheme.primaryLight,
                  borderRadius: BorderRadius.circular(10),
                ),
                child: Text(_statusMsg!,
                    style: const TextStyle(
                        color: AppTheme.primaryDark,
                        fontWeight: FontWeight.w700,
                        fontSize: 12.5)),
              ),
            ],
            const Divider(height: 24),
            if (l.isCartPurchaseType) ...[
              SizedBox(
                width: double.infinity,
                child: ElevatedButton.icon(
                  onPressed: () {
                    app.addToCart(l, b);
                    Navigator.pop(context);
                    ScaffoldMessenger.of(context).showSnackBar(
                      SnackBar(content: Text('${l.title} added to Cart')),
                    );
                  },
                  icon: const Icon(Icons.add_shopping_cart_rounded),
                  label: Text('Add to Cart · ${AppConfig.formatEtb(l.effectivePrice)}'),
                ),
              ),
            ] else if (l.isJobListing) ...[
              const Text('Apply for this Position',
                  style: TextStyle(fontSize: 16, fontWeight: FontWeight.w800)),
              const SizedBox(height: 10),
              TextField(
                controller: _appNameCtrl,
                decoration: const InputDecoration(labelText: 'Full Name *'),
              ),
              const SizedBox(height: 8),
              TextField(
                controller: _appPhoneCtrl,
                decoration: const InputDecoration(labelText: 'Phone Number *'),
              ),
              const SizedBox(height: 8),
              TextField(
                controller: _appSkillsCtrl,
                decoration: const InputDecoration(
                    labelText: 'Key Skills * (e.g. Plumbing, React, Driver)'),
              ),
              const SizedBox(height: 8),
              Row(
                children: [
                  Expanded(
                    child: TextField(
                      controller: _appExpCtrl,
                      keyboardType: TextInputType.number,
                      decoration:
                          const InputDecoration(labelText: 'Experience (Years)'),
                    ),
                  ),
                  const SizedBox(width: 8),
                  Expanded(
                    child: TextField(
                      controller: _appPayCtrl,
                      keyboardType: TextInputType.number,
                      decoration: const InputDecoration(
                          labelText: 'Expected Pay (ETB)'),
                    ),
                  ),
                ],
              ),
              const SizedBox(height: 8),
              TextField(
                controller: _appCoverCtrl,
                maxLines: 3,
                decoration: const InputDecoration(labelText: 'Cover Letter *'),
              ),
              const SizedBox(height: 12),
              SizedBox(
                width: double.infinity,
                child: ElevatedButton(
                  onPressed: _busy ? null : _submitJobApplication,
                  child: Text(_busy ? 'Submitting...' : 'Submit Application'),
                ),
              ),
            ] else if (!l.isJobSeekerAd) ...[
              Text(
                l.isRentalOrEvent ? 'Reserve Dates' : 'Book Service',
                style:
                    const TextStyle(fontSize: 16, fontWeight: FontWeight.w800),
              ),
              const SizedBox(height: 10),
              Row(
                children: [
                  Expanded(
                    child: TextField(
                      controller: _dateCtrl,
                      decoration:
                          const InputDecoration(labelText: 'Start Date (YYYY-MM-DD)'),
                    ),
                  ),
                  const SizedBox(width: 8),
                  Expanded(
                    child: l.isRentalOrEvent
                        ? TextField(
                            controller: _endDateCtrl,
                            decoration: const InputDecoration(
                                labelText: 'End Date (YYYY-MM-DD)'),
                          )
                        : TextField(
                            controller: _timeCtrl,
                            decoration: const InputDecoration(labelText: 'Time'),
                          ),
                  ),
                ],
              ),
              if (l.isCalculatedService) ...[
                const SizedBox(height: 10),
                Row(
                  children: [
                    Expanded(
                      child: TextField(
                        controller: _paramDistanceCtrl,
                        keyboardType: TextInputType.number,
                        onChanged: (_) => setState(() {}),
                        decoration:
                            const InputDecoration(labelText: 'Distance (km)'),
                      ),
                    ),
                    const SizedBox(width: 8),
                    Expanded(
                      child: TextField(
                        controller: _paramWorkersCtrl,
                        keyboardType: TextInputType.number,
                        onChanged: (_) => setState(() {}),
                        decoration:
                            const InputDecoration(labelText: 'Workers'),
                      ),
                    ),
                  ],
                ),
                const SizedBox(height: 8),
                Text(
                  'Estimated Price: ${AppConfig.formatEtb(_estimatedServiceTotal())}',
                  style: const TextStyle(
                      fontWeight: FontWeight.w800, color: AppTheme.primary),
                ),
              ],
              const SizedBox(height: 10),
              DropdownButtonFormField<String>(
                initialValue: _paymentMethod,
                decoration: const InputDecoration(labelText: 'Payment Method'),
                items: const [
                  DropdownMenuItem(value: 'CHAPA', child: Text('Chapa')),
                  DropdownMenuItem(value: 'PAYO', child: Text('Payo / Transfer')),
                  DropdownMenuItem(value: 'CASH', child: Text('Cash')),
                ],
                onChanged: (v) => setState(() => _paymentMethod = v ?? 'CHAPA'),
              ),
              const SizedBox(height: 10),
              TextField(
                controller: _notesCtrl,
                decoration:
                    const InputDecoration(labelText: 'Notes / Requirements'),
              ),
              const SizedBox(height: 12),
              SizedBox(
                width: double.infinity,
                child: ElevatedButton(
                  onPressed: _busy ? null : _submitBooking,
                  child: Text(_busy
                      ? 'Booking...'
                      : 'Confirm Booking (${AppConfig.formatEtb(_estimatedServiceTotal())})'),
                ),
              ),
            ],
            const Divider(height: 28),
            Text('Verified Reviews (${reviews.length})',
                style:
                    const TextStyle(fontSize: 15, fontWeight: FontWeight.w800)),
            const SizedBox(height: 8),
            if (reviews.isEmpty)
              const Text('No reviews yet.',
                  style: TextStyle(fontSize: 12.5, color: AppTheme.mutedInk))
            else
              ...reviews.map((r) => ListTile(
                    contentPadding: EdgeInsets.zero,
                    leading: CircleAvatar(
                      backgroundColor: AppTheme.primaryLight,
                      child: Text('${r.rating}★',
                          style: const TextStyle(
                              fontSize: 12,
                              fontWeight: FontWeight.w800,
                              color: AppTheme.primary)),
                    ),
                    title: Text(r.customerName,
                        style: const TextStyle(
                            fontWeight: FontWeight.w700, fontSize: 13)),
                    subtitle: Text(r.comment, style: const TextStyle(fontSize: 12)),
                  )),
            const SizedBox(height: 8),
            const Text('Leave a Verified Review',
                style: TextStyle(fontSize: 13.5, fontWeight: FontWeight.w700)),
            const SizedBox(height: 6),
            Row(
              children: List.generate(
                5,
                (i) => IconButton(
                  onPressed: () => setState(() => _reviewRating = i + 1),
                  icon: Icon(
                    i < _reviewRating
                        ? Icons.star_rounded
                        : Icons.star_border_rounded,
                    color: AppTheme.accent,
                  ),
                ),
              ),
            ),
            TextField(
              controller: _reviewTxCtrl,
              decoration: const InputDecoration(
                labelText: 'Order / Booking Reference Code',
                isDense: true,
              ),
            ),
            const SizedBox(height: 8),
            TextField(
              controller: _reviewCommentCtrl,
              decoration: const InputDecoration(
                labelText: 'Your Review Comment',
                isDense: true,
              ),
            ),
            const SizedBox(height: 8),
            OutlinedButton(
              onPressed: _busy ? null : _submitReview,
              child: const Text('Submit Review'),
            ),
          ],
        ),
      ),
    );
  }
}
