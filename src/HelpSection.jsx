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
  ["approval", "Getting approved"],
  ["clocks", "The two clocks"],
  ["missed", "Forgot to punch"],
  ["defects", "Defects"],
  ["orders", "Work orders"],
  ["tireedit", "Fixing a tire you keyed wrong"],
  ["move", "Moving a tire to another wheel"],
  ["tread", "A reading that cannot be right"],
  ["duals", "Duals that do not match"],
  ["truck", "One truck's file"],
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
          <B>Timecard → My jobs.</B> Anything somebody has put you on — and anything you
          claimed yourself on the Defects tab — is at the top under <i>Assigned to me</i>.
        </Step>
        <Step n="3" head="Tap it to start">
          Tapping the card puts a running clock on your timecard with the truck and the
          work order number already filled in. One tap. Walk to the truck — the clock is
          already counting, which is right, because the walk is work.
          <div style={{ marginTop: 3 }}>
            The small <i>what is on it</i> link at the bottom of the card is the other
            question: what has already been done, and what parts have gone on.
          </div>
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

      <Block id="approval" title="Your card gets approved before payroll sees it">
        <p style={p}>
          Once your day is saved, a supervisor looks at the card and approves it. Payroll
          does not go out until every card for the week has been approved, so a card
          nobody can approve holds up everybody.
        </p>
        <Note tone="watch">
          Two things stop a card being approved: <B>still being on the clock</B>, and
          <B> hours with no cost code on them</B>. Both are yours to sort — clock out at
          the end of the day, and make sure every line has a code.
        </Note>
        <Note>
          If your card gets changed after it was approved, the approval drops off and it
          goes back in front of a supervisor. Nothing is lost; it just gets looked at
          again, which is the point.
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
          Forgot to punch? Type over the <i>Clocked in</i> and <i>Clocked out</i> times —
          the clock only fills them in for you. If you forgot a whole day, see{" "}
          <B>Forgot to punch</B> below.
        </Note>
        <Note tone="watch">
          Once you have clocked out, anything left over shows a <B>Put those hours on a
          shop</B> box. Pick the shop you were at, say roughly what you were doing, and
          book it. That is how sweeping the bay or waiting on parts gets paid for — and a
          card with hours nobody has charged cannot be approved, so it holds up payroll.
        </Note>
      </Block>

      <Block id="missed" title="Forgot to punch — fixing a timecard">
        <p style={p}>
          It happens. You clock in at six, the day gets away from you, and you go home
          without clocking out — so the clock keeps running all night. Nothing is
          broken and nobody has to redo anything. There are three places it can be
          put right, and they all do the same thing.
        </p>

        <Step n="1" head="The app tells you the next morning">
          Open <B>Timecard</B>. If a punch was left open on an earlier day, an orange
          box sits at the top of your card: <i>You are still clocked in from</i> that
          day, with the time you punched in. Type the time you actually left, press{" "}
          <B>FIX IT</B>, and it is done. You do not have to go looking for yesterday —
          the box finds you.
        </Step>

        <Step n="2" head="Or open that day and type over the times">
          Change the date at the top of Timecard to the day in question. Under the
          clock are three boxes — <i>Clocked in</i>, <i>Clocked out</i> and{" "}
          <i>Lunch / breaks</i>. Type over whichever is wrong. It saves when you click
          away from the box.
        </Step>

        <Step n="3" head="Or ask a supervisor">
          A supervisor can do it for you from <B>Supervisor → Timecards</B>. They find
          your day, press <B>OPEN</B>, and the punches at the top of that window have
          the same three boxes. They can also put the punches in for a day you never
          clocked in on at all.
        </Step>

        <p style={p}>
          There is a fourth way, for a supervisor standing at the board. On <B>NOW</B>,
          anybody still on the clock from a previous day is marked in orange with a{" "}
          <B>CLOSE IT</B> button. It asks what time they actually left and shows what
          that works out to before saving — it does not just stop the clock at the
          moment the button is pressed.
        </p>

        <Note>
          Fixing the clock does <B>not</B> book any hours. The clock says you were
          here; the cards below say where the time went, and they are still yours to
          fill in for that day.
        </Note>

        <Note tone="watch">
          Every change to a punch is written down with the name of whoever made it and
          what the times were before — yours if you fixed your own, the supervisor's if
          they did. That is not suspicion, it is the same rule as everything else
          touching pay. It shows up under <B>Supervisor → Work log</B> as{" "}
          <i>Punch corrected</i>.
        </Note>

        <Note tone="watch">
          If a card for that day was already approved, correcting the punch takes the
          approval off and a supervisor has to look at it again. That is on purpose —
          a signature over numbers that moved afterwards is not a signature.
        </Note>

        <p style={p}>
          Two things it will refuse, both because they are almost always a typo. A
          clock-out time that <B>has not happened yet</B>, and a punch that works out
          to <B>more than eighteen hours</B>. If a shift genuinely ran that long, put
          it in as two punches with the break in between.
        </p>
      </Block>

      <Block id="defects" title="Defects — what the drivers write up">
        <p style={p}>
          Every fault a driver puts on their inspection in Motive lands here overnight.
          You do not have to enter it. The list is the whole fleet, so the filters at
          the top matter: <B>Major defect</B> is the ones a driver typed as major on
          their DVIR — the faults that come before everything else.
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
          It does <B>not</B> say a truck is out of service. That phrase means a roadside
          inspector's order, and nothing here is one — all the app knows is how the
          driver typed the defect in Motive. A fault typed <B>major</B> still comes top
          of the list and still colours red, because it is the one to do first. Whether
          the truck rolls is a person's call, not the app's.
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
          it shows up on their <B>My jobs</B> straight away. A job can take as many
          people as it needs — pick another name and they go on beside the first,
          each with an <b>×</b> to take them back off. Tap the <B>WO number</B> to
          see the parts and hours on it with a running total.
        </p>
        <Note>
          Closing a work order is paperwork. It does not mark the truck repaired — that
          is the mechanic's statement, and it lives on the Defects tab.
        </Note>
      </Block>

      <Block id="tireedit" title="Fixing a tire you keyed wrong">
        <p style={p}>
          Everything about a tire is set when it goes on — brand, model, size, the
          wheel it is on, the odometer and tread it started at. Get one wrong and it
          used to stay wrong: there is no delete, so a typo lived as long as the tire.
        </p>
        <Step n="1" head="Open the tire and press EDIT THESE DETAILS">
          Tap the tire on the diagram or its position in the table. The link is at the
          top right of the window that opens.
        </Step>
        <Step n="2" head="Change what is wrong, save">
          Brand, model, size, virgin or retread, wheel material, casing number, cost —
          and the wheel position, for a tire keyed onto the wrong one. Only free wheels
          on that truck are offered.
        </Step>
        <Note tone="watch">
          The three boxes under <B>When it went on</B> are not cosmetic. The mount
          odometer and mount tread are the first point the wear is measured from, so
          changing them changes the miles per 32nd, the miles left and the cost per
          mile. The screen tells you when you touch them.
        </Note>
        <Note>
          This corrects the <i>record</i>. Two things it is not for. Taking the tire off
          the truck is <B>PULL THIS TIRE OFF</B>. Putting it on a different truck is a
          pull and then a mount, so the miles land on the right one — the same goes for
          a rotation.
        </Note>
        <Note tone="watch">
          A correction is written down with your name on it and what the value used to
          be, under <B>Supervisor → Work log</B> as <i>Tire details corrected</i>. Tires
          going on and coming off show on their own in the history and on the truck's
          file, so you do not have to note those anywhere.
        </Note>
      </Block>

      <Block id="move" title="Moving a tire to another wheel">
        <p style={p}>
          Open the tire from the truck diagram and press <i>Move to another wheel</i>. Pick
          where it is going, check the date, and press the button. If there is already a
          tire on the wheel you picked, the two swap — that one comes back to where the
          first one was. Nothing gets lost and nothing gets pulled off the truck.
        </p>
        <p style={p}>
          The list shows every wheel on the truck with what is on it and how deep it is,
          so you can see which way round to put them before you commit. It tells you what
          it is about to do in plain words first: <i>4RO (14/32) and 4LO (11/32) trade
          places</i>.
        </p>
        <p style={p}>
          The tire keeps everything — its readings, its mount date, its mount tread — so
          the wear rate carries straight on. It is the same casing on a different wheel.
        </p>
        <p style={p}>
          Moving a tire on or off the steer axle is flagged, because a steer tire is
          pulled at a different depth from the rest. The tread does not change but the
          status might.
        </p>
        <p style={p}>
          <b>This is not the same as fixing a typo.</b> If the tire was never on that
          wheel and somebody keyed it wrong, use <i>Edit these details</i> instead — that
          one says it was always on the new wheel. <i>Move to another wheel</i> says it
          was on the old one until today. Both are written down, and they read
          differently in the truck's history.
        </p>
      </Block>

      <Block id="tread" title="A reading that cannot be right">
        <p style={p}>
          Tread only ever goes down. If you enter a depth deeper than the same tire
          measured before, the screen stops you at the box and says what it read last
          time and when. Check the wheel and check the gauge — it is easy to type 14
          on 4RO when you are looking at 4RI.
        </p>
        <p style={p}>
          If you are sure of your reading, then the <i>older</i> figure is the wrong one.
          Press Save again and it will take it. Then fix the old number: a past reading
          from the tire's dialog, or the mount depth under <i>Edit these details</i>.
        </p>
        <p style={p}>
          A mount depth keyed too shallow is the one that does damage quietly. Everything
          is measured from it, so a tire mounted at 10/32 that really went on at 15/32
          never shows any wear at all — and the miles-per-32nd column sits blank as
          though nobody ever gauged it.
        </p>
        <p style={p}>
          That column now says why it is blank instead of just showing a dash:
          <i>not measured yet</i>, <i>no miles since it went on</i>, <i>no wear measured
          in 4,138 mi</i>, or <i>reads 4/32 deeper than it did</i>. The last two mean
          go and gauge the wheel again.
        </p>
        <p style={p}>
          A difference of one 32nd is ignored. That is where you put the gauge, not a
          wrong number, and a flag that fires on it is one everybody learns to ignore.
        </p>
      </Block>

      <Block id="duals" title="Duals that do not match">
        <p style={p}>
          Two tires on the same end of an axle carry the load together, and they only
          share it if they are close to the same size. Put a 27/32 beside a 15/32 and
          the deep one takes the weight, runs hot and scrubs — and both come off early.
          So the shop buys two tires instead of none.
        </p>
        <p style={p}>
          The app watches for it on its own. Anything more than <Mono>4/32</Mono> apart
          on one end of an axle is flagged:
        </p>
        <Step n="1" head="On the list, before you open anything">
          A truck with a bad pair shows in <B>Needs attention</B> on the Tires screen and
          carries an <i>odd pair</i> note in the list down the left. You do not have to
          open trucks looking for it.
        </Step>
        <Step n="2" head="On the truck">
          An orange box above the diagram names the end, how far apart it is, and which
          wheel is which — <Mono>4R — 12/32 apart · 4RO at 15/32 beside 4RI at 27/32</Mono>.
          Both wheels are ringed on the diagram so there is no hunting, and each row in
          the wheel positions table says how far off its partner it is.
        </Step>
        <Step n="3" head="On the truck's file">
          It is also under <B>Right now</B> on the <B>TRUCK FILE</B> page, with the rest
          of what is outstanding on that unit.
        </Step>
        <Note>
          A pair is only checked when <B>both</B> tires have a reading. Half a
          walk-around never flags anything — a flag that fires on every truck somebody
          has started measuring is one people learn to scroll past.
        </Note>
        <Note tone="watch">
          4/32 is the usual figure and it is a setting, not a rule baked in.
          Tires → Settings changes it for everybody. Set it to 0 and any difference at
          all is flagged.
        </Note>
      </Block>

      <Block id="truck" title="One truck's file — everything about a unit">
        <p style={p}>
          <B>TRUCK FILE</B> answers the question that used to mean opening five tabs:
          what has been done to this thing. Type a truck number and the whole file comes
          up on one page.
        </p>
        <Step n="1" head="Type the number">
          Any part of it. <Mono>881</Mono> finds DT-881, and so do <Mono>dt881</Mono> and{" "}
          <Mono>DT 881</Mono> — you do not have to remember whether it is a DT or an HT.
          If two trucks match, the shorter number is offered first.
        </Step>
        <Step n="2" head="Read it top to bottom">
          Across the top: the odometer, whether anything major is open on it, and the totals —
          hours booked to it, who has worked on it, services, defects repaired, parts,
          tires. Then <B>Right now</B> (open defects, open jobs, service due),{" "}
          <B>Mechanic time</B>, <B>Tires</B> on it and come off it, <B>Services</B>,{" "}
          <B>Parts</B>, and <B>Everything</B> in the order it happened.
        </Step>
        <Step n="3" head="Narrow it to a period, or print it">
          <B>From</B> and <B>To</B> narrow the hours, parts, services and the timeline —
          useful for "what did this truck cost us last quarter". <B>PRINT</B> gives the
          file as a sheet; <B>CSV</B> gives the lot as one spreadsheet, every section
          under its own heading.
        </Step>
        <Note>
          The dates never touch what is on the truck <i>now</i>. Tires, open defects and
          service due are always current, whatever range is set — a filter that could
          hide an out-of-service defect is a filter that sends somebody out on a bad
          truck.
        </Note>
        <Note tone="watch">
          Nothing on this page changes anything. It is a report. Fixing what it shows you
          is done where the thing lives — the defect on Defects, the hours on a timecard,
          the tire under Tires.
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
        {/* A tablet on shop wifi at the back of the building, or on cell data
            out at Clover Bottom, drops a request now and then. The app cannot
            stop that happening — it can only stop it reading like a crash. */}
        <Faq q='It says "That did not reach the server".'>
          Your tablet lost its signal for a second and the save never got out. Nothing
          is broken. Reload the page — pull down on it, or press the refresh arrow —
          and look at the truck. If what you were saving is not there, do it again.
          Usually it will not be — the message never left the tablet — but reloading
          is how you know instead of guess.
        </Faq>
        <Faq q='It says "Could not reach the server".'>
          Same thing on the way in: the screen could not load. Check you still have
          wifi or bars, then try again. If the whole shop is out, it is the internet,
          not the app.
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
