function clonePart(part) {
  return structuredClone(part);
}

export function createStreamAccumulator() {
  return {
    groundingMetadata: null,
    urlContextMetadata: null,
    rawAssistantParts: [],
    inlineDataFiles: [],
  };
}

export function resetStreamAccumulatorForAttempt(accumulator) {
  accumulator.inlineDataFiles = [];
  accumulator.rawAssistantParts = [];
}

/**
 * Process a single stream chunk and accumulate text, inline files, and raw parts.
 * @param {Object} chunk - A Gemini API stream chunk.
 * @param {Object} accumulator - Mutable accumulator for the stream.
 * @returns {string} Combined text emitted by this chunk.
 */
export function processStreamChunk(chunk, accumulator) {
  const rawParts = chunk.candidates?.[0]?.content?.parts || [];
  let chunkText = '';

  for (const part of rawParts) {
    if (part.text !== undefined) {
      const lastPart = accumulator.rawAssistantParts[accumulator.rawAssistantParts.length - 1];
      if (lastPart && lastPart.text !== undefined) {
        lastPart.text += part.text;
        for (const key of Object.keys(part)) {
          if (key !== 'text' && lastPart[key] === undefined) {
            lastPart[key] = typeof part[key] === 'object' && part[key] !== null
              ? clonePart({ [key]: part[key] })[key]
              : part[key];
          }
        }
      } else {
        accumulator.rawAssistantParts.push(clonePart(part));
      }
    } else {
      accumulator.rawAssistantParts.push(clonePart(part));
    }

    if (part.thought) continue;

    if (part.text) {
      chunkText += part.text;
    }
    if (part.executableCode) {
      const lang = (part.executableCode.language || '').toLowerCase().replace('language_unspecified', '');
      chunkText += `\n\`\`\`${lang}\n${part.executableCode.code}\n\`\`\`\n`;
    }
    if (part.codeExecutionResult) {
      const { outcome, output } = part.codeExecutionResult;
      if (outcome && outcome !== 'OUTCOME_OK') {
        chunkText += `\n⚠️ Code execution ${outcome === 'OUTCOME_DEADLINE_EXCEEDED' ? 'timed out' : 'failed'}.\n`;
      }
      if (output) {
        chunkText += `\n**Output:**\n\`\`\`\n${output}\`\`\`\n`;
      }
    }
    if (part.inlineData?.data && part.inlineData?.mimeType) {
      accumulator.inlineDataFiles.push({
        mimeType: part.inlineData.mimeType,
        data: part.inlineData.data,
      });
    }
  }

  if (chunk.candidates?.[0]?.groundingMetadata) {
    accumulator.groundingMetadata = chunk.candidates[0].groundingMetadata;
  }
  if (chunk.candidates?.[0]?.url_context_metadata) {
    accumulator.urlContextMetadata = chunk.candidates[0].url_context_metadata;
  }

  return chunkText;
}
