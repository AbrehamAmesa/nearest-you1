package com.nearestyou.entity;

import jakarta.persistence.*;
import org.hibernate.annotations.JdbcTypeCode;
import org.hibernate.type.SqlTypes;

import java.math.BigDecimal;
import java.time.Instant;
import java.util.List;
import java.util.Map;

@Entity
@Table(name = "deliveries", indexes = {
    @Index(name = "idx_deliveries_customer", columnList = "customer_uid"),
    @Index(name = "idx_deliveries_driver", columnList = "driver_uid")
})
public class DeliveryRequest {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(name = "tracking_code", nullable = false, unique = true)
    private String trackingCode;

    @Column(name = "request_type", nullable = false)
    private String requestType = "DELIVERY";

    @Column(name = "customer_uid", nullable = false)
    private String customerUid;

    @Column(name = "customer_name", nullable = false)
    private String customerName;

    @Column(name = "driver_uid")
    private String driverUid;

    @Column(name = "driver_name")
    private String driverName;

    @Column(name = "pickup_location", nullable = false)
    private String pickupLocation;

    @Column(name = "pickup_lat", precision = 10, scale = 6)
    private BigDecimal pickupLat;

    @Column(name = "pickup_lng", precision = 10, scale = 6)
    private BigDecimal pickupLng;

    @Column(name = "pickup_place_id")
    private String pickupPlaceId;

    @Column(name = "destination_location", nullable = false)
    private String destinationLocation;

    @Column(name = "destination_lat", precision = 10, scale = 6)
    private BigDecimal destinationLat;

    @Column(name = "destination_lng", precision = 10, scale = 6)
    private BigDecimal destinationLng;

    @Column(name = "destination_place_id")
    private String destinationPlaceId;

    @Column(name = "package_or_ride_details", nullable = false, columnDefinition = "text")
    private String packageOrRideDetails;

    @Column(name = "receiver_name")
    private String receiverName;

    @Column(name = "receiver_phone")
    private String receiverPhone;

    @Column(name = "declared_value", nullable = false, precision = 12, scale = 2)
    private BigDecimal declaredValue = BigDecimal.ZERO;

    @Column(name = "vehicle_type", nullable = false)
    private String vehicleType;

    @Column(nullable = false)
    private String urgency = "STANDARD";

    @Column(name = "distance_km", nullable = false, precision = 8, scale = 2)
    private BigDecimal distanceKm;

    @JdbcTypeCode(SqlTypes.JSON)
    @Column(name = "price_breakdown", columnDefinition = "jsonb", nullable = false)
    private List<Map<String, Object>> priceBreakdown;

    @Column(name = "tax_amount", nullable = false, precision = 12, scale = 2)
    private BigDecimal taxAmount = BigDecimal.ZERO;

    @Column(name = "total_fee", nullable = false, precision = 12, scale = 2)
    private BigDecimal totalFee;

    @Column(nullable = false)
    private String currency = "ETB";

    @Column(name = "payment_method", nullable = false)
    private String paymentMethod = "TELEBIRR";

    @Column(name = "pickup_otp")
    private String pickupOtp;

    @Column(name = "delivery_otp")
    private String deliveryOtp;

    @Column(name = "escrow_status", nullable = false)
    private String escrowStatus = "HELD_IN_ESCROW";

    @Column(name = "escrow_amount", nullable = false, precision = 12, scale = 2)
    private BigDecimal escrowAmount = BigDecimal.ZERO;

    @Column(name = "pickup_confirmed_at")
    private Instant pickupConfirmedAt;

    @Column(name = "delivered_confirmed_at")
    private Instant deliveredConfirmedAt;

    @Column(name = "driver_lat", precision = 10, scale = 6)
    private BigDecimal driverLat;

    @Column(name = "driver_lng", precision = 10, scale = 6)
    private BigDecimal driverLng;

    @Column(name = "driver_location_updated_at")
    private Instant driverLocationUpdatedAt;

    @Column(name = "dispute_reason", columnDefinition = "text")
    private String disputeReason;

