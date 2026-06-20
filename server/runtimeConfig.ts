import os from 'node:os';

import type { TranscriptionSessionManagerConfig } from './transcriptionSessionManager.js';

export interface ServerRuntimeConfig {
  corsAllowedOrigins: string[];
  host: string;
  port: number;
  transcription: TranscriptionSessionManagerConfig;
}

const DEFAULT_PORT = 3000;
const DEFAULT_MAX_CONNECTIONS_PER_CLIENT = 2;
const DEFAULT_MAX_AUDIO_CHUNK_BYTES = 64 * 1024;
const DEFAULT_MAX_TEXT_MESSAGE_BYTES = 4 * 1024;
const DEFAULT_CORS_ALLOWED_ORIGINS = [
  'capacitor://localhost',
  'http://localhost',
  'https://localhost',
  'http://127.0.0.1',
  'https://127.0.0.1',
];

function readPositiveInt(
  value: string | undefined,
  fallback: number,
  { min = 1, max }: { min?: number; max?: number } = {},
): number {
  if (!value) {
    return fallback;
  }

  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed)) {
    return fallback;
  }

  if (parsed < min) {
    return fallback;
  }

  if (max !== undefined && parsed > max) {
    return max;
  }

  return parsed;
}

function getDefaultActiveTranscriptions(): number {
  const parallelism = typeof os.availableParallelism === 'function'
    ? os.availableParallelism()
    : os.cpus().length;

  return Math.max(2, Math.min(8, Math.floor(parallelism / 2)));
}

function isHostedSpace(env: NodeJS.ProcessEnv): boolean {
  return env.HF_SPACES === '1' || env.HF_SPACES === 'true';
}

function parseAllowedOrigins(value: string | undefined): string[] {
  if (!value) {
    return [];
  }

  return value
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean);
}

function getHostedSpaceOrigins(env: NodeJS.ProcessEnv): string[] {
  if (!isHostedSpace(env)) {
    return [];
  }

  const rawHost = env.SPACE_HOST?.trim();
  if (!rawHost) {
    return [];
  }

  const normalizedHost = rawHost
    .replace(/^https?:\/\//i, '')
    .replace(/\/.*$/, '')
    .trim();

  if (!normalizedHost) {
    return [];
  }

  return [`https://${normalizedHost}`];
}

function dedupeOrigins(origins: string[]): string[] {
  return Array.from(new Set(origins));
}

export function isOriginAllowed(origin: string, allowedOrigins: string[]): boolean {
  if (allowedOrigins.includes('*') || allowedOrigins.includes(origin)) {
    return true;
  }

  // Allow localhost / 127.0.0.1 on any port when the portless form is listed.
  // The browser always sends the port in the Origin header (e.g. http://localhost:3000)
  // even though our defaults list the bare origin (e.g. http://localhost).
  try {
    const parsed = new URL(origin);
    if (parsed.port) {
      const portless = `${parsed.protocol}//${parsed.hostname}`;
      return allowedOrigins.includes(portless);
    }
  } catch {
    // Not a valid URL — fall through to deny.
  }

  return false;
}

export function getServerRuntimeConfig(env = process.env): ServerRuntimeConfig {
  const isProduction = env.NODE_ENV === 'production';
  const hostedSpace = isHostedSpace(env);
  const defaultActiveTranscriptions = getDefaultActiveTranscriptions();
  const defaultMaxWsConnections = hostedSpace ? 6 : 40;
  const defaultMaxActiveTranscriptions = hostedSpace ? 3 : defaultActiveTranscriptions;
  const defaultMaxQueueSize = hostedSpace ? 3 : 24;

  return {
    corsAllowedOrigins: dedupeOrigins([
      ...DEFAULT_CORS_ALLOWED_ORIGINS,
      ...getHostedSpaceOrigins(env),
      ...parseAllowedOrigins(env.CORS_ALLOWED_ORIGINS),
    ]),
    host: env.HOST ?? (isProduction ? '0.0.0.0' : '127.0.0.1'),
    port: readPositiveInt(env.PORT, DEFAULT_PORT, { max: 65_535 }),
    transcription: {
      maxWsConnections: readPositiveInt(env.MAX_WS_CONNECTIONS, defaultMaxWsConnections),
      maxActiveTranscriptions: readPositiveInt(env.MAX_ACTIVE_TRANSCRIPTIONS, defaultMaxActiveTranscriptions),
      maxQueueSize: readPositiveInt(env.MAX_QUEUE_SIZE, defaultMaxQueueSize, { min: 0 }),
      sessionIdleTimeoutMs: readPositiveInt(env.SESSION_IDLE_TIMEOUT_MS, 30_000),
      sessionMaxDurationMs: readPositiveInt(env.SESSION_MAX_DURATION_MS, 15 * 60_000),
      rateLimitWindowMs: readPositiveInt(env.RATE_LIMIT_WINDOW_MS, 10_000),
      rateLimitMaxRequests: readPositiveInt(env.RATE_LIMIT_MAX_REQUESTS, 400),
      maxConnectionsPerClient: DEFAULT_MAX_CONNECTIONS_PER_CLIENT,
      maxAudioChunkBytes: DEFAULT_MAX_AUDIO_CHUNK_BYTES,
      maxTextMessageBytes: DEFAULT_MAX_TEXT_MESSAGE_BYTES,
    },
  };
}
