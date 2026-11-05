import React, { useState, useCallback, useEffect, useRef } from "react";
import AllenLogo from "./AllenLogo.jsx";
import { C, FB, FD, FM } from "./theme.js";
import { SECTIONS, findSection } from "./sections.jsx";
import SupervisorGate, { readSupervisor, forgetSupervisor } from "./SupervisorGate.jsx";

/* The frame every section hangs in: the mark, the section tabs, who you
   are, the active section's own sub-tabs, and the page's title.

   One green bar, then a white strip for the sub-tabs, then the page.
   The bar used to carry two rows of tabs plus a line of description,
   and the two rows looked like peers — the sub-tabs read as more
   sections. On white they read as part of the page they belong to.

   The shop's six tabs are on the bar, large enough to hit with gloves.
   The three office pages sit behind More (see `menu` in sections.jsx)
   and Help is the ? by the account.

   Sub-tab state lives here rather than in the section so that moving
   between sections and back puts you where you left off. */

const WIDTH = 1400;   // the same max width every section's body uses

/* "jacob_campbell@theallen.com" → "Jacob Campbell". The badge is a name
   badge, not a login, so the email is what there is to go on. */
export function displayName(who) {
  const local = String(who || "").split("@")[0];
  const parts = local.split(/[._\-\s]+/).filter(Boolean);
  if (!parts.length) return "";
  return parts.map((p) => p[0].toUpperCase() + p.slice(1).toLowerCase()).join(" ");
}

export function initials(name) {
  const parts = String(name || "").split(" ").filter(Boolean);
  return ((parts[0]?.[0] || "") + (parts.length > 1 ? parts[parts.length - 1][0] : "")).toUpperCase() || "?";
}

/* A menu that closes when you tap anywhere else or press Escape — a
   dropdown that stays open over the page after you have moved on reads
   as stuck. */
function useDismiss(open, setOpen) {
  const ref = useRef(null);
  useEffect(() => {
    if (!open) return undefined;
    const away = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    const esc = (e) => { if (e.key === "Escape") setOpen(false); };
    document.addEventListener("mousedown", away);
    document.addEventListener("touchstart", away);
    document.addEventListener("keydown", esc);
    return () => {
      document.removeEventListener("mousedown", away);
      document.removeEventListener("touchstart", away);
      document.removeEventListener("keydown", esc);
    };
  }, [open, setOpen]);
  return ref;
}

const caret = (colour) => (
  <svg width="12" height="12" viewBox="0 0 12 12" aria-hidden="true" style={{ flexShrink: 0 }}>
    <path d="M2 4l4 4 4-4" fill="none" stroke={colour} strokeWidth="2" />
  </svg>
);

const menuBox = {
  position: "absolute", top: "calc(100% + 6px)", zIndex: 50, minWidth: 200,
  background: C.card, border: `1px solid ${C.line}`, borderRadius: 6,
  boxShadow: "0 8px 24px rgba(12,42,27,0.18)", padding: 6,
  display: "flex", flexDirection: "column",
};

const menuItem = (active) => ({
  textAlign: "left", background: active ? C.paper : "transparent",
  border: "none", borderRadius: 4, padding: "12px 14px", minHeight: 48, cursor: "pointer",
  fontFamily: FD, fontSize: 16, fontWeight: active ? 700 : 600, letterSpacing: "0.05em",
  textTransform: "uppercase", color: active ? C.green900 : C.ink,
});

