package com.nearestyou.repository;

import com.nearestyou.entity.UserAccount;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;
import java.util.Optional;

public interface UserAccountRepository extends JpaRepository<UserAccount, Long> {
    Optional<UserAccount> findByUid(String uid);
    Optional<UserAccount> findByFirebaseUid(String firebaseUid);
    Optional<UserAccount> findByEmailIgnoreCase(String email);
    Optional<UserAccount> findFirstByEmailIgnoreCase(String email);
    List<UserAccount> findAllByOrderByCreatedAtDesc();
}
