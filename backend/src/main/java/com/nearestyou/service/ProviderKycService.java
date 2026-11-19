package com.nearestyou.service;

import com.nearestyou.dto.NearestYouDtos.ProviderDocSubmission;
import com.nearestyou.dto.NearestYouDtos.ProviderRegistrationRequest;
import com.nearestyou.dto.NearestYouDtos.UpdateLiveLocationRequest;
import com.nearestyou.entity.*;
import com.nearestyou.exception.ApiException;
import com.nearestyou.repository.*;
import com.nearestyou.security.UserPrincipal;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.Duration;
import java.time.Instant;
import java.time.temporal.ChronoUnit;
import java.util.*;

@Service
public class ProviderKycService {

    private final ProviderRegistrationRepository providerRepo;
    private final ProviderDocumentRepository providerDocRepo;
    private final CategoryDocumentRequirementRepository requirementRepo;
    private final UserAccountRepository userRepo;
    private final BusinessRepository businessRepo;
    private final ServiceCategoryRepository categoryRepo;
    private final PlatformSettingRepository settingRepo;
    private final AuditLogRepository auditLogRepo;
    private final GeoDistanceService geoDistanceService;

    public ProviderKycService(
            ProviderRegistrationRepository providerRepo,
            ProviderDocumentRepository providerDocRepo,
            CategoryDocumentRequirementRepository requirementRepo,
            UserAccountRepository userRepo,
            BusinessRepository businessRepo,
            ServiceCategoryRepository categoryRepo,
            PlatformSettingRepository settingRepo,
            AuditLogRepository auditLogRepo,
            GeoDistanceService geoDistanceService
    ) {
        this.providerRepo = providerRepo;
        this.providerDocRepo = providerDocRepo;
        this.requirementRepo = requirementRepo;
        this.userRepo = userRepo;
        this.businessRepo = businessRepo;
        this.categoryRepo = categoryRepo;
        this.settingRepo = settingRepo;
        this.auditLogRepo = auditLogRepo;
        this.geoDistanceService = geoDistanceService;
    }

    @Transactional(readOnly = true)
    public Map<String, Object> getOnboardingGovernance() {
        Map<String, Object> gov = new LinkedHashMap<>();
        gov.put("minAccountAgeDays", 30);
        gov.put("qrExpiryMinutes", 10);
        gov.put("allowedVoucherRoles", List.of("BUSINESS_OWNER", "DELIVERY_PARTNER", "PROVIDER", "PEER_VOUCHER", "PROVIDER_APPROVER", "ADMIN", "SUPER_ADMIN"));
        gov.put("exceptionalVoucherRoles", List.of("PEER_VOUCHER", "ADMIN", "SUPER_ADMIN"));
        gov.put("allowedApproverRoles", List.of("ADMIN", "SUPER_ADMIN", "PROVIDER_APPROVER"));
        gov.put("requirePeerQrAfterFirstProvider", true);

        settingRepo.findBySettingKey("onboarding_governance").ifPresent(ps -> {
            if (ps.getSettingValue() != null) {
                gov.putAll(ps.getSettingValue());
            }
        });
        return gov;
    }

    @Transactional(readOnly = true)
    public Map<String, Object> getProviderForUser(String uid) {
        List<CategoryDocumentRequirement> requirements = requirementRepo.findAllByOrderByCategoryIdAscIdAsc();
        Optional<ProviderRegistration> regOpt = providerRepo.findFirstByUserUidOrderByUpdatedAtDesc(uid);

        Map<String, Object> registrationView = null;
        if (regOpt.isPresent()) {
            ProviderRegistration reg = regOpt.get();
            List<ProviderDocument> docs = providerDocRepo.findByRegistrationIdOrderByIdAsc(reg.getId());
            registrationView = new LinkedHashMap<>();
            registrationView.put("registration", reg);
            registrationView.put("documents", docs);
        }

        Map<String, Object> result = new LinkedHashMap<>();
        result.put("registration", registrationView);
        result.put("requirements", requirements);
        return result;
    }

