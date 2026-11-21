package com.nearestyou.entity;

import jakarta.persistence.*;
import java.math.BigDecimal;
import java.time.Instant;

@Entity
@Table(name = "known_locations", indexes = {
        @Index(name = "idx_known_locations_city", columnList = "city"),
        @Index(name = "idx_known_locations_sub_city", columnList = "sub_city")
})
public class KnownLocation {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(nullable = false, unique = true, length = 64)
    private String code;

    @Column(nullable = false, length = 140)
    private String name;

    @Column(name = "name_am", length = 140)
    private String nameAm;

    @Column(nullable = false, length = 80)
    private String city;

    @Column(name = "sub_city", nullable = false, length = 80)
    private String subCity;

    @Column(nullable = false, length = 40)
    private String category = "LANDMARK";

    @Column(nullable = false, precision = 10, scale = 6)
    private BigDecimal latitude;

    @Column(nullable = false, precision = 10, scale = 6)
    private BigDecimal longitude;

    @Column(nullable = false)
    private boolean active = true;

    @Column(name = "created_at", nullable = false, updatable = false)
    private Instant createdAt = Instant.now();

    public Long getId() { return id; }
    public void setId(Long id) { this.id = id; }

    public String getCode() { return code; }
    public void setCode(String code) { this.code = code; }

    public String getName() { return name; }
    public void setName(String name) { this.name = name; }

    public String getNameAm() { return nameAm; }
    public void setNameAm(String nameAm) { this.nameAm = nameAm; }

    public String getCity() { return city; }
    public void setCity(String city) { this.city = city; }

    public String getSubCity() { return subCity; }
    public void setSubCity(String subCity) { this.subCity = subCity; }

    public String getCategory() { return category; }
    public void setCategory(String category) { this.category = category; }

    public BigDecimal getLatitude() { return latitude; }
    public void setLatitude(BigDecimal latitude) { this.latitude = latitude; }

    public BigDecimal getLongitude() { return longitude; }
    public void setLongitude(BigDecimal longitude) { this.longitude = longitude; }

    public boolean isActive() { return active; }
    public void setActive(boolean active) { this.active = active; }

    public Instant getCreatedAt() { return createdAt; }
    public void setCreatedAt(Instant createdAt) { this.createdAt = createdAt; }
}
