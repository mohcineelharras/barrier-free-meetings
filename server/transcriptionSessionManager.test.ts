import assert from 'node:assert/strict';
import test from 'node:test';

import type { IncomingMessage } from 'node:http';

import {
  createTranscriptionSessionManager,
  type ManagedTranscriptionSession,
  type SessionManagerTimer,
} from './transcriptionSessionManager';

class FakeTimer implements SessionManagerTimer {
  private nowMs = 0;
  private nextId = 1;
  private timers = new Map<number, { runAt: number; fn: () => void }>();

  now(): number {
    return this.nowMs;
  }

  setTimeout(fn: () => void, delayMs: number): number {
    const id = this.nextId++;
    this.timers.set(id, { runAt: this.nowMs + delayMs, fn });
    return id;
  }

  clearTimeout(id: number): void {
    this.timers.delete(id);
  }

  advanceBy(ms: number): void {
    this.nowMs += ms;
    let fired = true;

    while (fired) {
      fired = false;
      for (const [id, timer] of [...this.timers.entries()].sort((a, b) => a[1].runAt - b[1].runAt)) {
        if (timer.runAt <= this.nowMs) {
          this.timers.delete(id);
          timer.fn();
          fired = true;
        }
      }
    }
  }
}

class FakeSocket {
  OPEN = 1;
  readyState = 1;
  sent: Array<Record<string, unknown>> = [];
  closeCalls: Array<{ code?: number; reason?: string }> = [];

  send(data: string): void {
    this.sent.push(JSON.parse(data) as Record<string, unknown>);
  }

  close(code?: number, reason?: string): void {
    this.readyState = 3;
    this.closeCalls.push({ code, reason });
  }
}

function requestFor(ip: string): IncomingMessage {
  return {
    headers: {},
    socket: { remoteAddress: ip },
  } as IncomingMessage;
}

test('session manager starts up to capacity, queues overflow, and rejects once the queue is full', async () => {
  const timer = new FakeTimer();
  const started: string[] = [];
  const closed: string[] = [];

  const manager = createTranscriptionSessionManager({
    config: {
      maxActiveTranscriptions: 1,
      maxConnectionsPerClient: 2,
      maxQueueSize: 1,
      maxWsConnections: 3,
      rateLimitMaxRequests: 100,
      rateLimitWindowMs: 10_000,
      sessionIdleTimeoutMs: 30_000,
      sessionMaxDurationMs: 60_000,
      maxAudioChunkBytes: 64 * 1024,
      maxTextMessageBytes: 4 * 1024,
    },
    timer,
  });

  const factory = (label: string) => (): ManagedTranscriptionSession => ({
    async start() {
      started.push(label);
    },
    async stop() {
      closed.push(label);
    },
    async handleAudioChunk() {},
    async handleTextMessage() {},
  });

  const ws1 = new FakeSocket();
  const conn1 = await manager.registerConnection(ws1, requestFor('10.0.0.1'), factory('first'));
  assert.equal(conn1.state, 'active');
  assert.deepEqual(ws1.sent.map((message) => message.type), ['started']);

  const ws2 = new FakeSocket();
  const conn2 = await manager.registerConnection(ws2, requestFor('10.0.0.2'), factory('second'));
  assert.equal(conn2.state, 'queued');
  assert.deepEqual(ws2.sent[0], {
    type: 'queued',
    message: 'Transcription capacity is full. You are queued and recording will start automatically.',
    position: 1,
  });

  const ws3 = new FakeSocket();
  await manager.registerConnection(ws3, requestFor('10.0.0.3'), factory('third'));
  assert.deepEqual(ws3.sent[0], {
    type: 'busy',
    message: 'Transcription capacity is full. Please retry in a moment.',
    retryAfterMs: 1_000,
  });
  assert.deepEqual(ws3.closeCalls[0], { code: 1013, reason: 'server busy' });

  await manager.closeConnection(conn1.id, 'client disconnected');

  assert.deepEqual(started, ['first', 'second']);
  assert.equal(closed.includes('first'), true);
  assert.deepEqual(ws2.sent.map((message) => message.type), ['queued', 'started']);

  const snapshot = manager.getSnapshot();
  assert.equal(snapshot.activeConnections, 1);
  assert.equal(snapshot.activeTranscriptions, 1);
  assert.equal(snapshot.queuedSessions, 0);
  assert.equal(snapshot.rejectedSessions, 1);
});

