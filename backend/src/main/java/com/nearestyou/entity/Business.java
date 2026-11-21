package com.nearestyou.entity;

import jakarta.persistence.*;
import java.math.BigDecimal;
import java.time.Instant;

@Entity
@Table(name = "businesses", indexes = {
    @Index(name = "idx_businesses_owner", columnList = "owner_uid"),
    @Index(name = "idx_businesses_category", columnList = "category_id")
})
public class Business {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(name = "owner_uid", nullable = false)
    private String ownerUid;

    @Column(name = "provider_registration_id")
    private Long providerRegistrationId;

    @Column(name = "business_name", nullable = false)
    private String businessName;

    @Column(nullable = false, columnDefinition = "text")
    private String description;

    @Column(name = "category_id", nullable = false)
    private Long categoryId;

    @Column(name = "verification_status", nullable = false)
    private String verificationStatus = "SUBMITTED";

    @Column(name = "license_number", nullable = false)
    private String licenseNumber;

    @Column(name = "contact_phone", nullable = false)
    private String contactPhone;

    @Column(nullable = false)
    private String email;

    @Column(name = "sub_city", nullable = false)
    private String subCity;

    @Column(nullable = false)
    private String woreda = "Woreda 03";

    @Column(nullable = false)
    private String landmark;

    @Column(nullable = false, precision = 10, scale = 6)
    private BigDecimal latitude;

    @Column(nullable = false, precision = 10, scale = 6)
    private BigDecimal longitude;

    @Column(name = "live_location_active", nullable = false)
    private boolean liveLocationActive = true;

    @Column(name = "last_location_ping_at", nullable = false)
    private Instant lastLocationPingAt = Instant.now();

    @Column(name = "fayda_verified", nullable = false)
    private boolean faydaVerified = false;

    @Column(name = "liveness_verified", nullable = false)
    private boolean livenessVerified = false;

    @Column(name = "opening_hours", nullable = false)
    private String openingHours = "08:00 - 21:00";

    @Column(name = "rating_avg", nullable = false, precision = 3, scale = 2)
    private BigDecimal ratingAvg = new BigDecimal("4.80");

    @Column(name = "rating_count", nullable = false)
    private Integer ratingCount = 0;

    @Column(name = "tin_number")
    private String tinNumber;

    @Column(name = "profile_type")
    private String profileType = "BUSINESS";

    @Column(name = "is_featured", nullable = false)
    private boolean isFeatured = false;

    @Column(name = "payout_bank_code")
    private String payoutBankCode;

    @Column(name = "payout_bank_name")
    private String payoutBankName;

    @Column(name = "payout_account_number")
    private String payoutAccountNumber;

    @Column(name = "payout_account_name")
    private String payoutAccountName;

    @Column(name = "payout_telebirr_number")
    private String payoutTelebirrNumber;

    @Column(name = "payo_account_handle")
    private String payoAccountHandle;

    @Column(name = "chapa_subaccount_id")
    private String chapaSubaccountId;

    @Column(name = "preferred_payout_gateway")
    private String preferredPayoutGateway = "BOTH";

    @Column(name = "created_at", nullable = false, updatable = false)
    private Instant createdAt = Instant.now();

    @Transient
    private String ownerFullName;

    public Long getId() { return id; }
    public void setId(Long id) { this.id = id; }

    public String getOwnerUid() { return ownerUid; }
    public void setOwnerUid(String ownerUid) { this.ownerUid = ownerUid; }

    public Long getProviderRegistrationId() { return providerRegistrationId; }
    public void setProviderRegistrationId(Long providerRegistrationId) { this.providerRegistrationId = providerRegistrationId; }

    public String getBusinessName() { return businessName; }
    public void setBusinessName(String businessName) { this.businessName = businessName; }

    public String getDescription() { return description; }
    public void setDescription(String description) { this.description = description; }

    public Long getCategoryId() { return categoryId; }
    public void setCategoryId(Long categoryId) { this.categoryId = categoryId; }

    public String getVerificationStatus() { return verificationStatus; }
    public void setVerificationStatus(String verificationStatus) { this.verificationStatus = verificationStatus; }

    public String getLicenseNumber() { return licenseNumber; }
    public void setLicenseNumber(String licenseNumber) { this.licenseNumber = licenseNumber; }

