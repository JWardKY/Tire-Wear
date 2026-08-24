import React, { useState, useEffect, useMemo, useRef } from "react";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell,
  LineChart, Line, Legend,
} from "recharts";

/* ────────────────────────────────────────────────────────────────
   THE ALLEN COMPANY · HAUL DIVISION — TIRE WEAR
   Tread depth tracking + miles-per-32nd wear rate
   Fleet roster pulled from Motive 08/24/2026 (active DT + HT)
   ──────────────────────────────────────────────────────────────── */

const C = {
  navy900: "#0B1D33",
  navy800: "#12294A",
  navy700: "#1B3A63",
  navy600: "#2A4E7E",
  gold: "#C8A02C",
  goldHi: "#E5BC3F",
  paper: "#EDF0F4",
  card: "#FFFFFF",
  line: "#D5DDE6",
  lineSoft: "#E6ECF2",
  ink: "#10202F",
  muted: "#64748B",
  good: "#2F7D4F",
  watch: "#C98A12",
  pull: "#B4302A",
};

const FD = "'Barlow Condensed', 'Oswald', 'Arial Narrow', system-ui, sans-serif";
const FB = "'Barlow', system-ui, -apple-system, 'Segoe UI', sans-serif";
const FM = "'JetBrains Mono', ui-monospace, SFMono-Regular, Menlo, monospace";

