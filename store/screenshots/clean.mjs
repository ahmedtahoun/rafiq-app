import { rm } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

/**
 * Empty `out/` before a run.
 *
 * Playwright only writes the files it is asked for, so without this a
 * shot that is removed from the list — or held back in one language —
 * leaves its last render behind, and the next person uploads a stale
 * image that nothing in the repo still produces. Found exactly that way:
 * holding 11 and 12 back from Arabic left both Arabic PNGs in place.
 */
export default async function clean() {
  await rm(join(dirname(fileURLToPath(import.meta.url)), 'out'), { recursive: true, force: true });
}
