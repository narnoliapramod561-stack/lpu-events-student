// packages/shared/src/telemetry/scrub.ts
// Sensitive credentials scrubbing utility (Zero-dependency)

// Regex patterns for sensitive credentials that must NEVER be transmitted to telemetry
export const SENSITIVE_KEY_PATTERNS = [
  /password/i,
  /otp/i,
  /token/i,
  /refresh[_-]?token/i,
  /access[_-]?token/i,
  /auth[_-]?token/i,
  /session[_-]?token/i,
  /service[_-]?role/i,
  /secret/i,
  /private/i,
  /authorization/i,
  /bearer/i,
  /api[_-]?key/i,
  /anon[_-]?key/i,
  /sb-[a-zA-Z0-9-]+-auth-token/i
];

/**
 * Cleanse sensitive query parameters from URL strings (e.g. ?token=..., &otp=...).
 */
export function scrubUrlQuery(url: string): string {
  if (!url || typeof url !== 'string') return url;
  try {
    const parsed = new URL(url, 'https://lpuevents.live');
    let modified = false;
    parsed.searchParams.forEach((_val, key) => {
      if (SENSITIVE_KEY_PATTERNS.some(pat => pat.test(key))) {
        parsed.searchParams.set(key, '[REDACTED]');
        modified = true;
      }
    });
    return modified ? (url.startsWith('http') ? parsed.toString() : `${parsed.pathname}${parsed.search}${parsed.hash}`) : url;
  } catch {
    return url;
  }
}

/**
 * Cleanse any potentially sensitive object or string before dispatching to telemetry.
 */
export function scrubSensitiveData(obj: any, depth = 0): any {
  if (depth > 5 || obj === null || obj === undefined) return obj;

  if (typeof obj === 'string') {
    let sanitized = obj;
    // Strip Bearer tokens
    if (/bearer\s+[a-zA-Z0-9\-_.]{10,}/i.test(sanitized)) {
      sanitized = sanitized.replace(/bearer\s+[a-zA-Z0-9\-_.]{10,}/gi, 'Bearer [REDACTED_BEARER_TOKEN]');
    }
    // Strip JWT-like tokens
    if (/ey[a-zA-Z0-9-_]{20,}\.[a-zA-Z0-9-_]{20,}/.test(sanitized)) {
      sanitized = sanitized.replace(/ey[a-zA-Z0-9-_]{20,}\.[a-zA-Z0-9-_]{20,}(\.[a-zA-Z0-9-_]+)?/g, '[REDACTED_JWT_TOKEN]');
    }
    return sanitized;
  }

  if (Array.isArray(obj)) {
    return obj.map(item => scrubSensitiveData(item, depth + 1));
  }

  if (typeof obj === 'object') {
    const cleaned: Record<string, any> = {};
    for (const [key, value] of Object.entries(obj)) {
      const isSensitiveKey = SENSITIVE_KEY_PATTERNS.some(pattern => pattern.test(key));
      if (isSensitiveKey) {
        cleaned[key] = '[REDACTED_SENSITIVE_FIELD]';
      } else {
        cleaned[key] = scrubSensitiveData(value, depth + 1);
      }
    }
    return cleaned;
  }

  return obj;
}