/* ── Fleet roster from Motive ─────────────────────────────────── */
const FLEET_RAW = [
  // DT — dump trucks
  ["DT-808","Mack","Gu713","2013"],["DT-861","Mack","Gu713","2018"],
  ["DT-862","Mack","Gu713","2018"],["DT-864","Mack","Gu713","2018"],
  ["DT-865","Mack","Gu713","2018"],["DT-866","Mack","Gu713","2018"],
  ["DT-867","Mack","Gu713","2018"],["DT-868","Mack","Gu713","2018"],
  ["DT-869","Mack","Gu713","2018"],["DT-870","Mack","Gu713","2018"],
  ["DT-871","Mack","Gu713","2018"],["DT-873","Kenworth","T880","2018"],
  ["DT-874","Mack","Gu713","2017"],["DT-875","Mack","Gu713","2017"],
  ["DT-876","Kenworth","T880","2021"],["DT-877","Kenworth","T880","2021"],
  ["DT-878","Peterbilt","567","2022"],["DT-879","Kenworth","T880","2022"],
  ["DT-880","Kenworth","T880","2022"],["DT-881","Kenworth","T880","2022"],
  ["DT-882","Kenworth","T880","2020"],["DT-883","Kenworth","T880","2020"],
  ["DT-884","Peterbilt","567","2023"],["DT-885","Peterbilt","567","2023"],
  ["DT-886","Peterbilt","567","2023"],["DT-887","Mack","Gu713","2023"],
  ["DT-888","Mack","Gu713","2023"],["DT-889","Mack","Gu713","2023"],
  ["DT-890","Mack","Gu713","2023"],["DT-891","Mack","Gu713","2023"],
  ["DT-892","Peterbilt","567","2022"],["DT-893","Kenworth","T880","2023"],
  ["DT-895","Kenworth","T880","2024"],["DT-896","Kenworth","T880",""],
  ["DT-897","Kenworth","T880",""],["DT-898","Peterbilt","567","2025"],
  ["DT-899","Peterbilt","567","2024"],["DT-1800","Kenworth","T880","2025"],
  ["DT-1801","Kenworth","T880","2025"],["DT-1802","Peterbilt","567","2025"],
  ["DT-1803","Peterbilt","567","2025"],["DT-1804","Kenworth","T880","2025"],
  ["DT-1805","Peterbilt","567","2026"],["DT-1806","Mack","Granite","2024"],
  ["DT-1807","Kenworth","T880","2024"],["DT-1808","Kenworth","T880","2025"],
  ["DT-1809","Kenworth","T880","2024"],["DT-1810","Kenworth","T880","2026"],
  ["DT-1811","Kenworth","T880","2027"],["DT-1812","Kenworth","T880","2027"],
  // HT — haul / service trucks
  ["HT-132","GMC","C7D","1990"],["HT-155","International","2654","1998"],
  ["HT-169","International","4x2",""],["HT-183","GMC","7500","2006"],
  ["HT-184","GMC","7500","2006"],["HT-194","International","7300",""],
  ["HT-239","Chevrolet","C4 (DRS Maint)","2008"],["HT-304","Peterbilt","335",""],
  ["HT-305","Ford","350 (CBQ Steam Jenny)","2010"],["HT-350","Mack","CV713",""],
  ["HT-358","Freightliner","M2106","2012"],["HT-371","International","7300",""],
  ["HT-396","Dodge","5500",""],["HT-455","Kenworth","T-270","2013"],
  ["HT-468","Hino","268 (BBQ Maint)","2013"],["HT-504","Peterbilt","335","2006"],
  ["HT-624","Peterbilt","338","2015"],["HT-642","Peterbilt","357","2001"],
  ["HT-643","International","4300","2011"],["HT-644","International","4300","2011"],
  ["HT-645","International","4300","2011"],["HT-712","Ford","F-550","2016"],
  ["HT-713","Peterbilt","337","2016"],["HT-714","Freightliner","M2",""],
  ["HT-746","Kenworth","T300","2007"],["HT-794","Chevrolet","3500","2016"],
  ["HT-795","Peterbilt","220",""],["HT-852","Peterbilt","389","2012"],
  ["HT-929","Ford","F-450","2016"],["HT-968","Chevrolet","3500",""],
  ["HT-969","Ford","F-550","2018"],["HT-1010","International","7300",""],
  ["HT-1014","Peterbilt","220",""],["HT-1037","International","4400","2003"],
  ["HT-1078","Chevrolet","5500","2019"],["HT-1081","Chevrolet","3500","2016"],
  ["HT-1115","Hino","268",""],["HT-1116","Kenworth","T880 (Danville Lowboy)","2020"],
  ["HT-1119","Mack","Pinnacle","2021"],["HT-1128","Kenworth","T3","2015"],
  ["HT-1129","Kenworth","270",""],["HT-1142","Ford","F-550","2020"],
  ["HT-1148","Mack","P164T",""],["HT-1177","Chevrolet","4500","2021"],
  ["HT-1178","Peterbilt","335","2014"],["HT-1190","Chevrolet","6500","2021"],
  ["HT-1196","Chevrolet","6500","2021"],["HT-1198","Chevrolet","4500","2021"],
  ["HT-1203","Chevrolet","5500","2021"],["HT-1208","Chevrolet","5500 (Field Mech)","2021"],
  ["HT-1211","Ford","F-550",""],["HT-1258","Kenworth","T800 (Lowboy)","2014"],
  ["HT-1259","Kenworth","W900","2005"],["HT-1264","Mack","MD6","2022"],
  ["HT-1266","Freightliner","M2",""],["HT-1271","Mack","MD6","2023"],
  ["HT-1294","Ford","F-550","2012"],["HT-1295","Chevrolet","3500","2020"],
  ["HT-1296","Dodge","5500","2022"],["HT-1299","Chevrolet","3500","2006"],
  ["HT-1300","International","4700","2001"],["HT-1301","Peterbilt","388","2014"],
  ["HT-1302","Peterbilt","379","1997"],["HT-1306","Chevrolet","5500","2023"],
  ["HT-1313","RAM","4500","2018"],["HT-1321","Chevrolet","5500","2023"],
  ["HT-1323","Chevrolet","6500","2023"],["HT-1325","Ford","F-750","2011"],
  ["HT-1333","Peterbilt","335","2007"],["HT-1336","GMC","515","2022"],
  ["HT-1341","—","BBQ Grease Truck","2007"],["HT-1348","Peterbilt","567","2025"],
  ["HT-1349","GMC","Savana","2019"],["HT-1371","Mack","MD6","2025"],
  ["HT-1373","Peterbilt","548","2025"],["HT-1403","Ford","F-750","2018"],
  ["HT-1404","Ford","F-750","2019"],["HT-1420","Mack","MD (Danville Flatbed)","2025"],
  ["HT-1448","Ford","F-550","2024"],["HT-1470","Freightliner","M2","2026"],
  ["HT-1494","Mack","—",""],["HT-1495","—","—",""],
  ["HT-1512","Western Star","4700","2021"],["HT-1523","Mack","MD6","2025"],
];

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

