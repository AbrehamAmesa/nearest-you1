import 'package:flutter/material.dart';
import 'package:flutter_map/flutter_map.dart';
import 'package:latlong2/latlong.dart';
import 'package:provider/provider.dart';
import '../core/config/app_config.dart';
import '../core/models/models.dart';
import '../core/providers/app_state.dart';
import '../core/theme/app_theme.dart';
import '../core/utils/listing_policy.dart';
import '../widgets/smart_image.dart';
import 'auth_sheet.dart';
import 'compare_sheet.dart';
import 'image_search_sheet.dart';
import 'job_seeker_advertise_sheet.dart';
import 'listing_detail_sheet.dart';

class DiscoverScreen extends StatefulWidget {
  const DiscoverScreen({super.key});

  @override
  State<DiscoverScreen> createState() => _DiscoverScreenState();
}

class _DiscoverScreenState extends State<DiscoverScreen> {
  final _searchCtrl = TextEditingController();
  int? _selectedCategoryId;
  bool _showMap = false;
  String _sortBy = 'distance'; // distance | price_asc | price_desc | rating | newest
  double? _radiusKm; // null = All Addis
  String _listingTypeFilter = 'ALL';
  bool _faydaOnly = false;
  bool _liveGpsOnly = false;
  bool _deliveryOnly = false;
  bool _discountedOnly = false;

  @override
  void dispose() {
    _searchCtrl.dispose();
    super.dispose();
  }

  List<({Listing listing, Business business, double distanceKm})> _filteredListings(
      AppState app) {
    final q = _searchCtrl.text.trim().toLowerCase();
    final out = <({Listing listing, Business business, double distanceKm})>[];

    for (final l in app.listings) {
      if (l.status.toUpperCase() != 'ACTIVE') continue;
      final b = app.businessById(l.businessId);
      if (b == null) continue;
      if (_selectedCategoryId != null && l.categoryId != _selectedCategoryId) {
        continue;
      }
      if (_listingTypeFilter != 'ALL' &&
          l.listingType.toUpperCase() != _listingTypeFilter) {
        continue;
      }
      if (_faydaOnly && !b.faydaVerified) continue;
      if (_liveGpsOnly && !b.liveLocationActive) continue;
      final pol = ListingCommercialPolicy.fromListing(
        listingType: l.listingType,
        metadata: l.metadata,
      );
      if (_deliveryOnly && !pol.deliveryAvailable) continue;
      if (_discountedOnly &&
          !(l.discountPrice != null &&
              l.discountPrice! > 0 &&
              l.discountPrice! < l.basePrice)) {
        continue;
      }

      final distKm = app.distanceToBusinessKm(b);
      if (_radiusKm != null && distKm > _radiusKm!) continue;

      if (q.isNotEmpty) {
        final hay =
            '${l.title} ${l.description} ${b.businessName} ${b.subCity} ${b.landmark}'
                .toLowerCase();
        if (!hay.contains(q)) continue;
      }

      out.add((listing: l, business: b, distanceKm: distKm));
    }

    switch (_sortBy) {
      case 'price_asc':
        out.sort((a, b) =>
            a.listing.effectivePrice.compareTo(b.listing.effectivePrice));
        break;
      case 'price_desc':
        out.sort((a, b) =>
            b.listing.effectivePrice.compareTo(a.listing.effectivePrice));
        break;
      case 'rating':
        out.sort((a, b) => b.listing.ratingAvg.compareTo(a.listing.ratingAvg));
        break;
      case 'newest':
        out.sort((a, b) => b.listing.id.compareTo(a.listing.id));
        break;
      case 'distance':
      default:
        out.sort((a, b) => a.distanceKm.compareTo(b.distanceKm));
        break;
    }
    return out;
  }

