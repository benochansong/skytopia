import { afterEach } from 'vitest';
// Long deterministic campaigns are synchronous. Let the worker process reporter
// messages between tests rather than starving its RPC channel for a whole suite.
afterEach(async () => {
  await new Promise<void>((resolve) => setTimeout(resolve, 0));
});
