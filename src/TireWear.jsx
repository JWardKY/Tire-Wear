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
import { saySo, sayOffline, tooBig } from "./dbError.js";
import { dualMismatches, mismatchedWheels, wheelsFrom, DUAL_LIMIT } from "./dualMatch.js";
import { checkDepth, checkMount, sayTyped, sayMount, sayRise, worstRise, whyNoRate }
  from "./treadCheck.js";
import { destinations, checkMove, sayMove, sayThreshold, REPLACE, SWAP }
  from "./moveTire.js";
import { CAPS, capLabel, capNeeded, sayType, sayTypeTight } from "./retread.js";

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
  dualpush14: { label: "14-tire dump · steer + dual pusher + tandem", axles: [
    { n: 1, dual: false, role: "Steer" }, { n: 2, dual: true, role: "Pusher" },
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
  /* A trailer has no steer axle, so nothing here matches the ^1[LR]$
     test that picks the steer pull depth — every wheel is held to the
     "all other tires" threshold, which is right. */
  trailer8: { label: "8-tire trailer · two axles, all duals", axles: [
    { n: 1, dual: true, role: "Trailer" }, { n: 2, dual: true, role: "Trailer" }] },
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

const DEFAULTS = { pullSteer: 6, pullOther: 4, newDepth: 28,
  dualMatch: DUAL_LIMIT, unit: "32nd" };

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
/* Blank on every tire mounted before the wheel field existed. */
const WHEEL_LABEL = { aluminum: "Aluminum", steel: "Steel" };

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
        setErr(sayOffline(e, "load")
          || `Could not load the tire records — ${e.message || e}`);
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
      setErr(sayOffline(e) || `That did not save — ${e.message || e}`);
    } finally {
      setBusy(false);
    }
  }, [reload]);

  /* Like run, but the error comes back to the caller instead of the
     banner. A screen that can say something better than "that did not
     save" — naming the wheel that is already taken — needs the error,
     not a sentence about one. Busy and the reload still behave. */
  const runRaw = useCallback(async (fn) => {
    setBusy(true);
    try {
      await fn();
      await reload();
      setErr(null);
    } finally {
      setBusy(false);
    }
  }, [reload]);

  const actions = useMemo(() => ({
    setVehicleConfig: (vehId, cfg) => run(() => db.setVehicleConfig(vehId, cfg)),
    mountTire: (vehId, t) => run(() => db.mountTire(vehId, t, who)),
    mountTires: (vehId, list) => run(() => db.mountTires(vehId, list, who)),
    pullTire: (tireId, off) => run(() => db.pullTire(tireId, off)),
    updateTire: (tireId, t, before) => runRaw(() => db.updateTire(tireId, t, before, who)),
    moveTire: (tireId, to, ctx) => run(() => db.moveTire(tireId, to, ctx, who)),
    setTireNotes: (tireId, notes) => run(() => db.setTireNotes(tireId, notes)),
    saveInspection: (vehId, date, odo, entries) =>
      run(() => db.saveInspection(vehId, date, odo, entries, who)),
    deleteReading: (id) => run(() => db.deleteReading(id)),
    logOdometer: (vehId, date, odo) => run(() => db.logOdometer(vehId, date, odo, who)),
    updateSettings: (patch) => run(() => db.updateSettings(patch)),
    eraseAll: () => run(() => db.eraseAll()),
  }), [run, runRaw, who]);

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

      /* Two tires on one end of an axle only share the load if they are
         close to the same size. Worked out per truck here so the fleet
         list can point at the ones to go and look at, rather than
         somebody opening 134 trucks to find them.

         Read off the tires that are actually mounted rather than the
         positions the config says the truck has — a pair on a wheel the
         config does not know about is still a pair on the truck. */
      const depthAt = (posId) => {
        const t = activeTireAt[`${v.num}|${posId}`];
        const d = t ? tireStats[t.id]?.depth : null;
        return d == null ? null : d;
      };
      const mismatches = dualMismatches(
        wheelsFrom(ts.map((t) => t.pos)), depthAt, settings.dualMatch);

      m[v.num] = {
        tracked: ts.length, total: pos.length, worst, worstT, lastDate, pulls, watches,
        mismatches, mismatched: mismatches.length,
        odo: lastOdoFor[v.num]?.odo ?? null, odoDate: lastOdoFor[v.num]?.date ?? null,
      };
    });
    return m;
  }, [fleet, activeTireAt, tireStats, lastOdoFor, settings.dualMatch]);

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
      if (s.pulls > 0 || s.watches > 0 || s.mismatched > 0) rows.push({ num, ...s });
    });
    rows.sort((a, b) =>
      b.pulls - a.pulls || b.mismatched - a.mismatched || (a.worst ?? 99) - (b.worst ?? 99));
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
  const dot = s?.pulls ? C.pull
    : (s?.watches || s?.mismatched) ? C.watch
    : s?.tracked ? C.good : "#CBD5E1";
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
        {s?.mismatched ? ` · ${s.mismatched} odd pair${s.mismatched === 1 ? "" : "s"}` : ""}
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
                  {r.pulls ? `${r.pulls} at pull depth`
                    : r.watches ? `${r.watches} to monitor`
                    : `${r.mismatched} mismatched pair${r.mismatched === 1 ? "" : "s"}`}
                </div>
                {r.mismatched > 0 && (r.pulls > 0 || r.watches > 0) && (
                  <div style={{ fontSize: 12, color: C.watch, fontWeight: 600 }}>
                    and {r.mismatched} mismatched pair{r.mismatched === 1 ? "" : "s"}
                  </div>
                )}
                <div style={{ fontFamily: FM, fontSize: 11, color: C.muted, marginTop: 1 }}>
                  {r.worst != null ? `low ${r.worst}/32 · ` : ""}{byNum[r.num]?.make}
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

  /* Worked out here and handed down, so the banner, the diagram and the
     table are all looking at one answer rather than three. */
  const mismatches = useMemo(() => dualMismatches(
    wheelsFrom(Object.keys(activeTireAt)
      .filter((k) => k.startsWith(`${v.num}|`))
      .map((k) => k.split("|")[1])),
    (posId) => {
      const t = activeTireAt[`${v.num}|${posId}`];
      return t ? tireStats[t.id]?.depth ?? null : null;
    },
    settings.dualMatch,
  ), [activeTireAt, tireStats, v.num, settings.dualMatch]);
  const oddWheels = useMemo(() => mismatchedWheels(mismatches), [mismatches]);

  /* Wheels whose own history goes the wrong way. Per tire, not per
     pair, so it reads as a list of wheels to go and re-gauge. */
  const impossible = useMemo(() => positions.flatMap((p) => {
    const t = activeTireAt[`${v.num}|${p.id}`];
    const rise = t ? worstRise(tireStats[t.id]?.pts) : null;
    return rise ? [{ pos: p.id, rise }] : [];
  }), [positions, activeTireAt, tireStats, v.num]);

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

  /* What is wrong with what has been typed so far, per wheel. The
     check is against the tire's own history, so it can name the figure
     being contradicted rather than just refusing a number. */
  const typedBad = useMemo(() => Object.entries(draft).flatMap(([pos, val]) => {
    const t = activeTireAt[`${v.num}|${pos}`];
    const bad = t ? checkDepth(val, tireStats[t.id]?.pts) : null;
    return bad ? [{ pos, bad }] : [];
  }), [draft, activeTireAt, tireStats, v.num]);

  /* Cleared by pressing the button a second time. A hard refusal would
     trap the case this exists to surface: when the MOUNT depth is the
     wrong figure, the true reading is the one that looks impossible,
     and somebody has to be able to get it in. So it takes two presses
     and says what it is about to record, rather than one press and a
     shrug. */
  const [okAnyway, setOkAnyway] = useState(false);
  useEffect(() => { setOkAnyway(false); }, [typedBad.length]);

  async function saveInspection() {
    const odo = Number(insOdo);
    if (!odo || odo <= 0) return;
    if (typedBad.length && !okAnyway) { setOkAnyway(true); return; }
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

        {mode === "inspect" && typedBad.length > 0 && (
          <div style={{ padding: "10px 16px", background: "#FDF6E3",
            borderBottom: `1px solid ${C.watch}55`, borderLeft: `4px solid ${C.watch}` }}>
            <div style={{ fontFamily: FD, fontSize: 14, fontWeight: 700, color: C.ink }}>
              {typedBad.length === 1
                ? "That reading cannot be right"
                : `${typedBad.length} of those readings cannot be right`}
            </div>
            {typedBad.map(({ pos, bad }) => (
              <div key={pos} style={{ fontSize: 13, color: C.ink, lineHeight: 1.6 }}>
                <span style={{ fontFamily: FM, fontWeight: 700 }}>{pos}</span>
                <span style={{ fontFamily: FM, fontWeight: 700, color: C.pull }}>
                  {" "}{bad.typed}/32
                </span>
                <span style={{ color: C.muted }}> — {sayTyped(bad)}</span>
              </div>
            ))}
            <p style={{ fontSize: 12, color: C.muted, margin: "6px 0 0", lineHeight: 1.5 }}>
              Check the wheel and the gauge. If the reading is right, then the older
              figure is the wrong one — save anyway and fix that instead.
            </p>
          </div>
        )}

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
            <Btn onClick={saveInspection} disabled={busy || !Number(insOdo) || filled === 0}
              tone={typedBad.length && okAnyway ? "danger" : undefined}>
              {typedBad.length && okAnyway
                ? `Save ${filled} anyway`
                : `Save ${filled > 0 ? `${filled} reading${filled > 1 ? "s" : ""}` : "readings"}`}
            </Btn>
          </div>
        )}

        {impossible.length > 0 && <ImpossibleTread list={impossible} />}
        {mismatches.length > 0 && <DualMismatch list={mismatches} limit={settings.dualMatch} />}

        {/* The diagram */}
        <div style={{ padding: "18px 12px 22px", overflowX: "auto" }}>
          <TruckDiagram
            v={v} positions={positions} activeTireAt={activeTireAt} tireStats={tireStats}
            settings={settings} mode={mode} draft={draft} setDraft={setDraft}
            oddWheels={oddWheels}
            onTire={(t) => setOpenTire(t)} onEmpty={(pos) => setMountPos(pos)}
          />
        </div>
      </div>

      {/* Position table */}
      <PositionTable
        v={v} positions={positions} activeTireAt={activeTireAt} tireStats={tireStats}
        settings={settings} mismatches={mismatches} onTire={setOpenTire} onEmpty={setMountPos}
      />

      {mountPos && (
        <MountDialog pos={mountPos} veh={v.num} lastOdo={lastOdo} settings={settings}
          brands={brands} busy={busy}
          freePositions={positions.filter(
            (p) => p.id !== mountPos.id && !activeTireAt[`${v.num}|${p.id}`])}
          onClose={() => setMountPos(null)}
          onSave={(t) => actions.mountTire(v.id, t)}
          onSaveMany={(list) => actions.mountTires(v.id, list)} />
      )}
      {openTire && (
        /* Re-read the tire from the freshly loaded list each render, so a
           saved note shows up in the dialog that just saved it. */
        <TireDialog
          tire={activeTireAt[`${v.num}|${openTire.pos}`] || openTire}
          stats={tireStats[openTire.id]} settings={settings}
          brands={brands} busy={busy}
          /* Wheels it could move to: the free ones on this truck, plus
             the one it is on. A tire mounted at the wrong position is
             the correction with nowhere else to go — there is no delete,
             so without this it stays on the wrong wheel for the life of
             the casing. */
          freePositions={positions.filter(
            (p) => p.id === openTire.pos || !activeTireAt[`${v.num}|${p.id}`])}
          /* Moving it for real, rather than correcting a position keyed
             wrong, needs every wheel on the truck — including the taken
             ones, because a rotation is usually a swap. */
          positions={positions} activeTireAt={activeTireAt} tireStats={tireStats}
          lastOdo={lastOdo}
          onMove={async ({ to, when, odo, other, mode, reason }) => {
            await actions.moveTire(openTire.id, to, {
              when, odo, veh: v.num, vehId: v.id, from: openTire.pos,
              other, mode, reason });
            setOpenTire(null);
          }}
          onSaveDetails={async (t) => {
            /* The tire as it stands goes with the patch, so the log line
               can say what it used to be. Once the row is overwritten
               there is nothing left that knows. */
            await actions.updateTire(openTire.id, t,
              activeTireAt[`${v.num}|${openTire.pos}`] || openTire);
            setOpenTire(null);
          }}
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

/* ── Duals that do not match ──────────────────────────────────────
   Two tires on one end of an axle carry the load together, and only
   share it if they are close to the same size. A 27/32 beside a 15/32
   means the deep one takes the weight, runs hot and scrubs — so the
   shop buys two tires instead of none.

   Said as a sentence above the diagram, with both wheels ringed on it.
   The number on its own would make somebody hunt for which pair. */
function DualMismatch({ list, limit }) {
  return (
    <div style={{ margin: "0 12px 4px", background: "#FDF6E3",
      border: `1px solid ${C.watch}55`, borderLeft: `4px solid ${C.watch}`,
      borderRadius: 6, padding: "10px 14px" }}>
      <div style={{ fontFamily: FD, fontSize: 15, fontWeight: 700, color: C.ink }}>
        {list.length === 1 ? "A pair of duals does not match"
          : `${list.length} pairs of duals do not match`}
      </div>
      <div style={{ marginTop: 5 }}>
        {list.map((m) => (
          <div key={m.end} style={{ fontSize: 13, color: C.ink, lineHeight: 1.6 }}>
            <span style={{ fontFamily: FM, fontWeight: 700 }}>{m.end}</span>
            {" — "}
            <span style={{ fontFamily: FM, fontWeight: 700, color: C.pull }}>
              {m.diff}/32 apart
            </span>
            <span style={{ color: C.muted }}>
              {" · "}{m.shallower} at {m.shallowest}/32 beside{" "}
              {m.deeper} at {m.deepest}/32
            </span>
          </div>
        ))}
      </div>
      <p style={{ fontSize: 12, color: C.muted, margin: "7px 0 0", lineHeight: 1.5 }}>
        The deeper tire carries the load, runs hot and scrubs, and both come off
        early. Anything over {limit}/32 is flagged — change it in Settings.
      </p>
    </div>
  );
}


/* Readings that cannot be right, said out loud. A tire that reads
   deeper than it did before used to show up as nothing but a blank in
   the miles-per-32nd column, which reads as "nobody measured this"
   rather than "somebody measured it wrong". */
function ImpossibleTread({ list }) {
  return (
    <div style={{ margin: "0 12px 4px", background: "#FDF6E3",
      border: `1px solid ${C.watch}55`, borderLeft: `4px solid ${C.watch}`,
      borderRadius: 6, padding: "10px 14px" }}>
      <div style={{ fontFamily: FD, fontSize: 15, fontWeight: 700, color: C.ink }}>
        {list.length === 1 ? "A reading that cannot be right"
          : `${list.length} readings that cannot be right`}
      </div>
      <div style={{ marginTop: 5 }}>
        {list.map(({ pos, rise }) => (
          <div key={pos} style={{ fontSize: 13, color: C.ink, lineHeight: 1.6 }}>
            <span style={{ fontFamily: FM, fontWeight: 700 }}>{pos}</span>
            {" — "}
            <span style={{ color: C.muted }}>{sayRise(pos, rise).slice(pos.length + 1)}</span>
          </div>
        ))}
      </div>
      <p style={{ fontSize: 12, color: C.muted, margin: "7px 0 0", lineHeight: 1.5 }}>
        Rubber does not grow back, so one of the two figures is wrong. Re-gauge the
        wheel, then fix whichever it turns out to be — a reading from the tire dialog,
        or the mount depth under Edit these details.
      </p>
    </div>
  );
}

/* ── Truck diagram — overhead, nose left, R side up ───────────── */
function TruckDiagram({ v, positions, activeTireAt, tireStats, settings, oddWheels, mode, draft, setDraft, onTire, onEmpty }) {
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
        odd={!!oddWheels?.has(p.id)}
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

function TireCard({ pos, tire, stats, odd, settings, mode, draft, setDraft, onTire, onEmpty, width }) {
  const st = stats?.status || "none";
  const col = STATUS_COLOR[st];      // the solid badge, white text on it
  const colOnDark = STATUS_ON_DARK[st]; // the tread numeral, on the card itself
  const inspecting = mode === "inspect" && tire;
  /* Said at the box being typed into, not only in the bar at the top:
     on a twelve-wheel truck the bar is off the screen by the time
     somebody reaches the back axle. */
  const bad = inspecting ? checkDepth(draft?.[pos.id], stats?.pts) : null;

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
      border: `1px solid ${odd ? C.watch : C.green800}`, display: "flex", overflow: "hidden",
      /* A ring rather than a thicker border: both wheels of a pair get
         it, and it must not shift the card a pixel or the whole column
         steps sideways against the one beside it. */
      boxShadow: odd ? `0 0 0 2px ${C.watch}` : "none" }}>
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
            style={{ width: 58, padding: "5px 6px", borderRadius: 4,
              border: `1px solid ${bad ? C.watch : C.green600}`,
              background: C.wellDark, color: bad ? C.yellowHi : "#fff",
              fontFamily: FM, fontWeight: 600, fontSize: 16,
              textAlign: "center", outline: "none" }} />
          <div style={{ fontFamily: FM, fontSize: 11, color: C.onDarkSoft, lineHeight: 1.25 }}>
            /32<br />
            <span style={{ fontSize: 10, color: bad ? C.yellowHi : C.onDarkSoft }}>
              {bad ? `over the ${bad.was}` : `was ${stats?.depth ?? "—"}`}
            </span>
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
            {tire.brand || "Unbranded"}
            {sayTypeTight(tire.type, tire.caps) ? ` · ${sayTypeTight(tire.type, tire.caps)}` : ""}
          </div>
        </button>
      )}
    </div>
  );
}

