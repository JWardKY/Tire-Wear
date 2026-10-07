/* Writing up a shop day.
   ─────────────────────────────────────────────────────────────────
   An admin asks for a day; this reads every time entry on it, hands
   the facts to Claude, and saves what comes back.

   Saved rather than regenerated on each view, for three reasons: it
   costs a call to write, everybody looking at the same day should read
   the same words, and six months on "what did we do to DT-866 in
   October" is a question the entries answer only in fragments.

   One variable, set in Netlify:
     ANTHROPIC_API_KEY

   Missing it is not a crash. The screen says the key is not set and
   the rest of the app carries on, the same way the tire alerts sit
   dormant until IT hands over the mail credentials.

   Cost: a busy day is a few thousand tokens in and under a thousand
   out — pennies. A day nobody worked costs nothing at all, because it
   never reaches the model. */

import Anthropic from "@anthropic-ai/sdk";
import { createClient } from "@supabase/supabase-js";
import { factsFor, whyNothingToWrite, lengthFor, systemPrompt, hoursOf, byMechanic }
  from "../../src/daySummary.js";

const MODEL = "claude-opus-5-5";

const json = (status, body) => new Response(JSON.stringify(body), {
  status, headers: { "content-type": "application/json" },
});

/* The same anon key the app runs on. These rows are already readable
   by anybody with the site open; the function exists to hold the
   Anthropic key, which is not. */
function db() {
  const url = process.env.VITE_SUPABASE_URL;
  const key = process.env.VITE_SUPABASE_ANON_KEY;
  if (!url || !key) throw new Error("Supabase is not configured on the server.");
  return createClient(url, key);
}

const isDate = (s) => /^\d{4}-\d{2}-\d{2}$/.test(String(s || ""));

export default async (req) => {
  if (req.method !== "POST") return json(405, { error: "POST a date." });

  let body = {};
  try { body = await req.json(); } catch { /* empty body is a bad date below */ }
  const date = String(body.date || "");
  const who = String(body.who || "").trim();
  const again = body.again === true;

  if (!isDate(date)) return json(400, { error: "A date is required, as YYYY-MM-DD." });
  if (!who) return json(400, { error: "A summary is written on somebody's say-so — no name was given." });

  const supabase = db();

  /* Already written, and nobody asked for it again. */
  if (!again) {
    const { data: had } = await supabase.from("tw_day_summary")
      .select("*").eq("work_date", date).maybeSingle();
    if (had) return json(200, { summary: had, cached: true });
  }

  const [hours, days] = await Promise.all([
    supabase.from("tw_hours").select("*").eq("work_date", date).order("mechanic"),
    supabase.from("tw_timecard_days").select("mechanic,clock_hours").eq("work_date", date),
  ]);
  if (hours.error) throw hours.error;

  const rows = (hours.data || []).map((r) => ({
    mechanic: r.mechanic, unit: r.unit, unitLabel: null,
    hours: Number(r.hours), costCode: r.cost_code, costCodeName: r.cost_code_name,
    workTypes: r.work_types || [], workOrder: r.work_order,
    note: r.note, workPerformed: r.work_performed,
  }));
  const clocked = (days.data || []).reduce((a, d) => a + Number(d.clock_hours || 0), 0);

  /* A day with nothing on it never reaches the model. There is nothing
     to write, and asking anyway is how you get a paragraph about a day
     that did not happen. */
  const nothing = whyNothingToWrite(rows, { clocked });
  if (nothing) {
    return json(200, { summary: { work_date: date, body: nothing, model: null,
      hours: 0, entries: 0, mechanics: 0, written_by: who,
      written_at: new Date().toISOString() }, empty: true });
  }

  if (!process.env.ANTHROPIC_API_KEY) {
    return json(503, {
      error: "ANTHROPIC_API_KEY is not set in Netlify, so the day cannot be written up. "
        + "Everything else on this screen still works.",
    });
  }

  const facts = factsFor(date, rows, { clocked, mechanics: (days.data || []).length });
  const len = lengthFor(rows);
  const client = new Anthropic();

  const response = await client.messages.create({
    model: MODEL,
    max_tokens: 16000,
    output_config: { effort: "medium" },
    system: systemPrompt(),
    messages: [{
      role: "user",
      content: `Write up this day. Aim for about ${len.words} words — ${len.say}.\n\n${facts}`,
    }],
  });

  /* Safety classifiers can decline; checking stop_reason before
     reading content is the difference between an empty summary and a
     sentence saying why there isn't one. */
  if (response.stop_reason === "refusal") {
    return json(502, {
      error: "The write-up was declined"
        + (response.stop_details?.explanation ? ` — ${response.stop_details.explanation}` : "")
        + ". The entries themselves are untouched.",
    });
  }

  const text = response.content
    .filter((b) => b.type === "text").map((b) => b.text).join("\n").trim();
  if (!text) return json(502, { error: "The write-up came back empty. Nothing was saved." });

  const row = {
    work_date: date,
    body: text,
    facts: { facts, usage: response.usage },
    model: response.model || MODEL,
    hours: hoursOf(rows),
    entries: rows.length,
    mechanics: byMechanic(rows).length,
    written_by: who,
    written_at: new Date().toISOString(),
  };
  const { data, error } = await supabase.from("tw_day_summary")
    .upsert(row, { onConflict: "work_date" }).select().single();
  if (error) throw error;

  return json(200, { summary: data, cached: false });
};
