package com.nearestyou.repository;

import com.nearestyou.entity.Business;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;

public interface BusinessRepository extends JpaRepository<Business, Long> {
    List<Business> findByOwnerUidOrderByIdAsc(String ownerUid);
    List<Business> findAllByOrderByIdAsc();
    List<Business> findAllByOrderByCreatedAtDesc();
    long countByCategoryId(Long categoryId);
}
