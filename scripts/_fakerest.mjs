/* A fake PostgREST for driving the built app in a real browser.
   ─────────────────────────────────────────────────────────────────
   Why this file exists, and the mistake it is here to stop:

   `npm run build` does not catch an undefined global, so the only way
   to know a screen works is to load it in a browser. Faking the
   database is how those tests stay fast and independent of the live
   data. But the first version of this fake answered every request with
   whatever rows the fixture held, ignoring the select list entirely —
   so `nowData.js` asking for `tw_hours.job_location`, a column that did
   not exist, came back 200 with rows. Every check passed. The screen
   then shipped and greeted Jason with

       column tw_hours.job_location does not exist

   A fake that is more permissive than the real thing does not just
   fail to catch a bug, it certifies it. So this one refuses a column
   the fixture does not define, the way PostgREST refuses one the
   database does not have. The fixture becomes the schema, and a typo or
   an invented column fails the test instead of passing it.

   Filters are honoured for the same reason: an ignored `eq` once made a
   test pass against the wrong card. */

import { readFileSync } from "node:fs";

const OK = { "content-type": "application/json" };

/* The real schema, generated from the database. Checking against this
   rather than against the fixture rows is the difference between a test
   that catches an invented column and one that certifies it: a fixture
   only has the fields the test bothered to fill in, so judging by it
   would reject columns that genuinely exist. */
const SCHEMA = JSON.parse(readFileSync(
  new URL("./schema-columns.json", import.meta.url), "utf8")).tables;

const cmp = (op, got, val) => {
  const g = String(got);
  if (op === "eq") return g === val;
  if (op === "neq") return g !== val;
  if (op === "gt") return g > val;
  if (op === "gte") return g >= val;
  if (op === "lt") return g < val;
  if (op === "lte") return g <= val;
  if (op === "is") return val === "null" ? got == null : g === val;
  if (op === "like" || op === "ilike") {
    const rx = new RegExp("^" + val.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
      .replace(/%/g, ".*") + "$", op === "ilike" ? "i" : "");
    return rx.test(g);
  }
  if (op === "in") {
    return val.replace(/^\(|\)$/g, "").split(",")
      .map((x) => x.replace(/^"|"$/g, "")).includes(g);
  }
  return true;   // an operator this fake does not model does not filter
};

/* The columns a table is allowed to have: the database's own, with an
   override for a table a test wants to model differently. A table
   missing from the schema file is not judged — that is the honest
   answer for one this environment has never seen. */
function columnsOf(declared, table) {
  if (declared?.[table]) return new Set(declared[table]);
  return SCHEMA[table] ? new Set(SCHEMA[table]) : new Set();
}

/* Install on a Playwright BrowserContext.

   rows     — { table: [row, ...] }, mutated in place by writes
   columns  — { table: ["col", ...] } to override the real schema for a
              table a test models differently
   onWrite  — called with every POST/PATCH/DELETE, for assertions
   rpc      — { fn_name: (body) => result }; an unlisted rpc returns {ok:true}
   after    — called with (table, method) once a write has been applied,
              for standing in for a database trigger

   Returns { writes } — every write seen, in order. */
export async function fakeRest(ctx, { rows, columns, rpc, after, onWrite } = {}) {
  const writes = [];

  await ctx.route("**/rest/v1/**", async (route) => {
    const req = route.request();
    const url = new URL(req.url());
    const path = url.pathname.split("/rest/v1/")[1] || "";
    const table = path.split("?")[0];
    const method = req.method();
    const body = req.postData() ? JSON.parse(req.postData()) : null;

    if (path.startsWith("rpc/")) {
      const fn = table.slice(4);
      writes.push({ method, rpc: fn, body });
      onWrite?.({ method, rpc: fn, body });
      const out = rpc?.[fn] ? rpc[fn](body) : { ok: true };
      return route.fulfill({ status: 200, headers: OK, body: JSON.stringify(out) });
    }

    const known = columnsOf(columns, table);
    const bad = (name) => route.fulfill({ status: 400, headers: OK,
      body: JSON.stringify({
        code: "42703",
        message: `column ${table}.${name} does not exist`,
        hint: "not in scripts/schema-columns.json — the database has no such column",
      }) });

    /* The check that was missing. Skipped for a table the schema file
       does not cover, since guessing would be worse than not asking. */
    if (known.size) {
      const sel = url.searchParams.get("select");
      if (sel && sel !== "*") {
        for (const raw of sel.split(",")) {
          const col = raw.trim().split(":").pop().split("(")[0].trim();
          if (col && col !== "*" && !known.has(col)) return bad(col);
        }
      }
      for (const k of url.searchParams.keys()) {
        if (["select", "order", "limit", "offset", "or", "and"].includes(k)) continue;
        const col = k.split(".")[0];
        if (!known.has(col)) return bad(col);
      }
      const order = url.searchParams.get("order");
      if (order) {
        for (const raw of order.split(",")) {
          const col = raw.trim().split(".")[0];
          if (col && !known.has(col)) return bad(col);
        }
      }
      for (const r of (Array.isArray(body) ? body : body ? [body] : [])) {
        for (const k of Object.keys(r)) if (!known.has(k)) return bad(k);
      }
    }

    const matches = (r) => {
      for (const [k, raw] of url.searchParams) {
        if (["select", "order", "limit", "offset"].includes(k)) continue;
        const [op, ...rest] = raw.split(".");
        if (!cmp(op, r[k.split(".")[0]], rest.join("."))) return false;
      }
      return true;
    };

    if (method === "POST" || method === "PATCH" || method === "DELETE") {
      writes.push({ method, table, body, filter: url.search });
      onWrite?.({ method, table, body, filter: url.search });
      rows[table] ||= [];
      if (method === "POST") {
        for (const r of Array.isArray(body) ? body : [body]) {
          rows[table].push({ id: `fake-${rows[table].length + 1}`, ...r });
        }
      } else if (method === "PATCH") {
        for (const r of rows[table]) if (matches(r)) Object.assign(r, body);
      } else {
        rows[table] = rows[table].filter((r) => !matches(r));
      }
      after?.(table, method);
      return route.fulfill({ status: method === "DELETE" ? 204 : 201,
        headers: OK, body: method === "DELETE" ? "" : "[]" });
    }

    let out = (rows[table] ?? []).filter(matches);
    const order = url.searchParams.get("order");
    if (order) {
      for (const raw of [...order.split(",")].reverse()) {
        const [col, dir] = raw.trim().split(".");
        const sign = dir === "desc" ? -1 : 1;
        out = [...out].sort((a, b) =>
          sign * String(a[col] ?? "").localeCompare(String(b[col] ?? "")));
      }
    }
    return route.fulfill({ status: 200,
      headers: { ...OK, "content-range": `0-${Math.max(out.length - 1, 0)}/*` },
      body: JSON.stringify(out) });
  });

  return { writes };
}

/* Where the pre-installed Chromium lives in this environment. */
export const CHROME = "/opt/pw-browsers/chromium-1194/chrome-linux/chrome";
