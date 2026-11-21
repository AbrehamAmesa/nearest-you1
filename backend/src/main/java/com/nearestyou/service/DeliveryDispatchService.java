package com.nearestyou.service;

import com.nearestyou.dto.NearestYouDtos.CreateDeliveryRequest;
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
import java.util.*;

@Service
public class DeliveryDispatchService {

    private static final SecureRandom OTP_RNG = new SecureRandom();

    private final DeliveryRequestRepository deliveryRepo;
    private final CommissionRecordRepository commissionRepo;
    private final PlatformSettingRepository settingRepo;
    private final ProviderRegistrationRepository providerRepo;
    private final AuditLogRepository auditLogRepo;
    private final LiveChatBroker liveChatBroker;

    public DeliveryDispatchService(
            DeliveryRequestRepository deliveryRepo,
            CommissionRecordRepository commissionRepo,
            PlatformSettingRepository settingRepo,
            ProviderRegistrationRepository providerRepo,
            AuditLogRepository auditLogRepo,
            LiveChatBroker liveChatBroker
    ) {
        this.deliveryRepo = deliveryRepo;
        this.commissionRepo = commissionRepo;
        this.settingRepo = settingRepo;
        this.providerRepo = providerRepo;
        this.auditLogRepo = auditLogRepo;
        this.liveChatBroker = liveChatBroker;
    }

    private double getMatchRadiusKm() {
        return settingRepo.findBySettingKey("pricing_policy")
                .map(PlatformSetting::getSettingValue)
                .map(v -> toDouble(v.get("deliveryMatchRadiusKm"), 5.0))
                .orElse(5.0);
    }

    @Transactional(readOnly = true)
    public Map<String, Object> getScopedDeliveries(UserPrincipal principal, Double latQuery, Double lngQuery) {
        List<DeliveryRequest> all = deliveryRepo.findAllByOrderByCreatedAtDesc();
        double radiusKm = getMatchRadiusKm();
        ProviderRegistration reg = providerRepo.findFirstByUserUidOrderByUpdatedAtDesc(principal.uid()).orElse(null);

        boolean isVerifiedPartner = principal.isAdmin()
                || principal.hasRole("DELIVERY_PARTNER")
                || "VERIFIED".equalsIgnoreCase(principal.account().getProviderVerificationStatus())
                || (reg != null && "VERIFIED".equalsIgnoreCase(reg.getStatus()));

        Double driverLat = latQuery != null ? latQuery : (reg != null && reg.getLatitude() != null ? reg.getLatitude().doubleValue() : null);
        Double driverLng = lngQuery != null ? lngQuery : (reg != null && reg.getLongitude() != null ? reg.getLongitude().doubleValue() : null);
        boolean hasDriverCoords = driverLat != null && driverLng != null;

        List<Map<String, Object>> scoped = new ArrayList<>();
        for (DeliveryRequest d : all) {
            Double dist = null;
            if (hasDriverCoords && d.getPickupLat() != null && d.getPickupLng() != null) {
                dist = haversineKm(driverLat, driverLng, d.getPickupLat().doubleValue(), d.getPickupLng().doubleValue());
            }
            if (principal.isAdmin() || d.getCustomerUid().equals(principal.uid()) || principal.uid().equals(d.getDriverUid())) {
                scoped.add(sanitizeForViewer(d, principal, dist));
            } else if (isVerifiedPartner && "REQUESTED".equalsIgnoreCase(d.getStatus()) && d.getDriverUid() == null) {
                if (dist != null && dist <= radiusKm) {
                    scoped.add(sanitizeForViewer(d, principal, dist));
                }
            }
        }

        Map<String, Object> res = new LinkedHashMap<>();
        res.put("matchRadiusKm", radiusKm);
        res.put("driverHasCoords", hasDriverCoords);
        res.put("driverLat", driverLat);
        res.put("driverLng", driverLng);
        res.put("isVerifiedDriver", isVerifiedPartner);
        res.put("deliveries", scoped);
        return res;
    }

