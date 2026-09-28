const DEFAULT_BASE_URL = "https://api.collegebasketballdata.com";

export class CbbdError extends Error {
  constructor(message, details = {}) {
    super(message);
    this.name = "CbbdError";
    Object.assign(this, details);
  }
}

export function createCbbdClient({
  apiKey = process.env.CBBD_API_KEY,
  baseUrl = process.env.CBBD_BASE_URL || DEFAULT_BASE_URL,
  maxAttempts = 5,
  timeoutMs = 45_000,
  logger = console
} = {}) {
  if (!apiKey) {
    throw new CbbdError("CBBD_API_KEY is required. Set it in the server environment; never place it in public files.");
  }

  return {
    async get(pathname, query = {}) {
      const url = new URL(pathname, baseUrl);
      for (const [key, value] of Object.entries(query)) {
        if (value !== null && value !== undefined && value !== "") url.searchParams.set(key, String(value));
      }

      for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), timeoutMs);
        try {
          const response = await fetch(url, {
            headers: {
              Accept: "application/json",
              Authorization: `Bearer ${apiKey}`,
              "User-Agent": "verspid-cbb-hub/1.0"
            },
            signal: controller.signal
          });
          const body = await response.text();
          if (response.ok) {
            const parsed = body ? JSON.parse(body) : [];
            if (!Array.isArray(parsed)) throw new CbbdError(`Expected an array from ${url.pathname}`, { status: response.status });
            return parsed;
          }

          const retryable = response.status === 429 || response.status >= 500;
          if (!retryable || attempt === maxAttempts) {
            throw new CbbdError(`CBBD request failed: ${response.status} ${response.statusText} (${url.pathname})`, {
              status: response.status,
              pathname: url.pathname,
              responseBody: body.slice(0, 500)
            });
          }
          const retryAfter = Number(response.headers.get("retry-after"));
          const delayMs = Number.isFinite(retryAfter) ? retryAfter * 1_000 : backoffMs(attempt);
          logger.warn(`CBBD ${response.status} for ${url.pathname}; retrying in ${Math.round(delayMs)} ms`);
          await delay(delayMs);
        } catch (error) {
          if (error instanceof CbbdError && error.status && error.status < 500 && error.status !== 429) throw error;
          if (attempt === maxAttempts) {
            throw error instanceof CbbdError
              ? error
              : new CbbdError(`CBBD request failed after ${maxAttempts} attempts (${url.pathname}): ${error.message}`, { cause: error });
          }
          const delayMs = backoffMs(attempt);
          logger.warn(`CBBD request error for ${url.pathname}; retrying in ${Math.round(delayMs)} ms`);
          await delay(delayMs);
        } finally {
          clearTimeout(timeout);
        }
      }
      throw new CbbdError(`CBBD request exhausted retries (${url.pathname})`);
    }
  };
}

function backoffMs(attempt) {
  const base = Math.min(30_000, 750 * 2 ** (attempt - 1));
  return base + Math.random() * Math.min(1_000, base * 0.25);
}

function delay(milliseconds) {
  return new Promise(resolve => setTimeout(resolve, milliseconds));
}
