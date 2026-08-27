/* The lock on the front door.

   This has to run at the edge, before anything is served, because the
   page itself carries the Supabase key. A password box inside the React
   app would stop nobody: view source, take the key, query the database
   directly. Gating here means an unauthenticated visitor never receives
   the bundle at all.

   One shared password, which is what was asked for. It is not identity —
   the email box still only says who you are, and the PIN on the timecard
   tab is the thing that actually proves it. */

const COOKIE = "allenhaul_gate";
const DAYS = 30;

/* The cookie is an HMAC of a fixed phrase keyed by the password, so it
   cannot be forged without knowing the password, and changing the
   password invalidates every cookie already issued. Nothing is stored
   server side. */
async function tokenFor(password) {
  const key = await crypto.subtle.importKey(
    "raw", new TextEncoder().encode(password),
    { name: "HMAC", hash: "SHA-256" }, false, ["sign"]
  );
  const sig = await crypto.subtle.sign(
    "HMAC", key, new TextEncoder().encode("allen-haul-gate-v1")
  );
  return btoa(String.fromCharCode(...new Uint8Array(sig)))
    .replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

/* Compare without letting the time taken give the answer away. */
function sameString(a, b) {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

const page = (msg) => `<!doctype html>
<html lang="en"><head><meta charset="utf-8" />
<meta name="viewport" content="width=device-width,initial-scale=1" />
<title>Allen Haul</title>
<style>
  :root { color-scheme: light dark; }
  body { margin:0; min-height:100vh; display:grid; place-items:center;
         background:#11161c; color:#e8edf3;
         font:16px/1.5 "Barlow","Helvetica Neue",Arial,sans-serif; }
  form { width:min(92vw,340px); text-align:center; }
  .mark { font-weight:700; letter-spacing:.18em; font-size:13px;
          color:#8b98a8; text-transform:uppercase; margin-bottom:28px; }
  h1 { font-size:20px; font-weight:600; margin:0 0 20px; }
  input { width:100%; box-sizing:border-box; padding:13px 14px; font-size:16px;
          background:#1b222b; color:#e8edf3; border:1px solid #2c3642;
          border-radius:6px; }
  input:focus { outline:2px solid #d24b16; outline-offset:1px; }
  button { width:100%; margin-top:12px; padding:13px; font-size:15px;
           font-weight:600; background:#d24b16; color:#fff; border:0;
           border-radius:6px; cursor:pointer; }
  .err { margin-top:14px; color:#ff9d7a; font-size:14px; min-height:20px; }
</style></head><body>
<form method="POST">
  <div class="mark">The Allen Company &middot; Haul Division</div>
  <h1>Shop sign-in</h1>
  <input type="password" name="password" placeholder="Password"
         autofocus autocomplete="current-password" aria-label="Password" />
  <button type="submit">Enter</button>
  <div class="err">${msg}</div>
</form></body></html>`;

export default async function gate(request, context) {
  const expected = Netlify.env.get("SITE_PASSWORD");
  /* No password configured means no lock. Say so in a header rather than
     failing shut, so a misconfiguration cannot lock the shop out of its
     own tools mid-shift. */
  if (!expected) {
    const res = await context.next();
    res.headers.set("x-gate", "off-no-password-set");
    return res;
  }

  const good = await tokenFor(expected);
  const cookies = request.headers.get("cookie") || "";
  const held = (cookies.match(/(?:^|;\s*)allenhaul_gate=([^;]+)/) || [])[1];
  if (held && sameString(held, good)) return context.next();

  if (request.method === "POST") {
    const form = await request.formData().catch(() => null);
    const given = form?.get("password") ?? "";
    if (typeof given === "string" && sameString(given, expected)) {
      return new Response(null, {
        status: 303,
        headers: {
          location: new URL(request.url).pathname,
          "set-cookie":
            `${COOKIE}=${good}; Path=/; Max-Age=${DAYS * 86400}; ` +
            `HttpOnly; Secure; SameSite=Lax`,
        },
      });
    }
    return new Response(page("That is not the password."), {
      status: 401,
      headers: { "content-type": "text/html; charset=utf-8" },
    });
  }

  return new Response(page(""), {
    status: 401,
    headers: {
      "content-type": "text/html; charset=utf-8",
      "cache-control": "no-store",
    },
  });
}

export const config = {
  path: "/*",
  /* The sync endpoints carry their own token and are called by machines,
     not people, so they must not be handed a login page. */
  excludedPath: ["/.netlify/functions/*", "/assets/*.woff2"],
};
