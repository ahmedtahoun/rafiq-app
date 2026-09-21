// Generates the JWT Supabase's Apple provider wants as its "Secret Key (for
// OAuth)" — NOT the raw .p8 file contents. Apple's console doesn't hand you
// this directly; you sign it yourself with the private key you downloaded
// when creating the Sign in with Apple key.
//
// Usage:
//   node scripts/generate-apple-oauth-secret.mjs /path/to/AuthKey_XXXX.p8
//
// Paste the printed JWT into Supabase → Auth → Providers → Apple → Secret
// Key (for OAuth). Apple caps its lifetime at 6 months, so this needs
// re-running (and re-pasting into Supabase) roughly twice a year — the
// TEAM_ID/KEY_ID/CLIENT_ID below are this project's real values, kept
// here as a reference for whoever does that next; only the .p8 file
// itself (never committed, passed as an argument) is the actual secret.

import { readFileSync } from 'node:fs';
import { createSign, createPrivateKey } from 'node:crypto';

const TEAM_ID = '55BRQ92599'; // top-right of any Apple Developer account page
const KEY_ID = 'ADU9N9RZTL'; // shown once when the Sign in with Apple key was created
const CLIENT_ID = 'app.rafiqie.coach.web'; // must exactly match the Services ID in Supabase's Client IDs field

const KEY_PATH = process.argv[2];
if (!KEY_PATH) {
  console.error('Usage: node scripts/generate-apple-oauth-secret.mjs /path/to/AuthKey_XXXX.p8');
  process.exit(1);
}

function base64url(input) {
  return Buffer.from(input).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

const now = Math.floor(Date.now() / 1000);
const exp = now + 15777000; // ~6 months — Apple's maximum

const header = { alg: 'ES256', kid: KEY_ID };
const payload = { iss: TEAM_ID, iat: now, exp, aud: 'https://appleid.apple.com', sub: CLIENT_ID };

const signingInput = `${base64url(JSON.stringify(header))}.${base64url(JSON.stringify(payload))}`;
const privateKey = createPrivateKey(readFileSync(KEY_PATH, 'utf8'));
const signature = createSign('sha256').update(signingInput).sign({ key: privateKey, dsaEncoding: 'ieee-p1363' });

console.log(`${signingInput}.${base64url(signature)}`);
