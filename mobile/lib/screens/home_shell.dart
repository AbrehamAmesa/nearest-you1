import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import '../core/i18n/app_translations.dart';
import '../core/providers/app_state.dart';
import '../core/theme/app_theme.dart';
import '../widgets/notifications_sheet.dart';
import 'account_sheet.dart';
import 'activity_screen.dart';
import 'auth_sheet.dart';
import 'business_screen.dart';
import 'cart_sheet.dart';
import 'delivery_screen.dart';
import 'discover_screen.dart';

class HomeShell extends StatelessWidget {
  const HomeShell({super.key});

  @override
  Widget build(BuildContext context) {
    final app = context.watch<AppState>();
    final screens = const [
      DiscoverScreen(),
      DeliveryScreen(),
      ActivityScreen(),
      BusinessScreen(),
    ];

    return Scaffold(
      appBar: AppBar(
        titleSpacing: 12,
        title: Row(
          children: [
            Container(
              width: 34,
              height: 34,
              decoration: BoxDecoration(
                color: AppTheme.primary,
                borderRadius: BorderRadius.circular(10),
              ),
              child: const Icon(Icons.near_me_rounded,
                  color: Colors.white, size: 19),
            ),
            const SizedBox(width: 9),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  const Text(
                    'Nearest You',
                    style: TextStyle(
                        fontSize: 16,
                        fontWeight: FontWeight.w800,
                        color: AppTheme.ink),
                  ),
                  Text(
                    app.detectingGps
                        ? app.t('detecting_gps')
                        : (app.detectedLocation?.label ?? 'Addis Ababa'),
                    maxLines: 1,
                    overflow: TextOverflow.ellipsis,
                    style: const TextStyle(
                      fontSize: 11,
                      fontWeight: FontWeight.w500,
                      color: AppTheme.mutedInk,
                    ),
                  ),
                ],
              ),
            ),
          ],
        ),
        actions: [
          // Always-visible Cart button in top AppBar
          IconButton(
            tooltip: app.t('cart'),
            onPressed: () => CartSheet.show(context),
            icon: Badge(
              isLabelVisible: app.cartCount > 0,
              label: Text('${app.cartCount}'),
              backgroundColor: AppTheme.primary,
              child: const Icon(Icons.shopping_cart_outlined),
            ),
          ),
          if (app.currentUser != null)
            IconButton(
              tooltip: app.t('notifications'),
              onPressed: () => NotificationsSheet.show(context),
              icon: Badge(
                isLabelVisible: app.pendingNotifications.isNotEmpty,
                label: Text('${app.pendingNotifications.length}'),
                backgroundColor: AppTheme.danger,
                child: const Icon(Icons.notifications_outlined),
              ),
            ),
          PopupMenuButton<AppLanguage>(
            tooltip: 'Language',
            icon: const Icon(Icons.translate_rounded, size: 21),
            onSelected: app.setLanguage,
            itemBuilder: (_) => AppLanguage.values
                .map(
                  (lang) => PopupMenuItem(
                    value: lang,
                    child: Row(
                      children: [
                        if (app.language == lang)
                          const Icon(Icons.check_rounded,
                              size: 16, color: AppTheme.primary)
                        else
                          const SizedBox(width: 16),
                        const SizedBox(width: 8),
                        Text(AppTranslations.languageLabels[lang]!),
                      ],
                    ),
                  ),
                )
                .toList(),
          ),
          Padding(
            padding: const EdgeInsets.only(right: 8),
            child: app.currentUser == null
                ? TextButton(
                    onPressed: () => AuthSheet.show(context),
                    child: Text(app.t('sign_in'),
                        style: const TextStyle(fontWeight: FontWeight.w700)),
                  )
                : IconButton(
                    tooltip: app.t('profile'),
                    onPressed: () => AccountSheet.show(context),
                    icon: CircleAvatar(
                      radius: 15,
                      backgroundColor: AppTheme.primaryLight,
                      child: Text(
                        app.currentUser!.fullName.isNotEmpty
                            ? app.currentUser!.fullName[0].toUpperCase()
                            : 'U',
                        style: const TextStyle(
                            fontSize: 13,
                            fontWeight: FontWeight.w800,
                            color: AppTheme.primary),
                      ),
                    ),
                  ),
          ),
        ],
      ),
      body: Stack(
        children: [
          IndexedStack(
            index: app.activeTabIndex,
            children: screens,
          ),
          if (app.cartCount > 0)
            Positioned(
              left: 14,
              right: 14,
              bottom: 10,
              child: Material(
                elevation: 6,
                borderRadius: BorderRadius.circular(14),
                color: AppTheme.ink,
                child: InkWell(
                  borderRadius: BorderRadius.circular(14),
                  onTap: () => CartSheet.show(context),
                  child: Padding(
                    padding: const EdgeInsets.symmetric(
                        horizontal: 16, vertical: 12),
                    child: Row(
                      children: [
                        const Icon(Icons.shopping_bag_rounded,
                            color: Colors.white),
                        const SizedBox(width: 10),
                        Expanded(
                          child: Text(
                            '${app.cartCount} item(s) in Cart · Tap to Review & Checkout',
                            style: const TextStyle(
                              color: Colors.white,
                              fontWeight: FontWeight.w700,
                              fontSize: 13,
                            ),
                          ),
                        ),
                        const Icon(Icons.arrow_forward_rounded,
                            color: Colors.white),
                      ],
                    ),
                  ),
                ),
              ),
            ),
        ],
      ),
      bottomNavigationBar: NavigationBar(
        selectedIndex: app.activeTabIndex,
        onDestinationSelected: app.setTabIndex,
        destinations: [
          NavigationDestination(
            icon: const Icon(Icons.explore_outlined),
            selectedIcon: const Icon(Icons.explore_rounded),
            label: app.t('nav_discover'),
          ),
          NavigationDestination(
            icon: const Icon(Icons.local_shipping_outlined),
            selectedIcon: const Icon(Icons.local_shipping_rounded),
            label: app.t('nav_delivery'),
          ),
          NavigationDestination(
            icon: const Icon(Icons.receipt_long_outlined),
            selectedIcon: const Icon(Icons.receipt_long_rounded),
            label: app.t('nav_activity'),
          ),
          NavigationDestination(
            icon: const Icon(Icons.storefront_outlined),
            selectedIcon: const Icon(Icons.storefront_rounded),
            label: app.t('nav_business'),
          ),
        ],
      ),
    );
  }
}
