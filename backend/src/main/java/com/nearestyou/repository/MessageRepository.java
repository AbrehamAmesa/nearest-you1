package com.nearestyou.repository;

import com.nearestyou.entity.Message;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;

public interface MessageRepository extends JpaRepository<Message, Long> {
    List<Message> findAllByOrderByCreatedAtDesc();
}
