/**
 * Daily, swapped for a recorder.
 *
 * `src/lib/videoCall.ts` exposes `setVideoCallFactory` so nothing in a
 * test or a screenshot run ever reaches Daily, asks for a camera, or
 * needs a token that works. The fake records what the screen asked of it
 * on `window.__video.calls` and lets the caller drive the other side.
 *
 * It lives here rather than inside `session-video.spec.js` because the
 * store screenshots need the same call (`store/screenshots/shots.mjs`),
 * and a second copy of it would drift from this one the first time the
 * screen's contract changed.
 *
 * Install it after signing in and before opening the room:
 *
 *   await installFakeCall(page);
 *   await setFunctionReply(page, 'session-video', 200, pass);
 *   await page.locator('.session-room-join').click();
 *   await page.evaluate(() => window.__video.emit(true));  // other joins
 *
 * By default `videoTrack` is null on both sides. There is no camera
 * here, and the screen's own fallback for a participant with no track
 * is an initials avatar — exactly what a test wants, and what a store
 * screenshot should show instead of a real face.
 *
 * `selfVideo: { initials, bg }` is the one exception, used by the store
 * screenshots. The self tile has no initials fallback: SessionRoom draws
 * it empty while the camera is on and no track has arrived, on the
 * grounds that "a camera still starting is an empty tile, not a fault".
 * True for a second on a phone, permanent in a capture — so the shot
 * carried a blank accent-coloured rectangle where a real user sees
 * themselves. This hands it a genuine MediaStreamTrack from a canvas
 * painted with the coach's initials: the same kind of stand-in
 * `serveInitialsAvatar` already makes for profile photos in that
 * harness, and no face.
 *
 * Two things it needs to stay byte-identical between runs, both learned
 * the hard way:
 *
 *  - `freeze()` once the <video> has a frame. A still canvas stops
 *    emitting, so the paint is on a timer; left running, the capture
 *    lands mid-decode.
 *  - The caller must screenshot with `animations: 'disabled'`. This was
 *    first blamed on <video> and that was wrong — the culprit was the
 *    live dot's infinite pulse (SessionRoom.css:185) moving under every
 *    capture. With animations frozen, the canvas track hashes the same
 *    on every run.
 *
 * The canvas is painted mirrored on purpose; see `paint`.
 */
export function installFakeCall(page, { selfVideo = null } = {}) {
  return page.evaluate(async (opts) => {
    const m = await import('/src/lib/videoCall.ts');
    let selfTrack = null;
    let frozen = () => {};
    if (opts.selfVideo) {
      const { initials, bg = '#B75C3D' } = opts.selfVideo;
      const c = document.createElement('canvas');
      c.width = 360;
      c.height = 480;
      const g = c.getContext('2d');
      const paint = () => {
        g.setTransform(1, 0, 0, 1, 0, 0);
        g.fillStyle = bg;
        g.fillRect(0, 0, c.width, c.height);
        g.translate(c.width, 0);
        g.scale(-1, 1);
        g.fillStyle = '#FFFFFF';
        g.font = '600 120px system-ui, -apple-system, sans-serif';
        g.textAlign = 'center';
        g.textBaseline = 'middle';
        g.fillText(initials, c.width / 2, c.height / 2 + 6);
      };
      paint();
      selfTrack = c.captureStream(10).getVideoTracks()[0];
      const timer = setInterval(paint, 100);
      frozen = () => clearInterval(timer);
    }
    const side = (present, videoTrack = null) => ({ present, videoTrack, audioTrack: null, videoOn: present, audioOn: present });
    window.__video = { calls: [], freeze: () => frozen() };
    m.setVideoCallFactory(() => {
      const v = window.__video;
      let change = () => {};
      let end = () => {};
      v.emit = (otherPresent) => change({ self: side(true, selfTrack), other: side(otherPresent) });
      v.end = (why) => end(why);
      return {
        join: async (url, token) => { v.calls.push(['join', url, token]); change({ self: side(true, selfTrack), other: side(false) }); },
        leave: async () => { v.calls.push(['leave']); },
        setMic: (on) => v.calls.push(['mic', on]),
        setCamera: (on) => v.calls.push(['camera', on]),
        onChange: (cb) => { change = cb; },
        onEnd: (cb) => { end = cb; },
      };
    });
  }, { selfVideo });
}
