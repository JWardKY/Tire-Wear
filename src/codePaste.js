/* Reading a pasted list of cost codes.

   The sheet these come off is not consistent, so three shapes are
   accepted, per line:

     873 Service          code, space, name
     873,Service          comma separated
     873<TAB>Service      tab separated, which is what pasting from
                          Excel actually produces

   Pure, so it can be tested without a database and without a browser.
   The whole point of a paste box is that somebody dumps a column from a
   spreadsheet into it, and the failure worth avoiding is silently
   filing half of it wrong. */

/* Codes are numeric-ish in this shop but not guaranteed to be, so the
   rule is "first run of non-space up to the first separator", not "digits". */
export function parseCodes(text) {
  const rows = [], bad = [];
  const seen = new Map();

  for (const raw of String(text || "").split(/\r?\n/)) {
    const line = raw.trim();
    if (!line) continue;

    let code, name;
    /* Tab and comma are unambiguous, so try them before falling back to
       a space — a name like "Service Truck" has spaces in it and must
       not be split on the second one. */
    if (line.includes("\t")) [code, ...name] = line.split("\t");
    else if (line.includes(",")) [code, ...name] = line.split(",");
    else {
      const m = line.match(/^(\S+)\s+(.*)$/);
      if (m) { code = m[1]; name = [m[2]]; }
      else { code = line; name = []; }
    }

    code = String(code).trim();
    name = name.join(line.includes("\t") ? "\t" : ",").trim();

    if (!code) { bad.push({ line: raw, why: "no code" }); continue; }
    if (!name) { bad.push({ line: raw, why: "no name for that code" }); continue; }

    /* A duplicate inside one paste is the later line winning, which is
       what somebody correcting a row above expects. */
    if (seen.has(code)) rows[seen.get(code)] = { code, name };
    else { seen.set(code, rows.length); rows.push({ code, name }); }
  }
  return { rows, bad };
}

/* What the paste would do against what is already there, so it can be
   shown before anything is written.

   A new code carries the group it should file under and a sort order
   past the end of the list. Both matter once somebody pastes sixty of
   them: with no group they land in an unlabelled clump at the bottom of
   the mechanic's dropdown, and with sort order 0 they jump the queue
   ahead of codes that were already there. A rename keeps the group and
   the position the code already had — the paste is changing its name,
   nothing else. */
export function planCodes(parsed, existing, replaceWholeList, group = "") {
  const have = new Map(existing.map((c) => [c.code, c]));
  const add = [], rename = [], same = [];
  const end = existing.reduce((m, c) => Math.max(m, Number(c.sort) || 0), 0);

  for (const r of parsed.rows) {
    const cur = have.get(r.code);
    if (!cur) add.push({ ...r, group, sort: end + 10 * (add.length + 1) });
    else if (cur.name !== r.name)
      rename.push({ ...r, was: cur.name, group: cur.group || "", sort: Number(cur.sort) || 0 });
    else same.push(r);
  }

  /* Replace does not delete. Anything missing from the paste is
     deactivated instead, because hours already booked against a code
     still have to render its name. */
  const pasted = new Set(parsed.rows.map((r) => r.code));
  const deactivate = replaceWholeList
    ? existing.filter((c) => c.active && !pasted.has(c.code))
    : [];

  return { add, rename, same, deactivate, bad: parsed.bad };
}
