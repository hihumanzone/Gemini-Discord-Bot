import { initialize } from './botManager.js';
import { client, token } from './src/core/runtime.js';
import { registerBotHandlers } from './src/bootstrap.js';

await initialize();
registerBotHandlers();
await client.login(token);
