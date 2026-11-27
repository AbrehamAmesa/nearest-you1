import 'dart:convert';
import 'package:flutter/material.dart';
import 'package:image_picker/image_picker.dart';
import 'package:provider/provider.dart';
import 'package:url_launcher/url_launcher.dart';
import 'package:webview_flutter/webview_flutter.dart';
import '../core/config/app_config.dart';
import '../core/models/models.dart';
import '../core/providers/app_state.dart';
import '../core/theme/app_theme.dart';
import 'payment_details_sheet.dart';
import 'smart_image.dart';

class PaymentGatewaySheet extends StatefulWidget {
  final String gateway; // CHAPA or PAYO
  final String transactionType; // ORDER | BOOKING | DELIVERY | RIDE
  final int referenceId;
  final String referenceCode;
  final String title;
  final double amountEtb;

  const PaymentGatewaySheet({
    super.key,
    required this.gateway,
    required this.transactionType,
    required this.referenceId,
    required this.referenceCode,
    required this.title,
    required this.amountEtb,
  });

  static Future<PaymentTransactionRecord?> show(
    BuildContext context, {
    required String gateway,
    required String transactionType,
    required int referenceId,
    required String referenceCode,
    required String title,
    required double amountEtb,
  }) {
    return showModalBottomSheet<PaymentTransactionRecord?>(
      context: context,
      isScrollControlled: true,
      backgroundColor: Colors.white,
      shape: const RoundedRectangleBorder(
        borderRadius: BorderRadius.vertical(top: Radius.circular(22)),
      ),
      builder: (_) => PaymentGatewaySheet(
        gateway: gateway,
        transactionType: transactionType,
        referenceId: referenceId,
        referenceCode: referenceCode,
        title: title,
        amountEtb: amountEtb,
      ),
    );
  }

  @override
  State<PaymentGatewaySheet> createState() => _PaymentGatewaySheetState();
}

class _PaymentGatewaySheetState extends State<PaymentGatewaySheet> {
  late String _selectedGateway;
  bool _initializing = false;
  bool _verifying = false;
  String? _error;
  PaymentTransactionRecord? _tx;
  bool _showWebView = false;
  WebViewController? _webCtrl;

  // Payo form fields
  final _receiptRefCtrl = TextEditingController();
  final _notesCtrl = TextEditingController();
  String? _receiptDataUrl;
  bool _providerConfirmed = true;
  bool _settlementConfirmed = true;

  @override
  void initState() {
    super.initState();
    _selectedGateway = widget.gateway.toUpperCase() == 'PAYO' ? 'PAYO' : 'CHAPA';
    _initializeTx();
  }

  @override
  void dispose() {
    _receiptRefCtrl.dispose();
    _notesCtrl.dispose();
    super.dispose();
  }

  Future<void> _initializeTx() async {
    final app = context.read<AppState>();
    setState(() {
      _initializing = true;
      _error = null;
      _showWebView = false;
    });
    try {
      final tx = await app.api.initializePayment(
        gateway: _selectedGateway,
        transactionType: widget.transactionType,
        referenceId: widget.referenceId,
        returnUrl: AppConfig.publicAppBaseUrl,
        customerEmail: app.currentUser?.email,
        phoneNumber: app.currentUser?.phoneNumber,
      );
      if (!mounted) return;
      setState(() {
        _tx = tx;
        _initializing = false;
      });
      if (_selectedGateway == 'CHAPA' &&
          tx.gatewayCheckoutUrl != null &&
          tx.gatewayCheckoutUrl!.isNotEmpty) {
        _setupWebView(tx.gatewayCheckoutUrl!);
      }
    } catch (e) {
      if (!mounted) return;
      setState(() {
        _error = e.toString();
        _initializing = false;
      });
    }
  }

  void _setupWebView(String url) {
    final ctrl = WebViewController()
      ..setJavaScriptMode(JavaScriptMode.unrestricted)
      ..setNavigationDelegate(
        NavigationDelegate(
          onNavigationRequest: (req) {
            final isReturnRedirect = req.url.contains('paymentTxRef=') ||
                req.url.startsWith(AppConfig.publicAppBaseUrl);
            if (isReturnRedirect ||
                req.url.contains('chapa/callback') ||
                req.url.contains('status=success')) {
              if (!_verifying && _tx != null && !_tx!.isPaid) {
                _verifyChapa();
              }
              if (isReturnRedirect) {
                return NavigationDecision.prevent;
              }
            }
            return NavigationDecision.navigate;
          },
        ),
      )
      ..loadRequest(Uri.parse(url));
    _webCtrl = ctrl;
  }