    public String getContactPhone() { return contactPhone; }
    public void setContactPhone(String contactPhone) { this.contactPhone = contactPhone; }

    public String getEmail() { return email; }
    public void setEmail(String email) { this.email = email; }

    public String getSubCity() { return subCity; }
    public void setSubCity(String subCity) { this.subCity = subCity; }

    public String getWoreda() { return woreda; }
    public void setWoreda(String woreda) { this.woreda = woreda; }

    public String getLandmark() { return landmark; }
    public void setLandmark(String landmark) { this.landmark = landmark; }

    public BigDecimal getLatitude() { return latitude; }
    public void setLatitude(BigDecimal latitude) { this.latitude = latitude; }

    public BigDecimal getLongitude() { return longitude; }
    public void setLongitude(BigDecimal longitude) { this.longitude = longitude; }

    public boolean isLiveLocationActive() { return liveLocationActive; }
    public void setLiveLocationActive(boolean liveLocationActive) { this.liveLocationActive = liveLocationActive; }

    public Instant getLastLocationPingAt() { return lastLocationPingAt; }
    public void setLastLocationPingAt(Instant lastLocationPingAt) { this.lastLocationPingAt = lastLocationPingAt; }

    public boolean isFaydaVerified() { return faydaVerified; }
    public void setFaydaVerified(boolean faydaVerified) { this.faydaVerified = faydaVerified; }

    public boolean isLivenessVerified() { return livenessVerified; }
    public void setLivenessVerified(boolean livenessVerified) { this.livenessVerified = livenessVerified; }

    public String getOpeningHours() { return openingHours; }
    public void setOpeningHours(String openingHours) { this.openingHours = openingHours; }

    public BigDecimal getRatingAvg() { return ratingAvg; }
    public void setRatingAvg(BigDecimal ratingAvg) { this.ratingAvg = ratingAvg; }

    public Integer getRatingCount() { return ratingCount; }
    public void setRatingCount(Integer ratingCount) { this.ratingCount = ratingCount; }

    public String getTinNumber() { return tinNumber; }
    public void setTinNumber(String tinNumber) { this.tinNumber = tinNumber; }

    public String getProfileType() { return profileType != null && !profileType.isBlank() ? profileType : "BUSINESS"; }
    public void setProfileType(String profileType) { this.profileType = profileType; }

    public boolean isFeatured() { return isFeatured; }
    public void setFeatured(boolean featured) { isFeatured = featured; }

    public String getPayoutBankCode() { return payoutBankCode; }
    public void setPayoutBankCode(String payoutBankCode) { this.payoutBankCode = payoutBankCode; }

    public String getPayoutBankName() { return payoutBankName; }
    public void setPayoutBankName(String payoutBankName) { this.payoutBankName = payoutBankName; }

    public String getPayoutAccountNumber() { return payoutAccountNumber; }
    public void setPayoutAccountNumber(String payoutAccountNumber) { this.payoutAccountNumber = payoutAccountNumber; }

    public String getPayoutAccountName() { return payoutAccountName; }
    public void setPayoutAccountName(String payoutAccountName) { this.payoutAccountName = payoutAccountName; }

    public String getPayoutTelebirrNumber() { return payoutTelebirrNumber; }
    public void setPayoutTelebirrNumber(String payoutTelebirrNumber) { this.payoutTelebirrNumber = payoutTelebirrNumber; }

    public String getPayoAccountHandle() { return payoAccountHandle; }
    public void setPayoAccountHandle(String payoAccountHandle) { this.payoAccountHandle = payoAccountHandle; }

    public String getChapaSubaccountId() { return chapaSubaccountId; }
    public void setChapaSubaccountId(String chapaSubaccountId) { this.chapaSubaccountId = chapaSubaccountId; }

    public String getPreferredPayoutGateway() {
        return preferredPayoutGateway != null && !preferredPayoutGateway.isBlank() ? preferredPayoutGateway : "BOTH";
    }
    public void setPreferredPayoutGateway(String preferredPayoutGateway) { this.preferredPayoutGateway = preferredPayoutGateway; }

    public Instant getCreatedAt() { return createdAt; }
    public void setCreatedAt(Instant createdAt) { this.createdAt = createdAt; }

    public String getOwnerFullName() { return ownerFullName; }
    public void setOwnerFullName(String ownerFullName) { this.ownerFullName = ownerFullName; }
}
