package com.nearestyou.service;

import com.nearestyou.dto.NearestYouDtos.CreateBusinessRequest;
import com.nearestyou.dto.NearestYouDtos.CreateListingRequest;
import com.nearestyou.dto.NearestYouDtos.JobSeekerAdvertiseRequest;
import com.nearestyou.dto.NearestYouDtos.UpdateListingRequest;
import com.nearestyou.entity.*;
import com.nearestyou.exception.ApiException;
import com.nearestyou.pricing.MandatoryPricingValidator;
import com.nearestyou.repository.*;
import com.nearestyou.security.UserPrincipal;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.math.BigDecimal;
import java.time.Instant;
import java.util.*;

@Service
public class BusinessAndListingService {

    private final BusinessRepository businessRepo;
    private final ServiceListingRepository listingRepo;
    private final ServiceCategoryRepository categoryRepo;
    private final UserAccountRepository userRepo;
    private final ProviderRegistrationRepository providerRepo;
    private final CustomerOrderRepository orderRepo;
    private final BookingRepository bookingRepo;
    private final JobApplicationRepository appRepo;
    private final CommissionRecordRepository commissionRepo;
    private final ReviewRepository reviewRepo;
    private final CategoryDocumentRequirementRepository requirementRepo;
    private final AuditLogRepository auditLogRepo;
    private final ServiceContractRepository contractRepo;
    private final PaymentTransactionRepository paymentRepo;
    private final MandatoryPricingValidator pricingValidator;
    private final GeoDistanceService geoDistanceService;
    private final UserSyncService userSyncService;

    public BusinessAndListingService(
            BusinessRepository businessRepo,
            ServiceListingRepository listingRepo,
            ServiceCategoryRepository categoryRepo,
            UserAccountRepository userRepo,
            ProviderRegistrationRepository providerRepo,
            CustomerOrderRepository orderRepo,
            BookingRepository bookingRepo,
            JobApplicationRepository appRepo,
            CommissionRecordRepository commissionRepo,
            ReviewRepository reviewRepo,
            CategoryDocumentRequirementRepository requirementRepo,
            AuditLogRepository auditLogRepo,
            ServiceContractRepository contractRepo,
            PaymentTransactionRepository paymentRepo,
            MandatoryPricingValidator pricingValidator,
            GeoDistanceService geoDistanceService,
            UserSyncService userSyncService
    ) {
        this.businessRepo = businessRepo;
        this.listingRepo = listingRepo;
        this.categoryRepo = categoryRepo;
        this.userRepo = userRepo;
        this.providerRepo = providerRepo;
        this.orderRepo = orderRepo;
        this.bookingRepo = bookingRepo;
        this.appRepo = appRepo;
        this.commissionRepo = commissionRepo;
        this.reviewRepo = reviewRepo;
        this.requirementRepo = requirementRepo;
        this.auditLogRepo = auditLogRepo;
        this.contractRepo = contractRepo;
        this.paymentRepo = paymentRepo;
        this.pricingValidator = pricingValidator;
        this.geoDistanceService = geoDistanceService;
        this.userSyncService = userSyncService;
    }

