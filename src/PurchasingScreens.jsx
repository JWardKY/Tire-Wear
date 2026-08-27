import React, { useState, useEffect, useMemo, useCallback } from "react";
import { C, FD } from "./theme.js";
import { fmtDate, nf, Btn, Field, Modal, SectionLabel, inp, th, td, tdNum } from "./ui.jsx";
import * as buy from "./purchasingData.js";

/* ── Ordering, vendors, requests and what went out ────────────────
   The four Inventory screens from the foreman's mockup that stock
   alone did not cover.

   The routing is his design and worth keeping: the inventory export has
   no vendor column, so an order follows the part's category unless that
   part names a vendor of its own. */

const money = (x) => (x == null ? "—" : `$${nf(x, 2)}`);

/* ── Order parts ───────────────────────────────────────────────── */

export function OrderScreen({ rows, who, run, busy }) {
  const [draft, setDraft] = useState({});
  const [vendorOf, setVendorOf] = useState(new Map());
  const [orders, setOrders] = useState([]);
  const [sending, setSending] = useState(null);
  const [adding, setAdding] = useState(false);
  const [receiving, setReceiving] = useState(null);

  const load = useCallback(async () => {
    const [v, o] = await Promise.all([buy.partVendors(), buy.listOrders()]);
    setVendorOf(v); setOrders(o);
  }, []);
  useEffect(() => { load(); }, [load, rows]);

  const groups = useMemo(
    () => buy.groupByVendor(draft, rows, vendorOf), [draft, rows, vendorOf]);

  const fillFromAlerts = () => {
    const d = { ...draft };
    for (const p of rows) {
      if (p.state !== "low" && p.state !== "out") continue;
      /* Order up to max if there is one, otherwise to the reorder point,
         and never less than one — a part that is out with a reorder
         point of zero still needs one on the shelf. */
      const target = p.max ?? p.min ?? 0;
      const want = Math.max(1, Math.ceil(target - p.onHand - p.onOrder));
      if (want > 0) d[p.id] = want;
    }
    setDraft(d);
  };

  const setQty = (id, qty) => setDraft((d) => {
    const next = { ...d };
    if (!qty || Number(qty) <= 0) delete next[id];
    else next[id] = Number(qty);
    return next;
  });

  const lineCount = Object.keys(draft).length;

  return (
    <>
      <div style={{ display: "flex", justifyContent: "space-between",
                    alignItems: "center", gap: 8, flexWrap: "wrap", marginBottom: 10 }}>
        <SectionLabel>Order parts{lineCount ? ` · ${lineCount}` : ""}</SectionLabel>
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
          <Btn tone="ghost" onClick={fillFromAlerts}>FILL FROM REORDER ALERTS</Btn>
          <Btn tone="ghost" onClick={() => setAdding(true)}>+ ADD A PART</Btn>
          {!!lineCount && <Btn tone="ghost" onClick={() => setDraft({})}>CLEAR</Btn>}
        </div>
      </div>

      {!lineCount && (
        <div style={{ padding: "18px 14px", background: C.card, borderRadius: 6,
                      border: `1px solid ${C.line}`, color: C.muted, fontSize: 14,
                      marginBottom: 26 }}>
          Nothing on the order yet. <b>Fill from reorder alerts</b> takes everything
          that is low or out and works out how many to bring it back up to.
        </div>
      )}

      {groups.map((g) => (
        <div key={g.vendorId || "none"} style={{
          background: C.card, border: `1px solid ${g.vendorId ? C.line : C.watch}`,
          borderRadius: 6, padding: 12, marginBottom: 12,
        }}>
          <div style={{ display: "flex", justifyContent: "space-between",
                        alignItems: "baseline", gap: 8, flexWrap: "wrap" }}>
            <div style={{ fontFamily: FD, fontWeight: 700, fontSize: 16 }}>
              {g.vendor}
              {!g.vendorId && (
                <span style={{ color: C.watch, fontSize: 12, fontWeight: 400,
                               marginLeft: 8 }}>
                  no vendor for these — set one on the Vendors tab
                </span>
              )}
            </div>
            <div style={{ fontFamily: FD, fontSize: 15 }}>{money(g.total)}</div>
          </div>

          <div style={{ overflowX: "auto", margin: "8px 0" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
              <tbody>
                {g.lines.map((l) => (
                  <tr key={l.part.id}>
                    <td style={{ ...td, fontFamily: "monospace" }}>{l.part.num}</td>
                    <td style={td}>{l.part.name}</td>
                    <td style={{ ...td, width: 90 }}>
                      <input type="number" min="0" style={{ ...inp, width: 74 }}
                        value={l.qty}
                        onChange={(e) => setQty(l.part.id, e.target.value)} />
                    </td>
                    <td style={tdNum}>{money(l.cost)}</td>
                    <td style={tdNum}>{money(l.cost * l.qty)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div style={{ display: "flex", justifyContent: "flex-end" }}>
            <Btn disabled={busy} onClick={() => setSending(g)}>REVIEW AND SEND</Btn>
          </div>
        </div>
      ))}

      <div style={{ marginTop: 26 }}>
        <SectionLabel>Orders sent</SectionLabel>
        <div style={{ overflowX: "auto", marginTop: 8 }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
            <thead><tr>
              <th style={th}>PO</th><th style={th}>Vendor</th><th style={th}>Sent</th>
              <th style={th}>State</th><th style={th}>Total</th><th style={th}></th>
            </tr></thead>
            <tbody>
              {orders.map((o) => (
                <tr key={o.id}>
                  <td style={{ ...td, fontFamily: "monospace" }}>{o.po}</td>
                  <td style={td}>{o.vendor}</td>
                  <td style={td}>{fmtDate(o.at.slice(0, 10))}</td>
                  <td style={td}>
                    <span style={{ color: o.state === "received" ? C.good
                                        : o.state === "cancelled" ? C.muted : C.watch }}>
                      {o.state}
                    </span>
                  </td>
                  <td style={tdNum}>{money(o.total)}</td>
                  <td style={{ ...td, textAlign: "right" }}>
                    {o.state !== "received" && o.state !== "cancelled" && (
                      <Btn tone="ghost" onClick={() => setReceiving(o)}>RECEIVE</Btn>
                    )}
                  </td>
                </tr>
              ))}
              {!orders.length && (
                <tr><td style={{ ...td, color: C.muted }} colSpan={6}>
                  No orders yet.
                </td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {adding && (
        <AddLine rows={rows} onClose={() => setAdding(false)}
          onPick={(id, qty) => { setQty(id, qty); setAdding(false); }} />
      )}

      {sending && (
        <SendOrder group={sending} who={who} onClose={() => setSending(null)}
          onSent={async (ids) => {
            setSending(null);
            setDraft((d) => { const n = { ...d }; ids.forEach((i) => delete n[i]); return n; });
            await load();
          }} run={run} />
      )}

      {receiving && (
        <ReceiveOrder order={receiving} who={who} onClose={() => setReceiving(null)}
          onDone={async () => { setReceiving(null); await load(); }} run={run} />
      )}
    </>
  );
}

function AddLine({ rows, onClose, onPick }) {
  const [q, setQ] = useState("");
  const [qty, setQty] = useState(1);
  const hits = useMemo(() => {
    const s = q.trim().toLowerCase();
    if (!s) return [];
    return rows.filter((r) => `${r.num} ${r.name}`.toLowerCase().includes(s)).slice(0, 12);
  }, [q, rows]);
  return (
    <Modal title="Add a part to the order" onClose={onClose}>
      <Field label="Search">
        <input style={inp} value={q} autoFocus placeholder="part number or name"
               onChange={(e) => setQ(e.target.value)} />
      </Field>
      <Field label="How many">
        <input style={inp} type="number" min="1" value={qty}
               onChange={(e) => setQty(e.target.value)} />
      </Field>
      <div style={{ maxHeight: 220, overflowY: "auto" }}>
        {hits.map((r) => (
          <button key={r.id} onClick={() => onPick(r.id, Number(qty) || 1)}
            style={{ display: "block", width: "100%", textAlign: "left",
                     padding: "8px 10px", border: `1px solid ${C.line}`,
                     borderRadius: 4, background: "#fff", marginBottom: 5,
                     cursor: "pointer", fontSize: 13 }}>
            <b style={{ fontFamily: "monospace" }}>{r.num}</b> {r.name}
            <span style={{ color: C.muted }}> · {r.onHand} on hand</span>
          </button>
        ))}
        {q && !hits.length && (
          <div style={{ color: C.muted, fontSize: 13 }}>Nothing matches that.</div>
        )}
      </div>
    </Modal>
  );
}

function SendOrder({ group, who, onClose, onSent, run }) {
  const [poNum, setPoNum] = useState("");
  const [copied, setCopied] = useState(false);
  useEffect(() => { buy.nextPoNumber().then(setPoNum).catch(() => setPoNum("")); }, []);
  const mail = useMemo(
    () => (poNum ? buy.mailto(group, poNum) : null), [group, poNum]);

  const commit = (how) => run(async () => {
    const r = await buy.commitOrder(group, how, who);
    if (!r?.ok) throw new Error(r?.error || "The order did not save.");
    await onSent(group.lines.map((l) => l.part.id));
  });

  return (
    <Modal title={`Send ${poNum || "the order"} to ${group.vendor}`} onClose={onClose} width={620}>
      <p style={{ fontSize: 13, color: C.muted, marginTop: 0 }}>
        {group.lines.length} line{group.lines.length === 1 ? "" : "s"} · {money(group.total)}
        {group.email ? ` · ${group.email}` : " · no email on this vendor"}
      </p>

      <pre style={{ background: C.paper, border: `1px solid ${C.line}`,
                    borderRadius: 4, padding: 10, fontSize: 12, maxHeight: 220,
                    overflow: "auto", whiteSpace: "pre-wrap" }}>
        {mail?.body || ""}
      </pre>

      {mail?.tooLong && (
        <p style={{ color: C.watch, fontSize: 12.5 }}>
          This order is too long to send as a mail link — Outlook cuts them off
          without saying so, and a truncated purchase order is worse than none.
          Copy it and paste it into an email instead.
        </p>
      )}

      <div style={{ display: "flex", gap: 8, flexWrap: "wrap",
                    justifyContent: "flex-end", marginTop: 12 }}>
        <Btn tone="ghost" onClick={onClose}>CANCEL</Btn>
        <Btn tone="ghost" onClick={async () => {
          try { await navigator.clipboard.writeText(mail?.body || ""); setCopied(true); }
          catch { setCopied(false); }
        }}>{copied ? "COPIED" : "COPY THE ORDER"}</Btn>
        {group.email && !mail?.tooLong && (
          <Btn onClick={() => { window.location.href = mail.url; commit("email"); }}>
            EMAIL IT AND RECORD
          </Btn>
        )}
        <Btn onClick={() => commit("manual")}>RECORD AS ORDERED</Btn>
      </div>
      <p style={{ color: C.muted, fontSize: 11.5, marginBottom: 0 }}>
        Recording it moves these quantities to <b>on order</b> so nobody orders
        them twice. It does not change what is on the shelf — that happens when
        the parts arrive and you receive them.
      </p>
    </Modal>
  );
}

function ReceiveOrder({ order, who, onClose, onDone, run }) {
  const [lines, setLines] = useState([]);
  const [qty, setQty] = useState({});
  const load = useCallback(async () => {
    const l = await buy.listOrderLines(order.id);
    setLines(l);
    setQty(Object.fromEntries(l.map((x) => [x.id, x.outstanding])));
  }, [order.id]);
  useEffect(() => { load(); }, [load]);

  return (
    <Modal title={`Receive ${order.po}`} onClose={onClose} width={620}>
      <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
        <thead><tr>
          <th style={th}>Part</th><th style={th}>Ordered</th>
          <th style={th}>Had</th><th style={th}>Receiving</th><th style={th}></th>
        </tr></thead>
        <tbody>
          {lines.map((l) => (
            <tr key={l.id}>
              <td style={{ ...td, fontFamily: "monospace" }}>{l.num}</td>
              <td style={tdNum}>{l.qty}</td>
              <td style={tdNum}>{l.received}</td>
              <td style={{ ...td, width: 90 }}>
                <input type="number" min="0" max={l.outstanding} style={{ ...inp, width: 74 }}
                  value={qty[l.id] ?? 0} disabled={!l.outstanding}
                  onChange={(e) => setQty({ ...qty, [l.id]: e.target.value })} />
              </td>
              <td style={{ ...td, textAlign: "right" }}>
                {l.outstanding > 0 && (
                  <Btn tone="ghost" onClick={() => run(async () => {
                    const r = await buy.receiveLine(l.id, qty[l.id], who);
                    if (!r?.ok) throw new Error(r?.error || "Could not receive that.");
                    await load(); await onDone();
                  })}>RECEIVE</Btn>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <p style={{ color: C.muted, fontSize: 11.5 }}>
        Receiving writes a stock movement, so the shelf count and the movement
        log still agree, and takes the same amount back off <b>on order</b>.
      </p>
      <div style={{ display: "flex", justifyContent: "flex-end" }}>
        <Btn tone="ghost" onClick={onClose}>CLOSE</Btn>
      </div>
    </Modal>
  );
}

/* ── Vendors ───────────────────────────────────────────────────── */

export function VendorScreen({ rows, run }) {
  const [vendors, setVendors] = useState([]);
  const [routes, setRoutes] = useState([]);
  const [editing, setEditing] = useState(null);

  const load = useCallback(async () => {
    const [v, r] = await Promise.all([buy.listVendors(), buy.listCategoryRouting()]);
    setVendors(v); setRoutes(r);
  }, []);
  useEffect(() => { load(); }, [load]);

  const categories = useMemo(
    () => [...new Set(rows.map((r) => r.category).filter(Boolean))].sort(), [rows]);
  const routeFor = (cat) => routes.find((r) => r.category === cat)?.vendorId || "";

  return (
    <>
      <div style={{ display: "flex", justifyContent: "space-between",
                    alignItems: "center", marginBottom: 10 }}>
        <SectionLabel>Vendors</SectionLabel>
        <Btn onClick={() => setEditing({})}>+ ADD VENDOR</Btn>
      </div>

      <div style={{ overflowX: "auto", marginBottom: 26 }}>
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
          <thead><tr>
            <th style={th}>Name</th><th style={th}>Orders to</th>
            <th style={th}>Phone</th><th style={th}></th>
          </tr></thead>
          <tbody>
            {vendors.map((v) => (
              <tr key={v.id} style={{ opacity: v.active ? 1 : 0.5 }}>
                <td style={td}>{v.name}</td>
                <td style={{ ...td, color: v.email ? C.ink : C.watch }}>
                  {v.email || "no email — orders have to be copied out"}
                </td>
                <td style={td}>{v.phone}</td>
                <td style={{ ...td, textAlign: "right" }}>
                  <Btn tone="ghost" onClick={() => setEditing(v)}>EDIT</Btn>
                </td>
              </tr>
            ))}
            {!vendors.length && (
              <tr><td style={{ ...td, color: C.muted }} colSpan={4}>
                No vendors yet. Orders cannot be routed until there is at least one.
              </td></tr>
            )}
          </tbody>
        </table>
      </div>

      <SectionLabel>Which vendor supplies what</SectionLabel>
      <p style={{ color: C.muted, fontSize: 12, margin: "6px 0 10px", maxWidth: 640 }}>
        The inventory export has no vendor column, so orders route by
        <b> category</b>. Set the default here; a single part can override it from
        the All parts tab.
      </p>
      <div style={{ overflowX: "auto" }}>
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
          <thead><tr><th style={th}>Category</th><th style={th}>Default vendor</th></tr></thead>
          <tbody>
            {categories.map((cat) => (
              <tr key={cat}>
                <td style={td}>{cat}</td>
                <td style={td}>
                  <select style={{ ...inp, maxWidth: 260 }} value={routeFor(cat)}
                    onChange={(e) => run(async () => {
                      await buy.routeCategory(cat, e.target.value || null);
                      await load();
                    })}>
                    <option value="">— none —</option>
                    {vendors.map((v) => (
                      <option key={v.id} value={v.id}>{v.name}</option>
                    ))}
                  </select>
                </td>
              </tr>
            ))}
            {!categories.length && (
              <tr><td style={{ ...td, color: C.muted }} colSpan={2}>
                No categories yet — they come in with the inventory import.
              </td></tr>
            )}
          </tbody>
        </table>
      </div>

      {editing && (
        <VendorDialog v={editing} onClose={() => setEditing(null)}
          onSave={(v) => run(async () => {
            await buy.saveVendor(v); setEditing(null); await load();
          })} />
      )}
    </>
  );
}

function VendorDialog({ v, onClose, onSave }) {
  const [f, setF] = useState({
    id: v.id, name: v.name || "", email: v.email || "", cc: v.cc || "",
    phone: v.phone || "", account: v.account || "", note: v.note || "",
    active: v.active !== false,
  });
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });
  return (
    <Modal title={v.id ? "Edit vendor" : "Add a vendor"} onClose={onClose}>
      <Field label="Name"><input style={inp} value={f.name} autoFocus onChange={set("name")} /></Field>
      <Field label="Orders go to"><input style={inp} type="email" value={f.email} onChange={set("email")} /></Field>
      <Field label="Copy to"><input style={inp} type="email" value={f.cc} onChange={set("cc")} /></Field>
      <Field label="Phone"><input style={inp} value={f.phone} onChange={set("phone")} /></Field>
      <Field label="Our account number"><input style={inp} value={f.account} onChange={set("account")} /></Field>
      <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
        <Btn tone="ghost" onClick={onClose}>CANCEL</Btn>
        <Btn disabled={!f.name.trim()} onClick={() => onSave(f)}>SAVE</Btn>
      </div>
    </Modal>
  );
}

/* ── Requests from the floor ───────────────────────────────────── */

export function RequestScreen({ rows, vehicles, who, run }) {
  const [reqs, setReqs] = useState([]);
  const [showAll, setShowAll] = useState(false);
  const [adding, setAdding] = useState(false);

  const load = useCallback(async () => {
    setReqs(await buy.listRequests(
      showAll ? ["open", "ordered", "issued", "declined"] : ["open"]));
  }, [showAll]);
  useEffect(() => { load(); }, [load]);

  return (
    <>
      <div style={{ display: "flex", justifyContent: "space-between",
                    alignItems: "center", gap: 8, flexWrap: "wrap", marginBottom: 10 }}>
        <SectionLabel>Parts requests from the shop floor</SectionLabel>
        <div style={{ display: "flex", gap: 6 }}>
          <Btn tone="ghost" onClick={() => setShowAll((s) => !s)}>
            {showAll ? "OPEN ONLY" : "SHOW ALL"}
          </Btn>
          <Btn onClick={() => setAdding(true)}>+ REQUEST A PART</Btn>
        </div>
      </div>

      <div style={{ overflowX: "auto" }}>
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
          <thead><tr>
            <th style={th}>What</th><th style={th}>Qty</th><th style={th}>For</th>
            <th style={th}>Asked by</th><th style={th}>When</th>
            <th style={th}>State</th><th style={th}></th>
          </tr></thead>
          <tbody>
            {reqs.map((r) => (
              <tr key={r.id}>
                <td style={td}>
                  {r.num && <b style={{ fontFamily: "monospace" }}>{r.num} </b>}
                  {r.description}
                </td>
                <td style={tdNum}>{r.qty}</td>
                <td style={td}>{r.unit}</td>
                <td style={{ ...td, color: C.muted }}>{r.by}</td>
                <td style={td}>{fmtDate(r.at.slice(0, 10))}</td>
                <td style={td}>{r.state}</td>
                <td style={{ ...td, textAlign: "right", whiteSpace: "nowrap" }}>
                  {r.state === "open" && (
                    <>
                      <Btn tone="ghost" onClick={() => run(async () => {
                        await buy.setRequestState(r.id, "ordered"); await load();
                      })}>ORDERED</Btn>{" "}
                      <Btn tone="ghost" onClick={() => run(async () => {
                        await buy.setRequestState(r.id, "declined"); await load();
                      })}>DECLINE</Btn>
                    </>
                  )}
                </td>
              </tr>
            ))}
            {!reqs.length && (
              <tr><td style={{ ...td, color: C.muted }} colSpan={7}>
                {showAll ? "No requests." : "Nothing outstanding."}
              </td></tr>
            )}
          </tbody>
        </table>
      </div>

      {adding && (
        <RequestDialog rows={rows} vehicles={vehicles} onClose={() => setAdding(false)}
          onSave={(r) => run(async () => {
            await buy.addRequest(r, who); setAdding(false); await load();
          })} />
      )}
    </>
  );
}

function RequestDialog({ rows, vehicles, onClose, onSave }) {
  const [f, setF] = useState({ num: "", description: "", qty: 1, unit: "", note: "" });
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });
  return (
    <Modal title="Request a part" onClose={onClose}>
      <p style={{ fontSize: 12.5, color: C.muted, marginTop: 0 }}>
        For something the shop needs, whether or not we stock it. A request is
        not an order — somebody still has to place it.
      </p>
      <Field label="What is needed">
        <input style={inp} value={f.description} autoFocus onChange={set("description")} />
      </Field>
      <Field label="Part number, if you have one">
        <input style={inp} value={f.num} onChange={set("num")} />
      </Field>
      <Field label="How many">
        <input style={inp} type="number" min="1" value={f.qty} onChange={set("qty")} />
      </Field>
      <Field label="Which truck">
        <input style={inp} value={f.unit} placeholder="DT-882" onChange={set("unit")} />
      </Field>
      <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
        <Btn tone="ghost" onClick={onClose}>CANCEL</Btn>
        <Btn disabled={!f.description.trim()} onClick={() => onSave(f)}>REQUEST IT</Btn>
      </div>
    </Modal>
  );
}

/* ── What went out ─────────────────────────────────────────────── */

export function IssuedScreen({ rows, vehicles }) {
  const [issued, setIssued] = useState([]);
  useEffect(() => { buy.recentlyIssued().then(setIssued).catch(() => setIssued([])); }, []);

  const partOf = (id) => rows.find((r) => r.id === id);
  const unitOf = (id) => vehicles.find((v) => v.id === id)?.number || "";

  return (
    <>
      <SectionLabel>Recently issued</SectionLabel>
      <div style={{ overflowX: "auto", marginTop: 8 }}>
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
          <thead><tr>
            <th style={th}>When</th><th style={th}>Part</th><th style={th}>Qty</th>
            <th style={th}>Truck</th><th style={th}>Work order</th><th style={th}>By</th>
          </tr></thead>
          <tbody>
            {issued.map((i) => {
              const p = partOf(i.partId);
              return (
                <tr key={i.id}>
                  <td style={td}>{fmtDate(i.at.slice(0, 10))}</td>
                  <td style={td}>
                    <b style={{ fontFamily: "monospace" }}>{p?.num || "—"}</b>{" "}
                    {p?.name || ""}
                  </td>
                  <td style={tdNum}>{i.qty}</td>
                  <td style={td}>{unitOf(i.vehId)}</td>
                  <td style={td}>{i.workOrder}</td>
                  <td style={{ ...td, color: C.muted }}>{i.who}</td>
                </tr>
              );
            })}
            {!issued.length && (
              <tr><td style={{ ...td, color: C.muted }} colSpan={6}>
                Nothing has been issued yet.
              </td></tr>
            )}
          </tbody>
        </table>
      </div>
    </>
  );
}
