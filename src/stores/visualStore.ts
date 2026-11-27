import { create } from 'zustand';
import type { PhotoPreset } from '../scene/art';
// Transient presentation state: deliberately absent from saves and network commands.
export const useVisual = create<{
  preset: PhotoPreset;
  clouds: number;
  captureScale: 1 | 2;
  watermark: boolean;
  set: (
    patch: Partial<{
      preset: PhotoPreset;
      clouds: number;
      captureScale: 1 | 2;
      watermark: boolean;
    }>,
  ) => void;
}>((set) => ({ preset: 'live', clouds: 1, captureScale: 1, watermark: false, set }));
