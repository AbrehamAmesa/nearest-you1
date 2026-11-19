package com.nearestyou.entity;

import jakarta.persistence.*;
import org.hibernate.annotations.JdbcTypeCode;
import org.hibernate.type.SqlTypes;

import java.math.BigDecimal;
import java.time.Instant;
import java.util.ArrayList;
import java.util.List;

@Entity
@Table(name = "provider_registrations")
public class ProviderRegistration {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(name = "user_uid", nullable = false)
    private String userUid;

    @Column(name = "full_name", nullable = false)
    private String fullName;

    @Column(name = "phone_number", nullable = false)
    private String phoneNumber;

    @Column(name = "service_category_id", nullable = false)
    private Long serviceCategoryId;

    @Column(name = "fayda_id_number", nullable = false)
    private String faydaIdNumber;

    @Column(name = "fayda_front_image", nullable = false, columnDefinition = "text")
    private String faydaFrontImage;

    @Column(name = "profile_photo_image", nullable = false, columnDefinition = "text")
    private String profilePhotoImage;

    @Column(name = "liveness_passed", nullable = false)
    private boolean livenessPassed = false;

    @Column(name = "liveness_score", nullable = false)
    private Integer livenessScore = 0;

    @JdbcTypeCode(SqlTypes.JSON)
    @Column(name = "liveness_challenges", columnDefinition = "jsonb", nullable = false)
    private List<String> livenessChallenges = new ArrayList<>();

    @Column(name = "liveness_selfie_image", nullable = false, columnDefinition = "text")
    private String livenessSelfieImage;

    @Column(name = "sub_city", nullable = false)
    private String subCity;

    @Column(nullable = false)
    private String landmark;

    @Column(nullable = false, precision = 10, scale = 6)
    private BigDecimal latitude;

    @Column(nullable = false, precision = 10, scale = 6)
    private BigDecimal longitude;

    @Column(name = "is_live_location_active", nullable = false)
    private boolean isLiveLocationActive = true;

    @Column(name = "last_location_updated_at", nullable = false)
    private Instant lastLocationUpdatedAt = Instant.now();

    @Column(nullable = false)
    private String status = "PENDING_PEER_AUTH";

    @Column(name = "qr_voucher_token")
    private String qrVoucherToken;

    @Column(name = "qr_expires_at")
    private Instant qrExpiresAt;

    @Column(name = "vouched_by_uid")
    private String vouchedByUid;

    @Column(name = "vouched_by_name")
    private String vouchedByName;

    @Column(name = "vouched_by_email")
    private String vouchedByEmail;

    @Column(name = "vouched_at")
    private Instant vouchedAt;

    @Column(name = "approved_by_uid")
    private String approvedByUid;

    @Column(name = "approved_by_role")
    private String approvedByRole;

    @Column(name = "review_notes", columnDefinition = "text")
    private String reviewNotes;

    @Column(name = "reviewed_by_uid")
    private String reviewedByUid;

    @Column(name = "created_at", nullable = false, updatable = false)
    private Instant createdAt = Instant.now();

    @Column(name = "updated_at", nullable = false)
    private Instant updatedAt = Instant.now();

    @PreUpdate
    public void onUpdate() {
        this.updatedAt = Instant.now();
    }

    public Long getId() { return id; }
    public void setId(Long id) { this.id = id; }

    public String getUserUid() { return userUid; }
    public void setUserUid(String userUid) { this.userUid = userUid; }

    public String getFullName() { return fullName; }
    public void setFullName(String fullName) { this.fullName = fullName; }

    public String getPhoneNumber() { return phoneNumber; }
    public void setPhoneNumber(String phoneNumber) { this.phoneNumber = phoneNumber; }

    public Long getServiceCategoryId() { return serviceCategoryId; }
    public void setServiceCategoryId(Long serviceCategoryId) { this.serviceCategoryId = serviceCategoryId; }

    public String getFaydaIdNumber() { return faydaIdNumber; }
    public void setFaydaIdNumber(String faydaIdNumber) { this.faydaIdNumber = faydaIdNumber; }

