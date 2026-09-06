import React from "react";
import { C, FD, FM } from "./theme.js";
import { Btn, SectionLabel } from "./ui.jsx";

/* ── Help ─────────────────────────────────────────────────────────
   How to use this, written for the person holding the wrench.

   One page rather than sub-tabs, for two reasons. A mechanic looking
   something up wants to search the page, not guess which of six tabs it
   is under. And the shop wanted paper: the PRINT button here gives the
   whole guide as a handout, which sub-tabs would have cut into pieces.

   Everything on this page is a statement about how the app actually
   behaves. If a screen changes, this changes with it — an instruction
   sheet that is wrong is worse than none, because somebody follows it. */

const SECTIONS = [
  ["start", "Getting in"],
  ["day", "A normal day"],
  ["clocks", "The two clocks"],
  ["defects", "Defects"],
  ["orders", "Work orders"],
  ["tires", "Tires"],
  ["parts", "Parts"],
  ["stuck", "If you get stuck"],
];

export default function HelpSection() {
  const jump = (id) => {
    const el = document.getElementById(`help-${id}`);
    if (el) el.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  return (
    <div className="mx-auto w-full" style={{ maxWidth: 1400, padding: 16 }}>
      {/* Printing drops the app's chrome, so the handout needs its own
          heading or it comes out of the printer anonymous. */}
      <div className="print-only" style={{ display: "none", marginBottom: 18 }}>
        <div style={{ fontFamily: FD, fontSize: 24, fontWeight: 700, color: C.green900 }}>
          The Allen Company · Haul Division
        </div>
        <div style={{ fontFamily: FD, fontSize: 16, color: C.ink }}>
          Shop system — how to use it
        </div>
        <div style={{ fontSize: 12, color: C.muted, marginTop: 4 }}>
          allenhaul.netlify.app
        </div>
      </div>

      <div className="flex flex-wrap items-start justify-between" style={{ gap: 12 }}>
        <div style={{ maxWidth: 720 }}>
          <SectionLabel noMargin>How to use this</SectionLabel>
          <p style={{ fontSize: 14.5, lineHeight: 1.6, color: C.ink, margin: "8px 0 0" }}>
            Everything the shop does goes in here: your hours, the faults the drivers
            write up, the jobs somebody puts you on, the parts off the shelf and the
            tread on the tires. This page says how.
          </p>
          <p style={{ fontSize: 13.5, lineHeight: 1.6, color: C.muted, margin: "8px 0 0" }}>
            Nothing here can break anything. If a screen will not let you save, it
            tells you what is missing in orange — read that line and it will make
            sense.
          </p>
        </div>
        {/* Btn does not take a className, and changing a shared component
            for one button here is the wrong trade. */}
        <div className="no-print">
          <Btn tone="ghost" onClick={() => window.print()}>PRINT THIS</Btn>
        </div>
      </div>

      <div className="flex flex-wrap no-print" style={{ gap: 6, margin: "16px 0 4px" }}>
        {SECTIONS.map(([id, label]) => (
          <button key={id} onClick={() => jump(id)}
            style={{ fontFamily: FD, fontSize: 12.5, letterSpacing: "0.04em",
                     textTransform: "uppercase", padding: "5px 11px", borderRadius: 4,
                     cursor: "pointer", border: `1px solid ${C.line}`,
                     background: "#fff", color: C.ink }}>
            {label}
          </button>
        ))}
      </div>

      <Block id="start" title="Getting in">
        <Step n="1" head="Your email">
          The app asks for your Allen Company email, not a password. It goes on every
          reading you take, so the shop can tell whose gauge a number came from. It
          remembers you on that phone or tablet until somebody presses SWITCH USER at
          the top right.
        </Step>
        <Step n="2" head="Your PIN — four digits">
          Timecard is behind a PIN, because those are pay records and the tablet on the
          bench is not yours alone. First time in, go to <B>Timecard → My PIN</B> and
          set one. Pick something you will remember; nobody can look it up for you, it
          is stored scrambled.
        </Step>
        <Note>
          The PIN unlocks for <B>that browser tab only</B>. Close the tab and it locks
          again. That is deliberate — a tablet left on a bench should not still be
          showing your pay.
        </Note>
      </Block>

      <Block id="day" title="A normal day">
        <Step n="1" head="Clock in">
          <B>Timecard → Today → CLOCK IN.</B> This puts you on the shop board so
          everybody can see who is here. It does <B>not</B> book any hours — that comes
          next.
        </Step>
        <Step n="2" head="Pick up a job">
          <B>Timecard → My jobs.</B> Anything somebody has put you on is at the top
          under <i>Assigned to me</i>. Tap the card to see what it is, what has already
          been done on it, and any parts already issued to it.
        </Step>
        <Step n="3" head="Start it">
          <B>START IT</B> puts a running clock on your timecard with the truck and the
          work order number already filled in. Walk to the truck — the clock is already
          counting, which is right, because the walk is work.
        </Step>
        <Step n="4" head="Pull your parts as you go">
          On that same card there is a parts list. Put each part on as you take it off
          the shelf. If the number is in the system the stock count moves on its own.
          If it is not, type it anyway — it still gets recorded against the job.
        </Step>
        <Step n="5" head="Stop the clock">
          Press <B>Stop</B>. The hours fill themselves in from the clock, rounded to a
          quarter hour. You can type over them if the clock is wrong.
        </Step>
        <Step n="6" head="Fill in the rest">
          Pick a <B>cost code</B> — that is how the hours get charged out, and payroll
          needs it. Tick what kind of work it was, and write a line about what you
          found. The next person to open that truck reads it.
        </Step>
        <Step n="7" head="Say where you got to">
          If the card came from a job it asks one question: <B>Finished it</B> or
          <B> Not finished</B>. Finished closes the work order. Not finished asks why —
          waiting on parts, ran out of time, whatever it was — and the job stays open
          saying so, so tomorrow nobody thinks it was never touched.
        </Step>
        <Step n="8" head="Save, then clock out">
          <B>SAVE TIMECARD</B>, then <B>CLOCK OUT</B> at the top. Both answers to
          step 7 let you save and go home. Never leave hours off the books because a
          job is not finished.
        </Step>
        <Note tone="watch">
          Until you press <B>Save timecard</B>, everything on that form is only on your
          phone. It survives the phone going to sleep, but it is not in the system and
          nobody else can see it. Save before you leave.
        </Note>
      </Block>

      <Block id="clocks" title="The two clocks — this is the one people get wrong">
        <p style={p}>
          There are two, and they answer different questions.
        </p>
        <Two
          a={{
            head: "The shop clock",
            sub: "CLOCK IN / CLOCK OUT at the top of Today",
            body: "Says you are here. It is what the board shows and roughly what the day was. It does not say where the time went.",
          }}
          b={{
            head: "The job clock",
            sub: "Start / Stop on an equipment card",
            body: "Says which truck or which job the time went to. This is what gets charged out, and what makes a job's cost real.",
          }}
        />
        <p style={p}>
          Under the shop clock there is a line reading <B>Time accounted for</B> —
          something like <Mono>6.25 of 8.00 hrs</Mono>. That is the job clocks added up
          against the shop clock. A gap is not an error; sweeping the bay, a parts run
          or an hour waiting on a gearbox is real time. Put it on a card as shop time
          rather than leaving it in the gap.
        </p>
        <Note>
          Forgot to punch? Type over the <i>Clocked in</i> and <i>Clocked out</i> times.
          The clock only fills them in for you.
        </Note>
      </Block>

      <Block id="defects" title="Defects — what the drivers write up">
        <p style={p}>
          Every fault a driver puts on their inspection in Motive lands here overnight.
          You do not have to enter it. The list is the whole fleet, so the filters at
          the top matter: <B>Out of service</B> is the trucks that should not be moving.
        </p>
        <Step n="1" head="Take it">
          <B>I'LL TAKE IT</B> puts your name on it so two people do not start the same
          job. Only take what you are actually about to do.
        </Step>
        <Step n="2" head="Fix it, then mark it repaired">
          <B>MARK REPAIRED</B> asks who did it, how long it took, and what was done.
          Write the note properly — it is the record.
        </Step>
        <Step n="3" head="It goes back to Motive on its own">
          Marking it repaired sends the repair to the driver's inspection report with
          your name and your note on it. You do not have to go into Motive and do it
          again.
        </Step>
        <Note>
          It works the other way too. If somebody clears the fault inside the Motive app
          instead, it drops off this board on the next sync. You never handle it twice.
        </Note>
        <Note tone="watch">
          What this app does <B>not</B> do is sign the DVIR. A signature is a person's.
          Somebody still signs it in Motive.
        </Note>
      </Block>

      <Block id="orders" title="Work orders — numbered jobs">
        <p style={p}>
          A work order is a job with a number on it, so hours and parts have somewhere
          to land. There are two ways one appears.
        </p>
        <Two
          a={{
            head: "From a defect",
            sub: "NUMBER THE OPEN DEFECTS",
            body: "Gives every outstanding fault a number in one press. Safe to press twice — a fault never collects two numbers.",
          }}
          b={{
            head: "By hand",
            sub: "NEW WORK ORDER",
            body: "For work nobody wrote up: a scheduled swap, a rental, a customer's truck, or a shop job with no truck at all.",
          }}
        />
        <p style={p}>
          Put somebody on a job with the dropdown in the <i>Who is on it</i> column, and
          it shows up on their <B>My jobs</B> straight away. Tap the <B>WO number</B> to
          see the parts and hours on it with a running total.
        </p>
        <Note>
          Closing a work order is paperwork. It does not mark the truck repaired — that
          is the mechanic's statement, and it lives on the Defects tab.
        </Note>
      </Block>

      <Block id="tires" title="Tires">
        <p style={p}>
          Pick the truck on the Tires tab and you get its wheel positions. Two things go
          on from here.
        </p>
        <Step n="1" head="Mount tire">
          Put a tire on a position: brand, size, whether it is a recap, aluminum or steel
          wheel, and the odometer at the time. That odometer matters — the wear rate is
          worked out from how far the truck has run since.
        </Step>
        <Step n="2" head="Record tread">
          A walk-around. Type the depth on each wheel in 32nds. The app works out miles
          per 32nd from there and says which tires are due to come off.
        </Step>
        <Note>
          Mounting a whole truck? Save one wheel, then use the copy button to put the same
          tire on the other positions instead of typing it eight times.
        </Note>
        <Note tone="watch">
          Steer tires come off deeper than the rest. The app already knows; you do not
          have to remember two numbers.
        </Note>
      </Block>

      <Block id="parts" title="Parts">
        <p style={p}>
          The shelf is only right if it gets told. Two words cover almost everything:
          <B> Issue</B> takes parts off the shelf, <B>Receive</B> puts them on.
        </p>
        <p style={p}>
          The easiest way to issue is from the job — the parts list on your equipment
          card, or the <B>PARTS</B> button on a work order. Both fill in the work order
          and the truck for you, which beats typing a number and getting a digit wrong.
        </p>
        <Note>
          A part not in the catalog is not a problem. Type the number and it still gets
          recorded against the job — the shelf count just cannot move for something the
          system has never heard of.
        </Note>
        <Note>
          Counted a bin and it is wrong? <B>Count the shelf</B> sets it to what is
          actually there and records the difference. Do not fix a count by issuing
          parts nobody used.
        </Note>
      </Block>

      <Block id="stuck" title="If you get stuck">
        <Faq q="The Save button is greyed out.">
          There is an orange line next to it saying what is missing — usually a cost
          code, or a clock still running. Press Stop first, then save.
        </Faq>
        <Faq q="I put hours on the wrong truck.">
          Open the entry from the list under your timecard and change it. If it is
          already a day or two back, tell a supervisor rather than adding a second entry
          to cancel the first.
        </Faq>
        <Faq q="I forgot to clock in this morning.">
          Type over the <i>Clocked in</i> time. The punch is a convenience, not the
          record.
        </Faq>
        <Faq q="My phone went to sleep with the clock running.">
          It keeps counting. Come back and the card is where you left it. The browser
          will also warn you if you try to close the tab with a clock still going.
        </Faq>
        <Faq q="I cannot see the Supervisor tab / it asks for a password.">
          That one is not for the floor. Everything you need is on the other tabs.
        </Faq>
        <Faq q="Something is wrong, or the app is telling me something I do not believe.">
          Do not work around it. Tell Jason. A number nobody trusts is worse than no
          number, and if it is wrong it is worth fixing properly.
        </Faq>
      </Block>

      <p style={{ fontSize: 12.5, color: C.muted, lineHeight: 1.6, marginTop: 22,
                  maxWidth: 720 }}>
        Everything you enter has your name on it. That is not looking over your shoulder
        — it is so a question about a reading can go to the person who took it instead
        of to everybody.
      </p>
    </div>
  );
}

/* ── Bits ─────────────────────────────────────────────────────── */

const p = { fontSize: 14, lineHeight: 1.65, color: C.ink, margin: "0 0 12px", maxWidth: 780 };

function B({ children }) {
  return <b style={{ fontWeight: 700 }}>{children}</b>;
}

function Mono({ children }) {
  return <span style={{ fontFamily: FM, fontSize: 13 }}>{children}</span>;
}

/* Kept off a page break where the printer allows it: a numbered step
   split across two sheets is how somebody misses a step. */
function Block({ id, title, children }) {
  return (
    <section id={`help-${id}`} className="print-block"
      style={{ background: C.card, border: `1px solid ${C.line}`,
               borderLeft: `4px solid ${C.green700}`, borderRadius: 8,
               padding: "16px 18px 6px", marginTop: 14 }}>
      <h2 style={{ fontFamily: FD, fontSize: 19, fontWeight: 700, color: C.green900,
                   margin: "0 0 12px", lineHeight: 1.2 }}>
        {title}
      </h2>
      {children}
    </section>
  );
}

function Step({ n, head, children }) {
  return (
    <div className="flex print-block" style={{ gap: 12, marginBottom: 13 }}>
      <div style={{ fontFamily: FM, fontSize: 13, fontWeight: 700, color: "#fff",
                    background: C.green700, borderRadius: 999, width: 24, height: 24,
                    minWidth: 24, display: "flex", alignItems: "center",
                    justifyContent: "center", marginTop: 1 }}>
        {n}
      </div>
      <div style={{ maxWidth: 760 }}>
        <div style={{ fontFamily: FD, fontSize: 14.5, fontWeight: 700, color: C.green900 }}>
          {head}
        </div>
        <div style={{ fontSize: 13.5, lineHeight: 1.6, color: C.ink, marginTop: 2 }}>
          {children}
        </div>
      </div>
    </div>
  );
}

function Note({ tone = "muted", children }) {
  const edge = tone === "watch" ? C.watch : C.line;
  return (
    <div className="print-block"
      style={{ background: tone === "watch" ? "#FFFBEF" : C.paper,
               borderLeft: `3px solid ${edge}`, borderRadius: 4,
               padding: "9px 12px", margin: "0 0 12px", maxWidth: 780,
               fontSize: 13, lineHeight: 1.6, color: C.ink }}>
      {children}
    </div>
  );
}

function Two({ a, b }) {
  return (
    <div className="grid gap-3 print-block"
      style={{ gridTemplateColumns: "repeat(auto-fit,minmax(min(100%,300px),1fr))",
               marginBottom: 12 }}>
      {[a, b].map((x) => (
        <div key={x.head} style={{ border: `1px solid ${C.line}`, borderRadius: 6,
                                   padding: "11px 13px", background: C.paper }}>
          <div style={{ fontFamily: FD, fontSize: 15, fontWeight: 700, color: C.green900 }}>
            {x.head}
          </div>
          <div style={{ fontFamily: FM, fontSize: 11.5, color: C.muted, margin: "2px 0 5px" }}>
            {x.sub}
          </div>
          <div style={{ fontSize: 13, lineHeight: 1.55 }}>{x.body}</div>
        </div>
      ))}
    </div>
  );
}

function Faq({ q, children }) {
  return (
    <div className="print-block" style={{ marginBottom: 12, maxWidth: 780 }}>
      <div style={{ fontFamily: FD, fontSize: 14.5, fontWeight: 700, color: C.green900 }}>
        {q}
      </div>
      <div style={{ fontSize: 13.5, lineHeight: 1.6, color: C.ink, marginTop: 2 }}>
        {children}
      </div>
    </div>
  );
}
