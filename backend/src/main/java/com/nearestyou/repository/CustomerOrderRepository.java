package com.nearestyou.repository;

import com.nearestyou.entity.CustomerOrder;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.Collection;
import java.util.List;
import java.util.Optional;

public interface CustomerOrderRepository extends JpaRepository<CustomerOrder, Long> {
    List<CustomerOrder> findByCustomerUidOrderByCreatedAtDesc(String customerUid);
    List<CustomerOrder> findByBusinessIdInOrderByCreatedAtDesc(Collection<Long> businessIds);
    Optional<CustomerOrder> findByOrderNumberAndCustomerUid(String orderNumber, String customerUid);
    List<CustomerOrder> findAllByOrderByCreatedAtDesc();
}
