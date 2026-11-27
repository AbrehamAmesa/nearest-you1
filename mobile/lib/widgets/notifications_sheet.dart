import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import '../core/models/models.dart';
import '../core/providers/app_state.dart';
import '../core/theme/app_theme.dart';
import 'live_chat_sheet.dart';
import 'payment_details_sheet.dart';

class NotificationsSheet extends StatelessWidget {
  const NotificationsSheet({super.key});

  static Future<void> show(BuildContext context) {
    return showModalBottomSheet(
      context: context,
      isScrollControlled: true,
      backgroundColor: Colors.white,
      shape: const RoundedRectangleBorder(
        borderRadius: BorderRadius.vertical(top: Radius.circular(22)),
      ),
      builder: (_) => const NotificationsSheet(),
    );
  }

  IconData _iconFor(String kind) {
    switch (kind) {
      case 'MESSAGE':
      case 'CHAT':
        return Icons.chat_bubble_outline_rounded;
      case 'PAYMENT':
        return Icons.receipt_long_rounded;
      case 'DELIVERY':
      case 'RIDE':
        return Icons.local_shipping_outlined;
      case 'ORDER':
        return Icons.shopping_bag_outlined;
      case 'BOOKING':
        return Icons.event_available_outlined;
      case 'APPLICATION':
        return Icons.work_outline_rounded;
      default:
        return Icons.notifications_none_rounded;
    }
  }

  void _openTarget(BuildContext context, PendingNotificationItem n) {
    final app = context.read<AppState>();
    Navigator.pop(context);

    if (n.threadKey != null && n.threadKey!.isNotEmpty) {
      LiveChatSheet.show(
        context,
        threadKey: n.threadKey,
        title: n.title,
        subtitle: n.subtitle,
      );
      return;
    }

    if ((n.txRef != null && n.txRef!.isNotEmpty) ||
        (n.transactionType != null && n.referenceId != null)) {
      PaymentDetailsSheet.show(
        context,
        txRef: n.txRef,
        transactionType: n.transactionType,
        referenceId: n.referenceId,
        title: n.title,
      );
      return;
    }

    if (n.trackingCode != null && n.trackingCode!.isNotEmpty) {
      app.navigateFromNotification(trackingCode: n.trackingCode, tab: 1);
      return;
    }

    app.setTabIndex(2);
  }

  @override
  Widget build(BuildContext context) {
    final app = context.watch<AppState>();
    final items = app.pendingNotifications;

    return DraggableScrollableSheet(
      initialChildSize: 0.65,
      minChildSize: 0.4,
      maxChildSize: 0.9,
      expand: false,
      builder: (_, scrollCtrl) => Padding(
        padding: const EdgeInsets.fromLTRB(16, 12, 16, 20),
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
                const Icon(Icons.notifications_active_outlined,
                    color: AppTheme.primary),
                const SizedBox(width: 8),
                Expanded(
                  child: Text(
                    'Notifications (${items.length})',
                    style: const TextStyle(
                        fontSize: 17, fontWeight: FontWeight.w800),
                  ),
                ),
                IconButton(
                  onPressed: () => app.refreshNotifications(),
                  icon: const Icon(Icons.refresh_rounded),
                ),
              ],
            ),
            const Divider(),
            Expanded(
              child: items.isEmpty
                  ? const Center(
                      child: Text(
                        'All caught up! Incoming messages, orders, deliveries & payments appear here.',
                        textAlign: TextAlign.center,
                        style: TextStyle(color: AppTheme.mutedInk),
                      ),
                    )
                  : ListView.separated(
                      controller: scrollCtrl,
                      itemCount: items.length,
                      separatorBuilder: (_, __) => const SizedBox(height: 8),
                      itemBuilder: (_, i) {
                        final n = items[i];
                        return Card(
                          child: ListTile(
                            onTap: () => _openTarget(context, n),
                            leading: CircleAvatar(
                              backgroundColor: AppTheme.primaryLight,
                              child: Icon(_iconFor(n.kind),
                                  color: AppTheme.primary),
                            ),
                            title: Text(
                              n.title,
                              style: const TextStyle(
                                  fontWeight: FontWeight.w700, fontSize: 13.5),
                            ),
                            subtitle: Text(
                              n.subtitle,
                              maxLines: 2,
                              overflow: TextOverflow.ellipsis,
                              style: const TextStyle(fontSize: 12),
                            ),
                            trailing: const Icon(Icons.chevron_right_rounded),
                          ),
                        );
                      },
                    ),
            ),
          ],
        ),
      ),
    );
  }
}
