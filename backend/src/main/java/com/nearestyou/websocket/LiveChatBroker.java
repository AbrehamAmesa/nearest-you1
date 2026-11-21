package com.nearestyou.websocket;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.SerializationFeature;
import com.fasterxml.jackson.datatype.jsr310.JavaTimeModule;
import com.nearestyou.entity.Booking;
import com.nearestyou.entity.Business;
import com.nearestyou.entity.CustomerOrder;
import com.nearestyou.entity.DeliveryRequest;
import com.nearestyou.entity.JobApplication;
import com.nearestyou.entity.Message;
import com.nearestyou.entity.ServiceContract;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Component;
import org.springframework.web.socket.TextMessage;
import org.springframework.web.socket.WebSocketSession;

import java.util.*;
import java.util.concurrent.ConcurrentHashMap;

@Component
public class LiveChatBroker {

    private static final Logger log = LoggerFactory.getLogger(LiveChatBroker.class);

    private final Map<String, Set<WebSocketSession>> threadRooms = new ConcurrentHashMap<>();
    private final Map<String, Set<WebSocketSession>> userSessions = new ConcurrentHashMap<>();
    private final ObjectMapper objectMapper;

    public LiveChatBroker() {
        this.objectMapper = new ObjectMapper();
        this.objectMapper.registerModule(new JavaTimeModule());
        this.objectMapper.disable(SerializationFeature.WRITE_DATES_AS_TIMESTAMPS);
    }

    public void registerUserSession(String uid, WebSocketSession session) {
        if (uid == null || uid.isBlank() || session == null) return;
        userSessions.computeIfAbsent(uid, k -> ConcurrentHashMap.newKeySet()).add(session);
    }

    public void unregisterSession(String uid, WebSocketSession session) {
        if (session == null) return;
        if (uid != null && !uid.isBlank()) {
            Set<WebSocketSession> sessions = userSessions.get(uid);
            if (sessions != null) {
                sessions.remove(session);
                if (sessions.isEmpty()) userSessions.remove(uid);
            }
        }
        for (Map.Entry<String, Set<WebSocketSession>> entry : threadRooms.entrySet()) {
            Set<WebSocketSession> room = entry.getValue();
            room.remove(session);
            if (room.isEmpty()) {
                threadRooms.remove(entry.getKey(), room);
            }
        }
    }

    public void joinRoom(String threadKey, WebSocketSession session) {
        if (threadKey == null || threadKey.isBlank() || session == null) return;
        threadRooms.computeIfAbsent(threadKey, k -> ConcurrentHashMap.newKeySet()).add(session);
    }

    public void leaveRoom(String threadKey, WebSocketSession session) {
        if (threadKey == null || threadKey.isBlank() || session == null) return;
        Set<WebSocketSession> room = threadRooms.get(threadKey);
        if (room != null) {
            room.remove(session);
            if (room.isEmpty()) threadRooms.remove(threadKey, room);
        }
    }

    public void sendToSession(WebSocketSession session, Map<String, Object> payload) {
        if (session == null || !session.isOpen()) return;
        try {
            String json = objectMapper.writeValueAsString(payload);
            synchronized (session) {
                if (session.isOpen()) {
                    session.sendMessage(new TextMessage(json));
                }
            }
        } catch (Exception ex) {
            log.debug("Failed sending WS payload to session {}: {}", session.getId(), ex.getMessage());
        }
    }

    private void sendEnvelopeToTargets(String threadKey, Map<String, Object> envelope, String... targetUids) {
        Set<WebSocketSession> delivered = Collections.newSetFromMap(new IdentityHashMap<>());

        if (threadKey != null && !threadKey.isBlank()) {
            Set<WebSocketSession> room = threadRooms.get(threadKey);
            if (room != null) {
                for (WebSocketSession s : room) {
                    if (s.isOpen() && delivered.add(s)) {
                        sendToSession(s, envelope);
                    }
                }
            }
        }

        if (targetUids != null) {
            for (String targetUid : targetUids) {
                if (targetUid == null || targetUid.isBlank()) continue;
                Set<WebSocketSession> sessions = userSessions.get(targetUid);
                if (sessions != null) {
                    for (WebSocketSession s : sessions) {
                        if (s.isOpen() && delivered.add(s)) {
                            sendToSession(s, envelope);
                        }
                    }
                }
            }
        }
    }

    public void broadcastMessage(Message msg, String senderUid, String recipientUid, String ownerUid) {
        if (msg == null) return;
        String threadKey = msg.getThreadKey();
        Map<String, Object> envelope = new LinkedHashMap<>();
        envelope.put("type", "chat:message");
        envelope.put("threadKey", threadKey);
        envelope.put("ownerUid", ownerUid);
        envelope.put("message", msg);
        sendEnvelopeToTargets(threadKey, envelope, senderUid, recipientUid, ownerUid);
    }

