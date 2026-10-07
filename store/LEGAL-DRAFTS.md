# Draft clauses, for lawyer review

Fifteen clauses counsel can mark up instead of draft. Each is **Proposed**
— written against what the code does today, in English and Arabic, with
every undecided fact left as a visible placeholder.

Companion to `store/LAWYER-PACKAGE.md`, which is the package itself (the
four policy documents, the agreement, the crisis block, the deletion page)
and the questions on it. This file is only the new text.

**Nothing here is live.** It touches no screen, no `i18n.ts` key and no
public page, by design: a clause goes into the app after counsel approves
it, not before. Where a clause replaces existing wording the current text
is quoted underneath, so the change is visible rather than implied.

**Arabic is written, not translated**, and in the register the two Terms
documents already use: unmarked second person (`يمكنك`, not `يمكنكِ` or a
masculine form). That is deliberate — it reads correctly to a man or a
woman, which matters more in a contract than in screen copy, where this
codebase addresses coaches as masculine and members as feminine.

---

## The open facts — Ahmed fills these in

Every bracketed placeholder below, once, with who can answer it. **Nothing here
was invented**: where a fact is not decided, the placeholder stays.

| Placeholder | What it needs | Who decides |
|---|---|---|
| `[ENTITY NAME]` | **Given (Ahmed, 2026-10-07): Where To Spot (وير تو سبوت), a sole proprietorship (منشأة فردية)**, from the commercial register extract | Ahmed |
| `[ADDRESS]` | **Given (Ahmed, 2026-10-07): السوالم قبلي، إيتاي البارود**, Beheira. The English transliteration is ours | Ahmed |
| `[REGISTRATION NO.]` | **Given (Ahmed, 2026-10-07): 101557, Damanhour commercial register office** (مكتب سجل تجاري دمنهور), from the extract. The tax card number if counsel wants it stated | Ahmed |
| `[COMMISSION]` | **Decided (Ahmed, 2026-10-07): 15%** of the session price; **17%** for a coach who chooses payouts every three days (below) | Ahmed |
| `[PAYOUT SCHEDULE]` | **Decided (Ahmed, 2026-10-07): the coach chooses** — every week, or every three days for 2% more commission | Ahmed |
| `[PAYOUT MINIMUM]` | **Decided (Ahmed, 2026-10-07): none** | Ahmed |
| `[DPO NAME]` / `[DPO EMAIL]` | **Answered from the law (2026-10-07): no separate officer.** Law 151/2020 art. 8 obliges only a *legal person* (شخص اعتباري) to appoint and register a data protection officer; for a natural-person controller, "الشخص الطبيعي المتحكم أو المعالج هو المسئول". Where To Spot is a sole proprietorship, so the proprietor is personally responsible and the clause names support@rafiqpro.com. Counsel to confirm | Law, then counsel |
| `[24 hours]` | **Decided (Ahmed, 2026-10-07): 24 hours.** The review time Rafiq commits to for a report; Apple reads it as a promise | Ahmed |
| `[30 days]` | **Privacy requests: answered from the law (2026-10-07): six working days.** Law 151/2020 art. 32 (ستة أيام عمل من تاريخ تقديمه); art. 10(3) adds that silence for that long counts as a refusal. Clause 8 now says so. The other `[30 days]` (clause 1's settlement window, clause 6's refund timing) are ours, not the law's, and stay for counsel | Law |
| `[BREACH WINDOW]` | **Answered from the law (2026-10-07):** the Personal Data Protection Centre within 72 hours of learning of a breach, and every affected person within three working days of that report, in all cases (art. 7). Clause 8 now says so | Law |
| `[REFUND WINDOW]` | **Decided (Ahmed, 2026-10-07): 12 hours**, the same as the cancellation rule already in the member terms | Ahmed |
| `[COURT]` | **Proposed from the law (2026-10-07): "the competent Egyptian courts", no named seat.** A member's dispute under the Consumer Protection Law (181/2018) belongs to the Economic Courts by statute (Law 120/2008 art. 6(15)), and a clause cannot move it. Counsel may still want a seat for coach disputes | Counsel |
| `[DELETION SLA]` | **Decided (Ahmed, 2026-10-07): 30 days**, as the public deletion page already says. Backups: **none from Supabase**: Ahmed chose the free plan (2026-10-07), which has no backups. If Ahmed keeps backups of his own, the deletion page and clause 8 must say how long they last. Issue #132 | Ahmed |

## What the law says — research, 2026-10-07

Found by reading the statutes and published law-firm summaries, to give
counsel answers to confirm rather than questions to research. **Not legal
advice.** Each line names its source.

| Question | What we found | Source |
|---|---|---|
| **Deadline** | The executive regulations (Ministerial Decree 816/2025) were issued on 1 November 2025, which starts the law's one-year grace period: **full compliance by 1 November 2026** | Baker McKenzie, Jan 2026; RecordingLaw, reviewed Sep 2026 |
| **Who is responsible** | Only a legal person must appoint and register a data protection officer. **A natural-person controller is personally responsible** for applying the law (art. 8). Where To Spot is a sole proprietorship | Law 151/2020 art. 8 |
| **Licence to process** | Every controller needs a licence or permit from the Personal Data Protection Centre (art. 4, item 10). A licence is for legal persons; **a natural person gets a permit**, for up to a year, renewable. Fees are waived up to 100,000 records | Law art. 1 (definitions), art. 4; RecordingLaw; Baker McKenzie |
| **Health data** | Mental or physical health data is sensitive. Processing it needs **a licence from the Centre**, whether the controller is a natural or legal person, **plus the member's written and explicit consent** (art. 12). Our mood check-ins and coaching focus fall here | Law art. 1, art. 12; Chambers 2026 |
| **Data in Ireland** | A transfer abroad needs protection at least equal to Egyptian law's **and a licence or permit from the Centre** (art. 14). The regulations also require the data subject's consent to the transfer. The Centre has published no list of adequate countries | Law art. 14–16; Baker McKenzie; RecordingLaw |
| **The Centre's portal** | As of 10 September 2026, the Centre had not opened its online applications. Check again before launch | RecordingLaw |
| **Privacy requests** | Answer within **six working days** (art. 32) | Law art. 32 |
| **Breaches** | The Centre within **72 hours**; each affected person within **three working days** of that report, in all cases (art. 7) | Law art. 7 |
| **Penalties** | Criminal, tried by the Economic Courts. Sensitive data or a transfer without a licence: up to EGP 5 million and imprisonment | RecordingLaw; Law 151/2020 penalties chapter |
| **Courts** | Disputes under the Consumer Protection Law go to the Economic Courts, exclusively (Law 120/2008 art. 6, item 15), so the terms say "the competent Egyptian courts" | Law 120/2008 art. 6 |
| **Financial records** | Keep books, records and invoices for **five years after the tax period** (six where evasion is suspected). Our five-year proposal matches | Law 206/2020 (Unified Tax Procedures), per Andersen's translation |
| **Injury release** | "ويقع باطلا كل شرط يقضى بالإعفاء من المسئولية المترتبة على العمل غير المشروع" — **void**. Clause 14's release has to become an acknowledgement of risk | Civil Code art. 217(3) |