/* ── Position table ───────────────────────────────────────────── */
function PositionTable({ v, positions, activeTireAt, tireStats, settings, mismatches, onTire, onEmpty }) {
  /* Which wheel each mismatch belongs to, so the row can say what it is
     out of step WITH rather than just that it is out of step. */
  const oddAt = new Map();
  for (const m of mismatches || []) {
    oddAt.set(m.inner, { other: m.outer, diff: m.diff, deep: m.deeper === m.inner });
    oddAt.set(m.outer, { other: m.inner, diff: m.diff, deep: m.deeper === m.outer });
  }
  const rows = positions.map((p) => {
    const t = activeTireAt[`${v.num}|${p.id}`];
    const s = t ? tireStats[t.id] : null;
    return { p, t, s, odd: oddAt.get(p.id) || null, why: whyNoRate(s) };
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
            {rows.map(({ p, t, s, odd, why }) => (
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
                <td style={{ ...td, color: C.muted }}>
                  {t ? sayType(t.type, t.caps) : "—"}</td>
                <td style={{ ...td, ...tdNum, color: s ? STATUS_COLOR[s.status] : C.muted, fontWeight: 600 }}>
                  {s?.depth != null ? `${s.depth}/32` : "—"}
                  {odd && (
                    <div style={{ fontFamily: FB, fontSize: 11.5, fontWeight: 600,
                      color: C.watch, whiteSpace: "nowrap", marginTop: 1 }}>
                      {odd.diff}/32 {odd.deep ? "above" : "below"} {odd.other}
                    </div>
                  )}
                </td>
                {/* A dash is the one thing this column must not say on its
                    own: four wheels on DT-899 had been gauged twice and
                    looked untouched. */}
                <td style={{ ...td, ...tdNum }}>
                  {s?.miPer32 ? nf(s.miPer32) : why ? (
                    <span style={{ fontFamily: FB, fontSize: 11.5, lineHeight: 1.35,
                      display: "inline-block", whiteSpace: "normal", maxWidth: 150,
                      color: why.kind === "grew" ? C.watch : C.muted }}>
                      {why.say}
                    </span>
                  ) : "—"}
                </td>
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
function MountDialog({ pos, veh, lastOdo, settings, brands, busy,
                      freePositions = [], onClose, onSave, onSaveMany }) {
  /* Two steps. The first mounts one tire; the second offers to put the
     same tire on the wheels still empty, which is what setting up a
     truck actually is — one spec and a dozen tread readings. */
  const [step, setStep] = useState("mount");   // mount | copy
  const [spec, setSpec] = useState(null);
  const [pick, setPick] = useState({});        // position id -> tread typed
  const [f, setF] = useState({
    brand: "", brandOther: "", model: "", size: "11R24.5", type: "virgin",
    caps: "", wheel: "",
    newDepth: String(settings.newDepth), onDate: todayISO(),
    onOdo: lastOdo != null ? String(lastOdo) : "", cost: "", casing: "", notes: "",
  });
  const set = (k) => (e) => setF((p) => ({ ...p, [k]: e.target.value }));
  const isOther = f.brand === "Other";
  const brandFinal = isOther ? f.brandOther.trim() : f.brand;
  /* A retread with no cap count does not get recorded. Every retread
     already on the fleet has a blank here and nobody can go back and
     ask; the way to stop that list growing is to ask at the one moment
     somebody is holding the tire. */
  const capWhy = capNeeded(f.type, f.caps);
  const ok = f.onOdo !== "" && Number(f.newDepth) > 0 && brandFinal !== "" && !capWhy;

  /* Everything about the tire except where it sits and how deep it is.
     Those two are per wheel, always. */
  const specOf = () => ({
    brand: brandFinal, model: f.model.trim(), size: f.size.trim(),
    type: f.type, caps: f.caps === "" ? null : Number(f.caps),
    wheel: f.wheel, onDate: f.onDate, onOdo: Number(f.onOdo),
    cost: f.cost ? Number(f.cost) : null, casing: f.casing.trim(),
    notes: f.notes.trim(),
  });

  async function mountFirst() {
    const sp = specOf();
    await onSave({ ...sp, pos: pos.id, newDepth: Number(f.newDepth) });
    if (freePositions.length && onSaveMany) { setSpec(sp); setStep("copy"); }
    else onClose();
  }

  /* A copied tire needs its own tread reading. Depth is the one number
     the whole app is built on, so an unmeasured wheel is left out rather
     than given its neighbour's number. */
  const chosen = freePositions.filter((p) => Number(pick[p.id]) > 0);

  async function copyToChosen() {
    await onSaveMany(chosen.map((p) => ({
      ...spec, pos: p.id, newDepth: Number(pick[p.id]),
    })));
    onClose();
  }

  if (step === "copy") {
    return (
      <Modal title="Put the same tire on other wheels"
        sub={`${veh} · ${spec.brand}${spec.model ? " " + spec.model : ""}${spec.size ? " · " + spec.size : ""}`}
        onClose={onClose}>
        <p style={{ fontSize: 13, color: C.muted, marginTop: 0, lineHeight: 1.5 }}>
          {pos.id} is mounted. Type a tread depth beside any wheel carrying the same
          tire and it goes on too — brand, model, size, type, wheel and the mount
          odometer all copy across. Leave a wheel blank to skip it.
        </p>
        <div style={{ border: `1px solid ${C.lineSoft}`, borderRadius: 6, overflow: "hidden" }}>
          {freePositions.map((p, i) => (
            <div key={p.id} className="flex items-center"
              style={{ gap: 12, padding: "8px 12px",
                borderTop: i ? `1px solid ${C.lineSoft}` : "none" }}>
              <span style={{ fontFamily: FM, fontWeight: 600, width: 46 }}>{p.id}</span>
              <span style={{ color: C.muted, fontSize: 13, flex: 1 }}>
                {p.role}{p.slot === "O" ? " outer" : p.slot === "I" ? " inner" : ""}
              </span>
              <input type="number" step="0.5" min="0" placeholder="tread"
                value={pick[p.id] ?? ""}
                onChange={(e) => setPick((q) => ({ ...q, [p.id]: e.target.value }))}
                style={{ ...inp, fontFamily: FM, width: 96, padding: "6px 8px" }} />
              <span style={{ color: C.muted, fontSize: 12, width: 24 }}>/32</span>
            </div>
          ))}
        </div>
        <div className="flex justify-between items-center mt-4" style={{ gap: 8 }}>
          <span style={{ fontSize: 12, color: C.muted }}>
            {chosen.length
              ? `${chosen.length} more ${chosen.length === 1 ? "wheel" : "wheels"}`
              : "Nothing selected"}
          </span>
          <div className="flex" style={{ gap: 8 }}>
            <Btn tone="ghost" onClick={onClose}>Done</Btn>
            <Btn disabled={busy || !chosen.length} onClick={copyToChosen}>
              Mount {chosen.length || ""} more
            </Btn>
          </div>
        </div>
      </Modal>
    );
  }

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
        {/* A retread is not one thing. A first cap on a good casing and
            a third on a tired one wear differently and cost
            differently, and without this every retread on the fleet
            looked identical to every other. */}
        {f.type === "retread" && (
          <Field label="Times capped">
            <select value={f.caps ?? ""} onChange={set("caps")}
              style={{ ...inp, borderColor: f.caps ? C.line : C.pull }}>
              <option value="">How many times?</option>
              {CAPS.map((n) => (
                <option key={n} value={n}>{capLabel(n)} cap</option>
              ))}
            </select>
          </Field>
        )}
        <Field label="Wheel">
          <select value={f.wheel} onChange={set("wheel")} style={inp}>
            <option value="">Not recorded</option>
            <option value="aluminum">Aluminum</option>
            <option value="steel">Steel</option>
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
        <Btn disabled={busy || !ok} onClick={mountFirst}>Mount tire</Btn>
      </div>
    </Modal>
  );
}

/* ── Correcting a tire already on a truck ─────────────────────────
   Everything about a tire was decided at the moment somebody mounted
   it, and a typo was permanent: there is no delete, so "Michelin vdn2"
   stayed that way and a tire keyed to the wrong wheel stayed on the
   wrong wheel for the life of the casing.

   Two of these boxes are not cosmetic. The mount odometer and the mount
   tread are the first point tw_tire_wear measures from, so changing
   them changes the wear rate, the estimated miles left and the cost per
   mile. The form says so, rather than letting somebody find out from a
   number that moved. */
function EditTire({ tire, brands, freePositions, busy, movedSinceMount, readings = [], onCancel, onSave }) {
  /* A brand that is not on the list — typed through Other when the tire
     was mounted, or since turned off in Setup — must not be silently
     swapped for the first one in the dropdown. */
  const known = brands.includes(tire.brand);
  const [f, setF] = useState({
    pos: tire.pos,
    brand: tire.brand ? (known ? tire.brand : "Other") : "",
    brandOther: known ? "" : (tire.brand || ""),
    model: tire.model || "",
    size: tire.size || "",
    type: tire.type || "virgin",
    caps: tire.caps == null ? "" : String(tire.caps),
    wheel: tire.wheel || "",
    casing: tire.casing || "",
    onDate: tire.onDate || todayISO(),
    onOdo: tire.onOdo == null ? "" : String(tire.onOdo),
    newDepth: tire.newDepth == null ? "" : String(tire.newDepth),
    cost: tire.cost == null ? "" : String(tire.cost),
  });
  const [err, setErr] = useState("");
  const set = (k) => (e) => { setF((p) => ({ ...p, [k]: e.target.value })); setErr(""); };

  const isOther = f.brand === "Other";
  const brandName = isOther ? f.brandOther.trim() : f.brand;

  const depthBad = tooBig(f.newDepth, { label: "Tread when mounted", max: 99, decimals: 1 });
  const odoBad = tooBig(f.onOdo, { label: "The mount odometer", max: 3000000, decimals: 0 });
  const costBad = tooBig(f.cost, { label: "Cost", max: 99999, decimals: 2 });
  const bad = depthBad || odoBad || costBad;

  const movedWheel = f.pos !== tire.pos;
  const movedMount = String(f.onOdo) !== String(tire.onOdo ?? "")
    || String(f.newDepth) !== String(tire.newDepth ?? "")
    || f.onDate !== (tire.onDate || "");
  const badMount = checkMount(f.newDepth, readings);

  const ok = !!brandName && !!f.pos && !!f.onDate
    && Number(f.newDepth) > 0 && f.onOdo !== "" && Number(f.onOdo) >= 0 && !bad;

  const save = async () => {
    setErr("");
    try {
      await onSave({
        pos: f.pos, brand: brandName, model: f.model.trim(), size: f.size.trim(),
        type: f.type, caps: f.caps === "" ? null : Number(f.caps),
        wheel: f.wheel, casing: f.casing.trim(),
        onDate: f.onDate, onOdo: Number(f.onOdo), newDepth: Number(f.newDepth),
        cost: f.cost === "" ? null : Number(f.cost),
      });
    } catch (e) {
      /* The one it will actually hit: two tires cannot sit on the same
         wheel, and the index says so in Postgres rather than English. */
      setErr(sayOffline(e) || (e?.code === "23505"
        ? `There is already a tire on ${f.pos}. Pull that one off first.`
        : saySo(e, { mounted_odometer: { label: "The mount odometer", limit: "it is too big" },
                     mounted_depth: { label: "Tread when mounted", limit: "it is too big" },
                     cost: { label: "Cost", limit: "it is too big" } })));
    }
  };

  return (
    <Modal width={620} onClose={onCancel}
      title={`Edit ${tire.pos} · ${tire.brand || "Unbranded"}`}
      sub={`${tire.veh} · correcting what was entered when it went on`}>
      <div className="grid gap-3" style={{ gridTemplateColumns: "1fr 1fr" }}>
        <Field label="Wheel position">
          <select value={f.pos} onChange={set("pos")} style={{ ...inp, fontFamily: FM }}>
            {freePositions.map((p) => (
              <option key={p.id} value={p.id}>
                {p.id}{p.id === tire.pos ? " (where it is)" : " — empty"}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Brand">
          <select value={f.brand} onChange={set("brand")} style={inp}>
            <option value="">Choose a brand…</option>
            {brands.map((b) => <option key={b} value={b}>{b}</option>)}
            <option value="Other">Other…</option>
          </select>
        </Field>
        {isOther ? (
          <Field label="Brand name">
            <input value={f.brandOther} onChange={set("brandOther")}
              placeholder="Type the brand" style={inp} /></Field>
        ) : (
          <Field label="Model / pattern">
            <input value={f.model} onChange={set("model")} placeholder="M726, XDN2…"
              style={inp} /></Field>
        )}
        {isOther && (
          <Field label="Model / pattern">
            <input value={f.model} onChange={set("model")} placeholder="M726, XDN2…"
              style={inp} /></Field>
        )}
        <Field label="Size">
          <input value={f.size} onChange={set("size")} style={inp} /></Field>
        <Field label="Type">
          <select value={f.type} onChange={set("type")} style={inp}>
            <option value="virgin">Virgin</option>
            <option value="retread">Retread</option>
          </select>
        </Field>
        {/* A retread is not one thing. A first cap on a good casing and
            a third on a tired one wear differently and cost
            differently, and without this every retread on the fleet
            looked identical to every other. */}
        {f.type === "retread" && (
          <Field label="Times capped">
            <select value={f.caps ?? ""} onChange={set("caps")}
              style={{ ...inp, borderColor: f.caps ? C.line : C.pull }}>
              <option value="">How many times?</option>
              {CAPS.map((n) => (
                <option key={n} value={n}>{capLabel(n)} cap</option>
              ))}
            </select>
          </Field>
        )}
        <Field label="Wheel">
          <select value={f.wheel} onChange={set("wheel")} style={inp}>
            <option value="">Not recorded</option>
            <option value="aluminum">Aluminum</option>
            <option value="steel">Steel</option>
          </select>
        </Field>
        <Field label="Cost ($)">
          <input type="number" step="0.01" value={f.cost} onChange={set("cost")}
            placeholder="optional" style={{ ...inp, fontFamily: FM }} /></Field>
        <div style={{ gridColumn: "1 / -1" }}>
          <Field label="Casing / serial (optional)">
            <input value={f.casing} onChange={set("casing")} style={inp} /></Field>
        </div>
      </div>

      <div style={{ borderTop: `1px solid ${C.line}`, margin: "16px 0 12px" }} />
      <SectionLabel noMargin>When it went on</SectionLabel>
      <div className="grid gap-3" style={{ gridTemplateColumns: "1fr 1fr 1fr", marginTop: 8 }}>
        <Field label="Date mounted">
          <input type="date" value={f.onDate} onChange={set("onDate")} style={inp} /></Field>
        <Field label="Odometer (mi)">
          <input type="number" value={f.onOdo} onChange={set("onOdo")}
            style={{ ...inp, fontFamily: FM }} /></Field>
        <Field label="Tread (/32)">
          <input type="number" step="0.5" value={f.newDepth} onChange={set("newDepth")}
            style={{ ...inp, fontFamily: FM }} /></Field>
      </div>

      {movedMount && (
        <p style={{ fontSize: 12.5, color: C.watch, fontWeight: 600,
          margin: "8px 0 0", lineHeight: 1.5 }}>
          These three are the first point the wear is measured from
          {movedSinceMount ? "" : " — and the only one, until a walk-around"}.
          Changing them changes the wear rate, the miles left and the cost per mile.
        </p>
      )}
      {/* A mount depth keyed too shallow is the quiet version of the
          same mistake: the tire never shows wear against it, so the
          wheel goes blank and looks unmeasured. Said whether or not
          the figure was touched, because on a tire that already reads
          deeper than it started, the point IS to touch it. */}
      {badMount && (
        <p style={{ fontSize: 12.5, color: C.pull, fontWeight: 600,
          margin: "8px 0 0", lineHeight: 1.5 }}>
          {sayMount(badMount)}
        </p>
      )}
      {movedWheel && (
        <p style={{ fontSize: 12.5, color: C.watch, fontWeight: 600,
          margin: "8px 0 0", lineHeight: 1.5 }}>
          Moving it to {f.pos} takes its readings with it, as though it had been on
          {f.pos} all along. Do this only for a position keyed wrong. To record the
          tire actually being moved, close this and use <i>Move to another wheel</i>,
          which dates the move and can swap it with the tire already there.
        </p>
      )}
      {bad && (
        <p style={{ fontSize: 12.5, color: C.pull, fontWeight: 600, margin: "8px 0 0" }}>
          {bad}
        </p>
      )}
      {err && (
        <p style={{ fontSize: 12.5, color: C.pull, fontWeight: 600, margin: "8px 0 0" }}>
          {err}
        </p>
      )}

      <p style={{ fontSize: 12, color: C.muted, margin: "10px 0 0", lineHeight: 1.5 }}>
        This corrects the record. To take the tire off the truck, close this and use
        <b> Pull this tire off</b>. To put it on a different truck, pull it and mount it
        there, so the miles land on the right one.
      </p>

      <div className="flex justify-end mt-4" style={{ gap: 8 }}>
        <Btn tone="ghost" onClick={onCancel}>Cancel</Btn>
        <Btn disabled={busy || !ok} onClick={save}>Save changes</Btn>
      </div>
    </Modal>
  );
}

/* Why a tire came off. Shared, because a tire displaced by a move
   comes off for the same reasons as one pulled on its own. */
const PULL_REASONS = ["Worn out", "Road hazard", "Sidewall damage",
  "Irregular wear", "Rotated off", "Casing sent to retread"];

function TireDialog({ tire, stats, settings, brands, freePositions = [], busy,
                     positions = [], activeTireAt = {}, tireStats = {}, lastOdo,
                     onClose, onPull, onSaveDetails, onSaveNotes, onDeleteReading, onMove }) {
  const [pulling, setPulling] = useState(false);
  const [editing, setEditing] = useState(false);
  const [moving, setMoving] = useState(false);
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

  /* Where it could go: every other wheel on this truck, taken or not.
     A rotation is two tires trading places far more often than it is a
     tire moving onto a bare wheel, so occupied ones are offered too. */
  const [toPos, setToPos] = useState("");
  const [moveDate, setMoveDate] = useState(todayISO());
  const [moveOdo, setMoveOdo] = useState(lastOdo != null ? String(lastOdo) : "");
  /* What becomes of the tire already on the wheel. Replace by default:
     a tire is usually moved onto a wheel whose tire is being scrapped,
     and defaulting to a swap would quietly put a worn-out tire back on
     the truck. */
  const [moveMode, setMoveMode] = useState(REPLACE);
  const [offReason, setOffReason] = useState(PULL_REASONS[0]);
  const wheels = destinations(positions, activeTireAt, tire.veh, tire.pos);
  const landingOn = wheels.find((w) => w.id === toPos) || null;
  const displaced = landingOn?.taken || null;
  const moveWhy = checkMove(tire.pos, toPos,
    { other: displaced, mode: moveMode, offDate: moveDate });

  const chart = (stats?.pts || []).map((p) => ({
    odo: p.odo, depth: p.d, label: nf(p.odo / 1000, 0) + "k",
  }));
  const cpm = tire.cost && stats?.miles ? tire.cost / stats.miles : null;

  if (editing) {
    return (
      <EditTire tire={tire} brands={brands} freePositions={freePositions} busy={busy}
        movedSinceMount={!!stats?.pts?.some((p) => !p.mount)}
        /* The gauged readings only. The mount is what is being edited,
           so it cannot be its own evidence. */
        readings={(stats?.pts || []).filter((p) => !p.mount)}
        onCancel={() => setEditing(false)} onSave={onSaveDetails} />
    );
  }

  return (
    <Modal width={620} onClose={onClose}
      title={`${tire.pos} · ${tire.brand || "Unbranded"}${tire.model ? " " + tire.model : ""}`}
      sub={`${tire.veh} · ${sayType(tire.type, tire.caps)} · ${tire.size || "size not set"}${
        WHEEL_LABEL[tire.wheel] ? ` · ${WHEEL_LABEL[tire.wheel]} wheel` : ""}`}>
      {/* A tire's details were fixed at the moment it was mounted, and a
          typo in the brand or the mount odometer was permanent — there
          is no delete. */}
      <div className="flex justify-end" style={{ marginBottom: 4 }}>
        <button onClick={() => setEditing(true)} style={{ ...linkBtn, fontSize: 12.5 }}>
          Edit these details
        </button>
      </div>

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

      {!pulling && !moving && (
        <div className="flex justify-between items-center">
          <div className="flex items-center" style={{ gap: 16 }}>
            <button onClick={() => setPulling(true)} style={{ ...linkBtn, color: C.pull, fontWeight: 600 }}>
              Pull this tire off
            </button>
            {/* A rotation, not a correction. The edit form changes a
                position that was keyed wrong; this one records the tire
                actually being moved, and can swap it with the tire
                already on the other wheel. */}
            <button onClick={() => { setMoving(true); setToPos(""); }}
              style={{ ...linkBtn, fontWeight: 600 }}>
              Move to another wheel
            </button>
          </div>
          <Btn tone="ghost" onClick={onClose}>Close</Btn>
        </div>
      )}

      {moving && (
        <div style={{ borderTop: `1px solid ${C.lineSoft}`, paddingTop: 14 }}>
          <SectionLabel>Move this tire</SectionLabel>
          <div className="grid gap-3" style={{ gridTemplateColumns: "1fr 1fr 1fr" }}>
            <Field label="Onto which wheel">
              <select value={toPos} onChange={(e) => setToPos(e.target.value)}
                style={{ ...inp, fontFamily: FM }}>
                <option value="">Choose a wheel…</option>
                {wheels.map((w) => (
                  <option key={w.id} value={w.id}>
                    {w.id} · {w.taken
                      ? `${w.taken.brand || "Unbranded"}${
                          tireStats[w.taken.id]?.depth != null
                            ? ` ${tireStats[w.taken.id].depth}/32` : ""}`
                      : "empty"}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Date moved"><input type="date" value={moveDate}
              onChange={(e) => setMoveDate(e.target.value)} style={inp} /></Field>
            <Field label="Odometer (mi)"><input type="number" inputMode="numeric"
              value={moveOdo} onChange={(e) => setMoveOdo(e.target.value)}
              placeholder="optional" style={{ ...inp, fontFamily: FM }} /></Field>
          </div>

          {/* The question the first version never asked. A wheel that
              is taken can go two ways and they are not interchangeable:
              one keeps both tires on the truck, the other takes one
              off it. */}
          {displaced && (
            <div style={{ marginTop: 12 }}>
              <SectionLabel noMargin>
                And the {displaced.brand || "tire"} on {toPos}
              </SectionLabel>
              <div className="flex flex-wrap items-center" style={{ gap: 14, marginTop: 7 }}>
                <label className="flex items-center" style={{ gap: 6, fontSize: 13, cursor: "pointer" }}>
                  <input type="radio" name="movemode" checked={moveMode === REPLACE}
                    onChange={() => setMoveMode(REPLACE)} />
                  Comes off the truck
                </label>
                <label className="flex items-center" style={{ gap: 6, fontSize: 13, cursor: "pointer" }}>
                  <input type="radio" name="movemode" checked={moveMode === SWAP}
                    onChange={() => setMoveMode(SWAP)} />
                  Goes on {tire.pos} — they trade places
                </label>
                {moveMode === REPLACE && (
                  <select value={offReason} onChange={(e) => setOffReason(e.target.value)}
                    style={{ ...inp, width: "auto", padding: "5px 8px", fontSize: 12.5 }}>
                    {PULL_REASONS.map((r) => <option key={r}>{r}</option>)}
                  </select>
                )}
              </div>
            </div>
          )}

          {/* What is about to happen, before it happens. The two treads
              are in it because that is what somebody rotating is
              deciding on: which way round the deep one should go. */}
          {toPos && !moveWhy && (
            <p style={{ fontSize: 13, color: C.ink, fontWeight: 600, margin: "10px 0 0" }}>
              {sayMove({ from: tire.pos, to: toPos, moving: tire,
                         other: displaced, stats: tireStats, mode: moveMode })}
            </p>
          )}
          {toPos && moveWhy && (
            <p style={{ fontSize: 12.5, color: C.pull, fontWeight: 600, margin: "10px 0 0" }}>
              {moveWhy}
            </p>
          )}
          {toPos && sayThreshold(tire.pos, toPos, settings) && (
            <p style={{ fontSize: 12.5, color: C.watch, fontWeight: 600,
              margin: "6px 0 0", lineHeight: 1.5 }}>
              {sayThreshold(tire.pos, toPos, settings)}
            </p>
          )}
          <p style={{ fontSize: 12, color: C.muted, margin: "8px 0 0", lineHeight: 1.5 }}>
            The tire being moved keeps its readings and its mount figures — it is the same
            casing on a different wheel, so the wear rate carries on. {tire.pos} is left
            empty. Use <i>Edit these details</i>{" "}
            instead if the position was simply keyed wrong in the first place.
          </p>

          <div className="flex justify-end mt-3" style={{ gap: 8 }}>
            <Btn tone="ghost" onClick={() => setMoving(false)}>Never mind</Btn>
            <Btn disabled={busy || !!moveWhy || !toPos}
              onClick={() => onMove({
                to: toPos, when: moveDate,
                odo: moveOdo === "" ? null : Number(moveOdo),
                other: displaced, mode: moveMode, reason: offReason,
              })}>
              {!displaced ? "Move it"
                : moveMode === SWAP ? "Swap them"
                : `Move it, ${toPos} comes off`}
            </Btn>
          </div>
        </div>
      )}

      {pulling && (
        <div style={{ borderTop: `1px solid ${C.lineSoft}`, paddingTop: 14 }}>
          <SectionLabel>Pull this tire</SectionLabel>
          <div className="grid gap-3" style={{ gridTemplateColumns: "1fr 1fr 1fr" }}>
            <Field label="Date off"><input type="date" value={offDate}
              onChange={(e) => setOffDate(e.target.value)} style={inp} /></Field>
            <Field label="Odometer off"><input type="number" value={offOdo}
              onChange={(e) => setOffOdo(e.target.value)} style={{ ...inp, fontFamily: FM }} /></Field>
            <Field label="Reason">
              <select value={reason} onChange={(e) => setReason(e.target.value)} style={inp}>
                {PULL_REASONS.map((r) => <option key={r}>{r}</option>)}
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
  /* Split by cap as well as by retread-or-not: a first cap and a
     third are what this chart was quietly averaging together. */
  const byType = group((t) => sayType(t.type, t.caps));
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
                  <td style={{ ...td, color: C.muted }}>{sayType(t.type, t.caps)}</td>
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
  /* One box, one address a line — a supervisor should not have to think
     about comma placement to be told a steer tire is down to 5/32. */
  const [emails, setEmails] = useState((settings.alertEmails || []).join("\n"));

  useEffect(() => { setDraft(settings); }, [settings]);
  useEffect(() => {
    setEmails((settings.alertEmails || []).join("\n"));
  }, [settings.alertEmails]);

  const emailList = emails.split(/[\n,;]+/).map((x) => x.trim()).filter(Boolean);
  const badEmail = emailList.find((x) => !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(x));
  const emailsDirty =
    JSON.stringify(emailList) !== JSON.stringify(settings.alertEmails || []);

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
    const head = ["truck", "position", "brand", "model", "size", "type", "times_capped",
      "wheel", "casing",
      "mounted_date", "mounted_odo", "mounted_32nds", "current_32nds",
      "miles_run", "miles_per_32nd", "miles_per_mil", "est_miles_left", "cost", "status",
      "note"];
    const rows = tires.map((t) => {
      const s = tireStats[t.id] || {};
      return [t.veh, t.pos, t.brand, t.model, t.size, t.type, t.caps ?? "",
        t.wheel, t.casing, t.onDate, t.onOdo,
        t.newDepth, s.depth ?? "", s.miles ?? "", s.miPer32 ? Math.round(s.miPer32) : "",
        s.miPer32 ? Math.round(s.miPer32 / MILS_PER_32ND) : "",
        s.remain ? Math.round(s.remain) : "", t.cost ?? "", STATUS_LABEL[s.status] || "",
        t.notes || ""];
    });
    download("allen-tires.csv", toCSV([head, ...rows]));
  }

  function exportReadings() {
    const tById = Object.fromEntries(tires.map((t) => [t.id, t]));
    const head = ["date", "truck", "position", "odometer", "tread_32nds", "brand", "type",
      "times_capped"];
    const rows = readings
      .map((r) => {
        const t = tById[r.tire];
        return t ? [r.date, t.veh, t.pos, r.odo, r.d, t.brand, t.type, t.caps ?? ""] : null;
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
          <Field label="Flag duals more than (/32) apart">
            <input type="number" step="0.5" min="0" value={draft.dualMatch}
              onChange={edit("dualMatch")} onBlur={commit("dualMatch")}
              style={{ ...inp, fontFamily: FM }} /></Field>
        </div>
        <p style={{ fontSize: 12, color: C.muted, marginTop: 10, lineHeight: 1.5 }}>
          Two tires on the same end of an axle carry the load together and only share
          it if they are close to the same size. Four 32nds is the usual figure. A pair
          further apart than this is flagged on the truck and in the list on the left —
          set it to 0 to flag any difference at all.
        </p>
      </Card>

      <Card title="Tire alerts"
        note="Emailed when a tire reaches the pull depth above, and every Monday at 7:30 while any are still on.">
        <Field label="Send to (one address a line)">
          <textarea value={emails} onChange={(e) => setEmails(e.target.value)}
            rows={3} placeholder="nobody yet — alerts are off"
            style={{ ...inp, fontFamily: FM, resize: "vertical" }} />
        </Field>
        <div className="flex items-center flex-wrap mt-2" style={{ gap: 10 }}>
          <Btn disabled={busy || !!badEmail || !emailsDirty}
            onClick={() => actions.updateSettings({ alertEmails: emailList })}>
            Save addresses
          </Btn>
          <span style={{ fontSize: 12, color: badEmail ? C.pull : C.muted }}>
            {badEmail ? `${badEmail} does not look like an address`
              : emailList.length
                ? `${emailList.length} ${emailList.length === 1 ? "address" : "addresses"}`
                : "No addresses — nothing is sent"}
          </span>
        </div>
        <p style={{ fontSize: 12, color: C.muted, marginTop: 12, lineHeight: 1.5 }}>
          A tire is reported once, when a walk-around first takes it to the pull
          depth. It will not be reported again unless it goes back above the line
          and wears down a second time — so the same worn tire does not arrive
          every Monday, but a list of what is still on does.
        </p>
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

