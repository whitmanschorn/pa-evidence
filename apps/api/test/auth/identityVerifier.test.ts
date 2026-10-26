import { describe, expect, it } from 'vitest';
import { createStaticTokenVerifier, parseAuthTokens, sha256OfToken } from '../../src/core/auth/identityVerifier.js';
import { hasPermission } from '../../src/core/auth/permissions.js';

describe('static token verifier', () => {
  const entries = parseAuthTokens(`nurse:nurse-1:${sha256OfToken('n-token')},admin:admin-1:${sha256OfToken('a-token')}`);
  const verifier = createStaticTokenVerifier(entries);

  it('maps a known token to its subject and role', () => {
    expect(verifier.verify('n-token')).toEqual({ sub: 'nurse-1', role: 'nurse' });
    expect(verifier.verify('a-token')).toEqual({ sub: 'admin-1', role: 'admin' });
  });

  it('returns null for an unknown token', () => {
    expect(verifier.verify('nope')).toBeNull();
  });

  it('rejects malformed AUTH_TOKENS entries', () => {
    expect(() => parseAuthTokens('superuser:x:' + 'a'.repeat(64))).toThrow('unknown role');
    expect(() => parseAuthTokens('nurse:x:abc')).toThrow('64-hex sha256');
  });
});

describe('permissions', () => {
  it('lets the nurse read evidence but not audit; the admin reads both; the probe only health', () => {
    expect(hasPermission('nurse', 'evidence:read')).toBe(true);
    expect(hasPermission('nurse', 'audit:read')).toBe(false);
    expect(hasPermission('admin', 'audit:read')).toBe(true);
    expect(hasPermission('probe', 'health:read')).toBe(true);
    expect(hasPermission('probe', 'evidence:read')).toBe(false);
  });
});
