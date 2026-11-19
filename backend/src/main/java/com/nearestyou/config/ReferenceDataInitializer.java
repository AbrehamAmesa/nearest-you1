package com.nearestyou.config;

import com.nearestyou.entity.*;
import com.nearestyou.repository.*;
import com.nearestyou.service.UserSyncService;
import org.springframework.boot.ApplicationArguments;
import org.springframework.boot.ApplicationRunner;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Transactional;

import java.math.BigDecimal;
import java.util.*;

/**
 * Ensures ONLY non-mock system reference data (service categories, Admin-registered document types,
 * default mapped document requirements, pricing policy, and bootstrap Admin accounts) exist in PostgreSQL
 * after Hibernate auto-creates tables via ddl-auto=update.
 * Zero mock businesses, listings, orders, or bookings are inserted.
 */
@Component
public class ReferenceDataInitializer implements ApplicationRunner {

    private final ServiceCategoryRepository categoryRepo;
    private final DocumentTypeRepository documentTypeRepo;
    private final CategoryDocumentRequirementRepository requirementRepo;
    private final PlatformSettingRepository settingRepo;
    private final UserSyncService userSyncService;

    public ReferenceDataInitializer(
            ServiceCategoryRepository categoryRepo,
            DocumentTypeRepository documentTypeRepo,
            CategoryDocumentRequirementRepository requirementRepo,
            PlatformSettingRepository settingRepo,
            UserSyncService userSyncService
    ) {
        this.categoryRepo = categoryRepo;
        this.documentTypeRepo = documentTypeRepo;
        this.requirementRepo = requirementRepo;
        this.settingRepo = settingRepo;
        this.userSyncService = userSyncService;
    }

    @Override
    @Transactional
    public void run(ApplicationArguments args) {
        userSyncService.syncOrCreateUser("admin-nearestyou-super", "admin@nearestyou.et", "Nearest You Platform Admin");

        if (settingRepo.findBySettingKey("pricing_policy").isEmpty()) {
            PlatformSetting policy = new PlatformSetting();
            policy.setSettingKey("pricing_policy");
            policy.setSettingValue(Map.of(
                    "currency", "ETB",
                    "taxRatePercent", 15,
                    "defaultCommissionPercent", 10,
                    "deliveryBaseFee", 80,
                    "deliveryPerKmRate", 25,
                    "expressMultiplier", 1.4,
                    "rideBaseFare", 100,
                    "ridePerKmRate", 35
            ));
            settingRepo.save(policy);
        }

        Map<String, DocumentType> docTypeMap = ensureDocumentTypes();

        if (categoryRepo.count() == 0) {
            seedCategoriesAndRequirements(docTypeMap);
        } else {
            backfillExistingData(docTypeMap);
        }
    }

    private Map<String, DocumentType> ensureDocumentTypes() {
        Map<String, DocumentType> map = new LinkedHashMap<>();
        for (DocumentType existing : documentTypeRepo.findAll()) {
            map.put(existing.getDocumentCode().toUpperCase(Locale.ROOT), existing);
        }

        if (map.isEmpty()) {
            List<DocumentType> defaults = List.of(
                    docType("FAYDA_ID", "Fayda National ID (FIN/FAN)", "የፋይዳ ብሔራዊ መታወቂያ", "Waraqaa Eenyummaa Biyyaalessaa Faydaa", "Ethiopian National Digital ID required for every provider.", true, true),
                    docType("TRADE_LICENSE", "Commercial Trade License", "የንግድ ፈቃድ", "Hayyama Daldalaa", "Valid municipal commercial trade registration license.", true, true),
                    docType("TIN_CERT", "TIN Tax Certificate", "የግብር ከፋይ መለያ ቁጥር (TIN)", "Waraqaa Ragaa Gibiraa (TIN)", "Ethiopian Revenue Authority Taxpayer Identification certificate.", false, true),
                    docType("DRIVER_LICENSE", "Ethiopian Driving License", "የመንጃ ፈቃድ", "Hayyama Konkolaachisummaa", "Valid driver license matching vehicle class.", true, true),
                    docType("VEHICLE_LIBRE", "Vehicle Registration (Libre)", "የተሽከርካሪ ሊብሬ", "Galmee Konkolaataa (Liibiree)", "Proof of vehicle ownership or authorized fleet lease.", true, true),
                    docType("MOH_LICENSE", "MoH Professional Practice License", "የጤና ሚኒስቴር የሙያ ፈቃድ", "Hayyama Ogummaa Fayyaa", "Ministry of Health / EFMHACA practicing license.", true, true),
                    docType("SKILL_CERT", "Professional / Trade Certificate", "የሙያ ብቃት ማረጋገጫ", "Waraqaa Ragaa Ogummaa", "TVET competency or business registration certificate.", false, true)
            );
            for (DocumentType saved : documentTypeRepo.saveAll(defaults)) {
                map.put(saved.getDocumentCode().toUpperCase(Locale.ROOT), saved);
            }
        }
        return map;
    }

