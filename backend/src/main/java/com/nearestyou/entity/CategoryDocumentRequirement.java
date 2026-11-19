package com.nearestyou.entity;

import jakarta.persistence.*;
import java.time.Instant;

@Entity
@Table(name = "category_document_requirements")
public class CategoryDocumentRequirement {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(name = "category_id", nullable = false)
    private Long categoryId;

    @Column(name = "document_type_id")
    private Long documentTypeId;

    @Column(name = "document_code", nullable = false)
    private String documentCode;

    @Column(name = "document_name", nullable = false)
    private String documentName;

    @Column(name = "document_name_am")
    private String documentNameAm;

    @Column(name = "document_name_om")
    private String documentNameOm;

    @Column(nullable = false, columnDefinition = "text")
    private String description;

    @Column(name = "is_mandatory", nullable = false)
    private boolean isMandatory = true;

    @Column(name = "requires_document_number", nullable = false)
    private boolean requiresDocumentNumber = true;

    @Column(name = "created_at", nullable = false, updatable = false)
    private Instant createdAt = Instant.now();

    public Long getId() { return id; }
    public void setId(Long id) { this.id = id; }

    public Long getCategoryId() { return categoryId; }
    public void setCategoryId(Long categoryId) { this.categoryId = categoryId; }

    public Long getDocumentTypeId() { return documentTypeId; }
    public void setDocumentTypeId(Long documentTypeId) { this.documentTypeId = documentTypeId; }

    public String getDocumentCode() { return documentCode; }
    public void setDocumentCode(String documentCode) { this.documentCode = documentCode; }

    public String getDocumentName() { return documentName; }
    public void setDocumentName(String documentName) { this.documentName = documentName; }

    public String getDocumentNameAm() { return documentNameAm; }
    public void setDocumentNameAm(String documentNameAm) { this.documentNameAm = documentNameAm; }

    public String getDocumentNameOm() { return documentNameOm; }
    public void setDocumentNameOm(String documentNameOm) { this.documentNameOm = documentNameOm; }

    public String getDescription() { return description; }
    public void setDescription(String description) { this.description = description; }

    public boolean isMandatory() { return isMandatory; }
    public void setMandatory(boolean mandatory) { isMandatory = mandatory; }

    public boolean isRequiresDocumentNumber() { return requiresDocumentNumber; }
    public void setRequiresDocumentNumber(boolean requiresDocumentNumber) { this.requiresDocumentNumber = requiresDocumentNumber; }

    public Instant getCreatedAt() { return createdAt; }
    public void setCreatedAt(Instant createdAt) { this.createdAt = createdAt; }
}