    @Transactional(readOnly = true)
    public Map<String, Object> getDeliveryLiveTracking(String trackingCode, UserPrincipal principal, String receiverPhone) {
        DeliveryRequest d = deliveryRepo.findByTrackingCodeIgnoreCase(trackingCode.trim())
                .orElseThrow(() -> new ApiException(HttpStatus.NOT_FOUND, "No delivery found for that tracking code."));

        boolean isAdmin = principal != null && principal.isAdmin();
        boolean isSender = principal != null && d.getCustomerUid().equals(principal.uid());
        boolean isDriver = principal != null && principal.uid().equals(d.getDriverUid());

        String expected = d.getReceiverPhone() != null ? d.getReceiverPhone().replaceAll("[^0-9]", "") : "";
        String supplied = receiverPhone != null ? receiverPhone.replaceAll("[^0-9]", "") : "";
        boolean phoneMatches = expected.length() >= 6 && supplied.length() >= 6
                && (expected.endsWith(supplied.substring(Math.max(0, supplied.length() - 8)))
                || supplied.endsWith(expected.substring(Math.max(0, expected.length() - 8))));

        if (!isAdmin && !isSender && !isDriver && !phoneMatches) {
            throw new ApiException(HttpStatus.FORBIDDEN, "Verification required to track this shipment live.");
        }

        Map<String, Object> map = new LinkedHashMap<>();
        map.put("id", d.getId());
        map.put("trackingCode", d.getTrackingCode());
        map.put("requestType", d.getRequestType());
        map.put("status", d.getStatus());
        map.put("escrowStatus", d.getEscrowStatus());
        map.put("escrowAmount", d.getEscrowAmount());
        map.put("vehicleType", d.getVehicleType());
        map.put("urgency", d.getUrgency());
        map.put("pickupLocation", d.getPickupLocation());
        map.put("pickupLat", d.getPickupLat());
        map.put("pickupLng", d.getPickupLng());
        map.put("destinationLocation", d.getDestinationLocation());
        map.put("destinationLat", d.getDestinationLat());
        map.put("destinationLng", d.getDestinationLng());
        map.put("distanceKm", d.getDistanceKm());
        map.put("driverName", d.getDriverName());
        map.put("driverLat", d.getDriverLat());
        map.put("driverLng", d.getDriverLng());
        map.put("driverLocationUpdatedAt", d.getDriverLocationUpdatedAt());
        map.put("receiverName", d.getReceiverName());
        map.put("pickupConfirmedAt", d.getPickupConfirmedAt());
        map.put("deliveredConfirmedAt", d.getDeliveredConfirmedAt());
        map.put("conflictStatus", d.getConflictStatus());
        map.put("conflictCategory", d.getConflictCategory());
        map.put("conflictResolution", d.getConflictResolution());
        map.put("pickupOtp", (isSender || isAdmin) ? d.getPickupOtp() : null);
        map.put("deliveryOtp", (isSender || isAdmin || phoneMatches) ? d.getDeliveryOtp() : null);
        map.put("viewerRole", isAdmin ? "ADMIN" : isSender ? "SENDER" : isDriver ? "DRIVER" : "RECEIVER");
        return map;
    }

    @Transactional
    public Map<String, Object> updateDriverLocation(UserPrincipal principal, Long deliveryId, BigDecimal lat, BigDecimal lng) {
        DeliveryRequest d = deliveryRepo.findById(deliveryId)
                .orElseThrow(() -> new ApiException(HttpStatus.NOT_FOUND, "Delivery request not found."));
        if (!principal.isAdmin() && !principal.uid().equals(d.getDriverUid())) {
            throw new ApiException(HttpStatus.FORBIDDEN, "Only the assigned driver can broadcast GPS updates.");
        }
        Instant now = Instant.now();
        d.setDriverLat(lat);
        d.setDriverLng(lng);
        d.setDriverLocationUpdatedAt(now);
        DeliveryRequest saved = deliveryRepo.save(d);

        providerRepo.findFirstByUserUidOrderByUpdatedAtDesc(principal.uid()).ifPresent(reg -> {
            reg.setLatitude(lat);
            reg.setLongitude(lng);
            reg.setLiveLocationActive(true);
            reg.setLastLocationUpdatedAt(now);
            providerRepo.save(reg);
        });

        return sanitizeForViewer(saved, principal, null);
    }

