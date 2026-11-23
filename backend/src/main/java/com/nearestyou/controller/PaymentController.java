package com.nearestyou.controller;

import com.nearestyou.dto.NearestYouDtos.ConfirmPayoPaymentRequest;
import com.nearestyou.dto.NearestYouDtos.InitializePaymentRequest;
import com.nearestyou.entity.PaymentTransaction;
import com.nearestyou.security.UserPrincipal;
import com.nearestyou.service.PaymentGatewayService;
import jakarta.validation.Valid;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.*;

import java.util.List;
import java.util.Map;

@RestController
@RequestMapping("/api/v1/payments")
public class PaymentController {

    private final PaymentGatewayService paymentGatewayService;

    public PaymentController(PaymentGatewayService paymentGatewayService) {
        this.paymentGatewayService = paymentGatewayService;
    }

    @GetMapping("/config")
    public Map<String, Object> getConfig(@AuthenticationPrincipal UserPrincipal principal) {
        return paymentGatewayService.getPublicPaymentConfig(principal);
    }

    @GetMapping("/banks")
    public List<Map<String, String>> getBanks() {
        return paymentGatewayService.getEthiopianBanks();
    }

    @PostMapping("/initialize")
    public PaymentTransaction initialize(
            @AuthenticationPrincipal UserPrincipal principal,
            @Valid @RequestBody InitializePaymentRequest req
    ) {
        return paymentGatewayService.initializePayment(principal, req);
    }

    @PostMapping("/{txRef}/verify")
    public PaymentTransaction verify(
            @AuthenticationPrincipal UserPrincipal principal,
            @PathVariable String txRef
    ) {
        return paymentGatewayService.verifyPayment(principal, txRef);
    }

    @PostMapping("/payo/{txRef}/confirm")
    public PaymentTransaction confirmPayo(
            @AuthenticationPrincipal UserPrincipal principal,
            @PathVariable String txRef,
            @Valid @RequestBody ConfirmPayoPaymentRequest req
    ) {
        return paymentGatewayService.confirmPayoPayment(principal, txRef, req);
    }

    @GetMapping("/mine")
    public List<PaymentTransaction> getMyPayments(@AuthenticationPrincipal UserPrincipal principal) {
        return paymentGatewayService.getMyPayments(principal);
    }

    @GetMapping("/provider-settlements")
    public List<PaymentTransaction> getProviderSettlements(@AuthenticationPrincipal UserPrincipal principal) {
        return paymentGatewayService.getProviderSettlements(principal);
    }

    @GetMapping("/by-tx/{txRef}")
    public PaymentTransaction getByTxRef(
            @AuthenticationPrincipal UserPrincipal principal,
            @PathVariable String txRef
    ) {
        return paymentGatewayService.getPaymentByTxRef(principal, txRef);
    }

    @GetMapping("/by-reference")
    public List<PaymentTransaction> getByReference(
            @AuthenticationPrincipal UserPrincipal principal,
            @RequestParam String transactionType,
            @RequestParam Long referenceId
    ) {
        return paymentGatewayService.getPaymentsByReference(principal, transactionType, referenceId);
    }

    @PostMapping("/chapa/webhook")
    public Map<String, Object> chapaWebhook(
            @RequestBody(required = false) String rawBody,
            @RequestHeader(value = "Chapa-Signature", required = false) String chapaSig,
            @RequestHeader(value = "x-chapa-signature", required = false) String xChapaSig
    ) {
        String sig = xChapaSig != null && !xChapaSig.isBlank() ? xChapaSig : chapaSig;
        return paymentGatewayService.handleChapaWebhook(rawBody, sig);
    }

    @GetMapping("/chapa/callback")
    public Map<String, Object> chapaCallback(
            @RequestParam(value = "trx_ref", required = false) String trxRef,
            @RequestParam(value = "tx_ref", required = false) String txRef
    ) {
        return paymentGatewayService.handleChapaCallback(trxRef != null ? trxRef : txRef);
    }

    @PostMapping("/payo/webhook")
    public Map<String, Object> payoWebhook(
            @RequestBody(required = false) String rawBody,
            @RequestHeader(value = "x-pygate-signature", required = false) String payoSig
    ) {
        return paymentGatewayService.handlePayoWebhook(rawBody, payoSig);
    }
}
