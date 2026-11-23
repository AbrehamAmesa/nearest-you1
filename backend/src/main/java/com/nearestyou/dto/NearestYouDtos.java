package com.nearestyou.dto;

import jakarta.validation.constraints.*;
import java.math.BigDecimal;
import java.util.List;
import java.util.Map;

public final class NearestYouDtos {
    private NearestYouDtos() {}

    public record RegisterRequest(
        @NotBlank String fullName,
        @NotBlank @Email String email,
        @NotBlank @Size(min = 6, max = 128) String password,
        String phoneNumber,
        String preferredLanguage,
        String defaultSubCity,
        BigDecimal defaultLat,
        BigDecimal defaultLng
    ) {}

    public record LoginRequest(
        @NotBlank @Email String email,
        @NotBlank String password
    ) {}

    public record SyncPasswordRequest(
        @NotBlank @Size(min = 6, max = 128) String password
    ) {}

    public record ChangePasswordRequest(
        String currentPassword,
        @NotBlank @Size(min = 6, max = 128) String newPassword
    ) {}

    public record UpdateProfileRequest(
        String fullName,
        String phoneNumber,
        String preferredLanguage,
        String defaultSubCity,
        BigDecimal defaultLat,
        BigDecimal defaultLng,
        String profilePhotoUrl
    ) {}

    public record ProviderDocSubmission(
        @NotNull Long requirementId,
        String documentName,
        String documentNumber,
        @NotBlank String fileName,
        @NotBlank String fileDataUrl
    ) {}

    public record ProviderRegistrationRequest(
        @NotBlank String fullName,
        @NotBlank String phoneNumber,
        @NotNull Long serviceCategoryId,
        @NotBlank String faydaIdNumber,
        @NotBlank String faydaFrontImage,
        @NotBlank String profilePhotoImage,
        boolean livenessPassed,
        Integer livenessScore,
        List<String> livenessChallenges,
        @NotBlank String livenessSelfieImage,
        @NotBlank String subCity,
        @NotBlank String landmark,
        @NotNull BigDecimal latitude,
        @NotNull BigDecimal longitude,
        boolean isLiveLocationActive,
        List<ProviderDocSubmission> documents
    ) {}

    public record UpdateLiveLocationRequest(
        @NotNull BigDecimal latitude,
        @NotNull BigDecimal longitude,
        Boolean isLiveLocationActive
    ) {}

    public record CreateBusinessRequest(
        @NotBlank String businessName,
        @NotBlank String description,
        @NotNull Long categoryId,
        @NotBlank String licenseNumber,
        String tinNumber,
        @NotBlank String contactPhone,
        String email,
        @NotBlank String subCity,
        String woreda,
        @NotBlank String landmark,
        @NotNull BigDecimal latitude,
        @NotNull BigDecimal longitude,
        Boolean liveLocationActive
    ) {}

    public record CreateListingRequest(
        @NotNull Long businessId,
        @NotNull Long categoryId,
        @NotBlank String listingType,
        @NotBlank String title,
        @NotBlank String description,
        String imageUrl,
        List<String> imageUrls,
        @NotBlank String pricingModel,
        @NotBlank String pricingUnit,
        @NotNull BigDecimal basePrice,
        BigDecimal discountPrice,
        BigDecimal minimumCharge,
        BigDecimal calloutFee,
        BigDecimal depositAmount,
        BigDecimal salaryMax,
        String currency,
        boolean isQuoteBased,
        boolean isUnpaid,
        Map<String, Object> pricingFormula,
        Map<String, Object> metadata,
        String status
    ) {}

    public record UpdateListingRequest(
        @NotBlank String title,
        @NotBlank String description,
        String imageUrl,
        List<String> imageUrls,
        @NotBlank String pricingModel,
        @NotBlank String pricingUnit,
        @NotNull BigDecimal basePrice,
        BigDecimal discountPrice,
        BigDecimal minimumCharge,
        BigDecimal calloutFee,
        BigDecimal depositAmount,
        BigDecimal salaryMax,
        Boolean isQuoteBased,
        Boolean isUnpaid,
        Map<String, Object> pricingFormula,
        Map<String, Object> metadata,
        String availabilityStatus,
        String status
    ) {}

