import { client, initialize, token } from './botManager.js';
import { registerBotHandlers } from './src/bootstrap.js';

await initialize();
registerBotHandlers();
await client.login(token);
