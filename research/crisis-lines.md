# Crisis lines — candidates for Ahmed to dial

`src/lib/crisisResources.ts` carries five rows and every `phone` is `null`,
which `LAUNCH-CHECKLIST.md` §8 calls a 🔴 blocker. The file's own comment
sets the rule: *a wrong number there is worse than no number*, so nothing
is written into code that has not been dialled.

This document is the half of that job that can be done without a phone:
candidates, what the sources claim about each, how confident the claim is,
and what to ask when the call connects. **Nothing here is a verified fact.**
It is desk research done on 2026-10-05 from a sandbox whose egress proxy
blocks most of the primary sources (`befrienders.org`, `sis.gov.eg`,
`unodc.org`, `who.int` all refused), so every line below rests on news
reports and aggregator pages, not on the organisation's own website.

Dial each one, then edit `crisisResources.ts` yourself — it is in
`src/lib/`, which this branch does not touch.

---

## The quick version

| Row id | Candidate | Confidence | What to do |
|---|---|---|---|
| `emergency` | **123** (ambulance) — or **112** | high | Dial, decide which to show |
| `mentalHealth` | **16328** | medium-high | Dial |
| `befrienders` | 7621602 / 7621603 / 7622381 | **very low — probably dead** | Dial once, then delete the row |
| `women` | **15115** | high | Dial |
| `child` | **16000** | high | Dial |

---

## 1. `emergency` — "Emergency services (Egypt)"

**Candidates.** Egypt runs both the old service-specific numbers and a
unified line launched in October 2022:

- **112** — unified emergency number, routes to whichever service is needed
  and locates the caller automatically.
- **123** — ambulance
- **122** — police
- **180** — fire

**A decision, not just a dial.** The row holds one `phone`, and its
`forKey` already says "Ambulance, police, fire — immediate danger", which
describes 112 rather than any single service. Two options:

- **112**, matching the copy as written. Newer, and a caller in a panic
  does not have to choose. Dial it to confirm it answers nationwide and
  not only in the governorates where it rolled out first — that is the
  thing most worth checking.
- **123** (ambulance), which is the number Egyptians have used for decades
  and is the one that matters for a medical or self-harm emergency. If you
  pick this, change `crisisEmergencyFor` so it stops promising police and
  fire.

If 112 does not answer reliably outside Cairo, use 123 and reword.

