package com.nearestyou.entity;

import jakarta.persistence.*;
import java.time.Instant;

@Entity
@Table(name = "reviews")
public class Review {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(name = "customer_uid", nullable = false)
    private String customerUid;

    @Column(name = "customer_name", nullable = false)
    private String customerName;

    @Column(name = "business_id", nullable = false)
    private Long businessId;

    @Column(name = "listing_id")
    private Long listingId;

    @Column(name = "transaction_ref", nullable = false)
    private String transactionRef;

    @Column(nullable = false)
    private Integer rating;

    @Column(nullable = false, columnDefinition = "text")
    private String comment;

    @Column(name = "created_at", nullable = false, updatable = false)
    private Instant createdAt = Instant.now();

    public Long getId() { return id; }
    public void setId(Long id) { this.id = id; }

    public String getCustomerUid() { return customerUid; }
    public void setCustomerUid(String customerUid) { this.customerUid = customerUid; }

    public String getCustomerName() { return customerName; }
    public void setCustomerName(String customerName) { this.customerName = customerName; }

    public Long getBusinessId() { return businessId; }
    public void setBusinessId(Long businessId) { this.businessId = businessId; }

    public Long getListingId() { return listingId; }
    public void setListingId(Long listingId) { this.listingId = listingId; }

    public String getTransactionRef() { return transactionRef; }
    public void setTransactionRef(String transactionRef) { this.transactionRef = transactionRef; }

    public Integer getRating() { return rating; }
    public void setRating(Integer rating) { this.rating = rating; }

    public String getComment() { return comment; }
    public void setComment(String comment) { this.comment = comment; }

    public Instant getCreatedAt() { return createdAt; }
    public void setCreatedAt(Instant createdAt) { this.createdAt = createdAt; }
}
