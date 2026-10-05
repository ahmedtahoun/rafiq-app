# Store listing — Rafiq Pro / رفيق

Drafts for App Store Connect and Google Play Console, English and Arabic,
for version 1.0. Checklist §7.

Everything here is a **draft for Ahmed to approve, not final copy**. Where a
field has more than one option the first is the recommendation and the
reason is given.

**Character counts are real** — every one below was measured, and the limit
is per field, per language. Apple counts the Arabic separately, so both
versions have to fit on their own. Arabic is counted in characters, not
bytes: `رفيق` is 4 characters and 8 bytes, and Apple's limit is characters.

## The fields, and which store wants them

| Field | App Store | Google Play |
|---|---|---|
| Name / Title | 30 | 30 |
| Subtitle | 30 | — |
| Short description | — | 80 |
| Promotional text | 170 (editable without review) | — |
| Description | 4,000 | 4,000 |
| Keywords | 100, comma-separated | no such field — Play indexes the description |
| What's new / release notes | 4,000 | 500 |

Play has no keywords field: the words have to earn their place in the
description instead. Apple does the opposite — it indexes the name,
subtitle and keywords but **not** the description, and a word already in
the name or subtitle should not be repeated in keywords, because it is
wasted space.

---

## What the listing may and may not claim

Written against what the app does today, not what it will do. Four things
a listing would normally say that this one must not:

1. **Phone notifications only for what the app sends.** Since the push PRs
   the app sends banners for new requests, answers, moved and cancelled
   sessions, messages and finished tasks, once someone turns them on — but
   no reminder before a session yet (that needs a scheduled job). So
   "Reminders" in the listing still has to read as something a user sees
   in the app, never as a phone alert before a session. (The onboarding carousel's
   `welcome2Subtext` still says "send reminders", which is on the edge —
   worth a look, separately from this task.)
2. **No in-app payment.** Booking sends the coach a request; nothing is
   charged. The Rafiq Pro Plus upgrade is a "Coming soon" state. The
   listing cannot promise paying in the app until §3 lands.
3. **Messaging is in the app, not WhatsApp.** The privacy policy was
   corrected on this; the listing must not reintroduce it.
