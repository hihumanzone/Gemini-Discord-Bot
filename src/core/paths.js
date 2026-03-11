/**
 * Centralized path constants for the application.
 * All directory/file path references should originate from this module.
 */

import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export const ROOT_DIR = path.resolve(__dirname, '../..');
export const CONFIG_DIR = path.join(ROOT_DIR, 'config');
export const CHAT_HISTORIES_DIR = path.join(CONFIG_DIR, 'chat_histories_4');
export const TEMP_DIR = path.join(ROOT_DIR, 'temp');
export const LOGS_DIR = path.join(ROOT_DIR, 'logs');
