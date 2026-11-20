package com.nearestyou.service;

import com.nearestyou.dto.NearestYouDtos.ChangePasswordRequest;
import com.nearestyou.dto.NearestYouDtos.LoginRequest;
import com.nearestyou.dto.NearestYouDtos.RegisterRequest;
import com.nearestyou.dto.NearestYouDtos.UpdateProfileRequest;
import com.nearestyou.entity.Business;
import com.nearestyou.entity.UserAccount;
import com.nearestyou.exception.ApiException;
import com.nearestyou.repository.BusinessRepository;
import com.nearestyou.repository.UserAccountRepository;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.HttpStatus;
import org.springframework.security.crypto.bcrypt.BCryptPasswordEncoder;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.*;

@Service
public class UserSyncService {

    private final UserAccountRepository userRepo;
    private final BusinessRepository businessRepo;
    private final PasswordEncoder passwordEncoder = new BCryptPasswordEncoder();
    private final Set<String> superAdminEmails = new HashSet<>();

    public UserSyncService(
            UserAccountRepository userRepo,
            BusinessRepository businessRepo,
            @Value("${nearestyou.auth.super-admin-emails:abrehamamesw@gmail.com,admin@nearestyou.et}") String superAdmins
    ) {
        this.userRepo = userRepo;
        this.businessRepo = businessRepo;
        for (String email : superAdmins.split(",")) {
            if (!email.isBlank()) {
                this.superAdminEmails.add(email.trim().toLowerCase(Locale.ROOT));
            }
        }
    }

    public boolean isSuperAdminEmail(String email) {
        return email != null && superAdminEmails.contains(email.trim().toLowerCase(Locale.ROOT));
    }

    @Transactional
    public UserAccount syncOrCreateUser(String externalUid, String email, String fullName) {
        String normalizedEmail = email == null ? "" : email.trim().toLowerCase(Locale.ROOT);
        boolean bootstrapAdmin = isSuperAdminEmail(normalizedEmail);

        Optional<UserAccount> existingOpt = userRepo.findByFirebaseUid(externalUid);
        if (existingOpt.isEmpty()) {
            existingOpt = userRepo.findByUid(externalUid);
        }
        if (existingOpt.isEmpty() && !normalizedEmail.isEmpty()) {
            existingOpt = userRepo.findFirstByEmailIgnoreCase(normalizedEmail);
        }

        if (existingOpt.isPresent()) {
            UserAccount existing = existingOpt.get();
            Set<String> mergedRoles = new LinkedHashSet<>();
            mergedRoles.add("CUSTOMER");
            if (existing.getRoles() != null) {
                mergedRoles.addAll(existing.getRoles());
            }
            if (bootstrapAdmin) {
                mergedRoles.add("ADMIN");
                mergedRoles.add("SUPER_ADMIN");
            } else if (existing.isAdmin() && !mergedRoles.contains("ADMIN")) {
                mergedRoles.add("ADMIN");
            }
            boolean nextIsAdmin = existing.isAdmin() || bootstrapAdmin || mergedRoles.contains("ADMIN") || mergedRoles.contains("SUPER_ADMIN");

            if (existing.getUid() == null || existing.getUid().isBlank()) {
                existing.setUid(externalUid);
            }
            if (externalUid != null && !externalUid.isBlank()) {
                existing.setFirebaseUid(externalUid);
            }
            if (!normalizedEmail.isEmpty()) {
                existing.setEmail(normalizedEmail);
            }
            if ((existing.getFullName() == null || existing.getFullName().isBlank()) && fullName != null) {
                existing.setFullName(fullName);
            }
            existing.setAdmin(nextIsAdmin);
            existing.setRoles(new ArrayList<>(mergedRoles));
            return userRepo.save(existing);
        }

        UserAccount created = new UserAccount();
        created.setUid(externalUid);
        created.setFirebaseUid(externalUid);
        created.setEmail(normalizedEmail.isEmpty() ? "user@nearestyou.et" : normalizedEmail);
        created.setFullName(fullName != null && !fullName.isBlank() ? fullName : "Nearest You User");
        created.setAdmin(bootstrapAdmin);
        if (bootstrapAdmin) {
            created.setRoles(new ArrayList<>(List.of("CUSTOMER", "ADMIN", "SUPER_ADMIN")));
        } else {
            created.setRoles(new ArrayList<>(List.of("CUSTOMER")));
        }
        return userRepo.save(created);
    }

