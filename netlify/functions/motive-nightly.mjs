/* Every night at 05:00 UTC — midnight Eastern in summer, 1am in winter.
   Late enough that the day's driving is in, early enough that the shop
   opens to current numbers.

   Same code path as the on-demand endpoint, always in write mode. If it
   throws, Netlify records a failed run; the next night picks up whatever
   was missed, because every write here is idempotent. */
import { env, runOdometer, runDefects } from "./lib/sync.mjs";
import { env as resolveEnv, runResolve } from "./lib/resolve.mjs";

export default async () => {
  const ctx = env();
  const odometer = await runOdometer(ctx, { write: true });
  const defects = await runDefects(ctx, { write: true });

  /* The sweep behind the app's own nudge. A repair whose write-back
     failed — Motive down, a report id that could not be found — is
     retried here, up to the attempt limit. Wrapped so a Motive
     write-back problem can never take the night's mileage import down
     with it; the import already ran above, and this is the part that
     touches somebody else's record. */
  let resolve;
  try { resolve = await runResolve(resolveEnv(), { write: true, limit: 50 }); }
  catch (e) { resolve = { error: String(e?.message || e) }; }

  console.log(JSON.stringify({ odometer, defects, resolve }));
};

export const config = { schedule: "0 5 * * *" };
