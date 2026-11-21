package com.nearestyou.repository;

import com.nearestyou.entity.CommissionRecord;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.Collection;
import java.util.List;
import java.util.Optional;

public interface CommissionRecordRepository extends JpaRepository<CommissionRecord, Long> {
    Optional<CommissionRecord> findByTransactionRef(String transactionRef);
    List<CommissionRecord> findByBusinessIdInOrderByCreatedAtDesc(Collection<Long> businessIds);
    List<CommissionRecord> findAllByOrderByCreatedAtDesc();
}
