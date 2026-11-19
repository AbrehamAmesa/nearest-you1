package com.nearestyou.entity;

import jakarta.persistence.*;
import java.math.BigDecimal;

@Entity
@Table(name = "categories")
public class ServiceCategory {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(nullable = false, unique = true)
    private String slug;

    @Column(name = "parent_id")
    private Long parentId;

    @Column(nullable = false)
    private String name;

    @Column(name = "name_am", nullable = false)
    private String nameAm;

    @Column(name = "name_om")
    private String nameOm;

    @Column(nullable = false, columnDefinition = "text")
    private String description;

    @Column(name = "category_type", nullable = false)
    private String categoryType;

    @Column(name = "default_listing_type")
    private String defaultListingType = "SERVICE";

    @Column(name = "requires_verification", nullable = false)
    private boolean requiresVerification = false;

    @Column(name = "commission_rate", nullable = false, precision = 5, scale = 2)
    private BigDecimal commissionRate = new BigDecimal("10.00");

    @Column(name = "min_price_etb", nullable = false, precision = 12, scale = 2)
    private BigDecimal minPriceEtb = new BigDecimal("50.00");

    @Column(nullable = false)
    private String status = "ACTIVE";

    @Column(name = "display_order", nullable = false)
    private Integer displayOrder = 1;

    public Long getId() { return id; }
    public void setId(Long id) { this.id = id; }

    public String getSlug() { return slug; }
    public void setSlug(String slug) { this.slug = slug; }

    public Long getParentId() { return parentId; }
    public void setParentId(Long parentId) { this.parentId = parentId; }

    public String getName() { return name; }
    public void setName(String name) { this.name = name; }

    public String getNameAm() { return nameAm; }
    public void setNameAm(String nameAm) { this.nameAm = nameAm; }

    public String getNameOm() { return nameOm; }
    public void setNameOm(String nameOm) { this.nameOm = nameOm; }

    public String getDescription() { return description; }
    public void setDescription(String description) { this.description = description; }

    public String getCategoryType() { return categoryType; }
    public void setCategoryType(String categoryType) { this.categoryType = categoryType; }

    public String getDefaultListingType() { return defaultListingType; }
    public void setDefaultListingType(String defaultListingType) { this.defaultListingType = defaultListingType; }

    public boolean isRequiresVerification() { return requiresVerification; }
    public void setRequiresVerification(boolean requiresVerification) { this.requiresVerification = requiresVerification; }

    public BigDecimal getCommissionRate() { return commissionRate; }
    public void setCommissionRate(BigDecimal commissionRate) { this.commissionRate = commissionRate; }

    public BigDecimal getMinPriceEtb() { return minPriceEtb; }
    public void setMinPriceEtb(BigDecimal minPriceEtb) { this.minPriceEtb = minPriceEtb; }

    public String getStatus() { return status; }
    public void setStatus(String status) { this.status = status; }

    public Integer getDisplayOrder() { return displayOrder; }
    public void setDisplayOrder(Integer displayOrder) { this.displayOrder = displayOrder; }
}
