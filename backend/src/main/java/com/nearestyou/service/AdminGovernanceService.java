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
import java.time.Instant;
import java.time.LocalDate;
import java.time.ZoneOffset;
import java.util.*;

@Service
public class AdminGovernanceService {

    private static final Set<String> ALLOWED_ROLES = Set.of(
            "CUSTOMER", "PROVIDER", "BUSINESS_OWNER", "DELIVERY_PARTNER",
            "PEER_VOUCHER", "PROVIDER_APPROVER", "ADMIN", "SUPER_ADMIN"
    );

    private final UserAccountRepository userRepo;
    private final BusinessRepository businessRepo;
    private final ServiceCategoryRepository categoryRepo;
    private final ServiceListingRepository listingRepo;
    private final CustomerOrderRepository orderRepo;
    private final BookingRepository bookingRepo;
    private final DeliveryRequestRepository deliveryRepo;
    private final CommissionRecordRepository commissionRepo;
    private final AuditLogRepository auditLogRepo;
    private final PlatformSettingRepository settingRepo;
    private final DocumentTypeRepository documentTypeRepo;
    private final CategoryDocumentRequirementRepository requirementRepo;
    private final ProviderRegistrationRepository providerRepo;
    private final ProviderDocumentRepository providerDocRepo;
    private final UserSyncService userSyncService;

    public AdminGovernanceService(
            UserAccountRepository userRepo,
            BusinessRepository businessRepo,
            ServiceCategoryRepository categoryRepo,
            ServiceListingRepository listingRepo,
            CustomerOrderRepository orderRepo,
            BookingRepository bookingRepo,
            DeliveryRequestRepository deliveryRepo,
            CommissionRecordRepository commissionRepo,
            AuditLogRepository auditLogRepo,
            PlatformSettingRepository settingRepo,
            DocumentTypeRepository documentTypeRepo,
            CategoryDocumentRequirementRepository requirementRepo,
            ProviderRegistrationRepository providerRepo,
            ProviderDocumentRepository providerDocRepo,
            UserSyncService userSyncService
    ) {
        this.userRepo = userRepo;
        this.businessRepo = businessRepo;
        this.categoryRepo = categoryRepo;
        this.listingRepo = listingRepo;
        this.orderRepo = orderRepo;
        this.bookingRepo = bookingRepo;
        this.deliveryRepo = deliveryRepo;
        this.commissionRepo = commissionRepo;
        this.auditLogRepo = auditLogRepo;
        this.settingRepo = settingRepo;
        this.documentTypeRepo = documentTypeRepo;
        this.requirementRepo = requirementRepo;
        this.providerRepo = providerRepo;
        this.providerDocRepo = providerDocRepo;
        this.userSyncService = userSyncService;
    }

    @Transactional(readOnly = true)
    public Map<String, Object> getAdminPortalData() {
        List<ProviderRegistration> regs = providerRepo.findAllByOrderByUpdatedAtDesc();
        List<Map<String, Object>> enrichedProviders = regs.stream().map(reg -> {
            Map<String, Object> m = new LinkedHashMap<>();
            m.put("id", reg.getId());
            m.put("userUid", reg.getUserUid());
            m.put("fullName", reg.getFullName());
            m.put("phoneNumber", reg.getPhoneNumber());
            m.put("serviceCategoryId", reg.getServiceCategoryId());
            m.put("faydaIdNumber", reg.getFaydaIdNumber());
            m.put("faydaFrontImage", reg.getFaydaFrontImage());
            m.put("profilePhotoImage", reg.getProfilePhotoImage());
            m.put("livenessPassed", reg.isLivenessPassed());
            m.put("livenessScore", reg.getLivenessScore());
            m.put("livenessChallenges", reg.getLivenessChallenges());
            m.put("livenessSelfieImage", reg.getLivenessSelfieImage());
            m.put("subCity", reg.getSubCity());
            m.put("landmark", reg.getLandmark());
            m.put("latitude", reg.getLatitude());
            m.put("longitude", reg.getLongitude());
            m.put("isLiveLocationActive", reg.isLiveLocationActive());
            m.put("lastLocationUpdatedAt", reg.getLastLocationUpdatedAt());
            m.put("status", reg.getStatus());
            m.put("reviewNotes", reg.getReviewNotes());
            m.put("reviewedByUid", reg.getReviewedByUid());
            m.put("createdAt", reg.getCreatedAt());
            m.put("updatedAt", reg.getUpdatedAt());
            m.put("documents", providerDocRepo.findByRegistrationIdOrderByIdAsc(reg.getId()));
            return m;
        }).toList();

        Map<String, Object> data = new LinkedHashMap<>();
        data.put("users", userRepo.findAllByOrderByCreatedAtDesc());
        data.put("businesses", businessRepo.findAllByOrderByCreatedAtDesc().stream()
                .filter(b -> !"INDIVIDUAL_JOB_SEEKER".equalsIgnoreCase(b.getProfileType()))
                .toList());
        data.put("categories", categoryRepo.findAllByOrderByDisplayOrderAscIdAsc());
        data.put("listings", listingRepo.findAllByOrderByCreatedAtDesc());
        data.put("orders", orderRepo.findAllByOrderByCreatedAtDesc());
        data.put("bookings", bookingRepo.findAllByOrderByCreatedAtDesc());
        data.put("deliveries", deliveryRepo.findAllByOrderByCreatedAtDesc());
        data.put("commissions", commissionRepo.findAllByOrderByCreatedAtDesc());
        data.put("auditLogs", auditLogRepo.findAllByOrderByCreatedAtDesc());
        data.put("settings", settingRepo.findAll());
        data.put("documentTypes", documentTypeRepo.findAllByOrderByDocumentNameAscIdAsc());
        data.put("documentRequirements", requirementRepo.findAllByOrderByCategoryIdAscIdAsc());
        data.put("providerRegistrations", enrichedProviders);
        return data;
    }

