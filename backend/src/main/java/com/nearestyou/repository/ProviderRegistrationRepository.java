package com.nearestyou.repository;

import com.nearestyou.entity.ProviderRegistration;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;
import java.util.Optional;

public interface ProviderRegistrationRepository extends JpaRepository<ProviderRegistration, Long> {
    Optional<ProviderRegistration> findFirstByUserUidOrderByUpdatedAtDesc(String userUid);
    Optional<ProviderRegistration> findByQrVoucherToken(String qrVoucherToken);
    long countByStatus(String status);
    List<ProviderRegistration> findAllByOrderByUpdatedAtDesc();
    List<ProviderRegistration> findByStatusOrderByLastLocationUpdatedAtDesc(String status);
    long countByServiceCategoryId(Long serviceCategoryId);
}
