/* Sending mail as Allen, through Microsoft 365.

   The app has no mailbox of its own. This uses an Entra ID app
   registration with the Mail.Send application permission to send as one
   named mailbox — client credentials, no signed-in user, which is what
   lets a 5 AM cron job send anything at all.

   Ask IT to restrict that registration with an application access
   policy naming the sender mailbox. Without one, a Mail.Send
   application permission can send as ANY mailbox in the tenant, and
   this key sits in a Netlify environment variable.

   Four variables, all set in Netlify:
     GRAPH_TENANT_ID      the Allen tenant
     GRAPH_CLIENT_ID      the app registration
     GRAPH_CLIENT_SECRET  its secret
     GRAPH_SENDER         the mailbox to send as, e.g. haulshop@theallen.com

   Missing any of them is not an error. The callers check `configured()`
   and skip quietly, so the tire alerts can ship and sit dormant until
   IT hands the credentials over. */

const GRAPH = "https://graph.microsoft.com/v1.0";
const LOGIN = "https://login.microsoftonline.com";

export function configured() {
  return Boolean(
    process.env.GRAPH_TENANT_ID &&
    process.env.GRAPH_CLIENT_ID &&
    process.env.GRAPH_CLIENT_SECRET &&
    process.env.GRAPH_SENDER
  );
}

async function token() {
  const body = new URLSearchParams({
    client_id: process.env.GRAPH_CLIENT_ID,
    client_secret: process.env.GRAPH_CLIENT_SECRET,
    scope: "https://graph.microsoft.com/.default",
    grant_type: "client_credentials",
  });
  const r = await fetch(`${LOGIN}/${process.env.GRAPH_TENANT_ID}/oauth2/v2.0/token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
  });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) {
    /* Graph puts the useful part in error_description — "AADSTS7000215"
       and the like. Worth carrying through; the alternative is a bare
       401 and an afternoon. */
    throw new Error(
      `Microsoft would not issue a token: ${j.error_description || j.error || r.status}`);
  }
  return j.access_token;
}

/* to: array of addresses. Returns nothing on success and throws with
   whatever Graph said on failure, so the caller can log it against the
   run rather than swallowing it. */
export async function sendMail({ to, subject, html }) {
  if (!configured()) throw new Error("Graph mail is not configured.");
  const recipients = (to || []).filter(Boolean);
  if (!recipients.length) return { skipped: "no recipients" };

  const at = await token();
  const sender = process.env.GRAPH_SENDER;
  const r = await fetch(`${GRAPH}/users/${encodeURIComponent(sender)}/sendMail`, {
    method: "POST",
    headers: { Authorization: `Bearer ${at}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      message: {
        subject,
        body: { contentType: "HTML", content: html },
        toRecipients: recipients.map((a) => ({ emailAddress: { address: a } })),
      },
      /* Kept in the sender's Sent Items. If nobody ever gets an alert,
         the first question is whether it was sent at all, and this is
         where you look. */
      saveToSentItems: true,
    }),
  });
  if (!r.ok) {
    const t = await r.text().catch(() => "");
    throw new Error(`Graph refused the send (${r.status}): ${t.slice(0, 400)}`);
  }
  return { sent: recipients.length };
}
