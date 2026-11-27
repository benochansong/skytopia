import { useEffect, useState } from 'react';
import { Box3, Group, Mesh } from 'three';
import { modelFits } from './modelBounds';
import type { Kind } from '../types/game';
import { PHYSICAL } from '../data/rules';
export type ModelEntry = {
  path: string;
  scale: number;
  offset: [number, number, number];
  rotation: [number, number, number];
  pivot: 'base-center';
  castShadow: boolean;
  receiveShadow: boolean;
  lod?: string;
  materialSlots: string[];
  clips: string[];
  fallback: Kind;
};
// Local, self-authored glTF. Replace entries after checking licence and bounds.
export const MODEL_REGISTRY: Partial<Record<Kind, ModelEntry>> = {
  ballast: {
    path: '/models/ballast.gltf',
    scale: 1,
    offset: [0, 0, 0],
    rotation: [0, 0, 0],
    pivot: 'base-center',
    castShadow: true,
    receiveShadow: true,
    materialSlots: ['slate', 'brass'],
    clips: [],
    fallback: 'ballast',
  },
};
const cache = new Map<string, Promise<Group | null>>();
const states = new Map<string, 'loading' | 'loaded' | 'fallback'>();
export const modelStatus = (path: string) => states.get(path);
async function loadModel(kind: Kind, entry: ModelEntry) {
  if (!cache.has(entry.path)) {
    states.set(entry.path, 'loading');
    cache.set(
      entry.path,
      (async () => {
        try {
          const { GLTFLoader } = await import('three/addons/loaders/GLTFLoader.js');
          const result = await new GLTFLoader().loadAsync(entry.path);
          const root = new Group();
          root.add(result.scene);
          result.scene.scale.setScalar(entry.scale);
          result.scene.position.fromArray(entry.offset);
          result.scene.rotation.fromArray([...entry.rotation, 'XYZ']);
          root.updateMatrixWorld(true);
          const bounds = new Box3().setFromObject(root);
          if (!modelFits(bounds, PHYSICAL[kind].height))
            throw new Error('Model outside logical footprint');
          root.traverse((node) => {
            if (node instanceof Mesh) {
              node.castShadow = entry.castShadow;
              node.receiveShadow = entry.receiveShadow;
            }
          });
          states.set(entry.path, 'loaded');
          return root;
        } catch {
          states.set(entry.path, 'fallback');
          return null;
        }
      })(),
    );
  }
  return cache.get(entry.path)!;
}
export function useFacilityAsset(kind: Kind) {
  const entry = MODEL_REGISTRY[kind],
    [model, setModel] = useState<Group | null>(null);
  useEffect(() => {
    let active = true;
    setModel(null);
    if (entry)
      void loadModel(kind, entry).then((loaded) => {
        if (active) setModel(loaded?.clone(true) ?? null);
      });
    return () => {
      active = false;
    };
  }, [kind, entry]);
  return model;
}
