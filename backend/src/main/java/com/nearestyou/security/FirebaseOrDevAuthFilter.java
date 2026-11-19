package com.nearestyou.security;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.google.auth.oauth2.GoogleCredentials;
import com.google.firebase.FirebaseApp;
import com.google.firebase.FirebaseOptions;
import com.google.firebase.auth.FirebaseAuth;
import com.google.firebase.auth.FirebaseToken;
import com.nearestyou.entity.UserAccount;
import com.nearestyou.service.UserSyncService;
import jakarta.annotation.PostConstruct;
import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.MediaType;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.stereotype.Component;
import org.springframework.web.filter.OncePerRequestFilter;

import java.io.ByteArrayInputStream;
import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.util.Map;
import java.util.Optional;

@Component
public class FirebaseOrDevAuthFilter extends OncePerRequestFilter {

    private static final Logger log = LoggerFactory.getLogger(FirebaseOrDevAuthFilter.class);

    private final UserSyncService userSyncService;
    private final LocalAuthTokenService localAuthTokenService;
    private final FirebasePublicKeyVerifier firebasePublicKeyVerifier;
    private final ObjectMapper objectMapper = new ObjectMapper();

    @Value("${nearestyou.auth.allow-dev-headers:false}")
    private boolean allowDevHeaders;

    private boolean firebaseInitialized = false;

    public FirebaseOrDevAuthFilter(
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

    @Override
    protected void doFilterInternal(
            HttpServletRequest request,
            HttpServletResponse response,
            FilterChain filterChain
    ) throws ServletException, IOException {
        String authHeader = request.getHeader("Authorization");
        UserAccount resolvedAccount = null;

        if (authHeader != null && authHeader.startsWith("Bearer ")) {
            String token = authHeader.substring(7).trim();
            if (localAuthTokenService.isLocalToken(token)) {
                Optional<LocalAuthTokenService.TokenClaims> claimsOpt = localAuthTokenService.verifyToken(token);
                if (claimsOpt.isEmpty()) {
                    writeJsonError(response, HttpServletResponse.SC_UNAUTHORIZED,
                            "Your session has expired. Please sign in again.");
                    return;
                }
                resolvedAccount = userSyncService.findByUid(claimsOpt.get().uid()).orElse(null);
                if (resolvedAccount == null) {
                    writeJsonError(response, HttpServletResponse.SC_UNAUTHORIZED,
                            "Account session is no longer valid. Please sign in again.");
                    return;
                }
            } else {
                String uid;
                String email;
                String fullName;
                try {
                    if (firebaseInitialized) {
                        FirebaseToken decoded = FirebaseAuth.getInstance().verifyIdToken(token);
                        uid = decoded.getUid();
                        email = decoded.getEmail() != null ? decoded.getEmail() : "user@nearestyou.et";
                        fullName = decoded.getName() != null ? decoded.getName() : email.split("@")[0];
                    } else {
                        FirebasePublicKeyVerifier.VerifiedFirebaseToken verified = firebasePublicKeyVerifier.verify(token);
                        uid = verified.uid();
                        email = verified.email() != null ? verified.email() : "user@nearestyou.et";
                        fullName = verified.name() != null ? verified.name() : email.split("@")[0];
                    }
                    resolvedAccount = userSyncService.syncOrCreateUser(uid, email, fullName);
                } catch (Exception ex) {
                    log.warn("Token verification failed for request {} {}: {}",
                            request.getMethod(), request.getRequestURI(), ex.getMessage());
                    writeJsonError(response, HttpServletResponse.SC_UNAUTHORIZED,
                            "Authentication failed. Please sign in again.");
                    return;
                }
            }
        } else if (allowDevHeaders) {
            String devUid = request.getHeader("X-Dev-User-Uid");
            String devEmail = request.getHeader("X-Dev-User-Email");
            if (devUid != null && !devUid.isBlank() && devEmail != null && !devEmail.isBlank()) {
                String devName = request.getHeader("X-Dev-User-Name");
                String fullName = (devName != null && !devName.isBlank()) ? devName.trim() : devEmail.trim().split("@")[0];
                resolvedAccount = userSyncService.syncOrCreateUser(devUid.trim(), devEmail.trim(), fullName);
            }
        }

        if (resolvedAccount != null) {
            if ("SUSPENDED".equalsIgnoreCase(resolvedAccount.getAccountStatus())) {
                writeJsonError(response, HttpServletResponse.SC_FORBIDDEN,
                        "Account is suspended by platform administration.");
                return;
            }
            UserPrincipal principal = new UserPrincipal(resolvedAccount);
            var authentication = new UsernamePasswordAuthenticationToken(
                    principal, null, principal.authorities());
            SecurityContextHolder.getContext().setAuthentication(authentication);
        }

        filterChain.doFilter(request, response);
    }

    private void writeJsonError(HttpServletResponse response, int status, String message) throws IOException {
        response.setStatus(status);
        response.setContentType(MediaType.APPLICATION_JSON_VALUE);
        response.getWriter().write(objectMapper.writeValueAsString(Map.of("error", message)));
    }
}
