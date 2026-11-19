package com.nearestyou.security;

import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.nearestyou.entity.UserAccount;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;

import javax.crypto.Mac;
import javax.crypto.spec.SecretKeySpec;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.time.Instant;
import java.util.Base64;
import java.util.LinkedHashMap;
import java.util.Map;
import java.util.Optional;

@Service
public class LocalAuthTokenService {

    private static final String TOKEN_PREFIX = "ny.";
    private static final long TOKEN_TTL_SECONDS = 7L * 24L * 3600L;

    private final byte[] secretKeyBytes;
    private final ObjectMapper objectMapper = new ObjectMapper();

    public record TokenClaims(String uid, String email) {}

    public LocalAuthTokenService(
            @Value("${nearestyou.auth.token-secret:}") String configuredSecret,
            @Value("${spring.datasource.password:Postgres@1234}") String fallbackSeed
    ) {
        String material = (configuredSecret != null && !configuredSecret.isBlank())
                ? configuredSecret.trim()
                : "nearest-you-local-auth-v1:" + fallbackSeed;
        try {
            MessageDigest sha256 = MessageDigest.getInstance("SHA-256");
            this.secretKeyBytes = sha256.digest(material.getBytes(StandardCharsets.UTF_8));
        } catch (Exception ex) {
            throw new IllegalStateException("Failed to initialize token signing key", ex);
        }
    }

    public boolean isLocalToken(String token) {
        return token != null && token.startsWith(TOKEN_PREFIX);
    }

    public String issueToken(UserAccount user) {
        try {
            long now = Instant.now().getEpochSecond();
            Map<String, Object> payload = new LinkedHashMap<>();
            payload.put("uid", user.getUid());
            payload.put("email", user.getEmail());
            payload.put("iat", now);
            payload.put("exp", now + TOKEN_TTL_SECONDS);

            String encodedPayload = Base64.getUrlEncoder()
                    .withoutPadding()
                    .encodeToString(objectMapper.writeValueAsBytes(payload));
            String signature = sign(encodedPayload);
            return TOKEN_PREFIX + encodedPayload + "." + signature;
        } catch (Exception ex) {
            throw new IllegalStateException("Failed to sign session token", ex);
        }
    }

    public Optional<TokenClaims> verifyToken(String token) {
        if (!isLocalToken(token)) {
            return Optional.empty();
        }
        try {
            String body = token.substring(TOKEN_PREFIX.length());
            int dotIndex = body.indexOf('.');
            if (dotIndex <= 0 || dotIndex >= body.length() - 1) {
                return Optional.empty();
            }
            String encodedPayload = body.substring(0, dotIndex);
            String providedSig = body.substring(dotIndex + 1);
            String expectedSig = sign(encodedPayload);

            if (!MessageDigest.isEqual(
                    providedSig.getBytes(StandardCharsets.UTF_8),
                    expectedSig.getBytes(StandardCharsets.UTF_8)
            )) {
                return Optional.empty();
            }

            byte[] payloadBytes = Base64.getUrlDecoder().decode(encodedPayload);
            Map<String, Object> claims = objectMapper.readValue(
                    payloadBytes,
                    new TypeReference<Map<String, Object>>() {}
            );

            Object expObj = claims.get("exp");
            long exp = (expObj instanceof Number n) ? n.longValue() : 0L;
            if (exp <= Instant.now().getEpochSecond()) {
                return Optional.empty();
            }

            String uid = claims.get("uid") != null ? String.valueOf(claims.get("uid")) : "";
            String email = claims.get("email") != null ? String.valueOf(claims.get("email")) : "";
            if (uid.isBlank()) {
                return Optional.empty();
            }
            return Optional.of(new TokenClaims(uid, email));
        } catch (Exception ex) {
            return Optional.empty();
        }
    }

    private String sign(String encodedPayload) throws Exception {
        Mac mac = Mac.getInstance("HmacSHA256");
        mac.init(new SecretKeySpec(secretKeyBytes, "HmacSHA256"));
        byte[] sigBytes = mac.doFinal(encodedPayload.getBytes(StandardCharsets.UTF_8));
        return Base64.getUrlEncoder().withoutPadding().encodeToString(sigBytes);
    }
}
