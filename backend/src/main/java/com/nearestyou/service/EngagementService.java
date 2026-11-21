package com.nearestyou.service;

import com.nearestyou.dto.NearestYouDtos.*;
import com.nearestyou.entity.*;
import com.nearestyou.exception.ApiException;
import com.nearestyou.repository.*;
import com.nearestyou.security.UserPrincipal;
import com.nearestyou.websocket.LiveChatBroker;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.time.Instant;
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
    private final UserAccountRepository userRepo;
    private final ProviderRegistrationRepository providerRepo;
    private final ServiceContractRepository contractRepo;
    private final LiveChatBroker liveChatBroker;

    public EngagementService(
            FavoriteRepository favoriteRepo,
            MessageRepository messageRepo,
            JobApplicationRepository appRepo,
            ReviewRepository reviewRepo,
            ServiceListingRepository listingRepo,
            BusinessRepository businessRepo,
            CustomerOrderRepository orderRepo,
            BookingRepository bookingRepo,
            DeliveryRequestRepository deliveryRepo,
            UserAccountRepository userRepo,
            ProviderRegistrationRepository providerRepo,
            ServiceContractRepository contractRepo,
            LiveChatBroker liveChatBroker
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
        this.userRepo = userRepo;
        this.providerRepo = providerRepo;
        this.contractRepo = contractRepo;
        this.liveChatBroker = liveChatBroker;
    }

    @Transactional(readOnly = true)
    public Map<String, Object> getUserWorkspace(String uid) {
        List<Business> owned = businessRepo.findByOwnerUidOrderByIdAsc(uid);
        Set<Long> ownedIds = new HashSet<>();
        for (Business b : owned) ownedIds.add(b.getId());

        List<CustomerOrder> myOrders = orderRepo.findByCustomerUidOrderByCreatedAtDesc(uid);
        Set<Long> myOrderIds = new HashSet<>();
        for (CustomerOrder o : myOrders) myOrderIds.add(o.getId());

        List<Booking> myBookings = bookingRepo.findByCustomerUidOrderByCreatedAtDesc(uid);
        Set<Long> myBookingIds = new HashSet<>();
        for (Booking b : myBookings) myBookingIds.add(b.getId());

        List<Message> scopedMessages = messageRepo.findAllByOrderByCreatedAtDesc().stream()
                .filter(m -> m.getSenderUid().equals(uid)
                        || uid.equals(m.getRecipientUid())
                        || ownedIds.contains(m.getBusinessId())
                        || (m.getOrderId() != null && myOrderIds.contains(m.getOrderId()))
                        || (m.getBookingId() != null && myBookingIds.contains(m.getBookingId())))
                .toList();

        Map<String, Object> out = new LinkedHashMap<>();
        out.put("orders", myOrders);
        out.put("bookings", myBookings);
        out.put("deliveries", deliveryRepo.findByCustomerUidOrderByCreatedAtDesc(uid));
        out.put("applications", appRepo.findByApplicantUidOrderByCreatedAtDesc(uid));
        out.put("favorites", favoriteRepo.findByUserUidOrderByCreatedAtDesc(uid));
        out.put("messages", scopedMessages);
        out.put("contracts", contractRepo.findByClientUidOrServiceGiverUidOrderByUpdatedAtDesc(uid, uid));
        out.put("ownedBusinesses", owned);
        return out;
    }

    @Transactional(readOnly = true)
    public boolean canAccessThread(UserPrincipal principal, String threadKey) {
        if (principal == null || threadKey == null || threadKey.isBlank()) return false;
        if (principal.isAdmin()) return true;

        String uid = principal.uid();
        if (threadKey.startsWith("order:")) {
            Long orderId = parsePositiveLong(threadKey.substring("order:".length()));
            if (orderId == null) return false;
            Optional<CustomerOrder> orderOpt = orderRepo.findById(orderId);
            if (orderOpt.isEmpty()) return false;
            CustomerOrder order = orderOpt.get();
            if (uid.equals(order.getCustomerUid())) return true;
            return businessRepo.findById(order.getBusinessId())
                    .map(b -> uid.equals(b.getOwnerUid()))
                    .orElse(false);
        }

        if (threadKey.startsWith("booking:")) {
            Long bookingId = parsePositiveLong(threadKey.substring("booking:".length()));
            if (bookingId == null) return false;
            Optional<Booking> bookingOpt = bookingRepo.findById(bookingId);
            if (bookingOpt.isEmpty()) return false;
            Booking booking = bookingOpt.get();
            if (uid.equals(booking.getCustomerUid())) return true;
            return businessRepo.findById(booking.getBusinessId())
                    .map(b -> uid.equals(b.getOwnerUid()))
                    .orElse(false);
        }

        if (threadKey.startsWith("contact:")) {
            String[] parts = threadKey.split(":", 4);
            if (parts.length < 4) return false;
            Long businessId = parsePositiveLong(parts[1]);
            String customerUid = parts[3];
            if (businessId == null || customerUid.isBlank()) return false;
            Optional<Business> bizOpt = businessRepo.findById(businessId);
            if (bizOpt.isEmpty()) return false;
            Business biz = bizOpt.get();
            if (customerUid.equals(biz.getOwnerUid())) return false;
            return uid.equals(customerUid) || uid.equals(biz.getOwnerUid());
        }

        return false;
    }

    @Transactional(readOnly = true)
    public Map<String, Object> getThreadMessages(UserPrincipal principal, String threadKey) {
        if (!canAccessThread(principal, threadKey)) {
            throw new ApiException(HttpStatus.FORBIDDEN, "Permission denied for this conversation.");
        }

        List<Message> messages = new ArrayList<>();
        if (threadKey.startsWith("order:")) {
            Long orderId = parsePositiveLong(threadKey.substring("order:".length()));
            if (orderId != null) {
                Set<Long> seen = new HashSet<>();
                for (Message m : messageRepo.findByThreadKeyOrderByCreatedAtAsc(threadKey)) {
                    if (seen.add(m.getId())) messages.add(m);
                }
                for (Message m : messageRepo.findByOrderIdOrderByCreatedAtAsc(orderId)) {
                    if (seen.add(m.getId())) messages.add(m);
                }
            }
        } else if (threadKey.startsWith("booking:")) {
            Long bookingId = parsePositiveLong(threadKey.substring("booking:".length()));
            if (bookingId != null) {
                Set<Long> seen = new HashSet<>();
                for (Message m : messageRepo.findByThreadKeyOrderByCreatedAtAsc(threadKey)) {
                    if (seen.add(m.getId())) messages.add(m);
                }
                for (Message m : messageRepo.findByBookingIdOrderByCreatedAtAsc(bookingId)) {
                    if (seen.add(m.getId())) messages.add(m);
                }
            }
        } else {
            messages.addAll(messageRepo.findByThreadKeyOrderByCreatedAtAsc(threadKey));
        }

        messages.sort(Comparator.comparing(Message::getCreatedAt));

        Map<String, Object> partner = resolveThreadPartnerPresence(principal, threadKey, messages);
        Map<String, Object> result = new LinkedHashMap<>();
        result.put("threadKey", threadKey);
        result.put("messages", messages);
        result.put("otherPartyUid", partner.get("otherPartyUid"));
        result.put("otherPartyName", partner.get("otherPartyName"));
        result.put("otherPartyLastSeenAt", partner.get("otherPartyLastSeenAt"));
        result.put("otherPartyActiveLastMinute", partner.get("otherPartyActiveLastMinute"));
        return result;
    }

    @Transactional(readOnly = true)
    public List<Map<String, Object>> getChatThreads(UserPrincipal principal) {
        String uid = principal.uid();
        List<Business> owned = businessRepo.findByOwnerUidOrderByIdAsc(uid);
        Set<Long> ownedBizIds = new HashSet<>();
        for (Business b : owned) ownedBizIds.add(b.getId());

        List<CustomerOrder> myOrders = orderRepo.findByCustomerUidOrderByCreatedAtDesc(uid);
        Set<Long> myOrderIds = new HashSet<>();
        for (CustomerOrder o : myOrders) myOrderIds.add(o.getId());

        List<Booking> myBookings = bookingRepo.findByCustomerUidOrderByCreatedAtDesc(uid);
        Set<Long> myBookingIds = new HashSet<>();
        for (Booking b : myBookings) myBookingIds.add(b.getId());

        Map<Long, Business> bizMap = new HashMap<>();
        for (Business b : businessRepo.findAll()) bizMap.put(b.getId(), b);

        Map<Long, ServiceListing> listingMap = new HashMap<>();
        for (ServiceListing l : listingRepo.findAll()) listingMap.put(l.getId(), l);

        Map<Long, CustomerOrder> orderMap = new HashMap<>();
        for (CustomerOrder o : orderRepo.findAll()) orderMap.put(o.getId(), o);

        Map<Long, Booking> bookingMap = new HashMap<>();
        for (Booking b : bookingRepo.findAll()) bookingMap.put(b.getId(), b);

        Map<String, UserAccount> userMap = new HashMap<>();
        for (UserAccount u : userRepo.findAll()) {
            if (u.getUid() != null) userMap.put(u.getUid(), u);
            if (u.getFirebaseUid() != null) userMap.putIfAbsent(u.getFirebaseUid(), u);
        }

        Map<String, List<Message>> grouped = new LinkedHashMap<>();
        List<Message> allAsc = messageRepo.findAllByOrderByCreatedAtAsc();
        for (Message m : allAsc) {
            boolean participant = principal.isAdmin()
                    || uid.equals(m.getSenderUid())
                    || uid.equals(m.getRecipientUid())
                    || ownedBizIds.contains(m.getBusinessId())
                    || (m.getOrderId() != null && myOrderIds.contains(m.getOrderId()))
                    || (m.getBookingId() != null && myBookingIds.contains(m.getBookingId()));
            if (!participant) continue;

            String key = resolveCanonicalThreadKey(m, bizMap.get(m.getBusinessId()));
            grouped.computeIfAbsent(key, k -> new ArrayList<>()).add(m);
        }

        List<Map<String, Object>> threads = new ArrayList<>();
        for (Map.Entry<String, List<Message>> entry : grouped.entrySet()) {
            String key = entry.getKey();
            List<Message> msgs = entry.getValue();
            if (msgs.isEmpty()) continue;
            Message last = msgs.get(msgs.size() - 1);
            Business biz = bizMap.get(last.getBusinessId());
            ServiceListing listing = last.getListingId() != null ? listingMap.get(last.getListingId()) : null;
            CustomerOrder order = last.getOrderId() != null ? orderMap.get(last.getOrderId()) : null;
            Booking booking = last.getBookingId() != null ? bookingMap.get(last.getBookingId()) : null;

            String customerUid = null;
            if (order != null) {
                customerUid = order.getCustomerUid();
            } else if (booking != null) {
                customerUid = booking.getCustomerUid();
            } else if (key.startsWith("contact:")) {
                String[] parts = key.split(":", 4);
                if (parts.length >= 4) customerUid = parts[3];
            }
            if (customerUid == null) {
                customerUid = (biz != null && !biz.getOwnerUid().equals(last.getSenderUid()))
                        ? last.getSenderUid()
                        : last.getRecipientUid();
            }

            boolean viewerIsBusinessOwner = biz != null && uid.equals(biz.getOwnerUid());
            String otherPartyUid = viewerIsBusinessOwner
                    ? customerUid
                    : (biz != null ? biz.getOwnerUid() : last.getRecipientUid());
            UserAccount otherUser = otherPartyUid != null ? userMap.get(otherPartyUid) : null;
            String otherPartyName = viewerIsBusinessOwner
                    ? (otherUser != null ? otherUser.getFullName()
                        : (order != null ? order.getCustomerName()
                        : (booking != null ? booking.getCustomerName() : last.getSenderName())))
                    : (biz != null ? biz.getBusinessName() : "Provider");

            Map<String, Object> item = new LinkedHashMap<>();
            item.put("threadKey", key);
            item.put("threadType", order != null ? "ORDER" : booking != null ? "BOOKING" : "SERVICE_CONTACT");
            item.put("businessId", last.getBusinessId());
            item.put("businessName", biz != null ? biz.getBusinessName() : "Service Provider");
            item.put("listingId", last.getListingId());
            item.put("listingTitle", listing != null ? listing.getTitle() : null);
            item.put("orderId", last.getOrderId());
            item.put("orderNumber", order != null ? order.getOrderNumber() : null);
            item.put("orderStatus", order != null ? order.getOrderStatus() : null);
            item.put("bookingId", last.getBookingId());
            item.put("bookingReference", booking != null ? booking.getBookingReference() : null);
            item.put("otherPartyUid", otherPartyUid);
            item.put("otherPartyName", otherPartyName);
            item.put("otherPartyLastSeenAt", otherUser != null ? otherUser.getLastSeenAt() : null);
            item.put("otherPartyActiveLastMinute", otherUser != null && otherUser.isActiveLastMinute());
            item.put("viewerIsOwner", viewerIsBusinessOwner);
            item.put("messageCount", msgs.size());
            item.put("lastMessage", last);
            threads.add(item);
        }

        threads.sort((a, b) -> {
            Message ma = (Message) a.get("lastMessage");
            Message mb = (Message) b.get("lastMessage");
            return mb.getCreatedAt().compareTo(ma.getCreatedAt());
        });
        return threads;
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
        String body = req.body() != null ? req.body().trim() : "";
        if (body.isEmpty()) {
            throw new ApiException(HttpStatus.BAD_REQUEST, "Message cannot be empty.");
        }

        String uid = principal.uid();
        Long resolvedOrderId = req.orderId();
        Long resolvedBookingId = req.bookingId();
        Long resolvedBusinessId = req.businessId();
        Long resolvedListingId = req.listingId();
        String resolvedThreadKey = (req.threadKey() != null && !req.threadKey().isBlank())
                ? req.threadKey().trim()
                : null;

        if (resolvedThreadKey != null) {
            if (resolvedThreadKey.startsWith("order:") && resolvedOrderId == null) {
                resolvedOrderId = parsePositiveLong(resolvedThreadKey.substring("order:".length()));
            } else if (resolvedThreadKey.startsWith("booking:") && resolvedBookingId == null) {
                resolvedBookingId = parsePositiveLong(resolvedThreadKey.substring("booking:".length()));
            }
        }

        String recipientUid = req.recipientUid();
        Business biz = null;

        if (resolvedOrderId != null) {
            CustomerOrder order = orderRepo.findById(resolvedOrderId)
                    .orElseThrow(() -> new ApiException(HttpStatus.NOT_FOUND, "Order not found."));
            biz = businessRepo.findById(order.getBusinessId())
                    .orElseThrow(() -> new ApiException(HttpStatus.NOT_FOUND, "Business not found."));
            boolean allowed = principal.isAdmin()
                    || uid.equals(order.getCustomerUid())
                    || uid.equals(biz.getOwnerUid());
            if (!allowed) {
                throw new ApiException(HttpStatus.FORBIDDEN, "Permission denied for this order chat.");
            }
            resolvedBusinessId = biz.getId();
            resolvedThreadKey = "order:" + order.getId();
            recipientUid = uid.equals(order.getCustomerUid()) ? biz.getOwnerUid() : order.getCustomerUid();
        } else if (resolvedBookingId != null) {
            Booking booking = bookingRepo.findById(resolvedBookingId)
                    .orElseThrow(() -> new ApiException(HttpStatus.NOT_FOUND, "Service request not found."));
            biz = businessRepo.findById(booking.getBusinessId())
                    .orElseThrow(() -> new ApiException(HttpStatus.NOT_FOUND, "Business not found."));
            boolean allowed = principal.isAdmin()
                    || uid.equals(booking.getCustomerUid())
                    || uid.equals(biz.getOwnerUid());
            if (!allowed) {
                throw new ApiException(HttpStatus.FORBIDDEN, "Permission denied for this service chat.");
            }
            resolvedBusinessId = biz.getId();
            if (resolvedListingId == null) resolvedListingId = booking.getListingId();
            resolvedThreadKey = "booking:" + booking.getId();
            recipientUid = uid.equals(booking.getCustomerUid()) ? biz.getOwnerUid() : booking.getCustomerUid();
        } else {
            if (resolvedThreadKey != null && resolvedThreadKey.startsWith("contact:")) {
                String[] parts = resolvedThreadKey.split(":", 4);
                if (parts.length < 4) {
                    throw new ApiException(HttpStatus.BAD_REQUEST, "Invalid conversation key.");
                }
                Long keyBizId = parsePositiveLong(parts[1]);
                Long keyListingId = parsePositiveLong(parts[2]);
                String customerUid = parts[3];
                if (keyBizId == null || customerUid.isBlank()) {
                    throw new ApiException(HttpStatus.BAD_REQUEST, "Invalid conversation key.");
                }
                if (resolvedBusinessId == null) resolvedBusinessId = keyBizId;
                if (resolvedListingId == null && keyListingId != null && keyListingId > 0) {
                    resolvedListingId = keyListingId;
                }
                biz = businessRepo.findById(resolvedBusinessId)
                        .orElseThrow(() -> new ApiException(HttpStatus.NOT_FOUND, "Service provider not found."));
                if (customerUid.equals(biz.getOwnerUid())) {
                    throw new ApiException(HttpStatus.BAD_REQUEST, "You cannot send a message to yourself on your own advertisement.");
                }
                boolean allowed = principal.isAdmin() || uid.equals(customerUid) || uid.equals(biz.getOwnerUid());
                if (!allowed) {
                    throw new ApiException(HttpStatus.FORBIDDEN, "Permission denied for this conversation.");
                }
                recipientUid = uid.equals(biz.getOwnerUid()) ? customerUid : biz.getOwnerUid();
            } else {
                if (resolvedBusinessId == null && resolvedListingId != null) {
                    ServiceListing listing = listingRepo.findById(resolvedListingId)
                            .orElseThrow(() -> new ApiException(HttpStatus.NOT_FOUND, "Listing not found."));
                    resolvedBusinessId = listing.getBusinessId();
                }
                if (resolvedBusinessId == null) {
                    throw new ApiException(HttpStatus.BAD_REQUEST, "Business or order target is required.");
                }
                biz = businessRepo.findById(resolvedBusinessId)
                        .orElseThrow(() -> new ApiException(HttpStatus.NOT_FOUND, "Business not found."));
                if (uid.equals(biz.getOwnerUid())
                        && (recipientUid == null || recipientUid.isBlank() || recipientUid.trim().equals(uid))) {
                    throw new ApiException(HttpStatus.BAD_REQUEST, "You cannot send a message to yourself on your own advertisement.");
                }
                String customerUid = uid.equals(biz.getOwnerUid()) && recipientUid != null && !recipientUid.isBlank()
                        ? recipientUid.trim()
                        : uid;
                long listingSegment = resolvedListingId != null ? resolvedListingId : 0L;
                resolvedThreadKey = "contact:" + biz.getId() + ":" + listingSegment + ":" + customerUid;
                if (recipientUid == null || recipientUid.isBlank()) {
                    recipientUid = uid.equals(biz.getOwnerUid()) ? customerUid : biz.getOwnerUid();
                }
            }
        }

        if (recipientUid != null && recipientUid.trim().equals(uid)) {
            throw new ApiException(HttpStatus.BAD_REQUEST, "You cannot send a message to yourself.");
        }

        String senderRole = principal.isAdmin()
                ? "ADMIN"
                : (biz != null && uid.equals(biz.getOwnerUid()) ? "PROVIDER" : "CUSTOMER");

        Message msg = new Message();
        msg.setSenderUid(uid);
        msg.setSenderName(principal.account().getFullName());
        msg.setSenderRole(senderRole);
        msg.setRecipientUid(recipientUid);
        msg.setBusinessId(resolvedBusinessId);
        msg.setListingId(resolvedListingId);
        msg.setOrderId(resolvedOrderId);
        msg.setBookingId(resolvedBookingId);
        msg.setThreadKey(resolvedThreadKey);
        msg.setBody(body);

        Message saved = messageRepo.save(msg);
        String ownerUid = biz != null ? biz.getOwnerUid() : null;
        liveChatBroker.broadcastMessage(saved, uid, recipientUid, ownerUid);
        return saved;
    }

    private String resolveCanonicalThreadKey(Message m, Business biz) {
        if (m.getThreadKey() != null && !m.getThreadKey().isBlank()) return m.getThreadKey();
        if (m.getOrderId() != null) return "order:" + m.getOrderId();
        if (m.getBookingId() != null) return "booking:" + m.getBookingId();
        long listingSegment = m.getListingId() != null ? m.getListingId() : 0L;
        String customerUid = (biz != null && biz.getOwnerUid().equals(m.getSenderUid()) && m.getRecipientUid() != null)
                ? m.getRecipientUid()
                : m.getSenderUid();
        return "contact:" + m.getBusinessId() + ":" + listingSegment + ":" + customerUid;
    }

    private Long parsePositiveLong(String raw) {
        if (raw == null || raw.isBlank()) return null;
        try {
            long val = Long.parseLong(raw.trim());
            return val >= 0 ? val : null;
        } catch (NumberFormatException ex) {
            return null;
        }
    }

    @Transactional
    public JobApplication submitJobApplication(UserPrincipal principal, Long listingId, CreateJobApplicationRequest req) {
        ServiceListing listing = listingRepo.findById(listingId)
                .orElseThrow(() -> new ApiException(HttpStatus.NOT_FOUND, "Job vacancy not found."));
        if (!"JOB".equalsIgnoreCase(listing.getListingType())) {
            throw new ApiException(HttpStatus.BAD_REQUEST, "Listing is not a job vacancy.");
        }
        Business jobBiz = businessRepo.findById(listing.getBusinessId()).orElse(null);
        if (jobBiz != null && principal.uid().equals(jobBiz.getOwnerUid())) {
            throw new ApiException(HttpStatus.BAD_REQUEST, "You cannot apply to your own job advertisement.");
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

    @Transactional(readOnly = true)
    public List<ServiceContract> getContracts(UserPrincipal principal, String threadKey, Long listingId) {
        if (threadKey != null && !threadKey.isBlank()) {
            if (!canAccessThread(principal, threadKey)) {
                throw new ApiException(HttpStatus.FORBIDDEN, "Permission denied for this conversation's contracts.");
            }
            List<ServiceContract> byThread = contractRepo.findByThreadKeyOrderByCreatedAtDesc(threadKey.trim());
            if (listingId != null) {
                return byThread.stream().filter(c -> listingId.equals(c.getListingId())).toList();
            }
            return byThread;
        }
        String uid = principal.uid();
        List<ServiceContract> list = principal.isAdmin()
                ? contractRepo.findAllByOrderByUpdatedAtDesc()
                : contractRepo.findByClientUidOrServiceGiverUidOrderByUpdatedAtDesc(uid, uid);
        if (listingId != null) {
            return list.stream().filter(c -> listingId.equals(c.getListingId())).toList();
        }
        return list;
    }

    @Transactional
    public ServiceContract createContractOffer(UserPrincipal principal, CreateContractOfferRequest req) {
        String callerUid = principal.uid();
        ServiceListing listing = req.listingId() != null
                ? listingRepo.findById(req.listingId()).orElse(null)
                : null;
        Long resolvedBusinessId = req.businessId() != null
                ? req.businessId()
                : (listing != null ? listing.getBusinessId() : null);

        String resolvedThreadKey = (req.threadKey() != null && !req.threadKey().isBlank())
                ? req.threadKey().trim()
                : null;
        Long resolvedBookingId = req.bookingId();
        String threadCustomerUid = null;

        if (resolvedThreadKey != null) {
            if (resolvedThreadKey.startsWith("booking:") && resolvedBookingId == null) {
                resolvedBookingId = parsePositiveLong(resolvedThreadKey.substring("booking:".length()));
            } else if (resolvedThreadKey.startsWith("contact:")) {
                String[] parts = resolvedThreadKey.split(":", 4);
                if (parts.length >= 4) {
                    if (resolvedBusinessId == null) resolvedBusinessId = parsePositiveLong(parts[1]);
                    if (listing == null) {
                        Long lid = parsePositiveLong(parts[2]);
                        if (lid != null && lid > 0) listing = listingRepo.findById(lid).orElse(null);
                    }
                    threadCustomerUid = parts[3];
                }
            }
        }

        Booking booking = resolvedBookingId != null
                ? bookingRepo.findById(resolvedBookingId).orElse(null)
                : null;
        if (booking != null) {
            if (resolvedBusinessId == null) resolvedBusinessId = booking.getBusinessId();
            if (listing == null && booking.getListingId() != null) {
                listing = listingRepo.findById(booking.getListingId()).orElse(null);
            }
            threadCustomerUid = booking.getCustomerUid();
        }

        if (resolvedBusinessId == null) {
            throw new ApiException(HttpStatus.BAD_REQUEST, "Target service provider or listing is required for a contract offer.");
        }

        Business biz = businessRepo.findById(resolvedBusinessId)
                .orElseThrow(() -> new ApiException(HttpStatus.NOT_FOUND, "Service provider not found."));
        String serviceGiverUid = biz.getOwnerUid();
        boolean callerIsServiceGiver = callerUid.equals(serviceGiverUid);

        if (callerIsServiceGiver) {
            throw new ApiException(
                    HttpStatus.FORBIDDEN,
                    "Contract offers must be initialized by the client contacting the job seeker or service provider from their advertisement."
            );
        }

        String clientUid = callerUid;
        if (threadCustomerUid != null && !threadCustomerUid.isBlank() && !threadCustomerUid.equals(callerUid)) {
            throw new ApiException(HttpStatus.FORBIDDEN, "Only the client in this conversation can initiate a contract offer.");
        }

        if (clientUid.equals(serviceGiverUid)) {
            throw new ApiException(HttpStatus.BAD_REQUEST, "You cannot create a contract offer with yourself.");
        }

        String normalizedType = req.contractType().trim().toUpperCase(Locale.ROOT);
        if (!Set.of("ONE_TIME_CONTRACT", "FULL_TIME", "PER_HOUR", "PER_DAY", "PER_MONTH").contains(normalizedType)) {
            throw new ApiException(HttpStatus.BAD_REQUEST, "Unsupported contract type.");
        }

        BigDecimal agreedAmount = req.agreedAmount();
        if ("PER_HOUR".equals(normalizedType) && req.hourlyRate() != null && req.estimatedHours() != null && req.estimatedHours() > 0) {
            BigDecimal computed = req.hourlyRate().multiply(BigDecimal.valueOf(req.estimatedHours()));
            if (agreedAmount == null || agreedAmount.compareTo(BigDecimal.ZERO) <= 0) {
                agreedAmount = computed;
            }
        }
        if (agreedAmount == null || agreedAmount.compareTo(BigDecimal.ZERO) <= 0) {
            throw new ApiException(HttpStatus.BAD_REQUEST, "Contract amount must be greater than 0 ETB.");
        }

        String paymentSchedule = (req.paymentSchedule() != null && !req.paymentSchedule().isBlank())
                ? req.paymentSchedule().trim().toUpperCase(Locale.ROOT)
                : ("FULL_TIME".equals(normalizedType) || "PER_MONTH".equals(normalizedType) ? "MONTHLY" : "ON_COMPLETION");

        if (resolvedThreadKey == null) {
            long listingSegment = listing != null ? listing.getId() : 0L;
            resolvedThreadKey = "contact:" + biz.getId() + ":" + listingSegment + ":" + clientUid;
        }

        String serviceGiverName = resolveProviderDisplayName(serviceGiverUid, biz);
        String clientName = resolveUserDisplayName(clientUid, booking != null ? booking.getCustomerName() : "Client");
        String contractRef = "NY-CTR-" + UUID.randomUUID().toString().substring(0, 8).toUpperCase(Locale.ROOT);

        ServiceContract contract = new ServiceContract();
        contract.setContractReference(contractRef);
        contract.setThreadKey(resolvedThreadKey);
        contract.setBusinessId(biz.getId());
        contract.setListingId(listing != null ? listing.getId() : null);
        contract.setBookingId(booking != null ? booking.getId() : null);
        contract.setServiceGiverUid(serviceGiverUid);
        contract.setServiceGiverName(serviceGiverName);
        contract.setClientUid(clientUid);
        contract.setClientName(clientName);
        contract.setOfferedByUid(callerUid);
        contract.setOfferedByRole(callerIsServiceGiver ? "PROVIDER" : "CUSTOMER");
        contract.setContractType(normalizedType);
        contract.setTitle(req.title().trim());
        contract.setScopeSummary(req.scopeSummary().trim());
        contract.setDeliverables(req.deliverables() != null && !req.deliverables().isBlank() ? req.deliverables().trim() : null);
        contract.setPaymentSchedule(paymentSchedule);
        contract.setAgreedAmount(agreedAmount.setScale(2, RoundingMode.HALF_UP));
        contract.setHourlyRate(req.hourlyRate() != null ? req.hourlyRate().setScale(2, RoundingMode.HALF_UP) : null);
        contract.setEstimatedHours(req.estimatedHours());
        contract.setStartDate(req.startDate() != null && !req.startDate().isBlank() ? req.startDate().trim() : null);
        contract.setEndDate(req.endDate() != null && !req.endDate().isBlank() ? req.endDate().trim() : null);
        contract.setStatus("OFFERED");

        ServiceContract saved = contractRepo.save(contract);

        postContractThreadMessage(
                principal,
                saved,
                "Contract Offer (" + contractRef + "): " + saved.getTitle() + " · " + saved.getContractType().replace("_", " ")
                        + " · " + saved.getAgreedAmount() + " ETB (" + saved.getPaymentSchedule().replace("_", " ") + ")"
        );
        liveChatBroker.broadcastContractEvent(saved, saved.getClientUid(), saved.getServiceGiverUid());
        return saved;
    }

    @Transactional
    public ServiceContract respondToContract(UserPrincipal principal, Long contractId, RespondContractRequest req) {
        ServiceContract contract = contractRepo.findById(contractId)
                .orElseThrow(() -> new ApiException(HttpStatus.NOT_FOUND, "Contract offer not found."));

        String uid = principal.uid();
        boolean isParticipant = uid.equals(contract.getClientUid()) || uid.equals(contract.getServiceGiverUid());
        if (!principal.isAdmin() && !isParticipant) {
            throw new ApiException(HttpStatus.FORBIDDEN, "Permission denied for this service contract.");
        }

        String action = req.action().trim().toUpperCase(Locale.ROOT);
        String currentStatus = contract.getStatus();
        String timelineBody;

        switch (action) {
            case "ACCEPT" -> {
                if (!Set.of("OFFERED", "COUNTERED").contains(currentStatus)) {
                    throw new ApiException(HttpStatus.BAD_REQUEST, "Only pending or countered offers can be accepted.");
                }
                if (!principal.isAdmin() && uid.equals(contract.getOfferedByUid())) {
                    throw new ApiException(HttpStatus.BAD_REQUEST, "You cannot accept your own contract offer. Wait for the other party to accept.");
                }
                contract.setStatus("ACCEPTED");
                contract.setAcceptedAt(Instant.now());
                timelineBody = "Contract Accepted (" + contract.getContractReference() + "): " + contract.getTitle()
                        + " locked at " + contract.getAgreedAmount() + " ETB.";
            }
            case "COUNTER" -> {
                if (!Set.of("OFFERED", "COUNTERED").contains(currentStatus)) {
                    throw new ApiException(HttpStatus.BAD_REQUEST, "Only active offers can be countered.");
                }
                if (!principal.isAdmin() && uid.equals(contract.getOfferedByUid())) {
                    throw new ApiException(HttpStatus.BAD_REQUEST, "Wait for the other party to respond before sending another counter-offer.");
                }
                if (req.counterAmount() == null || req.counterAmount().compareTo(BigDecimal.ZERO) <= 0) {
                    throw new ApiException(HttpStatus.BAD_REQUEST, "Counter-offer amount must be greater than 0 ETB.");
                }
                contract.setAgreedAmount(req.counterAmount().setScale(2, RoundingMode.HALF_UP));
                if (req.nextPaymentSchedule() != null && !req.nextPaymentSchedule().isBlank()) {
                    contract.setPaymentSchedule(req.nextPaymentSchedule().trim().toUpperCase(Locale.ROOT));
                }
                if (req.deliverables() != null && !req.deliverables().isBlank()) {
                    contract.setDeliverables(req.deliverables().trim());
                }
                if (req.counterNotes() != null && !req.counterNotes().isBlank()) {
                    contract.setCounterNotes(req.counterNotes().trim());
                }
                contract.setOfferedByUid(uid);
                contract.setOfferedByRole(uid.equals(contract.getServiceGiverUid()) ? "PROVIDER" : "CUSTOMER");
                contract.setStatus("COUNTERED");
                timelineBody = "Contract Counter-Offer (" + contract.getContractReference() + "): Proposed "
                        + contract.getAgreedAmount() + " ETB"
                        + (contract.getCounterNotes() != null ? " — " + contract.getCounterNotes() : "");
            }
            case "DECLINE" -> {
                if (!Set.of("OFFERED", "COUNTERED").contains(currentStatus)) {
                    throw new ApiException(HttpStatus.BAD_REQUEST, "Only pending or countered offers can be declined.");
                }
                if (!principal.isAdmin() && uid.equals(contract.getOfferedByUid())) {
                    throw new ApiException(HttpStatus.BAD_REQUEST, "Use Cancel to withdraw your own offer.");
                }
                contract.setStatus("DECLINED");
                if (req.counterNotes() != null && !req.counterNotes().isBlank()) {
                    contract.setCounterNotes(req.counterNotes().trim());
                }
                timelineBody = "Contract Declined (" + contract.getContractReference() + ")"
                        + (contract.getCounterNotes() != null ? ": " + contract.getCounterNotes() : ".");
            }
            case "CANCEL" -> {
                if (!Set.of("OFFERED", "COUNTERED").contains(currentStatus)) {
                    throw new ApiException(HttpStatus.BAD_REQUEST, "Accepted or finished contracts cannot be cancelled here.");
                }
                if (!principal.isAdmin() && !uid.equals(contract.getOfferedByUid())) {
                    throw new ApiException(HttpStatus.FORBIDDEN, "Only the sender can withdraw this offer.");
                }
                contract.setStatus("CANCELLED");
                timelineBody = "Contract Offer Withdrawn (" + contract.getContractReference() + ").";
            }
            case "START" -> {
                if (!"ACCEPTED".equals(currentStatus)) {
                    throw new ApiException(HttpStatus.BAD_REQUEST, "Contract must be accepted before starting work.");
                }
                contract.setStatus("ACTIVE");
                timelineBody = "Contract Work Started (" + contract.getContractReference() + ").";
            }
            case "COMPLETE" -> {
                if (!Set.of("ACCEPTED", "ACTIVE").contains(currentStatus)) {
                    throw new ApiException(HttpStatus.BAD_REQUEST, "Only accepted or active contracts can be marked completed.");
                }
                contract.setStatus("COMPLETED");
                contract.setCompletedAt(Instant.now());
                timelineBody = "Contract Completed (" + contract.getContractReference() + "): " + contract.getTitle() + ".";
            }
            default -> throw new ApiException(HttpStatus.BAD_REQUEST, "Invalid contract action: " + action);
        }

        ServiceContract saved = contractRepo.save(contract);
        postContractThreadMessage(principal, saved, timelineBody);
        liveChatBroker.broadcastContractEvent(saved, saved.getClientUid(), saved.getServiceGiverUid());
        return saved;
    }

    private void postContractThreadMessage(UserPrincipal principal, ServiceContract contract, String body) {
        String senderUid = principal.uid();
        String recipientUid = senderUid.equals(contract.getClientUid())
                ? contract.getServiceGiverUid()
                : contract.getClientUid();
        String senderRole = principal.isAdmin()
                ? "ADMIN"
                : (senderUid.equals(contract.getServiceGiverUid()) ? "PROVIDER" : "CUSTOMER");

        Message msg = new Message();
        msg.setSenderUid(senderUid);
        msg.setSenderName(principal.account().getFullName());
        msg.setSenderRole(senderRole);
        msg.setRecipientUid(recipientUid);
        msg.setBusinessId(contract.getBusinessId());
        msg.setListingId(contract.getListingId());
        msg.setBookingId(contract.getBookingId());
        msg.setThreadKey(contract.getThreadKey());
        msg.setBody(body);

        Message savedMsg = messageRepo.save(msg);
        liveChatBroker.broadcastMessage(savedMsg, senderUid, recipientUid, contract.getServiceGiverUid());
    }

    private Map<String, Object> resolveThreadPartnerPresence(
            UserPrincipal principal,
            String threadKey,
            List<Message> messages
    ) {
        String viewerUid = principal.uid();
        String otherPartyUid = null;
        String fallbackName = null;

        if (threadKey.startsWith("order:")) {
            Long orderId = parsePositiveLong(threadKey.substring("order:".length()));
            if (orderId != null) {
                Optional<CustomerOrder> orderOpt = orderRepo.findById(orderId);
                if (orderOpt.isPresent()) {
                    CustomerOrder order = orderOpt.get();
                    Business biz = businessRepo.findById(order.getBusinessId()).orElse(null);
                    if (biz != null && viewerUid.equals(biz.getOwnerUid())) {
                        otherPartyUid = order.getCustomerUid();
                        fallbackName = order.getCustomerName();
                    } else if (biz != null) {
                        otherPartyUid = biz.getOwnerUid();
                        fallbackName = biz.getBusinessName();
                    }
                }
            }
        } else if (threadKey.startsWith("booking:")) {
            Long bookingId = parsePositiveLong(threadKey.substring("booking:".length()));
            if (bookingId != null) {
                Optional<Booking> bookingOpt = bookingRepo.findById(bookingId);
                if (bookingOpt.isPresent()) {
                    Booking booking = bookingOpt.get();
                    Business biz = businessRepo.findById(booking.getBusinessId()).orElse(null);
                    if (biz != null && viewerUid.equals(biz.getOwnerUid())) {
                        otherPartyUid = booking.getCustomerUid();
                        fallbackName = booking.getCustomerName();
                    } else if (biz != null) {
                        otherPartyUid = biz.getOwnerUid();
                        fallbackName = biz.getBusinessName();
                    }
                }
            }
        } else if (threadKey.startsWith("contact:")) {
            String[] parts = threadKey.split(":", 4);
            if (parts.length >= 4) {
                Long businessId = parsePositiveLong(parts[1]);
                String customerUid = parts[3];
                Business biz = businessId != null ? businessRepo.findById(businessId).orElse(null) : null;
                if (biz != null) {
                    if (viewerUid.equals(biz.getOwnerUid())) {
                        otherPartyUid = customerUid;
                    } else {
                        otherPartyUid = biz.getOwnerUid();
                        fallbackName = biz.getBusinessName();
                    }
                }
            }
        }

        if (otherPartyUid == null && messages != null) {
            for (Message m : messages) {
                if (!viewerUid.equals(m.getSenderUid())) {
                    otherPartyUid = m.getSenderUid();
                    fallbackName = m.getSenderName();
                    break;
                } else if (m.getRecipientUid() != null && !viewerUid.equals(m.getRecipientUid())) {
                    otherPartyUid = m.getRecipientUid();
                    break;
                }
            }
        }

        UserAccount otherUser = null;
        if (otherPartyUid != null && !otherPartyUid.isBlank()) {
            final String lookupUid = otherPartyUid;
            otherUser = userRepo.findByUid(lookupUid)
                    .orElseGet(() -> userRepo.findByFirebaseUid(lookupUid).orElse(null));
        }

        Map<String, Object> out = new LinkedHashMap<>();
        out.put("otherPartyUid", otherPartyUid);
        out.put("otherPartyName", otherUser != null ? otherUser.getFullName() : fallbackName);
        out.put("otherPartyLastSeenAt", otherUser != null ? otherUser.getLastSeenAt() : null);
        out.put("otherPartyActiveLastMinute", otherUser != null && otherUser.isActiveLastMinute());
        return out;
    }

    private String resolveProviderDisplayName(String uid, Business biz) {
        UserAccount acc = userRepo.findByUid(uid)
                .orElseGet(() -> userRepo.findByFirebaseUid(uid).orElse(null));
        if (acc != null && acc.getFullName() != null && !acc.getFullName().isBlank()
                && !"Nearest You User".equalsIgnoreCase(acc.getFullName().trim())) {
            return acc.getFullName().trim();
        }
        ProviderRegistration reg = providerRepo.findFirstByUserUidOrderByUpdatedAtDesc(uid).orElse(null);
        if (reg != null && reg.getFullName() != null && !reg.getFullName().isBlank()) {
            return reg.getFullName().trim();
        }
        return biz != null ? biz.getBusinessName() : "Service Giver";
    }

    private String resolveUserDisplayName(String uid, String fallback) {
        UserAccount acc = userRepo.findByUid(uid)
                .orElseGet(() -> userRepo.findByFirebaseUid(uid).orElse(null));
        if (acc != null && acc.getFullName() != null && !acc.getFullName().isBlank()) {
            return acc.getFullName().trim();
        }
        return fallback;
    }
}
