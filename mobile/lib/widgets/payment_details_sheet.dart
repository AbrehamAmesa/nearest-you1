import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import '../core/config/app_config.dart';
import '../core/models/models.dart';
import '../core/providers/app_state.dart';
import '../core/theme/app_theme.dart';
import 'smart_image.dart';

class PaymentDetailsSheet extends StatefulWidget {
  final String? txRef;
  final String? transactionType;
  final int? referenceId;
  final String? title;
  final Map<String, dynamic>? preloadedSummary;
  final PaymentTransactionRecord? preloadedTx;

  const PaymentDetailsSheet({
    super.key,
    this.txRef,
    this.transactionType,
    this.referenceId,
    this.title,
    this.preloadedSummary,
    this.preloadedTx,
  });

  static Future<void> show(
    BuildContext context, {
    String? txRef,
    String? transactionType,
    int? referenceId,
    String? title,
    Map<String, dynamic>? preloadedSummary,
    PaymentTransactionRecord? preloadedTx,
  }) {
    return showModalBottomSheet(
      context: context,
      isScrollControlled: true,
      backgroundColor: Colors.white,
      shape: const RoundedRectangleBorder(
        borderRadius: BorderRadius.vertical(top: Radius.circular(22)),
      ),
      builder: (_) => PaymentDetailsSheet(
        txRef: txRef,
        transactionType: transactionType,
        referenceId: referenceId,
        title: title,
        preloadedSummary: preloadedSummary,
        preloadedTx: preloadedTx,
      ),
    );
  }

  @override
  State<PaymentDetailsSheet> createState() => _PaymentDetailsSheetState();
}

class _PaymentDetailsSheetState extends State<PaymentDetailsSheet> {
  bool _loading = true;
  String? _error;
  List<PaymentTransactionRecord> _txs = [];
  Map<String, dynamic>? _summaryMap;

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    setState(() {
      _loading = true;
      _error = null;
    });

    if (widget.preloadedTx != null) {
      setState(() {
        _txs = [widget.preloadedTx!];
        _loading = false;
      });
      return;
    }

    if (widget.preloadedSummary != null &&
        widget.txRef == null &&
        (widget.transactionType == null || widget.referenceId == null)) {
      setState(() {
        _summaryMap = widget.preloadedSummary;
        _loading = false;
      });
      return;
    }

    final app = context.read<AppState>();
    try {
      if (widget.txRef != null && widget.txRef!.isNotEmpty) {
        final tx = await app.api.getPaymentByTxRef(widget.txRef!);
        if (mounted) {
          setState(() {
            _txs = [tx];
            _loading = false;
          });
        }
        return;
      }

      if (widget.transactionType != null && widget.referenceId != null) {
        final list = await app.api.getPaymentsByReference(
          transactionType: widget.transactionType!,
          referenceId: widget.referenceId!,
        );
        if (mounted) {
          setState(() {
            _txs = list;
            _summaryMap = widget.preloadedSummary;
            _loading = false;
          });
        }
        return;
      }
    } catch (e) {
      if (widget.preloadedSummary != null && mounted) {
        setState(() {
          _summaryMap = widget.preloadedSummary;
          _loading = false;
        });
        return;
      }
      if (mounted) {
        setState(() {
          _error = e.toString();
          _loading = false;
        });
      }
      return;
    }

