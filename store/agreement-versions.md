# Coaching agreement: every version a member can sign

A signature (migration 0028, issue #143) stores the **SHA-256 of the exact
text the member was shown**: the title, a blank line, then the body
(`agreementTextSha256` in `src/lib/agreementData.ts`). It doesn't store the
text itself. So a signature can only be proven against a text we still
have. This file keeps every version of the agreement, word for word, with
its hash.

**Never edit or remove a version here.** A member may have signed it.

`tests/agreement-versions.spec.js` checks three things:
- the hash of every agreement the app shows today (physical, emotional and
  general, each in English and Arabic) is listed below;
- each text below still hashes to the hash beside it;
- and no version listed in the test's `ARCHIVED` has gone missing.

## When you change the agreement copy

The test fails until the new text is archived. To archive it:
1. Add a section for each changed agreement and language, as the next
   version (`v2`, …), with today's date and the new title and body exactly
   as in `src/lib/i18n.ts`. The failing test prints the new hash.
2. Add that hash to `ARCHIVED` in the test.
3. Keep the old sections as they are.

An English edit leaves the Arabic version alone, and the other way round.
Each one is its own text and has its own hash.

Nothing was signed for real before 0028 is pushed, so v1 is the first
version anyone can sign. "In the app since" is the day the text went into
`src/lib/i18n.ts`.

---

### physical · en · v1

- **SHA-256:** `f37878aa37dab8549ba58e5f9771ff9eb21d738c10cf9d7ba6b096ccd6be917a`
- **In the app since:** 2026-10-05 (commit 2e2a5ad)

```text
Assumption of Risk & Safety Waiver

I confirm I am physically fit to take part in this activity and have disclosed any relevant medical conditions to my pro. I understand it carries inherent physical risk, and I release my pro from liability for injury except in cases of gross negligence. I agree to follow all safety instructions given during sessions.
```

### physical · ar · v1

- **SHA-256:** `099e023b8053a557aa4e29c0ebb863e4e50725e7f84d6eaa7a4243e63898d86b`
- **In the app since:** 2026-10-05 (commit 2e2a5ad)

```text
إقرار بتحمّل المخاطر وإخلاء المسؤولية عن السلامة

أُقرّ بأن حالتي البدنية تسمح لي بالمشاركة في هذا النشاط، وبأنني أبلغت محترفي بأي حالة طبية ذات صلة. وأعلم أن هذا النشاط يحمل في طبيعته مخاطر بدنية، وأُعفي محترفي من المسؤولية عن أي إصابة، إلا في حالات الإهمال الجسيم. وأتعهد باتباع جميع تعليمات السلامة التي تُعطى أثناء الجلسات.
```

### emotional · en · v1

- **SHA-256:** `1e3eed7478b6d5dc26133ae89986602d6c1e61721517725d6e8cb6eac5e81f4a`
- **In the app since:** 2026-10-05 (commit 2e2a5ad)

```text
Coaching Agreement & Scope of Practice

I understand coaching is not a substitute for therapy, medical care, or mental health treatment, and my pro does not diagnose or treat any condition. Sessions are confidential except where disclosure is required by law. I understand the cancellation policy and agree to communicate openly with my pro about my goals.
```

### emotional · ar · v1

- **SHA-256:** `233ea3f7146984c4b7965fdbf0a51a98a6f705720dd6e10f9455e65f7db2c43a`
- **In the app since:** 2026-10-05 (commit 2e2a5ad)

```text
اتفاق التدريب ونطاق الممارسة

أعلم أن التدريب ليس بديلًا عن العلاج النفسي أو الرعاية الطبية أو علاج الصحة النفسية، وأن محترفي لا يُشخّص أي حالة ولا يعالجها. والجلسات سرية إلا حيث يقضي القانون بالإفصاح. وأعلم سياسة الإلغاء، وأتعهد بالتواصل بصراحة مع محترفي بشأن أهدافي.
```

### general · en · v1

- **SHA-256:** `70daddaaf2f43f8863f80fbd515bf476ed6d418a4b737a2cafbb3cc9bf7a9320`
- **In the app since:** 2026-10-05 (commit 2e2a5ad)

```text
Coaching Service Agreement

I agree to attend scheduled sessions and give advance notice of any changes. I understand session packages are non-transferable, and my pro will keep our discussions confidential. This agreement can be updated at any time by mutual consent.
```

### general · ar · v1

- **SHA-256:** `a676993a0e905571c173e33a954587180ac37a5120823f184d6fc4354166615e`
- **In the app since:** 2026-10-05 (commit 2e2a5ad)

```text
اتفاق خدمة التدريب

أتعهد بحضور الجلسات المحددة وبالإبلاغ مسبقًا عن أي تغيير. وأعلم أن حِزم الجلسات غير قابلة للتحويل إلى شخص آخر، وأن محترفي سيحافظ على سرية ما نتناوله. ويمكن تعديل هذا الاتفاق في أي وقت بموافقة الطرفين.
```
