/* Tire pull alerts.

   A tire is due out when its latest depth has reached the pull depth
   for its position — 6/32 on a steer, 4/32 everywhere else, both set in
   Settings. tw_tires_due_out already applies that rule; this decides who
   hears about it and makes sure they only hear once.

   Deduplication is the whole trick. Without it the Monday digest names
   the same worn tire every week until somebody changes it, and the
   walk-around alert fires again on every reading. tw_tire_alerts holds
   one row per reported tire; a later reading above the pull depth
   removes it, so a tire that is changed and later wears out again does
   alert a second time. */
import { createClient } from "@supabase/supabase-js";
import { configured, sendMail } from "./mail.mjs";

export function db() {
  const url = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
  const key = process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY;
  if (!url || !key) throw new Error("SUPABASE_URL / SUPABASE_ANON_KEY are not set.");
  return createClient(url, key);
}

async function recipients(c) {
  const { data, error } = await c.from("tw_settings").select("alert_emails").limit(1);
  if (error) throw error;
  return (data?.[0]?.alert_emails || []).map((s) => String(s).trim()).filter(Boolean);
}

/* Tires that climbed back above the line — changed, or a bad reading
   corrected. Clearing them is what lets the same wheel alert again. */
async function forgetRecovered(c) {
  const { data: due, error: e1 } = await c.from("tw_tires_due_out").select("tire_id");
  if (e1) throw e1;
  const { data: known, error: e2 } = await c.from("tw_tire_alerts").select("tire_id");
  if (e2) throw e2;
  const stillDue = new Set((due || []).map((r) => r.tire_id));
  const stale = (known || []).map((r) => r.tire_id).filter((id) => !stillDue.has(id));
  if (stale.length) {
    const { error } = await c.from("tw_tire_alerts").delete().in("tire_id", stale);
    if (error) throw error;
  }
  return stale.length;
}

const esc = (s) => String(s ?? "")
  .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

function table(rows) {
  const cell = "padding:6px 10px;border-bottom:1px solid #e5e7eb;font-size:14px";
  return `<table style="border-collapse:collapse;margin:12px 0">
    <tr>${["Truck", "Wheel", "Tire", "Tread", "Pull at"]
      .map((h) => `<th style="${cell};text-align:left;color:#6b7280;` +
                  `font-size:12px;text-transform:uppercase">${h}</th>`).join("")}</tr>
    ${rows.map((r) => `<tr>
      <td style="${cell};font-weight:600">${esc(r.truck)}</td>
      <td style="${cell};font-family:monospace">${esc(r.position)}</td>
      <td style="${cell}">${esc([r.brand, r.model].filter(Boolean).join(" ") || "—")}</td>
      <td style="${cell};font-weight:600;color:#b91c1c">${esc(r.current_depth)}/32</td>
      <td style="${cell};color:#6b7280">${esc(r.pull_depth)}/32</td>
    </tr>`).join("")}
  </table>`;
}

const SITE = "https://allenhaul.netlify.app";

/* mode "new"    — only tires not reported before. The walk-around alert.
   mode "digest" — everything currently due out. The Monday summary,
                   which repeats what is still outstanding on purpose:
                   that is the point of a digest. */
export async function runTireAlerts({ mode = "new" } = {}) {
  const c = db();
  const cleared = await forgetRecovered(c);

  const { data: rows, error } = await c
    .from("tw_tires_due_out")
    .select("*")
    .order("current_depth", { ascending: true });
  if (error) throw error;

  const due = rows || [];
  const fresh = due.filter((r) => !r.alerted_at);
  const send = mode === "digest" ? due : fresh;

  const to = await recipients(c);
  const out = {
    mode, dueOut: due.length, newSinceLastAlert: fresh.length,
    cleared, recipients: to.length, sent: false,
  };

  if (!send.length) { out.reason = "nothing due out"; return out; }
  if (!to.length) { out.reason = "no addresses set in Settings"; return out; }
  if (!configured()) { out.reason = "Graph mail is not configured"; return out; }

  const one = send.length === 1;
  const subject = mode === "digest"
    ? `Tires due out — ${send.length} on the fleet`
    : one
      ? `${send[0].truck} ${send[0].position} is down to ${send[0].current_depth}/32`
      : `${send.length} tires have reached pull depth`;

  const lead = mode === "digest"
    ? `<p>Every mounted tire at or below its pull depth as of this morning.</p>`
    : `<p>${one ? "This tire has" : "These tires have"} reached pull depth on the
       latest walk-around.</p>`;

  await sendMail({
    to,
    subject,
    html: `<div style="font-family:system-ui,-apple-system,Segoe UI,sans-serif;color:#111">
      <h2 style="margin:0 0 4px">Tire Wear · Haul Division</h2>
      ${lead}
      ${table(send)}
      <p style="font-size:13px;color:#6b7280">
        Pull depths are set in the app — ${esc(send[0].pull_depth)}/32 here.
        <a href="${SITE}">Open Tire Wear</a>
      </p>
      <p style="font-size:12px;color:#9ca3af">
        Sent because your address is on the alert list in Settings.
        A tire is reported once; it will not appear again unless it goes
        back above the line and wears down a second time.
      </p>
    </div>`,
  });

  /* Recorded after a successful send, never before — a failed send that
     marked the tires reported would lose the alert entirely. */
  const { error: upErr } = await c.from("tw_tire_alerts").upsert(
    send.map((r) => ({
      tire_id: r.tire_id,
      depth_32nds: r.current_depth,
      pull_32nds: r.pull_depth,
      sent_to: to,
      sent_at: new Date().toISOString(),
    })),
    { onConflict: "tire_id" }
  );
  if (upErr) throw upErr;

  out.sent = true;
  out.tires = send.map((r) => `${r.truck} ${r.position}`);
  return out;
}
