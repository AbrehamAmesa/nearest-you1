import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import '../core/config/app_config.dart';
import '../core/providers/app_state.dart';
import '../core/theme/app_theme.dart';

class AuthSheet extends StatefulWidget {
  final bool initialSignUp;

  const AuthSheet({super.key, this.initialSignUp = false});

  static Future<bool?> show(BuildContext context, {bool signUp = false}) {
    return showModalBottomSheet<bool>(
      context: context,
      isScrollControlled: true,
      backgroundColor: Colors.white,
      shape: const RoundedRectangleBorder(
        borderRadius: BorderRadius.vertical(top: Radius.circular(22)),
      ),
      builder: (_) => AuthSheet(initialSignUp: signUp),
    );
  }

  @override
  State<AuthSheet> createState() => _AuthSheetState();
}

class _AuthSheetState extends State<AuthSheet> {
  late bool _isSignUp;
  final _nameCtrl = TextEditingController();
  final _emailCtrl = TextEditingController();
  final _phoneCtrl = TextEditingController();
  final _passCtrl = TextEditingController();
  String _subCity = 'Bole';
  bool _obscure = true;
  String? _error;

  @override
  void initState() {
    super.initState();
    _isSignUp = widget.initialSignUp;
  }

  @override
  void dispose() {
    _nameCtrl.dispose();
    _emailCtrl.dispose();
    _phoneCtrl.dispose();
    _passCtrl.dispose();
    super.dispose();
  }

  Future<void> _submit() async {
    final app = context.read<AppState>();
    final email = _emailCtrl.text.trim();
    final pass = _passCtrl.text;
    if (email.isEmpty || pass.length < 6) {
      setState(
          () => _error = 'Enter a valid email and password (min 6 chars).');
      return;
    }
    if (_isSignUp && _nameCtrl.text.trim().isEmpty) {
      setState(() => _error = 'Please enter your full name.');
      return;
    }

    setState(() => _error = null);
    try {
      if (_isSignUp) {
        await app.signUpWithEmail(
          fullName: _nameCtrl.text.trim(),
          email: email,
          password: pass,
          phoneNumber: _phoneCtrl.text.trim(),
          defaultSubCity: _subCity,
        );
      } else {
        await app.signInWithEmail(email, pass);
      }
      if (mounted) Navigator.pop(context, true);
    } catch (e) {
      if (mounted) setState(() => _error = e.toString());
    }
  }

  Future<void> _editServerUrl() async {
    final app = context.read<AppState>();
    final ctrl = TextEditingController(text: app.api.baseUrl);
    final saved = await showDialog<String>(
      context: context,
      builder: (ctx) => AlertDialog(
        title: const Text('Backend Server URL'),
        content: TextField(
          controller: ctrl,
          decoration: const InputDecoration(
            labelText: 'Spring Boot API URL',
            hintText: 'https://your-backend.onrender.com',
          ),
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(ctx),
            child: const Text('Cancel'),
          ),
          ElevatedButton(
            onPressed: () => Navigator.pop(ctx, ctrl.text.trim()),
            child: const Text('Save'),
          ),
        ],
      ),
    );
    if (saved != null && saved.isNotEmpty) {
      await app.updateServerUrl(saved);
    }
  }

  @override
  Widget build(BuildContext context) {
    final app = context.watch<AppState>();
    return Padding(
      padding: EdgeInsets.fromLTRB(
        20,
        14,
        20,
        MediaQuery.of(context).viewInsets.bottom + 24,
      ),
      child: SingleChildScrollView(
        child: Column(
          mainAxisSize: MainAxisSize.min,
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
            const SizedBox(height: 14),
            Row(
              children: [
                Expanded(
                  child: Text(
                    _isSignUp ? 'Create Account' : 'Sign In to Nearest You',
                    style: const TextStyle(
                      fontSize: 20,
                      fontWeight: FontWeight.w800,
                      color: AppTheme.ink,
                    ),
                  ),
                ),
                TextButton(
                  onPressed: _editServerUrl,
                  child: const Text('Server URL', style: TextStyle(fontSize: 12)),
                ),
              ],
            ),
            const SizedBox(height: 6),
            SegmentedButton<bool>(
              segments: const [
                ButtonSegment(value: false, label: Text('Sign In')),
                ButtonSegment(value: true, label: Text('Sign Up')),
              ],
              selected: {_isSignUp},
              onSelectionChanged: (s) => setState(() {
                _isSignUp = s.first;
                _error = null;
              }),
            ),
            const SizedBox(height: 14),
            if (_error != null) ...[
              Container(
                width: double.infinity,
                padding: const EdgeInsets.all(10),
                decoration: BoxDecoration(
                  color: const Color(0xFFFFEBEE),
                  borderRadius: BorderRadius.circular(10),
                ),
                child: Text(_error!,
                    style:
                        const TextStyle(color: AppTheme.danger, fontSize: 12.5)),
              ),
              const SizedBox(height: 12),
            ],
            if (_isSignUp) ...[
              TextField(
                controller: _nameCtrl,
                decoration: const InputDecoration(
                  labelText: 'Full Name',
                  prefixIcon: Icon(Icons.person_outline_rounded),
                ),
              ),
              const SizedBox(height: 10),
            ],
            TextField(
              controller: _emailCtrl,
              keyboardType: TextInputType.emailAddress,
              decoration: const InputDecoration(
                labelText: 'Email Address',
                prefixIcon: Icon(Icons.email_outlined),
              ),
            ),
            const SizedBox(height: 10),
            if (_isSignUp) ...[
              TextField(
                controller: _phoneCtrl,
                keyboardType: TextInputType.phone,
                decoration: const InputDecoration(
                  labelText: 'Phone Number (e.g. +2519...)',
                  prefixIcon: Icon(Icons.phone_outlined),
                ),
              ),
              const SizedBox(height: 10),
              DropdownButtonFormField<String>(
                value: _subCity,
                decoration: const InputDecoration(
                  labelText: 'Default Addis Ababa Sub-City',
                  prefixIcon: Icon(Icons.location_city_outlined),
                ),
                items: AppConfig.addisSubCities
                    .map((s) => DropdownMenuItem(value: s, child: Text(s)))
                    .toList(),
                onChanged: (v) => setState(() => _subCity = v ?? 'Bole'),
              ),
              const SizedBox(height: 10),
            ],
            TextField(
              controller: _passCtrl,
              obscureText: _obscure,
              onSubmitted: (_) => _submit(),
              decoration: InputDecoration(
                labelText: 'Password',
                prefixIcon: const Icon(Icons.lock_outline_rounded),
                suffixIcon: IconButton(
                  onPressed: () => setState(() => _obscure = !_obscure),
                  icon: Icon(_obscure
                      ? Icons.visibility_outlined
                      : Icons.visibility_off_outlined),
                ),
              ),
            ),
            const SizedBox(height: 18),
            SizedBox(
              width: double.infinity,
              child: ElevatedButton(
                onPressed: app.authLoading ? null : _submit,
                child: Text(
                  app.authLoading
                      ? 'Please wait...'
                      : (_isSignUp ? 'Create Account' : 'Sign In'),
                ),
              ),
            ),
          ],
        ),
      ),
    );
  }
}
