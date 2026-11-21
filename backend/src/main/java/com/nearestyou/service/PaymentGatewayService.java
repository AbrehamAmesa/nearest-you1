package com.nearestyou.service;

import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.nearestyou.dto.NearestYouDtos.*;
import com.nearestyou.entity.*;
import com.nearestyou.exception.ApiException;
import com.nearestyou.repository.*;
import com.nearestyou.security.UserPrincipal;
import com.nearestyou.websocket.LiveChatBroker;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import javax.crypto.Mac;
import javax.crypto.spec.SecretKeySpec;
import java.math.BigDecimal;
import java.math.RoundingMode;
import java.net.URI;
import java.net.URLEncoder;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.time.Duration;
import java.time.Instant;
import java.util.*;

@Service
public class PaymentGatewayService {

    private static final Logger log = LoggerFactory.getLogger(PaymentGatewayService.class);
    private static final long BANK_CACHE_TTL_MS = 60L * 60L * 1000L;

    private static final List<Map<String, String>> DEFAULT_ETHIOPIAN_BANKS = List.of(
            Map.of("code", "128", "name", "Commercial Bank of Ethiopia (CBE)", "currency", "ETB"),
            Map.of("code", "855", "name", "telebirr (Ethio Telecom)", "currency", "ETB"),
            Map.of("code", "856", "name", "CBEBirr", "currency", "ETB"),
            Map.of("code", "80", "name", "Awash Bank", "currency", "ETB"),
            Map.of("code", "31", "name", "Dashen Bank", "currency", "ETB"),
            Map.of("code", "130", "name", "Bank of Abyssinia", "currency", "ETB"),
            Map.of("code", "146", "name", "Wegagen Bank", "currency", "ETB"),
            Map.of("code", "140", "name", "Hibret Bank", "currency", "ETB"),
            Map.of("code", "138", "name", "Nib International Bank", "currency", "ETB"),
            Map.of("code", "147", "name", "Zemen Bank", "currency", "ETB"),
            Map.of("code", "134", "name", "Enat Bank", "currency", "ETB"),
            Map.of("code", "141", "name", "Oromia International Bank", "currency", "ETB"),
            Map.of("code", "127", "name", "Berhan Bank", "currency", "ETB"),
            Map.of("code", "125", "name", "Abay Bank", "currency", "ETB"),
            Map.of("code", "129", "name", "Bunna Bank", "currency", "ETB"),
            Map.of("code", "136", "name", "Lion International Bank", "currency", "ETB")
    );

    private final PaymentTransactionRepository paymentRepo;
    private final CustomerOrderRepository orderRepo;
    private final BookingRepository bookingRepo;
    private final DeliveryRequestRepository deliveryRepo;
    private final BusinessRepository businessRepo;
    private final UserAccountRepository userRepo;
    private final CommissionRecordRepository commissionRepo;
    private final PlatformSettingRepository settingRepo;
    private final ServiceListingRepository listingRepo;
    private final AuditLogRepository auditLogRepo;
    private final LiveChatBroker liveChatBroker;

    private final ObjectMapper objectMapper = new ObjectMapper();
    private final HttpClient httpClient = HttpClient.newBuilder()
            .connectTimeout(Duration.ofSeconds(8))
            .followRedirects(HttpClient.Redirect.NORMAL)
            .build();

    private volatile List<Map<String, String>> cachedBanks = DEFAULT_ETHIOPIAN_BANKS;
    private volatile long banksCacheExpiresAtMs = 0L;

    @Value("${nearestyou.payments.public-app-base-url:http://localhost:3000}")
    private String publicAppBaseUrl;

    @Value("${nearestyou.payments.chapa.base-url:https://api.chapa.co/v1}")
    private String chapaBaseUrl;

    @Value("${nearestyou.payments.chapa.secret-key:}")
    private String chapaSecretKey;

    @Value("${nearestyou.payments.chapa.webhook-secret:}")
    private String chapaWebhookSecret;

    @Value("${nearestyou.payments.payo.base-url:https://payment.et}")
    private String payoBaseUrl;

    @Value("${nearestyou.payments.payo.api-key:}")
    private String payoApiKey;

    @Value("${nearestyou.payments.payo.merchant-id:}")
    private String payoMerchantId;

    @Value("${nearestyou.payments.payo.webhook-secret:}")
    private String payoWebhookSecret;

    public PaymentGatewayService(
            PaymentTransactionRepository paymentRepo,
            CustomerOrderRepository orderRepo,
            BookingRepository bookingRepo,
            DeliveryRequestRepository deliveryRepo,
            BusinessRepository businessRepo,
            UserAccountRepository userRepo,
            CommissionRecordRepository commissionRepo,
            PlatformSettingRepository settingRepo,
            ServiceListingRepository listingRepo,
            AuditLogRepository auditLogRepo,
            LiveChatBroker liveChatBroker
    ) {
        this.paymentRepo = paymentRepo;
        this.orderRepo = orderRepo;
        this.bookingRepo = bookingRepo;
        this.deliveryRepo = deliveryRepo;
        this.businessRepo = businessRepo;
        this.userRepo = userRepo;
        this.commissionRepo = commissionRepo;
        this.settingRepo = settingRepo;
        this.listingRepo = listingRepo;
        this.auditLogRepo = auditLogRepo;
        this.liveChatBroker = liveChatBroker;
    }

    private boolean isChapaLiveConfigured() {
        return chapaSecretKey != null && !chapaSecretKey.isBlank();
    }

    private boolean isPayoLiveConfigured() {
        return payoApiKey != null && !payoApiKey.isBlank();
    }

    private String cleanChapaUrl(String path) {
        String base = (chapaBaseUrl == null || chapaBaseUrl.isBlank())
                ? "https://api.chapa.co/v1"
                : chapaBaseUrl.replaceAll("/+$", "");
        if (!base.endsWith("/v1")) {
            base = base + "/v1";
        }
        return base + path;
    }

    private String cleanPayoUrl(String path) {
        String base = (payoBaseUrl == null || payoBaseUrl.isBlank())
                ? "https://payment.et"
                : payoBaseUrl.replaceAll("/+$", "");
        return base + path;
    }

    private String cleanPublicBaseUrl(String overrideUrl) {
        String base = (overrideUrl != null && !overrideUrl.isBlank())
                ? overrideUrl.trim()
                : ((publicAppBaseUrl != null && !publicAppBaseUrl.isBlank()) ? publicAppBaseUrl.trim() : "http://localhost:3000");
        return base.replaceAll("/+$", "");
    }

    public Map<String, Object> getPlatformCommissionAccountSnapshot() {
        Map<String, Object> defaults = new LinkedHashMap<>();
        defaults.put("accountHolderName", "Nearest You Platform Commission Pool");
        defaults.put("bankCode", "128");
        defaults.put("bankName", "Commercial Bank of Ethiopia (CBE)");
        defaults.put("accountNumber", "1000458921403");
        defaults.put("telebirrNumber", "+251911000111");
        defaults.put("chapaSettlementLabel", "Nearest You Master Chapa Settlement");
        defaults.put("payoAccountHandle", "NY-PLATFORM-COMM-01");
        defaults.put("chapaEnabled", true);
        defaults.put("payoEnabled", true);

        settingRepo.findBySettingKey("platform_commission_account").ifPresent(ps -> {
            if (ps.getSettingValue() != null) {
                ps.getSettingValue().forEach((k, v) -> {
                    if (v != null) defaults.put(k, v);
                });
            }
        });
        return defaults;
    }