test('session manager enforces per-client connection limits and rate limits', async () => {
  const timer = new FakeTimer();
  const manager = createTranscriptionSessionManager({
    config: {
      maxActiveTranscriptions: 2,
      maxConnectionsPerClient: 1,
      maxQueueSize: 2,
      maxWsConnections: 4,
      rateLimitMaxRequests: 2,
      rateLimitWindowMs: 1_000,
      sessionIdleTimeoutMs: 30_000,
      sessionMaxDurationMs: 60_000,
      maxAudioChunkBytes: 64 * 1024,
      maxTextMessageBytes: 4 * 1024,
    },
    timer,
  });

  const sessionFactory = (): ManagedTranscriptionSession => ({
    async start() {},
    async stop() {},
    async handleAudioChunk() {},
    async handleTextMessage() {},
  });

  const ws1 = new FakeSocket();
  const conn = await manager.registerConnection(ws1, requestFor('10.0.0.8'), sessionFactory);
  assert.equal(conn.state, 'active');

  const ws2 = new FakeSocket();
  await manager.registerConnection(ws2, requestFor('10.0.0.8'), sessionFactory);
  assert.deepEqual(ws2.sent[0], {
    type: 'busy',
    message: 'Too many active transcription connections from this client.',
    retryAfterMs: 5_000,
  });

  await manager.handleTextMessage(conn.id, JSON.stringify({ type: 'config', language: 'en' }));
  await manager.handleTextMessage(conn.id, JSON.stringify({ type: 'config', language: 'fr' }));
  await manager.handleTextMessage(conn.id, JSON.stringify({ type: 'config', language: 'es' }));

  assert.deepEqual(ws1.sent.at(-1), {
    type: 'error',
    message: 'Rate limit exceeded. Slow down and retry in a moment.',
  });
  assert.deepEqual(ws1.closeCalls.at(-1), { code: 1008, reason: 'rate limited' });
});

test('session manager replays buffered config before announcing transcription start', async () => {
  const timer = new FakeTimer();
  const eventOrder: string[] = [];
  const manager = createTranscriptionSessionManager({
    config: {
      maxActiveTranscriptions: 1,
      maxConnectionsPerClient: 1,
      maxQueueSize: 0,
      maxWsConnections: 1,
      rateLimitMaxRequests: 100,
      rateLimitWindowMs: 10_000,
      sessionIdleTimeoutMs: 30_000,
      sessionMaxDurationMs: 60_000,
      maxAudioChunkBytes: 64 * 1024,
      maxTextMessageBytes: 4 * 1024,
    },
    timer,
  });

  const ws = new FakeSocket();
  const registerPromise = manager.registerConnection(ws, requestFor('10.0.0.10'), () => ({
    async start() {
      eventOrder.push('session:start');
      await Promise.resolve();
    },
    async stop() {},
    async handleAudioChunk() {},
    async handleTextMessage(data: string) {
      const parsed = JSON.parse(data) as { type?: string; language?: string };
      if (parsed.type === 'config') {
        eventOrder.push(`config:${parsed.language}`);
      }
    },
  }));

  await Promise.resolve();
  const activeConnectionId = 'transcription-1';
  await manager.handleTextMessage(activeConnectionId, JSON.stringify({ type: 'config', language: 'zh-CN' }));
  await registerPromise;

  const startedIndex = ws.sent.findIndex((message) => message.type === 'started');
  const configIndex = eventOrder.findIndex((event) => event === 'config:zh-CN');
  assert.notEqual(startedIndex, -1);
  assert.notEqual(configIndex, -1);
  assert.deepEqual(eventOrder, ['session:start', 'config:zh-CN']);
});

