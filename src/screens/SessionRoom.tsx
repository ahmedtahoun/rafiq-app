import { useEffect, useRef, useState } from 'react';
import { useAppStore } from '../store/appStore';
import { isolate, useT, type MessageKey } from '../lib/i18n';
import { useFormat } from '../lib/format';
import { useRemoteSession } from '../lib/remoteSession';
import { toWallMs } from '../lib/wallClock';
import { joinSessionVideo, type VideoErrorCode } from '../lib/videoData';
import { createVideoCall, type CallEnd, type CallState, type VideoCall } from '../lib/videoCall';
import { darken } from '../lib/color';
import { ChevronIcon } from '../components/icons';
import {
  canInteract,
  endActiveSession,
  getActiveSession,
  getClient,
  getCoachProfile,
  isRelationshipBlocked,
  startActiveSession,
  type SessionType,
} from '../lib/mockStore';
import './SessionRoom.css';

const ACCENT = '#B75C3D';

function initialsOf(name: string): string {
  return name.trim().split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]?.toUpperCase() ?? '').join('');
}

// 1:1 port of SessionRoom.dc.html — the pre-join and in-session screen.
//
// One screen serves both roles, which is the design's own call: its comment
// says the content is the same shape on both sides here, unlike ClientDetail
// or Messages which get separate files. Role only changes who the other party
// is and where Back goes.
//
// Signed in it is a real call (LiveSessionRoom, below). Signed out it is
// the design's preview: the banner says so, and nothing touches
// getUserMedia — the mic and camera buttons toggle their own icons only.
export default function SessionRoom() {
  const remote = useRemoteSession();
  return remote ? <LiveSessionRoom /> : <DemoSessionRoom />;
}