    @Transactional
    public DeliveryRequest createDelivery(UserPrincipal principal, CreateDeliveryRequest req) {
        Map<String, Object> policy = settingRepo.findBySettingKey("pricing_policy")
                .map(PlatformSetting::getSettingValue)
                .orElse(Map.of());

        boolean isRide = "RIDE".equalsIgnoreCase(req.requestType());
        double baseFee = toDouble(policy.get(isRide ? "rideBaseFare" : "deliveryBaseFee"), isRide ? 100.0 : 80.0);
        double perKm = toDouble(policy.get(isRide ? "ridePerKmRate" : "deliveryPerKmRate"), isRide ? 35.0 : 25.0);
        double taxRate = toDouble(policy.get("taxRatePercent"), 15.0);
        double commissionRate = toDouble(policy.get("defaultCommissionPercent"), 10.0);
        double expressMult = "EXPRESS".equalsIgnoreCase(req.urgency()) ? toDouble(policy.get("expressMultiplier"), 1.4) : 1.0;

        double vehicleMult = switch (req.vehicleType().toUpperCase(Locale.ROOT)) {
            case "TRUCK" -> 2.2;
            case "VAN" -> 1.6;
            case "CAR" -> 1.25;
            default -> 1.0;
        };

        double dist = req.distanceKm() != null ? req.distanceKm().doubleValue() : 0.0;
        if (dist <= 0 && req.pickupLat() != null && req.pickupLng() != null && req.destinationLat() != null && req.destinationLng() != null) {
            dist = haversineKm(req.pickupLat().doubleValue(), req.pickupLng().doubleValue(), req.destinationLat().doubleValue(), req.destinationLng().doubleValue());
        }
        if (dist <= 0) dist = 1.0;

        long distanceFee = Math.round(dist * perKm * vehicleMult);
        long urgencySurcharge = "EXPRESS".equalsIgnoreCase(req.urgency())
                ? Math.round((baseFee + distanceFee) * (expressMult - 1.0)) : 0L;
        BigDecimal taxableAmount = BigDecimal.valueOf(Math.round(baseFee) + distanceFee + urgencySurcharge).setScale(2, RoundingMode.HALF_UP);
        BigDecimal taxAmount = taxableAmount.multiply(BigDecimal.valueOf(taxRate / 100.0)).setScale(2, RoundingMode.HALF_UP);
        BigDecimal totalFee = taxableAmount.add(taxAmount).setScale(2, RoundingMode.HALF_UP);

        List<Map<String, Object>> breakdown = new ArrayList<>();
        breakdown.add(Map.of("label", "Base " + req.requestType().toLowerCase(Locale.ROOT) + " fee", "amount", baseFee));
        breakdown.add(Map.of("label", "Distance (" + String.format(Locale.US, "%.2f", dist) + " km · " + req.vehicleType() + ")", "amount", distanceFee));
        if (urgencySurcharge > 0) {
            breakdown.add(Map.of("label", "Express priority handling", "amount", urgencySurcharge));
        }
        breakdown.add(Map.of("label", "VAT (" + taxRate + "%)", "amount", taxAmount));

        String trackingCode = "NY-" + (isRide ? "RID" : "DEL") + "-" + UUID.randomUUID().toString().substring(0, 6).toUpperCase(Locale.ROOT);
        String pickupOtp = String.valueOf(100000 + OTP_RNG.nextInt(900000));
        String deliveryOtp = String.valueOf(100000 + OTP_RNG.nextInt(900000));
        String escrowStatus = "CASH".equalsIgnoreCase(req.paymentMethod()) ? "COD_TRACKED" : "HELD_IN_ESCROW";

        DeliveryRequest d = new DeliveryRequest();
        d.setTrackingCode(trackingCode);
        d.setRequestType(req.requestType().toUpperCase(Locale.ROOT));
        d.setCustomerUid(principal.uid());
        d.setCustomerName(principal.account().getFullName());
        d.setPickupLocation(req.pickupLocation().trim());
        d.setPickupLat(req.pickupLat());
        d.setPickupLng(req.pickupLng());
        d.setPickupPlaceId(req.pickupPlaceId());
        d.setDestinationLocation(req.destinationLocation().trim());
        d.setDestinationLat(req.destinationLat());
        d.setDestinationLng(req.destinationLng());
        d.setDestinationPlaceId(req.destinationPlaceId());
        d.setPackageOrRideDetails(req.packageOrRideDetails().trim());
        d.setReceiverName(req.receiverName() != null ? req.receiverName().trim() : null);
        d.setReceiverPhone(req.receiverPhone() != null ? req.receiverPhone().trim() : null);
        d.setDeclaredValue(req.declaredValue() != null ? req.declaredValue().max(BigDecimal.ZERO).setScale(2, RoundingMode.HALF_UP) : BigDecimal.ZERO);
        d.setVehicleType(req.vehicleType().toUpperCase(Locale.ROOT));
        d.setUrgency(req.urgency().toUpperCase(Locale.ROOT));
        d.setDistanceKm(BigDecimal.valueOf(dist).setScale(2, RoundingMode.HALF_UP));
        d.setPriceBreakdown(breakdown);
        d.setTaxAmount(taxAmount);
        d.setTotalFee(totalFee);
        d.setCurrency("ETB");
        d.setPaymentMethod(req.paymentMethod());
        d.setPickupOtp(pickupOtp);
        d.setDeliveryOtp(deliveryOtp);
        d.setEscrowStatus(escrowStatus);
        d.setEscrowAmount(totalFee);
        d.setStatus("REQUESTED");
        d = deliveryRepo.save(d);

        BigDecimal commissionRateBd = BigDecimal.valueOf(commissionRate).setScale(2, RoundingMode.HALF_UP);
        BigDecimal commissionAmt = taxableAmount.multiply(commissionRateBd).divide(BigDecimal.valueOf(100), 2, RoundingMode.HALF_UP);
        BigDecimal providerAmt = totalFee.subtract(commissionAmt).subtract(taxAmount).setScale(2, RoundingMode.HALF_UP);
        BigDecimal whtAmt = taxableAmount.compareTo(new BigDecimal("3000.00")) >= 0
                ? taxableAmount.multiply(new BigDecimal("0.02")).setScale(2, RoundingMode.HALF_UP) : BigDecimal.ZERO;

        CommissionRecord cr = new CommissionRecord();
        cr.setTransactionRef(trackingCode);
        cr.setTransactionType(d.getRequestType());
        cr.setBusinessId(null);
        cr.setGrossAmount(totalFee);
        cr.setTaxableAmount(taxableAmount);
        cr.setVatAmount(taxAmount);
        cr.setWithholdingTaxAmount(whtAmt);
        cr.setCommissionRate(commissionRateBd);
        cr.setCommissionAmount(commissionAmt);
        cr.setProviderAmount(providerAmt);
        cr.setFiscalReceiptNumber("ETH-MOR-" + LocalDate.now().getYear() + "-" + (100000 + OTP_RNG.nextInt(900000)));
        cr.setTaxPeriod(YearMonth.now().toString());
        cr.setCurrency("ETB");
        cr.setPaymentMethod(req.paymentMethod());
        cr.setStatus("RECORDED");
        commissionRepo.save(cr);

        AuditLog log = new AuditLog();
        log.setActorUid(principal.uid());
        log.setActorEmail(principal.email());
        log.setAction(d.getRequestType() + "_REQUESTED");
        log.setEntityType("delivery");
        log.setEntityId(trackingCode);
        log.setDetails(Map.of("totalFee", totalFee, "distanceKm", dist, "escrowStatus", escrowStatus));
        auditLogRepo.save(log);

        return d;
    }

