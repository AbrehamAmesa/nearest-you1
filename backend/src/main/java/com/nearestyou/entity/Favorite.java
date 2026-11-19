package com.nearestyou.entity;

import jakarta.persistence.*;
import java.time.Instant;

@Entity
@Table(name = "favorites")
public class Favorite {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(name = "user_uid", nullable = false)
    private String userUid;

    @Column(name = "listing_id", nullable = false)
    private Long listingId;

    @Column(name = "created_at", nullable = false, updatable = false)
    private Instant createdAt = Instant.now();

    public Long getId() { return id; }
    public void setId(Long id) { this.id = id; }

    public String getUserUid() { return userUid; }
    public void setUserUid(String userUid) { this.userUid = userUid; }

    public Long getListingId() { return listingId; }
    public void setListingId(Long listingId) { this.listingId = listingId; }

    public Instant getCreatedAt() { return createdAt; }
    public void setCreatedAt(Instant createdAt) { this.createdAt = createdAt; }
}