    @Column(name = "conflict_status", nullable = false)
    private String conflictStatus = "NONE";

    @Column(name = "conflict_category")
    private String conflictCategory;

    @Column(name = "conflict_raised_by_uid")
    private String conflictRaisedByUid;

    @Column(name = "conflict_raised_by_role")
    private String conflictRaisedByRole;

    @Column(name = "conflict_counter_statement", columnDefinition = "text")
    private String conflictCounterStatement;

    @Column(name = "conflict_resolution")
    private String conflictResolution;

    @Column(name = "conflict_resolved_at")
    private Instant conflictResolvedAt;

    @Column(nullable = false)
    private String status = "REQUESTED";

    @Column(name = "created_at", nullable = false, updatable = false)
    private Instant createdAt = Instant.now();

    public Long getId() { return id; }
    public void setId(Long id) { this.id = id; }

    public String getTrackingCode() { return trackingCode; }
    public void setTrackingCode(String trackingCode) { this.trackingCode = trackingCode; }

    public String getRequestType() { return requestType; }
    public void setRequestType(String requestType) { this.requestType = requestType; }

    public String getCustomerUid() { return customerUid; }
    public void setCustomerUid(String customerUid) { this.customerUid = customerUid; }

    public String getCustomerName() { return customerName; }
    public void setCustomerName(String customerName) { this.customerName = customerName; }

    public String getDriverUid() { return driverUid; }
    public void setDriverUid(String driverUid) { this.driverUid = driverUid; }

    public String getDriverName() { return driverName; }
    public void setDriverName(String driverName) { this.driverName = driverName; }

    public String getPickupLocation() { return pickupLocation; }
    public void setPickupLocation(String pickupLocation) { this.pickupLocation = pickupLocation; }

    public BigDecimal getPickupLat() { return pickupLat; }
    public void setPickupLat(BigDecimal pickupLat) { this.pickupLat = pickupLat; }

    public BigDecimal getPickupLng() { return pickupLng; }
    public void setPickupLng(BigDecimal pickupLng) { this.pickupLng = pickupLng; }

    public String getPickupPlaceId() { return pickupPlaceId; }
    public void setPickupPlaceId(String pickupPlaceId) { this.pickupPlaceId = pickupPlaceId; }

    public String getDestinationLocation() { return destinationLocation; }
    public void setDestinationLocation(String destinationLocation) { this.destinationLocation = destinationLocation; }

    public BigDecimal getDestinationLat() { return destinationLat; }
    public void setDestinationLat(BigDecimal destinationLat) { this.destinationLat = destinationLat; }

    public BigDecimal getDestinationLng() { return destinationLng; }
    public void setDestinationLng(BigDecimal destinationLng) { this.destinationLng = destinationLng; }

    public String getDestinationPlaceId() { return destinationPlaceId; }
    public void setDestinationPlaceId(String destinationPlaceId) { this.destinationPlaceId = destinationPlaceId; }

    public String getPackageOrRideDetails() { return packageOrRideDetails; }
    public void setPackageOrRideDetails(String packageOrRideDetails) { this.packageOrRideDetails = packageOrRideDetails; }

    public String getReceiverName() { return receiverName; }
    public void setReceiverName(String receiverName) { this.receiverName = receiverName; }

    public String getReceiverPhone() { return receiverPhone; }
    public void setReceiverPhone(String receiverPhone) { this.receiverPhone = receiverPhone; }

    public BigDecimal getDeclaredValue() { return declaredValue; }
    public void setDeclaredValue(BigDecimal declaredValue) { this.declaredValue = declaredValue; }

    public String getVehicleType() { return vehicleType; }
    public void setVehicleType(String vehicleType) { this.vehicleType = vehicleType; }

    public String getUrgency() { return urgency; }
    public void setUrgency(String urgency) { this.urgency = urgency; }

    public BigDecimal getDistanceKm() { return distanceKm; }
    public void setDistanceKm(BigDecimal distanceKm) { this.distanceKm = distanceKm; }

