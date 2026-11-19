package com.nearestyou.service;

import com.nearestyou.dto.NearestYouDtos.*;
import com.nearestyou.entity.*;
import com.nearestyou.exception.ApiException;
import com.nearestyou.repository.*;
import com.nearestyou.security.UserPrincipal;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.util.*;

@Service
public class EngagementService {

    private final FavoriteRepository favoriteRepo;
    private final MessageRepository messageRepo;
    private final JobApplicationRepository appRepo;
    private final ReviewRepository reviewRepo;
    private final ServiceListingRepository listingRepo;
    private final BusinessRepository businessRepo;
    private final CustomerOrderRepository orderRepo;
    private final BookingRepository bookingRepo;
    private final DeliveryRequestRepository deliveryRepo;

    public EngagementService(
            FavoriteRepository favoriteRepo,
            MessageRepository messageRepo,
            JobApplicationRepository appRepo,
            ReviewRepository reviewRepo,
            ServiceListingRepository listingRepo,
            BusinessRepository businessRepo,
            CustomerOrderRepository orderRepo,
            BookingRepository bookingRepo,
            DeliveryRequestRepository deliveryRepo
    ) {
        this.favoriteRepo = favoriteRepo;
        this.messageRepo = messageRepo;
        this.appRepo = appRepo;
        this.reviewRepo = reviewRepo;
        this.listingRepo = listingRepo;
        this.businessRepo = businessRepo;
        this.orderRepo = orderRepo;
        this.bookingRepo = bookingRepo;
        this.deliveryRepo = deliveryRepo;
    }

    @Transactional(readOnly = true)
    public Map<String, Object> getUserWorkspace(String uid) {
        List<Business> owned = businessRepo.findByOwnerUidOrderByIdAsc(uid);
        Set<Long> ownedIds = new HashSet<>();
        for (Business b : owned) ownedIds.add(b.getId());

        List<Message> scopedMessages = messageRepo.findAllByOrderByCreatedAtDesc().stream()
                .filter(m -> m.getSenderUid().equals(uid) || ownedIds.contains(m.getBusinessId()))
                .toList();

        Map<String, Object> out = new LinkedHashMap<>();
        out.put("orders", orderRepo.findByCustomerUidOrderByCreatedAtDesc(uid));
        out.put("bookings", bookingRepo.findByCustomerUidOrderByCreatedAtDesc(uid));
        out.put("deliveries", deliveryRepo.findByCustomerUidOrderByCreatedAtDesc(uid));
        out.put("applications", appRepo.findByApplicantUidOrderByCreatedAtDesc(uid));
        out.put("favorites", favoriteRepo.findByUserUidOrderByCreatedAtDesc(uid));
        out.put("messages", scopedMessages);
        out.put("ownedBusinesses", owned);
        return out;
    }

    @Transactional
    public Map<String, Object> toggleFavorite(String uid, Long listingId) {
        Optional<Favorite> existing = favoriteRepo.findByUserUidAndListingId(uid, listingId);
        if (existing.isPresent()) {
            favoriteRepo.delete(existing.get());
            return Map.of("saved", false);
        }
        Favorite fav = new Favorite();
        fav.setUserUid(uid);
        fav.setListingId(listingId);
        favoriteRepo.save(fav);
        return Map.of("saved", true);
    }

    @Transactional
    public Message sendMessage(UserPrincipal principal, SendMessageRequest req) {
        Message msg = new Message();
        msg.setSenderUid(principal.uid());
        msg.setSenderName(principal.account().getFullName());
        msg.setBusinessId(req.businessId());
        msg.setListingId(req.listingId());
        msg.setBody(req.body().trim());
        return messageRepo.save(msg);
    }

