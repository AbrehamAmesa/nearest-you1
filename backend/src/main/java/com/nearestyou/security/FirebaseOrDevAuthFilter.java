package com.nearestyou.security;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.nearestyou.entity.UserAccount;
import com.nearestyou.service.UserSyncService;
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

import java.io.IOException;
import java.util.Map;

@Component
public class FirebaseOrDevAuthFilter extends OncePerRequestFilter {

    private static final Logger log = LoggerFactory.getLogger(FirebaseOrDevAuthFilter.class);

    private final AuthTokenResolver authTokenResolver;
    private final UserSyncService userSyncService;
    private final ObjectMapper objectMapper = new ObjectMapper();

    @Value("${nearestyou.auth.allow-dev-headers:false}")
    private boolean allowDevHeaders;

    public FirebaseOrDevAuthFilter(
            AuthTokenResolver authTokenResolver,
            UserSyncService userSyncService
    ) {
        this.authTokenResolver = authTokenResolver;
        this.userSyncService = userSyncService;
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
            try {
                resolvedAccount = authTokenResolver.resolveBearerToken(token);
            } catch (Exception ex) {
                log.warn("Token verification failed for request {} {}: {}",
                        request.getMethod(), request.getRequestURI(), ex.getMessage());
                writeJsonError(response, HttpServletResponse.SC_UNAUTHORIZED,
                        ex instanceof SecurityException ? ex.getMessage() : "Authentication failed. Please sign in again.");
                return;
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
