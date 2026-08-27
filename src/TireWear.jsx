import React, { useState, useEffect, useMemo, useCallback } from "react";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell,
  LineChart, Line,
} from "recharts";
import { C, FD, FB, FM } from "./theme.js";
import {
  todayISO, nf, fmtDate, toCSV,
  Modal, Btn, Field, Stat, SectionLabel, Card,
  inp, th, td, tdNum, linkBtn,
} from "./ui.jsx";
import * as db from "./data.js";

/* ────────────────────────────────────────────────────────────────
   THE ALLEN COMPANY · HAUL DIVISION — TIRE WEAR
   Tread depth tracking + miles-per-32nd wear rate

   Fleet, tires, readings and mileage live in Supabase, so what the
   shop enters is what the office sees. The wear math itself lives in
   the tw_tire_wear view — see data.js.
   ──────────────────────────────────────────────────────────────── */

/* ── Axle configurations ──────────────────────────────────────── */
const CONFIGS = {
  dump12: { label: "12-tire dump · steer + pusher + tandem", axles: [
    { n: 1, dual: false, role: "Steer" }, { n: 2, dual: false, role: "Pusher" },
    { n: 3, dual: true, role: "Drive" }, { n: 4, dual: true, role: "Drive" }] },
  quad14: { label: "14-tire · steer + 2 pushers + tandem", axles: [
    { n: 1, dual: false, role: "Steer" }, { n: 2, dual: false, role: "Pusher" },
    { n: 3, dual: false, role: "Pusher" }, { n: 4, dual: true, role: "Drive" },
    { n: 5, dual: true, role: "Drive" }] },
  tandem10: { label: "10-tire tractor · steer + tandem drive", axles: [
    { n: 1, dual: false, role: "Steer" }, { n: 2, dual: true, role: "Drive" },
    { n: 3, dual: true, role: "Drive" }] },
  single6: { label: "6-tire · steer + single drive", axles: [
    { n: 1, dual: false, role: "Steer" }, { n: 2, dual: true, role: "Drive" }] },
  light4: { label: "4-tire · light duty", axles: [
    { n: 1, dual: false, role: "Front" }, { n: 2, dual: false, role: "Rear" }] },
};

function positionsFor(cfgKey) {
  const cfg = CONFIGS[cfgKey] || CONFIGS.dump12;
  const out = [];
  cfg.axles.forEach((a) => {
    if (a.dual) {
      out.push(
        { id: `${a.n}RO`, axle: a.n, side: "R", slot: "O", role: a.role },
        { id: `${a.n}RI`, axle: a.n, side: "R", slot: "I", role: a.role },
        { id: `${a.n}LI`, axle: a.n, side: "L", slot: "I", role: a.role },
        { id: `${a.n}LO`, axle: a.n, side: "L", slot: "O", role: a.role }
      );
    } else {
      out.push(
        { id: `${a.n}R`, axle: a.n, side: "R", slot: "S", role: a.role },
        { id: `${a.n}L`, axle: a.n, side: "L", slot: "S", role: a.role }
      );
    }
  });
  return out;
}

/* ── Helpers ──────────────────────────────────────────────────── */
const MILS_PER_32ND = 31.25;

const DEFAULTS = { pullSteer: 6, pullOther: 4, newDepth: 28, unit: "32nd" };

function statusOf(depth, pull) {
  if (depth === null || depth === undefined) return "none";
  if (depth <= pull) return "pull";
  if (depth <= pull + 3) return "watch";
  return "good";
}
const STATUS_COLOR = { good: C.good, watch: C.watch, pull: C.pull, none: "#94A3B8" };
/* Same statuses, lifted for the dark green tire card on the diagram. */
const STATUS_ON_DARK = {
  good: C.goodOnDark, watch: C.watchOnDark, pull: C.pullOnDark, none: C.noneOnDark,
};
const STATUS_LABEL = { good: "In service", watch: "Monitor", pull: "Pull", none: "No reading" };

/* ── The Tires section ────────────────────────────────────────── */
/* The shell owns the page chrome, which tab is showing, and the Saving…
   indicator. Everything below that is the tire app as it was. */
