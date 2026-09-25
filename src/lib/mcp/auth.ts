import { createHash, timingSafeEqual } from 'node:crypto';

export const MIN_SECRET_LENGTH = 32;

/**
 * Constant-time comparison of the secret from the URL path with MCP_SECRET.
 * Both sides are hashed first so the comparison does not leak the length.
 * Returns false when MCP_SECRET is unset or too short (connector disabled).
 */
export function isValidSecret(candidate: string, expected: string | undefined): boolean {
  if (!expected || expected.length < MIN_SECRET_LENGTH) return false;
  const a = createHash('sha256').update(candidate).digest();
  const b = createHash('sha256').update(expected).digest();
  return timingSafeEqual(a, b);
}
