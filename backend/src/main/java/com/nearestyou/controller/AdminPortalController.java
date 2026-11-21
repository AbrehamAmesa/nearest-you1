package com.nearestyou.controller;

import com.nearestyou.dto.NearestYouDtos.*;
import com.nearestyou.entity.*;
import com.nearestyou.security.UserPrincipal;
import com.nearestyou.service.AdminGovernanceService;
import com.nearestyou.service.PaymentGatewayService;
import jakarta.validation.Valid;
import org.springframework.http.HttpStatus;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.*;

import java.util.Map;

@RestController
@RequestMapping("/api/v1/admin")
@PreAuthorize("hasAnyRole('ADMIN', 'SUPER_ADMIN')")
public class AdminPortalController {

    private final AdminGovernanceService adminGovernanceService;
    private final PaymentGatewayService paymentGatewayService;

    public AdminPortalController(
            AdminGovernanceService adminGovernanceService,
            PaymentGatewayService paymentGatewayService
    ) {
        this.adminGovernanceService = adminGovernanceService;
        this.paymentGatewayService = paymentGatewayService;
    }

    @GetMapping("/portal")
    public Map<String, Object> getAdminPortal() {
        return adminGovernanceService.getAdminPortalData();
    }

    @GetMapping("/tax-report")
    public Map<String, Object> getGovernmentTaxReport(
            @RequestParam(required = false) String fromDate,
            @RequestParam(required = false) String toDate,
            @RequestParam(required = false) String paymentMethod,
            @RequestParam(required = false) Long businessId
    ) {
        return adminGovernanceService.getGovernmentTaxReport(fromDate, toDate, paymentMethod, businessId);
    }

    @PostMapping({"/deliveries/{id}/resolve-dispute", "/deliveries/{id}/resolve-conflict"})
    public DeliveryRequest resolveDispute(
            @AuthenticationPrincipal UserPrincipal principal,
            @PathVariable Long id,
            @Valid @RequestBody ResolveDisputeRequest req
    ) {
        return adminGovernanceService.resolveDeliveryDispute(principal, id, req.resolution(), req.note());
    }

    @GetMapping("/document-types")
    public java.util.List<DocumentType> getDocumentTypes() {
        return adminGovernanceService.getDocumentTypes();
    }

    @PostMapping("/document-types")
    @ResponseStatus(HttpStatus.CREATED)
    public DocumentType createDocumentType(
            @AuthenticationPrincipal UserPrincipal principal,
            @Valid @RequestBody CreateDocumentTypeRequest req
    ) {
        return adminGovernanceService.createDocumentType(principal, req);
    }

    @PutMapping("/document-types/{id}")
    public DocumentType updateDocumentType(
            @AuthenticationPrincipal UserPrincipal principal,
            @PathVariable Long id,
            @Valid @RequestBody UpdateDocumentTypeRequest req
    ) {
        return adminGovernanceService.updateDocumentType(principal, id, req);
    }

    @DeleteMapping("/document-types/{id}")
    public Map<String, Object> deleteDocumentType(
            @AuthenticationPrincipal UserPrincipal principal,
            @PathVariable Long id
    ) {
        adminGovernanceService.deleteDocumentType(principal, id);
        return Map.of("deleted", true);
    }

    @PostMapping("/requirements")
    @ResponseStatus(HttpStatus.CREATED)
    public CategoryDocumentRequirement createRequirement(
            @AuthenticationPrincipal UserPrincipal principal,
            @Valid @RequestBody CreateRequirementRequest req
    ) {
        return adminGovernanceService.createDocumentRequirement(principal, req);
    }

    @DeleteMapping("/requirements/{id}")
    public Map<String, Object> deleteRequirement(
            @AuthenticationPrincipal UserPrincipal principal,
            @PathVariable Long id
    ) {
        adminGovernanceService.deleteDocumentRequirement(principal, id);
        return Map.of("deleted", true);
    }

    @PostMapping("/providers/{id}/verify")
    public ProviderRegistration verifyProvider(
            @AuthenticationPrincipal UserPrincipal principal,
            @PathVariable Long id,
            @Valid @RequestBody VerifyProviderRequest req
    ) {
        return adminGovernanceService.verifyProvider(principal, id, req);
    }

