package com.nearestyou.service;

import com.nearestyou.dto.NearestYouDtos.*;
import com.nearestyou.entity.*;
import com.nearestyou.exception.ApiException;
import com.nearestyou.repository.*;
import com.nearestyou.security.UserPrincipal;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.security.SecureRandom;
import java.time.LocalDate;
import java.time.YearMonth;
import java.time.temporal.ChronoUnit;
import java.util.*;

@Service
public class OrderAndBookingService {

    private final CustomerOrderRepository orderRepo;
    private final BookingRepository bookingRepo;
    private final BusinessRepository businessRepo;
    private final ServiceCategoryRepository categoryRepo;
    private final ServiceListingRepository listingRepo;
    private final CommissionRecordRepository commissionRepo;
    private final PlatformSettingRepository settingRepo;
    private final AuditLogRepository auditLogRepo;

    public OrderAndBookingService(
            CustomerOrderRepository orderRepo,
            BookingRepository bookingRepo,
            BusinessRepository businessRepo,
            ServiceCategoryRepository categoryRepo,
            ServiceListingRepository listingRepo,
            CommissionRecordRepository commissionRepo,
            PlatformSettingRepository settingRepo,
            AuditLogRepository auditLogRepo
    ) {
        this.orderRepo = orderRepo;
        this.bookingRepo = bookingRepo;
        this.businessRepo = businessRepo;
        this.categoryRepo = categoryRepo;
        this.listingRepo = listingRepo;
        this.commissionRepo = commissionRepo;
        this.settingRepo = settingRepo;
        this.auditLogRepo = auditLogRepo;
    }

