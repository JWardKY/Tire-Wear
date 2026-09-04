/* Monday morning, 7:30 Eastern: everything still due out, whether or not
   it has been reported before. The walk-around alert is the news; this
   is the standing list, and it repeats deliberately — a tire nobody has
   changed should keep asking.

   Netlify schedules in UTC and does not follow daylight saving, so 7:30
   Eastern is 11:30 UTC for half the year and 12:30 for the other half.
   Rather than drift an hour twice a year, this runs at both and stops
   unless it really is the 7 o'clock hour in New York. */
import { runTireAlerts } from "./lib/alerts.mjs";

const easternHour = () =>
  Number(new Intl.DateTimeFormat("en-US", {
    timeZone: "America/New_York", hour: "numeric", hour12: false,
  }).format(new Date()));

export default async () => {
  const hour = easternHour();
  if (hour !== 7) {
    console.log(JSON.stringify({ skipped: `Eastern hour is ${hour}, not 7` }));
    return;
  }
  const result = await runTireAlerts({ mode: "digest" });
  console.log(JSON.stringify({ weeklyTireDigest: result }));
};

export const config = { schedule: "30 11,12 * * 1" };
