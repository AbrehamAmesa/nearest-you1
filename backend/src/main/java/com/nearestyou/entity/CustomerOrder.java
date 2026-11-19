package com.nearestyou.entity;

import jakarta.persistence.*;
import org.hibernate.annotations.JdbcTypeCode;
import org.hibernate.type.SqlTypes;

import java.math.BigDecimal;
import java.time.Instant;
import java.util.List;
import java.util.Map;

@Entity
@Table(name = "orders", indexes = {
    @Index(name = "idx_orders_customer", columnList = "customer_uid"),
    @Index(name = "idx_orders_business", columnList = "business_id")
})
public class CustomerOrder {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(name = "order_number", nullable = false, unique = true)
    private String orderNumber;

    @Column(name = "customer_uid", nullable = false)
    private String customerUid;

    @Column(name = "customer_name", nullable = false)
    private String customerName;

    @Column(name = "business_id", nullable = false)
    private Long businessId;

    @Column(name = "order_type", nullable = false)
    private String orderType;

    @JdbcTypeCode(SqlTypes.JSON)
    @Column(name = "items_snapshot", columnDefinition = "jsonb", nullable = false)
    private List<Map<String, Object>> itemsSnapshot;

    @Column(nullable = false, precision = 12, scale = 2)
    private BigDecimal subtotal;

    @Column(name = "delivery_fee", nullable = false, precision = 12, scale = 2)
    private BigDecimal deliveryFee;

    @Column(name = "tax_amount", nullable = false, precision = 12, scale = 2)
    private BigDecimal taxAmount;

    @Column(name = "discount_amount", nullable = false, precision = 12, scale = 2)
    private BigDecimal discountAmount = BigDecimal.ZERO;

    @Column(name = "total_amount", nullable = false, precision = 12, scale = 2)
    private BigDecimal totalAmount;

    @Column(nullable = false)
    private String currency = "ETB";

    @Column(name = "fulfillment_type", nullable = false)
    private String fulfillmentType = "DELIVERY";

    @Column(name = "delivery_address", nullable = false, columnDefinition = "text")
    private String deliveryAddress;

    @Column(name = "payment_method", nullable = false)
    private String paymentMethod;

    @Column(name = "payment_status", nullable = false)
    private String paymentStatus = "SUCCESSFUL";

    @Column(name = "order_status", nullable = false)
    private String orderStatus = "PENDING";

    @Column(name = "created_at", nullable = false, updatable = false)
    private Instant createdAt = Instant.now();

    public Long getId() { return id; }
    public void setId(Long id) { this.id = id; }

    public String getOrderNumber() { return orderNumber; }
    public void setOrderNumber(String orderNumber) { this.orderNumber = orderNumber; }

    public String getCustomerUid() { return customerUid; }
    public void setCustomerUid(String customerUid) { this.customerUid = customerUid; }

    public String getCustomerName() { return customerName; }
    public void setCustomerName(String customerName) { this.customerName = customerName; }

    public Long getBusinessId() { return businessId; }
    public void setBusinessId(Long businessId) { this.businessId = businessId; }

    public String getOrderType() { return orderType; }
    public void setOrderType(String orderType) { this.orderType = orderType; }

    public List<Map<String, Object>> getItemsSnapshot() { return itemsSnapshot; }
    public void setItemsSnapshot(List<Map<String, Object>> itemsSnapshot) { this.itemsSnapshot = itemsSnapshot; }

    public BigDecimal getSubtotal() { return subtotal; }
    public void setSubtotal(BigDecimal subtotal) { this.subtotal = subtotal; }

    public BigDecimal getDeliveryFee() { return deliveryFee; }
    public void setDeliveryFee(BigDecimal deliveryFee) { this.deliveryFee = deliveryFee; }

    public BigDecimal getTaxAmount() { return taxAmount; }
    public void setTaxAmount(BigDecimal taxAmount) { this.taxAmount = taxAmount; }

    public BigDecimal getDiscountAmount() { return discountAmount; }
    public void setDiscountAmount(BigDecimal discountAmount) { this.discountAmount = discountAmount; }

    public BigDecimal getTotalAmount() { return totalAmount; }
    public void setTotalAmount(BigDecimal totalAmount) { this.totalAmount = totalAmount; }

    public String getCurrency() { return currency; }
    public void setCurrency(String currency) { this.currency = currency; }

    public String getFulfillmentType() { return fulfillmentType; }
    public void setFulfillmentType(String fulfillmentType) { this.fulfillmentType = fulfillmentType; }

    public String getDeliveryAddress() { return deliveryAddress; }
    public void setDeliveryAddress(String deliveryAddress) { this.deliveryAddress = deliveryAddress; }

    public String getPaymentMethod() { return paymentMethod; }
    public void setPaymentMethod(String paymentMethod) { this.paymentMethod = paymentMethod; }

    public String getPaymentStatus() { return paymentStatus; }
    public void setPaymentStatus(String paymentStatus) { this.paymentStatus = paymentStatus; }

    public String getOrderStatus() { return orderStatus; }
    public void setOrderStatus(String orderStatus) { this.orderStatus = orderStatus; }

    public Instant getCreatedAt() { return createdAt; }
    public void setCreatedAt(Instant createdAt) { this.createdAt = createdAt; }
}
