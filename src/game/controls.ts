import type { Cell, Game } from '../types/game';
import { validatePlacement } from './placement';
import { RULES } from '../data/rules';

/** Bounded, deterministic assist. Never changes floor, footprint, supply or validity rules. */
export function assistedCursor(g: Game, wanted: Cell): Cell {
  if (validatePlacement({ ...g, cursor: wanted }).valid) return wanted;
  const dx = Math.sign(wanted.x - g.cursor.x),
    dz = Math.sign(wanted.z - g.cursor.z);
  const offsets = [
    { x: dx, z: dz },
    { x: 1, z: 0 },
    { x: -1, z: 0 },
    { x: 0, z: 1 },
    { x: 0, z: -1 },
  ];
  for (const d of offsets) {
    if (Math.abs(d.x) + Math.abs(d.z) !== 1) continue;
    const c = { ...wanted, x: wanted.x + d.x, z: wanted.z + d.z };
    if (c.x < RULES.min || c.x > RULES.max || c.z < RULES.min || c.z > RULES.max) continue;
    const v = validatePlacement({ ...g, cursor: c });
    if (v.valid && v.risk < 2) return c;
  }
  return wanted;
}

/** A held key has at most one repeat per poll; long stalls never create a burst. */
export class KeyRepeater {
  private keys = new Map<string, number>();
  press(code: string, now: number, delay: number) {
    if (this.keys.has(code)) return false;
    this.keys.set(code, now + delay);
    return true;
  }
  release(code: string) {
    this.keys.delete(code);
  }
  clear() {
    this.keys.clear();
  }
  poll(now: number, interval: number): string[] {
    const due: string[] = [];
    for (const [code, at] of this.keys)
      if (now >= at) {
        due.push(code);
        this.keys.set(code, now + interval);
      }
    return due;
  }
}