    @Transactional(readOnly = true)
    public List<DocumentType> getDocumentTypes() {
        return documentTypeRepo.findAllByOrderByDocumentNameAscIdAsc();
    }

    @Transactional
    public DocumentType createDocumentType(UserPrincipal admin, CreateDocumentTypeRequest req) {
        String name = req.documentName().trim();
        String code = normalizeDocCode(req.documentCode(), name);
        if (documentTypeRepo.findByDocumentCodeIgnoreCase(code).isPresent()) {
            throw new ApiException(HttpStatus.BAD_REQUEST, "Document Type code '" + code + "' already exists.");
        }

        DocumentType dt = new DocumentType();
        dt.setDocumentCode(code);
        dt.setDocumentName(name);
        dt.setDocumentNameAm(req.documentNameAm() != null && !req.documentNameAm().isBlank() ? req.documentNameAm().trim() : name);
        dt.setDocumentNameOm(req.documentNameOm() != null && !req.documentNameOm().isBlank() ? req.documentNameOm().trim() : name);
        dt.setDescription(req.description() != null && !req.description().isBlank()
                ? req.description().trim()
                : name + " verification document.");
        dt.setDefaultMandatory(req.defaultMandatory() == null || req.defaultMandatory());
        dt.setDefaultRequiresDocumentNumber(req.defaultRequiresDocumentNumber() == null || req.defaultRequiresDocumentNumber());
        dt.setStatus("ACTIVE");

        DocumentType saved = documentTypeRepo.save(dt);
        recordAudit(admin, "DOCUMENT_TYPE_REGISTERED", "document_type", String.valueOf(saved.getId()),
                Map.of("documentCode", saved.getDocumentCode(), "documentName", saved.getDocumentName()));
        return saved;
    }

    @Transactional
    public DocumentType updateDocumentType(UserPrincipal admin, Long id, UpdateDocumentTypeRequest req) {
        DocumentType dt = documentTypeRepo.findById(id)
                .orElseThrow(() -> new ApiException(HttpStatus.NOT_FOUND, "Document Type not found."));
        String name = req.documentName().trim();
        String code = normalizeDocCode(req.documentCode(), name);

        documentTypeRepo.findByDocumentCodeIgnoreCase(code).ifPresent(other -> {
            if (!other.getId().equals(id)) {
                throw new ApiException(HttpStatus.BAD_REQUEST, "Document Type code '" + code + "' is already used.");
            }
        });

        dt.setDocumentCode(code);
        dt.setDocumentName(name);
        dt.setDocumentNameAm(req.documentNameAm() != null && !req.documentNameAm().isBlank() ? req.documentNameAm().trim() : name);
        dt.setDocumentNameOm(req.documentNameOm() != null && !req.documentNameOm().isBlank() ? req.documentNameOm().trim() : name);
        if (req.description() != null && !req.description().isBlank()) {
            dt.setDescription(req.description().trim());
        }
        if (req.defaultMandatory() != null) {
            dt.setDefaultMandatory(req.defaultMandatory());
        }
        if (req.defaultRequiresDocumentNumber() != null) {
            dt.setDefaultRequiresDocumentNumber(req.defaultRequiresDocumentNumber());
        }
        if (req.status() != null && Set.of("ACTIVE", "INACTIVE").contains(req.status().toUpperCase(Locale.ROOT))) {
            dt.setStatus(req.status().toUpperCase(Locale.ROOT));
        }

        DocumentType saved = documentTypeRepo.save(dt);
        for (CategoryDocumentRequirement mapped : requirementRepo.findByDocumentTypeId(saved.getId())) {
            mapped.setDocumentCode(saved.getDocumentCode());
            mapped.setDocumentName(saved.getDocumentName());
            mapped.setDocumentNameAm(saved.getDocumentNameAm());
            mapped.setDocumentNameOm(saved.getDocumentNameOm());
            requirementRepo.save(mapped);
        }

        recordAudit(admin, "DOCUMENT_TYPE_UPDATED", "document_type", String.valueOf(saved.getId()),
                Map.of("documentCode", saved.getDocumentCode(), "documentName", saved.getDocumentName(), "status", saved.getStatus()));
        return saved;
    }

    @Transactional
    public void deleteDocumentType(UserPrincipal admin, Long id) {
        DocumentType dt = documentTypeRepo.findById(id)
                .orElseThrow(() -> new ApiException(HttpStatus.NOT_FOUND, "Document Type not found."));
        long mappedCount = requirementRepo.countByDocumentTypeId(id);
        if (mappedCount > 0) {
            throw new ApiException(HttpStatus.BAD_REQUEST,
                    "This Document Type is mapped to " + mappedCount + " service(s). Unmap it from those services first or set status to INACTIVE.");
        }
        documentTypeRepo.delete(dt);
        recordAudit(admin, "DOCUMENT_TYPE_DELETED", "document_type", String.valueOf(id),
                Map.of("documentCode", dt.getDocumentCode(), "documentName", dt.getDocumentName()));
    }

