package com.nearestyou.repository;

import com.nearestyou.entity.DocumentType;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;
import java.util.Optional;

public interface DocumentTypeRepository extends JpaRepository<DocumentType, Long> {
    Optional<DocumentType> findByDocumentCodeIgnoreCase(String documentCode);
    List<DocumentType> findAllByOrderByDocumentNameAscIdAsc();
    List<DocumentType> findByStatusOrderByDocumentNameAscIdAsc(String status);
}