function DemoSessionRoom() {
  const t = useT();
  const nav = useAppStore((s) => s.nav);
  const back = useAppStore((s) => s.back);
  const role = useAppStore((s) => s.role);
  const clientId = useAppStore((s) => s.params).clientId ?? '';

  const isPro = role === 'coach';
  const client = getClient(clientId);
  const coach = getCoachProfile();

  // Re-read after join/leave: mockStore is plain functions over localStorage,
  // not reactive state, so a counter bump is what makes the screen notice.
  const [sessionTick, setSessionTick] = useState(0);
  const inSession = getActiveSession(clientId).active;
  const [micOn, setMicOn] = useState(true);
  const [cameraOn, setCameraOn] = useState(true);

  if (!client) {
    return (
      <div className="phone-frame session-room">
        <div className="session-room-topbar">
          <button className="session-room-circle" aria-label={t('back')} onClick={back}>
            <ChevronIcon size={15} color="#F2ECE1" />
          </button>
          <div className="session-room-titles"><div className="session-room-type">{t('sessionRoomTitle')}</div></div>
          <span className="session-room-circle-placeholder" />
        </div>
        <p className="session-room-missing">{t('sessionRoomMissingClient')}</p>
      </div>
    );
  }

  const otherName = isPro ? client.name : coach.name || t('appName');
  const otherInitials = isPro ? client.initials || initialsOf(client.name) : initialsOf(coach.name || t('appName'));
  const otherColor = isPro ? client.avatarBg || ACCENT : ACCENT;
  const selfInitials = isPro ? initialsOf(coach.name || t('appName')) : client.initials || initialsOf(client.name);
  const selfColor = isPro ? ACCENT : client.avatarBg || ACCENT;

  const sessionType: SessionType = client.nextSessionType ?? 'standard';
  const sessionTypeLabel = t(`sessionRoomType_${sessionType}`);

  const blocked = !canInteract(clientId);
  const blockedReason = isRelationshipBlocked(clientId)
    ? t('sessionRoomBlockedRelationship')
    : t('sessionRoomBlockedInactive', { name: otherName });

  const grad = (hex: string) => `linear-gradient(135deg, ${hex} 0%, ${darken(hex, 35)} 100%)`;

  function goBack() {
    if (isPro) {
      nav({ screen: 'clientDetail', params: { clientId } });
      return;
    }
    // Where the design sends a member leaving the room.
    nav('clientSchedule');
  }

  function join() {
    if (blocked) return;
    startActiveSession(clientId);
    setSessionTick((n) => n + 1);
  }

  function leave() {
    endActiveSession(clientId);
    setSessionTick((n) => n + 1);
    goBack();
  }

  return (
    <div className="phone-frame session-room" data-tick={sessionTick}>
      <div className="session-room-topbar">
        <button className="session-room-circle" aria-label={t('back')} onClick={goBack}>
          <ChevronIcon size={15} color="#F2ECE1" />
        </button>
        <div className="session-room-titles">
          <div className="session-room-type">{sessionTypeLabel}</div>
          <div className="session-room-other">{otherName}</div>
        </div>
      </div>

      <div className="session-room-banner">
        <WarnGlyph />
        <div>{t('sessionRoomPreviewBanner')}</div>
      </div>

      {!inSession ? (
        <div className="session-room-prejoin">
          <div className="session-room-avatar-lg" style={{ background: grad(otherColor), boxShadow: `0 16px 32px -12px ${otherColor}55` }}>
            {otherInitials}
          </div>
          <div>
            <div className="session-room-ready">{t('sessionRoomReadyTitle')}</div>
            <div className="session-room-ready-sub">
              {t(isPro ? 'sessionRoomReadySubPro' : 'sessionRoomReadySubMember', { name: otherName, type: sessionTypeLabel })}
            </div>
          </div>

          {blocked ? (
            <div className="session-room-blocked" role="alert">{blockedReason}</div>
          ) : (
            <button type="button" className="session-room-join" onClick={join}>
              <CameraGlyph />
              {t('sessionRoomJoin')}
            </button>
          )}
        </div>
      ) : (
        <div className="session-room-live">
          <div className="session-room-live-label">
            <span className="session-room-live-dot" />
            <span>{t('sessionRoomInSession')}</span>
          </div>

          <div className="session-room-stage">
            <div className="session-room-stage-main">
              <div className="session-room-avatar-md" style={{ background: grad(otherColor) }}>{otherInitials}</div>
              <div className="session-room-stage-name">{otherName}</div>
            </div>
            <div className="session-room-self" style={{ background: grad(selfColor) }}>
              {cameraOn ? selfInitials : <CameraOffGlyph />}
            </div>
          </div>

          <div className="session-room-controls">
            <button
              type="button"
              className={`session-room-control${micOn ? '' : ' is-off'}`}
              aria-label={t('sessionRoomToggleMic')}
              aria-pressed={micOn}
              onClick={() => setMicOn((v) => !v)}
            >
              {micOn ? <MicGlyph /> : <MicOffGlyph />}
            </button>
            <button
              type="button"
              className={`session-room-control${cameraOn ? '' : ' is-off'}`}
              aria-label={t('sessionRoomToggleCamera')}
              aria-pressed={cameraOn}
              onClick={() => setCameraOn((v) => !v)}
            >
              {cameraOn ? <CameraGlyph stroke="#F2ECE1" /> : <CameraOffGlyph />}
            </button>
            <button type="button" className="session-room-leave" aria-label={t('sessionRoomLeave')} onClick={leave}>
              <HangUpGlyph />
            </button>
          </div>
          <div className="session-room-leave-hint">{t('sessionRoomLeaveHint')}</div>
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Signed in: the real call (Daily), opened with params.sessionId. The
// `session-video` function decides who may join and when, and that nothing
// is recorded; this screen shows its answer and the two people.
// ---------------------------------------------------------------------------

type LivePhase =
  | { kind: 'ready' }
  | { kind: 'joining' }
  | { kind: 'refused'; code: VideoErrorCode; opensAt?: string }
  | { kind: 'live' }
  | { kind: 'ended'; why: CallEnd };

const REFUSED: Record<VideoErrorCode, MessageKey> = {
  not_configured: 'sessionRoomUnavailable',
  not_found: 'sessionRoomNotFound',
  too_early: 'sessionRoomTooEarly',
  ended: 'sessionRoomEnded',
  cancelled: 'sessionRoomCancelled',
  blocked: 'sessionRoomBlockedRelationship',
  relationship_inactive: 'sessionRoomInactive',
  video_unavailable: 'sessionRoomUnavailable',
  unknown: 'sessionRoomUnavailable',
};

const ENDED: Record<CallEnd, MessageKey> = {
  left: 'sessionRoomEnded',
  ejected: 'sessionRoomTimeUp',
  error: 'sessionRoomDropped',
  devices: 'sessionRoomDevices',
};

/** A refusal worth trying again from here; the rest won't change by retrying. */
const RETRYABLE: VideoErrorCode[] = ['too_early', 'video_unavailable', 'unknown', 'not_configured'];

function LiveSessionRoom() {
  const t = useT();
  const fmt = useFormat();
  const back = useAppStore((s) => s.back);
  const params = useAppStore((s) => s.params);
  const sessionId = params.sessionId ?? '';
  const [phase, setPhase] = useState<LivePhase>({ kind: 'ready' });
  const [otherName, setOtherName] = useState(params.name ?? '');
  const [call, setCall] = useState<CallState | null>(null);
  const [micOn, setMicOn] = useState(true);
  const [cameraOn, setCameraOn] = useState(true);
  const callRef = useRef<VideoCall | null>(null);

  // Leaving the screen any other way (Back, the hardware button) leaves the call.
  useEffect(() => () => { void callRef.current?.leave(); }, []);

  async function join() {
    setPhase({ kind: 'joining' });
    const pass = await joinSessionVideo(sessionId);
    if (!pass.ok) {
      setPhase({ kind: 'refused', code: pass.code, opensAt: pass.opensAt });
      return;
    }
    if (pass.data.otherName) setOtherName(pass.data.otherName);
    const c = createVideoCall();
    callRef.current = c;
    c.onChange(setCall);
    c.onEnd((why) => {
      callRef.current = null;
      setCall(null);
      setPhase({ kind: 'ended', why });
    });
    try {
      await c.join(pass.data.url, pass.data.token);
      setMicOn(true);
      setCameraOn(true);
      setPhase((p) => (p.kind === 'joining' ? { kind: 'live' } : p));
    } catch {
      callRef.current = null;
      setPhase({ kind: 'ended', why: 'error' });
    }
  }

  async function leave() {
    const c = callRef.current;
    callRef.current = null;
    await c?.leave();
    back();
  }

  function toggleMic() {
    const next = !micOn;
    setMicOn(next);
    callRef.current?.setMic(next);
  }
  function toggleCamera() {
    const next = !cameraOn;
    setCameraOn(next);
    callRef.current?.setCamera(next);
  }

  const name = otherName.trim();
  const initials = initialsOf(name) || '•';
  const grad = (hex: string) => `linear-gradient(135deg, ${hex} 0%, ${darken(hex, 35)} 100%)`;

  let message = '';
  if (phase.kind === 'refused') {
    message = phase.code === 'too_early' && phase.opensAt
      ? t('sessionRoomTooEarly', { time: fmt.time(toWallMs(phase.opensAt)) })
      : t(REFUSED[phase.code]);
  } else if (phase.kind === 'ended') {
    message = t(ENDED[phase.why]);
  }
  const canRetry =
    (phase.kind === 'refused' && RETRYABLE.includes(phase.code)) ||
    (phase.kind === 'ended' && (phase.why === 'error' || phase.why === 'devices'));

  return (
    <div className="phone-frame session-room session-room-real">
      <div className="session-room-topbar">
        <button className="session-room-circle" aria-label={t('back')} onClick={() => void leave()}>
          <ChevronIcon size={15} color="#F2ECE1" />
        </button>
        <div className="session-room-titles">
          <div className="session-room-type">{t('sessionRoomTitle')}</div>
          {name && <div className="session-room-other"><bdi>{name}</bdi></div>}
        </div>
        <span className="session-room-circle-placeholder" />
      </div>

      {phase.kind === 'live' ? (
        <div className="session-room-live">
          <div className="session-room-live-label">
            <span className="session-room-live-dot" />
            <span>{t('sessionRoomInSession')}</span>
            <span className="session-room-private">· {t('sessionRoomNoRecording')}</span>
          </div>

          <div className="session-room-stage">
            {call?.other.videoTrack ? (
              <TrackVideo track={call.other.videoTrack} className="session-room-video-other" />
            ) : (
              <div className="session-room-stage-main">
                <div className="session-room-avatar-md" style={{ background: grad(ACCENT) }}>{initials}</div>
                <div className="session-room-stage-name">
                  {call?.other.present ? <bdi>{name}</bdi> : name ? t('sessionRoomWaiting', { name: isolate(name) }) : t('sessionRoomWaitingNoName')}
                </div>
              </div>
            )}
            {call?.other.audioTrack && <TrackAudio track={call.other.audioTrack} />}
            <div className="session-room-self" style={{ background: grad(ACCENT) }}>
              {/* The off icon only when they turned it off: a camera still
                  starting is an empty tile, not a fault. */}
              {!cameraOn ? (
                <CameraOffGlyph />
              ) : call?.self.videoTrack ? (
                <TrackVideo track={call.self.videoTrack} className="session-room-video-self" muted mirror />
              ) : null}
            </div>
          </div>

          <div className="session-room-controls">
            <button
              type="button"
              className={`session-room-control${micOn ? '' : ' is-off'}`}
              aria-label={t('sessionRoomToggleMic')}
              aria-pressed={micOn}
              onClick={toggleMic}
            >
              {micOn ? <MicGlyph /> : <MicOffGlyph />}
            </button>
            <button
              type="button"
              className={`session-room-control${cameraOn ? '' : ' is-off'}`}
              aria-label={t('sessionRoomToggleCamera')}
              aria-pressed={cameraOn}
              onClick={toggleCamera}
            >
              {cameraOn ? <CameraGlyph stroke="#F2ECE1" /> : <CameraOffGlyph />}
            </button>
            <button type="button" className="session-room-leave" aria-label={t('sessionRoomLeave')} onClick={() => void leave()}>
              <HangUpGlyph />
            </button>
          </div>
        </div>
      ) : (
        <div className="session-room-prejoin">
          <div className="session-room-avatar-lg" style={{ background: grad(ACCENT), boxShadow: `0 16px 32px -12px ${ACCENT}55` }}>
            {initials}
          </div>
          <div>
            <div className="session-room-ready">{t('sessionRoomReadyTitle')}</div>
            <div className="session-room-ready-sub">{t('sessionRoomLiveReadySub')}</div>
          </div>
          {message && <div className="session-room-blocked" role="alert">{message}</div>}
          {(phase.kind === 'ready' || phase.kind === 'joining' || canRetry) && (
            <button
              type="button"
              className="session-room-join"
              onClick={() => void join()}
              disabled={phase.kind === 'joining' || !sessionId}
            >
              <CameraGlyph />
              {phase.kind === 'joining' ? t('sessionRoomJoining') : phase.kind === 'ready' ? t('sessionRoomJoin') : t('retry')}
            </button>
          )}
        </div>
      )}
    </div>
  );
}

function TrackVideo({ track, className, muted, mirror }: { track: MediaStreamTrack; className: string; muted?: boolean; mirror?: boolean }) {
  const ref = useRef<HTMLVideoElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.srcObject = new MediaStream([track]);
    return () => { el.srcObject = null; };
  }, [track]);
  return <video ref={ref} className={`${className}${mirror ? ' is-mirrored' : ''}`} autoPlay playsInline muted={muted} />;
}

function TrackAudio({ track }: { track: MediaStreamTrack }) {
  const ref = useRef<HTMLAudioElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.srcObject = new MediaStream([track]);
    return () => { el.srcObject = null; };
  }, [track]);
  return <audio ref={ref} autoPlay />;
}

