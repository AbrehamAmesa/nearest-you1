package com.nearestyou.repository;

import com.nearestyou.entity.Favorite;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;
import java.util.Optional;

public interface FavoriteRepository extends JpaRepository<Favorite, Long> {
    List<Favorite> findByUserUidOrderByCreatedAtDesc(String userUid);
    Optional<Favorite> findByUserUidAndListingId(String userUid, Long listingId);
}
