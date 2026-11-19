import type { Category } from '../types/nearestyou.ts';

export type AppLanguage = 'en' | 'am' | 'om';

export const LANGUAGE_LABELS: Record<AppLanguage, string> = {
  en: 'English',
  am: 'አማርኛ',
  om: 'Afaan Oromoo',
};

const CATEGORY_OM_BY_SLUG: Record<string, string> = {
  'shops-retail': 'Suuqiiwwanii fi Daldala',
  'food-dining': 'Mana Nyaataa fi Dhugaatii',
  'restaurants-food': 'Mana Nyaataa fi Dhugaatii',
  'home-services': 'Tajaajila Manaa fi Teeknikaa',
  'delivery-transport': 'Ergaa fi Geejjiba',
  'rentals-property': 'Kireessuu Qabeenyaa',
  rentals: 'Kireessuu Qabeenyaa fi Konkolaataa',
  'jobs-workforce': 'Hojii fi Ogummaa',
  'workforce-jobs': 'Hojii fi Humna Namaa',
  healthcare: 'Fayyaa fi Faarmaasii',
  'education-events': 'Barnootaa fi Qophii',
  education: 'Barnootaa fi Leenjii',
  events: 'Qophii fi Bashannana',
};

export function getCategoryLabel(cat: Category | undefined, lang: AppLanguage, fallback = ''): string {
  if (!cat) return fallback;
  if (lang === 'am') return cat.nameAm || cat.name;
  if (lang === 'om') return cat.nameOm || CATEGORY_OM_BY_SLUG[cat.slug] || cat.name;
  return cat.name;
}

export function getDocumentLabel(
  doc: { documentName: string; documentNameAm?: string | null; documentNameOm?: string | null } | undefined,
  lang: AppLanguage
): string {
  if (!doc) return '';
  if (lang === 'am') return doc.documentNameAm || doc.documentName;
  if (lang === 'om') return doc.documentNameOm || doc.documentName;
  return doc.documentName;
}

export function formatPricingModelLabel(model?: string | null, lang: AppLanguage = 'en'): string {
  const key = (model || '').toUpperCase();
  const labels = TRANSLATIONS[lang]?.discover || TRANSLATIONS.en.discover;
  switch (key) {
    case 'ONE_TIME_CONTRACT':
      return labels.oneTimeContract;
    case 'FULL_TIME':
      return labels.fullTime;
    case 'PER_HOUR':
      return labels.perHour;
    case 'PER_DAY':
      return 'Per Day';
    case 'PER_MONTH':
      return 'Per Month';
    case 'PER_SESSION':
      return 'Per Session';
    case 'PER_UNIT':
      return 'Per Unit';
    case 'CALCULATED':
      return 'Calculated Rate';
    case 'FIXED':
      return 'Fixed Price';
    case 'NEGOTIABLE':
      return labels.negotiable;
    case 'SALARY_RANGE':
      return 'Salary Range';
    default:
      return (model || 'FIXED').replace(/_/g, ' ');
  }
}

interface Translations {
  nav: {
    discover: string;
    delivery: string;
    activity: string;
    business: string;
    admin: string;
    signIn: string;
    signUp: string;
    profile: string;
    languageLabel: string;
  };
  discover: {
    locationHeader: string;
    becomeProvider: string;
    heroTitle: string;
    heroSubtitle: string;
    searchPlaceholder: string;
    radius: string;
    allAddis: string;
    requestCourier: string;
    heroImageBadge: string;
    heroImageCaption: string;
    allServices: string;
    viewCards: string;
    viewSplit: string;
    viewMap: string;
    compare: string;
    cart: string;
    hideFilters: string;
    showFilters: string;
    matchingListings: string;
    liveProvidersNear: string;
    reset: string;
    sortDistance: string;
    sortPriceAsc: string;
    sortPriceDesc: string;
    sortRating: string;
    sortNewest: string;
    serviceType: string;
    allTypes: string;
    pricingModel: string;
    allPricingModels: string;
    minPrice: string;
    maxPrice: string;
    minRating: string;
    anyRating: string;
    approvedOnly: string;
    faydaVerifiedOnly: string;
    liveGpsOnly: string;
    availableNow: string;
    deliverySupported: string;
    discountedOnly: string;
    resultsHeading: string;
    mapHeading: string;
    noResults: string;
    noResultsHint: string;
    resetAll: string;
    addToCart: string;
    viewApply: string;
    reserveDates: string;
    calculateBook: string;
    bookNow: string;
    comparing: string;
    addCompare: string;
    liveGps: string;
    faydaLiveVerified: string;
    detectedLocationLabel: string;
    detectingLocation: string;
    refreshGps: string;
    recommendedTitle: string;
    recommendedSubtitle: string;
    nearestFirstBadge: string;
    kmAway: string;
    liveProvidersNearby: string;
    scanImageBtn: string;
    openCameraBtn: string;
    imageModalTitle: string;
    imageModalSubtitle: string;
    tabCamera: string;
    tabUpload: string;
    captureSearch: string;
    analyzingImage: string;
    visualMatchBanner: string;
    clearImageSearch: string;
    retakePhoto: string;
    switchCamera: string;
    chooseImageFile: string;
    scanSelectedImage: string;
    advertiseSelf: string;
    jobSeekerBadge: string;
    hireContact: string;
    negotiable: string;
    contactMessage: string;
    liveChat: string;
    writeReply: string;
    oneTimeContract: string;
    fullTime: string;
    perHour: string;
  };
  delivery: {
    title: string;
    subtitle: string;
    tabCustomer: string;
    tabPartner: string;
    tabTrackLive: string;
    independentDelivery: string;
    passengerRide: string;
    pickupTitle: string;
    destinationTitle: string;
    selectFromMapPlaces: string;
    pinOnMap: string;
    searchMapPlaces: string;
    distanceFromMap: string;
    calculatingRoute: string;
    packageDetails: string;
    receiverName: string;
    receiverPhone: string;
    declaredValue: string;
    vehicleCategory: string;
    standard: string;
    express: string;
    confirmDelivery: string;
    confirmRide: string;
    signInToConfirm: string;
    fareBreakdownTitle: string;
    fareBreakdownSubtitle: string;
    baseFee: string;
    distanceCharge: string;
    expressSurcharge: string;
    vatLabel: string;
    guaranteedTotal: string;
    antiTheftTitle: string;
    antiTheft1: string;
    antiTheft2: string;
    antiTheft3: string;
    antiTheft4: string;
    partnerQueueTitle: string;
    partnerQueueSubtitle: string;
    acceptJob: string;
    confirmPickupOtp: string;
    confirmDeliveryOtp: string;
    reportTheftFreeze: string;
    escrowStatus: string;
    pickupOtpLabel: string;
    deliveryOtpLabel: string;
  };
  activity: {
    title: string;
    subtitle: string;
    signInPromptTitle: string;
    signInPromptDesc: string;
    signInBtn: string;
    tabOrders: string;
    tabBookings: string;
    tabDeliveries: string;
    tabJobs: string;
    tabMessages: string;
    tabSaved: string;
    liveChat: string;
    escrowHeld: string;
    pickupOtpHint: string;
    deliveryOtpHint: string;
    reportTheftBtn: string;
    disputeFrozenBadge: string;
  };
  admin: {
    title: string;
    subtitle: string;
    tabRequirements: string;
    tabProviderKyc: string;
    tabBusinessesUsers: string;
    tabCategories: string;
    tabPolicy: string;
    tabTaxReport: string;
    tabAudit: string;
    taxReportTitle: string;
    taxReportSubtitle: string;
    exportCsv: string;
    printReport: string;
    refreshReport: string;
    totalTaxDue: string;
    vatCollected: string;
    whtCollected: string;
    taxableBase: string;
    digitalCompliance: string;
    escrowHeldKpi: string;
    taxpayerBreakdownTitle: string;
    fiscalLedgerTitle: string;
    disputesQueueTitle: string;
    resolveRefund: string;
    resolveRelease: string;
  };
}

