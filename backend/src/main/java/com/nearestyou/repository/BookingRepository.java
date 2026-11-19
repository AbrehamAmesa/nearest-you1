package com.nearestyou.repository;

import com.nearestyou.entity.Booking;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.Collection;
import java.util.List;
import java.util.Optional;

public interface BookingRepository extends JpaRepository<Booking, Long> {
    List<Booking> findByCustomerUidOrderByCreatedAtDesc(String customerUid);
    List<Booking> findByBusinessIdInOrderByCreatedAtDesc(Collection<Long> businessIds);
    List<Booking> findByListingId(Long listingId);
    Optional<Booking> findByBookingReferenceAndCustomerUid(String bookingReference, String customerUid);
    List<Booking> findAllByOrderByCreatedAtDesc();
}