export default function TireWear({ who, tab, onBusy }) {

  const [ready, setReady] = useState(false);
  const [err, setErr] = useState(null);
  const [busy, setBusy] = useState(false);
  const [sel, setSel] = useState(null);
  const [q, setQ] = useState("");
  const [divFilter, setDivFilter] = useState("ALL");

  const [fleet, setFleet] = useState([]);
  const [tires, setTires] = useState([]);
  const [readings, setReadings] = useState([]);
  const [odos, setOdos] = useState([]);
  const [wear, setWear] = useState({});
  const [brands, setBrands] = useState([]);
  const [settings, setSettings] = useState(DEFAULTS);

  const reload = useCallback(async () => {
    const d = await db.loadAll();
    setFleet(d.vehicles);
    setTires(d.tires);
    setReadings(d.readings);
    setOdos(d.odos);
    setWear(d.wear);
    setBrands(d.brands);
    setSettings({ ...DEFAULTS, ...d.settings });
  }, []);

  useEffect(() => {
    (async () => {
      try {
        await reload();
      } catch (e) {
        setErr(`Could not load the tire records — ${e.message || e}`);
      }
      setReady(true);
    })();
  }, [reload]);

  /* The Saving… chip lives in the shell header, so tell it when we are
     mid-write. Clear it on the way out or it sticks on after a switch. */
  useEffect(() => {
    onBusy?.(busy);
    return () => onBusy?.(false);
  }, [busy, onBusy]);

  /* Every change is written to the database and then read back. The
     wear numbers come out of a view, so reading back is what keeps the
     screen and the database from ever disagreeing. */
  const run = useCallback(async (fn) => {
    setBusy(true);
    try {
      await fn();
      await reload();
      setErr(null);
    } catch (e) {
      setErr(`That did not save — ${e.message || e}`);
    } finally {
      setBusy(false);
    }
  }, [reload]);

  const actions = useMemo(() => ({
    setVehicleConfig: (vehId, cfg) => run(() => db.setVehicleConfig(vehId, cfg)),
    mountTire: (vehId, t) => run(() => db.mountTire(vehId, t, who)),
    pullTire: (tireId, off) => run(() => db.pullTire(tireId, off)),
    setTireNotes: (tireId, notes) => run(() => db.setTireNotes(tireId, notes)),
    saveInspection: (vehId, date, odo, entries) =>
      run(() => db.saveInspection(vehId, date, odo, entries, who)),
    deleteReading: (id) => run(() => db.deleteReading(id)),
    logOdometer: (vehId, date, odo) => run(() => db.logOdometer(vehId, date, odo, who)),
    updateSettings: (patch) => run(() => db.updateSettings(patch)),
    eraseAll: () => run(() => db.eraseAll()),
  }), [run, who]);

  const byNum = useMemo(() => Object.fromEntries(fleet.map((v) => [v.num, v])), [fleet]);

  const readingsByTire = useMemo(() => {
    const m = {};
    readings.forEach((r) => { (m[r.tire] ||= []).push(r); });
    Object.values(m).forEach((a) => a.sort((x, y) => x.odo - y.odo));
    return m;
  }, [readings]);

  /* Per tire: the point series the chart draws, plus the rate straight
     from tw_tire_wear. Only the pull threshold is applied here — the
     wear arithmetic itself stays in the view. */
  const tireStats = useMemo(() => {
    const m = {};
    tires.forEach((t) => {
      const pts = [];
      if (t.onOdo != null && t.newDepth != null)
        pts.push({ odo: +t.onOdo, d: +t.newDepth, date: t.onDate, mount: true });
      (readingsByTire[t.id] || []).forEach((r) =>
        pts.push({ odo: +r.odo, d: +r.d, date: r.date, rid: r.id }));
      pts.sort((a, b) => a.odo - b.odo);
      const last = pts[pts.length - 1] || null;
      const first = pts[0] || null;
      const w = wear[t.id] || {};
      const depth = w.depth != null ? w.depth : last ? last.d : null;
      const isSteer = /^1[LR]$/.test(t.pos);
      const pull = isSteer ? settings.pullSteer : settings.pullOther;
      const miPer32 = w.miPer32 ?? null;
      const remain =
        depth != null && miPer32 ? Math.max(0, (depth - pull) * miPer32) : null;
      m[t.id] = {
        pts, first, last, miPer32,
        miPerMil: w.miPerMil ?? null,
        worn: w.worn ?? null,
        miles: w.miles ?? null,
        pull, remain, depth,
        status: statusOf(depth, pull),
      };
    });
    return m;
  }, [tires, readingsByTire, wear, settings]);

  const activeTireAt = useMemo(() => {
    const m = {};
    tires.forEach((t) => { if (!t.offDate) m[`${t.veh}|${t.pos}`] = t; });
    return m;
  }, [tires]);

  const lastOdoFor = useMemo(() => {
    const m = {};
    odos.forEach((o) => {
      if (!m[o.veh] || o.odo > m[o.veh].odo) m[o.veh] = o;
    });
    return m;
  }, [odos]);

  const vehSummary = useMemo(() => {
    const m = {};
    fleet.forEach((v) => {
      const pos = positionsFor(v.cfg);
      const ts = pos.map((p) => activeTireAt[`${v.num}|${p.id}`]).filter(Boolean);
      let worst = null, worstT = null, lastDate = null;
      ts.forEach((t) => {
        const s = tireStats[t.id];
        if (s && s.depth != null && (worst === null || s.depth < worst)) {
          worst = s.depth; worstT = t;
        }
        if (s && s.last && (!lastDate || s.last.date > lastDate)) lastDate = s.last.date;
      });
      const pulls = ts.filter((t) => tireStats[t.id]?.status === "pull").length;
      const watches = ts.filter((t) => tireStats[t.id]?.status === "watch").length;
      m[v.num] = {
        tracked: ts.length, total: pos.length, worst, worstT, lastDate, pulls, watches,
        odo: lastOdoFor[v.num]?.odo ?? null, odoDate: lastOdoFor[v.num]?.date ?? null,
      };
    });
    return m;
  }, [fleet, activeTireAt, tireStats, lastOdoFor]);

  const filtered = useMemo(() => {
    const s = q.trim().toLowerCase();
    return fleet.filter((v) => {
      if (divFilter !== "ALL" && v.div !== divFilter) return false;
      if (!s) return true;
      return `${v.num} ${v.make} ${v.model} ${v.year}`.toLowerCase().includes(s);
    });
  }, [fleet, q, divFilter]);

  const attention = useMemo(() => {
    const rows = [];
    Object.entries(vehSummary).forEach(([num, s]) => {
      if (s.pulls > 0 || s.watches > 0) rows.push({ num, ...s });
    });
    rows.sort((a, b) => b.pulls - a.pulls || (a.worst ?? 99) - (b.worst ?? 99));
    return rows;
  }, [vehSummary]);

  if (!ready)
    return (
      <div style={{ padding: 40, color: C.muted }}>Loading the fleet…</div>
    );

  return (
    <>
      {err && (
        <div style={{ background: "#FDECEA", color: C.pull, borderBottom: `1px solid ${C.pull}33`,
          padding: "10px 20px", fontSize: 13, fontWeight: 600 }}>{err}</div>
      )}
      <div className="mx-auto w-full" style={{ maxWidth: 1400, padding: "20px 16px 60px" }}>
        {tab === "fleet" && (
          <FleetView
            {...{ filtered, vehSummary, sel, setSel, q, setQ, divFilter, setDivFilter,
              byNum, activeTireAt, tireStats, settings, attention, brands,
              actions, busy, lastOdoFor }}
          />
        )}
        {tab === "analysis" && (
          <Analysis {...{ tires, tireStats, settings, byNum }} />
        )}
        {tab === "settings" && (
          <Settings {...{ settings, tires, readings, odos, tireStats, actions, busy }} />
        )}
      </div>
    </>
  );
}

/* ── Fleet view ───────────────────────────────────────────────── */
function FleetView(props) {
  const { filtered, vehSummary, sel, setSel, q, setQ, divFilter, setDivFilter,
    byNum, activeTireAt, tireStats, settings, attention, brands,
    actions, busy, lastOdoFor } = props;

  const dtCount = filtered.filter((v) => v.div === "DT").length;

  return (
    <div className="grid gap-4" style={{ gridTemplateColumns: "minmax(0,1fr)" }}>
      <div className="grid gap-4 rail-grid" style={{ gridTemplateColumns: "300px minmax(0,1fr)" }}>
        {/* Left rail */}
        <div className="hidden md:block">
          <div style={{ background: C.card, border: `1px solid ${C.line}`, borderRadius: 8,
            overflow: "hidden", position: "sticky", top: 12 }}>
            <div style={{ padding: 10, borderBottom: `1px solid ${C.lineSoft}` }}>
              <input value={q} onChange={(e) => setQ(e.target.value)}
                placeholder="Find a truck number"
                style={{ width: "100%", padding: "8px 10px", border: `1px solid ${C.line}`,
                  borderRadius: 5, fontSize: 14, fontFamily: FB, outline: "none" }} />
              <div className="flex mt-2" style={{ gap: 4 }}>
                {["ALL", "DT", "HT"].map((d) => (
                  <button key={d} onClick={() => setDivFilter(d)}
                    style={{ flex: 1, fontFamily: FD, fontSize: 13, fontWeight: 600,
                      letterSpacing: "0.08em", padding: "6px 0", borderRadius: 4, cursor: "pointer",
                      border: `1px solid ${divFilter === d ? C.green700 : C.line}`,
                      background: divFilter === d ? C.green700 : "#fff",
                      color: divFilter === d ? "#fff" : C.muted }}>{d}</button>
                ))}
              </div>
              <div style={{ fontSize: 11, color: C.muted, marginTop: 7, fontFamily: FM }}>
                {filtered.length} trucks · {dtCount} DT · {filtered.length - dtCount} HT
              </div>
            </div>
            <div style={{ maxHeight: "calc(100vh - 230px)", overflowY: "auto" }}>
              {filtered.map((v) => (
                <VehRow key={v.num} v={v} s={vehSummary[v.num]} active={sel === v.num}
                  onClick={() => setSel(v.num)} />
              ))}
            </div>
          </div>
        </div>

        {/* Right pane */}
        <div style={{ minWidth: 0 }}>
          {/* Mobile picker */}
          <div className="md:hidden mb-3" style={{ background: C.card, border: `1px solid ${C.line}`,
            borderRadius: 8, padding: 10 }}>
            <select value={sel || ""} onChange={(e) => setSel(e.target.value || null)}
              style={{ width: "100%", padding: "9px 10px", border: `1px solid ${C.line}`,
                borderRadius: 5, fontSize: 15, fontFamily: FB, background: "#fff" }}>
              <option value="">Choose a truck…</option>
              {filtered.map((v) => (
                <option key={v.num} value={v.num}>
                  {v.num} — {v.make} {v.model}
                </option>
              ))}
            </select>
          </div>

          {sel ? (
            <VehicleDetail
              key={sel}
              v={byNum[sel]} summary={vehSummary[sel]}
              {...{ activeTireAt, tireStats, settings, brands, actions, busy, lastOdoFor }}
            />
          ) : (
            <StartHere attention={attention} setSel={setSel} byNum={byNum} />
          )}
        </div>
      </div>
    </div>
  );
}

