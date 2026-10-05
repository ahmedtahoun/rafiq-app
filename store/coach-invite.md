# Launch-coach kit — the invite, and the 10-minute setup

Checklist §1: *"Launch coaches. Discover must not open empty or with fake
coaches."* The eight fictional coaches are gone, so on launch day Discover
shows whoever has actually signed up. This file is what you send to get
them there: a message, and a one-page guide.

Everything here is **Proposed, not Decided** — drafts for Ahmed to send,
edit or bin. Three of them have a blank in them, marked `⬚`, because the
answer is a decision nobody has written down yet (see *Open questions* at
the end).

**Every step below was read off the real screens**, not off a brief. Where
the guide quotes a label it is the app's own wording, in both languages,
and `tests/coach-invite.spec.js` fails if any of those labels change
without this file changing with them.

---

## The thing to understand before sending anything

**A coach is in Discover the moment they finish the signup form.**
`coach_directory` (0005, amended by 0022) lists every coach whose
`signup_completed_at` is set and whose account is active. It does not
check for a photo, a bio, an offering or a single bookable hour:

```sql
where p.account_status = 'active'
  and cp.signup_completed_at is not null
```

So a coach who signs up on the bus and means to "finish it later" is, from
that moment, a card in Discover with a grey avatar, no price (`from_price`
is null with no offering) and no bookable time. Three of those and
Discover looks worse than empty.

Two consequences for everything below:

1. **The invite has to set the expectation that this is one sitting**, not
   a signup now and a profile later. That is why the message says ten
   minutes and the guide is one page.
2. Ahmed should **unlist a coach who stalls** (`unlisted = true`, 0022,
   from the SQL Editor — `supabase/admin/README.md`) rather than leave a
   half-card up. Filed as an issue so it doesn't live only here.

---

## 1. The invite — WhatsApp

Short on purpose: it is a message from a person, not an announcement.
Egyptian colloquial in the Arabic, because that is what a WhatsApp message
from Ahmed would actually be written in — the app's own copy is MSA, and
the email and the guide below follow the app.

### English

> Hi [Name] — Ahmed here.
>
> I've been building **Rafiq Pro**: an app for coaches in Egypt to run the
> whole practice from one place — your members, their sessions, their
> tasks, and what they owe you.
>
> We're opening with a small group of pros and I'd like you to be one of
> them. Setting up takes about 10 minutes, it's free for up to 3 active
> members, and nothing is charged through the app.
>
> If you're interested I'll send you a one-page setup guide, and I'm on
> the phone for anything that doesn't make sense.

### العربية

> أهلًا [الاسم]، أنا أحمد.
>
> عملت تطبيق **رفيق**: تطبيق للمحترفين في مصر يدير الشغل كله من مكان واحد —
> الأعضاء، جلساتهم، مهامهم، والمدفوعات.
>
> إحنا بنبدأ بعدد صغير من المحترفين، ويسعدني تكون واحد منهم. تجهيز الحساب
> بياخد حوالي 10 دقايق، والخطة المجانية بتشيل 3 أعضاء نشطين، ومفيش أي مبلغ
> بيتحصّل من خلال التطبيق.
>
> لو الموضوع يهمك هبعتلك دليل من صفحة واحدة للتجهيز، وأنا موجود على
> التليفون لأي سؤال.

---

## 2. The invite — email

Longer, because email can carry the honest "where it is today" part that a
WhatsApp message can't without reading as a disclaimer.

### English

**Subject:** Rafiq Pro — opening with a small group of coaches

> Hi [Name],
>
> I'm Ahmed. I've spent the last year building **Rafiq Pro**, an app for
> coaches in Egypt: your members, their sessions, the tasks you set them,
> their progress and what they owe you — in one place, instead of a
> notebook and five chat threads.
>
> It's launching with a small group of pros and I'd like you to be one of
> them. What that means in practice:
>
> * About **ten minutes** to set up. The one-page guide is below.
> * You appear in **Discover**, where members browse by specialty, city,
>   language and price.
> * Members **book the hours you mark as free**, message you in the app,
>   and see the tasks you set them.
> * **Free for up to 3 active members.** ⬚
>
> Where it honestly is today:
>
> * **Money doesn't move through the app.** You take payment however you
>   do now and record it in Rafiq Pro, which then tracks who still owes
>   you.
> * **No phone notifications yet.** Requests and messages are waiting for
>   you when you open the app, not buzzing on your phone.
> * You'll be among the **first coaches on it**, so you will find rough
>   edges. I'd rather hear about them from ten people I can call than from
>   a thousand I can't — that's most of why I'm starting small.
>
> If you're in, reply and I'll set it up with you on a call if you'd
> rather not do it from the guide.
>
> Ahmed
> ⬚ · support@rafiqpro.com

