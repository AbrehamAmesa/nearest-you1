package com.nearestyou.entity;

import jakarta.persistence.*;
import java.math.BigDecimal;
import java.time.Instant;

@Entity
@Table(name = "commission_records")
public class CommissionRecord {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(name = "transaction_ref", nullable = false, unique = true)
    private String transactionRef;

    @Column(name = "transaction_type", nullable = false)
    private String transactionType;

    @Column(name = "business_id")
    private Long businessId;

    @Column(name = "gross_amount", nullable = false, precision = 12, scale = 2)
    private BigDecimal grossAmount;

    @Column(name = "taxable_amount", nullable = false, precision = 12, scale = 2)
    private BigDecimal taxableAmount = BigDecimal.ZERO;

    @Column(name = "vat_amount", nullable = false, precision = 12, scale = 2)
    private BigDecimal vatAmount = BigDecimal.ZERO;

    @Column(name = "withholding_tax_amount", nullable = false, precision = 12, scale = 2)
    private BigDecimal withholdingTaxAmount = BigDecimal.ZERO;

    @Column(name = "commission_rate", nullable = false, precision = 5, scale = 2)
    private BigDecimal commissionRate;

    @Column(name = "commission_amount", nullable = false, precision = 12, scale = 2)
    private BigDecimal commissionAmount;

    @Column(name = "provider_amount", nullable = false, precision = 12, scale = 2)
    private BigDecimal providerAmount;

    @Column(name = "fiscal_receipt_number")
    private String fiscalReceiptNumber;

    @Column(name = "tax_period")
    private String taxPeriod;

    @Column(nullable = false)
    private String currency = "ETB";

    @Column(name = "payment_method", nullable = false)
    private String paymentMethod;

    @Column(nullable = false)
    private String status = "RECORDED";

    @Column(name = "gateway")
    private String gateway;

    @Column(name = "gateway_tx_ref")
    private String gatewayTxRef;

    @Column(name = "platform_commission_account")
    private String platformCommissionAccount;

    @Column(name = "provider_payout_account")
    private String providerPayoutAccount;

    @Column(name = "chapa_subaccount_id")
    private String chapaSubaccountId;

    @Column(name = "commission_settlement_status")
    private String commissionSettlementStatus;

    @Column(name = "provider_settlement_status")
    private String providerSettlementStatus;

    @Column(name = "created_at", nullable = false, updatable = false)
    private Instant createdAt = Instant.now();

    public Long getId() { return id; }
    public void setId(Long id) { this.id = id; }

    public String getTransactionRef() { return transactionRef; }
    public void setTransactionRef(String transactionRef) { this.transactionRef = transactionRef; }

    public String getTransactionType() { return transactionType; }
    public void setTransactionType(String transactionType) { this.transactionType = transactionType; }

    public Long getBusinessId() { return businessId; }
    public void setBusinessId(Long businessId) { this.businessId = businessId; }

    public BigDecimal getGrossAmount() { return grossAmount; }
    public void setGrossAmount(BigDecimal grossAmount) { this.grossAmount = grossAmount; }

    public BigDecimal getTaxableAmount() { return taxableAmount; }
    public void setTaxableAmount(BigDecimal taxableAmount) { this.taxableAmount = taxableAmount; }

    public BigDecimal getVatAmount() { return vatAmount; }
    public void setVatAmount(BigDecimal vatAmount) { this.vatAmount = vatAmount; }

    public BigDecimal getWithholdingTaxAmount() { return withholdingTaxAmount; }
    public void setWithholdingTaxAmount(BigDecimal withholdingTaxAmount) { this.withholdingTaxAmount = withholdingTaxAmount; }

    public BigDecimal getCommissionRate() { return commissionRate; }
    public void setCommissionRate(BigDecimal commissionRate) { this.commissionRate = commissionRate; }

    public BigDecimal getCommissionAmount() { return commissionAmount; }
    public void setCommissionAmount(BigDecimal commissionAmount) { this.commissionAmount = commissionAmount; }

    public BigDecimal getProviderAmount() { return providerAmount; }
    public void setProviderAmount(BigDecimal providerAmount) { this.providerAmount = providerAmount; }

    public String getFiscalReceiptNumber() { return fiscalReceiptNumber; }
    public void setFiscalReceiptNumber(String fiscalReceiptNumber) { this.fiscalReceiptNumber = fiscalReceiptNumber; }

    public String getTaxPeriod() { return taxPeriod; }
    public void setTaxPeriod(String taxPeriod) { this.taxPeriod = taxPeriod; }

    public String getCurrency() { return currency; }
    public void setCurrency(String currency) { this.currency = currency; }

    public String getPaymentMethod() { return paymentMethod; }
    public void setPaymentMethod(String paymentMethod) { this.paymentMethod = paymentMethod; }

    public String getStatus() { return status; }
    public void setStatus(String status) { this.status = status; }

    public String getGateway() { return gateway; }
    public void setGateway(String gateway) { this.gateway = gateway; }

    public String getGatewayTxRef() { return gatewayTxRef; }
    public void setGatewayTxRef(String gatewayTxRef) { this.gatewayTxRef = gatewayTxRef; }

    public String getPlatformCommissionAccount() { return platformCommissionAccount; }
    public void setPlatformCommissionAccount(String platformCommissionAccount) { this.platformCommissionAccount = platformCommissionAccount; }

    public String getProviderPayoutAccount() { return providerPayoutAccount; }
    public void setProviderPayoutAccount(String providerPayoutAccount) { this.providerPayoutAccount = providerPayoutAccount; }

    public String getChapaSubaccountId() { return chapaSubaccountId; }
    public void setChapaSubaccountId(String chapaSubaccountId) { this.chapaSubaccountId = chapaSubaccountId; }

    public String getCommissionSettlementStatus() { return commissionSettlementStatus; }
    public void setCommissionSettlementStatus(String commissionSettlementStatus) { this.commissionSettlementStatus = commissionSettlementStatus; }

    public String getProviderSettlementStatus() { return providerSettlementStatus; }
    public void setProviderSettlementStatus(String providerSettlementStatus) { this.providerSettlementStatus = providerSettlementStatus; }

    public Instant getCreatedAt() { return createdAt; }
    public void setCreatedAt(Instant createdAt) { this.createdAt = createdAt; }
}