    private void seedCategoriesAndRequirements(Map<String, DocumentType> docTypes) {
        List<ServiceCategory> defaults = List.of(
                cat("shops-retail", "Shops & Retail", "ሱቆችና ችርቻሮ", "Suuqiiwwanii fi Daldala", "Local electronics, groceries, pharmacies, and retail goods", "RETAIL", "PRODUCT", false, "8.00", "50.00", 1),
                cat("food-dining", "Food & Dining", "ምግብና መጠጥ", "Mana Nyaataa fi Dhugaatii", "Restaurants, coffee houses, bakeries, and catering", "FOOD", "FOOD", false, "12.00", "60.00", 2),
                cat("home-services", "Home & Technical Services", "የቤትና ቴክኒክ አገልግሎት", "Tajaajila Manaa fi Teeknikaa", "Plumbing, electrical, cleaning, moving, and maintenance", "SERVICE", "SERVICE", true, "10.00", "150.00", 3),
                cat("delivery-transport", "Delivery & Transport", "ዴሊቨሪና ትራንስፖርት", "Ergaa fi Geejjiba", "On-demand couriers, city rides, vans, and moving trucks", "DELIVERY", "TRANSPORT", true, "15.00", "80.00", 4),
                cat("rentals-property", "Rentals & Assets", "ኪራይ", "Kireessuu Qabeenyaa", "Apartments, event tents, cameras, vehicles, and tools", "RENTAL", "RENTAL", true, "8.00", "300.00", 5),
                cat("jobs-workforce", "Jobs & Skilled Workforce", "ስራና ባለሙያዎች", "Hojii fi Ogummaa", "Full-time roles, daily skilled labor, and contract jobs", "JOB", "JOB", false, "0.00", "100.00", 6),
                cat("healthcare", "Healthcare & Wellness", "ጤና", "Fayyaa fi Wal’aansa", "Clinics, lab diagnostics, dental, and physiotherapists", "HEALTHCARE", "HEALTHCARE", true, "8.00", "250.00", 7),
                cat("education-events", "Education & Events", "ትምህርትና ዝግጅቶች", "Barnootaa fi Qophii", "Tutoring, language centers, photography, and event halls", "EDUCATION", "EDUCATION", false, "10.00", "200.00", 8)
        );
        List<ServiceCategory> savedCats = categoryRepo.saveAll(defaults);

        for (ServiceCategory c : savedCats) {
            saveReq(c.getId(), docTypes.get("FAYDA_ID"), true, true);
            if ("RETAIL".equals(c.getCategoryType()) || "FOOD".equals(c.getCategoryType())) {
                saveReq(c.getId(), docTypes.get("TRADE_LICENSE"), true, true);
                saveReq(c.getId(), docTypes.get("TIN_CERT"), false, true);
            } else if ("DELIVERY".equals(c.getCategoryType())) {
                saveReq(c.getId(), docTypes.get("DRIVER_LICENSE"), true, true);
                saveReq(c.getId(), docTypes.get("VEHICLE_LIBRE"), true, true);
            } else if ("HEALTHCARE".equals(c.getCategoryType())) {
                saveReq(c.getId(), docTypes.get("MOH_LICENSE"), true, true);
            } else {
                saveReq(c.getId(), docTypes.get("SKILL_CERT"), false, true);
            }
        }
    }