    @Transactional
    public Map<String, Object> submitRegistration(String uid, String email, ProviderRegistrationRequest req) {
        if (req.faydaIdNumber().trim().length() < 8) {
            throw new ApiException(HttpStatus.BAD_REQUEST, "Valid Fayda National ID (minimum 8 characters) is required.");
        }
        if (!req.livenessPassed()) {
            throw new ApiException(HttpStatus.BAD_REQUEST, "You must pass the live Alive biometric verification check before registering.");
        }
        double lat = req.latitude().doubleValue();
        double lng = req.longitude().doubleValue();
        if (!geoDistanceService.isValidCoordinates(lat, lng)) {
            throw new ApiException(HttpStatus.BAD_REQUEST, "Valid real-time map coordinates (latitude/longitude) are required.");
        }

        List<CategoryDocumentRequirement> requiredDocs = requirementRepo.findByCategoryIdOrderByIdAsc(req.serviceCategoryId());
        List<ProviderDocSubmission> submittedDocs = req.documents() != null ? req.documents() : List.of();
        Map<Long, ProviderDocSubmission> submittedByReq = new HashMap<>();
        for (ProviderDocSubmission doc : submittedDocs) {
            submittedByReq.put(doc.requirementId(), doc);
        }

        List<String> missingMandatory = new ArrayList<>();
        for (CategoryDocumentRequirement mandatoryReq : requiredDocs) {
            if (mandatoryReq.isMandatory()) {
                ProviderDocSubmission match = submittedByReq.get(mandatoryReq.getId());
                if (match == null || match.fileDataUrl().isBlank()) {
                    missingMandatory.add(mandatoryReq.getDocumentName());
                }
            }
        }
        if (!missingMandatory.isEmpty()) {
            throw new ApiException(HttpStatus.BAD_REQUEST,
                    "Missing required documents for this service: " + String.join(", ", missingMandatory));
        }

        Map<String, Object> gov = getOnboardingGovernance();
        long verifiedCount = providerRepo.countByStatus("VERIFIED");
        boolean requirePeerQr = Boolean.TRUE.equals(gov.get("requirePeerQrAfterFirstProvider")) && verifiedCount > 0;
        int qrExpiryMin = ((Number) gov.getOrDefault("qrExpiryMinutes", 10)).intValue();

        String initialStatus = requirePeerQr ? "PENDING_PEER_AUTH" : "PENDING_REVIEW";
        String qrToken = requirePeerQr ? "NYQR-" + UUID.randomUUID().toString().replace("-", "").substring(0, 16).toUpperCase(Locale.ROOT) : null;
        Instant qrExpiresAt = requirePeerQr ? Instant.now().plus(qrExpiryMin, ChronoUnit.MINUTES) : null;

        ProviderRegistration savedReg = providerRepo.findFirstByUserUidOrderByUpdatedAtDesc(uid)
                .orElseGet(ProviderRegistration::new);

        savedReg.setUserUid(uid);
        savedReg.setFullName(req.fullName().trim());
        savedReg.setPhoneNumber(req.phoneNumber().trim());
        savedReg.setServiceCategoryId(req.serviceCategoryId());
        savedReg.setFaydaIdNumber(req.faydaIdNumber().trim());
        savedReg.setFaydaFrontImage(req.faydaFrontImage());
        savedReg.setProfilePhotoImage(req.profilePhotoImage());
        savedReg.setLivenessPassed(true);
        savedReg.setLivenessScore(req.livenessScore() != null ? Math.max(85, Math.min(100, req.livenessScore())) : 95);
        savedReg.setLivenessChallenges(req.livenessChallenges() != null ? req.livenessChallenges() : List.of());
        savedReg.setLivenessSelfieImage(req.livenessSelfieImage());
        savedReg.setSubCity(req.subCity().trim());
        savedReg.setLandmark(req.landmark().trim());
        savedReg.setLatitude(req.latitude());
        savedReg.setLongitude(req.longitude());
        savedReg.setLiveLocationActive(req.isLiveLocationActive());
        savedReg.setLastLocationUpdatedAt(Instant.now());
        savedReg.setStatus(initialStatus);
        savedReg.setQrVoucherToken(qrToken);
        savedReg.setQrExpiresAt(qrExpiresAt);
        savedReg.setVouchedByUid(null);
        savedReg.setVouchedByName(null);
        savedReg.setVouchedByEmail(null);
        savedReg.setVouchedAt(null);
        savedReg.setReviewNotes(null);
        savedReg.setReviewedByUid(null);
        savedReg = providerRepo.save(savedReg);

        providerDocRepo.deleteByRegistrationId(savedReg.getId());
        List<ProviderDocument> savedDocs = new ArrayList<>();
        for (ProviderDocSubmission doc : submittedDocs) {
            ProviderDocument pd = new ProviderDocument();
            pd.setRegistrationId(savedReg.getId());
            pd.setRequirementId(doc.requirementId());
            pd.setDocumentName(doc.documentName() != null ? doc.documentName() : "Required Document");
            pd.setDocumentNumber(doc.documentNumber());
            pd.setFileName(doc.fileName());
            pd.setFileDataUrl(doc.fileDataUrl());
            pd.setStatus("SUBMITTED");
            savedDocs.add(providerDocRepo.save(pd));
        }

        final ProviderRegistration finalReg = savedReg;
        userRepo.findByUid(uid).ifPresent(user -> {
            user.setFullName(finalReg.getFullName());
            user.setPhoneNumber(finalReg.getPhoneNumber());
            user.setFaydaIdNumber(finalReg.getFaydaIdNumber());
            user.setFaydaDocumentUrl(finalReg.getFaydaFrontImage());
            user.setProfilePhotoUrl(finalReg.getProfilePhotoImage());
            user.setLivenessStatus("PASSED");
            user.setLivenessVerifiedAt(Instant.now());
            user.setProviderVerificationStatus(initialStatus);
            user.setDefaultSubCity(finalReg.getSubCity());
            user.setDefaultLat(finalReg.getLatitude());
            user.setDefaultLng(finalReg.getLongitude());
            userRepo.save(user);
        });

        AuditLog log = new AuditLog();
        log.setActorUid(uid);
        log.setActorEmail(email);
        log.setAction("PROVIDER_KYC_SUBMITTED");
        log.setEntityType("provider_registration");
        log.setEntityId(String.valueOf(savedReg.getId()));
        log.setDetails(Map.of(
                "faydaIdNumber", savedReg.getFaydaIdNumber(),
                "serviceCategoryId", savedReg.getServiceCategoryId(),
                "status", initialStatus
        ));
        auditLogRepo.save(log);

        return Map.of("registration", savedReg, "documents", savedDocs);
    }

