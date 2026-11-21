package com.nearestyou.entity;

import com.fasterxml.jackson.annotation.JsonIgnore;
import com.fasterxml.jackson.annotation.JsonProperty;
import jakarta.persistence.*;
import org.hibernate.annotations.JdbcTypeCode;
import org.hibernate.type.SqlTypes;

import java.math.BigDecimal;
import java.time.Instant;
import java.util.ArrayList;
import java.util.List;

@Entity
@Table(name = "users", indexes = {
    @Index(name = "idx_users_uid", columnList = "uid", unique = true),
    @Index(name = "idx_users_firebase_uid", columnList = "firebase_uid"),
    @Index(name = "idx_users_email", columnList = "email")
})
public class UserAccount {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(nullable = false, unique = true)
    private String uid;

    @Column(name = "firebase_uid")
    private String firebaseUid;

    @JsonIgnore
    @Column(name = "password_hash")
    private String passwordHash;

    @Column(name = "full_name", nullable = false)
    private String fullName;

    @Column(nullable = false)
    private String email;

    @Column(name = "phone_number")
    private String phoneNumber;

    @Column(name = "preferred_language", nullable = false)
    private String preferredLanguage = "en";

    @Column(name = "default_sub_city", nullable = false)
    private String defaultSubCity = "Bole";

    @Column(name = "default_lat", nullable = false, precision = 10, scale = 6)
    private BigDecimal defaultLat = new BigDecimal("8.997400");

    @Column(name = "default_lng", nullable = false, precision = 10, scale = 6)
    private BigDecimal defaultLng = new BigDecimal("38.786800");

    @JdbcTypeCode(SqlTypes.JSON)
    @Column(columnDefinition = "jsonb", nullable = false)
    private List<String> roles = new ArrayList<>(List.of("CUSTOMER"));

    @Column(name = "is_admin", nullable = false)
    private boolean isAdmin = false;

    @Column(name = "can_vouch_early", nullable = false)
    private boolean canVouchEarly = false;

    @Column(name = "fayda_id_number")
    private String faydaIdNumber;

    @Column(name = "fayda_document_url", columnDefinition = "text")
    private String faydaDocumentUrl;

    @Column(name = "profile_photo_url", columnDefinition = "text")
    private String profilePhotoUrl;

    @Column(name = "liveness_status", nullable = false)
    private String livenessStatus = "NOT_STARTED";

    @Column(name = "liveness_verified_at")
    private Instant livenessVerifiedAt;

    @Column(name = "provider_verification_status", nullable = false)
    private String providerVerificationStatus = "UNREGISTERED";

    @Column(name = "account_status", nullable = false)
    private String accountStatus = "ACTIVE";

    @Column(name = "last_seen_at")
    private Instant lastSeenAt = Instant.now();

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

    @Column(name = "updated_at", nullable = false)
    private Instant updatedAt = Instant.now();

    @PreUpdate
    public void onUpdate() {
        this.updatedAt = Instant.now();
    }

    public Long getId() { return id; }
    public void setId(Long id) { this.id = id; }

    public String getUid() { return uid; }
    public void setUid(String uid) { this.uid = uid; }

    public String getFirebaseUid() { return firebaseUid; }
    public void setFirebaseUid(String firebaseUid) { this.firebaseUid = firebaseUid; }

    public String getPasswordHash() { return passwordHash; }
    public void setPasswordHash(String passwordHash) { this.passwordHash = passwordHash; }

    @JsonProperty("hasPassword")
    public boolean isHasPassword() {
        return passwordHash != null && !passwordHash.isBlank();
    }

    public String getFullName() { return fullName; }
    public void setFullName(String fullName) { this.fullName = fullName; }

    public String getEmail() { return email; }
    public void setEmail(String email) { this.email = email; }

    public String getPhoneNumber() { return phoneNumber; }
    public void setPhoneNumber(String phoneNumber) { this.phoneNumber = phoneNumber; }

    public String getPreferredLanguage() { return preferredLanguage; }
    public void setPreferredLanguage(String preferredLanguage) { this.preferredLanguage = preferredLanguage; }

    public String getDefaultSubCity() { return defaultSubCity; }
    public void setDefaultSubCity(String defaultSubCity) { this.defaultSubCity = defaultSubCity; }

    public BigDecimal getDefaultLat() { return defaultLat; }
    public void setDefaultLat(BigDecimal defaultLat) { this.defaultLat = defaultLat; }

    public BigDecimal getDefaultLng() { return defaultLng; }
    public void setDefaultLng(BigDecimal defaultLng) { this.defaultLng = defaultLng; }

    public List<String> getRoles() { return roles; }
    public void setRoles(List<String> roles) { this.roles = roles; }

    public boolean isAdmin() { return isAdmin; }
    public void setAdmin(boolean admin) { isAdmin = admin; }

    public boolean isCanVouchEarly() { return canVouchEarly; }
    public void setCanVouchEarly(boolean canVouchEarly) { this.canVouchEarly = canVouchEarly; }

    public String getFaydaIdNumber() { return faydaIdNumber; }
    public void setFaydaIdNumber(String faydaIdNumber) { this.faydaIdNumber = faydaIdNumber; }

    public String getFaydaDocumentUrl() { return faydaDocumentUrl; }
    public void setFaydaDocumentUrl(String faydaDocumentUrl) { this.faydaDocumentUrl = faydaDocumentUrl; }

    public String getProfilePhotoUrl() { return profilePhotoUrl; }
    public void setProfilePhotoUrl(String profilePhotoUrl) { this.profilePhotoUrl = profilePhotoUrl; }

    public String getLivenessStatus() { return livenessStatus; }
    public void setLivenessStatus(String livenessStatus) { this.livenessStatus = livenessStatus; }

    public Instant getLivenessVerifiedAt() { return livenessVerifiedAt; }
    public void setLivenessVerifiedAt(Instant livenessVerifiedAt) { this.livenessVerifiedAt = livenessVerifiedAt; }

    public String getProviderVerificationStatus() { return providerVerificationStatus; }
    public void setProviderVerificationStatus(String providerVerificationStatus) { this.providerVerificationStatus = providerVerificationStatus; }

    public String getAccountStatus() { return accountStatus; }
    public void setAccountStatus(String accountStatus) { this.accountStatus = accountStatus; }

    public Instant getLastSeenAt() { return lastSeenAt; }
    public void setLastSeenAt(Instant lastSeenAt) { this.lastSeenAt = lastSeenAt; }

    @JsonProperty("isActiveLastMinute")
    public boolean isActiveLastMinute() {
        if (lastSeenAt == null) return false;
        long diffSeconds = java.time.Duration.between(lastSeenAt, Instant.now()).getSeconds();
        return diffSeconds >= -5 && diffSeconds <= 60;
    }

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

    public Instant getUpdatedAt() { return updatedAt; }
    public void setUpdatedAt(Instant updatedAt) { this.updatedAt = updatedAt; }
}