    public void broadcastContractEvent(ServiceContract contract, String clientUid, String serviceGiverUid, String actorUid) {
        if (contract == null) return;
        String threadKey = contract.getThreadKey();
        Map<String, Object> envelope = new LinkedHashMap<>();
        envelope.put("type", "contract:updated");
        envelope.put("threadKey", threadKey);
        envelope.put("actorUid", actorUid);
        envelope.put("contract", contract);
        sendEnvelopeToTargets(threadKey, envelope, clientUid, serviceGiverUid);
    }

    public void broadcastOrderEvent(CustomerOrder order, Business biz, String actorUid, String action) {
        if (order == null || biz == null) return;
        String threadKey = "order:" + order.getId();
        Map<String, Object> envelope = new LinkedHashMap<>();
        envelope.put("type", "order:updated");
        envelope.put("action", action);
        envelope.put("actorUid", actorUid);
        envelope.put("threadKey", threadKey);
        envelope.put("businessId", biz.getId());
        envelope.put("businessName", biz.getBusinessName());
        envelope.put("ownerUid", biz.getOwnerUid());
        envelope.put("customerUid", order.getCustomerUid());
        envelope.put("order", order);
        sendEnvelopeToTargets(threadKey, envelope, order.getCustomerUid(), biz.getOwnerUid());
    }

    public void broadcastBookingEvent(Booking booking, Business biz, String listingTitle, String actorUid, String action) {
        if (booking == null || biz == null) return;
        String threadKey = "booking:" + booking.getId();
        Map<String, Object> envelope = new LinkedHashMap<>();
        envelope.put("type", "booking:updated");
        envelope.put("action", action);
        envelope.put("actorUid", actorUid);
        envelope.put("threadKey", threadKey);
        envelope.put("businessId", biz.getId());
        envelope.put("businessName", biz.getBusinessName());
        envelope.put("listingTitle", listingTitle);
        envelope.put("ownerUid", biz.getOwnerUid());
        envelope.put("customerUid", booking.getCustomerUid());
        envelope.put("booking", booking);
        sendEnvelopeToTargets(threadKey, envelope, booking.getCustomerUid(), biz.getOwnerUid());
    }

    public void broadcastApplicationEvent(JobApplication app, Business biz, String listingTitle, String actorUid, String action) {
        if (app == null || biz == null) return;
        Map<String, Object> envelope = new LinkedHashMap<>();
        envelope.put("type", "application:updated");
        envelope.put("action", action);
        envelope.put("actorUid", actorUid);
        envelope.put("businessId", biz.getId());
        envelope.put("businessName", biz.getBusinessName());
        envelope.put("listingTitle", listingTitle);
        envelope.put("ownerUid", biz.getOwnerUid());
        envelope.put("applicantUid", app.getApplicantUid());
        envelope.put("application", app);
        sendEnvelopeToTargets(null, envelope, app.getApplicantUid(), biz.getOwnerUid());
    }

    public void broadcastDeliveryEvent(DeliveryRequest delivery, String actorUid, String action) {
        if (delivery == null) return;
        Map<String, Object> safeDelivery = new LinkedHashMap<>();
        safeDelivery.put("id", delivery.getId());
        safeDelivery.put("trackingCode", delivery.getTrackingCode());
        safeDelivery.put("requestType", delivery.getRequestType());
        safeDelivery.put("customerUid", delivery.getCustomerUid());
        safeDelivery.put("customerName", delivery.getCustomerName());
        safeDelivery.put("driverUid", delivery.getDriverUid());
        safeDelivery.put("driverName", delivery.getDriverName());
        safeDelivery.put("status", delivery.getStatus());
        safeDelivery.put("escrowStatus", delivery.getEscrowStatus());
        safeDelivery.put("pickupLocation", delivery.getPickupLocation());
        safeDelivery.put("destinationLocation", delivery.getDestinationLocation());
        safeDelivery.put("totalFee", delivery.getTotalFee());
        safeDelivery.put("conflictStatus", delivery.getConflictStatus());
        safeDelivery.put("conflictCategory", delivery.getConflictCategory());
        safeDelivery.put("disputeReason", delivery.getDisputeReason());
        safeDelivery.put("conflictRaisedByRole", delivery.getConflictRaisedByRole());

        Map<String, Object> envelope = new LinkedHashMap<>();
        envelope.put("type", "delivery:updated");
        envelope.put("action", action);
        envelope.put("actorUid", actorUid);
        envelope.put("delivery", safeDelivery);
        sendEnvelopeToTargets(null, envelope, delivery.getCustomerUid(), delivery.getDriverUid());
    }
}
