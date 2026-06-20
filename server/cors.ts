import { getServerRuntimeConfig, isOriginAllowed } from './runtimeConfig.js';

export function getAllowedCorsOrigins(env = process.env): string[] {
  return getServerRuntimeConfig(env).corsAllowedOrigins;
}

export function buildCorsHeaders(
  origin: string | undefined,
  env = process.env,
): Record<string, string> | null {
  if (!origin) {
    return null;
  }

  const allowedOrigins = getAllowedCorsOrigins(env);
  if (!isOriginAllowed(origin, allowedOrigins)) {
    return null;
  }

  return {
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Allow-Methods': 'GET,POST,OPTIONS',
    'Access-Control-Allow-Origin': origin,
    Vary: 'Origin',
  };
}
