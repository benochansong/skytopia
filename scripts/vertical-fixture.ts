import { verticalBase, add } from '../src/game/vertical/scenarios';
import { DEFAULT_SETTINGS } from '../src/data/rules';
import { makePlatform } from '../src/game/stability/state';
import { atFloor } from '../src/game/grid';
import { reconcileResidents } from '../src/game/city/population';
export function verticalStressFixture() {
  let g = verticalBase(DEFAULT_SETTINGS);
  g = {
    ...g,
    buildings: [],
    platforms: [],
    nextId: 1,
    population: 80,
    city: { ...g.city, residents: {}, displaced: 80 },
    structure: { ...g.structure, grace: 60 },
    labPaused: false,
  };
  for (let y = 0; y < 4; y++)
    for (let x = -4; x <= 3; x++)
      for (let z = -4; z <= 3; z++) {
        g.platforms.push(
          makePlatform(
            atFloor(x, z, y),
            y ? 'metalDeck' : 'platform',
            g.nextId++,
            1,
            !y && x >= -3 && x <= 2 && z >= -3 && z <= 2,
          ),
        );
        if (x === 0 && z === 0) continue;
        if (z % 2 !== 0 || x === -4) add(g, 'road', x, z, y);
        else if (y < 3) {
          if (x === -3 && z === -4) add(g, 'stairs', x, z, y);
          else if (x === -2 && z === -4) add(g, 'verticalRelay', x, z, y);
          else if (y === 0 && x === -3 && z === -2) add(g, 'power', x, z, y);
          else add(g, 'industrialColumn', x, z, y, 'single');
        } else add(g, 'home', x, z, y);
      }
  return reconcileResidents(g);
}
