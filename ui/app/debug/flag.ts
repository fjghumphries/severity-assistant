/**
 * DEBUG-ONLY. Everything under ui/app/debug exists for the test cycle (docs/12-test-cycle.md) and
 * is removed before the production build: delete this folder and the one `DEBUG-HOOK` line.
 *
 * `scripts/check-no-debug.mjs` fails if the built bundle still contains the marker below, so a Hub
 * zip cannot be packaged with the flag on.
 */
export const DEBUG_ENABLED = true;

/** Present in the bundle only while debug code is. Checked by `npm run check:no-debug`. */
export const DEBUG_MARKER = "SA_DEBUG_FIXTURES";
