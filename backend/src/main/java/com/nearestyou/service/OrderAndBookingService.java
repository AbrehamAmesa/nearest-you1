package com.nearestyou.service;

import com.nearestyou.dto.NearestYouDtos.*;
import com.nearestyou.entity.*;
import com.nearestyou.exception.ApiException;
import com.nearestyou.repository.*;
import com.nearestyou.security.UserPrincipal;
import com.nearestyou.websocket.LiveChatBroker;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.security.SecureRandom;
import java.time.Instant;
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
    private final UserAccountRepository userRepo;
    private final PaymentGatewayService paymentGatewayService;
    private final LiveChatBroker liveChatBroker;

    public OrderAndBookingService(
            CustomerOrderRepository orderRepo,
            BookingRepository bookingRepo,
            BusinessRepository businessRepo,
            ServiceCategoryRepository categoryRepo,
            ServiceListingRepository listingRepo,
            CommissionRecordRepository commissionRepo,
            PlatformSettingRepository settingRepo,
            AuditLogRepository auditLogRepo,
            UserAccountRepository userRepo,
            PaymentGatewayService paymentGatewayService,
            LiveChatBroker liveChatBroker
    ) {
        this.orderRepo = orderRepo;
        this.bookingRepo = bookingRepo;
        this.businessRepo = businessRepo;
        this.categoryRepo = categoryRepo;
        this.listingRepo = listingRepo;
        this.commissionRepo = commissionRepo;
        this.settingRepo = settingRepo;
        this.auditLogRepo = auditLogRepo;
        this.userRepo = userRepo;
        this.paymentGatewayService = paymentGatewayService;
        this.liveChatBroker = liveChatBroker;
    }

    @Transactional
    public List<CustomerOrder> createGroupedOrders(UserPrincipal principal, CreateOrdersRequest req) {
        double taxRate = 15.0;
        BigDecimal defaultPolicyCommission = new BigDecimal("10.00");
        Optional<PlatformSetting> policyOpt = settingRepo.findBySettingKey("pricing_policy");
        if (policyOpt.isPresent()) {
            Map<String, Object> pv = policyOpt.get().getSettingValue();
            if (pv != null && pv.get("taxRatePercent") instanceof Number n) {
                taxRate = n.doubleValue();
            }
            if (pv != null && pv.get("defaultCommissionPercent") instanceof Number cn) {
                defaultPolicyCommission = BigDecimal.valueOf(Math.max(0.0, Math.min(50.0, cn.doubleValue())))
                        .setScale(2, RoundingMode.HALF_UP);
            }
        }

        List<CustomerOrder> createdOrders = new ArrayList<>();
        for (OrderGroupInput group : req.groups()) {
            Business biz = businessRepo.findById(group.businessId())
                    .orElseThrow(() -> new ApiException(HttpStatus.BAD_REQUEST, "Vendor is unavailable for ordering."));
            if (!"APPROVED".equalsIgnoreCase(biz.getVerificationStatus())) {
                throw new ApiException(HttpStatus.BAD_REQUEST, "Vendor is unavailable for ordering.");
            }
            if (principal.uid().equals(biz.getOwnerUid())) {
                throw new ApiException(HttpStatus.BAD_REQUEST, "You cannot place an order on your own advertisement.");
            }
            BigDecimal commissionRate = categoryRepo.findById(biz.getCategoryId())
                    .map(ServiceCategory::getCommissionRate)
                    .orElse(defaultPolicyCommission);

            BigDecimal subtotal = BigDecimal.ZERO;
            BigDecimal totalDiscount = BigDecimal.ZERO;
            List<Map<String, Object>> snapshot = new ArrayList<>();

            boolean isFoodOrder = "FOOD".equalsIgnoreCase(group.orderType());
            boolean groupDeliverySupported = true;
            boolean groupImmediateAcceptance = !isFoodOrder;
            Integer maxReadyMinutes = null;
            Integer maxDeliveryMinutes = null;
            boolean allReturnable = true;
            int minReturnWindowDays = 7;
            double maxReturnLossPercent = 0.0;
            double totalFixedLossEtb = 0.0;
            boolean anyDeliveryFeeNonRefundable = false;
            List<String> policyNotes = new ArrayList<>();

            for (OrderItemInput item : group.items()) {
                ServiceListing listing = listingRepo.findById(item.listingId())
                        .orElseThrow(() -> new ApiException(HttpStatus.BAD_REQUEST, "BR-011 Violation: Listing is unavailable."));
                if (!"ACTIVE".equalsIgnoreCase(listing.getStatus()) || !"AVAILABLE".equalsIgnoreCase(listing.getAvailabilityStatus())) {
                    throw new ApiException(HttpStatus.BAD_REQUEST, "BR-011 Violation: \"" + listing.getTitle() + "\" is currently unavailable.");
                }
                if ("FOOD".equalsIgnoreCase(listing.getListingType())) {
                    isFoodOrder = true;
                    groupImmediateAcceptance = false;
                }

                Map<String, Object> meta = listing.getMetadata() != null ? listing.getMetadata() : Map.of();
                boolean itemDeliveryAvailable = !(meta.get("deliveryAvailable") instanceof Boolean b) || b;
                if (!itemDeliveryAvailable) {
                    groupDeliverySupported = false;
                    if ("DELIVERY".equalsIgnoreCase(group.fulfillmentType())) {
                        throw new ApiException(
                                HttpStatus.BAD_REQUEST,
                                "\"" + listing.getTitle() + "\" is advertised Without Delivery (Store Pickup Only)."
                        );
                    }
                }

                if (!isFoodOrder && meta.get("immediateAcceptance") instanceof Boolean imm && !imm) {
                    groupImmediateAcceptance = false;
                }

                int readyMins = toInt(
                        meta.get("estimatedReadyMinutes") != null ? meta.get("estimatedReadyMinutes") : meta.get("prepTimeMinutes"),
                        isFoodOrder ? 25 : 15
                );
                int deliveryMins = toInt(
                        meta.get("estimatedDeliveryMinutes") != null ? meta.get("estimatedDeliveryMinutes") : meta.get("durationMinutes"),
                        45
                );
                maxReadyMinutes = maxReadyMinutes == null ? readyMins : Math.max(maxReadyMinutes, readyMins);
                maxDeliveryMinutes = maxDeliveryMinutes == null ? deliveryMins : Math.max(maxDeliveryMinutes, deliveryMins);

                boolean itemReturnable = !(meta.get("returnable") instanceof Boolean r) || r;
                if (!itemReturnable) {
                    allReturnable = false;
                }
                int winDays = toInt(meta.get("returnWindowDays"), itemReturnable ? 3 : 0);
                if (itemReturnable) {
                    minReturnWindowDays = Math.min(minReturnWindowDays, Math.max(1, winDays));
                }
                double lossPct = Math.min(100.0, Math.max(0.0, toDouble(meta.get("returnLossPercent"), 0.0)));
                double lossFixed = Math.max(0.0, toDouble(meta.get("returnLossFixedEtb"), 0.0));
                maxReturnLossPercent = Math.max(maxReturnLossPercent, lossPct);
                totalFixedLossEtb += lossFixed * item.quantity();
                if (meta.get("deliveryFeeNonRefundableOnReturn") instanceof Boolean nonRef && nonRef) {
                    anyDeliveryFeeNonRefundable = true;
                } else if (!meta.containsKey("deliveryFeeNonRefundableOnReturn")) {
                    anyDeliveryFeeNonRefundable = true;
                }
                if (meta.get("returnPolicyNote") instanceof String noteStr && !noteStr.isBlank()) {
                    policyNotes.add(noteStr.trim());
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
                snap.put("listingType", listing.getListingType());
                snap.put("quantity", item.quantity());
                snap.put("unitPrice", activePrice);
                snap.put("lineTotal", lineTotal);
                snap.put("deliveryAvailable", itemDeliveryAvailable);
                snap.put("returnable", itemReturnable);
                snap.put("returnLossPercent", lossPct);
                snap.put("returnLossFixedEtb", lossFixed);
                if (item.variant() != null) snap.put("variant", item.variant());
                snapshot.add(snap);
            }

            BigDecimal deliveryFee = "DELIVERY".equalsIgnoreCase(group.fulfillmentType()) && group.deliveryFee() != null
                    ? group.deliveryFee() : BigDecimal.ZERO;
            BigDecimal taxAmount = subtotal.multiply(BigDecimal.valueOf(taxRate / 100.0)).setScale(2, RoundingMode.HALF_UP);
            BigDecimal totalAmount = subtotal.add(deliveryFee).add(taxAmount).setScale(2, RoundingMode.HALF_UP);
            String orderNumber = "NY-ORD-" + UUID.randomUUID().toString().substring(0, 8).toUpperCase(Locale.ROOT);

            int resolvedReadyMins = maxReadyMinutes != null ? maxReadyMinutes : (isFoodOrder ? 25 : 15);
            int resolvedDeliveryMins = "DELIVERY".equalsIgnoreCase(group.fulfillmentType())
                    ? Math.max(resolvedReadyMins, maxDeliveryMinutes != null ? maxDeliveryMinutes : 45)
                    : resolvedReadyMins;

            double subtotalDouble = subtotal.doubleValue();
            double deliveryDouble = deliveryFee.doubleValue();
            double itemLossEtb = !allReturnable
                    ? subtotalDouble
                    : Math.min(subtotalDouble, (subtotalDouble * (maxReturnLossPercent / 100.0)) + totalFixedLossEtb);
            double deliveryLossEtb = (!allReturnable || anyDeliveryFeeNonRefundable) ? deliveryDouble : 0.0;
            double totalLossEtb = BigDecimal.valueOf(itemLossEtb + deliveryLossEtb).setScale(2, RoundingMode.HALF_UP).doubleValue();

            Map<String, Object> returnPolicySnap = new LinkedHashMap<>();
            returnPolicySnap.put("deliveryAvailable", groupDeliverySupported);
            returnPolicySnap.put("returnable", allReturnable);
            returnPolicySnap.put("returnWindowDays", allReturnable ? minReturnWindowDays : 0);
            returnPolicySnap.put("returnLossPercent", allReturnable ? maxReturnLossPercent : 100.0);
            returnPolicySnap.put("returnLossFixedEtb", allReturnable ? totalFixedLossEtb : 0.0);
            returnPolicySnap.put("deliveryFeeNonRefundableOnReturn", !allReturnable || anyDeliveryFeeNonRefundable);
            returnPolicySnap.put("estimatedItemLossOnReturnEtb", BigDecimal.valueOf(itemLossEtb).setScale(2, RoundingMode.HALF_UP));
            returnPolicySnap.put("estimatedDeliveryLossOnReturnEtb", BigDecimal.valueOf(deliveryLossEtb).setScale(2, RoundingMode.HALF_UP));
            returnPolicySnap.put("estimatedTotalLossOnReturnEtb", totalLossEtb);
            if (!policyNotes.isEmpty()) {
                returnPolicySnap.put("returnPolicyNote", String.join(" · ", policyNotes));
            }

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
            boolean isGatewayCheckout = "CHAPA".equalsIgnoreCase(req.paymentMethod())
                    || "PAYO".equalsIgnoreCase(req.paymentMethod());
            order.setPaymentStatus("CASH".equalsIgnoreCase(req.paymentMethod())
                    ? "PENDING"
                    : (isGatewayCheckout ? "PENDING_PAYMENT" : "SUCCESSFUL"));
            order.setEstimatedReadyMinutes(resolvedReadyMins);
            order.setEstimatedDeliveryMinutes(resolvedDeliveryMins);
            order.setReturnPolicySnapshot(returnPolicySnap);

            if (isFoodOrder || !groupImmediateAcceptance) {
                order.setImmediateAcceptance(false);
                order.setOrderStatus("REQUESTED");
            } else {
                Instant now = Instant.now();
                order.setImmediateAcceptance(true);
                order.setOrderStatus("ACCEPTED");
                order.setAcceptedAt(now);
                order.setEstimatedReadyAt(now.plusSeconds(resolvedReadyMins * 60L));
                order.setEstimatedDeliveryAt(now.plusSeconds(resolvedDeliveryMins * 60L));
            }
            order = orderRepo.save(order);

            BigDecimal commissionAmount = subtotal.multiply(commissionRate).divide(BigDecimal.valueOf(100), 2, RoundingMode.HALF_UP);
            BigDecimal providerAmount = totalAmount.subtract(commissionAmount).setScale(2, RoundingMode.HALF_UP);
            BigDecimal whtAmount = subtotal.compareTo(new BigDecimal("3000.00")) >= 0
                    ? subtotal.multiply(new BigDecimal("0.02")).setScale(2, RoundingMode.HALF_UP)
                    : BigDecimal.ZERO;
            String taxPeriod = YearMonth.now().toString();
            String fiscalReceipt = "ETH-MOR-" + LocalDate.now().getYear() + "-" + (100000 + new SecureRandom().nextInt(900000));

            UserAccount bizOwner = userRepo.findByUid(biz.getOwnerUid()).orElse(null);
            String platformAccLabel = paymentGatewayService.formatAccountSummary(paymentGatewayService.getPlatformCommissionAccountSnapshot());
            String providerAccLabel = paymentGatewayService.formatAccountSummary(paymentGatewayService.buildBusinessPayoutSnapshot(biz, bizOwner));

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
            if (isGatewayCheckout) {
                cr.setGateway(req.paymentMethod().toUpperCase(Locale.ROOT));
                cr.setCommissionSettlementStatus("PENDING");
                cr.setProviderSettlementStatus("PENDING");
            }
            cr.setPlatformCommissionAccount(platformAccLabel);
            cr.setProviderPayoutAccount(providerAccLabel);
            cr.setChapaSubaccountId(biz.getChapaSubaccountId() != null ? biz.getChapaSubaccountId() : (bizOwner != null ? bizOwner.getChapaSubaccountId() : null));
            cr.setStatus("RECORDED");
            commissionRepo.save(cr);

            AuditLog log = new AuditLog();
            log.setActorUid(principal.uid());
            log.setActorEmail(principal.email());
            log.setAction("ORDER_PLACED");
            log.setEntityType("order");
            log.setEntityId(orderNumber);
            log.setDetails(Map.of(
                    "totalAmount", totalAmount,
                    "businessId", group.businessId(),
                    "orderStatus", order.getOrderStatus(),
                    "immediateAcceptance", order.isImmediateAcceptance()
            ));
            auditLogRepo.save(log);

            liveChatBroker.broadcastOrderEvent(order, biz, principal.uid(), "CREATED");
            createdOrders.add(order);
        }
        return createdOrders;
    }

    @Transactional
    public CustomerOrder updateOrderStatus(UserPrincipal principal, Long orderId, UpdateOrderStatusRequest req) {
        String orderStatus = req.orderStatus().trim().toUpperCase(Locale.ROOT);
        if (!Set.of("REQUESTED", "PENDING", "ACCEPTED", "REJECTED", "CONFIRMED", "PREPARING", "READY", "OUT_FOR_DELIVERY", "COMPLETED", "CANCELLED").contains(orderStatus)) {
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
                    && Set.of("REQUESTED", "PENDING", "CONFIRMED", "ACCEPTED").contains(order.getOrderStatus());
            if (!canCancel) {
                throw new ApiException(HttpStatus.FORBIDDEN,
                        "Permission denied: only the business owner or admin can update order fulfillment.");
            }
        }

        Instant now = Instant.now();
        if ("ACCEPTED".equals(orderStatus) || "CONFIRMED".equals(orderStatus) || "PREPARING".equals(orderStatus)) {
            if (order.getAcceptedAt() == null) {
                order.setAcceptedAt(now);
            }
            Integer reqReady = req.estimatedReadyMinutes();
            Integer reqDelivery = req.estimatedDeliveryMinutes();
            if (reqReady != null && reqReady > 0) {
                order.setEstimatedReadyMinutes(reqReady);
                order.setEstimatedReadyAt(now.plusSeconds(reqReady * 60L));
            } else if (order.getEstimatedReadyAt() == null) {
                int fallbackReady = order.getEstimatedReadyMinutes() != null ? order.getEstimatedReadyMinutes() : 25;
                order.setEstimatedReadyMinutes(fallbackReady);
                order.setEstimatedReadyAt(now.plusSeconds(fallbackReady * 60L));
            }
            if (reqDelivery != null && reqDelivery > 0) {
                order.setEstimatedDeliveryMinutes(reqDelivery);
                order.setEstimatedDeliveryAt(now.plusSeconds(reqDelivery * 60L));
            } else if (order.getEstimatedDeliveryAt() == null) {
                int readyBase = order.getEstimatedReadyMinutes() != null ? order.getEstimatedReadyMinutes() : 25;
                int fallbackDelivery = order.getEstimatedDeliveryMinutes() != null
                        ? order.getEstimatedDeliveryMinutes()
                        : ("DELIVERY".equalsIgnoreCase(order.getFulfillmentType()) ? readyBase + 20 : readyBase);
                order.setEstimatedDeliveryMinutes(fallbackDelivery);
                order.setEstimatedDeliveryAt(now.plusSeconds(fallbackDelivery * 60L));
            }
        }

        if ("REJECTED".equals(orderStatus) && req.rejectionReason() != null && !req.rejectionReason().isBlank()) {
            order.setRejectionReason(req.rejectionReason().trim());
        }

        order.setOrderStatus(orderStatus);
        CustomerOrder saved = orderRepo.save(order);

        AuditLog log = new AuditLog();
        log.setActorUid(principal.uid());
        log.setActorEmail(principal.email());
        log.setAction("ORDER_STATUS_UPDATED");
        log.setEntityType("order");
        log.setEntityId(String.valueOf(orderId));
        log.setDetails(Map.of(
                "orderStatus", orderStatus,
                "estimatedReadyMinutes", saved.getEstimatedReadyMinutes() != null ? saved.getEstimatedReadyMinutes() : 0,
                "estimatedDeliveryMinutes", saved.getEstimatedDeliveryMinutes() != null ? saved.getEstimatedDeliveryMinutes() : 0
        ));
        auditLogRepo.save(log);

        liveChatBroker.broadcastOrderEvent(saved, biz, principal.uid(), "STATUS_UPDATED");
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
        if (principal.uid().equals(biz.getOwnerUid())) {
            throw new ApiException(HttpStatus.BAD_REQUEST, "You cannot book or send a service request to your own advertisement.");
        }
        double taxRate = 15.0;
        BigDecimal defaultPolicyCommission = new BigDecimal("10.00");
        Optional<PlatformSetting> policyOpt = settingRepo.findBySettingKey("pricing_policy");
        if (policyOpt.isPresent()) {
            Map<String, Object> pv = policyOpt.get().getSettingValue();
            if (pv != null && pv.get("taxRatePercent") instanceof Number n) {
                taxRate = n.doubleValue();
            }
            if (pv != null && pv.get("defaultCommissionPercent") instanceof Number cn) {
                defaultPolicyCommission = BigDecimal.valueOf(Math.max(0.0, Math.min(50.0, cn.doubleValue())))
                        .setScale(2, RoundingMode.HALF_UP);
            }
        }
        BigDecimal commissionRate = categoryRepo.findById(listing.getCategoryId())
                .map(ServiceCategory::getCommissionRate)
                .orElse(defaultPolicyCommission);

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
        boolean isGatewayBooking = "CHAPA".equalsIgnoreCase(req.paymentMethod())
                || "PAYO".equalsIgnoreCase(req.paymentMethod());
        booking.setPaymentStatus("CASH".equalsIgnoreCase(req.paymentMethod())
                ? "PENDING"
                : (isGatewayBooking ? "PENDING_PAYMENT" : "SUCCESSFUL"));
        booking.setBookingStatus(listing.isQuoteBased() ? "PENDING" : (isGatewayBooking ? "PENDING_PAYMENT" : "CONFIRMED"));
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

        UserAccount bizOwner = userRepo.findByUid(biz.getOwnerUid()).orElse(null);
        String platformAccLabel = paymentGatewayService.formatAccountSummary(paymentGatewayService.getPlatformCommissionAccountSnapshot());
        String providerAccLabel = paymentGatewayService.formatAccountSummary(paymentGatewayService.buildBusinessPayoutSnapshot(biz, bizOwner));

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
        if (isGatewayBooking) {
            cr.setGateway(req.paymentMethod().toUpperCase(Locale.ROOT));
            cr.setCommissionSettlementStatus("PENDING");
            cr.setProviderSettlementStatus("PENDING");
        }
        cr.setPlatformCommissionAccount(platformAccLabel);
        cr.setProviderPayoutAccount(providerAccLabel);
        cr.setChapaSubaccountId(biz.getChapaSubaccountId() != null ? biz.getChapaSubaccountId() : (bizOwner != null ? bizOwner.getChapaSubaccountId() : null));
        cr.setStatus("RECORDED");
        commissionRepo.save(cr);

        liveChatBroker.broadcastBookingEvent(booking, biz, listing.getTitle(), principal.uid(), "CREATED");
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
            if (req.bookingStatus() != null) {
                boolean gatewayPayment = "CHAPA".equalsIgnoreCase(booking.getPaymentMethod())
                        || "PAYO".equalsIgnoreCase(booking.getPaymentMethod());
                boolean unpaidConfirmation = gatewayPayment && !"SUCCESSFUL".equalsIgnoreCase(booking.getPaymentStatus())
                        && ("CONFIRMED".equalsIgnoreCase(req.bookingStatus()) || "COMPLETED".equalsIgnoreCase(req.bookingStatus()));
                if (!principal.isAdmin() && unpaidConfirmation) {
                    throw new ApiException(HttpStatus.CONFLICT, "This booking cannot be confirmed or completed before its payment is verified.");
                }
                booking.setBookingStatus(req.bookingStatus());
            }
            if (req.quotedPrice() != null) {
                booking.setQuotedPrice(req.quotedPrice().setScale(2, RoundingMode.HALF_UP));
                booking.setAgreedPrice(req.quotedPrice().setScale(2, RoundingMode.HALF_UP));
            }
            if (req.quoteApproved() != null) {
                booking.setQuoteApproved(req.quoteApproved());
                if (Boolean.TRUE.equals(req.quoteApproved())
                        && ("CHAPA".equalsIgnoreCase(booking.getPaymentMethod()) || "PAYO".equalsIgnoreCase(booking.getPaymentMethod()))
                        && !"SUCCESSFUL".equalsIgnoreCase(booking.getPaymentStatus())) {
                    booking.setBookingStatus("PENDING_PAYMENT");
                }
            }
        } else {
            if (Boolean.TRUE.equals(req.quoteApproved()) && "QUOTED".equalsIgnoreCase(booking.getBookingStatus())) {
                booking.setQuoteApproved(true);
                boolean gatewayPayment = "CHAPA".equalsIgnoreCase(booking.getPaymentMethod())
                        || "PAYO".equalsIgnoreCase(booking.getPaymentMethod());
                booking.setBookingStatus(gatewayPayment && !"SUCCESSFUL".equalsIgnoreCase(booking.getPaymentStatus())
                        ? "PENDING_PAYMENT" : "CONFIRMED");
            } else if ("CANCELLED".equalsIgnoreCase(req.bookingStatus()) && !"COMPLETED".equalsIgnoreCase(booking.getBookingStatus())) {
                booking.setBookingStatus("CANCELLED");
            } else {
                throw new ApiException(HttpStatus.FORBIDDEN, "Customers can only approve a revised quote or cancel an active booking.");
            }
        }
        Booking saved = bookingRepo.save(booking);
        String listingTitle = listingRepo.findById(saved.getListingId())
                .map(ServiceListing::getTitle)
                .orElse(saved.getBookingType());
        liveChatBroker.broadcastBookingEvent(saved, biz, listingTitle, principal.uid(), "STATUS_UPDATED");
        return saved;
    }

    private double toDouble(Object value, double fallback) {
        if (value instanceof Number n) return n.doubleValue();
        if (value instanceof String s) {
            try { return Double.parseDouble(s); } catch (NumberFormatException ignored) {}
        }
        return fallback;
    }

    private int toInt(Object value, int fallback) {
        if (value instanceof Number n) return n.intValue();
        if (value instanceof String s) {
            try { return (int) Math.round(Double.parseDouble(s)); } catch (NumberFormatException ignored) {}
        }
        return fallback;
    }
}
