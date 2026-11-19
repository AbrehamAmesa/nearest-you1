package com.nearestyou.controller;

import com.nearestyou.dto.NearestYouDtos.ApproveProviderRequest;
import com.nearestyou.dto.NearestYouDtos.ProviderRegistrationRequest;
import com.nearestyou.dto.NearestYouDtos.UpdateLiveLocationRequest;
import com.nearestyou.dto.NearestYouDtos.VouchScanRequest;
import com.nearestyou.entity.ProviderRegistration;
import com.nearestyou.security.UserPrincipal;
import com.nearestyou.service.ProviderKycService;
import jakarta.validation.Valid;
import org.springframework.http.HttpStatus;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.*;

import java.util.Map;

@RestController
@RequestMapping("/api/v1")
public class ProviderController {

    private final ProviderKycService providerKycService;

    public ProviderController(ProviderKycService providerKycService) {
        this.providerKycService = providerKycService;
    }

    @GetMapping("/provider/me")
    public Map<String, Object> getMyProviderStatus(@AuthenticationPrincipal UserPrincipal principal) {
        return providerKycService.getProviderForUser(principal.uid());
    }

    @PostMapping("/provider/register")
    @ResponseStatus(HttpStatus.CREATED)
    public Map<String, Object> registerProvider(
            @AuthenticationPrincipal UserPrincipal principal,
            @Valid @RequestBody ProviderRegistrationRequest req
    ) {
        return providerKycService.submitRegistration(principal.uid(), principal.email(), req);
    }

    @PostMapping("/provider/regenerate-qr")
    public Map<String, Object> regenerateQr(@AuthenticationPrincipal UserPrincipal principal) {
        return providerKycService.regenerateQr(principal.uid());
    }

    @PostMapping("/provider/vouch-scan")
    public Map<String, Object> vouchScan(
            @AuthenticationPrincipal UserPrincipal principal,
            @Valid @RequestBody VouchScanRequest req
    ) {
        return providerKycService.vouchViaQr(principal, req.token());
    }

    @GetMapping("/provider/approvals")
    public Map<String, Object> getApprovalsQueue(@AuthenticationPrincipal UserPrincipal principal) {
        return Map.of("registrations", providerKycService.getApprovalsQueue(principal));
    }

    @PostMapping("/providers/{id}/approve")
    public ProviderRegistration approveProvider(
            @AuthenticationPrincipal UserPrincipal principal,
            @PathVariable Long id,
            @Valid @RequestBody ApproveProviderRequest req
    ) {
        return providerKycService.approveOrRejectProvider(principal, id, req.status(), req.reviewNotes());
    }

    @PostMapping("/provider/location")
    public Map<String, Object> updateRealtimeLocation(
            @AuthenticationPrincipal UserPrincipal principal,
            @Valid @RequestBody UpdateLiveLocationRequest req
    ) {
        return providerKycService.updateLiveLocation(principal.uid(), req);
    }
}
