package com.nearestyou.repository;

import com.nearestyou.entity.ServiceListing;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;

public interface ServiceListingRepository extends JpaRepository<ServiceListing, Long> {
    List<ServiceListing> findByStatusOrderByCreatedAtDesc(String status);
    List<ServiceListing> findAllByOrderByCreatedAtDesc();
    long countByCategoryId(Long categoryId);
}
