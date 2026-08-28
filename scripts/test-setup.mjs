/* The Setup screen: the cost-code paste reader as a pure function, then
   the roster admin against the real database.

   Run:
     set -a && . ./.env.local && set +a && node scripts/test-setup.mjs
*/
import { parseCodes, planCodes } from "../src/codePaste.js";
import * as setup from "../src/setupData.js";
import * as time from "../src/timeData.js";
import { client, MARK, makeChecks, cleanup, report } from "./_testkit.mjs";

const c = client();
const { state, is, truthy } = makeChecks();
const EMAIL = "setup-test@invalid";
const TESTCODE = "ZZ-TEST-CODE";
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
    { code: "873", name: "Service", group: "Vehicle", sort: 10, active: true },
    { code: "999", name: "Old thing", group: "Plant", sort: 40, active: true },
  ];
  const plan = planCodes(parseCodes("873 Service\n874 Road call"), existing, false);
  is(plan.add.length, 1, "one new code");
  is(plan.rename.length, 0, "nothing renamed");
  is(plan.same.length, 1, "one already matches");
  is(plan.deactivate.length, 0, "without replace, nothing is retired");

  /* Group and position, which is what a sixty-line paste gets wrong if
     nobody carries them: the whole batch lands ungrouped, at the top. */
  const grouped = planCodes(parseCodes("874 Road call\n875 Shop labour"),
                            existing, false, "Vehicle");
  is(grouped.add[0].group, "Vehicle", "a new code is filed under the chosen group");
  is(grouped.add[1].group, "Vehicle", "every new code in the paste, not just the first");
  is(grouped.add[0].sort, 50, "and sorts after the last code already on the list");
  is(grouped.add[1].sort, 60, "the next one after that");
  truthy(grouped.add.every((r) => r.sort > 40),
         "so a paste never jumps ahead of what is already there");

  const ren = planCodes(parseCodes("873 Servicing"), existing, false, "Plant");
  is(ren.rename.length, 1, "a changed name reads as a rename");
  is(ren.rename[0].was, "Service", "and says what it was");
  is(ren.rename[0].group, "Vehicle",
     "a rename keeps the group the code already had, not the paste's");
  is(ren.rename[0].sort, 10, "and keeps its place in the list");

  const rep = planCodes(parseCodes("873 Service"), existing, true);
  is(rep.deactivate.length, 1, "replace retires what the paste left out");
  is(rep.deactivate[0].code, "999", "namely the one not pasted");
  truthy(!rep.deactivate.some((x) => x.code === "873"),
         "and never retires one that IS in the paste");

  /* ── A code added by hand, for real ─────────────────────────── */
  /* Jason adds these one at a time off a sheet, so the group and the
     position have to survive the round trip, not just the plan. */
  await setup.saveCostCode({ code: TESTCODE, name: `${MARK} Shop time`,
                             group: "Other", sort: 9000 });
  const all = await setup.listAllCostCodes();
  const mine = all.find((x) => x.code === TESTCODE);
  truthy(mine, "a cost code added by hand reads back");
  is(mine.name, `${MARK} Shop time`, "with the name it was given");
  is(mine.group, "Other", "and the group, which is its heading on the timecard");
  is(mine.active, true, "and in use straight away");
  is(mine.sort, 9000, "and where it was put, not at the top");

  /* listCostCodes is the mechanic's list — it must carry the group too,
     or the dropdown has nothing to head the section with. */
  const forCard = await time.listCostCodes();
  is((forCard.find((x) => x.code === TESTCODE) || {}).group, "Other",
     "and the mechanic's dropdown gets that group, not a blank heading");

  /* ── Shop time has somewhere to go ──────────────────────────── */
  /* An hour with no piece of equipment on it still needs a cost code —
     the column is not null and payroll cannot charge it out without one.
     Before these existed the only thing to pick was a 9xx Plant code,
     which is the asphalt plant, not the shop. */
  const shops = all.filter((x) => x.group === "Shop" && x.active);
  truthy(shops.length >= 1, "there is a cost code to charge shop time to");
  truthy(shops.every((x) => x.name), "and each one names its shop");
  const onCard = forCard.filter((x) => x.group === "Shop");
  is(onCard.length, shops.length, "and the mechanic's dropdown offers all of them");

  /* ── The roster, for real ───────────────────────────────────── */
  const add = await setup.addMechanic(`${MARK} Fitter`, "mechanic", EMAIL);
  truthy(add.ok, "a mechanic can be added");
  is(add.existing, false, "as a new row");

  let roster = await setup.listRoster();
  const m = roster.find((x) => x.email === EMAIL);
  truthy(m, "and reads back on the roster");
  is(m.pinSet, false, "with no PIN — they choose their own");
  is(m.active, true, "and on the roster");

  const again = await setup.addMechanic(`${MARK} Fitter`, "mechanic", EMAIL);
  is(again.existing, true, "adding the same email again matches rather than duplicating");

  const bad = await setup.addMechanic("Someone", "mechanic", "not-an-email");
  is(bad.ok, false, "an email with no @ in it is refused");
  const noName = await setup.addMechanic("  ", "mechanic");
  is(noName.ok, false, "and a blank name is refused");

  await setup.setMechanicActive(m.id, false);
  roster = await setup.listRoster();
  is(roster.find((x) => x.email === EMAIL).active, false, "taking somebody off the roster works");
  await setup.setMechanicActive(m.id, true);

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
  const r = await setup.resetPin(m.id);
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

  /* ── Signing in by name, which is how the shop does it ─────── */
  const named = await setup.addMechanic(`${MARK} No Email`, "mechanic");
  truthy(named.ok, "somebody with no email at all can be added");
  const nid = named.id;

  let roster2 = await setup.listRoster();
  const ne = roster2.find((x) => x.id === nid);
  is(ne.email, "", "and has no email");
  is(ne.role, "mechanic", "with a role");
  is(ne.pinSet, false, "and no PIN yet");

  const badPin = await setup.setPin(nid, "12");
  is(badPin.ok, false, "a two digit PIN is refused");

  truthy((await setup.setPin(nid, "7391")).ok, "they set a four digit PIN");
  is((await setup.setPin(nid, "1111")).ok, false,
     "and cannot quietly overwrite it without the old one");

  const v = await setup.checkPin(nid, "7391");
  truthy(v.ok, "the PIN verifies");
  is(v.name, `${MARK} No Email`, "and hands back who it is");
  is(v.role, "mechanic", "and their role");

  is((await setup.checkPin(nid, "0000")).ok, false, "a wrong PIN is refused");

  /* The lockout is what actually protects somebody's hours on a shared
     tablet, so it is worth proving rather than assuming. */
  for (let i = 0; i < 4; i++) await setup.checkPin(nid, "0000");
  const locked = await setup.checkPin(nid, "7391");
  is(locked.ok, false, "five wrong tries locks it even against the right PIN");
  truthy(/lock/i.test(locked.error), "and says it is locked");

  truthy((await setup.resetPin(nid)).ok, "a reset clears the lock");
  truthy((await setup.setPin(nid, "4242")).ok, "and lets them choose again");
  truthy((await setup.checkPin(nid, "4242")).ok, "which then works");

  const ch = await setup.changePinById(nid, "4242", "9988");
  truthy(ch.ok, "they can change it with the old one");
  is((await setup.changePinById(nid, "0000", "1212")).ok, false,
     "but not with the wrong old one");
  truthy((await setup.checkPin(nid, "9988")).ok, "the new one works");

  truthy((await setup.setRole(nid, "dashboard")).ok, "a role can be changed");
  is((await setup.setRole(nid, "wizard")).ok, false, "to a real one only");

  const dupe = await setup.addMechanic(`${MARK} No Email`, "mechanic");
  is(dupe.existing, true, "adding the same name again matches rather than duplicating");

  /* ── The supervisor gate turns on this ────────────────────────
     Hours and Setup let somebody in only if checkPin says their role
     is dashboard or admin. So the role coming back has to be right,
     and a mechanic's own PIN must not read as a supervisor's. */
  const ALLOWED = new Set(["dashboard", "admin"]);

  await setup.setRole(nid, "mechanic");
  let rv = await setup.checkPin(nid, "9988");
  truthy(rv.ok, "a mechanic's PIN still verifies");
  is(rv.role, "mechanic", "and comes back as a mechanic");
  is(ALLOWED.has(rv.role), false, "which the supervisor gate refuses");

  await setup.setRole(nid, "dashboard");
  rv = await setup.checkPin(nid, "9988");
  is(rv.role, "dashboard", "promoted to dashboard, the role follows");
  is(ALLOWED.has(rv.role), true, "and the gate would let them in");

  await setup.setRole(nid, "admin");
  rv = await setup.checkPin(nid, "9988");
  is(ALLOWED.has(rv.role), true, "an admin gets in too");

  /* A wrong PIN must not leak the role either. */
  const bad2 = await setup.checkPin(nid, "0000");
  is(bad2.ok, false, "a wrong PIN is refused");
  is(bad2.role, undefined, "and says nothing about who they are");
  await setup.resetPin(nid);
  await setup.setPin(nid, "9988");

  const missing = await setup.resetPin("00000000-0000-0000-0000-000000000000");
  is(missing.ok, false, "resetting somebody who does not exist says so");
} catch (e) {
  state.failed.push(`threw: ${e.message}`);
  console.log("  !!  threw: " + e.message);
} finally {
  cleanupOk = await cleanup(c, [
    {
      label: "test cost code",
      run: async () => { await c.from("tw_cost_codes").delete().eq("code", TESTCODE); },
      verify: async () => {
        const { count, error } = await c.from("tw_cost_codes")
          .select("code", { count: "exact", head: true }).eq("code", TESTCODE);
        return error ? null : (count || 0);
      },
      manual: `delete from tw_cost_codes where code='${TESTCODE}';`,
    },
    {
      label: "test mechanic",
      run: async () => { await c.rpc("tw_purge_test_mechanic", { p_email: EMAIL, p_name: null }); },
      verify: async () => {
        const { count, error } = await c.from("tw_mechanics")
          .select("id", { count: "exact", head: true }).eq("email", EMAIL);
        return error ? null : (count || 0);
      },
      manual: `delete from tw_mechanics where email='${EMAIL}';`,
    },
    {
      label: "test mechanic with no email",
      /* anon cannot delete a mechanic, by design. The purge function
         takes a marked name as well as an @invalid address now. */
      run: async () => {
        await c.rpc("tw_purge_test_mechanic", { p_email: null, p_name: `${MARK} No Email` });
      },
      verify: async () => {
        const { count, error } = await c.from("tw_mechanics")
          .select("id", { count: "exact", head: true }).eq("name", `${MARK} No Email`);
        return error ? null : (count || 0);
      },
      manual: `delete from tw_mechanics where name='${MARK} No Email';`,
    },
  ]);
}

report(state, cleanupOk);
