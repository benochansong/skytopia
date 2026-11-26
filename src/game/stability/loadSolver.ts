// A grounded graph Laplacian shares load over every intact path, including loops.
// Equal connection stiffness is intentional; material and health set failure capacity.
// Conjugate gradients are deterministic and bounded independently of render frames.
export function solveLoads(
  keys: string[],
  adjacency: Map<string, string[]>,
  roots: string[],
  local: Map<string, number>,
) {
  const fixed = new Set(roots),
    free = keys.filter((k) => !fixed.has(k)),
    index = new Map(free.map((k, i) => [k, i]));
  const potential = new Map(keys.map((k) => [k, 0]));
  if (!roots.length || !free.length) return potential;
  const multiply = (v: number[]) =>
    free.map(
      (k, i) =>
        adjacency.get(k)!.length * v[i] -
        adjacency.get(k)!.reduce((s, n) => s + (index.has(n) ? v[index.get(n)!] : 0), 0),
    );
  const dot = (a: number[], b: number[]) => a.reduce((s, v, i) => s + v * b[i], 0);
  const x = free.map(() => 0);
  let r = free.map((k) => local.get(k) ?? 0),
    p = [...r],
    rr = dot(r, r);
  for (let iteration = 0; iteration < Math.min(128, free.length) && rr > 1e-12; iteration++) {
    const ap = multiply(p),
      denominator = dot(p, ap);
    if (denominator <= 1e-15) break;
    const alpha = rr / denominator;
    for (let i = 0; i < x.length; i++) x[i] += alpha * p[i];
    r = r.map((v, i) => v - alpha * ap[i]);
    const next = dot(r, r),
      beta = next / rr;
    p = r.map((v, i) => v + beta * p[i]);
    rr = next;
  }
  free.forEach((k, i) => potential.set(k, Math.max(0, x[i])));
  return potential;
}
