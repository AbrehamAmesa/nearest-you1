package com.nearestyou.controller;

import com.nearestyou.dto.NearestYouDtos.ImageSearchRequest;
import com.nearestyou.entity.KnownLocation;
import com.nearestyou.entity.UserAccount;
import com.nearestyou.security.UserPrincipal;
import com.nearestyou.service.CatalogService;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.validation.Valid;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.*;

import java.math.BigDecimal;
import java.util.List;
import java.util.Map;

@RestController
@RequestMapping("/api/v1/catalog")
public class PublicCatalogController {

    private final CatalogService catalogService;

    public PublicCatalogController(CatalogService catalogService) {
        this.catalogService = catalogService;
    }

    @GetMapping("/health")
    public Map<String, Object> health() {
        return Map.of("status", "UP", "service", "nearest-you-platform");
    }

    @GetMapping
    public Map<String, Object> getPublicCatalog(
            HttpServletRequest request,
            @AuthenticationPrincipal UserPrincipal principal,
            @RequestParam(required = false) Double lat,
            @RequestParam(required = false) Double lng
    ) {
        UserAccount user = principal != null ? principal.account() : null;
        return catalogService.getPublicCatalog(request, user, lat, lng);
    }

    @GetMapping("/locations")
    public List<KnownLocation> getKnownLocations(
            @RequestParam(required = false) String q,
            @RequestParam(required = false) String city
    ) {
        return catalogService.getKnownLocations(q, city);
    }

    @GetMapping("/location")
    public Map<String, Object> resolveLocation(
            HttpServletRequest request,
            @AuthenticationPrincipal UserPrincipal principal,
            @RequestParam(required = false) Double lat,
            @RequestParam(required = false) Double lng
    ) {
        UserAccount user = principal != null ? principal.account() : null;
        return catalogService.resolveUserLocation(request, user, lat, lng);
    }

    @GetMapping("/recommendations")
    public Map<String, Object> getRecommendations(
            HttpServletRequest request,
            @AuthenticationPrincipal UserPrincipal principal,
            @RequestParam(required = false) Double lat,
            @RequestParam(required = false) Double lng,
            @RequestParam(required = false, defaultValue = "6") Integer limit
    ) {
        UserAccount user = principal != null ? principal.account() : null;
        return catalogService.getRecommendations(request, user, lat, lng, limit);
    }

    @GetMapping("/search")
    public Map<String, Object> searchListings(
            HttpServletRequest request,
            @AuthenticationPrincipal UserPrincipal principal,
            @RequestParam(required = false) String q,
            @RequestParam(required = false) Long categoryId,
            @RequestParam(required = false) String listingType,
            @RequestParam(required = false) String subCity,
            @RequestParam(required = false) Double lat,
            @RequestParam(required = false) Double lng,
            @RequestParam(required = false) Double radiusKm,
            @RequestParam(required = false) BigDecimal minPrice,
            @RequestParam(required = false) BigDecimal maxPrice,
            @RequestParam(required = false) Double minRating,
            @RequestParam(required = false) Boolean verifiedOnly,
            @RequestParam(required = false) Boolean availableOnly,
            @RequestParam(required = false, defaultValue = "NEAREST") String sortBy
    ) {
        UserAccount user = principal != null ? principal.account() : null;
        return catalogService.searchListings(
                request, user,
                q, categoryId, listingType, subCity,
                lat, lng, radiusKm, minPrice, maxPrice,
                minRating, verifiedOnly, availableOnly, sortBy
        );
    }

    @PostMapping("/image-search")
    public Map<String, Object> searchByImage(
            HttpServletRequest request,
            @AuthenticationPrincipal UserPrincipal principal,
            @Valid @RequestBody ImageSearchRequest req
    ) {
        UserAccount user = principal != null ? principal.account() : null;
        return catalogService.searchByImage(
                request,
                user,
                req.imageBase64(),
                req.mimeType(),
                req.lat(),
                req.lng(),
                req.radiusKm()
        );
    }
}
