/* Checks that the PIN plumbing holds from the browser's side of the wire.
   These are the security properties, not the happy path — if any of
   these fail, the PIN is decoration.

   Run:
     set -a && . ./.env.local && set +a && node scripts/test-pins.mjs

   This one cannot clean up after itself. Mechanics are deliberately not
   deletable by the app — that is the property being tested — so the test
   mechanic has to be removed with a privileged hand. The script prints
   the SQL and refuses to run again until it is gone, rather than
   producing confusing duplicate-registration failures. */
import { client, MARK, TEST_MECHANIC, makeChecks, cleanup, report } from "./_testkit.mjs";

const c = client();
const { state, ok, is, truthy } = makeChecks();

const EMAIL = TEST_MECHANIC;
const PIN = "4271";
let cleanupOk = false;

const rpc = async (fn, args) => {
  const { data, error } = await c.rpc(fn, args);
  if (error) throw new Error(`${fn}: ${error.message}`);
  return data;
};

try {
  /* Refuse to start on a dirty database rather than fail confusingly. */
  const existing = await c.from("tw_mechanics").select("id").eq("email", EMAIL);
  if (!existing.error && existing.data.length) {
    console.log(`  --  ${EMAIL} is left over from a previous run.`);
    console.log(`      Remove it and run again:  delete from tw_mechanics where email='${EMAIL}';`);
    throw new Error("test mechanic left over from a previous run");
  }

  /* ── the hash must not be reachable ───────────────────────── */
  const direct = await c.from("tw_mechanics").select("pin_hash").limit(1);
  truthy(direct.error, "anon cannot select pin_hash");

  const star = await c.from("tw_mechanics").select("*").limit(1);
  if (star.error) {
    ok("anon cannot select * from tw_mechanics either");
  } else {
    const cols = star.data.length ? Object.keys(star.data[0]) : [];
    truthy(!cols.includes("pin_hash"),
           `select * omits pin_hash${cols.length ? ` (returned: ${cols.join(", ")})` : " (no rows yet)"}`);
  }

  /* ── the table must be read-only from the app ─────────────── */
  const ins = await c.from("tw_mechanics")
    .insert({ email: "sneak@invalid", name: "Sneak" });
  truthy(ins.error, "anon cannot insert a mechanic directly");

  const upd = await c.from("tw_mechanics").update({ name: "Renamed" }).eq("email", EMAIL);
  truthy(upd.error, "anon cannot update a mechanic directly");

  /* ── registering ──────────────────────────────────────────── */
  let r = await rpc("tw_mechanic_register", { p_email: EMAIL, p_name: MARK, p_pin: "12" });
  is(r.ok, false, "a two digit PIN is refused");

  r = await rpc("tw_mechanic_register", { p_email: EMAIL, p_name: MARK, p_pin: PIN });
  is(r.ok, true, "a four digit PIN registers");

  r = await rpc("tw_mechanic_register", { p_email: EMAIL, p_name: MARK, p_pin: "9999" });
  is(r.ok, false, "registering the same email twice is refused");

  const row = await c.from("tw_mechanics").select("email,name,pin_set").eq("email", EMAIL).single();
  is(row.data.pin_set, true, "pin_set says a PIN exists without exposing it");

  /* ── verifying ────────────────────────────────────────────── */
  r = await rpc("tw_mechanic_verify_pin", { p_email: EMAIL, p_pin: PIN });
  is(r.ok, true, "the right PIN verifies");

  r = await rpc("tw_mechanic_verify_pin", { p_email: EMAIL, p_pin: "0000" });
  is(r.ok, false, "a wrong PIN does not");

  /* ── lockout ──────────────────────────────────────────────── */
  let locked = null;
  for (let i = 0; i < 5; i++) {
    locked = await rpc("tw_mechanic_verify_pin", { p_email: EMAIL, p_pin: "0001" });
  }
  is(locked.locked, true, "five wrong PINs locks the account");

  r = await rpc("tw_mechanic_verify_pin", { p_email: EMAIL, p_pin: PIN });
  is(r.ok, false, "and even the RIGHT PIN is refused while locked");

  /* ── changing ─────────────────────────────────────────────── */
  r = await rpc("tw_mechanic_change_pin", { p_email: EMAIL, p_old: PIN, p_new: "5555" });
  is(r.ok, false, "the PIN cannot be changed while locked out either");
} catch (e) {
  state.failed.push(`threw: ${e.message}`);
  console.log("  !!  threw: " + e.message);
} finally {
  cleanupOk = await cleanup(c, [
    {
      label: "test mechanic",
      /* The app cannot delete mechanics, by design — that is one of the
         properties tested above. tw_purge_test_mechanic is the narrow
         exception: it refuses any address that is not @invalid, so the
         suite can tidy up without a real mechanic becoming deletable. */
      run: async () => { await c.rpc("tw_purge_test_mechanic", { p_email: EMAIL }); },
      verify: async () => {
        /* id is granted; "*" is not, and would error into a false all-clear */
        const { count, error } = await c.from("tw_mechanics")
          .select("id", { count: "exact", head: true }).eq("email", EMAIL);
        return error ? null : (count || 0);
      },
      manual: `delete from tw_mechanics where email='${EMAIL}';`,
    },
  ]);
}

report(state, cleanupOk);
