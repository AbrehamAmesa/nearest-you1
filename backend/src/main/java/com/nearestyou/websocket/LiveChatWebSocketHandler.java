package com.nearestyou.websocket;

import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.nearestyou.dto.NearestYouDtos.SendMessageRequest;
import com.nearestyou.exception.ApiException;
import com.nearestyou.security.UserPrincipal;
import com.nearestyou.service.EngagementService;
import com.nearestyou.service.UserSyncService;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Component;
import org.springframework.web.socket.CloseStatus;
import org.springframework.web.socket.TextMessage;
import org.springframework.web.socket.WebSocketSession;
import org.springframework.web.socket.handler.TextWebSocketHandler;

import java.time.Instant;
import java.util.Map;

@Component
public class LiveChatWebSocketHandler extends TextWebSocketHandler {

    private static final Logger log = LoggerFactory.getLogger(LiveChatWebSocketHandler.class);

    private final LiveChatBroker liveChatBroker;
    private final EngagementService engagementService;
    private final UserSyncService userSyncService;
    private final ObjectMapper objectMapper = new ObjectMapper();

    public LiveChatWebSocketHandler(
            LiveChatBroker liveChatBroker,
            EngagementService engagementService,
            UserSyncService userSyncService
    ) {
        this.liveChatBroker = liveChatBroker;
        this.engagementService = engagementService;
        this.userSyncService = userSyncService;
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
        String firebaseUid = principal.account() != null ? principal.account().getFirebaseUid() : null;
        if (firebaseUid != null && !firebaseUid.isBlank() && !firebaseUid.equals(principal.uid())) {
            liveChatBroker.registerUserSession(firebaseUid, session);
        }
        userSyncService.touchUserPresence(principal.uid(), true);
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
                case "ping" -> {
                    userSyncService.touchUserPresence(principal.uid(), false);
                    liveChatBroker.sendToSession(session, Map.of(
                            "type", "pong",
                            "lastSeenAt", Instant.now().toString()
                    ));
                }
                case "join" -> {
                    userSyncService.touchUserPresence(principal.uid(), false);
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
                    String messageType = asString(payload.get("messageType"));
                    String audioDataUrl = asString(payload.get("audioDataUrl"));
                    Integer audioDurationSeconds = asInteger(payload.get("audioDurationSeconds"));
                    Long businessId = asLong(payload.get("businessId"));
                    Long listingId = asLong(payload.get("listingId"));
                    Long orderId = asLong(payload.get("orderId"));
                    Long bookingId = asLong(payload.get("bookingId"));
                    String recipientUid = asString(payload.get("recipientUid"));

                    boolean hasVoice = audioDataUrl != null && !audioDataUrl.isBlank();
                    if ((body == null || body.isBlank()) && !hasVoice) {
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
                            body,
                            messageType,
                            audioDataUrl,
                            audioDurationSeconds
                    );
                    engagementService.sendMessage(principal, req);
                    userSyncService.touchUserPresence(principal.uid(), true);
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
        UserPrincipal principal = (UserPrincipal) session.getAttributes().get("principal");
        String uid = (String) session.getAttributes().get("uid");
        liveChatBroker.unregisterSession(uid, session);
        String firebaseUid = principal != null && principal.account() != null ? principal.account().getFirebaseUid() : null;
        if (firebaseUid != null && !firebaseUid.isBlank() && !firebaseUid.equals(uid)) {
            liveChatBroker.unregisterSession(firebaseUid, session);
        }
        userSyncService.touchUserPresence(uid, true);
    }

    @Override
    public void handleTransportError(WebSocketSession session, Throwable exception) {
        UserPrincipal principal = (UserPrincipal) session.getAttributes().get("principal");
        String uid = (String) session.getAttributes().get("uid");
        liveChatBroker.unregisterSession(uid, session);
        String firebaseUid = principal != null && principal.account() != null ? principal.account().getFirebaseUid() : null;
        if (firebaseUid != null && !firebaseUid.isBlank() && !firebaseUid.equals(uid)) {
            liveChatBroker.unregisterSession(firebaseUid, session);
        }
        userSyncService.touchUserPresence(uid, true);
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

    private Integer asInteger(Object value) {
        if (value == null) return null;
        if (value instanceof Number num) return num.intValue();
        try {
            String raw = String.valueOf(value).trim();
            return raw.isEmpty() ? null : Integer.parseInt(raw);
        } catch (NumberFormatException ex) {
            return null;
        }
    }
}
