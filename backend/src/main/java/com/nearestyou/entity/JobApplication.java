package com.nearestyou.entity;

import jakarta.persistence.*;
import java.math.BigDecimal;
import java.time.Instant;

@Entity
@Table(name = "job_applications")
public class JobApplication {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(name = "listing_id", nullable = false)
    private Long listingId;

    @Column(name = "business_id", nullable = false)
    private Long businessId;

    @Column(name = "applicant_uid", nullable = false)
    private String applicantUid;

    @Column(name = "applicant_name", nullable = false)
    private String applicantName;

    @Column(name = "applicant_phone", nullable = false)
    private String applicantPhone;

    @Column(nullable = false)
    private String skills;

    @Column(name = "experience_years", nullable = false)
    private Integer experienceYears = 1;

    @Column(name = "expected_compensation", nullable = false, precision = 12, scale = 2)
    private BigDecimal expectedCompensation;

    @Column(name = "cover_letter", nullable = false, columnDefinition = "text")
    private String coverLetter;

    @Column(name = "application_status", nullable = false)
    private String applicationStatus = "SUBMITTED";

    @Column(name = "created_at", nullable = false, updatable = false)
    private Instant createdAt = Instant.now();

    public Long getId() { return id; }
    public void setId(Long id) { this.id = id; }

    public Long getListingId() { return listingId; }
    public void setListingId(Long listingId) { this.listingId = listingId; }

    public Long getBusinessId() { return businessId; }
    public void setBusinessId(Long businessId) { this.businessId = businessId; }

    public String getApplicantUid() { return applicantUid; }
    public void setApplicantUid(String applicantUid) { this.applicantUid = applicantUid; }

    public String getApplicantName() { return applicantName; }
    public void setApplicantName(String applicantName) { this.applicantName = applicantName; }

    public String getApplicantPhone() { return applicantPhone; }
    public void setApplicantPhone(String applicantPhone) { this.applicantPhone = applicantPhone; }

    public String getSkills() { return skills; }
    public void setSkills(String skills) { this.skills = skills; }

    public Integer getExperienceYears() { return experienceYears; }
    public void setExperienceYears(Integer experienceYears) { this.experienceYears = experienceYears; }

    public BigDecimal getExpectedCompensation() { return expectedCompensation; }
    public void setExpectedCompensation(BigDecimal expectedCompensation) { this.expectedCompensation = expectedCompensation; }

    public String getCoverLetter() { return coverLetter; }
    public void setCoverLetter(String coverLetter) { this.coverLetter = coverLetter; }

    public String getApplicationStatus() { return applicationStatus; }
    public void setApplicationStatus(String applicationStatus) { this.applicationStatus = applicationStatus; }

    public Instant getCreatedAt() { return createdAt; }
    public void setCreatedAt(Instant createdAt) { this.createdAt = createdAt; }
}