    @Transactional
    public Map<String, Object> transitionDelivery(
            UserPrincipal principal,
            Long id,
            String status,
            String otp,
            BigDecimal driverLat,
            BigDecimal driverLng
    ) {
        DeliveryRequest existing = deliveryRepo.findById(id)
                .orElseThrow(() -> new ApiException(HttpStatus.NOT_FOUND, "Delivery request not found."));

        if (!principal.isAdmin() && ("DISPUTED".equalsIgnoreCase(existing.getStatus()) || "FROZEN_DISPUTE".equalsIgnoreCase(existing.getEscrowStatus()))) {
            throw new ApiException(HttpStatus.CONFLICT, "Escrow Frozen: This delivery is locked under an active conflict/dispute pending Admin resolution.");
        }

        boolean isVerifiedPartner = principal.isAdmin()
                || principal.hasRole("DELIVERY_PARTNER")
                || "VERIFIED".equalsIgnoreCase(principal.account().getProviderVerificationStatus());

        if ("ASSIGNED".equalsIgnoreCase(status)) {
            if (!isVerifiedPartner) {
                throw new ApiException(HttpStatus.FORBIDDEN,
                        "Registration Required: Only verified registered partners or drivers can accept jobs.");
            }
            if (!principal.isAdmin() && principal.uid().equals(existing.getCustomerUid())) {
                throw new ApiException(HttpStatus.BAD_REQUEST, "You cannot accept your own delivery request.");
            }
            if (!principal.isAdmin() && existing.getPickupLat() != null && existing.getPickupLng() != null) {
                ProviderRegistration reg = providerRepo.findFirstByUserUidOrderByUpdatedAtDesc(principal.uid()).orElse(null);
                Double effLat = driverLat != null ? driverLat.doubleValue() : (reg != null && reg.getLatitude() != null ? reg.getLatitude().doubleValue() : null);
                Double effLng = driverLng != null ? driverLng.doubleValue() : (reg != null && reg.getLongitude() != null ? reg.getLongitude().doubleValue() : null);
                if (effLat == null || effLng == null) {
                    throw new ApiException(HttpStatus.BAD_REQUEST, "Real-time GPS Required before claiming a job.");
                }
                double radiusKm = getMatchRadiusKm();
                double distKm = haversineKm(effLat, effLng, existing.getPickupLat().doubleValue(), existing.getPickupLng().doubleValue());
                if (distKm > radiusKm) {
                    throw new ApiException(HttpStatus.FORBIDDEN, "Pickup distance exceeds Admin configured radius of " + radiusKm + " km.");
                }
            }
            int updatedRows = deliveryRepo.claimDeliveryAtomically(id, principal.uid(), principal.account().getFullName(), driverLat, driverLng, Instant.now());
            if (updatedRows == 0) {
                throw new ApiException(HttpStatus.CONFLICT, "Conflict Prevented: Another delivery partner already claimed this job.");
            }
            DeliveryRequest claimed = deliveryRepo.findById(id).orElseThrow();
            AuditLog log = new AuditLog();
            log.setActorUid(principal.uid());
            log.setActorEmail(principal.email());
            log.setAction("DELIVERY_ASSIGNED");
            log.setEntityType("delivery");
            log.setEntityId(String.valueOf(id));
            log.setDetails(Map.of("status", "ASSIGNED", "driverUid", principal.uid()));
            auditLogRepo.save(log);
            liveChatBroker.broadcastDeliveryEvent(claimed, principal.uid(), "ASSIGNED");
            return sanitizeForViewer(claimed, principal, null);
        }

        switch (status) {
            case "PICKED_UP" -> {
                if (!principal.isAdmin() && !principal.uid().equals(existing.getDriverUid())) {
                    throw new ApiException(HttpStatus.FORBIDDEN,
                            "Permission denied: only the assigned delivery partner can confirm pickup.");
                }
                if (!"ASSIGNED".equalsIgnoreCase(existing.getStatus())) {
                    throw new ApiException(HttpStatus.BAD_REQUEST,
                            "Invalid workflow transition from " + existing.getStatus() + " to PICKED_UP.");
                }
                if (!principal.isAdmin() && existing.getPickupOtp() != null && !existing.getPickupOtp().equals(otp == null ? "" : otp.trim())) {
                    throw new ApiException(HttpStatus.BAD_REQUEST,
                            "Anti-Theft Verification Failed: Invalid 6-digit Sender Pickup OTP.");
                }
                existing.setPickupConfirmedAt(Instant.now());
            }
            case "COMPLETED" -> {
                if (!principal.isAdmin() && !principal.uid().equals(existing.getDriverUid())) {
                    throw new ApiException(HttpStatus.FORBIDDEN,
                            "Permission denied: only the assigned delivery partner can confirm drop-off.");
                }
                if (!"PICKED_UP".equalsIgnoreCase(existing.getStatus())) {
                    throw new ApiException(HttpStatus.BAD_REQUEST,
                            "Invalid workflow transition from " + existing.getStatus() + " to COMPLETED.");
                }
                if (!principal.isAdmin() && existing.getDeliveryOtp() != null && !existing.getDeliveryOtp().equals(otp == null ? "" : otp.trim())) {
                    throw new ApiException(HttpStatus.BAD_REQUEST,
                            "Escrow Release Blocked: Enter the exact 6-digit Receiver Delivery OTP to unlock payment.");
                }
                existing.setDeliveredConfirmedAt(Instant.now());
                existing.setEscrowStatus("RELEASED");
            }
            case "CANCELLED" -> {
                if (!principal.isAdmin()
                        && !principal.uid().equals(existing.getCustomerUid())
                        && !principal.uid().equals(existing.getDriverUid())) {
                    throw new ApiException(HttpStatus.FORBIDDEN, "Permission denied.");
                }
                if (!principal.isAdmin() && "PICKED_UP".equalsIgnoreCase(existing.getStatus())) {
                    throw new ApiException(HttpStatus.BAD_REQUEST,
                            "Cargo is already in transit (PICKED_UP). Open a Conflict / Freeze Escrow case instead.");
                }
                existing.setEscrowStatus("CASH".equalsIgnoreCase(existing.getPaymentMethod()) ? "CANCELLED" : "REFUNDED");
            }
            default -> throw new ApiException(HttpStatus.BAD_REQUEST, "Unsupported delivery status transition.");
        }

        existing.setStatus(status);
        DeliveryRequest saved = deliveryRepo.save(existing);

        AuditLog log = new AuditLog();
        log.setActorUid(principal.uid());
        log.setActorEmail(principal.email());
        log.setAction("DELIVERY_" + status);
        log.setEntityType("delivery");
        log.setEntityId(String.valueOf(id));
        log.setDetails(Map.of("status", status, "escrowStatus", saved.getEscrowStatus()));
        auditLogRepo.save(log);

        liveChatBroker.broadcastDeliveryEvent(saved, principal.uid(), status);
        return sanitizeForViewer(saved, principal, null);
    }

