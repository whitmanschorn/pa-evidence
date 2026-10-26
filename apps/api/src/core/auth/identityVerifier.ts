import { createHash, timingSafeEqual } from 'node:crypto';
import { ROLES, type Role } from '@pa/shared';

export type Identity = { sub: string; role: Role };

// Turns a bearer token into a caller identity, or null. The demo uses a static token map; production swaps in a
// JwtVerifier (OIDC: jose + the IdP's JWKS, roles from SSO group claims) behind this same interface.
export type IdentityVerifier = {
  verify(bearerToken: string): Identity | null;
};

type TokenEntry = { role: Role; sub: string; hash: Buffer };

// AUTH_TOKENS: comma-separated "role:subject:sha256(token)" entries. Only hashes are configured, never tokens.
export function parseAuthTokens(value: string): TokenEntry[] {
  return value
    .split(',')
    .map((entry) => entry.trim())
    .filter((entry) => entry !== '')
    .map((entry) => {
      const [role, sub, hashHex] = entry.split(':');
      if (role === undefined || !ROLES.includes(role as Role)) throw new Error(`AUTH_TOKENS: unknown role in "${role}:${sub}"`);
      if (sub === undefined || sub === '') throw new Error('AUTH_TOKENS: an entry has no subject');
      if (hashHex === undefined || !/^[0-9a-f]{64}$/.test(hashHex)) throw new Error(`AUTH_TOKENS: ${sub} needs a 64-hex sha256`);
      return { role: role as Role, sub, hash: Buffer.from(hashHex, 'hex') };
    });
}

export function sha256OfToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

export function createStaticTokenVerifier(entries: TokenEntry[]): IdentityVerifier {
  return {
    verify(bearerToken) {
      const presented = createHash('sha256').update(bearerToken).digest();
      let found: Identity | null = null;
      // Compare against every entry in constant time, without stopping early, so timing reveals nothing.
      for (const entry of entries) {
        if (timingSafeEqual(presented, entry.hash)) {
          found = { sub: entry.sub, role: entry.role };
        }
      }
      return found;
    },
  };
}
