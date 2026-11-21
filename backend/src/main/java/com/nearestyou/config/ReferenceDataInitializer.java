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
    private final KnownLocationRepository knownLocationRepo;
    private final UserSyncService userSyncService;

    public ReferenceDataInitializer(
            ServiceCategoryRepository categoryRepo,
            DocumentTypeRepository documentTypeRepo,
            CategoryDocumentRequirementRepository requirementRepo,
            PlatformSettingRepository settingRepo,
            KnownLocationRepository knownLocationRepo,
            UserSyncService userSyncService
    ) {
        this.categoryRepo = categoryRepo;
        this.documentTypeRepo = documentTypeRepo;
        this.requirementRepo = requirementRepo;
        this.settingRepo = settingRepo;
        this.knownLocationRepo = knownLocationRepo;
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

        ensureKnownLocations();
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

    private void ensureKnownLocations() {
        Set<String> existingCodes = new HashSet<>();
        for (KnownLocation kl : knownLocationRepo.findAll()) {
            if (kl.getCode() != null) {
                existingCodes.add(kl.getCode().toUpperCase(Locale.ROOT));
            }
        }

        List<KnownLocation> catalog = buildKnownLocations200();
        List<KnownLocation> toInsert = new ArrayList<>();
        for (KnownLocation item : catalog) {
            if (!existingCodes.contains(item.getCode().toUpperCase(Locale.ROOT))) {
                toInsert.add(item);
                existingCodes.add(item.getCode().toUpperCase(Locale.ROOT));
            }
        }
        if (!toInsert.isEmpty()) {
            knownLocationRepo.saveAll(toInsert);
        }
    }

    private KnownLocation loc(
            String code,
            String name,
            String nameAm,
            String city,
            String subCity,
            String category,
            String lat,
            String lng
    ) {
        KnownLocation kl = new KnownLocation();
        kl.setCode(code);
        kl.setName(name);
        kl.setNameAm(nameAm);
        kl.setCity(city);
        kl.setSubCity(subCity);
        kl.setCategory(category);
        kl.setLatitude(new BigDecimal(lat));
        kl.setLongitude(new BigDecimal(lng));
        kl.setActive(true);
        return kl;
    }

    private List<KnownLocation> buildKnownLocations200() {
        List<KnownLocation> list = new ArrayList<>(200);

        // 1. Addis Ababa - Bole Sub-City (22)
        list.addAll(List.of(
                loc("AA-BOLE-AIRPORT", "Bole International Airport", "ቦሌ ዓለም አቀፍ አውሮፕላን ማረፊያ", "Addis Ababa", "Bole", "TRANSIT_HUB", "8.977889", "38.799319"),
                loc("AA-BOLE-MEDHANIALEM", "Bole Medhanialem", "ቦሌ መድኃኔዓለም", "Addis Ababa", "Bole", "COMMERCIAL_HUB", "8.997420", "38.786810"),
                loc("AA-BOLE-EDNA-MALL", "Edna Mall / Bole Tele", "ኤድና ሞል / ቦሌ ቴሌ", "Addis Ababa", "Bole", "COMMERCIAL_HUB", "8.996810", "38.786120"),
                loc("AA-BOLE-FRIENDSHIP", "Friendship Business Center", "ፍሬንድሺፕ ቢዝነስ ሴንተር", "Addis Ababa", "Bole", "COMMERCIAL_HUB", "8.993740", "38.784830"),
                loc("AA-BOLE-MILLENNIUM", "Millennium Hall", "ሚሌኒየም አዳራሽ", "Addis Ababa", "Bole", "LANDMARK", "8.989620", "38.788910"),
                loc("AA-BOLE-ATLAS", "Atlas Junction", "አትላስ መስቀለኛ", "Addis Ababa", "Bole", "COMMERCIAL_HUB", "9.004620", "38.782450"),
                loc("AA-BOLE-BRASS", "Bole Brass", "ቦሌ ብራስ", "Addis Ababa", "Bole", "RESIDENTIAL", "8.985230", "38.786710"),
                loc("AA-BOLE-RWANDA", "Bole Rwanda", "ቦሌ ሩዋንዳ", "Addis Ababa", "Bole", "RESIDENTIAL", "8.985150", "38.774520"),
                loc("AA-BOLE-MICHAEL", "Bole Michael", "ቦሌ ሚካኤል", "Addis Ababa", "Bole", "RESIDENTIAL", "8.974610", "38.779850"),
                loc("AA-BOLE-CARGO", "Bole Cargo Terminal", "ቦሌ ካርጎ ተርሚናል", "Addis Ababa", "Bole", "TRANSIT_HUB", "8.969320", "38.797140"),
                loc("AA-BOLE-BULBULA", "Bole Bulbula", "ቦሌ ቡልቡላ", "Addis Ababa", "Bole", "RESIDENTIAL", "8.947850", "38.773410"),
                loc("AA-BOLE-ARABSA", "Bole Arabsa", "ቦሌ አራብሳ", "Addis Ababa", "Bole", "RESIDENTIAL", "8.958920", "38.867340"),
                loc("AA-BOLE-HOMES", "Bole Homes", "ቦሌ ሆምስ", "Addis Ababa", "Bole", "RESIDENTIAL", "8.982140", "38.803510"),
                loc("AA-BOLE-GERJI-ROBA", "Gerji Roba", "ገርጂ ሮባ", "Addis Ababa", "Bole", "COMMERCIAL_HUB", "8.999630", "38.806520"),
                loc("AA-BOLE-GERJI-IMPERIAL", "Gerji Imperial", "ገርጂ ኢምፔሪያል", "Addis Ababa", "Bole", "COMMERCIAL_HUB", "8.996720", "38.811450"),
                loc("AA-BOLE-GERJI-MEBRAT", "Gerji Mebrat Hail", "ገርጂ መብራት ኃይል", "Addis Ababa", "Bole", "RESIDENTIAL", "9.005410", "38.817240"),
                loc("AA-BOLE-JACKROS", "Jackros", "ጃክሮስ", "Addis Ababa", "Bole", "RESIDENTIAL", "9.009120", "38.819530"),
                loc("AA-BOLE-GORO", "Goro Roundabout", "ጎሮ አደባባይ", "Addis Ababa", "Bole", "TRANSIT_HUB", "8.994210", "38.831640"),
                loc("AA-BOLE-WOLLO-SEFER", "Wollo Sefer", "ወሎ ሰፈር", "Addis Ababa", "Bole", "COMMERCIAL_HUB", "8.998540", "38.772910"),
                loc("AA-BOLE-OLYMPIA", "Olympia", "ኦሎምፒያ", "Addis Ababa", "Bole", "COMMERCIAL_HUB", "9.001250", "38.769840"),
                loc("AA-BOLE-DENBEL", "Dembel City Center", "ደምበል ሲቲ ሴንተር", "Addis Ababa", "Bole", "COMMERCIAL_HUB", "9.003480", "38.766230"),
                loc("AA-BOLE-URAEL", "Urael Church Junction", "ኡራኤል ቤተክርስቲያን", "Addis Ababa", "Bole", "LANDMARK", "9.009180", "38.776420")
        ));

        // 2. Addis Ababa - Kirkos Sub-City (18)
        list.addAll(List.of(
                loc("AA-KIRKOS-MESKEL-SQ", "Meskel Square", "መስቀል አደባባይ", "Addis Ababa", "Kirkos", "LANDMARK", "9.010350", "38.761140"),
                loc("AA-KIRKOS-STADIUM", "Addis Ababa Stadium", "አዲስ አበባ ስታዲየም", "Addis Ababa", "Kirkos", "LANDMARK", "9.013240", "38.758610"),
                loc("AA-KIRKOS-KAZANCHIS", "Kazanchis", "ካዛንቺስ", "Addis Ababa", "Kirkos", "COMMERCIAL_HUB", "9.015520", "38.768140"),
                loc("AA-KIRKOS-UNECA", "UNECA / Africa Hall", "ኢካ / አፍሪካ ህንፃ", "Addis Ababa", "Kirkos", "LANDMARK", "9.016740", "38.764320"),
                loc("AA-KIRKOS-GHION", "Ghion Hotel", "ጊዮን ሆቴል", "Addis Ababa", "Kirkos", "LANDMARK", "9.014850", "38.756840"),
                loc("AA-KIRKOS-BAMBIS", "Bambis Supermarket", "ባምቢስ", "Addis Ababa", "Kirkos", "COMMERCIAL_HUB", "9.011780", "38.769510"),
                loc("AA-KIRKOS-FLAMINGO", "Flamingo", "ፍላሚንጎ", "Addis Ababa", "Kirkos", "COMMERCIAL_HUB", "9.008650", "38.764280"),
                loc("AA-KIRKOS-ESTIFANOS", "Estifanos Church", "እስጢፋኖስ ቤተክርስቲያን", "Addis Ababa", "Kirkos", "LANDMARK", "9.011920", "38.761750"),
                loc("AA-KIRKOS-LEGHAR", "Leghar (La Gare)", "ለገሃር", "Addis Ababa", "Kirkos", "TRANSIT_HUB", "9.009840", "38.752460"),
                loc("AA-KIRKOS-NAT-THEATRE", "National Theatre", "ብሔራዊ ቴአትር", "Addis Ababa", "Kirkos", "LANDMARK", "9.015420", "38.753180"),
                loc("AA-KIRKOS-BEKLO-BET", "Beklo Bet", "በቅሎ ቤት", "Addis Ababa", "Kirkos", "COMMERCIAL_HUB", "8.998240", "38.759120"),
                loc("AA-KIRKOS-GOTERA-CONDO", "Gotera Condominium", "ጎተራ ኮንዶሚኒየም", "Addis Ababa", "Kirkos", "RESIDENTIAL", "8.986920", "38.759840"),
                loc("AA-KIRKOS-KERA", "Kera", "ቄራ", "Addis Ababa", "Kirkos", "COMMERCIAL_HUB", "8.987350", "38.749120"),
                loc("AA-KIRKOS-CHURCH", "Kirkos Church", "ቂርቆስ ቤተክርስቲያን", "Addis Ababa", "Kirkos", "LANDMARK", "9.002410", "38.753150"),
                loc("AA-KIRKOS-MESHUALEKIA", "Meshualekia", "መሿለኪያ", "Addis Ababa", "Kirkos", "TRANSIT_HUB", "9.003850", "38.758420"),
                loc("AA-KIRKOS-RICHE", "Riche", "ሪቼ", "Addis Ababa", "Kirkos", "RESIDENTIAL", "8.995120", "38.761830"),
                loc("AA-KIRKOS-HILTON", "Hilton Addis", "ሂልተን አዲስ", "Addis Ababa", "Kirkos", "LANDMARK", "9.019140", "38.763420"),
                loc("AA-KIRKOS-CHERKOS-MKT", "Cherkos Market", "ጨርቆስ ገበያ", "Addis Ababa", "Kirkos", "COMMERCIAL_HUB", "9.000510", "38.752140")
        ));

        // 3. Addis Ababa - Arada Sub-City (16)
        list.addAll(List.of(
                loc("AA-ARADA-PIASSA", "Piassa", "ፒያሳ", "Addis Ababa", "Arada", "COMMERCIAL_HUB", "9.033140", "38.750120"),
                loc("AA-ARADA-ST-GEORGE", "St. George Cathedral", "ቅዱስ ጊዮርጊስ ካቴድራል", "Addis Ababa", "Arada", "LANDMARK", "9.036540", "38.750840"),
                loc("AA-ARADA-MENELIK-SQ", "Menelik II Square", "ዳግማዊ ምኒልክ አደባባይ", "Addis Ababa", "Arada", "LANDMARK", "9.035120", "38.751340"),
                loc("AA-ARADA-ARAT-KILO", "Arat Kilo", "አራት ኪሎ", "Addis Ababa", "Arada", "LANDMARK", "9.033620", "38.763210"),
                loc("AA-ARADA-SIDIST-KILO", "Sidist Kilo / AAU Main Campus", "ስድስት ኪሎ / አዲስ አበባ ዩኒቨርሲቲ", "Addis Ababa", "Arada", "UNIVERSITY", "9.046840", "38.759120"),
                loc("AA-ARADA-AMIST-KILO", "Amist Kilo (AAiT)", "አምስት ኪሎ", "Addis Ababa", "Arada", "UNIVERSITY", "9.040820", "38.762340"),
                loc("AA-ARADA-NAT-MUSEUM", "National Museum of Ethiopia", "ብሔራዊ ሙዚየም", "Addis Ababa", "Arada", "LANDMARK", "9.038450", "38.761820"),
                loc("AA-ARADA-CHURCHILL", "Churchill Avenue", "ቸርችል ጎዳና", "Addis Ababa", "Arada", "COMMERCIAL_HUB", "9.026840", "38.750420"),
                loc("AA-ARADA-TEWODROS-SQ", "Tewodros Square", "ቴዎድሮስ አደባባይ", "Addis Ababa", "Arada", "TRANSIT_HUB", "9.028150", "38.751140"),
                loc("AA-ARADA-RAS-MEKONNEN", "Ras Mekonnen Bridge", "ራስ መኮንን ድልድይ", "Addis Ababa", "Arada", "LANDMARK", "9.031920", "38.756840"),
                loc("AA-ARADA-ERI-BEKENTU", "Eri Bekentu", "እሪ በከንቱ", "Addis Ababa", "Arada", "RESIDENTIAL", "9.028940", "38.756210"),
                loc("AA-ARADA-SOMALE-TERA", "Somale Tera", "ሶማሌ ተራ", "Addis Ababa", "Arada", "COMMERCIAL_HUB", "9.027310", "38.747850"),
                loc("AA-ARADA-ATIKILT-TERA", "Atikilt Tera", "አትክልት ተራ", "Addis Ababa", "Arada", "COMMERCIAL_HUB", "9.034250", "38.746920"),
                loc("AA-ARADA-GEDAM-SEFER", "Gedam Sefer", "ገዳም ሰፈር", "Addis Ababa", "Arada", "RESIDENTIAL", "9.038120", "38.749310"),
                loc("AA-ARADA-DORO-MANEKIA", "Doro Manekia", "ዶሮ ማነቂያ", "Addis Ababa", "Arada", "RESIDENTIAL", "9.037240", "38.754620"),
                loc("AA-ARADA-BELA", "Bela", "በላ", "Addis Ababa", "Arada", "RESIDENTIAL", "9.044510", "38.766420")
        ));

        // 4. Addis Ababa - Yeka Sub-City (16)
        list.addAll(List.of(
                loc("AA-YEKA-MEGENAGNA", "Megenagna", "መገናኛ", "Addis Ababa", "Yeka", "TRANSIT_HUB", "9.020540", "38.799510"),
                loc("AA-YEKA-SHOLA-MKT", "Shola Market", "ሾላ ገበያ", "Addis Ababa", "Yeka", "COMMERCIAL_HUB", "9.024180", "38.786420"),
                loc("AA-YEKA-KEBENA", "Kebena", "ቀበና", "Addis Ababa", "Yeka", "RESIDENTIAL", "9.029450", "38.774820"),
                loc("AA-YEKA-SIGNAL", "Signal", "ሲግናል", "Addis Ababa", "Yeka", "COMMERCIAL_HUB", "9.022640", "38.781950"),
                loc("AA-YEKA-PARK", "Yeka Park", "የካ ፓርክ", "Addis Ababa", "Yeka", "LANDMARK", "9.026410", "38.793120"),
                loc("AA-YEKA-BRITISH-EMB", "British Embassy Area", "ብሪቲሽ ኤምባሲ", "Addis Ababa", "Yeka", "LANDMARK", "9.025840", "38.775310"),
                loc("AA-YEKA-FRENCH-LEG", "French Legation", "ፈረንሳይ ሌጋሲዮን", "Addis Ababa", "Yeka", "RESIDENTIAL", "9.034620", "38.779840"),
                loc("AA-YEKA-FERENSAY", "Ferensay Legasion", "ፈረንሳይ ሌጋሲዮን አደባባይ", "Addis Ababa", "Yeka", "COMMERCIAL_HUB", "9.045120", "38.782450"),
                loc("AA-YEKA-KARA", "Kara", "ካራ", "Addis Ababa", "Yeka", "TRANSIT_HUB", "9.041850", "38.842150"),
                loc("AA-YEKA-KOTEBE-UNIV", "Kotebe University of Education", "ኮተቤ የትምህርት ዩኒቨርሲቲ", "Addis Ababa", "Yeka", "UNIVERSITY", "9.029420", "38.828410"),
                loc("AA-YEKA-KOTEBE-02", "Kotebe 02", "ኮተቤ 02", "Addis Ababa", "Yeka", "RESIDENTIAL", "9.035140", "38.836920"),
                loc("AA-YEKA-ABADO", "Yeka Abado", "የካ አባዶ", "Addis Ababa", "Yeka", "RESIDENTIAL", "9.051240", "38.848920"),
                loc("AA-YEKA-ENTOTO-PARK", "Entoto Park", "እንጦጦ ፓርክ", "Addis Ababa", "Yeka", "LANDMARK", "9.082450", "38.761820"),
                loc("AA-YEKA-ENTOTO-RAGUEL", "Entoto St. Raguel", "እንጦጦ ቅዱስ ራጉኤል", "Addis Ababa", "Yeka", "LANDMARK", "9.084620", "38.759140"),
                loc("AA-YEKA-BALDERAS", "Balderas", "ባልደራስ", "Addis Ababa", "Yeka", "RESIDENTIAL", "9.019840", "38.777320"),
                loc("AA-YEKA-LAMBERET", "Lamberet Bus Station", "ላምበረት መናኸሪያ", "Addis Ababa", "Yeka", "TRANSIT_HUB", "9.031420", "38.817450")
        ));

        // 5. Addis Ababa - Lemi Kura Sub-City (12)
        list.addAll(List.of(
                loc("AA-LEMI-CMC-MICHAEL", "CMC Michael", "ሲኤምሲ ሚካኤል", "Addis Ababa", "Lemi Kura", "COMMERCIAL_HUB", "9.024810", "38.831240"),
                loc("AA-LEMI-CMC-APTS", "CMC Apartments", "ሲኤምሲ አፓርታማ", "Addis Ababa", "Lemi Kura", "RESIDENTIAL", "9.028540", "38.835120"),
                loc("AA-LEMI-SUMMIT-CONDO", "Summit Condominium", "ሰሚት ኮንዶሚኒየም", "Addis Ababa", "Lemi Kura", "RESIDENTIAL", "9.006820", "38.851240"),
                loc("AA-LEMI-SUMMIT-FIYEL", "Summit Fiyel Bet", "ሰሚት ፍየል ቤት", "Addis Ababa", "Lemi Kura", "COMMERCIAL_HUB", "9.009450", "38.844210"),
                loc("AA-LEMI-AYAT-RDBT", "Ayat Roundabout", "አያት አደባባይ", "Addis Ababa", "Lemi Kura", "TRANSIT_HUB", "9.022140", "38.875120"),
                loc("AA-LEMI-AYAT-49", "Ayat 49", "አያት 49", "Addis Ababa", "Lemi Kura", "RESIDENTIAL", "9.016840", "38.884210"),
                loc("AA-LEMI-MERI-LOKI", "Meri Loki", "መሪ ሎቄ", "Addis Ababa", "Lemi Kura", "RESIDENTIAL", "9.023450", "38.854820"),
                loc("AA-LEMI-FIGA", "Figa", "ፊጋ", "Addis Ababa", "Lemi Kura", "RESIDENTIAL", "9.012480", "38.836950"),
                loc("AA-LEMI-SALITE-MIHRET", "Salite Mihret", "ሳሊተ ምህረት", "Addis Ababa", "Lemi Kura", "LANDMARK", "9.021840", "38.812450"),
                loc("AA-LEMI-HAYAT-HOSP", "Hayat Hospital", "ሃያት ሆስፒታል", "Addis Ababa", "Lemi Kura", "HOSPITAL", "9.016420", "38.814820"),
                loc("AA-LEMI-TAFO", "Tafo / Safari", "ጣፎ / ሳፋሪ", "Addis Ababa", "Lemi Kura", "RESIDENTIAL", "9.036510", "38.886140"),
                loc("AA-LEMI-CHEFE", "Chefe", "ጨፌ", "Addis Ababa", "Lemi Kura", "RESIDENTIAL", "9.013850", "38.894210")
        ));

        // 6. Addis Ababa - Nifas Silk-Lafto Sub-City (16)
        list.addAll(List.of(
                loc("AA-NSL-SARBET", "Sarbet", "ሳርቤት", "Addis Ababa", "Nifas Silk-Lafto", "COMMERCIAL_HUB", "8.998910", "38.742640"),
                loc("AA-NSL-AU-HQ", "African Union Headquarters", "የአፍሪካ ህብረት ዋና መስሪያ ቤት", "Addis Ababa", "Nifas Silk-Lafto", "LANDMARK", "9.000420", "38.743850"),
                loc("AA-NSL-PUSHKIN", "Pushkin Square", "ፑሽኪን አደባባይ", "Addis Ababa", "Nifas Silk-Lafto", "TRANSIT_HUB", "8.994620", "38.745810"),
                loc("AA-NSL-GOTERA-INT", "Gotera Interchange", "ጎተራ መገናኛ", "Addis Ababa", "Nifas Silk-Lafto", "TRANSIT_HUB", "8.983410", "38.758120"),
                loc("AA-NSL-BISRATE-GAB", "Bisrate Gabriel", "ብስራተ ገብርኤል", "Addis Ababa", "Nifas Silk-Lafto", "COMMERCIAL_HUB", "8.995140", "38.732410"),
                loc("AA-NSL-MEKANISA", "Mekanisa", "መካኒሳ", "Addis Ababa", "Nifas Silk-Lafto", "RESIDENTIAL", "8.984520", "38.728140"),
                loc("AA-NSL-MEKANISA-ABO", "Mekanisa Abo", "መካኒሳ አቦ", "Addis Ababa", "Nifas Silk-Lafto", "RESIDENTIAL", "8.976840", "38.721950"),
                loc("AA-NSL-JEMO-1", "Jemo 1", "ጀሞ 1", "Addis Ababa", "Nifas Silk-Lafto", "RESIDENTIAL", "8.958420", "38.712450"),
                loc("AA-NSL-JEMO-2", "Jemo 2", "ጀሞ 2", "Addis Ababa", "Nifas Silk-Lafto", "RESIDENTIAL", "8.951240", "38.704820"),
                loc("AA-NSL-JEMO-3", "Jemo 3", "ጀሞ 3", "Addis Ababa", "Nifas Silk-Lafto", "RESIDENTIAL", "8.943850", "38.698410"),
                loc("AA-NSL-LAFTO", "Lafto", "ላፍቶ", "Addis Ababa", "Nifas Silk-Lafto", "COMMERCIAL_HUB", "8.963420", "38.741850"),
                loc("AA-NSL-LEBU", "Lebu", "ለቡ", "Addis Ababa", "Nifas Silk-Lafto", "RESIDENTIAL", "8.946820", "38.721450"),
                loc("AA-NSL-HANA-MARIAM", "Hana Mariam", "ሃና ማርያም", "Addis Ababa", "Nifas Silk-Lafto", "RESIDENTIAL", "8.941240", "38.752410"),
                loc("AA-NSL-GOFA-GABRIEL", "Gofa Gebriel", "ጎፋ ገብርኤል", "Addis Ababa", "Nifas Silk-Lafto", "COMMERCIAL_HUB", "8.976850", "38.746920"),
                loc("AA-NSL-GOFA-SEFER", "Gofa Sefer", "ጎፋ ሰፈር", "Addis Ababa", "Nifas Silk-Lafto", "RESIDENTIAL", "8.981420", "38.748150"),
                loc("AA-NSL-NIFAS-SILK", "Nifas Silk", "ንፋስ ስልክ", "Addis Ababa", "Nifas Silk-Lafto", "COMMERCIAL_HUB", "8.972410", "38.753820")
        ));

        // 7. Addis Ababa - Lideta Sub-City (10)
        list.addAll(List.of(
                loc("AA-LIDETA-MEXICO", "Mexico Square", "ሜክሲኮ አደባባይ", "Addis Ababa", "Lideta", "TRANSIT_HUB", "9.010240", "38.744510"),
                loc("AA-LIDETA-TIKUR-ANBESSA", "Tikur Anbessa Hospital", "ጥቁር አንበሳ ሆስፒታል", "Addis Ababa", "Lideta", "HOSPITAL", "9.020940", "38.748420"),
                loc("AA-LIDETA-CHURCH", "Lideta Church", "ልደታ ቤተክርስቲያን", "Addis Ababa", "Lideta", "LANDMARK", "9.013850", "38.736420"),
                loc("AA-LIDETA-GEJA-SEFER", "Geja Sefer", "ገጃ ሰፈር", "Addis Ababa", "Lideta", "RESIDENTIAL", "9.017420", "38.739140"),
                loc("AA-LIDETA-BALCHA", "Balcha Hospital", "ባልቻ ሆስፒታል", "Addis Ababa", "Lideta", "HOSPITAL", "9.015620", "38.740850"),
                loc("AA-LIDETA-SENGATERA", "Sengatera", "ሰንጋተራ", "Addis Ababa", "Lideta", "COMMERCIAL_HUB", "9.017140", "38.746210"),
                loc("AA-LIDETA-HIGH-COURT", "Federal High Court Lideta", "ልደታ ከፍተኛ ፍርድ ቤት", "Addis Ababa", "Lideta", "LANDMARK", "9.013420", "38.739850"),
                loc("AA-LIDETA-ABNET", "Abnet", "አብነት", "Addis Ababa", "Lideta", "COMMERCIAL_HUB", "9.022140", "38.734820"),
                loc("AA-LIDETA-TOR-HAILOCH", "Tor Hailoch", "ጦር ኃይሎች", "Addis Ababa", "Lideta", "TRANSIT_HUB", "9.010420", "38.722410"),
                loc("AA-LIDETA-COCA-COLA", "Coca-Cola Junction", "ኮካ ኮላ", "Addis Ababa", "Lideta", "COMMERCIAL_HUB", "9.016850", "38.731420")
        ));

        // 8. Addis Ababa - Addis Ketema Sub-City (10)
        list.addAll(List.of(
                loc("AA-AKET-MERKATO", "Merkato", "መርካቶ", "Addis Ababa", "Addis Ketema", "COMMERCIAL_HUB", "9.031420", "38.737840"),
                loc("AA-AKET-AUTOBUS-TERA", "Autobus Tera", "አውቶቡስ ተራ", "Addis Ababa", "Addis Ketema", "TRANSIT_HUB", "9.034620", "38.735140"),
                loc("AA-AKET-ANWAR-MOSQUE", "Grand Anwar Mosque", "ታላቁ አንዋር መስጊድ", "Addis Ababa", "Addis Ketema", "LANDMARK", "9.031850", "38.740120"),
                loc("AA-AKET-GOJJAM-BERENDA", "Gojjam Berenda", "ጎጃም በረንዳ", "Addis Ababa", "Addis Ketema", "COMMERCIAL_HUB", "9.034120", "38.742850"),
                loc("AA-AKET-TEKLEHAIMANOT", "Teklehaimanot Square", "ተክለሃይማኖት አደባባይ", "Addis Ababa", "Addis Ketema", "TRANSIT_HUB", "9.027450", "38.743120"),
                loc("AA-AKET-SEBASTOPOL", "Sebastopol", "ሴባስቶፖል", "Addis Ababa", "Addis Ketema", "COMMERCIAL_HUB", "9.028910", "38.736420"),
                loc("AA-AKET-BOMB-TERA", "Bomb Tera", "ቦምብ ተራ", "Addis Ababa", "Addis Ketema", "COMMERCIAL_HUB", "9.032940", "38.736850"),
                loc("AA-AKET-HABTE-GIORGIS", "Habte Giorgis Bridge", "ሀብተ ጊዮርጊስ ድልድይ", "Addis Ababa", "Addis Ketema", "LANDMARK", "9.029450", "38.745820"),
                loc("AA-AKET-MESALEMIA", "Mesalemia", "መሳለሚያ", "Addis Ababa", "Addis Ketema", "COMMERCIAL_HUB", "9.037840", "38.729410"),
                loc("AA-AKET-PASTOR", "Pastor Square", "ፓስተር አደባባይ", "Addis Ababa", "Addis Ketema", "TRANSIT_HUB", "9.041850", "38.734620")
        ));

        // 9. Addis Ababa - Kolfe Keranio Sub-City (12)
        list.addAll(List.of(
                loc("AA-KOLFE-CENTER", "Kolfe", "ኮልፌ", "Addis Ababa", "Kolfe Keranio", "RESIDENTIAL", "9.028450", "38.712410"),
                loc("AA-KOLFE-AYER-TENA", "Ayer Tena", "አየር ጤና", "Addis Ababa", "Kolfe Keranio", "TRANSIT_HUB", "8.983420", "38.702410"),
                loc("AA-KOLFE-ALEM-BANK", "Alem Bank", "ዓለም ባንክ", "Addis Ababa", "Kolfe Keranio", "RESIDENTIAL", "8.992410", "38.698420"),
                loc("AA-KOLFE-BETHEL", "Bethel", "ቤተል", "Addis Ababa", "Kolfe Keranio", "COMMERCIAL_HUB", "9.004620", "38.704850"),
                loc("AA-KOLFE-ZENEBEWORK", "Zenebework", "ዘነበወርቅ", "Addis Ababa", "Kolfe Keranio", "RESIDENTIAL", "8.996850", "38.714210"),
                loc("AA-KOLFE-ALERT", "ALERT Hospital", "አለርት ሆስፒታል", "Addis Ababa", "Kolfe Keranio", "HOSPITAL", "8.995420", "38.711840"),
                loc("AA-KOLFE-TOTAL-3", "Total 3 Quatir", "ቶታል 3 ቁጥር", "Addis Ababa", "Kolfe Keranio", "TRANSIT_HUB", "9.009450", "38.714820"),
                loc("AA-KOLFE-18-MAZORIA", "18 Mazoria", "18 ማዞሪያ", "Addis Ababa", "Kolfe Keranio", "TRANSIT_HUB", "9.021840", "38.722410"),
                loc("AA-KOLFE-KERANIO", "Keranio", "ቀራኒዮ", "Addis Ababa", "Kolfe Keranio", "RESIDENTIAL", "9.026850", "38.704120"),
                loc("AA-KOLFE-WEYRA", "Weyra Sefer", "ወይራ ሰፈር", "Addis Ababa", "Kolfe Keranio", "RESIDENTIAL", "9.012480", "38.708420"),
                loc("AA-KOLFE-REPI", "Repi", "ረጲ", "Addis Ababa", "Kolfe Keranio", "RESIDENTIAL", "8.979420", "38.694820"),
                loc("AA-KOLFE-KARA-KORE", "Kara Kore", "ካራ ቆሬ", "Addis Ababa", "Kolfe Keranio", "COMMERCIAL_HUB", "8.972410", "38.688450")
        ));

        // 10. Addis Ababa - Gullele Sub-City (10)
        list.addAll(List.of(
                loc("AA-GULLELE-SHIRO-MEDA", "Shiro Meda", "ሽሮ ሜዳ", "Addis Ababa", "Gullele", "COMMERCIAL_HUB", "9.062410", "38.762140"),
                loc("AA-GULLELE-US-EMBASSY", "US Embassy / Kechene", "አሜሪካ ኤምባሲ", "Addis Ababa", "Gullele", "LANDMARK", "9.059420", "38.760450"),
                loc("AA-GULLELE-SEMEN-HOTEL", "Semen Hotel", "ሰሜን ሆቴል", "Addis Ababa", "Gullele", "LANDMARK", "9.046210", "38.749820"),
                loc("AA-GULLELE-ADDISU-GEBEYA", "Addisu Gebeya", "አዲሱ ገበያ", "Addis Ababa", "Gullele", "COMMERCIAL_HUB", "9.051840", "38.738420"),
                loc("AA-GULLELE-ST-PAUL", "St. Paul's Hospital", "ቅዱስ ጳውሎስ ሆስፒታል", "Addis Ababa", "Gullele", "HOSPITAL", "9.046820", "38.732410"),
                loc("AA-GULLELE-WINGATE", "Wingate", "ዊንጌት", "Addis Ababa", "Gullele", "TRANSIT_HUB", "9.053420", "38.721850"),
                loc("AA-GULLELE-SHEGOLE", "Shegole", "ሸጎሌ", "Addis Ababa", "Gullele", "RESIDENTIAL", "9.048920", "38.726410"),
                loc("AA-GULLELE-RUFAEL", "Rufael", "ሩፋኤል", "Addis Ababa", "Gullele", "RESIDENTIAL", "9.054820", "38.731420"),
                loc("AA-GULLELE-KECHENE", "Kechene Medhanialem", "ቀጨኔ መድኃኔዓለም", "Addis Ababa", "Gullele", "RESIDENTIAL", "9.051420", "38.758420"),
                loc("AA-GULLELE-BOTANIC", "Gullele Botanic Garden", "ጉለሌ እፅዋት ማዕከል", "Addis Ababa", "Gullele", "LANDMARK", "9.074820", "38.746210")
        ));

        // 11. Addis Ababa - Akaky Kaliti Sub-City (12)
        list.addAll(List.of(
                loc("AA-KALITI-TOTAL", "Kaliti Total", "ቃሊቲ ቶታል", "Addis Ababa", "Akaky Kaliti", "TRANSIT_HUB", "8.940120", "38.761540"),
                loc("AA-KALITI-SARIS", "Saris", "ሳሪስ", "Addis Ababa", "Akaky Kaliti", "COMMERCIAL_HUB", "8.958420", "38.764120"),
                loc("AA-KALITI-SARIS-ABO", "Saris Abo", "ሳሪስ አቦ", "Addis Ababa", "Akaky Kaliti", "RESIDENTIAL", "8.952410", "38.765820"),
                loc("AA-KALITI-DRIVERS", "Kaliti Drivers Training", "ቃሊቲ ማሰልጠኛ", "Addis Ababa", "Akaky Kaliti", "TRANSIT_HUB", "8.926840", "38.764210"),
                loc("AA-KALITI-AKAKI-BESEKA", "Akaki Beseka", "አቃቂ በሰቃ", "Addis Ababa", "Akaky Kaliti", "COMMERCIAL_HUB", "8.876420", "38.786410"),
                loc("AA-KALITI-TIRUNESH-HOSP", "Tirunesh Beijing Hospital", "ጥሩነሽ ቤጂንግ ሆስፒታል", "Addis Ababa", "Akaky Kaliti", "HOSPITAL", "8.871420", "38.791240"),
                loc("AA-KALITI-KILINTO", "Kilinto Industrial Park", "ቂሊንጦ ኢንዱስትሪ ፓርክ", "Addis Ababa", "Akaky Kaliti", "INDUSTRIAL", "8.902410", "38.804820"),
                loc("AA-KALITI-KOYEFECHE", "Koye Feche Condominium", "ኮዬ ፈጬ", "Addis Ababa", "Akaky Kaliti", "RESIDENTIAL", "8.884210", "38.808450"),
                loc("AA-KALITI-TULU-DIMTU", "Tulu Dimtu", "ቱሉ ዲምቱ", "Addis Ababa", "Akaky Kaliti", "RESIDENTIAL", "8.894620", "38.821450"),
                loc("AA-KALITI-GELAN-CONDO", "Gelan Condominium", "ገላን ኮንዶሚኒየም", "Addis Ababa", "Akaky Kaliti", "RESIDENTIAL", "8.842150", "38.818420"),
                loc("AA-KALITI-BOLE-LEMI", "Bole Lemi Industrial Park", "ቦሌ ለሚ ኢንዱስትሪ ፓርክ", "Addis Ababa", "Akaky Kaliti", "INDUSTRIAL", "8.972410", "38.854820"),
                loc("AA-KALITI-AASTU", "AASTU Campus", "አዲስ አበባ ሳይንስና ቴክኖሎጂ ዩኒቨርሲቲ", "Addis Ababa", "Akaky Kaliti", "UNIVERSITY", "8.885420", "38.809820")
        ));

        // 12. Sheger City & Greater Addis Corridor (12)
        list.addAll(List.of(
                loc("ET-SHEGER-DUKEM", "Dukem", "ዱከም", "Sheger", "Dukem", "INDUSTRIAL", "8.802410", "38.901240"),
                loc("ET-OROMIA-BISHOFTU", "Bishoftu (Debre Zeit)", "ቢሾፍቱ (ደብረ ዘይት)", "Bishoftu", "Center", "REGIONAL_CITY", "8.752410", "38.978420"),
                loc("ET-OROMIA-BABOGAYA", "Lake Babogaya", "ባቦጋያ ሐይቅ", "Bishoftu", "Babogaya", "LANDMARK", "8.784620", "38.992410"),
                loc("ET-OROMIA-MOJO", "Mojo", "ሞጆ", "Mojo", "Center", "TRANSIT_HUB", "8.586840", "39.121450"),
                loc("ET-SHEGER-SEBETA", "Sebeta", "ሰበታ", "Sheger", "Sebeta", "COMMERCIAL_HUB", "8.911420", "38.621450"),
                loc("ET-SHEGER-ALEM-GENA", "Alem Gena", "ዓለም ገና", "Sheger", "Alem Gena", "COMMERCIAL_HUB", "8.938420", "38.654820"),
                loc("ET-SHEGER-BURAYU", "Burayu", "ቡራዩ", "Sheger", "Burayu", "COMMERCIAL_HUB", "9.064820", "38.652410"),
                loc("ET-SHEGER-GEFERSA", "Gefersa", "ገፈርሳ", "Sheger", "Gefersa", "RESIDENTIAL", "9.069420", "38.634820"),
                loc("ET-SHEGER-SULULTA", "Sululta", "ሱሉልታ", "Sheger", "Sululta", "COMMERCIAL_HUB", "9.178420", "38.758420"),
                loc("ET-OROMIA-SENDAFA", "Sendafa", "ሰንዳፋ", "Sendafa", "Center", "COMMERCIAL_HUB", "9.152410", "39.024820"),
                loc("AA-SHEGER-LEGETAFO", "Legetafo Legedadi", "ለገጣፎ ለገዳዲ", "Sheger", "Legetafo", "RESIDENTIAL", "9.068420", "38.892410"),
                loc("ET-OROMIA-HOLETA", "Holeta", "ሆለታ", "Holeta", "Center", "REGIONAL_CITY", "9.059420", "38.501420")
        ));

        // 13. Major Ethiopian Regional Cities, Universities & Hubs (34)
        list.addAll(List.of(
                loc("ET-ADAMA-CENTER", "Adama (Nazret) Center", "አዳማ", "Adama", "Center", "REGIONAL_CITY", "8.541389", "39.268611"),
                loc("ET-ADAMA-ASTU", "Adama Science & Tech University", "አዳማ ሳይንስና ቴክኖሎጂ ዩኒቨርሲቲ", "Adama", "Geda", "UNIVERSITY", "8.563420", "39.289410"),
                loc("ET-ADAMA-IND-PARK", "Adama Industrial Park", "አዳማ ኢንዱስትሪ ፓርክ", "Adama", "Boku", "INDUSTRIAL", "8.524810", "39.248420"),
                loc("ET-ZIWAY-BATU", "Batu (Ziway)", "ባቱ (ዝዋይ)", "Batu", "Center", "REGIONAL_CITY", "7.934820", "38.716840"),
                loc("ET-SHASHAMANE", "Shashamane", "ሻሸመኔ", "Shashamane", "Center", "REGIONAL_CITY", "7.200000", "38.600000"),
                loc("ET-HAWASSA-CENTER", "Hawassa City Center", "ሀዋሳ", "Hawassa", "Piazza", "REGIONAL_CITY", "7.062050", "38.476350"),
                loc("ET-HAWASSA-UNIV", "Hawassa University Main Campus", "ሀዋሳ ዩኒቨርሲቲ", "Hawassa", "Tabor", "UNIVERSITY", "7.051420", "38.496820"),
                loc("ET-HAWASSA-IND-PARK", "Hawassa Industrial Park", "ሀዋሳ ኢንዱስትሪ ፓርክ", "Hawassa", "Industrial", "INDUSTRIAL", "7.081420", "38.486420"),
                loc("ET-DILLA", "Dilla", "ዲላ", "Dilla", "Center", "REGIONAL_CITY", "6.410280", "38.310000"),
                loc("ET-ARBA-MINCH", "Arba Minch", "አርባ ምንጭ", "Arba Minch", "Sikela", "REGIONAL_CITY", "6.033330", "37.550000"),
                loc("ET-WOLAITA-SODO", "Wolaita Sodo", "ወላይታ ሶዶ", "Wolaita Sodo", "Center", "REGIONAL_CITY", "6.860000", "37.761670"),
                loc("ET-HOSAENA", "Hosaena", "ሆሳዕና", "Hosaena", "Center", "REGIONAL_CITY", "7.549720", "37.853610"),
                loc("ET-BAHIR-DAR-CENTER", "Bahir Dar City Center", "ባህር ዳር", "Bahir Dar", "Center", "REGIONAL_CITY", "11.593640", "37.390770"),
                loc("ET-BAHIR-DAR-PEDA", "Bahir Dar University (Peda)", "ባህር ዳር ዩኒቨርሲቲ", "Bahir Dar", "Peda", "UNIVERSITY", "11.574820", "37.396420"),
                loc("ET-GONDAR-PIAZZA", "Gondar Piazza", "ጎንደር ፒያሳ", "Gondar", "Piazza", "REGIONAL_CITY", "12.600000", "37.466670"),
                loc("ET-GONDAR-MARAKI", "University of Gondar (Maraki)", "ጎንደር ዩኒቨርሲቲ", "Gondar", "Maraki", "UNIVERSITY", "12.589420", "37.441820"),
                loc("ET-LALIBELA", "Lalibela", "ላሊበላ", "Lalibela", "Center", "LANDMARK", "12.031670", "39.041110"),
                loc("ET-DEBRE-MARKOS", "Debre Markos", "ደብረ ማርቆስ", "Debre Markos", "Center", "REGIONAL_CITY", "10.333330", "37.733330"),
                loc("ET-DEBRE-BIRHAN", "Debre Birhan", "ደብረ ብርሃን", "Debre Birhan", "Center", "REGIONAL_CITY", "9.680000", "39.530000"),
                loc("ET-DESSIE", "Dessie", "ደሴ", "Dessie", "Piazza", "REGIONAL_CITY", "11.133330", "39.633330"),
                loc("ET-KOMBOLCHA", "Kombolcha", "ኮምቦልቻ", "Kombolcha", "Center", "INDUSTRIAL", "11.081550", "39.743390"),
                loc("ET-MEKELLE-CENTER", "Mekelle City Center", "መቀሌ", "Mekelle", "Hawelti", "REGIONAL_CITY", "13.496670", "39.475280"),
                loc("ET-MEKELLE-UNIV", "Mekelle University (Adi Haki)", "መቀሌ ዩኒቨርሲቲ", "Mekelle", "Adi Haki", "UNIVERSITY", "13.479420", "39.486420"),
                loc("ET-AXUM", "Axum", "አክሱም", "Axum", "Center", "LANDMARK", "14.121090", "38.723370"),
                loc("ET-DIRE-DAWA-KEFIRA", "Dire Dawa Kefira", "ድሬዳዋ ከፊራ", "Dire Dawa", "Kefira", "REGIONAL_CITY", "9.593060", "41.866110"),
                loc("ET-DIRE-DAWA-SABIAN", "Dire Dawa Sabian", "ድሬዳዋ ሳቢያን", "Dire Dawa", "Sabian", "COMMERCIAL_HUB", "9.604820", "41.842410"),
                loc("ET-HARAR-JUGOL", "Harar Jugol", "ሐረር ጀጎል", "Harar", "Jugol", "LANDMARK", "9.313870", "42.118150"),
                loc("ET-HARAMAYA-UNIV", "Haramaya University", "ሐረማያ ዩኒቨርሲቲ", "Haramaya", "Campus", "UNIVERSITY", "9.423420", "42.036820"),
                loc("ET-JIGJIGA", "Jigjiga", "ጅግጅጋ", "Jigjiga", "Center", "REGIONAL_CITY", "9.350000", "42.800000"),
                loc("ET-JIMMA-CENTER", "Jimma City Center", "ጅማ", "Jimma", "Center", "REGIONAL_CITY", "7.673440", "36.834410"),
                loc("ET-JIMMA-UNIV", "Jimma University", "ጅማ ዩኒቨርሲቲ", "Jimma", "Main Campus", "UNIVERSITY", "7.681420", "36.854820"),
                loc("ET-NEKEMTE", "Nekemte", "ነቀምቴ", "Nekemte", "Center", "REGIONAL_CITY", "9.083330", "36.550000"),
                loc("ET-GAMBELA", "Gambela", "ጋምቤላ", "Gambela", "Center", "REGIONAL_CITY", "8.250000", "34.583330"),
                loc("ET-SEMERA", "Semera", "ሰመራ", "Semera", "Center", "REGIONAL_CITY", "11.795560", "41.008610")
        ));

        return list;
    }
}
