/**
 * Banks a coach can be paid to by instant bank transfer (Paymob Payouts,
 * issuer `instant_bank`). `code` is what Paymob expects in `bank_code`, and
 * what coach_payout_accounts.bank_code stores (0007 checks ^[A-Z]{2,10}$).
 *
 * Source: the bank codes table in Paymob's Instant Cashin docs,
 * https://payouts.paymobsolutions.com/docs/instant_cashin_api/ — transcribed
 * without access to that page (it is blocked from the sandbox this was
 * written in), so VERIFY THIS LIST AGAINST THE DOCS before release. A wrong
 * code can't send money to the wrong place — Paymob rejects a code it
 * doesn't know, and the payout fails — but it would stop that coach being
 * paid until fixed.
 *
 * Bank names are proper names, kept here as data like countries.ts rather
 * than as i18n keys.
 */
export interface PaymobBank {
  code: string;
  en: string;
  ar: string;
}

export const PAYMOB_BANKS: readonly PaymobBank[] = [
  { code: 'NBE', en: 'National Bank of Egypt', ar: 'البنك الأهلي المصري' },
  { code: 'MISR', en: 'Banque Misr', ar: 'بنك مصر' },
  { code: 'CIB', en: 'Commercial International Bank (CIB)', ar: 'البنك التجاري الدولي' },
  { code: 'BDC', en: 'Banque du Caire', ar: 'بنك القاهرة' },
  { code: 'QNB', en: 'QNB Alahli', ar: 'بنك قطر الوطني الأهلي' },
  { code: 'AAIB', en: 'Arab African International Bank', ar: 'البنك العربي الأفريقي الدولي' },
  { code: 'BOA', en: 'Alexbank', ar: 'بنك الإسكندرية' },
  { code: 'HSBC', en: 'HSBC Bank Egypt', ar: 'بنك إتش إس بي سي مصر' },
  { code: 'CAE', en: 'Crédit Agricole Egypt', ar: 'بنك كريدي أجريكول مصر' },
  { code: 'ADIB', en: 'Abu Dhabi Islamic Bank – Egypt', ar: 'مصرف أبوظبي الإسلامي – مصر' },
  { code: 'ADCB', en: 'Abu Dhabi Commercial Bank – Egypt', ar: 'بنك أبوظبي التجاري – مصر' },
  { code: 'FAB', en: 'First Abu Dhabi Bank', ar: 'بنك أبوظبي الأول' },
  { code: 'ENBD', en: 'Emirates NBD', ar: 'بنك الإمارات دبي الوطني' },
  { code: 'MASH', en: 'Mashreq Bank', ar: 'بنك المشرق' },
  { code: 'AUB', en: 'Ahli United Bank', ar: 'البنك الأهلي المتحد' },
  { code: 'ABK', en: 'Al Ahli Bank of Kuwait – Egypt', ar: 'البنك الأهلي الكويتي – مصر' },
  { code: 'NBK', en: 'National Bank of Kuwait – Egypt', ar: 'بنك الكويت الوطني – مصر' },
  { code: 'ABC', en: 'Arab Banking Corporation – Egypt', ar: 'المؤسسة العربية المصرفية – مصر' },
  { code: 'ARAB', en: 'Arab Bank', ar: 'البنك العربي' },
  { code: 'ABRK', en: 'Al Baraka Bank Egypt', ar: 'بنك البركة مصر' },
  { code: 'FAIB', en: 'Faisal Islamic Bank of Egypt', ar: 'بنك فيصل الإسلامي المصري' },
  { code: 'SAIB', en: 'Société Arabe Internationale de Banque', ar: 'بنك الشركة المصرفية العربية الدولية' },
  { code: 'EGB', en: 'Egyptian Gulf Bank', ar: 'البنك المصري الخليجي' },
  { code: 'UB', en: 'The United Bank', ar: 'المصرف المتحد' },
  { code: 'HDB', en: 'Housing and Development Bank', ar: 'بنك التعمير والإسكان' },
  { code: 'EALB', en: 'Egyptian Arab Land Bank', ar: 'البنك العقاري المصري العربي' },
  { code: 'EDBE', en: 'Export Development Bank of Egypt', ar: 'البنك المصري لتنمية الصادرات' },
  { code: 'SCB', en: 'Suez Canal Bank', ar: 'بنك قناة السويس' },
  { code: 'AIB', en: 'Arab Investment Bank', ar: 'بنك الاستثمار العربي' },
  { code: 'ARIB', en: 'Arab International Bank', ar: 'المصرف العربي الدولي' },
  { code: 'MIDB', en: 'MIDBANK', ar: 'ميد بنك' },
  { code: 'IDB', en: 'Industrial Development Bank', ar: 'بنك التنمية الصناعية' },
  { code: 'PDAC', en: 'Agricultural Bank of Egypt', ar: 'البنك الزراعي المصري' },
  { code: 'NSB', en: 'Nasser Social Bank', ar: 'بنك ناصر الاجتماعي' },
  { code: 'BLOM', en: 'BLOM Bank Egypt', ar: 'بنك بلوم مصر' },
  { code: 'BBE', en: 'Attijariwafa Bank Egypt', ar: 'التجاري وفا بنك مصر' },
  { code: 'CITI', en: 'Citibank Egypt', ar: 'سيتي بنك مصر' },
  { code: 'NBG', en: 'National Bank of Greece', ar: 'البنك الأهلي اليوناني' },
  { code: 'POST', en: 'Egypt Post', ar: 'البريد المصري' },
  { code: 'CBE', en: 'Central Bank of Egypt', ar: 'البنك المركزي المصري' },
  { code: 'GASC', en: 'General Authority for Supply Commodities', ar: 'الهيئة العامة للسلع التموينية' },
];
