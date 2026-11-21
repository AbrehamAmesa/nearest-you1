package com.nearestyou.controller;

import com.nearestyou.dto.NearestYouDtos.CreateBusinessRequest;
import com.nearestyou.dto.NearestYouDtos.CreateListingRequest;
import com.nearestyou.dto.NearestYouDtos.JobSeekerAdvertiseRequest;
import com.nearestyou.dto.NearestYouDtos.PayoutAccountRequest;
import com.nearestyou.dto.NearestYouDtos.UpdateAvailabilityRequest;
import com.nearestyou.dto.NearestYouDtos.UpdateListingRequest;
import com.nearestyou.entity.Business;
import com.nearestyou.entity.ServiceListing;
import com.nearestyou.security.UserPrincipal;
import com.nearestyou.service.BusinessAndListingService;
import com.nearestyou.service.PaymentGatewayService;
import jakarta.validation.Valid;
import org.springframework.http.HttpStatus;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.*;

import java.util.Map;

@RestController
@RequestMapping("/api/v1")
public class BusinessPortalController {

    private final BusinessAndListingService businessAndListingService;
    private final PaymentGatewayService paymentGatewayService;

    public BusinessPortalController(
            BusinessAndListingService businessAndListingService,
            PaymentGatewayService paymentGatewayService
    ) {
        this.businessAndListingService = businessAndListingService;
        this.paymentGatewayService = paymentGatewayService;
    }

    @GetMapping("/business/portal")
    public Map<String, Object> getPortal(@AuthenticationPrincipal UserPrincipal principal) {
        return businessAndListingService.getBusinessPortalData(principal);
    }

    @PostMapping("/businesses")
    @ResponseStatus(HttpStatus.CREATED)
    public Business createBusiness(
            @AuthenticationPrincipal UserPrincipal principal,
            @Valid @RequestBody CreateBusinessRequest req
    ) {
        return businessAndListingService.createBusiness(principal, req);
    }

    @PutMapping("/businesses/{id}/payout-account")
    public Business updateBusinessPayoutAccount(
            @AuthenticationPrincipal UserPrincipal principal,
            @PathVariable Long id,
            @RequestBody PayoutAccountRequest req
    ) {
        return paymentGatewayService.updateBusinessPayoutAccount(principal, id, req);
    }

    @PostMapping("/listings")
    @ResponseStatus(HttpStatus.CREATED)
    public ServiceListing createListing(
            @AuthenticationPrincipal UserPrincipal principal,
            @Valid @RequestBody CreateListingRequest req
    ) {
        return businessAndListingService.createListing(principal, req);
    }

    @PutMapping("/listings/{id}")
    public ServiceListing updateListing(
            @AuthenticationPrincipal UserPrincipal principal,
            @PathVariable Long id,
            @Valid @RequestBody UpdateListingRequest req
    ) {
        return businessAndListingService.updateListing(principal, id, req);
    }

    @PatchMapping("/listings/{id}/availability")
    public ServiceListing updateListingAvailability(
            @AuthenticationPrincipal UserPrincipal principal,
            @PathVariable Long id,
            @Valid @RequestBody UpdateAvailabilityRequest req
    ) {
        return businessAndListingService.updateAvailability(principal, id, req.availabilityStatus());
    }

    @GetMapping("/job-seekers/mine")
    public Map<String, Object> getMyJobSeekerAds(@AuthenticationPrincipal UserPrincipal principal) {
        return businessAndListingService.getMyJobSeekerAds(principal);
    }

    @PostMapping("/job-seekers/advertise")
    @ResponseStatus(HttpStatus.CREATED)
    public Map<String, Object> advertiseAsJobSeeker(
            @AuthenticationPrincipal UserPrincipal principal,
            @Valid @RequestBody JobSeekerAdvertiseRequest req
    ) {
        return businessAndListingService.publishJobSeekerAd(principal, req);
    }

    @DeleteMapping("/job-seekers/{id}")
    public Map<String, Object> archiveJobSeekerAd(
            @AuthenticationPrincipal UserPrincipal principal,
            @PathVariable Long id
    ) {
        return businessAndListingService.deleteJobSeekerAd(principal, id);
    }
}