    @Transactional(readOnly = true)
    public Map<String, Object> getBusinessPortalData(UserPrincipal principal) {
        List<Business> allOwnedOrAdmin = principal.isAdmin()
                ? businessRepo.findAllByOrderByIdAsc()
                : businessRepo.findByOwnerUidOrderByIdAsc(principal.uid());
        List<Business> visibleBusinesses = allOwnedOrAdmin.stream()
                .filter(b -> !"INDIVIDUAL_JOB_SEEKER".equalsIgnoreCase(b.getProfileType()))
                .toList();
        enrichOwnerFullNames(visibleBusinesses);
        List<Long> bizIds = visibleBusinesses.stream().map(Business::getId).toList();

        List<CustomerOrder> scopedOrders = bizIds.isEmpty() ? List.of() : orderRepo.findByBusinessIdInOrderByCreatedAtDesc(bizIds);
        List<Booking> scopedBookings = bizIds.isEmpty() ? List.of() : bookingRepo.findByBusinessIdInOrderByCreatedAtDesc(bizIds);
        List<JobApplication> scopedApps = bizIds.isEmpty() ? List.of() : appRepo.findByBusinessIdInOrderByCreatedAtDesc(bizIds);
        List<CommissionRecord> scopedCommissions = bizIds.isEmpty() ? List.of() : commissionRepo.findByBusinessIdInOrderByCreatedAtDesc(bizIds);
        List<Review> scopedReviews = bizIds.isEmpty() ? List.of() : reviewRepo.findByBusinessIdInOrderByCreatedAtDesc(bizIds);
        List<ServiceContract> scopedContracts = bizIds.isEmpty() ? List.of() : contractRepo.findByBusinessIdInOrderByUpdatedAtDesc(bizIds);
        List<PaymentTransaction> scopedPayments = principal.isAdmin()
                ? paymentRepo.findAllByOrderByCreatedAtDesc()
                : (bizIds.isEmpty()
                        ? paymentRepo.findByProviderUidOrderByCreatedAtDesc(principal.uid())
                        : paymentRepo.findByBusinessIdInOrderByCreatedAtDesc(bizIds));
        ProviderRegistration reg = providerRepo.findFirstByUserUidOrderByUpdatedAtDesc(principal.uid()).orElse(null);

        Map<String, Object> out = new LinkedHashMap<>();
        out.put("ownedBusinesses", visibleBusinesses);
        out.put("orders", scopedOrders);
        out.put("bookings", scopedBookings);
        out.put("contracts", scopedContracts);
        out.put("applications", scopedApps);
        out.put("commissions", scopedCommissions);
        out.put("paymentTransactions", scopedPayments);
        out.put("reviews", scopedReviews);
        out.put("providerRegistration", reg);
        out.put("documentRequirements", requirementRepo.findAllByOrderByCategoryIdAscIdAsc());
        return out;
    }

    @Transactional
    public Business createBusiness(UserPrincipal principal, CreateBusinessRequest req) {
        UserAccount account = userRepo.findByUid(principal.uid())
                .orElseThrow(() -> new ApiException(HttpStatus.NOT_FOUND, "User profile not found."));
        ProviderRegistration reg = providerRepo.findFirstByUserUidOrderByUpdatedAtDesc(principal.uid()).orElse(null);

        boolean providerVerified = principal.isAdmin()
                || "VERIFIED".equalsIgnoreCase(account.getProviderVerificationStatus())
                || (reg != null && "VERIFIED".equalsIgnoreCase(reg.getStatus()));
        if (!providerVerified) {
            throw new ApiException(HttpStatus.FORBIDDEN,
                    "Provider Registration Required: Self-register with Fayda ID, Alive check, and Admin-required documents first.");
        }
        if (!geoDistanceService.isValidCoordinates(req.latitude().doubleValue(), req.longitude().doubleValue())) {
            throw new ApiException(HttpStatus.BAD_REQUEST, "Valid business coordinates are required.");
        }

        Business biz = new Business();
        biz.setOwnerUid(principal.uid());
        biz.setProviderRegistrationId(reg != null ? reg.getId() : null);
        biz.setBusinessName(req.businessName().trim());
        biz.setDescription(req.description().trim());
        biz.setCategoryId(req.categoryId());
        biz.setVerificationStatus(principal.isAdmin() ? "APPROVED" : "SUBMITTED");
        biz.setLicenseNumber(req.licenseNumber().trim());
        biz.setTinNumber(req.tinNumber() != null && !req.tinNumber().isBlank() ? req.tinNumber().trim() : null);
        biz.setProfileType("BUSINESS");
        biz.setContactPhone(req.contactPhone().trim());
        biz.setEmail(req.email() != null && !req.email().isBlank() ? req.email().trim() : principal.email());
        biz.setSubCity(req.subCity().trim());
        biz.setWoreda(req.woreda() != null && !req.woreda().isBlank() ? req.woreda().trim() : "Woreda 03");
        biz.setLandmark(req.landmark().trim());
        biz.setLatitude(req.latitude());
        biz.setLongitude(req.longitude());
        biz.setLiveLocationActive(req.liveLocationActive() == null || req.liveLocationActive());
        biz.setLastLocationPingAt(Instant.now());
        biz.setFaydaVerified(true);
        biz.setLivenessVerified(true);

        Business saved = businessRepo.save(biz);
        saved.setOwnerFullName(resolveUserProfileName(account, reg, saved.getBusinessName()));
        userSyncService.grantRoleToUid(principal.uid(), "BUSINESS_OWNER");

        AuditLog log = new AuditLog();
        log.setActorUid(principal.uid());
        log.setActorEmail(principal.email());
        log.setAction("BUSINESS_REGISTERED");
        log.setEntityType("business");
        log.setEntityId(String.valueOf(saved.getId()));
        log.setDetails(Map.of("businessName", saved.getBusinessName(), "subCity", saved.getSubCity()));
        auditLogRepo.save(log);

        return saved;
    }

