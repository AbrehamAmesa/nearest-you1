class ListingCommercialPolicy {
  final bool isFood;
  final bool deliveryAvailable;
  final double freeDeliveryMaxKm;
  final String taxResponsibility; // 'SELLER' or 'BUYER'
  final bool taxConfirmedBySeller;
  final bool immediateAcceptance;
  final int estimatedReadyMinutes;
  final int estimatedDeliveryMinutes;
  final String deliveryWindowLabel;
  final bool returnable;
  final int returnWindowDays;
  final double returnLossPercent;
  final double returnLossFixedEtb;
  final bool deliveryFeeNonRefundableOnReturn;
  final String returnPolicyNote;

  const ListingCommercialPolicy({
    required this.isFood,
    required this.deliveryAvailable,
    required this.freeDeliveryMaxKm,
    required this.taxResponsibility,
    required this.taxConfirmedBySeller,
    required this.immediateAcceptance,
    required this.estimatedReadyMinutes,
    required this.estimatedDeliveryMinutes,
    required this.deliveryWindowLabel,
    required this.returnable,
    required this.returnWindowDays,
    required this.returnLossPercent,
    required this.returnLossFixedEtb,
    required this.deliveryFeeNonRefundableOnReturn,
    required this.returnPolicyNote,
  });

  bool get isSellerTax => taxResponsibility == 'SELLER';

  static double _toPositiveDouble(dynamic value, double fallback) {
    if (value is num && value.isFinite) return value < 0 ? 0 : value.toDouble();
    if (value is String && value.trim().isNotEmpty) {
      final parsed = double.tryParse(value.trim());
      if (parsed != null && parsed.isFinite) return parsed < 0 ? 0 : parsed;
    }
    return fallback;
  }

  factory ListingCommercialPolicy.fromListing({
    required String listingType,
    required Map<String, dynamic>? metadata,
  }) {
    final isFood = listingType.toUpperCase() == 'FOOD';
    final meta = metadata ?? const <String, dynamic>{};

    final deliveryAvailable = meta['deliveryAvailable'] != false;
    final freeDeliveryMaxKm =
        deliveryAvailable ? _toPositiveDouble(meta['freeDeliveryMaxKm'], 0) : 0.0;
    final rawTax = (meta['taxResponsibility'] ?? '').toString().toUpperCase();
    final taxResponsibility = rawTax == 'SELLER' ? 'SELLER' : 'BUYER';
    final taxConfirmedBySeller = meta['taxConfirmedBySeller'] == true;
    final immediateAcceptance = isFood ? false : meta['immediateAcceptance'] != false;
    final readyMins = _toPositiveDouble(
      meta['estimatedReadyMinutes'] ?? meta['prepTimeMinutes'],
      isFood ? 25 : 15,
    ).round().clamp(5, 10000);
    final delivMins = _toPositiveDouble(
      meta['estimatedDeliveryMinutes'] ?? meta['durationMinutes'],
      isFood ? 45 : 60,
    ).round().clamp(readyMins, 20000);

    final returnable = meta['returnable'] != false;
    final returnWindowDays = returnable
        ? _toPositiveDouble(meta['returnWindowDays'], isFood ? 1 : 3)
            .round()
            .clamp(1, 365)
        : 0;
    final returnLossPercent = returnable
        ? _toPositiveDouble(meta['returnLossPercent'], 0).clamp(0.0, 100.0)
        : 100.0;
    final returnLossFixedEtb =
        returnable ? _toPositiveDouble(meta['returnLossFixedEtb'], 0) : 0.0;
    final deliveryFeeNonRefundableOnReturn =
        !returnable || meta['deliveryFeeNonRefundableOnReturn'] != false;

    return ListingCommercialPolicy(
      isFood: isFood,
      deliveryAvailable: deliveryAvailable,
      freeDeliveryMaxKm: freeDeliveryMaxKm,
      taxResponsibility: taxResponsibility,
      taxConfirmedBySeller: taxConfirmedBySeller,
      immediateAcceptance: immediateAcceptance,
      estimatedReadyMinutes: readyMins,
      estimatedDeliveryMinutes: delivMins,
      deliveryWindowLabel: (meta['deliveryWindowLabel'] ?? '').toString().trim(),
      returnable: returnable,
      returnWindowDays: returnWindowDays,
      returnLossPercent: returnLossPercent,
      returnLossFixedEtb: returnLossFixedEtb,
      deliveryFeeNonRefundableOnReturn: deliveryFeeNonRefundableOnReturn,
      returnPolicyNote: (meta['returnPolicyNote'] ?? '').toString().trim(),
    );
  }
}

