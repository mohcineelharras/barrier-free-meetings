import { useState, useCallback, useRef, useEffect, useMemo } from 'react';
import { Eye, EyeOff } from 'lucide-react';
import { type TranscriptSegment } from './hooks/useSpeechToText';
import { useSTT } from './hooks/useSTT';
import { useTheme } from './hooks/useTheme';
import { sessionHasCurrentReport, useHistory, type SavedSession } from './hooks/useHistory';
import { clearPreferences, loadPreferences, savePreferences } from './hooks/usePreferences';
import { getWhisperErrorDismissMs } from './hooks/whisperInterruption';
import { useRecordingGuard } from './hooks/useRecordingGuard';
import {
  isTranslationRateLimitError,
  translateText,
} from './services/openrouter';
import { generateReport } from './services/report';
import { Sidebar } from './components/Sidebar';
import { ReportPanel } from './components/ReportPanel';
import { HistoryPanel } from './components/HistoryPanel';
import { hasAutoReportReadySegments, shouldQueueAutoReport } from './components/autoReportState';
import { getConversationPaneClasses } from './components/conversationLayout';
import { getReportActionState, type AutoReportStatus } from './components/reportActionState';
import { getLanguageName } from './constants/languages';
import {
  DEFAULT_PROVIDER,
  DEFAULT_MODEL,
  GOOGLE_AI_STUDIO_DEFAULT_MODEL,
} from './constants/providers';
import {
  type QualityTier,
  WHISPER_TIER_MODEL,
  OLLAMA_TIER_MODEL,
} from './constants/qualityTiers';
import {
  buildApiUrl,
  getClientRuntimeConfig,
  resolveMobileCapabilities,
} from './config/runtime';
import {
  type PreferredMicrophoneMode,
  resolveRecordingMode,
  resolveRuntimeTranscriptionSupport,
} from './config/transcriptionSupport';
import { isScriptMatching } from './utils/languageMatcher';

export const DEFAULT_CONFIDENCE_THRESHOLD = 80;

export function isQualityButtonSelected({ showConfidence }: { showConfidence: boolean }) {
  return showConfidence;
}