    public List<Map<String, String>> getEthiopianBanks() {
        long now = System.currentTimeMillis();
        if (now < banksCacheExpiresAtMs && cachedBanks != null && !cachedBanks.isEmpty()) {
            return cachedBanks;
        }
        if (isChapaLiveConfigured()) {
            try {
                HttpRequest request = HttpRequest.newBuilder()
                        .uri(URI.create(cleanChapaUrl("/banks")))
                        .timeout(Duration.ofSeconds(6))
                        .header("Authorization", "Bearer " + chapaSecretKey.trim())
                        .GET()
                        .build();
                HttpResponse<String> resp = httpClient.send(request, HttpResponse.BodyHandlers.ofString());
                if (resp.statusCode() >= 200 && resp.statusCode() < 300) {
                    JsonNode root = objectMapper.readTree(resp.body());
                    JsonNode data = root.path("data");
                    if (data.isArray() && !data.isEmpty()) {
                        List<Map<String, String>> live = new ArrayList<>();
                        for (JsonNode b : data) {
                            String code = b.hasNonNull("id") ? b.get("id").asText()
                                    : (b.hasNonNull("code") ? b.get("code").asText() : "");
                            String name = b.hasNonNull("name") ? b.get("name").asText() : "";
                            String currency = b.hasNonNull("currency") ? b.get("currency").asText() : "ETB";
                            if (!code.isBlank() && !name.isBlank()) {
                                live.add(Map.of("code", code, "name", name, "currency", currency));
                            }
                        }
                        if (!live.isEmpty()) {
                            cachedBanks = live;
                            banksCacheExpiresAtMs = now + BANK_CACHE_TTL_MS;
                            return cachedBanks;
                        }
                    }
                }
            } catch (Exception ex) {
                log.debug("Falling back to static Ethiopian banks directory: {}", ex.getMessage());
            }
        }
        banksCacheExpiresAtMs = now + BANK_CACHE_TTL_MS;
        return cachedBanks;
    }

    @Transactional(readOnly = true)
    public Map<String, Object> getPublicPaymentConfig() {
        Map<String, Object> platformAcc = getPlatformCommissionAccountSnapshot();
        boolean chapaEnabled = !(platformAcc.get("chapaEnabled") instanceof Boolean b) || b;
        boolean payoEnabled = !(platformAcc.get("payoEnabled") instanceof Boolean b2) || b2;

        Map<String, Object> out = new LinkedHashMap<>();
        out.put("platformCommissionAccount", platformAcc);
        out.put("banks", getEthiopianBanks());
        out.put("gateways", Map.of(
                "chapa", Map.of(
                        "enabled", chapaEnabled,
                        "mode", isChapaLiveConfigured() ? "LIVE" : "SANDBOX"
                ),
                "payo", Map.of(
                        "enabled", payoEnabled,
                        "mode", isPayoLiveConfigured() ? "LIVE" : "SANDBOX"
                )
        ));
        return out;
    }

    @Transactional
    public PlatformSetting updatePlatformCommissionAccount(UserPrincipal admin, PlatformCommissionAccountRequest req) {
        PlatformSetting setting = settingRepo.findBySettingKey("platform_commission_account")
                .orElseGet(PlatformSetting::new);
        setting.setSettingKey("platform_commission_account");

        Map<String, Object> value = new LinkedHashMap<>();
        value.put("accountHolderName", req.accountHolderName().trim());
        value.put("bankCode", req.bankCode() != null && !req.bankCode().isBlank() ? req.bankCode().trim() : "128");
        value.put("bankName", req.bankName() != null && !req.bankName().isBlank() ? req.bankName().trim() : resolveBankName(req.bankCode()));
        value.put("accountNumber", req.accountNumber() != null ? req.accountNumber().trim() : "");
        value.put("telebirrNumber", req.telebirrNumber() != null ? req.telebirrNumber().trim() : "");
        value.put("chapaSettlementLabel", req.chapaSettlementLabel() != null && !req.chapaSettlementLabel().isBlank()
                ? req.chapaSettlementLabel().trim() : "Nearest You Master Chapa Settlement");
        value.put("payoAccountHandle", req.payoAccountHandle() != null ? req.payoAccountHandle().trim() : "");
        value.put("chapaEnabled", req.chapaEnabled() == null || req.chapaEnabled());
        value.put("payoEnabled", req.payoEnabled() == null || req.payoEnabled());
        setting.setSettingValue(value);

        PlatformSetting saved = settingRepo.save(setting);
        recordAudit(admin, "PLATFORM_COMMISSION_ACCOUNT_UPDATED", "platform_settings", "platform_commission_account", value);
        return saved;
    }

    @Transactional
    public Business updateBusinessPayoutAccount(UserPrincipal principal, Long businessId, PayoutAccountRequest req) {
        Business biz = businessRepo.findById(businessId)
                .orElseThrow(() -> new ApiException(HttpStatus.NOT_FOUND, "Business not found."));
        if (!principal.isAdmin() && !principal.uid().equals(biz.getOwnerUid())) {
            throw new ApiException(HttpStatus.FORBIDDEN, "Only the business owner can configure payout accounts.");
        }

        String bankCode = trimOrNull(req.bankCode());
        String bankName = trimOrNull(req.bankName());
        if (bankName == null && bankCode != null) {
            bankName = resolveBankName(bankCode);
        }
        String accountNumber = trimOrNull(req.accountNumber());
        String accountName = trimOrNull(req.accountName());
        if (accountName == null && accountNumber != null) {
            accountName = biz.getBusinessName();
        }

        biz.setPayoutBankCode(bankCode);
        biz.setPayoutBankName(bankName);
        biz.setPayoutAccountNumber(accountNumber);
        biz.setPayoutAccountName(accountName);
        biz.setPayoutTelebirrNumber(trimOrNull(req.telebirrNumber()));
        biz.setPayoAccountHandle(trimOrNull(req.payoAccountHandle()));
        biz.setPreferredPayoutGateway(normalizePreferredGateway(req.preferredPayoutGateway()));

        String subId = provisionChapaSubaccountIfPossible(
                biz.getBusinessName(),
                accountName != null ? accountName : biz.getBusinessName(),
                bankCode,
                accountNumber,
                "SUB-NY-BIZ-" + biz.getId(),
                biz.getChapaSubaccountId()
        );
        biz.setChapaSubaccountId(subId);

        Business saved = businessRepo.save(biz);
        recordAudit(principal, "BUSINESS_PAYOUT_ACCOUNT_UPDATED", "business", String.valueOf(saved.getId()), Map.of(
                "businessName", saved.getBusinessName(),
                "bankCode", bankCode != null ? bankCode : "",
                "chapaSubaccountId", subId != null ? subId : "",
                "payoAccountHandle", saved.getPayoAccountHandle() != null ? saved.getPayoAccountHandle() : ""
        ));
        return saved;
    }

    @Transactional
    public UserAccount updatePersonalPayoutAccount(UserPrincipal principal, PayoutAccountRequest req) {
        UserAccount user = userRepo.findByUid(principal.uid())
                .orElseThrow(() -> new ApiException(HttpStatus.NOT_FOUND, "User profile not found."));

        String bankCode = trimOrNull(req.bankCode());
        String bankName = trimOrNull(req.bankName());
        if (bankName == null && bankCode != null) {
            bankName = resolveBankName(bankCode);
        }
        String accountNumber = trimOrNull(req.accountNumber());
        String accountName = trimOrNull(req.accountName());
        if (accountName == null && accountNumber != null) {
            accountName = user.getFullName();
        }

        user.setPayoutBankCode(bankCode);
        user.setPayoutBankName(bankName);
        user.setPayoutAccountNumber(accountNumber);
        user.setPayoutAccountName(accountName);
        user.setPayoutTelebirrNumber(trimOrNull(req.telebirrNumber()));
        user.setPayoAccountHandle(trimOrNull(req.payoAccountHandle()));
        user.setPreferredPayoutGateway(normalizePreferredGateway(req.preferredPayoutGateway()));

        String subId = provisionChapaSubaccountIfPossible(
                user.getFullName(),
                accountName != null ? accountName : user.getFullName(),
                bankCode,
                accountNumber,
                "SUB-NY-USR-" + user.getId(),
                user.getChapaSubaccountId()
        );
        user.setChapaSubaccountId(subId);

        UserAccount saved = userRepo.save(user);
        recordAudit(principal, "USER_PAYOUT_ACCOUNT_UPDATED", "user", saved.getUid(), Map.of(
                "bankCode", bankCode != null ? bankCode : "",
                "chapaSubaccountId", subId != null ? subId : "",
                "payoAccountHandle", saved.getPayoAccountHandle() != null ? saved.getPayoAccountHandle() : ""
        ));
        return saved;
    }