    @Transactional
    public Map<String, Object> regenerateQr(String uid) {
        ProviderRegistration reg = providerRepo.findFirstByUserUidOrderByUpdatedAtDesc(uid)
                .orElseThrow(() -> new ApiException(HttpStatus.BAD_REQUEST, "No provider registration found."));
        if ("VERIFIED".equalsIgnoreCase(reg.getStatus()) || "PENDING_APPROVAL".equalsIgnoreCase(reg.getStatus())) {
            throw new ApiException(HttpStatus.BAD_REQUEST, "Provider registration has already completed authentication.");
        }
        Map<String, Object> gov = getOnboardingGovernance();
        int qrExpiryMin = ((Number) gov.getOrDefault("qrExpiryMinutes", 10)).intValue();
        reg.setQrVoucherToken("NYQR-" + UUID.randomUUID().toString().replace("-", "").substring(0, 16).toUpperCase(Locale.ROOT));
        reg.setQrExpiresAt(Instant.now().plus(qrExpiryMin, ChronoUnit.MINUTES));
        reg.setStatus("PENDING_PEER_AUTH");
        providerRepo.save(reg);
        return getProviderForUser(uid);
    }

    @SuppressWarnings("unchecked")
    @Transactional
    public Map<String, Object> vouchViaQr(UserPrincipal scanner, String rawToken) {
        if (!"ACTIVE".equalsIgnoreCase(scanner.account().getAccountStatus())) {
            throw new ApiException(HttpStatus.FORBIDDEN, "Only ACTIVE accounts can vouch for peers.");
        }
        Map<String, Object> gov = getOnboardingGovernance();
        int minDays = ((Number) gov.getOrDefault("minAccountAgeDays", 30)).intValue();
        List<String> allowedVoucherRoles = (List<String>) gov.getOrDefault("allowedVoucherRoles", List.of("ADMIN", "SUPER_ADMIN"));
        List<String> exceptionalRoles = (List<String>) gov.getOrDefault("exceptionalVoucherRoles", List.of("PEER_VOUCHER", "ADMIN", "SUPER_ADMIN"));

        long ageDays = Math.max(0, Duration.between(scanner.account().getCreatedAt(), Instant.now()).toDays());
        boolean hasExceptional = scanner.isAdmin() || scanner.account().isCanVouchEarly()
                || scanner.account().getRoles().stream().anyMatch(exceptionalRoles::contains);
        if (!hasExceptional) {
            boolean hasRole = scanner.account().getRoles().stream().anyMatch(allowedVoucherRoles::contains);
            if (!hasRole) {
                throw new ApiException(HttpStatus.FORBIDDEN, "Your current roles are not authorized to authenticate new providers.");
            }
            if (ageDays < minDays) {
                throw new ApiException(HttpStatus.FORBIDDEN, "Account tenure policy: requires " + minDays + " days (~1 month) unless granted an exceptional role.");
            }
        }

        String token = rawToken != null ? rawToken.trim() : "";
        ProviderRegistration reg = providerRepo.findByQrVoucherToken(token)
                .orElseThrow(() -> new ApiException(HttpStatus.BAD_REQUEST, "Invalid or unknown QR voucher token."));

        if (reg.getUserUid().equals(scanner.uid())) {
            throw new ApiException(HttpStatus.FORBIDDEN, "Self-authentication is blocked.");
        }
        if (!"PENDING_PEER_AUTH".equalsIgnoreCase(reg.getStatus())) {
            throw new ApiException(HttpStatus.BAD_REQUEST, "Registration is currently " + reg.getStatus() + ".");
        }
        if (reg.getQrExpiresAt() == null || reg.getQrExpiresAt().isBefore(Instant.now())) {
            throw new ApiException(HttpStatus.BAD_REQUEST, "This 10-minute QR code has expired.");
        }

        reg.setVouchedByUid(scanner.uid());
        reg.setVouchedByName(scanner.account().getFullName());
        reg.setVouchedByEmail(scanner.email());
        reg.setVouchedAt(Instant.now());
        reg.setStatus("PENDING_APPROVAL");
        ProviderRegistration saved = providerRepo.save(reg);

        userRepo.findByUid(reg.getUserUid()).ifPresent(u -> {
            u.setProviderVerificationStatus("PENDING_APPROVAL");
            userRepo.save(u);
        });

        AuditLog log = new AuditLog();
        log.setActorUid(scanner.uid());
        log.setActorEmail(scanner.email());
        log.setAction("PROVIDER_PEER_VOUCHED");
        log.setEntityType("provider_registration");
        log.setEntityId(String.valueOf(saved.getId()));
        log.setDetails(Map.of("applicantName", saved.getFullName(), "accountAgeDays", ageDays, "exceptional", hasExceptional));
        auditLogRepo.save(log);

        return Map.of("registration", Map.of(
                "id", saved.getId(),
                "fullName", saved.getFullName(),
                "status", saved.getStatus(),
                "vouchedByName", saved.getVouchedByName(),
                "vouchedAt", saved.getVouchedAt()
        ));
    }