    @Transactional
    public List<CustomerOrder> createGroupedOrders(UserPrincipal principal, CreateOrdersRequest req) {
        double taxRate = 15.0;
        Optional<PlatformSetting> policyOpt = settingRepo.findBySettingKey("pricing_policy");
        if (policyOpt.isPresent() && policyOpt.get().getSettingValue().get("taxRatePercent") instanceof Number n) {
            taxRate = n.doubleValue();
        }

        List<CustomerOrder> createdOrders = new ArrayList<>();
        for (OrderGroupInput group : req.groups()) {
            Business biz = businessRepo.findById(group.businessId())
                    .orElseThrow(() -> new ApiException(HttpStatus.BAD_REQUEST, "Vendor is unavailable for ordering."));
            if (!"APPROVED".equalsIgnoreCase(biz.getVerificationStatus())) {
                throw new ApiException(HttpStatus.BAD_REQUEST, "Vendor is unavailable for ordering.");
            }
            BigDecimal commissionRate = categoryRepo.findById(biz.getCategoryId())
                    .map(ServiceCategory::getCommissionRate)
                    .orElse(new BigDecimal("10.00"));

            BigDecimal subtotal = BigDecimal.ZERO;
            BigDecimal totalDiscount = BigDecimal.ZERO;
            List<Map<String, Object>> snapshot = new ArrayList<>();

            for (OrderItemInput item : group.items()) {
                ServiceListing listing = listingRepo.findById(item.listingId())
                        .orElseThrow(() -> new ApiException(HttpStatus.BAD_REQUEST, "BR-011 Violation: Listing is unavailable."));
                if (!"ACTIVE".equalsIgnoreCase(listing.getStatus()) || !"AVAILABLE".equalsIgnoreCase(listing.getAvailabilityStatus())) {
                    throw new ApiException(HttpStatus.BAD_REQUEST, "BR-011 Violation: \"" + listing.getTitle() + "\" is currently unavailable.");
                }
                BigDecimal origPrice = listing.getBasePrice();
                BigDecimal activePrice = listing.getDiscountPrice() != null ? listing.getDiscountPrice() : origPrice;
                BigDecimal qty = BigDecimal.valueOf(item.quantity());
                BigDecimal lineTotal = activePrice.multiply(qty);
                subtotal = subtotal.add(lineTotal);
                if (listing.getDiscountPrice() != null) {
                    totalDiscount = totalDiscount.add(origPrice.subtract(activePrice).multiply(qty));
                }
                Map<String, Object> snap = new LinkedHashMap<>();
                snap.put("listingId", listing.getId());
                snap.put("title", listing.getTitle());
                snap.put("quantity", item.quantity());
                snap.put("unitPrice", activePrice);
                snap.put("lineTotal", lineTotal);
                if (item.variant() != null) snap.put("variant", item.variant());
                snapshot.add(snap);
            }

            BigDecimal deliveryFee = "DELIVERY".equalsIgnoreCase(group.fulfillmentType()) && group.deliveryFee() != null
                    ? group.deliveryFee() : BigDecimal.ZERO;
            BigDecimal taxAmount = subtotal.multiply(BigDecimal.valueOf(taxRate / 100.0)).setScale(2, RoundingMode.HALF_UP);
            BigDecimal totalAmount = subtotal.add(deliveryFee).add(taxAmount).setScale(2, RoundingMode.HALF_UP);
            String orderNumber = "NY-ORD-" + UUID.randomUUID().toString().substring(0, 8).toUpperCase(Locale.ROOT);

            CustomerOrder order = new CustomerOrder();
            order.setOrderNumber(orderNumber);
            order.setCustomerUid(principal.uid());
            order.setCustomerName(principal.account().getFullName());
            order.setBusinessId(group.businessId());
            order.setOrderType(group.orderType());
            order.setItemsSnapshot(snapshot);
            order.setSubtotal(subtotal.setScale(2, RoundingMode.HALF_UP));
            order.setDeliveryFee(deliveryFee.setScale(2, RoundingMode.HALF_UP));
            order.setTaxAmount(taxAmount);
            order.setDiscountAmount(totalDiscount.setScale(2, RoundingMode.HALF_UP));
            order.setTotalAmount(totalAmount);
            order.setCurrency("ETB");
            order.setFulfillmentType(group.fulfillmentType());
            order.setDeliveryAddress(group.deliveryAddress());
            order.setPaymentMethod(req.paymentMethod());
            order.setPaymentStatus("CASH".equalsIgnoreCase(req.paymentMethod()) ? "PENDING" : "SUCCESSFUL");
            order.setOrderStatus("CONFIRMED");
            order = orderRepo.save(order);

            BigDecimal commissionAmount = subtotal.multiply(commissionRate).divide(BigDecimal.valueOf(100), 2, RoundingMode.HALF_UP);
            BigDecimal providerAmount = totalAmount.subtract(commissionAmount).setScale(2, RoundingMode.HALF_UP);
            BigDecimal whtAmount = subtotal.compareTo(new BigDecimal("3000.00")) >= 0
                    ? subtotal.multiply(new BigDecimal("0.02")).setScale(2, RoundingMode.HALF_UP)
                    : BigDecimal.ZERO;
            String taxPeriod = YearMonth.now().toString();
            String fiscalReceipt = "ETH-MOR-" + LocalDate.now().getYear() + "-" + (100000 + new SecureRandom().nextInt(900000));

            CommissionRecord cr = new CommissionRecord();
            cr.setTransactionRef(orderNumber);
            cr.setTransactionType("ORDER");
            cr.setBusinessId(group.businessId());
            cr.setGrossAmount(totalAmount);
            cr.setTaxableAmount(subtotal.setScale(2, RoundingMode.HALF_UP));
            cr.setVatAmount(taxAmount);
            cr.setWithholdingTaxAmount(whtAmount);
            cr.setCommissionRate(commissionRate);
            cr.setCommissionAmount(commissionAmount);
            cr.setProviderAmount(providerAmount);
            cr.setFiscalReceiptNumber(fiscalReceipt);
            cr.setTaxPeriod(taxPeriod);
            cr.setCurrency("ETB");
            cr.setPaymentMethod(req.paymentMethod());
            cr.setStatus("RECORDED");
            commissionRepo.save(cr);

            AuditLog log = new AuditLog();
            log.setActorUid(principal.uid());
            log.setActorEmail(principal.email());
            log.setAction("ORDER_PLACED");
            log.setEntityType("order");
            log.setEntityId(orderNumber);
            log.setDetails(Map.of("totalAmount", totalAmount, "businessId", group.businessId()));
            auditLogRepo.save(log);

            createdOrders.add(order);
        }
        return createdOrders;
    }

