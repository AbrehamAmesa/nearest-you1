package com.nearestyou.repository;

import com.nearestyou.entity.PlatformSetting;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.Optional;

public interface PlatformSettingRepository extends JpaRepository<PlatformSetting, Long> {
    Optional<PlatformSetting> findBySettingKey(String settingKey);
}