function defaultConfig(num, model) {
  if (num.startsWith("DT")) return "dump12";
  const m = `${model}`.toLowerCase();
  if (/t880|t800|w900|389|388|379|567|548|pinnacle|p164|cv713|4700 sweeper|western/.test(m))
    return "tandem10";
  if (/savana|f-150|1500/.test(m)) return "light4";
  return "single6";
}

const FLEET = FLEET_RAW.map(([num, make, model, year]) => ({
  num, make, model, year, div: num.startsWith("DT") ? "DT" : "HT",
  cfg: defaultConfig(num, model),
}));

/* ── Helpers ──────────────────────────────────────────────────── */
const uid = () => Math.random().toString(36).slice(2, 10);
const todayISO = () => new Date().toISOString().slice(0, 10);
const nf = (n, d = 0) =>
  n === null || n === undefined || !isFinite(n) ? "—"
    : Number(n).toLocaleString("en-US", { minimumFractionDigits: d, maximumFractionDigits: d });
const fmtDate = (s) => (s ? s.slice(5).replace("-", "/") + "/" + s.slice(2, 4) : "—");
const MILS_PER_32ND = 31.25;

const DEFAULTS = { pullSteer: 6, pullOther: 4, newDepth: 28, unit: "32nd" };

/* Brands we run. "Other" opens a text box so nothing gets lost —
   anything typed there is stored as-is and shows up in Analysis. */
const BRANDS = [
  "Bridgestone", "Continental", "Firestone",
  "Goodyear", "Maxam", "Michelin",
];

function statusOf(depth, pull) {
  if (depth === null || depth === undefined) return "none";
  if (depth <= pull) return "pull";
  if (depth <= pull + 3) return "watch";
  return "good";
}
const STATUS_COLOR = { good: C.good, watch: C.watch, pull: C.pull, none: "#94A3B8" };
const STATUS_LABEL = { good: "In service", watch: "Monitor", pull: "Pull", none: "No reading" };

/* ── Root ─────────────────────────────────────────────────────── */
export default function TireWear() {
  const [ready, setReady] = useState(false);
  const [err, setErr] = useState(null);
  const [tab, setTab] = useState("fleet");
  const [sel, setSel] = useState(null);
  const [q, setQ] = useState("");
  const [divFilter, setDivFilter] = useState("ALL");

  const [vehCfg, setVehCfg] = useState({});
  const [tires, setTires] = useState([]);
  const [readings, setReadings] = useState([]);
  const [odos, setOdos] = useState([]);
  const [settings, setSettings] = useState(DEFAULTS);

  const dirty = useRef(false);
  const saveTimer = useRef(null);

  useEffect(() => {
    const link = document.createElement("link");
    link.rel = "stylesheet";
    link.href =
      "https://fonts.googleapis.com/css2?family=Barlow+Condensed:wght@500;600;700&family=Barlow:wght@400;500;600;700&family=JetBrains+Mono:wght@400;600&display=swap";
    document.head.appendChild(link);
  }, []);

  useEffect(() => {
    (async () => {
      try {
        const r = await window.storage.get("tireapp:v1");
        if (r && r.value) {
          const d = JSON.parse(r.value);
          setVehCfg(d.vehCfg || {});
          setTires(d.tires || []);
          setReadings(d.readings || []);
          setOdos(d.odos || []);
          setSettings({ ...DEFAULTS, ...(d.settings || {}) });
        }
      } catch (e) {
        // No saved data yet — first run.
      }
      setReady(true);
    })();
  }, []);

  useEffect(() => {
    if (!ready) return;
    dirty.current = true;
    clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(async () => {
      try {
        await window.storage.set(
          "tireapp:v1",
          JSON.stringify({ vehCfg, tires, readings, odos, settings })
        );
        dirty.current = false;
        setErr(null);
      } catch (e) {
        setErr("Changes did not save. Check your connection and try again.");
      }
    }, 700);
    return () => clearTimeout(saveTimer.current);
  }, [vehCfg, tires, readings, odos, settings, ready]);

  const fleet = useMemo(
    () => FLEET.map((v) => ({ ...v, cfg: vehCfg[v.num] || v.cfg })),
    [vehCfg]
  );
  const byNum = useMemo(() => Object.fromEntries(fleet.map((v) => [v.num, v])), [fleet]);

  const readingsByTire = useMemo(() => {
    const m = {};
    readings.forEach((r) => { (m[r.tire] ||= []).push(r); });
    Object.values(m).forEach((a) => a.sort((x, y) => x.odo - y.odo));
    return m;
  }, [readings]);

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
      let miPer32 = null, worn = null, miles = null;
      if (first && last && pts.length > 1) {
        worn = first.d - last.d;
        miles = last.odo - first.odo;
        if (worn > 0 && miles > 0) miPer32 = miles / worn;
      }
      const isSteer = /^1[LR]$/.test(t.pos);
      const pull = isSteer ? settings.pullSteer : settings.pullOther;
      const remain = last && miPer32 ? Math.max(0, (last.d - pull) * miPer32) : null;
      m[t.id] = {
        pts, first, last, miPer32, worn, miles, pull, remain,
        depth: last ? last.d : null, status: statusOf(last ? last.d : null, pull),
      };
    });
    return m;
  }, [tires, readingsByTire, settings]);

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
      <div style={{ fontFamily: FB, background: C.paper, minHeight: "100vh", padding: 40, color: C.muted }}>
        Loading your tire records…
      </div>
    );

  return (
    <div style={{ fontFamily: FB, background: C.paper, minHeight: "100vh", color: C.ink }}>
      <Header tab={tab} setTab={setTab} />
      {err && (
        <div style={{ background: "#FDECEA", color: C.pull, borderBottom: `1px solid ${C.pull}33`,
          padding: "10px 20px", fontSize: 13, fontWeight: 600 }}>{err}</div>
      )}
      <div className="mx-auto w-full" style={{ maxWidth: 1400, padding: "20px 16px 60px" }}>
        {tab === "fleet" && (
          <FleetView
            {...{ filtered, vehSummary, sel, setSel, q, setQ, divFilter, setDivFilter,
              byNum, activeTireAt, tireStats, settings, attention,
              setVehCfg, setTires, setReadings, setOdos, lastOdoFor }}
          />
        )}
        {tab === "analysis" && (
          <Analysis {...{ tires, tireStats, settings, byNum }} />
        )}
        {tab === "settings" && (
          <Settings {...{ settings, setSettings, tires, readings, odos, tireStats, byNum,
            setTires, setReadings, setOdos, setVehCfg }} />
        )}
      </div>
    </div>
  );
}

