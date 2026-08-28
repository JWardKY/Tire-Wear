import React from "react";
import { C, FD, FB, FM } from "./theme.js";

/* The bits every section builds screens out of. These were private to the
   tire section; a second and third section wanting the same button is the
   moment they stop being private. Lifted verbatim, so the tire screens
   render exactly as they did.

   Section-specific pieces stay with their section — the tire status Pill,
   for instance, means nothing to a defect. */

/* ── Small helpers ────────────────────────────────────────────── */
/* The shop's date lives in its own module — see day.js. */
export { todayISO } from "./day.js";
export const nf = (n, d = 0) =>
  n === null || n === undefined || !isFinite(n) ? "—"
    : Number(n).toLocaleString("en-US", { minimumFractionDigits: d, maximumFractionDigits: d });
export const fmtDate = (s) => (s ? s.slice(5).replace("-", "/") + "/" + s.slice(2, 4) : "—");

export function toCSV(rows) {
  return rows.map((r) => r.map((c) => {
    const s = c === null || c === undefined ? "" : String(c);
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  }).join(",")).join("\n");
}

/* ── Layout ───────────────────────────────────────────────────── */
export function Modal({ title, sub, children, onClose, width = 520 }) {
  return (
    <div onClick={onClose}
      style={{ position: "fixed", inset: 0, background: "rgba(12,42,27,0.60)", zIndex: 50,
        display: "flex", alignItems: "flex-start", justifyContent: "center", padding: 16, overflowY: "auto" }}>
      <div onClick={(e) => e.stopPropagation()}
        style={{ background: "#fff", borderRadius: 10, width: "100%", maxWidth: width,
          marginTop: 40, marginBottom: 40, overflow: "hidden", boxShadow: "0 18px 50px rgba(0,0,0,0.3)" }}>
        <div style={{ background: C.green900, padding: "13px 18px", borderBottom: `3px solid ${C.yellow}` }}>
          <div style={{ fontFamily: FD, fontSize: 21, fontWeight: 700, color: "#fff", lineHeight: 1.15 }}>
            {title}
          </div>
          {sub && <div style={{ fontSize: 12, color: C.onDark, marginTop: 2 }}>{sub}</div>}
        </div>
        <div style={{ padding: 18 }}>{children}</div>
      </div>
    </div>
  );
}

export const inp = {
  width: "100%", padding: "8px 10px", border: `1px solid ${C.line}`, borderRadius: 5,
  fontSize: 14, fontFamily: FB, background: "#fff", outline: "none", color: C.ink,
};
export const th = {
  fontFamily: FD, fontSize: 11.5, fontWeight: 600, letterSpacing: "0.1em",
  textTransform: "uppercase", color: C.muted, padding: "9px 12px", whiteSpace: "nowrap",
};
export const td = { fontSize: 13.5, padding: "9px 12px", verticalAlign: "middle" };
export const tdNum = { fontFamily: FM, textAlign: "right", whiteSpace: "nowrap" };
export const linkBtn = {
  background: "none", border: "none", padding: 0, cursor: "pointer",
  color: C.green600, fontWeight: 600, fontSize: "inherit", fontFamily: "inherit",
  textDecoration: "underline", textUnderlineOffset: 2,
};

export function Btn({ children, onClick, disabled, tone = "solid" }) {
  const styles = {
    solid: { background: C.green700, color: "#fff", border: `1px solid ${C.green700}` },
    ghost: { background: "#fff", color: C.green700, border: `1px solid ${C.line}` },
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

export function Field({ label, children }) {
  return (
    <label style={{ display: "block" }}>
      <div style={{ fontFamily: FD, fontSize: 11.5, fontWeight: 600, letterSpacing: "0.09em",
        textTransform: "uppercase", color: C.muted, marginBottom: 4 }}>{label}</div>
      {children}
    </label>
  );
}

export function Stat({ label, value, unit, sub, color }) {
  return (
    <div>
      <div style={{ fontFamily: FD, fontSize: 11, fontWeight: 600, letterSpacing: "0.1em",
        textTransform: "uppercase", color: C.muted }}>{label}</div>
      <div style={{ fontFamily: FM, fontSize: 19, fontWeight: 600, color: color || C.green900,
        lineHeight: 1.15, marginTop: 1 }}>
        {value}{unit && <span style={{ fontSize: 11, color: C.muted, fontWeight: 400, marginLeft: 2 }}>{unit}</span>}
      </div>
      {sub && <div style={{ fontFamily: FM, fontSize: 10.5, color: C.muted }}>{sub}</div>}
    </div>
  );
}

export function SectionLabel({ children, noMargin }) {
  return (
    <div style={{ fontFamily: FD, fontSize: 12.5, fontWeight: 600, letterSpacing: "0.13em",
      textTransform: "uppercase", color: C.green700, marginBottom: noMargin ? 0 : 9 }}>
      {children}
    </div>
  );
}
export function Card({ title, note, children }) {
  return (
    <div style={{ background: C.card, border: `1px solid ${C.line}`, borderRadius: 8, padding: "14px 16px 16px" }}>
      <div style={{ fontFamily: FD, fontSize: 19, fontWeight: 700, color: C.green900, lineHeight: 1.15 }}>
        {title}
      </div>
      {note && <div style={{ fontSize: 12.5, color: C.muted, marginTop: 3, marginBottom: 12, lineHeight: 1.5 }}>{note}</div>}
      {children}
    </div>
  );
}
