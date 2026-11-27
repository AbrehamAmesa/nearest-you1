enum AppLanguage { en, am, om }

class AppTranslations {
  static const Map<AppLanguage, String> languageLabels = {
    AppLanguage.en: 'English',
    AppLanguage.am: 'አማርኛ',
    AppLanguage.om: 'Afaan Oromoo',
  };

  static AppLanguage parseLanguage(String? code) {
    switch ((code ?? '').toLowerCase()) {
      case 'am':
        return AppLanguage.am;
      case 'om':
        return AppLanguage.om;
      default:
        return AppLanguage.en;
    }
  }

  static String codeOf(AppLanguage lang) => lang.name;

  static const Map<String, Map<String, String>> _strings = {
    'en': {
      'app_title': 'Nearest You',
      'nav_discover': 'Discover',
      'nav_delivery': 'Deliveries',
      'nav_activity': 'My Activity',
      'nav_business': 'Business',
      'sign_in': 'Sign In',
      'sign_up': 'Sign Up',
      'profile': 'Account',
      'cart': 'Cart',
      'compare': 'Compare',
      'notifications': 'Notifications',
      'search_hint': 'Search service, landmark, shop, or business...',
      'all_services': 'All Services',
      'recommended_title': 'Recommended Near You Now',
      'nearest_first': 'Nearest first',
      'showing_before_gps': 'Showing available listings · Tap GPS to sort nearest first',
      'detecting_gps': 'Updating exact GPS...',
      'update_gps': 'Update GPS',
      'scan_image': 'Image Search',
      'advertise_self': 'Advertise Self (Job Seeker)',
      'add_to_cart': 'Add to Cart',
      'book_now': 'Book Now',
      'calculate_book': 'Calculate & Book',
      'reserve_dates': 'Reserve Dates',
      'view_apply': 'View & Apply',
      'hire_contact': 'Contact & Chat',
      'live_chat': 'Live Chat',
      'no_results': 'No matching listings found',
      'delivery_title': 'Delivery & Transportation Dispatch',
      'tab_request_ride': 'Request',
      'tab_track_live': 'Track Live',
      'tab_partner': 'Partner',
      'activity_title': 'Orders, Bookings & Messages',
      'business_title': 'Business & Provider Portal',
      'tax_from_seller': 'Tax covered by seller (no extra VAT added)',
      'tax_from_buyer': 'Tax from buyer (+15% VAT)',
      'free_delivery_radius': 'Provider-covered delivery up to',
      'voice_hold_or_tap': 'Tap mic to record voice message',
      'voice_recording': 'Recording voice... Tap stop to send',
      'open_payment_details': 'Payment Details',
      'pay_now': 'Pay Now',
    },
    'am': {
      'app_title': 'Nearest You',
      'nav_discover': 'ፈልግ',
      'nav_delivery': 'መላኪያ',
      'nav_activity': 'እንቅስቃሴዬ',
      'nav_business': 'ንግድ',
      'sign_in': 'ግባ',
      'sign_up': 'ተመዝገብ',
      'profile': 'መለያ',
      'cart': 'ጋሪ',
      'compare': 'አወዳድር',
      'notifications': 'ማሳወቂያዎች',
      'search_hint': 'አገልግሎት፣ አካባቢ፣ ሱቅ ወይም ንግድ ይፈልጉ...',
      'all_services': 'ሁሉም አገልግሎቶች',
      'recommended_title': 'በአቅራቢያዎ የተመከሩ',
      'nearest_first': 'ቅርብ የሆኑት መጀመሪያ',
      'showing_before_gps': 'ያሉ አገልግሎቶች እየታዩ ነው · በቅርብ ርቀት ለመደርደር ጂፒኤስ ያድሱ',
      'detecting_gps': 'ትክክለኛ ጂፒኤስ በማወቅ ላይ...',
      'update_gps': 'ጂፒኤስ አድስ',
      'scan_image': 'በምስል ፈልግ',
      'advertise_self': 'ራስዎን ያስተዋውቁ (ስራ ፈላጊ)',
      'add_to_cart': 'ወደ ጋሪ ጨምር',
      'book_now': 'አሁን ይዘዙ',
      'calculate_book': 'አስልተው ይዘዙ',
      'reserve_dates': 'ቀን ይያዙ',
      'view_apply': 'ይመልከቱ እና ያመልክቱ',
      'hire_contact': 'ያግኙ እና ይወያዩ',
      'live_chat': 'ቀጥታ ውይይት',
      'no_results': 'ምንም ውጤት አልተገኘም',
      'delivery_title': 'የመላኪያ እና ትራንስፖርት ስምሪት',
      'tab_request_ride': 'ይዘዙ',
      'tab_track_live': 'ቀጥታ ክትትል',
      'tab_partner': 'አሽከርካሪ',
      'activity_title': 'ትዕዛዞቼ፣ ቦታ ማስያዣ እና መልዕክቶች',
      'business_title': 'የንግድ እና አገልግሎት ሰጪ ፖርታል',
      'tax_from_seller': 'ታክስ በሻጭ የተሸፈነ (ተጨማሪ ታክስ የለም)',
      'tax_from_buyer': 'ታክስ ከገዢ (+15% VAT)',
      'free_delivery_radius': 'ነፃ መላኪያ በአቅራቢው እስከ',
      'voice_hold_or_tap': 'የድምፅ መልዕክት ለመቅዳት ማይክ ይንኩ',
      'voice_recording': 'ድምፅ እየተቀዳ ነው... ለመላክ አቁም ይንኩ',
      'open_payment_details': 'የክፍያ ዝርዝር',
      'pay_now': 'አሁን ክፈል',
    },
    'om': {
      'app_title': 'Nearest You',
      'nav_discover': 'Barbaadi',
      'nav_delivery': 'Ergaa',
      'nav_activity': 'Sochii Koo',
      'nav_business': 'Daldala',
      'sign_in': 'Seeni',
      'sign_up': 'Galmaa’i',
      'profile': 'Eenyummaa',
      'cart': 'Kuusaa',
      'compare': 'Walbira Qabi',
      'notifications': 'Beeksisota',
      'search_hint': 'Tajaajila, naannoo, suuqii ykn daldala barbaadi...',
      'all_services': 'Tajaajila Hunda',
      'recommended_title': 'Naannoo Keetti Kan Gorfaman',
      'nearest_first': 'Dhiyoo kan ta’e dura',
      'showing_before_gps': 'Bu’aawwan jiran agarsiisaa jira · Dhiyeenyaan tartiibessuuf GPS haaromsi',
      'detecting_gps': 'GPS sirrii adda baasaa jira...',
      'update_gps': 'GPS Haaromsi',
      'scan_image': 'Suuraan Barbaadi',
      'advertise_self': 'Of Beeksisi (Hojii Barbaadaa)',
      'add_to_cart': 'Kuusaatti Dabali',
      'book_now': 'Amma Ajaji',
      'calculate_book': 'Shallagiitii Ajaji',
      'reserve_dates': 'Guyyaa Qabadhu',
      'view_apply': 'Ilaaliitii Iyyadhu',
      'hire_contact': 'Quunnami & Mari’adhu',
      'live_chat': 'Marii Kallattii',
      'no_results': 'Bu’aan hin argamne',
      'delivery_title': 'Ergamaa fi Geejjiba Taksii',
      'tab_request_ride': 'Ajaji',
      'tab_track_live': 'Hordofi',
      'tab_partner': 'Konkolaachisaa',
      'activity_title': 'Ajajoota, Qabannaa fi Ergaawwan',
      'business_title': 'Poortaalii Daldalaa fi Ogeeyyii',
      'tax_from_seller': 'Gibirri gurguraa irra (dabalata hin qabu)',
      'tax_from_buyer': 'Gibira bitaa irra (+15% VAT)',
      'free_delivery_radius': 'Geessuun kennituun haguugame hanga',
      'voice_hold_or_tap': 'Ergaa sagalee waraabuuf maayikii tuqi',
      'voice_recording': 'Sagaleen waraabamaa jira... Erguuf dhaabi',
      'open_payment_details': 'Bal’ina Kaffaltii',
      'pay_now': 'Amma Kaffali',
    },
  };

  static String t(AppLanguage lang, String key) {
    return _strings[lang.name]?[key] ?? _strings['en']?[key] ?? key;
  }

  static String formatPricingModel(String? model) {
    final key = (model ?? 'FIXED').toUpperCase();
    switch (key) {
      case 'ONE_TIME_CONTRACT':
        return 'One-Time Contract';
      case 'FULL_TIME':
        return 'Full-Time';
      case 'PER_HOUR':
        return 'Per Hour';
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
        return 'Negotiable';
      case 'SALARY_RANGE':
        return 'Salary Range';
      default:
        return key.replaceAll('_', ' ');
    }
  }
}
