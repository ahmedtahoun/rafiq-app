import { test, expect } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * ios/App/App/PrivacyInfo.xcprivacy — the file Xcode aggregates into the
 * privacy report, which has to agree with the App Privacy answers in App
 * Store Connect (drafted in store/app-privacy.md).
 *
 * It was an empty `NSPrivacyCollectedDataTypes` array until 4 Oct 2026:
 * a manifest saying the app collects nothing, beside a product page that
 * lists health and financial data. Nothing failed, because nothing
 * looked. This is the thing that looks.
 *
 * The two lists below are Apple's own, read from
 * developer.apple.com/documentation/bundleresources/app-privacy-configuration.
 * They are copied here on purpose: Xcode will not generate a correct
 * report if a value is invented or misspelled, and the spelling is not
 * guessable — "PhotosorVideos" has a lowercase "or", and
 * "EmailsOrTextMessages" a capital one, in the same list.
 */

const ROOT = join(import.meta.dirname, '..');
const MANIFEST = join(ROOT, 'ios', 'App', 'App', 'PrivacyInfo.xcprivacy');

const DATA_TYPES = new Set([
  'NSPrivacyCollectedDataTypeAdvertisingData', 'NSPrivacyCollectedDataTypeAudioData',
  'NSPrivacyCollectedDataTypeBrowsingHistory', 'NSPrivacyCollectedDataTypeCoarseLocation',
  'NSPrivacyCollectedDataTypeContacts', 'NSPrivacyCollectedDataTypeCrashData',
  'NSPrivacyCollectedDataTypeCreditInfo', 'NSPrivacyCollectedDataTypeCustomerSupport',
  'NSPrivacyCollectedDataTypeDeviceID', 'NSPrivacyCollectedDataTypeEmailAddress',
  'NSPrivacyCollectedDataTypeEmailsOrTextMessages', 'NSPrivacyCollectedDataTypeEnvironmentScanning',
  'NSPrivacyCollectedDataTypeFitness', 'NSPrivacyCollectedDataTypeGameplayContent',
  'NSPrivacyCollectedDataTypeHands', 'NSPrivacyCollectedDataTypeHead',
  'NSPrivacyCollectedDataTypeHealth', 'NSPrivacyCollectedDataTypeName',
  'NSPrivacyCollectedDataTypeOtherDataTypes', 'NSPrivacyCollectedDataTypeOtherDiagnosticData',
  'NSPrivacyCollectedDataTypeOtherFinancialInfo', 'NSPrivacyCollectedDataTypeOtherUsageData',
  'NSPrivacyCollectedDataTypeOtherUserContactInfo', 'NSPrivacyCollectedDataTypeOtherUserContent',
  'NSPrivacyCollectedDataTypePaymentInfo', 'NSPrivacyCollectedDataTypePerformanceData',
  'NSPrivacyCollectedDataTypePhoneNumber', 'NSPrivacyCollectedDataTypePhotosorVideos',
  'NSPrivacyCollectedDataTypePhysicalAddress', 'NSPrivacyCollectedDataTypePreciseLocation',
  'NSPrivacyCollectedDataTypeProductInteraction', 'NSPrivacyCollectedDataTypePurchaseHistory',
  'NSPrivacyCollectedDataTypeSearchHistory', 'NSPrivacyCollectedDataTypeSensitiveInfo',
  'NSPrivacyCollectedDataTypeUserID',
]);

const PURPOSES = new Set([
  'NSPrivacyCollectedDataTypePurposeAnalytics',
  'NSPrivacyCollectedDataTypePurposeAppFunctionality',
  'NSPrivacyCollectedDataTypePurposeDeveloperAdvertising',
  'NSPrivacyCollectedDataTypePurposeOther',
  'NSPrivacyCollectedDataTypePurposeProductPersonalization',
  'NSPrivacyCollectedDataTypePurposeThirdPartyAdvertising',
]);

const manifest = () => readFileSync(MANIFEST, 'utf8');
const strings = (xml) => [...xml.matchAll(/<string>([^<]*)<\/string>/g)].map((m) => m[1]);

test('the manifest declares what the app collects, and says so in Apple’s words', () => {
  const xml = manifest();
  const declared = strings(xml).filter((s) => s.startsWith('NSPrivacyCollectedDataType') && !s.startsWith('NSPrivacyCollectedDataTypePurpose'));

  // The bug this file exists for: an empty list.
  expect(declared.length, 'the app collects plenty; the manifest must say so').toBeGreaterThan(0);

  for (const value of declared) {
    expect(DATA_TYPES.has(value), `"${value}" is not one of Apple's data types — check the spelling`).toBe(true);
  }
  // Each type once. A duplicate is a merge artefact, not a declaration.
  expect(new Set(declared).size, 'no data type is declared twice').toBe(declared.length);

  for (const value of strings(xml).filter((s) => s.startsWith('NSPrivacyCollectedDataTypePurpose'))) {
    expect(PURPOSES.has(value), `"${value}" is not one of Apple's purposes`).toBe(true);
  }
});

test('nothing in the manifest tracks, and nothing advertises', () => {
  const xml = manifest();

  expect(xml).toMatch(/<key>NSPrivacyTracking<\/key>\s*<false\/>/);
  expect(xml, 'no tracking domains').toMatch(/<key>NSPrivacyTrackingDomains<\/key>\s*<array\/>/);

  // Every entry carries Tracking, and every one of them is false. Count
  // rather than spot-check: a new entry that forgets the key, or sets it
  // true, both fail here.
  const types = strings(xml).filter((s) => s.startsWith('NSPrivacyCollectedDataType') && !s.startsWith('NSPrivacyCollectedDataTypePurpose')).length;
  const trackingFalse = [...xml.matchAll(/<key>NSPrivacyCollectedDataTypeTracking<\/key>\s*<false\/>/g)].length;
  expect(trackingFalse, 'every declared type sets Tracking false').toBe(types);
  expect(xml, 'no type may set Tracking true').not.toMatch(/<key>NSPrivacyCollectedDataTypeTracking<\/key>\s*<true\/>/);

  // Declaring an advertising purpose would contradict all of the above,
  // and there is no ad SDK in the project to justify one.
  for (const purpose of ['ThirdPartyAdvertising', 'DeveloperAdvertising']) {
    expect(xml, `no ${purpose} purpose`).not.toContain(`NSPrivacyCollectedDataTypePurpose${purpose}`);
  }
});

test('the manifest and Info.plist agree about tracking', () => {
  // NSUserTrackingUsageDescription exists only to show the App Tracking
  // Transparency prompt. An app whose manifest says it does not track
  // must not ask, and adding the key is how that contradiction starts.
  const plist = readFileSync(join(ROOT, 'ios', 'App', 'App', 'Info.plist'), 'utf8');
  expect(plist, 'no ATT prompt while NSPrivacyTracking is false').not.toContain('NSUserTrackingUsageDescription');
});
