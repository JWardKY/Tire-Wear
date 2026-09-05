/* Called by the app right after a mechanic marks a defect repaired, so
   the DVIR is updated while they are still standing at the truck rather
   than waiting for the nightly sweep.

   It takes no input, exactly like tire-alert. The browser cannot say
   which defect to resolve, whose name to put on it, or what to tell
   Motive — it only says "something changed, go and look". Everything
   sent to Motive is read back out of the database here.

   That matters because this endpoint is reachable by anyone with the
   URL. The worst they can do is make the app send a repair that a
   mechanic has already recorded, once, because a resolved defect is
   stamped and skipped next time. */
import { env, runResolve } from "./lib/resolve.mjs";

export default async (req) => {
  if (req.method !== "POST") return new Response("POST only", { status: 405 });
  try {
    const result = await runResolve(env(), { write: true });
    console.log(JSON.stringify({ motiveResolve: result }));
    return Response.json(result);
  } catch (e) {
    /* Never thrown at the mechanic who just saved the repair: their work
       is already recorded here, and the nightly sweep will pick the
       Motive side up. A failed write-back is not a failed repair. */
    console.error("motive-resolve failed:", e?.message || e);
    return Response.json({ updated: 0, error: String(e?.message || e) }, { status: 200 });
  }
};
