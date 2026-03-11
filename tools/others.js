export function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function retryOperation(fn, maxRetries, delayMs = 1_000) {
  let lastError;

  for (let attempt = 0; attempt <= maxRetries; attempt += 1) {
    try {
      return await fn();
    } catch (error) {
      lastError = error;
      console.log(`Attempt ${attempt + 1} failed: ${error.message}`);

      if (attempt < maxRetries) {
        await delay(delayMs);
      }
    }
  }

  throw new Error(`Operation failed after ${maxRetries + 1} attempt(s): ${lastError.message}`);
}