### العربية

**الموضوع:** رفيق — نبدأ بعدد محدود من المحترفين

> أهلًا [الاسم]،
>
> أنا أحمد. أمضيت العام الماضي في بناء **رفيق**، تطبيق للمحترفين في مصر:
> أعضاؤك، جلساتهم، المهام التي تحددها لهم، تقدّمهم وما لم يُسدَّد بعد — في
> مكان واحد، بدلًا من دفتر وخمس محادثات متفرقة.
>
> التطبيق يبدأ بعدد محدود من المحترفين، ويسعدني أن تكون أحدهم. ما يعنيه
> ذلك عمليًا:
>
> * **عشر دقائق تقريبًا** للتجهيز، والدليل المرفق في صفحة واحدة.
> * تظهر في **«اكتشف»**، حيث يبحث الأعضاء حسب التخصص والمدينة واللغة والسعر.
> * يحجز الأعضاء **الساعات التي تعلن توفرك فيها**، ويراسلونك داخل التطبيق،
>   ويرون المهام التي تحددها لهم.
> * **مجانًا حتى 3 أعضاء نشطين.** ⬚
>
> وبكل صراحة، هذا ما لم يصل إليه التطبيق بعد:
>
> * **المدفوعات لا تمر عبر التطبيق.** تستلم المقابل بالطريقة التي تتبعها
>   الآن وتسجّله في رفيق، فيتابع لك من لم يسدد بعد.
> * **لا توجد تنبيهات على الهاتف حتى الآن.** الطلبات والرسائل تنتظرك عند
>   فتح التطبيق، ولا يرن بها هاتفك.
> * ستكون من **أول المحترفين عليه**، ولذلك ستجد بعض الجوانب غير المكتملة.
>   أفضّل أن أسمعها من عشرة أشخاص أستطيع الاتصال بهم على أن أسمعها من ألف
>   لا أستطيع — وهذا أهم سبب للبدء بعدد صغير.
>
> إن كنت موافقًا، ردّ على هذه الرسالة وسأجهّزه معك في مكالمة إن كنت تفضل
> ذلك على الدليل.
>
> أحمد
> ⬚ · support@rafiqpro.com

### Writing to a woman coach

Both Arabic drafts address a **masculine** reader, which is what the app's
own coach copy does throughout `i18n.ts` (`أنت تنضم كـ...`, `أنا محترف`,
`أخبر الأعضاء قليلًا عن أسلوبك`). That convention is defensible inside an
app with one string per screen. It is not defensible in a personal message
to a named person, so **feminise it before sending it to a woman**. In the
drafts above that is:

| masculine | feminine |
|---|---|
| تكون واحد منهم | تكوني واحدة منهم |
| يهمك / تهمك | يهمّك ← يهمّكِ، or leave unmarked |
| أن تكون أحدهم | أن تكوني إحداهم |
| تظهر في «اكتشف» | تظهرين في «اكتشف» |
| تعلن توفرك فيها | تعلنين توفرك فيها |
| تستلم المقابل … وتسجّله | تستلمين المقابل … وتسجّلينه |
| تحددها لهم | تحددينها لهم |
| ستكون من أول المحترفين | ستكونين من أول المحترفات |
| إن كنت موافقًا، ردّ | إن كنتِ موافقة، ردّي |
| تفضل ذلك | تفضلين ذلك |

---

## 3. The one-page guide — English

