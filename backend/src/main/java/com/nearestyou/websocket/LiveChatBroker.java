package com.nearestyou.websocket;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.SerializationFeature;
import com.fasterxml.jackson.datatype.jsr310.JavaTimeModule;
import com.nearestyou.entity.Message;
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

    public void broadcastMessage(Message msg, String senderUid, String recipientUid, String ownerUid) {
        if (msg == null) return;
        String threadKey = msg.getThreadKey();
        Map<String, Object> envelope = new LinkedHashMap<>();
        envelope.put("type", "chat:message");
        envelope.put("threadKey", threadKey);
        envelope.put("message", msg);

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

        for (String targetUid : List.of(
                senderUid != null ? senderUid : "",
                recipientUid != null ? recipientUid : "",
                ownerUid != null ? ownerUid : ""
        )) {
            if (targetUid.isBlank()) continue;
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