    @Transactional
    public UserAccount registerWithPassword(RegisterRequest req) {
        String normalizedEmail = req.email().trim().toLowerCase(Locale.ROOT);
        if (normalizedEmail.isEmpty()) {
            throw new ApiException(HttpStatus.BAD_REQUEST, "Please enter a valid email address.");
        }
        if (userRepo.findFirstByEmailIgnoreCase(normalizedEmail).isPresent()) {
            throw new ApiException(HttpStatus.CONFLICT, "An account with this email already exists. Try signing in instead.");
        }

        boolean bootstrapAdmin = isSuperAdminEmail(normalizedEmail);
        UserAccount created = new UserAccount();
        created.setUid("usr_" + UUID.randomUUID().toString().replace("-", ""));
        created.setEmail(normalizedEmail);
        created.setFullName(req.fullName().trim());
        created.setPasswordHash(passwordEncoder.encode(req.password()));
        if (req.phoneNumber() != null && !req.phoneNumber().isBlank()) {
            created.setPhoneNumber(req.phoneNumber().trim());
        }
        if (req.preferredLanguage() != null && ("en".equals(req.preferredLanguage()) || "am".equals(req.preferredLanguage()) || "om".equals(req.preferredLanguage()))) {
            created.setPreferredLanguage(req.preferredLanguage());
        }
        if (req.defaultSubCity() != null && !req.defaultSubCity().isBlank()) {
            created.setDefaultSubCity(req.defaultSubCity().trim());
        }
        if (req.defaultLat() != null) {
            created.setDefaultLat(req.defaultLat());
        }
        if (req.defaultLng() != null) {
            created.setDefaultLng(req.defaultLng());
        }
        created.setAdmin(bootstrapAdmin);
        if (bootstrapAdmin) {
            created.setRoles(new ArrayList<>(List.of("CUSTOMER", "ADMIN", "SUPER_ADMIN")));
        } else {
            created.setRoles(new ArrayList<>(List.of("CUSTOMER")));
        }
        return userRepo.save(created);
    }

    @Transactional
    public UserAccount authenticateWithPassword(LoginRequest req) {
        String normalizedEmail = req.email().trim().toLowerCase(Locale.ROOT);
        UserAccount user = userRepo.findFirstByEmailIgnoreCase(normalizedEmail)
                .orElseThrow(() -> new ApiException(HttpStatus.UNAUTHORIZED, "Invalid email or password. Please check your credentials and try again."));

        if (user.getPasswordHash() == null || user.getPasswordHash().isBlank()
                || !passwordEncoder.matches(req.password(), user.getPasswordHash())) {
            throw new ApiException(HttpStatus.UNAUTHORIZED, "Invalid email or password. Please check your credentials and try again.");
        }

        if ("SUSPENDED".equalsIgnoreCase(user.getAccountStatus())) {
            throw new ApiException(HttpStatus.FORBIDDEN, "Account is suspended by platform administration.");
        }

        if (isSuperAdminEmail(normalizedEmail)) {
            Set<String> mergedRoles = new LinkedHashSet<>();
            mergedRoles.add("CUSTOMER");
            if (user.getRoles() != null) {
                mergedRoles.addAll(user.getRoles());
            }
            mergedRoles.add("ADMIN");
            mergedRoles.add("SUPER_ADMIN");
            user.setAdmin(true);
            user.setRoles(new ArrayList<>(mergedRoles));
            return userRepo.save(user);
        }

        return user;
    }