    private void backfillExistingData(Map<String, DocumentType> docTypes) {
        Map<String, String> omBySlug = Map.of(
                "shops-retail", "Suuqiiwwanii fi Daldala",
                "food-dining", "Mana Nyaataa fi Dhugaatii",
                "home-services", "Tajaajila Manaa fi Teeknikaa",
                "delivery-transport", "Ergaa fi Geejjiba",
                "rentals-property", "Kireessuu Qabeenyaa",
                "jobs-workforce", "Hojii fi Ogummaa",
                "healthcare", "Fayyaa fi Wal’aansa",
                "education-events", "Barnootaa fi Qophii"
        );
        for (ServiceCategory c : categoryRepo.findAll()) {
            boolean dirty = false;
            if (c.getNameOm() == null || c.getNameOm().isBlank()) {
                c.setNameOm(omBySlug.getOrDefault(c.getSlug(), c.getName()));
                dirty = true;
            }
            if (c.getDefaultListingType() == null || c.getDefaultListingType().isBlank()) {
                c.setDefaultListingType(switch (c.getCategoryType().toUpperCase(Locale.ROOT)) {
                    case "RETAIL" -> "PRODUCT";
                    case "DELIVERY" -> "TRANSPORT";
                    default -> c.getCategoryType().toUpperCase(Locale.ROOT);
                });
                dirty = true;
            }
            if (dirty) categoryRepo.save(c);
        }

        for (CategoryDocumentRequirement req : requirementRepo.findAll()) {
            if (req.getDocumentTypeId() == null) {
                String code = req.getDocumentCode() != null
                        ? req.getDocumentCode().trim().toUpperCase(Locale.ROOT)
                        : req.getDocumentName().toUpperCase(Locale.ROOT).replaceAll("[^A-Z0-9]+", "_");
                DocumentType dt = docTypes.get(code);
                if (dt == null) {
                    dt = documentTypeRepo.save(docType(
                            code,
                            req.getDocumentName(),
                            req.getDocumentNameAm() != null ? req.getDocumentNameAm() : req.getDocumentName(),
                            req.getDocumentNameOm() != null ? req.getDocumentNameOm() : req.getDocumentName(),
                            req.getDescription(),
                            req.isMandatory(),
                            req.isRequiresDocumentNumber()
                    ));
                    docTypes.put(code, dt);
                }
                req.setDocumentTypeId(dt.getId());
                req.setDocumentNameAm(dt.getDocumentNameAm());
                req.setDocumentNameOm(dt.getDocumentNameOm());
                requirementRepo.save(req);
            }
        }
    }

    private DocumentType docType(String code, String name, String nameAm, String nameOm, String desc, boolean mandatory, boolean requiresDocNum) {
        DocumentType d = new DocumentType();
        d.setDocumentCode(code);
        d.setDocumentName(name);
        d.setDocumentNameAm(nameAm);
        d.setDocumentNameOm(nameOm);
        d.setDescription(desc);
        d.setDefaultMandatory(mandatory);
        d.setDefaultRequiresDocumentNumber(requiresDocNum);
        d.setStatus("ACTIVE");
        return d;
    }

    private ServiceCategory cat(String slug, String name, String nameAm, String nameOm, String desc, String type, String defaultListingType, boolean reqVerify, String comm, String minPrice, int order) {
        ServiceCategory c = new ServiceCategory();
        c.setSlug(slug);
        c.setName(name);
        c.setNameAm(nameAm);
        c.setNameOm(nameOm);
        c.setDescription(desc);
        c.setCategoryType(type);
        c.setDefaultListingType(defaultListingType);
        c.setRequiresVerification(reqVerify);
        c.setCommissionRate(new BigDecimal(comm));
        c.setMinPriceEtb(new BigDecimal(minPrice));
        c.setStatus("ACTIVE");
        c.setDisplayOrder(order);
        return c;
    }

    private void saveReq(Long categoryId, DocumentType dt, boolean mandatory, boolean requiresDocNum) {
        if (dt == null) return;
        CategoryDocumentRequirement r = new CategoryDocumentRequirement();
        r.setCategoryId(categoryId);
        r.setDocumentTypeId(dt.getId());
        r.setDocumentCode(dt.getDocumentCode());
        r.setDocumentName(dt.getDocumentName());
        r.setDocumentNameAm(dt.getDocumentNameAm());
        r.setDocumentNameOm(dt.getDocumentNameOm());
        r.setDescription(dt.getDescription());
        r.setMandatory(mandatory);
        r.setRequiresDocumentNumber(requiresDocNum);
        requirementRepo.save(r);
    }
}
