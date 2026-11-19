package com.nearestyou.pricing;

import org.springframework.stereotype.Service;
import java.math.BigDecimal;
import java.util.Map;

/**
 * Enforces Nearest You SRS Section 9 & Business Rules BR-001 through BR-007:
 * No active listing may be published without an explicit ETB price, pricing unit,
 * approved business status, and transparent calculation formula for variable services.
 */
@Service
public class MandatoryPricingValidator {

    public void validateActiveListing(
            String businessVerificationStatus,
            String currency,
            String pricingModel,
            String pricingUnit,
            BigDecimal basePrice,
            BigDecimal discountPrice,
            boolean isUnpaid,
            Map<String, Object> pricingFormula
    ) {
        if (!"APPROVED".equalsIgnoreCase(businessVerificationStatus)) {
            throw new IllegalStateException("BR-007: Only APPROVED businesses may publish active listings.");
        }
        if (currency == null || !"ETB".equalsIgnoreCase(currency.trim())) {
            throw new IllegalArgumentException("BR-002: Currency must be explicitly set to ETB.");
        }
        if (pricingModel == null || pricingUnit == null || pricingUnit.isBlank()) {
            throw new IllegalArgumentException("BR-001: Pricing model and pricing unit are mandatory.");
        }
        if (!isUnpaid && (basePrice == null || basePrice.compareTo(BigDecimal.ZERO) <= 0)) {
            throw new IllegalArgumentException("BR-001: Active listing basePrice must exceed 0 ETB.");
        }
        if (discountPrice != null && basePrice != null && discountPrice.compareTo(basePrice) >= 0) {
            throw new IllegalArgumentException("Discount price must be strictly lower than basePrice.");
        }
        if ("CALCULATED".equalsIgnoreCase(pricingModel) && (pricingFormula == null || pricingFormula.isEmpty())) {
            throw new IllegalArgumentException("BR-003: CALCULATED variable services require a transparent formula.");
        }
    }
}
