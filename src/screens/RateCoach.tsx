import { useState } from 'react';
import { useAppStore } from '../store/appStore';
import { useT, isolate, type MessageKey } from '../lib/i18n';
import { useFormat } from '../lib/format';
import { darken } from '../lib/color';
import { CheckIcon, StarIcon } from '../components/icons';
import { LoadState } from '../components/LoadState';
import { useRemoteSession } from '../lib/remoteSession';
import { fetchSessionToRate, rateSession, type SessionToRate } from '../lib/ratingData';
import { useMemberSpace, type MemberRelationshipView } from '../store/memberStore';
import { useRemoteLoad } from '../store/remoteLoad';
import {
  DEMO_MEMBER_CLIENT_ID,
  getCoachProfile, getSelectedOfferingId, getUnreviewedMilestones, getOfferingTypeInfo,
  getRatings, setRating, getMemberSessions, getRecapForMember, markMilestoneReviewed,
  getOffering,
} from '../lib/mockStore';
import './RateCoach.css';

// Signed out, the demo member's. Signed in, a session of the member's own
// with the coach they're viewing, named by params.sessionId (their Sessions
// screen's Rate button), written to `ratings` (SUPABASE-MIGRATION-PLAN.md
// step 6).
const CLIENT_ID = DEMO_MEMBER_CLIENT_ID;
const ACCENT_HEX = '#B75C3D';
const STARS = [1, 2, 3, 4, 5];

export default function RateCoach() {
  const remote = useRemoteSession();
  const space = useMemberSpace();
  if (!remote) return <DemoRateCoach />;
  if (space.status === 'loading') return <LoadState status="loading" />;
  if (space.status === 'error') return <LoadState status="error" onRetry={space.retry} showBack />;
  if (!space.remote) return <DemoRateCoach />;
  return <LiveRateCoach key={space.current?.clientId ?? 'none'} rel={space.current} />;
}

function DemoRateCoach() {
  const t = useT();
  const fmt = useFormat();
  // Set when ClientSchedule's per-row Rate button sent us here.
  const requestedSessionId = useAppStore((s) => s.params).sessionId ?? '';

  const coachName = getCoachProfile().name || 'Yasmin El-Sayed';

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
    ? t('rateCoachMilestoneHeading', { program: isolate(milestone.offering.name) })
    : t('rateCoachHeading', { coach: coachName });

  // Everything already rated and no milestone waiting. The design assumed
  // there was always something to rate; submitting with no target would
  // write a rating keyed to nothing.
  if (!targetId) return <RateNothing title={title} />;

  return (
    <RateForm
      title={title}
      heading={heading}
      subheading={subheading}
      coachName={coachName}
      submit={(rating, comment) => {
        setRating(CLIENT_ID, targetId, rating, comment);
        // A real rating counts as reviewing the milestone, so ClientHome's card
        // doesn't keep resurfacing something the member just answered.
        if (isMilestone && milestone) markMilestoneReviewed(CLIENT_ID, milestone.offeringId);
        return Promise.resolve(null);
      }}
    />
  );
}

function LiveRateCoach({ rel }: { rel: MemberRelationshipView | null }) {
  const t = useT();
  const fmt = useFormat();
  const sessionId = useAppStore((s) => s.params).sessionId ?? '';
  const coachId = rel?.coach.id ?? null;
  const enabled = !!rel && !!coachId && !!sessionId;
  const load = useRemoteLoad<SessionToRate | null>(`rate-session:${rel?.clientId ?? ''}:${sessionId}`, enabled, () => fetchSessionToRate(rel!.clientId, sessionId));

  const title = t('rateCoachTitle');
  // No session named, no coach to rate, or one that isn't theirs, hasn't
  // happened, or they missed.
  if (!enabled) return <RateNothing title={title} />;
  if (load.status === 'loading') return <LoadState status="loading" />;
  if (load.status === 'error') return <LoadState status="error" onRetry={load.retry} showBack />;
  const target = load.data;
  if (!target) return <RateNothing title={title} />;
  if (target.rated !== null) return <RateNothing title={title} bodyKey="rateCoachAlready" />;

  const coachName = rel!.coach.name;
  const date = fmt.date(target.atWallMs);
  return (
    <RateForm
      title={title}
      heading={t('rateCoachHeading', { coach: isolate(coachName) })}
      // The coach's recap is their own words, in either language: isolated,
      // so the line takes its direction from the date around it.
      subheading={target.recap.trim() ? `${isolate(target.recap.trim())} · ${date}` : date}
      coachName={coachName}
      submit={async (rating, comment) => {
        const result = await rateSession({ clientId: rel!.clientId, coachId: coachId!, sessionId: target.sessionId, rating, comment });
        if (result.ok) return null;
        return result.code === 'already' ? 'rateCoachAlready' : 'rateCoachFailed';
      }}
    />
  );
}

