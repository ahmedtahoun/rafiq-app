// Ported from the design prototype's store.js — same ~195-country list and
// ITU-T E.164 dial codes, both keyed by ISO 3166-1 alpha-2. Flags are
// derived from the code via the regional-indicator-symbol trick rather
// than typed out by hand ~195 times, which is how a wrong flag would
// actually happen.

function flagFromCode(code: string): string {
  return code
    .toUpperCase()
    .split('')
    .map((ch) => String.fromCodePoint(0x1f1e6 + (ch.charCodeAt(0) - 65)))
    .join('');
}

const COUNTRY_CODES: [string, string][] = [
  ['Afghanistan', 'AF'], ['Albania', 'AL'], ['Algeria', 'DZ'], ['Andorra', 'AD'], ['Angola', 'AO'],
  ['Antigua and Barbuda', 'AG'], ['Argentina', 'AR'], ['Armenia', 'AM'], ['Australia', 'AU'], ['Austria', 'AT'],
  ['Azerbaijan', 'AZ'], ['Bahamas', 'BS'], ['Bahrain', 'BH'], ['Bangladesh', 'BD'], ['Barbados', 'BB'],
  ['Belarus', 'BY'], ['Belgium', 'BE'], ['Belize', 'BZ'], ['Benin', 'BJ'], ['Bhutan', 'BT'],
  ['Bolivia', 'BO'], ['Bosnia and Herzegovina', 'BA'], ['Botswana', 'BW'], ['Brazil', 'BR'], ['Brunei', 'BN'],
  ['Bulgaria', 'BG'], ['Burkina Faso', 'BF'], ['Burundi', 'BI'], ['Cabo Verde', 'CV'], ['Cambodia', 'KH'],
  ['Cameroon', 'CM'], ['Canada', 'CA'], ['Central African Republic', 'CF'], ['Chad', 'TD'], ['Chile', 'CL'],
  ['China', 'CN'], ['Colombia', 'CO'], ['Comoros', 'KM'], ['Congo', 'CG'], ['Costa Rica', 'CR'],
  ['Croatia', 'HR'], ['Cuba', 'CU'], ['Cyprus', 'CY'], ['Czechia', 'CZ'], ['Denmark', 'DK'],
  ['Djibouti', 'DJ'], ['Dominica', 'DM'], ['Dominican Republic', 'DO'], ['DR Congo', 'CD'], ['Ecuador', 'EC'],
  ['Egypt', 'EG'], ['El Salvador', 'SV'], ['Equatorial Guinea', 'GQ'], ['Eritrea', 'ER'], ['Estonia', 'EE'],
  ['Eswatini', 'SZ'], ['Ethiopia', 'ET'], ['Fiji', 'FJ'], ['Finland', 'FI'], ['France', 'FR'],
  ['Gabon', 'GA'], ['Gambia', 'GM'], ['Georgia', 'GE'], ['Germany', 'DE'], ['Ghana', 'GH'],
  ['Greece', 'GR'], ['Grenada', 'GD'], ['Guatemala', 'GT'], ['Guinea', 'GN'], ['Guinea-Bissau', 'GW'],
  ['Guyana', 'GY'], ['Haiti', 'HT'], ['Honduras', 'HN'], ['Hungary', 'HU'], ['Iceland', 'IS'],
  ['India', 'IN'], ['Indonesia', 'ID'], ['Iran', 'IR'], ['Iraq', 'IQ'], ['Ireland', 'IE'],
  ['Israel', 'IL'], ['Italy', 'IT'], ['Ivory Coast', 'CI'], ['Jamaica', 'JM'], ['Japan', 'JP'],
  ['Jordan', 'JO'], ['Kazakhstan', 'KZ'], ['Kenya', 'KE'], ['Kiribati', 'KI'], ['Kosovo', 'XK'],
  ['Kuwait', 'KW'], ['Kyrgyzstan', 'KG'], ['Laos', 'LA'], ['Latvia', 'LV'], ['Lebanon', 'LB'],
  ['Lesotho', 'LS'], ['Liberia', 'LR'], ['Libya', 'LY'], ['Liechtenstein', 'LI'], ['Lithuania', 'LT'],
  ['Luxembourg', 'LU'], ['Madagascar', 'MG'], ['Malawi', 'MW'], ['Malaysia', 'MY'], ['Maldives', 'MV'],
  ['Mali', 'ML'], ['Malta', 'MT'], ['Marshall Islands', 'MH'], ['Mauritania', 'MR'], ['Mauritius', 'MU'],
  ['Mexico', 'MX'], ['Micronesia', 'FM'], ['Moldova', 'MD'], ['Monaco', 'MC'], ['Mongolia', 'MN'],
  ['Montenegro', 'ME'], ['Morocco', 'MA'], ['Mozambique', 'MZ'], ['Myanmar', 'MM'], ['Namibia', 'NA'],
  ['Nauru', 'NR'], ['Nepal', 'NP'], ['Netherlands', 'NL'], ['New Zealand', 'NZ'], ['Nicaragua', 'NI'],
  ['Niger', 'NE'], ['Nigeria', 'NG'], ['North Korea', 'KP'], ['North Macedonia', 'MK'], ['Norway', 'NO'],
  ['Oman', 'OM'], ['Pakistan', 'PK'], ['Palau', 'PW'], ['Palestine', 'PS'], ['Panama', 'PA'],
  ['Papua New Guinea', 'PG'], ['Paraguay', 'PY'], ['Peru', 'PE'], ['Philippines', 'PH'], ['Poland', 'PL'],
  ['Portugal', 'PT'], ['Qatar', 'QA'], ['Romania', 'RO'], ['Russia', 'RU'], ['Rwanda', 'RW'],
  ['Saint Kitts and Nevis', 'KN'], ['Saint Lucia', 'LC'], ['Saint Vincent and the Grenadines', 'VC'], ['Samoa', 'WS'], ['San Marino', 'SM'],
  ['Sao Tome and Principe', 'ST'], ['Saudi Arabia', 'SA'], ['Senegal', 'SN'], ['Serbia', 'RS'], ['Seychelles', 'SC'],
  ['Sierra Leone', 'SL'], ['Singapore', 'SG'], ['Slovakia', 'SK'], ['Slovenia', 'SI'], ['Solomon Islands', 'SB'],
  ['Somalia', 'SO'], ['South Africa', 'ZA'], ['South Korea', 'KR'], ['South Sudan', 'SS'], ['Spain', 'ES'],
  ['Sri Lanka', 'LK'], ['Sudan', 'SD'], ['Suriname', 'SR'], ['Sweden', 'SE'], ['Switzerland', 'CH'],
  ['Syria', 'SY'], ['Taiwan', 'TW'], ['Tajikistan', 'TJ'], ['Tanzania', 'TZ'], ['Thailand', 'TH'],
  ['Timor-Leste', 'TL'], ['Togo', 'TG'], ['Tonga', 'TO'], ['Trinidad and Tobago', 'TT'], ['Tunisia', 'TN'],
  ['Turkey', 'TR'], ['Turkmenistan', 'TM'], ['Tuvalu', 'TV'], ['Uganda', 'UG'], ['Ukraine', 'UA'],
  ['United Arab Emirates', 'AE'], ['United Kingdom', 'GB'], ['United States', 'US'], ['Uruguay', 'UY'], ['Uzbekistan', 'UZ'],
  ['Vanuatu', 'VU'], ['Vatican City', 'VA'], ['Venezuela', 'VE'], ['Vietnam', 'VN'], ['Yemen', 'YE'],
  ['Zambia', 'ZM'], ['Zimbabwe', 'ZW'],
];