    private String normalizeDocCode(String rawCode, String fallbackName) {
        String source = (rawCode != null && !rawCode.isBlank()) ? rawCode : fallbackName;
        String norm = source.trim().toUpperCase(Locale.ROOT).replaceAll("[^A-Z0-9]+", "_").replaceAll("^_|_$", "");
        return norm.isBlank() ? "DOC_" + System.currentTimeMillis() : norm;
    }

    @Transactional
    public CategoryDocumentRequirement createDocumentRequirement(UserPrincipal admin, CreateRequirementRequest req) {
        ServiceCategory category = categoryRepo.findById(req.categoryId())
                .orElseThrow(() -> new ApiException(HttpStatus.NOT_FOUND, "Target service category not found."));
        DocumentType docType = documentTypeRepo.findById(req.documentTypeId())
                .orElseThrow(() -> new ApiException(HttpStatus.BAD_REQUEST, "Register and select an Admin Document Type first before mapping."));
        if (!"ACTIVE".equalsIgnoreCase(docType.getStatus())) {
            throw new ApiException(HttpStatus.BAD_REQUEST, "Selected Document Type is INACTIVE. Activate it before mapping.");
        }
        if (requirementRepo.existsByCategoryIdAndDocumentTypeId(category.getId(), docType.getId())) {
            throw new ApiException(HttpStatus.BAD_REQUEST,
                    "'" + docType.getDocumentName() + "' is already mapped to '" + category.getName() + "'.");
        }

        CategoryDocumentRequirement entity = new CategoryDocumentRequirement();
        entity.setCategoryId(category.getId());
        entity.setDocumentTypeId(docType.getId());
        entity.setDocumentCode(docType.getDocumentCode());
        entity.setDocumentName(docType.getDocumentName());
        entity.setDocumentNameAm(docType.getDocumentNameAm());
        entity.setDocumentNameOm(docType.getDocumentNameOm());
        entity.setDescription(req.description() != null && !req.description().isBlank()
                ? req.description().trim()
                : docType.getDescription());
        entity.setMandatory(req.isMandatory() != null ? req.isMandatory() : docType.isDefaultMandatory());
        entity.setRequiresDocumentNumber(req.requiresDocumentNumber() != null
                ? req.requiresDocumentNumber() : docType.isDefaultRequiresDocumentNumber());

        CategoryDocumentRequirement saved = requirementRepo.save(entity);
        recordAudit(admin, "DOCUMENT_REQUIREMENT_MAPPED", "category_document_requirement", String.valueOf(saved.getId()),
                Map.of("categoryId", saved.getCategoryId(), "documentTypeId", docType.getId(), "documentName", saved.getDocumentName()));
        return saved;
    }

    @Transactional
    public void deleteDocumentRequirement(UserPrincipal admin, Long requirementId) {
        providerDocRepo.deleteByRequirementId(requirementId);
        requirementRepo.deleteById(requirementId);
        recordAudit(admin, "DOCUMENT_REQUIREMENT_REMOVED", "category_document_requirement", String.valueOf(requirementId), Map.of());
    }

    @Transactional
    public ProviderRegistration verifyProvider(UserPrincipal admin, Long regId, VerifyProviderRequest req) {
        ProviderRegistration reg = providerRepo.findById(regId)
                .orElseThrow(() -> new ApiException(HttpStatus.NOT_FOUND, "Provider registration not found."));
        String status = req.status().toUpperCase(Locale.ROOT);
        if (!Set.of("VERIFIED", "REJECTED", "REVOKED").contains(status)) {
            throw new ApiException(HttpStatus.BAD_REQUEST, "Provider status must be VERIFIED, REJECTED, or REVOKED.");
        }

        reg.setStatus(status);
        reg.setReviewNotes(req.reviewNotes());
        reg.setReviewedByUid(admin.uid());
        if ("VERIFIED".equals(status)) {
            reg.setApprovedByUid(admin.uid());
            reg.setApprovedByRole("ADMIN");
        } else if ("REVOKED".equals(status)) {
            reg.setApprovedByUid(null);
            reg.setApprovedByRole(null);
        }
        ProviderRegistration saved = providerRepo.save(reg);

        for (ProviderDocument doc : providerDocRepo.findByRegistrationIdOrderByIdAsc(regId)) {
            doc.setStatus(status);
            providerDocRepo.save(doc);
        }

        boolean isLogistics = categoryRepo.findById(reg.getServiceCategoryId())
                .map(c -> "DELIVERY".equalsIgnoreCase(c.getCategoryType())
                        || "TRANSPORT".equalsIgnoreCase(c.getDefaultListingType())
                        || c.getSlug().contains("delivery")
                        || c.getSlug().contains("transport"))
                .orElse(false);

        userRepo.findByUid(reg.getUserUid()).ifPresent(u -> {
            u.setProviderVerificationStatus(status);
            Set<String> roles = new LinkedHashSet<>(u.getRoles() != null ? u.getRoles() : List.of("CUSTOMER"));
            roles.add("CUSTOMER");
            if ("VERIFIED".equals(status)) {
                roles.add("PROVIDER");
                roles.add("BUSINESS_OWNER");
                if (isLogistics) roles.add("DELIVERY_PARTNER");
            } else {
                roles.remove("PROVIDER");
                roles.remove("BUSINESS_OWNER");
                roles.remove("DELIVERY_PARTNER");
                if ("REVOKED".equals(status)) {
                    roles.remove("PEER_VOUCHER");
                    roles.remove("PROVIDER_APPROVER");
                }
            }
            u.setRoles(new ArrayList<>(roles));
            userRepo.save(u);
        });

        for (Business b : businessRepo.findByOwnerUidOrderByIdAsc(reg.getUserUid())) {
            b.setFaydaVerified("VERIFIED".equals(status));
            b.setLivenessVerified("VERIFIED".equals(status) && reg.isLivenessPassed());
            if ("REVOKED".equals(status) && !"INDIVIDUAL_JOB_SEEKER".equalsIgnoreCase(b.getProfileType())) {
                b.setVerificationStatus("REVOKED");
            }
            businessRepo.save(b);
        }

        recordAudit(admin, "PROVIDER_KYC_" + status, "provider_registration", String.valueOf(regId),
                Map.of("fullName", reg.getFullName(), "status", status));
        return saved;
    }

