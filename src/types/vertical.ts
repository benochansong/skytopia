export type View3D = 'all' | 'active' | 'cutaway' | 'structure' | 'lower' | 'blueprint';
export type VerticalState = {
  version: 1;
  floor: number;
  view: View3D;
  example: 'A' | 'B' | 'C' | 'D' | 'E';
  builtColumns: number;
  builtBridges: number;
  emergencyCooldown: number;
};
export const freshVertical = (): VerticalState => ({
  version: 1,
  floor: 0,
  view: 'all',
  example: 'A',
  builtColumns: 0,
  builtBridges: 0,
  emergencyCooldown: 0,
});
