import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import '../core/config/app_config.dart';
import '../core/models/models.dart';
import '../core/providers/app_state.dart';
import '../core/theme/app_theme.dart';
import '../core/utils/listing_policy.dart';
import '../widgets/payment_gateway_sheet.dart';
import '../widgets/smart_image.dart';
import 'auth_sheet.dart';

class CartSheet extends StatefulWidget {
  const CartSheet({super.key});

  static Future<void> show(BuildContext context) {
    return showModalBottomSheet(
      context: context,
      isScrollControlled: true,
      backgroundColor: Colors.white,
      shape: const RoundedRectangleBorder(
        borderRadius: BorderRadius.vertical(top: Radius.circular(22)),
      ),
      builder: (_) => const CartSheet(),
    );
  }

  @override
  State<CartSheet> createState() => _CartSheetState();
}

class _CartSheetState extends State<CartSheet> {
  final _addressCtrl = TextEditingController();
  String _fulfillmentType = 'DELIVERY';
  String _paymentMethod = 'CHAPA';
  bool _submitting = false;
  String? _error;

  @override
  void initState() {
    super.initState();
    final app = context.read<AppState>();
    _addressCtrl.text = app.detectedLocation?.label ??
        app.currentUser?.defaultSubCity ??
        'Addis Ababa';
  }

  @override
  void dispose() {
    _addressCtrl.dispose();
    super.dispose();
  }

  Map<int, List<CartItem>> _groupByBusiness(List<CartItem> items) {
    final map = <int, List<CartItem>>{};
    for (final item in items) {
      map.putIfAbsent(item.business.id, () => []).add(item);
    }
    return map;
  }