    public List<Map<String, Object>> getPriceBreakdown() { return priceBreakdown; }
    public void setPriceBreakdown(List<Map<String, Object>> priceBreakdown) { this.priceBreakdown = priceBreakdown; }

    public BigDecimal getTaxAmount() { return taxAmount; }
    public void setTaxAmount(BigDecimal taxAmount) { this.taxAmount = taxAmount; }

    public BigDecimal getTotalFee() { return totalFee; }
    public void setTotalFee(BigDecimal totalFee) { this.totalFee = totalFee; }

    public String getCurrency() { return currency; }
    public void setCurrency(String currency) { this.currency = currency; }

    public String getPaymentMethod() { return paymentMethod; }
    public void setPaymentMethod(String paymentMethod) { this.paymentMethod = paymentMethod; }

    public String getPickupOtp() { return pickupOtp; }
    public void setPickupOtp(String pickupOtp) { this.pickupOtp = pickupOtp; }

    public String getDeliveryOtp() { return deliveryOtp; }
    public void setDeliveryOtp(String deliveryOtp) { this.deliveryOtp = deliveryOtp; }

    public String getEscrowStatus() { return escrowStatus; }
    public void setEscrowStatus(String escrowStatus) { this.escrowStatus = escrowStatus; }

    public BigDecimal getEscrowAmount() { return escrowAmount; }
    public void setEscrowAmount(BigDecimal escrowAmount) { this.escrowAmount = escrowAmount; }

    public Instant getPickupConfirmedAt() { return pickupConfirmedAt; }
    public void setPickupConfirmedAt(Instant pickupConfirmedAt) { this.pickupConfirmedAt = pickupConfirmedAt; }

    public Instant getDeliveredConfirmedAt() { return deliveredConfirmedAt; }
    public void setDeliveredConfirmedAt(Instant deliveredConfirmedAt) { this.deliveredConfirmedAt = deliveredConfirmedAt; }

    public BigDecimal getDriverLat() { return driverLat; }
    public void setDriverLat(BigDecimal driverLat) { this.driverLat = driverLat; }

    public BigDecimal getDriverLng() { return driverLng; }
    public void setDriverLng(BigDecimal driverLng) { this.driverLng = driverLng; }

    public Instant getDriverLocationUpdatedAt() { return driverLocationUpdatedAt; }
    public void setDriverLocationUpdatedAt(Instant driverLocationUpdatedAt) { this.driverLocationUpdatedAt = driverLocationUpdatedAt; }

    public String getDisputeReason() { return disputeReason; }
    public void setDisputeReason(String disputeReason) { this.disputeReason = disputeReason; }

    public String getConflictStatus() { return conflictStatus; }
    public void setConflictStatus(String conflictStatus) { this.conflictStatus = conflictStatus; }

    public String getConflictCategory() { return conflictCategory; }
    public void setConflictCategory(String conflictCategory) { this.conflictCategory = conflictCategory; }

    public String getConflictRaisedByUid() { return conflictRaisedByUid; }
    public void setConflictRaisedByUid(String conflictRaisedByUid) { this.conflictRaisedByUid = conflictRaisedByUid; }

    public String getConflictRaisedByRole() { return conflictRaisedByRole; }
    public void setConflictRaisedByRole(String conflictRaisedByRole) { this.conflictRaisedByRole = conflictRaisedByRole; }

    public String getConflictCounterStatement() { return conflictCounterStatement; }
    public void setConflictCounterStatement(String conflictCounterStatement) { this.conflictCounterStatement = conflictCounterStatement; }

    public String getConflictResolution() { return conflictResolution; }
    public void setConflictResolution(String conflictResolution) { this.conflictResolution = conflictResolution; }

    public Instant getConflictResolvedAt() { return conflictResolvedAt; }
    public void setConflictResolvedAt(Instant conflictResolvedAt) { this.conflictResolvedAt = conflictResolvedAt; }

    public String getStatus() { return status; }
    public void setStatus(String status) { this.status = status; }

    public Instant getCreatedAt() { return createdAt; }
    public void setCreatedAt(Instant createdAt) { this.createdAt = createdAt; }
}
