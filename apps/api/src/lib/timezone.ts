
export function resolveTimeZone(candidate?: string | null): string {
  const tz = (candidate || "").trim();
  if (!tz) return "UTC";
  try {
    Intl.DateTimeFormat(undefined, { timeZone: tz }).format(new Date());
    return tz;
  } catch {
    return "UTC";
  }
}

export function detectBrowserTimeZone(): string {
  try {
    return (
      Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC"
    );
  } catch {
    return "UTC";
  }
}