**What this means before launch.** As we read it, the proprietor needs
three things from the Centre: a permit to process, a licence for the health
data, and a permit for the transfer to Ireland. Members also need to give
written, explicit consent to the health data (clause 11) and to the
transfer. Counsel: is that reading right; can the proprietor apply as a
natural person; and can we lawfully launch before the Centre's portal
opens?

## Where each clause goes, and whether the thing it describes exists yet

The last column is the one that saves counsel's time, and it is the
mistake `store/LAWYER-PACKAGE.md` made before it was corrected: text for a
feature nobody has built reviews differently from text already in front of
users.

| # | Clause | Document it goes into | Built? |
|---|---|---|---|
| 1 | Parties, governing law, courts, privacy contact | Both Terms, both Privacy policies (replaces the `Contact` section) | n/a — a statement of fact |
| 2 | Minimum age 18 | Both Terms, §2 *Your account* | **No.** The terms set no minimum age today, while Play declares 18+ (checklist §8) |
| 3 | Zero tolerance, reporting, blocking | Both Terms, §5 *Acceptable use* | **Yes.** `pro_reports` (0005) and mutual blocking (0014) both ship |
| 4 | Arabic prevails | Both Terms, new final section | n/a |
| 5 | Coach payments, commission, payouts, tax | Coach Terms, §4 *Payments* (replaces it) | **Partly.** Payouts are built and tested; in-app charging is not. Nothing is charged today |
| 6 | Member refunds | Member Terms, §3 *Sessions & payments* / §4 *Cancellations* | **No.** No money moves in the app yet |
| 7 | Coach subscriptions | Coach Terms, §4, as its own subsection | **No.** Subscription screens show "Coming soon"; billing is the first update after launch |
| 8 | Privacy rights and how to use them | Both Privacy policies, *Your choices* | **Partly.** Deletion and export exist; the others are handled by hand over email |
| 9 | Who can see member data, and the processors | Member Privacy policy — replaces §3 *Who can see it* and extends §6 *Where your data is held* | **Yes**, and the current text is wrong about it. See the clause |
| 10 | Public reviews | Member Terms and Member Privacy | **Yes.** `coach_reviews` (0022) publishes exactly what the clause says |
| 11 | Health data consent | **A new screen at member signup** — not a document, and not part of accepting the terms | **No.** Copy and a sketch only, as asked |
| 12 | "Verified" badge | Both Terms, and the coach Privacy policy | **Partly**, and less than people will assume. See the clause |
| 13 | Changes to the terms | Both Terms, §6 *Changes* (replaces it) | **No.** There is no in-app announcement mechanism |
| 14 | Physical coaching agreement | `AGREEMENT_TEXT`, `src/lib/mockStore.ts` | **Not reachable.** No signed-in member is shown the agreement — issue #143 |
| 15 | A coach's public page | Coach Privacy policy | **Built, not reachable.** The page and the switch exist (0026, #160), but rafiqpro.com isn't hosted yet, so the app offers no link |

---

## 1 · Parties, governing law, and how to reach us — **Proposed**

> **Goes into:** both Terms (as a new opening section) and both Privacy
> policies (replacing `Contact`).

**English**

> Rafiq Pro is operated by **Where To Spot**, a sole proprietorship
> registered in the Arab Republic of Egypt at the Damanhour commercial
> register office under number **101557**, with its main place of business
> at **El Sawalem Qibli, Itay El Barud, Beheira Governorate, Egypt**. In
> these Terms, "Rafiq Pro", "we" and "us" mean that business.
>
> These Terms, and any dispute about them or about your use of Rafiq Pro,
> are governed by the laws of the Arab Republic of Egypt, and the
> competent Egyptian courts have jurisdiction.
>
> Before going to court, write to us at support@rafiqpro.com and we will
> try to settle the matter with you directly within [30 days]. Nothing in
> this paragraph takes away a right you have under Egyptian consumer
> protection law.
>
> For anything about your personal data — a copy of it, a correction, a
> deletion, or a complaint — write to **support@rafiqpro.com**. As the
> operator of a sole proprietorship, its owner is personally responsible
> for protecting your personal data under Law No. 151 of 2020, and reads
> what you send there.

**العربية**

> يُشغّل تطبيق رفيق **وير تو سبوت**، وهي منشأة فردية مقيدة في جمهورية مصر
> العربية بالسجل التجاري رقم **101557** بمكتب سجل تجاري دمنهور، ومحلها
> الرئيسي في **السوالم قبلي، إيتاي البارود، محافظة البحيرة**. وتعني كلمة
> «رفيق» وضمير المتكلم الجمع في هذه الشروط تلك المنشأة.
>
> تخضع هذه الشروط، وأي نزاع بشأنها أو بشأن استخدامك للتطبيق، لقوانين
> جمهورية مصر العربية، وتختص بها المحاكم المصرية المختصة.
>
> وقبل اللجوء إلى القضاء، راسلنا على support@rafiqpro.com وسنسعى إلى تسوية
> الأمر معك مباشرة خلال [30 days]. ولا يسقط هذا البند أي حق مقرر لك بموجب
> قانون حماية المستهلك المصري.
>
> ولأي أمر يتعلق ببياناتك الشخصية — الحصول على نسخة منها أو تصحيحها أو
> محوها أو تقديم شكوى — راسلنا على **support@rafiqpro.com**. ولأن رفيق
> منشأة فردية، فصاحبها هو المسؤول شخصيًا عن حماية بياناتك الشخصية وفقًا
> للقانون رقم 151 لسنة 2020، وهو من يقرأ ما ترسله إلى هذا العنوان.

**Note for counsel.** Two questions. Does Law 151/2020 oblige an entity
this size to appoint a data protection officer, or is naming one optional?
And is the pre-action step above enforceable as drafted, or does it need to
be either removed or made a formal condition precedent? The placeholder
stays until the first is answered — we would rather name nobody than name
the wrong role.

**A third, since 2026-10-07: the operator is a sole proprietorship**
(منشأة فردية, "أفراد محل رئيسي" on the register extract), not a company. As
we understand it, a sole proprietorship has no legal personality of its
own: the proprietor is the contracting party, the data controller, and
personally liable. Must the Terms and the Privacy policies name the
proprietor as well as the trade name, and does anything in Law 151/2020's
licensing or registration change because the controller is an individual?

---

## 2 · Minimum age — **Proposed**

> **Goes into:** both Terms, §2 *Your account*.

**English**

> Rafiq Pro is for adults. You must be 18 or older to create an account,
> whether as a professional or as a member, and by creating one you confirm
> that you are. If we learn that an account belongs to someone under 18 we
> will close it and delete the data held under it.

**العربية**

> رفيق مخصص للبالغين. يلزم أن يكون عمرك 18 عامًا أو أكثر لإنشاء حساب، سواء
> كمحترف أو كعضو، وبإنشائك الحساب فإنك تؤكد ذلك. وإذا علمنا أن حسابًا يخص
> شخصًا دون 18 عامًا، فسنغلقه ونمحو البيانات المحفوظة عليه.

**Note for counsel.** This closes a real inconsistency rather than adding a
rule: the Play listing already declares an 18+ target audience and the
terms are silent, which Apple's own override rule treats as a conflict
(`store/age-rating.md`). Worth confirming 18 rather than a lower age with a
guardian's consent, since coaching touches health and mood data (clause 11)
and a guardian route would need its own consent flow nobody has built.

---

## 3 · Zero tolerance for objectionable content and abusive users — **Proposed**

