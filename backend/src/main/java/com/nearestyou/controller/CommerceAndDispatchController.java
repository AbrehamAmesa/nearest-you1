package com.nearestyou.controller;

import com.nearestyou.dto.NearestYouDtos.*;
import com.nearestyou.entity.Booking;
import com.nearestyou.entity.CustomerOrder;
import com.nearestyou.entity.DeliveryRequest;
import com.nearestyou.security.UserPrincipal;
import com.nearestyou.service.DeliveryDispatchService;
import com.nearestyou.service.OrderAndBookingService;
import jakarta.validation.Valid;
import org.springframework.http.HttpStatus;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.*;

import java.util.List;
import java.util.Map;

@RestController
@RequestMapping("/api/v1")
public class CommerceAndDispatchController {

    private final OrderAndBookingService orderAndBookingService;
    private final DeliveryDispatchService deliveryDispatchService;

    public CommerceAndDispatchController(
            OrderAndBookingService orderAndBookingService,
            DeliveryDispatchService deliveryDispatchService
    ) {
        this.orderAndBookingService = orderAndBookingService;
        this.deliveryDispatchService = deliveryDispatchService;
    }

    @PostMapping("/orders")
    @ResponseStatus(HttpStatus.CREATED)
    public Map<String, Object> createOrders(
            @AuthenticationPrincipal UserPrincipal principal,
            @Valid @RequestBody CreateOrdersRequest req
    ) {
        List<CustomerOrder> orders = orderAndBookingService.createGroupedOrders(principal, req);
        return Map.of("orders", orders);
    }

    @PostMapping("/orders/{id}/status")
    public CustomerOrder updateOrderStatus(
            @AuthenticationPrincipal UserPrincipal principal,
            @PathVariable Long id,
            @Valid @RequestBody UpdateOrderStatusRequest req
    ) {
        return orderAndBookingService.updateOrderStatus(principal, id, req);
    }

    @PostMapping("/bookings")
    @ResponseStatus(HttpStatus.CREATED)
    public Booking createBooking(
            @AuthenticationPrincipal UserPrincipal principal,
            @Valid @RequestBody CreateBookingRequest req
    ) {
        return orderAndBookingService.createBooking(principal, req);
    }

    @PostMapping("/bookings/{id}/status")
    public Booking updateBookingStatus(
            @AuthenticationPrincipal UserPrincipal principal,
            @PathVariable Long id,
            @RequestBody UpdateBookingStatusRequest req
    ) {
        return orderAndBookingService.updateBookingStatus(principal, id, req);
    }

    @GetMapping("/deliveries")
    public Map<String, Object> getDeliveries(
            @AuthenticationPrincipal UserPrincipal principal,
            @RequestParam(required = false) Double lat,
            @RequestParam(required = false) Double lng
    ) {
        return deliveryDispatchService.getScopedDeliveries(principal, lat, lng);
    }

    @GetMapping("/deliveries/track/{trackingCode}")
    public Map<String, Object> trackDeliveryLive(
            @AuthenticationPrincipal UserPrincipal principal,
            @PathVariable String trackingCode,
            @RequestParam(required = false) String receiverPhone
    ) {
        return deliveryDispatchService.getDeliveryLiveTracking(trackingCode, principal, receiverPhone);
    }

    @PostMapping("/deliveries/{id}/driver-location")
    public Map<String, Object> updateDriverLocation(
            @AuthenticationPrincipal UserPrincipal principal,
            @PathVariable Long id,
            @Valid @RequestBody UpdateDriverLocationRequest req
    ) {
        return deliveryDispatchService.updateDriverLocation(principal, id, req.latitude(), req.longitude());
    }

    @PostMapping("/deliveries")
    @ResponseStatus(HttpStatus.CREATED)
    public DeliveryRequest createDelivery(
            @AuthenticationPrincipal UserPrincipal principal,
            @Valid @RequestBody CreateDeliveryRequest req
    ) {
        return deliveryDispatchService.createDelivery(principal, req);
    }

    @PostMapping("/deliveries/{id}/transition")
    public Map<String, Object> transitionDelivery(
            @AuthenticationPrincipal UserPrincipal principal,
            @PathVariable Long id,
            @Valid @RequestBody TransitionDeliveryRequest req
    ) {
        return deliveryDispatchService.transitionDelivery(principal, id, req.status(), req.otp(), req.driverLat(), req.driverLng());
    }

    @PostMapping({"/deliveries/{id}/dispute", "/deliveries/{id}/conflict"})
    public Map<String, Object> disputeDelivery(
            @AuthenticationPrincipal UserPrincipal principal,
            @PathVariable Long id,
            @Valid @RequestBody DisputeDeliveryRequest req
    ) {
        return deliveryDispatchService.disputeDelivery(principal, id, req.reason(), req.category());
    }

    @PostMapping("/deliveries/{id}/conflict-statement")
    public Map<String, Object> submitConflictStatement(
            @AuthenticationPrincipal UserPrincipal principal,
            @PathVariable Long id,
            @Valid @RequestBody ConflictStatementRequest req
    ) {
        return deliveryDispatchService.submitConflictStatement(principal, id, req.statement());
    }
}
