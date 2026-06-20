import { type IncomingMessage } from 'node:http';

import { WebSocketServer, type RawData, type WebSocket } from 'ws';

import {
  createOfflineTranscriptionSession,
  type TranscriptionRecognizer,
} from './offline-stt/session.js';
import { getServerRuntimeConfig } from './runtimeConfig.js';
import {
  createTranscriptionSessionManager,
  type SessionManagerTimer,
  type TranscriptionSessionManagerConfig,
} from './transcriptionSessionManager.js';
import { createWhisperRecognizer } from './whisper.js';
import { createDeviceAudioCapture } from './deviceAudioCapture.js';

const SAMPLE_RATE = 16_000;
const SILENCE_THRESHOLD_RMS = 0.005;
const SILENCE_DURATION_MS = 800;
const MINIMUM_ANALYSIS_MS = 900;
const ANALYSIS_THROTTLE_MS = 900;
const UNSTABLE_TAIL_MS = 900;
const STARTUP_TIMEOUT_MS = 300_000;

interface WebSocketLike {
  OPEN: number;
  readyState: number;
  send(data: string): void;
  close(code?: number, reason?: string): void;
}

interface SessionDependencies {
  analysisThrottleMs: number;
  createRecognizer: () => Promise<TranscriptionRecognizer> | TranscriptionRecognizer;
  minimumAnalysisMs: number;
  now: () => number;
  onProcessingLatency?: (latencyMs: number) => void;
  sampleRate: number;
  silenceDurationMs: number;
  silenceThresholdRms: number;
  startupTimeoutMs: number;
  unstableTailMs: number;
}

export interface TranscribeWebSocketRuntime {
  config: TranscriptionSessionManagerConfig;
  getSnapshot(): {
    activeConnections: number;
    activeTranscriptions: number;
    queuedSessions: number;
    rejectedSessions: number;
    averageQueueWaitMs: number;
    averageProcessingLatencyMs: number;
  };
  wss: WebSocketServer;
}

interface AttachWebSocketServerOptions {
  config?: TranscriptionSessionManagerConfig;
  isOriginAllowed?: (origin: string | undefined) => boolean;
  sessionOverrides?: Partial<SessionDependencies>;
  timer?: SessionManagerTimer;
}

const defaultDependencies: SessionDependencies = {
  analysisThrottleMs: ANALYSIS_THROTTLE_MS,
  createRecognizer: () => createWhisperRecognizer(),
  minimumAnalysisMs: MINIMUM_ANALYSIS_MS,
  now: () => Date.now(),
  sampleRate: SAMPLE_RATE,
  silenceDurationMs: SILENCE_DURATION_MS,
  silenceThresholdRms: SILENCE_THRESHOLD_RMS,
  startupTimeoutMs: STARTUP_TIMEOUT_MS,
  unstableTailMs: UNSTABLE_TAIL_MS,
};

function sendJson(ws: WebSocketLike, payload: object): void {
  if (ws.readyState === ws.OPEN) {
    ws.send(JSON.stringify(payload));
  }
}

function toFloat32Chunk(data: Buffer | ArrayBuffer | ArrayBufferView): Float32Array {
  const buffer =
    data instanceof Buffer
      ? data
      : ArrayBuffer.isView(data)
        ? Buffer.from(data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength))
        : Buffer.from(data);

  if (buffer.byteLength % Float32Array.BYTES_PER_ELEMENT !== 0) {
    throw new Error('Received malformed audio chunk.');
  }

  const aligned = buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength);
  return new Float32Array(aligned);
}

function normalizeRawData(data: RawData): string | Buffer | ArrayBuffer | ArrayBufferView {
  if (Array.isArray(data)) {
    return Buffer.concat(data);
  }

  return data as string | Buffer | ArrayBuffer | ArrayBufferView;
}

function isTranscribePath(url: string | undefined): boolean {
  if (!url) {
    return false;
  }

  try {
    return new URL(url, 'http://localhost').pathname === '/ws/transcribe';
  } catch {
    return false;
  }
}

