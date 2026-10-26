// Roles map to permissions; routes check permissions, never roles (so a new role is one line here). Shared, so the
// web app's tests use the same map as the API.
export const PERMISSIONS = {
  nurse: ['evidence:read', 'health:read'],
  admin: ['evidence:read', 'audit:read', 'health:read', 'health:detail', 'policies:reload', 'models:reload'],
  probe: ['health:read'],
} as const;

export type Role = keyof typeof PERMISSIONS;
export type Permission = (typeof PERMISSIONS)[Role][number];

export const ROLES = Object.keys(PERMISSIONS) as Role[];

export function permissionsOf(role: Role): readonly Permission[] {
  return PERMISSIONS[role];
}

export function hasPermission(role: Role, permission: Permission): boolean {
  return (PERMISSIONS[role] as readonly Permission[]).includes(permission);
}
