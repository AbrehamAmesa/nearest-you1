package com.nearestyou.entity;

import jakarta.persistence.*;
import java.time.Instant;

@Entity
@Table(name = "provider_documents")
public class ProviderDocument {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(name = "registration_id", nullable = false)
    private Long registrationId;

    @Column(name = "requirement_id", nullable = false)
    private Long requirementId;

    @Column(name = "document_name", nullable = false)
    private String documentName;

    @Column(name = "document_number")
    private String documentNumber;

    @Column(name = "file_name", nullable = false)
    private String fileName;

    @Column(name = "file_data_url", nullable = false, columnDefinition = "text")
    private String fileDataUrl;

    @Column(nullable = false)
    private String status = "SUBMITTED";

    @Column(name = "created_at", nullable = false, updatable = false)
    private Instant createdAt = Instant.now();

    public Long getId() { return id; }
    public void setId(Long id) { this.id = id; }

    public Long getRegistrationId() { return registrationId; }
    public void setRegistrationId(Long registrationId) { this.registrationId = registrationId; }

    public Long getRequirementId() { return requirementId; }
    public void setRequirementId(Long requirementId) { this.requirementId = requirementId; }

    public String getDocumentName() { return documentName; }
    public void setDocumentName(String documentName) { this.documentName = documentName; }

    public String getDocumentNumber() { return documentNumber; }
    public void setDocumentNumber(String documentNumber) { this.documentNumber = documentNumber; }

    public String getFileName() { return fileName; }
    public void setFileName(String fileName) { this.fileName = fileName; }

    public String getFileDataUrl() { return fileDataUrl; }
    public void setFileDataUrl(String fileDataUrl) { this.fileDataUrl = fileDataUrl; }

    public String getStatus() { return status; }
    public void setStatus(String status) { this.status = status; }

    public Instant getCreatedAt() { return createdAt; }
    public void setCreatedAt(Instant createdAt) { this.createdAt = createdAt; }
}
