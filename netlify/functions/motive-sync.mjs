/* On demand: /.netlify/functions/motive-sync

   Reports what a sync WOULD do, and changes nothing unless asked. Every
   request needs the sync token, dry runs included: this sits on a public
   URL, and the plan it returns is the whole fleet's mileage and every
   open defect. That is not world-readable business data.

     curl -H "X-Sync-Token: $SYNC_TOKEN" \
       ".../.netlify/functions/motive-sync?what=odometer"

   Add write=1 to actually write.

   Query:
     what=odometer | defects | both   (default both)
     field=odometer | true_odometer   (which Motive number to believe)
     since=YYYY-MM-DD                 (defects: how far back, default 14d)
     write=1                          (with the token: actually write)
*/
import { env, runOdometer, runDefects } from "./_sync.mjs";

/* Compare without leaking the answer in how long it takes. */
function timingSafeEqual(a, b) {
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

const json = (code, body) => new Response(JSON.stringify(body, null, 2), {
  status: code,
  headers: { "content-type": "application/json", "cache-control": "no-store" },
});

export default async (req) => {
  const q = new URL(req.url).searchParams;
  const what = q.get("what") || "both";
  const wants = q.get("write") === "1";

  /* A wrong token is refused outright rather than quietly downgraded to
     a dry run, so nobody reads "dryRun: true" as "the sync ran". */
  const expected = process.env.SYNC_TOKEN;
  if (!expected) return json(503, { error: "SYNC_TOKEN is not set, so this endpoint is disabled." });
  const given = req.headers.get("x-sync-token") || "";
  if (given.length !== expected.length || !timingSafeEqual(given, expected))
    return json(403, { error: "Bad or missing X-Sync-Token." });

  let ctx;
  try { ctx = env(); }
  catch (e) { return json(503, { error: e.message }); }

  const out = { write: wants, at: new Date().toISOString() };
  try {
    if (what === "odometer" || what === "both")
      out.odometer = await runOdometer(ctx, { write: wants, field: q.get("field") });
    if (what === "defects" || what === "both")
      out.defects = await runDefects(ctx, { write: wants, since: q.get("since") });
  } catch (e) {
    return json(502, { ...out, error: e.message });
  }
  return json(200, out);
};
