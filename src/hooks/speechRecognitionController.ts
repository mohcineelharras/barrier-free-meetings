export interface SpeechRecognitionAlternativeLike {
  transcript: string;
  confidence: number;
}

export interface SpeechRecognitionResultEntryLike {
  0: SpeechRecognitionAlternativeLike;
  isFinal: boolean;
  length: number;
}

export interface SpeechRecognitionResultLike {
  resultIndex: number;
  results: ArrayLike<SpeechRecognitionResultEntryLike>;
}

export interface SpeechRecognitionErrorLike {
  error: string;
}

export interface SpeechRecognitionLike {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  onstart: (() => void) | null;
  onerror: ((event: SpeechRecognitionErrorLike) => void) | null;
  onend: (() => void) | null;
  onresult: ((event: SpeechRecognitionResultLike) => void) | null;
  start(): void;
  stop(): void;
}

export interface SpeechRecognitionSnapshot {
  isRecording: boolean;
  interimTranscript: string;
  error: string | null;
}

interface CreateSpeechRecognitionControllerOptions {
  recognition: SpeechRecognitionLike;
  onSegmentFinalized: (text: string, id: string, confidence: number) => void;
  language?: string;
  finalCommitDelayMs?: number;
  maxInterimChars?: number;
  maxInterimCommitDelayMs?: number;
  generateId?: () => string;
  onStateChange?: (snapshot: SpeechRecognitionSnapshot) => void;
}

export interface SpeechRecognitionController {
  dispose: () => void;
  getSnapshot: () => SpeechRecognitionSnapshot;
  startRecording: () => void;
  stopRecording: () => void;
}

function defaultGenerateId(): string {
  return Math.random().toString(36).substring(2, 9);
}

const DEFAULT_FINAL_COMMIT_DELAY_MS = 1_100;
const DEFAULT_MAX_INTERIM_CHARS = 120;
const DEFAULT_MAX_INTERIM_COMMIT_DELAY_MS = 10_000;
const INTERIM_UNSTABLE_TAIL_WORDS = 2;
const SENTENCE_BOUNDARY_PATTERN = /[.!?؟。！？]$/u;

const MAX_RESTART_ATTEMPTS = 5;
const RESTART_BACKOFF_BASE_MS = 300;
const RESTART_BACKOFF_RESET_MS = 10_000;
const MAX_CONSECUTIVE_EMPTY_FINALS = 3;

function normalizeTranscript(text: string): string {
  return text.trim().replace(/\s+/g, " ");
}

function mergeTranscriptChunk(current: string, next: string): string {
  const normalizedCurrent = normalizeTranscript(current);
  const normalizedNext = normalizeTranscript(next);

  if (!normalizedCurrent) return normalizedNext;
  if (!normalizedNext) return normalizedCurrent;
  if (normalizedCurrent === normalizedNext) return normalizedCurrent;
  if (normalizedNext.startsWith(normalizedCurrent)) return normalizedNext;
  if (normalizedCurrent.startsWith(normalizedNext)) return normalizedCurrent;

  return `${normalizedCurrent} ${normalizedNext}`;
}

function trimCommittedPrefix(text: string, committedPrefix: string): string {
  const normalizedText = normalizeTranscript(text);
  const normalizedPrefix = normalizeTranscript(committedPrefix);

  if (!normalizedPrefix || !normalizedText) return normalizedText;
  if (normalizedText === normalizedPrefix) return "";
  if (normalizedText.startsWith(`${normalizedPrefix} `)) {
    return normalizedText.slice(normalizedPrefix.length).trim();
  }
  if (normalizedPrefix.startsWith(normalizedText)) {
    return "";
  }

  // `committedPrefix` accumulates the whole session, so a fresh utterance that
  // grows across separate commits is no longer an exact prefix of it. Strip the
  // longest word-aligned suffix of the committed text that the incoming text
  // repeats from its start, so only genuinely new words remain.
  const prefixWords = normalizedPrefix.split(" ");
  const textWords = normalizedText.split(" ");
  const maxOverlap = Math.min(prefixWords.length, textWords.length);

  for (let overlap = maxOverlap; overlap >= 1; overlap -= 1) {
    const committedTail = prefixWords.slice(prefixWords.length - overlap).join(" ");
    const textHead = textWords.slice(0, overlap).join(" ");
    if (committedTail === textHead) {
      return textWords.slice(overlap).join(" ");
    }
  }

  return normalizedText;
}

function splitInterimTranscriptForCommit(text: string): { commitText: string; remainder: string } {
  const normalized = normalizeTranscript(text);
  if (!normalized) {
    return { commitText: "", remainder: "" };
  }

  const words = normalized.split(" ");
  if (words.length <= INTERIM_UNSTABLE_TAIL_WORDS) {
    return { commitText: "", remainder: normalized };
  }

  const stableWords = words.slice(0, -INTERIM_UNSTABLE_TAIL_WORDS);
  const unstableWords = words.slice(-INTERIM_UNSTABLE_TAIL_WORDS);

  return {
    commitText: stableWords.join(" "),
    remainder: unstableWords.join(" "),
  };
}

