package com.nearestyou.entity;

import jakarta.persistence.*;
import java.time.Instant;

@Entity
@Table(name = "messages")
public class Message {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(name = "sender_uid", nullable = false)
    private String senderUid;

    @Column(name = "sender_name", nullable = false)
    private String senderName;

    @Column(name = "business_id", nullable = false)
    private Long businessId;

    @Column(name = "listing_id")
    private Long listingId;

    @Column(nullable = false, columnDefinition = "text")
    private String body;

    @Column(name = "created_at", nullable = false, updatable = false)
    private Instant createdAt = Instant.now();

    public Long getId() { return id; }
    public void setId(Long id) { this.id = id; }

    public String getSenderUid() { return senderUid; }
    public void setSenderUid(String senderUid) { this.senderUid = senderUid; }

    public String getSenderName() { return senderName; }
    public void setSenderName(String senderName) { this.senderName = senderName; }

    public Long getBusinessId() { return businessId; }
    public void setBusinessId(Long businessId) { this.businessId = businessId; }

    public Long getListingId() { return listingId; }
    public void setListingId(Long listingId) { this.listingId = listingId; }

    public String getBody() { return body; }
    public void setBody(String body) { this.body = body; }

    public Instant getCreatedAt() { return createdAt; }
    public void setCreatedAt(Instant createdAt) { this.createdAt = createdAt; }
}
