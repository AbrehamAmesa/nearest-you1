package com.nearestyou.entity;

import jakarta.persistence.*;
import org.hibernate.annotations.JdbcTypeCode;
import org.hibernate.type.SqlTypes;

import java.math.BigDecimal;
import java.time.Instant;
import java.util.List;
import java.util.Map;

@Entity
@Table(name = "bookings", indexes = {
    @Index(name = "idx_bookings_customer", columnList = "customer_uid"),
    @Index(name = "idx_bookings_business", columnList = "business_id"),
    @Index(name = "idx_bookings_listing", columnList = "listing_id")
})
public class Booking {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(name = "booking_reference", nullable = false, unique = true)
    private String bookingReference;

    @Column(name = "customer_uid", nullable = false)
    private String customerUid;

    @Column(name = "customer_name", nullable = false)
    private String customerName;

    @Column(name = "business_id", nullable = false)
    private Long businessId;

    @Column(name = "listing_id", nullable = false)
    private Long listingId;

    @Column(name = "booking_type", nullable = false)
    private String bookingType;

    @Column(name = "scheduled_date", nullable = false)
    private String scheduledDate;

    @Column(name = "end_date")
    private String endDate;

    @Column(name = "scheduled_time", nullable = false)
    private String scheduledTime = "09:00";

    @JdbcTypeCode(SqlTypes.JSON)
    @Column(columnDefinition = "jsonb")
    private Map<String, Object> parameters;

    @JdbcTypeCode(SqlTypes.JSON)
    @Column(name = "price_breakdown", columnDefinition = "jsonb", nullable = false)
    private List<Map<String, Object>> priceBreakdown;

    @Column(name = "agreed_price", nullable = false, precision = 12, scale = 2)
    private BigDecimal agreedPrice;

    @Column(name = "deposit_amount", nullable = false, precision = 12, scale = 2)
    private BigDecimal depositAmount = BigDecimal.ZERO;

    @Column(name = "quoted_price", precision = 12, scale = 2)
    private BigDecimal quotedPrice;

    @Column(name = "quote_approved", nullable = false)
    private boolean quoteApproved = true;

    @Column(nullable = false)
    private String currency = "ETB";

    @Column(name = "payment_method", nullable = false)
    private String paymentMethod = "TELEBIRR";

    @Column(name = "payment_status", nullable = false)
    private String paymentStatus = "PENDING";

    @Column(name = "booking_status", nullable = false)
    private String bookingStatus = "PENDING";

    @Column(columnDefinition = "text")
    private String notes;

    @Column(name = "created_at", nullable = false, updatable = false)
    private Instant createdAt = Instant.now();

    public Long getId() { return id; }
    public void setId(Long id) { this.id = id; }

    public String getBookingReference() { return bookingReference; }
    public void setBookingReference(String bookingReference) { this.bookingReference = bookingReference; }

    public String getCustomerUid() { return customerUid; }
    public void setCustomerUid(String customerUid) { this.customerUid = customerUid; }

    public String getCustomerName() { return customerName; }
    public void setCustomerName(String customerName) { this.customerName = customerName; }

    public Long getBusinessId() { return businessId; }
    public void setBusinessId(Long businessId) { this.businessId = businessId; }

    public Long getListingId() { return listingId; }
    public void setListingId(Long listingId) { this.listingId = listingId; }

    public String getBookingType() { return bookingType; }
    public void setBookingType(String bookingType) { this.bookingType = bookingType; }

    public String getScheduledDate() { return scheduledDate; }
    public void setScheduledDate(String scheduledDate) { this.scheduledDate = scheduledDate; }

    public String getEndDate() { return endDate; }
    public void setEndDate(String endDate) { this.endDate = endDate; }

    public String getScheduledTime() { return scheduledTime; }
    public void setScheduledTime(String scheduledTime) { this.scheduledTime = scheduledTime; }

    public Map<String, Object> getParameters() { return parameters; }
    public void setParameters(Map<String, Object> parameters) { this.parameters = parameters; }

    public List<Map<String, Object>> getPriceBreakdown() { return priceBreakdown; }
    public void setPriceBreakdown(List<Map<String, Object>> priceBreakdown) { this.priceBreakdown = priceBreakdown; }

    public BigDecimal getAgreedPrice() { return agreedPrice; }
    public void setAgreedPrice(BigDecimal agreedPrice) { this.agreedPrice = agreedPrice; }

    public BigDecimal getDepositAmount() { return depositAmount; }
    public void setDepositAmount(BigDecimal depositAmount) { this.depositAmount = depositAmount; }

    public BigDecimal getQuotedPrice() { return quotedPrice; }
    public void setQuotedPrice(BigDecimal quotedPrice) { this.quotedPrice = quotedPrice; }

    public boolean isQuoteApproved() { return quoteApproved; }
    public void setQuoteApproved(boolean quoteApproved) { this.quoteApproved = quoteApproved; }

    public String getCurrency() { return currency; }
    public void setCurrency(String currency) { this.currency = currency; }

    public String getPaymentMethod() { return paymentMethod; }
    public void setPaymentMethod(String paymentMethod) { this.paymentMethod = paymentMethod; }

    public String getPaymentStatus() { return paymentStatus; }
    public void setPaymentStatus(String paymentStatus) { this.paymentStatus = paymentStatus; }

    public String getBookingStatus() { return bookingStatus; }
    public void setBookingStatus(String bookingStatus) { this.bookingStatus = bookingStatus; }

    public String getNotes() { return notes; }
    public void setNotes(String notes) { this.notes = notes; }

    public Instant getCreatedAt() { return createdAt; }
    public void setCreatedAt(Instant createdAt) { this.createdAt = createdAt; }
}
