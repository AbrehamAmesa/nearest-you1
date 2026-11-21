package com.nearestyou.entity;

import jakarta.persistence.*;
import org.hibernate.annotations.JdbcTypeCode;
import org.hibernate.type.SqlTypes;

import java.math.BigDecimal;
import java.time.Instant;
import java.util.Map;

@Entity
@Table(name = "payment_transactions", indexes = {
    @Index(name = "idx_paytx_txref", columnList = "tx_ref", unique = true),
    @Index(name = "idx_paytx_customer", columnList = "customer_uid"),
    @Index(name = "idx_paytx_provider", columnList = "provider_uid"),
    @Index(name = "idx_paytx_business", columnList = "business_id"),
    @Index(name = "idx_paytx_ref", columnList = "transaction_type,reference_id")
})
public class PaymentTransaction {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(name = "tx_ref", nullable = false, unique = true)
    private String txRef;

    @Column(nullable = false)
    private String gateway; // CHAPA | PAYO

    @Column(name = "gateway_mode", nullable = false)
    private String gatewayMode = "SANDBOX"; // LIVE | SANDBOX

    @Column(name = "transaction_type", nullable = false)
    private String transactionType; // ORDER | BOOKING | DELIVERY | RIDE

    @Column(name = "reference_id", nullable = false)
    private Long referenceId;

    @Column(name = "reference_code", nullable = false)
    private String referenceCode;

    @Column(name = "customer_uid", nullable = false)
    private String customerUid;

    @Column(name = "customer_email")
    private String customerEmail;

    @Column(name = "customer_name")
    private String customerName;

    @Column(name = "provider_uid")
    private String providerUid;

    @Column(name = "business_id")
    private Long businessId;

    @Column(nullable = false)
    private String currency = "ETB";

    @Column(name = "gross_amount", nullable = false, precision = 12, scale = 2)
    private BigDecimal grossAmount;

    @Column(name = "commission_amount", nullable = false, precision = 12, scale = 2)
    private BigDecimal commissionAmount;

    @Column(name = "provider_amount", nullable = false, precision = 12, scale = 2)
    private BigDecimal providerAmount;

    @Column(name = "tax_amount", nullable = false, precision = 12, scale = 2)
    private BigDecimal taxAmount = BigDecimal.ZERO;

    @JdbcTypeCode(SqlTypes.JSON)
    @Column(name = "platform_commission_account_snapshot", columnDefinition = "jsonb")
    private Map<String, Object> platformCommissionAccountSnapshot;

    @JdbcTypeCode(SqlTypes.JSON)
    @Column(name = "provider_payout_account_snapshot", columnDefinition = "jsonb")
    private Map<String, Object> providerPayoutAccountSnapshot;

    @Column(name = "chapa_subaccount_id")
    private String chapaSubaccountId;

    @Column(name = "gateway_checkout_url", columnDefinition = "text")
    private String gatewayCheckoutUrl;

    @Column(name = "gateway_transaction_id")
    private String gatewayTransactionId;

    @Column(name = "payer_receipt_reference")
    private String payerReceiptReference;

    @Column(name = "payer_receipt_image_url", columnDefinition = "text")
    private String payerReceiptImageUrl;

    @Column(name = "commission_leg_status", nullable = false)
    private String commissionLegStatus = "PENDING"; // PENDING | COLLECTED_IN_PLATFORM_ACCOUNT | GROSS_AMOUNT_COLLECTED_BY_PLATFORM

    @Column(name = "provider_leg_status", nullable = false)
    private String providerLegStatus = "PENDING"; // PENDING | PENDING_PROVIDER_PAYOUT | HELD_ESCROW | PENDING_PROVIDER_ACCOUNT_SETUP

    @Column(nullable = false)
    private String status = "INITIALIZED"; // INITIALIZED | AWAITING_RECEIPT | PAID | FAILED | CANCELLED

    @JdbcTypeCode(SqlTypes.JSON)
    @Column(name = "gateway_raw_response", columnDefinition = "jsonb")
    private Map<String, Object> gatewayRawResponse;

    @Column(name = "paid_at")
    private Instant paidAt;

    @Column(name = "created_at", nullable = false, updatable = false)
    private Instant createdAt = Instant.now();

    @Column(name = "updated_at", nullable = false)
    private Instant updatedAt = Instant.now();

    @PreUpdate
    public void onUpdate() {
        this.updatedAt = Instant.now();
    }

    public Long getId() { return id; }
    public void setId(Long id) { this.id = id; }

    public String getTxRef() { return txRef; }
    public void setTxRef(String txRef) { this.txRef = txRef; }

    public String getGateway() { return gateway; }
    public void setGateway(String gateway) { this.gateway = gateway; }

