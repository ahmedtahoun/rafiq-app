#!/usr/bin/env node
// One version for both stores.
//
//   npm run app-version                 # print what both native projects say
//   npm run app-version -- 1.0.1 4      # set version 1.0.1, build 4, on both
//
// The version is what users see ("1.0.1"). The build number is what the
// stores compare: it must go up on every upload, even a rejected one, and
// Android's versionCode and iOS's CURRENT_PROJECT_VERSION are kept equal so
// one number names one upload on both.
//
// Writes android/app/build.gradle (versionName, versionCode) and every
// build configuration in ios/App/App.xcodeproj (MARKETING_VERSION,
// CURRENT_PROJECT_VERSION). Exits non-zero if the two projects disagree.
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));
const GRADLE = `${root}android/app/build.gradle`;
const PBXPROJ = `${root}ios/App/App.xcodeproj/project.pbxproj`;

export function readVersions(gradle, pbxproj) {
  const all = (re, s) => [...s.matchAll(re)].map((m) => m[1]);
  return {
    androidVersion: all(/versionName "([^"]+)"/g, gradle),
    androidBuild: all(/versionCode (\d+)/g, gradle),
    iosVersion: [...new Set(all(/MARKETING_VERSION = ([^;]+);/g, pbxproj))],
    iosBuild: [...new Set(all(/CURRENT_PROJECT_VERSION = ([^;]+);/g, pbxproj))],
  };
}

export function writeVersions(gradle, pbxproj, version, build) {
  return {
    gradle: gradle
      .replace(/versionName "[^"]+"/, `versionName "${version}"`)
      .replace(/versionCode \d+/, `versionCode ${build}`),
    pbxproj: pbxproj
      .replace(/MARKETING_VERSION = [^;]+;/g, `MARKETING_VERSION = ${version};`)
      .replace(/CURRENT_PROJECT_VERSION = [^;]+;/g, `CURRENT_PROJECT_VERSION = ${build};`),
  };
}

function agree(v) {
  const one = (a) => a.length === 1;
  return one(v.androidVersion) && one(v.androidBuild) && one(v.iosVersion) && one(v.iosBuild)
    && v.androidVersion[0] === v.iosVersion[0] && v.androidBuild[0] === v.iosBuild[0];
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const [version, build] = process.argv.slice(2);
  let gradle = readFileSync(GRADLE, 'utf8');
  let pbxproj = readFileSync(PBXPROJ, 'utf8');

  if (version !== undefined) {
    if (!/^\d+\.\d+(\.\d+)?$/.test(version) || !/^\d+$/.test(build ?? '')) {
      console.error('usage: npm run app-version -- <version like 1.0.1> <build number>');
      process.exit(2);
    }
    const before = readVersions(gradle, pbxproj);
    if (Number(build) <= Number(before.androidBuild[0])) {
      console.error(`Build ${build} is not above the current ${before.androidBuild[0]}. The stores refuse a build number they have seen.`);
      process.exit(2);
    }
    ({ gradle, pbxproj } = writeVersions(gradle, pbxproj, version, build));
    writeFileSync(GRADLE, gradle);
    writeFileSync(PBXPROJ, pbxproj);
  }

  const v = readVersions(gradle, pbxproj);
  console.log(`Android  ${v.androidVersion.join(', ')} (${v.androidBuild.join(', ')})`);
  console.log(`iOS      ${v.iosVersion.join(', ')} (${v.iosBuild.join(', ')})`);
  if (!agree(v)) {
    console.error('The two projects disagree. Set both at once: npm run app-version -- <version> <build>');
    process.exit(1);
  }
}
