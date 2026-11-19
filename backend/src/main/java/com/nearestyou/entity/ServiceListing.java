package com.nearestyou.entity;

import jakarta.persistence.*;
import org.hibernate.annotations.JdbcTypeCode;
import org.hibernate.type.SqlTypes;

import java.math.BigDecimal;
import java.time.Instant;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;

@Entity
@Table(name = "listings", indexes = {
    @Index(name = "idx_listings_business", columnList = "business_id"),
    @Index(name = "idx_listings_category", columnList = "category_id"),
    @Index(name = "idx_listings_status", columnList = "status")
})
public class ServiceListing {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(name = "business_id", nullable = false)
    private Long businessId;

    @Column(name = "category_id", nullable = false)
    private Long categoryId;

    @Column(name = "listing_type", nullable = false)
    private String listingType;

    @Column(nullable = false)
    private String title;

    @Column(nullable = false, columnDefinition = "text")
    private String description;

    @Column(name = "image_url", columnDefinition = "text")
    private String imageUrl;

    @JdbcTypeCode(SqlTypes.JSON)
    @Column(name = "image_urls", columnDefinition = "jsonb")
    private List<String> imageUrls = new ArrayList<>();

    @Column(name = "pricing_model", nullable = false)
    private String pricingModel;

    @Column(name = "pricing_unit", nullable = false)
    private String pricingUnit;

    @Column(name = "base_price", nullable = false, precision = 12, scale = 2)
    private BigDecimal basePrice;

    @Column(name = "discount_price", precision = 12, scale = 2)
    private BigDecimal discountPrice;

    @Column(name = "minimum_charge", precision = 12, scale = 2)
    private BigDecimal minimumCharge;

    @Column(name = "callout_fee", precision = 12, scale = 2)
    private BigDecimal calloutFee;

    @Column(name = "deposit_amount", precision = 12, scale = 2)
    private BigDecimal depositAmount;

    @Column(name = "salary_max", precision = 12, scale = 2)
    private BigDecimal salaryMax;

    @Column(nullable = false)
    private String currency = "ETB";

    @Column(name = "is_quote_based", nullable = false)
    private boolean isQuoteBased = false;

    @Column(name = "is_unpaid", nullable = false)
    private boolean isUnpaid = false;

    @JdbcTypeCode(SqlTypes.JSON)
    @Column(name = "pricing_formula", columnDefinition = "jsonb")
    private Map<String, Object> pricingFormula;

    @JdbcTypeCode(SqlTypes.JSON)
    @Column(columnDefinition = "jsonb")
    private Map<String, Object> metadata;

    @Column(name = "availability_status", nullable = false)
    private String availabilityStatus = "AVAILABLE";

    @Column(nullable = false)
    private String status = "ACTIVE";

    @Column(name = "rating_avg", nullable = false, precision = 3, scale = 2)
    private BigDecimal ratingAvg = new BigDecimal("4.80");

    @Column(name = "rating_count", nullable = false)
    private Integer ratingCount = 0;

    @Column(name = "created_at", nullable = false, updatable = false)
    private Instant createdAt = Instant.now();

    public Long getId() { return id; }
    public void setId(Long id) { this.id = id; }

    public Long getBusinessId() { return businessId; }
    public void setBusinessId(Long businessId) { this.businessId = businessId; }

    public Long getCategoryId() { return categoryId; }
    public void setCategoryId(Long categoryId) { this.categoryId = categoryId; }

    public String getListingType() { return listingType; }
    public void setListingType(String listingType) { this.listingType = listingType; }

    public String getTitle() { return title; }
    public void setTitle(String title) { this.title = title; }

    public String getDescription() { return description; }
    public void setDescription(String description) { this.description = description; }

    public String getImageUrl() { return imageUrl; }
    public void setImageUrl(String imageUrl) { this.imageUrl = imageUrl; }

    public List<String> getImageUrls() { return imageUrls; }
    public void setImageUrls(List<String> imageUrls) { this.imageUrls = imageUrls != null ? imageUrls : new ArrayList<>(); }

    public String getPricingModel() { return pricingModel; }
    public void setPricingModel(String pricingModel) { this.pricingModel = pricingModel; }

    public String getPricingUnit() { return pricingUnit; }
    public void setPricingUnit(String pricingUnit) { this.pricingUnit = pricingUnit; }

    public BigDecimal getBasePrice() { return basePrice; }
    public void setBasePrice(BigDecimal basePrice) { this.basePrice = basePrice; }

    public BigDecimal getDiscountPrice() { return discountPrice; }
    public void setDiscountPrice(BigDecimal discountPrice) { this.discountPrice = discountPrice; }

    public BigDecimal getMinimumCharge() { return minimumCharge; }
    public void setMinimumCharge(BigDecimal minimumCharge) { this.minimumCharge = minimumCharge; }

    public BigDecimal getCalloutFee() { return calloutFee; }
    public void setCalloutFee(BigDecimal calloutFee) { this.calloutFee = calloutFee; }

    public BigDecimal getDepositAmount() { return depositAmount; }
    public void setDepositAmount(BigDecimal depositAmount) { this.depositAmount = depositAmount; }

    public BigDecimal getSalaryMax() { return salaryMax; }
    public void setSalaryMax(BigDecimal salaryMax) { this.salaryMax = salaryMax; }

    public String getCurrency() { return currency; }
    public void setCurrency(String currency) { this.currency = currency; }

    public boolean isQuoteBased() { return isQuoteBased; }
    public void setQuoteBased(boolean quoteBased) { isQuoteBased = quoteBased; }

    public boolean isUnpaid() { return isUnpaid; }
    public void setUnpaid(boolean unpaid) { isUnpaid = unpaid; }

    public Map<String, Object> getPricingFormula() { return pricingFormula; }
    public void setPricingFormula(Map<String, Object> pricingFormula) { this.pricingFormula = pricingFormula; }

    public Map<String, Object> getMetadata() { return metadata; }
    public void setMetadata(Map<String, Object> metadata) { this.metadata = metadata; }

    public String getAvailabilityStatus() { return availabilityStatus; }
    public void setAvailabilityStatus(String availabilityStatus) { this.availabilityStatus = availabilityStatus; }

    public String getStatus() { return status; }
    public void setStatus(String status) { this.status = status; }

    public BigDecimal getRatingAvg() { return ratingAvg; }
    public void setRatingAvg(BigDecimal ratingAvg) { this.ratingAvg = ratingAvg; }

    public Integer getRatingCount() { return ratingCount; }
    public void setRatingCount(Integer ratingCount) { this.ratingCount = ratingCount; }

    public Instant getCreatedAt() { return createdAt; }
    public void setCreatedAt(Instant createdAt) { this.createdAt = createdAt; }
}