> ## Set your Rafiq Pro profile up in 10 minutes
>
> **Before you start**, have three things ready: a **Google or Apple
> account** (the app has no password sign-in), a **photo of yourself**,
> and **one price** for one session.
>
> ### 1 · Sign in — 1 minute
> Open Rafiq Pro, skip past the three intro screens, and tap **Continue
> with Google** or **Continue with Apple**. There is no email-and-password
> option on purpose.
> On **"You're joining as a..."** choose **"I'm a Pro"**.
>
> ### 2 · The one form — 3 minutes
> **Full name**, **Phone number**, **Email address**, **City**,
> **Country**, **What do you coach?** and **Years of experience**.
> Everything but the years is required.
>
> Two things worth slowing down for:
> * **What do you coach?** is *Choose all that apply* — 15 specialties in
>   four groups. **The ones you tick become the line under your name in
>   Discover**, joined with " · ". Pick the two or three you want to be
>   found for, not all fifteen.
> * **The moment you tap "Get Started" you are visible in Discover.** That's why
>   the next three steps aren't optional, and why this is worth doing in
>   one sitting rather than over a week.
>
> ### 3 · Photo and bio — 3 minutes
> Home shows a **Get set up** card with four steps. Tap **"Add your photo
> and bio"**, which opens **Edit Profile**:
> * your **profile photo** and a **Cover photo**
> * **Session format** — Online, In-person or Both
> * **Languages**
> * **Credentials & certifications** — *The first one shows as your badge*
> * **Short bio** — a few lines on how you coach, not a CV
>
> Tap **Save**.
>
> ### 4 · One thing you offer, with a price — 2 minutes
> Back to **Get set up** → **"Add what you offer, with a price"**:
> **Type**, **Offering name**, **Duration** in your own words ("50 min",
> "8 weeks"), **Price (EGP)**, **Total sessions (for progress tracking)**
> and **Format**. Save.
>
> Until there is one, **your card in Discover shows no price at all.**
>
> ### 5 · The hours members can book — 1 minute
> **Get set up** → **"Set the hours members can book"** → **Availability**:
> a start and an end for each day you work. *A day you leave off is a day
> nobody can book* — and a coach nobody can book is a coach members pass
> over.
>
> ### 6 · Your own members — optional, 1 minute each
> Add someone you already coach with **New Member**. Then, from their
> record, **Invite them** gives you a code that lasts **14 days**. They
> install the app, sign in as a member, and tap **"I have an invite code"**
> on their home screen.
>
> From then on they see their own tasks, sessions and payments on that
> record. **Your private notes stay yours.** The free plan carries **3
> active members**.
>
> ### Two progress rings, two different lists
> Home's **Get set up** counts four things: photo and bio, an offering,
> your hours, a first member. Your **Profile** ring counts four *different*
> things: your specialty line, your first credential, your bio, your phone
> number. So 4-of-4 on Home and 75% on Profile at the same time is normal
> — it means you haven't added a credential.
>
> ### What the app doesn't do yet, so you're not waiting for it
> * **Nothing is paid inside the app.** You collect as you do now; Rafiq
>   tracks who still owes you.
> * **Nothing buzzes your phone.** New requests and messages are waiting
>   when you open the app.
> * **The Share button on your profile is switched off** until your public
>   coach page exists.
> * **Verification:** Profile → *Tap to request verification* files the
>   request and your badge reads **Pending**. The app doesn't collect
>   documents, so send your certificate ⬚.
>
> Stuck anywhere: ⬚

---

## 4. The one-page guide — العربية

