package com.nearestyou.service;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.nearestyou.entity.*;
import com.nearestyou.exception.ApiException;
import com.nearestyou.repository.*;
import jakarta.servlet.http.HttpServletRequest;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.math.BigDecimal;
import java.net.InetAddress;
import java.net.URI;
import java.net.URLEncoder;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.nio.charset.StandardCharsets;
import java.time.Duration;
import java.time.Instant;
import java.util.*;
import java.util.concurrent.ConcurrentHashMap;

@Service
public class CatalogService {

    private static final double DEFAULT_CENTER_LAT = 9.005401;
    private static final double DEFAULT_CENTER_LNG = 38.763611;
    private static final double LEGACY_PLACEHOLDER_LAT = 8.997400;
    private static final double LEGACY_PLACEHOLDER_LNG = 38.786800;
    private static final long CACHE_TTL_MS = 30L * 60L * 1000L;

    private record CachedAreaLabel(String label, String subCity, String city, long expiresAtMs) {}
    private record CachedIpGeo(double lat, double lng, String city, String region, long expiresAtMs) {}

    private final ServiceCategoryRepository categoryRepo;
    private final DocumentTypeRepository documentTypeRepo;
    private final CategoryDocumentRequirementRepository requirementRepo;
    private final BusinessRepository businessRepo;
    private final ServiceListingRepository listingRepo;
    private final ReviewRepository reviewRepo;
    private final PlatformSettingRepository settingRepo;
    private final ProviderRegistrationRepository providerRepo;
    private final UserAccountRepository userRepo;
    private final GeoDistanceService geoDistanceService;

    private final ObjectMapper objectMapper = new ObjectMapper();
    private final HttpClient httpClient = HttpClient.newBuilder()
            .connectTimeout(Duration.ofMillis(2000))
            .followRedirects(HttpClient.Redirect.NORMAL)
            .build();
    private final Map<String, CachedAreaLabel> reverseGeoCache = new ConcurrentHashMap<>();
    private final Map<String, CachedIpGeo> ipGeoCache = new ConcurrentHashMap<>();

    @Value("${nearestyou.gemini.api-key:}")
    private String configuredGeminiApiKey;

    public CatalogService(
            ServiceCategoryRepository categoryRepo,
            DocumentTypeRepository documentTypeRepo,
            CategoryDocumentRequirementRepository requirementRepo,
            BusinessRepository businessRepo,
            ServiceListingRepository listingRepo,
            ReviewRepository reviewRepo,
            PlatformSettingRepository settingRepo,
            ProviderRegistrationRepository providerRepo,
            UserAccountRepository userRepo,
            GeoDistanceService geoDistanceService
    ) {
        this.categoryRepo = categoryRepo;
        this.documentTypeRepo = documentTypeRepo;
        this.requirementRepo = requirementRepo;
        this.businessRepo = businessRepo;
        this.listingRepo = listingRepo;
        this.reviewRepo = reviewRepo;
        this.settingRepo = settingRepo;
        this.providerRepo = providerRepo;
        this.userRepo = userRepo;
        this.geoDistanceService = geoDistanceService;
    }

    public Map<String, Object> resolveUserLocation(
            HttpServletRequest request,
            UserAccount authenticatedUser,
            Double lat,
            Double lng
    ) {
        // 1. Exact client GPS / coordinate hint
        if (lat != null && lng != null && geoDistanceService.isValidCoordinates(lat, lng)) {
            CachedAreaLabel area = reverseGeocodeArea(lat, lng);
            String label = area != null && !area.label().isBlank()
                    ? area.label()
                    : String.format(Locale.US, "%.4f, %.4f", lat, lng);
            return buildLocationPayload(
                    lat,
                    lng,
                    label,
                    area != null ? area.subCity() : "",
                    area != null && !area.city().isBlank() ? area.city() : "Addis Ababa",
                    "GPS",
                    "EXACT"
            );
        }

        // 2. Backend IP geolocation from request headers / remote IP (free ipwho.is)
        String clientIp = extractClientIp(request);
        if (clientIp != null && !isPrivateOrLoopbackIp(clientIp)) {
            CachedIpGeo ipGeo = lookupIpGeolocation(clientIp);
            if (ipGeo != null && geoDistanceService.isValidCoordinates(ipGeo.lat(), ipGeo.lng())) {
                CachedAreaLabel area = reverseGeocodeArea(ipGeo.lat(), ipGeo.lng());
                String city = (area != null && !area.city().isBlank()) ? area.city() : ipGeo.city();
                String subCity = area != null ? area.subCity() : "";
                String label = (area != null && !area.label().isBlank())
                        ? area.label()
                        : joinNonBlank(ipGeo.city(), ipGeo.region());
                if (label.isBlank()) {
                    label = "Detected Location";
                }
                return buildLocationPayload(
                        ipGeo.lat(),
                        ipGeo.lng(),
                        label,
                        subCity,
                        city != null && !city.isBlank() ? city : "Addis Ababa",
                        "IP_GEOLOCATION",
                        "APPROXIMATE"
                );
            }
        }

        // 3. Authenticated user's previously saved real coordinates (ignore legacy Bole placeholder)
        if (authenticatedUser != null
                && authenticatedUser.getDefaultLat() != null
                && authenticatedUser.getDefaultLng() != null) {
            double savedLat = authenticatedUser.getDefaultLat().doubleValue();
            double savedLng = authenticatedUser.getDefaultLng().doubleValue();
            boolean isLegacyPlaceholder =
                    Math.abs(savedLat - LEGACY_PLACEHOLDER_LAT) < 0.0001
                            && Math.abs(savedLng - LEGACY_PLACEHOLDER_LNG) < 0.0001;
            if (!isLegacyPlaceholder && geoDistanceService.isValidCoordinates(savedLat, savedLng)) {
                CachedAreaLabel area = reverseGeocodeArea(savedLat, savedLng);
                String subCity = area != null && !area.subCity().isBlank()
                        ? area.subCity()
                        : safeStr(authenticatedUser.getDefaultSubCity());
                String city = area != null && !area.city().isBlank() ? area.city() : "Addis Ababa";
                String label = area != null && !area.label().isBlank()
                        ? area.label()
                        : joinNonBlank(subCity, city);
                return buildLocationPayload(
                        savedLat,
                        savedLng,
                        label.isBlank() ? "Saved Location" : label,
                        subCity,
                        city,
                        "SAVED_PROFILE",
                        "SAVED"
                );
            }
        }

        // 4. Neutral city-center fallback (never forces Bole)
        return buildLocationPayload(
                DEFAULT_CENTER_LAT,
                DEFAULT_CENTER_LNG,
                "Addis Ababa",
                "",
                "Addis Ababa",
                "CITY_CENTER",
                "APPROXIMATE"
        );
    }

