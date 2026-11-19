package com.nearestyou.repository;

import com.nearestyou.entity.ServiceCategory;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;
import java.util.Optional;

public interface ServiceCategoryRepository extends JpaRepository<ServiceCategory, Long> {
    Optional<ServiceCategory> findBySlug(String slug);
    List<ServiceCategory> findAllByOrderByDisplayOrderAscIdAsc();
}
