import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import '../core/config/app_config.dart';
import '../core/models/models.dart';
import '../core/providers/app_state.dart';
import '../core/theme/app_theme.dart';
import '../core/utils/listing_policy.dart';
import '../widgets/smart_image.dart';

class CompareSheet extends StatelessWidget {
  const CompareSheet({super.key});

  static Future<void> show(BuildContext context) {
    return showModalBottomSheet(
      context: context,
      isScrollControlled: true,
      backgroundColor: Colors.white,
      shape: const RoundedRectangleBorder(
        borderRadius: BorderRadius.vertical(top: Radius.circular(22)),
      ),
      builder: (_) => const CompareSheet(),
    );
  }

  @override
  Widget build(BuildContext context) {
    final app = context.watch<AppState>();
    final items = <({Listing listing, Business business})>[];
    for (final id in app.compareListingIds) {
      final l = app.listingById(id);
      if (l != null) {
        final b = app.businessById(l.businessId);
        if (b != null) {
          items.add((listing: l, business: b));
        }
      }
    }

    return DraggableScrollableSheet(
      initialChildSize: 0.72,
      minChildSize: 0.4,
      maxChildSize: 0.92,
      expand: false,
      builder: (_, scrollCtrl) => Padding(
        padding: const EdgeInsets.fromLTRB(16, 12, 16, 20),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
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
            Text(
              'Compare Listings (${items.length}/3)',
              style: const TextStyle(fontSize: 18, fontWeight: FontWeight.w800),
            ),
            const Divider(),
            Expanded(
              child: items.isEmpty
                  ? const Center(
                      child: Text(
                        'Tap "+ Compare" on up to 3 listings to compare price, distance, tax & delivery.',
                        textAlign: TextAlign.center,
                        style: TextStyle(color: AppTheme.mutedInk),
                      ),
                    )
                  : ListView(
                      controller: scrollCtrl,
                      scrollDirection: Axis.horizontal,
                      children: items.map((pair) {
                        final pol = ListingCommercialPolicy.fromListing(
                          listingType: pair.listing.listingType,
                          metadata: pair.listing.metadata,
                        );
                        final distKm = app.distanceToBusinessKm(pair.business);
                        return Container(
                          width: 230,
                          margin: const EdgeInsets.only(right: 12),
                          padding: const EdgeInsets.all(12),
                          decoration: BoxDecoration(
                            color: AppTheme.surfaceBg,
                            borderRadius: BorderRadius.circular(14),
                            border: Border.all(color: AppTheme.border),
                          ),
                          child: Column(
                            crossAxisAlignment: CrossAxisAlignment.start,
                            children: [
                              SmartImage(
                                source: pair.listing.primaryImage,
                                height: 100,
                                width: double.infinity,
                                borderRadius: BorderRadius.circular(10),
                              ),
                              const SizedBox(height: 8),
                              Text(
                                pair.listing.title,
                                maxLines: 2,
                                overflow: TextOverflow.ellipsis,
                                style: const TextStyle(
                                    fontWeight: FontWeight.w800, fontSize: 14),
                              ),
                              Text(
                                pair.business.businessName,
                                style: const TextStyle(
                                    fontSize: 12, color: AppTheme.mutedInk),
                              ),
                              const Divider(height: 16),
                              _kv('Price',
                                  AppConfig.formatEtb(pair.listing.effectivePrice)),
                              _kv('Distance', '${distKm.toStringAsFixed(1)} km'),
                              _kv('Rating',
                                  '${pair.listing.ratingAvg.toStringAsFixed(1)} ★'),
                              _kv(
                                  'Tax',
                                  pol.isSellerTax
                                      ? 'From Seller (0 extra)'
                                      : 'From Buyer (+VAT)'),
                              _kv(
                                  'Delivery',
                                  pol.freeDeliveryMaxKm > 0
                                      ? 'Free 0-${pol.freeDeliveryMaxKm.toStringAsFixed(0)} km'
                                      : (pol.deliveryAvailable
                                          ? 'Standard rate'
                                          : 'Pickup only')),
                              const Spacer(),
                              SizedBox(
                                width: double.infinity,
                                child: OutlinedButton(
                                  onPressed: () =>
                                      app.toggleCompare(pair.listing.id),
                                  child: const Text('Remove'),
                                ),
                              ),
                            ],
                          ),
                        );
                      }).toList(),
                    ),
            ),
          ],
        ),
      ),
    );
  }

  Widget _kv(String k, String v) {
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 2),
      child: Row(
        mainAxisAlignment: MainAxisAlignment.spaceBetween,
        children: [
          Text(k,
              style: const TextStyle(fontSize: 11.5, color: AppTheme.mutedInk)),
          Flexible(
            child: Text(
              v,
              textAlign: TextAlign.right,
              style: const TextStyle(fontSize: 11.5, fontWeight: FontWeight.w700),
            ),
          ),
        ],
      ),
    );
  }
}
