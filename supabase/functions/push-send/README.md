# push-send

Phone notifications. Every event worth a banner already writes a
`notifications` row; a Database Webhook on that table calls this function,
which sends the banner to the recipient's phones (`device_tokens`, 0023), in
each phone's own language and time zone. What it guarantees is at the top of
`../_shared/pushSend.ts`; the tests are `../_shared/pushSend_test.ts`.

Pushed: a new session request or move request (to the coach), a request
accepted or declined, a session moved or cancelled, a new message (never its
text), and a member finishing a task (to the coach). Not pushed: a recorded
payment, until Paymob collects session fees (LAUNCH-CHECKLIST §4).

The app side (registering phones, asking permission, the switches) is a
separate PR. Until it ships, nothing is in `device_tokens` and this function
sends nothing.

## Setting it up (Ahmed)

Nothing here goes in the app, in git, or in chat. The keys live only in this
function's secrets.

1. **Apple.** In the Apple Developer account, Keys → create a key with
   Apple Push Notifications service enabled. Download the `.p8` once (it
   can't be downloaded again) and note its Key ID and the Team ID. In
   Xcode, add the Push Notifications capability to the app target.
2. **Google.** Create a Firebase project, add the Android app
   `app.rafiqie.coach`, and download `google-services.json` into
   `android/app/` (the app PR wires it in). Then Project settings → Service
   accounts → Generate new private key: a JSON file.
3. **Secrets.** Put these in `supabase/functions/.env`:

   ```
   PUSH_WEBHOOK_SECRET=<a long random string, e.g. openssl rand -hex 32>
   APNS_KEY_P8=<the .p8 file's contents; on one line, with \n for its line breaks, works too>
   APNS_KEY_ID=<Key ID>
   APNS_TEAM_ID=<Team ID>
   FCM_SERVICE_ACCOUNT=<the service account JSON, on one line>
   ```

   Optional: `APNS_TOPIC` (defaults to `app.rafiqie.coach`), and
   `APNS_SANDBOX=true` only while testing builds run from Xcode — TestFlight
   and App Store builds use production tokens. Then
   `npx supabase secrets set --env-file supabase/functions/.env`, and
   delete the file.
4. **Deploy:** `npx supabase db push` (0023), then
   `npx supabase functions deploy push-send --no-verify-jwt`. The webhook
   doesn't carry a user's sign-in, so the shared secret is the gate: any
   request without it gets 401.
5. **Webhook.** Dashboard → Database → Webhooks → Create: table
   `notifications`, event Insert, type Supabase Edge Functions,
   `push-send`, method POST, and an HTTP header `x-push-secret` with the
   same value as `PUSH_WEBHOOK_SECRET`.

Either platform can go first: without Apple's keys, iPhones are skipped and
Android phones still get their banners, and the other way round.

## Checking it

The function answers each call with what it did:
`{ sent, removed, failed, skipped }`, or why it sent nothing
(`no_devices`, `kind_not_pushed`, `account_not_active`). The webhook's log
in the dashboard shows these. `removed` counts phones Apple or Google said
are gone (uninstalled, or the token rotated); they are deleted from
`device_tokens` so they aren't tried again.