**Sources.** [Egyptian Streets, Nov 2022 — Egypt announces 112](https://egyptianstreets.com/2022/11/01/112-egypt-announces-its-very-own-911-hotline-for-public-emergencies/) ·
[Orange Egypt — emergency numbers](https://www.orange.eg/en/help/emergency-numbers) ·
[Wikipedia — list of emergency telephone numbers](https://en.wikipedia.org/wiki/List_of_emergency_telephone_numbers)

## 2. `mentalHealth` — "General Secretariat of Mental Health and Addiction Treatment"

**Candidate: 16328.** Reported as the Ministry of Health's mental health
hotline, free and around the clock. Reporting from Q1 2026 cites 8,808
calls including 252 emergency cases, which at least says the line was
alive this year. An alternative landline, **02 2081 6831**, also appears,
and there is a web service at `mentalhealth.mohp.gov.eg`.

**Watch for.** The row's name covers *both* mental health and addiction,
but those are two different bodies in Egypt: the General Secretariat
(Ministry of Health) runs 16328, while addiction treatment sits with the
Fund for Drug Control and Treatment of Addiction (Ministry of Social
Solidarity) on **16023** — reported as free, confidential, and used by
130,601 patients in the first ten months of 2025.

So the honest shape is probably **two rows, not one**: 16328 for mental
health, 16023 for addiction. If you would rather keep one row, dial both
and keep whichever actually helps a person in distress, then fix the name
so it does not promise the other.

**Sources.** [EgyptToday — psychological support hotlines](https://www.egypttoday.com/Article/1/83220/Egypt-allocates-2-hotlines-for-psychological-support-during-Covid-19) ·
[Daily News Egypt, Aug 2024 — addiction hotline](https://www.dailynewsegypt.com/2024/08/12/egypts-addiction-hotline-sees-surge-in-calls-hashish-most-common-drug/) ·
[Ahram Online — Drug Control Fund](https://english.ahram.org.eg/News/525010.aspx) ·
[UNHCR Egypt — mental health services](https://help.unhcr.org/egypt/en/health-services/mental-health/)

## 3. `befrienders` — "Befrienders Cairo" — **recommend deleting this row**

**Candidates, and why they look wrong.** Aggregator sites list 762 1602,
762 1603 and 762 2381. Those are **seven digits**. Cairo landlines went to
eight digits years ago, so these are pre-change numbers that have been
copied from list to list without anyone dialling them. Every page carrying
them is a directory of international hotlines, not Befrienders' own site,
and `befrienders.org`'s country directory is blocked from here so I could
not check whether Cairo is still a member centre.

**What to do.** Try `+20 2 762 2381` once — prefixing the Cairo code and
the missing digit sometimes recovers these. If it does not connect, delete
the row. An entry promising "emotional support, and suicide prevention"
that rings out is the exact failure the file's comment warns about, and
16328 already covers the need.

If you want a suicide-prevention line specifically, ask the 16328 operator
what they refer callers to — that is a better source than any of these
pages.

**Sources.** [TherapyRoute — international helplines](https://www.therapyroute.com/article/helplines-suicide-hotlines-and-crisis-lines-from-around-the-world) ·
[Suicide.org — Egypt](http://www.suicide.org/hotlines/international/egypt-suicide-hotlines.html) — both aggregators, both undated.

## 4. `women` — "National Council for Women — complaints office"

**Candidate: 15115.** Consistently reported as the NCW Women's Complaints
Office line, 24 hours, staffed by legal, social and psychological
specialists, with 27 branches behind it. There is also a WhatsApp number,
**0100 752 5600**, which may be worth a second row given how people
actually ask for help about this.

The best source here is an interview with the head of the complaints
office published by UNODC, which is a step closer to primary than the rest
of this document.

**Sources.** [UNODC ROMENA — interview with the head of the NCW Complaints Office](https://www.unodc.org/romena/en/Stories/2020/December/egypt_-on-the-other-side-of-the-hotline---interview-with-the-head-of-complaints-office-at-the-national-council-for-women-ncw.html) ·
[EgyptToday — how to contact the Women's Complaints Office](https://www.egypttoday.com/Article/1/145848/Legal-support-and-protection-from-violence-How-to-contact-the) ·
[Ahram Online — NCW reporting channels](https://english.ahram.org.eg/NewsContentP/1/465675/Egypt/National-Council-for-Women-promotes-resources-to-r.aspx)

## 5. `child` — "National Council for Childhood and Motherhood — child helpline"

**Candidate: 16000.** The best-attested of the five. Described as 24/7 and
multi-channel (phone, WhatsApp, web chat), and NCCM published call volumes
— 66,645 calls in January and February 2025 alone. Child Helpline
International lists it, and the EU's Better Internet for Kids programme
names NCCM as its Egyptian partner running it.

**Sources.** [Child Helpline International — Egypt](https://childhelplineinternational.org/egypt-child-helpline-egypt/) ·
[Better Internet for Kids — Egypt / NCCM](https://better-internet-for-kids.europa.eu/en/sic/egypt) ·
[Daily News Egypt, Mar 2025 — call volumes](https://www.dailynewsegypt.com/2025/03/19/egypts-child-helpline-receives-over-66000-calls-in-2-months/)

---

## What to ask when it answers

Four things, from the file's own comment, plus one:

1. **Is this still the right number for <organisation>?** Say the name back
   to them. A re-assigned short code is the dangerous case.
2. **What are your hours?** "24/7" from a news article is not the same as
   24/7 from the person answering at 11pm.
3. **Arabic, English, or both?** The app is bilingual and an English
   speaker in distress who reaches an Arabic-only line is stuck.
4. **Is it free, and does it work from a mobile?** Short codes sometimes
   do not, or are chargeable from some networks.
5. **Do you take calls from outside Egypt?** Short codes usually do not,
   which matters because `crisisOutsideEgypt` is the only thing a member
   abroad gets.

Call each one twice if you can — once in working hours, once late — and
note the difference rather than averaging it.

## Recording the result

The edit is in `src/lib/crisisResources.ts` and `src/lib/i18n.ts`, both
yours. Three things change per row:

```ts
{ id: 'child', nameKey: 'crisisChildName', forKey: 'crisisChildFor',
  phone: '16000', hoursKey: 'crisisHours24' },
```

`hoursKey` renders a line under the number when set and nothing when null
(`src/components/CrisisResources.tsx:29`), so a confirmed 24/7 line still
wants a key — it is reassuring at 3am. No `crisisHours*` key exists yet;
these two are drafted for whichever rows turn out to be round the clock:

```ts
crisisHours24: 'Around the clock, every day',      // en
crisisHours24: 'على مدار الساعة، طوال الأيام',      // ar
```

Add more as the calls dictate — a line that answers 9am to 9pm needs its
own pair, and the Arabic should be written rather than translated.

**There is no field for language.** If you want the app to say a line is
Arabic-only, either fold it into the hours string or add a field to
`CrisisResource`; the second is cleaner and is a small change.

### What flips automatically

- `crisisNumbersConfirmed()` returns true once every row has a number.
  Nothing reads it yet — it exists so a pre-submission check can.
- `tests/not-therapy.spec.js` asserts that a row without a number still
  renders "Number not confirmed yet" and never a digit the data does not
  carry, so it keeps passing as rows fill in, and fails if a number is
  rendered that is not in the data.
- `tests/public-site.spec.js` checks the same rows appear on the public
  terms page.

**One trap in that test.** Its second half sweeps the whole `.crisis`
block for anything that reads as a phone number and is not in the data —
the regex is `/\+?\d[\d\s-]{3,}/g`, so four or more digits in a row.
An hours string written with Western digits ("0900 - 2100") will trip it
and the suite will fail on copy, not on a bug. Write the hours in words,
as the drafts above do.

Deleting a row is safe: an empty list renders the "contact your local
emergency services" line and nothing else, which is honest.