    @SuppressWarnings("unchecked")
    private boolean isApprover(UserPrincipal viewer, Map<String, Object> gov) {
        if (viewer.isAdmin()) return true;
        List<String> approvers = (List<String>) gov.getOrDefault("allowedApproverRoles", List.of("ADMIN", "SUPER_ADMIN", "PROVIDER_APPROVER"));
        return viewer.account().getRoles().stream().anyMatch(approvers::contains);
    }

    @Transactional(readOnly = true)
    public List<Map<String, Object>> getApprovalsQueue(UserPrincipal viewer) {
        Map<String, Object> gov = getOnboardingGovernance();
        if (!isApprover(viewer, gov)) {
            throw new ApiException(HttpStatus.FORBIDDEN, "Approval Access Denied: Missing approver role.");
        }
        return providerRepo.findAllByOrderByUpdatedAtDesc().stream()
                .filter(r -> viewer.isAdmin() || List.of("PENDING_APPROVAL", "VERIFIED", "REJECTED", "REVOKED").contains(r.getStatus()))
                .map(r -> {
                    Map<String, Object> m = new LinkedHashMap<>();
                    m.put("id", r.getId());
                    m.put("userUid", r.getUserUid());
                    m.put("fullName", r.getFullName());
                    m.put("phoneNumber", r.getPhoneNumber());
                    m.put("serviceCategoryId", r.getServiceCategoryId());
                    m.put("faydaIdNumber", r.getFaydaIdNumber());
                    m.put("faydaFrontImage", r.getFaydaFrontImage());
                    m.put("profilePhotoImage", r.getProfilePhotoImage());
                    m.put("livenessPassed", r.isLivenessPassed());
                    m.put("livenessScore", r.getLivenessScore());
                    m.put("subCity", r.getSubCity());
                    m.put("landmark", r.getLandmark());
                    m.put("latitude", r.getLatitude());
                    m.put("longitude", r.getLongitude());
                    m.put("status", r.getStatus());
                    m.put("vouchedByName", r.getVouchedByName());
                    m.put("vouchedByEmail", r.getVouchedByEmail());
                    m.put("vouchedAt", r.getVouchedAt());
                    m.put("approvedByRole", r.getApprovedByRole());
                    m.put("reviewNotes", r.getReviewNotes());
                    m.put("documents", providerDocRepo.findByRegistrationIdOrderByIdAsc(r.getId()));
                    return m;
                })
                .toList();
    }

