/* Who a piece of work gets recorded against.

   Needs no database and no key: identity.js is pure over browser
   storage, so the storage is stubbed and the whole thing runs anywhere.

   This exists because of a real bug. A defect claimed or repaired on the
   Defects tab was recorded against the BADGE — the email on the browser
   — rather than the mechanic PIN'd in on it. On the one tablet where
   those are the same person nothing looked wrong. On a shared shop
   tablet the board said the office had somebody else's job, and the
   Motive write-back would have signed a DVIR with an email address.

   Run:  node scripts/test-identity.mjs
*/
import { makeChecks, report } from "./_testkit.mjs";

const store = (init = {}) => {
  let m = { ...init };
  return {
    getItem: (k) => (k in m ? m[k] : null),
    setItem: (k, v) => { m[k] = String(v); },
    removeItem: (k) => { delete m[k]; },
  };
};
globalThis.localStorage = store();
globalThis.sessionStorage = store();

const { actorFor, readUnlock, writeUnlock, clearUnlock } =
  await import("../src/identity.js");

const { state, is, truthy } = makeChecks();
const BADGE = "jason_ward@theallen.com";

is(actorFor(BADGE), BADGE, "nobody PIN'd in falls back to the badge");

writeUnlock({ id: "m1", name: "Alex Oswald", email: BADGE, role: "mechanic" });
is(actorFor(BADGE), "Alex Oswald",
   "the mechanic PIN'd in is the actor, not the badge on the browser");
is(readUnlock(BADGE)?.id, "m1", "and the unlock carries their id");

is(actorFor("someone_else@theallen.com"), "someone_else@theallen.com",
   "an unlock does not leak to a different badge");

clearUnlock();
is(actorFor(BADGE), BADGE, "locking again goes back to the badge");

/* A private window, or a browser set to block site data. The app has to
   keep working; it just stops knowing who is at it. */
globalThis.sessionStorage = {
  getItem() { throw new Error("blocked"); },
  setItem() { throw new Error("blocked"); },
  removeItem() { throw new Error("blocked"); },
};
is(actorFor(BADGE), BADGE, "blocked storage falls back rather than throwing");
truthy(readUnlock(BADGE) === null, "and reads null rather than exploding");

report(state, true);
