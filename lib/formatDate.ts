// Date formatting shared between server and client renders. `toLocaleString()`
// with no arguments uses the runtime's default locale/timezone, which is the
// server process's locale on the server and the browser's on the client —
// when those differ (as they do here: server defaults to en-US, browsers
// default to the OS locale, e.g. es-MX), React sees mismatched text between
// SSR and hydration and throws. Pinning locale + timeZone explicitly makes
// both sides always produce the identical string.
const LOCALE = "es-MX";
const TIME_ZONE = "America/Mexico_City";

export function formatDateTime(value: string | Date): string {
  return new Date(value).toLocaleString(LOCALE, { timeZone: TIME_ZONE });
}

export function formatDate(value: string | Date): string {
  return new Date(value).toLocaleDateString(LOCALE, { timeZone: TIME_ZONE });
}
