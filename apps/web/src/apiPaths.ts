// URL path prefixes owned by the API. Vite proxies these in dev, and the Playwright `ui` project
// mocks them, so both read this one list.
export const API_PATHS = ['/requests', '/audit', '/eval', '/health', '/ready', '/me', '/mcp'];

export function isApiPath(pathname: string): boolean {
  return API_PATHS.some((prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`));
}
