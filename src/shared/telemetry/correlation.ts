// correlation.ts
// LPU Events — Canonical Request Correlation ID Generator & Validator (Stage 6 / MON-001)

/**
 * Validates whether a string conforms to the canonical correlation ID pattern:
 * /^[A-Za-z0-9_.-]{1,64}$/
 */
export function validateCorrelationId(id: unknown): id is string {
  return typeof id === 'string' && /^[A-Za-z0-9_.-]{1,64}$/.test(id.trim());
}

/**
 * Generates an end-to-end request correlation ID complying with /^[A-Za-z0-9_.-]{1,64}$/.
 */
export function generateCorrelationId(prefix: string = 'req'): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return `${prefix}_${crypto.randomUUID()}`;
  }
  const rand = Math.random().toString(36).substring(2, 10);
  const time = Date.now().toString(36);
  return `${prefix}_${time}_${rand}`;
}