class DeliveryFeeResult {
  final bool coveredByProvider;
  final double feeEtb;

  const DeliveryFeeResult({
    required this.coveredByProvider,
    required this.feeEtb,
  });
}

class ReturnLossBreakdown {
  final bool returnable;
  final double itemLossEtb;
  final double deliveryFeeLostEtb;
  final double totalLossEtb;
  final double refundEtb;

  const ReturnLossBreakdown({
    required this.returnable,
    required this.itemLossEtb,
    required this.deliveryFeeLostEtb,
    required this.totalLossEtb,
    required this.refundEtb,
  });
}

class ListingPolicyCalculator {
  static double calculateBuyerTaxEtb({
    required double lineSubtotalEtb,
    required String taxResponsibility,
    required double taxRatePercent,
  }) {
    if (taxResponsibility.toUpperCase() == 'SELLER') return 0.0;
    final sub = lineSubtotalEtb < 0 ? 0.0 : lineSubtotalEtb;
    final rate = taxRatePercent < 0 ? 0.0 : taxRatePercent;
    return (sub * (rate / 100.0) * 100).round() / 100.0;
  }

  static DeliveryFeeResult calculateDeliveryFee({
    required double distanceKm,
    required bool deliverySupported,
    required double freeDeliveryMaxKm,
    required double deliveryBaseFee,
    required double deliveryPerKmRate,
  }) {
    if (!deliverySupported) {
      return const DeliveryFeeResult(coveredByProvider: false, feeEtb: 0);
    }
    final safeMaxKm = freeDeliveryMaxKm < 0 ? 0.0 : freeDeliveryMaxKm;
    final safeDist = distanceKm < 0 ? 0.0 : distanceKm;
    if (safeMaxKm > 0 && safeDist <= safeMaxKm) {
      return const DeliveryFeeResult(coveredByProvider: true, feeEtb: 0);
    }
    return DeliveryFeeResult(
      coveredByProvider: false,
      feeEtb: (deliveryBaseFee + safeDist * deliveryPerKmRate).roundToDouble(),
    );
  }

  static ReturnLossBreakdown calculateReturnLoss({
    required double subtotalEtb,
    required double deliveryFeeEtb,
    required ListingCommercialPolicy policy,
    int quantityMultiplier = 1,
  }) {
    final safeSub = subtotalEtb < 0 ? 0.0 : subtotalEtb;
    final safeDeliv = deliveryFeeEtb < 0 ? 0.0 : deliveryFeeEtb;
    if (!policy.returnable) {
      final totalLoss = ((safeSub + safeDeliv) * 100).round() / 100.0;
      return ReturnLossBreakdown(
        returnable: false,
        itemLossEtb: (safeSub * 100).round() / 100.0,
        deliveryFeeLostEtb: (safeDeliv * 100).round() / 100.0,
        totalLossEtb: totalLoss,
        refundEtb: 0,
      );
    }

    final qtyMult = quantityMultiplier < 1 ? 1 : quantityMultiplier;
    final rawItemLoss = safeSub * (policy.returnLossPercent.clamp(0, 100) / 100.0) +
        (policy.returnLossFixedEtb < 0 ? 0 : policy.returnLossFixedEtb) * qtyMult;
    final cappedItemLoss = rawItemLoss > safeSub ? safeSub : rawItemLoss;
    final itemLoss = (cappedItemLoss * 100).round() / 100.0;
    final deliveryLoss = policy.deliveryFeeNonRefundableOnReturn
        ? (safeDeliv * 100).round() / 100.0
        : 0.0;
    final totalLoss = ((itemLoss + deliveryLoss) * 100).round() / 100.0;
    final refundRaw = safeSub + safeDeliv - totalLoss;
    final refund = refundRaw < 0 ? 0.0 : (refundRaw * 100).round() / 100.0;

    return ReturnLossBreakdown(
      returnable: true,
      itemLossEtb: itemLoss,
      deliveryFeeLostEtb: deliveryLoss,
      totalLossEtb: totalLoss,
      refundEtb: refund,
    );
  }
}
