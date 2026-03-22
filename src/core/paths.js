/**
 * Centralized path constants for the application.
 * All directory/file path references should originate from this module.
 */

import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export const ROOT_DIR = path.resolve(__dirname, '../..');
export const DATA_DIR = path.join(ROOT_DIR, 'data');
export const CHAT_HISTORIES_VERSION = 5;
export const CHAT_HISTORIES_DIR = path.join(DATA_DIR, `chat_histories_${CHAT_HISTORIES_VERSION}`);
export const TEMP_DIR = path.join(ROOT_DIR, 'temp');
export const LOGS_DIR = path.join(ROOT_DIR, 'logs');
