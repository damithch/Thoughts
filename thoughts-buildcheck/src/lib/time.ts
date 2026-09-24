const COLOMBO_TIME_ZONE = "Asia/Colombo";
const COLOMBO_UTC_OFFSET = "+05:30";

function getFormatter(
  options: Intl.DateTimeFormatOptions,
  locale = "en-CA",
) {
  return new Intl.DateTimeFormat(locale, {
    timeZone: COLOMBO_TIME_ZONE,
    ...options,
  });
}

function getParts(value: Date | string) {
  const date = typeof value === "string" ? new Date(value) : value;
  const parts = getFormatter(
    {
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hour12: false,
    },
  ).formatToParts(date);

  const map = Object.fromEntries(
    parts
      .filter((part) => part.type !== "literal")
      .map((part) => [part.type, part.value]),
  ) as Record<string, string>;

  return {
    year: map.year,
    month: map.month,
    day: map.day,
    hour: map.hour,
    minute: map.minute,
    second: map.second,
  };
}

export function getCurrentColomboDate() {
  const { year, month, day } = getParts(new Date());

  return `${year}-${month}-${day}`;
}

export function getCurrentColomboMonth() {
  const { year, month } = getParts(new Date());

  return `${year}-${month}`;
}

export function shiftColomboDate(date: string, deltaDays: number) {
  const [year, month, day] = date.split("-").map(Number);
  const value = new Date(Date.UTC(year, month - 1, day + deltaDays));

  return `${value.getUTCFullYear()}-${String(value.getUTCMonth() + 1).padStart(2, "0")}-${String(
    value.getUTCDate(),
  ).padStart(2, "0")}`;
}

export function toColomboDate(value: Date | string) {
  return getFormatter(
    {
      year: "numeric",
      month: "short",
      day: "numeric",
    },
    "en-US",
  ).format(typeof value === "string" ? new Date(value) : value);
}

export function toColomboDateTime(value: Date | string) {
  return getFormatter(
    {
      year: "numeric",
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
      hour12: true,
    },
    "en-US",
  ).format(typeof value === "string" ? new Date(value) : value);
}

export function toColomboExportParts(value: Date | string) {
  const date = typeof value === "string" ? new Date(value) : value;
  const { year, month, day, hour, minute, second } = getParts(date);

  return {
    isoUtc: date.toISOString(),
    localIso: `${year}-${month}-${day}T${hour}:${minute}:${second}${COLOMBO_UTC_OFFSET}`,
    date: `${year}-${month}-${day}`,
    time: `${hour}:${minute}:${second}`,
  };
}

export function formatColomboDateLabel(date: string) {
  return new Date(`${date}T00:00:00Z`).toLocaleDateString("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
    timeZone: "UTC",
  });
}
