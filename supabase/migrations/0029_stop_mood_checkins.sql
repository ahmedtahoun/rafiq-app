-- 0029 — Stop collecting mood check-ins, and delete the ones we have.
--
-- A mood check-in ("how are you feeling: great … hard") is data about a
-- member's mental health. Law 151/2020 makes health data sensitive: art. 12
-- requires a licence from the Personal Data Protection Centre and the
-- member's written, explicit consent before it is processed, and processing
-- it without a licence is the law's heaviest offence. No coach screen ever
-- showed a check-in, so the app was carrying that exposure for a feature
-- nobody used. Data we do not hold needs no licence.
--
-- The table stays, empty, so the account-deletion function (0012) and a
-- member's data export keep working unchanged; nobody can write to it.

drop policy if exists mood_checkins_insert_member on public.mood_checkins;
revoke insert, update on public.mood_checkins from authenticated;

delete from public.mood_checkins;

-- The coaching focus a member picks at signup: 'stress' was the one option
-- that reads as a statement about their mental health, and the app no
-- longer offers it. Members who chose it keep an empty focus, which the
-- app already treats as "no focus chosen".
update public.member_profiles set focus = '' where focus = 'stress';
