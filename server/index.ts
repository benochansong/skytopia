import { config } from './config';
import { createService } from './service';
const service = createService(config());
const port = await service.listen();
console.log('SKY RIVALS server listening on port ' + port);
let closing = false;
for (const signal of ['SIGINT', 'SIGTERM'] as const)
  process.on(signal, async () => {
    if (closing) return;
    closing = true;
    await service.close();
    process.exit(0);
  });