    @Transactional
    public Business verifyBusiness(UserPrincipal admin, Long businessId, String verificationStatus) {
        Business biz = businessRepo.findById(businessId)
                .orElseThrow(() -> new ApiException(HttpStatus.NOT_FOUND, "Business not found."));
        String normStatus = verificationStatus.trim().toUpperCase(Locale.ROOT);
        if (!Set.of("APPROVED", "REJECTED", "REVOKED", "SUSPENDED").contains(normStatus)) {
            throw new ApiException(HttpStatus.BAD_REQUEST, "Business status must be APPROVED, REJECTED, REVOKED, or SUSPENDED.");
        }
        biz.setVerificationStatus(normStatus);
        biz.setFaydaVerified("APPROVED".equals(normStatus));
        biz.setLivenessVerified("APPROVED".equals(normStatus));
        Business saved = businessRepo.save(biz);

        if ("APPROVED".equals(normStatus)) {
            userSyncService.grantRoleToUid(saved.getOwnerUid(), "BUSINESS_OWNER");
        } else {
            boolean hasOtherApproved = businessRepo.findByOwnerUidOrderByIdAsc(saved.getOwnerUid()).stream()
                    .anyMatch(other -> !other.getId().equals(saved.getId())
                            && !"INDIVIDUAL_JOB_SEEKER".equalsIgnoreCase(other.getProfileType())
                            && "APPROVED".equalsIgnoreCase(other.getVerificationStatus()));
            if (!hasOtherApproved) {
                userSyncService.revokeRolesFromUid(saved.getOwnerUid(), List.of("BUSINESS_OWNER"));
            }
        }

        recordAudit(admin, "BUSINESS_" + normStatus, "business", String.valueOf(businessId),
                Map.of("businessName", saved.getBusinessName(), "verificationStatus", normStatus));
        return saved;
    }

    @Transactional
    public ServiceCategory createCategory(UserPrincipal admin, CreateCategoryRequest req) {
        String name = req.name().trim();
        String slug = buildUniqueSlug(name, null);
        String catType = (req.categoryType() != null && !req.categoryType().isBlank())
                ? req.categoryType().trim().toUpperCase(Locale.ROOT)
                : "SERVICE";
        String defaultListingType = resolveListingType(req.defaultListingType(), catType);

        ServiceCategory cat = new ServiceCategory();
        cat.setSlug(slug);
        cat.setName(name);
        cat.setNameAm(req.nameAm() != null && !req.nameAm().isBlank() ? req.nameAm().trim() : name);
        cat.setNameOm(req.nameOm() != null && !req.nameOm().isBlank() ? req.nameOm().trim() : name);
        cat.setDescription(req.description() != null && !req.description().isBlank()
                ? req.description().trim() : name + " local services");
        cat.setCategoryType(catType);
        cat.setDefaultListingType(defaultListingType);
        cat.setRequiresVerification(req.requiresVerification());
        cat.setCommissionRate(req.commissionRate() != null
                ? req.commissionRate().setScale(2, RoundingMode.HALF_UP) : new BigDecimal("10.00"));
        cat.setMinPriceEtb(req.minPriceEtb() != null
                ? req.minPriceEtb().setScale(2, RoundingMode.HALF_UP) : new BigDecimal("50.00"));
        cat.setStatus("ACTIVE");
        cat.setDisplayOrder(req.displayOrder() != null ? req.displayOrder() : (int) categoryRepo.count() + 1);
        ServiceCategory saved = categoryRepo.save(cat);

        recordAudit(admin, "CATEGORY_CREATED", "category", String.valueOf(saved.getId()),
                Map.of("name", saved.getName(), "categoryType", saved.getCategoryType(), "commissionRate", saved.getCommissionRate()));
        return saved;
    }

