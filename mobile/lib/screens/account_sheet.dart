import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import '../core/config/app_config.dart';
import '../core/models/models.dart';
import '../core/providers/app_state.dart';
import '../core/theme/app_theme.dart';

class AccountSheet extends StatefulWidget {
  const AccountSheet({super.key});

  static Future<void> show(BuildContext context) {
    return showModalBottomSheet(
      context: context,
      isScrollControlled: true,
      backgroundColor: Colors.white,
      shape: const RoundedRectangleBorder(
        borderRadius: BorderRadius.vertical(top: Radius.circular(22)),
      ),
      builder: (_) => const AccountSheet(),
    );
  }

  @override
  State<AccountSheet> createState() => _AccountSheetState();
}

class _AccountSheetState extends State<AccountSheet> {
  final _nameCtrl = TextEditingController();
  final _phoneCtrl = TextEditingController();
  final _serverUrlCtrl = TextEditingController();
  final _currentPassCtrl = TextEditingController();
  final _newPassCtrl = TextEditingController();

  // Personal payout
  final _accountNumberCtrl = TextEditingController();
  final _accountNameCtrl = TextEditingController();
  final _telebirrCtrl = TextEditingController();
  final _payoHandleCtrl = TextEditingController();
  String _subCity = 'Bole';
  String? _bankCode;
  String _preferredGateway = 'BOTH';
  List<BankDirectoryItem> _banks = [];
  bool _saving = false;
  String? _msg;

  @override
  void initState() {
    super.initState();
    final app = context.read<AppState>();
    final u = app.currentUser;
    _serverUrlCtrl.text = app.api.baseUrl;
    if (u != null) {
      _nameCtrl.text = u.fullName;
      _phoneCtrl.text = u.phoneNumber ?? '';
      _subCity = AppConfig.addisSubCities.contains(u.defaultSubCity)
          ? u.defaultSubCity
          : 'Bole';
      _bankCode = u.payoutBankCode;
      _accountNumberCtrl.text = u.payoutAccountNumber ?? '';
      _accountNameCtrl.text = u.payoutAccountName ?? u.fullName;
      _telebirrCtrl.text = u.payoutTelebirrNumber ?? (u.phoneNumber ?? '');
      _payoHandleCtrl.text = u.payoAccountHandle ?? '';
      _preferredGateway = u.preferredPayoutGateway ?? 'BOTH';
    }
    _loadBanks();
  }

  Future<void> _loadBanks() async {
    try {
      final banks = await context.read<AppState>().api.getBanks();
      if (mounted) setState(() => _banks = banks);
    } catch (_) {}
  }

  @override
  void dispose() {
    _nameCtrl.dispose();
    _phoneCtrl.dispose();
    _serverUrlCtrl.dispose();
    _currentPassCtrl.dispose();
    _newPassCtrl.dispose();
    _accountNumberCtrl.dispose();
    _accountNameCtrl.dispose();
    _telebirrCtrl.dispose();
    _payoHandleCtrl.dispose();
    super.dispose();
  }

  Future<void> _saveProfile() async {
    final app = context.read<AppState>();
    setState(() {
      _saving = true;
      _msg = null;
    });
    try {
      await app.api.updateProfile({
        'fullName': _nameCtrl.text.trim(),
        'phoneNumber': _phoneCtrl.text.trim(),
        'defaultSubCity': _subCity,
        'preferredLanguage': app.language.name,
        if (app.gpsLat != null) 'defaultLat': app.gpsLat,
        if (app.gpsLng != null) 'defaultLng': app.gpsLng,
      });
      await app.refreshUserSession();
      if (mounted) setState(() => _msg = 'Profile updated successfully.');
    } catch (e) {
      if (mounted) setState(() => _msg = e.toString());
    } finally {
      if (mounted) setState(() => _saving = false);
    }
  }