    public record UpdateAvailabilityRequest(@NotBlank String availabilityStatus) {}

    public record OrderItemInput(@NotNull Long listingId, @Min(1) int quantity, String variant) {}

    public record OrderGroupInput(
        @NotNull Long businessId,
        @NotBlank String orderType,
        @NotBlank String fulfillmentType,
        @NotBlank String deliveryAddress,
        BigDecimal deliveryFee,
        @NotEmpty List<OrderItemInput> items
    ) {}

    public record CreateOrdersRequest(@NotEmpty List<OrderGroupInput> groups, @NotBlank String paymentMethod) {}

    public record UpdateOrderStatusRequest(
        @NotBlank String orderStatus,
        Integer estimatedReadyMinutes,
        Integer estimatedDeliveryMinutes,
        String rejectionReason
    ) {}

    public record CreateBookingRequest(
        @NotNull Long listingId,
        @NotBlank String scheduledDate,
        String endDate,
        String scheduledTime,
        Map<String, Object> parameters,
        @NotBlank String paymentMethod,
        String notes
    ) {}

    public record UpdateBookingStatusRequest(String bookingStatus, BigDecimal quotedPrice, Boolean quoteApproved) {}

    public record CreateDeliveryRequest(
        @NotBlank String requestType,
        @NotBlank String pickupLocation,
        BigDecimal pickupLat,
        BigDecimal pickupLng,
        String pickupPlaceId,
        @NotBlank String destinationLocation,
        BigDecimal destinationLat,
        BigDecimal destinationLng,
        String destinationPlaceId,
        @NotBlank String packageOrRideDetails,
        String receiverName,
        String receiverPhone,
        BigDecimal declaredValue,
        @NotBlank String vehicleType,
        @NotBlank String urgency,
        @NotNull BigDecimal distanceKm,
        @NotBlank String paymentMethod
    ) {}

    public record TransitionDeliveryRequest(
        @NotBlank String status,
        String otp,
        BigDecimal driverLat,
        BigDecimal driverLng
    ) {}

    public record UpdateDriverLocationRequest(@NotNull BigDecimal latitude, @NotNull BigDecimal longitude) {}

    public record DisputeDeliveryRequest(@NotBlank String reason, String category) {}

    public record ConflictStatementRequest(@NotBlank String statement) {}

    public record ResolveDisputeRequest(@NotBlank String resolution, String note) {}

    public record VouchScanRequest(@NotBlank String token) {}

    public record ApproveProviderRequest(@NotBlank String status, String reviewNotes) {}

    public record CreateJobApplicationRequest(
        @NotBlank String applicantName,
        @NotBlank String applicantPhone,
        @NotBlank String skills,
        Integer experienceYears,
        @NotNull BigDecimal expectedCompensation,
        @NotBlank String coverLetter
    ) {}

    public record UpdateApplicationStatusRequest(@NotBlank String applicationStatus) {}

    public record CreateReviewRequest(
        @NotNull Long businessId,
        Long listingId,
        @NotBlank String transactionRef,
        @Min(1) @Max(5) int rating,
        @NotBlank String comment
    ) {}

    public record ToggleFavoriteRequest(@NotNull Long listingId) {}

    public record SendMessageRequest(
        Long businessId,
        Long listingId,
        Long orderId,
        Long bookingId,
        String threadKey,
        String recipientUid,
        String body,
        String messageType,
        String audioDataUrl,
        Integer audioDurationSeconds
    ) {}

    public record CreateDocumentTypeRequest(
        @NotBlank String documentName,
        String documentCode,
        String documentNameAm,
        String documentNameOm,
        String description,
        Boolean defaultMandatory,
        Boolean defaultRequiresDocumentNumber
    ) {}

