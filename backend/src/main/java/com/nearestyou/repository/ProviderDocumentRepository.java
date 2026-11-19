package com.nearestyou.repository;

import com.nearestyou.entity.ProviderDocument;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;

public interface ProviderDocumentRepository extends JpaRepository<ProviderDocument, Long> {
    List<ProviderDocument> findByRegistrationIdOrderByIdAsc(Long registrationId);
    void deleteByRegistrationId(Long registrationId);
    void deleteByRequirementId(Long requirementId);
}