    @Transactional(readOnly = true)
    public Map<String, Object> getPublicCatalog(
            HttpServletRequest request,
            UserAccount authenticatedUser,
            Double lat,
            Double lng
    ) {
        Map<String, Object> detectedLocation = resolveUserLocation(request, authenticatedUser, lat, lng);
        double refLat = ((Number) detectedLocation.get("lat")).doubleValue();
        double refLng = ((Number) detectedLocation.get("lng")).doubleValue();

        List<ServiceCategory> allCategories = categoryRepo.findAllByOrderByDisplayOrderAscIdAsc();
        List<DocumentType> allDocTypes = documentTypeRepo.findAllByOrderByDocumentNameAscIdAsc();
        List<CategoryDocumentRequirement> docReqs = requirementRepo.findAllByOrderByCategoryIdAscIdAsc();
        List<Business> allBusinesses = businessRepo.findAllByOrderByIdAsc().stream()
                .filter(b -> "APPROVED".equalsIgnoreCase(b.getVerificationStatus()))
                .toList();
        enrichBusinessesWithOwnerProfiles(allBusinesses);
        List<ServiceListing> activeListings = listingRepo.findByStatusOrderByCreatedAtDesc("ACTIVE");
        List<Review> recentReviews = reviewRepo.findAllByOrderByCreatedAtDesc();
        List<PlatformSetting> settings = settingRepo.findAll();

        List<Map<String, Object>> recommendations = computeRecommendations(
                allCategories, allBusinesses, activeListings, refLat, refLng, 6
        );

        List<Map<String, Object>> liveProviders = providerRepo
                .findByStatusOrderByLastLocationUpdatedAtDesc("VERIFIED")
                .stream()
                .map(p -> {
                    Map<String, Object> marker = new LinkedHashMap<>();
                    marker.put("id", p.getId());
                    marker.put("fullName", p.getFullName());
                    marker.put("serviceCategoryId", p.getServiceCategoryId());
                    marker.put("subCity", p.getSubCity());
                    marker.put("landmark", p.getLandmark());
                    marker.put("latitude", p.getLatitude());
                    marker.put("longitude", p.getLongitude());
                    marker.put("isLiveLocationActive", p.isLiveLocationActive());
                    marker.put("lastLocationUpdatedAt", p.getLastLocationUpdatedAt());
                    marker.put("livenessPassed", p.isLivenessPassed());
                    marker.put("status", p.getStatus());
                    return marker;
                })
                .toList();

        double deliveryMatchRadiusKm = 5.0;
        for (PlatformSetting s : settings) {
            if ("pricing_policy".equals(s.getSettingKey()) && s.getSettingValue() != null) {
                Object val = s.getSettingValue().get("deliveryMatchRadiusKm");
                if (val instanceof Number n && n.doubleValue() > 0) {
                    deliveryMatchRadiusKm = n.doubleValue();
                }
            }
        }

        Map<String, Object> result = new LinkedHashMap<>();
        result.put("detectedLocation", detectedLocation);
        result.put("recommendations", recommendations);
        result.put("categories", allCategories);
        result.put("documentTypes", allDocTypes);
        result.put("documentRequirements", docReqs);
        result.put("businesses", allBusinesses);
        result.put("listings", activeListings);
        result.put("liveProviders", liveProviders);
        result.put("reviews", recentReviews);
        result.put("settings", settings);
        result.put("deliveryMatchRadiusKm", deliveryMatchRadiusKm);
        return result;
    }

    @Transactional(readOnly = true)
    public Map<String, Object> getRecommendations(
            HttpServletRequest request,
            UserAccount authenticatedUser,
            Double lat,
            Double lng,
            Integer limit
    ) {
        Map<String, Object> detectedLocation = resolveUserLocation(request, authenticatedUser, lat, lng);
        double refLat = ((Number) detectedLocation.get("lat")).doubleValue();
        double refLng = ((Number) detectedLocation.get("lng")).doubleValue();
        int maxResults = (limit != null && limit > 0) ? Math.min(limit, 24) : 6;

        List<ServiceCategory> allCategories = categoryRepo.findAllByOrderByDisplayOrderAscIdAsc();
        List<Business> approvedBusinesses = businessRepo.findAllByOrderByIdAsc().stream()
                .filter(b -> "APPROVED".equalsIgnoreCase(b.getVerificationStatus()))
                .toList();
        enrichBusinessesWithOwnerProfiles(approvedBusinesses);
        List<ServiceListing> activeListings = listingRepo.findByStatusOrderByCreatedAtDesc("ACTIVE");

        List<Map<String, Object>> recommendations = computeRecommendations(
                allCategories, approvedBusinesses, activeListings, refLat, refLng, maxResults
        );

        Map<String, Object> response = new LinkedHashMap<>();
        response.put("detectedLocation", detectedLocation);
        response.put("recommendations", recommendations);
        response.put("count", recommendations.size());
        return response;
    }