> ## جهّز ملفك في رفيق في 10 دقائق
>
> **قبل أن تبدأ** جهّز ثلاثة أشياء: **حساب جوجل أو آبل** (التطبيق لا يستخدم
> كلمة مرور)، **صورة لك**، و**سعرًا واحدًا** لجلسة واحدة.
>
> ### ١ · تسجيل الدخول — دقيقة
> افتح رفيق، تجاوز الشاشات التعريفية الثلاث، واضغط **المتابعة عبر جوجل**
> أو **المتابعة عبر آبل**. لا يوجد خيار بريد وكلمة مرور، وهذا مقصود.
> في **«أنت تنضم كـ...»** اختر **«أنا محترف»**.
>
> ### ٢ · الاستمارة الواحدة — 3 دقائق
> **الاسم الكامل**، **رقم الهاتف**، **البريد الإلكتروني**، **المدينة**،
> **الدولة**، **في أي مجال تقدّم التدريب؟** و**سنوات الخبرة**. كل ما سبق
> مطلوب ما عدا سنوات الخبرة.
>
> أمران يستحقان التمهّل:
> * **في أي مجال تقدّم التدريب؟** تحت العنوان مكتوب **«اختر كل ما ينطبق»** —
>   15 تخصصًا في أربع مجموعات. **ما تختاره يصبح السطر الذي يظهر تحت اسمك في «اكتشف»**،
>   مفصولًا بـ « · ». اختر تخصصين أو ثلاثة تريد أن يجدك
>   الأعضاء من خلالها، لا الخمسة عشر كلها.
> * **لحظة ضغطك «ابدأ الآن» تصبح ظاهرًا في «اكتشف».** لذلك فالخطوات
>   الثلاث التالية ليست اختيارية، ولذلك يُفضّل إنجاز هذا كله في جلسة واحدة
>   لا على مدى أسبوع.
>
> ### ٣ · الصورة والنبذة — 3 دقائق
> تعرض الصفحة الرئيسية بطاقة **جهّز حسابك** فيها أربع خطوات. اضغط **«أضف
> صورتك ونبذة عنك»** لتفتح **تعديل الملف الشخصي**:
> * **صورتك الشخصية** و**صورة الغلاف**
> * **صيغة الجلسات** — عبر الإنترنت، حضوريًا، أو كلاهما
> * **اللغات**
> * **الشهادات والاعتمادات** — *الأولى تظهر كشارتك*
> * **نبذة قصيرة** — سطور قليلة عن أسلوبك في التدريب، لا سيرة ذاتية
>
> ثم اضغط **حفظ**.
>
> ### ٤ · عرض واحد بسعره — دقيقتان
> عُد إلى **جهّز حسابك** ← **«أضف ما تقدمه وسعره»**: **النوع**، **اسم
> العرض**، **المدة** بكلماتك («50 دقيقة»، «8 أسابيع»)، **السعر (جنيه)**،
> **إجمالي عدد الجلسات (لتتبع التقدم)**، و**الصيغة**. ثم احفظ.
>
> وإلى أن تضيف عرضًا واحدًا، **لا يظهر أي سعر على بطاقتك في «اكتشف».**
>
> ### ٥ · الساعات المتاحة للحجز — دقيقة
> **جهّز حسابك** ← **«حدد الساعات المتاحة للحجز»** ← **أوقات التوفر**: بداية
> ونهاية لكل يوم تعمل فيه. *اليوم الذي تتركه مغلقًا لا يستطيع أحد الحجز
> فيه* — والمحترف الذي لا يمكن حجزه هو محترف يتجاوزه الأعضاء.
>
> ### ٦ · أعضاؤك الحاليون — اختياري، دقيقة لكل عضو
> أضف من تدرّبه فعلًا من **عضو جديد**. ثم من سجلّه، تمنحك **ادعُه** رمزًا
> صالحًا **14 يومًا**. يثبّت التطبيق، يسجّل الدخول كعضو، ويضغط
> **«لديّ رمز دعوة»** في صفحته الرئيسية.
>
> بعد ذلك يرى مهامه وجلساته ومدفوعاته على السجل نفسه. **وملاحظاتك الخاصة
> تبقى لك.** الخطة المجانية تشمل **3 أعضاء نشطين**.
>
> ### حلقتا تقدّم، وقائمتان مختلفتان
> بطاقة **جهّز حسابك** تحسب أربعة أشياء: الصورة والنبذة، عرضًا، ساعاتك،
> وأول عضو. وحلقة **ملفك الشخصي** تحسب أربعة أشياء *أخرى*: سطر تخصصك، أول
> شهادة، نبذتك، ورقم هاتفك. فأن تكون 4 من 4 في الرئيسية و75% في الملف
> الشخصي في الوقت نفسه أمر طبيعي — معناه أنك لم تضف شهادة.
>
> ### ما لا يفعله التطبيق بعد، حتى لا تنتظره
> * **لا يُدفع شيء داخل التطبيق.** تستلم كما تفعل الآن، ورفيق يتابع من لم
>   يسدد بعد.
> * **لا شيء يرن على هاتفك.** الطلبات والرسائل الجديدة تنتظرك عند فتح
>   التطبيق.
> * **زر المشاركة في ملفك مُعطّل** حتى تصبح صفحتك العامة موجودة.
> * **التوثيق:** من الملف الشخصي، *اضغط لطلب التوثيق* يسجّل الطلب وتصبح
>   شارتك **قيد المراجعة**. التطبيق لا يستلم المستندات، فأرسل شهادتك ⬚.
>
> لأي سؤال: ⬚

---

## What these drafts may not claim

Same discipline as `store/listing.md` §"What the listing may and may not
claim", and for the same reason: a recruiting message that oversells is
worse than one that undersells, because the coach finds out in week one.

1. **No phone notifications.** There is no `@capacitor/push-notifications`
   on main. Both drafts say so in as many words. (#135 and #137 are open;
   when they land, the line changes — not before.)
2. **No payment in the app.** Booking sends a request. The paid plans are
   a "Coming soon" state. "Free for up to 3 active members" is a fact
   about a cap, not an offer of a billed upgrade.
3. **No public profile link.** `ShareProfile`'s address is a domain Rafiq
   doesn't own, to a page that doesn't exist, and the button is hidden
   (§6). Neither draft tells a coach to share their profile — the two ways
   in are Discover and an invite code.