    @PostMapping("/businesses/{id}/verify")
    public Business verifyBusiness(
            @AuthenticationPrincipal UserPrincipal principal,
            @PathVariable Long id,
            @Valid @RequestBody VerifyBusinessRequest req
    ) {
        return adminGovernanceService.verifyBusiness(principal, id, req.verificationStatus());
    }

    @PostMapping("/categories")
    @ResponseStatus(HttpStatus.CREATED)
    public ServiceCategory createCategory(
            @AuthenticationPrincipal UserPrincipal principal,
            @Valid @RequestBody CreateCategoryRequest req
    ) {
        return adminGovernanceService.createCategory(principal, req);
    }

    @PutMapping("/categories/{id}")
    public ServiceCategory updateCategory(
            @AuthenticationPrincipal UserPrincipal principal,
            @PathVariable Long id,
            @Valid @RequestBody UpdateCategoryRequest req
    ) {
        return adminGovernanceService.updateCategory(principal, id, req);
    }

    @PatchMapping("/categories/{id}/status")
    public ServiceCategory updateCategoryStatus(
            @AuthenticationPrincipal UserPrincipal principal,
            @PathVariable Long id,
            @Valid @RequestBody UpdateCategoryStatusRequest req
    ) {
        return adminGovernanceService.updateCategoryStatus(principal, id, req.status());
    }

    @DeleteMapping("/categories/{id}")
    public Map<String, Object> deleteCategory(
            @AuthenticationPrincipal UserPrincipal principal,
            @PathVariable Long id
    ) {
        adminGovernanceService.deleteCategory(principal, id);
        return Map.of("deleted", true);
    }

    @PutMapping("/pricing-policy")
    public PlatformSetting updatePricingPolicy(
            @AuthenticationPrincipal UserPrincipal principal,
            @RequestBody Map<String, Object> policy
    ) {
        return adminGovernanceService.updatePricingPolicy(principal, policy);
    }

    @PutMapping("/onboarding-governance")
    public PlatformSetting updateOnboardingGovernance(
            @AuthenticationPrincipal UserPrincipal principal,
            @RequestBody Map<String, Object> gov
    ) {
        return adminGovernanceService.updateOnboardingGovernance(principal, gov);
    }

    @PutMapping("/commission-account")
    public PlatformSetting updatePlatformCommissionAccount(
            @AuthenticationPrincipal UserPrincipal principal,
            @Valid @RequestBody PlatformCommissionAccountRequest req
    ) {
        return paymentGatewayService.updatePlatformCommissionAccount(principal, req);
    }

    @PostMapping("/users/{id}/status")
    public UserAccount updateUserStatus(
            @AuthenticationPrincipal UserPrincipal principal,
            @PathVariable Long id,
            @Valid @RequestBody UpdateUserStatusRequest req
    ) {
        return adminGovernanceService.updateUserStatus(principal, id, req.accountStatus());
    }

    @PostMapping("/users/{id}/admin-role")
    public UserAccount updateAdminRole(
            @AuthenticationPrincipal UserPrincipal principal,
            @PathVariable Long id,
            @Valid @RequestBody UpdateAdminRoleRequest req
    ) {
        return adminGovernanceService.updateAdminRole(principal, id, req.isAdmin());
    }

    @PostMapping("/users/{id}/vouch-early")
    public UserAccount updateVouchEarly(
            @AuthenticationPrincipal UserPrincipal principal,
            @PathVariable Long id,
            @Valid @RequestBody VouchEarlyRequest req
    ) {
        return adminGovernanceService.updateVouchEarly(principal, id, req.canVouchEarly());
    }

    @PostMapping("/users/{id}/roles")
    public UserAccount updateUserRoles(
            @AuthenticationPrincipal UserPrincipal principal,
            @PathVariable Long id,
            @Valid @RequestBody UpdateUserRolesRequest req
    ) {
        return adminGovernanceService.updateUserRoles(principal, id, req.roles());
    }
}
