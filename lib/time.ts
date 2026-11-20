const SOFIA = "Europe/Sofia";

export function sofiaClockParts(now: Date) {
  const fmt = new Intl.DateTimeFormat("en-GB", {
    timeZone: SOFIA,
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  });
  const parts = Object.fromEntries(fmt.formatToParts(now).map((part) => [part.type, part.value]));
  let hour = Number(parts.hour);
  if (hour === 24) hour = 0;
  return {
    hour,
    minute: Number(parts.minute),
    second: Number(parts.second),
  };
}

/** UTC millis of 00:00:00 in Europe/Sofia for the Sofia calendar day that contains `now`. */
export function startOfSofiaDay(now = new Date()): number {
  const { hour, minute, second } = sofiaClockParts(now);
  const ms = now.getMilliseconds();
  return now.getTime() - ((hour * 60 + minute) * 60 + second) * 1000 - ms;
}

export function formatSofiaTime(ms: number): string {
  return new Intl.DateTimeFormat("en-GB", {
    timeZone: SOFIA,
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  }).format(new Date(ms));
}

export function formatSofiaStamp(ms: number): string {
  return new Intl.DateTimeFormat("en-GB", {
    timeZone: SOFIA,
    month: "short",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).format(new Date(ms));
}