const DIAL_CODES: Record<string, string> = {
  AF: '+93', AL: '+355', DZ: '+213', AD: '+376', AO: '+244', AG: '+1', AR: '+54', AM: '+374', AU: '+61', AT: '+43',
  AZ: '+994', BS: '+1', BH: '+973', BD: '+880', BB: '+1', BY: '+375', BE: '+32', BZ: '+501', BJ: '+229', BT: '+975',
  BO: '+591', BA: '+387', BW: '+267', BR: '+55', BN: '+673', BG: '+359', BF: '+226', BI: '+257', CV: '+238', KH: '+855',
  CM: '+237', CA: '+1', CF: '+236', TD: '+235', CL: '+56', CN: '+86', CO: '+57', KM: '+269', CG: '+242', CR: '+506',
  HR: '+385', CU: '+53', CY: '+357', CZ: '+420', DK: '+45', DJ: '+253', DM: '+1', DO: '+1', CD: '+243', EC: '+593',
  EG: '+20', SV: '+503', GQ: '+240', ER: '+291', EE: '+372', SZ: '+268', ET: '+251', FJ: '+679', FI: '+358', FR: '+33',
  GA: '+241', GM: '+220', GE: '+995', DE: '+49', GH: '+233', GR: '+30', GD: '+1', GT: '+502', GN: '+224', GW: '+245',
  GY: '+592', HT: '+509', HN: '+504', HU: '+36', IS: '+354', IN: '+91', ID: '+62', IR: '+98', IQ: '+964', IE: '+353',
  IL: '+972', IT: '+39', CI: '+225', JM: '+1', JP: '+81', JO: '+962', KZ: '+7', KE: '+254', KI: '+686', XK: '+383',
  KW: '+965', KG: '+996', LA: '+856', LV: '+371', LB: '+961', LS: '+266', LR: '+231', LY: '+218', LI: '+423', LT: '+370',
  LU: '+352', MG: '+261', MW: '+265', MY: '+60', MV: '+960', ML: '+223', MT: '+356', MH: '+692', MR: '+222', MU: '+230',
  MX: '+52', FM: '+691', MD: '+373', MC: '+377', MN: '+976', ME: '+382', MA: '+212', MZ: '+258', MM: '+95', NA: '+264',
  NR: '+674', NP: '+977', NL: '+31', NZ: '+64', NI: '+505', NE: '+227', NG: '+234', KP: '+850', MK: '+389', NO: '+47',
  OM: '+968', PK: '+92', PW: '+680', PS: '+970', PA: '+507', PG: '+675', PY: '+595', PE: '+51', PH: '+63', PL: '+48',
  PT: '+351', QA: '+974', RO: '+40', RU: '+7', RW: '+250', KN: '+1', LC: '+1', VC: '+1', WS: '+685', SM: '+378',
  ST: '+239', SA: '+966', SN: '+221', RS: '+381', SC: '+248', SL: '+232', SG: '+65', SK: '+421', SI: '+386', SB: '+677',
  SO: '+252', ZA: '+27', KR: '+82', SS: '+211', ES: '+34', LK: '+94', SD: '+249', SR: '+597', SE: '+46', CH: '+41',
  SY: '+963', TW: '+886', TJ: '+992', TZ: '+255', TH: '+66', TL: '+670', TG: '+228', TO: '+676', TT: '+1', TN: '+216',
  TR: '+90', TM: '+993', TV: '+688', UG: '+256', UA: '+380', AE: '+971', GB: '+44', US: '+1', UY: '+598', UZ: '+998',
  VU: '+678', VA: '+379', VE: '+58', VN: '+84', YE: '+967', ZM: '+260', ZW: '+263',
};

export interface Country {
  name: string;
  code: string;
  flag: string;
  dial: string;
}

export const COUNTRIES: Country[] = COUNTRY_CODES.map(([name, code]) => ({
  name,
  code,
  flag: flagFromCode(code),
  dial: DIAL_CODES[code] || '',
}));

export const DEFAULT_COUNTRY = COUNTRIES.find((c) => c.code === 'EG')!;
