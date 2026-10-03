/**
 * Google Play's 1024×500 feature graphic.
 *
 * Runs inside the page (`page.evaluate`), so it must stay self-contained:
 * no imports from this module's scope, everything either inline or in the
 * argument. It is drawn in the running app on purpose — that way the
 * colours come from `src/theme/tokens.css` and the type from the same
 * Lora/Cairo webfonts the app ships, instead of a second set that could
 * drift. The R mark is imported from `src/lib/logoMark.ts`, #83's single
 * definition of it.
 *
 * The words are the recommended name and subtitle from `store/listing.md`
 * and nothing else: the graphic must not claim anything the listing does
 * not, and the listing deliberately avoids push, in-app payment and
 * WhatsApp.
 *
 * Play overlays and crops this image differently across placements, so
 * everything sits well inside the edges and nothing important is near a
 * corner.
 */
export async function featureGraphic({ lang }) {
  const { MARK_R_PATH, MARK_FROM, MARK_TO, MARK_INK, markGlyphTransform } =
    await import('/src/lib/logoMark.ts');

  const COPY = {
    en: { name: 'Rafiq Pro', tag: 'Coaching, sessions, progress', dir: 'ltr', font: 'var(--font-display-en)' },
    ar: { name: 'رفيق', tag: 'جلسات ومهام وتقدّم معًا', dir: 'rtl', font: 'var(--font-display-ar)' },
  }[lang];

  document.body.innerHTML = '';
  document.body.style.cssText = 'margin:0;padding:0;background:#fff;line-height:0';

  const el = document.createElement('div');
  el.id = 'feature-graphic';
  el.setAttribute('dir', COPY.dir);
  el.style.cssText = [
    'width:1024px', 'height:500px', 'position:relative', 'overflow:hidden',
    `background:linear-gradient(135deg, ${MARK_FROM} 0%, ${MARK_TO} 100%)`,
    'display:flex', 'align-items:center', 'gap:56px',
    'padding-inline:88px', 'box-sizing:border-box',
  ].join(';');

  // Two soft blobs, the same treatment the Welcome hero uses.
  el.innerHTML = `
    <div style="position:absolute;inset-inline-end:-120px;top:-140px;width:460px;height:460px;
                border-radius:50%;background:rgba(255,255,255,.08)"></div>
    <div style="position:absolute;inset-inline-end:120px;bottom:-200px;width:320px;height:320px;
                border-radius:50%;background:rgba(255,255,255,.06)"></div>

    <div style="position:relative;flex:0 0 auto;width:148px;height:148px;border-radius:34px;
                overflow:hidden;box-shadow:0 18px 40px -16px rgba(0,0,0,.45)">
      <svg width="148" height="148" viewBox="0 0 100 100" aria-hidden="true">
        <rect width="100" height="100" fill="#FFFFFF"/>
        <path d="${MARK_R_PATH}" transform="${markGlyphTransform(0.33)}" fill="${MARK_FROM}"/>
      </svg>
    </div>

    <div style="position:relative;line-height:1.15">
      <div style="font-family:${COPY.font};font-weight:700;font-size:78px;color:${MARK_INK};
                  letter-spacing:-1px">${COPY.name}</div>
      <div style="font-family:${COPY.font};font-size:31px;color:rgba(255,255,255,.88);
                  margin-block-start:16px;line-height:1.4">${COPY.tag}</div>
    </div>`;

  document.body.appendChild(el);
}
