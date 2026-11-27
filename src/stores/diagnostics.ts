type Entry = { at: number; event: string; value?: string | number };
const entries: Entry[] = [];
/** Development-only, bounded in-memory trace. No requests, identifiers or persistent telemetry. */
export function diagnose(event: string, value?: string | number) {
  if (!import.meta.env.DEV) return;
  entries.push({ at: Math.round(performance.now()), event, value });
  if (entries.length > 300) entries.shift();
}
export function diagnostics() {
  return entries.slice();
}