    @Transactional
    public PaymentTransaction initializePayment(UserPrincipal principal, InitializePaymentRequest req) {
        String gateway = req.gateway().trim().toUpperCase(Locale.ROOT);
        if (!Set.of("CHAPA", "PAYO").contains(gateway)) {
            throw new ApiException(HttpStatus.BAD_REQUEST, "Gateway must be CHAPA or PAYO.");
        }
        String txType = req.transactionType().trim().toUpperCase(Locale.ROOT);
        if (!Set.of("ORDER", "BOOKING", "DELIVERY", "RIDE").contains(txType)) {
            throw new ApiException(HttpStatus.BAD_REQUEST, "Transaction type must be ORDER, BOOKING, DELIVERY, or RIDE.");
        }

        Map<String, Object> platformAcc = getPlatformCommissionAccountSnapshot();
        boolean chapaEnabled = !(platformAcc.get("chapaEnabled") instanceof Boolean b) || b;
        boolean payoEnabled = !(platformAcc.get("payoEnabled") instanceof Boolean b2) || b2;
        if ("CHAPA".equals(gateway) && !chapaEnabled) {
            throw new ApiException(HttpStatus.BAD_REQUEST, "Chapa checkout is currently disabled by Platform Admin.");
        }
        if ("PAYO".equals(gateway) && !payoEnabled) {
            throw new ApiException(HttpStatus.BAD_REQUEST, "Payo checkout is currently disabled by Platform Admin.");
        }

        String referenceCode;
        String customerUid;
        String customerName;
        String providerUid = null;
        Long businessId = null;
        BigDecimal grossAmount;
        BigDecimal commissionAmount;
        BigDecimal providerAmount;
        BigDecimal taxAmount;
        String chapaSubaccountId = null;
        Map<String, Object> providerSnapshot;

        if ("ORDER".equals(txType)) {
            CustomerOrder order = orderRepo.findById(req.referenceId())
                    .orElseThrow(() -> new ApiException(HttpStatus.NOT_FOUND, "Order not found."));
            if (!principal.isAdmin() && !principal.uid().equals(order.getCustomerUid())) {
                throw new ApiException(HttpStatus.FORBIDDEN, "Permission denied for this order.");
            }
            if ("SUCCESSFUL".equalsIgnoreCase(order.getPaymentStatus())) {
                throw new ApiException(HttpStatus.BAD_REQUEST, "This order is already paid.");
            }
            Business biz = businessRepo.findById(order.getBusinessId())
                    .orElseThrow(() -> new ApiException(HttpStatus.NOT_FOUND, "Vendor business not found."));

            referenceCode = order.getOrderNumber();
            customerUid = order.getCustomerUid();
            customerName = order.getCustomerName();
            providerUid = biz.getOwnerUid();
            businessId = biz.getId();
            grossAmount = order.getTotalAmount();
            taxAmount = order.getTaxAmount();

            CommissionRecord cr = commissionRepo.findByTransactionRef(referenceCode).orElse(null);
            commissionAmount = cr != null && cr.getCommissionAmount() != null
                    ? cr.getCommissionAmount()
                    : grossAmount.multiply(new BigDecimal("0.10")).setScale(2, RoundingMode.HALF_UP);
            providerAmount = cr != null && cr.getProviderAmount() != null
                    ? cr.getProviderAmount()
                    : grossAmount.subtract(commissionAmount).setScale(2, RoundingMode.HALF_UP);

            if (biz.getPayoutAccountNumber() != null && !biz.getPayoutAccountNumber().isBlank()
                    && (biz.getChapaSubaccountId() == null || biz.getChapaSubaccountId().isBlank())) {
                String provisioned = provisionChapaSubaccountIfPossible(
                        biz.getBusinessName(),
                        biz.getPayoutAccountName() != null ? biz.getPayoutAccountName() : biz.getBusinessName(),
                        biz.getPayoutBankCode(),
                        biz.getPayoutAccountNumber(),
                        "SUB-NY-BIZ-" + biz.getId(),
                        null
                );
                if (provisioned != null) {
                    biz.setChapaSubaccountId(provisioned);
                    businessRepo.save(biz);
                }
            }

            UserAccount ownerUser = userRepo.findByUid(biz.getOwnerUid()).orElse(null);
            chapaSubaccountId = biz.getChapaSubaccountId() != null ? biz.getChapaSubaccountId()
                    : (ownerUser != null ? ownerUser.getChapaSubaccountId() : null);
            providerSnapshot = buildBusinessPayoutSnapshot(biz, ownerUser);

            if (!gateway.equalsIgnoreCase(order.getPaymentMethod())) {
                order.setPaymentMethod(gateway);
                orderRepo.save(order);
            }
        } else if ("BOOKING".equals(txType)) {
            Booking booking = bookingRepo.findById(req.referenceId())
                    .orElseThrow(() -> new ApiException(HttpStatus.NOT_FOUND, "Booking not found."));
            if (!principal.isAdmin() && !principal.uid().equals(booking.getCustomerUid())) {
                throw new ApiException(HttpStatus.FORBIDDEN, "Permission denied for this booking.");
            }
            if ("SUCCESSFUL".equalsIgnoreCase(booking.getPaymentStatus())) {
                throw new ApiException(HttpStatus.BAD_REQUEST, "This booking is already paid.");
            }
            Business biz = businessRepo.findById(booking.getBusinessId())
                    .orElseThrow(() -> new ApiException(HttpStatus.NOT_FOUND, "Service provider business not found."));

            referenceCode = booking.getBookingReference();
            customerUid = booking.getCustomerUid();
            customerName = booking.getCustomerName();
            providerUid = biz.getOwnerUid();
            businessId = biz.getId();
            grossAmount = booking.getAgreedPrice();

            CommissionRecord cr = commissionRepo.findByTransactionRef(referenceCode).orElse(null);
            commissionAmount = cr != null && cr.getCommissionAmount() != null
                    ? cr.getCommissionAmount()
                    : grossAmount.multiply(new BigDecimal("0.10")).setScale(2, RoundingMode.HALF_UP);
            providerAmount = cr != null && cr.getProviderAmount() != null
                    ? cr.getProviderAmount()
                    : grossAmount.subtract(commissionAmount).setScale(2, RoundingMode.HALF_UP);
            taxAmount = cr != null && cr.getVatAmount() != null ? cr.getVatAmount() : BigDecimal.ZERO;

            UserAccount ownerUser = userRepo.findByUid(biz.getOwnerUid()).orElse(null);
            chapaSubaccountId = biz.getChapaSubaccountId() != null ? biz.getChapaSubaccountId()
                    : (ownerUser != null ? ownerUser.getChapaSubaccountId() : null);
            providerSnapshot = buildBusinessPayoutSnapshot(biz, ownerUser);

            if (!gateway.equalsIgnoreCase(booking.getPaymentMethod())) {
                booking.setPaymentMethod(gateway);
                bookingRepo.save(booking);
            }
        } else {
            DeliveryRequest delivery = deliveryRepo.findById(req.referenceId())
                    .orElseThrow(() -> new ApiException(HttpStatus.NOT_FOUND, "Delivery/Ride request not found."));
            if (!principal.isAdmin() && !principal.uid().equals(delivery.getCustomerUid())) {
                throw new ApiException(HttpStatus.FORBIDDEN, "Permission denied for this dispatch.");
            }
            if ("HELD_IN_ESCROW".equalsIgnoreCase(delivery.getEscrowStatus())
                    || "RELEASED".equalsIgnoreCase(delivery.getEscrowStatus())) {
                throw new ApiException(HttpStatus.BAD_REQUEST, "This dispatch is already funded in escrow.");
            }
            txType = delivery.getRequestType() != null ? delivery.getRequestType().toUpperCase(Locale.ROOT) : "DELIVERY";
            referenceCode = delivery.getTrackingCode();
            customerUid = delivery.getCustomerUid();
            customerName = delivery.getCustomerName();
            providerUid = delivery.getDriverUid();
            grossAmount = delivery.getTotalFee();
            taxAmount = delivery.getTaxAmount();

            CommissionRecord cr = commissionRepo.findByTransactionRef(referenceCode).orElse(null);
            commissionAmount = cr != null && cr.getCommissionAmount() != null
                    ? cr.getCommissionAmount()
                    : grossAmount.multiply(new BigDecimal("0.10")).setScale(2, RoundingMode.HALF_UP);
            providerAmount = cr != null && cr.getProviderAmount() != null
                    ? cr.getProviderAmount()
                    : grossAmount.subtract(commissionAmount).subtract(taxAmount).max(BigDecimal.ZERO).setScale(2, RoundingMode.HALF_UP);

            UserAccount driverUser = providerUid != null ? userRepo.findByUid(providerUid).orElse(null) : null;
            chapaSubaccountId = driverUser != null ? driverUser.getChapaSubaccountId() : null;
            providerSnapshot = buildDriverPayoutSnapshot(driverUser);

            if (!gateway.equalsIgnoreCase(delivery.getPaymentMethod())) {
                delivery.setPaymentMethod(gateway);
                deliveryRepo.save(delivery);
            }
        }

        String txRef = "NY-" + gateway + "-" + UUID.randomUUID().toString().substring(0, 10).toUpperCase(Locale.ROOT);
        String email = (req.customerEmail() != null && !req.customerEmail().isBlank())
                ? req.customerEmail().trim()
                : principal.email();
        String baseReturn = cleanPublicBaseUrl(req.returnUrl());
        String returnWithRef = baseReturn + (baseReturn.contains("?") ? "&" : "?")
                + "paymentTxRef=" + URLEncoder.encode(txRef, StandardCharsets.UTF_8)
                + "&gateway=" + gateway;
        String callbackUrl = cleanPublicBaseUrl(null) + "/api/v1/payments/" + gateway.toLowerCase(Locale.ROOT) + "/webhook";

        PaymentTransaction tx = new PaymentTransaction();
        tx.setTxRef(txRef);
        tx.setGateway(gateway);
        tx.setTransactionType(txType);
        tx.setReferenceId(req.referenceId());
        tx.setReferenceCode(referenceCode);
        tx.setCustomerUid(customerUid);
        tx.setCustomerEmail(email);
        tx.setCustomerName(customerName);
        tx.setProviderUid(providerUid);
        tx.setBusinessId(businessId);
        tx.setCurrency("ETB");
        tx.setGrossAmount(grossAmount.setScale(2, RoundingMode.HALF_UP));
        tx.setCommissionAmount(commissionAmount.setScale(2, RoundingMode.HALF_UP));
        tx.setProviderAmount(providerAmount.setScale(2, RoundingMode.HALF_UP));
        tx.setTaxAmount(taxAmount.setScale(2, RoundingMode.HALF_UP));
        tx.setPlatformCommissionAccountSnapshot(platformAcc);
        tx.setProviderPayoutAccountSnapshot(providerSnapshot);
        tx.setChapaSubaccountId(chapaSubaccountId);
        tx.setCommissionLegStatus("PENDING");
        tx.setProviderLegStatus(Boolean.TRUE.equals(providerSnapshot.get("isConfigured"))
                ? "PENDING"
                : "PENDING_PROVIDER_ACCOUNT_SETUP");

        if ("CHAPA".equals(gateway)) {
            if (isChapaLiveConfigured()) {
                Map<String, Object> initRes = callChapaInitialize(tx, email, customerName, callbackUrl, returnWithRef);
                tx.setGatewayMode("LIVE");
                tx.setGatewayCheckoutUrl(stringVal(initRes.get("checkout_url")));
                tx.setGatewayRawResponse(initRes);
                tx.setStatus("INITIALIZED");
            } else {
                tx.setGatewayMode("SANDBOX");
                tx.setGatewayCheckoutUrl(null);
                tx.setStatus("INITIALIZED");
                tx.setGatewayRawResponse(Map.of(
                        "mode", "SANDBOX",
                        "message", "Chapa sandbox split session ready. Platform commission routes to the single Platform Commission Account and net sales route to the provider's own account."
                ));
            }
        } else {
            if (isPayoLiveConfigured()) {
                Map<String, Object> initRes = callPayoInitialize(tx, email, req.phoneNumber(), callbackUrl, returnWithRef);
                tx.setGatewayMode("LIVE");
                tx.setGatewayCheckoutUrl(stringVal(initRes.get("checkoutUrl")));
                tx.setGatewayTransactionId(stringVal(initRes.get("orderId")));
                tx.setGatewayRawResponse(initRes);
                tx.setStatus("AWAITING_RECEIPT");
            } else {
                tx.setGatewayMode("SANDBOX");
                tx.setGatewayCheckoutUrl(null);
                tx.setStatus("AWAITING_RECEIPT");
                tx.setGatewayRawResponse(Map.of(
                        "mode", "SANDBOX",
                        "message", "Payo dual-leg direct settlement initialized. Transfer Provider Sales leg to the provider's own account and Platform Commission leg to the single Platform Commission Account, then submit receipt confirmation."
                ));
            }
        }

        PaymentTransaction saved = paymentRepo.save(tx);
        updateCommissionSplitMetadata(referenceCode, saved);
        return saved;
    }