    @Transactional
    public CustomerOrder updateOrderStatus(UserPrincipal principal, Long orderId, String orderStatus) {
        if (!Set.of("PENDING", "CONFIRMED", "PREPARING", "READY", "OUT_FOR_DELIVERY", "COMPLETED", "CANCELLED").contains(orderStatus)) {
            throw new ApiException(HttpStatus.BAD_REQUEST, "Invalid order status.");
        }
        CustomerOrder order = orderRepo.findById(orderId)
                .orElseThrow(() -> new ApiException(HttpStatus.NOT_FOUND, "Order not found."));
        Business biz = businessRepo.findById(order.getBusinessId())
                .orElseThrow(() -> new ApiException(HttpStatus.NOT_FOUND, "Business not found."));

        boolean isOwner = biz.getOwnerUid().equals(principal.uid());
        boolean isCustomer = order.getCustomerUid().equals(principal.uid());
        if (!principal.isAdmin() && !isOwner) {
            boolean canCancel = isCustomer && "CANCELLED".equals(orderStatus)
                    && ("PENDING".equals(order.getOrderStatus()) || "CONFIRMED".equals(order.getOrderStatus()));
            if (!canCancel) {
                throw new ApiException(HttpStatus.FORBIDDEN,
                        "Permission denied: only the business owner or admin can update order fulfillment.");
            }
        }

        order.setOrderStatus(orderStatus);
        CustomerOrder saved = orderRepo.save(order);

        AuditLog log = new AuditLog();
        log.setActorUid(principal.uid());
        log.setActorEmail(principal.email());
        log.setAction("ORDER_STATUS_UPDATED");
        log.setEntityType("order");
        log.setEntityId(String.valueOf(orderId));
        log.setDetails(Map.of("orderStatus", orderStatus));
        auditLogRepo.save(log);

        return saved;
    }

