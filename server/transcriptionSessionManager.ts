import type { IncomingMessage } from 'node:http';

interface ManagedSocket {
  OPEN: number;
  readyState: number;
  send(data: string): void;
  close(code?: number, reason?: string): void;
}

export interface ManagedTranscriptionSession {
  start(): Promise<void>;
  stop(): Promise<void>;
  handleAudioChunk(data: Buffer | ArrayBuffer | ArrayBufferView): Promise<void>;
  handleTextMessage(data: string): Promise<void>;
}

export interface SessionManagerTimer {
  now(): number;
  setTimeout(fn: () => void, delayMs: number): number;
  clearTimeout(id: number): void;
}

export interface TranscriptionSessionManagerConfig {
  maxActiveTranscriptions: number;
  maxConnectionsPerClient: number;
  maxQueueSize: number;
  maxWsConnections: number;
  rateLimitMaxRequests: number;
  rateLimitWindowMs: number;
  sessionIdleTimeoutMs: number;
  sessionMaxDurationMs: number;
  maxAudioChunkBytes: number;
  maxTextMessageBytes: number;
}

interface SessionFactoryContext {
  connectionId: string;
  clientIp: string;
  recordProcessingLatency: (latencyMs: number) => void;
}

type SessionFactory = (context: SessionFactoryContext) => ManagedTranscriptionSession;

interface ConnectionRecord {
  id: string;
  ws: ManagedSocket;
  clientIp: string;
  state: 'queued' | 'starting' | 'active';
  sessionFactory: SessionFactory;
  session: ManagedTranscriptionSession | null;
  connectedAtMs: number;
  activatedAtMs: number | null;
  queuedAtMs: number | null;
  lastActivityAtMs: number;
  rateWindow: number[];
  bufferedMessages: string[];
  idleTimerId: number | null;
  maxDurationTimerId: number | null;
  stopPromise: Promise<void> | null;
}

interface SnapshotMetrics {
  activeConnections: number;
  activeTranscriptions: number;
  queuedSessions: number;
  rejectedSessions: number;
  averageQueueWaitMs: number;
  averageProcessingLatencyMs: number;
}

interface ManagerDependencies {
  config: TranscriptionSessionManagerConfig;
  timer?: SessionManagerTimer;
}

const DEFAULT_RETRY_AFTER_MS = 1_000;
const DEFAULT_TOO_MANY_CLIENT_CONNECTIONS_RETRY_MS = 5_000;

function createDefaultTimer(): SessionManagerTimer {
  return {
    now: () => Date.now(),
    setTimeout: (fn, delayMs) => setTimeout(fn, delayMs) as unknown as number,
    clearTimeout: (id) => clearTimeout(id),
  };
}

function sendJson(ws: ManagedSocket, payload: Record<string, unknown>): void {
  if (ws.readyState !== ws.OPEN) {
    return;
  }

  ws.send(JSON.stringify(payload));
}

function getClientIp(req: IncomingMessage): string {
  const forwardedFor = req.headers['x-forwarded-for'];
  if (typeof forwardedFor === 'string' && forwardedFor.trim()) {
    return forwardedFor.split(',')[0]?.trim() ?? 'unknown';
  }

  return req.socket.remoteAddress ?? 'unknown';
}

function getPayloadSize(data: Buffer | ArrayBuffer | ArrayBufferView): number {
  if (Buffer.isBuffer(data)) {
    return data.byteLength;
  }

  if (ArrayBuffer.isView(data)) {
    return data.byteLength;
  }

  return data.byteLength;
}

function parseControlType(data: string): string | null {
  try {
    const payload = JSON.parse(data) as { type?: string };
    return typeof payload.type === 'string' ? payload.type : null;
  } catch {
    return null;
  }
}

