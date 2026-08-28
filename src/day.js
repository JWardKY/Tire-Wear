/* The shop's date, not the browser's and not UTC.

   tw_shift_days stamps a shift's work_date in America/New_York, and
   payroll days are Eastern days. Taking the UTC date instead handed a
   mechanic on an evening shift tomorrow's date: they punched in, the
   shift card looked for the shift under the wrong day, and it read
   back "Not clocked in" while their clock was running.

   Its own module rather than ui.jsx so the test scripts, which Node
   runs without a JSX loader, can hold the app to the same day. */
export const todayISO = () =>
  new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/New_York",
    year: "numeric", month: "2-digit", day: "2-digit",
  }).format(new Date());