    public String getGatewayMode() { return gatewayMode; }
    public void setGatewayMode(String gatewayMode) { this.gatewayMode = gatewayMode; }

    public String getTransactionType() { return transactionType; }
    public void setTransactionType(String transactionType) { this.transactionType = transactionType; }

    public Long getReferenceId() { return referenceId; }
    public void setReferenceId(Long referenceId) { this.referenceId = referenceId; }

    public String getReferenceCode() { return referenceCode; }
    public void setReferenceCode(String referenceCode) { this.referenceCode = referenceCode; }

    public String getCustomerUid() { return customerUid; }
    public void setCustomerUid(String customerUid) { this.customerUid = customerUid; }

    public String getCustomerEmail() { return customerEmail; }
    public void setCustomerEmail(String customerEmail) { this.customerEmail = customerEmail; }

    public String getCustomerName() { return customerName; }
    public void setCustomerName(String customerName) { this.customerName = customerName; }

    public String getProviderUid() { return providerUid; }
    public void setProviderUid(String providerUid) { this.providerUid = providerUid; }

    public Long getBusinessId() { return businessId; }
    public void setBusinessId(Long businessId) { this.businessId = businessId; }

    public String getCurrency() { return currency; }
    public void setCurrency(String currency) { this.currency = currency; }

    public BigDecimal getGrossAmount() { return grossAmount; }
    public void setGrossAmount(BigDecimal grossAmount) { this.grossAmount = grossAmount; }

    public BigDecimal getCommissionAmount() { return commissionAmount; }
    public void setCommissionAmount(BigDecimal commissionAmount) { this.commissionAmount = commissionAmount; }

    public BigDecimal getProviderAmount() { return providerAmount; }
    public void setProviderAmount(BigDecimal providerAmount) { this.providerAmount = providerAmount; }

    public BigDecimal getTaxAmount() { return taxAmount; }
    public void setTaxAmount(BigDecimal taxAmount) { this.taxAmount = taxAmount; }

    public Map<String, Object> getPlatformCommissionAccountSnapshot() { return platformCommissionAccountSnapshot; }
    public void setPlatformCommissionAccountSnapshot(Map<String, Object> platformCommissionAccountSnapshot) { this.platformCommissionAccountSnapshot = platformCommissionAccountSnapshot; }

    public Map<String, Object> getProviderPayoutAccountSnapshot() { return providerPayoutAccountSnapshot; }
    public void setProviderPayoutAccountSnapshot(Map<String, Object> providerPayoutAccountSnapshot) { this.providerPayoutAccountSnapshot = providerPayoutAccountSnapshot; }

    public String getChapaSubaccountId() { return chapaSubaccountId; }
    public void setChapaSubaccountId(String chapaSubaccountId) { this.chapaSubaccountId = chapaSubaccountId; }

    public String getGatewayCheckoutUrl() { return gatewayCheckoutUrl; }
    public void setGatewayCheckoutUrl(String gatewayCheckoutUrl) { this.gatewayCheckoutUrl = gatewayCheckoutUrl; }

    public String getGatewayTransactionId() { return gatewayTransactionId; }
    public void setGatewayTransactionId(String gatewayTransactionId) { this.gatewayTransactionId = gatewayTransactionId; }

    public String getPayerReceiptReference() { return payerReceiptReference; }
    public void setPayerReceiptReference(String payerReceiptReference) { this.payerReceiptReference = payerReceiptReference; }

    public String getPayerReceiptImageUrl() { return payerReceiptImageUrl; }
    public void setPayerReceiptImageUrl(String payerReceiptImageUrl) { this.payerReceiptImageUrl = payerReceiptImageUrl; }

    public String getCommissionLegStatus() { return commissionLegStatus; }
    public void setCommissionLegStatus(String commissionLegStatus) { this.commissionLegStatus = commissionLegStatus; }

    public String getProviderLegStatus() { return providerLegStatus; }
    public void setProviderLegStatus(String providerLegStatus) { this.providerLegStatus = providerLegStatus; }

    public String getStatus() { return status; }
    public void setStatus(String status) { this.status = status; }

    public Map<String, Object> getGatewayRawResponse() { return gatewayRawResponse; }
    public void setGatewayRawResponse(Map<String, Object> gatewayRawResponse) { this.gatewayRawResponse = gatewayRawResponse; }

    public Instant getPaidAt() { return paidAt; }
    public void setPaidAt(Instant paidAt) { this.paidAt = paidAt; }

    public Instant getCreatedAt() { return createdAt; }
    public void setCreatedAt(Instant createdAt) { this.createdAt = createdAt; }

    public Instant getUpdatedAt() { return updatedAt; }
    public void setUpdatedAt(Instant updatedAt) { this.updatedAt = updatedAt; }
}
