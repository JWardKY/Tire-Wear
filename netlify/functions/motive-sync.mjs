/* On demand: /.netlify/functions/motive-sync

   Reports what a sync WOULD do, and changes nothing unless asked. Every
   request needs the sync token, dry runs included: this sits on a public
   URL, and the plan it returns is the whole fleet's mileage and every
   open defect. That is not world-readable business data.

     curl -H "X-Sync-Token: $SYNC_TOKEN" \
       ".../.netlify/functions/motive-sync?what=odometer"

   Add write=1 to actually write.

   Query:
     what=odometer | defects | both | resolve   (default both)
     field=odometer | true_odometer   (which Motive number to believe)
     since=YYYY-MM-DD                 (defects: how far back, default 14d)
     write=1                          (with the token: actually write)
     raw=1                            (what Motive actually sent. With
                                       what=parts this is the v2 feed
                                       closing runs on, summarised —
                                       which proves the key can call v2)
     n=1..25                          (raw: how many, default 2)
     limit=1..100                     (resolve: how many DVIRs at most.
                                       limit=1 with write=1 is how the
                                       first live write-back gets proved
                                       on one defect before the switch is
                                       left on)
     status=...                       (raw: which filter to ask Motive for.
                                       It takes all, with_defects,
                                       with_no_defects, with_signature_missing,
                                       unknown, harmless, corrected — and
                                       answers 400 to anything else, which is
                                       how the status=open bug was found)
*/
import { env, runOdometer, runDefects, rawSample } from "./lib/sync.mjs";
import { env as resolveEnv, runResolve } from "./lib/resolve.mjs";

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
    /* What Motive actually sent, for when it disagrees with the docs. */
    if (q.get("raw") === "1")
      return json(200, { raw: await rawSample(ctx, what, q.get("since"),
                                              { n: q.get("n"), status: q.get("status") }) });
    if (what === "odometer" || what === "both")
      out.odometer = await runOdometer(ctx, { write: wants, field: q.get("field") });
    if (what === "defects" || what === "both")
      out.defects = await runDefects(ctx, { write: wants, since: q.get("since") });
    /* Not in "both": this one writes to Motive, and a habit of running
       the sync with write=1 should never quietly certify a repair on a
       DOT record. It has to be asked for by name. */
    if (what === "resolve")
      out.resolve = await runResolve(resolveEnv(), {
        write: wants,
        limit: Math.min(Math.max(Number(q.get("limit")) || 25, 1), 100),
      });
  } catch (e) {
    return json(502, { ...out, error: e.message });
  }
  return json(200, out);
};