    @Transactional
    public PaymentTransaction verifyPayment(UserPrincipal principal, String txRef) {
        PaymentTransaction tx = paymentRepo.findByTxRefIgnoreCase(txRef.trim())
                .orElseThrow(() -> new ApiException(HttpStatus.NOT_FOUND, "Payment transaction not found."));
        if (!principal.isAdmin()
                && !principal.uid().equals(tx.getCustomerUid())
                && !principal.uid().equals(tx.getProviderUid())) {
            throw new ApiException(HttpStatus.FORBIDDEN, "Permission denied for this payment transaction.");
        }
        if ("PAID".equalsIgnoreCase(tx.getStatus())) {
            return tx;
        }

        if ("CHAPA".equalsIgnoreCase(tx.getGateway())) {
            if ("LIVE".equalsIgnoreCase(tx.getGatewayMode()) && isChapaLiveConfigured()) {
                Map<String, Object> verifyRes = callChapaVerify(tx.getTxRef());
                tx.setGatewayRawResponse(verifyRes);
                String dataStatus = stringVal(verifyRes.get("status"));
                if (!"success".equalsIgnoreCase(dataStatus)) {
                    throw new ApiException(HttpStatus.BAD_REQUEST,
                            "Chapa payment status is currently '" + (dataStatus != null ? dataStatus : "pending") + "'. Complete checkout first.");
                }
                String chapaRefId = stringVal(verifyRes.get("reference"));
                if (chapaRefId != null) tx.setGatewayTransactionId(chapaRefId);
            } else {
                tx.setGatewayTransactionId("CHAPA-SBX-" + UUID.randomUUID().toString().substring(0, 8).toUpperCase(Locale.ROOT));
            }
            return markTransactionPaid(tx, principal.uid(), "CHAPA_VERIFIED");
        } else {
            if ("LIVE".equalsIgnoreCase(tx.getGatewayMode()) && isPayoLiveConfigured()) {
                Map<String, Object> payoStatus = callPayoVerify(tx.getTxRef(), tx.getGatewayTransactionId());
                if (payoStatus != null) {
                    tx.setGatewayRawResponse(payoStatus);
                    String st = stringVal(payoStatus.get("status"));
                    if ("paid".equalsIgnoreCase(st) || "success".equalsIgnoreCase(st) || "completed".equalsIgnoreCase(st)) {
                        return markTransactionPaid(tx, principal.uid(), "PAYO_VERIFIED");
                    }
                }
            }
            if (tx.getPayerReceiptReference() == null || tx.getPayerReceiptReference().isBlank()) {
                throw new ApiException(HttpStatus.BAD_REQUEST,
                        "Payo verification requires your transfer receipt reference or confirmation first.");
            }
            return markTransactionPaid(tx, principal.uid(), "PAYO_VERIFIED");
        }
    }

