package com.nearestyou.repository;

import com.nearestyou.entity.DeliveryRequest;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.math.BigDecimal;
import java.time.Instant;
import java.util.List;
import java.util.Optional;

public interface DeliveryRequestRepository extends JpaRepository<DeliveryRequest, Long> {
    List<DeliveryRequest> findByCustomerUidOrderByCreatedAtDesc(String customerUid);
    List<DeliveryRequest> findAllByOrderByCreatedAtDesc();
    Optional<DeliveryRequest> findByTrackingCodeIgnoreCase(String trackingCode);

    @Modifying
    @Query("UPDATE DeliveryRequest d SET d.status = 'ASSIGNED', d.driverUid = :driverUid, d.driverName = :driverName, " +
           "d.driverLat = COALESCE(:driverLat, d.driverLat), d.driverLng = COALESCE(:driverLng, d.driverLng), " +
           "d.driverLocationUpdatedAt = :now " +
           "WHERE d.id = :id AND d.status = 'REQUESTED' AND d.driverUid IS NULL")
    int claimDeliveryAtomically(
            @Param("id") Long id,
            @Param("driverUid") String driverUid,
            @Param("driverName") String driverName,
            @Param("driverLat") BigDecimal driverLat,
            @Param("driverLng") BigDecimal driverLng,
            @Param("now") Instant now
    );
}