    if (mounted) {
      setState(() => _loading = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    return DraggableScrollableSheet(
      initialChildSize: 0.72,
      minChildSize: 0.45,
      maxChildSize: 0.94,
      expand: false,
      builder: (_, controller) => Padding(
        padding: const EdgeInsets.fromLTRB(18, 12, 18, 24),
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
            const SizedBox(height: 14),
            Row(
              children: [
                const Icon(Icons.receipt_long_rounded, color: AppTheme.primary),
                const SizedBox(width: 10),
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(
                        widget.title ?? 'Payment Details',
                        style: const TextStyle(
                          fontSize: 18,
                          fontWeight: FontWeight.w800,
                          color: AppTheme.ink,
                        ),
                      ),
                      const Text(
                        'Verified payment & settlement receipt for payer, provider & receiver',
                        style: TextStyle(fontSize: 12, color: AppTheme.mutedInk),
                      ),
                    ],
                  ),
                ),
                IconButton(
                  onPressed: _load,
                  icon: const Icon(Icons.refresh_rounded),
                ),
              ],
            ),
            const Divider(height: 22),
            Expanded(
              child: _loading
                  ? const Center(child: CircularProgressIndicator())
                  : _error != null
                      ? Center(
                          child: Text(
                            _error!,
                            style: const TextStyle(color: AppTheme.danger),
                            textAlign: TextAlign.center,
                          ),
                        )
                      : (_txs.isEmpty && _summaryMap == null)
                          ? const Center(
                              child: Text(
                                'No gateway payment record found yet for this reference.',
                                style: TextStyle(color: AppTheme.mutedInk),
                              ),
                            )
                          : ListView(
                              controller: controller,
                              children: [
                                ..._txs.map(_buildTxCard),
                                if (_txs.isEmpty && _summaryMap != null)
                                  _buildSummaryCard(_summaryMap!),
                              ],
                            ),
            ),
          ],
        ),
      ),
    );
  }

  Widget _buildTxCard(PaymentTransactionRecord tx) {
    final payout = tx.providerPayoutAccountSnapshot;
    return Card(
      margin: const EdgeInsets.only(bottom: 14),
      child: Padding(
        padding: const EdgeInsets.all(14),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(
              mainAxisAlignment: MainAxisAlignment.spaceBetween,
              children: [
                Container(
                  padding:
                      const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
                  decoration: BoxDecoration(
                    color: tx.isPaid
                        ? AppTheme.primaryLight
                        : const Color(0xFFFFF4DE),
                    borderRadius: BorderRadius.circular(8),
                  ),
                  child: Text(
                    tx.status,
                    style: TextStyle(
                      fontWeight: FontWeight.w800,
                      fontSize: 12,
                      color: tx.isPaid ? AppTheme.primary : AppTheme.warning,
                    ),
                  ),
                ),
                Text(
                  '${tx.gateway} (${tx.gatewayMode})',
                  style: const TextStyle(
                    fontWeight: FontWeight.w700,
                    fontSize: 12,
                    color: AppTheme.mutedInk,
                  ),
                ),
              ],
            ),
            const SizedBox(height: 12),
            _kv('Reference Code', tx.referenceCode),
            _kv('Transaction Ref', tx.txRef),
            if (tx.gatewayTransactionId != null)
              _kv('Gateway Tx ID', tx.gatewayTransactionId!),
            if (tx.payerReceiptReference != null)
              _kv('Receipt Reference', tx.payerReceiptReference!),
            const Divider(height: 18),
            _kv('Total Paid', AppConfig.formatEtb(tx.grossAmount), bold: true),
            if (tx.taxAmount > 0)
              _kv('VAT / Tax Included', AppConfig.formatEtb(tx.taxAmount)),
            _kv('Provider Settlement Amount',
                AppConfig.formatEtb(tx.providerAmount)),
            _kv('Settlement Status', tx.providerLegStatus),
            if (tx.customerName != null) _kv('Payer', tx.customerName!),
            if (tx.paidAt != null) _kv('Paid At', tx.paidAt!),
            if (payout != null &&
                (payout.accountNumber != null ||
                    payout.telebirrNumber != null ||
                    payout.payoAccountHandle != null)) ...[
              const Divider(height: 18),
              const Text(
                'Recipient / Provider Destination Account',
                style: TextStyle(
                  fontSize: 12,
                  fontWeight: FontWeight.w800,
                  color: AppTheme.ink,
                ),
              ),
              const SizedBox(height: 6),
              if (payout.accountHolderName != null ||
                  payout.accountName != null)
                _kv('Account Holder',
                    payout.accountHolderName ?? payout.accountName!),
              if (payout.bankName != null) _kv('Bank', payout.bankName!),
              if (payout.accountNumber != null)
                _kv('Account Number', payout.accountNumber!),
              if (payout.telebirrNumber != null)
                _kv('Telebirr', payout.telebirrNumber!),
              if (payout.payoAccountHandle != null)
                _kv('Payo Handle', payout.payoAccountHandle!),
            ],
            if (tx.payerReceiptImageUrl != null &&
                tx.payerReceiptImageUrl!.isNotEmpty) ...[
              const SizedBox(height: 12),
              const Text(
                'Attached Payment Receipt',
                style: TextStyle(
                    fontSize: 12,
                    fontWeight: FontWeight.w700,
                    color: AppTheme.ink),
              ),
              const SizedBox(height: 6),
              SmartImage(
                source: tx.payerReceiptImageUrl,
                height: 180,
                width: double.infinity,
                fit: BoxFit.contain,
                borderRadius: BorderRadius.circular(10),
              ),
            ],
          ],
        ),
      ),
    );
  }

  Widget _buildSummaryCard(Map<String, dynamic> m) {
    final providerSnapshot = m['providerPayoutAccountSnapshot'] is Map
        ? Map<String, dynamic>.from(m['providerPayoutAccountSnapshot'] as Map)
        : null;
    return Card(
      child: Padding(
        padding: const EdgeInsets.all(14),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            _kv('Reference Code', parseStr(m['referenceCode'], '-')),
            if (m['txRef'] != null) _kv('Transaction Ref', parseStr(m['txRef'])),
            _kv('Gateway', parseStr(m['gateway'], 'DIGITAL')),
            _kv('Payment Status', parseStr(m['paymentStatus'], 'PENDING')),
            if (m['escrowStatus'] != null)
              _kv('Escrow Status', parseStr(m['escrowStatus'])),
            _kv('Total Amount', AppConfig.formatEtb(parseDouble(m['grossAmount'])),
                bold: true),
            if (parseDouble(m['taxAmount']) > 0)
              _kv('VAT / Tax', AppConfig.formatEtb(parseDouble(m['taxAmount']))),
            if (parseDouble(m['providerAmount']) > 0)
              _kv('Provider Payout',
                  AppConfig.formatEtb(parseDouble(m['providerAmount']))),
            if (m['customerName'] != null)
              _kv('Sender / Payer', parseStr(m['customerName'])),
            if (m['receiverName'] != null)
              _kv('Receiver', parseStr(m['receiverName'])),
            if (m['payerReceiptReference'] != null)
              _kv('Receipt Ref', parseStr(m['payerReceiptReference'])),
            if (m['paidAt'] != null) _kv('Paid At', parseStr(m['paidAt'])),
            if (providerSnapshot != null &&
                providerSnapshot['accountNumber'] != null) ...[
              const Divider(height: 16),
              _kv('Provider Bank', parseStr(providerSnapshot['bankName'])),
              _kv('Account No.', parseStr(providerSnapshot['accountNumber'])),
            ],
            if (m['payerReceiptImageUrl'] != null &&
                parseStr(m['payerReceiptImageUrl']).isNotEmpty) ...[
              const SizedBox(height: 10),
              SmartImage(
                source: parseStr(m['payerReceiptImageUrl']),
                height: 180,
                width: double.infinity,
                fit: BoxFit.contain,
                borderRadius: BorderRadius.circular(10),
              ),
            ],
          ],
        ),
      ),
    );
  }

  Widget _kv(String label, String value, {bool bold = false}) {
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 3),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          SizedBox(
            width: 132,
            child: Text(
              label,
              style: const TextStyle(fontSize: 12, color: AppTheme.mutedInk),
            ),
          ),
          Expanded(
            child: Text(
              value,
              textAlign: TextAlign.right,
              style: TextStyle(
                fontSize: bold ? 14 : 12.5,
                fontWeight: bold ? FontWeight.w800 : FontWeight.w600,
                color: AppTheme.ink,
              ),
            ),
          ),
        ],
      ),
    );
  }
}
