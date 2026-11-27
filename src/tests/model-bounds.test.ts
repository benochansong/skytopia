import { expect, it } from 'vitest';
import { Box3, Vector3 } from 'three';
import { modelFits } from '../scene/modelBounds';
it('rejects a small model shifted outside its tile and accepts a centered model', () => {
  expect(modelFits(new Box3(new Vector3(-0.4, 0, -0.4), new Vector3(0.4, 0.8, 0.4)), 1)).toBe(true);
  expect(modelFits(new Box3(new Vector3(10, 0, 10), new Vector3(10.8, 0.8, 10.8)), 1)).toBe(false);
  expect(modelFits(new Box3(new Vector3(-0.4, 0, -0.4), new Vector3(0.4, 1.1, 0.4)), 1)).toBe(
    false,
  );
  expect(modelFits(new Box3(), 1)).toBe(false);
});
