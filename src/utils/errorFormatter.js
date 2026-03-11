import { createEmbed } from './discord.js';

const RETRY_DELAY_PATTERN = /(\d+(?:\.\d+)?)s/i;
const RETRY_IN_MESSAGE_PATTERN = /Please retry in\s+(\d+(?:\.\d+)?)s\.?/i;
const STATUS_CODE_BRACKET_PATTERN = /\[(\d{3})\s+([^\]]+)\]/i;
const SDK_WRAPPER_PATTERNS = [
  /^Operation failed after \d+ attempt\(s\):\s*/i,
  /^Error fetching from .*?:\s*/i,
];
const NOISE_PATTERNS = [
  /For more information on this error, head to:\s*https?:\/\/\S+\.?/gi,
  /To monitor your current usage, head to:\s*https?:\/\/\S+\.?/gi,
];

function toTitleCase(text) {
  if (typeof text !== 'string') {
    return null;
  }

  return text
    .toLowerCase()
    .split(/[_\s]+/)
    .filter(Boolean)
    .map((word) => word[0].toUpperCase() + word.slice(1))
    .join(' ');
}

function ceilSeconds(value) {
  return Math.max(1, Math.ceil(Number(value)));
}

function pluralize(count, word) {
  return `${count} ${word}${count === 1 ? '' : 's'}`;
}

function truncate(text, maxLength = 1000) {
  if (!text) {
    return null;
  }

  return text.length <= maxLength ? text : `${text.slice(0, maxLength - 3)}...`;
}

function stripSdkWrappers(text) {
  let result = text;

  for (const pattern of SDK_WRAPPER_PATTERNS) {
    result = result.replace(pattern, '');
  }

  return result.trim();
}

function stripNoise(text) {
  if (!text) {
    return null;
  }

  let result = text;

  for (const pattern of NOISE_PATTERNS) {
    result = result.replace(pattern, '');
  }

  return result.replace(/\s+\n/g, '\n').replace(/\n{3,}/g, '\n\n').trim();
}

function extractJsonObjects(text) {
  if (!text || !text.includes('{')) {
    return [];
  }

  const objects = [];
  let startIndex = -1;
  let depth = 0;
  let inString = false;
  let escaped = false;

  for (let i = 0; i < text.length; i += 1) {
    const ch = text[i];

    if (inString) {
      if (escaped) {
        escaped = false;
      } else if (ch === '\\') {
        escaped = true;
      } else if (ch === '"') {
        inString = false;
      }

      continue;
    }

    if (ch === '"') {
      inString = true;
    } else if (ch === '{') {
      if (depth === 0) {
        startIndex = i;
      }

      depth += 1;
    } else if (ch === '}' && depth > 0) {
      depth -= 1;

      if (depth === 0 && startIndex !== -1) {
        try {
          objects.push(JSON.parse(text.slice(startIndex, i + 1)));
        } catch {
          // Not valid JSON — skip.
        }

        startIndex = -1;
      }
    }
  }

  return objects;
}

function extractPayloadFromString(text) {
  if (typeof text !== 'string') {
    return null;
  }

  const cleanedText = stripSdkWrappers(text.trim());
  const objects = extractJsonObjects(cleanedText);

  for (const object of objects) {
    const payload = resolvePayload(findErrorPayload(object) || object);

    if (payload) {
      return payload;
    }
  }

  return null;
}

function findErrorPayload(value, seen = new Set()) {
  if (!value || typeof value !== 'object' || seen.has(value)) {
    return null;
  }

  seen.add(value);

  if (value.error && typeof value.error === 'object') {
    return value.error;
  }

  if (value.message || value.status || value.code || value.details) {
    return value;
  }

  for (const child of Object.values(value)) {
    const match = findErrorPayload(child, seen);

    if (match) {
      return match;
    }
  }

  return null;
}

function resolvePayload(payload, seen = new Set()) {
  if (!payload || typeof payload !== 'object' || seen.has(payload)) {
    return payload || null;
  }

  seen.add(payload);

  const nestedFromMessage = extractPayloadFromString(payload.message);

  if (nestedFromMessage && nestedFromMessage !== payload) {
    return resolvePayload(nestedFromMessage, seen);
  }

  if (payload.error && typeof payload.error === 'object') {
    return resolvePayload(payload.error, seen);
  }

  return payload;
}

