import type { Building, Cell, Game, Platform } from '../../types/game';
export type City = Pick<Game, 'platforms' | 'buildings'> &
  Partial<Pick<Game, 'structure' | 'difficulty' | 'city' | 'population'>>;
export type Point3 = Cell & { y: number };
export type StructuralNode = {
  key: string;
  platform: Platform;
  mass: number;
  load: number;
  capacity: number;
  ratio: number;
  hp: number;
  maxHP: number;
  distance: number;
  component: number;
  supported: boolean;
};
export type StructuralEdge = {
  key: string;
  a: string;
  b: string;
  load: number;
  capacity: number;
  ratio: number;
  hp: number;
  maxHP: number;
  reinforcement: number;
};
export type LiftOutput = {
  id: number;
  cell: Cell;
  cells: string[];
  output: number;
  maximum: number;
  desired: number;
  factor: number;
  powered: boolean;
  connected: boolean;
};
export type StructuralReport = {
  mass: number;
  center: Point3;
  lift: number;
  liftMaximum: number;
  centerLift: Point3;
  torque: { x: number; z: number };
  tilt: { x: number; z: number };
  separation: number;
  liftScore: number;
  balanceScore: number;
  structureScore: number;
  overall: number;
  critical: 'lift' | 'balance' | 'core' | null;
  nodes: Map<string, StructuralNode>;
  edges: Map<string, StructuralEdge>;
  components: { keys: string[]; anchored: boolean; mass: number; lift: number }[];
  lifts: LiftOutput[];
  worst: {
    type: 'platform' | 'edge';
    id: string;
    cell: Cell;
    ratio: number;
    hp: number;
    maxHP: number;
    eta: number;
  } | null;
  damaged: number;
  disconnectedGroups: number;
  unsafeEdges: number;
};
export type Network = {
  roads: Set<string>;
  connectedIds: Set<number>;
  power: number;
  demand: number;
  capacity: number;
  poweredCapacity: number;
  disconnected: number;
  food: number;
  powerRatios: Map<number, number>;
  operational: Set<number>;
};
export const buildingHealth = (b: Building, max: number) =>
  Math.max(0, Math.min(1, b.durability / max));
