package com.nearestyou.repository;

import com.nearestyou.entity.PaymentTransaction;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.Collection;
import java.util.List;
import java.util.Optional;

public interface PaymentTransactionRepository extends JpaRepository<PaymentTransaction, Long> {
    Optional<PaymentTransaction> findByTxRefIgnoreCase(String txRef);
    List<PaymentTransaction> findByTransactionTypeAndReferenceIdOrderByCreatedAtDesc(String transactionType, Long referenceId);
    List<PaymentTransaction> findByCustomerUidOrderByCreatedAtDesc(String customerUid);
    List<PaymentTransaction> findByProviderUidOrderByCreatedAtDesc(String providerUid);
    List<PaymentTransaction> findByBusinessIdInOrderByCreatedAtDesc(Collection<Long> businessIds);
    List<PaymentTransaction> findAllByOrderByCreatedAtDesc();
}
