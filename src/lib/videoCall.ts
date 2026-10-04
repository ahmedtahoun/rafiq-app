/**
 * The 1:1 video call, as SessionRoom needs it: join one room, show two
 * people, turn the mic and camera on and off, leave.
 *
 * Built on Daily's call object rather than its ready-made call screen:
 * that screen has no Arabic (Daily Prebuilt's languages stop at Turkish),
 * and this app's every screen is bilingual. The call object gives tracks
 * and events; SessionRoom draws them with the app's own controls and copy.
 *
 * `@daily-co/daily-js` is imported only when a call is joined, so its
 * ~1 MB never loads for someone who doesn't open a session.
 *
 * Tests swap the whole thing out with `setVideoCallFactory` — a browser
 * test has no camera and must not reach Daily.
 */
import type { DailyCall, DailyParticipant } from '@daily-co/daily-js';

export interface CallSide {
  /** Present in the call at all (the other person may not have joined yet). */
  present: boolean;
  videoTrack: MediaStreamTrack | null;
  audioTrack: MediaStreamTrack | null;
  videoOn: boolean;
  audioOn: boolean;
}

export interface CallState {
  self: CallSide;
  other: CallSide;
}

/** Why a call stopped: the person left, the window closed, or it failed. */
export type CallEnd = 'left' | 'ejected' | 'error' | 'devices';

export interface VideoCall {
  join(url: string, token: string): Promise<void>;
  leave(): Promise<void>;
  setMic(on: boolean): void;
  setCamera(on: boolean): void;
  onChange(cb: (state: CallState) => void): void;
  onEnd(cb: (why: CallEnd) => void): void;
}

const EMPTY: CallSide = { present: false, videoTrack: null, audioTrack: null, videoOn: false, audioOn: false };

function sideOf(p: DailyParticipant | undefined): CallSide {
  if (!p) return EMPTY;
  const video = p.tracks?.video;
  const audio = p.tracks?.audio;
  return {
    present: true,
    videoTrack: video?.state === 'playable' ? (video.persistentTrack ?? null) : null,
    audioTrack: audio?.state === 'playable' ? (audio.persistentTrack ?? null) : null,
    videoOn: video?.state === 'playable' || video?.state === 'loading',
    audioOn: audio?.state === 'playable' || audio?.state === 'loading',
  };
}

class DailyVideoCall implements VideoCall {
  private call: DailyCall | null = null;
  private changeCb: (s: CallState) => void = () => {};
  private endCb: (w: CallEnd) => void = () => {};
  private ended = false;

  onChange(cb: (s: CallState) => void) { this.changeCb = cb; }
  onEnd(cb: (w: CallEnd) => void) { this.endCb = cb; }

  private emit = () => {
    if (!this.call) return;
    const all = this.call.participants();
    const other = Object.values(all).find((p) => !p.local);
    this.changeCb({ self: sideOf(all.local), other: sideOf(other) });
  };

  private finish(why: CallEnd) {
    if (this.ended) return;
    this.ended = true;
    this.endCb(why);
    const call = this.call;
    this.call = null;
    void call?.destroy();
  }

  async join(url: string, token: string) {
    const { default: Daily } = await import('@daily-co/daily-js');
    const call = Daily.createCallObject({ subscribeToTracksAutomatically: true });
    this.call = call;
    for (const ev of ['joined-meeting', 'participant-joined', 'participant-updated', 'participant-left', 'track-started', 'track-stopped'] as const) {
      call.on(ev, this.emit);
    }
    // When the window closes Daily ejects everyone: an 'error' of type
    // 'ejected', ahead of 'left-meeting'. The first of the two wins.
    call.on('left-meeting', () => this.finish('left'));
    call.on('error', (e) => this.finish(e?.error?.type === 'ejected' ? 'ejected' : 'error'));
    call.on('camera-error', () => this.finish('devices'));
    await call.join({ url, token });
    this.emit();
  }

  async leave() {
    const call = this.call;
    if (!call) return;
    this.ended = true;
    this.call = null;
    try {
      await call.leave();
    } finally {
      await call.destroy();
    }
  }

  setMic(on: boolean) { this.call?.setLocalAudio(on); }
  setCamera(on: boolean) { this.call?.setLocalVideo(on); }
}

let factory: () => VideoCall = () => new DailyVideoCall();

export function createVideoCall(): VideoCall {
  return factory();
}

/** Tests only: replace Daily with a fake. */
export function setVideoCallFactory(next: () => VideoCall) {
  factory = next;
}
