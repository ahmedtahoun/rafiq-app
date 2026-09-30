import { test, expect } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { readVersions, writeVersions } from '../scripts/set-version.mjs';

/**
 * The release setup RELEASE.md relies on. Source checks, like
 * a11y-labels.spec.js: each failure here is a wrong line in a native
 * project file, which no browser test would ever render.
 */

const read = (p) => readFileSync(new URL(`../${p}`, import.meta.url), 'utf8');
const gradle = read('android/app/build.gradle');
const pbxproj = read('ios/App/App.xcodeproj/project.pbxproj');

test('both stores get the same version and build number', () => {
  const v = readVersions(gradle, pbxproj);
  expect(v.androidVersion).toHaveLength(1);
  expect(v.iosVersion, 'every iOS build configuration agrees').toHaveLength(1);
  expect(v.iosBuild).toHaveLength(1);
  expect(v.iosVersion[0]).toBe(v.androidVersion[0]);
  expect(v.iosBuild[0]).toBe(v.androidBuild[0]);
});

test('npm run app-version rewrites both projects, every configuration', () => {
  const out = writeVersions(gradle, pbxproj, '2.3.4', '57');
  expect(readVersions(out.gradle, out.pbxproj)).toEqual({
    androidVersion: ['2.3.4'],
    androidBuild: ['57'],
    iosVersion: ['2.3.4'],
    iosBuild: ['57'],
  });
});

test('the Android upload key never enters git, and a release build without it stops', () => {
  expect(read('.gitignore')).toMatch(/^android\/keystore\/$/m);
  expect(gradle).toContain("rootProject.file('keystore/keystore.properties')");
  expect(gradle).toMatch(/signingConfig signingConfigs\.release/);
  expect(gradle).toMatch(/throw new GradleException\('No upload key/);
});

test('iOS signs as the same team the export uses', () => {
  const teams = [...new Set([...pbxproj.matchAll(/DEVELOPMENT_TEAM = (\w+);/g)].map((m) => m[1]))];
  expect(teams).toEqual(['55BRQ92599']);
  expect(read('ios/ExportOptions.plist')).toContain('<string>55BRQ92599</string>');
});