export function createTranscribeSession(
  ws: WebSocketLike,
  overrides: Partial<SessionDependencies> = {},
  touchConnection?: () => void,
) {
  const dependencies: SessionDependencies = {
    ...defaultDependencies,
    ...overrides,
  };

  let fatalRuntimeError: string | null = null;
  let deviceCapture: ReturnType<typeof createDeviceAudioCapture> | null = null;

  const session = createOfflineTranscriptionSession({
    analysisThrottleMs: dependencies.analysisThrottleMs,
    createRecognizer: dependencies.createRecognizer,
    minimumAnalysisMs: dependencies.minimumAnalysisMs,
    now: dependencies.now,
    onAnalysisComplete: dependencies.onProcessingLatency,
    onError: (message) => {
      sendJson(ws, { type: 'error', message });
    },
    onFinal: (text) => {
      sendJson(ws, { type: 'final', text });
    },
    onPartial: (text) => {
      sendJson(ws, { type: 'partial', text });
    },
    onRuntimeFailure: (message) => {
      fatalRuntimeError = message;
    },
    sampleRate: dependencies.sampleRate,
    silenceDurationMs: dependencies.silenceDurationMs,
    silenceThresholdRms: dependencies.silenceThresholdRms,
    startupTimeoutMs: dependencies.startupTimeoutMs,
    unstableTailMs: dependencies.unstableTailMs,
  });

  let startPromise: Promise<void> | null = null;

  async function ensureStarted(): Promise<void> {
    startPromise ??= session.start();
    return startPromise;
  }

  return {
    async start(): Promise<void> {
      await ensureStarted();
    },

    async handleTextMessage(data: string): Promise<void> {
      try {
        const message = JSON.parse(data) as { type?: string; language?: string };
        console.log('[ws] msg:', message.type);

        if (message.type === 'start_device_capture') {
          if (deviceCapture?.isActive()) {
            return;
          }

          deviceCapture = createDeviceAudioCapture({
            onChunk: (chunk: Buffer) => {
              if (chunk.byteLength % Float32Array.BYTES_PER_ELEMENT !== 0) return;
              const aligned = chunk.buffer.slice(
                chunk.byteOffset,
                chunk.byteOffset + chunk.byteLength,
              );
              const pcm = new Float32Array(aligned);
              void session.pushAudio(pcm);
              touchConnection?.();
            },
            onError: (msg) => {
              sendJson(ws, { type: 'error', message: msg });
            },
            onEnd: () => {
              // Device capture ended naturally
            },
          });

          try {
            await deviceCapture.start();
            sendJson(ws, { type: 'device_capture_started' });
          } catch (err) {
            const msg = err instanceof Error ? err.message : 'Failed to start device audio capture';
            sendJson(ws, { type: 'error', message: msg });
            deviceCapture = null;
          }
          return;
        }

        if (message.type === 'config' && message.language) {
          console.log('[ws] lang:', message.language);
          session.setLanguage(message.language);
        }
      } catch {
        // Ignore malformed text messages to keep the connection resilient.
      }
    },

    async handleAudioChunk(data: Buffer | ArrayBuffer | ArrayBufferView): Promise<void> {
      await ensureStarted();
      await session.pushAudio(toFloat32Chunk(data));

      if (fatalRuntimeError) {
        const message = fatalRuntimeError;
        fatalRuntimeError = null;
        throw new Error(message);
      }
    },

    async stop(): Promise<void> {
      if (deviceCapture?.isActive()) {
        deviceCapture.stop();
      }
      await session.stop();
    },
  };
}

export function attachWebSocketServer(
  httpServer: import('node:http').Server,
  options: AttachWebSocketServerOptions = {},
): TranscribeWebSocketRuntime {
  const wss = new WebSocketServer({ noServer: true });
  const config = options.config ?? getServerRuntimeConfig().transcription;
  const manager = createTranscriptionSessionManager({
    config,
    timer: options.timer,
  });

  httpServer.on('upgrade', (req: IncomingMessage, socket, head) => {
    const origin =
      typeof req.headers.origin === 'string' ? req.headers.origin : undefined;

    if (isTranscribePath(req.url)) {
      if (options.isOriginAllowed?.(origin) ?? true) {
        wss.handleUpgrade(req, socket, head, (ws) => {
          wss.emit('connection', ws, req);
        });
      } else {
        // Origin is explicitly blocked for the transcription endpoint.
        // Destroy the socket so the browser receives a clean connection close
        // rather than hanging indefinitely waiting for a 101 response.
        socket.destroy();
      }
      return;
    }

    // Non-transcription path (e.g. Vite HMR /?token=…): do NOT destroy the
    // socket — let any other upgrade listeners registered on this server claim it.
  });

  wss.on('connection', (ws: WebSocket, req: IncomingMessage) => {
    let connectionId: string | null = null;
    let socketClosed = false;
    const bufferedMessages: Array<{ data: RawData; isBinary: boolean }> = [];

    const forwardMessage = async (data: RawData, isBinary: boolean): Promise<void> => {
      if (!connectionId) {
        bufferedMessages.push({ data, isBinary });
        return;
      }

      if (!isBinary) {
        const normalized = normalizeRawData(data);
        const text = Buffer.isBuffer(normalized)
          ? normalized.toString('utf8')
          : typeof normalized === 'string'
            ? normalized
            : Buffer.from(normalized as ArrayBuffer).toString('utf8');
        await manager.handleTextMessage(connectionId, text);
        return;
      }

      await manager.handleAudioChunk(connectionId, normalizeRawData(data) as Buffer | ArrayBuffer | ArrayBufferView);
    };

    ws.on('message', (data: RawData, isBinary: boolean) => {
      void forwardMessage(data, isBinary);
    });

    ws.on('close', () => {
      socketClosed = true;
      if (connectionId) {
        void manager.closeConnection(connectionId, 'socket closed');
      }
    });

    ws.on('error', (error) => {
      console.error('[ws] error:', error.message);
    });

    void (async () => {
      const registration = await manager.registerConnection(
        ws,
        req,
        ({ recordProcessingLatency, connectionId }) =>
          createTranscribeSession(
            ws,
            {
              ...options.sessionOverrides,
              onProcessingLatency: recordProcessingLatency,
            },
            () => {
              manager.touchConnection(connectionId);
            },
          ),
      );

      connectionId = registration.id;
      if (registration.state === 'closed') {
        bufferedMessages.length = 0;
        return;
      }

      for (const { data, isBinary } of bufferedMessages.splice(0)) {
        await forwardMessage(data, isBinary);
      }

      if (socketClosed && connectionId) {
        await manager.closeConnection(connectionId, 'socket closed during registration');
      }
    })().catch((error) => {
      console.error('[ws] register failed:', error);
      ws.close(1011, 'registration failed');
    });
  });

  return {
    config,
    getSnapshot: () => manager.getSnapshot(),
    wss,
  };
}
