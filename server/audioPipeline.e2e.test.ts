import assert from 'node:assert/strict';
import test from 'node:test';

import type { IncomingMessage } from 'node:http';

import { createTranscribeSession } from './wsTranscribe';
import { createTranscriptionSessionManager, type SessionManagerTimer } from './transcriptionSessionManager';

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

test('audio pipeline preserves queued language config through first offline transcription window', async () => {
  const timer = new FakeTimer();
  const manager = createTranscriptionSessionManager({
    config: {
      maxActiveTranscriptions: 1,
      maxConnectionsPerClient: 2,
      maxQueueSize: 1,
      maxWsConnections: 2,
      rateLimitMaxRequests: 100,
      rateLimitWindowMs: 10_000,
      sessionIdleTimeoutMs: 30_000,
      sessionMaxDurationMs: 60_000,
      maxAudioChunkBytes: 64 * 1024,
      maxTextMessageBytes: 4 * 1024,
    },
    timer,
  });

  const blockerSocket = new FakeSocket();
  const blocker = await manager.registerConnection(blockerSocket, requestFor('10.0.0.1'), () => ({
    async start() {},
    async stop() {},
    async handleAudioChunk() {},
    async handleTextMessage() {},
  }));
  assert.equal(blocker.state, 'active');

  let seenLanguage: string | null = null;
  const ws = new FakeSocket();
  const queued = await manager.registerConnection(ws, requestFor('10.0.0.2'), () =>
    createTranscribeSession(ws, {
      createRecognizer: async () => ({
        async start() {},
        async stop() {},
        async transcribe(request) {
          seenLanguage = request.language;
          return {
            chunks: [{ endMs: 1_000, startMs: 0, text: 'bonjour' }],
          };
        },
      }),
      minimumAnalysisMs: 500,
      now: () => 1_000,
      sampleRate: 4,
      silenceDurationMs: 400,
      silenceThresholdRms: 0.1,
      startupTimeoutMs: 1_000,
      unstableTailMs: 300,
    }),
  );
  assert.equal(queued.state, 'queued');

  await manager.handleTextMessage(queued.id, JSON.stringify({ type: 'config', language: 'zh-CN' }));
  await manager.closeConnection(blocker.id, 'release slot');
  await manager.handleAudioChunk(
    queued.id,
    Buffer.from(new Float32Array([0.8, 0.8, 0.8, 0.8]).buffer),
  );

  assert.equal(seenLanguage, 'zh-CN');
  assert.deepEqual(
    ws.sent.map((message) => message.type),
    ['queued', 'started', 'partial'],
  );
});
