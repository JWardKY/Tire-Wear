/* Called by the app right after a walk-around is saved, so a tire that
   has just reached pull depth is reported while the truck is still in
   the yard rather than waiting for Monday.

   It takes no input. The browser cannot say what to send or who to send
   it to — it only says "something changed, go and look". Everything the
   email contains is read back out of the database here. That matters,
   because the key the browser holds is public: the worst somebody with
   the URL can do is make the app notice a tire that genuinely has
   reached pull depth, and only once, because a reported tire is
   recorded and skipped next time. */
import { runTireAlerts } from "./lib/alerts.mjs";

export default async (req) => {
  if (req.method !== "POST") {
    return new Response("POST only", { status: 405 });
  }
  try {
    const result = await runTireAlerts({ mode: "new" });
    console.log(JSON.stringify({ tireAlert: result }));
    return Response.json(result);
  } catch (e) {
    /* Logged and reported, never thrown at the person saving a
       walk-around: their readings are already in. A failed alert is not
       a failed inspection. */
    console.error("tire-alert failed:", e?.message || e);
    return Response.json({ sent: false, error: String(e?.message || e) }, { status: 200 });
  }
};
