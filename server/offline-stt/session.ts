import { createTranscriptAssembler, type TimestampedChunk } from './transcriptAssembler';

export type { TimestampedChunk } from './transcriptAssembler';

const MAX_TRANSCRIPT_SEGMENT_DURATION_MS = 10_000;
const MAX_TRANSCRIPT_SEGMENT_CHARS = 1_200;

export interface RecognitionRequest {
  audioDurationMs: number;
  audioStartMs: number;
  language: string;
  pcmData: Float32Array;
  sampleRate: number;
}

export interface RecognitionResult {
  chunks: TimestampedChunk[];
}

export interface TranscriptionRecognizer {
  start(): Promise<void>;
  stop(): Promise<void>;
  transcribe(request: RecognitionRequest): Promise<RecognitionResult>;
}

interface OfflineSessionOptions {
  analysisThrottleMs: number;
  createRecognizer: () => Promise<TranscriptionRecognizer> | TranscriptionRecognizer;
  minimumAnalysisMs: number;
  now: () => number;
  onAnalysisComplete?: (latencyMs: number) => void;
  onError: (message: string) => void;
  onFinal: (text: string) => void;
  onPartial: (text: string) => void;
  onRuntimeFailure?: (message: string) => void;
  sampleRate: number;
  silenceDurationMs: number;
  silenceThresholdRms: number;
  startupTimeoutMs: number;
  unstableTailMs: number;
}

function computeRms(pcm: Float32Array): number {
  let sum = 0;
  for (let i = 0; i < pcm.length; i += 1) {
    sum += pcm[i] * pcm[i];
  }
  return Math.sqrt(sum / pcm.length);
}

function createRecentFinalsBuffer(maxSize: number) {
  const buffer: string[] = [];
  let lastPartial = '';

  return {
    addFinal(text: string): void {
      buffer.push(text);
      if (buffer.length > maxSize) {
        buffer.shift();
      }
    },
    setPartial(text: string): void {
      lastPartial = text;
    },
    isFragment(text: string): boolean {
      const words = text.trim().split(/\s+/);
      if (words.length > 1) return false;

      const normalized = text.trim().toLowerCase();
      for (const recent of buffer) {
        const recentLower = recent.toLowerCase();
        if (recentLower.includes(normalized)) {
          return true;
        }
      }
      if (lastPartial.toLowerCase().includes(normalized)) {
        return true;
      }
      return false;
    },
    clear(): void {
      buffer.length = 0;
      lastPartial = '';
    },
  };
}

function concatFrames(frames: Float32Array[]): Float32Array {
  const totalSamples = frames.reduce((sum, frame) => sum + frame.length, 0);
  const out = new Float32Array(totalSamples);
  let offset = 0;

  for (const frame of frames) {
    out.set(frame, offset);
    offset += frame.length;
  }

  return out;
}

async function awaitWithTimeout<T>(promise: Promise<T>, timeoutMs: number): Promise<T> {
  const timeoutMessage =
    'Offline transcription engine timed out while starting. Try the tiny model first, then retry.';

  let timeoutId: ReturnType<typeof setTimeout> | null = null;

  try {
    return await Promise.race([
      promise,
      new Promise<T>((_, reject) => {
        timeoutId = setTimeout(() => {
          reject(new Error(timeoutMessage));
        }, timeoutMs);
      }),
    ]);
  } finally {
    if (timeoutId) {
      clearTimeout(timeoutId);
    }
  }
}