    @Transactional(readOnly = true)
    public Map<String, Object> searchListings(
            HttpServletRequest request,
            UserAccount authenticatedUser,
            String q,
            Long categoryId,
            String listingType,
            String subCity,
            Double lat,
            Double lng,
            Double radiusKm,
            BigDecimal minPrice,
            BigDecimal maxPrice,
            Double minRating,
            Boolean verifiedOnly,
            Boolean availableOnly,
            String sortBy
    ) {
        Map<String, Object> detectedLocation = resolveUserLocation(request, authenticatedUser, lat, lng);
        double refLat = ((Number) detectedLocation.get("lat")).doubleValue();
        double refLng = ((Number) detectedLocation.get("lng")).doubleValue();

        List<ServiceCategory> allCategories = categoryRepo.findAllByOrderByDisplayOrderAscIdAsc();
        Map<Long, ServiceCategory> catMap = new HashMap<>();
        for (ServiceCategory c : allCategories) {
            catMap.put(c.getId(), c);
        }

        List<Business> allBusinesses = businessRepo.findAllByOrderByIdAsc();
        enrichBusinessesWithOwnerProfiles(allBusinesses);
        Map<Long, Business> bizMap = new HashMap<>();
        for (Business b : allBusinesses) {
            bizMap.put(b.getId(), b);
        }

        String queryLower = q != null ? q.trim().toLowerCase(Locale.ROOT) : "";

        List<Map<String, Object>> results = new ArrayList<>();
        for (ServiceListing listing : listingRepo.findByStatusOrderByCreatedAtDesc("ACTIVE")) {
            Business biz = bizMap.get(listing.getBusinessId());
            if (biz == null) continue;
            if (!"APPROVED".equalsIgnoreCase(biz.getVerificationStatus())) continue;

            if (categoryId != null && !categoryId.equals(listing.getCategoryId())) continue;
            if (listingType != null && !listingType.isBlank() && !"ALL".equalsIgnoreCase(listingType)
                    && !listingType.equalsIgnoreCase(listing.getListingType())) continue;
            if (subCity != null && !subCity.isBlank() && !"ALL".equalsIgnoreCase(subCity)
                    && !subCity.equalsIgnoreCase(biz.getSubCity())) continue;

            BigDecimal effectivePrice = listing.getDiscountPrice() != null
                    ? listing.getDiscountPrice()
                    : listing.getBasePrice();
            if (minPrice != null && effectivePrice.compareTo(minPrice) < 0) continue;
            if (maxPrice != null && effectivePrice.compareTo(maxPrice) > 0) continue;
            if (minRating != null && listing.getRatingAvg().doubleValue() < minRating) continue;
            if (Boolean.TRUE.equals(verifiedOnly) && !biz.isFaydaVerified()) continue;
            if (Boolean.TRUE.equals(availableOnly) && !"AVAILABLE".equalsIgnoreCase(listing.getAvailabilityStatus())) continue;

            ServiceCategory cat = catMap.get(listing.getCategoryId());
            if (!queryLower.isEmpty()) {
                String haystack = String.join(" ",
                        safeStr(listing.getTitle()),
                        safeStr(listing.getDescription()),
                        safeStr(listing.getListingType()),
                        safeStr(listing.getPricingModel()),
                        safeStr(listing.getPricingUnit()),
                        extractSearchableMetadataText(listing.getMetadata()),
                        safeStr(biz.getOwnerFullName()),
                        safeStr(biz.getBusinessName()),
                        safeStr(biz.getDescription()),
                        safeStr(biz.getSubCity()),
                        safeStr(biz.getWoreda()),
                        safeStr(biz.getLandmark()),
                        safeStr(biz.getLicenseNumber()),
                        cat != null ? safeStr(cat.getName()) : "",
                        cat != null ? safeStr(cat.getNameAm()) : "",
                        cat != null ? safeStr(cat.getNameOm()) : ""
                ).toLowerCase(Locale.ROOT);
                if (!matchesQueryTokens(haystack, queryLower)) continue;
            }

            if (biz.getLatitude() == null || biz.getLongitude() == null) continue;
            double distanceKm = geoDistanceService.calculateDistanceKm(
                    refLat, refLng, biz.getLatitude().doubleValue(), biz.getLongitude().doubleValue());
            if (radiusKm != null && radiusKm > 0 && distanceKm > radiusKm) continue;

            Map<String, Object> entry = new LinkedHashMap<>();
            entry.put("listing", listing);
            entry.put("business", biz);
            entry.put("category", cat);
            entry.put("distanceKm", distanceKm);
            entry.put("effectivePrice", effectivePrice);
            results.add(entry);
        }

        // Always put nearest results first during active keyword searches or when sortBy is NEAREST/default
        String normalizedSort = (sortBy != null && !sortBy.isBlank())
                ? sortBy.toUpperCase(Locale.ROOT)
                : "NEAREST";
        boolean activeSearch = !queryLower.isEmpty();

        Comparator<Map<String, Object>> nearestComparator = Comparator
                .<Map<String, Object>>comparingDouble(m -> (Double) m.get("distanceKm"))
                .thenComparing(
                        m -> ((ServiceListing) m.get("listing")).getRatingAvg(),
                        Comparator.reverseOrder()
                );

        Comparator<Map<String, Object>> comparator = activeSearch
                ? nearestComparator
                : switch (normalizedSort) {
                    case "PRICE_ASC" -> Comparator.<Map<String, Object>, BigDecimal>comparing(m -> (BigDecimal) m.get("effectivePrice"))
                            .thenComparingDouble(m -> (Double) m.get("distanceKm"));
                    case "PRICE_DESC" -> Comparator.<Map<String, Object>, BigDecimal>comparing(m -> (BigDecimal) m.get("effectivePrice"))
                            .reversed()
                            .thenComparingDouble(m -> (Double) m.get("distanceKm"));
                    case "RATING" -> Comparator.<Map<String, Object>, BigDecimal>comparing(m -> ((ServiceListing) m.get("listing")).getRatingAvg())
                            .reversed()
                            .thenComparingDouble(m -> (Double) m.get("distanceKm"));
                    default -> nearestComparator;
                };
        results.sort(comparator);

        Map<String, Object> response = new LinkedHashMap<>();
        response.put("detectedLocation", detectedLocation);
        response.put("sortApplied", activeSearch ? "NEAREST" : normalizedSort);
        response.put("results", results);
        response.put("count", results.size());
        return response;
    }

