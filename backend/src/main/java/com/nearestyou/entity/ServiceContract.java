package com.nearestyou.entity;

import jakarta.persistence.*;

import java.math.BigDecimal;
import java.time.Instant;

@Entity
@Table(name = "service_contracts", indexes = {
    @Index(name = "idx_contracts_thread", columnList = "thread_key"),
    @Index(name = "idx_contracts_client", columnList = "client_uid"),
    @Index(name = "idx_contracts_provider", columnList = "service_giver_uid"),
    @Index(name = "idx_contracts_business", columnList = "business_id")
})
public class ServiceContract {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(name = "contract_reference", nullable = false, unique = true)
    private String contractReference;

    @Column(name = "thread_key", nullable = false)
    private String threadKey;

    @Column(name = "business_id", nullable = false)
    private Long businessId;

    @Column(name = "listing_id")
    private Long listingId;

    @Column(name = "booking_id")
    private Long bookingId;

    @Column(name = "service_giver_uid", nullable = false)
    private String serviceGiverUid;

    @Column(name = "service_giver_name", nullable = false)
    private String serviceGiverName;

    @Column(name = "client_uid", nullable = false)
    private String clientUid;

    @Column(name = "client_name", nullable = false)
    private String clientName;

    @Column(name = "offered_by_uid", nullable = false)
    private String offeredByUid;

    @Column(name = "offered_by_role", nullable = false)
    private String offeredByRole;

    @Column(name = "contract_type", nullable = false)
    private String contractType = "ONE_TIME_CONTRACT";

    @Column(nullable = false)
    private String title;

    @Column(name = "scope_summary", nullable = false, columnDefinition = "text")
    private String scopeSummary;

    @Column(columnDefinition = "text")
    private String deliverables;

    @Column(name = "payment_schedule", nullable = false)
    private String paymentSchedule = "ON_COMPLETION";

    @Column(name = "agreed_amount", nullable = false, precision = 12, scale = 2)
    private BigDecimal agreedAmount;

    @Column(name = "hourly_rate", precision = 12, scale = 2)
    private BigDecimal hourlyRate;

    @Column(name = "estimated_hours")
    private Integer estimatedHours;

    @Column(name = "start_date")
    private String startDate;

    @Column(name = "end_date")
    private String endDate;

    @Column(nullable = false)
    private String status = "OFFERED";

    @Column(name = "counter_notes", columnDefinition = "text")
    private String counterNotes;

    @Column(name = "accepted_at")
    private Instant acceptedAt;

    @Column(name = "completed_at")
    private Instant completedAt;

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

    public String getContractReference() { return contractReference; }
    public void setContractReference(String contractReference) { this.contractReference = contractReference; }

    public String getThreadKey() { return threadKey; }
    public void setThreadKey(String threadKey) { this.threadKey = threadKey; }

    public Long getBusinessId() { return businessId; }
    public void setBusinessId(Long businessId) { this.businessId = businessId; }

    public Long getListingId() { return listingId; }
    public void setListingId(Long listingId) { this.listingId = listingId; }

    public Long getBookingId() { return bookingId; }
    public void setBookingId(Long bookingId) { this.bookingId = bookingId; }

    public String getServiceGiverUid() { return serviceGiverUid; }
    public void setServiceGiverUid(String serviceGiverUid) { this.serviceGiverUid = serviceGiverUid; }

    public String getServiceGiverName() { return serviceGiverName; }
    public void setServiceGiverName(String serviceGiverName) { this.serviceGiverName = serviceGiverName; }

    public String getClientUid() { return clientUid; }
    public void setClientUid(String clientUid) { this.clientUid = clientUid; }

    public String getClientName() { return clientName; }
    public void setClientName(String clientName) { this.clientName = clientName; }

    public String getOfferedByUid() { return offeredByUid; }
    public void setOfferedByUid(String offeredByUid) { this.offeredByUid = offeredByUid; }

    public String getOfferedByRole() { return offeredByRole; }
    public void setOfferedByRole(String offeredByRole) { this.offeredByRole = offeredByRole; }

    public String getContractType() { return contractType; }
    public void setContractType(String contractType) { this.contractType = contractType; }

    public String getTitle() { return title; }
    public void setTitle(String title) { this.title = title; }

    public String getScopeSummary() { return scopeSummary; }
    public void setScopeSummary(String scopeSummary) { this.scopeSummary = scopeSummary; }

    public String getDeliverables() { return deliverables; }
    public void setDeliverables(String deliverables) { this.deliverables = deliverables; }

    public String getPaymentSchedule() { return paymentSchedule; }
    public void setPaymentSchedule(String paymentSchedule) { this.paymentSchedule = paymentSchedule; }

    public BigDecimal getAgreedAmount() { return agreedAmount; }
    public void setAgreedAmount(BigDecimal agreedAmount) { this.agreedAmount = agreedAmount; }

    public BigDecimal getHourlyRate() { return hourlyRate; }
    public void setHourlyRate(BigDecimal hourlyRate) { this.hourlyRate = hourlyRate; }

    public Integer getEstimatedHours() { return estimatedHours; }
    public void setEstimatedHours(Integer estimatedHours) { this.estimatedHours = estimatedHours; }

    public String getStartDate() { return startDate; }
    public void setStartDate(String startDate) { this.startDate = startDate; }

    public String getEndDate() { return endDate; }
    public void setEndDate(String endDate) { this.endDate = endDate; }

    public String getStatus() { return status; }
    public void setStatus(String status) { this.status = status; }

    public String getCounterNotes() { return counterNotes; }
    public void setCounterNotes(String counterNotes) { this.counterNotes = counterNotes; }

    public Instant getAcceptedAt() { return acceptedAt; }
    public void setAcceptedAt(Instant acceptedAt) { this.acceptedAt = acceptedAt; }

    public Instant getCompletedAt() { return completedAt; }
    public void setCompletedAt(Instant completedAt) { this.completedAt = completedAt; }

    public Instant getCreatedAt() { return createdAt; }
    public void setCreatedAt(Instant createdAt) { this.createdAt = createdAt; }

    public Instant getUpdatedAt() { return updatedAt; }
    public void setUpdatedAt(Instant updatedAt) { this.updatedAt = updatedAt; }
}