> **Goes into:** both Terms, §5 *Acceptable use*. Written to satisfy App
> Store Review Guideline 1.2, which asks for a stated method for filtering
> objectionable material, a mechanism to report it, the ability to block
> abusive users, and published contact details.

**English**

> Rafiq Pro has no tolerance for objectionable content or abusive
> behaviour. You must not use it to send anything threatening, hateful,
> harassing, sexually explicit, or unlawful, to anyone.
>
> **Reporting.** Either side of a coaching relationship can report the
> other from the app. Tell us what happened and we will look at it within
> 24 hours of the report reaching us.
>
> **Blocking.** Either side can also block the other. A block stops new
> messages immediately. Only the person who set a block can lift it — a
> coach cannot clear a member's block, and a member cannot clear a
> coach's.
>
> **What we do about it.** Depending on what we find, we may remove
> content, suspend an account while we look into it, end a coaching
> relationship, or remove the account from Rafiq Pro entirely. We may do
> any of those without notice where someone's safety is involved.
>
> To report something you cannot report in the app, write to
> support@rafiqpro.com.

**العربية**

> لا يتهاون رفيق مع المحتوى المسيء أو السلوك المؤذي. ويُحظر استخدام
> التطبيق لإرسال أي شيء يحمل تهديدًا أو كراهية أو تحرشًا أو محتوى جنسيًا
> صريحًا أو مخالفًا للقانون، إلى أي شخص.
>
> **الإبلاغ.** يمكن لكل طرف في علاقة التدريب أن يبلّغ عن الطرف الآخر من
> داخل التطبيق. أخبرنا بما حدث وسننظر في الأمر خلال 24 ساعة من وصول
> البلاغ إلينا.
>
> **الحجب.** ويمكن لكل طرف أيضًا حجب الآخر، ويمنع الحجب الرسائل الجديدة
> فورًا. ولا يرفع الحجب إلا من فرضه: فلا يستطيع المحترف إلغاء حجب العضو،
> ولا العضو إلغاء حجب المحترف.
>
> **وماذا نفعل.** بحسب ما يتبين لنا، قد نحذف المحتوى، أو نوقف الحساب
> مؤقتًا أثناء النظر في الأمر، أو ننهي علاقة التدريب، أو نحذف الحساب من
> رفيق نهائيًا. وقد نتخذ أيًّا من ذلك دون إشعار مسبق إذا كان الأمر يمس
> سلامة أحد.
>
> وللإبلاغ عن أمر لا يمكنك الإبلاغ عنه من التطبيق، راسلنا على
> support@rafiqpro.com.

**What the app actually does**, so the clause does not overstate it:
`pro_reports` (0005) carries a reporter, the person reported, a reason
(`no_show`, `inappropriate`, `payment`, `other`), free-text details, and a
status (`open`, `actioned`, `dismissed`) with a resolution note. Blocking
(0014) keeps each side's block in its own column and a trigger refuses any
write that would clear the other side's — the clause's last sentence is
enforced by the database, not by a promise.

**The 24 hours is a commitment, not a description.** Nothing measures it
today, and no one is rostered to answer reports. Checklist §9 lists "a
written response time for reports and deletions — and meet it" as open.
Pick a number Rafiq can hold on a bad week, not a good one.

---

## 4 · Which language prevails — **Proposed**

> **Goes into:** both Terms, as the final section.

**English**

> Rafiq Pro publishes these Terms and its Privacy Policy in Arabic and in
> English. We try to keep the two saying the same thing. **If they differ,
> the Arabic version prevails.**

**العربية**

> ينشر رفيق هذه الشروط وسياسة الخصوصية بالعربية والإنجليزية، ونحرص على
> تطابق النصين. **وفي حال اختلافهما، يُعتدّ بالنص العربي.**

**Note for counsel.** Stated in both languages on purpose: a prevalence
clause that appears only in the version it favours is the first thing a
counterparty attacks. Worth confirming this is the right way round for an
Egyptian entity with Egyptian users — it is the safer default, but it also
means the Arabic is the text that must be right, so counsel's review of the
Arabic matters more than a courtesy read.

---

## 5 · Coach payments, commission and payouts — **Proposed**

> **Goes into:** Coach Terms, §4 *Payments*, **replacing it**.

The section being replaced says the opposite of the decided model:

> *Current `termsSection4Body`:* "Rafiq Pro helps you track payment status.
> Actual payment collection methods and any related fees are between you and
> your member unless otherwise stated."

**English**

> **How members pay, and how you get paid.** When a member books and pays
> for a session in Rafiq Pro, the payment is taken by our payment provider,
> Paymob. Rafiq Pro keeps a commission of **15%** of the session price
> and pays you the rest.
>
> **Payouts.** You choose how often we pay you: **every week**, or **every
> three days** for an extra **2%** commission — 17% of the session price in
> all — on what is paid out on that schedule. We pay to the payout account
> you set in Profile → Payout account. There is no minimum: whatever is
> due is paid on your schedule, however small. Rafiq Pro does not
> hold a balance for you: a payout is a transfer of money already collected
> for your completed sessions, not a wallet.
>
> **What Paymob needs from you.** Egyptian payout rules mean we cannot send
> you money without the name on your account, your 14-digit national ID
> number, and either an Egyptian mobile number (for a wallet) or a bank
> code with an account number or IBAN (for a bank transfer). We pass these
> to Paymob to make the transfer. Your national ID number is stored once,
> readable only by you, and is never copied onto a payout record.
>
> **Tax.** You are responsible for your own tax on what you earn through
> Rafiq Pro. We do not withhold tax, and we do not file anything on your
> behalf. We will give you a record of what we paid you whenever you ask.
>
> **Refunds and chargebacks.** Where a member is refunded under clause 6,
> the refund comes out of the session's price, and our commission on it is
> refunded too. If a payment is reversed by the member's bank or card
> issuer after we have paid you (a chargeback), the reversed amount is
> deducted from your next payout. We will tell you when that happens and
> why.

**العربية**

> **كيف يدفع الأعضاء، وكيف تُقبض مستحقاتك.** عندما يحجز عضو جلسة ويدفع
> قيمتها داخل رفيق، يتولى تحصيل المبلغ مزود خدمات الدفع «بيموب»، ويحتفظ
> رفيق بعمولة قدرها **15%** من قيمة الجلسة ويحوّل إليك الباقي.
>
> **التحويلات.** تختار بنفسك موعد تحويل مستحقاتك: **كل أسبوع**، أو **كل
> ثلاثة أيام** مقابل عمولة إضافية قدرها **2%** — أي 17% من قيمة الجلسة
> إجمالًا — على ما يُحوَّل وفق هذا الموعد. ونحوّلها إلى حساب القبض الذي
> تحدده في: الملف الشخصي ← حساب القبض. ولا حد أدنى للتحويل: يُحوَّل كل ما
> يستحق لك في موعده مهما صغر. ولا يحتفظ رفيق
> برصيد لك: فالتحويل نقل لمبالغ تم تحصيلها فعلًا عن جلسات أتممتها، وليس
> محفظة.
>
> **ما تطلبه «بيموب» منك.** تقتضي قواعد التحويل في مصر ألّا نرسل إليك
> مبلغًا دون الاسم المسجل على حسابك، ورقم قوميّك المكوّن من 14 رقمًا، ثم
> إما رقم هاتف محمول مصري (للمحفظة) أو كود بنك ورقم حساب أو «آيبان»
> (للتحويل البنكي). ونمرّر هذه البيانات إلى «بيموب» لتنفيذ التحويل. ويُحفظ
> رقمك القومي مرة واحدة، ولا يقرؤه سواك، ولا يُنسخ أبدًا إلى سجل تحويل.
>
> **الضرائب.** أنت المسؤول عن الضرائب المستحقة على ما تكسبه من خلال رفيق.
> ولا نخصم ضريبة من المنبع، ولا نقدّم إقرارات عنك. وسنوفر لك بيانًا بما
> حوّلناه إليك في أي وقت تطلبه.
>
> **الاسترداد والمبالغ المرتجعة.** إذا استُرد مبلغ لعضو وفق البند 6، فيكون
> الاسترداد من قيمة الجلسة، وتُرد عمولتنا عليها كذلك. وإذا عكس بنك العضو
> أو مُصدر بطاقته عملية دفع بعد أن حوّلنا إليك قيمتها، فيُخصم المبلغ
> المعكوس من تحويلك التالي، وسنبلغك بذلك وبسببه.

