import { useState, useEffect, type ReactNode } from 'react';
import { useModels } from '../hooks/useModels';
import { useDeviceAudioStatus } from '../hooks/useDeviceAudioStatus';
import { LANGUAGES } from '../constants/languages';
import {
  getPreferredModelForProvider,
  PROVIDERS,
  type ProviderId,
} from '../constants/providers';
import {
  type QualityTier,
  QUALITY_TIER_LABELS,
  WHISPER_TIER_RAM,
  OLLAMA_TIER_RAM,
} from '../constants/qualityTiers';
import {
  buildApiUrl,
  clearPersistedRuntimeConfig,
  persistRuntimeConfig,
  type RuntimeConfig,
} from '../config/runtime';
import { type PreferredMicrophoneMode, type TranscriptionSupport } from '../config/transcriptionSupport';

interface SetupStatus {
  step: string;
  progress: number;
  error: string | null;
}

interface SidebarProps {
  selectedProvider: string;
  onProviderChange: (id: string) => void;
  selectedModel: string;
  onModelChange: (id: string) => void;
  sourceLanguage: string;
  onSourceLanguageChange: (code: string) => void;
  targetLanguage: string;
  onTargetLanguageChange: (code: string) => void;
  isOffline: boolean;
  onOfflineChange: (offline: boolean) => void;
  whisperTier: QualityTier;
  onWhisperTierChange: (tier: QualityTier) => void;
  ollamaTier: QualityTier;
  onOllamaTierChange: (tier: QualityTier) => void;
  audioSource: 'microphone' | 'system';
  onAudioSourceChange: (source: 'microphone' | 'system') => void;
  transcriptionBackendPreference: PreferredMicrophoneMode;
  onTranscriptionBackendPreferenceChange: (mode: PreferredMicrophoneMode) => void;
  runtimeConfig: RuntimeConfig;
  transcriptionSupport: TranscriptionSupport;
  onSaveDefaults: () => void;
  onResetDefaults: () => void;
}

const STEP_LABELS: Record<string, string> = {
  detecting: 'Checking for Ollama…',
  'downloading-ollama': 'Downloading Ollama (~80 MB)…',
  'starting-ollama': 'Starting Ollama server…',
  'pulling-model': 'Pulling AI models…',
  'downloading-whisper': 'Downloading transcription models…',
  ready: 'Ready',
  error: 'Setup failed',
};

const TIER_BUTTON_CLASS = (active: boolean) =>
  `flex-1 py-1.5 transition-colors ${
    active
      ? 'bg-amber-500 text-white'
      : 'bg-white dark:bg-gray-900 text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800'
  }`;

