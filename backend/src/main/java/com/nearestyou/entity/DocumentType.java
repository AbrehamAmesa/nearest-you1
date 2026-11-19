package com.nearestyou.entity;

import jakarta.persistence.*;
import java.time.Instant;

@Entity
@Table(name = "document_types")
public class DocumentType {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(name = "document_code", nullable = false, unique = true)
    private String documentCode;

    @Column(name = "document_name", nullable = false)
    private String documentName;

    @Column(name = "document_name_am")
    private String documentNameAm;

    @Column(name = "document_name_om")
    private String documentNameOm;

    @Column(nullable = false, columnDefinition = "text")
    private String description;

    @Column(name = "default_mandatory", nullable = false)
    private boolean defaultMandatory = true;

    @Column(name = "default_requires_document_number", nullable = false)
    private boolean defaultRequiresDocumentNumber = true;

    @Column(nullable = false)
    private String status = "ACTIVE";

    @Column(name = "created_at", nullable = false, updatable = false)
    private Instant createdAt = Instant.now();

    public Long getId() { return id; }
    public void setId(Long id) { this.id = id; }

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

    public boolean isDefaultMandatory() { return defaultMandatory; }
    public void setDefaultMandatory(boolean defaultMandatory) { this.defaultMandatory = defaultMandatory; }

    public boolean isDefaultRequiresDocumentNumber() { return defaultRequiresDocumentNumber; }
    public void setDefaultRequiresDocumentNumber(boolean defaultRequiresDocumentNumber) { this.defaultRequiresDocumentNumber = defaultRequiresDocumentNumber; }

    public String getStatus() { return status; }
    public void setStatus(String status) { this.status = status; }

    public Instant getCreatedAt() { return createdAt; }
    public void setCreatedAt(Instant createdAt) { this.createdAt = createdAt; }
}
