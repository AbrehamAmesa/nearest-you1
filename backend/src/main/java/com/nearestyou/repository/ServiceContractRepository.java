package com.nearestyou.repository;

import com.nearestyou.entity.ServiceContract;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.Collection;
import java.util.List;

public interface ServiceContractRepository extends JpaRepository<ServiceContract, Long> {
    List<ServiceContract> findByThreadKeyOrderByCreatedAtDesc(String threadKey);
    List<ServiceContract> findByClientUidOrServiceGiverUidOrderByUpdatedAtDesc(String clientUid, String serviceGiverUid);
    List<ServiceContract> findByBusinessIdInOrderByUpdatedAtDesc(Collection<Long> businessIds);
    List<ServiceContract> findAllByOrderByUpdatedAtDesc();
}
