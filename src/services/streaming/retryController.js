import {
  STREAM_RETRY_BASE_DELAY_MS,
  STREAM_RETRY_MAX_DELAY_MS,
} from '../../constants.js';
import { parseGeminiError } from '../../utils/errorFormatter.js';

export function isAbortError(error) {
  return error?.name === 'AbortError' || error?.code === 'ABORT_ERR';
}

export function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export function getRetryDelayMs(error, attemptNumber) {
  const parsed = parseGeminiError(error);
  if (parsed.retryDelay) {
    return parsed.retryDelay * 1_000;
  }

  const backoff = STREAM_RETRY_BASE_DELAY_MS * (2 ** Math.max(0, attemptNumber - 1));
  return Math.min(STREAM_RETRY_MAX_DELAY_MS, backoff);
}

export function createAttemptTimeout(abortController, timeoutMs) {
  let timedOut = false;

  const timeoutId = setTimeout(() => {
    timedOut = true;
    if (abortController && !abortController.signal.aborted) {
      abortController.abort();
    }
  }, timeoutMs);

  return {
    clear() {
      clearTimeout(timeoutId);
    },
    wasTimedOut() {
      return timedOut;
    },
  };
}
