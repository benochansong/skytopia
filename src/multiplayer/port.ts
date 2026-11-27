import type { Action } from '../game/online/protocol';
// Rendering inputs use this small port; the offline store never imports the socket client.
let handler: ((action: Action | 'place' | 'hold' | 'recycle') => void) | null = null;
export const onlineActive = () => handler !== null;
export const onlineAction = (action: Action | 'place' | 'hold' | 'recycle') => handler?.(action);
export const setOnlinePort = (next: typeof handler) => {
  handler = next;
};