export function createTranscriptionSessionManager({ config, timer = createDefaultTimer() }: ManagerDependencies) {
  let nextConnectionId = 1;
  let rejectedSessions = 0;
  let totalQueueWaitMs = 0;
  let queueWaitSamples = 0;
  let totalProcessingLatencyMs = 0;
  let processingLatencySamples = 0;

  const connections = new Map<string, ConnectionRecord>();
  const queue: string[] = [];

  function getActiveSessionCount(): number {
    let count = 0;
    for (const connection of connections.values()) {
      if (connection.state === 'active' || connection.state === 'starting') {
        count += 1;
      }
    }
    return count;
  }

  function getPerClientConnectionCount(clientIp: string): number {
    let count = 0;
    for (const connection of connections.values()) {
      if (connection.clientIp === clientIp) {
        count += 1;
      }
    }
    return count;
  }

  function removeFromQueue(id: string): void {
    const index = queue.indexOf(id);
    if (index >= 0) {
      queue.splice(index, 1);
    }
  }

  function clearTimers(record: ConnectionRecord): void {
    if (record.idleTimerId !== null) {
      timer.clearTimeout(record.idleTimerId);
      record.idleTimerId = null;
    }

    if (record.maxDurationTimerId !== null) {
      timer.clearTimeout(record.maxDurationTimerId);
      record.maxDurationTimerId = null;
    }
  }

  async function stopSession(record: ConnectionRecord): Promise<void> {
    if (!record.session) {
      return;
    }

    record.stopPromise ??= record.session.stop().catch((error) => {
      console.error('[session-mgr] stop failed:', error);
    });
    await record.stopPromise;
  }

  function recordProcessingLatency(latencyMs: number): void {
    totalProcessingLatencyMs += latencyMs;
    processingLatencySamples += 1;
  }

  function scheduleActiveTimers(record: ConnectionRecord): void {
    clearTimers(record);

    record.idleTimerId = timer.setTimeout(() => {
      void terminateConnection(record.id, {
        closeCode: 1000,
        closeReason: 'idle timeout',
        errorMessage: 'Transcription session ended after inactivity. Start a new recording to continue.',
        stopSession: true,
      });
    }, config.sessionIdleTimeoutMs);

    record.maxDurationTimerId = timer.setTimeout(() => {
      void terminateConnection(record.id, {
        closeCode: 1000,
        closeReason: 'max duration reached',
        errorMessage: 'Transcription session reached the maximum duration. Start a new recording to continue.',
        stopSession: true,
      });
    }, config.sessionMaxDurationMs);
  }

  function touch(record: ConnectionRecord): void {
    record.lastActivityAtMs = timer.now();
    if (record.state === 'active') {
      scheduleActiveTimers(record);
    }
  }

  function trackRateLimit(record: ConnectionRecord): boolean {
    const now = timer.now();
    const floor = now - config.rateLimitWindowMs;
    record.rateWindow = record.rateWindow.filter((timestamp) => timestamp > floor);
    record.rateWindow.push(now);
    return record.rateWindow.length <= config.rateLimitMaxRequests;
  }

  async function promoteQueuedConnections(): Promise<void> {
    while (queue.length > 0 && getActiveSessionCount() < config.maxActiveTranscriptions) {
      const nextId = queue.shift();
      if (!nextId) {
        return;
      }

      const record = connections.get(nextId);
      if (!record || record.state !== 'queued') {
        continue;
      }

      await startConnection(record);
    }
  }

  async function startConnection(record: ConnectionRecord): Promise<void> {
    record.state = 'starting';
    record.session = record.sessionFactory({
      connectionId: record.id,
      clientIp: record.clientIp,
      recordProcessingLatency,
    });

    try {
      await record.session.start();

      if (!connections.has(record.id)) {
        await stopSession(record);
        return;
      }

      record.state = 'active';
      record.activatedAtMs = timer.now();
      touch(record);

      if (record.queuedAtMs !== null) {
        totalQueueWaitMs += record.activatedAtMs - record.queuedAtMs;
        queueWaitSamples += 1;
        record.queuedAtMs = null;
      }

      for (const message of record.bufferedMessages.splice(0)) {
        if (!connections.has(record.id)) {
          return;
        }

        await record.session.handleTextMessage(message);
      }

      sendJson(record.ws, { type: 'started' });
    } catch (error) {
      await terminateConnection(record.id, {
        closeCode: 1011,
        closeReason: 'session start failed',
        stopSession: true,
      });
    }
  }

  async function removeConnection(record: ConnectionRecord, stop: boolean): Promise<void> {
    connections.delete(record.id);
    removeFromQueue(record.id);
    clearTimers(record);
    if (stop) {
      await stopSession(record);
    }
    await promoteQueuedConnections();
  }

  async function terminateConnection(
    id: string,
    options: {
      closeCode: number;
      closeReason: string;
      errorMessage?: string;
      stopSession: boolean;
      sendStopped?: boolean;
      retryAfterMs?: number;
      busy?: boolean;
    },
  ): Promise<void> {
    const record = connections.get(id);
    if (!record) {
      return;
    }

    if (options.busy) {
      sendJson(record.ws, {
        type: 'busy',
        message: options.errorMessage,
        retryAfterMs: options.retryAfterMs ?? DEFAULT_RETRY_AFTER_MS,
      });
    } else if (options.errorMessage) {
      sendJson(record.ws, {
        type: 'error',
        message: options.errorMessage,
      });
    }

    if (options.sendStopped) {
      sendJson(record.ws, { type: 'stopped' });
    }

    await removeConnection(record, options.stopSession);
    record.ws.close(options.closeCode, options.closeReason);
  }

  async function handleStopMessage(record: ConnectionRecord): Promise<void> {
    await terminateConnection(record.id, {
      closeCode: 1000,
      closeReason: 'stopped',
      sendStopped: true,
      stopSession: true,
    });
  }

  return {
    async registerConnection(
      ws: ManagedSocket,
      req: IncomingMessage,
      sessionFactory: SessionFactory,
    ): Promise<{ id: string; state: 'queued' | 'active' | 'closed' }> {
      const clientIp = getClientIp(req);
      const id = `transcription-${nextConnectionId++}`;

      if (connections.size >= config.maxWsConnections) {
        rejectedSessions += 1;
        sendJson(ws, {
          type: 'busy',
          message: 'Transcription capacity is full. Please retry in a moment.',
          retryAfterMs: DEFAULT_RETRY_AFTER_MS,
        });
        ws.close(1013, 'server busy');
        return { id, state: 'closed' };
      }

      if (getPerClientConnectionCount(clientIp) >= config.maxConnectionsPerClient) {
        rejectedSessions += 1;
        sendJson(ws, {
          type: 'busy',
          message: 'Too many active transcription connections from this client.',
          retryAfterMs: DEFAULT_TOO_MANY_CLIENT_CONNECTIONS_RETRY_MS,
        });
        ws.close(1013, 'server busy');
        return { id, state: 'closed' };
      }

      const record: ConnectionRecord = {
        id,
        ws,
        clientIp,
        state: 'queued',
        sessionFactory,
        session: null,
        connectedAtMs: timer.now(),
        activatedAtMs: null,
        queuedAtMs: null,
        lastActivityAtMs: timer.now(),
        rateWindow: [],
        bufferedMessages: [],
        idleTimerId: null,
        maxDurationTimerId: null,
        stopPromise: null,
      };

      connections.set(id, record);

      if (getActiveSessionCount() < config.maxActiveTranscriptions && queue.length === 0) {
        await startConnection(record);
        return { id, state: connections.has(id) ? 'active' : 'closed' };
      }

      if (queue.length >= config.maxQueueSize) {
        rejectedSessions += 1;
        connections.delete(id);
        sendJson(ws, {
          type: 'busy',
          message: 'Transcription capacity is full. Please retry in a moment.',
          retryAfterMs: DEFAULT_RETRY_AFTER_MS,
        });
        ws.close(1013, 'server busy');
        return { id, state: 'closed' };
      }

      record.queuedAtMs = timer.now();
      queue.push(record.id);
      sendJson(ws, {
        type: 'queued',
        message: 'Transcription capacity is full. You are queued and recording will start automatically.',
        position: queue.length,
      });
      return { id, state: 'queued' };
    },

    async handleTextMessage(id: string, data: string): Promise<void> {
      const record = connections.get(id);
      if (!record) {
        return;
      }

      if (Buffer.byteLength(data, 'utf8') > config.maxTextMessageBytes) {
        await terminateConnection(record.id, {
          closeCode: 1009,
          closeReason: 'text message too large',
          errorMessage: 'Control message too large. Stop and restart the recording.',
          stopSession: true,
        });
        return;
      }

      if (!trackRateLimit(record)) {
        await terminateConnection(record.id, {
          closeCode: 1008,
          closeReason: 'rate limited',
          errorMessage: 'Rate limit exceeded. Slow down and retry in a moment.',
          stopSession: true,
        });
        return;
      }

      const controlType = parseControlType(data);
      if (controlType === 'stop') {
        await handleStopMessage(record);
        return;
      }

      touch(record);

      if (record.state === 'queued' || record.state === 'starting') {
        record.bufferedMessages.push(data);
        if (record.bufferedMessages.length > 8) {
          record.bufferedMessages.shift();
        }
        return;
      }

      try {
        await record.session?.handleTextMessage(data);
      } catch (error) {
        await terminateConnection(record.id, {
          closeCode: 1011,
          closeReason: 'control message failed',
          stopSession: true,
        });
      }
    },

    async handleAudioChunk(id: string, data: Buffer | ArrayBuffer | ArrayBufferView): Promise<void> {
      const record = connections.get(id);
      if (!record) {
        return;
      }

      if (getPayloadSize(data) > config.maxAudioChunkBytes) {
        await terminateConnection(record.id, {
          closeCode: 1009,
          closeReason: 'audio chunk too large',
          errorMessage: 'Audio chunk too large. Stop and restart the recording.',
          stopSession: true,
        });
        return;
      }

      if (!trackRateLimit(record)) {
        await terminateConnection(record.id, {
          closeCode: 1008,
          closeReason: 'rate limited',
          errorMessage: 'Rate limit exceeded. Slow down and retry in a moment.',
          stopSession: true,
        });
        return;
      }

      touch(record);
      if (record.state !== 'active' || !record.session) {
        return;
      }

      try {
        await record.session.handleAudioChunk(data);
      } catch (error) {
        await terminateConnection(record.id, {
          closeCode: 1011,
          closeReason: 'audio processing failed',
          stopSession: true,
        });
      }
    },

    async closeConnection(id: string, _reason: string): Promise<void> {
      const record = connections.get(id);
      if (!record) {
        return;
      }

      await removeConnection(record, true);
    },

    touchConnection(id: string): void {
      const record = connections.get(id);
      if (!record) {
        return;
      }

      touch(record);
    },

    getConnection(id: string): { id: string; state: ConnectionRecord['state'] } | undefined {
      const record = connections.get(id);
      if (!record) {
        return undefined;
      }

      return {
        id: record.id,
        state: record.state,
      };
    },

    getSnapshot(): SnapshotMetrics {
      let activeTranscriptions = 0;
      for (const record of connections.values()) {
        if (record.state === 'active') {
          activeTranscriptions += 1;
        }
      }

      return {
        activeConnections: connections.size,
        activeTranscriptions,
        queuedSessions: queue.length,
        rejectedSessions,
        averageQueueWaitMs: queueWaitSamples === 0 ? 0 : Math.round(totalQueueWaitMs / queueWaitSamples),
        averageProcessingLatencyMs:
          processingLatencySamples === 0
            ? 0
            : Math.round(totalProcessingLatencyMs / processingLatencySamples),
      };
    },
  };
}
