import { type ProviderId } from '../constants/providers';
import { type QualityTier } from '../constants/qualityTiers';
import { type PreferredMicrophoneMode } from '../config/transcriptionSupport';

const STORAGE_KEY = 'transcribe-easy:preferences';

/**
 * The subset of settings a user can pin as their personal defaults. Persisted to
 * localStorage so a reload (or returning to the hosted demo) restores the chosen
 * provider, model, and languages instead of resetting to the hard-coded defaults.
 *
 * Offline / Ollama state is intentionally excluded: restoring it would skip the
 * setup flow that the mode toggle drives, leaving the app half-initialized.
 */
export interface AppPreferences {
  sourceLanguage: string;
  targetLanguage: string;
  selectedProvider: ProviderId;
  selectedModel: string;
  whisperTier: QualityTier;
  ollamaTier: QualityTier;
  audioSource: 'microphone' | 'system';
  transcriptionBackendPreference: PreferredMicrophoneMode;
}

const RESTORABLE_PROVIDERS = new Set<ProviderId>(['openrouter', 'google-ai-studio', 'minimax']);
const QUALITY_TIERS = new Set<QualityTier>(['low', 'medium', 'high', 'high-star']);
const AUDIO_SOURCES = new Set<AppPreferences['audioSource']>(['microphone', 'system']);
const BACKEND_PREFERENCES = new Set<PreferredMicrophoneMode>(['web-speech', 'whisper']);

interface StorageLike {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

function getDefaultStorage(): StorageLike | undefined {
  try {
    return typeof localStorage !== 'undefined' ? localStorage : undefined;
  } catch {
    return undefined;
  }
}

/**
 * Validate untrusted localStorage data into a partial preferences object. Anything
 * unrecognized (stale enum value, wrong type, removed provider) is dropped so the
 * caller falls back to a safe default rather than restoring a broken setting.
 */
export function sanitizePreferences(raw: unknown): Partial<AppPreferences> {
  if (!raw || typeof raw !== 'object') {
    return {};
  }

  const data = raw as Record<string, unknown>;
  const prefs: Partial<AppPreferences> = {};

  if (typeof data.sourceLanguage === 'string') {
    prefs.sourceLanguage = data.sourceLanguage;
  }
  if (typeof data.targetLanguage === 'string') {
    prefs.targetLanguage = data.targetLanguage;
  }
  if (
    typeof data.selectedProvider === 'string'
    && RESTORABLE_PROVIDERS.has(data.selectedProvider as ProviderId)
  ) {
    prefs.selectedProvider = data.selectedProvider as ProviderId;
  }
  if (typeof data.selectedModel === 'string') {
    // The model is validated again against the live list on load (Sidebar effect),
    // which self-heals a model that has since been delisted.
    prefs.selectedModel = data.selectedModel;
  }
  if (typeof data.whisperTier === 'string' && QUALITY_TIERS.has(data.whisperTier as QualityTier)) {
    prefs.whisperTier = data.whisperTier as QualityTier;
  }
  if (typeof data.ollamaTier === 'string' && QUALITY_TIERS.has(data.ollamaTier as QualityTier)) {
    prefs.ollamaTier = data.ollamaTier as QualityTier;
  }
  if (
    typeof data.audioSource === 'string'
    && AUDIO_SOURCES.has(data.audioSource as AppPreferences['audioSource'])
  ) {
    prefs.audioSource = data.audioSource as AppPreferences['audioSource'];
  }
  if (
    typeof data.transcriptionBackendPreference === 'string'
    && BACKEND_PREFERENCES.has(data.transcriptionBackendPreference as PreferredMicrophoneMode)
  ) {
    prefs.transcriptionBackendPreference = data.transcriptionBackendPreference as PreferredMicrophoneMode;
  }

  return prefs;
}

export function loadPreferences(
  storage = getDefaultStorage(),
): Partial<AppPreferences> {
  if (!storage) return {};

  try {
    const raw = storage.getItem(STORAGE_KEY);
    return raw ? sanitizePreferences(JSON.parse(raw)) : {};
  } catch {
    return {};
  }
}

export function savePreferences(
  prefs: AppPreferences,
  storage = getDefaultStorage(),
): void {
  if (!storage) return;

  try {
    storage.setItem(STORAGE_KEY, JSON.stringify(prefs));
  } catch {
    // localStorage unavailable or quota exceeded — silently skip.
  }
}

export function clearPreferences(storage = getDefaultStorage()): void {
  try {
    storage?.removeItem(STORAGE_KEY);
  } catch {
    // Ignore — clearing is best-effort.
  }
}