export const TRANSLATIONS: Record<AppLanguage, Translations> = {
  en: {
    nav: {
      discover: 'Discover',
      delivery: 'Deliveries',
      activity: 'My Activity',
      business: 'Business Portal',
      admin: 'Admin',
      signIn: 'Sign In',
      signUp: 'Sign Up',
      profile: 'Profile',
      languageLabel: 'Language',
    },
    discover: {
      locationHeader: 'Addis Ababa, Ethiopia · Real-Time GPS & Fayda Verified',
      becomeProvider: 'Become a Provider',
      heroTitle: 'Everything you need, just around you.',
      heroSubtitle:
        'Discover Fayda-verified providers, live GPS-tracked services, shops, restaurants, rentals, healthcare, and local jobs across Addis Ababa — every listing with upfront ETB pricing.',
      searchPlaceholder: 'Search service, landmark, woreda, business, or license...',
      radius: 'Radius:',
      allAddis: 'All Addis',
      requestCourier: 'Request Courier or Ride Estimate',
      heroImageBadge: 'Fayda ID · Live Biometric Check · Real-Time Map',
      heroImageCaption:
        'Every provider passes Fayda verification, live liveness checks, and pins their real-time location.',
      allServices: 'All Services',
      viewCards: 'Cards',
      viewSplit: 'Split View',
      viewMap: 'Live Map',
      compare: 'Compare',
      cart: 'Cart',
      hideFilters: 'Hide Advanced Filters',
      showFilters: 'Show Advanced Filters',
      matchingListings: 'matching listings',
      liveProvidersNear: 'live providers near',
      reset: 'Reset',
      sortDistance: 'Sort: Nearest Distance',
      sortPriceAsc: 'Sort: Lowest Price (ETB)',
      sortPriceDesc: 'Sort: Highest Price (ETB)',
      sortRating: 'Sort: Highest Rating',
      sortNewest: 'Sort: Newly Published',
      serviceType: 'Service / Listing Type',
      allTypes: 'All Types',
      pricingModel: 'Pricing Model',
      allPricingModels: 'All Pricing Models',
      minPrice: 'Min Price (ETB)',
      maxPrice: 'Max Price (ETB)',
      minRating: 'Minimum Rating',
      anyRating: 'Any Rating',
      approvedOnly: 'Approved Businesses Only',
      faydaVerifiedOnly: 'Fayda & Liveness Verified',
      liveGpsOnly: 'Real-Time Live GPS Only',
      availableNow: 'Available Now',
      deliverySupported: 'Delivery Supported',
      discountedOnly: 'Discounted Offers Only',
      resultsHeading: 'Matching Services & Listings',
      mapHeading: 'Real-Time Service Map',
      noResults: 'No matching listings found',
      noResultsHint: 'Try clearing a price/rating filter or widening your radius to All Addis.',
      resetAll: 'Reset All Filters',
      addToCart: 'Add to Cart',
      viewApply: 'View & Apply',
      reserveDates: 'Reserve Dates',
      calculateBook: 'Calculate & Book',
      bookNow: 'Book Now',
      comparing: 'Comparing',
      addCompare: '+ Compare',
      liveGps: 'Live GPS',
      faydaLiveVerified: 'Fayda & Live Verified',
      detectedLocationLabel: 'Your Current Location',
      detectingLocation: 'Detecting your exact location...',
      refreshGps: 'Update Exact GPS',
      recommendedTitle: 'Recommended Near You Now',
      recommendedSubtitle:
        'Picked automatically from your backend-resolved current location before you search.',
      nearestFirstBadge: 'Nearest first',
      kmAway: 'km away',
      liveProvidersNearby: 'live providers near you',
      scanImageBtn: 'Scan Image',
      openCameraBtn: 'Camera',
      imageModalTitle: 'Search by Image or Camera',
      imageModalSubtitle:
        'Open your camera or scan an image of any item, shop sign, or service to find the nearest matches.',
      tabCamera: 'Open Camera',
      tabUpload: 'Scan / Upload Image',
      captureSearch: 'Capture & Find Nearest',
      analyzingImage: 'Scanning image & finding nearest matches...',
      visualMatchBanner: 'Visual Scan Match',
      clearImageSearch: 'Clear Image Search',
      retakePhoto: 'Retake',
      switchCamera: 'Flip Camera',
      chooseImageFile: 'Choose Image or Scan Photo',
      scanSelectedImage: 'Find Nearest Matches',
      advertiseSelf: 'Advertise Yourself (Job Seeker)',
      jobSeekerBadge: 'Individual Job Seeker',
      hireContact: 'Contact & Message',
      negotiable: 'Negotiable',
      contactMessage: 'Contact & Message',
      liveChat: 'Live Chat',
      writeReply: 'Write a message to reply...',
      oneTimeContract: 'One-Time Contract',
      fullTime: 'Full-Time',
      perHour: 'Per Hour',
    },
    delivery: {
      title: 'Delivery & Transportation Dispatch',
      subtitle:
        'Select pickup & destination from OpenStreetMap or drop pins to auto-calculate route kilometers, protected by Escrow + Dual-OTP anti-theft verification.',
      tabCustomer: 'Request Delivery / Ride',
      tabPartner: 'Partner & Driver Console',
      tabTrackLive: 'Track Driver Live',
      independentDelivery: 'Independent Delivery',
      passengerRide: 'Passenger Ride / Taxi',
      pickupTitle: 'Start / Pickup Location',
      destinationTitle: 'Destination Location',
      selectFromMapPlaces: 'Known Addis Map Places',
      pinOnMap: 'Click Map to Pin',
      searchMapPlaces: 'Search OpenStreetMap place or street in Ethiopia...',
      distanceFromMap: 'Calculated Map Distance',
      calculatingRoute: 'Computing free OSRM driving route kilometers...',
      packageDetails: 'Package Description, Seal & Weight',
      receiverName: 'Authorized Receiver Full Name',
      receiverPhone: 'Receiver Phone (for Handover OTP)',
      declaredValue: 'Declared Item Value (ETB)',
      vehicleCategory: 'Vehicle Category',
      standard: 'Standard',
      express: 'Express Priority',
      confirmDelivery: 'Confirm Escrow Delivery',
      confirmRide: 'Confirm Protected Ride',
      signInToConfirm: 'Sign In to Confirm',
      fareBreakdownTitle: 'Transparent Fare & Tax Breakdown',
      fareBreakdownSubtitle:
        'Calculated live from OSRM road distance + platform policy including 15% VAT.',
      baseFee: 'Base fee',
      distanceCharge: 'Distance charge',
      expressSurcharge: 'Express surcharge',
      vatLabel: 'VAT (15%)',
      guaranteedTotal: 'Guaranteed Total Fare',
      antiTheftTitle: 'Anti-Theft Escrow & Dual-OTP Protection',
      antiTheft1: 'Only Fayda + Liveness verified drivers can accept dispatch jobs.',
      antiTheft2: 'Payment is held in Platform Escrow until physical handover is verified.',
      antiTheft3: 'Driver must enter Sender Pickup OTP at collection to prevent ghost pickups.',
      antiTheft4: 'Driver must enter Receiver Delivery OTP at drop-off before escrow releases.',
      partnerQueueTitle: 'Verified Partner Dispatch Queue',
      partnerQueueSubtitle:
        'Accept open jobs, verify Sender Pickup OTP, and enter Receiver Delivery OTP to release escrow.',
      acceptJob: 'Accept Job',
      confirmPickupOtp: 'Verify Pickup OTP',
      confirmDeliveryOtp: 'Release Escrow via Receiver OTP',
      reportTheftFreeze: 'Freeze Escrow / Report Issue',
      escrowStatus: 'Escrow',
      pickupOtpLabel: 'Pickup OTP',
      deliveryOtpLabel: 'Receiver OTP',
    },
    activity: {
      title: 'My Orders, Bookings & Escrow Dispatch',
      subtitle:
        'Track ETB fiscal receipts, dual-OTP handover codes, active bookings, and freeze escrow in case of theft or fraud.',
      signInPromptTitle: 'Your Orders, Bookings & Activity',
      signInPromptDesc:
        'Sign in with Email & Password or Google to view vendor orders, pickup/delivery security OTP codes, bookings, and job applications.',
      signInBtn: 'Sign In / Sign Up',
      tabOrders: 'Orders',
      tabBookings: 'Bookings & Rentals',
      tabDeliveries: 'Deliveries & Escrow',
      tabJobs: 'Jobs',
      tabMessages: 'Live Chat & Messages',
      tabSaved: 'Saved',
      liveChat: 'Live Chat',
      escrowHeld: 'Escrow Protection',
      pickupOtpHint: 'Share with driver ONLY when handing over parcel:',
      deliveryOtpHint: 'Send privately to Receiver to unlock driver payout on arrival:',
      reportTheftBtn: 'Report Theft / Freeze Escrow',
      disputeFrozenBadge: 'ESCROW FROZEN · UNDER ADMIN INVESTIGATION',
    },
    admin: {
      title: 'Platform Administration Console',
      subtitle:
        'Configure service documents, verify Fayda KYC, resolve escrow disputes, and export Government Tax Reports.',
      tabRequirements: 'Service Requirements',
      tabProviderKyc: 'Provider KYC Queue',
      tabBusinessesUsers: 'Businesses & Admin Users',
      tabCategories: 'Categories',
      tabPolicy: 'Pricing Policy',
      tabTaxReport: 'Government Tax Report',
      tabAudit: 'Audit Logs',
      taxReportTitle: 'Government Tax Control & Revenue Report (MoR / ERCA)',
      taxReportSubtitle:
        'Real-time VAT (15%), Withholding Tax (2% on >=3,000 ETB), Digital vs Cash compliance, and fiscal receipt ledger.',
      exportCsv: 'Download Fiscal CSV',
      printReport: 'Print Official Report',
      refreshReport: 'Refresh Data',
      totalTaxDue: 'Total Tax Payable to Govt',
      vatCollected: 'VAT Output (15%)',
      whtCollected: 'Withholding Tax (2%)',
      taxableBase: 'Total Taxable Base',
      digitalCompliance: 'Digital Payment Traceability',
      escrowHeldKpi: 'Escrow Held / Frozen',
      taxpayerBreakdownTitle: 'Registered Taxpayer / Business Fiscal Summary',
      fiscalLedgerTitle: 'Itemized Government Fiscal Receipt Ledger',
      disputesQueueTitle: 'Anti-Theft Escrow Dispute Resolution Queue',
      resolveRefund: 'Refund Sender (Theft/Failure Confirmed)',
      resolveRelease: 'Release to Driver (Valid Delivery)',
    },
  },
  am: {
    nav: {
      discover: 'አገልግሎት ፈልግ',
      delivery: 'ትራንስፖርት እና መላኪያ',
      activity: 'እንቅስቃሴዬ',
      business: 'የንግድ ፖርታል',
      admin: 'አስተዳዳሪ',
      signIn: 'ግባ',
      signUp: 'ተመዝገብ',
      profile: 'መገለጫ',
      languageLabel: 'ቋንቋ',
    },
    discover: {
      locationHeader: 'አዲስ አበባ፣ ኢትዮጵያ · በፋይዳ መታወቂያ እና ቀጥታ ጂፒኤስ የተረጋገጠ',
      becomeProvider: 'አገልግሎት ሰጪ ይሁኑ',
      heroTitle: 'የሚፈልጉት ሁሉ፣ በአቅራቢያዎ።',
      heroSubtitle:
        'በፋይዳ የተረጋገጡ አገልግሎት ሰጪዎችን፣ ሱቆችን፣ ምግብ ቤቶችን፣ ኪራዮችን፣ ጤና እና የስራ እድሎችን በአዲስ አበባ ውስጥ በግልጽ የብር ዋጋ ያግኙ።',
      searchPlaceholder: 'አገልግሎት፣ አካባቢ፣ ወረዳ፣ ንግድ ወይም ፈቃድ ይፈልጉ...',
      radius: 'ርቀት:',
      allAddis: 'መላው አዲስ አበባ',
      requestCourier: 'የመላኪያ ወይም የጉዞ ዋጋ አስላ',
      heroImageBadge: 'ፋይዳ መታወቂያ · የህይወት ማረጋገጫ · ቀጥታ ካርታ',
      heroImageCaption:
        'እያንዳንዱ አገልግሎት ሰጪ በፋይዳ እና በቀጥታ ካሜራ ተረጋግጦ ቦታውን በካርታ ላይ ያስመዘግባል።',
      allServices: 'ሁሉም አገልግሎቶች',
      viewCards: 'ካርዶች',
      viewSplit: 'ካርድ + ካርታ',
      viewMap: 'ቀጥታ ካርታ',
      compare: 'አወዳድር',
      cart: 'ጋሪ',
      hideFilters: 'ተጨማሪ ማጣሪያዎችን ደብቅ',
      showFilters: 'ተጨማሪ ማጣሪያዎችን አሳይ',
      matchingListings: 'የተገኙ ውጤቶች',
      liveProvidersNear: 'ቀጥታ አገልግሎት ሰጪዎች በ',
      reset: 'ዳግም አስጀምር',
      sortDistance: 'ቅደም ተከተል: በቅርብ ርቀት',
      sortPriceAsc: 'ቅደም ተከተል: ዝቅተኛ ዋጋ (ETB)',
      sortPriceDesc: 'ቅደም ተከተል: ከፍተኛ ዋጋ (ETB)',
      sortRating: 'ቅደም ተከተል: ከፍተኛ ደረጃ',
      sortNewest: 'ቅደም ተከተል: አዲስ የወጡ',
      serviceType: 'የአገልግሎት አይነት',
      allTypes: 'ሁሉም አይነቶች',
      pricingModel: 'የዋጋ አሰላል',
      allPricingModels: 'ሁሉም የዋጋ አሰላሎች',
      minPrice: 'ዝቅተኛ ዋጋ (ETB)',
      maxPrice: 'ከፍተኛ ዋጋ (ETB)',
      minRating: 'ዝቅተኛ ደረጃ',
      anyRating: 'ማንኛውም ደረጃ',
      approvedOnly: 'የተፈቀዱ ንግዶች ብቻ',
      faydaVerifiedOnly: 'ፋይዳ እና ህይወት የተረጋገጠ',
      liveGpsOnly: 'ቀጥታ ጂፒኤስ ያላቸው ብቻ',
      availableNow: 'አሁን ዝግጁ የሆኑ',
      deliverySupported: 'መላኪያ ያላቸው',
      discountedOnly: 'ቅናሽ ያላቸው ብቻ',
      resultsHeading: 'የተገኙ አገልግሎቶች እና ምርቶች',
      mapHeading: 'የቀጥታ ካርታ እይታ',
      noResults: 'ምንም ተዛማጅ ውጤት አልተገኘም',
      noResultsHint: 'የዋጋ ማጣሪያውን ይቀንሱ ወይም ርቀቱን ወደ መላው አዲስ አበባ ያስፉ።',
      resetAll: 'ማጣሪያዎችን ሁሉ አጽዳ',
      addToCart: 'ወደ ጋሪ ጨምር',
      viewApply: 'ይመልከቱ እና ያመልክቱ',
      reserveDates: 'ቀን ይያዙ',
      calculateBook: 'አስልተው ይዘዙ',
      bookNow: 'አሁን ይዘዙ',
      comparing: 'በንጽጽር ላይ',
      addCompare: '+ አወዳድር',
      liveGps: 'ቀጥታ ጂፒኤስ',
      faydaLiveVerified: 'በፋይዳ የተረጋገጠ',
      detectedLocationLabel: 'የአሁኑ ቦታዎ',
      detectingLocation: 'ትክክለኛ ቦታዎን በማወቅ ላይ...',
      refreshGps: 'ትክክለኛ ጂፒኤስ አድስ',
      recommendedTitle: 'በአሁኑ ቦታዎ አቅራቢያ የተመከሩ',
      recommendedSubtitle: 'ፍለጋ ከመጀመርዎ በፊት አሁን ባሉበት ትክክለኛ ቦታ መሰረት የተመረጡ አገልግሎቶች።',
      nearestFirstBadge: 'ቅርብ የሆኑት መጀመሪያ',
      kmAway: 'ኪ.ሜ ርቀት',
      liveProvidersNearby: 'ቀጥታ አገልግሎት ሰጪዎች በአቅራቢያዎ',
      scanImageBtn: 'ምስል ቃኝ',
      openCameraBtn: 'ካሜራ',
      imageModalTitle: 'በምስል ወይም በካሜራ ፈልግ',
      imageModalSubtitle:
        'ካሜራ ይክፈቱ ወይም የማንኛውም እቃ ወይም አገልግሎት ምስል ይቃኙ፤ ቅርብ የሆኑ አገልግሎቶችን መጀመሪያ ያሳያል።',
      tabCamera: 'ካሜራ ክፈት',
      tabUpload: 'ምስል ቃኝ / ምረጥ',
      captureSearch: 'አንሳና ቅርብ የሆኑትን ፈልግ',
      analyzingImage: 'ምስሉን በመቃኘት ቅርብ የሆኑትን በመፈለግ ላይ...',
      visualMatchBanner: 'የምስል ፍለጋ ውጤት',
      clearImageSearch: 'የምስል ፍለጋ አጽዳ',
      retakePhoto: 'እንደገና አንሳ',
      switchCamera: 'ካሜራ ቀይር',
      chooseImageFile: 'ምስል ይምረጡ ወይም ይቃኙ',
      scanSelectedImage: 'ቅርብ አገልግሎቶችን ፈልግ',
      advertiseSelf: 'ራስዎን ያስተዋውቁ (ስራ ፈላጊ)',
      jobSeekerBadge: 'የግል ስራ ፈላጊ',
      hireContact: 'ያግኙ እና መልዕክት ይጻፉ',
      negotiable: 'በስምምነት',
      contactMessage: 'ያግኙ እና መልዕክት ይጻፉ',
      liveChat: 'ቀጥታ ውይይት (Live Chat)',
      writeReply: 'ምላሽ ለመጻፍ መልዕክት ይጻፉ...',
      oneTimeContract: 'የአንድ ጊዜ ኮንትራት',
      fullTime: 'ሙሉ ጊዜ (Full-Time)',
      perHour: 'በሰዓት (Per Hour)',
    },
    delivery: {
      title: 'የመላኪያ እና የትራንስፖርት ስምሪት',
      subtitle:
        'መነሻ እና መድረሻን ከነፃ ካርታ (OpenStreetMap) ወይም ከዝርዝር ይምረጡ፤ ኪሎሜትሩን በነፃ ያሰላዋል — በኤስክሮ እና በሁለት የOTP ኮዶች ከስርቆት የተጠበቀ።',
      tabCustomer: 'መላኪያ / ጉዞ ይዘዙ',
      tabPartner: 'የአሽከርካሪ እና አጋር ገጽ',
      tabTrackLive: 'አሽከርካሪውን በቀጥታ ተከታተል',
      independentDelivery: 'የእቃ መላኪያ',
      passengerRide: 'የተሳፋሪ ጉዞ / ታክሲ',
      pickupTitle: 'መነሻ / መቀበያ ቦታ',
      destinationTitle: 'መድረሻ ቦታ',
      selectFromMapPlaces: 'ከካርታው የታወቁ ቦታዎች',
      pinOnMap: 'ካርታ ላይ ንኩ',
      searchMapPlaces: 'የኢትዮጵያን ቦታ ወይም መንገድ በነፃ ይፈልጉ...',
      distanceFromMap: 'ከካርታው የተሰላ ርቀት',
      calculatingRoute: 'የመንገድ ኪሎሜትር በነፃ OSRM በመሰላት ላይ...',
      packageDetails: 'የእቃው ዝርዝር እና ክብደት',
      receiverName: 'የተቀባዩ ሙሉ ስም',
      receiverPhone: 'የተቀባዩ ስልክ ቁጥር (ለOTP)',
      declaredValue: 'የተገመተ የእቃ ዋጋ (ETB)',
      vehicleCategory: 'የተሽከርካሪ አይነት',
      standard: 'መደበኛ',
      express: 'ፈጣን (Express)',
      confirmDelivery: 'በኤስክሮ ጥበቃ መላኪያ አረጋግጥ',
      confirmRide: 'ጉዞ አረጋግጥ',
      signInToConfirm: 'ለማረጋገጥ ይግቡ',
      fareBreakdownTitle: 'ግልጽ የክፍያ እና የታክስ ዝርዝር',
      fareBreakdownSubtitle: 'ከካርታ ኪሎሜትር እና 15% ተጨማሪ እሴት ታክስ (VAT) ጋር በቀጥታ የተሰላ።',
      baseFee: 'መነሻ ክፍያ',
      distanceCharge: 'የርቀት ክፍያ',
      expressSurcharge: 'የፈጣን አገልግሎት ክፍያ',
      vatLabel: 'ተ.እ.ታ (VAT 15%)',
      guaranteedTotal: 'ጠቅላላ የተረጋገጠ ክፍያ',
      antiTheftTitle: 'የስርቆት መከላከያ ኤስክሮ እና ድርብ OTP ጥበቃ',
      antiTheft1: 'ስራ መቀበል የሚችሉት በፋይዳ እና በህይወት ምርመራ የተረጋገጡ አሽከርካሪዎች ብቻ ናቸው።',
      antiTheft2: 'እቃው በትክክል እስኪደርስ ድረስ ክፍያው በሲስተሙ ኤስክሮ ውስጥ ተይዞ ይቆያል።',
      antiTheft3: 'አሽከርካሪው እቃ ሲረከብ ከላኪው ባለ 6 አሃዝ የመነሻ OTP መቀበል አለበት።',
      antiTheft4: 'ክፍያው እንዲለቀቅ አሽከርካሪው የተቀባዩን ባለ 6 አሃዝ የመድረሻ OTP ማስገባት አለበት።',
      partnerQueueTitle: 'የተረጋገጡ አጋሮች የስራ ወረፋ',
      partnerQueueSubtitle: 'ስራ ይቀበሉ፣ የመነሻ OTP እና የመድረሻ OTP በማስገባት ክፍያዎን ያስለቅቁ።',
      acceptJob: 'ስራውን ተቀበል',
      confirmPickupOtp: 'መነሻ OTP አረጋግጥ',
      confirmDeliveryOtp: 'በመድረሻ OTP ኤስክሮ ልቀቅ',
      reportTheftFreeze: 'ስርቆት ሪፖርት አድርግ / ክፍያ አግድ',
      escrowStatus: 'ኤስክሮ',
      pickupOtpLabel: 'መነሻ OTP',
      deliveryOtpLabel: 'መድረሻ OTP',
    },
    activity: {
      title: 'ትዕዛዞቼ፣ ቦታ ማስያዣዎች እና የኤስክሮ ክትትል',
      subtitle: 'የታክስ ደረሰኞችን፣ የOTP የደህንነት ኮዶችን እና የእቃ ስምሪትዎን በቀጥታ ይከታተሉ።',
      signInPromptTitle: 'ትዕዛዞችዎ እና እንቅስቃሴዎ',
      signInPromptDesc: 'ትዕዛዞችዎን፣ የOTP ኮዶችን እና የስራ ማመልከቻዎችን ለማየት በኢሜይል ወይም በGoogle ይግቡ።',
      signInBtn: 'ግባ / ተመዝገብ',
      tabOrders: 'ትዕዛዞች',
      tabBookings: 'ቦታ ማስያዣ እና ኪራይ',
      tabDeliveries: 'መላኪያ እና ኤስክሮ',
      tabJobs: 'ስራዎች',
      tabMessages: 'ቀጥታ ውይይት እና መልዕክቶች',
      tabSaved: 'የተቀመጡ',
      liveChat: 'ቀጥታ ውይይት',
      escrowHeld: 'የኤስክሮ ጥበቃ',
      pickupOtpHint: 'እቃውን ሲያስረክቡ ለአሽከርካሪው ብቻ ይስጡት:',
      deliveryOtpHint: 'እቃው ሲደርስ ክፍያ እንዲለቀቅ ለተቀባዩ ብቻ ይላኩ:',
      reportTheftBtn: 'ስርቆት ሪፖርት አድርግ / ክፍያ አግድ',
      disputeFrozenBadge: 'ኤስክሮ ታግዷል · በአስተዳዳሪ ምርመራ ላይ',
    },
    admin: {
      title: 'የመድረክ አስተዳደር ገጽ',
      subtitle: 'ሰነዶችን ያዋቅሩ፣ የፋይዳ ማረጋገጫ ይፈትሹ፣ አለመግባባቶችን ይፍቱ እና የመንግስት ታክስ ሪፖርት ያውጡ።',
      tabRequirements: 'የአገልግሎት ሰነድ መስፈርቶች',
      tabProviderKyc: 'የአገልግሎት ሰጪዎች ማረጋገጫ',
      tabBusinessesUsers: 'ንግዶች እና ተጠቃሚዎች',
      tabCategories: 'ምድቦች',
      tabPolicy: 'የዋጋ ፖሊሲ',
      tabTaxReport: 'የመንግስት ታክስ ሪፖርት',
      tabAudit: 'የኦዲት መዝገብ',
      taxReportTitle: 'የመንግስት የታክስ ቁጥጥር እና ገቢ ሪፖርት (ገቢዎች ሚኒስቴር)',
      taxReportSubtitle:
        '15% ተ.እ.ታ (VAT)፣ 2% ዊዝሆልዲንግ ታክስ (>=3,000 ብር)፣ የዲጂታል እና የጥሬ ገንዘብ ክፍያ ንጽጽር እና የደረሰኝ መዝገብ።',
      exportCsv: 'የታክስ CSV አውርድ',
      printReport: 'ይፋዊ ሪፖርት አትም',
      refreshReport: 'መረጃ አድስ',
      totalTaxDue: 'ለመንግስት የሚከፈል ጠቅላላ ታክስ',
      vatCollected: 'የተሰበሰበ ተ.እ.ታ (15%)',
      whtCollected: 'ዊዝሆልዲንግ ታክስ (2%)',
      taxableBase: 'ታክስ የሚከፈልበት ዋጋ',
      digitalCompliance: 'የዲጂታል ክፍያ ቁጥጥር ምጣኔ',
      escrowHeldKpi: 'በኤስክሮ የተያዘ / የታገደ',
      taxpayerBreakdownTitle: 'በእያንዳንዱ ግብር ከፋይ / ንግድ የተመዘገበ የታክስ ማጠቃለያ',
      fiscalLedgerTitle: 'ዝርዝር የመንግስት የታክስ ደረሰኝ መዝገብ',
      disputesQueueTitle: 'የስርቆት እና የኤስክሮ አለመግባባት መፍቻ ወረፋ',
      resolveRefund: 'ለላኪው መልስ (ስርቆት/ብልሽት ተረጋግጧል)',
      resolveRelease: 'ለአሽከርካሪው ልቀቅ (ትክክለኛ አቅርቦት)',
    },
  },
  om: {
    nav: {
      discover: 'Barbaadi',
      delivery: 'Ergaa fi Geejjiba',
      activity: 'Sochii Koo',
      business: 'Poortaalii Daldalaa',
      admin: 'Bulchiinsa',
      signIn: 'Seeni',
      signUp: 'Galmaa’i',
      profile: 'Eenyummaa',
      languageLabel: 'Afaan',
    },
    discover: {
      locationHeader: 'Finfinnee, Itoophiyaa · GPS Yeroo Dhugaa fi Faydaan Mirkaneeffame',
      becomeProvider: 'Tajaajila Kennituu Ta’i',
      heroTitle: 'Waan barbaaddu hunda, naannoo keetti.',
      heroSubtitle:
        'Ogeeyyii Faydaan mirkaneeffaman, suuqiiwwan, mana nyaataa, kireeffannaa, fayyaa fi hojiiwwan naannoo Finfinnee keessaa gatii ETB ifa ta’een argadhaa.',
      searchPlaceholder: 'Tajaajila, naannoo, aanaa, daldala ykn hayyama barbaadi...',
      radius: 'Fageenya:',
      allAddis: 'Finfinnee Hunda',
      requestCourier: 'Gatii Ergaa ykn Taksii Shallagi',
      heroImageBadge: 'Waraqaa Faydaa · Qorannoo Lubbuu · Kaartaa Yeroo Dhugaa',
      heroImageCaption:
        'Tajaajila kennituun hundi mirkaneessa Faydaa, qorannoo kaameeraa lubbuu fi iddoo GPS yeroo dhugaa galmeessa.',
      allServices: 'Tajaajila Hunda',
      viewCards: 'Kaardota',
      viewSplit: 'Kaardii + Kaartaa',
      viewMap: 'Kaartaa Kallattii',
      compare: 'Walbira Qabi',
      cart: 'Kuusaa',
      hideFilters: 'Calaltuu Dabalataa Dhoksi',
      showFilters: 'Calaltuu Dabalataa Agarsiisi',
      matchingListings: 'bu’aawwan walsiman',
      liveProvidersNear: 'tajaajila kennitoota naannoo',
      reset: 'Haqii Jalqabi',
      sortDistance: 'Tartiiba: Dhiyeenyaan',
      sortPriceAsc: 'Tartiiba: Gatii Xiqqaa (ETB)',
      sortPriceDesc: 'Tartiiba: Gatii Guddaa (ETB)',
      sortRating: 'Tartiiba: Sadarkaa Ol’aanaa',
      sortNewest: 'Tartiiba: Kan Dhihoo',
      serviceType: 'Gosa Tajaajilaa',
      allTypes: 'Gosoota Hunda',
      pricingModel: 'Akkaataa Gatii',
      allPricingModels: 'Akkaataa Gatii Hunda',
      minPrice: 'Gatii Xiqqaa (ETB)',
      maxPrice: 'Gatii Guddaa (ETB)',
      minRating: 'Sadarkaa Xiqqaa',
      anyRating: 'Sadarkaa Kamuu',
      approvedOnly: 'Daldala Mirkaneeffame Qofa',
      faydaVerifiedOnly: 'Faydaa fi Lubbuun Mirkaneeffame',
      liveGpsOnly: 'GPS Yeroo Dhugaa Qofa',
      availableNow: 'Amma Kan Qophaa’e',
      deliverySupported: 'Ergaan Kan Danda’amu',
      discountedOnly: 'Hir’ina Gatii Kan Qaban Qofa',
      resultsHeading: 'Bu’aawwan Barbaachaa fi Tajaajiloota',
      mapHeading: 'Kaartaa Tajaajila Yeroo Dhugaa',
      noResults: 'Bu’aan walsimu hin argamne',
      noResultsHint: 'Calaltuu gatii hir’isaa ykn fageenya gara Finfinnee Hundaatti bal’isaa.',
      resetAll: 'Calaltuu Hunda Haqii',
      addToCart: 'Kuusaatti Dabali',
      viewApply: 'Ilaaliitii Iyyadhu',
      reserveDates: 'Guyyaa Qabadhu',
      calculateBook: 'Shallagiitii Ajaji',
      bookNow: 'Amma Ajaji',
      comparing: 'Walbira Qabamaa Jira',
      addCompare: '+ Walbira Qabi',
      liveGps: 'GPS Kallattii',
      faydaLiveVerified: 'Faydaan Mirkaneeffame',
      detectedLocationLabel: 'Bakka Kee Ammaa',
      detectingLocation: 'Bakka kee sirrii adda baasaa jira...',
      refreshGps: 'GPS Sirrii Haaromsi',
      recommendedTitle: 'Naannoo Kee Ammaatti Kan Gorfaman',
      recommendedSubtitle:
        'Osoo hin barbaadin dura bakka kee sirrii ammaa irratti hundaa’uun kan filataman.',
      nearestFirstBadge: 'Dhiyoo kan ta’e dura',
      kmAway: 'km fagaata',
      liveProvidersNearby: 'tajaajila kennitoota naannoo kee',
      scanImageBtn: 'Suuraa Sakatta’i',
      openCameraBtn: 'Kaameeraa',
      imageModalTitle: 'Suuraa ykn Kaameeraan Barbaadi',
      imageModalSubtitle:
        'Kaameeraa bani ykn suuraa meeshaa, mallattoo suuqii ykn tajaajilaa sakatta’uun kan dhiyoo argadhu.',
      tabCamera: 'Kaameeraa Bani',
      tabUpload: 'Suuraa Sakatta’i / Olkaa’i',
      captureSearch: 'Kaasiitii Dhiyoo Barbaadi',
      analyzingImage: 'Suuraa sakatta’aa fi tajaajila dhiyoo barbaadaa jira...',
      visualMatchBanner: 'Bu’aa Sakatta’iinsa Suuraa',
      clearImageSearch: 'Barbaacha Suuraa Haqi',
      retakePhoto: 'Irra Deebi’ii Kaasi',
      switchCamera: 'Kaameeraa Jijjiiri',
      chooseImageFile: 'Suuraa Filadhu ykn Sakatta’i',
      scanSelectedImage: 'Tajaajila Dhiyoo Barbaadi',
      advertiseSelf: 'Of Beeksisi (Hojii Barbaadaa)',
      jobSeekerBadge: 'Hojii Barbaadaa Dhuunfaa',
      hireContact: 'Quunnami & Ergaa Barreessi',
      negotiable: 'Mariidhaan',
      contactMessage: 'Quunnami & Ergaa Barreessi',
      liveChat: 'Marii Kallattii (Live Chat)',
      writeReply: 'Deebii barreessuuf ergaa galchi...',
      oneTimeContract: 'Kiraa / Kontiraata Yeroo Tokkoo',
      fullTime: 'Yeroo Guutuu (Full-Time)',
      perHour: 'Sa’aatiin (Per Hour)',
    },
    delivery: {
      title: 'Ergamaa fi Geejjiba Taksii',
      subtitle:
        'Ka’umsaa fi ga’umsa OpenStreetMap irraa filadhaa; kiilomeetira tolaan ni shallaga — Eeskroo fi koodii OTP lamaan hanna irraa eegame.',
      tabCustomer: 'Ergaa / Imala Ajaji',
      tabPartner: 'Fuula Konkolaachisaa',
      tabTrackLive: 'Konkolaachisaa Kallattiin Hordofi',
      independentDelivery: 'Ergaa Mi’aa',
      passengerRide: 'Imala Namootaa / Taksii',
      pickupTitle: 'Iddoo Ka’umsaa (Fudhannaa)',
      destinationTitle: 'Iddoo Ga’umsaa',
      selectFromMapPlaces: 'Iddoowwan Beekamoo Finfinnee',
      pinOnMap: 'Kaartaa Irra Tuqi',
      searchMapPlaces: 'Iddoo ykn daandii OpenStreetMap barbaadi...',
      distanceFromMap: 'Fageenya Kaartaa Irraa Shallagame',
      calculatingRoute: 'Fageenyi karaa OSRM tolaan shallagamaa jira...',
      packageDetails: 'Ibsa Mi’aa fi Ulfaatinaa',
      receiverName: 'Maqaa Guutuu Fudhataa',
      receiverPhone: 'Bilbila Fudhataa (OTPf)',
      declaredValue: 'Tilmaama Gatii Mi’aa (ETB)',
      vehicleCategory: 'Gosa Konkolaataa',
      standard: 'Idilee',
      express: 'Ariifachiisaa (Express)',
      confirmDelivery: 'Ergaa Eeskroon Eegame Mirkaneessi',
      confirmRide: 'Imala Mirkaneessi',
      signInToConfirm: 'Mirkaneessuuf Seeni',
      fareBreakdownTitle: 'Shallaggii Gatii fi Gibiraa Ifaa',
      fareBreakdownSubtitle:
        'Kiilomeetira kaartaa fi VAT %15 dabalatee kallattiin kan shallagame.',
      baseFee: 'Kaffaltii bu’uuraa',
      distanceCharge: 'Kaffaltii fageenyaa',
      expressSurcharge: 'Kaffaltii ariifachiisaa',
      vatLabel: 'Gibira VAT (15%)',
      guaranteedTotal: 'Ida’ama Kaffaltii Mirkanaa’e',
      antiTheftTitle: 'To’annoo Hanna Irraa Eegu (Eeskroo & OTP Lamaan)',
      antiTheft1: 'Konkolaachistoota Faydaa fi qorannoo lubbuun mirkaneeffaman qofatu hojii fudhata.',
      antiTheft2: 'Hanga mi’ichi nagaan ga’utti maallaqni Eeskroo keessatti eegama.',
      antiTheft3: 'Yeroo mi’a fudhatu konkolaachisaan OTP dijiitii 6 ergaa irraa fudhachuu qaba.',
      antiTheft4: 'Kaffaltiin akka gadhiifamu konkolaachisaan OTP fudhataa galchuu qaba.',
      partnerQueueTitle: 'Tarree Hojii Konkolaachistoota Mirkaneeffamanii',
      partnerQueueSubtitle:
        'Hojii fudhadhaa, OTP ka’umsaa fi OTP fudhataa galchuun kaffaltii gadhiisisaa.',
      acceptJob: 'Hojicha Fudhadhu',
      confirmPickupOtp: 'OTP Ka’umsaa Mirkaneessi',
      confirmDeliveryOtp: 'OTP Fudhataan Eeskroo Gadhiisi',
      reportTheftFreeze: 'Hanna Gabaasi / Maallaqa Dhoorki',
      escrowStatus: 'Eeskroo',
      pickupOtpLabel: 'OTP Ka’umsaa',
      deliveryOtpLabel: 'OTP Fudhataa',
    },
    activity: {
      title: 'Ajaja Koo, Qabannaa fi Hordoffii Eeskroo',
      subtitle:
        'Nagahee gibiraa ETB, koodii OTP nageenyaa fi hanna yoo mudate eeskroo dhaabuu to’adhaa.',
      signInPromptTitle: 'Ajajootaa fi Sochii Keessan',
      signInPromptDesc:
        'Ajajoota, koodii OTP ergaa fi iyyannoo hojii ilaaluuf Iimeeyilii ykn Google’n seenaa.',
      signInBtn: 'Seeni / Galmaa’i',
      tabOrders: 'Ajajoota',
      tabBookings: 'Qabannaa fi Kireessaa',
      tabDeliveries: 'Ergaa fi Eeskroo',
      tabJobs: 'Hojiiwwan',
      tabMessages: 'Marii Kallattii & Ergaawwan',
      tabSaved: 'Kuufaman',
      liveChat: 'Marii Kallattii',
      escrowHeld: 'Eegumsa Eeskroo',
      pickupOtpHint: 'Yeroo mi’a kennitu qofa konkolaachisaatti himi:',
      deliveryOtpHint: 'Kaffaltiin akka gadhiifamu fudhataatti qofa ergi:',
      reportTheftBtn: 'Hanna Gabaasi / Eeskroo Dhoorki',
      disputeFrozenBadge: 'EESKROON DHAABBATEERA · QORANNOO BULCHIINSAA IRRA JIRA',
    },
    admin: {
      title: 'Wiirtuu Bulchiinsa Sirnaa',
      subtitle:
        'Ragaalee tajaajilaa qindeessaa, Faydaa mirkaneessaa, waldhabdee eeskroo hiikaa, gabaasa gibira mootummaa baasaa.',
      tabRequirements: 'Ulaagaa Ragaalee Tajaajilaa',
      tabProviderKyc: 'Mirkaneessa Ogeeyyii (KYC)',
      tabBusinessesUsers: 'Daldalaa fi Fayyadamtoota',
      tabCategories: 'Gosa Tajaajilaa',
      tabPolicy: 'Imaammata Gatii',
      tabTaxReport: 'Gabaasa Gibira Mootummaa',
      tabAudit: 'Galmee Odiitii',
      taxReportTitle: 'Gabaasa To’annoo Gibira Mootummaa (MoR / ERCA)',
      taxReportSubtitle:
        'VAT (15%), Withholding Tax (2% >=3,000 ETB), hordoffii kaffaltii dijitaalaa fi callaa, fi galmee nagahee gibiraa.',
      exportCsv: 'CSV Gibiraa Buufadhu',
      printReport: 'Gabaasa Seeraa Maxxansi',
      refreshReport: 'Daataa Haaromsi',
      totalTaxDue: 'Gibira Mootummaaf Kaffalamu',
      vatCollected: 'VAT Walitti Qabame (15%)',
      whtCollected: 'Withholding Tax (2%)',
      taxableBase: 'Gatii Gibirri Irratti Shallagamu',
      digitalCompliance: 'Sadarkaa Kaffaltii Dijitaalaa',
      escrowHeldKpi: 'Eeskroo Qabame / Dhaabbate',
      taxpayerBreakdownTitle: 'Cuunfaa Gibira Kaffaltootaa fi Daldaltootaa',
      fiscalLedgerTitle: 'Galmee Nagahee Gibira Mootummaa Bal’aa',
      disputesQueueTitle: 'Furmaata Waldhabdee Eeskroo fi Hanna',
      resolveRefund: 'Ergaaf Deebisi (Hanni Mirkanaa’eera)',
      resolveRelease: 'Konkolaachisaaf Gadhiisi (Sirrii dha)',
    },
  },
};