export default function App() {
  const [runtimeConfig] = useState(() => getClientRuntimeConfig());
  const mobileCapabilities = resolveMobileCapabilities(runtimeConfig);
  const transcriptionSupport = resolveRuntimeTranscriptionSupport(runtimeConfig);
  const { theme, resolvedTheme, toggleTheme } = useTheme();
  const [segments, setSegments] = useState<TranscriptSegment[]>([]);
  const [showConfidence, setShowConfidence] = useState(false);
  const [confidenceThreshold, setConfidenceThreshold] = useState(DEFAULT_CONFIDENCE_THRESHOLD);
  // Some browsers (Safari, Brave with the speech service disabled, server Whisper) don't
  // expose confidence scores — they always return 0. We watch for that pattern and surface
  // a hint in the quality popover so users don't think the threshold slider is broken.
  const CONFIDENCE_UNSUPPORTED_AFTER_SEGMENTS = 5;
  const zeroConfidenceCountRef = useRef(0);
  const [isConfidenceUnsupported, setIsConfidenceUnsupported] = useState(false);
  // User-pinned defaults (provider, model, languages, …) restored from localStorage,
  // falling back to the hard-coded defaults below when nothing was saved.
  const [storedPreferences] = useState(loadPreferences);
  const defaultWhisperTier: QualityTier = runtimeConfig.isHostedDemo ? 'low' : 'medium';
  const defaultBackendPreference: PreferredMicrophoneMode =
    transcriptionSupport.supportsWebSpeechRecognition ? 'web-speech' : 'whisper';
  const [sourceLanguage, setSourceLanguage] = useState(storedPreferences.sourceLanguage ?? 'zh-CN');
  const [targetLanguage, setTargetLanguage] = useState(storedPreferences.targetLanguage ?? 'fr-FR');
  const [selectedProvider, setSelectedProvider] = useState(storedPreferences.selectedProvider ?? DEFAULT_PROVIDER);
  const [selectedModel, setSelectedModel] = useState(storedPreferences.selectedModel ?? DEFAULT_MODEL);
  const [isOffline, setIsOffline] = useState(false);
  const [whisperTier, setWhisperTierState] = useState<QualityTier>(
    storedPreferences.whisperTier ?? defaultWhisperTier,
  );
  const [ollamaTier, setOllamaTier] = useState<QualityTier>(storedPreferences.ollamaTier ?? 'medium');
  const [audioSource, setAudioSource] = useState<'microphone' | 'system'>(
    storedPreferences.audioSource ?? mobileCapabilities.defaultAudioSource,
  );
  const [transcriptionBackendPreference, setTranscriptionBackendPreference] = useState<PreferredMicrophoneMode>(
    storedPreferences.transcriptionBackendPreference ?? defaultBackendPreference,
  );
  const recordingMode = resolveRecordingMode({
    audioSource,
    isOffline,
    preferredMicrophoneMode: runtimeConfig.isHostedDemo ? transcriptionBackendPreference : undefined,
    support: transcriptionSupport,
  });

  const handleWhisperTierChange = useCallback(async (tier: QualityTier) => {
    stopRecordingRef.current();
    setWhisperTierState(tier);
    if (runtimeConfig.isNativeApp && !runtimeConfig.apiBaseUrl) {
      return;
    }

    try {
      const task = tier === 'high-star' ? 'translate' : 'transcribe';
      await fetch(buildApiUrl('/api/whisper/model', runtimeConfig), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ model: WHISPER_TIER_MODEL[tier], task }),
      });
    } catch {
      // non-critical — server will use the default if this fails
    }
  }, [runtimeConfig]);

  const handleOllamaTierChange = useCallback((tier: QualityTier) => {
    setOllamaTier(tier);
    setSelectedModel(OLLAMA_TIER_MODEL[tier]);
  }, []);

  const stopRecordingRef = useRef<() => void>(() => {});
  const transcriptScrollRef = useRef<HTMLDivElement>(null);
  const translationScrollRef = useRef<HTMLDivElement>(null);
  const [visibleError, setVisibleError] = useState<string | null>(null);
  const [showReport, setShowReport] = useState(false);
  const [showHistory, setShowHistory] = useState(false);
  const [isQualityPanelOpen, setIsQualityPanelOpen] = useState(false);
  const qualityPanelRef = useRef<HTMLDivElement>(null);
  const [isTranscriptHidden, setIsTranscriptHidden] = useState(false);
  const [autoSaveEnabled, setAutoSaveEnabled] = useState(true);
  const [autoReportStatus, setAutoReportStatus] = useState<AutoReportStatus>('idle');
  const [autoReportMessage, setAutoReportMessage] = useState<string | null>(null);
  const [translationFallbackMessage, setTranslationFallbackMessage] = useState<string | null>(null);
  const currentSessionIdRef = useRef<string | null>(null);
  const lastReportedSessionKeyRef = useRef<string | null>(null);
  const pendingAutoReportRef = useRef(false);
  const wasRecordingRef = useRef(false);

  const { sessions, saveSession, saveReport, deleteSession, clearHistory } = useHistory();
  const backendReady = runtimeConfig.hasReachableBackend;
  const translationAvailable = backendReady && Boolean(selectedModel);
  const recordDisabledReason = transcriptionSupport.recordingDisabledReason;
  const isRecordDisabled =
    Boolean(recordDisabledReason) || (backendReady ? !selectedModel : false);
  const mobileStatusMessage = runtimeConfig.isNativeApp
    ? backendReady
      ? recordingMode === 'web-speech'
        ? 'Capacitor mobile safe mode is active. Microphone transcription stays local when browser speech is available. Translation and reports use the configured backend, while device audio and offline mode remain disabled.'
        : 'Capacitor mobile safe mode is active. This WebView is using backend Whisper for microphone transcription. Device audio and offline mode remain disabled.'
      : transcriptionSupport.supportsWebSpeechRecognition
      ? 'Capacitor mobile safe mode is active. Microphone transcription can still run with browser speech recognition, but translation, reports, and Whisper fallback need a hosted backend.'
      : 'Capacitor mobile safe mode is active. Add a hosted backend in Mobile Backend to enable transcription in this WebView. Device audio and offline mode remain disabled.'
    : runtimeConfig.isHostedDemo
    ? null
    : recordingMode === 'whisper' && !isOffline && audioSource === 'microphone'
    ? 'Browser speech recognition is unavailable here, so microphone transcription will use the Whisper backend instead.'
    : null;
  const sttBadgeLabel = !transcriptionSupport.canStartRecording
    ? 'No STT available'
    : runtimeConfig.isHostedDemo && recordingMode === 'whisper'
    ? 'Whisper tiny'
    : recordingMode === 'whisper'
    ? 'Whisper backend'
    : 'Web Speech';
  const sttBadgeClassName = !transcriptionSupport.canStartRecording
    ? 'border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-900/60 dark:bg-amber-950/30 dark:text-amber-200'
    : recordingMode === 'whisper'
    ? 'border-sky-200 bg-sky-50 text-sky-700 dark:border-sky-900/60 dark:bg-sky-950/30 dark:text-sky-200'
    : 'border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-900/60 dark:bg-emerald-950/30 dark:text-emerald-200';

  useEffect(() => {
    if (!mobileCapabilities.supportsOfflineMode && isOffline) {
      setIsOffline(false);
    }
  }, [isOffline, mobileCapabilities.supportsOfflineMode]);

  useEffect(() => {
    if (isOffline) {
      setSelectedModel(OLLAMA_TIER_MODEL[ollamaTier]);
    }
  }, [isOffline, ollamaTier]);

  useEffect(() => {
    if (!transcriptionSupport.supportsSystemAudioCapture && audioSource === 'system') {
      setAudioSource('microphone');
    }
  }, [audioSource, transcriptionSupport.supportsSystemAudioCapture]);

  useEffect(() => {
    if (!transcriptionSupport.supportsWebSpeechRecognition && transcriptionBackendPreference === 'web-speech') {
      setTranscriptionBackendPreference('whisper');
    }
  }, [transcriptionBackendPreference, transcriptionSupport.supportsWebSpeechRecognition]);

  useEffect(() => {
    stopRecordingRef.current();
  }, [audioSource, transcriptionBackendPreference]);

  const handleSegmentFinalized = useCallback(
    async (text: string, id: string, confidence: number) => {
      const clean = text.trim();
      if (!clean) return;

      // 1. Client-side script matching check (instant, synchronous)
      if (!isScriptMatching(clean, sourceLanguage)) {
        console.log(`[stt] script mismatch (${sourceLanguage}), skipped: "${clean.slice(0, 40)}"`);
        return;
      }

      const segment: TranscriptSegment = {
        id,
        original: clean,
        translated: '',
        timestamp: Date.now(),
        isFinal: true,
        confidence,
      };

      // Watch for browsers that never expose a real confidence score.
      if (confidence > 0) {
        zeroConfidenceCountRef.current = 0;
        if (isConfidenceUnsupported) setIsConfidenceUnsupported(false);
      } else {
        zeroConfidenceCountRef.current += 1;
        if (
          !isConfidenceUnsupported
          && zeroConfidenceCountRef.current >= CONFIDENCE_UNSUPPORTED_AFTER_SEGMENTS
        ) {
          setIsConfidenceUnsupported(true);
        }
      }

      const isRejected = confidenceThreshold > 0
        && confidence > 0
        && confidence * 100 < confidenceThreshold;

      setSegments((prev) => [...prev, segment]);

      if (isRejected || !translationAvailable) {
        return;
      }

      // High* tier uses Whisper's built-in translation — skip Ollama
      if (whisperTier === 'high-star') {
        setSegments((prev) =>
          prev.map((s) => (s.id === id ? { ...s, translated: clean } : s)),
        );
        return;
      }

      try {
        const provider = isOffline ? 'ollama' : selectedProvider;
        const sourceLang = getLanguageName(sourceLanguage);
        const targetLang = getLanguageName(targetLanguage);
        const attempts = provider === 'openrouter'
          ? [
               { provider: 'openrouter', model: selectedModel },
               { provider: 'google-ai-studio', model: GOOGLE_AI_STUDIO_DEFAULT_MODEL },
             ]
          : [{ provider, model: selectedModel }];

        let translation = '';
        let lastError: unknown = null;

        for (const [index, attempt] of attempts.entries()) {
          if (index > 0) {
            const label = attempt.provider === 'google-ai-studio'
              ? 'Gemma on Google AI Studio'
              : attempt.model;
            setTranslationFallbackMessage(`OpenRouter fast pool is rate-limited. Switching to ${label}...`);
          }

          try {
            const result = await translateText(
              clean,
              attempt.model,
              sourceLang,
              targetLang,
              attempt.provider,
              runtimeConfig,
            );
            translation = result.translation;

            if (result.fallback) {
              setTranslationFallbackMessage(`Switched to ${result.fallback}`);
              window.setTimeout(() => setTranslationFallbackMessage(null), 4000);
            } else if (index > 0) {
              setSelectedProvider(attempt.provider);
              setSelectedModel(attempt.model);
              window.setTimeout(() => setTranslationFallbackMessage(null), 3000);
            }
            break;
          } catch (attemptError) {
            lastError = attemptError;
            if (!isTranslationRateLimitError(attemptError) || index === attempts.length - 1) {
              throw attemptError;
            }
          }
        }

        if (!translation) {
          throw lastError instanceof Error ? lastError : new Error('Translation failed');
        }

        setSegments((prev) =>
          prev.map((s) => (s.id === id ? { ...s, translated: translation } : s)),
        );
      } catch (err) {
        const msg = isTranslationRateLimitError(err)
          ? 'All free translation fallbacks are busy. Please wait a moment.'
          : err instanceof Error
          ? err.message
          : 'Translation failed';
        if (isTranslationRateLimitError(err)) {
          setTranslationFallbackMessage('All free translation fallbacks are busy. Keeping your transcript safe.');
          window.setTimeout(() => setTranslationFallbackMessage(null), 4000);
        } else {
          setTranslationFallbackMessage(null);
        }
        setSegments((prev) =>
          prev.map((s) => (s.id === id ? { ...s, translated: `[${msg}]` } : s)),
        );
      }
    },
    [
      backendReady,
      confidenceThreshold,
      isConfidenceUnsupported,
      isOffline,
      runtimeConfig,
      selectedModel,
      selectedProvider,
      sourceLanguage,
      targetLanguage,
      translationAvailable,
      whisperTier,
    ],
  );

  const [networkWarning, setNetworkWarning] = useState<string | null>(null);

  const guardCallbacksRef = useRef<{
    stopRecording: () => void;
    setError: (msg: string | null) => void;
  }>({ stopRecording: () => {}, setError: () => {} });

  const guardCallbacks = useMemo(() => ({
    onNetworkLost: () => {
      setNetworkWarning('Network connection lost. Recording may be interrupted.');
    },
    onNetworkRestored: () => {
      setNetworkWarning(null);
    },
    onTabHidden: () => {
      // AudioContext gets suspended on some browsers when tab is hidden.
      // We warn but don't stop — the WebSocket idle timeout handles the server side.
    },
    onTabVisible: () => {
      // Nothing to do — if the session died, the WebSocket close handler already stopped recording.
    },
    onBeforeUnload: () => {
      guardCallbacksRef.current.stopRecording();
    },
    onTrackEnded: () => {
      guardCallbacksRef.current.setError(
        'Audio input was disconnected (microphone unplugged or permission revoked). Recording stopped.',
      );
      guardCallbacksRef.current.stopRecording();
    },
  }), []);

  // useSTT must be declared before any useEffect that depends on `error`
  const { isRecording, interimTranscript, error, startRecording, stopRecording } = useSTT({
    mode: recordingMode,
    onSegmentFinalized: handleSegmentFinalized,
    language: sourceLanguage,
    audioSource,
    runtimeConfig,
    onTrackAcquired: (track) => recordingGuard.watchTrack(track),
  });
  stopRecordingRef.current = stopRecording;

  guardCallbacksRef.current = {
    stopRecording,
    setError: setVisibleError,
  };

  const recordingGuard = useRecordingGuard(isRecording, guardCallbacks);

  useEffect(() => {
    if (!error) { setVisibleError(null); return; }
    setVisibleError(error);
    const dismissAfterMs = getWhisperErrorDismissMs(error);
    if (dismissAfterMs === null) {
      return;
    }
    const t = setTimeout(() => setVisibleError(null), dismissAfterMs);
    return () => clearTimeout(t);
  }, [error]);

  useEffect(() => {
    if (!isQualityPanelOpen) return;
    const onClick = (event: MouseEvent) => {
      if (!qualityPanelRef.current?.contains(event.target as Node)) {
        setIsQualityPanelOpen(false);
      }
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setIsQualityPanelOpen(false);
    };
    document.addEventListener('mousedown', onClick);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onClick);
      document.removeEventListener('keydown', onKey);
    };
  }, [isQualityPanelOpen]);

  useEffect(() => {
    transcriptScrollRef.current?.scrollTo({ top: transcriptScrollRef.current.scrollHeight, behavior: 'smooth' });
    translationScrollRef.current?.scrollTo({ top: translationScrollRef.current.scrollHeight, behavior: 'smooth' });
  }, [segments]);

  const deleteSegment = useCallback((id: string) => {
    setSegments((prev) => prev.filter((s) => s.id !== id));
  }, []);

  const clearSegments = useCallback(() => {
    setSegments([]);
    currentSessionIdRef.current = null;
    lastReportedSessionKeyRef.current = null;
    pendingAutoReportRef.current = false;
    setAutoReportStatus('idle');
    setAutoReportMessage(null);
  }, []);

  const loadSession = useCallback((session: SavedSession) => {
    stopRecordingRef.current();
    setSegments(session.segments);
    currentSessionIdRef.current = session.id;
    lastReportedSessionKeyRef.current = null;
    pendingAutoReportRef.current = false;
    setAutoReportStatus(session.report ? 'ready' : 'idle');
    setAutoReportMessage(null);
  }, []);

  useEffect(() => {
    if (!autoSaveEnabled || segments.length === 0) {
      return;
    }

    const id = saveSession(segments, getLanguageName(sourceLanguage), getLanguageName(targetLanguage), {
      id: currentSessionIdRef.current ?? undefined,
      saveMode: 'auto',
    });
    currentSessionIdRef.current = id;
  }, [autoSaveEnabled, segments, sourceLanguage, targetLanguage, saveSession]);

  useEffect(() => {
    if (autoSaveEnabled) {
      return;
    }

    currentSessionIdRef.current = null;
    lastReportedSessionKeyRef.current = null;
    pendingAutoReportRef.current = false;
    setAutoReportStatus('idle');
    setAutoReportMessage(null);
  }, [autoSaveEnabled]);

  useEffect(() => {
    if (isRecording) {
      pendingAutoReportRef.current = false;
      setAutoReportStatus('idle');
      setAutoReportMessage(null);
      return;
    }

    const stoppedRecording = wasRecordingRef.current && !isRecording;
    wasRecordingRef.current = isRecording;

    if (shouldQueueAutoReport({ autoSaveEnabled, stoppedRecording, translationAvailable })) {
      pendingAutoReportRef.current = true;
      setAutoReportStatus('pending');
      setAutoReportMessage(null);
    }
  }, [autoSaveEnabled, isRecording, translationAvailable]);

  useEffect(() => {
    if (
      !autoSaveEnabled
      || !pendingAutoReportRef.current
      || !translationAvailable
    ) {
      return;
    }

    const meaningfulSegments = segments.filter((s) => s.original.trim().length > 0);
    if (meaningfulSegments.length === 0) {
      pendingAutoReportRef.current = false;
      setAutoReportStatus('idle');
      return;
    }

    if (!hasAutoReportReadySegments(segments)) {
      return;
    }

    pendingAutoReportRef.current = false;
    const sessionId = currentSessionIdRef.current ?? saveSession(
      segments,
      getLanguageName(sourceLanguage),
      getLanguageName(targetLanguage),
      { saveMode: 'auto' },
    );
    currentSessionIdRef.current = sessionId;

    const lastSegmentId = segments.at(-1)?.id ?? 'none';
    const reportKey = `${sessionId}:${segments.length}:${lastSegmentId}`;
    if (lastReportedSessionKeyRef.current === reportKey) {
      setAutoReportStatus('ready');
      setAutoReportMessage(null);
      return;
    }
    lastReportedSessionKeyRef.current = reportKey;

    setAutoReportStatus('pending');
    setAutoReportMessage(null);
    generateReport(
      {
        segments,
        sourceLang: getLanguageName(sourceLanguage),
        targetLang: getLanguageName(targetLanguage),
        reportLang: getLanguageName(targetLanguage),
        provider: isOffline ? 'ollama' : selectedProvider,
        model: selectedModel,
      },
      runtimeConfig,
    )
      .then((report) => {
        saveReport(sessionId, report);
        setAutoReportStatus('ready');
        setAutoReportMessage(null);
      })
      .catch((error: unknown) => {
        setAutoReportStatus('error');
        setAutoReportMessage(error instanceof Error ? error.message : 'Automatic report generation failed.');
        window.setTimeout(() => setAutoReportMessage(null), 5000);
      });
  }, [
    isOffline,
    runtimeConfig,
    saveReport,
    saveSession,
    autoSaveEnabled,
    segments,
    selectedModel,
    selectedProvider,
    sourceLanguage,
    targetLanguage,
    translationAvailable,
  ]);

  const toggleRecording = () => {
    console.log('[app] toggle recording:', isRecording ? 'stop' : 'start');
    if (isRecording) {
      stopRecording();
    } else {
      startRecording();
    }
  };

  const currentSession = currentSessionIdRef.current
    ? sessions.find((session) => session.id === currentSessionIdRef.current)
    : null;
  const hasCurrentReport = sessionHasCurrentReport(currentSession, segments);

  useEffect(() => {
    if (!hasCurrentReport) {
      return;
    }

    pendingAutoReportRef.current = false;
    setAutoReportStatus('ready');
    setAutoReportMessage(null);
  }, [hasCurrentReport]);

  const reportAction = getReportActionState({
    translationAvailable,
    hasSegments: segments.length > 0,
    isRecording,
    hasReport: hasCurrentReport,
    autoReportStatus,
  });
  const isReportGenerating = autoReportStatus === 'pending' && !hasCurrentReport;
  const conversationPaneClasses = getConversationPaneClasses(isTranscriptHidden);

  const handleSaveDefaults = useCallback(() => {
    savePreferences({
      sourceLanguage,
      targetLanguage,
      selectedProvider,
      selectedModel,
      whisperTier,
      ollamaTier,
      audioSource,
      transcriptionBackendPreference,
    });
  }, [
    sourceLanguage,
    targetLanguage,
    selectedProvider,
    selectedModel,
    whisperTier,
    ollamaTier,
    audioSource,
    transcriptionBackendPreference,
  ]);

  const handleResetDefaults = useCallback(() => {
    clearPreferences();
    setSourceLanguage('zh-CN');
    setTargetLanguage('fr-FR');
    setSelectedProvider(DEFAULT_PROVIDER);
    setSelectedModel(DEFAULT_MODEL);
    setWhisperTierState(defaultWhisperTier);
    setOllamaTier('medium');
    setAudioSource(mobileCapabilities.defaultAudioSource);
    setTranscriptionBackendPreference(defaultBackendPreference);
  }, [defaultWhisperTier, defaultBackendPreference, mobileCapabilities.defaultAudioSource]);

  return (
    <div className="h-dvh min-h-dvh bg-white dark:bg-gray-950 text-gray-900 dark:text-gray-100 flex flex-row overflow-hidden">
      <Sidebar
        selectedProvider={selectedProvider}
        onProviderChange={setSelectedProvider}
        selectedModel={selectedModel}
        onModelChange={setSelectedModel}
        sourceLanguage={sourceLanguage}
        onSourceLanguageChange={setSourceLanguage}
        targetLanguage={targetLanguage}
        onTargetLanguageChange={setTargetLanguage}
        isOffline={isOffline}
        onOfflineChange={setIsOffline}
        whisperTier={whisperTier}
        onWhisperTierChange={handleWhisperTierChange}
        ollamaTier={ollamaTier}
        onOllamaTierChange={handleOllamaTierChange}
        audioSource={audioSource}
        onAudioSourceChange={setAudioSource}
        transcriptionBackendPreference={transcriptionBackendPreference}
        onTranscriptionBackendPreferenceChange={setTranscriptionBackendPreference}
        runtimeConfig={runtimeConfig}
        transcriptionSupport={transcriptionSupport}
        onSaveDefaults={handleSaveDefaults}
        onResetDefaults={handleResetDefaults}
      />

      <div className="flex flex-col flex-1 min-w-0 overflow-hidden">
        <header className="flex h-16 flex-shrink-0 items-center justify-between border-b border-gray-200 px-6 dark:border-gray-800">
          <div className="flex items-center gap-3">
            <h1 className="text-xl font-semibold tracking-tight">Barrier-Free Meetings</h1>
            <span
              className={`inline-flex items-center rounded-full border px-2.5 py-1 text-xs font-medium ${sttBadgeClassName}`}
              title="Current speech-to-text engine"
            >
              {sttBadgeLabel}
            </span>
          </div>
          <div className="flex items-center gap-1">
            {segments.length > 0 && (
              <>
                <button
                  type="button"
                  onClick={() => setAutoSaveEnabled((enabled) => !enabled)}
                  aria-label={autoSaveEnabled ? 'Disable autosave' : 'Enable autosave'}
                  title={autoSaveEnabled ? 'Autosave is on' : 'Autosave is off'}
                  className={`p-2 rounded-lg transition-colors ${
                    autoSaveEnabled
                      ? 'text-emerald-600 hover:bg-emerald-50 hover:text-emerald-700 dark:text-emerald-300 dark:hover:bg-emerald-950/30'
                      : 'text-gray-300 hover:bg-gray-100 hover:text-gray-500 dark:text-gray-600 dark:hover:bg-gray-800 dark:hover:text-gray-300'
                  }`}
                >
                  <BookmarkIcon />
                </button>
                {reportAction.visible && (
                  <button
                    type="button"
                    onClick={() => {
                      if (!reportAction.disabled) {
                        setShowReport(true);
                      }
                    }}
                    aria-label={reportAction.label}
                    title={reportAction.title}
                    disabled={reportAction.disabled}
                    className={`p-2 rounded-lg transition-colors ${
                      isReportGenerating
                        ? 'cursor-wait text-blue-500 dark:text-blue-300'
                        : reportAction.disabled
                        ? 'cursor-not-allowed text-gray-300 dark:text-gray-600'
                        : 'text-gray-400 hover:bg-gray-100 hover:text-gray-700 dark:hover:bg-gray-800 dark:hover:text-gray-200'
                    }`}
                  >
                    <span className={isReportGenerating ? 'block animate-pulse' : 'block'}>
                      <SparkleIcon />
                    </span>
                  </button>
                )}
                <button type="button" onClick={clearSegments}
                  aria-label="Clear all" title="Clear all"
                  className="p-2 rounded-lg hover:bg-red-50 dark:hover:bg-red-900/20 text-gray-400 hover:text-red-500 dark:hover:text-red-400 transition-colors">
                  <TrashIcon />
                </button>
              </>
            )}
            <button type="button" onClick={() => setShowHistory(true)}
              aria-label="History" title="Session history"
              className="p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 transition-colors relative">
              <ClockIcon />
              {sessions.length > 0 && (
                <span className="absolute top-1 right-1 h-1.5 w-1.5 rounded-full bg-blue-500" />
              )}
            </button>
            <div className="relative" ref={qualityPanelRef}>
              <button
                type="button"
                onClick={() => setIsQualityPanelOpen((v) => !v)}
                aria-label="Transcription quality"
                title="Transcription quality"
                aria-expanded={isQualityPanelOpen}
                className={`p-2 rounded-lg transition-colors ${
                  isQualityButtonSelected({ showConfidence })
                    ? 'bg-blue-50 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400'
                    : 'text-gray-400 hover:bg-gray-100 hover:text-gray-700 dark:hover:bg-gray-800 dark:hover:text-gray-200'
                }`}
              >
                <GaugeIcon />
              </button>
              {isQualityPanelOpen && (
                <div className="absolute right-0 top-full mt-2 z-30 w-72 rounded-xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-950 shadow-lg p-4 flex flex-col gap-4">
                  <div>
                    <h3 className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                      Transcription Quality
                    </h3>
                    <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                      The browser scores how sure it is about what you said. Tune what to do with weak guesses.
                    </p>
                  </div>

                  <label className="flex items-start gap-3 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={showConfidence}
                      onChange={(e) => setShowConfidence(e.target.checked)}
                      className="mt-0.5 h-4 w-4 rounded border-gray-300 dark:border-gray-700 accent-blue-600"
                    />
                    <span className="flex flex-col gap-0.5">
                      <span className="text-sm font-medium text-gray-900 dark:text-gray-100">
                        Show scores on each segment
                      </span>
                      <span className="text-xs text-gray-500 dark:text-gray-400">
                        Rejected ones turn red.
                      </span>
                    </span>
                  </label>

                  <div className={`flex flex-col gap-2 ${isConfidenceUnsupported ? 'opacity-50' : ''}`}>
                    <div className="flex items-baseline justify-between">
                      <span className="text-sm font-medium text-gray-900 dark:text-gray-100">
                        Skip guesses under
                      </span>
                      <span className="text-sm font-mono font-semibold text-blue-600 dark:text-blue-400">
                        {confidenceThreshold}%
                      </span>
                    </div>
                    <input
                      type="range"
                      min={0}
                      max={100}
                      step={5}
                      value={confidenceThreshold}
                      onChange={(e) => setConfidenceThreshold(Number(e.target.value))}
                      disabled={isConfidenceUnsupported}
                      className="h-1.5 rounded-full appearance-none cursor-pointer bg-gray-200 dark:bg-gray-700 accent-blue-600 disabled:cursor-not-allowed"
                    />
                    <div className="flex justify-between text-[10px] font-mono text-gray-400 dark:text-gray-600">
                      <span>Keep all</span>
                      <span>Strictest</span>
                    </div>
                    <p className="text-xs text-gray-500 dark:text-gray-400">
                      {confidenceThreshold === 0
                        ? 'Every transcribed segment will be translated.'
                        : `Segments below ${confidenceThreshold}% confidence will be skipped (no translation).`}
                    </p>
                  </div>

                  {isConfidenceUnsupported && (
                    <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800 dark:border-amber-900/60 dark:bg-amber-950/30 dark:text-amber-200">
                      This recording backend doesn't expose confidence scores, so the threshold has no effect. (Safari, Brave's offline speech mode, and the Whisper backend always return 0.)
                    </div>
                  )}
                </div>
              )}
            </div>
            <button type="button" onClick={toggleTheme} aria-label="Toggle theme"
              className="p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 transition-colors">
              {theme === 'system' ? <MonitorIcon /> : theme === 'dark' ? <MoonIcon /> : <SunIcon />}
            </button>
          </div>
        </header>

        {mobileStatusMessage && (
          <div className="mx-6 mt-4 rounded-xl border border-sky-200 bg-sky-50 px-4 py-3 text-sm text-sky-800 dark:border-sky-900/60 dark:bg-sky-950/40 dark:text-sky-200">
            {mobileStatusMessage}
          </div>
        )}

        <div className="flex flex-1 overflow-hidden">
          {!isTranscriptHidden && (
            <div className={conversationPaneClasses.transcriptionPane}>
              <div className="flex-shrink-0 px-6 pt-5 pb-3">
                <h2 className="text-xs font-semibold text-gray-500 uppercase tracking-wider">
                  Transcription
                </h2>
              </div>
              <div ref={transcriptScrollRef} className="flex-1 overflow-y-auto px-6 pb-6 space-y-3">
                {segments.length === 0 && !interimTranscript && (
                  <p className="text-gray-400 dark:text-gray-600 text-sm mt-6 text-center">
                    Press record to start transcribing…
                  </p>
                )}
                {segments.map((s) => {
                  const segmentRejected = confidenceThreshold > 0
                    && s.confidence !== undefined
                    && s.confidence > 0
                    && s.confidence * 100 < confidenceThreshold;
                  return (
                  <div
                    key={s.id}
                    className={`group relative rounded-xl px-4 py-3 pr-10 border ${
                      showConfidence && segmentRejected
                        ? 'bg-red-50 dark:bg-red-950/30 border-red-200 dark:border-red-800'
                        : 'bg-gray-50 dark:bg-gray-900 border-gray-200 dark:border-gray-800'
                    }`}
                  >
                    <p className={`text-sm ${
                      showConfidence && segmentRejected
                        ? 'text-red-600/70 dark:text-red-400/70 line-through'
                        : 'text-gray-900 dark:text-gray-100'
                    }`}>{s.original}</p>
                    {showConfidence && s.confidence !== undefined && s.confidence > 0 && (
                      <span className={`text-[10px] font-mono ${
                        segmentRejected
                          ? 'text-red-500 dark:text-red-400'
                          : 'text-gray-400 dark:text-gray-600'
                      }`}>
                        conf: {(s.confidence * 100).toFixed(1)}%
                        {segmentRejected && ' — rejected'}
                      </span>
                    )}
                    <button
                      type="button"
                      onClick={() => deleteSegment(s.id)}
                      aria-label="Delete segment"
                      className="absolute top-2.5 right-2.5 p-1 rounded opacity-0 group-hover:opacity-100 text-gray-300 hover:text-red-500 dark:text-gray-600 dark:hover:text-red-400 transition-all"
                    >
                      <TrashIcon size="sm" />
                    </button>
                  </div>
                  );
                })}
                {interimTranscript && (
                  <div className="bg-gray-50/50 dark:bg-gray-900/50 border border-gray-200/50 dark:border-gray-800/50 rounded-xl px-4 py-3">
                    <p className="text-gray-400 text-sm italic">{interimTranscript}</p>
                  </div>
                )}
              </div>
            </div>
          )}

          <div className={conversationPaneClasses.translationPane}>
            <div className="flex-shrink-0 px-6 pt-5 pb-3">
              <div className="flex items-center justify-between gap-3">
                <div className="flex flex-wrap items-center gap-2">
                  <h2 className="text-xs font-semibold text-gray-500 uppercase tracking-wider">
                    Translation
                  </h2>
                  {translationFallbackMessage && (
                    <span className="inline-flex items-center gap-1.5 rounded-full border border-blue-200 bg-blue-50 px-2.5 py-1 text-xs font-medium text-blue-700 shadow-sm dark:border-blue-900/60 dark:bg-blue-950/30 dark:text-blue-200">
                      <span className="h-1.5 w-1.5 rounded-full bg-blue-500 animate-pulse dark:bg-blue-300" />
                      {translationFallbackMessage}
                    </span>
                  )}
                </div>
                <button
                  type="button"
                  onClick={() => setIsTranscriptHidden((hidden) => !hidden)}
                  aria-label={isTranscriptHidden ? 'Show transcription' : 'Hide transcription'}
                  title={isTranscriptHidden ? 'Show transcription' : 'Hide transcription'}
                  className="p-1.5 rounded-lg text-gray-400 transition-colors hover:bg-gray-100 hover:text-gray-700 dark:hover:bg-gray-800 dark:hover:text-gray-200"
                >
                  {isTranscriptHidden ? <Eye className="h-4 w-4" /> : <EyeOff className="h-4 w-4" />}
                </button>
              </div>
            </div>
            <div ref={translationScrollRef} className="flex-1 overflow-y-auto px-6 pb-6 space-y-3">
              {segments.length === 0 && (
                <p className="text-gray-400 dark:text-gray-600 text-sm mt-6 text-center">
                  {translationAvailable
                    ? 'Translations will appear here…'
                    : 'Translations need a configured backend and model selection.'}
                </p>
              )}
              {segments.map((s) => {
                const segmentRejected = confidenceThreshold > 0
                  && s.confidence !== undefined
                  && s.confidence > 0
                  && s.confidence * 100 < confidenceThreshold;
                return (
                <div
                  key={s.id}
                  className={`rounded-xl px-4 py-3 border ${
                    showConfidence && segmentRejected
                      ? 'bg-red-50 dark:bg-red-950/30 border-red-200 dark:border-red-800'
                      : 'bg-gray-50 dark:bg-gray-900 border-gray-200 dark:border-gray-800'
                  }`}
                >
                  {segmentRejected ? (
                    <p className="text-red-400 dark:text-red-600 text-xs italic">
                      Skipped — below confidence threshold
                    </p>
                  ) : !translationAvailable ? (
                    <p className="text-gray-400 dark:text-gray-600 text-sm italic">
                      Translation unavailable in this build until a backend and model are configured.
                    </p>
                  ) : s.translated ? (
                    <p className="text-gray-900 dark:text-gray-100 text-sm">{s.translated}</p>
                  ) : (
                    <p className="text-gray-400 dark:text-gray-600 text-sm italic">
                      Translating…
                    </p>
                  )}
                </div>
                );
              })}
            </div>
          </div>
        </div>

        {networkWarning && isRecording && (
          <div className="flex-shrink-0 mx-6 mb-3 rounded-lg bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 px-4 py-3 text-sm text-amber-700 dark:text-amber-200 flex items-center justify-between gap-3">
            <span>{networkWarning}</span>
            <button
              type="button"
              onClick={() => setNetworkWarning(null)}
              className="flex-shrink-0 text-amber-400 hover:text-amber-600 dark:hover:text-amber-200 transition-colors"
              aria-label="Dismiss warning"
            >
              <XIcon />
            </button>
          </div>
        )}

        {visibleError && (
          <div className="flex-shrink-0 mx-6 mb-3 rounded-lg bg-red-50 dark:bg-red-900/30 border border-red-200 dark:border-red-800 px-4 py-3 text-sm text-red-600 dark:text-red-300 flex items-center justify-between gap-3">
            <span>{visibleError}</span>
            <button
              type="button"
              onClick={() => setVisibleError(null)}
              className="flex-shrink-0 text-red-400 hover:text-red-600 dark:hover:text-red-200 transition-colors"
              aria-label="Dismiss error"
            >
              <XIcon />
            </button>
          </div>
        )}

        {!visibleError && recordDisabledReason && (
          <div className="flex-shrink-0 mx-6 mb-3 rounded-lg bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 px-4 py-3 text-sm text-amber-700 dark:text-amber-200">
            {recordDisabledReason}
          </div>
        )}

        {autoReportMessage && (
          <div className={`flex-shrink-0 mx-6 mb-3 rounded-lg border px-4 py-3 text-sm ${
            autoReportStatus === 'error'
              ? 'border-red-200 bg-red-50 text-red-600 dark:border-red-800 dark:bg-red-900/30 dark:text-red-300'
              : 'border-blue-200 bg-blue-50 text-blue-700 dark:border-blue-900/60 dark:bg-blue-950/30 dark:text-blue-200'
          }`}>
            {autoReportMessage}
          </div>
        )}

        <div className="flex-shrink-0 border-t border-gray-200 dark:border-gray-800 py-5 flex flex-col items-center">
          <button
            type="button"
            onClick={toggleRecording}
            disabled={isRecordDisabled}
            title={recordDisabledReason ?? (backendReady && !selectedModel ? 'Choose a model first' : 'Start recording')}
            className={`inline-flex items-center gap-2 rounded-full px-6 py-3 text-sm font-semibold transition-all duration-200 disabled:opacity-40 disabled:cursor-not-allowed ${
              isRecording
                ? 'bg-red-600 hover:bg-red-500 text-white shadow-lg shadow-red-600/25'
                : 'bg-gray-900 dark:bg-white hover:bg-gray-700 dark:hover:bg-gray-100 text-white dark:text-gray-900 shadow-lg shadow-black/10'
            }`}
          >
            {isRecording ? (
              <>
                <span className="h-2.5 w-2.5 rounded-full bg-white animate-pulse" />
                Stop Recording
              </>
            ) : (
              <>
                <MicIcon />
                Start Recording
              </>
            )}
          </button>
        </div>
      </div>
      {showReport && translationAvailable && (
        <ReportPanel
          segments={segments}
          sourceLang={getLanguageName(sourceLanguage)}
          targetLang={getLanguageName(targetLanguage)}
          provider={isOffline ? 'ollama' : selectedProvider}
          model={selectedModel}
          initialReport={currentSession?.report}
          runtimeConfig={runtimeConfig}
          onReportGenerated={(report) => {
            const sessionId = currentSessionIdRef.current;
            if (sessionId) {
              saveReport(sessionId, report);
              setAutoReportStatus('ready');
              setAutoReportMessage(null);
            }
          }}
          onClose={() => setShowReport(false)}
        />
      )}

      {showHistory && (
        <HistoryPanel
          sessions={sessions}
          onDelete={deleteSession}
          onReportGenerated={saveReport}
          onClear={clearHistory}
          onClose={() => setShowHistory(false)}
          onLoad={(session) => {
            loadSession(session);
            setShowHistory(false);
          }}
          provider={isOffline ? 'ollama' : selectedProvider}
          model={selectedModel}
          runtimeConfig={runtimeConfig}
        />
      )}
    </div>
  );
}