  Future<void> _savePayout() async {
    final app = context.read<AppState>();
    setState(() {
      _saving = true;
      _msg = null;
    });
    try {
      String? bankName;
      for (final b in _banks) {
        if (b.code == _bankCode) {
          bankName = b.name;
          break;
        }
      }
      await app.api.updatePersonalPayoutAccount({
        if (_bankCode != null) 'bankCode': _bankCode,
        if (bankName != null) 'bankName': bankName,
        'accountNumber': _accountNumberCtrl.text.trim(),
        'accountName': _accountNameCtrl.text.trim(),
        'telebirrNumber': _telebirrCtrl.text.trim(),
        'payoAccountHandle': _payoHandleCtrl.text.trim(),
        'preferredPayoutGateway': _preferredGateway,
      });
      await app.refreshUserSession();
      if (mounted) setState(() => _msg = 'Personal payout account saved.');
    } catch (e) {
      if (mounted) setState(() => _msg = e.toString());
    } finally {
      if (mounted) setState(() => _saving = false);
    }
  }

  Future<void> _changePassword() async {
    if (_newPassCtrl.text.length < 6) {
      setState(() => _msg = 'New password must be at least 6 characters.');
      return;
    }
    final app = context.read<AppState>();
    setState(() {
      _saving = true;
      _msg = null;
    });
    try {
      await app.api.changePassword(
        currentPassword: _currentPassCtrl.text,
        newPassword: _newPassCtrl.text,
      );
      _currentPassCtrl.clear();
      _newPassCtrl.clear();
      if (mounted) setState(() => _msg = 'Password updated successfully.');
    } catch (e) {
      if (mounted) setState(() => _msg = e.toString());
    } finally {
      if (mounted) setState(() => _saving = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final app = context.watch<AppState>();
    final u = app.currentUser;
    return DraggableScrollableSheet(
      initialChildSize: 0.85,
      minChildSize: 0.5,
      maxChildSize: 0.95,
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
            Row(
              children: [
                CircleAvatar(
                  backgroundColor: AppTheme.primaryLight,
                  child: Text(
                    (u?.fullName.isNotEmpty == true ? u!.fullName[0] : 'U')
                        .toUpperCase(),
                    style: const TextStyle(
                        fontWeight: FontWeight.w800, color: AppTheme.primary),
                  ),
                ),
                const SizedBox(width: 12),
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(
                        u?.fullName ?? 'Guest Mode',
                        style: const TextStyle(
                            fontSize: 17, fontWeight: FontWeight.w800),
                      ),
                      Text(
                        u?.email ?? 'Sign in to sync orders & payouts',
                        style: const TextStyle(
                            fontSize: 12.5, color: AppTheme.mutedInk),
                      ),
                    ],
                  ),
                ),
                if (u != null)
                  TextButton.icon(
                    onPressed: () async {
                      await app.signOut();
                      if (context.mounted) Navigator.pop(context);
                    },
                    icon: const Icon(Icons.logout_rounded,
                        color: AppTheme.danger, size: 18),
                    label: const Text('Sign Out',
                        style: TextStyle(color: AppTheme.danger)),
                  ),
              ],
            ),
            if (_msg != null) ...[
              const SizedBox(height: 10),
              Container(
                padding: const EdgeInsets.all(10),
                decoration: BoxDecoration(
                  color: AppTheme.primaryLight,
                  borderRadius: BorderRadius.circular(10),
                ),
                child: Text(_msg!,
                    style: const TextStyle(
                        color: AppTheme.primaryDark,
                        fontWeight: FontWeight.w600,
                        fontSize: 12.5)),
              ),
            ],
            const SizedBox(height: 16),
            const Text('Server Connection',
                style: TextStyle(fontWeight: FontWeight.w800, fontSize: 14)),
            const SizedBox(height: 8),
            Row(
              children: [
                Expanded(
                  child: TextField(
                    controller: _serverUrlCtrl,
                    decoration: const InputDecoration(
                      labelText: 'Backend API Base URL',
                      isDense: true,
                    ),
                  ),
                ),
                const SizedBox(width: 8),
                ElevatedButton(
                  onPressed: () async {
                    await app.updateServerUrl(_serverUrlCtrl.text.trim());
                    if (mounted) {
                      setState(() => _msg = 'Connected server URL updated.');
                    }
                  },
                  child: const Text('Apply'),
                ),
              ],
            ),
            if (u != null) ...[
              const Divider(height: 28),
              const Text('Profile Details',
                  style: TextStyle(fontWeight: FontWeight.w800, fontSize: 14)),
              const SizedBox(height: 10),
              TextField(
                controller: _nameCtrl,
                decoration: const InputDecoration(labelText: 'Full Name'),
              ),
              const SizedBox(height: 10),
              TextField(
                controller: _phoneCtrl,
                decoration: const InputDecoration(labelText: 'Phone Number'),
              ),
              const SizedBox(height: 10),
              DropdownButtonFormField<String>(
                initialValue: _subCity,
                decoration: const InputDecoration(labelText: 'Default Sub-City'),
                items: AppConfig.addisSubCities
                    .map((s) => DropdownMenuItem(value: s, child: Text(s)))
                    .toList(),
                onChanged: (v) => setState(() => _subCity = v ?? 'Bole'),
              ),
              const SizedBox(height: 10),
              ElevatedButton(
                onPressed: _saving ? null : _saveProfile,
                child: const Text('Save Profile'),
              ),
              const Divider(height: 28),
              const Text('Personal / Driver Payout Account',
                  style: TextStyle(fontWeight: FontWeight.w800, fontSize: 14)),
              const SizedBox(height: 10),
              if (_banks.isNotEmpty)
                DropdownButtonFormField<String>(
                  initialValue: _banks.any((b) => b.code == _bankCode)
                      ? _bankCode
                      : null,
                  decoration: const InputDecoration(labelText: 'Ethiopian Bank'),
                  items: _banks
                      .map((b) => DropdownMenuItem(
                            value: b.code,
                            child: Text(b.name),
                          ))
                      .toList(),
                  onChanged: (v) => setState(() => _bankCode = v),
                ),
              const SizedBox(height: 10),
              TextField(
                controller: _accountNumberCtrl,
                decoration: const InputDecoration(labelText: 'Bank Account Number'),
              ),
              const SizedBox(height: 10),
              TextField(
                controller: _accountNameCtrl,
                decoration: const InputDecoration(labelText: 'Account Holder Name'),
              ),
              const SizedBox(height: 10),
              TextField(
                controller: _telebirrCtrl,
                decoration: const InputDecoration(labelText: 'Telebirr Number'),
              ),
              const SizedBox(height: 10),
              TextField(
                controller: _payoHandleCtrl,
                decoration: const InputDecoration(labelText: 'Payo Account Handle'),
              ),
              const SizedBox(height: 10),
              DropdownButtonFormField<String>(
                initialValue: _preferredGateway,
                decoration:
                    const InputDecoration(labelText: 'Preferred Payout Gateway'),
                items: const [
                  DropdownMenuItem(value: 'BOTH', child: Text('Chapa + Payo')),
                  DropdownMenuItem(value: 'CHAPA', child: Text('Chapa Only')),
                  DropdownMenuItem(value: 'PAYO', child: Text('Payo Only')),
                ],
                onChanged: (v) =>
                    setState(() => _preferredGateway = v ?? 'BOTH'),
              ),
              const SizedBox(height: 10),
              ElevatedButton(
                onPressed: _saving ? null : _savePayout,
                child: const Text('Save Payout Account'),
              ),
              const Divider(height: 28),
              const Text('Change Password',
                  style: TextStyle(fontWeight: FontWeight.w800, fontSize: 14)),
              const SizedBox(height: 10),
              TextField(
                controller: _currentPassCtrl,
                obscureText: true,
                decoration: const InputDecoration(labelText: 'Current Password'),
              ),
              const SizedBox(height: 10),
              TextField(
                controller: _newPassCtrl,
                obscureText: true,
                decoration: const InputDecoration(labelText: 'New Password'),
              ),
              const SizedBox(height: 10),
              OutlinedButton(
                onPressed: _saving ? null : _changePassword,
                child: const Text('Update Password'),
              ),
            ],
          ],
        ),
      ),
    );
  }
}
