package com.nearestyou.websocket;

import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.nearestyou.dto.NearestYouDtos.SendMessageRequest;
import com.nearestyou.exception.ApiException;
import com.nearestyou.security.UserPrincipal;
import com.nearestyou.service.EngagementService;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Component;
import org.springframework.web.socket.CloseStatus;
import org.springframework.web.socket.TextMessage;
import org.springframework.web.socket.WebSocketSession;
import org.springframework.web.socket.handler.TextWebSocketHandler;

import java.util.Map;

@Component
public class LiveChatWebSocketHandler extends TextWebSocketHandler {

    private static final Logger log = LoggerFactory.getLogger(LiveChatWebSocketHandler.class);

    private final LiveChatBroker liveChatBroker;
    private final EngagementService engagementService;
    private final ObjectMapper objectMapper = new ObjectMapper();

    public LiveChatWebSocketHandler(
            LiveChatBroker liveChatBroker,
            EngagementService engagementService
    ) {
        this.liveChatBroker = liveChatBroker;
        this.engagementService = engagementService;
    }

    @Override
    public void afterConnectionEstablished(WebSocketSession session) {
        UserPrincipal principal = (UserPrincipal) session.getAttributes().get("principal");
        if (principal == null) {
            try {
                session.close(CloseStatus.NOT_ACCEPTABLE.withReason("Unauthorized"));
            } catch (Exception ignored) {
            }
            return;
        }
        liveChatBroker.registerUserSession(principal.uid(), session);
        liveChatBroker.sendToSession(session, Map.of(
                "type", "connected",
                "uid", principal.uid()
        ));
    }

    @Override
    protected void handleTextMessage(WebSocketSession session, TextMessage textMessage) {
        UserPrincipal principal = (UserPrincipal) session.getAttributes().get("principal");
        if (principal == null) return;

        try {
            Map<String, Object> payload = objectMapper.readValue(
                    textMessage.getPayload(),
                    new TypeReference<Map<String, Object>>() {}
            );
            String type = asString(payload.get("type"));
            if (type == null || type.isBlank()) return;

            switch (type) {
                case "ping" -> liveChatBroker.sendToSession(session, Map.of("type", "pong"));
                case "join" -> {
                    String threadKey = asString(payload.get("threadKey"));
                    if (threadKey != null && engagementService.canAccessThread(principal, threadKey)) {
                        liveChatBroker.joinRoom(threadKey, session);
                        liveChatBroker.sendToSession(session, Map.of(
                                "type", "joined",
                                "threadKey", threadKey
                        ));
                    } else {
                        liveChatBroker.sendToSession(session, Map.of(
                                "type", "error",
                                "error", "Permission denied for this conversation."
                        ));
                    }
                }
                case "leave" -> {
                    String threadKey = asString(payload.get("threadKey"));
                    if (threadKey != null) {
                        liveChatBroker.leaveRoom(threadKey, session);
                    }
                }
                case "chat:send" -> {
                    String threadKey = asString(payload.get("threadKey"));
                    String body = asString(payload.get("body"));
                    Long businessId = asLong(payload.get("businessId"));
                    Long listingId = asLong(payload.get("listingId"));
                    Long orderId = asLong(payload.get("orderId"));
                    Long bookingId = asLong(payload.get("bookingId"));
                    String recipientUid = asString(payload.get("recipientUid"));

                    if (body == null || body.isBlank()) {
                        liveChatBroker.sendToSession(session, Map.of(
                                "type", "error",
                                "error", "Message cannot be empty."
                        ));
                        return;
                    }
                    if (threadKey != null && !threadKey.isBlank()) {
                        liveChatBroker.joinRoom(threadKey, session);
                    }
                    SendMessageRequest req = new SendMessageRequest(
                            businessId,
                            listingId,
                            orderId,
                            bookingId,
                            threadKey,
                            recipientUid,
                            body
                    );
                    engagementService.sendMessage(principal, req);
                }
                default -> {
                    // Ignore unknown frame types gracefully
                }
            }
        } catch (ApiException ex) {
            liveChatBroker.sendToSession(session, Map.of(
                    "type", "error",
                    "error", ex.getMessage() != null ? ex.getMessage() : "Unable to process chat action."
            ));
        } catch (Exception ex) {
            log.debug("WebSocket message handling error: {}", ex.getMessage());
            liveChatBroker.sendToSession(session, Map.of(
                    "type", "error",
                    "error", "Unable to send message right now."
            ));
        }
    }

    @Override
    public void afterConnectionClosed(WebSocketSession session, CloseStatus status) {
        String uid = (String) session.getAttributes().get("uid");
        liveChatBroker.unregisterSession(uid, session);
    }

    @Override
    public void handleTransportError(WebSocketSession session, Throwable exception) {
        String uid = (String) session.getAttributes().get("uid");
        liveChatBroker.unregisterSession(uid, session);
    }

    private String asString(Object value) {
        return value == null ? null : String.valueOf(value);
    }

    private Long asLong(Object value) {
        if (value == null) return null;
        if (value instanceof Number num) return num.longValue();
        try {
            String raw = String.valueOf(value).trim();
            return raw.isEmpty() ? null : Long.parseLong(raw);
        } catch (NumberFormatException ex) {
            return null;
        }
    }
}
