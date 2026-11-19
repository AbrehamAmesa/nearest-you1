package com.nearestyou.repository;

import com.nearestyou.entity.CategoryDocumentRequirement;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;

public interface CategoryDocumentRequirementRepository extends JpaRepository<CategoryDocumentRequirement, Long> {
    List<CategoryDocumentRequirement> findByCategoryIdOrderByIdAsc(Long categoryId);
    List<CategoryDocumentRequirement> findAllByOrderByCategoryIdAscIdAsc();
    List<CategoryDocumentRequirement> findByDocumentTypeId(Long documentTypeId);
    boolean existsByCategoryIdAndDocumentTypeId(Long categoryId, Long documentTypeId);
    long countByDocumentTypeId(Long documentTypeId);
    void deleteByCategoryId(Long categoryId);
}
