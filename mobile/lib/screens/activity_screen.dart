import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import '../core/config/app_config.dart';
import '../core/models/models.dart';
import '../core/providers/app_state.dart';
import '../core/theme/app_theme.dart';
import '../widgets/live_chat_sheet.dart';
import '../widgets/payment_details_sheet.dart';
import '../widgets/payment_gateway_sheet.dart';
import 'auth_sheet.dart';
import 'listing_detail_sheet.dart';

class ActivityScreen extends StatefulWidget {
  const ActivityScreen({super.key});

  @override
  State<ActivityScreen> createState() => _ActivityScreenState();
}

class _ActivityScreenState extends State<ActivityScreen>
    with SingleTickerProviderStateMixin {
  late TabController _tabCtrl;
  List<Listing> _myJobSeekerAds = [];
  List<PaymentTransactionRecord> _myPayments = [];
  bool _loadingExtras = false;

  @override
  void initState() {
    super.initState();
    _tabCtrl = TabController(length: 6, vsync: this);
    _loadExtras();
  }

  @override
  void dispose() {
    _tabCtrl.dispose();
    super.dispose();
  }

  Future<void> _loadExtras() async {
    final app = context.read<AppState>();
    if (app.currentUser == null) return;
    setState(() => _loadingExtras = true);
    try {
      final ads = await app.api.getMyJobSeekerAds();
      final pays = await app.api.getMyPayments();
      if (mounted) {
        setState(() {
          _myJobSeekerAds = ads;
          _myPayments = pays;
        });
      }
    } catch (_) {
    } finally {
      if (mounted) setState(() => _loadingExtras = false);
    }
  }

  Future<void> _refreshAll() async {
    await context.read<AppState>().refreshWorkspace();
    await _loadExtras();
  }

  @override
  Widget build(BuildContext context) {
    final app = context.watch<AppState>();

    if (app.pendingOpenThreadKey != null && app.currentUser != null) {
      final tk = app.pendingOpenThreadKey!;
      app.consumeNotificationNavigation();
      WidgetsBinding.instance.addPostFrameCallback((_) {
        LiveChatSheet.show(context, threadKey: tk, title: 'Live Chat');
      });
    }

    if (app.currentUser == null) {
      return Center(
        child: Padding(
          padding: const EdgeInsets.all(24),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              const Icon(Icons.receipt_long_rounded,
                  size: 56, color: AppTheme.primary),
              const SizedBox(height: 12),
              const Text(
                'Orders, Bookings & Messages',
                style: TextStyle(fontSize: 18, fontWeight: FontWeight.w800),
              ),
              const SizedBox(height: 6),
              const Text(
                'Sign in to track orders, dual-OTP deliveries, service bookings, live chats, and payment receipts.',
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
              Tab(text: 'Orders (${app.myOrders.length})'),
              Tab(text: 'Bookings (${app.myBookings.length})'),
              Tab(text: 'Deliveries (${app.myDeliveries.length})'),
              Tab(text: 'Messages (${app.chatThreads.length})'),
              Tab(
                  text:
                      'Jobs & Saved (${app.myApplications.length + app.favoriteIds.length})'),
              Tab(text: 'Payments (${_myPayments.length})'),
            ],
          ),
        ),
        Expanded(
          child: TabBarView(
            controller: _tabCtrl,
            children: [
              _buildOrdersTab(app),
              _buildBookingsTab(app),
              _buildDeliveriesTab(app),
              _buildMessagesTab(app),
              _buildJobsAndSavedTab(app),
              _buildPaymentsTab(app),
            ],
          ),
        ),
      ],
    );
  }

  Widget _buildOrdersTab(AppState app) {
    final bottomPad = app.cartCount > 0 ? 84.0 : 20.0;
    return RefreshIndicator(
      onRefresh: _refreshAll,
      child: app.myOrders.isEmpty
          ? ListView(
              children: const [
                SizedBox(height: 80),
                Center(
                    child: Text('No orders yet.',
                        style: TextStyle(color: AppTheme.mutedInk))),
              ],
            )
          : ListView.builder(
              padding: EdgeInsets.fromLTRB(14, 12, 14, bottomPad),
              itemCount: app.myOrders.length,
              itemBuilder: (_, i) {
                final o = app.myOrders[i];
                final isUnpaidDigital =
                    o.paymentStatus.toUpperCase() != 'PAID' &&
                        (o.paymentMethod == 'CHAPA' || o.paymentMethod == 'PAYO');
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
                            Text(o.orderNumber,
                                style: const TextStyle(
                                    fontWeight: FontWeight.w800)),
                            Text(o.orderStatus,
                                style: const TextStyle(
                                    fontWeight: FontWeight.w800,
                                    fontSize: 12,
                                    color: AppTheme.primary)),
                          ],
                        ),
                        const SizedBox(height: 4),
                        Text(
                          'Total: ${AppConfig.formatEtb(o.totalAmount)} · ${o.paymentMethod} (${o.paymentStatus})',
                          style: const TextStyle(
                              fontWeight: FontWeight.w700, fontSize: 13),
                        ),
                        Text('Address: ${o.deliveryAddress}',
                            style: const TextStyle(
                                fontSize: 12, color: AppTheme.mutedInk)),
                        if (o.estimatedDeliveryMinutes != null)
                          Text(
                            'Ready ~${o.estimatedReadyMinutes ?? 15}m · Delivery ~${o.estimatedDeliveryMinutes}m',
                            style: const TextStyle(
                                fontSize: 11.5, color: AppTheme.primary),
                          ),
                        const SizedBox(height: 8),
                        Wrap(
                          spacing: 8,
                          runSpacing: 6,
                          children: [
                            if (isUnpaidDigital)
                              ElevatedButton(
                                onPressed: () => PaymentGatewaySheet.show(
                                  context,
                                  gateway: o.paymentMethod,
                                  transactionType: 'ORDER',
                                  referenceId: o.id,
                                  referenceCode: o.orderNumber,
                                  title: 'Pay ${o.orderNumber}',
                                  amountEtb: o.totalAmount,
                                ),
                                child: Text(app.t('pay_now')),
                              ),
                            OutlinedButton.icon(
                              onPressed: () => PaymentDetailsSheet.show(
                                context,
                                transactionType: 'ORDER',
                                referenceId: o.id,
                                title: 'Payment · ${o.orderNumber}',
                              ),
                              icon: const Icon(Icons.receipt_long_rounded,
                                  size: 16),
                              label: Text(app.t('open_payment_details')),
                            ),
                            OutlinedButton.icon(
                              onPressed: () => LiveChatSheet.show(
                                context,
                                orderId: o.id,
                                businessId: o.businessId,
                                title: 'Order ${o.orderNumber}',
                              ),
                              icon: const Icon(Icons.forum_outlined, size: 16),
                              label: Text(app.t('live_chat')),
                            ),
                          ],
                        ),
                      ],
                    ),
                  ),
                );
              },
            ),
    );
  }

  Widget _buildBookingsTab(AppState app) {
    return RefreshIndicator(
      onRefresh: _refreshAll,
      child: app.myBookings.isEmpty
          ? ListView(
              children: const [
                SizedBox(height: 80),
                Center(
                    child: Text('No bookings yet.',
                        style: TextStyle(color: AppTheme.mutedInk))),
              ],
            )
          : ListView.builder(
              padding: const EdgeInsets.all(14),
              itemCount: app.myBookings.length,
              itemBuilder: (_, i) {
                final b = app.myBookings[i];
                final amount = b.quotedPrice ?? b.agreedPrice;
                final canPay = b.paymentStatus.toUpperCase() != 'PAID' &&
                    (b.paymentMethod == 'CHAPA' || b.paymentMethod == 'PAYO');
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
                            Text(b.bookingReference,
                                style: const TextStyle(
                                    fontWeight: FontWeight.w800)),
                            Text(b.bookingStatus,
                                style: const TextStyle(
                                    fontWeight: FontWeight.w800,
                                    fontSize: 12,
                                    color: AppTheme.primary)),
                          ],
                        ),
                        Text(
                            'Date: ${b.scheduledDate} ${b.scheduledTime} · ${AppConfig.formatEtb(amount)}',
                            style: const TextStyle(fontSize: 12.5)),
                        if (b.quotedPrice != null && !b.quoteApproved)
                          Padding(
                            padding: const EdgeInsets.only(top: 6),
                            child: ElevatedButton(
                              onPressed: () async {
                                await app.api.updateBookingStatus(b.id,
                                    quoteApproved: true);
                                await app.refreshWorkspace();
                              },
                              child: Text(
                                  'Approve Quote (${AppConfig.formatEtb(b.quotedPrice)})'),
                            ),
                          ),
                        const SizedBox(height: 8),
                        Wrap(
                          spacing: 8,
                          children: [
                            if (canPay)
                              ElevatedButton(
                                onPressed: () => PaymentGatewaySheet.show(
                                  context,
                                  gateway: b.paymentMethod,
                                  transactionType: 'BOOKING',
                                  referenceId: b.id,
                                  referenceCode: b.bookingReference,
                                  title: 'Pay ${b.bookingReference}',
                                  amountEtb: amount,
                                ),
                                child: Text(app.t('pay_now')),
                              ),
                            OutlinedButton(
                              onPressed: () => PaymentDetailsSheet.show(
                                context,
                                transactionType: 'BOOKING',
                                referenceId: b.id,
                                title: 'Payment · ${b.bookingReference}',
                              ),
                              child: Text(app.t('open_payment_details')),
                            ),
                            OutlinedButton(
                              onPressed: () => LiveChatSheet.show(
                                context,
                                bookingId: b.id,
                                businessId: b.businessId,
                                listingId: b.listingId,
                                title: 'Booking ${b.bookingReference}',
                              ),
                              child: Text(app.t('live_chat')),
                            ),
                          ],
                        ),
                      ],
                    ),
                  ),
                );
              },
            ),
    );
  }

  Widget _buildDeliveriesTab(AppState app) {
    return RefreshIndicator(
      onRefresh: _refreshAll,
      child: app.myDeliveries.isEmpty
          ? ListView(
              children: const [
                SizedBox(height: 80),
                Center(
                    child: Text('No deliveries or rides yet.',
                        style: TextStyle(color: AppTheme.mutedInk))),
              ],
            )
          : ListView.builder(
              padding: const EdgeInsets.all(14),
              itemCount: app.myDeliveries.length,
              itemBuilder: (_, i) {
                final d = app.myDeliveries[i];
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
                                    fontWeight: FontWeight.w800)),
                            Text(d.status,
                                style: const TextStyle(
                                    fontWeight: FontWeight.w800,
                                    fontSize: 12,
                                    color: AppTheme.primary)),
                          ],
                        ),
                        Text('${d.pickupLocation} → ${d.destinationLocation}',
                            style: const TextStyle(fontSize: 12)),
                        Text(
                            '${AppConfig.formatEtb(d.totalFee)} · Escrow: ${d.escrowStatus ?? 'N/A'}',
                            style: const TextStyle(
                                fontWeight: FontWeight.w700,
                                color: AppTheme.primary,
                                fontSize: 12.5)),
                        if (d.pickupOtp != null)
                          Text('Sender Pickup OTP: ${d.pickupOtp}',
                              style: const TextStyle(
                                  fontWeight: FontWeight.w800, fontSize: 12)),
                        if (d.deliveryOtp != null)
                          Text('Receiver Delivery OTP: ${d.deliveryOtp}',
                              style: const TextStyle(
                                  fontWeight: FontWeight.w800,
                                  fontSize: 12,
                                  color: AppTheme.primary)),
                        const SizedBox(height: 8),
                        Wrap(
                          spacing: 8,
                          children: [
                            OutlinedButton(
                              onPressed: () => PaymentDetailsSheet.show(
                                context,
                                transactionType: d.requestType,
                                referenceId: d.id,
                                title: 'Payment · ${d.trackingCode}',
                                preloadedSummary: d.paymentDetails,
                              ),
                              child: Text(app.t('open_payment_details')),
                            ),
                            OutlinedButton(
                              onPressed: () => app.navigateFromNotification(
                                  trackingCode: d.trackingCode, tab: 1),
                              child: const Text('Track on Map'),
                            ),
                          ],
                        ),
                      ],
                    ),
                  ),
                );
              },
            ),
    );
  }

  Widget _buildMessagesTab(AppState app) {
    return RefreshIndicator(
      onRefresh: _refreshAll,
      child: app.chatThreads.isEmpty
          ? ListView(
              children: const [
                SizedBox(height: 80),
                Center(
                    child: Text('No conversations yet.',
                        style: TextStyle(color: AppTheme.mutedInk))),
              ],
            )
          : ListView.builder(
              padding: const EdgeInsets.all(14),
              itemCount: app.chatThreads.length,
              itemBuilder: (_, i) {
                final th = app.chatThreads[i];
                return Card(
                  margin: const EdgeInsets.only(bottom: 10),
                  child: ListTile(
                    onTap: () => LiveChatSheet.show(
                      context,
                      threadKey: th.threadKey,
                      businessId: th.businessId,
                      listingId: th.listingId,
                      orderId: th.orderId,
                      bookingId: th.bookingId,
                      recipientUid: th.otherPartyUid,
                      title: th.otherPartyName ?? th.businessName,
                      subtitle: th.listingTitle ?? th.orderNumber,
                    ),
                    leading: CircleAvatar(
                      backgroundColor: AppTheme.primaryLight,
                      child: const Icon(Icons.forum_outlined,
                          color: AppTheme.primary),
                    ),
                    title: Row(
                      children: [
                        Expanded(
                          child: Text(
                            th.otherPartyName ?? th.businessName,
                            maxLines: 1,
                            overflow: TextOverflow.ellipsis,
                            style: const TextStyle(fontWeight: FontWeight.w800),
                          ),
                        ),
                        if (th.otherPartyActiveLastMinute)
                          Container(
                            width: 8,
                            height: 8,
                            decoration: const BoxDecoration(
                              color: Colors.green,
                              shape: BoxShape.circle,
                            ),
                          ),
                      ],
                    ),
                    subtitle: Text(
                      th.lastMessage.isVoice
                          ? 'Voice message (${th.lastMessage.audioDurationSeconds ?? 1}s)'
                          : th.lastMessage.body,
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis,
                    ),
                    trailing: Text('${th.messageCount}',
                        style: const TextStyle(
                            fontWeight: FontWeight.w700,
                            color: AppTheme.mutedInk)),
                  ),
                );
              },
            ),
    );
  }

  Widget _buildJobsAndSavedTab(AppState app) {
    final favListings =
        app.listings.where((l) => app.favoriteIds.contains(l.id)).toList();
    return RefreshIndicator(
      onRefresh: _refreshAll,
      child: ListView(
        padding: const EdgeInsets.all(14),
        children: [
          const Text('My Job Applications',
              style: TextStyle(fontWeight: FontWeight.w800, fontSize: 15)),
          const SizedBox(height: 6),
          if (app.myApplications.isEmpty)
            const Text('No job applications submitted.',
                style: TextStyle(fontSize: 12.5, color: AppTheme.mutedInk))
          else
            ...app.myApplications.map((a) => Card(
                  margin: const EdgeInsets.only(bottom: 8),
                  child: ListTile(
                    title: Text('Application #${a.id} · ${a.skills}',
                        style: const TextStyle(fontWeight: FontWeight.w700)),
                    subtitle: Text(
                        'Pay: ${AppConfig.formatEtb(a.expectedCompensation)} · ${a.applicationStatus}'),
                  ),
                )),
          const Divider(height: 24),
          Row(
            mainAxisAlignment: MainAxisAlignment.spaceBetween,
            children: [
              const Text('My Job Seeker Ads',
                  style: TextStyle(fontWeight: FontWeight.w800, fontSize: 15)),
              if (_loadingExtras)
                const SizedBox(
                    width: 14,
                    height: 14,
                    child: CircularProgressIndicator(strokeWidth: 2)),
            ],
          ),
          const SizedBox(height: 6),
          if (_myJobSeekerAds.isEmpty)
            const Text('No personal job seeker ads yet.',
                style: TextStyle(fontSize: 12.5, color: AppTheme.mutedInk))
          else
            ..._myJobSeekerAds.map((ad) => Card(
                  margin: const EdgeInsets.only(bottom: 8),
                  child: ListTile(
                    title: Text(ad.title,
                        style: const TextStyle(fontWeight: FontWeight.w700)),
                    subtitle: Text(AppConfig.formatEtb(ad.effectivePrice)),
                    trailing: IconButton(
                      icon: const Icon(Icons.delete_outline_rounded,
                          color: AppTheme.danger),
                      onPressed: () async {
                        await app.api.deleteJobSeekerAd(ad.id);
                        await _loadExtras();
                        await app.loadCatalog(silent: true);
                      },
                    ),
                  ),
                )),
          const Divider(height: 24),
          const Text('Saved Favorites',
              style: TextStyle(fontWeight: FontWeight.w800, fontSize: 15)),
          const SizedBox(height: 6),
          if (favListings.isEmpty)
            const Text('Tap the heart icon on listings to save them here.',
                style: TextStyle(fontSize: 12.5, color: AppTheme.mutedInk))
          else
            ...favListings.map((l) {
              final b = app.businessById(l.businessId);
              return Card(
                margin: const EdgeInsets.only(bottom: 8),
                child: ListTile(
                  onTap: b == null
                      ? null
                      : () => ListingDetailSheet.show(context,
                          listing: l, business: b),
                  title: Text(l.title,
                      style: const TextStyle(fontWeight: FontWeight.w700)),
                  subtitle: Text(AppConfig.formatEtb(l.effectivePrice)),
                  trailing: IconButton(
                    icon: const Icon(Icons.favorite_rounded,
                        color: AppTheme.danger),
                    onPressed: () => app.toggleFavorite(l.id),
                  ),
                ),
              );
            }),
        ],
      ),
    );
  }

  Widget _buildPaymentsTab(AppState app) {
    return RefreshIndicator(
      onRefresh: _refreshAll,
      child: _myPayments.isEmpty
          ? ListView(
              children: const [
                SizedBox(height: 80),
                Center(
                    child: Text('No payment transactions yet.',
                        style: TextStyle(color: AppTheme.mutedInk))),
              ],
            )
          : ListView.builder(
              padding: const EdgeInsets.all(14),
              itemCount: _myPayments.length,
              itemBuilder: (_, i) {
                final tx = _myPayments[i];
                return Card(
                  margin: const EdgeInsets.only(bottom: 10),
                  child: ListTile(
                    onTap: () => PaymentDetailsSheet.show(
                      context,
                      preloadedTx: tx,
                      title: 'Receipt · ${tx.referenceCode}',
                    ),
                    leading: Icon(
                      tx.isPaid
                          ? Icons.verified_rounded
                          : Icons.hourglass_bottom_rounded,
                      color: tx.isPaid ? AppTheme.primary : AppTheme.warning,
                    ),
                    title: Text('${tx.referenceCode} (${tx.gateway})',
                        style: const TextStyle(fontWeight: FontWeight.w700)),
                    subtitle: Text('${tx.txRef} · ${tx.status}'),
                    trailing: Text(
                      AppConfig.formatEtb(tx.grossAmount),
                      style: const TextStyle(
                          fontWeight: FontWeight.w800,
                          color: AppTheme.primary),
                    ),
                  ),
                );
              },
            ),
    );
  }
}
