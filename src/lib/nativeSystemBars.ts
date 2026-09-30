/**
 * The colour of the status bar's clock and icons (and Android's navigation
 * bar), matched to the app's own theme.
 *
 * Left alone, they follow the phone's light/dark setting. The app has its
 * own dark-mode switch, so a member who turns it on while their phone is in
 * light mode gets dark icons on the dark page behind them — the clock and
 * battery disappear. The page is behind the bars on iPhone always, and on
 * Android whenever the WebView is 140 or newer (Capacitor then draws the app
 * edge to edge, and `--safe-top` in tokens.css keeps content clear).
 *
 * On an older Android WebView Capacitor pads the app out from under the bars
 * instead, so what sits behind them is the native window, not the page. The
 * phone's own setting is the right one there, and forcing the app's theme
 * would put light icons on a light strip — so those are left alone.
 */
import { Capacitor, SystemBars, SystemBarsStyle } from '@capacitor/core';

/** Capacitor's own cut-off (SystemBars.java, WEBVIEW_VERSION_WITH_SAFE_AREA_FIX). */
const EDGE_TO_EDGE_WEBVIEW = 140;

/**
 * Pure, so the decision is testable without a device. `null` means leave
 * the bars as the system has them.
 */
export function systemBarsStyleFor(dark: boolean, platform: string, userAgent: string): SystemBarsStyle | null {
  if (platform === 'android') {
    const chrome = Number(/Chrome\/(\d+)/.exec(userAgent)?.[1] ?? 0);
    if (chrome < EDGE_TO_EDGE_WEBVIEW) return null;
  } else if (platform !== 'ios') {
    return null;
  }
  // Dark = light icons, for a dark background.
  return dark ? SystemBarsStyle.Dark : SystemBarsStyle.Light;
}

/** Indirection so a test can see the call without a native bridge. */
export const systemBars = {
  setStyle: (style: SystemBarsStyle) => SystemBars.setStyle({ style }),
};

export function applySystemBarsStyle(dark: boolean): void {
  if (!Capacitor.isNativePlatform()) return;
  const style = systemBarsStyleFor(dark, Capacitor.getPlatform(), navigator.userAgent);
  if (style) void systemBars.setStyle(style).catch(() => {});
}
