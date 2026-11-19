package com.nearestyou.repository;

import com.nearestyou.entity.Review;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.Collection;
import java.util.List;

public interface ReviewRepository extends JpaRepository<Review, Long> {
    List<Review> findAllByOrderByCreatedAtDesc();
    List<Review> findByBusinessId(Long businessId);
    List<Review> findByListingId(Long listingId);
    List<Review> findByBusinessIdInOrderByCreatedAtDesc(Collection<Long> businessIds);
    boolean existsByTransactionRefAndCustomerUid(String transactionRef, String customerUid);
}