    @Transactional(readOnly = true)
    public Map<String, Object> searchByImage(
            HttpServletRequest request,
            UserAccount authenticatedUser,
            String rawImageBase64,
            String mimeType,
            Double lat,
            Double lng,
            Double radiusKm
    ) {
        if (rawImageBase64 == null || rawImageBase64.isBlank()) {
            throw new ApiException(HttpStatus.BAD_REQUEST, "Image data is required.");
        }

        String resolvedMimeType = (mimeType != null && !mimeType.isBlank()) ? mimeType.trim() : "image/jpeg";
        String cleanBase64 = rawImageBase64.trim();
        if (cleanBase64.startsWith("data:") && cleanBase64.contains(",")) {
            int commaIdx = cleanBase64.indexOf(',');
            String header = cleanBase64.substring(5, commaIdx);
            int semiIdx = header.indexOf(';');
            if (semiIdx > 0) {
                resolvedMimeType = header.substring(0, semiIdx);
            }
            cleanBase64 = cleanBase64.substring(commaIdx + 1).trim();
        }
        if (cleanBase64.length() > 8_500_000) {
            throw new ApiException(HttpStatus.PAYLOAD_TOO_LARGE, "Scanned image exceeds maximum upload size (6 MB).");
        }

        String apiKey = (configuredGeminiApiKey != null && !configuredGeminiApiKey.isBlank())
                ? configuredGeminiApiKey.trim()
                : safeStr(System.getenv("GEMINI_API_KEY")).trim();
        if (apiKey.isEmpty()) {
            throw new ApiException(
                    HttpStatus.SERVICE_UNAVAILABLE,
                    "Visual search requires GEMINI_API_KEY to be configured on the backend server."
            );
        }

        Map<String, Object> detectedLocation = resolveUserLocation(request, authenticatedUser, lat, lng);
        double refLat = ((Number) detectedLocation.get("lat")).doubleValue();
        double refLng = ((Number) detectedLocation.get("lng")).doubleValue();

        List<ServiceCategory> allCategories = categoryRepo.findAllByOrderByDisplayOrderAscIdAsc();
        Map<Long, ServiceCategory> catMap = new HashMap<>();
        List<String> categoryNames = new ArrayList<>();
        for (ServiceCategory c : allCategories) {
            catMap.put(c.getId(), c);
            if ("ACTIVE".equalsIgnoreCase(c.getStatus()) && c.getName() != null) {
                categoryNames.add(c.getName());
            }
        }

        Map<String, Object> analysis = analyzeImageWithGemini(apiKey, cleanBase64, resolvedMimeType, categoryNames);

        Set<String> tokens = new LinkedHashSet<>();
        addSearchTokens(tokens, safeStr((String) analysis.get("primaryQuery")));
        addSearchTokens(tokens, safeStr((String) analysis.get("detectedItem")));
        addSearchTokens(tokens, safeStr((String) analysis.get("categoryHint")));
        Object kwObj = analysis.get("keywords");
        if (kwObj instanceof List<?> kwList) {
            for (Object kw : kwList) {
                if (kw != null) {
                    addSearchTokens(tokens, kw.toString());
                }
            }
        }

        String categoryHintLower = safeStr((String) analysis.get("categoryHint")).toLowerCase(Locale.ROOT);
        List<Business> allBusinesses = businessRepo.findAllByOrderByIdAsc();
        enrichBusinessesWithOwnerProfiles(allBusinesses);
        Map<Long, Business> bizMap = new HashMap<>();
        for (Business b : allBusinesses) {
            bizMap.put(b.getId(), b);
        }

        List<ServiceListing> activeListings = listingRepo.findByStatusOrderByCreatedAtDesc("ACTIVE");
        List<Map<String, Object>> visualCandidates = new ArrayList<>();
        for (ServiceListing listing : activeListings) {
            Business biz = bizMap.get(listing.getBusinessId());
            if (biz == null || !"APPROVED".equalsIgnoreCase(biz.getVerificationStatus())) continue;
            if (biz.getLatitude() == null || biz.getLongitude() == null) continue;
            double distanceKm = geoDistanceService.calculateDistanceKm(
                    refLat, refLng, biz.getLatitude().doubleValue(), biz.getLongitude().doubleValue());
            if (radiusKm != null && radiusKm > 0 && distanceKm > radiusKm) continue;

            DecodedInlineImage candidateImg = extractPrimaryListingInlineImage(listing);
            if (candidateImg != null) {
                Map<String, Object> vc = new LinkedHashMap<>();
                vc.put("listing", listing);
                vc.put("distanceKm", distanceKm);
                vc.put("inlineImage", candidateImg);
                visualCandidates.add(vc);
            }
        }
        visualCandidates.sort(Comparator.comparingDouble(m -> (Double) m.get("distanceKm")));
        if (visualCandidates.size() > 8) {
            visualCandidates = new ArrayList<>(visualCandidates.subList(0, 8));
        }

        Set<Long> visuallyMatchedIds = matchCandidateListingImagesWithGemini(
                apiKey, cleanBase64, resolvedMimeType, visualCandidates);

        List<Map<String, Object>> results = new ArrayList<>();
        for (ServiceListing listing : activeListings) {
            Business biz = bizMap.get(listing.getBusinessId());
            if (biz == null || !"APPROVED".equalsIgnoreCase(biz.getVerificationStatus())) continue;
            if (biz.getLatitude() == null || biz.getLongitude() == null) continue;

            double distanceKm = geoDistanceService.calculateDistanceKm(
                    refLat, refLng, biz.getLatitude().doubleValue(), biz.getLongitude().doubleValue());
            if (radiusKm != null && radiusKm > 0 && distanceKm > radiusKm) continue;

            ServiceCategory cat = catMap.get(listing.getCategoryId());
            String haystack = String.join(" ",
                    safeStr(listing.getTitle()),
                    safeStr(listing.getDescription()),
                    safeStr(listing.getListingType()),
                    extractSearchableMetadataText(listing.getMetadata()),
                    safeStr(biz.getOwnerFullName()),
                    safeStr(biz.getBusinessName()),
                    safeStr(biz.getSubCity()),
                    safeStr(biz.getLandmark()),
                    cat != null ? safeStr(cat.getName()) : "",
                    cat != null ? safeStr(cat.getNameAm()) : "",
                    cat != null ? safeStr(cat.getNameOm()) : "",
                    cat != null ? safeStr(cat.getDescription()) : ""
            ).toLowerCase(Locale.ROOT);

            int matchScore = 0;
            for (String token : tokens) {
                if (haystack.contains(token)) {
                    matchScore += 2;
                }
            }
            if (!categoryHintLower.isEmpty() && cat != null && cat.getName() != null
                    && (cat.getName().toLowerCase(Locale.ROOT).contains(categoryHintLower)
                    || categoryHintLower.contains(cat.getName().toLowerCase(Locale.ROOT)))) {
                matchScore += 3;
            }

            boolean visualImageMatch = visuallyMatchedIds.contains(listing.getId());
            if (visualImageMatch) {
                matchScore += 6;
            }
            if (matchScore <= 0) continue;

            BigDecimal effectivePrice = listing.getDiscountPrice() != null
                    ? listing.getDiscountPrice()
                    : listing.getBasePrice();

            Map<String, Object> entry = new LinkedHashMap<>();
            entry.put("listing", listing);
            entry.put("business", biz);
            entry.put("category", cat);
            entry.put("distanceKm", distanceKm);
            entry.put("effectivePrice", effectivePrice);
            entry.put("matchScore", matchScore);
            entry.put("visualImageMatch", visualImageMatch);
            results.add(entry);
        }

        // Prioritize nearest distance first for matched items
        results.sort(Comparator
                .<Map<String, Object>>comparingDouble(m -> (Double) m.get("distanceKm"))
                .thenComparing(m -> (Integer) m.get("matchScore"), Comparator.reverseOrder())
                .thenComparing(
                        m -> ((ServiceListing) m.get("listing")).getRatingAvg(),
                        Comparator.reverseOrder()
                ));

        Map<String, Object> response = new LinkedHashMap<>();
        response.put("detectedLocation", detectedLocation);
        response.put("analysis", analysis);
        response.put("results", results);
        response.put("count", results.size());
        return response;
    }