**What the app actually does.** The payout half is built: 0007's
`coach_payout_accounts` holds exactly the fields the clause lists, with the
national ID constrained to 14 digits and readable only by the coach and
`service_role`; the destination rules are a database constraint (an
11-digit Egyptian mobile for a wallet, a bank code plus a 6–20 digit
account or an `EG`+27 IBAN for a transfer). The clause's promise that the
national ID never reaches a payout record is **0009**, a check constraint
that refuses it on the ledger — added because the public deletion page
promises the ID is deleted with the account and 0007's function would have
broken that.

**The collection half does not exist.** No money moves through the app
today: booking sends the coach a request, and payments are recorded
offline. The commission was decided on 2026-10-07 (15%, or 17% on the
three-day schedule), but **nothing in the app offers the choice of
schedule yet**, and the payouts function applies no commission. So this
clause is text for the version that charges, and counsel should know it
reviews a model rather than a practice.

**Note for counsel.** Three things worth a view. Whether Rafiq collecting
and then paying out makes it a party to the coaching contract or an agent
of the coach, and what that does to its liability for a session that goes
wrong. Whether deducting a chargeback from a later payout is enforceable
against a coach as drafted. And whether anything in Egyptian payment-
services regulation requires more than Paymob's own licence for this to be
lawful.

---

## 6 · Member refunds — **Proposed**

> **Goes into:** Member Terms, §3 *Sessions & payments*, beside §4
> *Cancellations*.

Built to sit on the rule the member terms already state, rather than
beside it:

> *Current `clientTermsSection4Body`:* "You can cancel or reschedule an
> upcoming session from the Sessions tab. Cancelling or moving a session
> within 12 hours of its start time uses one session from your package."

**English**

> **If you paid for a session and cancel it.** Cancel more than 12 hours
> before the session starts and you are refunded in full, to the card or
> wallet you paid with. Cancel within 12 hours of the start time and the
> session is treated as used — the same rule that applies to a session from
> a package.
>
> **If your pro cancels, or does not show up.** You are refunded in full,
> whenever it happens. If your pro does not appear for a session you paid
> for, report it from the app and we will refund you.
>
> **If something went wrong with the session itself.** Tell us within
> 12 hours of the session and we will look at it and decide, and we
> will tell you why.
>
> Refunds go back the way the money came in, and usually reach you within
> **[30 days]**, though your bank sets the final timing. None of this
> affects any right you have under Egyptian consumer protection law.

**العربية**

> **إذا دفعت قيمة جلسة ثم ألغيتها.** إذا ألغيت قبل بدء الجلسة بأكثر من 12
> ساعة، يُرد إليك المبلغ كاملًا إلى البطاقة أو المحفظة التي دفعت منها.
> وإذا ألغيت خلال 12 ساعة من موعد البدء، تُحتسب الجلسة مستخدمة — وهي
> القاعدة نفسها المطبقة على جلسة من الباقة.
>
> **وإذا ألغى محترفك أو لم يحضر.** يُرد إليك المبلغ كاملًا، في أي وقت حدث
> ذلك. وإذا لم يحضر محترفك جلسة دفعت قيمتها، فأبلغنا من التطبيق وسنرد لك
> المبلغ.
>
> **وإذا وقع خلل في الجلسة نفسها.** أخبرنا خلال 12 ساعة من موعد
> الجلسة، وسننظر في الأمر ونقرر، وسنبيّن لك سبب قرارنا.
>
> ويُرد المبلغ بالطريقة التي دفعت بها، ويصلك عادة خلال **[30 days]**، مع
> أن التوقيت النهائي يحدده بنكك. ولا يمس أي ممّا سبق أي حق مقرر لك بموجب
> قانون حماية المستهلك المصري.

**Note for counsel.** The 12-hour line is carried over from text already
published, so if it is not enforceable against a consumer the existing
member terms have the same problem and both need changing. Two further
questions: does Egyptian consumer law give a right of withdrawal from a
distance-sold service that this clause would have to yield to, and is "the
session is treated as used" a lawful forfeiture, or must some part be
refunded?

---

## 7 · Coach subscriptions — **Proposed**

> **Goes into:** Coach Terms, §4 *Payments*, as its own subsection.
> **Not before billing ships** — the screens say "Coming soon" today.

**English**

> **The plans.** Rafiq Pro is free for up to 3 active members. Two paid
> plans raise that:
>
> | Plan | Monthly | Yearly | Active members |
> |---|---|---|---|
> | Free | — | — | 3 |
> | Rafiq Pro Plus | 450 EGP | 4,500 EGP | 15 |
> | Rafiq Elite Pro | 900 EGP | 9,000 EGP | unlimited |
>
> **How you are billed.** Paid plans are sold through Apple's App Store or
> Google Play, not by us. You pay Apple or Google, under their terms, and
> your subscription **renews automatically** at the end of each period
> until you cancel it.
>
> **How to cancel.** Cancel in your phone's store settings — Apple ID
> subscriptions on iPhone, or Google Play subscriptions on Android. We
> cannot cancel it for you, and removing the app does not cancel it. Your
> plan keeps working until the end of the period you have paid for.
>
> **Refunds** on a subscription are handled by Apple or Google under their
> own policies, not by Rafiq Pro.
>
> **If you move to a smaller plan, or your plan lapses.** Nobody is removed
> from your roster. Every member you already have stays, and you keep
> working with all of them. What changes is that you cannot add a new
> member while you are over your plan's limit — the next one is refused,
> with a message saying so, until you are back under it or you upgrade
> again.

**العربية**

