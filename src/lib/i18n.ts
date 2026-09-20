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
