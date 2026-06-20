export const MOBILE_BACKEND_CONFIG_MESSAGE =
  'Set a hosted backend URL in Mobile Backend before loading models or starting transcription.';

export interface RuntimeConfig {
  apiBaseUrl: string;
  isHostedDemo: boolean;
  isLocalhost: boolean;
  isNativeApp: boolean;
  wsBaseUrl: string;
}

export interface ClientRuntimeConfig extends RuntimeConfig {
  hasReachableBackend: boolean;
}

interface RuntimeConfigOverrides {
  apiBaseUrl?: string;
  wsBaseUrl?: string;
}

interface StorageLike {
  getItem(key: string): string | null;
  removeItem(key: string): void;
  setItem(key: string, value: string): void;
}

interface CapacitorLike {
  isNativePlatform?: () => boolean;
}

export interface RuntimeWindowLike {
  AudioContext?: typeof AudioContext;
  AudioWorkletNode?: typeof AudioWorkletNode;
  Capacitor?: CapacitorLike;
  SpeechRecognition?: unknown;
  WebSocket?: typeof WebSocket;
  __TRANSCRIBE_EASY_CONFIG__?: RuntimeConfigOverrides;
  localStorage?: StorageLike;
  location?: {
    host: string;
    protocol: string;
  };
  navigator?: Navigator;
  webkitAudioContext?: typeof AudioContext;
  webkitSpeechRecognition?: unknown;
}

export interface MobileCapabilities {
  defaultAudioSource: 'microphone';
  defaultTranscriptionMode: 'web-speech' | 'whisper-fallback';
  supportsBackendOverride: boolean;
  supportsOfflineMode: boolean;
  supportsSystemAudio: boolean;
}

const RUNTIME_CONFIG_STORAGE_KEY = 'transcribe-easy.runtime-config';

function getWindowLike(): RuntimeWindowLike | undefined {
  if (typeof window === 'undefined') {
    return undefined;
  }

  return window as unknown as RuntimeWindowLike;
}

function getEnvValue(
  name: 'VITE_API_BASE_URL' | 'VITE_WS_BASE_URL' | 'VITE_HOSTED_DEMO',
): string {
  const env = (import.meta as ImportMeta & {
    env?: Record<string, string | undefined>;
  }).env;

  return env?.[name]?.trim() ?? '';
}

function getEnvFlag(name: 'VITE_HOSTED_DEMO'): boolean {
  const value = getEnvValue(name).toLowerCase();
  return value === '1' || value === 'true' || value === 'yes';
}

function joinUrl(baseUrl: string, path: string): string {
  if (!baseUrl) return path;
  return `${baseUrl.replace(/\/+$/, '')}/${path.replace(/^\/+/, '')}`;
}

function deriveWebSocketBaseUrl(apiBaseUrl: string): string {
  if (!apiBaseUrl) return '';

  const parsed = new URL(apiBaseUrl);
  parsed.protocol = parsed.protocol === 'https:' ? 'wss:' : 'ws:';
  return parsed.toString().replace(/\/$/, '');
}

export function normalizeBackendUrl(input: string): string {
  const trimmed = input.trim();
  if (!trimmed) return '';

  const parsed = new URL(trimmed);
  parsed.hash = '';
  parsed.search = '';
  parsed.pathname = parsed.pathname.replace(/\/+(api|ws)\/?$/i, '').replace(/\/+$/, '');

  return parsed.toString().replace(/\/$/, '');
}

export function readStoredRuntimeConfig(
  storage = getWindowLike()?.localStorage,
): RuntimeConfigOverrides {
  if (!storage) return {};

  try {
    const raw = storage.getItem(RUNTIME_CONFIG_STORAGE_KEY);
    if (!raw) return {};

    const parsed = JSON.parse(raw) as RuntimeConfigOverrides;
    return {
      apiBaseUrl: parsed.apiBaseUrl ? normalizeBackendUrl(parsed.apiBaseUrl) : '',
      wsBaseUrl: parsed.wsBaseUrl ? normalizeBackendUrl(parsed.wsBaseUrl) : '',
    };
  } catch {
    return {};
  }
}

export function persistRuntimeConfig(
  nextConfig: RuntimeConfigOverrides,
  storage = getWindowLike()?.localStorage,
): void {
  if (!storage) return;

  storage.setItem(
    RUNTIME_CONFIG_STORAGE_KEY,
    JSON.stringify({
      apiBaseUrl: nextConfig.apiBaseUrl ? normalizeBackendUrl(nextConfig.apiBaseUrl) : '',
      wsBaseUrl: nextConfig.wsBaseUrl ? normalizeBackendUrl(nextConfig.wsBaseUrl) : '',
    }),
  );
}

export function clearPersistedRuntimeConfig(storage = getWindowLike()?.localStorage): void {
  storage?.removeItem(RUNTIME_CONFIG_STORAGE_KEY);
}