    public record UpdateDocumentTypeRequest(
        @NotBlank String documentName,
        String documentCode,
        String documentNameAm,
        String documentNameOm,
        String description,
        Boolean defaultMandatory,
        Boolean defaultRequiresDocumentNumber,
        String status
    ) {}

    public record CreateRequirementRequest(
        @NotNull Long categoryId,
        @NotNull Long documentTypeId,
        String description,
        Boolean isMandatory,
        Boolean requiresDocumentNumber
    ) {}

    public record VerifyProviderRequest(@NotBlank String status, String reviewNotes) {}

    public record VerifyBusinessRequest(@NotBlank String verificationStatus) {}

    public record CreateCategoryRequest(
        @NotBlank String name,
        String nameAm,
        String nameOm,
        String description,
        String categoryType,
        String defaultListingType,
        BigDecimal commissionRate,
        BigDecimal minPriceEtb,
        boolean requiresVerification,
        Integer displayOrder
    ) {}

    public record UpdateCategoryRequest(
        @NotBlank String name,
        String nameAm,
        String nameOm,
        String description,
        String categoryType,
        String defaultListingType,
        BigDecimal commissionRate,
        BigDecimal minPriceEtb,
        Boolean requiresVerification,
        Integer displayOrder,
        String status
    ) {}

    public record UpdateCategoryStatusRequest(@NotBlank String status) {}

    public record UpdateUserStatusRequest(@NotBlank String accountStatus) {}

    public record UpdateAdminRoleRequest(boolean isAdmin) {}

    public record VouchEarlyRequest(boolean canVouchEarly) {}

    public record UpdateUserRolesRequest(@NotNull List<String> roles) {}

    public record ImageSearchRequest(
        @NotBlank String imageBase64,
        String mimeType,
        Double lat,
        Double lng,
        Double radiusKm
    ) {}

    public record JobSeekerAdvertiseRequest(
        Long categoryId,
        @NotBlank String title,
        @NotBlank String description,
        String skills,
        String experienceSummary,
        String availabilityNote,
        String pricingModel,
        String pricingUnit,
        BigDecimal expectedPay,
        Boolean negotiable,
        String phoneNumber,
        String subCity,
        String landmark,
        BigDecimal latitude,
        BigDecimal longitude,
        List<String> imageUrls,
        String cvUrl,
        String cvFileName,
        String introVideoUrl
    ) {}

    public record CreateContractOfferRequest(
        Long listingId,
        Long businessId,
        Long bookingId,
        String threadKey,
        String recipientUid,
        @NotBlank String contractType,
        @NotBlank String title,
        @NotBlank String scopeSummary,
        String deliverables,
        String paymentSchedule,
        @NotNull BigDecimal agreedAmount,
        BigDecimal hourlyRate,
        Integer estimatedHours,
        String startDate,
        String endDate
    ) {}

    public record RespondContractRequest(
        @NotBlank String action,
        BigDecimal counterAmount,
        String counterNotes,
        String nextPaymentSchedule,
        String deliverables
    ) {}

    public record PayoutAccountRequest(
        String bankCode,
        String bankName,
        String accountNumber,
        String accountName,
        String telebirrNumber,
        String payoAccountHandle,
        String preferredPayoutGateway
    ) {}

    public record PlatformCommissionAccountRequest(
        @NotBlank String accountHolderName,
        String bankCode,
        String bankName,
        String accountNumber,
        String telebirrNumber,
        String chapaSettlementLabel,
        String payoAccountHandle,
        Boolean chapaEnabled,
        Boolean payoEnabled
    ) {}

    public record InitializePaymentRequest(
        @NotBlank String gateway,
        @NotBlank String transactionType,
        @NotNull Long referenceId,
        String returnUrl,
        String customerEmail,
        String phoneNumber
    ) {}

    public record ConfirmPayoPaymentRequest(
        @NotBlank String receiptReference,
        String receiptImageUrl,
        Boolean providerTransferConfirmed,
        Boolean commissionTransferConfirmed,
        String notes
    ) {}
}