/* ── Header ───────────────────────────────────────────────────── */
function Header({ tab, setTab }) {
  const tabs = [["fleet", "Fleet"], ["analysis", "Analysis"], ["settings", "Settings"]];
  return (
    <div style={{ background: C.navy900, borderBottom: `3px solid ${C.gold}` }}>
      <div className="mx-auto w-full flex flex-wrap items-end justify-between gap-3"
        style={{ maxWidth: 1400, padding: "16px 16px 0" }}>
        <div>
          <div style={{ fontFamily: FD, fontSize: 11, letterSpacing: "0.22em",
            color: C.gold, fontWeight: 600, textTransform: "uppercase" }}>
            The Allen Company · Haul Division
          </div>
          <div style={{ fontFamily: FD, fontSize: 34, fontWeight: 700, color: "#fff",
            lineHeight: 1.05, letterSpacing: "0.01em", marginTop: 2 }}>
            Tire Wear
          </div>
          <div style={{ fontSize: 12.5, color: "#9DB2CC", marginBottom: 12, marginTop: 2 }}>
            Tread depth, miles run, and cost-per-mile by brand and position
          </div>
        </div>
        <div className="flex" style={{ gap: 2 }}>
          {tabs.map(([k, label]) => (
            <button key={k} onClick={() => setTab(k)}
              style={{
                fontFamily: FD, fontSize: 15, fontWeight: 600, letterSpacing: "0.06em",
                textTransform: "uppercase", padding: "9px 18px",
                background: tab === k ? C.paper : "transparent",
                color: tab === k ? C.navy900 : "#9DB2CC",
                border: "none", borderRadius: "5px 5px 0 0", cursor: "pointer",
              }}>{label}</button>
          ))}
        </div>
      </div>
    </div>
  );
}