test('session manager rejects oversized audio chunks and closes idle sessions cleanly', async () => {
  const timer = new FakeTimer();
  let stopCalls = 0;
  const manager = createTranscriptionSessionManager({
    config: {
      maxActiveTranscriptions: 1,
      maxConnectionsPerClient: 1,
      maxQueueSize: 0,
      maxWsConnections: 1,
      rateLimitMaxRequests: 100,
      rateLimitWindowMs: 10_000,
      sessionIdleTimeoutMs: 500,
      sessionMaxDurationMs: 5_000,
      maxAudioChunkBytes: 8,
      maxTextMessageBytes: 1_024,
    },
    timer,
  });

  const ws = new FakeSocket();
  const conn = await manager.registerConnection(ws, requestFor('10.0.0.9'), () => ({
    async start() {},
    async stop() {
      stopCalls += 1;
    },
    async handleAudioChunk() {},
    async handleTextMessage() {},
  }));

  await manager.handleAudioChunk(conn.id, Buffer.alloc(12));
  assert.deepEqual(ws.sent.at(-1), {
    type: 'error',
    message: 'Audio chunk too large. Stop and restart the recording.',
  });
  assert.deepEqual(ws.closeCalls.at(-1), { code: 1009, reason: 'audio chunk too large' });

  const idleWs = new FakeSocket();
  const idleConn = await manager.registerConnection(idleWs, requestFor('10.0.1.1'), () => ({
    async start() {},
    async stop() {
      stopCalls += 1;
    },
    async handleAudioChunk() {},
    async handleTextMessage() {},
  }));

  timer.advanceBy(501);
  await new Promise((resolve) => setImmediate(resolve));

  assert.equal(stopCalls >= 1, true);
  assert.deepEqual(idleWs.sent.at(-1), {
    type: 'error',
    message: 'Transcription session ended after inactivity. Start a new recording to continue.',
  });
  assert.deepEqual(idleWs.closeCalls.at(-1), { code: 1000, reason: 'idle timeout' });
  assert.equal(manager.getConnection(idleConn.id), undefined);
});

test('session manager records queue wait and processing latency metrics', async () => {
  const timer = new FakeTimer();
  let recordLatency: ((ms: number) => void) | null = null;

  const manager = createTranscriptionSessionManager({
    config: {
      maxActiveTranscriptions: 1,
      maxConnectionsPerClient: 2,
      maxQueueSize: 1,
      maxWsConnections: 2,
      rateLimitMaxRequests: 100,
      rateLimitWindowMs: 10_000,
      sessionIdleTimeoutMs: 10_000,
      sessionMaxDurationMs: 60_000,
      maxAudioChunkBytes: 64 * 1024,
      maxTextMessageBytes: 1_024,
    },
    timer,
  });

  const ws1 = new FakeSocket();
  const conn1 = await manager.registerConnection(ws1, requestFor('10.1.0.1'), () => ({
    async start() {},
    async stop() {},
    async handleAudioChunk() {},
    async handleTextMessage() {},
  }));

  const ws2 = new FakeSocket();
  await manager.registerConnection(ws2, requestFor('10.1.0.2'), ({ recordProcessingLatency }) => {
    recordLatency = recordProcessingLatency;
    return {
      async start() {},
      async stop() {},
      async handleAudioChunk() {},
      async handleTextMessage() {},
    };
  });

  timer.advanceBy(250);
  await manager.closeConnection(conn1.id, 'finished');

  recordLatency?.(180);
  const snapshot = manager.getSnapshot();
  assert.equal(snapshot.averageQueueWaitMs, 250);
  assert.equal(snapshot.averageProcessingLatencyMs, 180);
});
