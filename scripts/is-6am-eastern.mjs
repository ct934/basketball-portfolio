const hour = new Intl.DateTimeFormat("en-US", {
  timeZone: "America/New_York",
  hour: "2-digit",
  hourCycle: "h23"
}).format(new Date());

process.exitCode = hour === "06" ? 0 : 78;