    @Transactional
    public PaymentTransaction confirmPayoPayment(UserPrincipal principal, String txRef, ConfirmPayoPaymentRequest req) {
        PaymentTransaction tx = paymentRepo.findByTxRefIgnoreCase(txRef.trim())
                .orElseThrow(() -> new ApiException(HttpStatus.NOT_FOUND, "Payment transaction not found."));
        if (!"PAYO".equalsIgnoreCase(tx.getGateway())) {
            throw new ApiException(HttpStatus.BAD_REQUEST, "Only PAYO transactions use Payo receipt confirmation.");
        }
        if (!principal.isAdmin()
                && !principal.uid().equals(tx.getCustomerUid())
                && !principal.uid().equals(tx.getProviderUid())) {
            throw new ApiException(HttpStatus.FORBIDDEN, "Permission denied for this payment transaction.");
        }
        if ("PAID".equalsIgnoreCase(tx.getStatus())) {
            return tx;
        }

        String receiptRef = req.receiptReference().trim();
        tx.setPayerReceiptReference(receiptRef);
        if (req.receiptImageUrl() != null && !req.receiptImageUrl().isBlank()) {
            tx.setPayerReceiptImageUrl(req.receiptImageUrl().trim());
        }
        tx.setGatewayTransactionId("PAYO-" + receiptRef);

        Map<String, Object> confirmationMeta = new LinkedHashMap<>();
        if (tx.getGatewayRawResponse() != null) {
            confirmationMeta.putAll(tx.getGatewayRawResponse());
        }
        confirmationMeta.put("receiptReference", receiptRef);
        confirmationMeta.put("providerTransferConfirmed", req.providerTransferConfirmed() == null || req.providerTransferConfirmed());
        confirmationMeta.put("commissionTransferConfirmed", req.commissionTransferConfirmed() == null || req.commissionTransferConfirmed());
        if (req.notes() != null && !req.notes().isBlank()) {
            confirmationMeta.put("notes", req.notes().trim());
        }
        tx.setGatewayRawResponse(confirmationMeta);

        return markTransactionPaid(tx, principal.uid(), "PAYO_RECEIPT_CONFIRMED");
    }

    @Transactional
    public Map<String, Object> handleChapaWebhook(String rawBody, String signatureHeader) {
        if (chapaWebhookSecret != null && !chapaWebhookSecret.isBlank()) {
            if (!verifyHmacSha256(rawBody, signatureHeader, chapaWebhookSecret.trim())) {
                throw new ApiException(HttpStatus.UNAUTHORIZED, "Invalid Chapa webhook signature.");
            }
        }
        try {
            JsonNode root = objectMapper.readTree(rawBody == null || rawBody.isBlank() ? "{}" : rawBody);
            String txRef = firstNonBlank(
                    root.path("tx_ref").asText(null),
                    root.path("data").path("tx_ref").asText(null)
            );
            String status = firstNonBlank(
                    root.path("status").asText(null),
                    root.path("data").path("status").asText(null),
                    root.path("event").asText(null)
            );
            if (txRef == null || txRef.isBlank()) {
                return Map.of("received", true, "ignored", "Missing tx_ref");
            }
            PaymentTransaction tx = paymentRepo.findByTxRefIgnoreCase(txRef).orElse(null);
            if (tx == null) {
                return Map.of("received", true, "ignored", "Unknown tx_ref");
            }
            if ("success".equalsIgnoreCase(status) || "charge.success".equalsIgnoreCase(status)) {
                markTransactionPaid(tx, "WEBHOOK:CHAPA", "CHAPA_WEBHOOK");
            }
            return Map.of("received", true, "txRef", txRef, "status", tx.getStatus());
        } catch (ApiException ex) {
            throw ex;
        } catch (Exception ex) {
            throw new ApiException(HttpStatus.BAD_REQUEST, "Malformed Chapa webhook payload.");
        }
    }

    @Transactional
    public Map<String, Object> handlePayoWebhook(String rawBody, String signatureHeader) {
        if (payoWebhookSecret != null && !payoWebhookSecret.isBlank()) {
            if (!verifyHmacSha256(rawBody, signatureHeader, payoWebhookSecret.trim())) {
                throw new ApiException(HttpStatus.UNAUTHORIZED, "Invalid Payo webhook signature.");
            }
        }
        try {
            JsonNode root = objectMapper.readTree(rawBody == null || rawBody.isBlank() ? "{}" : rawBody);
            String txRef = firstNonBlank(
                    root.path("tx_ref").asText(null),
                    root.path("txRef").asText(null),
                    root.path("reference").asText(null),
                    root.path("orderReference").asText(null),
                    root.path("data").path("reference").asText(null)
            );
            String status = firstNonBlank(
                    root.path("status").asText(null),
                    root.path("data").path("status").asText(null),
                    root.path("event").asText(null)
            );
            if (txRef == null || txRef.isBlank()) {
                return Map.of("received", true, "ignored", "Missing reference");
            }
            PaymentTransaction tx = paymentRepo.findByTxRefIgnoreCase(txRef).orElse(null);
            if (tx == null) {
                return Map.of("received", true, "ignored", "Unknown tx_ref");
            }
            if ("paid".equalsIgnoreCase(status) || "success".equalsIgnoreCase(status)
                    || "completed".equalsIgnoreCase(status) || "verified".equalsIgnoreCase(status)) {
                String receiptId = firstNonBlank(
                        root.path("receiptReference").asText(null),
                        root.path("transactionId").asText(null),
                        root.path("data").path("transactionId").asText(null)
                );
                if (receiptId != null) tx.setPayerReceiptReference(receiptId);
                markTransactionPaid(tx, "WEBHOOK:PAYO", "PAYO_WEBHOOK");
            }
            return Map.of("received", true, "txRef", txRef, "status", tx.getStatus());
        } catch (ApiException ex) {
            throw ex;
        } catch (Exception ex) {
            throw new ApiException(HttpStatus.BAD_REQUEST, "Malformed Payo webhook payload.");
        }
    }

    @Transactional(readOnly = true)
    public List<PaymentTransaction> getMyPayments(UserPrincipal principal) {
        if (principal.isAdmin()) {
            return paymentRepo.findAllByOrderByCreatedAtDesc();
        }
        return paymentRepo.findByCustomerUidOrderByCreatedAtDesc(principal.uid());
    }