/* ── Fleet view ───────────────────────────────────────────────── */
function FleetView(props) {
  const { filtered, vehSummary, sel, setSel, q, setQ, divFilter, setDivFilter,
    byNum, activeTireAt, tireStats, settings, attention,
    setVehCfg, setTires, setReadings, setOdos, lastOdoFor } = props;

  const dtCount = filtered.filter((v) => v.div === "DT").length;

  return (
    <div className="grid gap-4" style={{ gridTemplateColumns: "minmax(0,1fr)" }}>
      <div className="grid gap-4" style={{ gridTemplateColumns: "300px minmax(0,1fr)" }}>
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
                      border: `1px solid ${divFilter === d ? C.navy700 : C.line}`,
                      background: divFilter === d ? C.navy700 : "#fff",
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
              {...{ activeTireAt, tireStats, settings, setVehCfg, setTires, setReadings,
                setOdos, lastOdoFor }}
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
        borderLeft: `3px solid ${active ? C.gold : "transparent"}`,
        background: active ? "#F4F7FB" : "#fff", display: "block" }}>
      <div className="flex items-center justify-between" style={{ gap: 8 }}>
        <span style={{ fontFamily: FM, fontWeight: 600, fontSize: 13.5, color: C.navy900 }}>
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
      <div style={{ fontFamily: FD, fontSize: 22, fontWeight: 700, color: C.navy900 }}>
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
                <div style={{ fontFamily: FM, fontWeight: 600, fontSize: 13.5, color: C.navy900 }}>
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
  const { v, summary, activeTireAt, tireStats, settings,
    setVehCfg, setTires, setReadings, setOdos, lastOdoFor } = props;

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

  function saveInspection() {
    const odo = Number(insOdo);
    if (!odo || odo <= 0) return;
    const entries = Object.entries(draft).filter(([, val]) => val !== "" && val != null);
    const newReadings = [];
    entries.forEach(([pos, val]) => {
      const t = activeTireAt[`${v.num}|${pos}`];
      if (!t) return;
      newReadings.push({ id: uid(), tire: t.id, date: insDate, odo, d: Number(val) });
    });
    setReadings((prev) => [...prev, ...newReadings]);
    setOdos((prev) => [...prev, { id: uid(), veh: v.num, date: insDate, odo }]);
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
              <span style={{ fontFamily: FD, fontSize: 30, fontWeight: 700, color: C.navy900, lineHeight: 1 }}>
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
            <select value={v.cfg} onChange={(e) => setVehCfg((p) => ({ ...p, [v.num]: e.target.value }))}
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
            style={{ padding: "12px 16px", background: "#F7FAFD", borderBottom: `1px solid ${C.lineSoft}` }}>
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
            <Btn onClick={saveInspection} disabled={!Number(insOdo) || filled === 0}>
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
          onClose={() => setMountPos(null)}
          onSave={(t) => { setTires((p) => [...p, t]); setMountPos(null); }} />
      )}
      {openTire && (
        <TireDialog tire={openTire} stats={tireStats[openTire.id]} settings={settings}
          onClose={() => setOpenTire(null)}
          onPull={(off) => {
            setTires((p) => p.map((x) => (x.id === openTire.id ? { ...x, ...off } : x)));
            setOpenTire(null);
          }}
          onDeleteReading={(rid) => setReadings((p) => p.filter((r) => r.id !== rid))} />
      )}
      {odoOpen && (
        <OdoDialog veh={v.num} lastOdo={lastOdo} onClose={() => setOdoOpen(false)}
          onSave={(o) => { setOdos((p) => [...p, o]); setOdoOpen(false); }} />
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
          borderBottom: "7px solid transparent", borderRight: `9px solid ${C.gold}`, marginTop: 6 }} />
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
                  color: C.navy700, textTransform: "uppercase", marginTop: 5 }}>
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
  const col = STATUS_COLOR[st];
  const inspecting = mode === "inspect" && tire;

  if (!tire) {
    return (
      <button onClick={() => onEmpty(pos)}
        style={{ width, height: 62, borderRadius: 6, cursor: "pointer",
          border: `1px dashed ${C.line}`, background: "#FAFCFE", color: C.muted,
          display: "flex", alignItems: "center", justifyContent: "center", gap: 8 }}>
        <span style={{ fontFamily: FM, fontWeight: 600, fontSize: 12, color: "#94A3B8" }}>{pos.id}</span>
        <span style={{ fontSize: 12 }}>Mount tire</span>
      </button>
    );
  }

  return (
    <div style={{ width, height: 62, borderRadius: 6, background: C.navy900,
      border: `1px solid ${C.navy800}`, display: "flex", overflow: "hidden" }}>
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
            style={{ width: 58, padding: "5px 6px", borderRadius: 4, border: `1px solid ${C.navy600}`,
              background: "#0A1728", color: "#fff", fontFamily: FM, fontWeight: 600, fontSize: 16,
              textAlign: "center", outline: "none" }} />
          <div style={{ fontFamily: FM, fontSize: 11, color: "#7E93AC", lineHeight: 1.25 }}>
            /32<br />
            <span style={{ fontSize: 10 }}>was {stats?.depth ?? "—"}</span>
          </div>
        </div>
      ) : (
        <button onClick={() => onTire(tire)}
          style={{ flex: 1, background: "transparent", border: "none", cursor: "pointer",
            textAlign: "left", padding: "5px 9px", color: "#fff", minWidth: 0 }}>
          <div className="flex items-baseline justify-between" style={{ gap: 6 }}>
            <span style={{ fontFamily: FM, fontWeight: 600, fontSize: 18, color: col, lineHeight: 1 }}>
              {stats?.depth != null ? stats.depth : "—"}
              <span style={{ fontSize: 10, color: "#7E93AC", fontWeight: 400 }}>/32</span>
            </span>
            <span style={{ fontFamily: FM, fontSize: 10, color: "#7E93AC" }}>
              {stats?.miPer32 ? `${nf(stats.miPer32 / 1000, 1)}k/32` : "—"}
            </span>
          </div>
          <div style={{ fontSize: 10.5, color: "#9DB2CC", marginTop: 3, whiteSpace: "nowrap",
            overflow: "hidden", textOverflow: "ellipsis" }}>
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
                  {t ? `${t.brand || "Unbranded"}${t.model ? " " + t.model : ""}`
                    : <button onClick={() => onEmpty(p)} style={linkBtn}>Mount a tire</button>}
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
function Modal({ title, sub, children, onClose, width = 520 }) {
  return (
    <div onClick={onClose}
      style={{ position: "fixed", inset: 0, background: "rgba(11,29,51,0.55)", zIndex: 50,
        display: "flex", alignItems: "flex-start", justifyContent: "center", padding: 16, overflowY: "auto" }}>
      <div onClick={(e) => e.stopPropagation()}
        style={{ background: "#fff", borderRadius: 10, width: "100%", maxWidth: width,
          marginTop: 40, marginBottom: 40, overflow: "hidden", boxShadow: "0 18px 50px rgba(0,0,0,0.3)" }}>
        <div style={{ background: C.navy900, padding: "13px 18px", borderBottom: `3px solid ${C.gold}` }}>
          <div style={{ fontFamily: FD, fontSize: 21, fontWeight: 700, color: "#fff", lineHeight: 1.15 }}>
            {title}
          </div>
          {sub && <div style={{ fontSize: 12, color: "#9DB2CC", marginTop: 2 }}>{sub}</div>}
        </div>
        <div style={{ padding: 18 }}>{children}</div>
      </div>
    </div>
  );
}

function MountDialog({ pos, veh, lastOdo, settings, onClose, onSave }) {
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
            {BRANDS.map((b) => <option key={b} value={b}>{b}</option>)}
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
      </div>
      <p style={{ fontSize: 12, color: C.muted, marginTop: 12, lineHeight: 1.5 }}>
        The mount odometer and tread depth become the first data point. One walk-around after
        this and you'll have a wear rate.
      </p>
      <div className="flex justify-end mt-4" style={{ gap: 8 }}>
        <Btn tone="ghost" onClick={onClose}>Cancel</Btn>
        <Btn disabled={!ok} onClick={() => onSave({
          id: uid(), veh, pos: pos.id, brand: brandFinal, model: f.model.trim(),
          size: f.size.trim(), type: f.type, newDepth: Number(f.newDepth),
          onDate: f.onDate, onOdo: Number(f.onOdo),
          cost: f.cost ? Number(f.cost) : null, casing: f.casing.trim(), notes: "",
        })}>Mount tire</Btn>
      </div>
    </Modal>
  );
}