    @Transactional
    public ServiceListing createListing(UserPrincipal principal, CreateListingRequest req) {
        Business biz = businessRepo.findById(req.businessId())
                .orElseThrow(() -> new ApiException(HttpStatus.BAD_REQUEST, "Business profile not found."));
        if (!principal.isAdmin() && !biz.getOwnerUid().equals(principal.uid())) {
            throw new ApiException(HttpStatus.FORBIDDEN,
                    "Permission Denied: You can only publish listings for businesses you own.");
        }

        String status = req.status() != null ? req.status().toUpperCase(Locale.ROOT) : "ACTIVE";
        String currency = req.currency() != null ? req.currency() : "ETB";
        if ("ACTIVE".equals(status)) {
            pricingValidator.validateActiveListing(
                    biz.getVerificationStatus(),
                    currency,
                    req.pricingModel(),
                    req.pricingUnit(),
                    req.basePrice(),
                    req.discountPrice(),
                    req.isUnpaid(),
                    req.pricingFormula()
            );
        }

        List<String> sanitizedImages = sanitizeImageUrls(req.imageUrls(), req.imageUrl());
        if (sanitizedImages.size() > 5) {
            throw new ApiException(HttpStatus.BAD_REQUEST, "Maximum 5 images are allowed per product listing.");
        }

        String companyLogoUrl = null;
        if (req.metadata() != null && req.metadata().get("companyLogoUrl") instanceof String logoStr && !logoStr.isBlank()) {
            companyLogoUrl = logoStr.trim();
        }
        String primaryImageUrl = !sanitizedImages.isEmpty()
                ? sanitizedImages.get(0)
                : (req.imageUrl() != null && !req.imageUrl().isBlank() ? req.imageUrl().trim() : companyLogoUrl);

        ServiceListing listing = new ServiceListing();
        listing.setBusinessId(req.businessId());
        listing.setCategoryId(req.categoryId());
        listing.setListingType(req.listingType().trim());
        listing.setTitle(req.title().trim());
        listing.setDescription(req.description().trim());
        listing.setImageUrl(primaryImageUrl);
        listing.setImageUrls(sanitizedImages);
        listing.setPricingModel(req.pricingModel().trim());
        listing.setPricingUnit(req.pricingUnit().trim());
        listing.setBasePrice(req.basePrice());
        listing.setDiscountPrice(req.discountPrice());
        listing.setMinimumCharge(req.minimumCharge());
        listing.setCalloutFee(req.calloutFee());
        listing.setDepositAmount(req.depositAmount());
        listing.setSalaryMax(req.salaryMax());
        listing.setCurrency(currency);
        listing.setQuoteBased(req.isQuoteBased());
        listing.setUnpaid(req.isUnpaid());
        listing.setPricingFormula(req.pricingFormula());
        listing.setMetadata(req.metadata());
        listing.setAvailabilityStatus("AVAILABLE");
        listing.setStatus(status);

        ServiceListing saved = listingRepo.save(listing);

        AuditLog log = new AuditLog();
        log.setActorUid(principal.uid());
        log.setActorEmail(principal.email());
        log.setAction("LISTING_PUBLISHED");
        log.setEntityType("listing");
        log.setEntityId(String.valueOf(saved.getId()));
        log.setDetails(Map.of("title", saved.getTitle(), "basePrice", saved.getBasePrice(), "currency", saved.getCurrency()));
        auditLogRepo.save(log);

        return saved;
    }