    @Transactional
    public ServiceCategory updateCategory(UserPrincipal admin, Long id, UpdateCategoryRequest req) {
        ServiceCategory cat = categoryRepo.findById(id)
                .orElseThrow(() -> new ApiException(HttpStatus.NOT_FOUND, "Service category not found."));
        String name = req.name().trim();
        String catType = (req.categoryType() != null && !req.categoryType().isBlank())
                ? req.categoryType().trim().toUpperCase(Locale.ROOT)
                : cat.getCategoryType();

        cat.setName(name);
        cat.setNameAm(req.nameAm() != null && !req.nameAm().isBlank() ? req.nameAm().trim() : name);
        cat.setNameOm(req.nameOm() != null && !req.nameOm().isBlank() ? req.nameOm().trim() : name);
        if (req.description() != null && !req.description().isBlank()) {
            cat.setDescription(req.description().trim());
        }
        cat.setCategoryType(catType);
        if (req.defaultListingType() != null && !req.defaultListingType().isBlank()) {
            cat.setDefaultListingType(req.defaultListingType().trim().toUpperCase(Locale.ROOT));
        }
        if (req.commissionRate() != null) {
            cat.setCommissionRate(req.commissionRate().setScale(2, RoundingMode.HALF_UP));
        }
        if (req.minPriceEtb() != null) {
            cat.setMinPriceEtb(req.minPriceEtb().setScale(2, RoundingMode.HALF_UP));
        }
        if (req.requiresVerification() != null) {
            cat.setRequiresVerification(req.requiresVerification());
        }
        if (req.displayOrder() != null) {
            cat.setDisplayOrder(req.displayOrder());
        }
        if (req.status() != null && Set.of("ACTIVE", "INACTIVE").contains(req.status().toUpperCase(Locale.ROOT))) {
            cat.setStatus(req.status().toUpperCase(Locale.ROOT));
        }

        ServiceCategory saved = categoryRepo.save(cat);
        recordAudit(admin, "CATEGORY_UPDATED", "category", String.valueOf(saved.getId()),
                Map.of("name", saved.getName(), "status", saved.getStatus()));
        return saved;
    }

    @Transactional
    public ServiceCategory updateCategoryStatus(UserPrincipal admin, Long id, String status) {
        String norm = status.trim().toUpperCase(Locale.ROOT);
        if (!Set.of("ACTIVE", "INACTIVE").contains(norm)) {
            throw new ApiException(HttpStatus.BAD_REQUEST, "Category status must be ACTIVE or INACTIVE.");
        }
        ServiceCategory cat = categoryRepo.findById(id)
                .orElseThrow(() -> new ApiException(HttpStatus.NOT_FOUND, "Service category not found."));
        cat.setStatus(norm);
        ServiceCategory saved = categoryRepo.save(cat);
        recordAudit(admin, "CATEGORY_STATUS_" + norm, "category", String.valueOf(id),
                Map.of("name", saved.getName(), "status", norm));
        return saved;
    }

    @Transactional
    public void deleteCategory(UserPrincipal admin, Long id) {
        ServiceCategory cat = categoryRepo.findById(id)
                .orElseThrow(() -> new ApiException(HttpStatus.NOT_FOUND, "Service category not found."));
        long bizRefs = businessRepo.countByCategoryId(id);
        long listingRefs = listingRepo.countByCategoryId(id);
        long providerRefs = providerRepo.countByServiceCategoryId(id);
        if (bizRefs > 0 || listingRefs > 0 || providerRefs > 0) {
            throw new ApiException(HttpStatus.BAD_REQUEST,
                    "Cannot delete service '" + cat.getName() + "' because it is referenced by businesses, listings, or providers. Set its status to INACTIVE instead.");
        }
        for (CategoryDocumentRequirement req : requirementRepo.findByCategoryIdOrderByIdAsc(id)) {
            providerDocRepo.deleteByRequirementId(req.getId());
        }
        requirementRepo.deleteByCategoryId(id);
        categoryRepo.delete(cat);
        recordAudit(admin, "CATEGORY_DELETED", "category", String.valueOf(id), Map.of("name", cat.getName()));
    }

    private String buildUniqueSlug(String name, Long excludeId) {
        String base = name.toLowerCase(Locale.ROOT).replaceAll("[^a-z0-9]+", "-").replaceAll("^-|-$", "");
        if (base.isBlank()) base = "service";
        String candidate = base;
        int suffix = 2;
        while (true) {
            Optional<ServiceCategory> existing = categoryRepo.findBySlug(candidate);
            if (existing.isEmpty() || Objects.equals(existing.get().getId(), excludeId)) {
                return candidate;
            }
            candidate = base + "-" + suffix++;
        }
    }

    private String resolveListingType(String explicit, String categoryType) {
        if (explicit != null && !explicit.isBlank()) {
            return explicit.trim().toUpperCase(Locale.ROOT);
        }
        return switch (categoryType.toUpperCase(Locale.ROOT)) {
            case "RETAIL", "SHOP", "SHOPS" -> "PRODUCT";
            case "DELIVERY" -> "TRANSPORT";
            case "FOOD", "RENTAL", "JOB", "HEALTHCARE", "EDUCATION", "EVENT", "PRODUCT", "SERVICE", "TRANSPORT" -> categoryType.toUpperCase(Locale.ROOT);
            default -> "SERVICE";
        };
    }

    @Transactional
    public PlatformSetting updatePricingPolicy(UserPrincipal admin, Map<String, Object> policy) {
        PlatformSetting setting = settingRepo.findBySettingKey("pricing_policy")
                .orElseGet(PlatformSetting::new);
        setting.setSettingKey("pricing_policy");
        setting.setSettingValue(policy);
        PlatformSetting saved = settingRepo.save(setting);

        recordAudit(admin, "PRICING_POLICY_UPDATED", "platform_settings", "pricing_policy", policy);
        return saved;
    }

    @Transactional
    public PlatformSetting updateOnboardingGovernance(UserPrincipal admin, Map<String, Object> gov) {
        PlatformSetting setting = settingRepo.findBySettingKey("onboarding_governance")
                .orElseGet(PlatformSetting::new);
        setting.setSettingKey("onboarding_governance");
        setting.setSettingValue(gov);
        PlatformSetting saved = settingRepo.save(setting);

        recordAudit(admin, "ONBOARDING_GOVERNANCE_UPDATED", "platform_settings", "onboarding_governance", gov);
        return saved;
    }

