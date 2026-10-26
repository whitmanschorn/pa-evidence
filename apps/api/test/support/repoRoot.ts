import { fileURLToPath } from 'node:url';

// apps/api/test/support/ is four levels below the repository root.
export const REPO_ROOT = fileURLToPath(new URL('../../../../', import.meta.url));