    private record DecodedInlineImage(String mimeType, String base64Data) {}

    private DecodedInlineImage extractPrimaryListingInlineImage(ServiceListing listing) {
        List<String> candidates = new ArrayList<>();
        if (listing.getImageUrls() != null) {
            candidates.addAll(listing.getImageUrls());
        }
        if (listing.getImageUrl() != null && !listing.getImageUrl().isBlank()) {
            candidates.add(listing.getImageUrl());
        }
        if (listing.getMetadata() != null && listing.getMetadata().get("companyLogoUrl") instanceof String logoUrl
                && !logoUrl.isBlank()) {
            candidates.add(logoUrl);
        }
        for (String raw : candidates) {
            if (raw == null) continue;
            String trimmed = raw.trim();
            if (trimmed.startsWith("data:image/") && trimmed.contains(",")) {
                int commaIdx = trimmed.indexOf(',');
                String header = trimmed.substring(5, commaIdx);
                int semiIdx = header.indexOf(';');
                String mime = semiIdx > 0 ? header.substring(0, semiIdx) : "image/jpeg";
                String data = trimmed.substring(commaIdx + 1).trim();
                if (!data.isEmpty() && data.length() <= 3_000_000) {
                    return new DecodedInlineImage(mime, data);
                }
            }
        }
        return null;
    }

    private Set<Long> matchCandidateListingImagesWithGemini(
            String apiKey,
            String queryBase64,
            String queryMimeType,
            List<Map<String, Object>> visualCandidates
    ) {
        Set<Long> matchedIds = new LinkedHashSet<>();
        if (visualCandidates == null || visualCandidates.isEmpty()) {
            return matchedIds;
        }

        List<Map<String, Object>> parts = new ArrayList<>();
        parts.add(Map.of("text", "Query image scanned by the customer:"));
        parts.add(Map.of("inline_data", Map.of("mime_type", queryMimeType, "data", queryBase64)));
        parts.add(Map.of("text",
                "Compare the Query image above against each seller listing image below. "
                        + "Return matchedListingIds containing the numeric ID of every candidate that shows "
                        + "the same or closely matching product, food item, equipment, service, or company logo."));

        for (Map<String, Object> vc : visualCandidates) {
            ServiceListing candListing = (ServiceListing) vc.get("listing");
            DecodedInlineImage img = (DecodedInlineImage) vc.get("inlineImage");
            if (candListing == null || img == null) continue;
            parts.add(Map.of("text", "Candidate Listing ID " + candListing.getId()
                    + ": " + safeStr(candListing.getTitle())
                    + " (" + safeStr(candListing.getListingType()) + ")"));
            parts.add(Map.of("inline_data", Map.of("mime_type", img.mimeType(), "data", img.base64Data())));
        }

        Map<String, Object> schema = new LinkedHashMap<>();
        schema.put("type", "OBJECT");
        schema.put("properties", Map.of(
                "matchedListingIds", Map.of(
                        "type", "ARRAY",
                        "items", Map.of("type", "INTEGER"),
                        "description", "IDs of candidate listings whose uploaded image visually matches the scanned query image."
                )
        ));
        schema.put("required", List.of("matchedListingIds"));

        Map<String, Object> payload = new LinkedHashMap<>();
        payload.put("contents", List.of(Map.of("parts", parts)));
        payload.put("generationConfig", Map.of(
                "responseMimeType", "application/json",
                "responseSchema", schema
        ));

        try {
            String body = objectMapper.writeValueAsString(payload);
            String endpoint = "https://generativelanguage.googleapis.com/v1beta/models/gemini-4-hydrogen:generateContent?key="
                    + URLEncoder.encode(apiKey, StandardCharsets.UTF_8);

            HttpRequest req = HttpRequest.newBuilder()
                    .uri(URI.create(endpoint))
                    .timeout(Duration.ofSeconds(25))
                    .header("Content-Type", "application/json")
                    .header("User-Agent", "aistudio-build")
                    .POST(HttpRequest.BodyPublishers.ofString(body, StandardCharsets.UTF_8))
                    .build();

            HttpResponse<String> res = httpClient.send(req, HttpResponse.BodyHandlers.ofString());
            if (res.statusCode() >= 200 && res.statusCode() < 300) {
                JsonNode root = objectMapper.readTree(res.body());
                String jsonText = root.path("candidates").path(0).path("content").path("parts").path(0).path("text").asText("");
                if (!jsonText.isBlank()) {
                    JsonNode parsed = objectMapper.readTree(jsonText);
                    if (parsed.path("matchedListingIds").isArray()) {
                        for (JsonNode idNode : parsed.path("matchedListingIds")) {
                            if (idNode.canConvertToLong()) {
                                matchedIds.add(idNode.asLong());
                            }
                        }
                    }
                }
            }
        } catch (Exception ignored) {
            // Stage 1 keyword analysis still provides results if visual batch comparison times out
        }
        return matchedIds;
    }

