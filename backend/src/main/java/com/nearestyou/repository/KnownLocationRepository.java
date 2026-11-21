package com.nearestyou.repository;

import com.nearestyou.entity.KnownLocation;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;
import java.util.Optional;

public interface KnownLocationRepository extends JpaRepository<KnownLocation, Long> {
    Optional<KnownLocation> findByCodeIgnoreCase(String code);
    boolean existsByCodeIgnoreCase(String code);
    List<KnownLocation> findByActiveTrueOrderByCityAscSubCityAscNameAsc();
    List<KnownLocation> findByCityIgnoreCaseAndActiveTrueOrderByNameAsc(String city);
}
