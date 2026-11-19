package com.nearestyou.security;

import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;

import java.io.ByteArrayInputStream;
import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.nio.charset.StandardCharsets;
import java.security.PublicKey;
import java.security.Signature;
import java.security.cert.CertificateFactory;
import java.security.cert.X509Certificate;
import java.time.Duration;
import java.time.Instant;
import java.util.Base64;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

@Component
public class FirebasePublicKeyVerifier {

    private static final String GOOGLE_CERTS_URL =
            "https://www.googleapis.com/robot/v1/metadata/x509/securetoken@system.gserviceaccount.com";
    private static final Pattern MAX_AGE_PATTERN = Pattern.compile("max-age=(\\d+)");

    private final String projectId;
    private final ObjectMapper objectMapper = new ObjectMapper();
    private final HttpClient httpClient = HttpClient.newBuilder()
            .connectTimeout(Duration.ofSeconds(5))
            .build();

    private volatile Map<String, PublicKey> cachedKeys = Map.of();
    private volatile long cacheExpiresAtEpoch = 0L;

    public record VerifiedFirebaseToken(String uid, String email, String name) {}

    public FirebasePublicKeyVerifier(
            @Value("${nearestyou.auth.firebase-project-id:nearestyou}") String projectId
    ) {
        this.projectId = projectId != null ? projectId.trim() : "nearestyou";
    }

    public VerifiedFirebaseToken verify(String idToken) throws Exception {
        if (projectId.isBlank()) {
            throw new IllegalStateException("Firebase project ID is not configured.");
        }
        String[] parts = idToken.split("\\.");
        if (parts.length != 3) {
            throw new IllegalArgumentException("Malformed JWT.");
        }

        byte[] headerBytes = Base64.getUrlDecoder().decode(parts[0]);
        byte[] payloadBytes = Base64.getUrlDecoder().decode(parts[1]);
        byte[] signatureBytes = Base64.getUrlDecoder().decode(parts[2]);

        Map<String, Object> header = objectMapper.readValue(
                headerBytes, new TypeReference<Map<String, Object>>() {});
        String alg = String.valueOf(header.getOrDefault("alg", ""));
        String kid = String.valueOf(header.getOrDefault("kid", ""));
        if (!"RS256".equals(alg) || kid.isBlank()) {
            throw new IllegalArgumentException("Unsupported Firebase token header.");
        }

        PublicKey key = resolvePublicKey(kid);
        if (key == null) {
            throw new IllegalArgumentException("Signing key not found for Firebase token.");
        }

        Signature verifier = Signature.getInstance("SHA256withRSA");
        verifier.initVerify(key);
        verifier.update((parts[0] + "." + parts[1]).getBytes(StandardCharsets.UTF_8));
        if (!verifier.verify(signatureBytes)) {
            throw new SecurityException("Invalid Firebase token signature.");
        }

        Map<String, Object> claims = objectMapper.readValue(
                payloadBytes, new TypeReference<Map<String, Object>>() {});

        String aud = String.valueOf(claims.getOrDefault("aud", ""));
        String iss = String.valueOf(claims.getOrDefault("iss", ""));
        String sub = String.valueOf(claims.getOrDefault("sub", ""));
        long now = Instant.now().getEpochSecond();
        long exp = (claims.get("exp") instanceof Number n) ? n.longValue() : 0L;
        long iat = (claims.get("iat") instanceof Number n) ? n.longValue() : 0L;

        if (!projectId.equals(aud)) {
            throw new SecurityException("Firebase token audience mismatch.");
        }
        if (!("https://securetoken.google.com/" + projectId).equals(iss)) {
            throw new SecurityException("Firebase token issuer mismatch.");
        }
        if (sub.isBlank()) {
            throw new SecurityException("Firebase token missing subject.");
        }
        if (exp <= now) {
            throw new SecurityException("Firebase token expired.");
        }
        if (iat > now + 300) {
            throw new SecurityException("Firebase token issued in the future.");
        }

        String email = claims.get("email") != null ? String.valueOf(claims.get("email")) : null;
        String name = claims.get("name") != null ? String.valueOf(claims.get("name")) : null;
        return new VerifiedFirebaseToken(sub, email, name);
    }

    private PublicKey resolvePublicKey(String kid) throws Exception {
        long now = Instant.now().getEpochSecond();
        if (now < cacheExpiresAtEpoch && cachedKeys.containsKey(kid)) {
            return cachedKeys.get(kid);
        }
        synchronized (this) {
            long currentNow = Instant.now().getEpochSecond();
            if (currentNow < cacheExpiresAtEpoch && cachedKeys.containsKey(kid)) {
                return cachedKeys.get(kid);
            }
            refreshCertificates();
            return cachedKeys.get(kid);
        }
    }

    private void refreshCertificates() throws Exception {
        HttpRequest req = HttpRequest.newBuilder()
                .uri(URI.create(GOOGLE_CERTS_URL))
                .timeout(Duration.ofSeconds(6))
                .GET()
                .build();
        HttpResponse<String> res = httpClient.send(req, HttpResponse.BodyHandlers.ofString());
        if (res.statusCode() < 200 || res.statusCode() >= 300) {
            throw new IllegalStateException("Failed to fetch Google public certificates: HTTP " + res.statusCode());
        }

        Map<String, String> pemMap = objectMapper.readValue(
                res.body(), new TypeReference<Map<String, String>>() {});
        CertificateFactory cf = CertificateFactory.getInstance("X.509");
        Map<String, PublicKey> nextKeys = new ConcurrentHashMap<>();
        for (Map.Entry<String, String> entry : pemMap.entrySet()) {
            byte[] certBytes = entry.getValue().getBytes(StandardCharsets.UTF_8);
            X509Certificate cert = (X509Certificate) cf.generateCertificate(new ByteArrayInputStream(certBytes));
            nextKeys.put(entry.getKey(), cert.getPublicKey());
        }

        long maxAge = 3600L;
        String cacheControl = res.headers().firstValue("Cache-Control").orElse("");
        Matcher m = MAX_AGE_PATTERN.matcher(cacheControl);
        if (m.find()) {
            try {
                maxAge = Math.max(60L, Long.parseLong(m.group(1)));
            } catch (NumberFormatException ignored) {}
        }

        this.cachedKeys = nextKeys;
        this.cacheExpiresAtEpoch = Instant.now().getEpochSecond() + maxAge;
    }
}
