export interface SpeechRecognitionAlternativeLike {
  transcript: string;
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
  onSegmentFinalized: (text: string, id: string) => void;
  language?: string;
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

export function createSpeechRecognitionController({
  recognition,
  onSegmentFinalized,
  language = "zh-CN",
  generateId = defaultGenerateId,
  onStateChange,
}: CreateSpeechRecognitionControllerOptions): SpeechRecognitionController {
  let isRecording = false;
  let interimTranscript = "";
  let error: string | null = null;
  let isManuallyStopped = false;

  const emitState = () => {
    onStateChange?.({
      isRecording,
      interimTranscript,
      error,
    });
  };

  recognition.continuous = true;
  recognition.interimResults = true;
  recognition.lang = language;

  recognition.onstart = () => {
    isRecording = true;
    error = null;
    emitState();
  };

  recognition.onerror = (event) => {
    console.error("Speech recognition error", event.error);

    if (event.error === "not-allowed") {
      error =
        "Microphone access denied. Please click the microphone icon in your browser address bar to allow access for this site.";
      isRecording = false;
      isManuallyStopped = true;
    } else if (event.error === "service-not-allowed") {
      error = "Speech recognition service is not allowed by the browser.";
      isRecording = false;
      isManuallyStopped = true;
    } else {
      error = `Speech recognition error: ${event.error}`;
    }

    emitState();
  };

  recognition.onend = () => {
    if (!isManuallyStopped && isRecording) {
      try {
        recognition.start();
      } catch (restartError) {
        console.error("Failed to restart recognition", restartError);
      }
      return;
    }

    isRecording = false;
    interimTranscript = "";
    emitState();
  };

  recognition.onresult = (event) => {
    let currentInterim = "";

    for (let index = event.resultIndex; index < event.results.length; index += 1) {
      const result = event.results[index];
      const transcript = result[0].transcript;

      if (result.isFinal) {
        onSegmentFinalized(transcript, generateId());
      } else {
        currentInterim += transcript;
      }
    }

    interimTranscript = currentInterim;
    emitState();
  };

  emitState();

  return {
    dispose() {
      isManuallyStopped = true;
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
        console.error("Error starting recognition:", startError);
        error = "Unable to start speech recognition.";
        isRecording = false;
        emitState();
      }
    },
    stopRecording() {
      isManuallyStopped = true;
      isRecording = false;
      interimTranscript = "";
      recognition.stop();
      emitState();
    },
  };
}