    @Transactional(readOnly = true)
    public Map<String, Object> getMyJobSeekerAds(UserPrincipal principal) {
        List<Business> seekerProfiles = businessRepo.findByOwnerUidOrderByIdAsc(principal.uid()).stream()
                .filter(b -> "INDIVIDUAL_JOB_SEEKER".equalsIgnoreCase(b.getProfileType()))
                .toList();
        Set<Long> seekerBizIds = new HashSet<>();
        for (Business b : seekerProfiles) {
            seekerBizIds.add(b.getId());
        }

        List<ServiceListing> myAds = seekerBizIds.isEmpty()
                ? List.of()
                : listingRepo.findByStatusOrderByCreatedAtDesc("ACTIVE").stream()
                        .filter(l -> seekerBizIds.contains(l.getBusinessId())
                                && "JOB_SEEKER".equalsIgnoreCase(l.getListingType()))
                        .toList();

        enrichOwnerFullNames(seekerProfiles);
        Map<String, Object> out = new LinkedHashMap<>();
        out.put("profile", seekerProfiles.isEmpty() ? null : seekerProfiles.get(0));
        out.put("listings", myAds);
        return out;
    }

    @Transactional
    public Map<String, Object> publishJobSeekerAd(UserPrincipal principal, JobSeekerAdvertiseRequest req) {
        UserAccount account = userRepo.findByUid(principal.uid())
                .orElseThrow(() -> new ApiException(HttpStatus.NOT_FOUND, "User profile not found."));
        ProviderRegistration reg = providerRepo.findFirstByUserUidOrderByUpdatedAtDesc(principal.uid()).orElse(null);

        Long categoryId = resolveJobSeekerCategoryId(req.categoryId());
        String displayName = resolveUserProfileName(account, reg, nonBlank(principal.email(), null, "Individual Job Seeker"));
        String phone = nonBlank(req.phoneNumber(), account.getPhoneNumber(), "+251 900 000 000");
        String subCity = nonBlank(req.subCity(), account.getDefaultSubCity(), "Addis Ababa");
        String landmark = nonBlank(req.landmark(), subCity, "Addis Ababa");

        BigDecimal lat = resolveLat(req.latitude(), account.getDefaultLat());
        BigDecimal lng = resolveLng(req.longitude(), account.getDefaultLng());

        boolean faydaVerified = "VERIFIED".equalsIgnoreCase(account.getProviderVerificationStatus());
        boolean livenessVerified = "PASSED".equalsIgnoreCase(account.getLivenessStatus());

        Business seekerBiz = businessRepo.findByOwnerUidOrderByIdAsc(principal.uid()).stream()
                .filter(b -> "INDIVIDUAL_JOB_SEEKER".equalsIgnoreCase(b.getProfileType()))
                .findFirst()
                .orElseGet(Business::new);

        seekerBiz.setOwnerUid(principal.uid());
        seekerBiz.setBusinessName(displayName);
        seekerBiz.setDescription(req.description().trim());
        seekerBiz.setCategoryId(categoryId);
        seekerBiz.setVerificationStatus("APPROVED");
        seekerBiz.setLicenseNumber("INDIVIDUAL-JOB-SEEKER");
        seekerBiz.setProfileType("INDIVIDUAL_JOB_SEEKER");
        seekerBiz.setContactPhone(phone);
        seekerBiz.setEmail(nonBlank(principal.email(), account.getEmail(), "seeker@nearestyou.et"));
        seekerBiz.setSubCity(subCity);
        seekerBiz.setWoreda("Personal Profile");
        seekerBiz.setLandmark(landmark);
        seekerBiz.setLatitude(lat);
        seekerBiz.setLongitude(lng);
        seekerBiz.setLiveLocationActive(true);
        seekerBiz.setLastLocationPingAt(Instant.now());
        seekerBiz.setFaydaVerified(faydaVerified);
        seekerBiz.setLivenessVerified(livenessVerified);
        if (seekerBiz.getOpeningHours() == null || seekerBiz.getOpeningHours().isBlank()) {
            seekerBiz.setOpeningHours("Flexible Availability");
        }
        Business savedBiz = businessRepo.save(seekerBiz);
        savedBiz.setOwnerFullName(displayName);

        List<String> sanitizedImages = sanitizeImageUrls(req.imageUrls(), null);
        if (sanitizedImages.size() > 5) {
            throw new ApiException(HttpStatus.BAD_REQUEST, "Maximum 5 images are allowed per job seeker advertisement.");
        }
        String primaryImageUrl = !sanitizedImages.isEmpty() ? sanitizedImages.get(0) : account.getProfilePhotoUrl();

        boolean isNegotiable = Boolean.TRUE.equals(req.negotiable())
                || req.expectedPay() == null
                || req.expectedPay().compareTo(BigDecimal.ZERO) <= 0;
        BigDecimal basePrice = isNegotiable ? BigDecimal.ZERO : req.expectedPay();
        String pricingModel = nonBlank(req.pricingModel(), isNegotiable ? "QUOTE" : "FIXED", "FIXED")
                .toUpperCase(Locale.ROOT);
        String pricingUnit = nonBlank(req.pricingUnit(), "PER_DAY", "PER_DAY")
                .toUpperCase(Locale.ROOT);

        pricingValidator.validateActiveListing(
                savedBiz.getVerificationStatus(),
                "ETB",
                pricingModel,
                pricingUnit,
                basePrice,
                null,
                isNegotiable,
                null
        );

        Map<String, Object> metadata = new LinkedHashMap<>();
        metadata.put("advertiserRole", "JOB_SEEKER");
        metadata.put("employmentType", "Individual Job Seeker");
        if (req.skills() != null && !req.skills().isBlank()) {
            metadata.put("skills", req.skills().trim());
        }
        if (req.experienceSummary() != null && !req.experienceSummary().isBlank()) {
            metadata.put("experienceSummary", req.experienceSummary().trim());
        }
        if (req.availabilityNote() != null && !req.availabilityNote().isBlank()) {
            metadata.put("availabilityNote", req.availabilityNote().trim());
        }
        if (req.cvUrl() != null && !req.cvUrl().isBlank()) {
            metadata.put("cvUrl", req.cvUrl().trim());
        }
        if (req.cvFileName() != null && !req.cvFileName().isBlank()) {
            metadata.put("cvFileName", req.cvFileName().trim());
        }
        if (req.introVideoUrl() != null && !req.introVideoUrl().isBlank()) {
            metadata.put("introVideoUrl", req.introVideoUrl().trim());
        }

        ServiceListing listing = new ServiceListing();
        listing.setBusinessId(savedBiz.getId());
        listing.setCategoryId(categoryId);
        listing.setListingType("JOB_SEEKER");
        listing.setTitle(req.title().trim());
        listing.setDescription(req.description().trim());
        listing.setImageUrl(primaryImageUrl);
        listing.setImageUrls(sanitizedImages);
        listing.setPricingModel(pricingModel);
        listing.setPricingUnit(pricingUnit);
        listing.setBasePrice(basePrice);
        listing.setCurrency("ETB");
        listing.setQuoteBased(isNegotiable);
        listing.setUnpaid(isNegotiable);
        listing.setMetadata(metadata);
        listing.setAvailabilityStatus("AVAILABLE");
        listing.setStatus("ACTIVE");

        ServiceListing savedListing = listingRepo.save(listing);

        AuditLog log = new AuditLog();
        log.setActorUid(principal.uid());
        log.setActorEmail(principal.email());
        log.setAction("JOB_SEEKER_AD_PUBLISHED");
        log.setEntityType("listing");
        log.setEntityId(String.valueOf(savedListing.getId()));
        log.setDetails(Map.of(
                "title", savedListing.getTitle(),
                "subCity", savedBiz.getSubCity(),
                "negotiable", isNegotiable
        ));
        auditLogRepo.save(log);

        return Map.of("listing", savedListing, "business", savedBiz);
    }