> **الخطط.** رفيق مجاني حتى 3 أعضاء نشطين، وهناك خطتان مدفوعتان ترفعان هذا
> الحد:
>
> | الخطة | شهريًا | سنويًا | الأعضاء النشطون |
> |---|---|---|---|
> | المجانية | — | — | 3 |
> | رفيق برو بلس | 450 جنيهًا | 4,500 جنيه | 15 |
> | رفيق إيليت برو | 900 جنيه | 9,000 جنيه | بلا حد |
>
> **كيف تُحصّل القيمة.** تُباع الخطط المدفوعة عبر «آب ستور» من آبل أو
> «جوجل بلاي»، لا من خلالنا. فأنت تدفع لآبل أو جوجل وفق شروطهما،
> و**يتجدد اشتراكك تلقائيًا** في نهاية كل مدة إلى أن تلغيه.
>
> **كيف تلغي.** الإلغاء من إعدادات المتجر في هاتفك: اشتراكات «آبل آي دي»
> على الآيفون، أو اشتراكات «جوجل بلاي» على أندرويد. ولا نستطيع إلغاءه
> عنك، وحذف التطبيق لا يلغيه. وتبقى خطتك عاملة حتى نهاية المدة المدفوعة.
>
> **وأما الاسترداد** على الاشتراك فتتولاه آبل أو جوجل وفق سياساتهما، لا
> رفيق.
>
> **وإذا نزلت إلى خطة أصغر أو انتهت خطتك.** لا يُحذف أحد من قائمتك. يبقى
> كل عضو لديك، وتواصل العمل معهم جميعًا. والذي يتغير أنك لا تستطيع إضافة
> عضو جديد وأنت فوق حد خطتك: فيُرفض العضو التالي برسالة توضح ذلك، إلى أن
> تعود دون الحد أو ترفع خطتك من جديد.

**What the app actually does.** The caps are enforced in the database, not
in the screen: 0024's `coach_member_cap()` returns 3, 15 or no limit, and
0020's trigger refuses a member past the coach's own cap with error
`53400`. A lapsed or downgraded coach keeps every member and only the next
one is refused — which is what the clause's last paragraph describes, and
why it can be stated as a fact rather than a policy. The prices and caps
are Ahmed's decision of 2026-10-05.

**Note for counsel.** The auto-renewal and cancellation wording is close to
what Apple and Google require a developer to state, so it should be checked
against their current terms as much as against Egyptian law. The question
we cannot answer: does Egyptian consumer law require a pre-renewal reminder
or a cooling-off period on an auto-renewing subscription sold this way, and
if so, can Rafiq satisfy it when it does not control the billing?

---

## 8 · Your privacy rights, and how to use them — **Proposed**

> **Goes into:** both Privacy policies, *Your choices*.

**English**

> You have the following rights over your personal data, and you can use
> any of them without giving a reason.
>
> | Right | How to use it |
> |---|---|
> | **See what we hold** | Profile → Account details shows what we hold about you. For a full copy, write to support@rafiqpro.com |
> | **Correct it** | Profile → Edit profile, for anything you can see there. For anything else, write to us |
> | **Delete it** | Profile → Delete account. Or request it at https://rafiqpro.com/delete-account/ |
> | **Object to a use of it** | Write to support@rafiqpro.com and say which use |
> | **Withdraw a consent you gave** | Write to support@rafiqpro.com. Withdrawing the health-data consent (see the signup consent notice) stops the mood check-ins and the coaching-focus features and deletes what they have collected |
> | **Be told about a breach** | If your personal data is involved in a breach, we report it to the Personal Data Protection Centre within 72 hours of learning of it, and tell you, in the app and by email, within three working days of that report: what happened and what we have done about it |
>
> We answer a request within **six working days** of receiving it, as the
> law requires. If we refuse a request we will tell you the reason and how
> to complain to the Personal Data Protection Centre.
>
> We delete your account within 30 days of your request.
> **[BACKUPS: nothing while Rafiq is on Supabase's free plan, which keeps
> no backups. If Ahmed keeps backups of his own, say here how long a copy
> lasts in them.]**

**العربية**

> لك الحقوق التالية على بياناتك الشخصية، ويمكنك استعمال أيٍّ منها دون
> إبداء سبب.
>
> | الحق | كيف تستعمله |
> |---|---|
> | **الاطلاع على ما نحفظه** | الملف الشخصي ← بيانات الحساب يعرض ما نحفظه عنك. وللحصول على نسخة كاملة، راسلنا على support@rafiqpro.com |
> | **التصحيح** | الملف الشخصي ← تعديل الملف الشخصي، لكل ما تراه هناك. ولما عدا ذلك راسلنا |
> | **المحو** | الملف الشخصي ← حذف الحساب، أو اطلبه من https://rafiqpro.com/delete-account/ |
> | **الاعتراض على استخدام** | راسلنا على support@rafiqpro.com موضحًا الاستخدام المعترض عليه |
> | **سحب موافقة سبق أن منحتها** | راسلنا على support@rafiqpro.com. وسحب الموافقة على البيانات الصحية (انظر إشعار الموافقة عند التسجيل) يوقف تسجيل الحالة المزاجية وخصائص مجال التدريب، ويمحو ما جُمع منها |
> | **إبلاغك عند وقوع اختراق** | إذا كانت بياناتك الشخصية ضمن خرق، نبلغ مركز حماية البيانات الشخصية خلال 72 ساعة من علمنا به، ونخطرك في التطبيق وبالبريد الإلكتروني خلال ثلاثة أيام عمل من ذلك الإبلاغ: بما حدث وبما اتخذناه من إجراءات |
>
> ونرد على الطلب خلال **ستة أيام عمل** من تاريخ وصوله إلينا، كما يقضي
> القانون. وإذا رفضنا طلبًا فسنوضح سببه وكيف تتقدم بشكوى إلى مركز حماية
> البيانات الشخصية.
>
> ونحذف حسابك خلال 30 يومًا من طلبك.
> **[BACKUPS — see the English]**

**What the app actually does.** Deletion is real and asynchronous: the app
files a request (0012), an Edge Function anonymises the profile and bans
the login, and the account leaves `coach_directory` immediately. The other
five rights have no mechanism — they are answered by a person reading
`support@rafiqpro.com`, which **does not exist yet** (checklist §5).