    @Transactional(readOnly = true)
    public List<PaymentTransaction> getProviderSettlements(UserPrincipal principal) {
        if (principal.isAdmin()) {
            return paymentRepo.findAllByOrderByCreatedAtDesc();
        }
        List<Long> bizIds = businessRepo.findByOwnerUidOrderByIdAsc(principal.uid())
                .stream().map(Business::getId).toList();
        Map<Long, PaymentTransaction> merged = new LinkedHashMap<>();
        if (!bizIds.isEmpty()) {
            for (PaymentTransaction tx : paymentRepo.findByBusinessIdInOrderByCreatedAtDesc(bizIds)) {
                merged.put(tx.getId(), tx);
            }
        }
        for (PaymentTransaction tx : paymentRepo.findByProviderUidOrderByCreatedAtDesc(principal.uid())) {
            merged.put(tx.getId(), tx);
        }
        return new ArrayList<>(merged.values());
    }

    private PaymentTransaction markTransactionPaid(PaymentTransaction tx, String actorUid, String auditAction) {
        if ("PAID".equalsIgnoreCase(tx.getStatus())) {
            return tx;
        }
        boolean isDispatch = "DELIVERY".equalsIgnoreCase(tx.getTransactionType())
                || "RIDE".equalsIgnoreCase(tx.getTransactionType());

        tx.setStatus("PAID");
        tx.setPaidAt(Instant.now());
        tx.setCommissionLegStatus("COLLECTED_IN_PLATFORM_ACCOUNT");
        tx.setProviderLegStatus(isDispatch ? "HELD_ESCROW" : "SETTLED_TO_PROVIDER_ACCOUNT");
        PaymentTransaction saved = paymentRepo.save(tx);

        if ("ORDER".equalsIgnoreCase(tx.getTransactionType())) {
            orderRepo.findById(tx.getReferenceId()).ifPresent(order -> {
                order.setPaymentMethod(tx.getGateway());
                order.setPaymentStatus("SUCCESSFUL");
                CustomerOrder savedOrder = orderRepo.save(order);
                businessRepo.findById(savedOrder.getBusinessId()).ifPresent(biz ->
                        liveChatBroker.broadcastOrderEvent(savedOrder, biz, actorUid, "PAYMENT_SETTLED")
                );
            });
        } else if ("BOOKING".equalsIgnoreCase(tx.getTransactionType())) {
            bookingRepo.findById(tx.getReferenceId()).ifPresent(booking -> {
                booking.setPaymentMethod(tx.getGateway());
                booking.setPaymentStatus("SUCCESSFUL");
                if ("PENDING".equalsIgnoreCase(booking.getBookingStatus()) && booking.isQuoteApproved()) {
                    booking.setBookingStatus("CONFIRMED");
                }
                Booking savedBooking = bookingRepo.save(booking);
                businessRepo.findById(savedBooking.getBusinessId()).ifPresent(biz -> {
                    String title = listingRepo.findById(savedBooking.getListingId())
                            .map(ServiceListing::getTitle).orElse(savedBooking.getBookingType());
                    liveChatBroker.broadcastBookingEvent(savedBooking, biz, title, actorUid, "PAYMENT_SETTLED");
                });
            });
        } else {
            deliveryRepo.findById(tx.getReferenceId()).ifPresent(delivery -> {
                delivery.setPaymentMethod(tx.getGateway());
                if ("AWAITING_PAYMENT".equalsIgnoreCase(delivery.getEscrowStatus())) {
                    delivery.setEscrowStatus("HELD_IN_ESCROW");
                }
                DeliveryRequest savedDel = deliveryRepo.save(delivery);
                liveChatBroker.broadcastDeliveryEvent(savedDel, actorUid, "PAYMENT_FUNDED");
            });
        }

        updateCommissionSplitMetadata(tx.getReferenceCode(), saved);

        AuditLog audit = new AuditLog();
        audit.setActorUid(actorUid);
        audit.setActorEmail(actorUid);
        audit.setAction(auditAction);
        audit.setEntityType("payment_transaction");
        audit.setEntityId(saved.getTxRef());
        audit.setDetails(Map.of(
                "gateway", saved.getGateway(),
                "referenceCode", saved.getReferenceCode(),
                "grossAmount", saved.getGrossAmount(),
                "commissionAmount", saved.getCommissionAmount(),
                "providerAmount", saved.getProviderAmount(),
                "commissionLegStatus", saved.getCommissionLegStatus(),
                "providerLegStatus", saved.getProviderLegStatus()
        ));
        auditLogRepo.save(audit);

        return saved;
    }

    private void updateCommissionSplitMetadata(String referenceCode, PaymentTransaction tx) {
        if (referenceCode == null) return;
        commissionRepo.findByTransactionRef(referenceCode).ifPresent(cr -> {
            cr.setPaymentMethod(tx.getGateway());
            cr.setGateway(tx.getGateway());
            cr.setGatewayTxRef(tx.getTxRef());
            cr.setChapaSubaccountId(tx.getChapaSubaccountId());
            cr.setPlatformCommissionAccount(formatAccountSummary(tx.getPlatformCommissionAccountSnapshot()));
            cr.setProviderPayoutAccount(formatAccountSummary(tx.getProviderPayoutAccountSnapshot()));
            cr.setCommissionSettlementStatus(tx.getCommissionLegStatus());
            cr.setProviderSettlementStatus(tx.getProviderLegStatus());
            if ("PAID".equalsIgnoreCase(tx.getStatus())) {
                cr.setStatus("SETTLED");
            }
            commissionRepo.save(cr);
        });
    }

    private Map<String, Object> callChapaInitialize(
            PaymentTransaction tx,
            String email,
            String fullName,
            String callbackUrl,
            String returnUrl
    ) {
        String[] parts = (fullName != null ? fullName.trim() : "Customer").split("\\s+", 2);
        String firstName = parts.length > 0 && !parts[0].isBlank() ? parts[0] : "Customer";
        String lastName = parts.length > 1 && !parts[1].isBlank() ? parts[1] : "User";

        Map<String, Object> payload = new LinkedHashMap<>();
        payload.put("amount", tx.getGrossAmount().toPlainString());
        payload.put("currency", "ETB");
        payload.put("email", email != null && email.contains("@") ? email : "customer@nearestyou.et");
        payload.put("first_name", firstName);
        payload.put("last_name", lastName);
        payload.put("tx_ref", tx.getTxRef());
        payload.put("callback_url", callbackUrl);
        payload.put("return_url", returnUrl);

        Map<String, Object> custom = new LinkedHashMap<>();
        custom.put("title", "Nearest You · " + tx.getReferenceCode());
        custom.put("description", "Split checkout: net sales to provider account, platform fee to single commission account.");
        payload.put("customization", custom);

        if (tx.getChapaSubaccountId() != null
                && !tx.getChapaSubaccountId().isBlank()
                && !tx.getChapaSubaccountId().endsWith("-SANDBOX")) {
            Map<String, Object> sub = new LinkedHashMap<>();
            sub.put("id", tx.getChapaSubaccountId());
            sub.put("split_type", "flat");
            sub.put("split_value", tx.getCommissionAmount());
            payload.put("subaccounts", List.of(sub));
        }

        try {
            String json = objectMapper.writeValueAsString(payload);
            HttpRequest req = HttpRequest.newBuilder()
                    .uri(URI.create(cleanChapaUrl("/transaction/initialize")))
                    .timeout(Duration.ofSeconds(12))
                    .header("Authorization", "Bearer " + chapaSecretKey.trim())
                    .header("Content-Type", "application/json")
                    .POST(HttpRequest.BodyPublishers.ofString(json))
                    .build();
            HttpResponse<String> resp = httpClient.send(req, HttpResponse.BodyHandlers.ofString());
            Map<String, Object> body = objectMapper.readValue(resp.body(), new TypeReference<>() {});
            if (resp.statusCode() < 200 || resp.statusCode() >= 300 || !"success".equalsIgnoreCase(stringVal(body.get("status")))) {
                throw new ApiException(HttpStatus.BAD_GATEWAY, "Chapa initialization failed: " + stringVal(body.get("message")));
            }
            Map<String, Object> out = new LinkedHashMap<>(body);
            if (body.get("data") instanceof Map<?, ?> dataMap && dataMap.get("checkout_url") != null) {
                out.put("checkout_url", String.valueOf(dataMap.get("checkout_url")));
            }
            return out;
        } catch (ApiException ex) {
            throw ex;
        } catch (Exception ex) {
            throw new ApiException(HttpStatus.BAD_GATEWAY, "Unable to reach Chapa API: " + ex.getMessage());
        }
    }