export function createOfflineTranscriptionSession(options: OfflineSessionOptions) {
  const assembler = createTranscriptAssembler({
    maxSegmentChars: MAX_TRANSCRIPT_SEGMENT_CHARS,
    maxSegmentDurationMs: MAX_TRANSCRIPT_SEGMENT_DURATION_MS,
    unstableTailMs: options.unstableTailMs,
  });
  const recentFinals = createRecentFinalsBuffer(3);

  let language = 'auto';
  let recognizer: TranscriptionRecognizer | null = null;
  let frames: Float32Array[] = [];
  let totalSamples = 0;
  let silenceStartMs: number | null = null;
  let lastAnalysisAtMs = 0;
  let started = false;
  let stopped = false;
  let runtimeFailed = false;
  let analyzing = false;
  let queuedAnalysis = false;

  function emitAssembly(
    result: ReturnType<typeof assembler.applyWindow> | ReturnType<typeof assembler.finalize>,
    silenceTriggered: boolean,
  ) {
    for (const finalText of result.finals) {
      if (!finalText) continue;
      if (silenceTriggered && recentFinals.isFragment(finalText)) {
        console.log('[whisper] filtered fragment:', finalText.slice(0, 40));
        continue;
      }
      options.onFinal(finalText);
      recentFinals.addFinal(finalText);
    }

    if (result.partial !== null) {
      if (result.partial && silenceTriggered && recentFinals.isFragment(result.partial)) {
        options.onPartial('');
      } else if (result.partial) {
        options.onPartial(result.partial);
      }
      if (result.partial) {
        recentFinals.setPartial(result.partial);
      }
    }
  }

  async function analyzeCurrentAudio(silenceTriggered: boolean): Promise<void> {
    if (!recognizer || runtimeFailed || totalSamples === 0) return;
    if (analyzing) {
      queuedAnalysis = true;
      return;
    }

    analyzing = true;
    try {
      const pcmData = concatFrames(frames);
      const audioDurationMs = (totalSamples / options.sampleRate) * 1000;
      const startedAt = Date.now();
      const result = await recognizer.transcribe({
        audioDurationMs,
        audioStartMs: 0,
        language,
        pcmData,
        sampleRate: options.sampleRate,
      });
      options.onAnalysisComplete?.(Date.now() - startedAt);

      emitAssembly(
        assembler.applyWindow({
          audioDurationMs,
          chunks: result.chunks,
        }),
        silenceTriggered,
      );
    } catch (error) {
      runtimeFailed = true;
      const message = error instanceof Error ? error.message : String(error);
      options.onRuntimeFailure?.(`Offline transcription failed: ${message}`);
      options.onError(`Offline transcription failed: ${message}`);
    } finally {
      analyzing = false;
      if (queuedAnalysis && !runtimeFailed) {
        queuedAnalysis = false;
        await analyzeCurrentAudio(false);
      }
    }
  }

  return {
    async start(): Promise<void> {
      if (started) return;

      try {
        recognizer = await awaitWithTimeout(
          Promise.resolve(options.createRecognizer()),
          options.startupTimeoutMs,
        );
        await awaitWithTimeout(recognizer.start(), options.startupTimeoutMs);
        started = true;
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        options.onError(message);
        throw error;
      }
    },

    setLanguage(nextLanguage: string): void {
      language = nextLanguage;
    },

    async pushAudio(pcm: Float32Array): Promise<void> {
      if (!started || stopped || runtimeFailed || pcm.length === 0) return;

      frames.push(new Float32Array(pcm));
      totalSamples += pcm.length;

      const now = options.now();
      const elapsedMs = (totalSamples / options.sampleRate) * 1000;
      if (elapsedMs < options.minimumAnalysisMs) return;

      const rms = computeRms(pcm);
      if (rms < options.silenceThresholdRms) {
        if (silenceStartMs === null) {
          silenceStartMs = now;
        }
      } else {
        silenceStartMs = null;
      }

      const silenceTriggered = silenceStartMs !== null && now - silenceStartMs >= options.silenceDurationMs;
      if (
        now - lastAnalysisAtMs >= options.analysisThrottleMs ||
        silenceTriggered
      ) {
        lastAnalysisAtMs = now;
        await analyzeCurrentAudio(silenceTriggered);
      }
    },

    async stop(): Promise<void> {
      if (stopped) return;
      stopped = true;

      if (!runtimeFailed) {
        await analyzeCurrentAudio(false);
        emitAssembly(assembler.finalize(), false);
      }

      if (recognizer) {
        await recognizer.stop();
      }

      frames = [];
      totalSamples = 0;
      silenceStartMs = null;
      assembler.reset();
      recentFinals.clear();
    },
  };
}