function RateHeader({ title }: { title: string }) {
  const t = useT();
  const back = useAppStore((s) => s.back);
  return (
    <div className="rate-coach-top">
      <button type="button" className="rate-coach-cancel" onClick={back}>{t('rateCoachCancel')}</button>
      <div className="rate-coach-title">{title}</div>
    </div>
  );
}

function RateNothing({ title, bodyKey }: { title: string; bodyKey?: MessageKey }) {
  const t = useT();
  const nav = useAppStore((s) => s.nav);
  return (
    <div className="phone-frame rate-coach-screen">
      <RateHeader title={title} />
      <div className="rate-coach-done">
        <span className="rate-coach-tick">
          <StarIcon size={26} color="var(--amber)" />
        </span>
        <h1 className="rate-coach-done-title">{t('rateCoachNothingTitle')}</h1>
        <p className="rate-coach-done-body">{t(bodyKey ?? 'rateCoachNothingBody')}</p>
        <button type="button" className="rate-coach-submit" onClick={() => nav('clientSchedule')}>
          {t('rateCoachDone')}
        </button>
      </div>
    </div>
  );
}

interface FormProps {
  title: string;
  heading: string;
  subheading: string;
  coachName: string;
  /** Resolves to null once saved, or the message to show if it wasn't. */
  submit: (rating: number, comment: string) => Promise<MessageKey | null>;
}

function RateForm({ title, heading, subheading, coachName, submit: save }: FormProps) {
  const t = useT();
  const nav = useAppStore((s) => s.nav);

  const [rating, setRatingValue] = useState(0);
  const [comment, setComment] = useState('');
  const [submitted, setSubmitted] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<MessageKey | null>(null);

  const coachInitials = coachName.trim().split(/\s+/).map((w) => w[0]).join('').toUpperCase().slice(0, 2);
  const avatarGrad = `linear-gradient(135deg, var(--accent) 0%, ${darken(ACCENT_HEX, 35)} 100%)`;

  const canSubmit = rating > 0 && !saving;

  async function submit() {
    if (!canSubmit) return;
    setSaving(true);
    setError(null);
    const failed = await save(rating, comment);
    setSaving(false);
    if (failed) setError(failed);
    else setSubmitted(true);
  }

  if (submitted) {
    return (
      <div className="phone-frame rate-coach-screen">
        <RateHeader title={title} />
        <div className="rate-coach-done">
          <span className="rate-coach-tick">
            <CheckIcon size={28} color="var(--green)" />
          </span>
          <h1 className="rate-coach-done-title">{t('rateCoachThanksTitle')}</h1>
          <p className="rate-coach-done-body">{t('rateCoachThanksBody', { coach: isolate(coachName) })}</p>
          <button type="button" className="rate-coach-submit" onClick={() => nav('clientSchedule')}>
            {t('rateCoachDone')}
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="phone-frame rate-coach-screen">
      <RateHeader title={title} />

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
        {error && <div className="rate-coach-error" role="alert">{t(error)}</div>}
        <button type="button" className="rate-coach-submit" disabled={!canSubmit} onClick={() => void submit()}>
          {t('rateCoachSubmit')}
        </button>
      </div>
    </div>
  );
}