    @Transactional
    public UserAccount updateVouchEarly(UserPrincipal admin, Long userId, boolean canVouchEarly) {
        UserAccount target = userRepo.findById(userId)
                .orElseThrow(() -> new ApiException(HttpStatus.NOT_FOUND, "User not found."));
        target.setCanVouchEarly(canVouchEarly);
        UserAccount saved = userRepo.save(target);
        recordAudit(admin, canVouchEarly ? "VOUCH_EARLY_GRANTED" : "VOUCH_EARLY_REVOKED", "user", String.valueOf(userId),
                Map.of("email", saved.getEmail(), "canVouchEarly", canVouchEarly));
        return saved;
    }

    @Transactional
    public UserAccount updateUserStatus(UserPrincipal admin, Long userId, String accountStatus) {
        if (!Set.of("ACTIVE", "SUSPENDED").contains(accountStatus)) {
            throw new ApiException(HttpStatus.BAD_REQUEST, "Invalid accountStatus.");
        }
        UserAccount target = userRepo.findById(userId)
                .orElseThrow(() -> new ApiException(HttpStatus.NOT_FOUND, "User not found."));
        if ("SUSPENDED".equals(accountStatus)) {
            if (target.getUid().equals(admin.uid())) {
                throw new ApiException(HttpStatus.BAD_REQUEST, "You cannot suspend your own administrator account.");
            }
            if (userSyncService.isSuperAdminEmail(target.getEmail())) {
                throw new ApiException(HttpStatus.BAD_REQUEST, "Primary Super Admin cannot be suspended.");
            }
        }
        target.setAccountStatus(accountStatus);
        UserAccount saved = userRepo.save(target);
        recordAudit(admin, "USER_" + accountStatus, "user", String.valueOf(userId),
                Map.of("email", saved.getEmail(), "accountStatus", accountStatus));
        return saved;
    }

    @Transactional
    public UserAccount updateAdminRole(UserPrincipal admin, Long userId, boolean makeAdmin) {
        UserAccount target = userRepo.findById(userId)
                .orElseThrow(() -> new ApiException(HttpStatus.NOT_FOUND, "User not found."));
        if (!makeAdmin) {
            if (target.getUid().equals(admin.uid())) {
                throw new ApiException(HttpStatus.BAD_REQUEST, "You cannot revoke your own Admin privileges.");
            }
            if (userSyncService.isSuperAdminEmail(target.getEmail())) {
                throw new ApiException(HttpStatus.BAD_REQUEST, "Primary Super Admin privileges cannot be revoked.");
            }
        }
        Set<String> roles = new LinkedHashSet<>(target.getRoles() != null ? target.getRoles() : List.of("CUSTOMER"));
        roles.add("CUSTOMER");
        if (makeAdmin) {
            roles.add("ADMIN");
        } else {
            roles.remove("ADMIN");
            roles.remove("SUPER_ADMIN");
        }
        target.setAdmin(makeAdmin);
        target.setRoles(new ArrayList<>(roles));
        UserAccount saved = userRepo.save(target);

        recordAudit(admin, makeAdmin ? "ADMIN_ROLE_GRANTED" : "ADMIN_ROLE_REVOKED", "user", String.valueOf(userId),
                Map.of("email", saved.getEmail(), "isAdmin", makeAdmin));
        return saved;
    }

    @Transactional
    public UserAccount updateUserRoles(UserPrincipal admin, Long userId, List<String> requestedRoles) {
        UserAccount target = userRepo.findById(userId)
                .orElseThrow(() -> new ApiException(HttpStatus.NOT_FOUND, "User not found."));

        Set<String> sanitized = new LinkedHashSet<>();
        sanitized.add("CUSTOMER");
        if (requestedRoles != null) {
            for (String r : requestedRoles) {
                if (ALLOWED_ROLES.contains(r)) {
                    sanitized.add(r);
                }
            }
        }
        boolean isProtectedSuper = userSyncService.isSuperAdminEmail(target.getEmail());
        if (isProtectedSuper || target.getUid().equals(admin.uid())) {
            sanitized.add("ADMIN");
            if (isProtectedSuper) {
                sanitized.add("SUPER_ADMIN");
            }
        }

        boolean nextIsAdmin = sanitized.contains("ADMIN") || sanitized.contains("SUPER_ADMIN");
        target.setRoles(new ArrayList<>(sanitized));
        target.setAdmin(nextIsAdmin);
        UserAccount saved = userRepo.save(target);

        recordAudit(admin, "USER_ROLES_UPDATED", "user", String.valueOf(userId),
                Map.of("email", saved.getEmail(), "roles", sanitized));
        return saved;
    }