function VehRow({ v, s, active, onClick }) {
  const dot = s?.pulls ? C.pull : s?.watches ? C.watch : s?.tracked ? C.good : "#CBD5E1";
  return (
    <button onClick={onClick}
      style={{ width: "100%", textAlign: "left", padding: "9px 11px", cursor: "pointer",
        border: "none", borderBottom: `1px solid ${C.lineSoft}`,
        borderLeft: `3px solid ${active ? C.yellow : "transparent"}`,
        background: active ? "#F2F7F3" : "#fff", display: "block" }}>
      <div className="flex items-center justify-between" style={{ gap: 8 }}>
        <span style={{ fontFamily: FM, fontWeight: 600, fontSize: 13.5, color: C.green900 }}>
          {v.num}
        </span>
        <span style={{ width: 8, height: 8, borderRadius: 8, background: dot, flexShrink: 0 }} />
      </div>
      <div style={{ fontSize: 11.5, color: C.muted, marginTop: 1 }}>
        {v.make} {v.model} {v.year && `· ${v.year}`}
      </div>
      <div style={{ fontFamily: FM, fontSize: 10.5, color: C.muted, marginTop: 2 }}>
        {s?.odo != null ? `${nf(s.odo)} mi` : "no mileage"}
        {s?.tracked ? ` · ${s.tracked}/${s.total} tires` : ""}
        {s?.worst != null ? ` · low ${s.worst}/32` : ""}
      </div>
    </button>
  );
}

