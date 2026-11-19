package com.nearestyou.security;

import com.google.auth.oauth2.GoogleCredentials;
import com.google.firebase.FirebaseApp;
import com.google.firebase.FirebaseOptions;
import com.google.firebase.auth.FirebaseAuth;
import com.google.firebase.auth.FirebaseToken;
import com.nearestyou.entity.UserAccount;
import com.nearestyou.service.UserSyncService;
import jakarta.annotation.PostConstruct;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Component;

import java.io.ByteArrayInputStream;
import java.nio.charset.StandardCharsets;
import java.util.Optional;

@Component
public class AuthTokenResolver {

    private static final Logger log = LoggerFactory.getLogger(AuthTokenResolver.class);

    private final UserSyncService userSyncService;
    private final LocalAuthTokenService localAuthTokenService;
    private final FirebasePublicKeyVerifier firebasePublicKeyVerifier;

    private volatile boolean firebaseInitialized = false;

    public AuthTokenResolver(
            UserSyncService userSyncService,
            LocalAuthTokenService localAuthTokenService,
            FirebasePublicKeyVerifier firebasePublicKeyVerifier
    ) {
        this.userSyncService = userSyncService;
        this.localAuthTokenService = localAuthTokenService;
        this.firebasePublicKeyVerifier = firebasePublicKeyVerifier;
    }

    @PostConstruct
    public void initFirebase() {
        try {
            if (!FirebaseApp.getApps().isEmpty()) {
                firebaseInitialized = true;
                return;
            }
            String inlineJson = System.getenv("FIREBASE_SERVICE_ACCOUNT_JSON");
            if (inlineJson != null && !inlineJson.isBlank()) {
                FirebaseOptions options = FirebaseOptions.builder()
                        .setCredentials(GoogleCredentials.fromStream(
                                new ByteArrayInputStream(inlineJson.getBytes(StandardCharsets.UTF_8))))
                        .build();
                FirebaseApp.initializeApp(options);
                firebaseInitialized = true;
            } else if (System.getenv("GOOGLE_APPLICATION_CREDENTIALS") != null) {
                FirebaseOptions options = FirebaseOptions.builder()
                        .setCredentials(GoogleCredentials.getApplicationDefault())
                        .build();
                FirebaseApp.initializeApp(options);
                firebaseInitialized = true;
            }
            if (!firebaseInitialized) {
                log.info("Firebase Admin service account not configured; using Google public certificates + local database authentication.");
            } else {
                log.info("Firebase Admin SDK initialized successfully.");
            }
        } catch (Exception ex) {
            firebaseInitialized = false;
            log.warn("Firebase Admin SDK initialization failed; falling back to Google public certificates + local database authentication.", ex);
        }
    }

    public UserAccount resolveBearerToken(String token) throws Exception {
        if (token == null || token.isBlank()) {
            throw new SecurityException("Missing authentication token.");
        }
        String trimmed = token.trim();
        if (localAuthTokenService.isLocalToken(trimmed)) {
            Optional<LocalAuthTokenService.TokenClaims> claimsOpt = localAuthTokenService.verifyToken(trimmed);
            if (claimsOpt.isEmpty()) {
                throw new SecurityException("Your session has expired. Please sign in again.");
            }
            return userSyncService.findByUid(claimsOpt.get().uid())
                    .orElseThrow(() -> new SecurityException("Account session is no longer valid. Please sign in again."));
        }

        String uid;
        String email;
        String fullName;
        if (firebaseInitialized) {
            FirebaseToken decoded = FirebaseAuth.getInstance().verifyIdToken(trimmed);
            uid = decoded.getUid();
            email = decoded.getEmail() != null ? decoded.getEmail() : "user@nearestyou.et";
            fullName = decoded.getName() != null ? decoded.getName() : email.split("@")[0];
        } else {
            FirebasePublicKeyVerifier.VerifiedFirebaseToken verified = firebasePublicKeyVerifier.verify(trimmed);
            uid = verified.uid();
            email = verified.email() != null ? verified.email() : "user@nearestyou.et";
            fullName = verified.name() != null ? verified.name() : email.split("@")[0];
        }
        return userSyncService.syncOrCreateUser(uid, email, fullName);
    }
}
