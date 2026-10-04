/**
 * Asking the `session-video` Edge Function for a way into one session's
 * call. The function decides everything — who may join, when, and that the
 * room never records (supabase/functions/_shared/sessionVideo.ts); the app
 * only shows its answer. The Daily API key stays in the function.
 *
 * Same result shape as the other *Data.ts files.
 */
import { getSupabase, isSupabaseConfigured } from './supabase';

export type VideoErrorCode =
  | 'not_configured'
  /** Not a session of theirs, or gone. */
  | 'not_found'
  | 'too_early'
  | 'ended'
  | 'cancelled'
  | 'blocked'
  | 'relationship_inactive'
  /** No Daily key on the server, or Daily refused to promise no recording. */
  | 'video_unavailable'
  | 'unknown';

export interface VideoPass {
  url: string;
  token: string;
  role: 'coach' | 'member';
  otherName: string;
  /** A real instant (ISO): when the window closes and Daily ejects. */
  closesAt: string;
}

export type VideoResult =
  | { ok: true; data: VideoPass }
  | { ok: false; code: VideoErrorCode; message: string; opensAt?: string };

const KNOWN: VideoErrorCode[] = ['not_found', 'too_early', 'ended', 'cancelled', 'blocked', 'relationship_inactive'];
const UNAVAILABLE = ['video_not_configured', 'recording_enabled_on_domain', 'recording_enabled_on_room', 'video_unavailable'];

export async function joinSessionVideo(sessionId: string): Promise<VideoResult> {
  if (!isSupabaseConfigured()) return { ok: false, code: 'not_configured', message: 'Supabase credentials are missing.' };
  const { data, error } = await getSupabase().functions.invoke('session-video', { body: { session_id: sessionId } });
  if (!error && data && typeof data.url === 'string' && typeof data.token === 'string') {
    return {
      ok: true,
      data: {
        url: data.url,
        token: data.token,
        role: data.role === 'coach' ? 'coach' : 'member',
        otherName: typeof data.other_name === 'string' ? data.other_name : '',
        closesAt: String(data.closes_at ?? ''),
      },
    };
  }
  // A non-2xx answer carries the function's own reason in its body.
  let body: Record<string, unknown> = {};
  const context = (error as { context?: unknown } | null)?.context;
  if (context instanceof Response) {
    try {
      body = await context.json();
    } catch {
      body = {};
    }
  }
  const reason = String(body.error ?? '');
  const code: VideoErrorCode = (KNOWN as string[]).includes(reason)
    ? (reason as VideoErrorCode)
    : UNAVAILABLE.includes(reason)
      ? 'video_unavailable'
      : 'unknown';
  return {
    ok: false,
    code,
    message: reason || error?.message || 'no answer',
    opensAt: typeof body.opens_at === 'string' ? body.opens_at : undefined,
  };
}

/** Whether a session's Join should show: the same window the function
    enforces (10 minutes before the start, until 30 after the end), on
    wall-clock ms. The function is the real gate; this only decides
    whether to offer the button. */
export const JOIN_EARLY_MS = 10 * 60_000;
export const JOIN_LATE_MS = 30 * 60_000;
export function canOfferJoin(startWallMs: number, endWallMs: number, nowWallMs: number): boolean {
  return nowWallMs >= startWallMs - JOIN_EARLY_MS && nowWallMs < endWallMs + JOIN_LATE_MS;
}