function StartHere({ attention, setSel, byNum }) {
  return (
    <div style={{ background: C.card, border: `1px solid ${C.line}`, borderRadius: 8, padding: 24 }}>
      <div style={{ fontFamily: FD, fontSize: 22, fontWeight: 700, color: C.green900 }}>
        Pick a truck to get started
      </div>
      <p style={{ fontSize: 14, color: C.muted, marginTop: 6, maxWidth: 620, lineHeight: 1.55 }}>
        Every active DT and HT unit is loaded from Motive. Open a truck, mount its tires by
        position, then log a walk-around: one odometer reading plus a tread depth for each wheel.
        Two readings on a tire is all it takes to start showing miles per 32nd.
      </p>

      {attention.length > 0 && (
        <div style={{ marginTop: 22 }}>
          <SectionLabel>Needs attention</SectionLabel>
          <div className="grid gap-2" style={{ gridTemplateColumns: "repeat(auto-fill,minmax(220px,1fr))" }}>
            {attention.slice(0, 12).map((r) => (
              <button key={r.num} onClick={() => setSel(r.num)}
                style={{ textAlign: "left", padding: "10px 12px", borderRadius: 6, cursor: "pointer",
                  border: `1px solid ${r.pulls ? C.pull + "55" : C.watch + "55"}`,
                  background: r.pulls ? "#FDF3F2" : "#FDF9EF" }}>
                <div style={{ fontFamily: FM, fontWeight: 600, fontSize: 13.5, color: C.green900 }}>
                  {r.num}
                </div>
                <div style={{ fontSize: 12, color: r.pulls ? C.pull : C.watch, fontWeight: 600, marginTop: 2 }}>
                  {r.pulls ? `${r.pulls} at pull depth` : `${r.watches} to monitor`}
                </div>
                <div style={{ fontFamily: FM, fontSize: 11, color: C.muted, marginTop: 1 }}>
                  low {r.worst}/32 · {byNum[r.num]?.make}
                </div>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

/* ── Vehicle detail ───────────────────────────────────────────── */
function VehicleDetail(props) {
  const { v, summary, activeTireAt, tireStats, settings, brands,
    actions, busy, lastOdoFor } = props;

  const [mode, setMode] = useState("view"); // view | inspect
  const [openTire, setOpenTire] = useState(null);
  const [mountPos, setMountPos] = useState(null);
  const [odoOpen, setOdoOpen] = useState(false);

  const positions = positionsFor(v.cfg);
  const lastOdo = lastOdoFor[v.num]?.odo ?? null;

  // Inspection draft
  const [insDate, setInsDate] = useState(todayISO());
  const [insOdo, setInsOdo] = useState("");
  const [draft, setDraft] = useState({});

  function startInspection() {
    setInsDate(todayISO());
    setInsOdo(lastOdo != null ? String(lastOdo) : "");
    setDraft({});
    setMode("inspect");
  }

  async function saveInspection() {
    const odo = Number(insOdo);
    if (!odo || odo <= 0) return;
    const entries = [];
    Object.entries(draft).forEach(([pos, val]) => {
      if (val === "" || val == null) return;
      const t = activeTireAt[`${v.num}|${pos}`];
      if (!t) return;
      entries.push({ tireId: t.id, depth: Number(val) });
    });
    await actions.saveInspection(v.id, insDate, odo, entries);
    setMode("view");
  }

  const filled = Object.values(draft).filter((x) => x !== "" && x != null).length;
  const mountable = positions.filter((p) => activeTireAt[`${v.num}|${p.id}`]).length;

  return (
    <div className="grid gap-4">
      {/* Vehicle header card */}
      <div style={{ background: C.card, border: `1px solid ${C.line}`, borderRadius: 8, overflow: "hidden" }}>
        <div className="flex flex-wrap items-start justify-between gap-3"
          style={{ padding: "14px 16px", borderBottom: `1px solid ${C.lineSoft}` }}>
          <div>
            <div className="flex items-baseline" style={{ gap: 10 }}>
              <span style={{ fontFamily: FD, fontSize: 30, fontWeight: 700, color: C.green900, lineHeight: 1 }}>
                {v.num}
              </span>
              <span style={{ fontSize: 13.5, color: C.muted }}>
                {v.make} {v.model} {v.year && `· ${v.year}`}
              </span>
            </div>
            <div className="flex flex-wrap items-center mt-2" style={{ gap: 14 }}>
              <Stat label="Odometer" value={lastOdo != null ? nf(lastOdo) : "—"} unit="mi"
                sub={summary?.odoDate ? fmtDate(summary.odoDate) : "not logged"} />
              <Stat label="Tires mounted" value={`${mountable}`} unit={`/ ${positions.length}`} />
              <Stat label="Lowest tread" value={summary?.worst != null ? summary.worst : "—"}
                unit="/32" sub={summary?.worstT ? summary.worstT.pos : ""}
                color={summary?.worst != null
                  ? STATUS_COLOR[statusOf(summary.worst, settings.pullOther)] : undefined} />
              <Stat label="Last checked" value={summary?.lastDate ? fmtDate(summary.lastDate) : "—"} />
            </div>
          </div>
          <div className="flex flex-wrap items-center" style={{ gap: 8 }}>
            <select value={v.cfg} onChange={(e) => actions.setVehicleConfig(v.id, e.target.value)}
              style={{ padding: "7px 8px", border: `1px solid ${C.line}`, borderRadius: 5,
                fontSize: 12.5, fontFamily: FB, background: "#fff", maxWidth: 240 }}>
              {Object.entries(CONFIGS).map(([k, c]) => (
                <option key={k} value={k}>{c.label}</option>
              ))}
            </select>
            <Btn onClick={() => setOdoOpen(true)} tone="ghost">Log mileage</Btn>
            {mode === "view"
              ? <Btn onClick={startInspection} disabled={mountable === 0}>Record tread</Btn>
              : <Btn onClick={() => setMode("view")} tone="ghost">Cancel</Btn>}
          </div>
        </div>

        {mode === "inspect" && (
          <div className="flex flex-wrap items-end gap-3"
            style={{ padding: "12px 16px", background: "#F4FAF6", borderBottom: `1px solid ${C.lineSoft}` }}>
            <Field label="Date">
              <input type="date" value={insDate} onChange={(e) => setInsDate(e.target.value)} style={inp} />
            </Field>
            <Field label="Odometer (mi)">
              <input type="number" inputMode="numeric" value={insOdo}
                onChange={(e) => setInsOdo(e.target.value)} placeholder={lastOdo != null ? nf(lastOdo) : "0"}
                style={{ ...inp, fontFamily: FM, width: 130 }} />
            </Field>
            {lastOdo != null && Number(insOdo) > 0 && (
              <div style={{ fontFamily: FM, fontSize: 12, color: C.muted, paddingBottom: 8 }}>
                {Number(insOdo) - lastOdo >= 0
                  ? `+${nf(Number(insOdo) - lastOdo)} mi since last`
                  : "below last reading"}
              </div>
            )}
            <div style={{ flex: 1 }} />
            <div style={{ fontFamily: FM, fontSize: 12, color: C.muted, paddingBottom: 8 }}>
              {filled}/{mountable} entered
            </div>
            <Btn onClick={saveInspection} disabled={busy || !Number(insOdo) || filled === 0}>
              Save {filled > 0 ? `${filled} reading${filled > 1 ? "s" : ""}` : "readings"}
            </Btn>
          </div>
        )}

        {/* The diagram */}
        <div style={{ padding: "18px 12px 22px", overflowX: "auto" }}>
          <TruckDiagram
            v={v} positions={positions} activeTireAt={activeTireAt} tireStats={tireStats}
            settings={settings} mode={mode} draft={draft} setDraft={setDraft}
            onTire={(t) => setOpenTire(t)} onEmpty={(pos) => setMountPos(pos)}
          />
        </div>
      </div>

      {/* Position table */}
      <PositionTable
        v={v} positions={positions} activeTireAt={activeTireAt} tireStats={tireStats}
        settings={settings} onTire={setOpenTire} onEmpty={setMountPos}
      />

      {mountPos && (
        <MountDialog pos={mountPos} veh={v.num} lastOdo={lastOdo} settings={settings}
          brands={brands} busy={busy}
          onClose={() => setMountPos(null)}
          onSave={async (t) => { await actions.mountTire(v.id, t); setMountPos(null); }} />
      )}
      {openTire && (
        /* Re-read the tire from the freshly loaded list each render, so a
           saved note shows up in the dialog that just saved it. */
        <TireDialog
          tire={activeTireAt[`${v.num}|${openTire.pos}`] || openTire}
          stats={tireStats[openTire.id]} settings={settings}
          busy={busy}
          onClose={() => setOpenTire(null)}
          onPull={async (off) => {
            await actions.pullTire(openTire.id, off);
            setOpenTire(null);
          }}
          onSaveNotes={(notes) => actions.setTireNotes(openTire.id, notes)}
          onDeleteReading={(rid) => actions.deleteReading(rid)} />
      )}
      {odoOpen && (
        <OdoDialog veh={v.num} lastOdo={lastOdo} busy={busy}
          onClose={() => setOdoOpen(false)}
          onSave={async (o) => {
            await actions.logOdometer(v.id, o.date, o.odo);
            setOdoOpen(false);
          }} />
      )}
    </div>
  );
}

/* ── Truck diagram — overhead, nose left, R side up ───────────── */
function TruckDiagram({ v, positions, activeTireAt, tireStats, settings, mode, draft, setDraft, onTire, onEmpty }) {
  const axles = (CONFIGS[v.cfg] || CONFIGS.dump12).axles;
  const CARD_W = 150;
  const GAP = 10;

  const rowFor = (axle, side, slot) =>
    positions.find((p) => p.axle === axle.n && p.side === side && p.slot === slot);

  const cell = (p) => {
    if (!p) return <div style={{ height: 62 }} />;
    const t = activeTireAt[`${v.num}|${p.id}`];
    return (
      <TireCard key={p.id} pos={p} tire={t} stats={t ? tireStats[t.id] : null}
        settings={settings} mode={mode} draft={draft} setDraft={setDraft}
        onTire={onTire} onEmpty={onEmpty} width={CARD_W} />
    );
  };

  return (
    <div className="flex items-stretch" style={{ gap: 14, minWidth: axles.length * (CARD_W + GAP) + 60 }}>
      {/* FRONT marker */}
      <div className="flex flex-col items-center justify-center" style={{ width: 26, flexShrink: 0 }}>
        <div style={{ fontFamily: FD, fontSize: 11, letterSpacing: "0.2em", color: C.muted,
          writingMode: "vertical-rl", transform: "rotate(180deg)", textTransform: "uppercase" }}>
          Front
        </div>
        <div style={{ width: 0, height: 0, borderTop: "7px solid transparent",
          borderBottom: "7px solid transparent", borderRight: `9px solid ${C.yellow}`, marginTop: 6 }} />
      </div>

      <div className="flex" style={{ gap: GAP }}>
        {axles.map((a) => {
          const RO = a.dual ? rowFor(a, "R", "O") : rowFor(a, "R", "S");
          const RI = a.dual ? rowFor(a, "R", "I") : null;
          const LI = a.dual ? rowFor(a, "L", "I") : null;
          const LO = a.dual ? rowFor(a, "L", "O") : rowFor(a, "L", "S");
          return (
            <div key={a.n} className="flex flex-col" style={{ gap: 6, width: CARD_W }}>
              {cell(RO)}
              {a.dual ? cell(RI) : <div style={{ height: 62 }} />}
              {/* axle bar */}
              <div className="flex flex-col items-center" style={{ padding: "4px 0" }}>
                <div style={{ width: 14, height: 30, background: "#C7D0DA", borderRadius: 3 }} />
                <div style={{ fontFamily: FD, fontSize: 12, fontWeight: 600, letterSpacing: "0.1em",
                  color: C.green700, textTransform: "uppercase", marginTop: 5 }}>
                  {a.role}
                </div>
                <div style={{ fontFamily: FM, fontSize: 10, color: C.muted }}>axle {a.n}</div>
                <div style={{ width: 14, height: 30, background: "#C7D0DA", borderRadius: 3, marginTop: 5 }} />
              </div>
              {a.dual ? cell(LI) : <div style={{ height: 62 }} />}
              {cell(LO)}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function TireCard({ pos, tire, stats, settings, mode, draft, setDraft, onTire, onEmpty, width }) {
  const st = stats?.status || "none";
  const col = STATUS_COLOR[st];      // the solid badge, white text on it
  const colOnDark = STATUS_ON_DARK[st]; // the tread numeral, on the card itself
  const inspecting = mode === "inspect" && tire;

  if (!tire) {
    return (
      <button onClick={() => onEmpty(pos)}
        style={{ width, height: 62, borderRadius: 6, cursor: "pointer",
          border: `1px dashed ${C.line}`, background: "#FAFDFB", color: C.muted,
          display: "flex", alignItems: "center", justifyContent: "center", gap: 8 }}>
        <span style={{ fontFamily: FM, fontWeight: 600, fontSize: 12, color: "#94A3B8" }}>{pos.id}</span>
        <span style={{ fontSize: 12 }}>Mount tire</span>
      </button>
    );
  }

  return (
    <div style={{ width, height: 62, borderRadius: 6, background: C.green900,
      border: `1px solid ${C.green800}`, display: "flex", overflow: "hidden" }}>
      <div style={{ width: 34, background: col, color: "#fff", display: "flex",
        alignItems: "center", justifyContent: "center", fontFamily: FM, fontWeight: 600,
        fontSize: 11.5, flexShrink: 0, letterSpacing: "-0.02em" }}>
        {pos.id}
      </div>
      {inspecting ? (
        <div className="flex items-center" style={{ flex: 1, padding: "0 8px", gap: 6 }}>
          <input
            type="number" step="0.5" inputMode="decimal"
            value={draft[pos.id] ?? ""}
            onChange={(e) => setDraft((p) => ({ ...p, [pos.id]: e.target.value }))}
            placeholder={stats?.depth != null ? String(stats.depth) : "--"}
            style={{ width: 58, padding: "5px 6px", borderRadius: 4, border: `1px solid ${C.green600}`,
              background: C.wellDark, color: "#fff", fontFamily: FM, fontWeight: 600, fontSize: 16,
              textAlign: "center", outline: "none" }} />
          <div style={{ fontFamily: FM, fontSize: 11, color: C.onDarkSoft, lineHeight: 1.25 }}>
            /32<br />
            <span style={{ fontSize: 10 }}>was {stats?.depth ?? "—"}</span>
          </div>
        </div>
      ) : (
        <button onClick={() => onTire(tire)}
          style={{ flex: 1, background: "transparent", border: "none", cursor: "pointer",
            textAlign: "left", padding: "5px 9px", color: "#fff", minWidth: 0 }}>
          <div className="flex items-baseline justify-between" style={{ gap: 6 }}>
            <span style={{ fontFamily: FM, fontWeight: 600, fontSize: 18, color: colOnDark, lineHeight: 1 }}>
              {stats?.depth != null ? stats.depth : "—"}
              <span style={{ fontSize: 10, color: C.onDarkSoft, fontWeight: 400 }}>/32</span>
            </span>
            <span style={{ fontFamily: FM, fontSize: 10, color: C.onDarkSoft }}>
              {stats?.miPer32 ? `${nf(stats.miPer32 / 1000, 1)}k/32` : "—"}
            </span>
          </div>
          <div style={{ fontSize: 10.5, color: C.onDark, marginTop: 3, whiteSpace: "nowrap",
            overflow: "hidden", textOverflow: "ellipsis" }}>
            {/* A note is no use if nobody knows it is there — flag it on the
                diagram, since that is the screen people actually look at. */}
            {tire.notes && (
              <span title={tire.notes}
                style={{ color: C.yellowHi, fontWeight: 700, marginRight: 4 }}>●</span>
            )}
            {tire.brand || "Unbranded"}{tire.type === "retread" ? " · retread" : ""}
          </div>
        </button>
      )}
    </div>
  );
}

/* ── Position table ───────────────────────────────────────────── */
function PositionTable({ v, positions, activeTireAt, tireStats, settings, onTire, onEmpty }) {
  const rows = positions.map((p) => {
    const t = activeTireAt[`${v.num}|${p.id}`];
    return { p, t, s: t ? tireStats[t.id] : null };
  });
  return (
    <div style={{ background: C.card, border: `1px solid ${C.line}`, borderRadius: 8, overflow: "hidden" }}>
      <div style={{ padding: "11px 16px", borderBottom: `1px solid ${C.lineSoft}` }}>
        <SectionLabel noMargin>Wheel positions</SectionLabel>
      </div>
      <div style={{ overflowX: "auto" }}>
        <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 720 }}>
          <thead>
            <tr>
              {["Pos", "Role", "Brand / model", "Type", "Tread", "Miles per 32nd",
                "Miles run", "Est. miles left", "Status"].map((h, i) => (
                <th key={h} style={{ ...th, textAlign: i >= 4 && i <= 7 ? "right" : "left" }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map(({ p, t, s }) => (
              <tr key={p.id} style={{ borderTop: `1px solid ${C.lineSoft}` }}>
                <td style={{ ...td, fontFamily: FM, fontWeight: 600 }}>
                  {t ? (
                    <button onClick={() => onTire(t)} style={linkBtn}>{p.id}</button>
                  ) : p.id}
                </td>
                <td style={{ ...td, color: C.muted }}>{p.role}{p.slot === "O" ? " outer" : p.slot === "I" ? " inner" : ""}</td>
                <td style={td}>
                  {t ? (
                    <>
                      {`${t.brand || "Unbranded"}${t.model ? " " + t.model : ""}`}
                      {t.notes && (
                        <div style={{ fontSize: 12, color: C.watch, marginTop: 2,
                          lineHeight: 1.4, maxWidth: 320 }}>
                          {t.notes}
                        </div>
                      )}
                    </>
                  ) : <button onClick={() => onEmpty(p)} style={linkBtn}>Mount a tire</button>}
                </td>
                <td style={{ ...td, color: C.muted }}>{t ? (t.type === "retread" ? "Retread" : "Virgin") : "—"}</td>
                <td style={{ ...td, ...tdNum, color: s ? STATUS_COLOR[s.status] : C.muted, fontWeight: 600 }}>
                  {s?.depth != null ? `${s.depth}/32` : "—"}
                </td>
                <td style={{ ...td, ...tdNum }}>{s?.miPer32 ? nf(s.miPer32) : "—"}</td>
                <td style={{ ...td, ...tdNum, color: C.muted }}>{s?.miles ? nf(s.miles) : "—"}</td>
                <td style={{ ...td, ...tdNum }}>{s?.remain ? nf(s.remain) : "—"}</td>
                <td style={td}>{s ? <Pill status={s.status} /> : <span style={{ color: C.muted }}>—</span>}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

/* ── Dialogs ──────────────────────────────────────────────────── */
function MountDialog({ pos, veh, lastOdo, settings, brands, busy, onClose, onSave }) {
  const [f, setF] = useState({
    brand: "", brandOther: "", model: "", size: "11R24.5", type: "virgin",
    newDepth: String(settings.newDepth), onDate: todayISO(),
    onOdo: lastOdo != null ? String(lastOdo) : "", cost: "", casing: "", notes: "",
  });
  const set = (k) => (e) => setF((p) => ({ ...p, [k]: e.target.value }));
  const isOther = f.brand === "Other";
  const brandFinal = isOther ? f.brandOther.trim() : f.brand;
  const ok = f.onOdo !== "" && Number(f.newDepth) > 0 && brandFinal !== "";

  return (
    <Modal title={`Mount a tire at ${pos.id}`} sub={`${veh} · ${pos.role}`} onClose={onClose}>
      <div className="grid gap-3" style={{ gridTemplateColumns: "1fr 1fr" }}>
        <Field label="Brand">
          <select value={f.brand} onChange={set("brand")} style={inp}>
            <option value="">Choose a brand…</option>
            {brands.map((b) => <option key={b} value={b}>{b}</option>)}
            <option value="Other">Other…</option>
          </select>
        </Field>
        {isOther ? (
          <Field label="Brand name">
            <input value={f.brandOther} onChange={set("brandOther")} autoFocus
              placeholder="Type the brand" style={inp} /></Field>
        ) : (
          <Field label="Model / pattern"><input value={f.model} onChange={set("model")}
            placeholder="M726, XDN2…" style={inp} /></Field>
        )}
        {isOther && (
          <Field label="Model / pattern"><input value={f.model} onChange={set("model")}
            placeholder="M726, XDN2…" style={inp} /></Field>
        )}
        <Field label="Size"><input value={f.size} onChange={set("size")} style={inp} /></Field>
        <Field label="Type">
          <select value={f.type} onChange={set("type")} style={inp}>
            <option value="virgin">Virgin</option>
            <option value="retread">Retread</option>
          </select>
        </Field>
        <Field label="Tread when mounted (/32)">
          <input type="number" step="0.5" value={f.newDepth} onChange={set("newDepth")}
            style={{ ...inp, fontFamily: FM }} /></Field>
        <Field label="Odometer when mounted (mi)">
          <input type="number" value={f.onOdo} onChange={set("onOdo")}
            style={{ ...inp, fontFamily: FM }} /></Field>
        <Field label="Date mounted"><input type="date" value={f.onDate} onChange={set("onDate")} style={inp} /></Field>
        <Field label="Cost ($)"><input type="number" step="0.01" value={f.cost} onChange={set("cost")}
          placeholder="optional" style={{ ...inp, fontFamily: FM }} /></Field>
        <div style={{ gridColumn: "1 / -1" }}>
          <Field label="Casing / serial (optional)">
            <input value={f.casing} onChange={set("casing")} style={inp} /></Field>
        </div>
        <div style={{ gridColumn: "1 / -1" }}>
          <Field label="Note (optional)">
            <input value={f.notes} onChange={set("notes")}
              placeholder="Anything worth knowing about this tire"
              style={inp} /></Field>
        </div>
      </div>
      <p style={{ fontSize: 12, color: C.muted, marginTop: 12, lineHeight: 1.5 }}>
        The mount odometer and tread depth become the first data point. One walk-around after
        this and you'll have a wear rate.
      </p>
      <div className="flex justify-end mt-4" style={{ gap: 8 }}>
        <Btn tone="ghost" onClick={onClose}>Cancel</Btn>
        <Btn disabled={busy || !ok} onClick={() => onSave({
          pos: pos.id, brand: brandFinal, model: f.model.trim(),
          size: f.size.trim(), type: f.type, newDepth: Number(f.newDepth),
          onDate: f.onDate, onOdo: Number(f.onOdo),
          cost: f.cost ? Number(f.cost) : null, casing: f.casing.trim(),
          notes: f.notes.trim(),
        })}>Mount tire</Btn>
      </div>
    </Modal>
  );
}

function TireDialog({ tire, stats, settings, busy, onClose, onPull, onSaveNotes, onDeleteReading }) {
  const [pulling, setPulling] = useState(false);
  const [note, setNote] = useState(tire.notes || "");
  const noteDirty = note.trim() !== (tire.notes || "").trim();

  /* Someone else may have edited the note while this was open. Take their
     version unless this person has started typing over it. */
  useEffect(() => {
    if (!noteDirty) setNote(tire.notes || "");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tire.notes]);

  const [offOdo, setOffOdo] = useState(stats?.last ? String(stats.last.odo) : "");
  const [offDate, setOffDate] = useState(todayISO());
  const [reason, setReason] = useState("Worn out");

  const chart = (stats?.pts || []).map((p) => ({
    odo: p.odo, depth: p.d, label: nf(p.odo / 1000, 0) + "k",
  }));
  const cpm = tire.cost && stats?.miles ? tire.cost / stats.miles : null;

  return (
    <Modal width={620} onClose={onClose}
      title={`${tire.pos} · ${tire.brand || "Unbranded"}${tire.model ? " " + tire.model : ""}`}
      sub={`${tire.veh} · ${tire.type === "retread" ? "Retread" : "Virgin"} · ${tire.size || "size not set"}`}>
      <div className="grid gap-3 mb-4" style={{ gridTemplateColumns: "repeat(auto-fit,minmax(120px,1fr))" }}>
        <Stat label="Current tread" value={stats?.depth ?? "—"} unit="/32"
          color={stats ? STATUS_COLOR[stats.status] : undefined} />
        <Stat label="Miles per 32nd" value={stats?.miPer32 ? nf(stats.miPer32) : "—"} unit="mi" />
        <Stat label="Miles per mil" value={stats?.miPer32 ? nf(stats.miPer32 / MILS_PER_32ND) : "—"} unit="mi" />
        <Stat label="Miles on tire" value={stats?.miles ? nf(stats.miles) : "—"} unit="mi" />
        <Stat label="Est. miles left" value={stats?.remain ? nf(stats.remain) : "—"} unit="mi" />
        {cpm && <Stat label="Cost per mile" value={`$${nf(cpm, 3)}`} />}
      </div>

      {chart.length > 1 && (
        <div style={{ height: 170, marginBottom: 16 }}>
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={chart} margin={{ top: 5, right: 10, left: -18, bottom: 0 }}>
              <CartesianGrid stroke={C.lineSoft} vertical={false} />
              <XAxis dataKey="label" tick={{ fontSize: 11, fill: C.muted, fontFamily: FM }}
                axisLine={{ stroke: C.line }} tickLine={false} />
              <YAxis tick={{ fontSize: 11, fill: C.muted, fontFamily: FM }}
                axisLine={false} tickLine={false} domain={[0, "dataMax + 2"]} />
              <Tooltip contentStyle={{ fontFamily: FB, fontSize: 12, borderRadius: 6,
                border: `1px solid ${C.line}` }}
                formatter={(val) => [`${val}/32`, "Tread"]}
                labelFormatter={(l) => `${l} miles`} />
              <Line type="monotone" dataKey="depth" stroke={C.green700} strokeWidth={2.5}
                dot={{ r: 3.5, fill: C.yellow, stroke: C.green700, strokeWidth: 1.5 }} />
            </LineChart>
          </ResponsiveContainer>
        </div>
      )}

      <SectionLabel>Note on this tire</SectionLabel>
      <textarea
        value={note} rows={2}
        onChange={(e) => setNote(e.target.value)}
        placeholder="Sidewall plug · cupping on the outside · keep an eye on it"
        style={{ ...inp, resize: "vertical", lineHeight: 1.45, minHeight: 56 }} />
      <div className="flex items-center justify-between mt-2" style={{ gap: 10, marginBottom: 16 }}>
        <span style={{ fontSize: 11.5, color: C.muted, lineHeight: 1.45 }}>
          Stays on this wheel until the tire comes off. Everyone sees the same note.
        </span>
        <Btn tone="ghost" disabled={busy || !noteDirty} onClick={() => onSaveNotes(note)}>
          {noteDirty ? "Save note" : "Saved"}
        </Btn>
      </div>

      <SectionLabel>Readings</SectionLabel>
      <table style={{ width: "100%", borderCollapse: "collapse", marginBottom: 14 }}>
        <thead><tr>
          {["Date", "Odometer", "Tread", ""].map((h, i) => (
            <th key={h} style={{ ...th, textAlign: i === 1 || i === 2 ? "right" : "left" }}>{h}</th>
          ))}
        </tr></thead>
        <tbody>
          {(stats?.pts || []).map((p, i) => (
            <tr key={p.rid || `mount-${i}`} style={{ borderTop: `1px solid ${C.lineSoft}` }}>
              <td style={td}>
                {fmtDate(p.date)}
                {p.mount && <span style={{ color: C.muted, fontSize: 11 }}> · mounted</span>}
              </td>
              <td style={{ ...td, ...tdNum }}>{nf(p.odo)}</td>
              <td style={{ ...td, ...tdNum, fontWeight: 600 }}>{p.d}/32</td>
              <td style={{ ...td, textAlign: "right" }}>
                {p.rid && (
                  <button style={{ ...linkBtn, color: C.pull, fontSize: 12 }}
                    onClick={() => onDeleteReading(p.rid)}>Remove</button>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      {!pulling ? (
        <div className="flex justify-between items-center">
          <button onClick={() => setPulling(true)} style={{ ...linkBtn, color: C.pull, fontWeight: 600 }}>
            Pull this tire off
          </button>
          <Btn tone="ghost" onClick={onClose}>Close</Btn>
        </div>
      ) : (
        <div style={{ borderTop: `1px solid ${C.lineSoft}`, paddingTop: 14 }}>
          <SectionLabel>Pull this tire</SectionLabel>
          <div className="grid gap-3" style={{ gridTemplateColumns: "1fr 1fr 1fr" }}>
            <Field label="Date off"><input type="date" value={offDate}
              onChange={(e) => setOffDate(e.target.value)} style={inp} /></Field>
            <Field label="Odometer off"><input type="number" value={offOdo}
              onChange={(e) => setOffOdo(e.target.value)} style={{ ...inp, fontFamily: FM }} /></Field>
            <Field label="Reason">
              <select value={reason} onChange={(e) => setReason(e.target.value)} style={inp}>
                {["Worn out", "Road hazard", "Sidewall damage", "Irregular wear",
                  "Rotated off", "Casing sent to retread"].map((r) => <option key={r}>{r}</option>)}
              </select>
            </Field>
          </div>
          <div className="flex justify-end mt-3" style={{ gap: 8 }}>
            <Btn tone="ghost" onClick={() => setPulling(false)}>Never mind</Btn>
            <Btn tone="danger" disabled={busy || !Number(offOdo)} onClick={() => onPull({
              offDate, offOdo: Number(offOdo), offReason: reason })}>
              Pull tire
            </Btn>
          </div>
        </div>
      )}
    </Modal>
  );
}

function OdoDialog({ veh, lastOdo, busy, onClose, onSave }) {
  const [date, setDate] = useState(todayISO());
  const [odo, setOdo] = useState(lastOdo != null ? String(lastOdo) : "");
  const delta = lastOdo != null && Number(odo) ? Number(odo) - lastOdo : null;
  return (
    <Modal title="Log mileage" sub={veh} onClose={onClose} width={420}>
      <div className="grid gap-3" style={{ gridTemplateColumns: "1fr 1fr" }}>
        <Field label="Date"><input type="date" value={date}
          onChange={(e) => setDate(e.target.value)} style={inp} /></Field>
        <Field label="Odometer (mi)"><input type="number" inputMode="numeric" value={odo}
          onChange={(e) => setOdo(e.target.value)} autoFocus
          style={{ ...inp, fontFamily: FM, fontSize: 17 }} /></Field>
      </div>
      {lastOdo != null && (
        <div style={{ fontFamily: FM, fontSize: 12.5, color: C.muted, marginTop: 10 }}>
          Last logged {nf(lastOdo)} mi
          {delta != null && delta >= 0 ? ` · +${nf(delta)} mi` : ""}
        </div>
      )}
      <div className="flex justify-end mt-4" style={{ gap: 8 }}>
        <Btn tone="ghost" onClick={onClose}>Cancel</Btn>
        <Btn disabled={busy || !Number(odo)} onClick={() =>
          onSave({ date, odo: Number(odo) })}>Save mileage</Btn>
      </div>
    </Modal>
  );
}

/* ── Analysis ─────────────────────────────────────────────────── */
function Analysis({ tires, tireStats, settings, byNum }) {
  const [unit, setUnit] = useState("32nd");
  const conv = (v) => (v == null ? null : unit === "32nd" ? v : v / MILS_PER_32ND);
  const unitLabel = unit === "32nd" ? "miles per 32nd" : "miles per mil";

  const scored = tires
    .map((t) => ({ t, s: tireStats[t.id] }))
    .filter((x) => x.s && x.s.miPer32);

  const group = (keyFn) => {
    const m = {};
    scored.forEach(({ t, s }) => {
      const k = keyFn(t) || "Unspecified";
      (m[k] ||= []).push(s.miPer32);
    });
    return Object.entries(m)
      .map(([k, arr]) => ({
        name: k, n: arr.length,
        avg: conv(arr.reduce((a, b) => a + b, 0) / arr.length),
      }))
      .sort((a, b) => b.avg - a.avg);
  };

  const byBrand = group((t) => t.brand);
  const byType = group((t) => (t.type === "retread" ? "Retread" : "Virgin"));
  const byRole = (() => {
    const m = {};
    scored.forEach(({ t, s }) => {
      const a = t.pos.match(/^(\d+)/);
      const veh = byNum[t.veh];
      const cfg = CONFIGS[veh?.cfg] || CONFIGS.dump12;
      const ax = cfg.axles.find((x) => String(x.n) === (a ? a[1] : ""));
      const slot = /O$/.test(t.pos) ? " outer" : /I$/.test(t.pos) ? " inner" : "";
      const k = (ax?.role || "Unknown") + slot;
      (m[k] ||= []).push(s.miPer32);
    });
    return Object.entries(m).map(([k, arr]) => ({
      name: k, n: arr.length, avg: conv(arr.reduce((a, b) => a + b, 0) / arr.length),
    })).sort((a, b) => b.avg - a.avg);
  })();

  if (scored.length === 0)
    return (
      <div style={{ background: C.card, border: `1px solid ${C.line}`, borderRadius: 8, padding: 28 }}>
        <div style={{ fontFamily: FD, fontSize: 22, fontWeight: 700, color: C.green900 }}>
          Nothing to compare yet
        </div>
        <p style={{ fontSize: 14, color: C.muted, marginTop: 6, maxWidth: 560, lineHeight: 1.55 }}>
          Wear rates show up here once a tire has two data points — its mount reading and at
          least one walk-around at a higher odometer. Comparisons across brand, retread versus
          virgin, and axle position all build from that.
        </p>
      </div>
    );

  return (
    <div className="grid gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3"
        style={{ background: C.card, border: `1px solid ${C.line}`, borderRadius: 8, padding: "12px 16px" }}>
        <div>
          <div style={{ fontFamily: FD, fontSize: 22, fontWeight: 700, color: C.green900, lineHeight: 1.1 }}>
            {scored.length} tire{scored.length > 1 ? "s" : ""} with a wear rate
          </div>
          <div style={{ fontSize: 12.5, color: C.muted, marginTop: 2 }}>
            Higher is better — more miles for every 32nd of tread given up
          </div>
        </div>
        <div className="flex" style={{ gap: 2 }}>
          {[["32nd", "mi / 32nd"], ["mil", "mi / mil"]].map(([k, l]) => (
            <button key={k} onClick={() => setUnit(k)}
              style={{ fontFamily: FM, fontSize: 12.5, fontWeight: 600, padding: "7px 13px",
                cursor: "pointer", border: `1px solid ${unit === k ? C.green700 : C.line}`,
                background: unit === k ? C.green700 : "#fff",
                color: unit === k ? "#fff" : C.muted,
                borderRadius: k === "32nd" ? "5px 0 0 5px" : "0 5px 5px 0" }}>{l}</button>
          ))}
        </div>
      </div>

      <div className="grid gap-4" style={{ gridTemplateColumns: "repeat(auto-fit,minmax(340px,1fr))" }}>
        <ChartCard title="By brand" note={unitLabel} data={byBrand} />
        <ChartCard title="Retread vs. virgin" note={unitLabel} data={byType} />
      </div>
      <ChartCard title="By wheel position" note={unitLabel} data={byRole} wide />

      <div style={{ background: C.card, border: `1px solid ${C.line}`, borderRadius: 8, overflow: "hidden" }}>
        <div style={{ padding: "11px 16px", borderBottom: `1px solid ${C.lineSoft}` }}>
          <SectionLabel noMargin>Every tire with a rate</SectionLabel>
        </div>
        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 760 }}>
            <thead><tr>
              {["Truck", "Pos", "Brand / model", "Type", "Tread", unit === "32nd" ? "mi / 32nd" : "mi / mil",
                "Miles run", "Est. left"].map((h, i) => (
                <th key={h} style={{ ...th, textAlign: i >= 4 ? "right" : "left" }}>{h}</th>
              ))}
            </tr></thead>
            <tbody>
              {scored.sort((a, b) => b.s.miPer32 - a.s.miPer32).map(({ t, s }) => (
                <tr key={t.id} style={{ borderTop: `1px solid ${C.lineSoft}` }}>
                  <td style={{ ...td, fontFamily: FM, fontWeight: 600 }}>{t.veh}</td>
                  <td style={{ ...td, fontFamily: FM }}>{t.pos}</td>
                  <td style={td}>{t.brand || "Unbranded"}{t.model ? " " + t.model : ""}</td>
                  <td style={{ ...td, color: C.muted }}>{t.type === "retread" ? "Retread" : "Virgin"}</td>
                  <td style={{ ...td, ...tdNum, color: STATUS_COLOR[s.status], fontWeight: 600 }}>{s.depth}/32</td>
                  <td style={{ ...td, ...tdNum, fontWeight: 600 }}>{nf(conv(s.miPer32))}</td>
                  <td style={{ ...td, ...tdNum, color: C.muted }}>{nf(s.miles)}</td>
                  <td style={{ ...td, ...tdNum }}>{s.remain ? nf(s.remain) : "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

function ChartCard({ title, note, data, wide }) {
  const palette = [C.green700, C.green600, C.yellow, "#4E9166", "#7A6A12", "#7FAE92"];
  return (
    <div style={{ background: C.card, border: `1px solid ${C.line}`, borderRadius: 8, padding: "14px 16px 8px" }}>
      <div className="flex items-baseline justify-between" style={{ marginBottom: 10 }}>
        <span style={{ fontFamily: FD, fontSize: 18, fontWeight: 700, color: C.green900,
          letterSpacing: "0.02em" }}>{title}</span>
        <span style={{ fontFamily: FM, fontSize: 10.5, color: C.muted }}>{note}</span>
      </div>
      <div style={{ height: Math.max(150, data.length * (wide ? 34 : 38) + 30) }}>
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={data} layout="vertical" margin={{ top: 0, right: 46, left: 4, bottom: 4 }}>
            <CartesianGrid stroke={C.lineSoft} horizontal={false} />
            <XAxis type="number" tick={{ fontSize: 10.5, fill: C.muted, fontFamily: FM }}
              axisLine={false} tickLine={false} />
            <YAxis type="category" dataKey="name" width={112}
              tick={{ fontSize: 12, fill: C.ink, fontFamily: FB }} axisLine={false} tickLine={false} />
            <Tooltip cursor={{ fill: "#F1F5F9" }}
              contentStyle={{ fontFamily: FB, fontSize: 12, borderRadius: 6, border: `1px solid ${C.line}` }}
              formatter={(v, n, p) => [`${nf(v)} mi  ·  ${p.payload.n} tire${p.payload.n > 1 ? "s" : ""}`, ""]} />
            <Bar dataKey="avg" radius={[0, 3, 3, 0]} barSize={wide ? 18 : 20}
              label={{ position: "right", formatter: (v) => nf(v),
                style: { fontFamily: FM, fontSize: 11, fill: C.muted } }}>
              {data.map((d, i) => <Cell key={i} fill={palette[i % palette.length]} />)}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

/* ── Settings ─────────────────────────────────────────────────── */
function Settings({ settings, tires, readings, odos, tireStats, actions, busy }) {
  /* Thresholds are shared, so they are written on blur rather than on
     every keystroke — nobody wants a half-typed "1" from someone else's
     edit flipping their screen to all-pull for a second. */
  const [draft, setDraft] = useState(settings);
  const [confirm, setConfirm] = useState(false);
  const [typed, setTyped] = useState("");

  useEffect(() => { setDraft(settings); }, [settings]);

  const edit = (k) => (e) => setDraft((p) => ({ ...p, [k]: e.target.value }));
  const commit = (k) => () => {
    const val = Number(draft[k]);
    if (!isFinite(val) || val < 0 || val === settings[k]) {
      setDraft(settings);
      return;
    }
    actions.updateSettings({ [k]: val });
  };

  function download(name, text) {
    const blob = new Blob([text], { type: "text/csv" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = name;
    a.click();
    URL.revokeObjectURL(a.href);
  }

  function exportTires() {
    const head = ["truck", "position", "brand", "model", "size", "type", "casing",
      "mounted_date", "mounted_odo", "mounted_32nds", "current_32nds",
      "miles_run", "miles_per_32nd", "miles_per_mil", "est_miles_left", "cost", "status",
      "note"];
    const rows = tires.map((t) => {
      const s = tireStats[t.id] || {};
      return [t.veh, t.pos, t.brand, t.model, t.size, t.type, t.casing, t.onDate, t.onOdo,
        t.newDepth, s.depth ?? "", s.miles ?? "", s.miPer32 ? Math.round(s.miPer32) : "",
        s.miPer32 ? Math.round(s.miPer32 / MILS_PER_32ND) : "",
        s.remain ? Math.round(s.remain) : "", t.cost ?? "", STATUS_LABEL[s.status] || "",
        t.notes || ""];
    });
    download("allen-tires.csv", toCSV([head, ...rows]));
  }

  function exportReadings() {
    const tById = Object.fromEntries(tires.map((t) => [t.id, t]));
    const head = ["date", "truck", "position", "odometer", "tread_32nds", "brand", "type"];
    const rows = readings
      .map((r) => {
        const t = tById[r.tire];
        return t ? [r.date, t.veh, t.pos, r.odo, r.d, t.brand, t.type] : null;
      })
      .filter(Boolean)
      .sort((a, b) => (a[0] < b[0] ? 1 : -1));
    download("allen-tread-readings.csv", toCSV([head, ...rows]));
  }

  function exportMileage() {
    const head = ["date", "truck", "odometer", "source"];
    const rows = [...odos].sort((a, b) => (a.date < b.date ? 1 : -1))
      .map((o) => [o.date, o.veh, o.odo, o.source]);
    download("allen-mileage.csv", toCSV([head, ...rows]));
  }

  return (
    <div className="grid gap-4" style={{ maxWidth: 720 }}>
      <Card title="Pull thresholds"
        note="Federal minimums are 4/32 on steer and 2/32 everywhere else. Most fleets pull earlier. These apply to everyone.">
        <div className="grid gap-3" style={{ gridTemplateColumns: "1fr 1fr" }}>
          <Field label="Pull steer tires at (/32)">
            <input type="number" step="0.5" value={draft.pullSteer}
              onChange={edit("pullSteer")} onBlur={commit("pullSteer")}
              style={{ ...inp, fontFamily: FM }} /></Field>
          <Field label="Pull all other tires at (/32)">
            <input type="number" step="0.5" value={draft.pullOther}
              onChange={edit("pullOther")} onBlur={commit("pullOther")}
              style={{ ...inp, fontFamily: FM }} /></Field>
          <Field label="Default tread on a new tire (/32)">
            <input type="number" step="0.5" value={draft.newDepth}
              onChange={edit("newDepth")} onBlur={commit("newDepth")}
              style={{ ...inp, fontFamily: FM }} /></Field>
        </div>
      </Card>

      <Card title="Export" note="Comma-separated files that open straight into Excel.">
        <div className="flex flex-wrap" style={{ gap: 8 }}>
          <Btn tone="ghost" onClick={exportTires}>Tires ({tires.length})</Btn>
          <Btn tone="ghost" onClick={exportReadings}>Tread readings ({readings.length})</Btn>
          <Btn tone="ghost" onClick={exportMileage}>Mileage log ({odos.length})</Btn>
        </div>
      </Card>

      <Card title="Stored records"
        note="Everything saves as you enter it and is shared with everyone signed in.">
        <div className="flex flex-wrap" style={{ gap: 22 }}>
          <Stat label="Tires" value={tires.length} />
          <Stat label="Tread readings" value={readings.length} />
          <Stat label="Mileage entries" value={odos.length} />
        </div>
        <div style={{ marginTop: 16, borderTop: `1px solid ${C.lineSoft}`, paddingTop: 14 }}>
          {!confirm ? (
            <button onClick={() => { setConfirm(true); setTyped(""); }}
              style={{ ...linkBtn, color: C.pull, fontWeight: 600 }}>
              Erase all tire data
            </button>
          ) : (
            <div>
              <div style={{ fontSize: 13, color: C.pull, fontWeight: 600, lineHeight: 1.5 }}>
                This deletes every tire, reading, and mileage entry for the whole
                division — not just yours. Export first if you need them.
                Axle configurations are left alone.
              </div>
              <div className="flex items-end flex-wrap mt-3" style={{ gap: 10 }}>
                <Field label="Type ERASE to confirm">
                  <input value={typed} onChange={(e) => setTyped(e.target.value)}
                    style={{ ...inp, fontFamily: FM, width: 140 }} /></Field>
                <Btn tone="ghost" onClick={() => setConfirm(false)}>Keep my data</Btn>
                <Btn tone="danger" disabled={busy || typed.trim().toUpperCase() !== "ERASE"}
                  onClick={async () => { await actions.eraseAll(); setConfirm(false); }}>
                  Erase everything
                </Btn>
              </div>
            </div>
          )}
        </div>
      </Card>

      <div style={{ fontSize: 12, color: C.muted, lineHeight: 1.6 }}>
        Fleet roster: 50 active DT and 84 active HT units, pulled from Motive on 08/24/2026.
        Deactivated and out-of-service units are left out.
      </div>
    </div>
  );
}


/* ── Small pieces ─────────────────────────────────────────────── */
function Pill({ status }) {
  const c = STATUS_COLOR[status];
  return (
    <span style={{ display: "inline-block", fontFamily: FD, fontSize: 11.5, fontWeight: 600,
      letterSpacing: "0.07em", textTransform: "uppercase", padding: "3px 8px", borderRadius: 3,
      background: c + "1A", color: c, border: `1px solid ${c}44` }}>
      {STATUS_LABEL[status]}
    </span>
  );
}