    private Map<String, Object> callChapaVerify(String txRef) {
        try {
            HttpRequest req = HttpRequest.newBuilder()
                    .uri(URI.create(cleanChapaUrl("/transaction/verify/" + URLEncoder.encode(txRef, StandardCharsets.UTF_8))))
                    .timeout(Duration.ofSeconds(10))
                    .header("Authorization", "Bearer " + chapaSecretKey.trim())
                    .GET()
                    .build();
            HttpResponse<String> resp = httpClient.send(req, HttpResponse.BodyHandlers.ofString());
            Map<String, Object> body = objectMapper.readValue(resp.body(), new TypeReference<>() {});
            Map<String, Object> flat = new LinkedHashMap<>(body);
            if (body.get("data") instanceof Map<?, ?> dataMap) {
                if (dataMap.get("status") != null) flat.put("status", String.valueOf(dataMap.get("status")));
                if (dataMap.get("reference") != null) flat.put("reference", String.valueOf(dataMap.get("reference")));
            }
            return flat;
        } catch (Exception ex) {
            throw new ApiException(HttpStatus.BAD_GATEWAY, "Unable to verify Chapa transaction: " + ex.getMessage());
        }
    }

    private Map<String, Object> callPayoInitialize(
            PaymentTransaction tx,
            String email,
            String phoneNumber,
            String callbackUrl,
            String returnUrl
    ) {
        Map<String, Object> payload = new LinkedHashMap<>();
        payload.put("amount", tx.getGrossAmount());
        payload.put("currency", "ETB");
        payload.put("reference", tx.getTxRef());
        payload.put("customerEmail", email);
        if (phoneNumber != null && !phoneNumber.isBlank()) {
            payload.put("customerPhone", phoneNumber.trim());
        }
        if (payoMerchantId != null && !payoMerchantId.isBlank()) {
            payload.put("merchantId", payoMerchantId.trim());
        }
        payload.put("callbackUrl", callbackUrl);
        payload.put("returnUrl", returnUrl);
        payload.put("splitAccounts", Map.of(
                "commissionAccount", tx.getPlatformCommissionAccountSnapshot(),
                "commissionAmount", tx.getCommissionAmount(),
                "providerAccount", tx.getProviderPayoutAccountSnapshot(),
                "providerAmount", tx.getProviderAmount()
        ));

        try {
            String json = objectMapper.writeValueAsString(payload);
            HttpRequest req = HttpRequest.newBuilder()
                    .uri(URI.create(cleanPayoUrl("/api/orders")))
                    .timeout(Duration.ofSeconds(10))
                    .header("Authorization", "Bearer " + payoApiKey.trim())
                    .header("Content-Type", "application/json")
                    .POST(HttpRequest.BodyPublishers.ofString(json))
                    .build();
            HttpResponse<String> resp = httpClient.send(req, HttpResponse.BodyHandlers.ofString());
            if (resp.statusCode() >= 200 && resp.statusCode() < 300) {
                return objectMapper.readValue(resp.body(), new TypeReference<>() {});
            }
            log.warn("Payo remote /api/orders returned HTTP {}; falling back to Payo dual-leg direct transfer.", resp.statusCode());
            return Map.of("mode", "DIRECT_SPLIT", "httpStatus", resp.statusCode());
        } catch (Exception ex) {
            log.warn("Payo remote call unavailable ({}); using Payo dual-leg direct transfer.", ex.getMessage());
            return Map.of("mode", "DIRECT_SPLIT", "error", ex.getMessage());
        }
    }

    private Map<String, Object> callPayoVerify(String txRef, String orderId) {
        String idToCheck = (orderId != null && !orderId.isBlank()) ? orderId : txRef;
        try {
            HttpRequest req = HttpRequest.newBuilder()
                    .uri(URI.create(cleanPayoUrl("/api/orders/" + URLEncoder.encode(idToCheck, StandardCharsets.UTF_8))))
                    .timeout(Duration.ofSeconds(8))
                    .header("Authorization", "Bearer " + payoApiKey.trim())
                    .GET()
                    .build();
            HttpResponse<String> resp = httpClient.send(req, HttpResponse.BodyHandlers.ofString());
            if (resp.statusCode() >= 200 && resp.statusCode() < 300) {
                return objectMapper.readValue(resp.body(), new TypeReference<>() {});
            }
        } catch (Exception ignored) {}
        return null;
    }

    private String provisionChapaSubaccountIfPossible(
            String businessName,
            String accountName,
            String bankCode,
            String accountNumber,
            String sandboxPrefix,
            String existingSubaccountId
    ) {
        if (bankCode == null || bankCode.isBlank() || accountNumber == null || accountNumber.isBlank()) {
            return existingSubaccountId;
        }
        if (!isChapaLiveConfigured()) {
            if (existingSubaccountId != null && !existingSubaccountId.isBlank() && !existingSubaccountId.endsWith("-SANDBOX")) {
                return existingSubaccountId;
            }
            return sandboxPrefix + "-SANDBOX";
        }
        try {
            Map<String, Object> payload = new LinkedHashMap<>();
            payload.put("business_name", businessName);
            payload.put("account_name", accountName);
            payload.put("bank_code", bankCode);
            payload.put("account_number", accountNumber);
            payload.put("split_type", "percentage");
            payload.put("split_value", 0.10);

            String json = objectMapper.writeValueAsString(payload);
            HttpRequest req = HttpRequest.newBuilder()
                    .uri(URI.create(cleanChapaUrl("/subaccount")))
                    .timeout(Duration.ofSeconds(10))
                    .header("Authorization", "Bearer " + chapaSecretKey.trim())
                    .header("Content-Type", "application/json")
                    .POST(HttpRequest.BodyPublishers.ofString(json))
                    .build();
            HttpResponse<String> resp = httpClient.send(req, HttpResponse.BodyHandlers.ofString());
            if (resp.statusCode() >= 200 && resp.statusCode() < 300) {
                JsonNode root = objectMapper.readTree(resp.body());
                JsonNode data = root.path("data");
                String id = firstNonBlank(data.path("subaccount_id").asText(null), data.path("id").asText(null));
                if (id != null && !id.isBlank()) {
                    return id;
                }
            }
            log.warn("Chapa /v1/subaccount returned HTTP {}: {}", resp.statusCode(), resp.body());
        } catch (Exception ex) {
            log.warn("Could not provision remote Chapa subaccount: {}", ex.getMessage());
        }
        return existingSubaccountId != null && !existingSubaccountId.isBlank()
                ? existingSubaccountId
                : sandboxPrefix + "-SANDBOX";
    }