export function createSpeechRecognitionController({
  recognition,
  onSegmentFinalized,
  language = "zh-CN",
  finalCommitDelayMs = DEFAULT_FINAL_COMMIT_DELAY_MS,
  maxInterimChars = DEFAULT_MAX_INTERIM_CHARS,
  maxInterimCommitDelayMs = DEFAULT_MAX_INTERIM_COMMIT_DELAY_MS,
  generateId = defaultGenerateId,
  onStateChange,
}: CreateSpeechRecognitionControllerOptions): SpeechRecognitionController {
  let isRecording = false;
  let interimTranscript = "";
  let pendingFinalTranscript = "";
  let pendingFinalConfidence = 0;
  let committedTranscript = "";
  let error: string | null = null;
  let isManuallyStopped = false;
  let finalCommitTimer: ReturnType<typeof setTimeout> | null = null;
  let interimCommitTimer: ReturnType<typeof setTimeout> | null = null;
  let restartAttempts = 0;
  let lastSuccessfulStart = 0;
  let restartTimer: ReturnType<typeof setTimeout> | null = null;
  let consecutiveEmptyFinals = 0;
  let isInternalRecovery = false;

  const emitState = () => {
    onStateChange?.({
      isRecording,
      interimTranscript,
      error,
    });
  };

  const clearFinalCommitTimer = () => {
    if (finalCommitTimer !== null) {
      clearTimeout(finalCommitTimer);
      finalCommitTimer = null;
    }
  };

  const clearInterimCommitTimer = () => {
    if (interimCommitTimer !== null) {
      clearTimeout(interimCommitTimer);
      interimCommitTimer = null;
    }
  };

  const recordCommittedTranscript = (text: string) => {
    committedTranscript = mergeTranscriptChunk(committedTranscript, text);
  };

  const commitPendingFinalTranscript = () => {
    clearFinalCommitTimer();
    clearInterimCommitTimer();

    const finalText = normalizeTranscript(pendingFinalTranscript);
    const confidence = pendingFinalConfidence;
    pendingFinalTranscript = "";
    pendingFinalConfidence = 0;
    interimTranscript = "";

    if (finalText) {
      recordCommittedTranscript(finalText);
      onSegmentFinalized(finalText, generateId(), confidence);
    }

    emitState();
  };

  const forceCommitInterimTranscript = () => {
    clearInterimCommitTimer();

    if (pendingFinalTranscript) {
      scheduleFinalCommit();
      return;
    }

    const { commitText, remainder } = splitInterimTranscriptForCommit(interimTranscript);
    if (!commitText) {
      if (interimTranscript) {
        scheduleInterimCommit();
      }
      return;
    }

    recordCommittedTranscript(commitText);
    interimTranscript = remainder;
    onSegmentFinalized(commitText, generateId(), 0);

    if (interimTranscript) {
      scheduleInterimCommit();
    }

    emitState();
  };

  const scheduleFinalCommit = () => {
    clearFinalCommitTimer();

    const delay = SENTENCE_BOUNDARY_PATTERN.test(normalizeTranscript(pendingFinalTranscript))
      ? Math.min(finalCommitDelayMs, 250)
      : finalCommitDelayMs;

    if (delay <= 0) {
      commitPendingFinalTranscript();
      return;
    }

    finalCommitTimer = setTimeout(commitPendingFinalTranscript, delay);
    (finalCommitTimer as { unref?: () => void }).unref?.();
  };

  const scheduleInterimCommit = () => {
    clearInterimCommitTimer();

    if (!interimTranscript || pendingFinalTranscript) {
      return;
    }

    const delay = interimTranscript.length >= maxInterimChars
      ? Math.min(maxInterimCommitDelayMs, 250)
      : maxInterimCommitDelayMs;
    interimCommitTimer = setTimeout(forceCommitInterimTranscript, delay);
    (interimCommitTimer as { unref?: () => void }).unref?.();
  };

  recognition.continuous = true;
  recognition.interimResults = true;
  recognition.lang = language;

  recognition.onstart = () => {
    isRecording = true;
    error = null;
    lastSuccessfulStart = Date.now();
    emitState();
  };

  recognition.onerror = (event) => {
    console.error("[web-speech] error:", event.error);

    if (event.error === "not-allowed") {
      error =
        "Microphone access denied. Please click the microphone icon in your browser address bar to allow access for this site.";
      isRecording = false;
      isManuallyStopped = true;
    } else if (event.error === "service-not-allowed") {
      error = "Speech recognition service is not allowed by the browser.";
      isRecording = false;
      isManuallyStopped = true;
    } else if (event.error === "network") {
      error =
        "Speech recognition could not reach the browser speech service. Check your internet connection, make sure this browser supports Web Speech for the selected language, or switch to Offline mode.";
      isRecording = false;
      isManuallyStopped = true;
    } else {
      error = `Speech recognition error: ${event.error}`;
    }

    emitState();
  };

  const clearRestartTimer = () => {
    if (restartTimer !== null) {
      clearTimeout(restartTimer);
      restartTimer = null;
    }
  };

  recognition.onend = () => {
    if (!isManuallyStopped && isRecording) {
      // Internal recovery (e.g. empty-finals loop break) shouldn't burn restart
      // budget — it's a normal recovery, not a sign the service is failing.
      const wasInternalRecovery = isInternalRecovery;
      isInternalRecovery = false;

      if (Date.now() - lastSuccessfulStart > RESTART_BACKOFF_RESET_MS) {
        restartAttempts = 0;
      }

      if (!wasInternalRecovery && restartAttempts >= MAX_RESTART_ATTEMPTS) {
        error = "Speech recognition stopped unexpectedly after multiple restart attempts. Please try recording again.";
        isRecording = false;
        restartAttempts = 0;
        clearFinalCommitTimer();
        clearInterimCommitTimer();
        emitState();
        return;
      }

      const delay = wasInternalRecovery
        ? RESTART_BACKOFF_BASE_MS
        : RESTART_BACKOFF_BASE_MS * Math.pow(2, restartAttempts);
      if (!wasInternalRecovery) {
        restartAttempts += 1;
      }

      restartTimer = setTimeout(() => {
        restartTimer = null;
        try {
          recognition.start();
        } catch (restartError) {
          console.error("[web-speech] restart failed:", restartError);
          error = "Unable to restart speech recognition. Please try recording again.";
          isRecording = false;
          restartAttempts = 0;
          emitState();
        }
      }, delay);
      return;
    }

    isRecording = false;
    interimTranscript = "";
    pendingFinalTranscript = "";
    committedTranscript = "";
    restartAttempts = 0;
    clearFinalCommitTimer();
    clearInterimCommitTimer();
    clearRestartTimer();
    emitState();
  };

  recognition.onresult = (event) => {
    let currentInterim = "";
    let hasNonEmptyFinal = false;

    for (let index = event.resultIndex; index < event.results.length; index += 1) {
      const result = event.results[index];
      const confidence = result[0].confidence;
      const transcript = trimCommittedPrefix(result[0].transcript, committedTranscript);

      if (result.isFinal) {
        console.log(`[web-speech] final: "${transcript.slice(0, 50)}" conf:${(confidence * 100).toFixed(0)}%`);
        if (normalizeTranscript(transcript)) {
          hasNonEmptyFinal = true;
        }
        pendingFinalConfidence = pendingFinalTranscript
          ? Math.min(pendingFinalConfidence, confidence)
          : confidence;
        pendingFinalTranscript = mergeTranscriptChunk(pendingFinalTranscript, transcript);
      } else {
        currentInterim = mergeTranscriptChunk(currentInterim, transcript);
      }
    }

    if (hasNonEmptyFinal || currentInterim) {
      consecutiveEmptyFinals = 0;
    } else {
      consecutiveEmptyFinals += 1;
      if (consecutiveEmptyFinals >= MAX_CONSECUTIVE_EMPTY_FINALS) {
        console.log(`[web-speech] ${consecutiveEmptyFinals} consecutive empty finals, restarting recognition`);
        consecutiveEmptyFinals = 0;
        isInternalRecovery = true;
        recognition.stop();
        return;
      }
    }

    interimTranscript = mergeTranscriptChunk(pendingFinalTranscript, currentInterim);
    if (pendingFinalTranscript) {
      scheduleFinalCommit();
    } else if (interimTranscript) {
      scheduleInterimCommit();
    } else {
      clearInterimCommitTimer();
    }
    emitState();
  };

  emitState();

  return {
    dispose() {
      isManuallyStopped = true;
      commitPendingFinalTranscript();
      clearInterimCommitTimer();
      clearRestartTimer();
      restartAttempts = 0;
      recognition.onstart = null;
      recognition.onerror = null;
      recognition.onend = null;
      recognition.onresult = null;
      recognition.stop();
    },
    getSnapshot() {
      return {
        isRecording,
        interimTranscript,
        error,
      };
    },
    startRecording() {
      isManuallyStopped = false;

      try {
        recognition.start();
      } catch (startError) {
        console.error("[web-speech] start failed:", startError);
        error = "Unable to start speech recognition.";
        isRecording = false;
        emitState();
      }
    },
    stopRecording() {
      isManuallyStopped = true;
      isRecording = false;
      restartAttempts = 0;
      commitPendingFinalTranscript();
      clearInterimCommitTimer();
      clearRestartTimer();
      recognition.stop();
      emitState();
    },
  };
}
