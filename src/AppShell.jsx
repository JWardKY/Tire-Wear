import React, { useState } from "react";
import AllenLogo from "./AllenLogo.jsx";
import { C, FB, FD, FM } from "./theme.js";
import { SECTIONS, findSection } from "./sections.jsx";
import SupervisorGate, { readSupervisor, forgetSupervisor } from "./SupervisorGate.jsx";

/* The frame every section hangs in: the mark, who you are, the section
   nav, and the active section's own sub-tabs.

   Sub-tab state lives here rather than in the section so that moving
   between sections and back puts you where you left off, and so the
   header can draw both rows of tabs together.

   The section row is hidden while there is only one section — a lone tab
   that does nothing when clicked reads as a bug. It appears on its own
   as soon as a second section is registered. */

export default function AppShell({ who, onSwitchUser }) {
  const [sectionKey, setSectionKey] = useState(SECTIONS[0].key);
  const [subTabs, setSubTabs] = useState({});
  const [busy, setBusy] = useState(false);
  /* Hours and Setup are the only two the shop floor does not open.
     Everything else is theirs to use without a password in the way. */
  const [supervisor, setSupervisor] = useState(() => readSupervisor());

  const section = findSection(sectionKey);
  const Body = section.Component;
  const tab = subTabs[section.key] || section.subTabs?.[0]?.[0] || null;
  const setTab = (t) => setSubTabs((p) => ({ ...p, [section.key]: t }));

  /* Two rows of identical tabs read as peers, so whichever row is the
     primary nav gets the paper tab and the other steps down to an
     underline. With a single section the sub-tabs ARE the nav, so they
     keep the paper treatment the tire app has always had; they only
     become secondary once there is a section row above them. */
  const multi = SECTIONS.length > 1;

  const primaryTab = (active, label, onClick, key) => (
    <button key={key} onClick={onClick}
      style={{
        fontFamily: FD, fontSize: 15, fontWeight: 600, letterSpacing: "0.06em",
        textTransform: "uppercase", padding: "9px 18px",
        background: active ? C.paper : "transparent",
        color: active ? C.green900 : C.onDark,
        border: "none", borderRadius: "5px 5px 0 0", cursor: "pointer",
      }}>
      {label}
    </button>
  );

  const secondaryTab = (active, label, onClick, key) => (
    <button key={key} onClick={onClick}
      style={{
        fontFamily: FD, fontSize: 13, fontWeight: 600, letterSpacing: "0.08em",
        textTransform: "uppercase", padding: "5px 12px 7px",
        background: "transparent",
        color: active ? C.yellow : C.onDark,
        border: "none", borderBottom: `2px solid ${active ? C.yellow : "transparent"}`,
        cursor: "pointer",
      }}>
      {label}
    </button>
  );

  return (
    <div style={{ fontFamily: FB, background: C.paper, minHeight: "100vh", color: C.ink }}>
      <div style={{ background: C.green900, borderBottom: `3px solid ${C.yellow}` }}>
        <div className="mx-auto w-full flex flex-wrap items-end justify-between gap-3"
          style={{ maxWidth: 1400, padding: "16px 16px 0" }}>
          <div>
            {/* The mark carries the header on its own — the compact variant,
                because the fine print cannot be set honestly at this size. */}
            <div className="flex items-center" style={{ gap: 13, marginBottom: 6 }}>
              <span style={{ color: C.yellow }}>
                <AllenLogo variant="compact" height={42} />
              </span>
              <span style={{ width: 1, height: 26, background: C.green600 }} />
              <span style={{ fontFamily: FD, fontSize: 13, letterSpacing: "0.22em",
                color: C.yellow, fontWeight: 600, textTransform: "uppercase" }}>
                Haul Division
              </span>
            </div>
            <div style={{ fontSize: 12.5, color: C.onDark, marginBottom: 12, marginTop: 2 }}>
              {section.blurb}
            </div>
          </div>

          <div className="flex flex-col items-end" style={{ gap: 9 }}>
            <div className="flex items-center" style={{ gap: 10 }}>
              {busy && (
                <span style={{ fontFamily: FM, fontSize: 11, color: C.yellow }}>Saving…</span>
              )}
              {who && (
                <span style={{ fontFamily: FM, fontSize: 11.5, color: C.onDark }}>{who}</span>
              )}
              {supervisor && (
                <button onClick={() => { forgetSupervisor(); setSupervisor(null); }}
                  title={`Signed in as ${supervisor.name} for Hours and Setup`}
                  style={{ background: "none", border: `1px solid ${C.green600}`, borderRadius: 4,
                    color: C.onDark, fontFamily: FD, fontSize: 12, fontWeight: 600,
                    letterSpacing: "0.06em", textTransform: "uppercase", padding: "4px 10px",
                    cursor: "pointer" }}>
                  Lock {supervisor.name.split(" ")[0]}
                </button>
              )}
              <button onClick={onSwitchUser}
                style={{ background: "none", border: `1px solid ${C.green600}`, borderRadius: 4,
                  color: C.onDark, fontFamily: FD, fontSize: 12, fontWeight: 600,
                  letterSpacing: "0.06em", textTransform: "uppercase", padding: "4px 10px",
                  cursor: "pointer" }}>
                Switch user
              </button>
            </div>

            {multi && (
              <div className="flex flex-wrap justify-end" style={{ gap: 2 }}>
                {SECTIONS.map((s) =>
                  primaryTab(s.key === section.key, s.label, () => setSectionKey(s.key), s.key)
                )}
              </div>
            )}

            {section.subTabs && (
              <div className="flex flex-wrap justify-end"
                style={{ gap: 2, marginBottom: multi ? 4 : 0 }}>
                {section.subTabs.map(([k, label]) =>
                  (multi ? secondaryTab : primaryTab)(k === tab, label, () => setTab(k), k)
                )}
              </div>
            )}
          </div>
        </div>
      </div>

      {section.supervisor && !supervisor ? (
        <SupervisorGate what={section.label}
          onIn={(u) => setSupervisor(u)} />
      ) : (
        <Body who={who} tab={tab} onBusy={setBusy} />
      )}
    </div>
  );
}
