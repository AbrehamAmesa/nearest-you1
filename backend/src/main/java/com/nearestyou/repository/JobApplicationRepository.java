package com.nearestyou.repository;

import com.nearestyou.entity.JobApplication;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.Collection;
import java.util.List;

public interface JobApplicationRepository extends JpaRepository<JobApplication, Long> {
    List<JobApplication> findByApplicantUidOrderByCreatedAtDesc(String applicantUid);
    List<JobApplication> findByBusinessIdInOrderByCreatedAtDesc(Collection<Long> businessIds);
    boolean existsByListingIdAndApplicantUid(Long listingId, String applicantUid);
}