    @Transactional
    public ProviderRegistration approveOrRejectProvider(UserPrincipal approver, Long regId, String status, String reviewNotes) {
        Map<String, Object> gov = getOnboardingGovernance();
        if (!isApprover(approver, gov)) {
            throw new ApiException(HttpStatus.FORBIDDEN, "Approval Access Denied.");
        }
        ProviderRegistration reg = providerRepo.findById(regId)
                .orElseThrow(() -> new ApiException(HttpStatus.NOT_FOUND, "Provider registration not found."));
        String norm = status.toUpperCase(Locale.ROOT);
        if (!Set.of("VERIFIED", "REJECTED", "REVOKED").contains(norm)) {
            throw new ApiException(HttpStatus.BAD_REQUEST, "Status must be VERIFIED, REJECTED, or REVOKED.");
        }
        if ("PENDING_PEER_AUTH".equalsIgnoreCase(reg.getStatus()) && !approver.isAdmin()) {
            throw new ApiException(HttpStatus.BAD_REQUEST, "Peer QR authentication has not completed yet.");
        }

        reg.setStatus(norm);
        reg.setReviewNotes(reviewNotes);
        reg.setReviewedByUid(approver.uid());
        if ("VERIFIED".equals(norm)) {
            reg.setApprovedByUid(approver.uid());
            reg.setApprovedByRole(approver.isAdmin() ? "ADMIN" : "PROVIDER_APPROVER");
        } else if ("REVOKED".equals(norm)) {
            reg.setApprovedByUid(null);
            reg.setApprovedByRole(null);
        }
        ProviderRegistration saved = providerRepo.save(reg);

        for (ProviderDocument doc : providerDocRepo.findByRegistrationIdOrderByIdAsc(regId)) {
            doc.setStatus(norm);
            providerDocRepo.save(doc);
        }

        boolean isLogistics = categoryRepo.findById(reg.getServiceCategoryId())
                .map(c -> "DELIVERY".equalsIgnoreCase(c.getCategoryType())
                        || "TRANSPORT".equalsIgnoreCase(c.getDefaultListingType())
                        || c.getSlug().contains("delivery")
                        || c.getSlug().contains("transport"))
                .orElse(false);

        userRepo.findByUid(reg.getUserUid()).ifPresent(u -> {
            u.setProviderVerificationStatus(norm);
            Set<String> roles = new LinkedHashSet<>(u.getRoles() != null ? u.getRoles() : List.of("CUSTOMER"));
            roles.add("CUSTOMER");
            if ("VERIFIED".equals(norm)) {
                roles.add("PROVIDER");
                roles.add("BUSINESS_OWNER");
                if (isLogistics) roles.add("DELIVERY_PARTNER");
            } else {
                roles.remove("PROVIDER");
                roles.remove("BUSINESS_OWNER");
                roles.remove("DELIVERY_PARTNER");
                if ("REVOKED".equals(norm)) {
                    roles.remove("PEER_VOUCHER");
                    roles.remove("PROVIDER_APPROVER");
                }
            }
            u.setRoles(new ArrayList<>(roles));
            userRepo.save(u);
        });

        for (Business b : businessRepo.findByOwnerUidOrderByIdAsc(reg.getUserUid())) {
            b.setFaydaVerified("VERIFIED".equals(norm));
            b.setLivenessVerified("VERIFIED".equals(norm) && reg.isLivenessPassed());
            if ("REVOKED".equals(norm) && !"INDIVIDUAL_JOB_SEEKER".equalsIgnoreCase(b.getProfileType())) {
                b.setVerificationStatus("REVOKED");
            }
            businessRepo.save(b);
        }

        AuditLog log = new AuditLog();
        log.setActorUid(approver.uid());
        log.setActorEmail(approver.email());
        log.setAction("PROVIDER_KYC_" + norm);
        log.setEntityType("provider_registration");
        log.setEntityId(String.valueOf(regId));
        log.setDetails(Map.of(
                "fullName", saved.getFullName(),
                "status", norm,
                "approvedByRole", saved.getApprovedByRole() != null ? saved.getApprovedByRole() : "NONE"
        ));
        auditLogRepo.save(log);
        return saved;
    }

