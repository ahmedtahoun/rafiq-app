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

1. **No push notifications.** There is no `@capacitor/push-notifications`,
   no APNs key and no Firebase project. The app has an in-app notification
   feed and the Profile toggles say so. "Reminders" in the listing has to
   read as something a user sees when they open the app, never as
   something the phone buzzes about. (The onboarding carousel's
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

   Worth knowing while writing this, because it decides which screens can
   be screenshotted: **the eight fictional coaches in
   `src/lib/directory.ts` no longer ship.** They are a development
   fixture now (`DEMO_DIRECTORY`, false in a `vite build`), so the
   signed-out path a reviewer might open first shows "No pros yet"
   instead of eight people who do not exist.
   Two consequences for this document. Screenshots of a populated
   Discover can only come from a signed-in session against real
   `coach_directory` rows — the demo cannot produce them any more, and a
   screenshot that shows coaches the store build cannot show is itself a
   metadata problem. And App Review notes (§11) must hand them a real
   account, because signed out there is now very little to see.

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

The first is recommended because it is the only one that reads correctly
for **both** roles — a coach runs sessions and tracks progress, a member
attends them and makes it. The second leans member, the third leans member
too.

### Short description (Play) — 80 max

`Coaching that stays in one place: sessions, tasks, messages and progress.` — 73

### Promotional text (App Store) — 170 max

Editable without a review, so this is the field to change when the first
real coaches join.

`Rafiq Pro is new in Egypt and taking on its first coaches. If you coach — life, fitness, yoga, nutrition, diving — we would like you on it early.` — 145

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
• A conversation with each member, next to the session it belongs to.
• Write what you offer — 1:1 sessions, a programme, a workshop — and a
  page members can see it on.
• Your earnings, what is paid, what is not, and your payout details, kept
  where only you and Rafiq can see them.

FOR MEMBERS

• What your coach set for you, this week: tasks, sessions and where you
  are in the programme.
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

Rafiq Pro does not send push notifications. Everything it has to tell you
is waiting in the app when you open it.

You sign in with Google or Apple. There is no password to lose.

Rafiq Pro is new, and starting in Egypt.
```

2,216 characters.

### Keywords — 100 max

Apple counts commas, so there are no spaces after them. "Rafiq" and the
subtitle's words are already indexed and are deliberately absent.

```
coach,coaching,wellness,life coach,yoga,nutrition,fitness,diving,client,booking,schedule,Egypt
```

94 characters, 12 terms.

Dropped on purpose: `therapy`, `therapist`, `counselling` — the app says in
its own copy that it is not therapy, and buying those searches would
contradict it and invite the age-rating and medical-claims questions in
§8. Also dropped: `free`, `best` (Apple rejects), and any competitor name.

### What's new — 1.0

```
This is the first release.

Rafiq Pro, in English and Arabic: a roster, a schedule, tasks between
sessions, session packages, messages and a coach page for coaches; the
plan your coach set, booking, check-ins and Discover for members.

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

`جلسات ومهام وتقدّم في مكان واحد` هي الترجمة الحرفية للإنجليزي لكنها 31 حرفًا —
حرف واحد فوق الحد، لأن الشدّة في «تقدّم» حرف مستقل في العدّ. الخيارات أعلاه
تترك هامشًا.

### الوصف القصير (جوجل بلاي) — 80 حرفًا

`التدريب في مكان واحد: الجلسات والمهام والرسائل والتقدّم.` — 56

### النص الترويجي (آبل) — 170 حرفًا

`رفيق تطبيق جديد في مصر ويستقبل أوائل المدربين. إن كنت تدرّب — حياتيًا أو رياضيًا أو يوغا أو تغذية أو غوصًا — يسعدنا انضمامك مبكرًا.` — 131

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
• محادثة مع كل عضو، بجانب الجلسة التي تخصّها.
• اكتب ما تقدّمه — جلسات فردية أو برنامجًا أو ورشة — وصفحة يراها الأعضاء.
• أرباحك، وما دُفع وما لم يُدفع، وبيانات استلام مستحقاتك، محفوظة حيث لا
  يراها إلا أنت وفريق رفيق.

للأعضاء

• ما وضعه لك محترفك هذا الأسبوع: المهام والجلسات وأين وصلت في البرنامج.
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

رفيق لا يرسل إشعارات فورية. كل ما يريد إخبارك به ينتظرك داخل التطبيق حين
تفتحه.

تسجيل الدخول بجوجل أو آبل. لا كلمة مرور تُنسى.

رفيق تطبيق جديد، يبدأ من مصر.
```

1,638 حرفًا.

### الكلمات المفتاحية — 100 حرف

```
مدرب,تدريب,كوتش,كوتشينج,صحة,يوغا,تغذية,لياقة,غوص,حجز,جلسات,مصر
```

62 حرفًا، 12 كلمة. هناك متسع — **أحمد يؤكد** أي مصطلحات يبحث بها المصريون
فعلًا: "كوتش" و"كوتشينج" مكتوبتان صوتيًا لأن هذا ما يُكتب في البحث عادة،
لكن هذا تخمين وليس بحث كلمات مفتاحية.

استُبعدت عمدًا: `علاج`, `معالج`, `استشارة نفسية` — التطبيق يقول في نصه إنه
ليس علاجًا، وشراء هذه العبارات يناقض ذلك.

### ما الجديد — 1.0

```
هذا أول إصدار.

رفيق بالعربية والإنجليزية: قائمة أعضاء وجدول ومهام بين الجلسات وباقات
جلسات ورسائل وصفحة للمحترف؛ والخطة التي وضعها محترفك والحجز وتسجيل الحالة
والاستكشاف للأعضاء.

أخبرنا بما ينقص — support@rafiqpro.com
```

---

## Still needed before this can be submitted

Not copy, but the listing is not submittable without them:

- **Screenshots**, both languages — iPhone 6.9" (1320×2868), 3–10 per
  language; Play needs at least 2 phone screenshots, a 1024×500 feature
  graphic and a 512×512 icon. §7 says to take them from the connected app,
  not the demo data, which means real accounts with real content. Discover
  should not be one of the screenshots at launch — it will be nearly
  empty.
- **The app icon** (§7) — both platforms still ship Capacitor's
  placeholder.
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