    @Transactional
    public Booking createBooking(UserPrincipal principal, CreateBookingRequest req) {
        ServiceListing listing = listingRepo.findById(req.listingId())
                .orElseThrow(() -> new ApiException(HttpStatus.BAD_REQUEST, "BR-011 Violation: Listing is unavailable for booking."));
        if (!"ACTIVE".equalsIgnoreCase(listing.getStatus()) || !"AVAILABLE".equalsIgnoreCase(listing.getAvailabilityStatus())) {
            throw new ApiException(HttpStatus.BAD_REQUEST, "BR-011 Violation: Listing is unavailable for booking.");
        }
        Business biz = businessRepo.findById(listing.getBusinessId())
                .orElseThrow(() -> new ApiException(HttpStatus.BAD_REQUEST, "Business not found."));
        BigDecimal commissionRate = categoryRepo.findById(listing.getCategoryId())
                .map(ServiceCategory::getCommissionRate)
                .orElse(new BigDecimal("10.00"));

        LocalDate start = LocalDate.parse(req.scheduledDate());
        LocalDate end = (req.endDate() != null && !req.endDate().isBlank()) ? LocalDate.parse(req.endDate()) : start;
        if (end.isBefore(start)) {
            throw new ApiException(HttpStatus.BAD_REQUEST, "End date must be on or after start date.");
        }

        if ("RENTAL".equalsIgnoreCase(listing.getListingType())) {
            for (Booking existing : bookingRepo.findByListingId(listing.getId())) {
                if ("CANCELLED".equalsIgnoreCase(existing.getBookingStatus())) continue;
                LocalDate bStart = LocalDate.parse(existing.getScheduledDate());
                LocalDate bEnd = existing.getEndDate() != null ? LocalDate.parse(existing.getEndDate()) : bStart;
                if (!start.isAfter(bEnd) && !end.isBefore(bStart)) {
                    throw new ApiException(HttpStatus.BAD_REQUEST,
                            "BR-012 Violation: Asset is already reserved from " + bStart + " to " + bEnd + ".");
                }
            }
        }

        double base = (listing.getDiscountPrice() != null ? listing.getDiscountPrice() : listing.getBasePrice()).doubleValue();
        double callout = listing.getCalloutFee() != null ? listing.getCalloutFee().doubleValue() : 0.0;
        double deposit = listing.getDepositAmount() != null ? listing.getDepositAmount().doubleValue() : 0.0;

        List<Map<String, Object>> breakdown = new ArrayList<>();
        double agreedPrice = 0.0;
        Map<String, Object> params = req.parameters() != null ? req.parameters() : Map.of();

        if ("CALCULATED".equalsIgnoreCase(listing.getPricingModel()) && listing.getPricingFormula() != null) {
            Map<String, Object> f = listing.getPricingFormula();
            double dist = toDouble(params.get("distanceKm"), 5.0);
            double workers = toDouble(params.get("workers"), 2.0);
            double sqm = toDouble(params.get("areaSqm"), 25.0);
            if (toDouble(f.get("baseFee"), 0) > 0) {
                double amt = toDouble(f.get("baseFee"), 0);
                breakdown.add(Map.of("label", "Base service fee", "amount", amt));
                agreedPrice += amt;
            }
            if (toDouble(f.get("perKmRate"), 0) > 0) {
                double rate = toDouble(f.get("perKmRate"), 0);
                double amt = dist * rate;
                breakdown.add(Map.of("label", "Distance (" + dist + " km)", "amount", amt));
                agreedPrice += amt;
            }
            if (toDouble(f.get("perWorkerRate"), 0) > 0) {
                double rate = toDouble(f.get("perWorkerRate"), 0);
                double amt = workers * rate;
                breakdown.add(Map.of("label", "Crew (" + (int) workers + " workers)", "amount", amt));
                agreedPrice += amt;
            }
            if (toDouble(f.get("vehicleFee"), 0) > 0) {
                double amt = toDouble(f.get("vehicleFee"), 0);
                breakdown.add(Map.of("label", "Dedicated vehicle fee", "amount", amt));
                agreedPrice += amt;
            }
            if (toDouble(f.get("perSqmRate"), 0) > 0) {
                double rate = toDouble(f.get("perSqmRate"), 0);
                double amt = sqm * rate;
                breakdown.add(Map.of("label", "Area (" + sqm + " sqm)", "amount", amt));
                agreedPrice += amt;
            }
        } else if ("RENTAL".equalsIgnoreCase(listing.getListingType())) {
            long days = Math.max(1, ChronoUnit.DAYS.between(start, end) + 1);
            if ("PER_MONTH".equalsIgnoreCase(listing.getPricingModel())) {
                long months = Math.max(1, (long) Math.ceil(days / 30.0));
                double rent = months * base;
                breakdown.add(Map.of("label", "Monthly rate (" + months + " mo)", "amount", rent));
                agreedPrice += rent;
            } else {
                double rent = days * base;
                breakdown.add(Map.of("label", "Daily rate (" + days + " days)", "amount", rent));
                agreedPrice += rent;
            }
            if (deposit > 0) {
                breakdown.add(Map.of("label", "Refundable security deposit", "amount", deposit));
                agreedPrice += deposit;
            }
        } else {
            double units = ("ONE_TIME_CONTRACT".equalsIgnoreCase(listing.getPricingModel())
                    || "FULL_TIME".equalsIgnoreCase(listing.getPricingModel()))
                    ? Math.max(1, toDouble(params.get("units"), 1.0))
                    : Math.max(1, toDouble(params.get("units"), 1.0));
            double svcAmt = units * base;
            String unitLabel = switch (listing.getPricingModel() != null ? listing.getPricingModel().toUpperCase(Locale.ROOT) : "") {
                case "ONE_TIME_CONTRACT" -> "One-Time Contract";
                case "FULL_TIME" -> "Full-Time (" + (int) units + " " + listing.getPricingUnit() + ")";
                default -> (int) units + " " + listing.getPricingUnit();
            };
            breakdown.add(Map.of("label", listing.getTitle() + " (" + unitLabel + ")", "amount", svcAmt));
            agreedPrice += svcAmt;
            if (callout > 0) {
                breakdown.add(Map.of("label", "Call-out / inspection fee", "amount", callout));
                agreedPrice += callout;
            }
        }

        BigDecimal agreedBd = BigDecimal.valueOf(agreedPrice).setScale(2, RoundingMode.HALF_UP);
        String ref = "NY-BKG-" + UUID.randomUUID().toString().substring(0, 8).toUpperCase(Locale.ROOT);

        Booking booking = new Booking();
        booking.setBookingReference(ref);
        booking.setCustomerUid(principal.uid());
        booking.setCustomerName(principal.account().getFullName());
        booking.setBusinessId(biz.getId());
        booking.setListingId(listing.getId());
        booking.setBookingType(listing.getListingType());
        booking.setScheduledDate(req.scheduledDate());
        booking.setEndDate(req.endDate());
        booking.setScheduledTime(req.scheduledTime() != null ? req.scheduledTime() : "09:00");
        booking.setParameters(params);
        booking.setPriceBreakdown(breakdown);
        booking.setAgreedPrice(agreedBd);
        booking.setDepositAmount(BigDecimal.valueOf(deposit).setScale(2, RoundingMode.HALF_UP));
        booking.setQuoteApproved(!listing.isQuoteBased());
        booking.setCurrency("ETB");
        booking.setPaymentMethod(req.paymentMethod());
        booking.setPaymentStatus("CASH".equalsIgnoreCase(req.paymentMethod()) ? "PENDING" : "SUCCESSFUL");
        booking.setBookingStatus(listing.isQuoteBased() ? "PENDING" : "CONFIRMED");
        booking.setNotes(req.notes() != null ? req.notes() : "");
        booking = bookingRepo.save(booking);

        double taxRate = 15.0;
        Optional<PlatformSetting> policyOpt = settingRepo.findBySettingKey("pricing_policy");
        if (policyOpt.isPresent() && policyOpt.get().getSettingValue().get("taxRatePercent") instanceof Number n) {
            taxRate = n.doubleValue();
        }
        BigDecimal taxableAmount = agreedBd.subtract(BigDecimal.valueOf(deposit)).max(BigDecimal.ZERO).setScale(2, RoundingMode.HALF_UP);
        BigDecimal vatAmount = taxableAmount.multiply(BigDecimal.valueOf(taxRate / 100.0)).setScale(2, RoundingMode.HALF_UP);
        BigDecimal whtAmount = taxableAmount.compareTo(new BigDecimal("3000.00")) >= 0
                ? taxableAmount.multiply(new BigDecimal("0.02")).setScale(2, RoundingMode.HALF_UP)
                : BigDecimal.ZERO;
        BigDecimal commissionAmount = agreedBd.multiply(commissionRate).divide(BigDecimal.valueOf(100), 2, RoundingMode.HALF_UP);
        String taxPeriod = YearMonth.now().toString();
        String fiscalReceipt = "ETH-MOR-" + LocalDate.now().getYear() + "-" + (100000 + new SecureRandom().nextInt(900000));

        CommissionRecord cr = new CommissionRecord();
        cr.setTransactionRef(ref);
        cr.setTransactionType("BOOKING");
        cr.setBusinessId(biz.getId());
        cr.setGrossAmount(agreedBd);
        cr.setTaxableAmount(taxableAmount);
        cr.setVatAmount(vatAmount);
        cr.setWithholdingTaxAmount(whtAmount);
        cr.setCommissionRate(commissionRate);
        cr.setCommissionAmount(commissionAmount);
        cr.setProviderAmount(agreedBd.subtract(commissionAmount));
        cr.setFiscalReceiptNumber(fiscalReceipt);
        cr.setTaxPeriod(taxPeriod);
        cr.setCurrency("ETB");
        cr.setPaymentMethod(req.paymentMethod());
        cr.setStatus("RECORDED");
        commissionRepo.save(cr);

        return booking;
    }

