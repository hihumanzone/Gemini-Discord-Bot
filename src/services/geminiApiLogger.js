import fs from 'fs';
import fsPromises from 'fs/promises';
import path from 'path';
import { randomUUID } from 'crypto';

import { LOGS_DIR } from '../core/paths.js';

const GEMINI_API_HOSTNAMES = new Set(['generativelanguage.googleapis.com']);
const FETCH_PATCH_FLAG = Symbol.for('gemini-discord-bot.fetch-logger-installed');
const sessionStartedAt = new Date();
const sessionId = `${sessionStartedAt.toISOString().replace(/[.:]/g, '-')}-pid-${process.pid}`;
const sessionLogFilePath = path.join(LOGS_DIR, `gemini-api-session-${sessionId}.jsonl`);

let writeChain = Promise.resolve();

function ensureLogsDirectory() {
  fs.mkdirSync(LOGS_DIR, { recursive: true });
  fs.closeSync(fs.openSync(sessionLogFilePath, 'a'));
}

function sanitizeUrl(url) {
  const parsedUrl = new URL(url);

  if (parsedUrl.searchParams.has('key')) {
    parsedUrl.searchParams.set('key', '[REDACTED]');
  }

  return parsedUrl;
}

function isRequestInstance(value) {
  return typeof Request !== 'undefined' && value instanceof Request;
}

function isUrlInstance(value) {
  return typeof URL !== 'undefined' && value instanceof URL;
}

function resolveRequestUrl(input) {
  if (typeof input === 'string') {
    return input;
  }

  if (isUrlInstance(input)) {
    return input.toString();
  }

  if (isRequestInstance(input)) {
    return input.url;
  }

  return null;
}

function isGeminiApiUrl(url) {
  if (!url) {
    return false;
  }

  try {
    const parsedUrl = new URL(url);
    return GEMINI_API_HOSTNAMES.has(parsedUrl.hostname);
  } catch {
    return false;
  }
}

function resolveRequestMethod(input, init) {
  return init?.method || (isRequestInstance(input) ? input.method : 'GET');
}

function readBodyFromInitBody(body) {
  if (body === undefined || body === null) {
    return Promise.resolve(null);
  }

  if (typeof body === 'string') {
    return Promise.resolve(body);
  }

  if (body instanceof URLSearchParams) {
    return Promise.resolve(body.toString());
  }

  if (body instanceof ArrayBuffer) {
    return Promise.resolve(Buffer.from(body).toString('utf8'));
  }

  if (ArrayBuffer.isView(body)) {
    return Promise.resolve(Buffer.from(body.buffer, body.byteOffset, body.byteLength).toString('utf8'));
  }

  if (Buffer.isBuffer(body)) {
    return Promise.resolve(body.toString('utf8'));
  }

  return Promise.resolve(`[unsupported-request-body:${body.constructor?.name || typeof body}]`);
}

function readRequestBody(input, init) {
  if (init?.body !== undefined) {
    return readBodyFromInitBody(init.body);
  }

  if (!isRequestInstance(input)) {
    return Promise.resolve(null);
  }

  try {
    return input.clone().text();
  } catch {
    return Promise.resolve(null);
  }
}

function safeParseJson(rawText) {
  if (!rawText) {
    return null;
  }

  try {
    return JSON.parse(rawText);
  } catch {
    return null;
  }
}

function buildMetadata(url, method) {
  const parsedUrl = sanitizeUrl(url);

  return {
    sessionId,
    method: method.toUpperCase(),
    url: parsedUrl.toString(),
    hostname: parsedUrl.hostname,
    pathname: parsedUrl.pathname,
    search: parsedUrl.search,
    processId: process.pid,
  };
}

function serializeError(error) {
  return {
    name: error?.name || 'Error',
    message: error?.message || 'Unknown error',
    stack: error?.stack || null,
  };
}

function queueLogEntry(entry) {
  writeChain = writeChain
    .then(() => fsPromises.appendFile(sessionLogFilePath, `${JSON.stringify(entry)}\n`, 'utf8'))
    .catch((error) => {
      console.error('Failed to write Gemini API log entry:', error);
    });

  return writeChain;
}

export function initializeGeminiApiLogging() {
  ensureLogsDirectory();

  if (globalThis[FETCH_PATCH_FLAG]) {
    return;
  }

  const originalFetch = globalThis.fetch?.bind(globalThis);

  if (!originalFetch) {
    throw new Error('Global fetch is unavailable; Gemini API logging could not be initialized.');
  }

  globalThis.fetch = async function loggedGeminiFetch(input, init) {
    const url = resolveRequestUrl(input);

    if (!isGeminiApiUrl(url)) {
      return originalFetch(input, init);
    }

    const requestId = randomUUID();
    const startedAt = new Date();
    const startedAtMs = Date.now();
    const method = resolveRequestMethod(input, init);
    const requestMetadata = buildMetadata(url, method);
    const requestBodyPromise = readRequestBody(input, init).catch(() => null);

    try {
      const response = await originalFetch(input, init);
      const requestBody = await requestBodyPromise;

      void queueLogEntry({
        type: 'gemini_api_request',
        requestId,
        timestamp: startedAt.toISOString(),
        metadata: requestMetadata,
        requestPayload: safeParseJson(requestBody) ?? requestBody,
        rawRequestBody: requestBody,
      });

      void response.clone().text()
        .then((rawResponse) => queueLogEntry({
          type: 'gemini_api_response',
          requestId,
          timestamp: new Date().toISOString(),
          durationMs: Date.now() - startedAtMs,
          metadata: requestMetadata,
          status: response.status,
          statusText: response.statusText,
          ok: response.ok,
          rawResponse,
          responseJson: safeParseJson(rawResponse),
        }))
        .catch((error) => queueLogEntry({
          type: 'gemini_api_response_read_error',
          requestId,
          timestamp: new Date().toISOString(),
          durationMs: Date.now() - startedAtMs,
          metadata: requestMetadata,
          status: response.status,
          statusText: response.statusText,
          ok: response.ok,
          error: serializeError(error),
        }));

      return response;
    } catch (error) {
      const requestBody = await requestBodyPromise;

      void queueLogEntry({
        type: 'gemini_api_error',
        requestId,
        timestamp: new Date().toISOString(),
        durationMs: Date.now() - startedAtMs,
        metadata: requestMetadata,
        requestPayload: safeParseJson(requestBody) ?? requestBody,
        rawRequestBody: requestBody,
        error: serializeError(error),
      });

      throw error;
    }
  };

  globalThis[FETCH_PATCH_FLAG] = true;
}