4. **Video is left out of the WhatsApp draft and bracketed in the email**
   — `session-video` is built and tested but **not deployed**, and the
   Daily domain's recording setting hasn't been checked (§4, *Ahmed*).
   Add the bullet only once that is done, and when you do, it is: *1:1
   sessions can be a video call inside the app, in Arabic or English, and
   nothing is ever recorded.*
5. **No claim about how fast verification is**, or that it happens at all
   for a given coach. The app files a request; a human decides.

---

## Open questions for Ahmed — the `⬚` blanks

| # | Where | What's missing |
|---|---|---|
| 1 | Email, after "Free for up to 3 active members" | Is there a **launch-coach offer** — a free paid tier for the first N, a waived anything? If not, delete the `⬚` and the sentence stands on its own. |
| 2 | Both guides, *Verification* | **How does a coach send a certificate?** The app files a request row with an empty `note` and uploads nothing. Email it to `support@`? A WhatsApp number? Nothing until after launch? Until this is answered the guide tells a coach to do something it can't finish. |
| 3 | Email signature and both guides' last line | **Which number or address** a launch coach reaches Ahmed on. `support@rafiqpro.com` doesn't exist yet (§5). |

And two decisions implied by this file rather than asked by it:

- **How many launch coaches?** The guide is written for someone Ahmed can
  phone. Ten is a number you can call; a hundred isn't.
- **Who unlists a stalled coach, and after how long?** See the issue
  filed alongside this PR.

---

## The labels these guides quote

`tests/coach-invite.spec.js` reads this table and checks every row against
`translate()` in both languages. If a label below stops matching the app,
that test fails and names the row. **Add a row when a guide above quotes a
new label; don't quote one without adding it.**

| Key | English | العربية |
|---|---|---|
| `authGoogle` | Continue with Google | المتابعة عبر جوجل |
| `authApple` | Continue with Apple | المتابعة عبر آبل |
| `roleTitle` | You're joining as a... | أنت تنضم كـ... |
| `imPro` | I'm a Pro | أنا محترف |
| `fullName` | Full name | الاسم الكامل |
| `phoneNumber` | Phone number | رقم الهاتف |
| `emailAddress` | Email address | البريد الإلكتروني |
| `city` | City | المدينة |
| `country` | Country | الدولة |
| `whatDoYouCoach` | What do you coach? | في أي مجال تقدّم التدريب؟ |
| `getStarted` | Get Started | ابدأ الآن |
| `chooseAllThatApply` | Choose all that apply | اختر كل ما ينطبق |
| `yearsOfExperience` | Years of experience | سنوات الخبرة |
| `mainSetupTitle` | Get set up | جهّز حسابك |
| `mainSetupProfile` | Add your photo and bio | أضف صورتك ونبذة عنك |
| `mainSetupOffering` | Add what you offer, with a price | أضف ما تقدمه وسعره |
| `mainSetupHours` | Set the hours members can book | حدد الساعات المتاحة للحجز |
| `editProfileTitle` | Edit Profile | تعديل الملف الشخصي |
| `editProfileCoverPhoto` | Cover photo | صورة الغلاف |
| `editProfileSessionFormat` | Session format | صيغة الجلسات |
| `editProfileOnline` | Online | عبر الإنترنت |
| `editProfileInPerson` | In-person | حضوريًا |
| `editProfileBoth` | Both | كلاهما |
| `editProfileLanguages` | Languages | اللغات |
| `editProfileCredentials` | Credentials & certifications | الشهادات والاعتمادات |
| `editProfileCredentialsSub` | The first one shows as your badge | الأولى تظهر كشارتك |
| `editProfileBio` | Short bio | نبذة قصيرة |
| `editProfileSave` | Save | حفظ |
| `offeringDetailType` | Type | النوع |
| `offeringDetailName` | Offering name | اسم العرض |
| `offeringDetailDuration` | Duration | المدة |
| `offeringDetailPriceLabel` | Price (EGP) | السعر (جنيه) |
| `offeringDetailSessionsTotal` | Total sessions (for progress tracking) | إجمالي عدد الجلسات (لتتبع التقدم) |
| `offeringDetailFormat` | Format | الصيغة |
| `availabilityTitle` | Availability | أوقات التوفر |
| `discoverNav` | Discover | اكتشف |
| `addClientTitle` | New Member | عضو جديد |
| `clientDetailInviteCreate` | Invite them | ادعُه |
| `memberNoCoachInviteCta` | I have an invite code | لديّ رمز دعوة |
| `profileVerificationSubUnverified` | Tap to request verification | اضغط لطلب التوثيق |
| `profileVerificationBadgePending` | Pending | قيد المراجعة |