export function detectNativeApp(win = getWindowLike()): boolean {
  if (!win) return false;
  if (win.Capacitor?.isNativePlatform?.()) {
    return true;
  }
  return win.location?.protocol === 'capacitor:';
}

function detectLocalhost(win = getWindowLike()): boolean {
  if (!win?.location) return false;
  const host = win.location.host.split(':')[0];
  return host === 'localhost' || host === '127.0.0.1' || host === '::1' || host === '';
}

export function resolveRuntimeConfig(overrides: Partial<RuntimeConfig> = {}): RuntimeConfig {
  const win = getWindowLike();
  const storedConfig = readStoredRuntimeConfig(win?.localStorage);
  const windowConfig = win?.__TRANSCRIBE_EASY_CONFIG__ ?? {};
  const isHostedDemo = overrides.isHostedDemo ?? getEnvFlag('VITE_HOSTED_DEMO');
  const isNativeApp = overrides.isNativeApp ?? detectNativeApp(win);
  const isLocalhost = overrides.isLocalhost ?? detectLocalhost(win);
  const envApiBaseUrl = getEnvValue('VITE_API_BASE_URL');
  const envWsBaseUrl = getEnvValue('VITE_WS_BASE_URL');

  const apiBaseUrl = normalizeBackendUrl(
    overrides.apiBaseUrl ??
      storedConfig.apiBaseUrl ??
      windowConfig.apiBaseUrl ??
      envApiBaseUrl ??
      '',
  );
  const wsBaseUrl = normalizeBackendUrl(
    overrides.wsBaseUrl ??
      storedConfig.wsBaseUrl ??
      windowConfig.wsBaseUrl ??
      envWsBaseUrl ??
      '',
  );

  return {
    apiBaseUrl,
    isHostedDemo,
    isLocalhost,
    isNativeApp,
    wsBaseUrl,
  };
}

export function getClientRuntimeConfig(
  overrides: Partial<RuntimeConfig> = {},
): ClientRuntimeConfig {
  const runtimeConfig = resolveRuntimeConfig(overrides);

  return {
    ...runtimeConfig,
    hasReachableBackend: !runtimeConfig.isNativeApp || Boolean(runtimeConfig.apiBaseUrl),
  };
}

export function buildApiUrl(
  path: string,
  config: Pick<RuntimeConfig, 'apiBaseUrl' | 'isNativeApp' | 'wsBaseUrl'> = getClientRuntimeConfig(),
): string {
  if (!config.apiBaseUrl && config.isNativeApp) {
    return '';
  }

  return joinUrl(config.apiBaseUrl, path);
}

export function requireApiUrl(
  path: string,
  config: Pick<RuntimeConfig, 'apiBaseUrl' | 'isNativeApp' | 'wsBaseUrl'> = getClientRuntimeConfig(),
): string {
  const url = buildApiUrl(path, config);
  if (!url) {
    throw new Error(MOBILE_BACKEND_CONFIG_MESSAGE);
  }
  return url;
}

export function buildWebSocketUrl(
  path: string,
  config: Pick<RuntimeConfig, 'apiBaseUrl' | 'isNativeApp' | 'wsBaseUrl'> = getClientRuntimeConfig(),
): string {
  const explicitBaseUrl = config.wsBaseUrl || deriveWebSocketBaseUrl(config.apiBaseUrl);
  if (explicitBaseUrl) {
    return joinUrl(explicitBaseUrl, path);
  }

  if (config.isNativeApp) {
    return '';
  }

  const location = getWindowLike()?.location;
  if (location) {
    const protocol = location.protocol === 'https:' ? 'wss:' : 'ws:';
    const normalizedPath = path.startsWith('/') ? path : `/${path}`;
    return `${protocol}//${location.host}${normalizedPath}`;
  }

  return joinUrl('ws://localhost', path);
}

export function requireWebSocketUrl(
  path: string,
  config: Pick<RuntimeConfig, 'apiBaseUrl' | 'isNativeApp' | 'wsBaseUrl'> = getClientRuntimeConfig(),
): string {
  const url = buildWebSocketUrl(path, config);
  if (!url) {
    throw new Error(MOBILE_BACKEND_CONFIG_MESSAGE);
  }
  return url;
}

export function resolveMobileCapabilities(
  runtimeConfig: Pick<RuntimeConfig, 'isHostedDemo' | 'isNativeApp'>,
): MobileCapabilities {
  if (runtimeConfig.isNativeApp) {
    return {
      defaultAudioSource: 'microphone',
      defaultTranscriptionMode: 'web-speech',
      supportsBackendOverride: true,
      supportsOfflineMode: false,
      supportsSystemAudio: false,
    };
  }

  return {
    defaultAudioSource: 'microphone',
    defaultTranscriptionMode: 'web-speech',
    supportsBackendOverride: true,
    supportsOfflineMode: !runtimeConfig.isHostedDemo,
    supportsSystemAudio: true,
  };
}
