import React, { useState, useEffect, useMemo, useCallback } from "react";
import { C, FD, FM } from "./theme.js";
import {
  fmtDate, nf, Modal, Btn, Field, SectionLabel, Card,
  inp, th, td, tdNum, linkBtn,
} from "./ui.jsx";
import * as parts from "./partsData.js";
import { parseCSV, guessMapping, planImport } from "./csvImport.js";
import * as shop from "./shopData.js";

/* ── The Inventory section ────────────────────────────────────────
   This app is the system of record for stock now, seeded from a CSV
   export of whatever the shop used before.

   on_hand is never edited directly anywhere in here. Issuing, receiving,
   counting and importing all go in as transactions and a database
   trigger moves the number, so "why is there one left" always has an
   answer in the log. */

const STATE_COLOR = {
  out: C.pull,
  low: C.watch,
  ok: C.good,
  "no reorder point": C.muted,
  untracked: C.muted,
};

const STATE_LABEL = {
  out: "Out",
  low: "Low",
  ok: "In stock",
  "no reorder point": "No reorder point",
  untracked: "Untracked",
};

function StatePill({ state }) {
  const c = STATE_COLOR[state] || C.muted;
  return (
    <span style={{ display: "inline-block", fontFamily: FD, fontSize: 11.5, fontWeight: 600,
      letterSpacing: "0.07em", textTransform: "uppercase", padding: "3px 8px", borderRadius: 3,
      background: c + "1A", color: c, border: `1px solid ${c}44`, whiteSpace: "nowrap" }}>
      {STATE_LABEL[state] || state}
    </span>
  );
}