    @Transactional
    public UserAccount syncPasswordForAuthenticatedUser(String uid, String rawPassword) {
        UserAccount user = userRepo.findByUid(uid)
                .orElseThrow(() -> new ApiException(HttpStatus.NOT_FOUND, "User profile not found."));
        user.setPasswordHash(passwordEncoder.encode(rawPassword));
        return userRepo.save(user);
    }

    @Transactional
    public UserAccount changePasswordForAuthenticatedUser(String uid, ChangePasswordRequest req) {
        UserAccount user = userRepo.findByUid(uid)
                .orElseThrow(() -> new ApiException(HttpStatus.NOT_FOUND, "User profile not found."));
        if (user.getPasswordHash() != null && !user.getPasswordHash().isBlank()) {
            if (req.currentPassword() == null || !passwordEncoder.matches(req.currentPassword(), user.getPasswordHash())) {
                throw new ApiException(HttpStatus.BAD_REQUEST, "Current password is incorrect.");
            }
        }
        user.setPasswordHash(passwordEncoder.encode(req.newPassword()));
        return userRepo.save(user);
    }

    @Transactional(readOnly = true)
    public Optional<UserAccount> findByUid(String uid) {
        return userRepo.findByUid(uid);
    }

    @Transactional
    public UserAccount updateProfileWhitelist(String uid, UpdateProfileRequest req) {
        UserAccount user = userRepo.findByUid(uid)
                .orElseThrow(() -> new ApiException(HttpStatus.NOT_FOUND, "User profile not found."));
        if (req.fullName() != null && !req.fullName().isBlank()) {
            user.setFullName(req.fullName().trim());
        }
        if (req.phoneNumber() != null) {
            user.setPhoneNumber(req.phoneNumber().trim());
        }
        if (req.preferredLanguage() != null && ("en".equals(req.preferredLanguage()) || "am".equals(req.preferredLanguage()) || "om".equals(req.preferredLanguage()))) {
            user.setPreferredLanguage(req.preferredLanguage());
        }
        if (req.defaultSubCity() != null && !req.defaultSubCity().isBlank()) {
            user.setDefaultSubCity(req.defaultSubCity().trim());
        }
        if (req.defaultLat() != null) {
            user.setDefaultLat(req.defaultLat());
        }
        if (req.defaultLng() != null) {
            user.setDefaultLng(req.defaultLng());
        }
        if (req.profilePhotoUrl() != null) {
            String trimmedPhoto = req.profilePhotoUrl().trim();
            user.setProfilePhotoUrl(trimmedPhoto.isEmpty() ? null : trimmedPhoto);
        }
        UserAccount saved = userRepo.save(user);
        if (req.fullName() != null && !req.fullName().isBlank()) {
            String nextName = req.fullName().trim();
            for (Business biz : businessRepo.findByOwnerUidOrderByIdAsc(uid)) {
                if ("INDIVIDUAL_JOB_SEEKER".equalsIgnoreCase(biz.getProfileType())) {
                    biz.setBusinessName(nextName);
                    businessRepo.save(biz);
                }
            }
        }
        return saved;
    }

    @Transactional
    public void grantRoleToUid(String uid, String role) {
        userRepo.findByUid(uid).ifPresent(user -> {
            Set<String> roles = new LinkedHashSet<>();
            roles.add("CUSTOMER");
            if (user.getRoles() != null) {
                roles.addAll(user.getRoles());
            }
            roles.add(role);
            user.setRoles(new ArrayList<>(roles));
            userRepo.save(user);
        });
    }

    @Transactional
    public void revokeRolesFromUid(String uid, Collection<String> rolesToRemove) {
        if (uid == null || rolesToRemove == null || rolesToRemove.isEmpty()) return;
        userRepo.findByUid(uid).ifPresent(user -> {
            Set<String> roles = new LinkedHashSet<>();
            roles.add("CUSTOMER");
            if (user.getRoles() != null) {
                for (String r : user.getRoles()) {
                    if (!rolesToRemove.contains(r)) {
                        roles.add(r);
                    }
                }
            }
            roles.add("CUSTOMER");
            user.setRoles(new ArrayList<>(roles));
            userRepo.save(user);
        });
    }
}
