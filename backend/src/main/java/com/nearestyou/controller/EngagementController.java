package com.nearestyou.controller;

import com.nearestyou.dto.NearestYouDtos.*;
import com.nearestyou.entity.JobApplication;
import com.nearestyou.entity.Message;
import com.nearestyou.entity.Review;
import com.nearestyou.security.UserPrincipal;
import com.nearestyou.service.EngagementService;
import jakarta.validation.Valid;
import org.springframework.http.HttpStatus;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.*;

import java.util.Map;

@RestController
@RequestMapping("/api/v1")
public class EngagementController {

    private final EngagementService engagementService;

    public EngagementController(EngagementService engagementService) {
        this.engagementService = engagementService;
    }

    @PostMapping("/favorites/toggle")
    public Map<String, Object> toggleFavorite(
            @AuthenticationPrincipal UserPrincipal principal,
            @Valid @RequestBody ToggleFavoriteRequest req
    ) {
        return engagementService.toggleFavorite(principal.uid(), req.listingId());
    }

    @PostMapping("/messages")
    @ResponseStatus(HttpStatus.CREATED)
    public Message sendMessage(
            @AuthenticationPrincipal UserPrincipal principal,
            @Valid @RequestBody SendMessageRequest req
    ) {
        return engagementService.sendMessage(principal, req);
    }

    @PostMapping("/jobs/{id}/applications")
    @ResponseStatus(HttpStatus.CREATED)
    public JobApplication submitApplication(
            @AuthenticationPrincipal UserPrincipal principal,
            @PathVariable Long id,
            @Valid @RequestBody CreateJobApplicationRequest req
    ) {
        return engagementService.submitJobApplication(principal, id, req);
    }

    @PostMapping("/applications/{id}/status")
    public JobApplication updateApplicationStatus(
            @AuthenticationPrincipal UserPrincipal principal,
            @PathVariable Long id,
            @Valid @RequestBody UpdateApplicationStatusRequest req
    ) {
        return engagementService.updateApplicationStatus(principal, id, req.applicationStatus());
    }

    @PostMapping("/reviews")
    @ResponseStatus(HttpStatus.CREATED)
    public Review submitReview(
            @AuthenticationPrincipal UserPrincipal principal,
            @Valid @RequestBody CreateReviewRequest req
    ) {
        return engagementService.submitVerifiedReview(principal, req);
    }
}