    public String getFaydaFrontImage() { return faydaFrontImage; }
    public void setFaydaFrontImage(String faydaFrontImage) { this.faydaFrontImage = faydaFrontImage; }

    public String getProfilePhotoImage() { return profilePhotoImage; }
    public void setProfilePhotoImage(String profilePhotoImage) { this.profilePhotoImage = profilePhotoImage; }

    public boolean isLivenessPassed() { return livenessPassed; }
    public void setLivenessPassed(boolean livenessPassed) { this.livenessPassed = livenessPassed; }

    public Integer getLivenessScore() { return livenessScore; }
    public void setLivenessScore(Integer livenessScore) { this.livenessScore = livenessScore; }

    public List<String> getLivenessChallenges() { return livenessChallenges; }
    public void setLivenessChallenges(List<String> livenessChallenges) { this.livenessChallenges = livenessChallenges; }

    public String getLivenessSelfieImage() { return livenessSelfieImage; }
    public void setLivenessSelfieImage(String livenessSelfieImage) { this.livenessSelfieImage = livenessSelfieImage; }

    public String getSubCity() { return subCity; }
    public void setSubCity(String subCity) { this.subCity = subCity; }

    public String getLandmark() { return landmark; }
    public void setLandmark(String landmark) { this.landmark = landmark; }

    public BigDecimal getLatitude() { return latitude; }
    public void setLatitude(BigDecimal latitude) { this.latitude = latitude; }

    public BigDecimal getLongitude() { return longitude; }
    public void setLongitude(BigDecimal longitude) { this.longitude = longitude; }

    public boolean isLiveLocationActive() { return isLiveLocationActive; }
    public void setLiveLocationActive(boolean liveLocationActive) { isLiveLocationActive = liveLocationActive; }

    public Instant getLastLocationUpdatedAt() { return lastLocationUpdatedAt; }
    public void setLastLocationUpdatedAt(Instant lastLocationUpdatedAt) { this.lastLocationUpdatedAt = lastLocationUpdatedAt; }

    public String getStatus() { return status; }
    public void setStatus(String status) { this.status = status; }

    public String getQrVoucherToken() { return qrVoucherToken; }
    public void setQrVoucherToken(String qrVoucherToken) { this.qrVoucherToken = qrVoucherToken; }

    public Instant getQrExpiresAt() { return qrExpiresAt; }
    public void setQrExpiresAt(Instant qrExpiresAt) { this.qrExpiresAt = qrExpiresAt; }

    public String getVouchedByUid() { return vouchedByUid; }
    public void setVouchedByUid(String vouchedByUid) { this.vouchedByUid = vouchedByUid; }

    public String getVouchedByName() { return vouchedByName; }
    public void setVouchedByName(String vouchedByName) { this.vouchedByName = vouchedByName; }

    public String getVouchedByEmail() { return vouchedByEmail; }
    public void setVouchedByEmail(String vouchedByEmail) { this.vouchedByEmail = vouchedByEmail; }

    public Instant getVouchedAt() { return vouchedAt; }
    public void setVouchedAt(Instant vouchedAt) { this.vouchedAt = vouchedAt; }

    public String getApprovedByUid() { return approvedByUid; }
    public void setApprovedByUid(String approvedByUid) { this.approvedByUid = approvedByUid; }

    public String getApprovedByRole() { return approvedByRole; }
    public void setApprovedByRole(String approvedByRole) { this.approvedByRole = approvedByRole; }

    public String getReviewNotes() { return reviewNotes; }
    public void setReviewNotes(String reviewNotes) { this.reviewNotes = reviewNotes; }

    public String getReviewedByUid() { return reviewedByUid; }
    public void setReviewedByUid(String reviewedByUid) { this.reviewedByUid = reviewedByUid; }

    public Instant getCreatedAt() { return createdAt; }
    public void setCreatedAt(Instant createdAt) { this.createdAt = createdAt; }

    public Instant getUpdatedAt() { return updatedAt; }
    public void setUpdatedAt(Instant updatedAt) { this.updatedAt = updatedAt; }
}
