package com.nearestyou.entity;

import jakarta.persistence.*;
import java.time.Instant;

@Entity
@Table(name = "messages", indexes = {
    @Index(name = "idx_messages_thread", columnList = "thread_key"),
    @Index(name = "idx_messages_order", columnList = "order_id"),
    @Index(name = "idx_messages_business", columnList = "business_id")
})
public class Message {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(name = "sender_uid", nullable = false)
    private String senderUid;

    @Column(name = "sender_name", nullable = false)
    private String senderName;

    @Column(name = "sender_role")
    private String senderRole;

    @Column(name = "recipient_uid")
    private String recipientUid;

    @Column(name = "business_id", nullable = false)
    private Long businessId;

    @Column(name = "listing_id")
    private Long listingId;

    @Column(name = "order_id")
    private Long orderId;

    @Column(name = "booking_id")
    private Long bookingId;

    @Column(name = "thread_key")
    private String threadKey;

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

    public String getSenderRole() { return senderRole; }
    public void setSenderRole(String senderRole) { this.senderRole = senderRole; }

    public String getRecipientUid() { return recipientUid; }
    public void setRecipientUid(String recipientUid) { this.recipientUid = recipientUid; }

    public Long getBusinessId() { return businessId; }
    public void setBusinessId(Long businessId) { this.businessId = businessId; }

    public Long getListingId() { return listingId; }
    public void setListingId(Long listingId) { this.listingId = listingId; }

    public Long getOrderId() { return orderId; }
    public void setOrderId(Long orderId) { this.orderId = orderId; }

    public Long getBookingId() { return bookingId; }
    public void setBookingId(Long bookingId) { this.bookingId = bookingId; }

    public String getThreadKey() { return threadKey; }
    public void setThreadKey(String threadKey) { this.threadKey = threadKey; }

    public String getBody() { return body; }
    public void setBody(String body) { this.body = body; }

    public Instant getCreatedAt() { return createdAt; }
    public void setCreatedAt(Instant createdAt) { this.createdAt = createdAt; }
}
