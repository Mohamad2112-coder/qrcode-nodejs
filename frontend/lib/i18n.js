/**
 * Lightweight i18n for EN / AR (Arabic) / KB (Kurdish Sorani).
 * Supports LTR (en) and RTL (ar, kb) text direction.
 */
const DIRECTION = {
  en: 'ltr',
  ar: 'rtl',
  kb: 'rtl',
};

const MESSAGES = {
  en: {
    appName: 'QR Order Pager',
    welcome: 'Welcome',
    pos: 'Point of Sale',
    kitchen: 'Kitchen Display',
    track: 'Track My Order',
    language: 'Language',
    english: 'English',
    arabic: 'العربية',
    kurdish: 'Kurdî',
    addItem: 'Add Item',
    checkout: 'Checkout',
    total: 'Total',
    quantity: 'Qty',
    notes: 'Notes',
    submitOrder: 'Submit Order',
    generatingQR: 'Generating QR Token...',
    qrToken: 'QR Tracking Token',
    scanToTrack: 'Customer scans to track order',
    scanQrToTrack: 'Scan to track your order',
    orderCreated: 'Order Created',
    copyToken: 'Copy Token',
    copyUrl: 'Copy Tracking URL',
    printOrder: 'Print Order',
    statusPending: 'Pending',
    statusPreparing: 'Preparing',
    statusReady: 'Ready',
    statusCollected: 'Collected',
    statusCancelled: 'Cancelled',
    startPreparing: 'Start Preparing',
    markReady: 'Mark Ready',
    markCollected: 'Mark Collected',
    orderReady: 'Order is Ready!',
    enableNotifications: 'Enable Notifications',
    notifyReady: 'Notify me when ready',
    offline: 'Offline',
    online: 'Online',
    syncing: 'Syncing...',
    error: 'Error',
    success: 'Success',
    login: 'Login',
    logout: 'Logout',
    back: 'Back',
    noOrders: 'No orders',
    items: 'Items',
    minutes: 'minutes ago',
    justNow: 'just now',
    table: 'Table',
    customer: 'Customer',
    orders: 'Orders',
    enterToken: 'Please enter your order token',
    invalidToken: 'Invalid token. It should be 64 characters.',
    trackDescription: 'Enter your QR tracking token to see your order status.',
    orderToken: 'Order Token',
    tracking: 'Tracking...',
    trackOrder: 'Track Order',
    tokenHelp: 'Scan your QR code or enter the token from your receipt.',
  },
  ar: {
    appName: 'نظام تتبع الطلبات QR',
    welcome: 'مرحباً',
    pos: 'نقطة البيع',
    kitchen: 'شاشة المطبخ',
    track: 'تتبع طلبي',
    language: 'اللغة',
    english: 'English',
    arabic: 'العربية',
    kurdish: 'Kurdî',
    addItem: 'إضافة عنصر',
    checkout: 'إتمام الدفع',
    total: 'المجموع',
    quantity: 'الكمية',
    notes: 'ملاحظات',
    submitOrder: 'إرسال الطلب',
    generatingQR: 'توليد رمز التتبع السريع...',
    qrToken: 'رمز التتبع السريع',
    scanToTrack: 'يقوم العميل بمسح الرمز لتتبع الطلب',
    scanQrToTrack: 'امسح الرمز لتتبع طلبك',
    orderCreated: 'تم إنشاء الطلب',
    copyToken: 'نسخ الرمز',
    copyUrl: 'نسخ رابط التتبع',
    printOrder: 'طباعة الطلب',
    statusPending: 'قيد الانتظار',
    statusPreparing: 'قيد التحضير',
    statusReady: 'جاهز',
    statusCollected: 'تم الاستلام',
    statusCancelled: 'ملغي',
    startPreparing: 'بدء التحضير',
    markReady: 'ضع جاهز',
    markCollected: 'ضع تم الاستلام',
    orderReady: 'طلبك جاهز!',
    enableNotifications: 'تفعيل الإشعارات',
    notifyReady: 'أعلمني عندما يكون جاهزاً',
    offline: 'غير متصل',
    online: 'متصل',
    syncing: 'جارٍ المزامنة...',
    error: 'خطأ',
    success: 'نجح',
    login: 'تسجيل الدخول',
    logout: 'تسجيل الخروج',
    back: 'رجوع',
    noOrders: 'لا توجد طلبات',
    items: 'العناصر',
    minutes: 'منذ دقائق',
    justNow: 'الآن',
    table: 'الطاولة',
    customer: 'العميل',
    orders: 'الطلبات',
    enterToken: 'الرجاء إدخال رمز طلبك',
    invalidToken: 'رمز غير صالح. يجب أن يكون 64 حرفاً.',
    trackDescription: 'أدخل رمز التتبع السريع الخاص بك لمعرفة حالة طلبك.',
    orderToken: 'رمز الطلب',
    tracking: 'جارٍ التتبع...',
    trackOrder: 'تتبع الطلب',
    tokenHelp: 'امسح رمز الاستجابة السريعة أو أدخل الرمز من إيصالك.',
  },
  kb: {
    appName: 'پۆرتاڵ فانلەکان بە QR',
    welcome: 'بەخێر هێنانی',
    pos: 'نوکەی فرووشتن',
    kitchen: 'شاشەی آشپزخانه',
    track: 'تەقەلاکردنەوەی فانلەکەم',
    language: 'زوان',
    english: 'English',
    arabic: 'العربية',
    kurdish: 'Kurdî',
    addItem: 'زۆرکردنەوەی{item}',
    checkout: 'پردەکەوە خستن',
    total: 'کۆیی',
    quantity: 'ژمارە',
    notes: 'نووسнок',
    submitOrder: 'فرێ.Transaction'.replace('Transaction', 'فرستادنەوەی فانل'),
    generatingQR: 'ئامادەکردنی تووڵە QR...',
    qrToken: 'تووڵە تەقەلاکردنەوەی QR',
    scanToTrack: 'مێژوو لێ دەداتەوە بۆ تەقەلاکردنەوەی فانل',
    orderCreated: 'فانلەکە دروستkirà'.replace('kirà', 'دروستkir'),
    orderReady: 'فانلەکەت ئامادەیە!',
    enableNotifications: 'چالاککردنەوەی پەیامەکان',
    notifyReady: 'پەیام بدە لە کۆتای هەylan',
    offline: 'پەیوەندی نیە',
    online: 'پەیوەندیان',
    syncing: 'یووسانکردن...',
    error: 'هەڵە',
    success: 'بەسەرد',
    login: 'چوونەوە',
    logout: 'چونەوە',
    back: 'گەڕان',
    noOrders: 'هیچ فانلێک نیە',
    items: 'ئەوەکان',
    minutes: 'بژ خوستو',
    justNow: 'ئێستا',
    table: 'پەسەندەکە',
    customer: 'مێژۆو',
    orders: 'فانلەکان',
    enterToken: 'ئەوەی فانلەکەت بنووسە',
    invalidToken: 'تووڵەکە ناکات. پێویستە 64 خراوون بێت.',
    trackDescription: 'تووڵە تەقەلاکردنەوەی QRیەکەت بنووسە بۆ دەStatusی فانلەکەت ببینیت.',
    orderToken: 'تووڵە فانلەکە',
    tracking: 'دەتەقەلێ...',
    trackOrder: 'تەقەلاکردنەوەی فانل',
    tokenHelp: 'تووڵە QR دەسیllen بکە یان تووڵەکە لە فیشەکەدا بنووسە.',
    scanQrToTrack: 'تووڵەکە دەسیllen بکە بۆ تەقەلاکردنەوەی فانلەکەت',
    copyToken: 'نوسینەوەی تووڵ',
    copyUrl: 'نوسینەوەی بەستەری تەقەلاکردنەوە',
    printOrder: 'چاپکردنەوەی فانل',
  },
};

export function getLocale() {
  if (typeof window === 'undefined') return 'en';
  try {
    const stored = localStorage.getItem('qr_locale');
    if (stored && MESSAGES[stored]) return stored;
    const nav = (navigator.language || 'en').toLowerCase();
    if (nav.startsWith('ar')) return 'ar';
    if (nav.startsWith('ku') || nav.startsWith('kb')) return 'kb';
    return 'en';
  } catch (_e) {
    return 'en';
  }
}

export function setLocale(locale) {
  if (typeof window === 'undefined') return;
  if (MESSAGES[locale]) localStorage.setItem('qr_locale', locale);
}

export function t(key, locale = getLocale()) {
  const dict = MESSAGES[locale] || MESSAGES.en;
  return dict[key] || key;
}

export function direction(locale = getLocale()) {
  return DIRECTION[locale] || 'ltr';
}

export function formatCurrency(amount, locale = 'en') {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'IQD',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(Number(amount || 0));
}
