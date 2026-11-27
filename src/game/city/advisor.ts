import type { CityReport } from '../../types/city';
export type Advice = CityReport['advice'][number];
export function foodRunway(pools: { stock: number; production: number; consumption: number }[]) {
  return Math.min(
    Infinity,
    ...pools
      .filter((p) => p.consumption > 0)
      .map((p) =>
        p.production >= p.consumption ? Infinity : p.stock / (p.consumption - p.production),
      ),
  );
}
/** Acknowledgement can quiet ordinary advice, never remove a current fatal hazard. */
export function selectAdvice(advice: Advice[], dismissed: Record<string, number>, elapsed: number) {
  const unique = new Map<string, Advice>();
  for (const a of advice)
    if (!unique.has(a.id) || unique.get(a.id)!.priority < a.priority) unique.set(a.id, a);
  const visible = [...unique.values()]
    .filter((a) => a.fatal || (dismissed[a.id] ?? -Infinity) + 30 <= elapsed)
    .sort(
      (a, b) =>
        Number(!!b.fatal) - Number(!!a.fatal) ||
        b.priority - a.priority ||
        a.id.localeCompare(b.id),
    );
  const fatal = visible.filter((a) => a.fatal);
  return [...fatal, ...visible.filter((a) => !a.fatal).slice(0, Math.max(0, 3 - fatal.length))];
}