    @Transactional
    public Map<String, Object> updateLiveLocation(String uid, UpdateLiveLocationRequest req) {
        double lat = req.latitude().doubleValue();
        double lng = req.longitude().doubleValue();
        if (!geoDistanceService.isValidCoordinates(lat, lng)) {
            throw new ApiException(HttpStatus.BAD_REQUEST, "Invalid GPS coordinates.");
        }
        boolean liveActive = req.isLiveLocationActive() == null || req.isLiveLocationActive();
        Instant now = Instant.now();

        ProviderRegistration reg = providerRepo.findFirstByUserUidOrderByUpdatedAtDesc(uid).orElse(null);
        if (reg != null) {
            reg.setLatitude(req.latitude());
            reg.setLongitude(req.longitude());
            reg.setLiveLocationActive(liveActive);
            reg.setLastLocationUpdatedAt(now);
            providerRepo.save(reg);
        }

        List<Business> owned = businessRepo.findByOwnerUidOrderByIdAsc(uid);
        for (Business b : owned) {
            b.setLatitude(req.latitude());
            b.setLongitude(req.longitude());
            b.setLiveLocationActive(liveActive);
            b.setLastLocationPingAt(now);
            businessRepo.save(b);
        }

        return Map.of(
                "updated", true,
                "latitude", req.latitude(),
                "longitude", req.longitude(),
                "lastLocationUpdatedAt", now
        );
    }
}