    @Transactional(readOnly = true)
    public Map<String, Object> getGovernmentTaxReport(String fromDate, String toDate, String paymentMethod, Long businessId) {
        Instant fromInstant = (fromDate != null && !fromDate.isBlank()) ? LocalDate.parse(fromDate).atStartOfDay().toInstant(ZoneOffset.UTC) : null;
        Instant toInstant = (toDate != null && !toDate.isBlank()) ? LocalDate.parse(toDate).plusDays(1).atStartOfDay().toInstant(ZoneOffset.UTC) : null;
        String pmFilter = (paymentMethod != null && !paymentMethod.isBlank() && !"ALL".equalsIgnoreCase(paymentMethod)) ? paymentMethod : null;

        Map<Long, Business> bizMap = new HashMap<>();
        for (Business b : businessRepo.findAll()) {
            bizMap.put(b.getId(), b);
        }

        List<CommissionRecord> filtered = commissionRepo.findAllByOrderByCreatedAtDesc().stream()
                .filter(c -> fromInstant == null || !c.getCreatedAt().isBefore(fromInstant))
                .filter(c -> toInstant == null || c.getCreatedAt().isBefore(toInstant))
                .filter(c -> pmFilter == null || pmFilter.equalsIgnoreCase(c.getPaymentMethod()))
                .filter(c -> businessId == null || Objects.equals(businessId, c.getBusinessId()))
                .toList();

        BigDecimal totalGross = BigDecimal.ZERO;
        BigDecimal totalTaxable = BigDecimal.ZERO;
        BigDecimal totalVat = BigDecimal.ZERO;
        BigDecimal totalWht = BigDecimal.ZERO;
        BigDecimal totalCommission = BigDecimal.ZERO;
        BigDecimal totalProviderNet = BigDecimal.ZERO;
        BigDecimal digitalGross = BigDecimal.ZERO;
        BigDecimal cashGross = BigDecimal.ZERO;

        Map<String, Map<String, Object>> taxpayerMap = new LinkedHashMap<>();
        List<Map<String, Object>> ledger = new ArrayList<>();

        for (CommissionRecord c : filtered) {
            BigDecimal gross = c.getGrossAmount();
            BigDecimal taxable = c.getTaxableAmount() != null && c.getTaxableAmount().compareTo(BigDecimal.ZERO) > 0
                    ? c.getTaxableAmount()
                    : gross.divide(new BigDecimal("1.15"), 2, RoundingMode.HALF_UP);
            BigDecimal vat = c.getVatAmount() != null && c.getVatAmount().compareTo(BigDecimal.ZERO) > 0
                    ? c.getVatAmount()
                    : gross.subtract(taxable).setScale(2, RoundingMode.HALF_UP);
            BigDecimal wht = c.getWithholdingTaxAmount() != null ? c.getWithholdingTaxAmount() : BigDecimal.ZERO;

            totalGross = totalGross.add(gross);
            totalTaxable = totalTaxable.add(taxable);
            totalVat = totalVat.add(vat);
            totalWht = totalWht.add(wht);
            totalCommission = totalCommission.add(c.getCommissionAmount());
            totalProviderNet = totalProviderNet.add(c.getProviderAmount());

            if ("CASH".equalsIgnoreCase(c.getPaymentMethod())) {
                cashGross = cashGross.add(gross);
            } else {
                digitalGross = digitalGross.add(gross);
            }

            Business biz = c.getBusinessId() != null ? bizMap.get(c.getBusinessId()) : null;
            String tpKey = biz != null ? "BIZ-" + biz.getId() : "INDEPENDENT-LOGISTICS";
            Map<String, Object> tp = taxpayerMap.computeIfAbsent(tpKey, k -> {
                Map<String, Object> m = new LinkedHashMap<>();
                m.put("taxpayerKey", tpKey);
                m.put("businessId", biz != null ? biz.getId() : null);
                m.put("businessName", biz != null ? biz.getBusinessName() : "Independent Courier & Ride Partners");
                m.put("tinNumber", biz != null && biz.getTinNumber() != null ? biz.getTinNumber() : "TIN-PENDING");
                m.put("licenseNumber", biz != null ? biz.getLicenseNumber() : "TRANSPORT-POOL");
                m.put("subCity", biz != null ? biz.getSubCity() : "Addis Ababa");
                m.put("transactionCount", 0);
                m.put("grossAmount", BigDecimal.ZERO);
                m.put("taxableAmount", BigDecimal.ZERO);
                m.put("vatAmount", BigDecimal.ZERO);
                m.put("withholdingTaxAmount", BigDecimal.ZERO);
                m.put("commissionAmount", BigDecimal.ZERO);
                m.put("totalTaxDue", BigDecimal.ZERO);
                return m;
            });

            tp.put("transactionCount", ((Integer) tp.get("transactionCount")) + 1);
            tp.put("grossAmount", ((BigDecimal) tp.get("grossAmount")).add(gross));
            tp.put("taxableAmount", ((BigDecimal) tp.get("taxableAmount")).add(taxable));
            BigDecimal nextTpVat = ((BigDecimal) tp.get("vatAmount")).add(vat);
            BigDecimal nextTpWht = ((BigDecimal) tp.get("withholdingTaxAmount")).add(wht);
            tp.put("vatAmount", nextTpVat);
            tp.put("withholdingTaxAmount", nextTpWht);
            tp.put("commissionAmount", ((BigDecimal) tp.get("commissionAmount")).add(c.getCommissionAmount()));
            tp.put("totalTaxDue", nextTpVat.add(nextTpWht));

            Map<String, Object> row = new LinkedHashMap<>();
            row.put("id", c.getId());
            row.put("transactionRef", c.getTransactionRef());
            row.put("transactionType", c.getTransactionType());
            row.put("businessId", c.getBusinessId());
            row.put("businessName", tp.get("businessName"));
            row.put("tinNumber", tp.get("tinNumber"));
            row.put("fiscalReceiptNumber", c.getFiscalReceiptNumber() != null ? c.getFiscalReceiptNumber() : "ETH-MOR-" + c.getId());
            row.put("taxPeriod", c.getTaxPeriod());
            row.put("grossAmount", gross);
            row.put("taxableAmount", taxable);
            row.put("vatAmount", vat);
            row.put("withholdingTaxAmount", wht);
            row.put("commissionAmount", c.getCommissionAmount());
            row.put("providerAmount", c.getProviderAmount());
            row.put("paymentMethod", c.getPaymentMethod());
            row.put("status", c.getStatus());
            row.put("createdAt", c.getCreatedAt());
            ledger.add(row);
        }

        List<DeliveryRequest> allDeliveries = deliveryRepo.findAllByOrderByCreatedAtDesc();
        BigDecimal escrowHeldTotal = allDeliveries.stream()
                .filter(d -> "HELD_IN_ESCROW".equalsIgnoreCase(d.getEscrowStatus()) || "FROZEN_DISPUTE".equalsIgnoreCase(d.getEscrowStatus()))
                .map(DeliveryRequest::getEscrowAmount)
                .reduce(BigDecimal.ZERO, BigDecimal::add);
        long activeDisputeCount = allDeliveries.stream()
                .filter(d -> "FROZEN_DISPUTE".equalsIgnoreCase(d.getEscrowStatus()) || "DISPUTED".equalsIgnoreCase(d.getStatus()))
                .count();

        double complianceRate = totalGross.compareTo(BigDecimal.ZERO) > 0
                ? digitalGross.divide(totalGross, 4, RoundingMode.HALF_UP).multiply(BigDecimal.valueOf(100)).setScale(2, RoundingMode.HALF_UP).doubleValue()
                : 100.0;

        Map<String, Object> summary = new LinkedHashMap<>();
        summary.put("totalTransactions", filtered.size());
        summary.put("totalGrossVolumeEtb", totalGross);
        summary.put("totalTaxableBaseEtb", totalTaxable);
        summary.put("totalVatCollectedEtb", totalVat);
        summary.put("totalWithholdingTaxEtb", totalWht);
        summary.put("totalTaxDueEtb", totalVat.add(totalWht));
        summary.put("totalPlatformCommissionEtb", totalCommission);
        summary.put("totalProviderNetEtb", totalProviderNet);
        summary.put("digitalGrossEtb", digitalGross);
        summary.put("cashGrossEtb", cashGross);
        summary.put("digitalComplianceRatePercent", complianceRate);
        summary.put("escrowHeldTotalEtb", escrowHeldTotal);
        summary.put("activeDisputeCount", activeDisputeCount);

        Map<String, Object> report = new LinkedHashMap<>();
        report.put("generatedAt", Instant.now().toString());
        report.put("authority", "Ministry of Revenues / ERCA Fiscal Control Extract");
        report.put("currency", "ETB");
        report.put("summary", summary);
        report.put("taxpayers", new ArrayList<>(taxpayerMap.values()));
        report.put("ledger", ledger);
        return report;
    }