export default function AppShell({ who, onSwitchUser }) {
  const [sectionKey, setSectionKey] = useState(SECTIONS[0].key);
  const [subTabs, setSubTabs] = useState({});
  const [busy, setBusy] = useState(false);
  /* Supervisor is the only section the shop floor does not open.
     Everything else is theirs to use without a password in the way. */
  const [supervisor, setSupervisor] = useState(() => readSupervisor());

  /* A number on the Now board is a question — "sixty-four open defects"
     wants to be "which ones". `go` is how one screen hands the answer to
     another: the section, the sub-tab, and optionally a focus the target
     understands (Defects knows "unsafe" and "stale").

     The focus is remembered against the section it was aimed at and
     cleared the moment somebody navigates by hand, so a filter arrived
     at by tapping a tile never quietly outlives the tap. */
  const [focus, setFocus] = useState(null);      // { section, what }

  const [moreOpen, setMoreOpen] = useState(false);
  const [meOpen, setMeOpen] = useState(false);
  const moreRef = useDismiss(moreOpen, setMoreOpen);
  const meRef = useDismiss(meOpen, setMeOpen);

  const section = findSection(sectionKey);
  const Body = section.Component;
  const tab = subTabs[section.key] || section.subTabs?.[0]?.[0] || null;
  const setTab = (t) => { setFocus(null); setSubTabs((p) => ({ ...p, [section.key]: t })); };

  const open = (key) => {
    setFocus(null); setSectionKey(key); setMoreOpen(false); setMeOpen(false);
  };

  const go = useCallback((key, t, what) => {
    setSectionKey(key);
    if (t) setSubTabs((p) => ({ ...p, [key]: t }));
    setFocus(what ? { section: key, what } : null);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }, []);

  const barTabs = SECTIONS.filter((s) => !s.menu);
  const moreTabs = SECTIONS.filter((s) => s.menu === "more");
  const helpSection = SECTIONS.find((s) => s.menu === "help");
  const inMore = section.menu === "more";

  const name = displayName(who);
  const locked = section.supervisor && !supervisor;
  const showSubTabs = section.subTabs && !locked;

  /* The page's own title. With sub-tabs it is the sub-tab, under the
     section's name as an eyebrow; without, the section itself. */
  const subLabel = section.subTabs?.find(([k]) => k === tab)?.[1];
  const title = showSubTabs && subLabel ? subLabel : section.label;
  // No eyebrow when it would only repeat the title ("Work orders" over "Work orders").
  const eyebrow = showSubTabs && subLabel && subLabel !== section.label ? section.label : null;
  const blurb = typeof section.blurb === "function" ? section.blurb(tab) : section.blurb;

  const barTab = (s, className) => {
    const active = s.key === section.key;
    return (
      <button key={s.key} onClick={() => open(s.key)} className={className}
        aria-current={active ? "page" : undefined}
        style={{
          fontFamily: FD, fontSize: 17, fontWeight: 700, letterSpacing: "0.05em",
          textTransform: "uppercase", padding: "0 13px", minHeight: 52,
          background: "transparent", color: active ? C.yellowHi : "#E9F0EB",
          border: "none", borderBottom: `4px solid ${active ? C.yellow : "transparent"}`,
          borderTop: "4px solid transparent", cursor: "pointer",
        }}>
        {s.label}
      </button>
    );
  };

  const ghostRound = {
    background: "transparent", border: `1px solid ${C.green600}`, color: "#E9F0EB",
    cursor: "pointer",
  };

  return (
    <div style={{ fontFamily: FB, background: C.paper, minHeight: "100vh", color: C.ink }}>
      {/* The chrome drops out when a mechanic prints their timecard. */}
      <div className="no-print">
        <div style={{ background: C.green900, borderBottom: `3px solid ${C.yellow}` }}>
          <div className="mx-auto w-full flex flex-wrap items-stretch"
            style={{ maxWidth: WIDTH, padding: "0 16px", columnGap: 20, rowGap: 0 }}>
            <div className="flex items-center" style={{ gap: 12, minHeight: 64 }}>
              <span style={{ color: C.yellow }}>
                <AllenLogo variant="compact" height={36} />
              </span>
              <span className="wide-only" style={{ fontFamily: FD, fontSize: 13, letterSpacing: "0.2em",
                color: C.yellow, fontWeight: 700, textTransform: "uppercase" }}>
                Haul Division
              </span>
            </div>

            {/* Below 1024px the tabs drop under the logo row (shell-nav in
                index.css) so the ? and the badge stay up beside the mark. */}
            <nav aria-label="Sections" className="shell-nav flex flex-wrap items-stretch" style={{ flex: "1 1 auto" }}>
              {barTabs.map((s) => barTab(s))}
              {/* On a screen wide enough for all of them, the office pages
                  are ordinary tabs and More is not drawn — a menu hiding
                  three pages is only worth its extra tap where the room
                  is not there. Both are always rendered; index.css picks
                  one by width. */}
              {moreTabs.map((s) => barTab(s, "office-inline"))}

              <div ref={moreRef} className="office-more" style={{ position: "relative", display: "flex", alignItems: "center", marginLeft: 6 }}>
                <button onClick={() => { setMoreOpen((v) => !v); setMeOpen(false); }}
                  aria-haspopup="menu" aria-expanded={moreOpen}
                  style={{
                    ...ghostRound, display: "flex", alignItems: "center", gap: 6,
                    fontFamily: FD, fontSize: 16, fontWeight: 600, letterSpacing: "0.05em",
                    textTransform: "uppercase", padding: "0 12px", minHeight: 44, borderRadius: 4,
                    background: inMore ? C.green800 : "transparent",
                    color: inMore ? C.yellowHi : "#E9F0EB",
                    borderColor: inMore ? C.yellow : C.green600,
                  }}>
                  More {caret(C.yellow)}
                </button>
                {moreOpen && (
                  <div role="menu" style={{ ...menuBox, left: 0 }}>
                    {moreTabs.map((s) => (
                      <button key={s.key} role="menuitem" onClick={() => open(s.key)}
                        aria-current={s.key === section.key ? "page" : undefined}
                        style={menuItem(s.key === section.key)}>
                        {s.label}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </nav>

            <div className="flex items-center" style={{ gap: 10, minHeight: 64, marginLeft: "auto" }}>
              {busy && (
                <span style={{ fontFamily: FM, fontSize: 11, color: C.yellow }}>Saving…</span>
              )}
              {helpSection && (
                <button onClick={() => open(helpSection.key)} aria-label="Help" title="Help"
                  aria-current={section.key === helpSection.key ? "page" : undefined}
                  style={{
                    ...ghostRound, width: 44, height: 44, borderRadius: "50%",
                    fontFamily: FD, fontSize: 17, fontWeight: 700,
                    background: section.key === helpSection.key ? C.green800 : "transparent",
                    borderColor: section.key === helpSection.key ? C.yellow : C.green600,
                  }}>
                  ?
                </button>
              )}

              <div ref={meRef} style={{ position: "relative" }}>
                <button onClick={() => { setMeOpen((v) => !v); setMoreOpen(false); }}
                  aria-haspopup="menu" aria-expanded={meOpen}
                  aria-label={name ? `Signed in as ${name}` : "Who is using this"}
                  style={{
                    display: "flex", alignItems: "center", gap: 9, cursor: "pointer",
                    background: C.green800, border: "1px solid #2E5A41", borderRadius: 24,
                    padding: "6px 12px 6px 6px", minHeight: 44, color: "#E9F0EB",
                    fontFamily: FB, fontSize: 14, fontWeight: 600,
                  }}>
                  <span aria-hidden="true" style={{
                    width: 30, height: 30, borderRadius: "50%", background: C.yellow,
                    color: C.green900, display: "flex", alignItems: "center",
                    justifyContent: "center", fontFamily: FD, fontWeight: 800, fontSize: 14,
                  }}>
                    {initials(name)}
                  </span>
                  <span className="wide-only">{name || "Not set"}</span>
                  {caret(C.onDark)}
                </button>
                {meOpen && (
                  <div role="menu" style={{ ...menuBox, right: 0, minWidth: 240 }}>
                    {who && (
                      <div style={{ padding: "8px 12px 10px", borderBottom: `1px solid ${C.lineSoft}`,
                        marginBottom: 4 }}>
                        <div style={{ fontWeight: 600, fontSize: 14 }}>{name}</div>
                        <div style={{ fontFamily: FM, fontSize: 11.5, color: C.muted }}>{who}</div>
                      </div>
                    )}
                    {supervisor && (
                      <button role="menuitem"
                        onClick={() => { forgetSupervisor(); setSupervisor(null); setMeOpen(false); }}
                        title={`Signed in as ${supervisor.name} for the supervisor tab`}
                        style={menuItem(false)}>
                        Lock {supervisor.name.split(" ")[0]}
                      </button>
                    )}
                    <button role="menuitem" onClick={() => { setMeOpen(false); onSwitchUser(); }}
                      style={menuItem(false)}>
                      Switch user
                    </button>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* Sub-tabs of a locked section are not shown: offering six
            tabs that all land on the same PIN prompt is noise. */}
        {showSubTabs && (
          <div style={{ background: C.card, borderBottom: `1px solid ${C.line}` }}>
            <nav aria-label={section.label}
              className="mx-auto w-full flex items-stretch"
              style={{ maxWidth: WIDTH, padding: "0 16px", gap: 2, overflowX: "auto" }}>
              {section.subTabs.map(([k, label]) => {
                const active = k === tab;
                return (
                  <button key={k} onClick={() => setTab(k)}
                    aria-current={active ? "page" : undefined}
                    style={{
                      fontFamily: FD, fontSize: 16, fontWeight: active ? 700 : 600,
                      letterSpacing: "0.06em", textTransform: "uppercase", whiteSpace: "nowrap",
                      padding: "0 15px", minHeight: 48, background: "transparent",
                      color: active ? C.green900 : C.muted, border: "none",
                      borderBottom: `3px solid ${active ? C.green700 : "transparent"}`,
                      borderTop: "3px solid transparent", cursor: "pointer",
                    }}>
                    {label}
                  </button>
                );
              })}
            </nav>
          </div>
        )}

        <div className="mx-auto w-full" style={{ maxWidth: WIDTH, padding: "22px 16px 0" }}>
          {eyebrow && (
            <div style={{ fontFamily: FD, fontSize: 13, fontWeight: 700, letterSpacing: "0.14em",
              textTransform: "uppercase", color: C.green700, marginBottom: 2 }}>
              {eyebrow}
            </div>
          )}
          <h1 style={{ margin: 0, fontFamily: FD, fontSize: 30, fontWeight: 700,
            color: C.green900, lineHeight: 1.05 }}>
            {title}
          </h1>
          {blurb && (
            <p style={{ margin: "5px 0 0", fontSize: 14, color: C.muted }}>{blurb}</p>
          )}
        </div>
      </div>

      {locked ? (
        /* In the same column as every section, under the page title. */
        <div className="mx-auto w-full" style={{ maxWidth: WIDTH, padding: "20px 16px 60px" }}>
          <SupervisorGate what={section.label}
            onIn={(u) => setSupervisor(u)} />
        </div>
      ) : (
        /* A supervisor-gated section is told who unlocked it, so a
           deletion is attributed to the person who authorised it and
           not to whichever badge the tablet happens to carry. */
        <Body who={who} tab={tab} onBusy={setBusy} supervisor={supervisor}
          go={go}
          focus={focus?.section === section.key ? focus.what : null}
          onClearFocus={() => setFocus(null)} />
      )}
    </div>
  );
}