function MicIcon() {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none"
      stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round"
      className="h-4 w-4">
      <path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3Z" />
      <path d="M19 10v2a7 7 0 0 1-14 0v-2" />
      <line x1="12" x2="12" y1="19" y2="22" />
    </svg>
  );
}

function SunIcon() {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none"
      stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round"
      className="h-4 w-4">
      <circle cx="12" cy="12" r="4" />
      <path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M6.34 17.66l-1.41 1.41M19.07 4.93l-1.41 1.41" />
    </svg>
  );
}

function XIcon() {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none"
      stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round"
      className="h-4 w-4">
      <path d="M18 6 6 18M6 6l12 12" />
    </svg>
  );
}

function SparkleIcon() {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none"
      stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round"
      className="h-4 w-4">
      <path d="m12 3-1.912 5.813a2 2 0 0 1-1.275 1.275L3 12l5.813 1.912a2 2 0 0 1 1.275 1.275L12 21l1.912-5.813a2 2 0 0 1 1.275-1.275L21 12l-5.813-1.912a2 2 0 0 1-1.275-1.275L12 3Z" />
    </svg>
  );
}

function ClockIcon() {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none"
      stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round"
      className="h-4 w-4">
      <circle cx="12" cy="12" r="10" />
      <polyline points="12 6 12 12 16 14" />
    </svg>
  );
}

function BookmarkIcon() {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none"
      stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round"
      className="h-4 w-4">
      <path d="m19 21-7-4-7 4V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2v16Z" />
    </svg>
  );
}

function TrashIcon({ size = 'md' }: { size?: 'sm' | 'md' }) {
  const cls = size === 'sm' ? 'h-3.5 w-3.5' : 'h-4 w-4';
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none"
      stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round"
      className={cls}>
      <path d="M3 6h18M8 6V4h8v2M19 6l-1 14H6L5 6" />
      <path d="M10 11v6M14 11v6" />
    </svg>
  );
}

function MonitorIcon() {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none"
      stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round"
      className="h-4 w-4">
      <rect x="2" y="3" width="20" height="14" rx="2" />
      <path d="M8 21h8M12 17v4" />
    </svg>
  );
}

function MoonIcon() {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none"
      stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round"
      className="h-4 w-4">
      <path d="M12 3a6 6 0 0 0 9 9 9 9 0 1 1-9-9Z" />
    </svg>
  );
}

function GaugeIcon() {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none"
      stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round"
      className="h-4 w-4">
      <path d="m12 14 4-4" />
      <path d="M3.34 19a10 10 0 1 1 17.32 0" />
    </svg>
  );
}