    @Transactional
    public DeliveryRequest resolveDeliveryDispute(UserPrincipal admin, Long deliveryId, String resolution, String note) {
        String norm = resolution.toUpperCase(Locale.ROOT);
        DeliveryRequest existing = deliveryRepo.findById(deliveryId)
                .orElseThrow(() -> new ApiException(HttpStatus.NOT_FOUND, "Delivery not found."));

        switch (norm) {
            case "RELEASED", "RELEASE_DRIVER" -> {
                existing.setEscrowStatus("RELEASED");
                existing.setStatus("COMPLETED");
                existing.setDeliveredConfirmedAt(Instant.now());
            }
            case "REFUNDED", "REFUND_SENDER" -> {
                existing.setEscrowStatus("REFUNDED");
                existing.setStatus("CANCELLED");
            }
            case "SPLIT_SETTLEMENT" -> {
                existing.setEscrowStatus("SPLIT_SETTLED");
                existing.setStatus("COMPLETED");
                existing.setDeliveredConfirmedAt(Instant.now());
            }
            case "REASSIGN_DRIVER" -> {
                existing.setEscrowStatus("HELD_IN_ESCROW");
                existing.setStatus("REQUESTED");
                existing.setDriverUid(null);
                existing.setDriverName(null);
                existing.setDriverLat(null);
                existing.setDriverLng(null);
            }
            default -> throw new ApiException(HttpStatus.BAD_REQUEST, "Unsupported resolution outcome.");
        }

        existing.setConflictStatus("RESOLVED");
        existing.setConflictResolution(norm);
        existing.setConflictResolvedAt(Instant.now());
        if (note != null && !note.isBlank()) {
            existing.setDisputeReason(note.trim());
        }
        DeliveryRequest saved = deliveryRepo.save(existing);
        recordAudit(admin, "ADMIN_CONFLICT_" + norm, "delivery", String.valueOf(deliveryId),
                Map.of("trackingCode", saved.getTrackingCode(), "resolution", norm));
        return saved;
    }

    private void recordAudit(UserPrincipal admin, String action, String entityType, String entityId, Map<String, Object> details) {
        AuditLog log = new AuditLog();
        log.setActorUid(admin.uid());
        log.setActorEmail(admin.email());
        log.setAction(action);
        log.setEntityType(entityType);
        log.setEntityId(entityId);
        log.setDetails(details);
        auditLogRepo.save(log);
    }
}