    @Transactional
    public Map<String, Object> deleteJobSeekerAd(UserPrincipal principal, Long listingId) {
        ServiceListing listing = listingRepo.findById(listingId)
                .orElseThrow(() -> new ApiException(HttpStatus.NOT_FOUND, "Job seeker advertisement not found."));
        Business biz = businessRepo.findById(listing.getBusinessId())
                .orElseThrow(() -> new ApiException(HttpStatus.NOT_FOUND, "Profile not found."));
        if (!principal.isAdmin() && !biz.getOwnerUid().equals(principal.uid())) {
            throw new ApiException(HttpStatus.FORBIDDEN, "Permission denied: you do not own this advertisement.");
        }
        if (!"JOB_SEEKER".equalsIgnoreCase(listing.getListingType())
                && !"INDIVIDUAL_JOB_SEEKER".equalsIgnoreCase(biz.getProfileType())) {
            throw new ApiException(HttpStatus.BAD_REQUEST, "Target listing is not a job seeker advertisement.");
        }

        listing.setStatus("ARCHIVED");
        listing.setAvailabilityStatus("UNAVAILABLE");
        listingRepo.save(listing);

        AuditLog log = new AuditLog();
        log.setActorUid(principal.uid());
        log.setActorEmail(principal.email());
        log.setAction("JOB_SEEKER_AD_ARCHIVED");
        log.setEntityType("listing");
        log.setEntityId(String.valueOf(listing.getId()));
        log.setDetails(Map.of("title", listing.getTitle()));
        auditLogRepo.save(log);

        return Map.of("archived", true, "id", listing.getId());
    }

