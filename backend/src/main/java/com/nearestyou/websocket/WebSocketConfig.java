package com.nearestyou.websocket;

import com.nearestyou.entity.UserAccount;
import com.nearestyou.security.AuthTokenResolver;
import com.nearestyou.security.UserPrincipal;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.http.HttpStatus;
import org.springframework.http.server.ServerHttpRequest;
import org.springframework.http.server.ServerHttpResponse;
import org.springframework.web.socket.WebSocketHandler;
import org.springframework.web.socket.config.annotation.EnableWebSocket;
import org.springframework.web.socket.config.annotation.WebSocketConfigurer;
import org.springframework.web.socket.config.annotation.WebSocketHandlerRegistry;
import org.springframework.web.socket.server.HandshakeInterceptor;
import org.springframework.web.socket.server.standard.ServletServerContainerFactoryBean;
import org.springframework.web.util.UriComponentsBuilder;

import java.net.URLDecoder;
import java.nio.charset.StandardCharsets;
import java.util.List;
import java.util.Map;

@Configuration
@EnableWebSocket
public class WebSocketConfig implements WebSocketConfigurer {

    private static final Logger log = LoggerFactory.getLogger(WebSocketConfig.class);

    private final LiveChatWebSocketHandler liveChatWebSocketHandler;
    private final AuthTokenResolver authTokenResolver;

    public WebSocketConfig(
            LiveChatWebSocketHandler liveChatWebSocketHandler,
            AuthTokenResolver authTokenResolver
    ) {
        this.liveChatWebSocketHandler = liveChatWebSocketHandler;
        this.authTokenResolver = authTokenResolver;
    }

    @Override
    public void registerWebSocketHandlers(WebSocketHandlerRegistry registry) {
        HandshakeInterceptor authInterceptor = new HandshakeInterceptor() {
            @Override
            public boolean beforeHandshake(
                    ServerHttpRequest request,
                    ServerHttpResponse response,
                    WebSocketHandler wsHandler,
                    Map<String, Object> attributes
            ) {
                String token = extractToken(request);
                if (token == null || token.isBlank()) {
                    response.setStatusCode(HttpStatus.UNAUTHORIZED);
                    return false;
                }
                try {
                    UserAccount account = authTokenResolver.resolveBearerToken(token);
                    if ("SUSPENDED".equalsIgnoreCase(account.getAccountStatus())) {
                        response.setStatusCode(HttpStatus.FORBIDDEN);
                        return false;
                    }
                    UserPrincipal principal = new UserPrincipal(account);
                    attributes.put("principal", principal);
                    attributes.put("uid", principal.uid());
                    return true;
                } catch (Exception ex) {
                    log.debug("WebSocket handshake rejected: {}", ex.getMessage());
                    response.setStatusCode(HttpStatus.UNAUTHORIZED);
                    return false;
                }
            }

            @Override
            public void afterHandshake(
                    ServerHttpRequest request,
                    ServerHttpResponse response,
                    WebSocketHandler wsHandler,
                    Exception exception
            ) {
                // No-op
            }
        };

        registry.addHandler(liveChatWebSocketHandler, "/api/v1/ws/chat", "/ws/chat")
                .addInterceptors(authInterceptor)
                .setAllowedOriginPatterns("*");
    }

    @Bean
    public ServletServerContainerFactoryBean createWebSocketContainer() {
        ServletServerContainerFactoryBean container = new ServletServerContainerFactoryBean();
        container.setMaxTextMessageBufferSize(4 * 1024 * 1024);
        container.setMaxBinaryMessageBufferSize(4 * 1024 * 1024);
        return container;
    }

    private String extractToken(ServerHttpRequest request) {
        List<String> authHeaders = request.getHeaders().get("Authorization");
        if (authHeaders != null) {
            for (String header : authHeaders) {
                if (header != null && header.startsWith("Bearer ")) {
                    return header.substring(7).trim();
                }
            }
        }
        String rawToken = UriComponentsBuilder.fromUri(request.getURI())
                .build()
                .getQueryParams()
                .getFirst("token");
        if (rawToken == null || rawToken.isBlank()) return null;
        try {
            return URLDecoder.decode(rawToken, StandardCharsets.UTF_8);
        } catch (Exception ex) {
            return rawToken;
        }
    }
}
