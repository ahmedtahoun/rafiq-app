import { useAppStore } from '../store/appStore';

export type Lang = 'en' | 'ar';

export const RTL_LANGS: Lang[] = ['ar'];

// Seeded with copy for the screens built so far (Welcome, RoleSelect) —
// ported 1:1 from each screen's own translations() in the Claude Artifact
// design prototype. Add keys here as each further screen is built for
// real, rather than pre-populating copy for screens that don't exist yet.
const dict: Record<Lang, Record<string, string>> = {
  en: {
    skip: 'Skip',
    next: 'Next',
    getStarted: 'Get Started',

    welcome1Eyebrow: 'Welcome to Rafiq',
    welcome1HeadlinePre: 'Run your whole practice ',
    welcome1HeadlineBold: 'from one place',
    welcome1Subtext: 'Manage members, schedule sessions, and assign tasks — no more juggling spreadsheets and scattered chats.',

    welcome2Eyebrow: 'Stay close',
    welcome2HeadlinePre: 'Right where your ',
    welcome2HeadlineBold: 'chats already happen',
    welcome2Subtext: 'Confirm bookings, send reminders, and nudge members to check in — all over WhatsApp, no new app for them to learn.',

    welcome3Eyebrow: 'Every specialty',
    welcome3HeadlinePre: 'Track real progress, ',
    welcome3HeadlineBold: 'together',
    welcome3Subtext: 'From life coaching to diving, yoga, and nutrition — give every member a clear path with tasks, session packages, and milestones.',

    roleTitle: "You're joining as a...",
    roleSubtitle: "This decides what you'll see next — pick the one that's you.",
    imPro: "I'm a Pro",
    imProSub: 'Manage members, schedule sessions, and track their progress.',
    imMember: "I'm a Member",
    imMemberSub: "Follow your pro's plan, tasks, and upcoming sessions.",
    continue: 'Continue',

    onboardingSubtitle: "Let's set up your coaching profile so members know what you offer.",
    fullName: 'Full name',
    phoneNumber: 'Phone number',
    onboardingPhoneHint: 'So members can reach you in the app between sessions.',
    emailAddress: 'Email address',
    city: 'City',
    country: 'Country',
    whatDoYouCoach: 'What do you coach?',
    chooseAllThatApply: 'Choose all that apply',
    yearsOfExperience: 'Years of experience',
    selectCountry: 'Select country',
    selectDialingCode: 'Select dialing code',
    searchCountries: 'Search countries',
    noCountriesMatch: 'No countries match your search',
    categoryMind: 'Mind & Emotional Wellbeing',
    categoryBody: 'Body & Fitness',
    categoryRelationships: 'Relationships & Family',
    categoryCareer: 'Career',
    expLt1: '<1 year',
    exp1to2: '1-2 years',
    exp3to5: '3-5 years',
    exp5plus: '5+ years',
    specLife: 'Life coaching',
    specMeditation: 'Meditation coaching',
    specBreathwork: 'Breathwork coaching',
    specStress: 'Stress & anxiety coaching',
    specSleep: 'Sleep coaching',
    specYoga: 'Yoga coaching',
    specCalisthenics: 'Calisthenics coaching',
    specFitness: 'Fitness coaching',
    specNutrition: 'Nutrition coaching',
    specFreeDiving: 'Free diving coaching',
    specScuba: 'Scuba diving coaching',
    specRelationship: 'Relationship coaching',
    specBreakup: 'Breakup coaching',
    specParenting: 'Parenting coaching',
    specCareer: 'Career coaching',
    missingName: 'your name',
    missingPhone: 'a phone number',
    missingEmail: 'a valid email address',
    missingCity: 'your city',
    missingSpecialties: 'at least one specialty',
    validationPrefix: 'Please add ',
    validationSuffix: ' to continue.',
    listSeparator: ', ',
    welcomePrefix: 'Welcome to Rafiq, ',
    // QuickActions.dc.html
    quickActionsTitle: 'Quick actions', quickActionsClose: 'Close',
    qaAddMember: 'Add member', qaAddMemberSub: 'Bring a new member onboard',
    qaViewProfile: 'View profile', qaViewProfileSub: 'See their full profile and progress',
    qaScheduleSession: 'Schedule session', qaScheduleSessionSub: 'Book a new time slot',
    qaAssignTask: 'Assign task', qaAssignTaskSub: 'Give a member their next step',
    qaLogSession: 'Log session', qaLogSessionSub: 'Mark a session as completed',
    qaRecordPayment: 'Record payment', qaRecordPaymentSub: 'Mark a payment as received',
    qaSendMessage: 'Message', qaSendMessageSub: 'Send them a message in the app',

    // Main.dc.html
    mainGreeting: 'Good Morning', mainCoachName: 'Yasmin El-Sayed', mainStreak: '12-day streak',
    mainSessions: 'Sessions', mainActiveClients: 'active members', mainCompletionRate: 'completion rate',
    mainThisWeek: 'This Week', mainSessionsWord: 'sessions',
    mainTodaysSchedule: "Today's Schedule", mainSeeAll: 'See all', mainNoSessions: 'No sessions scheduled today',
    mainNeedsAttention: 'Needs Your Attention', mainAllCaughtUp: "You're all caught up!",
    mainUpNext: 'Up next', mainJoinChip: 'Join',
    mainCheckinNote: 'No recent check-in', mainPaymentOverdueNote: 'Payment overdue', mainPaymentDueNote: 'Payment due',
    mainTaskOverdueNote: 'Task overdue', mainNoSessionNote: 'No upcoming session',
    mainPackageExpiredNote: 'Package expired', mainPackageNoSessionsNote: 'No sessions left', mainPackageSoonNote: 'Package expires in {n}d',
    mainNoFollowUpNote: 'No follow-up since last session',
    mainMarkPaid: 'Mark paid', mainSchedule: 'Schedule', mainRenew: 'Renew',
    mainNudgeAll: 'Nudge all', mainNudgeSheetTitle: 'Nudge members', mainNudgeSheetSub: 'Send a quick in-app check-in to everyone below.',
    mainNudged: 'Nudged', mainDone: 'Done',
    mainEarningsReceived: 'received', mainEarningsDueOne: '1 member due', mainEarningsDueMany: '{n} members due', mainEarningsAllPaid: 'Everyone is paid up',
    mainHome: 'Home', mainClientsNav: 'Clients', mainMessagesNav: 'Messages', mainProfileNav: 'Profile',

    // Profile.dc.html
    profilePreview: 'Preview', profileShare: 'Share', profileEdit: 'Edit',
    profileAccount: 'Account', profileAccountDetails: 'Account Details', profileManageAccount: 'Sign-in method & security',
    profileVerification: 'Verification',
    profileVerificationSubUnverified: 'Tap to request verification', profileVerificationSubPending: 'Under review', profileVerificationSubVerified: 'Your credentials are verified',
    profileVerificationBadgeUnverified: 'Unverified', profileVerificationBadgePending: 'Pending', profileVerificationBadgeVerified: 'Verified',
    profileVerificationRequestedToast: 'Verification requested — under review',
    profileSubscription: 'Rafiq Pro', profileSubscriptionSubPro: 'Manage your subscription', profileSubscriptionSubFree: 'Upgrade for unlimited members & more',
    profileSubscriptionBadgePro: 'PRO', profileSubscriptionBadgeFree: 'Upgrade',
    profileCoaching: 'Coaching',
    profileOfferings: 'Offerings', profileOfferingsSub: 'What members see and can book on your profile',
    profileSessionTemplates: 'Session Templates', profileSessionTemplatesSub: 'Reusable plans for new members',
    profileEarnings: 'Earnings', profileEarningsSub: 'Track income and pending payments',
    profileAvailability: 'Availability', profileAvailabilitySub: 'Manage your preferred and unavailable hours',
    profileMessages: 'Messages', profileMessagesSub: 'Conversations with your members',
    profilePreferences: 'Preferences', profileLanguage: 'Language',
    profileReviews: 'Reviews', profileActiveMembers: 'Members', profileCompletion: 'Completion',
    profileCompletenessTitle: 'Complete your profile', profileCompletenessMissingOne: '1 item left to add', profileCompletenessMissingMany: '{n} items left to add',
    profileDarkMode: 'Dark mode', profileNotifications: 'Notifications', profileSupportRafiq: 'Support Rafiq', profileRateRafiq: 'Rate Rafiq',
    profileNotifSessions: 'New session requests', profileNotifCheckins: 'Member check-in alerts', profileNotifPayments: 'Payment reminders',
    profileBuyCoffee: 'Buy us a coffee', profileContactUs: 'Contact Us', profileGetHelp: 'Get Help',
    profileLogOut: 'Log out', profilePrivacyPolicy: 'Privacy Policy', profileTermsOfService: 'Terms of Service',
    profileDeleteAccount: 'Delete Account', profileDeleteConfirmTitle: 'Delete your account?',
    profileDeleteConfirmBody: "This removes your pro profile and identity from Rafiq. Each member keeps their own record of the sessions and payments you shared, as they're entitled to. This can't be undone.",
    profileCancel: 'Cancel', profileDelete: 'Delete',
    profileDeleteBlockedTitle: "Can't delete yet", profileGotIt: 'Got it',
    profileObligationCredits: '{n} unused session credit(s) across your members', profileObligationSessions: '{n} member(s) with an upcoming session',
    profileObligationDisputes: '{n} open dispute(s)', profileDeleteBlockedIntro: 'You still have',
    profileNotEnoughReviews: 'Not enough reviews yet',
    profileThanksRating: 'Thanks for rating Rafiq!',
    profileCoffeeToast: 'Thanks for the support! Opening our coffee page…',
    profileContactToast: 'Your message has been sent to Rafiq support.',

    // EditProfile.dc.html
    editProfileTitle: 'Edit Profile', editProfileSave: 'Save',
    editProfileChangePhoto: 'Change photo', editProfileRemovePhoto: 'Remove photo', editProfileCustomPhotoLocked: 'Custom photo (Rafiq Pro)',
    editProfileCoverPhoto: 'Cover photo', editProfileNoCoverPhoto: 'No cover photo yet',
    editProfileChangeCover: 'Change', editProfileAddCoverPhoto: 'Add cover photo', editProfileRemoveCover: 'Remove', editProfileCustomCoverLocked: 'Custom cover (Rafiq Pro)',
    editProfileSessionFormat: 'Session format', editProfileOnline: 'Online', editProfileInPerson: 'In-person', editProfileBoth: 'Both',
    editProfileLanguages: 'Languages',
    editProfileCredentials: 'Credentials & certifications', editProfileCredentialsSub: 'The first one shows as your badge',
    editProfileAddCertPlaceholder: 'e.g. ICF Certified',
    editProfileBio: 'Short bio', editProfileBioPlaceholder: 'Tell members a bit about your coaching style',
    editProfilePhotoLockedTitle: 'Custom photos are a Rafiq Pro feature',
    editProfilePhotoLockedBody: 'Upgrade to Rafiq Pro to upload your own profile and cover photos, plus get a verified badge and unlimited active members.',
    editProfileUpgrade: 'Upgrade to Rafiq Pro', editProfileNotNow: 'Not now',

    // AccountDetails.dc.html
    accountSignInMethod: 'Sign-in method', accountConnected: 'Connected',
    accountContact: 'Contact',
    accountSwitchHint: 'Need to switch your sign-in method or change your Google account? Reach out from Profile → Contact Us.',
  },
  ar: {
    skip: 'تخطي',
    next: 'التالي',
    getStarted: 'ابدأ الآن',

    welcome1Eyebrow: 'أهلًا بك في رفيق',
    welcome1HeadlinePre: 'أدر ممارستك كاملة ',
    welcome1HeadlineBold: 'من مكان واحد',
    welcome1Subtext: 'أدر الأعضاء، جدول الجلسات، وحدد المهام — دون التنقل بين جداول بيانات ومحادثات متفرقة.',

    welcome2Eyebrow: 'ابقَ قريبًا',
    welcome2HeadlinePre: 'في نفس المكان ',
    welcome2HeadlineBold: 'الذي تتم فيه محادثاتك',
    welcome2Subtext: 'أكّد الجلسات، أرسل التذكيرات، وذكّر الأعضاء بالمتابعة — كل ذلك عبر واتساب، دون تطبيق جديد يتعلمونه.',

    welcome3Eyebrow: 'كل التخصصات',
    welcome3HeadlinePre: 'تابعوا تقدمًا حقيقيًا، ',
    welcome3HeadlineBold: 'معًا',
    welcome3Subtext: 'من التدريب الحياتي إلى الغوص واليوغا والتغذية — امنح كل عضو مسارًا واضحًا بالمهام وباقات الجلسات والإنجازات.',

    roleTitle: 'أنت تنضم كـ...',
    roleSubtitle: 'هذا يحدد ما ستراه بعد ذلك — اختر ما يناسبك.',
    imPro: 'أنا محترف',
    imProSub: 'أدر الأعضاء، جدول الجلسات، وتابع تقدمهم.',
    imMember: 'أنا عضو',
    imMemberSub: 'تابع خطة محترفك، مهامك، وجلساتك القادمة.',
    continue: 'متابعة',

    onboardingSubtitle: 'لنُعِدّ ملفك التدريبي حتى يعرف الأعضاء ما تقدمه.',
    fullName: 'الاسم الكامل',
    phoneNumber: 'رقم الهاتف',
    onboardingPhoneHint: 'حتى يتمكن الأعضاء من التواصل معك داخل التطبيق بين الجلسات.',
    emailAddress: 'البريد الإلكتروني',
    city: 'المدينة',
    country: 'الدولة',
    whatDoYouCoach: 'في أي مجال تقدّم التدريب؟',
    chooseAllThatApply: 'اختر كل ما ينطبق',
    yearsOfExperience: 'سنوات الخبرة',
    selectCountry: 'اختر الدولة',
    selectDialingCode: 'اختر رمز الاتصال',
    searchCountries: 'ابحث عن دولة',
    noCountriesMatch: 'لا توجد دول مطابقة لبحثك',
    categoryMind: 'الصحة النفسية والعاطفية',
    categoryBody: 'الجسد واللياقة',
    categoryRelationships: 'العلاقات والأسرة',
    categoryCareer: 'المهنة',
    expLt1: 'أقل من سنة',
    exp1to2: '1-2 سنة',
    exp3to5: '3-5 سنوات',
    exp5plus: '+5 سنوات',
    specLife: 'التدريب الحياتي',
    specMeditation: 'تدريب التأمل',
    specBreathwork: 'تدريب التنفس',
    specStress: 'تدريب التوتر والقلق',
    specSleep: 'تدريب النوم',
    specYoga: 'تدريب اليوغا',
    specCalisthenics: 'تدريب الكاليسثينكس',
    specFitness: 'تدريب اللياقة البدنية',
    specNutrition: 'تدريب التغذية',
    specFreeDiving: 'تدريب الغطس الحر',
    specScuba: 'تدريب الغطس بالأسطوانة',
    specRelationship: 'تدريب العلاقات',
    specBreakup: 'تدريب ما بعد الانفصال',
    specParenting: 'تدريب الأبوة والأمومة',
    specCareer: 'التدريب المهني',
    missingName: 'اسمك',
    missingPhone: 'رقم هاتف',
    missingEmail: 'بريد إلكتروني صالح',
    missingCity: 'مدينتك',
    missingSpecialties: 'تخصصًا واحدًا على الأقل',
    validationPrefix: 'الرجاء إضافة ',
    validationSuffix: ' للمتابعة.',
    listSeparator: '، ',
    welcomePrefix: 'مرحبًا بك في رفيق، ',
    // QuickActions.dc.html
    quickActionsTitle: 'إجراءات سريعة', quickActionsClose: 'إغلاق',
    qaAddMember: 'إضافة عضو', qaAddMemberSub: 'أضف عضوًا جديدًا',
    qaViewProfile: 'عرض الملف الشخصي', qaViewProfileSub: 'اطّلع على ملفه الكامل وتقدمه',
    qaScheduleSession: 'جدولة جلسة', qaScheduleSessionSub: 'احجز موعدًا جديدًا',
    qaAssignTask: 'تحديد مهمة', qaAssignTaskSub: 'أعطِ العضو خطوته التالية',
    qaLogSession: 'تسجيل جلسة', qaLogSessionSub: 'حدد جلسة كمكتملة',
    qaRecordPayment: 'تسجيل دفعة', qaRecordPaymentSub: 'حدد دفعة كمستلمة',
    qaSendMessage: 'مراسلة', qaSendMessageSub: 'أرسل له رسالة داخل التطبيق',

    // Main.dc.html
    mainGreeting: 'صباح الخير', mainCoachName: 'ياسمين السيد', mainStreak: 'مواظبة 12 يومًا',
    mainSessions: 'الجلسات', mainActiveClients: 'عضو نشط', mainCompletionRate: 'نسبة الإنجاز',
    mainThisWeek: 'هذا الأسبوع', mainSessionsWord: 'جلسة',
    mainTodaysSchedule: 'جدول اليوم', mainSeeAll: 'عرض الكل', mainNoSessions: 'لا توجد جلسات اليوم',
    mainNeedsAttention: 'يحتاج انتباهك', mainAllCaughtUp: 'كل شيء على ما يرام!',
    mainUpNext: 'القادمة', mainJoinChip: 'انضمام',
    mainCheckinNote: 'لا يوجد تواصل حديث', mainPaymentOverdueNote: 'الدفع متأخر', mainPaymentDueNote: 'الدفع مستحق',
    mainTaskOverdueNote: 'مهمة متأخرة', mainNoSessionNote: 'لا توجد جلسة قادمة',
    mainPackageExpiredNote: 'انتهت صلاحية الباقة', mainPackageNoSessionsNote: 'لا توجد جلسات متبقية', mainPackageSoonNote: 'تنتهي الباقة خلال {n} يوم',
    mainNoFollowUpNote: 'لا متابعة منذ آخر جلسة',
    mainMarkPaid: 'تم الدفع', mainSchedule: 'جدولة', mainRenew: 'تجديد',
    mainNudgeAll: 'تذكير الكل', mainNudgeSheetTitle: 'تذكير الأعضاء', mainNudgeSheetSub: 'أرسل رسالة تواصل سريعة داخل التطبيق لكل من في القائمة.',
    mainNudged: 'تم التذكير', mainDone: 'تم',
    mainEarningsReceived: 'مستلم', mainEarningsDueOne: 'عضو واحد بحاجة للدفع', mainEarningsDueMany: '{n} أعضاء بحاجة للدفع', mainEarningsAllPaid: 'الجميع دفعوا',
    mainHome: 'الرئيسية', mainClientsNav: 'الأعضاء', mainMessagesNav: 'الرسائل', mainProfileNav: 'الملف الشخصي',

    // Profile.dc.html
    profilePreview: 'معاينة', profileShare: 'مشاركة', profileEdit: 'تعديل',
    profileAccount: 'الحساب', profileAccountDetails: 'تفاصيل الحساب', profileManageAccount: 'طريقة الدخول والأمان',
    profileVerification: 'التوثيق',
    profileVerificationSubUnverified: 'اضغط لطلب التوثيق', profileVerificationSubPending: 'قيد المراجعة', profileVerificationSubVerified: 'تم توثيق بيانات اعتمادك',
    profileVerificationBadgeUnverified: 'غير موثّق', profileVerificationBadgePending: 'قيد المراجعة', profileVerificationBadgeVerified: 'موثّق',
    profileVerificationRequestedToast: 'تم طلب التوثيق — قيد المراجعة',
    profileSubscription: 'رفيق برو', profileSubscriptionSubPro: 'إدارة اشتراكك', profileSubscriptionSubFree: 'قم بالترقية لعدد غير محدود من الأعضاء والمزيد',
    profileSubscriptionBadgePro: 'برو', profileSubscriptionBadgeFree: 'ترقية',
    profileCoaching: 'التدريب',
    profileOfferings: 'ما تقدّمه', profileOfferingsSub: 'ما يراه الأعضاء ويمكنهم حجزه من ملفك',
    profileSessionTemplates: 'قوالب الجلسات', profileSessionTemplatesSub: 'خطط جاهزة للأعضاء الجدد',
    profileEarnings: 'الأرباح', profileEarningsSub: 'تابع دخلك والمدفوعات المعلقة',
    profileAvailability: 'أوقات التوفر', profileAvailabilitySub: 'إدارة أوقاتك المفضلة وغير المتاحة',
    profileMessages: 'الرسائل', profileMessagesSub: 'محادثاتك مع أعضائك',
    profilePreferences: 'التفضيلات', profileLanguage: 'اللغة',
    profileReviews: 'التقييمات', profileActiveMembers: 'الأعضاء', profileCompletion: 'نسبة الإنجاز',
    profileCompletenessTitle: 'أكمل ملفك الشخصي', profileCompletenessMissingOne: 'عنصر واحد متبقٍ', profileCompletenessMissingMany: '{n} عناصر متبقية',
    profileDarkMode: 'الوضع الداكن', profileNotifications: 'الإشعارات', profileSupportRafiq: 'ادعم رفيق', profileRateRafiq: 'قيّم رفيق',
    profileNotifSessions: 'طلبات جلسات جديدة', profileNotifCheckins: 'تنبيهات متابعة الأعضاء', profileNotifPayments: 'تذكيرات الدفع',
    profileBuyCoffee: 'اشترِ لنا قهوة', profileContactUs: 'تواصل معنا', profileGetHelp: 'المساعدة',
    profileLogOut: 'تسجيل الخروج', profilePrivacyPolicy: 'سياسة الخصوصية', profileTermsOfService: 'شروط الخدمة',
    profileDeleteAccount: 'حذف الحساب', profileDeleteConfirmTitle: 'حذف حسابك؟',
    profileDeleteConfirmBody: 'سيؤدي هذا إلى إزالة ملفك كمحترف وهويتك من رفيق. يحتفظ كل عضو بسجله الخاص بالجلسات والمدفوعات التي شاركتموها، وهذا من حقه. لا يمكن التراجع عن هذا الإجراء.',
    profileCancel: 'إلغاء', profileDelete: 'حذف',
    profileDeleteBlockedTitle: 'لا يمكن الحذف بعد', profileGotIt: 'حسنًا',
    profileObligationCredits: '{n} رصيد جلسات غير مستخدم لدى أعضائك', profileObligationSessions: '{n} عضو لديه جلسة قادمة',
    profileObligationDisputes: '{n} نزاع مفتوح', profileDeleteBlockedIntro: 'لا يزال لديك',
    profileNotEnoughReviews: 'لا توجد تقييمات كافية بعد',
    profileThanksRating: 'شكرًا لتقييمك رفيق!',
    profileCoffeeToast: 'شكرًا لدعمك! جارٍ فتح صفحة الدعم…',
    profileContactToast: 'تم إرسال رسالتك إلى دعم رفيق.',

    // EditProfile.dc.html
    editProfileTitle: 'تعديل الملف الشخصي', editProfileSave: 'حفظ',
    editProfileChangePhoto: 'تغيير الصورة', editProfileRemovePhoto: 'إزالة الصورة', editProfileCustomPhotoLocked: 'صورة مخصصة (رفيق برو)',
    editProfileCoverPhoto: 'صورة الغلاف', editProfileNoCoverPhoto: 'لا توجد صورة غلاف بعد',
    editProfileChangeCover: 'تغيير', editProfileAddCoverPhoto: 'إضافة صورة غلاف', editProfileRemoveCover: 'إزالة', editProfileCustomCoverLocked: 'غلاف مخصص (رفيق برو)',
    editProfileSessionFormat: 'صيغة الجلسات', editProfileOnline: 'عبر الإنترنت', editProfileInPerson: 'حضوريًا', editProfileBoth: 'كلاهما',
    editProfileLanguages: 'اللغات',
    editProfileCredentials: 'الشهادات والاعتمادات', editProfileCredentialsSub: 'الأولى تظهر كشارتك',
    editProfileAddCertPlaceholder: 'مثال: معتمد ICF',
    editProfileBio: 'نبذة قصيرة', editProfileBioPlaceholder: 'أخبر الأعضاء قليلًا عن أسلوبك في التدريب',
    editProfilePhotoLockedTitle: 'الصور المخصصة ميزة حصرية لرفيق برو',
    editProfilePhotoLockedBody: 'قم بالترقية إلى رفيق برو لرفع صور ملفك الشخصي وغلافك الخاصة، بالإضافة إلى شارة موثّقة وعدد غير محدود من الأعضاء النشطين.',
    editProfileUpgrade: 'الترقية إلى رفيق برو', editProfileNotNow: 'ليس الآن',

    // AccountDetails.dc.html
    accountSignInMethod: 'طريقة تسجيل الدخول', accountConnected: 'متصل',
    accountContact: 'التواصل',
    accountSwitchHint: 'هل تحتاج لتغيير طريقة تسجيل الدخول أو حساب Google؟ تواصل معنا من الملف الشخصي ← تواصل معنا.',
  },
};

type Params = Record<string, string | number>;

function interpolate(template: string, params?: Params): string {
  if (!params) return template;
  return template.replace(/\{(\w+)\}/g, (match, key) => (key in params ? String(params[key]) : match));
}

/** Translate a key in the currently active language, outside a component (e.g. in a store action). */
export function translate(lang: Lang, key: string, params?: Params): string {
  const value = dict[lang][key];
  if (value === undefined) {
    console.warn(`Missing i18n key "${key}" for lang "${lang}"`);
    return key;
  }
  return interpolate(value, params);
}

/** Translate a key against the app's current language, reactive inside a component. */
export function useT() {
  const lang = useAppStore((s) => s.lang);
  return (key: string, params?: Params) => translate(lang, key, params);
}

export function isRtl(lang: Lang): boolean {
  return RTL_LANGS.includes(lang);
}