    @Transactional
    public ServiceListing updateListing(UserPrincipal principal, Long listingId, UpdateListingRequest req) {
        ServiceListing listing = listingRepo.findById(listingId)
                .orElseThrow(() -> new ApiException(HttpStatus.NOT_FOUND, "Listing not found."));
        Business biz = businessRepo.findById(listing.getBusinessId())
                .orElseThrow(() -> new ApiException(HttpStatus.NOT_FOUND, "Business not found."));
        if (!principal.isAdmin() && !biz.getOwnerUid().equals(principal.uid())) {
            throw new ApiException(HttpStatus.FORBIDDEN,
                    "Permission denied: you can only edit advertisements you created.");
        }

        String nextStatus = (req.status() != null && !req.status().isBlank())
                ? req.status().trim().toUpperCase(Locale.ROOT)
                : listing.getStatus();
        if (!Set.of("ACTIVE", "DRAFT").contains(nextStatus)) {
            throw new ApiException(HttpStatus.BAD_REQUEST, "Invalid listing status. Allowed: ACTIVE or DRAFT.");
        }

        String nextAvailability = (req.availabilityStatus() != null && !req.availabilityStatus().isBlank())
                ? req.availabilityStatus().trim().toUpperCase(Locale.ROOT)
                : listing.getAvailabilityStatus();
        if (!Set.of("AVAILABLE", "UNAVAILABLE", "OUT_OF_STOCK").contains(nextAvailability)) {
            throw new ApiException(HttpStatus.BAD_REQUEST, "Invalid availability status.");
        }

        boolean nextQuoteBased = req.isQuoteBased() != null ? req.isQuoteBased() : listing.isQuoteBased();
        boolean nextUnpaid = req.isUnpaid() != null ? req.isUnpaid() : listing.isUnpaid();
        String existingCurrency = listing.getCurrency() != null ? listing.getCurrency() : "ETB";

        if ("ACTIVE".equals(nextStatus)) {
            pricingValidator.validateActiveListing(
                    biz.getVerificationStatus(),
                    existingCurrency,
                    req.pricingModel(),
                    req.pricingUnit(),
                    req.basePrice(),
                    req.discountPrice(),
                    nextUnpaid,
                    req.pricingFormula() != null ? req.pricingFormula() : listing.getPricingFormula()
            );
        }

        List<String> sanitizedImages = sanitizeImageUrls(req.imageUrls(), req.imageUrl());
        if (sanitizedImages.size() > 5) {
            throw new ApiException(HttpStatus.BAD_REQUEST, "Maximum 5 images are allowed per advertisement.");
        }

        // Only allow editing non-sensitive metadata keys; preserve protected keys like advertiserRole / licenseVerified
        Map<String, Object> mergedMetadata = new LinkedHashMap<>();
        if (listing.getMetadata() != null) {
            mergedMetadata.putAll(listing.getMetadata());
        }
        Set<String> safeMetadataKeys = Set.of(
                "skills", "experienceSummary", "availabilityNote", "cvUrl", "cvFileName",
                "introVideoUrl", "companyLogoUrl", "variants", "deliveryOptions",
                "schedule", "capacity", "employmentType", "contractType", "vehicleType",
                "brand", "sku", "stockQuantity", "prepTimeMinutes", "durationMinutes",
                "deliveryAvailable", "immediateAcceptance", "estimatedReadyMinutes",
                "estimatedDeliveryMinutes", "deliveryWindowLabel", "returnable",
                "returnWindowDays", "returnLossPercent", "returnLossFixedEtb",
                "deliveryFeeNonRefundableOnReturn", "returnPolicyNote"
        );
        if (req.metadata() != null) {
            for (String key : safeMetadataKeys) {
                if (req.metadata().containsKey(key)) {
                    Object val = req.metadata().get(key);
                    if (val == null || (val instanceof String s && s.isBlank())) {
                        mergedMetadata.remove(key);
                    } else {
                        mergedMetadata.put(key, val);
                    }
                }
            }
        }

        String companyLogoUrl = mergedMetadata.get("companyLogoUrl") instanceof String logoStr && !logoStr.isBlank()
                ? logoStr.trim()
                : null;
        String primaryImageUrl = !sanitizedImages.isEmpty()
                ? sanitizedImages.get(0)
                : (req.imageUrl() != null && !req.imageUrl().isBlank() ? req.imageUrl().trim() : companyLogoUrl);

        listing.setTitle(req.title().trim());
        listing.setDescription(req.description().trim());
        listing.setImageUrl(primaryImageUrl);
        listing.setImageUrls(sanitizedImages);
        listing.setPricingModel(req.pricingModel().trim().toUpperCase(Locale.ROOT));
        listing.setPricingUnit(req.pricingUnit().trim());
        listing.setBasePrice(req.basePrice());
        listing.setDiscountPrice(req.discountPrice());
        listing.setMinimumCharge(req.minimumCharge());
        listing.setCalloutFee(req.calloutFee());
        listing.setDepositAmount(req.depositAmount());
        listing.setSalaryMax(req.salaryMax());
        listing.setQuoteBased(nextQuoteBased);
        listing.setUnpaid(nextUnpaid);
        if (req.pricingFormula() != null) {
            listing.setPricingFormula(req.pricingFormula());
        }
        listing.setMetadata(mergedMetadata.isEmpty() ? null : mergedMetadata);
        listing.setAvailabilityStatus(nextAvailability);
        listing.setStatus(nextStatus);

        ServiceListing saved = listingRepo.save(listing);

        AuditLog log = new AuditLog();
        log.setActorUid(principal.uid());
        log.setActorEmail(principal.email());
        log.setAction("LISTING_UPDATED");
        log.setEntityType("listing");
        log.setEntityId(String.valueOf(saved.getId()));
        log.setDetails(Map.of("title", saved.getTitle(), "basePrice", saved.getBasePrice(), "status", saved.getStatus()));
        auditLogRepo.save(log);

        return saved;
    }

