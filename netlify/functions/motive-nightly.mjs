/* Every night at 05:00 UTC — midnight Eastern in summer, 1am in winter.
   Late enough that the day's driving is in, early enough that the shop
   opens to current numbers.

   Same code path as the on-demand endpoint, always in write mode. If it
   throws, Netlify records a failed run; the next night picks up whatever
   was missed, because every write here is idempotent. */
import { env, runOdometer, runDefects } from "./_sync.mjs";

export default async () => {
  const ctx = env();
  const odometer = await runOdometer(ctx, { write: true });
  const defects = await runDefects(ctx, { write: true });
  console.log(JSON.stringify({ odometer, defects }));
};

export const config = { schedule: "0 5 * * *" };