    @Transactional
    public Map<String, Object> disputeDelivery(UserPrincipal principal, Long id, String reason, String category) {
        DeliveryRequest existing = deliveryRepo.findById(id)
                .orElseThrow(() -> new ApiException(HttpStatus.NOT_FOUND, "Delivery request not found."));
        if (!principal.isAdmin() && !principal.uid().equals(existing.getCustomerUid()) && !principal.uid().equals(existing.getDriverUid())) {
            throw new ApiException(HttpStatus.FORBIDDEN, "Only the sender, assigned driver, or admin can raise a conflict.");
        }
        if ("COMPLETED".equalsIgnoreCase(existing.getStatus()) || "CANCELLED".equalsIgnoreCase(existing.getStatus())) {
            throw new ApiException(HttpStatus.BAD_REQUEST, "Closed deliveries cannot be disputed.");
        }
        String role = principal.isAdmin() ? "ADMIN" : (principal.uid().equals(existing.getDriverUid()) ? "DRIVER" : "SENDER");
        existing.setStatus("DISPUTED");
        existing.setEscrowStatus("FROZEN_DISPUTE");
        existing.setDisputeReason(reason.trim());
        existing.setConflictStatus("OPEN");
        existing.setConflictCategory(category != null && !category.isBlank() ? category : "HANDOVER_DISPUTE");
        existing.setConflictRaisedByUid(principal.uid());
        existing.setConflictRaisedByRole(role);
        DeliveryRequest saved = deliveryRepo.save(existing);

        AuditLog log = new AuditLog();
        log.setActorUid(principal.uid());
        log.setActorEmail(principal.email());
        log.setAction("DELIVERY_CONFLICT_OPENED");
        log.setEntityType("delivery");
        log.setEntityId(String.valueOf(id));
        log.setDetails(Map.of("trackingCode", saved.getTrackingCode(), "reason", saved.getDisputeReason()));
        auditLogRepo.save(log);

        liveChatBroker.broadcastDeliveryEvent(saved, principal.uid(), "DISPUTED");
        return sanitizeForViewer(saved, principal, null);
    }

