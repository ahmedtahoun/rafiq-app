import { useState } from 'react';
import { setFavourite } from '../lib/favouriteData';

/**
 * A screen's hearts, over the saved coaches it loaded with the rest of its
 * data (`saved`, which may not have arrived yet when the hook runs). Only
 * the member's own taps are kept here, on top of what was loaded: a tap
 * fills or empties the heart at once and saves it; if saving fails the
 * heart goes back and `failed` is set, so the screen can say so. A second
 * tap on a heart that is still saving is ignored.
 */
export function useFavourites(saved: readonly string[]) {
  const [tapped, setTapped] = useState<ReadonlyMap<string, boolean>>(new Map());
  const [saving, setSaving] = useState<ReadonlySet<string>>(new Set());
  const [failed, setFailed] = useState(false);

  const isFavourite = (coachId: string) => tapped.get(coachId) ?? saved.includes(coachId);

  const mark = (coachId: string, on: boolean) => setTapped((prev) => new Map(prev).set(coachId, on));
  const setBusy = (coachId: string, busy: boolean) =>
    setSaving((prev) => {
      const next = new Set(prev);
      if (busy) next.add(coachId);
      else next.delete(coachId);
      return next;
    });

  async function toggle(coachId: string) {
    if (saving.has(coachId)) return;
    const on = !isFavourite(coachId);
    mark(coachId, on);
    setBusy(coachId, true);
    setFailed(false);
    const result = await setFavourite(coachId, on);
    setBusy(coachId, false);
    if (!result.ok) {
      mark(coachId, !on);
      setFailed(true);
    }
  }

  return { isFavourite, toggle, failed };
}
