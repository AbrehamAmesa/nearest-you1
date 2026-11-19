package com.nearestyou.repository;

import com.nearestyou.entity.CommissionRecord;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.Collection;
import java.util.List;

public interface CommissionRecordRepository extends JpaRepository<CommissionRecord, Long> {
    List<CommissionRecord> findByBusinessIdInOrderByCreatedAtDesc(Collection<Long> businessIds);
    List<CommissionRecord> findAllByOrderByCreatedAtDesc();
}