    public Map<String, Object> buildBusinessPayoutSnapshot(Business biz, UserAccount ownerFallback) {
        Map<String, Object> m = new LinkedHashMap<>();
        String bankCode = firstNonBlank(biz.getPayoutBankCode(), ownerFallback != null ? ownerFallback.getPayoutBankCode() : null);
        String bankName = firstNonBlank(biz.getPayoutBankName(), ownerFallback != null ? ownerFallback.getPayoutBankName() : null);
        String accNum = firstNonBlank(biz.getPayoutAccountNumber(), ownerFallback != null ? ownerFallback.getPayoutAccountNumber() : null);
        String accName = firstNonBlank(biz.getPayoutAccountName(), ownerFallback != null ? ownerFallback.getPayoutAccountName() : null, biz.getBusinessName());
        String telebirr = firstNonBlank(biz.getPayoutTelebirrNumber(), ownerFallback != null ? ownerFallback.getPayoutTelebirrNumber() : null);
        String payoHandle = firstNonBlank(biz.getPayoAccountHandle(), ownerFallback != null ? ownerFallback.getPayoAccountHandle() : null);
        String subId = firstNonBlank(biz.getChapaSubaccountId(), ownerFallback != null ? ownerFallback.getChapaSubaccountId() : null);

        boolean configured = (accNum != null && !accNum.isBlank())
                || (telebirr != null && !telebirr.isBlank())
                || (payoHandle != null && !payoHandle.isBlank());

        m.put("ownerType", "BUSINESS");
        m.put("ownerLabel", biz.getBusinessName());
        m.put("bankCode", bankCode);
        m.put("bankName", bankName != null ? bankName : (bankCode != null ? resolveBankName(bankCode) : null));
        m.put("accountNumber", accNum);
        m.put("accountName", accName);
        m.put("telebirrNumber", telebirr);
        m.put("payoAccountHandle", payoHandle);
        m.put("chapaSubaccountId", subId);
        m.put("preferredPayoutGateway", biz.getPreferredPayoutGateway());
        m.put("isConfigured", configured);
        m.put("summaryLabel", buildSummaryLabel(biz.getBusinessName(), bankName, accNum, telebirr, payoHandle));
        return m;
    }

    public Map<String, Object> buildDriverPayoutSnapshot(UserAccount driver) {
        Map<String, Object> m = new LinkedHashMap<>();
        if (driver == null) {
            m.put("ownerType", "DRIVER_POOL");
            m.put("ownerLabel", "Assigned Verified Partner's Own Account");
            m.put("isConfigured", false);
            m.put("summaryLabel", "Assigned Verified Delivery Partner's Own Payout Account (settled on OTP release)");
            return m;
        }
        boolean configured = (driver.getPayoutAccountNumber() != null && !driver.getPayoutAccountNumber().isBlank())
                || (driver.getPayoutTelebirrNumber() != null && !driver.getPayoutTelebirrNumber().isBlank())
                || (driver.getPayoAccountHandle() != null && !driver.getPayoAccountHandle().isBlank());
        m.put("ownerType", "DRIVER");
        m.put("ownerLabel", driver.getFullName());
        m.put("bankCode", driver.getPayoutBankCode());
        m.put("bankName", driver.getPayoutBankName() != null ? driver.getPayoutBankName() : resolveBankName(driver.getPayoutBankCode()));
        m.put("accountNumber", driver.getPayoutAccountNumber());
        m.put("accountName", driver.getPayoutAccountName() != null ? driver.getPayoutAccountName() : driver.getFullName());
        m.put("telebirrNumber", driver.getPayoutTelebirrNumber());
        m.put("payoAccountHandle", driver.getPayoAccountHandle());
        m.put("chapaSubaccountId", driver.getChapaSubaccountId());
        m.put("preferredPayoutGateway", driver.getPreferredPayoutGateway());
        m.put("isConfigured", configured);
        m.put("summaryLabel", buildSummaryLabel(
                driver.getFullName(),
                driver.getPayoutBankName(),
                driver.getPayoutAccountNumber(),
                driver.getPayoutTelebirrNumber(),
                driver.getPayoAccountHandle()
        ));
        return m;
    }

    public String formatAccountSummary(Map<String, Object> snap) {
        if (snap == null || snap.isEmpty()) return "Not Configured";
        if (snap.get("summaryLabel") instanceof String s && !s.isBlank()) {
            return s;
        }
        return buildSummaryLabel(
                stringVal(snap.get("accountHolderName")),
                stringVal(snap.get("bankName")),
                stringVal(snap.get("accountNumber")),
                stringVal(snap.get("telebirrNumber")),
                stringVal(snap.get("payoAccountHandle"))
        );
    }

    private String buildSummaryLabel(String label, String bankName, String accNum, String telebirr, String payo) {
        List<String> parts = new ArrayList<>();
        if (label != null && !label.isBlank()) parts.add(label);
        if (bankName != null && accNum != null && !accNum.isBlank()) {
            parts.add(bankName + " · " + accNum);
        } else if (accNum != null && !accNum.isBlank()) {
            parts.add("Acct " + accNum);
        }
        if (telebirr != null && !telebirr.isBlank()) parts.add("Telebirr " + telebirr);
        if (payo != null && !payo.isBlank()) parts.add("Payo " + payo);
        return parts.isEmpty() ? "Provider Account Pending Setup" : String.join(" | ", parts);
    }

    private String resolveBankName(String bankCode) {
        if (bankCode == null || bankCode.isBlank()) return "Commercial Bank of Ethiopia (CBE)";
        for (Map<String, String> bank : DEFAULT_ETHIOPIAN_BANKS) {
            if (bankCode.equals(bank.get("code"))) {
                return bank.get("name");
            }
        }
        return "Ethiopian Bank (" + bankCode + ")";
    }

    private String normalizePreferredGateway(String raw) {
        if (raw == null) return "BOTH";
        String upper = raw.trim().toUpperCase(Locale.ROOT);
        return Set.of("CHAPA", "PAYO", "BOTH").contains(upper) ? upper : "BOTH";
    }

    private boolean verifyHmacSha256(String payload, String headerSig, String secret) {
        if (headerSig == null || headerSig.isBlank()) return false;
        try {
            Mac sha256Hmac = Mac.getInstance("HmacSHA256");
            SecretKeySpec secretKey = new SecretKeySpec(secret.getBytes(StandardCharsets.UTF_8), "HmacSHA256");
            sha256Hmac.init(secretKey);
            byte[] hash = sha256Hmac.doFinal((payload != null ? payload : "").getBytes(StandardCharsets.UTF_8));
            StringBuilder hex = new StringBuilder();
            for (byte b : hash) {
                String h = Integer.toHexString(0xff & b);
                if (h.length() == 1) hex.append('0');
                hex.append(h);
            }
            return MessageDigest.isEqual(
                    hex.toString().toLowerCase(Locale.ROOT).getBytes(StandardCharsets.UTF_8),
                    headerSig.trim().toLowerCase(Locale.ROOT).getBytes(StandardCharsets.UTF_8)
            );
        } catch (Exception ex) {
            return false;
        }
    }

    private String trimOrNull(String val) {
        return (val != null && !val.isBlank()) ? val.trim() : null;
    }

    private String stringVal(Object obj) {
        return obj != null ? String.valueOf(obj) : null;
    }

    private String firstNonBlank(String... values) {
        if (values == null) return null;
        for (String v : values) {
            if (v != null && !v.isBlank()) return v.trim();
        }
        return null;
    }

    private void recordAudit(UserPrincipal actor, String action, String entityType, String entityId, Map<String, Object> details) {
        AuditLog logEntry = new AuditLog();
        logEntry.setActorUid(actor != null ? actor.uid() : "SYSTEM");
        logEntry.setActorEmail(actor != null ? actor.email() : "SYSTEM");
        logEntry.setAction(action);
        logEntry.setEntityType(entityType);
        logEntry.setEntityId(entityId);
        logEntry.setDetails(details);
        auditLogRepo.save(logEntry);
    }
}