export function Sidebar({
  selectedProvider,
  onProviderChange,
  selectedModel,
  onModelChange,
  sourceLanguage,
  onSourceLanguageChange,
  targetLanguage,
  onTargetLanguageChange,
  isOffline,
  onOfflineChange,
  whisperTier,
  onWhisperTierChange,
  ollamaTier,
  onOllamaTierChange,
  audioSource,
  onAudioSourceChange,
  transcriptionBackendPreference,
  onTranscriptionBackendPreferenceChange,
  runtimeConfig,
  transcriptionSupport,
  onSaveDefaults,
  onResetDefaults,
}: SidebarProps) {
  const [isOpen, setIsOpen] = useState(true);
  const [isHostedAdvancedCollapsed, setIsHostedAdvancedCollapsed] = useState(true);
  const [setupStatus, setSetupStatus] = useState<SetupStatus | null>(null);
  const [ollamaRunning, setOllamaRunning] = useState<boolean | null>(null);
  const [apiBaseUrlInput, setApiBaseUrlInput] = useState(runtimeConfig.apiBaseUrl);
  const [wsBaseUrlInput, setWsBaseUrlInput] = useState(runtimeConfig.wsBaseUrl);
  const [runtimeConfigMessage, setRuntimeConfigMessage] = useState<string | null>(null);

  const provider = isOffline ? 'ollama' : selectedProvider;
  const { models, isLoading, error, refetch } = useModels(provider, runtimeConfig);

  useEffect(() => {
    setApiBaseUrlInput(runtimeConfig.apiBaseUrl);
    setWsBaseUrlInput(runtimeConfig.wsBaseUrl);
  }, [runtimeConfig.apiBaseUrl, runtimeConfig.wsBaseUrl]);

  useEffect(() => {
    if (isLoading || error || models.length === 0) return;
    const exists = models.some((m) => m.id === selectedModel);
    if (!exists) {
      const preferred = getPreferredModelForProvider(provider as ProviderId);
      const preferredModel = models.find((model) => model.id === preferred);
      onModelChange(preferredModel?.id ?? models[0].id);
    }
  }, [isLoading, error, models, selectedModel, onModelChange]);

  useEffect(() => {
    if (isOffline) return;
    setSetupStatus(null);
    setOllamaRunning(null);
  }, [isOffline]);

  // Poll setup status while offline and not ready
  useEffect(() => {
    if (!isOffline) return;

    const poll = async () => {
      try {
        const res = await fetch(buildApiUrl('/api/setup/status', runtimeConfig));
        if (res.ok) setSetupStatus((await res.json()) as SetupStatus);
      } catch {
        // ignore transient errors
      }
    };

    poll();
    const id = setInterval(poll, 1000);
    return () => clearInterval(id);
  }, [isOffline, runtimeConfig]);

  // Poll Ollama connectivity in offline mode
  useEffect(() => {
    if (!isOffline) return;

    const check = async () => {
      try {
        const res = await fetch(buildApiUrl('/api/ollama/status', runtimeConfig));
        if (res.ok) {
          const data = (await res.json()) as { running: boolean };
          setOllamaRunning(data.running);
        }
      } catch {
        setOllamaRunning(false);
      }
    };

    check();
    const id = setInterval(check, 3000);
    return () => clearInterval(id);
  }, [isOffline, runtimeConfig]);

  // Refetch models when setup finishes
  useEffect(() => {
    if (setupStatus?.step === 'ready' && provider === 'ollama') {
      refetch();
    }
  }, [setupStatus?.step, provider, refetch]);

  const handleModeToggle = (offline: boolean) => {
    if (offline && !transcriptionSupport.supportsOfflineMode) return;

    onOfflineChange(offline);
    onModelChange('');
    if (offline) {
      setSetupStatus({ step: 'detecting', progress: 0, error: null });
      onProviderChange('ollama');
      fetch(buildApiUrl('/api/setup/start', runtimeConfig), { method: 'POST' }).catch(() => null);
    } else {
      onProviderChange('openrouter');
    }
  };

  const handleSaveRuntimeConfig = () => {
    try {
      persistRuntimeConfig({
        apiBaseUrl: apiBaseUrlInput,
        wsBaseUrl: wsBaseUrlInput,
      });
      setRuntimeConfigMessage('Backend saved. Reloading…');
      window.location.reload();
    } catch {
      setRuntimeConfigMessage('Enter valid backend URLs before saving.');
    }
  };

  const handleClearRuntimeConfig = () => {
    clearPersistedRuntimeConfig();
    setRuntimeConfigMessage('Backend override cleared. Reloading…');
    window.location.reload();
  };

  const isSetupDone = setupStatus?.step === 'ready';
  const isSetupError = setupStatus?.step === 'error';
  const showSetupCard = isOffline && setupStatus && !isSetupDone;
  const emptyModelsMessage =
    provider === 'google-ai-studio'
      ? 'No Google AI Studio text models are available right now.'
      : provider === 'minimax'
      ? 'MiniMax is not configured. Set MINIMAX_API_KEY.'
      : provider === 'ollama'
      ? 'No models found.'
      : 'No live-safe OpenRouter models are available right now.';
  const selectedProviderLabel =
    selectedProvider === 'google-ai-studio' ? 'Gemini'
    : PROVIDERS.find((item) => item.id === selectedProvider)?.name ?? selectedProvider;
  const selectedModelLabel =
    (models.find((model) => model.id === selectedModel)?.name ?? selectedModel) ||
    'Loading models...';
  const selectedBackendLabel =
    transcriptionBackendPreference === 'whisper' ? 'Whisper tiny' : 'Browser Speech';
  const hostedAdvancedSummary = [selectedBackendLabel, selectedProviderLabel, selectedModelLabel]
    .filter(Boolean)
    .join(' • ');

  return (
    <div
      className={`flex-shrink-0 flex flex-col border-r border-gray-200 dark:border-gray-800 bg-gray-50 dark:bg-gray-950 transition-all duration-200 ${
        isOpen ? 'w-64' : 'w-12'
      }`}
    >
      <div className="flex h-16 items-center justify-between border-b border-gray-200 px-6 dark:border-gray-800">
        {isOpen && (
          <span className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">
            Settings
          </span>
        )}
        <button
          type="button"
          onClick={() => setIsOpen((v) => !v)}
          className="ml-auto p-1 rounded hover:bg-gray-200 dark:hover:bg-gray-800 text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 transition-colors"
          aria-label={isOpen ? 'Collapse sidebar' : 'Expand sidebar'}
        >
          {isOpen ? <ChevronLeftIcon /> : <ChevronRightIcon />}
        </button>
      </div>

      {isOpen && (
        <div className="flex flex-col gap-5 px-3 py-4 overflow-y-auto">

          {/* Mobile Backend (native only) */}
          {runtimeConfig.isNativeApp && (
            <Section label="Mobile Backend">
              <div className="rounded-lg border border-sky-200 bg-sky-50 px-3 py-3 text-xs text-sky-800 dark:border-sky-900/60 dark:bg-sky-950/40 dark:text-sky-200">
                Capacitor runs the web app locally, so mobile builds must point to a hosted backend for
                <span className="font-mono"> /api/* </span>and<span className="font-mono"> /ws/transcribe</span>.
              </div>
              <input value={apiBaseUrlInput} onChange={(e) => setApiBaseUrlInput(e.target.value)} className={selectClass} placeholder="https://api.example.com" spellCheck={false} />
              <input value={wsBaseUrlInput} onChange={(e) => setWsBaseUrlInput(e.target.value)} className={selectClass} placeholder="Optional: wss://stream.example.com" spellCheck={false} />
              <div className="flex gap-2">
                <button type="button" onClick={handleSaveRuntimeConfig} className="flex-1 rounded-lg bg-sky-600 px-2 py-1.5 text-xs font-semibold text-white transition-colors hover:bg-sky-500">Save</button>
                <button type="button" onClick={handleClearRuntimeConfig} className="rounded-lg border border-gray-200 px-2 py-1.5 text-xs font-semibold text-gray-600 transition-colors hover:bg-gray-100 dark:border-gray-700 dark:text-gray-300 dark:hover:bg-gray-800">Clear</button>
              </div>
              {(runtimeConfigMessage || (!runtimeConfig.apiBaseUrl && runtimeConfig.isNativeApp)) && (
                <p className="text-xs text-gray-500 dark:text-gray-400">
                  {runtimeConfigMessage ?? 'Add a backend URL to load models, translations, reports, and Whisper fallback on mobile.'}
                </p>
              )}
            </Section>
          )}

          {!runtimeConfig.isHostedDemo && (
            <div className="flex flex-col gap-2">
              <div className="flex rounded-lg overflow-hidden border border-gray-200 dark:border-gray-700 text-xs font-semibold">
                <button
                  type="button"
                  onClick={() => handleModeToggle(false)}
                  className={`flex-1 py-1.5 transition-colors ${!isOffline ? 'bg-blue-600 text-white' : 'bg-white dark:bg-gray-900 text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800'}`}
                >
                  Online
                </button>
                <button
                  type="button"
                  onClick={() => handleModeToggle(true)}
                  disabled={!transcriptionSupport.supportsOfflineMode}
                  className={`flex-1 py-1.5 flex items-center justify-center gap-1.5 transition-colors ${
                    isOffline
                      ? 'bg-amber-500 text-white'
                      : transcriptionSupport.supportsOfflineMode
                      ? 'bg-white dark:bg-gray-900 text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800'
                      : 'bg-gray-100 dark:bg-gray-900 text-gray-300 dark:text-gray-700 cursor-not-allowed'
                  }`}
                >
                  Offline
                  {isOffline && (
                    <span className={`h-1.5 w-1.5 rounded-full ${ollamaRunning === true ? 'bg-green-300' : ollamaRunning === false ? 'bg-red-300' : 'bg-white/50'}`} />
                  )}
                </button>
              </div>
              {!transcriptionSupport.supportsOfflineMode && (
                <p className="text-xs text-gray-400 dark:text-gray-600">Offline mode is desktop-only.</p>
              )}
            </div>
          )}

          {!runtimeConfig.isHostedDemo && (
            <AudioInputSection
              audioSource={audioSource}
              onAudioSourceChange={onAudioSourceChange}
              transcriptionSupport={transcriptionSupport}
              runtimeConfig={runtimeConfig}
            />
          )}

          {/* Setup progress card */}
          {showSetupCard && (
            <div className="rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 px-3 py-3 flex flex-col gap-2">
              <div className="flex items-center gap-1.5 text-xs font-semibold text-gray-700 dark:text-gray-300">
                <GearIcon /> First-time setup
              </div>
              {isSetupError ? (
                <>
                  <p className="text-xs text-red-500 break-words">{setupStatus.error}</p>
                  <button type="button" onClick={() => fetch(buildApiUrl('/api/setup/start', runtimeConfig), { method: 'POST' }).catch(() => null)} className="text-xs text-blue-500 hover:underline text-left">Retry</button>
                </>
              ) : (
                <>
                  <div className="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-1.5">
                    <div className="bg-blue-500 h-1.5 rounded-full transition-all duration-300" style={{ width: `${setupStatus.progress}%` }} />
                  </div>
                  <p className="text-xs text-gray-500 dark:text-gray-400">{STEP_LABELS[setupStatus.step] ?? setupStatus.step}</p>
                </>
              )}
            </div>
          )}

          {runtimeConfig.isHostedDemo && !isOffline ? (
            <CollapsibleSection
              collapsed={isHostedAdvancedCollapsed}
              label="Advanced settings"
              onToggle={() => setIsHostedAdvancedCollapsed((current) => !current)}
              summary={hostedAdvancedSummary}
            >
              <>
                {audioSource === 'microphone' && transcriptionSupport.supportsRemoteWhisper && (
                  <Section label="Transcription Backend">
                    <div className="flex rounded-lg overflow-hidden border border-gray-200 dark:border-gray-700 text-xs font-semibold">
                      <button
                        type="button"
                        onClick={() => onTranscriptionBackendPreferenceChange('web-speech')}
                        disabled={!transcriptionSupport.supportsWebSpeechRecognition}
                        className={`flex-1 py-1.5 transition-colors ${
                          transcriptionBackendPreference === 'web-speech'
                            ? 'bg-blue-600 text-white'
                            : transcriptionSupport.supportsWebSpeechRecognition
                            ? 'bg-white dark:bg-gray-900 text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800'
                            : 'bg-gray-100 dark:bg-gray-900 text-gray-300 dark:text-gray-700 cursor-not-allowed'
                        }`}
                      >
                        Browser Speech
                      </button>
                      <button
                        type="button"
                        onClick={() => onTranscriptionBackendPreferenceChange('whisper')}
                        className={`flex-1 py-1.5 transition-colors ${
                          transcriptionBackendPreference === 'whisper'
                            ? 'bg-blue-600 text-white'
                            : 'bg-white dark:bg-gray-900 text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800'
                        }`}
                      >
                        Whisper tiny
                      </button>
                    </div>
                  </Section>
                )}
                <Section label="Provider">
                <div className="flex rounded-lg overflow-hidden border border-gray-200 dark:border-gray-700 text-xs font-semibold">
                  {PROVIDERS.filter((p) => p.id !== 'ollama').map((p) => (
                    <button
                      key={p.id}
                      type="button"
                      onClick={() => { onProviderChange(p.id); onModelChange(''); }}
                      className={`flex-1 py-1.5 transition-colors ${selectedProvider === p.id ? 'bg-blue-600 text-white' : 'bg-white dark:bg-gray-900 text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800'}`}
                    >
                      {p.id === 'google-ai-studio' ? 'Gemini' : p.name}
                    </button>
                  ))}
                </div>
                </Section>
                <Section label="Model">
                {isLoading && <p className="text-xs text-gray-500 dark:text-gray-400">Loading models…</p>}
                {error && <p className="text-xs text-red-400">{error}</p>}
                {!isLoading && !error && models.length === 0 && <p className="text-xs text-gray-500 dark:text-gray-400">{emptyModelsMessage}</p>}
                {!isLoading && !error && models.length > 0 && (
                  <select value={selectedModel} onChange={(e) => onModelChange(e.target.value)} className={selectClass}>
                    {models.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
                  </select>
                )}
                </Section>
                <DefaultsSection onSaveDefaults={onSaveDefaults} onResetDefaults={onResetDefaults} />
              </>
            </CollapsibleSection>
          ) : (
            <>
              {/* Provider — buttons when online, implied Local when offline */}
              {!isOffline && (
                <Section label="Provider">
                  <div className="flex rounded-lg overflow-hidden border border-gray-200 dark:border-gray-700 text-xs font-semibold">
                    {PROVIDERS.filter((p) => p.id !== 'ollama').map((p) => (
                      <button
                        key={p.id}
                        type="button"
                        onClick={() => { onProviderChange(p.id); onModelChange(''); }}
                        className={`flex-1 py-1.5 transition-colors ${selectedProvider === p.id ? 'bg-blue-600 text-white' : 'bg-white dark:bg-gray-900 text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800'}`}
                      >
                        {p.id === 'google-ai-studio' ? 'Gemini' : p.name}
                      </button>
                    ))}
                  </div>
                </Section>
              )}

              {/* Model — tier buttons offline, dropdown online */}
              <Section label="Model">
                {isOffline ? (
                  <>
                    <div className="flex rounded-lg overflow-hidden border border-gray-200 dark:border-gray-700 text-xs font-semibold">
                      {(['low', 'medium', 'high'] as QualityTier[]).map((tier) => (
                        <button key={tier} type="button" onClick={() => onOllamaTierChange(tier)} className={TIER_BUTTON_CLASS(ollamaTier === tier)}>
                          {QUALITY_TIER_LABELS[tier]}
                        </button>
                      ))}
                    </div>
                    <p className="text-xs text-gray-400 dark:text-gray-600">{OLLAMA_TIER_RAM[ollamaTier]}</p>
                  </>
                ) : (
                  <>
                    {isLoading && <p className="text-xs text-gray-500 dark:text-gray-400">Loading models…</p>}
                    {error && <p className="text-xs text-red-400">{error}</p>}
                    {!isLoading && !error && models.length === 0 && <p className="text-xs text-gray-500 dark:text-gray-400">{emptyModelsMessage}</p>}
                    {!isLoading && !error && models.length > 0 && (
                      <select value={selectedModel} onChange={(e) => onModelChange(e.target.value)} className={selectClass}>
                        {models.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
                      </select>
                    )}
                  </>
                )}
              </Section>
            </>
          )}

          {/* Whisper quality — offline only */}
          {isOffline && (
            <Section label="Transcription Quality">
              <div className="flex rounded-lg overflow-hidden border border-gray-200 dark:border-gray-700 text-xs font-semibold">
                {(['low', 'medium', 'high', ...(runtimeConfig.isLocalhost ? ['high-star' as QualityTier] : [])] as QualityTier[]).map((tier) => (
                    <button key={tier} type="button" onClick={() => onWhisperTierChange(tier)} className={TIER_BUTTON_CLASS(whisperTier === tier)}>
                      {QUALITY_TIER_LABELS[tier]}
                      {tier === 'high-star' && (
                        <span className="ml-0.5 px-0.5 py-px text-[7px] font-bold rounded bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-400 uppercase tracking-wider leading-none">β</span>
                      )}
                  </button>
                ))}
              </div>
              <p className="text-xs text-gray-400 dark:text-gray-600">{WHISPER_TIER_RAM[whisperTier]}</p>
            </Section>
          )}

          {whisperTier !== 'high-star' && (
          <Section label="Input Language">
            <select value={sourceLanguage} onChange={(e) => onSourceLanguageChange(e.target.value)} className={selectClass}>
              {LANGUAGES.map((l) => <option key={l.code} value={l.code}>{l.name}</option>)}
            </select>
          </Section>
          )}

          <Section label="Output Language">
            <select value={targetLanguage} onChange={(e) => onTargetLanguageChange(e.target.value)} className={selectClass}>
              {LANGUAGES.map((l) => <option key={l.code} value={l.code}>{l.name}</option>)}
            </select>
          </Section>

          {/* Local / offline modes have no collapsible menu, so show defaults inline. */}
          {!(runtimeConfig.isHostedDemo && !isOffline) && (
            <DefaultsSection onSaveDefaults={onSaveDefaults} onResetDefaults={onResetDefaults} />
          )}
        </div>
      )}
    </div>
  );
}

const selectClass =
  'w-full bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-lg px-2 py-1.5 text-xs text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-500';

function AudioInputSection({
  audioSource,
  onAudioSourceChange,
  transcriptionSupport,
  runtimeConfig,
}: {
  audioSource: 'microphone' | 'system';
  onAudioSourceChange: (source: 'microphone' | 'system') => void;
  transcriptionSupport: TranscriptionSupport;
  runtimeConfig: RuntimeConfig;
}) {
  const { status } = useDeviceAudioStatus(runtimeConfig);
  const isMac = status?.platform === 'darwin';
  const swiftAvailable = isMac && status?.available;
  const showDeviceCapture = runtimeConfig.isLocalhost;

  return (
    <Section label="Audio Input">
      <div className={`flex rounded-lg overflow-hidden border border-gray-200 dark:border-gray-700 text-xs font-semibold ${!showDeviceCapture ? 'border-transparent' : ''}`}>
        <button
          type="button"
          onClick={() => onAudioSourceChange('microphone')}
          className={`flex-1 py-1.5 flex items-center justify-center gap-1.5 transition-colors ${audioSource === 'microphone' ? 'bg-blue-600 text-white' : 'bg-white dark:bg-gray-900 text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800'}`}
        >
          <MicSmallIcon /> Mic
        </button>
        {showDeviceCapture && (
          <button
            type="button"
            onClick={() => onAudioSourceChange('system')}
            disabled={!transcriptionSupport.supportsSystemAudioCapture}
            className={`flex-1 py-1.5 flex items-center justify-center gap-1.5 transition-colors ${
              audioSource === 'system'
                ? 'bg-blue-600 text-white'
                : transcriptionSupport.supportsSystemAudioCapture
                ? 'bg-white dark:bg-gray-900 text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800'
                : 'bg-gray-100 dark:bg-gray-900 text-gray-300 dark:text-gray-700 cursor-not-allowed'
            }`}
          >
            <MonitorIcon /> Device <span className="ml-1 px-1 py-px text-[8px] font-semibold rounded bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-400 uppercase tracking-wider">Beta</span>
          </button>
        )}
      </div>
      {audioSource === 'system' && swiftAvailable && (
        <p className="text-xs text-gray-400 dark:text-gray-600">
          Captures any audio playing on your Mac — YouTube, VLC, games, etc. No virtual audio cable needed.
        </p>
      )}
      {audioSource === 'system' && isMac && !swiftAvailable && status && (
        <p className="text-xs text-amber-600 dark:text-amber-400">
          macOS Screen Recording permission required. Grant it in System Settings &gt; Privacy &amp; Security &gt; Screen Recording for your terminal app, then restart the backend.
        </p>
      )}
      {audioSource === 'system' && !isMac && status?.available && (
        <p className="text-xs text-gray-400 dark:text-gray-600">
          Captures audio playing on your computer.
        </p>
      )}
      {audioSource === 'system' && status && !status.available && status.reason && (
        <p className="text-xs text-red-500 dark:text-red-400">
          {status.reason}
        </p>
      )}
      {!transcriptionSupport.supportsSystemAudioCapture && (
        <p className="text-xs text-gray-400 dark:text-gray-600">Mobile-safe mode records from the microphone only.</p>
      )}
    </Section>
  );
}

function DefaultsSection({
  onSaveDefaults,
  onResetDefaults,
}: {
  onSaveDefaults: () => void;
  onResetDefaults: () => void;
}) {
  const [defaultsSaved, setDefaultsSaved] = useState(false);

  // Briefly confirm a save, then clear the badge.
  useEffect(() => {
    if (!defaultsSaved) return;
    const id = setTimeout(() => setDefaultsSaved(false), 2000);
    return () => clearTimeout(id);
  }, [defaultsSaved]);

  const handleSave = () => {
    onSaveDefaults();
    setDefaultsSaved(true);
  };

  const handleReset = () => {
    onResetDefaults();
    setDefaultsSaved(false);
  };

  return (
    <Section label="Defaults">
      <div className="flex gap-2">
        <button
          type="button"
          onClick={handleSave}
          className="flex-1 rounded-lg bg-blue-600 px-2 py-1.5 text-xs font-semibold text-white transition-colors hover:bg-blue-500"
        >
          {defaultsSaved ? 'Saved ✓' : 'Save as default'}
        </button>
        <button
          type="button"
          onClick={handleReset}
          className="rounded-lg border border-gray-200 px-2 py-1.5 text-xs font-semibold text-gray-600 transition-colors hover:bg-gray-100 dark:border-gray-700 dark:text-gray-300 dark:hover:bg-gray-800"
        >
          Reset
        </button>
      </div>
      <p className="text-xs text-gray-400 dark:text-gray-600">
        Remembers your provider, model, and languages on this browser for next time.
      </p>
    </Section>
  );
}

function Section({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex flex-col gap-2">
      <span className="text-xs font-medium text-gray-500 dark:text-gray-400">{label}</span>
      {children}
    </div>
  );
}

function CollapsibleSection({
  children,
  collapsed,
  label,
  onToggle,
  summary,
}: {
  children: ReactNode;
  collapsed: boolean;
  label: string;
  onToggle: () => void;
  summary: string;
}) {
  return (
    <div className="flex flex-col gap-2">
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={!collapsed}
        className="flex items-center justify-between gap-3 rounded-lg border border-gray-200 bg-white px-3 py-2 text-left transition-colors hover:bg-gray-100 dark:border-gray-700 dark:bg-gray-900 dark:hover:bg-gray-800"
      >
        <div className="min-w-0">
          <div className="text-xs font-medium text-gray-500 dark:text-gray-400">{label}</div>
          <div className="truncate text-xs font-semibold text-gray-900 dark:text-gray-100">{summary}</div>
        </div>
        <span
          className={`shrink-0 text-gray-400 transition-transform ${collapsed ? '' : 'rotate-90'}`}
          aria-hidden="true"
        >
          <ChevronRightIcon />
        </span>
      </button>
      {!collapsed && children}
    </div>
  );
}

function ChevronLeftIcon() {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      className="h-4 w-4"
    >
      <path d="m15 18-6-6 6-6" />
    </svg>
  );
}

function ChevronRightIcon() {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      className="h-4 w-4"
    >
      <path d="m9 18 6-6-6-6" />
    </svg>
  );
}

function MicSmallIcon() {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none"
      stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round"
      className="h-3 w-3">
      <path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3Z" />
      <path d="M19 10v2a7 7 0 0 1-14 0v-2" />
      <line x1="12" x2="12" y1="19" y2="22" />
    </svg>
  );
}

function MonitorIcon() {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none"
      stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round"
      className="h-3 w-3">
      <rect x="2" y="3" width="20" height="14" rx="2" />
      <path d="M8 21h8M12 17v4" />
    </svg>
  );
}

function GearIcon() {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      className="h-3.5 w-3.5"
    >
      <path d="M12 20a8 8 0 1 0 0-16 8 8 0 0 0 0 16Z" />
      <path d="M12 14a2 2 0 1 0 0-4 2 2 0 0 0 0 4Z" />
      <path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M6.34 17.66l-1.41 1.41M19.07 4.93l-1.41 1.41" />
    </svg>
  );
}
