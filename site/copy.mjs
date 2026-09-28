/**
 * Copy that exists only on the public site (rafiqpro.com), EN and AR side
 * by side like src/lib/i18n.ts.
 *
 * Everything the app itself shows — the four policy documents, the page
 * titles, the headline — is NOT here: scripts/build-site.mjs reads it from
 * i18n.ts, so the website and the app can never say different things.
 * tests/public-site.spec.js fails if the published pages fall behind it.
 *
 * The deletion page describes what deleting does. It mirrors the app's own
 * confirm-sheet copy (profileDeleteConfirmBody / clientProfileDeleteBody)
 * and the obligations check that blocks deletion; if either changes, this
 * page has to change with it.
 */
export const SITE_COPY = {
  en: {
    homeLinksLabel: 'Policies and help',
    forCoaches: 'For coaches',
    forMembers: 'For members',
    privacyIntro: 'Rafiq Pro has two sides — coaches running their practice, and the members they coach — and each has its own policy.',
    termsIntro: 'Rafiq Pro has two sides — coaches running their practice, and the members they coach — and each has its own terms.',
    supportTitle: 'Support',
    supportLead: 'Questions, problems, or feedback? Email us and a person will reply.',
    supportInApp: 'In the app, you can also reach us from Profile → Contact Us.',
    supportDeletion: 'Want to delete your account? See how account deletion works.',
    deleteTitle: 'Delete your Rafiq Pro account',
    deleteLead: 'You can delete your account at any time, as a coach or as a member.',
    deleteInAppHeading: 'From the app',
    deleteInAppBody: 'Open Profile, scroll to the bottom and tap Delete Account, then confirm.',
    deleteEmailHeading: 'Without the app',
    deleteEmailBody: 'Email us from the address you use to sign in, with the subject “Delete my account”. We confirm by email once it is done.',
    deleteRemovedHeading: 'What is deleted',
    deleteRemovedBody: 'Your account, your profile and your personal details — name, contact details and photos.',
    deleteKeptHeading: 'What is kept',
    deleteKeptBody: 'Sessions and payments are a shared record between a coach and a member. When one side deletes their account, the other side keeps their own record of the sessions and payments they had together, without the deleted person’s personal details.',
    deleteBlockedHeading: 'Before you can delete',
    deleteBlockedBody: 'If you still have an upcoming session, unused session credits, or an open dispute, these need to be settled first — the app tells you what is outstanding, and we will too if you ask by email.',
    language: 'العربية',
    languageLabel: 'Arabic version',
  },
  ar: {
    homeLinksLabel: 'السياسات والمساعدة',
    forCoaches: 'للمدربين',
    forMembers: 'للأعضاء',
    privacyIntro: 'لرفيق جانبان — مدربون يديرون ممارستهم، وأعضاء يتدربون معهم — ولكل منهما سياسته الخاصة.',
    termsIntro: 'لرفيق جانبان — مدربون يديرون ممارستهم، وأعضاء يتدربون معهم — ولكل منهما شروطه الخاصة.',
    supportTitle: 'الدعم',
    supportLead: 'لديك سؤال أو مشكلة أو ملاحظة؟ راسلنا وسيرد عليك شخص من فريقنا.',
    supportInApp: 'يمكنك أيضًا التواصل معنا من داخل التطبيق: الملف الشخصي ← تواصل معنا.',
    supportDeletion: 'تريد حذف حسابك؟ اطّلع على طريقة حذف الحساب.',
    deleteTitle: 'حذف حسابك على رفيق',
    deleteLead: 'يمكنك حذف حسابك في أي وقت، سواء كنت مدربًا أو عضوًا.',
    deleteInAppHeading: 'من داخل التطبيق',
    deleteInAppBody: 'افتح الملف الشخصي، ومرّر إلى الأسفل واضغط «حذف الحساب»، ثم أكّد.',
    deleteEmailHeading: 'بدون التطبيق',
    deleteEmailBody: 'راسلنا من البريد الإلكتروني الذي تسجّل الدخول به، بعنوان «احذف حسابي». سنؤكد لك بالبريد عند اكتمال الحذف.',
    deleteRemovedHeading: 'ما الذي يُحذف',
    deleteRemovedBody: 'حسابك وملفك الشخصي وبياناتك الشخصية — الاسم وبيانات التواصل والصور.',
    deleteKeptHeading: 'ما الذي يُحتفظ به',
    deleteKeptBody: 'الجلسات والمدفوعات سجلّ مشترك بين المدرب والعضو. عندما يحذف أحد الطرفين حسابه، يحتفظ الطرف الآخر بسجله الخاص بالجلسات والمدفوعات التي جمعتهما، دون البيانات الشخصية للشخص الذي حذف حسابه.',
    deleteBlockedHeading: 'قبل أن تتمكن من الحذف',
    deleteBlockedBody: 'إذا كانت لديك جلسة قادمة، أو رصيد جلسات غير مستخدم، أو نزاع مفتوح، فيجب تسويتها أولًا — سيخبرك التطبيق بما هو معلّق، وسنخبرك نحن أيضًا إذا سألتنا بالبريد.',
    language: 'English',
    languageLabel: 'English version',
  },
};
