import { atFloor, floorOf } from '../grid';
import { STRUCTURE } from '../../data/rules';
import type { Building, Cell, EventKind, Game, Platform } from '../../types/game';
export function recordEvent(
  g: Game,
  kind: EventKind,
  target: string,
  cell: Cell,
  platforms: Platform[] = [],
  buildings: Building[] = [],
): Game {
  const event = {
    id: g.structure.nextEventId,
    time: g.elapsed,
    kind,
    target,
    cell: atFloor(cell.x, cell.z, floorOf(cell)),
    platforms,
    buildings,
  };
  const history = [...g.structure.events, event],
    firstFailure = history.find((e) => e.kind === 'edgeFailed' || e.kind === 'collapse');
  const events = history.slice(-STRUCTURE.maxEvents);
  // Keep the original cause even after many later events; the rest is a recent tail.
  if (firstFailure && !events.includes(firstFailure)) events[0] = firstFailure;
  return {
    ...g,
    structure: {
      ...g.structure,
      nextEventId: g.structure.nextEventId + 1,
      events,
    },
  };
}