  Future<void> _verifyChapa() async {
    final tx = _tx;
    if (tx == null) return;
    final app = context.read<AppState>();
    setState(() {
      _verifying = true;
      _error = null;
    });
    try {
      final verified = await app.api.verifyPayment(tx.txRef);
      if (!mounted) return;
      setState(() {
        _tx = verified;
        _showWebView = false;
        _verifying = false;
      });
      await app.refreshWorkspace();
    } catch (e) {
      if (!mounted) return;
      setState(() {
        _error = e.toString();
        _verifying = false;
      });
    }
  }

  Future<void> _pickReceiptImage() async {
    final picker = ImagePicker();
    final file = await picker.pickImage(
      source: ImageSource.gallery,
      maxWidth: 1200,
      imageQuality: 78,
    );
    if (file == null) return;
    final bytes = await file.readAsBytes();
    setState(() {
      _receiptDataUrl = 'data:image/jpeg;base64,${base64Encode(bytes)}';
    });
  }

  Future<void> _confirmPayo() async {
    final tx = _tx;
    if (tx == null) return;
    if (_receiptRefCtrl.text.trim().isEmpty) {
      setState(() => _error = 'Please enter your Payo / transfer reference code.');
      return;
    }
    final app = context.read<AppState>();
    setState(() {
      _verifying = true;
      _error = null;
    });
    try {
      final updated = await app.api.confirmPayoPayment(
        tx.txRef,
        receiptReference: _receiptRefCtrl.text.trim(),
        receiptImageUrl: _receiptDataUrl,
        providerTransferConfirmed: _providerConfirmed,
        commissionTransferConfirmed: _settlementConfirmed,
        notes: _notesCtrl.text.trim(),
      );
      if (!mounted) return;
      setState(() {
        _tx = updated;
        _verifying = false;
      });
      await app.refreshWorkspace();
    } catch (e) {
      if (!mounted) return;
      setState(() {
        _error = e.toString();
        _verifying = false;
      });
    }
  }