    private Map<String, Object> analyzeImageWithGemini(
            String apiKey,
            String base64Data,
            String mimeType,
            List<String> categoryNames
    ) {
        String categoriesCsv = categoryNames.isEmpty()
                ? "Shops & Retail, Food & Dining, Home Services, Delivery & Transport, Rentals, Jobs, Healthcare"
                : String.join(", ", categoryNames);

        String prompt = "Identify the main product, equipment, repair need, food/drink, storefront sign, "
                + "text, or local service shown in this image for a local marketplace in Ethiopia. "
                + "Available categories: " + categoriesCsv + ". "
                + "Return concise search terms so matching shops or service providers nearby can be found.";

        Map<String, Object> schema = new LinkedHashMap<>();
        schema.put("type", "OBJECT");
        Map<String, Object> props = new LinkedHashMap<>();
        props.put("detectedItem", Map.of("type", "STRING", "description", "Clear short name of the item or service in the image."));
        props.put("primaryQuery", Map.of("type", "STRING", "description", "Best 1-2 word search query for marketplace catalog matching."));
        props.put("categoryHint", Map.of("type", "STRING", "description", "Closest matching category name from the available categories."));
        props.put("keywords", Map.of(
                "type", "ARRAY",
                "items", Map.of("type", "STRING"),
                "description", "4 to 8 single-word search keywords and synonyms."
        ));
        props.put("summary", Map.of("type", "STRING", "description", "One brief sentence summarizing what was scanned."));
        schema.put("properties", props);
        schema.put("required", List.of("detectedItem", "primaryQuery", "categoryHint", "keywords", "summary"));

        Map<String, Object> payload = new LinkedHashMap<>();
        payload.put("contents", List.of(
                Map.of("parts", List.of(
                        Map.of("inline_data", Map.of("mime_type", mimeType, "data", base64Data)),
                        Map.of("text", prompt)
                ))
        ));
        payload.put("generationConfig", Map.of(
                "responseMimeType", "application/json",
                "responseSchema", schema
        ));

        try {
            String body = objectMapper.writeValueAsString(payload);
            String endpoint = "https://generativelanguage.googleapis.com/v1beta/models/gemini-4-hydrogen:generateContent?key="
                    + URLEncoder.encode(apiKey, StandardCharsets.UTF_8);

            HttpRequest req = HttpRequest.newBuilder()
                    .uri(URI.create(endpoint))
                    .timeout(Duration.ofSeconds(25))
                    .header("Content-Type", "application/json")
                    .header("User-Agent", "aistudio-build")
                    .POST(HttpRequest.BodyPublishers.ofString(body, StandardCharsets.UTF_8))
                    .build();

            HttpResponse<String> res = httpClient.send(req, HttpResponse.BodyHandlers.ofString());
            if (res.statusCode() < 200 || res.statusCode() >= 300) {
                String upstreamMessage = "Visual search request failed (" + res.statusCode() + ").";
                try {
                    JsonNode errNode = objectMapper.readTree(res.body());
                    String msg = errNode.path("error").path("message").asText("");
                    if (!msg.isBlank()) {
                        upstreamMessage = msg;
                    }
                } catch (Exception ignored) {}
                HttpStatus status = HttpStatus.resolve(res.statusCode());
                throw new ApiException(status != null ? status : HttpStatus.BAD_GATEWAY, upstreamMessage);
            }

            JsonNode root = objectMapper.readTree(res.body());
            String jsonText = root.path("candidates").path(0).path("content").path("parts").path(0).path("text").asText("");
            if (jsonText.isBlank()) {
                throw new ApiException(HttpStatus.BAD_GATEWAY, "Could not extract visual analysis from the scanned image.");
            }
            JsonNode parsed = objectMapper.readTree(jsonText);
            List<String> keywords = new ArrayList<>();
            if (parsed.path("keywords").isArray()) {
                for (JsonNode k : parsed.path("keywords")) {
                    String kw = k.asText("").trim();
                    if (!kw.isBlank()) keywords.add(kw);
                }
            }
            Map<String, Object> analysis = new LinkedHashMap<>();
            analysis.put("detectedItem", parsed.path("detectedItem").asText("Scanned Item"));
            analysis.put("primaryQuery", parsed.path("primaryQuery").asText(""));
            analysis.put("categoryHint", parsed.path("categoryHint").asText(""));
            analysis.put("keywords", keywords);
            analysis.put("summary", parsed.path("summary").asText(""));
            return analysis;
        } catch (ApiException ex) {
            throw ex;
        } catch (Exception ex) {
            throw new ApiException(HttpStatus.BAD_GATEWAY, "Failed to analyze scanned image: " + ex.getMessage());
        }
    }

    private void addSearchTokens(Set<String> tokens, String text) {
        if (text == null || text.isBlank()) return;
        String cleaned = text.toLowerCase(Locale.ROOT).replaceAll("[^\\p{L}\\p{N}\\s]", " ");
        for (String part : cleaned.split("\\s+")) {
            String trimmed = part.trim();
            if (trimmed.length() >= 3) {
                tokens.add(trimmed);
            }
        }
    }

