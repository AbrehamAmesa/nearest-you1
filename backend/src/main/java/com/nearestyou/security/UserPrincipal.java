package com.nearestyou.security;

import com.nearestyou.entity.UserAccount;
import org.springframework.security.core.GrantedAuthority;
import org.springframework.security.core.authority.SimpleGrantedAuthority;

import java.util.Collection;
import java.util.HashSet;
import java.util.Set;
import java.util.stream.Collectors;

public record UserPrincipal(UserAccount account) {

    public String uid() {
        return account.getUid();
    }

    public String email() {
        return account.getEmail();
    }

    public boolean isAdmin() {
        if (account.isAdmin()) return true;
        return account.getRoles() != null &&
                (account.getRoles().contains("ADMIN") || account.getRoles().contains("SUPER_ADMIN"));
    }

    public boolean hasRole(String role) {
        if (isAdmin()) return true;
        return account.getRoles() != null && account.getRoles().contains(role);
    }

    public Collection<GrantedAuthority> authorities() {
        Set<String> roleNames = new HashSet<>();
        roleNames.add("CUSTOMER");
        if (account.getRoles() != null) {
            roleNames.addAll(account.getRoles());
        }
        if (account.isAdmin()) {
            roleNames.add("ADMIN");
        }
        return roleNames.stream()
                .map(r -> new SimpleGrantedAuthority("ROLE_" + r.toUpperCase()))
                .collect(Collectors.toSet());
    }
}
