import 'package:flutter_test/flutter_test.dart';
import 'package:nearest_you_mobile/core/models/models.dart';
import 'package:nearest_you_mobile/core/utils/listing_policy.dart';

void main() {
  group('ListingPolicyCalculator', () {
    test('free delivery within 0-X km provider radius and charged beyond', () {
      final within = ListingPolicyCalculator.calculateDeliveryFee(
        distanceKm: 3.5,
        deliverySupported: true,
        freeDeliveryMaxKm: 5.0,
        deliveryBaseFee: 70,
        deliveryPerKmRate: 18,
      );
      expect(within.coveredByProvider, true);
      expect(within.feeEtb, 0);

      final beyond = ListingPolicyCalculator.calculateDeliveryFee(
        distanceKm: 8.0,
        deliverySupported: true,
        freeDeliveryMaxKm: 5.0,
        deliveryBaseFee: 70,
        deliveryPerKmRate: 18,
      );
      expect(beyond.coveredByProvider, false);
      expect(beyond.feeEtb, 214);
    });

    test('seller tax adds 0 ETB extra tax; buyer tax adds VAT percentage', () {
      final sellerTax = ListingPolicyCalculator.calculateBuyerTaxEtb(
        lineSubtotalEtb: 1000,
        taxResponsibility: 'SELLER',
        taxRatePercent: 15,
      );
      expect(sellerTax, 0);

      final buyerTax = ListingPolicyCalculator.calculateBuyerTaxEtb(
        lineSubtotalEtb: 1000,
        taxResponsibility: 'BUYER',
        taxRatePercent: 15,
      );
      expect(buyerTax, 150);
    });

    test('return loss calculation respects percent and fixed fees', () {
      final policy = ListingCommercialPolicy.fromListing(
        listingType: 'PRODUCT',
        metadata: {
          'returnable': true,
          'returnLossPercent': 10,
          'returnLossFixedEtb': 25,
          'deliveryFeeNonRefundableOnReturn': true,
          'taxResponsibility': 'SELLER',
          'taxConfirmedBySeller': true,
        },
      );
      final breakdown = ListingPolicyCalculator.calculateReturnLoss(
        subtotalEtb: 1000,
        deliveryFeeEtb: 100,
        policy: policy,
      );
      expect(breakdown.itemLossEtb, 125);
      expect(breakdown.deliveryFeeLostEtb, 100);
      expect(breakdown.totalLossEtb, 225);
      expect(breakdown.refundEtb, 875);
    });
  });

  group('JSON Model Parsing', () {
    test('parses Listing and VOICE ChatMessage cleanly', () {
      final listing = Listing.fromJson({
        'id': 42,
        'businessId': 7,
        'categoryId': 1,
        'listingType': 'PRODUCT',
        'title': 'Organic Coffee Beans 1kg',
        'description': 'Fresh roast',
        'pricingModel': 'FIXED',
        'pricingUnit': 'UNIT',
        'basePrice': '850.00',
        'discountPrice': '790.00',
        'metadata': {
          'freeDeliveryMaxKm': 4,
          'taxResponsibility': 'SELLER',
          'taxConfirmedBySeller': true,
        },
      });
      expect(listing.effectivePrice, 790.0);

      final voiceMsg = ChatMessage.fromJson({
        'id': 9,
        'senderUid': 'u1',
        'senderName': 'Abebe',
        'businessId': 7,
        'messageType': 'VOICE',
        'body': 'Voice message (5s)',
        'audioDataUrl': 'data:audio/mp4;base64,AAAA',
        'audioDurationSeconds': 5,
      });
      expect(voiceMsg.isVoice, true);
      expect(voiceMsg.audioDurationSeconds, 5);
    });
  });
}
