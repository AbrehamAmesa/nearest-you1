package com.nearestyou.repository;

import com.nearestyou.entity.Message;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;

public interface MessageRepository extends JpaRepository<Message, Long> {
    List<Message> findAllByOrderByCreatedAtDesc();
    List<Message> findAllByOrderByCreatedAtAsc();
    List<Message> findByThreadKeyOrderByCreatedAtAsc(String threadKey);
    List<Message> findByOrderIdOrderByCreatedAtAsc(Long orderId);
    List<Message> findByBookingIdOrderByCreatedAtAsc(Long bookingId);
}
