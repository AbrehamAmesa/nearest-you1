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

    test('parses DbUserRecord, ProviderRegistration, DeliveryRecord, and PaymentTransactionRecord', () {
      final user = DbUserRecord.fromJson({
        'id': 1,
        'uid': 'user-123',
        'firebaseUid': 'fb-123',
        'fullName': 'Dawit Tadesse',
        'email': 'dawit@example.com',
        'defaultSubCity': 'Bole',
        'roles': ['CUSTOMER', 'PROVIDER'],
        'providerVerificationStatus': 'VERIFIED',
      });
      expect(user.isVerifiedProvider, true);
      expect(user.isDeliveryPartner, true);
      expect(user.allUids, {'user-123', 'fb-123'});

      final reg = ProviderRegistration.fromJson({
        'id': 12,
        'userUid': 'user-123',
        'fullName': 'Dawit Tadesse',
        'phoneNumber': '+251911000000',
        'serviceCategoryId': 3,
        'faydaIdNumber': 'FIN-998877',
        'livenessPassed': true,
        'livenessScore': 95,
        'subCity': 'Bole',
        'landmark': 'Edna Mall',
        'status': 'VERIFIED',
        'createdAt': '2026-11-20T10:00:00Z',
      });
      expect(reg.status, 'VERIFIED');
      expect(reg.livenessPassed, true);

      final delivery = DeliveryRecord.fromJson({
        'id': 55,
        'trackingCode': 'DEL-55',
        'requestType': 'DELIVERY',
        'customerUid': 'user-123',
        'customerName': 'Dawit',
        'pickupLocation': 'Bole',
        'destinationLocation': 'Piassa',
        'packageOrRideDetails': 'Laptop sleeve',
        'vehicleType': 'MOTORCYCLE',
        'urgency': 'STANDARD',
        'distanceKm': 6.2,
        'totalFee': 185,
        'escrowAmount': 185,
        'paymentMethod': 'CHAPA',
        'status': 'PICKED_UP',
        'createdAt': '2026-11-20T10:00:00Z',
      });
      expect(delivery.vehicleType, 'MOTORCYCLE');
      expect(delivery.status, 'PICKED_UP');
      expect(delivery.totalFee, 185);

      final tx = PaymentTransactionRecord.fromJson({
        'id': 91,
        'txRef': 'NY-TX-91',
        'gateway': 'CHAPA',
        'gatewayMode': 'LIVE',
        'transactionType': 'ORDER',
        'referenceId': 10,
        'referenceCode': 'ORD-10',
        'customerUid': 'user-123',
        'grossAmount': 1150,
        'providerAmount': 1035,
        'taxAmount': 150,
        'providerLegStatus': 'SETTLED',
        'status': 'PAID',
        'createdAt': '2026-11-20T10:00:00Z',
      });
      expect(tx.isPaid, true);
      expect(tx.providerAmount, 1035);
    });
  });
}