    @Transactional
    public JobApplication submitJobApplication(UserPrincipal principal, Long listingId, CreateJobApplicationRequest req) {
        ServiceListing listing = listingRepo.findById(listingId)
                .orElseThrow(() -> new ApiException(HttpStatus.NOT_FOUND, "Job vacancy not found."));
        if (!"JOB".equalsIgnoreCase(listing.getListingType())) {
            throw new ApiException(HttpStatus.BAD_REQUEST, "Listing is not a job vacancy.");
        }
        if (appRepo.existsByListingIdAndApplicantUid(listingId, principal.uid())) {
            throw new ApiException(HttpStatus.BAD_REQUEST, "You have already submitted an application for this job vacancy.");
        }

        JobApplication app = new JobApplication();
        app.setListingId(listing.getId());
        app.setBusinessId(listing.getBusinessId());
        app.setApplicantUid(principal.uid());
        app.setApplicantName(req.applicantName().trim());
        app.setApplicantPhone(req.applicantPhone().trim());
        app.setSkills(req.skills().trim());
        app.setExperienceYears(req.experienceYears() != null ? req.experienceYears() : 1);
        app.setExpectedCompensation(req.expectedCompensation().setScale(2, RoundingMode.HALF_UP));
        app.setCoverLetter(req.coverLetter().trim());
        app.setApplicationStatus("SUBMITTED");
        return appRepo.save(app);
    }

    @Transactional
    public JobApplication updateApplicationStatus(UserPrincipal principal, Long appId, String applicationStatus) {
        JobApplication app = appRepo.findById(appId)
                .orElseThrow(() -> new ApiException(HttpStatus.NOT_FOUND, "Job application not found."));
        Business biz = businessRepo.findById(app.getBusinessId())
                .orElseThrow(() -> new ApiException(HttpStatus.NOT_FOUND, "Business not found."));
        if (!principal.isAdmin() && !biz.getOwnerUid().equals(principal.uid())) {
            throw new ApiException(HttpStatus.FORBIDDEN,
                    "Permission denied: only the hiring business owner or admin can update applicant status.");
        }
        app.setApplicationStatus(applicationStatus);
        return appRepo.save(app);
    }

    @Transactional
    public Review submitVerifiedReview(UserPrincipal principal, CreateReviewRequest req) {
        String ref = req.transactionRef().trim();
        boolean ownsOrder = orderRepo.findByOrderNumberAndCustomerUid(ref, principal.uid()).isPresent();
        boolean ownsBooking = bookingRepo.findByBookingReferenceAndCustomerUid(ref, principal.uid()).isPresent();
        if (!ownsOrder && !ownsBooking) {
            throw new ApiException(HttpStatus.FORBIDDEN,
                    "BR-016 Violation: You can only review transactions belonging to your account.");
        }
        if (reviewRepo.existsByTransactionRefAndCustomerUid(ref, principal.uid())) {
            throw new ApiException(HttpStatus.BAD_REQUEST, "You have already submitted a review for this transaction reference.");
        }

        Review review = new Review();
        review.setCustomerUid(principal.uid());
        review.setCustomerName(principal.account().getFullName());
        review.setBusinessId(req.businessId());
        review.setListingId(req.listingId());
        review.setTransactionRef(ref);
        review.setRating(Math.min(5, Math.max(1, req.rating())));
        review.setComment(req.comment().trim());
        Review saved = reviewRepo.save(review);

        recalculateRatings(req.businessId(), req.listingId());
        return saved;
    }

    private void recalculateRatings(Long businessId, Long listingId) {
        List<Review> bizReviews = reviewRepo.findByBusinessId(businessId);
        if (!bizReviews.isEmpty()) {
            double avg = bizReviews.stream().mapToInt(Review::getRating).average().orElse(4.8);
            businessRepo.findById(businessId).ifPresent(b -> {
                b.setRatingAvg(BigDecimal.valueOf(avg).setScale(2, RoundingMode.HALF_UP));
                b.setRatingCount(bizReviews.size());
                businessRepo.save(b);
            });
        }
        if (listingId != null) {
            List<Review> lstReviews = reviewRepo.findByListingId(listingId);
            if (!lstReviews.isEmpty()) {
                double avg = lstReviews.stream().mapToInt(Review::getRating).average().orElse(4.8);
                listingRepo.findById(listingId).ifPresent(l -> {
                    l.setRatingAvg(BigDecimal.valueOf(avg).setScale(2, RoundingMode.HALF_UP));
                    l.setRatingCount(lstReviews.size());
                    listingRepo.save(l);
                });
            }
        }
    }
}
