/* The Setup screen: the cost-code paste reader as a pure function, then
   the roster admin against the real database.

   Run:
     set -a && . ./.env.local && set +a && node scripts/test-setup.mjs
*/
import { parseCodes, planCodes } from "../src/codePaste.js";
import * as setup from "../src/setupData.js";
import { client, MARK, makeChecks, cleanup, report } from "./_testkit.mjs";

const c = client();
const { state, is, truthy } = makeChecks();
const EMAIL = "setup-test@invalid";
let cleanupOk = false;

try {
  /* ── The three shapes the sheet arrives in ──────────────────── */
  const p = parseCodes([
    "873 Service",
    "874,Road call",
    "875\tShop labour",
    "",
    "876 Service Truck Repair",
  ].join("\n"));
  is(p.rows.length, 4, "every line reads, the blank one dropped");
  is(p.rows[0].name, "Service", "space separated");
  is(p.rows[1].name, "Road call", "comma separated");
  is(p.rows[2].name, "Shop labour", "tab separated, which is what Excel pastes");
  is(p.rows[3].name, "Service Truck Repair",
     "a name with spaces in it is not split on the second word");

  is(parseCodes("873").bad.length, 1, "a code with no name is skipped, not guessed at");
  is(parseCodes("  ").rows.length, 0, "whitespace is not a code");
  const dup = parseCodes("873 First\n873 Second");
  is(dup.rows.length, 1, "the same code twice collapses");
  is(dup.rows[0].name, "Second", "and the later line wins, as a correction should");

  /* ── Planning against what is already there ─────────────────── */
  const existing = [
    { code: "873", name: "Service", active: true },
    { code: "999", name: "Old thing", active: true },
  ];
  const plan = planCodes(parseCodes("873 Service\n874 Road call"), existing, false);
  is(plan.add.length, 1, "one new code");
  is(plan.rename.length, 0, "nothing renamed");
  is(plan.same.length, 1, "one already matches");
  is(plan.deactivate.length, 0, "without replace, nothing is retired");

  const ren = planCodes(parseCodes("873 Servicing"), existing, false);
  is(ren.rename.length, 1, "a changed name reads as a rename");
  is(ren.rename[0].was, "Service", "and says what it was");

  const rep = planCodes(parseCodes("873 Service"), existing, true);
  is(rep.deactivate.length, 1, "replace retires what the paste left out");
  is(rep.deactivate[0].code, "999", "namely the one not pasted");
  truthy(!rep.deactivate.some((x) => x.code === "873"),
         "and never retires one that IS in the paste");

  /* ── The roster, for real ───────────────────────────────────── */
  const add = await setup.addMechanic(EMAIL, `${MARK} Fitter`);
  truthy(add.ok, "a mechanic can be added");
  is(add.reactivated, false, "as a new row");

  let roster = await setup.listRoster();
  const m = roster.find((x) => x.email === EMAIL);
  truthy(m, "and reads back on the roster");
  is(m.pinSet, false, "with no PIN — they choose their own");
  is(m.active, true, "and on the roster");

  const again = await setup.addMechanic(EMAIL, `${MARK} Fitter`);
  is(again.reactivated, true, "adding the same email again reactivates rather than duplicating");

  const bad = await setup.addMechanic("not-an-email", "X");
  is(bad.ok, false, "a string with no @ in it is refused");

  await setup.setMechanicActive(EMAIL, false);
  roster = await setup.listRoster();
  is(roster.find((x) => x.email === EMAIL).active, false, "taking somebody off the roster works");
  await setup.setMechanicActive(EMAIL, true);

  /* The part that matters most about Setup: somebody added to the
     roster has no PIN, and MUST be able to set one. Registering used to
     refuse outright whenever a row existed, which made the roster and
     the reset button useless. */
  const reg = await c.rpc("tw_mechanic_register",
    { p_email: EMAIL, p_name: `${MARK} Fitter`, p_pin: "8391" });
  truthy(reg.data?.ok, "a mechanic already on the roster can set their first PIN");
  is(reg.data?.existing, true, "against the row that was already there, not a duplicate");
  roster = await setup.listRoster();
  is(roster.find((x) => x.email === EMAIL).pinSet, true, "a PIN can be set");
  const r = await setup.resetPin(EMAIL);
  truthy(r.ok, "and reset");
  roster = await setup.listRoster();
  is(roster.find((x) => x.email === EMAIL).pinSet, false, "which clears it");

  const peek = await c.from("tw_mechanics").select("pin_hash").eq("email", EMAIL);
  truthy(peek.error, "and the hash itself is still unreadable from the browser");

  /* And again after a reset — the same state, so the same must hold. */
  const again2 = await c.rpc("tw_mechanic_register",
    { p_email: EMAIL, p_name: `${MARK} Fitter`, p_pin: "5150" });
  truthy(again2.data?.ok, "and can set another one after a reset");
  const twice = await c.rpc("tw_mechanic_register",
    { p_email: EMAIL, p_name: `${MARK} Fitter`, p_pin: "1234" });
  is(twice.data?.ok, false, "but not while a PIN is already set");

  const ok = await c.rpc("tw_mechanic_verify_pin", { p_email: EMAIL, p_pin: "5150" });
  truthy(ok.data?.ok, "the PIN set after a reset actually works");

  const missing = await setup.resetPin("nobody@invalid");
  is(missing.ok, false, "resetting somebody who does not exist says so");
} catch (e) {
  state.failed.push(`threw: ${e.message}`);
  console.log("  !!  threw: " + e.message);
} finally {
  cleanupOk = await cleanup(c, [
    {
      label: "test mechanic",
      run: async () => { await c.rpc("tw_purge_test_mechanic", { p_email: EMAIL }); },
      verify: async () => {
        const { count, error } = await c.from("tw_mechanics")
          .select("id", { count: "exact", head: true }).eq("email", EMAIL);
        return error ? null : (count || 0);
      },
      manual: `delete from tw_mechanics where email='${EMAIL}';`,
    },
  ]);
}

report(state, cleanupOk);
