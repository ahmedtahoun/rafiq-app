import { useState } from 'react';
import { useAppStore } from '../store/appStore';
import { useT } from '../lib/i18n';
import { useFormat } from '../lib/format';
import { darken } from '../lib/color';
import { CheckIcon, StarIcon } from '../components/icons';
import {
  getCoachProfile, getSelectedOfferingId, getUnreviewedMilestones, getOfferingTypeInfo,
  getRatings, setRating, getMemberSessions, getRecapForMember, markMilestoneReviewed,
  getOffering,
} from '../lib/mockStore';
import './RateCoach.css';

const CLIENT_ID = 'sara';
const ACCENT_HEX = '#B75C3D';
const STARS = [1, 2, 3, 4, 5];

export default function RateCoach() {
  const t = useT();
  const fmt = useFormat();
  const lang = useAppStore((s) => s.lang);
  const setLang = useAppStore((s) => s.setLang);
  const nav = useAppStore((s) => s.nav);
  const back = useAppStore((s) => s.back);
  // Set when ClientSchedule's per-row Rate button sent us here.
  const requestedSessionId = useAppStore((s) => s.params).sessionId ?? '';
  const isAr = lang === 'ar';

  const [rating, setRatingValue] = useState(0);
  const [comment, setComment] = useState('');
  const [submitted, setSubmitted] = useState(false);

  const coachName = getCoachProfile().name || 'Yasmin El-Sayed';
  const coachInitials = coachName.trim().split(/\s+/).map((w) => w[0]).join('').toUpperCase().slice(0, 2);
  const avatarGrad = `linear-gradient(135deg, var(--accent) 0%, ${darken(ACCENT_HEX, 35)} 100%)`;

  // Two ways in. ClientHome's milestone card hands over an offeringId via
  // the same selected-offering channel every offering-scoped screen uses —
  // but only treat it as a milestone rating when that offering is CURRENTLY
  // an unreviewed milestone. A stale pointer left over from browsing
  // Offerings or ProgramDetail falls through to the session path instead of
  // rating a program the member never finished.
  const offeringId = getSelectedOfferingId();
  const milestone = !requestedSessionId && offeringId
    ? getUnreviewedMilestones(CLIENT_ID).find((m) => m.offeringId === offeringId) ?? null
    : null;
  const isMilestone = !!milestone;

  // Otherwise a session. ClientSchedule names the row that was tapped;
  // without one (the milestone card, or a deep link) fall back to the most
  // recent session that has no rating yet.
  const ratings = getRatings(CLIENT_ID);
  const sessions = getMemberSessions(CLIENT_ID);
  const targetSession = (requestedSessionId
    ? sessions.find((s) => s.id === requestedSessionId)
    : sessions.find((s) => !ratings[s.id])) ?? null;

  // A milestone rating has no real session behind it — nothing attributes a
  // session to an offering — so it is keyed by the offering instead.
  const targetId = isMilestone && milestone ? `milestone-${milestone.offeringId}` : targetSession?.id ?? null;

  const milestoneOffering = isMilestone && milestone ? getOffering(milestone.offeringId) : undefined;
  const milestoneTypeLabel = milestoneOffering ? t(getOfferingTypeInfo(milestoneOffering.type).labelKey) : '';

  const recap = targetSession ? getRecapForMember(CLIENT_ID, targetSession.id).trim() : '';
  const subheading = isMilestone
    ? milestoneTypeLabel
    : targetSession ? (recap ? `${recap} · ${fmt.date(targetSession.atMs)}` : fmt.date(targetSession.atMs)) : '';

  const title = isMilestone ? t('rateCoachMilestoneTitle') : t('rateCoachTitle');
  const heading = isMilestone && milestone
    ? t('rateCoachMilestoneHeading', { program: milestone.offering.name })
    : t('rateCoachHeading', { coach: coachName });

  const canSubmit = rating > 0 && targetId !== null;

  function submit() {
    if (!canSubmit || !targetId) return;
    setRating(CLIENT_ID, targetId, rating, comment);
    // A real rating counts as reviewing the milestone, so ClientHome's card
    // doesn't keep resurfacing something the member just answered.
    if (isMilestone && milestone) markMilestoneReviewed(CLIENT_ID, milestone.offeringId);
    setSubmitted(true);
  }

  function header() {
    return (
      <div className="rate-coach-top">
        <button type="button" className="rate-coach-cancel" onClick={back}>{t('rateCoachCancel')}</button>
        <div className="rate-coach-title">{title}</div>
        <button
          type="button"
          className="rate-coach-lang"
          aria-label={t('switchLanguage')}
          onClick={() => setLang(isAr ? 'en' : 'ar')}
        >
          {isAr ? 'EN' : 'ع'}
        </button>
      </div>
    );
  }

  if (submitted) {
    return (
      <div className="phone-frame rate-coach-screen">
        {header()}
        <div className="rate-coach-done">
          <span className="rate-coach-tick">
            <CheckIcon size={28} color="var(--green)" />
          </span>
          <h1 className="rate-coach-done-title">{t('rateCoachThanksTitle')}</h1>
          <p className="rate-coach-done-body">{t('rateCoachThanksBody', { coach: coachName })}</p>
          <button type="button" className="rate-coach-submit" onClick={() => nav('clientSchedule')}>
            {t('rateCoachDone')}
          </button>
        </div>
      </div>
    );
  }

  // Everything already rated and no milestone waiting. The design assumed
  // there was always something to rate; submitting with no target would
  // write a rating keyed to nothing.
  if (!targetId) {
    return (
      <div className="phone-frame rate-coach-screen">
        {header()}
        <div className="rate-coach-done">
          <span className="rate-coach-tick">
            <StarIcon size={26} color="var(--amber)" />
          </span>
          <h1 className="rate-coach-done-title">{t('rateCoachNothingTitle')}</h1>
          <p className="rate-coach-done-body">{t('rateCoachNothingBody')}</p>
          <button type="button" className="rate-coach-submit" onClick={() => nav('clientSchedule')}>
            {t('rateCoachDone')}
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="phone-frame rate-coach-screen">
      {header()}

      <div className="rate-coach-scroll">
        <div className="rate-coach-identity">
          <span className="rate-coach-avatar" style={{ background: avatarGrad }}>{coachInitials}</span>
          <h1 className="rate-coach-heading">{heading}</h1>
          {subheading && <div className="rate-coach-sub"><bdi>{subheading}</bdi></div>}
        </div>

        <div className="rate-coach-stars" role="group" aria-label={title}>
          {STARS.map((n) => (
            <button
              key={n}
              type="button"
              className={`rate-coach-star${n === rating ? ' rate-coach-star-pop' : ''}`}
              aria-label={t('rateCoachStarLabel', { n })}
              aria-pressed={n <= rating}
              onClick={() => setRatingValue(n)}
            >
              <StarIcon size={34} color={n <= rating ? 'var(--amber)' : 'var(--ink-soft)'} filled={n <= rating} />
            </button>
          ))}
        </div>

        <div className="rate-coach-field">
          <label className="rate-coach-label" htmlFor="rate-coach-comment">
            {t('rateCoachCommentLabel')}
          </label>
          <textarea
            id="rate-coach-comment"
            className="rate-coach-textarea"
            rows={4}
            value={comment}
            placeholder={t('rateCoachCommentPlaceholder')}
            onChange={(e) => setComment(e.target.value)}
          />
        </div>
      </div>

      <div className="rate-coach-bar">
        <button type="button" className="rate-coach-submit" disabled={!canSubmit} onClick={submit}>
          {t('rateCoachSubmit')}
        </button>
      </div>
    </div>
  );
}