**Note for counsel.** Filled from the law's text on 2026-10-07; please
confirm. The breach timing is art. 7 (the Centre within 72 hours; the
person within three working days of that report, in all cases — so the
"puts you at risk" qualifier the earlier draft had is gone). The six
working days is art. 32. Backups depend on Ahmed's choice of plan:
Supabase's free plan keeps none, so the deletion promise needs no
qualifying today (issue #132).

---

## 9 · Who can see a member's data — **Proposed**

> **Goes into:** Member Privacy policy — **replaces** §3 *Who can see it*
> and extends §6 *Where your data is held*.

**The text being replaced is not accurate**, which is the reason this
clause exists:

> *Current `clientPrivacySection3Body`:* "Only you and your pro can see
> your progress, tasks, and mood history. Anonymized session counts may be
> used to improve Rafiq Pro."

"Only you and your pro" is not true. Rafiq's own staff can read member data
through the Supabase dashboard, because the `service_role` key bypasses
every row-level security policy in the database — that is how support, a
report, and a deletion request get handled at all. A member reading the
current sentence would be misled about something material.

**English**

> **You.** Everything about you, in the app.
>
> **Your pro.** The pro you are working with sees your name, your contact
> details, your goal and coaching focus, your tasks and whether you have
> done them, your sessions and their history, your mood check-ins, your
> payment status with them, and your messages with them. A pro you have
> only sent a request to sees your name and what you wrote in the request.
> A pro you are no longer with keeps the record of your work together.
>
> **Rafiq Pro's staff.** A small number of our people can read your data
> when there is a reason to: answering a support request you sent, looking
> into a report about you or by you, acting on a deletion request, or
> investigating a fault. We do not read messages or mood check-ins for any
> other purpose, and never to train anything.
>
> **Other members and the public.** Nothing of yours is public, with one
> exception: if you write a review of a pro, it appears on their page with
> your first name and the initial of your surname (clause 10).
>
> **The companies that run parts of Rafiq Pro.** They hold your data only
> to provide their part of the service, and may not use it for their own
> purposes.
>
> | Company | Where | What it holds |
> |---|---|---|
> | **Supabase** | A United States company; your data is stored on its servers in **Ireland** | The database and uploaded files — everything above |
> | **Daily** | A United States company | Live video and audio during a session, for the length of the call. **Sessions are never recorded**, by you, your pro, or us |
> | **Paymob** | **Egypt** | Payment and payout details when money moves |
> | **Apple** and **Google** | United States companies | Sign-in (we see your name and email address from them) and, when we send them, push notifications |
>
> Because Supabase stores the data in Ireland, information about you leaves
> Egypt and is held in the European Union. By using Rafiq Pro you agree to
> that transfer.

**العربية**

> **أنت.** كل ما يتعلق بك، داخل التطبيق.
>
> **محترفتك.** ترى المحترفة التي تعملين معها اسمك وبيانات التواصل معك
> وهدفك ومجال تدريبك، ومهامك وما أنجزتِه منها، وجلساتك وسجلها، وتسجيلات
> حالتك المزاجية، وحالة الدفع بينكما، ورسائلكما. والمحترفة التي أرسلتِ
> إليها طلبًا فقط ترى اسمك وما كتبتِه في الطلب. والمحترفة التي لم تعودي
> تعملين معها يبقى لديها سجل عملكما معًا.
>
> **فريق رفيق.** يستطيع عدد محدود من العاملين لدينا قراءة بياناتك عند وجود
> سبب: الرد على طلب دعم أرسلتِه، أو النظر في بلاغ عنك أو منك، أو تنفيذ طلب
> حذف، أو فحص خلل تقني. ولا نقرأ الرسائل ولا تسجيلات الحالة المزاجية لأي
> غرض آخر، ولا نستخدمها أبدًا لتدريب أي نظام.
>
> **الأعضاء الآخرون والجمهور.** لا شيء من بياناتك معلن، باستثناء واحد: إذا
> كتبتِ تقييمًا لمحترفة، فيظهر في صفحتها باسمك الأول والحرف الأول من اسم
> عائلتك (البند 10).
>
> **الشركات التي تشغّل أجزاء من رفيق.** تحفظ هذه الشركات بياناتك لتقديم
> الجزء الخاص بها فقط، ولا يجوز لها استخدامها لأغراضها.
>
> | الشركة | المكان | ما تحفظه |
> |---|---|---|
> | **Supabase** | شركة أمريكية، وبياناتك مخزنة على خوادمها في **أيرلندا** | قاعدة البيانات والملفات المرفوعة — كل ما سبق |
> | **Daily** | شركة أمريكية | الفيديو والصوت المباشر أثناء الجلسة، لمدة المكالمة فقط. **ولا تُسجَّل الجلسات أبدًا**، لا منك ولا من محترفتك ولا منا |
> | **Paymob** | **مصر** | بيانات الدفع والتحويل عند انتقال الأموال |
> | **Apple** و**Google** | شركتان أمريكيتان | تسجيل الدخول (نرى منهما اسمك وبريدك الإلكتروني)، والتنبيهات عند إرسالها |
>
> ولأن Supabase تخزّن البيانات في أيرلندا، فإن معلومات عنك تخرج من مصر
> وتُحفظ في الاتحاد الأوروبي. وباستخدامك رفيق فإنك توافقين على هذا النقل.

**What the app actually does.** The admin tool reads `pro_reports`,
`verification_requests`, `account_deletion_requests`, `payouts`,
`profiles` and `admin_users` — not tasks, mood check-ins or messages. But
the Supabase dashboard is not so limited, and the clause says "can read"
rather than "the admin tool shows" for that reason. "Never recorded" is
enforced, not promised: `session-video` sets no recording flag, makes
nobody an owner, and refuses to open a call at all if recording is enabled
on the Daily domain or room.

**Note for counsel.** The Ireland transfer is q7 in
`store/LAWYER-PACKAGE.md` and the biggest open question in the package:
whether "by using Rafiq Pro you agree" is a lawful basis for a transfer
under Law 151/2020, or whether it needs explicit separate consent, a
licence from the Data Protection Centre, or both. If separate consent is
needed, it belongs next to clause 11's consent step, and we should be told
that before launch rather than after.

---

## 10 · Public reviews — **Proposed**

> **Goes into:** Member Terms (§3) and the Member Privacy policy, beside
> clause 9.

**English**

> **A review you write is public.** If you rate a pro and write a comment,
> the comment appears on that pro's public page, and may appear in Discover
> among recent reviews, shown with **your first name and the initial of
> your surname** — "Sara M." — and a colour, never your photo. If your name
> is a single word, that word is shown.
>
> A rating you give without writing a comment is not published: it counts
> towards the pro's average, and nothing identifies you.
>
> Ask us at support@rafiqpro.com and we will remove your review.

**العربية**

> **التقييم الذي تكتبينه معلن.** إذا قيّمتِ محترفة وكتبتِ تعليقًا، فيظهر
> التعليق في صفحتها العامة، وقد يظهر في «اكتشف» بين أحدث التقييمات،
> مصحوبًا **باسمك الأول والحرف الأول من اسم عائلتك** — «سارة م.» — ولون،
> دون صورتك أبدًا. وإذا كان اسمك كلمة واحدة، فتظهر تلك الكلمة.
>
> أما التقييم الذي تمنحينه دون تعليق فلا يُنشر: يُحتسب في متوسط تقييم
> المحترفة، ولا يدل على هويتك شيء.
>
> واطلبي منا على support@rafiqpro.com إزالة تقييمك وسنزيله.

**What the app actually does**, exactly: `coach_reviews` (0022) publishes
`split_part(trim(full_name), ' ', 1)` plus, when a second word exists, its
first letter and a full stop — so "Sara Mahmoud" is "Sara M." and "Sara" is
"Sara". It publishes `avatar_bg`, a colour, and no photo. And it includes
**only rows whose comment is non-empty**, which is why the second paragraph
can promise what it promises.

**Note for counsel.** Whether a first name plus an initial is personal data
that needs its own consent, and whether the removal right above should be a
button rather than an email.

---

## 11 · Health data consent — **Proposed**

> **Goes into:** a **new screen at member signup**. Not a document, not a
> section of the terms, and **not** something accepting the terms covers.
> Copy and a sketch only, as asked — no code in this PR.

Why separate: a member's coaching focus and their mood history say
something about their health, and consent bundled into "I accept the
terms" is not consent to that. The box is **unticked**, and a member who
leaves it unticked still gets an account.

**English**

> ### One more thing, and it's your choice
>
> Some of what Rafiq Pro can hold is about your health. We will not collect
> it unless you say yes here, and you can change your mind at any time.
>
> **What this covers**
> * **Your coaching focus** — the area you want help with, such as stress,
>   sleep, or relationships.
> * **Your mood check-ins** — how you say you are feeling, and when.
>
> **Who sees it:** you, and the pro you choose to work with. Nobody else,
> except our staff when they are handling something you asked us about (see
> our Privacy Policy).
>
> ☐ **I agree that Rafiq Pro may collect and store my coaching focus and my
> mood check-ins.**
>
> You can create an account and work with a pro without ticking this.
> Mood check-ins and focus-based suggestions will be turned off, and you
> can turn them on later in Profile. If you withdraw this consent we delete
> what it collected.
>
> [ Continue ]

**العربية**

> ### أمر أخير، والقرار لكِ
>
> بعض ما يمكن أن يحفظه رفيق يتعلق بصحتك، ولن نجمعه إلا إذا وافقتِ هنا،
> ويمكنك تغيير رأيك في أي وقت.
>
> **ما يشمله ذلك**
> * **مجال التدريب** — الجانب الذي تريدين المساعدة فيه، مثل التوتر أو
>   النوم أو العلاقات.
> * **تسجيلات حالتك المزاجية** — كيف تصفين شعورك، ومتى.
>
> **ومن يراه:** أنتِ، والمحترفة التي تختارين العمل معها. ولا أحد غيرهما،
> إلا فريقنا حين يعالج أمرًا طلبتِه منا (انظري سياسة الخصوصية).
>
> ☐ **أوافق على أن يجمع رفيق مجال تدريبي وتسجيلات حالتي المزاجية ويحفظها.**
>
> ويمكنك إنشاء حساب والعمل مع محترفة دون تحديد هذا المربع؛ وستُعطّل
> تسجيلات الحالة المزاجية والاقتراحات المبنية على مجال التدريب، ويمكنك
> تشغيلها لاحقًا من الملف الشخصي. وإذا سحبتِ هذه الموافقة فسنمحو ما جُمع
> بموجبها.
>
> [ متابعة ]

### Where it goes — screen sketch

```
ClientAuth  ──►  ClientOnboarding  ──►  [ NEW: Health data consent ]  ──►  ClientHome
(Google/Apple)   name, goal, focus       the unticked box above            tab root
                        │                          │
                        │                          └── not ticked: member_profiles.focus
                        │                              stays empty, mood check-in UI hidden
                        └── Today focus is asked HERE, before any consent,
                            which is the gap this closes
```

Two notes on the placement, both from the code rather than a preference:

* **`ClientOnboarding` already asks for the focus** and writes
  `member_profiles.focus` (0006, "a stable slug — 'life', 'meditation', …,
  never display text"). So today the sensitive field is collected one
  screen *before* any consent exists. Either the consent screen comes
  first, or onboarding stops writing `focus` until it is given. The sketch
  takes the second route because onboarding's focus question is what
  Discover's recommendations read, and moving it would change that screen's
  shape; counsel may prefer the first.
* **Mood check-ins are `mood_checkins` (0005)** — an enum of `great`,
  `good`, `okay`, `low`, `hard` with a timestamp, written by the member.
  Withdrawing consent means deleting those rows, which nothing does yet.

**Note for counsel.** Is a mood check-in and a coaching focus "sensitive
personal data" under Law 151/2020, or is it ordinary personal data that
needs no separate step? We have assumed the stricter reading. If it is
sensitive, two further questions: does it need a licence from the Data
Protection Centre, and does the Ireland transfer in clause 9 need its own
consent because of it?

---

## 12 · What the "Verified" badge means — **Proposed**

> **Goes into:** both Terms, and the coach Privacy policy.

**English**

> A **Verified** badge on a pro's page means a person at Rafiq Pro looked
> at the credentials that pro sent us and was satisfied they belong to
> them.
>
> **It does not mean** that we have confirmed a qualification with the body
> that issued it, that we have run a background or criminal-record check,
> that we have watched them coach, or that we recommend them. A pro without
> the badge is not disqualified; they may simply not have asked.
>
> Choosing a pro is your decision. Coaching is not therapy or medical
> advice — see the notice at the end of these Terms.
>
> We can remove a badge at any time, and we will if we find a credential
> was misrepresented.

**العربية**

> ظهور شارة **موثّق** في صفحة محترف يعني أن شخصًا في رفيق راجع بيانات
> الاعتماد التي أرسلها المحترف واطمأن إلى أنها تخصه.
>
> **ولا يعني ذلك** أننا تحققنا من المؤهل لدى الجهة التي أصدرته، ولا أننا
> أجرينا أي تحقق من السجل الجنائي أو الخلفية، ولا أننا شاهدناه وهو يدرّب،
> ولا أننا نرشّحه. والمحترف الذي لا تظهر عليه الشارة ليس مستبعدًا، فقد لا
> يكون طلبها.
>
> واختيار المحترف قرارك أنت. والتدريب ليس علاجًا نفسيًا ولا مشورة طبية —
> انظر التنبيه في نهاية هذه الشروط.
>
> ويمكننا إزالة الشارة في أي وقت، وسنزيلها إذا تبيّن لنا أن بيانات اعتماد
> قُدّمت على غير حقيقتها.

**What the app actually does — and it is less than the clause implies.** A
coach taps "Tap to request verification"; the app inserts a
`verification_requests` row with an **empty `note`** and uploads nothing. A
0005 trigger flips `coach_profiles.verification_status` to `pending`, and
the admin tool shows the queue. **There is no mechanism for a coach to send
a credential at all**, so "the credentials that pro sent us" describes a
route that does not exist.

This is the same open question as item 2 in `store/LAWYER-PACKAGE.md` §3
and the `⬚` in `store/coach-invite.md`: nobody has decided how a
certificate reaches Rafiq. **The clause should not go live before that is
built**, because a badge that claims a review nobody performed is the kind
of statement a regulator and a store both care about.

**Note for counsel.** Given the app collects no documents today, is the
safer course to publish no badge until it does? And does the disclaimer
above actually limit Rafiq's liability for a member harmed by a pro it
marked Verified, or is that unenforceable under Egyptian law whatever it
says?

---

## 13 · Changes to these terms — **Proposed**

> **Goes into:** both Terms, §6 *Changes*, **replacing it**.

**English**

> We may change these Terms. When a change matters to you — a change to
> what you pay, to what we collect, to how we use it, or to your rights
> here — we will tell you **in the app before it takes effect**, and the
> notice will say when that is. Smaller corrections take effect when we
> publish them, and the date at the top of this page always says when it
> last changed.
>
> If you keep using Rafiq Pro after a change takes effect, that change
> applies to you. If you do not accept it, you can delete your account from
> Profile → Delete account.
>
> **A new use of your data is different.** If we want to use what we
> already hold for something this policy does not cover, we will ask you
> again, and we will not start until you say yes. Carrying on using the app
> is not an answer to that question.

**العربية**

> قد نعدّل هذه الشروط. وعندما يكون التعديل مؤثرًا عليك — في ما تدفعه، أو
> في ما نجمعه، أو في كيفية استخدامه، أو في حقوقك هنا — فسنبلغك **داخل
> التطبيق قبل أن يصبح ساريًا**، ويبيّن الإشعار موعد السريان. أما
> التصحيحات الطفيفة فتسري عند نشرها، والتاريخ في أعلى هذه الصفحة يوضح دائمًا
> موعد آخر تعديل.
>
> واستمرارك في استخدام رفيق بعد سريان التعديل يعني أنه يسري عليك. وإن لم
> تقبله، فيمكنك حذف حسابك من: الملف الشخصي ← حذف الحساب.
>
> **أما الاستخدام الجديد لبياناتك فأمر مختلف.** إذا أردنا استخدام ما نحفظه
> بالفعل في غرض لا تشمله هذه السياسة، فسنسألك مرة أخرى، ولن نبدأ قبل
> موافقتك. والاستمرار في استخدام التطبيق ليس جوابًا على ذلك السؤال.

**What the app actually does.** Nothing. There is no mechanism to announce
anything in the app ahead of time: the notification feed carries
relationship events, not announcements, and push notifications are not on
main. So the first sentence is a **commitment to build something**, not a
description. If counsel approves the clause, an in-app notice becomes a
launch dependency rather than a nicety — and the honest alternative, if it
is not built, is to promise email instead, because the policy pages'
"last updated" date on its own is not notice.

---

## 14 · The physical coaching agreement — **Proposed, and a question**

> **Goes into:** `AGREEMENT_TEXT`'s `physical` entry,
> `src/lib/mockStore.ts`.

The current text, which Ahmed's review flagged:

> *Current `agreementPhysicalBody`:* "I confirm I am physically fit to take
> part in this activity and have disclosed any relevant medical conditions
> to my pro. I understand it carries inherent physical risk, and **I
> release my pro from liability for injury except in cases of gross
> negligence**. I agree to follow all safety instructions given during
> sessions."

**Ahmed's note, for counsel to confirm or correct:** under Civil Code
art. 217 an agreement releasing a party from liability for an unlawful act
is likely void, which would make the release either unenforceable or — if a
court reads it as an attempt to exclude liability for harm — a reason to
doubt the clause around it. The rewrite therefore drops the release and
keeps the two things that are both lawful and actually useful: the member
acknowledges the risk, and takes on a duty to disclose.

**English — Proposed replacement**

> **Physical activity, risk, and what you tell your pro**
>
> I understand that this activity is physical and carries risk of injury
> that cannot be removed, however carefully it is run.
>
> I confirm that I have told my pro about any medical condition, injury,
> medication, pregnancy, or limitation that could affect my safety in these
> sessions, and I will tell them if any of that changes. I understand my
> pro plans sessions on what I have told them, and cannot account for what
> I have not.
>
> I agree to follow the safety instructions I am given during a session,
> and to stop and tell my pro if I feel unwell or in pain.
>
> I understand this does not affect my pro's own duty to run sessions with
> reasonable care and skill, and does not release them from responsibility
> for their own fault.

**العربية — البديل المقترح**

> **النشاط البدني والمخاطر وما تُبلغينه لمحترفتك**
>
> أفهم أن هذا النشاط بدني، وأنه يحمل مخاطر إصابة لا يمكن إلغاؤها كليًا،
> مهما بلغت العناية في تنظيمه.
>
> وأقرّ بأنني أبلغت محترفتي بأي حالة طبية أو إصابة أو دواء أو حمل أو قيد
> قد يؤثر في سلامتي في هذه الجلسات، وبأنني سأبلغها إذا تغيّر أي من ذلك.
> وأفهم أن محترفتي تخطط للجلسات بناءً على ما أبلغتها به، ولا يمكنها أن
> تحسب ما لم أبلغها به.
>
> وأتعهد باتباع تعليمات السلامة التي تُعطى لي أثناء الجلسة، وبأن أتوقف
> وأخبر محترفتي إذا شعرت بتوعّك أو بألم.
>
> وأفهم أن هذا لا يمس واجب محترفتي في إدارة الجلسات بعناية ومهارة
> معقولتين، ولا يعفيها من المسؤولية عن خطئها.

**Note for counsel.** Three questions. Is the art. 217 reading right, and
does it make the current release void or merely narrow? Is the final
paragraph — stating what the agreement does *not* do — a help or a
hindrance in an Egyptian court? And is a duty to disclose enforceable
against a member, or does it need something more than an acknowledgement
to have effect?

**And read it knowing nobody has signed it.** The agreement card renders
only behind `!remote` (`ClientProfile.tsx:298`), which is the signed-out
demo, and nothing in `src/`, `admin/` or `supabase/functions/` reads or
writes the `agreements` table that 0005 created for it. Issue #143.

---

## 15 · A coach's public page — **Proposed**

> **Goes into:** the Coach Privacy policy, after what members can see
> of a coach. Added with #156 (0026) and #160 (the switch in the app).

**English**

> **Your public page, if you turn it on.** You can turn on a public page
> in the app (Profile → Share). It stays off until you do. Anyone with
> its link can then see your name, title, bio, languages, years of
> experience, how you meet members, your credentials, whether your
> account is verified, your lowest price and your rating. It never shows
> your email, your phone number, your photo or anything about your
> members. We ask search engines not to list it. You can turn it off in
> the app at any time, and the page stops showing within a minute.
> Turning it on again uses the same link.

**العربية**

> **صفحتك العامة، إذا فعّلتها.** يمكنك تفعيل صفحة عامة من التطبيق
> (الملف الشخصي ← مشاركة)، وتبقى متوقفة حتى تفعّلها. وعندها يستطيع أي
> شخص لديه رابطها أن يرى اسمك ومسمّاك المهني ونبذتك ولغاتك وسنوات
> خبرتك وطريقة لقائك بالأعضاء وشهاداتك وما إذا كان حسابك موثَّقًا وأقل
> أسعارك وتقييمك. ولا تُظهر أبدًا بريدك الإلكتروني أو رقم هاتفك أو صورتك
> أو أي شيء عن أعضائك. ونطلب من محركات البحث ألّا تُدرجها. ويمكنك إيقافها
> من التطبيق في أي وقت، فتتوقف الصفحة عن الظهور خلال دقيقة. وإذا فعّلتها
> مجددًا فستستخدم الرابط نفسه.

**What the app actually does**, exactly: the page shows what
`public_coach_page()` (0026) returns and nothing else: `full_name`,
`title`, `bio`, `languages`, `experience_years`, `session_mode`,
`certifications`, `verified`, the lowest active offering's price, and
the rating count and average. It answers only while `public_page` is on,
and never for an unlisted coach (0022) or an account that isn't active.
The page is sent with `noindex` and cached for at most 60 seconds, which
is why the clause says "within a minute" and not "immediately". No photo:
the avatars bucket stays signed-in only.

**Not live yet.** The page needs rafiqpro.com to be hosted. Until then
the app offers no link, so this clause describes nothing a coach can do
today, and it should go into the policy in the same release that hosts
the site.

**Note for counsel.** Whether a coach's opt-in in the app is consent
enough to publish their name and prices on the open web, or whether the
Coach Terms also need a line letting us publish what they choose to
show.

---

## What we are not asking counsel to do

Same boundary as `store/LAWYER-PACKAGE.md` §4, repeated because this file
will likely be read on its own:

- **Fill in the placeholders.** Those are Ahmed's facts, except the four
  marked "Counsel" in the table at the top.
- **Decide the commercial terms.** The commission, the payout schedule and
  the plan prices are business decisions; we are asking whether the way
  they are written is lawful and enforceable.
- **Review the store forms** (`store/app-privacy.md`,
  `store/play-console.md`). Those are declarations to Apple and Google, and
  q13 in the lawyer package is ours to answer, not a legal question.
- **Write the Arabic.** It is written. We are asking whether it says, in
  enforceable Arabic, what the English says — and under clause 4 the Arabic
  is the version that governs, so that reading matters more than the
  English one.