export default function InventorySection({ who, tab, onBusy }) {
  const [ready, setReady] = useState(false);
  const [err, setErr] = useState(null);
  const [busy, setBusy] = useState(false);
  const [rows, setRows] = useState([]);
  const [vehicles, setVehicles] = useState([]);
  const [q, setQ] = useState("");
  const [shopFilter, setShopFilter] = useState("ALL");
  const [moving, setMoving] = useState(null);
  const [opening, setOpening] = useState(null);

  const reload = useCallback(async () => {
    const [p, v] = await Promise.all([parts.listParts(), shop.listVehicles()]);
    setRows(p);
    setVehicles(v);
  }, []);

  useEffect(() => {
    (async () => {
      try { await reload(); }
      catch (e) { setErr(`Could not load the parts list — ${e.message || e}`); }
      setReady(true);
    })();
  }, [reload]);

  useEffect(() => { onBusy?.(busy); return () => onBusy?.(false); }, [busy, onBusy]);

  const run = useCallback(async (fn) => {
    setBusy(true);
    try { await fn(); await reload(); setErr(null); }
    catch (e) { setErr(`That did not save — ${e.message || e}`); }
    finally { setBusy(false); }
  }, [reload]);

  const shops = useMemo(
    () => [...new Set(rows.map((r) => r.shop))].sort(), [rows]);

  const shown = useMemo(() => {
    const s = q.trim().toLowerCase();
    return rows
      .filter((r) => shopFilter === "ALL" || r.shop === shopFilter)
      .filter((r) => !s || `${r.num} ${r.name} ${r.category} ${r.bin}`.toLowerCase().includes(s))
      .filter((r) => tab !== "reorder" || r.state === "low" || r.state === "out")
      .sort((a, b) => {
        if (tab === "reorder") {
          const rank = { out: 0, low: 1 };
          const d = (rank[a.state] ?? 9) - (rank[b.state] ?? 9);
          if (d) return d;
        }
        return a.num.localeCompare(b.num);
      });
  }, [rows, q, shopFilter, tab]);

  const value = shown.reduce((a, r) => a + (r.cost || 0) * r.onHand, 0);
  const outCount = rows.filter((r) => r.state === "out").length;
  const lowCount = rows.filter((r) => r.state === "low").length;

  if (!ready) return <div style={{ padding: 40, color: C.muted }}>Loading parts…</div>;

  if (tab === "import") {
    return (
      <Body err={err}>
        <ImportScreen existing={rows} who={who} busy={busy}
          onDone={async () => { await reload(); }} setErr={setErr} setBusy={setBusy} />
      </Body>
    );
  }

  return (
    <Body err={err}>
      {rows.length === 0 ? (
        <Empty />
      ) : (
        <>
          <div className="flex flex-wrap items-center justify-between gap-3"
            style={{ background: C.card, border: `1px solid ${C.line}`, borderRadius: 8,
              padding: "12px 16px", marginBottom: 16 }}>
            <div>
              <div style={{ fontFamily: FD, fontSize: 22, fontWeight: 700, color: C.green900,
                lineHeight: 1.1 }}>
                {tab === "reorder"
                  ? `${outCount} out · ${lowCount} low`
                  : `${nf(shown.length)} part${shown.length === 1 ? "" : "s"}`}
              </div>
              <div style={{ fontSize: 12.5, color: C.muted, marginTop: 2 }}>
                {tab === "reorder"
                  ? "At or below the reorder point. Out of stock first."
                  : `$${nf(value, 2)} on the shelf`}
              </div>
            </div>
            <div className="flex flex-wrap items-center" style={{ gap: 8 }}>
              <select value={shopFilter} onChange={(e) => setShopFilter(e.target.value)}
                style={{ ...inp, width: 180 }}>
                <option value="ALL">Every shop</option>
                {shops.map((s) => <option key={s} value={s}>{s}</option>)}
              </select>
              <input value={q} onChange={(e) => setQ(e.target.value)}
                placeholder="Find a part number or name" style={{ ...inp, width: 240 }} />
            </div>
          </div>

          {shown.length === 0 ? (
            <div style={{ background: C.card, border: `1px solid ${C.line}`, borderRadius: 8,
              padding: 28 }}>
              <div style={{ fontFamily: FD, fontSize: 22, fontWeight: 700, color: C.green900 }}>
                {tab === "reorder" ? "Nothing needs ordering" : "Nothing matches that"}
              </div>
              <p style={{ fontSize: 14, color: C.muted, marginTop: 6, lineHeight: 1.55 }}>
                {tab === "reorder"
                  ? "No tracked part is at or below its reorder point."
                  : "Try a part number, a description, or a bin."}
              </p>
            </div>
          ) : (
            <div style={{ background: C.card, border: `1px solid ${C.line}`, borderRadius: 8,
              overflow: "hidden" }}>
              <div style={{ overflowX: "auto" }}>
                <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 940 }}>
                  <thead>
                    <tr>
                      {["Part", "Description", "Shop", "Bin", "On hand", "Avail", "Min",
                        "Cost", "State", ""].map((h, i) => (
                        <th key={h || i}
                          style={{ ...th, textAlign: i >= 4 && i <= 7 ? "right" : "left" }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {shown.map((r) => (
                      <tr key={r.id} style={{ borderTop: `1px solid ${C.lineSoft}` }}>
                        <td style={{ ...td, fontFamily: FM, fontWeight: 600 }}>
                          <button onClick={() => setOpening(r)} style={{ ...linkBtn, fontFamily: FM }}>
                            {r.num}
                          </button>
                        </td>
                        <td style={td}>{r.name}</td>
                        <td style={{ ...td, color: C.muted }}>{r.shop}</td>
                        <td style={{ ...td, color: C.muted }}>{r.bin || "—"}</td>
                        <td style={{ ...td, ...tdNum, fontWeight: 600,
                          color: r.onHand <= 0 ? C.pull : C.ink }}>{nf(r.onHand)}</td>
                        <td style={{ ...td, ...tdNum, color: C.muted }}>{nf(r.available)}</td>
                        <td style={{ ...td, ...tdNum, color: C.muted }}>
                          {r.min == null ? "—" : nf(r.min)}
                        </td>
                        <td style={{ ...td, ...tdNum, color: C.muted }}>
                          {r.cost == null ? "—" : `$${nf(r.cost, 2)}`}
                        </td>
                        <td style={td}><StatePill state={r.state} /></td>
                        <td style={{ ...td, textAlign: "right", whiteSpace: "nowrap" }}>
                          <button disabled={busy} onClick={() => setMoving({ part: r, kind: "issue" })}
                            style={{ ...linkBtn, fontSize: 12.5 }}>Issue</button>
                          <span style={{ color: C.line }}> · </span>
                          <button disabled={busy} onClick={() => setMoving({ part: r, kind: "receive" })}
                            style={{ ...linkBtn, fontSize: 12.5 }}>Receive</button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </>
      )}

      {moving && (
        <MoveDialog {...moving} vehicles={vehicles} busy={busy}
          onClose={() => setMoving(null)}
          onSave={async (qty, extra) => {
            await run(() => parts.move(moving.part.id, moving.kind, qty, extra, who));
            setMoving(null);
          }} />
      )}
      {opening && (
        <PartDialog part={opening} busy={busy} who={who}
          onClose={() => setOpening(null)}
          onCount={async (to, note) => {
            await run(() => parts.setCount(opening.id, opening.onHand, to, note, who));
            setOpening(null);
          }}
          onSave={async (f) => { await run(() => parts.updatePart(opening.id, f)); setOpening(null); }} />
      )}
    </Body>
  );
}

function Body({ err, children }) {
  return (
    <>
      {err && (
        <div style={{ background: "#FDECEA", color: C.pull, borderBottom: `1px solid ${C.pull}33`,
          padding: "10px 20px", fontSize: 13, fontWeight: 600 }}>{err}</div>
      )}
      <div className="mx-auto w-full" style={{ maxWidth: 1400, padding: "20px 16px 60px" }}>
        {children}
      </div>
    </>
  );
}

function Empty() {
  return (
    <div style={{ background: C.card, border: `1px solid ${C.line}`, borderRadius: 8, padding: 28 }}>
      <div style={{ fontFamily: FD, fontSize: 22, fontWeight: 700, color: C.green900 }}>
        No parts yet
      </div>
      <p style={{ fontSize: 14, color: C.muted, marginTop: 6, maxWidth: 640, lineHeight: 1.55 }}>
        Export the parts list from the system the shop uses today and bring it in on the
        <strong> Import</strong> tab. It reads the column names rather than needing a fixed
        template, shows you exactly what it will do, and waits for you to say yes.
      </p>
    </div>
  );
}

/* ── Issue and receive ────────────────────────────────────────── */

function MoveDialog({ part, kind, vehicles, busy, onClose, onSave }) {
  const [qty, setQty] = useState("1");
  const [vehId, setVehId] = useState("");
  const [workOrder, setWorkOrder] = useState("");
  const [note, setNote] = useState("");
  const n = Number(qty);
  const issuing = kind === "issue";
  const after = issuing ? part.onHand - n : part.onHand + n;
  const short = issuing && n > part.available;

  return (
    <Modal title={issuing ? "Issue parts" : "Receive parts"}
      sub={`${part.num} · ${part.name || "no description"} · ${part.shop}`}
      onClose={onClose} width={520}>
      <div className="grid gap-3" style={{ gridTemplateColumns: "1fr 1fr" }}>
        <Field label={`How many (${part.uom})`}>
          <input type="number" step="1" min="1" autoFocus value={qty}
            onChange={(e) => setQty(e.target.value)}
            style={{ ...inp, fontFamily: FM, fontSize: 18 }} />
        </Field>
        <Field label="On hand after">
          <div style={{ fontFamily: FM, fontSize: 18, fontWeight: 600, padding: "8px 0",
            color: after < 0 ? C.pull : C.ink }}>
            {nf(part.onHand)} → {nf(after)}
          </div>
        </Field>
        {issuing && (
          <Field label="Onto which truck">
            <select value={vehId} onChange={(e) => setVehId(e.target.value)} style={inp}>
              <option value="">Not for a truck…</option>
              {vehicles.map((v) => <option key={v.id} value={v.id}>{v.num}</option>)}
            </select>
          </Field>
        )}
        <Field label="Work order">
          <input value={workOrder} onChange={(e) => setWorkOrder(e.target.value)}
            placeholder="optional" style={{ ...inp, fontFamily: FM }} />
        </Field>
        <div style={{ gridColumn: "1 / -1" }}>
          <Field label="Note">
            <input value={note} onChange={(e) => setNote(e.target.value)} placeholder="optional"
              style={inp} />
          </Field>
        </div>
      </div>

      {short && (
        <p style={{ fontSize: 12.5, color: C.watch, marginTop: 12, lineHeight: 1.5, fontWeight: 600 }}>
          That is more than the {nf(part.available)} available. It will still go through — the
          shelf is the truth and the count should follow it — but check the bin.
        </p>
      )}

      <div className="flex justify-end mt-4" style={{ gap: 8 }}>
        <Btn tone="ghost" onClick={onClose}>Cancel</Btn>
        <Btn disabled={busy || !(n > 0)} onClick={() => onSave(n, { vehId, workOrder, note })}>
          {issuing ? "Issue" : "Receive"}
        </Btn>
      </div>
    </Modal>
  );
}

/* ── One part: its details, its history, and a count ──────────── */

function PartDialog({ part, busy, onClose, onCount, onSave }) {
  const [txns, setTxns] = useState(null);
  const [counting, setCounting] = useState(false);
  const [counted, setCounted] = useState(String(part.onHand));
  const [f, setF] = useState({
    name: part.name, category: part.category, bin: part.bin,
    min: part.min ?? "", max: part.max ?? "", cost: part.cost ?? "",
  });
  const set = (k) => (e) => setF((p) => ({ ...p, [k]: e.target.value }));

  useEffect(() => {
    parts.listTxns(part.id).then(setTxns).catch(() => setTxns([]));
  }, [part.id]);

  return (
    <Modal title={part.num} sub={`${part.name || "no description"} · ${part.shop}`}
      onClose={onClose} width={640}>
      <div className="grid gap-3" style={{ gridTemplateColumns: "1fr 1fr 1fr" }}>
        <Field label="Description">
          <input value={f.name} onChange={set("name")} style={inp} /></Field>
        <Field label="Category">
          <input value={f.category} onChange={set("category")} style={inp} /></Field>
        <Field label="Bin">
          <input value={f.bin} onChange={set("bin")} style={inp} /></Field>
        <Field label="Reorder at">
          <input type="number" value={f.min} onChange={set("min")}
            style={{ ...inp, fontFamily: FM }} /></Field>
        <Field label="Order up to">
          <input type="number" value={f.max} onChange={set("max")}
            style={{ ...inp, fontFamily: FM }} /></Field>
        <Field label="Unit cost">
          <input type="number" step="0.01" value={f.cost} onChange={set("cost")}
            style={{ ...inp, fontFamily: FM }} /></Field>
      </div>

      <div className="flex flex-wrap items-center justify-between mt-4"
        style={{ gap: 10, borderTop: `1px solid ${C.lineSoft}`, paddingTop: 14 }}>
        <div style={{ fontFamily: FM, fontSize: 15 }}>
          <strong>{nf(part.onHand)}</strong> on hand
          <span style={{ color: C.muted }}> · {nf(part.available)} available</span>
        </div>
        {!counting
          ? <Btn tone="ghost" onClick={() => setCounting(true)}>Count the shelf</Btn>
          : (
            <div className="flex items-end" style={{ gap: 8 }}>
              <Field label="Actually on the shelf">
                <input type="number" autoFocus value={counted}
                  onChange={(e) => setCounted(e.target.value)}
                  style={{ ...inp, fontFamily: FM, width: 110 }} />
              </Field>
              <Btn tone="ghost" onClick={() => setCounting(false)}>Never mind</Btn>
              <Btn disabled={busy || Number(counted) === part.onHand}
                onClick={() => onCount(Number(counted), "Counted")}>
                Correct it
              </Btn>
            </div>
          )}
      </div>

      <div style={{ marginTop: 16 }}>
        <SectionLabel>Movements</SectionLabel>
        {txns === null ? (
          <div style={{ color: C.muted, fontSize: 13 }}>Loading…</div>
        ) : txns.length === 0 ? (
          <div style={{ color: C.muted, fontSize: 13 }}>Nothing has moved yet.</div>
        ) : (
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <tbody>
              {txns.map((t) => (
                <tr key={t.id} style={{ borderTop: `1px solid ${C.lineSoft}` }}>
                  <td style={{ ...td, whiteSpace: "nowrap", color: C.muted }}>
                    {fmtDate(String(t.at).slice(0, 10))}
                  </td>
                  <td style={{ ...td, textTransform: "capitalize" }}>{t.kind}</td>
                  <td style={{ ...td, ...tdNum, fontWeight: 600,
                    color: t.delta < 0 ? C.pull : C.good }}>
                    {t.delta > 0 ? "+" : ""}{nf(t.delta)}
                  </td>
                  <td style={{ ...td, color: C.muted }}>{t.note || t.workOrder || ""}</td>
                  <td style={{ ...td, color: C.muted, fontFamily: FM, fontSize: 11 }}>{t.who}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      <div className="flex justify-end mt-4" style={{ gap: 8 }}>
        <Btn tone="ghost" onClick={onClose}>Close</Btn>
        <Btn disabled={busy} onClick={() => onSave(f)}>Save details</Btn>
      </div>
    </Modal>
  );
}

/* ── CSV import ───────────────────────────────────────────────── */

const FIELDS = [
  ["num", "Part number", true],
  ["name", "Description", false],
  ["shop", "Shop", false],
  ["onHand", "On hand", true],
  ["category", "Category", false],
  ["uom", "Unit", false],
  ["allocated", "Allocated", false],
  ["onOrder", "On order", false],
  ["min", "Reorder at", false],
  ["max", "Order up to", false],
  ["bin", "Bin", false],
  ["cost", "Unit cost", false],
  ["tags", "Tags", false],
];

function ImportScreen({ existing, who, busy, onDone, setErr, setBusy }) {
  const [text, setText] = useState("");
  const [parsed, setParsed] = useState(null);
  const [mapping, setMapping] = useState({});
  const [defaultShop, setDefaultShop] = useState("");
  const [plan, setPlan] = useState(null);
  const [done, setDone] = useState(null);

  function read(t) {
    setText(t);
    setDone(null);
    setPlan(null);
    const p = parseCSV(t);
    if (!p.headers.length) { setParsed(null); return; }
    setParsed(p);
    setMapping(guessMapping(p.headers));
  }

  async function onFile(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    read(await file.text());
  }

  const canPlan = parsed && mapping.num && mapping.onHand
    && (mapping.shop || defaultShop.trim());

  return (
    <div className="grid gap-4" style={{ maxWidth: 980, gridTemplateColumns: "minmax(0,1fr)" }}>
      <Card title="Bring the parts list in"
        note="Export from whatever the shop uses today and drop the CSV here. Column names are read rather than dictated, and nothing is written until you have seen what it will do.">
        <div className="flex flex-wrap items-center" style={{ gap: 10 }}>
          <input type="file" accept=".csv,text/csv,text/plain" onChange={onFile}
            style={{ fontSize: 13 }} />
          <span style={{ fontSize: 12.5, color: C.muted }}>or paste it below</span>
        </div>
        <textarea value={text} onChange={(e) => read(e.target.value)} rows={5}
          placeholder="Part Number,Description,Shop,On Hand,Min…"
          style={{ ...inp, marginTop: 10, fontFamily: FM, fontSize: 12, resize: "vertical" }} />
      </Card>

      {parsed && (
        <Card title="Which column is which"
          note={`${parsed.rows.length} row${parsed.rows.length === 1 ? "" : "s"} read. Anything guessed wrong can be changed here.`}>
          <div className="grid gap-3" style={{ gridTemplateColumns: "repeat(auto-fit,minmax(220px,1fr))" }}>
            {FIELDS.map(([key, label, required]) => (
              <Field key={key} label={required ? `${label} (needed)` : label}>
                <select value={mapping[key] || ""}
                  onChange={(e) => setMapping((m) => ({ ...m, [key]: e.target.value }))}
                  style={{ ...inp, borderColor: required && !mapping[key] ? C.pull : C.line }}>
                  <option value="">— not in this file —</option>
                  {parsed.headers.map((h) => <option key={h} value={h}>{h}</option>)}
                </select>
              </Field>
            ))}
          </div>

          {!mapping.shop && (
            <div style={{ marginTop: 12, maxWidth: 320 }}>
              <Field label="No shop column — put everything at">
                <input value={defaultShop} onChange={(e) => setDefaultShop(e.target.value)}
                  placeholder="Clays Ferry Shop" style={inp} />
              </Field>
            </div>
          )}

          <div className="flex mt-4" style={{ gap: 8 }}>
            <Btn disabled={!canPlan}
              onClick={() => setPlan(planImport(parsed.rows, mapping, existing, defaultShop))}>
              See what this will do
            </Btn>
          </div>
        </Card>
      )}

      {plan && !done && (
        <Card title="What this will do"
          note="Nothing has been written yet. Quantities land as import movements, so the change is in the log rather than overwriting the count silently.">
          <div className="flex flex-wrap" style={{ gap: 22, marginBottom: 12 }}>
            <Count n={plan.create.length} label="new parts" />
            <Count n={plan.change.length} label="quantity changes" tone={C.watch} />
            <Count n={plan.same.length} label="already matching" />
            <Count n={plan.bad.length} label="rows skipped" tone={plan.bad.length ? C.pull : C.muted} />
          </div>

          {plan.bad.length > 0 && (
            <div style={{ background: "#FDECEA", border: `1px solid ${C.pull}33`, borderRadius: 6,
              padding: "10px 12px", marginBottom: 12, fontSize: 12.5, lineHeight: 1.6 }}>
              <strong>These rows will be skipped:</strong>
              <div style={{ fontFamily: FM, fontSize: 11.5, marginTop: 4 }}>
                {plan.bad.slice(0, 8).map((b) => (
                  <div key={b.line}>line {b.line} — {b.why}</div>
                ))}
                {plan.bad.length > 8 && <div>…and {plan.bad.length - 8} more</div>}
              </div>
            </div>
          )}

          {plan.change.length > 0 && (
            <div style={{ overflowX: "auto", marginBottom: 12 }}>
              <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 560 }}>
                <thead>
                  <tr>{["Part", "Shop", "We have", "File says", "Change"].map((h, i) => (
                    <th key={h} style={{ ...th, textAlign: i >= 2 ? "right" : "left" }}>{h}</th>
                  ))}</tr>
                </thead>
                <tbody>
                  {plan.change.slice(0, 15).map((c, i) => (
                    <tr key={i} style={{ borderTop: `1px solid ${C.lineSoft}` }}>
                      <td style={{ ...td, fontFamily: FM }}>{c.fields.num}</td>
                      <td style={{ ...td, color: C.muted }}>{c.fields.shop}</td>
                      <td style={{ ...td, ...tdNum, color: C.muted }}>{nf(c.part.onHand)}</td>
                      <td style={{ ...td, ...tdNum }}>{nf(c.fields.onHand)}</td>
                      <td style={{ ...td, ...tdNum, fontWeight: 600,
                        color: c.delta < 0 ? C.pull : C.good }}>
                        {c.delta > 0 ? "+" : ""}{nf(c.delta)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {plan.change.length > 15 && (
                <div style={{ fontSize: 12, color: C.muted, marginTop: 6 }}>
                  …and {plan.change.length - 15} more.
                </div>
              )}
            </div>
          )}

          <div className="flex justify-end" style={{ gap: 8 }}>
            <Btn tone="ghost" onClick={() => setPlan(null)}>Back</Btn>
            <Btn disabled={busy || (!plan.create.length && !plan.change.length)}
              onClick={async () => {
                setBusy(true);
                try {
                  const res = await parts.runImport(plan, who);
                  setDone(res);
                  setPlan(null);
                  await onDone();
                  setErr(null);
                } catch (e) {
                  setErr(`The import stopped — ${e.message || e}`);
                } finally {
                  setBusy(false);
                }
              }}>
              Import {plan.create.length + plan.change.length} part
              {plan.create.length + plan.change.length === 1 ? "" : "s"}
            </Btn>
          </div>
        </Card>
      )}

      {done && (
        <Card title="Imported"
          note="Every quantity change is in each part's movement log as an import.">
          <div className="flex flex-wrap" style={{ gap: 22 }}>
            <Count n={done.created} label="parts created" />
            <Count n={done.changed} label="quantities corrected" />
            <Count n={done.untouched} label="already matching" />
          </div>
        </Card>
      )}
    </div>
  );
}

function Count({ n, label, tone }) {
  return (
    <div>
      <div style={{ fontFamily: FM, fontSize: 24, fontWeight: 600, color: tone || C.green900,
        lineHeight: 1.1 }}>{nf(n)}</div>
      <div style={{ fontFamily: FD, fontSize: 11.5, fontWeight: 600, letterSpacing: "0.09em",
        textTransform: "uppercase", color: C.muted, marginTop: 2 }}>{label}</div>
    </div>
  );
}