    @Transactional
    public ServiceListing updateAvailability(UserPrincipal principal, Long listingId, String availabilityStatus) {
        if (!Set.of("AVAILABLE", "UNAVAILABLE", "OUT_OF_STOCK").contains(availabilityStatus)) {
            throw new ApiException(HttpStatus.BAD_REQUEST, "Invalid availability status.");
        }
        ServiceListing listing = listingRepo.findById(listingId)
                .orElseThrow(() -> new ApiException(HttpStatus.NOT_FOUND, "Listing not found."));
        Business biz = businessRepo.findById(listing.getBusinessId())
                .orElseThrow(() -> new ApiException(HttpStatus.NOT_FOUND, "Business not found."));
        if (!principal.isAdmin() && !biz.getOwnerUid().equals(principal.uid())) {
            throw new ApiException(HttpStatus.FORBIDDEN, "Permission denied: you do not own this listing's business.");
        }
        listing.setAvailabilityStatus(availabilityStatus);
        return listingRepo.save(listing);
    }

    private Long resolveJobSeekerCategoryId(Long requestedCategoryId) {
        if (requestedCategoryId != null) {
            Optional<ServiceCategory> explicit = categoryRepo.findById(requestedCategoryId);
            if (explicit.isPresent()) {
                return explicit.get().getId();
            }
        }
        List<ServiceCategory> all = categoryRepo.findAllByOrderByDisplayOrderAscIdAsc();
        for (ServiceCategory c : all) {
            if (!"ACTIVE".equalsIgnoreCase(c.getStatus())) continue;
            String slug = c.getSlug() != null ? c.getSlug().toLowerCase(Locale.ROOT) : "";
            String ctype = c.getCategoryType() != null ? c.getCategoryType().toUpperCase(Locale.ROOT) : "";
            String dlt = c.getDefaultListingType() != null ? c.getDefaultListingType().toUpperCase(Locale.ROOT) : "";
            if ("JOB".equals(ctype) || "WORKFORCE".equals(ctype) || "JOB".equals(dlt)
                    || slug.contains("job") || slug.contains("workforce")) {
                return c.getId();
            }
        }
        for (ServiceCategory c : all) {
            if ("ACTIVE".equalsIgnoreCase(c.getStatus())) {
                return c.getId();
            }
        }
        if (!all.isEmpty()) {
            return all.get(0).getId();
        }
        throw new ApiException(HttpStatus.BAD_REQUEST, "No service category available.");
    }