  Future<void> _checkout() async {
    final app = context.read<AppState>();
    if (app.currentUser == null) {
      final signedIn = await AuthSheet.show(context);
      if (signedIn != true || !mounted) return;
    }
    if (app.cart.isEmpty) return;

    final addr = _addressCtrl.text.trim();
    if (_fulfillmentType == 'DELIVERY' && addr.isEmpty) {
      setState(() => _error = 'Please enter a delivery address.');
      return;
    }

    setState(() {
      _submitting = true;
      _error = null;
    });

    try {
      final grouped = _groupByBusiness(app.cart);
      final groupsPayload = grouped.entries.map((entry) {
        final items = entry.value;
        final biz = items.first.business;
        final distKm = app.distanceToBusinessKm(biz);

        var maxFreeKm = 0.0;
        var deliverySupported = false;
        for (final it in items) {
          final p = ListingCommercialPolicy.fromListing(
            listingType: it.listing.listingType,
            metadata: it.listing.metadata,
          );
          if (p.deliveryAvailable) {
            deliverySupported = true;
            if (p.freeDeliveryMaxKm > maxFreeKm) {
              maxFreeKm = p.freeDeliveryMaxKm;
            }
          }
        }
        final deliv = _fulfillmentType == 'DELIVERY'
            ? ListingPolicyCalculator.calculateDeliveryFee(
                distanceKm: distKm,
                deliverySupported: deliverySupported,
                freeDeliveryMaxKm: maxFreeKm,
                deliveryBaseFee: app.policy.deliveryBaseFee,
                deliveryPerKmRate: app.policy.deliveryPerKmRate,
              )
            : const DeliveryFeeResult(coveredByProvider: false, feeEtb: 0);

        final isFood = items.any((i) => i.listing.listingType == 'FOOD');
        return {
          'businessId': biz.id,
          'orderType': isFood ? 'FOOD' : 'PRODUCT',
          'fulfillmentType': _fulfillmentType,
          'deliveryAddress': _fulfillmentType == 'PICKUP'
              ? 'Pickup at ${biz.businessName}, ${biz.subCity}'
              : addr,
          'deliveryFee': deliv.feeEtb,
          'distanceKm': double.parse(distKm.toStringAsFixed(2)),
          'items': items
              .map((i) => {
                    'listingId': i.listing.id,
                    'quantity': i.quantity,
                    if (i.variant != null) 'variant': i.variant,
                  })
              .toList(),
        };
      }).toList();

      final orders = await app.api.createOrder(
        groups: groupsPayload,
        paymentMethod: _paymentMethod,
      );
      app.clearCart();
      await app.refreshWorkspace();

      if (!mounted) return;
      Navigator.pop(context);

      if ((_paymentMethod == 'CHAPA' || _paymentMethod == 'PAYO') &&
          orders.isNotEmpty) {
        final first = orders.first;
        await PaymentGatewaySheet.show(
          context,
          gateway: _paymentMethod,
          transactionType: 'ORDER',
          referenceId: first.id,
          referenceCode: first.orderNumber,
          title: 'Pay Order ${first.orderNumber}',
          amountEtb: first.totalAmount,
        );
      } else {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
            content: Text(
              'Order placed! View status & payment details in My Activity.',
            ),
          ),
        );
        app.setTabIndex(2);
      }
    } catch (e) {
      if (mounted) setState(() => _error = e.toString());
    } finally {
      if (mounted) setState(() => _submitting = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final app = context.watch<AppState>();
    final items = app.cart;
    final grouped = _groupByBusiness(items);

    var grandSubtotal = 0.0;
    var grandDelivery = 0.0;
    var grandBuyerTax = 0.0;
    var anySellerCoveredTax = false;

    for (final entry in grouped.entries) {
      final groupItems = entry.value;
      final biz = groupItems.first.business;
      final distKm = app.distanceToBusinessKm(biz);

      var groupSub = 0.0;
      var maxFreeKm = 0.0;
      var deliverySupported = false;

      for (final it in groupItems) {
        final line = it.listing.effectivePrice * it.quantity;
        groupSub += line;
        final pol = ListingCommercialPolicy.fromListing(
          listingType: it.listing.listingType,
          metadata: it.listing.metadata,
        );
        if (pol.isSellerTax) {
          anySellerCoveredTax = true;
        }
        grandBuyerTax += ListingPolicyCalculator.calculateBuyerTaxEtb(
          lineSubtotalEtb: line,
          taxResponsibility: pol.taxResponsibility,
          taxRatePercent: app.policy.taxRatePercent,
        );
        if (pol.deliveryAvailable) {
          deliverySupported = true;
          if (pol.freeDeliveryMaxKm > maxFreeKm) {
            maxFreeKm = pol.freeDeliveryMaxKm;
          }
        }
      }
      grandSubtotal += groupSub;
      if (_fulfillmentType == 'DELIVERY') {
        final deliv = ListingPolicyCalculator.calculateDeliveryFee(
          distanceKm: distKm,
          deliverySupported: deliverySupported,
          freeDeliveryMaxKm: maxFreeKm,
          deliveryBaseFee: app.policy.deliveryBaseFee,
          deliveryPerKmRate: app.policy.deliveryPerKmRate,
        );
        grandDelivery += deliv.feeEtb;
      }
    }
    final grandTotal = grandSubtotal + grandDelivery + grandBuyerTax;

    return DraggableScrollableSheet(
      initialChildSize: 0.85,
      minChildSize: 0.5,
      maxChildSize: 0.95,
      expand: false,
      builder: (_, scrollCtrl) => Padding(
        padding: EdgeInsets.fromLTRB(
            18, 12, 18, MediaQuery.of(context).viewInsets.bottom + 20),
        child: Column(
          children: [
            Container(
              width: 42,
              height: 4,
              decoration: BoxDecoration(
                color: AppTheme.border,
                borderRadius: BorderRadius.circular(4),
              ),
            ),
            const SizedBox(height: 12),
            Row(
              children: [
                const Icon(Icons.shopping_cart_checkout_rounded,
                    color: AppTheme.primary),
                const SizedBox(width: 8),
                Expanded(
                  child: Text(
                    'My Cart (${app.cartCount})',
                    style: const TextStyle(
                        fontSize: 18, fontWeight: FontWeight.w800),
                  ),
                ),
                if (items.isNotEmpty)
                  TextButton(
                    onPressed: app.clearCart,
                    child: const Text('Clear',
                        style: TextStyle(color: AppTheme.danger)),
                  ),
              ],
            ),
            const Divider(),
            if (items.isEmpty)
              const Expanded(
                child: Center(
                  child: Text(
                    'Your cart is empty. Add products or meals from Discover.',
                    textAlign: TextAlign.center,
                    style: TextStyle(color: AppTheme.mutedInk),
                  ),
                ),
              )
            else
              Expanded(
                child: ListView(
                  controller: scrollCtrl,
                  children: [
                    if (_error != null) ...[
                      Container(
                        padding: const EdgeInsets.all(10),
                        decoration: BoxDecoration(
                          color: const Color(0xFFFFEBEE),
                          borderRadius: BorderRadius.circular(10),
                        ),
                        child: Text(_error!,
                            style: const TextStyle(
                                color: AppTheme.danger, fontSize: 12.5)),
                      ),
                      const SizedBox(height: 10),
                    ],
                    ...items.map((item) {
                      final pol = ListingCommercialPolicy.fromListing(
                        listingType: item.listing.listingType,
                        metadata: item.listing.metadata,
                      );
                      final distKm = app.distanceToBusinessKm(item.business);
                      return Card(
                        margin: const EdgeInsets.only(bottom: 10),
                        child: Padding(
                          padding: const EdgeInsets.all(10),
                          child: Row(
                            children: [
                              SmartImage(
                                source: item.listing.primaryImage,
                                width: 62,
                                height: 62,
                                borderRadius: BorderRadius.circular(10),
                              ),
                              const SizedBox(width: 10),
                              Expanded(
                                child: Column(
                                  crossAxisAlignment: CrossAxisAlignment.start,
                                  children: [
                                    Text(
                                      item.listing.title,
                                      maxLines: 1,
                                      overflow: TextOverflow.ellipsis,
                                      style: const TextStyle(
                                          fontWeight: FontWeight.w800,
                                          fontSize: 13.5),
                                    ),
                                    Text(
                                      '${item.business.businessName} · ${distKm.toStringAsFixed(1)} km',
                                      style: const TextStyle(
                                          fontSize: 11.5,
                                          color: AppTheme.mutedInk),
                                    ),
                                    const SizedBox(height: 3),
                                    Text(
                                      '${AppConfig.formatEtb(item.listing.effectivePrice)} · ${pol.isSellerTax ? 'Tax from Seller (0 extra VAT)' : 'Tax from Buyer (+${app.policy.taxRatePercent.round()}% VAT)'}',
                                      style: TextStyle(
                                        fontSize: 11.5,
                                        fontWeight: FontWeight.w700,
                                        color: pol.isSellerTax
                                            ? AppTheme.primary
                                            : AppTheme.ink,
                                      ),
                                    ),
                                    if (pol.freeDeliveryMaxKm > 0)
                                      Text(
                                        'Free delivery 0–${pol.freeDeliveryMaxKm.toStringAsFixed(1)} km',
                                        style: const TextStyle(
                                            fontSize: 11,
                                            color: AppTheme.primary),
                                      ),
                                  ],
                                ),
                              ),
                              Row(
                                mainAxisSize: MainAxisSize.min,
                                children: [
                                  IconButton(
                                    onPressed: () => app.updateCartQuantity(
                                      item.listing.id,
                                      item.variant,
                                      item.quantity - 1,
                                    ),
                                    icon: const Icon(
                                        Icons.remove_circle_outline_rounded,
                                        size: 20),
                                  ),
                                  Text('${item.quantity}',
                                      style: const TextStyle(
                                          fontWeight: FontWeight.w800)),
                                  IconButton(
                                    onPressed: () => app.updateCartQuantity(
                                      item.listing.id,
                                      item.variant,
                                      item.quantity + 1,
                                    ),
                                    icon: const Icon(
                                        Icons.add_circle_outline_rounded,
                                        size: 20),
                                  ),
                                ],
                              ),
                            ],
                          ),
                        ),
                      );
                    }),
                    const SizedBox(height: 8),
                    SegmentedButton<String>(
                      segments: const [
                        ButtonSegment(
                          value: 'DELIVERY',
                          label: Text('Delivery'),
                          icon: Icon(Icons.delivery_dining_rounded, size: 18),
                        ),
                        ButtonSegment(
                          value: 'PICKUP',
                          label: Text('Self Pickup'),
                          icon: Icon(Icons.store_rounded, size: 18),
                        ),
                      ],
                      selected: {_fulfillmentType},
                      onSelectionChanged: (s) =>
                          setState(() => _fulfillmentType = s.first),
                    ),
                    if (_fulfillmentType == 'DELIVERY') ...[
                      const SizedBox(height: 10),
                      TextField(
                        controller: _addressCtrl,
                        decoration: const InputDecoration(
                          labelText: 'Delivery Address / Landmark',
                          prefixIcon: Icon(Icons.place_outlined),
                        ),
                      ),
                    ],
                    const SizedBox(height: 10),
                    DropdownButtonFormField<String>(
                      initialValue: _paymentMethod,
                      decoration:
                          const InputDecoration(labelText: 'Payment Method'),
                      items: const [
                        DropdownMenuItem(
                            value: 'CHAPA',
                            child: Text('Chapa (Telebirr / CBE / Cards)')),
                        DropdownMenuItem(
                            value: 'PAYO',
                            child: Text('Payo / Bank Transfer Receipt')),
                        DropdownMenuItem(
                            value: 'TELEBIRR', child: Text('Telebirr')),
                        DropdownMenuItem(
                            value: 'CBE_BIRR', child: Text('CBE Birr')),
                        DropdownMenuItem(
                            value: 'CASH', child: Text('Cash on Delivery')),
                      ],
                      onChanged: (v) =>
                          setState(() => _paymentMethod = v ?? 'CHAPA'),
                    ),
                    const SizedBox(height: 14),
                    Container(
                      padding: const EdgeInsets.all(14),
                      decoration: BoxDecoration(
                        color: AppTheme.surfaceBg,
                        borderRadius: BorderRadius.circular(14),
                        border: Border.all(color: AppTheme.border),
                      ),
                      child: Column(
                        children: [
                          _row('Visible Subtotal',
                              AppConfig.formatEtb(grandSubtotal)),
                          _row(
                              'Delivery Fee',
                              _fulfillmentType == 'PICKUP'
                                  ? '0 ETB (Pickup)'
                                  : grandDelivery == 0
                                      ? '0 ETB (Provider Covered)'
                                      : AppConfig.formatEtb(grandDelivery)),
                          _row(
                            'Buyer VAT (${app.policy.taxRatePercent.round()}%)',
                            grandBuyerTax == 0 && anySellerCoveredTax
                                ? '0 ETB (Tax from Seller)'
                                : AppConfig.formatEtb(grandBuyerTax),
                          ),
                          const Divider(height: 16),
                          _row(
                            'Total to Pay',
                            AppConfig.formatEtb(grandTotal),
                            bold: true,
                          ),
                        ],
                      ),
                    ),
                    const SizedBox(height: 14),
                    SizedBox(
                      width: double.infinity,
                      child: ElevatedButton.icon(
                        onPressed: _submitting ? null : _checkout,
                        icon: const Icon(Icons.check_circle_outline_rounded),
                        label: Text(_submitting
                            ? 'Submitting Order...'
                            : 'Place Order (${AppConfig.formatEtb(grandTotal)})'),
                      ),
                    ),
                  ],
                ),
              ),
          ],
        ),
      ),
    );
  }

  Widget _row(String k, String v, {bool bold = false}) {
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 3),
      child: Row(
        mainAxisAlignment: MainAxisAlignment.spaceBetween,
        children: [
          Text(k,
              style: TextStyle(
                  fontSize: bold ? 14 : 12.5,
                  fontWeight: bold ? FontWeight.w800 : FontWeight.w500,
                  color: bold ? AppTheme.ink : AppTheme.mutedInk)),
          Text(v,
              style: TextStyle(
                  fontSize: bold ? 15 : 12.5,
                  fontWeight: bold ? FontWeight.w800 : FontWeight.w700,
                  color: bold ? AppTheme.primary : AppTheme.ink)),
        ],
      ),
    );
  }
}