function TireDialog({ tire, stats, settings, onClose, onPull, onDeleteReading }) {
  const [pulling, setPulling] = useState(false);
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
              <Line type="monotone" dataKey="depth" stroke={C.navy700} strokeWidth={2.5}
                dot={{ r: 3.5, fill: C.gold, stroke: C.navy700, strokeWidth: 1.5 }} />
            </LineChart>
          </ResponsiveContainer>
        </div>
      )}

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
            <Btn tone="danger" onClick={() => onPull({
              offDate, offOdo: Number(offOdo) || null, offReason: reason })}>
              Pull tire
            </Btn>
          </div>
        </div>
      )}
    </Modal>
  );
}

function OdoDialog({ veh, lastOdo, onClose, onSave }) {
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
        <Btn disabled={!Number(odo)} onClick={() =>
          onSave({ id: uid(), veh, date, odo: Number(odo) })}>Save mileage</Btn>
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
        <div style={{ fontFamily: FD, fontSize: 22, fontWeight: 700, color: C.navy900 }}>
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
          <div style={{ fontFamily: FD, fontSize: 22, fontWeight: 700, color: C.navy900, lineHeight: 1.1 }}>
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
                cursor: "pointer", border: `1px solid ${unit === k ? C.navy700 : C.line}`,
                background: unit === k ? C.navy700 : "#fff",
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
  const palette = [C.navy700, C.navy600, C.gold, "#4A7AB0", "#8A6D1F", "#6D8FB8"];
  return (
    <div style={{ background: C.card, border: `1px solid ${C.line}`, borderRadius: 8, padding: "14px 16px 8px" }}>
      <div className="flex items-baseline justify-between" style={{ marginBottom: 10 }}>
        <span style={{ fontFamily: FD, fontSize: 18, fontWeight: 700, color: C.navy900,
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
function Settings({ settings, setSettings, tires, readings, odos, tireStats, byNum,
  setTires, setReadings, setOdos, setVehCfg }) {
  const [confirm, setConfirm] = useState(false);
  const set = (k) => (e) => setSettings((p) => ({ ...p, [k]: Number(e.target.value) }));

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
      "miles_run", "miles_per_32nd", "miles_per_mil", "est_miles_left", "cost", "status"];
    const rows = tires.map((t) => {
      const s = tireStats[t.id] || {};
      return [t.veh, t.pos, t.brand, t.model, t.size, t.type, t.casing, t.onDate, t.onOdo,
        t.newDepth, s.depth ?? "", s.miles ?? "", s.miPer32 ? Math.round(s.miPer32) : "",
        s.miPer32 ? Math.round(s.miPer32 / MILS_PER_32ND) : "",
        s.remain ? Math.round(s.remain) : "", t.cost ?? "", STATUS_LABEL[s.status] || ""];
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
    const head = ["date", "truck", "odometer"];
    const rows = [...odos].sort((a, b) => (a.date < b.date ? 1 : -1))
      .map((o) => [o.date, o.veh, o.odo]);
    download("allen-mileage.csv", toCSV([head, ...rows]));
  }

  return (
    <div className="grid gap-4" style={{ maxWidth: 720 }}>
      <Card title="Pull thresholds"
        note="Federal minimums are 4/32 on steer and 2/32 everywhere else. Most fleets pull earlier.">
        <div className="grid gap-3" style={{ gridTemplateColumns: "1fr 1fr" }}>
          <Field label="Pull steer tires at (/32)">
            <input type="number" step="0.5" value={settings.pullSteer} onChange={set("pullSteer")}
              style={{ ...inp, fontFamily: FM }} /></Field>
          <Field label="Pull all other tires at (/32)">
            <input type="number" step="0.5" value={settings.pullOther} onChange={set("pullOther")}
              style={{ ...inp, fontFamily: FM }} /></Field>
          <Field label="Default tread on a new tire (/32)">
            <input type="number" step="0.5" value={settings.newDepth} onChange={set("newDepth")}
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
        note="Everything saves automatically and stays with this app between sessions.">
        <div className="flex flex-wrap" style={{ gap: 22 }}>
          <Stat label="Tires" value={tires.length} />
          <Stat label="Tread readings" value={readings.length} />
          <Stat label="Mileage entries" value={odos.length} />
        </div>
        <div style={{ marginTop: 16, borderTop: `1px solid ${C.lineSoft}`, paddingTop: 14 }}>
          {!confirm ? (
            <button onClick={() => setConfirm(true)} style={{ ...linkBtn, color: C.pull, fontWeight: 600 }}>
              Erase all tire data
            </button>
          ) : (
            <div className="flex items-center flex-wrap" style={{ gap: 10 }}>
              <span style={{ fontSize: 13, color: C.pull, fontWeight: 600 }}>
                This deletes every tire, reading, and mileage entry. Export first if you need them.
              </span>
              <Btn tone="ghost" onClick={() => setConfirm(false)}>Keep my data</Btn>
              <Btn tone="danger" onClick={() => {
                setTires([]); setReadings([]); setOdos([]); setVehCfg({}); setConfirm(false);
              }}>Erase everything</Btn>
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

function toCSV(rows) {
  return rows.map((r) => r.map((c) => {
    const s = c === null || c === undefined ? "" : String(c);
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  }).join(",")).join("\n");
}

/* ── Small pieces ─────────────────────────────────────────────── */
const inp = {
  width: "100%", padding: "8px 10px", border: `1px solid ${C.line}`, borderRadius: 5,
  fontSize: 14, fontFamily: FB, background: "#fff", outline: "none", color: C.ink,
};
const th = {
  fontFamily: FD, fontSize: 11.5, fontWeight: 600, letterSpacing: "0.1em",
  textTransform: "uppercase", color: C.muted, padding: "9px 12px", whiteSpace: "nowrap",
};
const td = { fontSize: 13.5, padding: "9px 12px", verticalAlign: "middle" };
const tdNum = { fontFamily: FM, textAlign: "right", whiteSpace: "nowrap" };
const linkBtn = {
  background: "none", border: "none", padding: 0, cursor: "pointer",
  color: C.navy600, fontWeight: 600, fontSize: "inherit", fontFamily: "inherit",
  textDecoration: "underline", textUnderlineOffset: 2,
};

function Btn({ children, onClick, disabled, tone = "solid" }) {
  const styles = {
    solid: { background: C.navy700, color: "#fff", border: `1px solid ${C.navy700}` },
    ghost: { background: "#fff", color: C.navy700, border: `1px solid ${C.line}` },
    danger: { background: C.pull, color: "#fff", border: `1px solid ${C.pull}` },
  }[tone];
  return (
    <button onClick={onClick} disabled={disabled}
      style={{ ...styles, fontFamily: FD, fontSize: 14.5, fontWeight: 600, letterSpacing: "0.05em",
        textTransform: "uppercase", padding: "8px 15px", borderRadius: 5,
        cursor: disabled ? "not-allowed" : "pointer", opacity: disabled ? 0.42 : 1,
        whiteSpace: "nowrap" }}>
      {children}
    </button>
  );
}

function Field({ label, children }) {
  return (
    <label style={{ display: "block" }}>
      <div style={{ fontFamily: FD, fontSize: 11.5, fontWeight: 600, letterSpacing: "0.09em",
        textTransform: "uppercase", color: C.muted, marginBottom: 4 }}>{label}</div>
      {children}
    </label>
  );
}

function Stat({ label, value, unit, sub, color }) {
  return (
    <div>
      <div style={{ fontFamily: FD, fontSize: 11, fontWeight: 600, letterSpacing: "0.1em",
        textTransform: "uppercase", color: C.muted }}>{label}</div>
      <div style={{ fontFamily: FM, fontSize: 19, fontWeight: 600, color: color || C.navy900,
        lineHeight: 1.15, marginTop: 1 }}>
        {value}{unit && <span style={{ fontSize: 11, color: C.muted, fontWeight: 400, marginLeft: 2 }}>{unit}</span>}
      </div>
      {sub && <div style={{ fontFamily: FM, fontSize: 10.5, color: C.muted }}>{sub}</div>}
    </div>
  );
}

function SectionLabel({ children, noMargin }) {
  return (
    <div style={{ fontFamily: FD, fontSize: 12.5, fontWeight: 600, letterSpacing: "0.13em",
      textTransform: "uppercase", color: C.navy700, marginBottom: noMargin ? 0 : 9 }}>
      {children}
    </div>
  );
}

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

function Card({ title, note, children }) {
  return (
    <div style={{ background: C.card, border: `1px solid ${C.line}`, borderRadius: 8, padding: "14px 16px 16px" }}>
      <div style={{ fontFamily: FD, fontSize: 19, fontWeight: 700, color: C.navy900, lineHeight: 1.15 }}>
        {title}
      </div>
      {note && <div style={{ fontSize: 12.5, color: C.muted, marginTop: 3, marginBottom: 12, lineHeight: 1.5 }}>{note}</div>}
      {children}
    </div>
  );
}
