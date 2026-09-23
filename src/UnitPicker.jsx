import React, { useState, useRef, useEffect, useMemo } from "react";
import { C, FD, FM } from "./theme.js";
import { inp } from "./ui.jsx";
import { searchPicks, topPick, labelFor, pickCount, shopValue } from "./pickUnit.js";

/* ── Picking a unit by typing it ──────────────────────────────────
   This replaces a <select> holding the whole fleet. On a phone that
   select is a spinning wheel of 130-odd trucks with no way to jump to
   one; on a tablet it is a list you scroll past the one you wanted.
   Somebody standing at the truck knows the number on the door.

   Built as an input and a list rather than a native datalist, for
   three reasons that all come from where it is used: a datalist on iOS
   Safari renders as a strip nobody can hit with a glove on, it gives
   no control over what matches, and it cannot show the make and model
   beside the number — which is how somebody checks they picked the
   right truck before starting a clock on it.

   The matching itself is in pickUnit.js, with no database and no
   browser, so it is checkable on its own. */

const ROW = {
  display: "block", width: "100%", textAlign: "left", cursor: "pointer",
  border: "none", borderBottom: `1px solid ${C.lineSoft}`, background: "#fff",
  /* 46px. A gloved thumb on a tablet propped on a fender, not a mouse. */
  padding: "12px 14px", minHeight: 46, lineHeight: 1.3,
};

export default function UnitPicker({
  value, vehicles = [], shopWork = [], onPick, placeholder = "Pick the unit…",
}) {
  const [open, setOpen] = useState(false);
  /* What the box SHOWS is tied to focus, not to whether the list is
     up. Tying it to the list meant Escape swapped the text back to the
     tire already chosen while the caret was still in it, and the next
     keystroke landed on the end of that — type 88, press Escape, press
     1 and the box is searching for "Training1". */
  const [focused, setFocused] = useState(false);
  const [q, setQ] = useState("");
  const [cursor, setCursor] = useState(0);
  const box = useRef(null);
  const field = useRef(null);

  const chosen = labelFor(value, { vehicles });
  const found = useMemo(() => searchPicks(q, { vehicles, shopWork }),
    [q, vehicles, shopWork]);
  const rows = useMemo(() => [
    ...found.units.map((u) => ({ key: u.id, val: u.id, num: u.num,
      sub: [u.make, u.model].filter(Boolean).join(" ") })),
    ...found.shop.map((w) => ({ key: `shop:${w}`, val: shopValue(w), num: w,
      sub: "Shop & indirect time" })),
  ], [found]);

  useEffect(() => { setCursor(0); }, [q]);

  /* A tap anywhere else puts it away. Pointerdown rather than click so
     the list is gone before whatever was tapped reacts. */
  useEffect(() => {
    if (!open) return undefined;
    const away = (e) => { if (box.current && !box.current.contains(e.target)) setOpen(false); };
    document.addEventListener("pointerdown", away);
    return () => document.removeEventListener("pointerdown", away);
  }, [open]);

  const take = (val) => {
    if (!val) return;
    onPick(val);
    setQ("");
    setOpen(false);
    setFocused(false);
    field.current?.blur();
  };

  const keys = (e) => {
    if (e.key === "Enter") {
      e.preventDefault();
      take(rows[cursor]?.val ?? topPick(found));
    } else if (e.key === "Escape") {
      setOpen(false);
    } else if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      e.preventDefault();
      if (!rows.length) return;
      const step = e.key === "ArrowDown" ? 1 : -1;
      setCursor((i) => (i + step + rows.length) % rows.length);
    }
  };

  return (
    <div ref={box} style={{ position: "relative" }}>
      <input
        ref={field}
        value={focused ? q : chosen}
        onChange={(e) => { setQ(e.target.value); setOpen(true); }}
        onFocus={() => { setQ(""); setOpen(true); setFocused(true); }}
        onBlur={() => setFocused(false)}
        onKeyDown={keys}
        placeholder={chosen || placeholder}
        /* A truck number is not a word. Left to itself a tablet
           capitalises it, corrects it and offers to spell it. */
        inputMode="search" autoCorrect="off" autoCapitalize="off"
        spellCheck={false} enterKeyHint="go"
        aria-label="Equipment"
        style={{ ...inp, fontFamily: chosen && !open ? FM : undefined,
                 fontSize: 16 }} />

      {value && !focused && (
        <button
          onClick={() => { onPick(""); setQ(""); }}
          aria-label="Clear the unit"
          style={{ position: "absolute", right: 8, top: "50%", transform: "translateY(-50%)",
                   border: "none", background: "transparent", cursor: "pointer",
                   color: C.muted, fontSize: 18, lineHeight: 1, padding: "6px 8px" }}>
          ×
        </button>
      )}

      {open && (
        <div style={{ position: "absolute", zIndex: 30, left: 0, right: 0, top: "calc(100% + 4px)",
                      background: "#fff", border: `1px solid ${C.line}`, borderRadius: 6,
                      boxShadow: "0 8px 24px rgba(0,0,0,0.14)",
                      maxHeight: 320, overflowY: "auto" }}>
          {rows.map((r, i) => (
            <button key={r.key}
              /* Mousedown, not click: the input blurs first otherwise
                 and the row is gone before the tap lands on it. */
              onMouseDown={(e) => { e.preventDefault(); take(r.val); }}
              onMouseEnter={() => setCursor(i)}
              style={{ ...ROW, background: i === cursor ? "#F1F7F3" : "#fff" }}>
              <span style={{ fontFamily: FM, fontWeight: 600, fontSize: 15, color: C.green900 }}>
                {r.num}
              </span>
              {r.sub && (
                <span style={{ color: C.muted, fontSize: 12.5, marginLeft: 8 }}>{r.sub}</span>
              )}
            </button>
          ))}

          {found.empty && (
            <div style={{ padding: "10px 14px", fontSize: 12.5, color: C.muted,
                          borderTop: rows.length ? `1px solid ${C.lineSoft}` : "none" }}>
              Type a unit number — 881, dt881 or DT-881 all find it.
            </div>
          )}
          {!found.empty && pickCount(found) === 0 && (
            <div style={{ padding: "14px", fontSize: 13, color: C.muted }}>
              Nothing matches “{q}”. Try the number on the door.
            </div>
          )}
        </div>
      )}
    </div>
  );
}