    @Transactional
    public Map<String, Object> submitConflictStatement(UserPrincipal principal, Long id, String statement) {
        DeliveryRequest existing = deliveryRepo.findById(id)
                .orElseThrow(() -> new ApiException(HttpStatus.NOT_FOUND, "Delivery request not found."));
        if (!principal.isAdmin() && !principal.uid().equals(existing.getCustomerUid()) && !principal.uid().equals(existing.getDriverUid())) {
            throw new ApiException(HttpStatus.FORBIDDEN, "Permission denied.");
        }
        existing.setConflictCounterStatement(statement.trim());
        existing.setConflictStatus("UNDER_REVIEW");
        DeliveryRequest saved = deliveryRepo.save(existing);
        liveChatBroker.broadcastDeliveryEvent(saved, principal.uid(), "CONFLICT_STATEMENT");
        return sanitizeForViewer(saved, principal, null);
    }

    public Map<String, Object> sanitizeForViewer(DeliveryRequest d, UserPrincipal principal, Double distanceToPickupKm) {
        boolean canSeeSecretOtps = principal.isAdmin() || d.getCustomerUid().equals(principal.uid());
        Map<String, Object> map = new LinkedHashMap<>();
        map.put("id", d.getId());
        map.put("trackingCode", d.getTrackingCode());
        map.put("requestType", d.getRequestType());
        map.put("customerUid", d.getCustomerUid());
        map.put("customerName", d.getCustomerName());
        map.put("driverUid", d.getDriverUid());
        map.put("driverName", d.getDriverName());
        map.put("pickupLocation", d.getPickupLocation());
        map.put("pickupLat", d.getPickupLat());
        map.put("pickupLng", d.getPickupLng());
        map.put("pickupPlaceId", d.getPickupPlaceId());
        map.put("destinationLocation", d.getDestinationLocation());
        map.put("destinationLat", d.getDestinationLat());
        map.put("destinationLng", d.getDestinationLng());
        map.put("destinationPlaceId", d.getDestinationPlaceId());
        map.put("packageOrRideDetails", d.getPackageOrRideDetails());
        map.put("receiverName", d.getReceiverName());
        map.put("receiverPhone", d.getReceiverPhone());
        map.put("declaredValue", d.getDeclaredValue());
        map.put("vehicleType", d.getVehicleType());
        map.put("urgency", d.getUrgency());
        map.put("distanceKm", d.getDistanceKm());
        map.put("priceBreakdown", d.getPriceBreakdown());
        map.put("taxAmount", d.getTaxAmount());
        map.put("totalFee", d.getTotalFee());
        map.put("currency", d.getCurrency());
        map.put("paymentMethod", d.getPaymentMethod());
        map.put("pickupOtp", canSeeSecretOtps ? d.getPickupOtp() : null);
        map.put("deliveryOtp", canSeeSecretOtps ? d.getDeliveryOtp() : null);
        map.put("pickupOtpRequired", d.getPickupOtp() != null);
        map.put("deliveryOtpRequired", d.getDeliveryOtp() != null);
        map.put("escrowStatus", d.getEscrowStatus());
        map.put("escrowAmount", d.getEscrowAmount());
        map.put("pickupConfirmedAt", d.getPickupConfirmedAt());
        map.put("deliveredConfirmedAt", d.getDeliveredConfirmedAt());
        map.put("driverLat", d.getDriverLat());
        map.put("driverLng", d.getDriverLng());
        map.put("driverLocationUpdatedAt", d.getDriverLocationUpdatedAt());
        map.put("disputeReason", d.getDisputeReason());
        map.put("conflictStatus", d.getConflictStatus());
        map.put("conflictCategory", d.getConflictCategory());
        map.put("conflictRaisedByUid", d.getConflictRaisedByUid());
        map.put("conflictRaisedByRole", d.getConflictRaisedByRole());
        map.put("conflictCounterStatement", d.getConflictCounterStatement());
        map.put("conflictResolution", d.getConflictResolution());
        map.put("conflictResolvedAt", d.getConflictResolvedAt());
        map.put("distanceToPickupKm", distanceToPickupKm);
        map.put("status", d.getStatus());
        map.put("createdAt", d.getCreatedAt());
        return map;
    }

    private double haversineKm(double lat1, double lon1, double lat2, double lon2) {
        double r = 6371.0;
        double dLat = Math.toRadians(lat2 - lat1);
        double dLon = Math.toRadians(lon2 - lon1);
        double a = Math.sin(dLat / 2) * Math.sin(dLat / 2)
                + Math.cos(Math.toRadians(lat1)) * Math.cos(Math.toRadians(lat2))
                * Math.sin(dLon / 2) * Math.sin(dLon / 2);
        return Math.max(0.5, Math.round(r * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a)) * 100.0) / 100.0);
    }

    private double toDouble(Object value, double fallback) {
        if (value instanceof Number n) return n.doubleValue();
        return fallback;
    }
}