// Call-control glyphs, used only on this screen.
function WarnGlyph() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#E8C468" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <circle cx="12" cy="12" r="9" /><path d="M12 8v4M12 16h.01" />
    </svg>
  );
}
function CameraGlyph({ stroke = '#FFFFFF' }: { stroke?: string }) {
  return (
    <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke={stroke} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <rect x="2" y="6" width="15" height="12" rx="2.5" /><path d="M22 8.5l-5 3.5 5 3.5v-7z" />
    </svg>
  );
}
function CameraOffGlyph() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#E8998A" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M1 1l22 22" /><path d="M15 12a3 3 0 0 1-4.24 2.72M9.17 9.17A3 3 0 0 1 12 9c1.66 0 3 1.34 3 3" />
      <rect x="2" y="6" width="15" height="12" rx="2.5" /><path d="M22 8.5l-5 3.5 5 3.5v-7z" />
    </svg>
  );
}
function MicGlyph() {
  return (
    <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="#F2ECE1" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <rect x="9" y="2" width="6" height="12" rx="3" /><path d="M5 10a7 7 0 0 0 14 0M12 19v3" />
    </svg>
  );
}
function MicOffGlyph() {
  return (
    <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="#E8998A" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M1 1l22 22" /><path d="M9 9v3a3 3 0 0 0 4.6 2.55M15 9.34V5a3 3 0 0 0-5.68-1.33" />
      <path d="M5 10a7 7 0 0 0 10.29 6.17M19 10a7 7 0 0 1-.34 2.18" /><path d="M12 19v3" />
    </svg>
  );
}
function HangUpGlyph() {
  return (
    <svg width="21" height="21" viewBox="0 0 24 24" fill="none" stroke="#FFFFFF" strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path
        d="M10.68 13.31a16 16 0 0 0 3.41 2.6l1.27-1.27a1 1 0 0 1 1.05-.24 11.4 11.4 0 0 0 3.58.57 1 1 0 0 1 1 1V19a1 1 0 0 1-1 1A17 17 0 0 1 4 4a1 1 0 0 1 1-1h3a1 1 0 0 1 1 1 11.4 11.4 0 0 0 .57 3.58 1 1 0 0 1-.25 1.05l-1.27 1.27a16 16 0 0 0 2.63 3.41z"
        transform="rotate(135 12 12)"
      />
    </svg>
  );
}