  @override
  Widget build(BuildContext context) {
    final tx = _tx;
    return DraggableScrollableSheet(
      initialChildSize: _showWebView ? 0.92 : 0.80,
      minChildSize: 0.5,
      maxChildSize: 0.95,
      expand: false,
      builder: (_, scrollCtrl) => Padding(
        padding: EdgeInsets.fromLTRB(
            18, 12, 18, MediaQuery.of(context).viewInsets.bottom + 20),
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
            Row(
              children: [
                const Icon(Icons.lock_outline_rounded, color: AppTheme.primary),
                const SizedBox(width: 10),
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(
                        widget.title,
                        style: const TextStyle(
                            fontSize: 16, fontWeight: FontWeight.w800),
                      ),
                      Text(
                        '${widget.referenceCode} · ${AppConfig.formatEtb(widget.amountEtb)}',
                        style: const TextStyle(
                            fontSize: 12.5,
                            fontWeight: FontWeight.w700,
                            color: AppTheme.primary),
                      ),
                    ],
                  ),
                ),
                IconButton(
                  onPressed: () => Navigator.pop(context, _tx),
                  icon: const Icon(Icons.close_rounded),
                ),
              ],
            ),
            const SizedBox(height: 10),
            SegmentedButton<String>(
              segments: const [
                ButtonSegment(
                  value: 'CHAPA',
                  label: Text('Chapa Checkout'),
                  icon: Icon(Icons.credit_card_rounded, size: 18),
                ),
                ButtonSegment(
                  value: 'PAYO',
                  label: Text('Payo / Transfer'),
                  icon: Icon(Icons.account_balance_wallet_rounded, size: 18),
                ),
              ],
              selected: {_selectedGateway},
              onSelectionChanged: (s) {
                final next = s.first;
                if (next != _selectedGateway) {
                  setState(() => _selectedGateway = next);
                  _initializeTx();
                }
              },
            ),
            if (_error != null) ...[
              const SizedBox(height: 10),
              Container(
                padding: const EdgeInsets.all(10),
                decoration: BoxDecoration(
                  color: const Color(0xFFFFEBEE),
                  borderRadius: BorderRadius.circular(10),
                ),
                child: Text(_error!,
                    style:
                        const TextStyle(color: AppTheme.danger, fontSize: 12.5)),
              ),
            ],
            const SizedBox(height: 10),
            Expanded(
              child: _initializing
                  ? const Center(child: CircularProgressIndicator())
                  : _showWebView && _webCtrl != null
                      ? Column(
                          children: [
                            Expanded(
                              child: ClipRRect(
                                borderRadius: BorderRadius.circular(12),
                                child: WebViewWidget(controller: _webCtrl!),
                              ),
                            ),
                            const SizedBox(height: 10),
                            Row(
                              children: [
                                Expanded(
                                  child: OutlinedButton(
                                    onPressed: () =>
                                        setState(() => _showWebView = false),
                                    child: const Text('Back'),
                                  ),
                                ),
                                const SizedBox(width: 10),
                                Expanded(
                                  child: ElevatedButton.icon(
                                    onPressed: _verifying ? null : _verifyChapa,
                                    icon: const Icon(Icons.verified_rounded),
                                    label: Text(_verifying
                                        ? 'Verifying...'
                                        : 'Verify Payment'),
                                  ),
                                ),
                              ],
                            ),
                          ],
                        )
                      : ListView(
                          controller: scrollCtrl,
                          children: [
                            if (tx != null && tx.isPaid) _buildPaidBanner(tx),
                            if (tx != null && !tx.isPaid) ...[
                              if (_selectedGateway == 'CHAPA')
                                _buildChapaBody(tx)
                              else
                                _buildPayoBody(tx),
                            ],
                          ],
                        ),
            ),
          ],
        ),
      ),
    );
  }

  Widget _buildPaidBanner(PaymentTransactionRecord tx) {
    return Container(
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        color: AppTheme.primaryLight,
        borderRadius: BorderRadius.circular(14),
        border: Border.all(color: AppTheme.primary.withAlpha(102)),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          const Row(
            children: [
              Icon(Icons.check_circle_rounded, color: AppTheme.primary),
              SizedBox(width: 8),
              Text(
                'Payment Confirmed & Verified',
                style: TextStyle(
                    fontWeight: FontWeight.w800,
                    fontSize: 15,
                    color: AppTheme.primary),
              ),
            ],
          ),
          const SizedBox(height: 8),
          Text('Tx Ref: ${tx.txRef}', style: const TextStyle(fontSize: 12.5)),
          Text('Amount: ${AppConfig.formatEtb(tx.grossAmount)}',
              style:
                  const TextStyle(fontSize: 13, fontWeight: FontWeight.w700)),
          const SizedBox(height: 12),
          Row(
            children: [
              Expanded(
                child: OutlinedButton.icon(
                  onPressed: () => PaymentDetailsSheet.show(
                    context,
                    preloadedTx: tx,
                    title: 'Payment Receipt',
                  ),
                  icon: const Icon(Icons.receipt_long_rounded),
                  label: const Text('Payment Details'),
                ),
              ),
              const SizedBox(width: 10),
              Expanded(
                child: ElevatedButton(
                  onPressed: () => Navigator.pop(context, tx),
                  child: const Text('Done'),
                ),
              ),
            ],
          ),
        ],
      ),
    );
  }

  Widget _buildChapaBody(PaymentTransactionRecord tx) {
    final hasUrl =
        tx.gatewayCheckoutUrl != null && tx.gatewayCheckoutUrl!.isNotEmpty;
    return Card(
      child: Padding(
        padding: const EdgeInsets.all(14),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text('Chapa Reference: ${tx.txRef}',
                style:
                    const TextStyle(fontWeight: FontWeight.w700, fontSize: 13)),
            const SizedBox(height: 6),
            Text(
              'Pay ${AppConfig.formatEtb(tx.grossAmount)} via Telebirr, CBE Birr, Amole, or card through Chapa.',
              style: const TextStyle(fontSize: 12.5, color: AppTheme.mutedInk),
            ),
            const SizedBox(height: 14),
            if (hasUrl) ...[
              SizedBox(
                width: double.infinity,
                child: ElevatedButton.icon(
                  onPressed: () {
                    _setupWebView(tx.gatewayCheckoutUrl!);
                    setState(() => _showWebView = true);
                  },
                  icon: const Icon(Icons.open_in_browser_rounded),
                  label: const Text('Pay Inside App (Chapa Checkout)'),
                ),
              ),
              const SizedBox(height: 8),
              SizedBox(
                width: double.infinity,
                child: OutlinedButton.icon(
                  onPressed: () async {
                    final uri = Uri.parse(tx.gatewayCheckoutUrl!);
                    await launchUrl(uri, mode: LaunchMode.externalApplication);
                  },
                  icon: const Icon(Icons.launch_rounded),
                  label: const Text('Open Chapa in External Browser'),
                ),
              ),
              const SizedBox(height: 10),
            ],
            SizedBox(
              width: double.infinity,
              child: ElevatedButton.icon(
                style: ElevatedButton.styleFrom(
                  backgroundColor: AppTheme.ink,
                ),
                onPressed: _verifying ? null : _verifyChapa,
                icon: const Icon(Icons.verified_outlined),
                label: Text(_verifying
                    ? 'Checking Chapa Status...'
                    : 'I Completed Payment · Verify Now'),
              ),
            ),
          ],
        ),
      ),
    );
  }

  Widget _buildPayoBody(PaymentTransactionRecord tx) {
    final payout = tx.providerPayoutAccountSnapshot;
    return Card(
      child: Padding(
        padding: const EdgeInsets.all(14),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            const Text(
              'Payo / Direct Ethiopian Bank & Mobile Transfer',
              style: TextStyle(fontWeight: FontWeight.w800, fontSize: 14),
            ),
            const SizedBox(height: 6),
            Text(
              'Total Due: ${AppConfig.formatEtb(tx.grossAmount)} · Ref: ${tx.txRef}',
              style: const TextStyle(
                  color: AppTheme.primary,
                  fontWeight: FontWeight.w700,
                  fontSize: 13),
            ),
            if (payout != null) ...[
              const SizedBox(height: 10),
              Container(
                padding: const EdgeInsets.all(12),
                decoration: BoxDecoration(
                  color: AppTheme.surfaceBg,
                  borderRadius: BorderRadius.circular(10),
                ),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      'Provider Transfer: ${AppConfig.formatEtb(tx.providerAmount)}',
                      style: const TextStyle(
                          fontWeight: FontWeight.w800, fontSize: 13),
                    ),
                    if (payout.bankName != null)
                      Text('Bank: ${payout.bankName}'),
                    if (payout.accountNumber != null)
                      Text('Account: ${payout.accountNumber}'),
                    if (payout.telebirrNumber != null)
                      Text('Telebirr: ${payout.telebirrNumber}'),
                    if (payout.payoAccountHandle != null)
                      Text('Payo Handle: ${payout.payoAccountHandle}'),
                  ],
                ),
              ),
            ],
            const SizedBox(height: 12),
            TextField(
              controller: _receiptRefCtrl,
              decoration: const InputDecoration(
                labelText: 'Bank / Telebirr / Payo Receipt Reference *',
                hintText: 'e.g. FT24319ABC88',
              ),
            ),
            const SizedBox(height: 10),
            TextField(
              controller: _notesCtrl,
              decoration: const InputDecoration(
                labelText: 'Transfer Note (optional)',
              ),
            ),
            const SizedBox(height: 10),
            Row(
              children: [
                OutlinedButton.icon(
                  onPressed: _pickReceiptImage,
                  icon: const Icon(Icons.upload_file_rounded),
                  label: Text(_receiptDataUrl == null
                      ? 'Attach Receipt Photo'
                      : 'Change Photo'),
                ),
                if (_receiptDataUrl != null) ...[
                  const SizedBox(width: 10),
                  SmartImage(
                    source: _receiptDataUrl,
                    width: 44,
                    height: 44,
                    borderRadius: BorderRadius.circular(8),
                  ),
                ],
              ],
            ),
            CheckboxListTile(
              contentPadding: EdgeInsets.zero,
              value: _providerConfirmed,
              onChanged: (v) =>
                  setState(() => _providerConfirmed = v ?? true),
              title: const Text('I completed the transfer',
                  style: TextStyle(fontSize: 13)),
            ),
            const SizedBox(height: 8),
            SizedBox(
              width: double.infinity,
              child: ElevatedButton.icon(
                onPressed: _verifying ? null : _confirmPayo,
                icon: const Icon(Icons.check_circle_outline_rounded),
                label: Text(
                    _verifying ? 'Submitting...' : 'Confirm & Submit Receipt'),
              ),
            ),
          ],
        ),
      ),
    );
  }
}