    @Transactional
    public Booking updateBookingStatus(UserPrincipal principal, Long bookingId, UpdateBookingStatusRequest req) {
        Booking booking = bookingRepo.findById(bookingId)
                .orElseThrow(() -> new ApiException(HttpStatus.NOT_FOUND, "Booking not found."));
        Business biz = businessRepo.findById(booking.getBusinessId())
                .orElseThrow(() -> new ApiException(HttpStatus.NOT_FOUND, "Business not found."));

        boolean isOwner = biz.getOwnerUid().equals(principal.uid());
        boolean isCustomer = booking.getCustomerUid().equals(principal.uid());
        if (!principal.isAdmin() && !isOwner && !isCustomer) {
            throw new ApiException(HttpStatus.FORBIDDEN, "Permission denied for this booking.");
        }

        if (principal.isAdmin() || isOwner) {
            if (req.bookingStatus() != null) booking.setBookingStatus(req.bookingStatus());
            if (req.quotedPrice() != null) {
                booking.setQuotedPrice(req.quotedPrice().setScale(2, RoundingMode.HALF_UP));
                booking.setAgreedPrice(req.quotedPrice().setScale(2, RoundingMode.HALF_UP));
            }
            if (req.quoteApproved() != null) booking.setQuoteApproved(req.quoteApproved());
        } else {
            if (Boolean.TRUE.equals(req.quoteApproved()) && "QUOTED".equalsIgnoreCase(booking.getBookingStatus())) {
                booking.setQuoteApproved(true);
                booking.setBookingStatus("CONFIRMED");
            } else if ("CANCELLED".equalsIgnoreCase(req.bookingStatus()) && !"COMPLETED".equalsIgnoreCase(booking.getBookingStatus())) {
                booking.setBookingStatus("CANCELLED");
            } else {
                throw new ApiException(HttpStatus.FORBIDDEN, "Customers can only approve a revised quote or cancel an active booking.");
            }
        }
        return bookingRepo.save(booking);
    }

    private double toDouble(Object value, double fallback) {
        if (value instanceof Number n) return n.doubleValue();
        if (value instanceof String s) {
            try { return Double.parseDouble(s); } catch (NumberFormatException ignored) {}
        }
        return fallback;
    }
}
