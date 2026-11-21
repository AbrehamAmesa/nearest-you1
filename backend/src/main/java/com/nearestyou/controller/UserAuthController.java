package com.nearestyou.controller;

import com.nearestyou.dto.NearestYouDtos.ChangePasswordRequest;
import com.nearestyou.dto.NearestYouDtos.LoginRequest;
import com.nearestyou.dto.NearestYouDtos.PayoutAccountRequest;
import com.nearestyou.dto.NearestYouDtos.RegisterRequest;
import com.nearestyou.dto.NearestYouDtos.SyncPasswordRequest;
import com.nearestyou.dto.NearestYouDtos.UpdateProfileRequest;
import com.nearestyou.entity.UserAccount;
import com.nearestyou.security.LocalAuthTokenService;
import com.nearestyou.security.UserPrincipal;
import com.nearestyou.service.EngagementService;
import com.nearestyou.service.PaymentGatewayService;
import com.nearestyou.service.UserSyncService;
import jakarta.validation.Valid;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.*;

import java.time.Instant;
import java.util.Map;

@RestController
@RequestMapping("/api/v1")
public class UserAuthController {

    private final UserSyncService userSyncService;
    private final EngagementService engagementService;
    private final LocalAuthTokenService localAuthTokenService;
    private final PaymentGatewayService paymentGatewayService;

    public UserAuthController(
            UserSyncService userSyncService,
            EngagementService engagementService,
            LocalAuthTokenService localAuthTokenService,
            PaymentGatewayService paymentGatewayService
    ) {
        this.userSyncService = userSyncService;
        this.engagementService = engagementService;
        this.localAuthTokenService = localAuthTokenService;
        this.paymentGatewayService = paymentGatewayService;
    }

    @PostMapping("/auth/register")
    public Map<String, Object> register(@Valid @RequestBody RegisterRequest req) {
        UserAccount created = userSyncService.registerWithPassword(req);
        String token = localAuthTokenService.issueToken(created);
        return Map.of("token", token, "user", created);
    }

    @PostMapping("/auth/login")
    public Map<String, Object> login(@Valid @RequestBody LoginRequest req) {
        UserAccount authenticated = userSyncService.authenticateWithPassword(req);
        String token = localAuthTokenService.issueToken(authenticated);
        return Map.of("token", token, "user", authenticated);
    }

    @PostMapping("/auth/sync-credentials")
    public Map<String, Object> syncCredentials(
            @AuthenticationPrincipal UserPrincipal principal,
            @Valid @RequestBody SyncPasswordRequest req
    ) {
        UserAccount updated = userSyncService.syncPasswordForAuthenticatedUser(principal.uid(), req.password());
        return Map.of("user", updated, "synced", true);
    }

    @PostMapping("/auth/change-password")
    public Map<String, Object> changePassword(
            @AuthenticationPrincipal UserPrincipal principal,
            @Valid @RequestBody ChangePasswordRequest req
    ) {
        UserAccount updated = userSyncService.changePasswordForAuthenticatedUser(principal.uid(), req);
        return Map.of("user", updated, "updated", true);
    }

    @GetMapping("/auth/me")
    public Map<String, Object> getAuthenticatedUser(@AuthenticationPrincipal UserPrincipal principal) {
        return Map.of("user", principal.account());
    }

    @PutMapping("/users/profile")
    public Map<String, Object> updateProfile(
            @AuthenticationPrincipal UserPrincipal principal,
            @RequestBody UpdateProfileRequest req
    ) {
        UserAccount updated = userSyncService.updateProfileWhitelist(principal.uid(), req);
        return Map.of("user", updated);
    }

    @PostMapping("/users/heartbeat")
    public Map<String, Object> heartbeat(@AuthenticationPrincipal UserPrincipal principal) {
        userSyncService.touchUserPresence(principal.uid(), true);
        Instant now = Instant.now();
        return Map.of(
                "uid", principal.uid(),
                "lastSeenAt", now,
                "isActiveLastMinute", true
        );
    }

    @GetMapping("/me/workspace")
    public Map<String, Object> getWorkspace(@AuthenticationPrincipal UserPrincipal principal) {
        return engagementService.getUserWorkspace(principal.uid());
    }

    @PutMapping("/me/payout-account")
    public Map<String, Object> updatePersonalPayoutAccount(
            @AuthenticationPrincipal UserPrincipal principal,
            @RequestBody PayoutAccountRequest req
    ) {
        UserAccount updated = paymentGatewayService.updatePersonalPayoutAccount(principal, req);
        return Map.of("user", updated);
    }
}