function parseRetryDelay(delayString) {
  const match = delayString?.match?.(RETRY_DELAY_PATTERN);
  return match ? ceilSeconds(match[1]) : null;
}

function buildReadableReason({ status, message, retryDelay, quota }) {
  const cleaned = stripNoise(message);

  if (status === 'RESOURCE_EXHAUSTED') {
    const parts = ['The Gemini API quota has been exceeded.'];

    if (quota?.model || quota?.limit) {
      const details = [quota.model && `model: ${quota.model}`, quota.limit && `limit: ${quota.limit}`].filter(Boolean);
      parts.push(`Quota info: ${details.join(', ')}.`);
    }

    if (retryDelay) {
      parts.push(`Retry after ~${pluralize(retryDelay, 'second')}.`);
    }

    return parts.join(' ');
  }

  if (status === 'UNAVAILABLE' && cleaned) {
    return cleaned.replace(/Spikes in demand are usually temporary\.?/i, 'This is usually temporary.');
  }

  return cleaned;
}

export function parseGeminiError(error) {
  const raw = String(error?.message || 'Unknown error').trim();
  const cleaned = stripSdkWrappers(raw);

  const payload = resolvePayload(findErrorPayload(error))
    || extractPayloadFromString(cleaned)
    || null;
  const api = payload;

  const bracketMatch = cleaned.match(STATUS_CODE_BRACKET_PATTERN);
  const code = api?.code || (bracketMatch ? Number(bracketMatch[1]) : null);
  const rawStatus = api?.status;
  const status = typeof rawStatus === 'string'
    ? rawStatus
    : (bracketMatch ? bracketMatch[2].toUpperCase().replace(/\s+/g, '_') : null);

  const details = Array.isArray(api?.details) ? api.details : [];
  const retryInfo = details.find((d) => d?.['@type'] === 'type.googleapis.com/google.rpc.RetryInfo');
  const quotaInfo = details.find((d) => d?.['@type'] === 'type.googleapis.com/google.rpc.QuotaFailure');
  const violation = quotaInfo?.violations?.[0];

  const inlineRetry = cleaned.match(RETRY_IN_MESSAGE_PATTERN);
  const retryDelay = parseRetryDelay(retryInfo?.retryDelay)
    || (inlineRetry ? ceilSeconds(inlineRetry[1]) : null);

  const apiMessage = typeof api?.message === 'string' ? api.message : (cleaned || raw);
  const quota = violation
    ? { model: violation.quotaDimensions?.model || null, limit: violation.quotaValue || null }
    : null;
  const readable = buildReadableReason({ status, message: apiMessage, retryDelay, quota });

  return { code, status, message: readable || apiMessage, retryDelay };
}

export function buildRetryErrorEmbed(error, { isFinal }) {
  const parsed = parseGeminiError(error);

  const friendlyStatus = parsed.status ? toTitleCase(parsed.status) : null;
  const statusLabel = friendlyStatus && parsed.code
    ? `${friendlyStatus} (${parsed.code})`
    : friendlyStatus || (parsed.code ? String(parsed.code) : null);

  const description = isFinal
    ? 'The request could not be completed after all retry attempts.'
    : 'The request hit a temporary error — retrying automatically.';

  const nextStep = isFinal
    ? 'Wait a moment and try again. If this persists, the API may be overloaded or quota-limited.'
    : parsed.retryDelay
      ? `The bot will retry in ~${pluralize(parsed.retryDelay, 'second')}.`
      : 'No action needed — the bot will retry shortly.';

  return createEmbed({
    color: isFinal ? 0xFF0000 : 0xFFFF00,
    title: isFinal ? 'Generation Failed' : 'Retrying Request',
    description,
    fields: [
      { name: 'Status', value: statusLabel || 'Unknown error', inline: false },
      { name: 'Reason', value: truncate(parsed.message) || 'No details available.', inline: false },
      { name: isFinal ? 'What to do' : 'Next step', value: nextStep, inline: false },
    ],
  });
}