4. **Discover will be nearly empty at launch.** Signed in, it reads the
   real `coach_directory` view, and until coaches sign up that is a
   handful of rows or none — the empty state exists for exactly that. A
   line promising "hundreds of coaches" would be a claim the app cannot
   meet on day one.

   **The eight fictional coaches are gone** (#101, 3 Oct 2026).
   `DIRECTORY_COACHES` and `getDirectoryCoaches()` no longer exist in
   `src/lib/directory.ts`, and signed out Discover shows its empty state,
   "No pros yet" (`discoverNoCoachesTitle`), rather than Mariam Adel,
   Ahmed Nabil and six others who never did. A coach link on that path
   reads "not available".

   That removes the rejection risk this paragraph used to carry —
   placeholder content is no longer reachable — but it does not change
   what App Review needs. Signed out the app now shows an *empty*
   marketplace, which demonstrates nothing, so the review notes (§11)
   still have to hand reviewers a real account with real content. See
   `store/review-notes.md`.

   One thing to decide before uploading, since the two documents
   currently disagree: the screenshot set built in §7 includes a Discover
   shot (`10-member-discover`, renumbered from 08 when the call shots went
   in at 05 and 06), taken signed in against seeded sample
   coaches. The note further down this file says Discover should not be
   among the launch screenshots because it will be nearly empty. Both
   positions are defensible — sample data in a screenshot is ordinary,
   and a directory that looks busier than day one is not — but only one
   can ship. Ahmed decides; the shot is numbered 08, so leaving it out
   costs nothing but the upload order.

5. **Video sessions are real, and these are the limits of the claim.**
   A session runs on video inside the app, through Daily. What the listing
   may say, all of it checkable in the code:

   - **1:1, inside the app.** No link to find, no second app to install.
   - **Join opens ten minutes before** the session starts
     (`JOIN_EARLY_MS`, `src/lib/videoData.ts:83`).
   - **Never recorded** — and stronger than a promise: the app refuses to
     open a call at all if recording has been switched on, on the Daily
     domain or on the room. `recording_enabled_on_domain` and
     `recording_enabled_on_room` are in the `UNAVAILABLE` list
     (`videoData.ts:38`), and a room that reports either is treated as
     unavailable rather than joined.

   What it may **not** say: that calls can be recorded or saved for later
   (they cannot), that there are group or multi-party calls (a room belongs
   to one session between one coach and one member), or that a member can
   dial in by phone. Nor that you can start a call whenever you like —
   there has to be a booked session, and you have to be inside its window.

   `sessionRoomLeaveHint` still reads "no recording or real call happens",
   which looks like stale copy from before video shipped but is not: it
   renders only in `DemoSessionRoom()`, the signed-out preview
   (`SessionRoom.tsx:44–197`). Checked rather than assumed.

---

## English

### Name — 30 max

| Option | Chars | Notes |
|---|---:|---|
| **`Rafiq Pro`** | 9 | **Recommended.** Matches `CFBundleDisplayName`, `app_name` and the in-app `appName` key. What a user sees on the home screen should be what they searched for. |
| `Rafiq Pro: Coaching` | 19 | If discovery matters more than cleanliness. Costs nothing in review terms; "Coaching" then becomes an indexed term and must come out of keywords. |

The alternative buys a strong keyword in the highest-weighted field. The
recommendation is the clean one because the home-screen name is already
`Rafiq Pro` in both native projects, and a store name that drifts from the
installed name is a small, permanent papercut.

### Subtitle — 30 max

| Option | Chars |
|---|---:|
| **`Coaching, sessions, progress`** | 28 |
| `Your coach and you, in sync` | 27 |
| `Book, message, track progress` | 29 |
| `Video sessions and progress` | 27 |

The first is still recommended because it is the only one that reads
correctly for **both** roles — a coach runs sessions and tracks progress, a
member attends them and makes it. The second leans member, the third leans
member too.

The fourth makes video explicit. Thirty characters cannot hold both "video"
and the two-sided reading, so it is a straight trade: it buys the newest
feature in the second-most-weighted field and loses the word that covers
tasks, packages and messages. The recommendation stays with the first,
because "sessions" now *means* video sessions and the description says so
in its first bullet on each side.

### Short description (Play) — 80 max

`Coaching in one place: video sessions, tasks, messages and progress.` — 68

Was "Coaching that stays in one place: sessions, tasks…" (73). "video"
costs six characters and "that stays" pays for them: Play truncates this
line hard on a narrow phone, and the first forty characters are what most
people read.

### Promotional text (App Store) — 170 max

Editable without a review, so this is the field to change when the first
real coaches join.

`Rafiq Pro is new in Egypt and taking on its first coaches. Sessions run on video, in the app. If you coach — life, fitness, yoga, nutrition, diving — we would like you on it early.` — 180 ⚠️ **over**

That is 179 against a 170 cap, so it needs cutting. The version that fits:

`Rafiq Pro is new in Egypt, taking on its first coaches. Sessions run on video in the app. If you coach — life, fitness, yoga, nutrition, diving — we want you on early.` — 167

### Description — 4,000 max

Same text for both stores.

```
Rafiq Pro is where coaching happens between the sessions.

One app, two sides. Coaches run their practice in it. Members follow the
plan their coach set. Nobody has to keep a spreadsheet, and nothing gets
lost in a chat thread that was never meant to hold it.

FOR COACHES

• Your members in one roster — their goal, their focus, where they are.
• A week you can actually read. Set your hours once, see what is booked,
  what is pending and what is free, and move a session without three
  messages about it.
• Tasks between sessions, with a due date, so a member knows what they
  agreed to do and you can see whether it happened.
• Session packages that count themselves down, so nobody has to remember
  how many are left.
• Meet your member on video, in the app. Join opens ten minutes before
  the session starts, and nothing is recorded.
• A conversation with each member, next to the session it belongs to.
• Write what you offer — 1:1 sessions, a programme, a workshop — and a
  page members can see it on.
• Your earnings, what is paid, what is not, and your payout details, kept
  where only you and Rafiq can see them.

FOR MEMBERS

• What your coach set for you, this week: tasks, sessions and where you
  are in the programme.
• Your session happens on video, in the app. No link to find, no other
  app to install; Join opens ten minutes before the time you booked.
• Book a time from your coach's real availability, ask to move one, or
  cancel — without a phone call.
• A check-in on how you are doing, so the person coaching you knows
  before the next session, not after it.
• Find a coach by what you are working on and what language you speak,
  and see their offerings before you ask for anything.
• Rate a coach after a session, and report one if something is wrong.

IN ENGLISH AND IN ARABIC

Every screen is written twice, not translated once. Arabic runs
right-to-left throughout: the layout mirrors, dates and times are in
Arabic, and names and titles keep their order inside a sentence. Pick a
language when you open it, change it whenever you like. Light and dark.

WHAT IT DOES NOT DO

Coaching is not therapy or medical advice. Rafiq Pro is for coaching
relationships; if you need clinical care, please see a professional.

Turn on notifications and Rafiq Pro tells you on your phone when a member
asks for a session, answers, or sends a message — in English or Arabic.
Everything is also waiting in the app when you open it.

Sessions are never recorded. Rafiq Pro will not open a call at all if
recording has been switched on, so there is no copy of your session to
keep, lose or hand over.

You sign in with Google or Apple. There is no password to lose.

Rafiq Pro is new, and starting in Egypt.
```

2,641 characters, against a 4,000 cap.

### Keywords — 100 max

Apple counts commas, so there are no spaces after them. "Rafiq" and the
subtitle's words are already indexed and are deliberately absent.

```
coach,coaching,wellness,life coach,yoga,nutrition,fitness,diving,client,booking,schedule,Egypt,video
```

**100 characters exactly**, 13 terms — on the cap, with nothing spare.
Adding `video` cost six characters and used every one that was left, so
the next term in has to push one out. `client` is the weakest if you need
room: it reads as a coach's word, and a member searching for coaching does
not type it.

`video call` and `video session` were considered and dropped: Apple matches
across comma-separated terms, so `video` plus the already-indexed
`sessions` in the subtitle covers both phrases without paying for them
twice.

Dropped on purpose: `therapy`, `therapist`, `counselling` — the app says in
its own copy that it is not therapy, and buying those searches would
contradict it and invite the age-rating and medical-claims questions in
§8. Also dropped: `free`, `best` (Apple rejects), and any competitor name.

### What's new — 1.0

```
This is the first release.

Rafiq Pro, in English and Arabic: a roster, a schedule, video sessions,
tasks between sessions, session packages, messages and a coach page for
coaches; the plan your coach set, booking, your sessions on video,
check-ins and Discover for members.

Tell us what is missing — support@rafiqpro.com.
```

### Category

| Store | Primary | Secondary |
|---|---|---|
| App Store | **Health & Fitness** | Lifestyle |
| Google Play | **Health & Fitness** | — (Play takes one) |

Health & Fitness is recommended over Business even though half the app is
a professional tool, because the store category is chosen by what the
person searching is looking for, and both of these audiences are looking
for coaching, not for practice-management software. Business would put
Rafiq Pro next to invoicing apps.

**Ahmed to confirm** — this interacts with §8's age rating. Health &
Fitness with mood check-ins may pull a question about medical or
wellness claims on both questionnaires; the answer in each case is that
the app records self-reported mood for a coaching relationship and gives
no medical advice.

---

## العربية

### الاسم — 30 حرفًا

| الخيار | الأحرف | ملاحظات |
|---|---:|---|
| **`رفيق`** | 4 | **المقترح.** هو الاسم على الشاشة الرئيسية بالفعل (`ar.lproj/InfoPlist.strings` و`values-ar/strings.xml`). |
| `رفيق: التدريب والجلسات` | 22 | إن كان الظهور في البحث أهم. |

### العنوان الفرعي — 30 حرفًا

| الخيار | الأحرف |
|---|---:|
| **`جلسات ومهام وتقدّم معًا`** | 23 |
| `مدربك وأنت، في مكان واحد` | 24 |
| `التدريب كله في مكان واحد` | 24 |
| `جلسات فيديو ومهام وتقدّم` | 24 |

`جلسات ومهام وتقدّم في مكان واحد` هي الترجمة الحرفية للإنجليزي لكنها 31 حرفًا —
حرف واحد فوق الحد، لأن الشدّة في «تقدّم» حرف مستقل في العدّ. الخيارات أعلاه
تترك هامشًا.

الخيار الرابع يذكر الفيديو صراحة. العربية تتسع له هنا بخلاف الإنجليزية،
لأن «جلسات فيديو ومهام وتقدّم» 24 حرفًا فقط. والمقترح يبقى الأول: كلمة
«جلسات» صارت تعني جلسات الفيديو، والوصف يقولها في أول نقطة لكل جانب.

### الوصف القصير (جوجل بلاي) — 80 حرفًا

`التدريب في مكان واحد: جلسات فيديو ومهام ورسائل وتقدّم.` — 54

أقصر من السابقة (56) ويذكر الفيديو، لأن «الجلسات والمهام والرسائل» بأل
التعريف أطول من الإضافة المجردة.

### النص الترويجي (آبل) — 170 حرفًا

`رفيق تطبيق جديد في مصر ويستقبل أوائل المدربين. الجلسات تجري بالفيديو داخل التطبيق. إن كنت تدرّب — حياتيًا أو رياضيًا أو يوغا أو تغذية أو غوصًا — يسعدنا انضمامك مبكرًا.` — 167

ثلاثة أحرف فقط تحت الحد، فأي تعديل لاحق على هذا النص يحتاج عدًّا من جديد.
والحقل قابل للتعديل دون مراجعة، فهو أول ما يُحدَّث عند انضمام أول المدربين.

### الوصف — 4000 حرف

```
رفيق هو المكان الذي يحدث فيه التدريب بين الجلسات.

تطبيق واحد بجانبين. المحترف يدير ممارسته فيه، والعضو يتابع الخطة التي
وضعها له محترفه. لا جداول بيانات، ولا أشياء تضيع في محادثة لم تُصنع
لتحملها.

للمحترفين

• أعضاؤك في قائمة واحدة — هدف كل عضو، وتركيزه، وأين وصل.
• أسبوع يمكن قراءته. حدّد ساعاتك مرة واحدة، وشاهد المحجوز وقيد الانتظار
  والمتاح، وانقل جلسة دون ثلاث رسائل بشأنها.
• مهام بين الجلسات بموعد نهائي، فيعرف العضو ما اتفق عليه وتعرف أنت إن
  حدث.
• باقات جلسات تحسب نفسها، فلا أحد مضطر لتذكّر ما تبقى.
• التقِ عضوك بالفيديو داخل التطبيق. يفتح الانضمام عشر دقائق قبل بدء
  الجلسة، ولا يُسجَّل شيء.
• محادثة مع كل عضو، بجانب الجلسة التي تخصّها.
• اكتب ما تقدّمه — جلسات فردية أو برنامجًا أو ورشة — وصفحة يراها الأعضاء.
• أرباحك، وما دُفع وما لم يُدفع، وبيانات استلام مستحقاتك، محفوظة حيث لا
  يراها إلا أنت وفريق رفيق.

للأعضاء

• ما وضعه لك محترفك هذا الأسبوع: المهام والجلسات وأين وصلت في البرنامج.
• جلستك تجري بالفيديو داخل التطبيق. لا رابط تبحث عنه ولا تطبيق آخر
  تثبّته؛ ويفتح الانضمام عشر دقائق قبل الموعد الذي حجزته.
• احجز موعدًا من أوقات محترفك الحقيقية، أو اطلب نقل موعد، أو ألغِه — دون
  مكالمة.
• تسجيل لحالتك، ليعرف من يدرّبك قبل الجلسة القادمة لا بعدها.
• ابحث عن محترف بما تعمل عليه وباللغة التي تتحدثها، وشاهد ما يقدّمه قبل
  أن تطلب شيئًا.
• قيّم محترفك بعد الجلسة، وأبلغ عنه إن حدث ما لا يصح.

بالعربية والإنجليزية

كل شاشة مكتوبة مرتين، لا مترجمة مرة. العربية من اليمين إلى اليسار في كل
مكان: التخطيط ينعكس، والتواريخ والأوقات بالعربية، والأسماء والعناوين تحفظ
ترتيبها داخل الجملة. اختر لغتك عند الفتح، وغيّرها متى شئت. فاتح وداكن.

ما لا يفعله

التدريب ليس علاجًا نفسيًا ولا استشارة طبية. رفيق للعلاقات التدريبية؛ وإن
كنت تحتاج رعاية إكلينيكية فالرجاء مراجعة مختص.

فعّل الإشعارات وسيخبرك رفيق على هاتفك عندما يطلب عضو جلسة أو يرد أو يرسل
رسالة — بالعربية أو الإنجليزية. وكل شيء ينتظرك أيضًا داخل التطبيق حين تفتحه.

الجلسات لا تُسجَّل أبدًا. ولا يفتح رفيق المكالمة من الأصل إذا كان التسجيل
مُفعَّلًا، فلا توجد نسخة من جلستك تُحفظ أو تُفقد أو تُسلَّم لأحد.

تسجيل الدخول بجوجل أو آبل. لا كلمة مرور تُنسى.

رفيق تطبيق جديد، يبدأ من مصر.
```

1,999 حرفًا، والحد 4000.

### الكلمات المفتاحية — 100 حرف

```
مدرب,تدريب,كوتش,كوتشينج,صحة,يوغا,تغذية,لياقة,غوص,حجز,جلسات,مصر,فيديو
```

68 حرفًا، 13 كلمة — بخلاف الإنجليزية التي وصلت إلى الحد تمامًا، العربية
ما زال فيها متسع واسع. هناك متسع — **أحمد يؤكد** أي مصطلحات يبحث بها المصريون
فعلًا: "كوتش" و"كوتشينج" مكتوبتان صوتيًا لأن هذا ما يُكتب في البحث عادة،
لكن هذا تخمين وليس بحث كلمات مفتاحية.

استُبعدت عمدًا: `علاج`, `معالج`, `استشارة نفسية` — التطبيق يقول في نصه إنه
ليس علاجًا، وشراء هذه العبارات يناقض ذلك.

### ما الجديد — 1.0

```
هذا أول إصدار.

رفيق بالعربية والإنجليزية: قائمة أعضاء وجدول وجلسات فيديو ومهام بين
الجلسات وباقات جلسات ورسائل وصفحة للمحترف؛ والخطة التي وضعها محترفك
والحجز وجلساتك بالفيديو وتسجيل الحالة والاستكشاف للأعضاء.

أخبرنا بما ينقص — support@rafiqpro.com
```

---

## Still needed before this can be submitted

Not copy, but the listing is not submittable without them:

- ~~**Screenshots**, both languages~~ **Done.** `store/screenshots/`
  produces 14 per language at iPhone 6.9" (1320×2868) and 14 at Play's
  1242×2208, plus the 1024×500 feature graphic and both icons — all
  committed under `out/`. They are captured against the screenshot seed
  rather than live accounts, which §7 asked for; that is a deliberate
  trade recorded in `store/screenshots/README.md`.

  Still a decision, not a blocker: **Discover** (`10-member-discover`) is
  in the set and the note above argues it should not ship at launch,
  because signed in it will be nearly empty. Leaving it out costs only the
  upload order.
- ~~**The app icon** (§7) — both platforms still ship Capacitor's
  placeholder.~~ Done (#83): both platforms ship the real mark, and §7
  is ticked. `store/screenshots/out/shared/` carries the 512×512 Play
  icon and the 1024×1024 App Store one.
- **Public URLs** — privacy policy, terms and support pages exist in
  `site/public/` but are not hosted yet (§5).
- **A support mailbox that replies** — `support@rafiqpro.com` appears in
  the promotional text, the description and both privacy policies.

## Things for Ahmed to decide

- Which name option, in each language.
- The category, and the age rating that follows from it (§8).
- Whether the Arabic keywords match how Egyptians actually search. The
  list above is reasoning about the language, not keyword research, and
  it is the one part of this document most likely to be wrong.
- Whether to say "starting in Egypt" at all. It is honest and it sets
  expectations, but it also tells someone outside Egypt not to bother.