    private List<String> sanitizeImageUrls(List<String> rawList, String singleUrl) {
        List<String> sanitizedImages = new ArrayList<>();
        if (rawList != null) {
            for (String rawImg : rawList) {
                if (rawImg != null && !rawImg.isBlank()) {
                    String trimmed = rawImg.trim();
                    if (!sanitizedImages.contains(trimmed)) {
                        sanitizedImages.add(trimmed);
                    }
                }
            }
        }
        if (singleUrl != null && !singleUrl.isBlank()) {
            String primaryReq = singleUrl.trim();
            if (!sanitizedImages.contains(primaryReq) && sanitizedImages.isEmpty()) {
                sanitizedImages.add(primaryReq);
            }
        }
        return sanitizedImages;
    }

    private BigDecimal resolveLat(BigDecimal preferred, BigDecimal savedFallback) {
        if (preferred != null && geoDistanceService.isValidCoordinates(preferred.doubleValue(), 38.76)) {
            return preferred;
        }
        if (savedFallback != null && geoDistanceService.isValidCoordinates(savedFallback.doubleValue(), 38.76)) {
            return savedFallback;
        }
        return new BigDecimal("9.005401");
    }

    private BigDecimal resolveLng(BigDecimal preferred, BigDecimal savedFallback) {
        if (preferred != null && geoDistanceService.isValidCoordinates(9.0, preferred.doubleValue())) {
            return preferred;
        }
        if (savedFallback != null && geoDistanceService.isValidCoordinates(9.0, savedFallback.doubleValue())) {
            return savedFallback;
        }
        return new BigDecimal("38.763611");
    }

    private String nonBlank(String first, String second, String fallback) {
        if (first != null && !first.isBlank()) return first.trim();
        if (second != null && !second.isBlank()) return second.trim();
        return fallback;
    }

    private String resolveUserProfileName(UserAccount account, ProviderRegistration reg, String fallback) {
        if (account != null && account.getFullName() != null && !account.getFullName().isBlank()
                && !"Nearest You User".equalsIgnoreCase(account.getFullName().trim())) {
            return account.getFullName().trim();
        }
        if (reg != null && reg.getFullName() != null && !reg.getFullName().isBlank()) {
            return reg.getFullName().trim();
        }
        if (account != null && account.getFullName() != null && !account.getFullName().isBlank()) {
            return account.getFullName().trim();
        }
        return fallback;
    }

    private void enrichOwnerFullNames(List<Business> businesses) {
        if (businesses == null || businesses.isEmpty()) return;
        Map<String, UserAccount> userMap = new HashMap<>();
        for (UserAccount ua : userRepo.findAll()) {
            if (ua.getUid() != null) userMap.put(ua.getUid(), ua);
            if (ua.getFirebaseUid() != null) userMap.putIfAbsent(ua.getFirebaseUid(), ua);
        }
        for (Business b : businesses) {
            UserAccount acc = b.getOwnerUid() != null ? userMap.get(b.getOwnerUid()) : null;
            ProviderRegistration reg = b.getOwnerUid() != null
                    ? providerRepo.findFirstByUserUidOrderByUpdatedAtDesc(b.getOwnerUid()).orElse(null)
                    : null;
            b.setOwnerFullName(resolveUserProfileName(acc, reg, b.getBusinessName()));
        }
    }
}