  void _openFilterSheet() {
    showModalBottomSheet(
      context: context,
      backgroundColor: Colors.white,
      shape: const RoundedRectangleBorder(
        borderRadius: BorderRadius.vertical(top: Radius.circular(22)),
      ),
      builder: (_) => StatefulBuilder(
        builder: (ctx, setSheet) => Padding(
          padding: const EdgeInsets.fromLTRB(18, 14, 18, 24),
          child: SingleChildScrollView(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              mainAxisSize: MainAxisSize.min,
              children: [
                const Text('Filters & Sort',
                    style:
                        TextStyle(fontSize: 18, fontWeight: FontWeight.w800)),
                const SizedBox(height: 12),
                DropdownButtonFormField<String>(
                  initialValue: _sortBy,
                  decoration: const InputDecoration(labelText: 'Sort Order'),
                  items: const [
                    DropdownMenuItem(
                        value: 'distance', child: Text('Nearest Distance First')),
                    DropdownMenuItem(
                        value: 'price_asc', child: Text('Lowest Price (ETB)')),
                    DropdownMenuItem(
                        value: 'price_desc', child: Text('Highest Price (ETB)')),
                    DropdownMenuItem(
                        value: 'rating', child: Text('Highest Rating')),
                    DropdownMenuItem(
                        value: 'newest', child: Text('Newly Published')),
                  ],
                  onChanged: (v) {
                    setState(() => _sortBy = v ?? 'distance');
                    setSheet(() {});
                  },
                ),
                const SizedBox(height: 10),
                DropdownButtonFormField<double?>(
                  initialValue: _radiusKm,
                  decoration: const InputDecoration(labelText: 'Max Distance'),
                  items: const [
                    DropdownMenuItem(value: null, child: Text('All Addis Ababa')),
                    DropdownMenuItem(value: 3.0, child: Text('Within 3 km')),
                    DropdownMenuItem(value: 5.0, child: Text('Within 5 km')),
                    DropdownMenuItem(value: 10.0, child: Text('Within 10 km')),
                    DropdownMenuItem(value: 20.0, child: Text('Within 20 km')),
                  ],
                  onChanged: (v) {
                    setState(() => _radiusKm = v);
                    setSheet(() {});
                  },
                ),
                const SizedBox(height: 10),
                DropdownButtonFormField<String>(
                  initialValue: _listingTypeFilter,
                  decoration: const InputDecoration(labelText: 'Listing Type'),
                  items: const [
                    DropdownMenuItem(value: 'ALL', child: Text('All Types')),
                    DropdownMenuItem(value: 'PRODUCT', child: Text('Products & Retail')),
                    DropdownMenuItem(value: 'FOOD', child: Text('Food & Dining')),
                    DropdownMenuItem(value: 'SERVICE', child: Text('Services')),
                    DropdownMenuItem(value: 'RENTAL', child: Text('Rentals')),
                    DropdownMenuItem(value: 'JOB', child: Text('Jobs')),
                    DropdownMenuItem(
                        value: 'JOB_SEEKER', child: Text('Job Seekers')),
                    DropdownMenuItem(value: 'HEALTHCARE', child: Text('Healthcare')),
                    DropdownMenuItem(value: 'EVENT', child: Text('Events')),
                  ],
                  onChanged: (v) {
                    setState(() => _listingTypeFilter = v ?? 'ALL');
                    setSheet(() {});
                  },
                ),
                SwitchListTile(
                  contentPadding: EdgeInsets.zero,
                  value: _faydaOnly,
                  onChanged: (v) {
                    setState(() => _faydaOnly = v);
                    setSheet(() {});
                  },
                  title: const Text('Fayda & Liveness Verified Only'),
                ),
                SwitchListTile(
                  contentPadding: EdgeInsets.zero,
                  value: _liveGpsOnly,
                  onChanged: (v) {
                    setState(() => _liveGpsOnly = v);
                    setSheet(() {});
                  },
                  title: const Text('Live GPS Active Only'),
                ),
                SwitchListTile(
                  contentPadding: EdgeInsets.zero,
                  value: _deliveryOnly,
                  onChanged: (v) {
                    setState(() => _deliveryOnly = v);
                    setSheet(() {});
                  },
                  title: const Text('Delivery Supported Only'),
                ),
                SwitchListTile(
                  contentPadding: EdgeInsets.zero,
                  value: _discountedOnly,
                  onChanged: (v) {
                    setState(() => _discountedOnly = v);
                    setSheet(() {});
                  },
                  title: const Text('Discounted Offers Only'),
                ),
                Row(
                  children: [
                    Expanded(
                      child: OutlinedButton(
                        onPressed: () {
                          setState(() {
                            _selectedCategoryId = null;
                            _radiusKm = null;
                            _listingTypeFilter = 'ALL';
                            _faydaOnly = false;
                            _liveGpsOnly = false;
                            _deliveryOnly = false;
                            _discountedOnly = false;
                            _sortBy = 'distance';
                          });
                          Navigator.pop(ctx);
                        },
                        child: const Text('Reset All'),
                      ),
                    ),
                    const SizedBox(width: 10),
                    Expanded(
                      child: ElevatedButton(
                        onPressed: () => Navigator.pop(ctx),
                        child: const Text('Apply'),
                      ),
                    ),
                  ],
                ),
              ],
            ),
          ),
        ),
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    final app = context.watch<AppState>();
    final items = _filteredListings(app);
    final bottomPad = app.cartCount > 0 ? 84.0 : 18.0;

    return RefreshIndicator(
      onRefresh: () => app.loadCatalog(silent: false),
      child: ListView(
        padding: EdgeInsets.fromLTRB(14, 10, 14, bottomPad),
        children: [
          // Location Banner (displays listings immediately before GPS lock, updates when GPS arrives)
          Container(
            padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 10),
            decoration: BoxDecoration(
              color: Colors.white,
              borderRadius: BorderRadius.circular(14),
              border: Border.all(color: AppTheme.border),
            ),
            child: Row(
              children: [
                Icon(
                  app.hasExactGps
                      ? Icons.gps_fixed_rounded
                      : Icons.location_searching_rounded,
                  color: AppTheme.primary,
                  size: 20,
                ),
                const SizedBox(width: 10),
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(
                        app.hasExactGps
                            ? '${app.t('nearest_first')} · ${app.detectedLocation?.label ?? 'Exact GPS'}'
                            : app.t('showing_before_gps'),
                        style: const TextStyle(
                            fontSize: 12,
                            fontWeight: FontWeight.w700,
                            color: AppTheme.ink),
                      ),
                      if (app.gpsError != null)
                        Text(app.gpsError!,
                            style: const TextStyle(
                                fontSize: 11, color: AppTheme.warning)),
                    ],
                  ),
                ),
                TextButton(
                  onPressed: app.detectingGps
                      ? null
                      : () => app.refreshExactGps(silent: false),
                  child: Text(
                    app.detectingGps ? '...' : app.t('update_gps'),
                    style: const TextStyle(
                        fontSize: 12, fontWeight: FontWeight.w800),
                  ),
                ),
              ],
            ),
          ),
          const SizedBox(height: 10),

          // Search + Camera/Image Search + Filters
          Row(
            children: [
              Expanded(
                child: TextField(
                  controller: _searchCtrl,
                  onChanged: (_) => setState(() {}),
                  decoration: InputDecoration(
                    hintText: app.t('search_hint'),
                    prefixIcon: const Icon(Icons.search_rounded),
                    suffixIcon: _searchCtrl.text.isNotEmpty
                        ? IconButton(
                            onPressed: () {
                              _searchCtrl.clear();
                              setState(() {});
                            },
                            icon: const Icon(Icons.close_rounded, size: 18),
                          )
                        : null,
                    isDense: true,
                  ),
                ),
              ),
              const SizedBox(width: 8),
              IconButton.filledTonal(
                tooltip: app.t('scan_image'),
                onPressed: () => ImageSearchSheet.show(context),
                icon: const Icon(Icons.camera_alt_outlined),
              ),
              const SizedBox(width: 4),
              IconButton.filledTonal(
                tooltip: 'Filters',
                onPressed: _openFilterSheet,
                icon: const Icon(Icons.tune_rounded),
              ),
            ],
          ),
          const SizedBox(height: 10),

          // Quick Actions Row (Live Map, Compare, Job Seeker Advertise)
          SingleChildScrollView(
            scrollDirection: Axis.horizontal,
            child: Row(
              children: [
                FilterChip(
                  selected: _showMap,
                  onSelected: (v) => setState(() => _showMap = v),
                  avatar: const Icon(Icons.map_outlined, size: 17),
                  label: Text(_showMap ? 'Hide Map' : 'Live Map'),
                ),
                const SizedBox(width: 8),
                ActionChip(
                  avatar: const Icon(Icons.compare_arrows_rounded, size: 17),
                  label: Text('Compare (${app.compareListingIds.length})'),
                  onPressed: () => CompareSheet.show(context),
                ),
                const SizedBox(width: 8),
                ActionChip(
                  avatar: const Icon(Icons.badge_outlined, size: 17),
                  label: Text(app.t('advertise_self')),
                  onPressed: () => JobSeekerAdvertiseSheet.show(context),
                ),
              ],
            ),
          ),
          const SizedBox(height: 8),

          // Category Chips
          SizedBox(
            height: 40,
            child: ListView.separated(
              scrollDirection: Axis.horizontal,
              itemCount: app.categories.length + 1,
              separatorBuilder: (_, __) => const SizedBox(width: 6),
              itemBuilder: (_, i) {
                if (i == 0) {
                  return ChoiceChip(
                    selected: _selectedCategoryId == null,
                    onSelected: (_) =>
                        setState(() => _selectedCategoryId = null),
                    label: Text(app.t('all_services')),
                  );
                }
                final cat = app.categories[i - 1];
                return ChoiceChip(
                  selected: _selectedCategoryId == cat.id,
                  onSelected: (_) => setState(() {
                    _selectedCategoryId =
                        _selectedCategoryId == cat.id ? null : cat.id;
                  }),
                  label: Text(cat.labelFor(app.language.name)),
                );
              },
            ),
          ),

          if (_showMap) ...[
            const SizedBox(height: 10),
            _buildMapCard(app, items),
          ],

          if (app.catalogError != null) ...[
            const SizedBox(height: 10),
            Container(
              padding: const EdgeInsets.all(12),
              decoration: BoxDecoration(
                color: const Color(0xFFFFEBEE),
                borderRadius: BorderRadius.circular(12),
              ),
              child: Text(
                app.catalogError!,
                style: const TextStyle(color: AppTheme.danger, fontSize: 12.5),
              ),
            ),
          ],

          // Recommendations section (renders immediately!)
          if (app.recommendations.isNotEmpty &&
              _searchCtrl.text.trim().isEmpty &&
              _selectedCategoryId == null) ...[
            const SizedBox(height: 14),
            Row(
              mainAxisAlignment: MainAxisAlignment.spaceBetween,
              children: [
                Text(
                  app.t('recommended_title'),
                  style: const TextStyle(
                      fontSize: 16,
                      fontWeight: FontWeight.w800,
                      color: AppTheme.ink),
                ),
                Text(
                  app.hasExactGps ? app.t('nearest_first') : 'Featured',
                  style: const TextStyle(
                      fontSize: 11.5,
                      fontWeight: FontWeight.w700,
                      color: AppTheme.primary),
                ),
              ],
            ),
            const SizedBox(height: 8),
            SizedBox(
              height: 196,
              child: ListView.separated(
                scrollDirection: Axis.horizontal,
                itemCount: app.recommendations.length,
                separatorBuilder: (_, __) => const SizedBox(width: 10),
                itemBuilder: (_, i) {
                  final rec = app.recommendations[i];
                  return SizedBox(
                    width: 210,
                    child: Card(
                      clipBehavior: Clip.antiAlias,
                      child: InkWell(
                        onTap: () => ListingDetailSheet.show(
                          context,
                          listing: rec.listing,
                          business: rec.business,
                        ),
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            SmartImage(
                              source: rec.listing.primaryImage,
                              width: double.infinity,
                              height: 100,
                            ),
                            Padding(
                              padding: const EdgeInsets.all(9),
                              child: Column(
                                crossAxisAlignment: CrossAxisAlignment.start,
                                children: [
                                  Text(
                                    rec.listing.title,
                                    maxLines: 1,
                                    overflow: TextOverflow.ellipsis,
                                    style: const TextStyle(
                                        fontWeight: FontWeight.w800,
                                        fontSize: 13),
                                  ),
                                  Text(
                                    '${rec.business.businessName} · ${app.distanceToBusinessKm(rec.business).toStringAsFixed(1)} km',
                                    maxLines: 1,
                                    overflow: TextOverflow.ellipsis,
                                    style: const TextStyle(
                                        fontSize: 11,
                                        color: AppTheme.mutedInk),
                                  ),
                                  const SizedBox(height: 4),
                                  Text(
                                    AppConfig.formatEtb(rec.effectivePrice),
                                    style: const TextStyle(
                                        fontWeight: FontWeight.w800,
                                        fontSize: 13,
                                        color: AppTheme.primary),
                                  ),
                                ],
                              ),
                            ),
                          ],
                        ),
                      ),
                    ),
                  );
                },
              ),
            ),
          ],

          const SizedBox(height: 14),
          Row(
            mainAxisAlignment: MainAxisAlignment.spaceBetween,
            children: [
              Text(
                'Listings (${items.length})',
                style: const TextStyle(
                    fontSize: 16,
                    fontWeight: FontWeight.w800,
                    color: AppTheme.ink),
              ),
              if (app.catalogLoading)
                const SizedBox(
                    width: 16,
                    height: 16,
                    child: CircularProgressIndicator(strokeWidth: 2)),
            ],
          ),
          const SizedBox(height: 8),

          if (!app.catalogLoading && items.isEmpty)
            Padding(
              padding: const EdgeInsets.symmetric(vertical: 36),
              child: Center(
                child: Text(
                  app.t('no_results'),
                  style: const TextStyle(color: AppTheme.mutedInk),
                ),
              ),
            )
          else
            ...items.map((pair) => _buildListingCard(context, app, pair)),
        ],
      ),
    );
  }

  Widget _buildMapCard(
    AppState app,
    List<({Listing listing, Business business, double distanceKm})> items,
  ) {
    final markers = <Marker>[
      Marker(
        point: LatLng(app.userLat, app.userLng),
        width: 34,
        height: 34,
        child: const Icon(Icons.my_location_rounded,
            color: Colors.blueAccent, size: 28),
      ),
      ...items.take(25).map(
            (p) => Marker(
              point: LatLng(p.business.latitude, p.business.longitude),
              width: 36,
              height: 36,
              child: GestureDetector(
                onTap: () => ListingDetailSheet.show(
                  context,
                  listing: p.listing,
                  business: p.business,
                ),
                child: const Icon(Icons.location_on_rounded,
                    color: AppTheme.primary, size: 32),
              ),
            ),
          ),
      ...app.liveProviders.take(20).map(
            (lp) => Marker(
              point: LatLng(lp.latitude, lp.longitude),
              width: 28,
              height: 28,
              child: const Icon(Icons.verified_user_rounded,
                  color: AppTheme.accent, size: 22),
            ),
          ),
    ];

    return ClipRRect(
      borderRadius: BorderRadius.circular(14),
      child: SizedBox(
        height: 240,
        child: FlutterMap(
          options: MapOptions(
            initialCenter: LatLng(app.userLat, app.userLng),
            initialZoom: 12.5,
          ),
          children: [
            TileLayer(
              urlTemplate: 'https://tile.openstreetmap.org/{z}/{x}/{y}.png',
              userAgentPackageName: 'com.nearestyou.mobile',
            ),
            MarkerLayer(markers: markers),
          ],
        ),
      ),
    );
  }

  Widget _buildListingCard(
    BuildContext context,
    AppState app,
    ({Listing listing, Business business, double distanceKm}) pair,
  ) {
    final l = pair.listing;
    final b = pair.business;
    final pol = ListingCommercialPolicy.fromListing(
      listingType: l.listingType,
      metadata: l.metadata,
    );
    final isFav = app.favoriteIds.contains(l.id);
    final isComparing = app.compareListingIds.contains(l.id);

    return Card(
      margin: const EdgeInsets.only(bottom: 12),
      clipBehavior: Clip.antiAlias,
      child: InkWell(
        onTap: () =>
            ListingDetailSheet.show(context, listing: l, business: b),
        child: Padding(
          padding: const EdgeInsets.all(12),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Row(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  SmartImage(
                    source: l.primaryImage,
                    width: 90,
                    height: 90,
                    borderRadius: BorderRadius.circular(12),
                  ),
                  const SizedBox(width: 12),
                  Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Row(
                          children: [
                            Expanded(
                              child: Text(
                                l.title,
                                maxLines: 1,
                                overflow: TextOverflow.ellipsis,
                                style: const TextStyle(
                                    fontWeight: FontWeight.w800,
                                    fontSize: 15),
                              ),
                            ),
                            GestureDetector(
                              onTap: () {
                                if (app.currentUser == null) {
                                  AuthSheet.show(context);
                                } else {
                                  app.toggleFavorite(l.id);
                                }
                              },
                              child: Icon(
                                isFav
                                    ? Icons.favorite_rounded
                                    : Icons.favorite_border_rounded,
                                size: 20,
                                color: isFav
                                    ? AppTheme.danger
                                    : AppTheme.mutedInk,
                              ),
                            ),
                          ],
                        ),
                        const SizedBox(height: 2),
                        Text(
                          '${b.businessName} · ${b.subCity} (${pair.distanceKm.toStringAsFixed(1)} km)',
                          maxLines: 1,
                          overflow: TextOverflow.ellipsis,
                          style: const TextStyle(
                              fontSize: 12, color: AppTheme.mutedInk),
                        ),
                        const SizedBox(height: 5),
                        Text(
                          l.description,
                          maxLines: 2,
                          overflow: TextOverflow.ellipsis,
                          style: const TextStyle(
                              fontSize: 12, color: AppTheme.ink),
                        ),
                        const SizedBox(height: 6),
                        Wrap(
                          spacing: 6,
                          runSpacing: 4,
                          children: [
                            if (b.faydaVerified)
                              _badge('Fayda', AppTheme.primaryLight,
                                  AppTheme.primary),
                            if (pol.freeDeliveryMaxKm > 0)
                              _badge(
                                  'Free 0-${pol.freeDeliveryMaxKm.toStringAsFixed(0)}km',
                                  AppTheme.primaryLight,
                                  AppTheme.primary),
                            if (l.isCartPurchaseType)
                              _badge(
                                pol.isSellerTax
                                    ? 'Tax by Seller'
                                    : '+VAT by Buyer',
                                const Color(0xFFF1F5F9),
                                AppTheme.ink,
                              ),
                          ],
                        ),
                      ],
                    ),
                  ),
                ],
              ),
              const SizedBox(height: 10),
              Row(
                children: [
                  Expanded(
                    child: Text(
                      l.isUnpaid
                          ? 'Unpaid'
                          : l.isQuoteBased
                              ? 'Quote / Negotiable'
                              : '${AppConfig.formatEtb(l.effectivePrice)} / ${l.pricingUnit}',
                      style: const TextStyle(
                        fontSize: 14.5,
                        fontWeight: FontWeight.w800,
                        color: AppTheme.primary,
                      ),
                    ),
                  ),
                  TextButton(
                    onPressed: () => app.toggleCompare(l.id),
                    child: Text(
                      isComparing ? 'Comparing' : '+ Compare',
                      style: const TextStyle(fontSize: 12),
                    ),
                  ),
                  const SizedBox(width: 4),
                  ElevatedButton(
                    style: ElevatedButton.styleFrom(
                      padding: const EdgeInsets.symmetric(
                          horizontal: 14, vertical: 8),
                    ),
                    onPressed: () {
                      if (l.isCartPurchaseType) {
                        app.addToCart(l, b);
                        ScaffoldMessenger.of(context).showSnackBar(
                          SnackBar(content: Text('${l.title} added to Cart')),
                        );
                      } else {
                        ListingDetailSheet.show(context,
                            listing: l, business: b);
                      }
                    },
                    child: Text(
                      l.isCartPurchaseType
                          ? app.t('add_to_cart')
                          : l.isJobListing
                              ? app.t('view_apply')
                              : l.isJobSeekerAd
                                  ? app.t('hire_contact')
                                  : app.t('book_now'),
                      style: const TextStyle(fontSize: 12.5),
                    ),
                  ),
                ],
              ),
            ],
          ),
        ),
      ),
    );
  }

  Widget _badge(String text, Color bg, Color fg) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 7, vertical: 3),
      decoration: BoxDecoration(
        color: bg,
        borderRadius: BorderRadius.circular(6),
      ),
      child: Text(
        text,
        style: TextStyle(fontSize: 10.5, fontWeight: FontWeight.w700, color: fg),
      ),
    );
  }
}