    private List<Map<String, Object>> computeRecommendations(
            List<ServiceCategory> categories,
            List<Business> approvedBusinesses,
            List<ServiceListing> activeListings,
            double refLat,
            double refLng,
            int limit
    ) {
        Map<Long, Business> bizMap = new HashMap<>();
        for (Business b : approvedBusinesses) {
            bizMap.put(b.getId(), b);
        }
        Map<Long, ServiceCategory> catMap = new HashMap<>();
        for (ServiceCategory c : categories) {
            catMap.put(c.getId(), c);
        }

        List<Map<String, Object>> availableEntries = new ArrayList<>();
        List<Map<String, Object>> fallbackEntries = new ArrayList<>();

        for (ServiceListing listing : activeListings) {
            Business biz = bizMap.get(listing.getBusinessId());
            if (biz == null || biz.getLatitude() == null || biz.getLongitude() == null) continue;

            double distanceKm = geoDistanceService.calculateDistanceKm(
                    refLat, refLng, biz.getLatitude().doubleValue(), biz.getLongitude().doubleValue());
            BigDecimal effectivePrice = listing.getDiscountPrice() != null
                    ? listing.getDiscountPrice()
                    : listing.getBasePrice();
            ServiceCategory cat = catMap.get(listing.getCategoryId());

            String reason;
            if ("INDIVIDUAL_JOB_SEEKER".equalsIgnoreCase(biz.getProfileType())) {
                reason = biz.isFaydaVerified()
                        ? "Fayda-verified job seeker near you"
                        : "Individual job seeker advertising nearby";
            } else if (distanceKm <= 2.0 && biz.isLiveLocationActive()) {
                reason = "Closest live GPS provider right near you";
            } else if (biz.isFaydaVerified() && biz.isLivenessVerified()) {
                reason = "Fayda-verified nearby option";
            } else {
                reason = "Nearest active service to your location";
            }

            Map<String, Object> entry = new LinkedHashMap<>();
            entry.put("listing", listing);
            entry.put("business", biz);
            entry.put("category", cat);
            entry.put("distanceKm", distanceKm);
            entry.put("effectivePrice", effectivePrice);
            entry.put("reason", reason);

            if ("AVAILABLE".equalsIgnoreCase(listing.getAvailabilityStatus())) {
                availableEntries.add(entry);
            } else {
                fallbackEntries.add(entry);
            }
        }

        Comparator<Map<String, Object>> recComparator = Comparator
                .<Map<String, Object>>comparingDouble(m -> (Double) m.get("distanceKm"))
                .thenComparing(m -> !((Business) m.get("business")).isLiveLocationActive())
                .thenComparing(
                        m -> ((ServiceListing) m.get("listing")).getRatingAvg(),
                        Comparator.reverseOrder()
                );

        availableEntries.sort(recComparator);
        fallbackEntries.sort(recComparator);

        List<Map<String, Object>> combined = new ArrayList<>(availableEntries);
        if (combined.size() < limit) {
            combined.addAll(fallbackEntries);
        }
        return combined.size() > limit ? new ArrayList<>(combined.subList(0, limit)) : combined;
    }

    private Map<String, Object> buildLocationPayload(
            double lat,
            double lng,
            String label,
            String subCity,
            String city,
            String source,
            String accuracyMode
    ) {
        Map<String, Object> loc = new LinkedHashMap<>();
        loc.put("lat", Math.round(lat * 1_000_000.0) / 1_000_000.0);
        loc.put("lng", Math.round(lng * 1_000_000.0) / 1_000_000.0);
        loc.put("label", label);
        loc.put("subCity", subCity);
        loc.put("city", city);
        loc.put("source", source);
        loc.put("accuracyMode", accuracyMode);
        return loc;
    }

    private CachedAreaLabel reverseGeocodeArea(double lat, double lng) {
        String key = String.format(Locale.US, "%.3f,%.3f", lat, lng);
        long now = Instant.now().toEpochMilli();
        CachedAreaLabel cached = reverseGeoCache.get(key);
        if (cached != null && cached.expiresAtMs() > now) {
            return cached;
        }
        if (reverseGeoCache.size() > 500) {
            reverseGeoCache.clear();
        }
        try {
            String url = String.format(
                    Locale.US,
                    "https://nominatim.openstreetmap.org/reverse?format=jsonv2&lat=%.6f&lon=%.6f&zoom=14&addressdetails=1",
                    lat,
                    lng
            );
            HttpRequest req = HttpRequest.newBuilder()
                    .uri(URI.create(url))
                    .timeout(Duration.ofMillis(2200))
                    .header("User-Agent", "NearestYouEthiopia/1.0")
                    .header("Accept-Language", "en")
                    .GET()
                    .build();
            HttpResponse<String> res = httpClient.send(req, HttpResponse.BodyHandlers.ofString());
            if (res.statusCode() >= 200 && res.statusCode() < 300) {
                JsonNode root = objectMapper.readTree(res.body());
                JsonNode addr = root.path("address");
                String subCity = firstNonBlank(
                        addr.path("city_district").asText(""),
                        addr.path("suburb").asText(""),
                        addr.path("neighbourhood").asText(""),
                        addr.path("borough").asText(""),
                        addr.path("road").asText("")
                );
                String city = firstNonBlank(
                        addr.path("city").asText(""),
                        addr.path("town").asText(""),
                        addr.path("state").asText(""),
                        addr.path("country").asText("")
                );
                String label = joinNonBlank(subCity, city);
                if (label.isBlank()) {
                    label = root.path("name").asText("");
                }
                CachedAreaLabel computed = new CachedAreaLabel(label, subCity, city, now + CACHE_TTL_MS);
                reverseGeoCache.put(key, computed);
                return computed;
            }
        } catch (Exception ignored) {
            // Fall back smoothly without failing catalog loading
        }
        return null;
    }

    private CachedIpGeo lookupIpGeolocation(String ip) {
        long now = Instant.now().toEpochMilli();
        CachedIpGeo cached = ipGeoCache.get(ip);
        if (cached != null && cached.expiresAtMs() > now) {
            return cached;
        }
        if (ipGeoCache.size() > 500) {
            ipGeoCache.clear();
        }
        try {
            String url = "https://ipwho.is/" + ip + "?fields=success,latitude,longitude,city,region";
            HttpRequest req = HttpRequest.newBuilder()
                    .uri(URI.create(url))
                    .timeout(Duration.ofMillis(2200))
                    .header("Accept", "application/json")
                    .GET()
                    .build();
            HttpResponse<String> res = httpClient.send(req, HttpResponse.BodyHandlers.ofString());
            if (res.statusCode() >= 200 && res.statusCode() < 300) {
                JsonNode root = objectMapper.readTree(res.body());
                if (root.path("success").asBoolean(false)
                        && root.hasNonNull("latitude")
                        && root.hasNonNull("longitude")) {
                    double lat = root.get("latitude").asDouble();
                    double lng = root.get("longitude").asDouble();
                    if (geoDistanceService.isValidCoordinates(lat, lng)) {
                        CachedIpGeo geo = new CachedIpGeo(
                                lat,
                                lng,
                                root.path("city").asText(""),
                                root.path("region").asText(""),
                                now + CACHE_TTL_MS
                        );
                        ipGeoCache.put(ip, geo);
                        return geo;
                    }
                }
            }
        } catch (Exception ignored) {
            // Non-blocking fallback to saved profile or city center
        }
        return null;
    }

