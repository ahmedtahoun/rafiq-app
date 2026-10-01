/**
 * Console noise this sandbox emits that says nothing about the app: the
 * proxy's certificate, a missing favicon, and blocked outbound fetches.
 * Everything else that reaches console.error is treated as a real failure
 * by the suites, which is the point — a screen that renders but warns is
 * not a passing screen.
 */
export const IGNORED_CONSOLE = /ERR_CERT_AUTHORITY_INVALID|favicon\.ico|net::ERR_/;

/**
 * A notch and a home indicator, simulated.
 *
 * `env(safe-area-inset-*)` is always 0 in a desktop browser, so there is no
 * way to reproduce the iPhone bug here directly. The app reads the insets
 * through `--safe-top` / `--safe-bottom` (tokens.css) precisely so that a
 * test can stand in for the device: override the variables and every rule
 * that respects the safe area moves, exactly as it would on the phone.
 *
 * The values are an iPhone 14 Pro in portrait.
 */
export const SAFE_TOP = 47;
export const SAFE_BOTTOM = 34;

export async function simulateNotch(page, top = SAFE_TOP, bottom = SAFE_BOTTOM) {
  await page.addStyleTag({ content: `:root { --safe-top: ${top}px; --safe-bottom: ${bottom}px; }` });
}

/**
 * The system text size, simulated.
 *
 * Android scales WebView text by the system font setting, and every font
 * size in this app is in px, so the effect is "multiply every rendered font
 * size". Chromium has no switch for that (`text-size-adjust` only applies
 * with mobile text autosizing on), so this walks the screen and scales the
 * computed size of each element instead. Widths, padding and icons stay
 * where they are — which is the point: that mismatch is what breaks layouts.
 *
 * Re-apply after every navigation: React replaces the nodes and the inline
 * sizes go with them.
 */
export async function setTextScale(page, factor) {
  await page.evaluate((f) => {
    // Read every size first, then scale: scaling a parent before reading its
    // child made an inheriting child (a <bdi>, a <b>) scale twice.
    const els = [...document.querySelectorAll('.phone-frame, .phone-frame *')];
    for (const el of els) el.dataset.baseFontSize ??= getComputedStyle(el).fontSize;
    for (const el of els) el.style.fontSize = `${parseFloat(el.dataset.baseFontSize) * f}px`;
  }, factor);
}