    private String extractClientIp(HttpServletRequest request) {
        if (request == null) return null;
        String xff = request.getHeader("X-Forwarded-For");
        if (xff != null && !xff.isBlank()) {
            String first = xff.split(",")[0].trim();
            if (!first.isBlank()) return first;
        }
        String realIp = request.getHeader("X-Real-IP");
        if (realIp != null && !realIp.isBlank()) {
            return realIp.trim();
        }
        return request.getRemoteAddr();
    }

    private boolean isPrivateOrLoopbackIp(String ip) {
        try {
            InetAddress addr = InetAddress.getByName(ip);
            return addr.isAnyLocalAddress()
                    || addr.isLoopbackAddress()
                    || addr.isLinkLocalAddress()
                    || addr.isSiteLocalAddress()
                    || addr.isMulticastAddress();
        } catch (Exception ex) {
            return true;
        }
    }

    private String firstNonBlank(String... values) {
        for (String v : values) {
            if (v != null && !v.isBlank()) return v.trim();
        }
        return "";
    }

    private String joinNonBlank(String a, String b) {
        boolean hasA = a != null && !a.isBlank();
        boolean hasB = b != null && !b.isBlank();
        if (hasA && hasB && !a.equalsIgnoreCase(b)) return a.trim() + ", " + b.trim();
        if (hasA) return a.trim();
        if (hasB) return b.trim();
        return "";
    }

    private static final Set<String> SEARCH_STOP_WORDS = Set.of(
            "i", "me", "my", "a", "an", "the", "for", "with", "and", "or",
            "in", "on", "at", "to", "of", "who", "need", "looking", "want", "find", "hire"
    );

    private boolean matchesQueryTokens(String haystack, String queryLower) {
        if (queryLower == null || queryLower.isBlank()) return true;
        if (haystack.contains(queryLower)) return true;

        String cleaned = queryLower.replaceAll("[^\\p{L}\\p{N}\\s]", " ").trim();
        if (cleaned.isEmpty()) return false;

        String[] rawParts = cleaned.split("\\s+");
        List<String> tokens = new ArrayList<>();
        for (String p : rawParts) {
            String trimmed = p.trim();
            if (!trimmed.isEmpty() && !SEARCH_STOP_WORDS.contains(trimmed)) {
                tokens.add(trimmed);
            }
        }
        if (tokens.isEmpty()) {
            for (String p : rawParts) {
                String trimmed = p.trim();
                if (!trimmed.isEmpty()) {
                    tokens.add(trimmed);
                }
            }
        }
        if (tokens.isEmpty()) return true;

        for (String token : tokens) {
            if (haystack.contains(token)) continue;
            if (token.length() >= 6 && haystack.contains(token.substring(0, 5))) continue;
            return false;
        }
        return true;
    }

    private String extractSearchableMetadataText(Map<String, Object> metadata) {
        if (metadata == null || metadata.isEmpty()) return "";
        StringBuilder sb = new StringBuilder();
        for (Map.Entry<String, Object> entry : metadata.entrySet()) {
            String key = entry.getKey();
            if (key == null) continue;
            if ("cvUrl".equalsIgnoreCase(key)
                    || "companyLogoUrl".equalsIgnoreCase(key)
                    || "introVideoUrl".equalsIgnoreCase(key)) {
                continue;
            }
            Object val = entry.getValue();
            if (val instanceof String str) {
                String trimmed = str.trim();
                if (!trimmed.isEmpty()
                        && !trimmed.startsWith("data:")
                        && !trimmed.startsWith("http://")
                        && !trimmed.startsWith("https://")) {
                    sb.append(trimmed).append(' ');
                }
            } else if (val instanceof Collection<?> col) {
                for (Object item : col) {
                    if (item != null) {
                        String trimmed = item.toString().trim();
                        if (!trimmed.isEmpty() && !trimmed.startsWith("data:") && !trimmed.startsWith("http")) {
                            sb.append(trimmed).append(' ');
                        }
                    }
                }
            } else if (val != null && !(val instanceof Map<?, ?>)) {
                sb.append(val).append(' ');
            }
        }
        return sb.toString();
    }

    private void enrichBusinessesWithOwnerProfiles(Collection<Business> businesses) {
        if (businesses == null || businesses.isEmpty()) return;

        Map<String, String> userNamesByUid = new HashMap<>();
        for (UserAccount account : userRepo.findAll()) {
            String fullName = safeStr(account.getFullName()).trim();
            if (fullName.isEmpty()) continue;
            if (account.getUid() != null && !account.getUid().isBlank()) {
                userNamesByUid.put(account.getUid(), fullName);
            }
            if (account.getFirebaseUid() != null && !account.getFirebaseUid().isBlank()) {
                userNamesByUid.putIfAbsent(account.getFirebaseUid(), fullName);
            }
        }

        Map<String, String> regNamesByUid = new HashMap<>();
        for (ProviderRegistration reg : providerRepo.findAllByOrderByUpdatedAtDesc()) {
            String regName = safeStr(reg.getFullName()).trim();
            if (!regName.isEmpty() && reg.getUserUid() != null && !reg.getUserUid().isBlank()) {
                regNamesByUid.putIfAbsent(reg.getUserUid(), regName);
            }
        }

        for (Business b : businesses) {
            if (b == null) continue;
            String ownerUid = safeStr(b.getOwnerUid()).trim();
            String userFullName = ownerUid.isEmpty() ? "" : safeStr(userNamesByUid.get(ownerUid)).trim();
            String regFullName = ownerUid.isEmpty() ? "" : safeStr(regNamesByUid.get(ownerUid)).trim();

            String resolved = null;
            if (!userFullName.isEmpty() && !"Nearest You User".equalsIgnoreCase(userFullName)) {
                resolved = userFullName;
            } else if (!regFullName.isEmpty()) {
                resolved = regFullName;
            } else if (!userFullName.isEmpty()) {
                resolved = userFullName;
            } else if (b.getBusinessName() != null && !b.getBusinessName().isBlank()) {
                resolved = b.getBusinessName().trim();
            }
            b.setOwnerFullName(resolved);
        }
    }

    private String safeStr(String s) {
        return s == null ? "" : s;
    }
}
