import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { Worker } from 'node:worker_threads';

import type { RecognitionRequest, RecognitionResult, TranscriptionRecognizer } from './session';
import {
  hasCompleteWhisperCache,
  hasPartialWhisperCache,
  resetWhisperCache,
} from './transformersWhisperCache';
import { WHISPER_MODEL_IDS, type WhisperModelName } from '../modelManifest.js';

export type { WhisperModelName } from '../modelManifest.js';

export interface WhisperStatus {
  state: 'idle' | 'downloading' | 'ready';
  progress: number;
  model: WhisperModelName;
}

const CACHE_DIR = path.join(os.homedir(), '.transcribe-easy', 'transformers-cache');
const WORKER_PATH = new URL('./transformersWhisperWorker.js', import.meta.url);

const ALL_WHISPER_MODELS: WhisperModelName[] = ['tiny', 'base', 'small', 'turbo-v3', 'turbo'];

function getDefaultWhisperModel(): WhisperModelName {
  const candidate = process.env.DEFAULT_WHISPER_MODEL;
  if (
    candidate === 'tiny' ||
    candidate === 'base' ||
    candidate === 'small' ||
    candidate === 'medium' ||
    candidate === 'turbo' ||
    candidate === 'turbo-v3'
  ) {
    return candidate;
  }

  return 'base';
}

type WorkerMessage =
  | { type: 'disposed' }
  | { type: 'error'; message: string; requestId: number | null }
  | { type: 'ready'; modelId: string }
  | { type: 'result'; chunks: RecognitionResult['chunks']; requestId: number; text: string }
  | { type: 'status'; state: WhisperStatus['state']; progress: number; message?: string };

class WhisperWorkerManager {
  private activeModel: WhisperModelName = getDefaultWhisperModel();

  private currentTask: 'transcribe' | 'translate' = 'transcribe';

  private worker: Worker | null = null;

  private readyPromise: Promise<void> | null = null;

  private readyReject: ((error: Error) => void) | null = null;

  private readyResolve: (() => void) | null = null;

  private pending = new Map<
    number,
    {
      reject: (error: Error) => void;
      resolve: (result: RecognitionResult) => void;
    }
  >();

  private inflightTranscriptions = new Map<number, Promise<RecognitionResult>>();

  private requestId = 0;

  private status: WhisperStatus = {
    state: 'idle',
    progress: 0,
    model: getDefaultWhisperModel(),
  };

  private syncStatus(partial: Partial<WhisperStatus>): void {
    this.status = {
      ...this.status,
      ...partial,
      model: this.activeModel,
    };
  }

  private resetWorker(error?: Error): void {
    this.worker?.removeAllListeners();
    this.worker = null;
    this.readyPromise = null;
    this.readyResolve = null;
    this.readyReject = null;

    for (const pending of this.pending.values()) {
      pending.reject(error ?? new Error('Offline Whisper worker stopped unexpectedly'));
    }
    this.pending.clear();
    this.inflightTranscriptions.clear();

    if (this.status.state !== 'idle') {
      this.syncStatus({ progress: 0, state: 'idle' });
    }
  }

  private handleWorkerMessage(message: WorkerMessage): void {
    if (message.type === 'status') {
      this.syncStatus({ progress: message.progress, state: message.state });
      return;
    }

    if (message.type === 'ready') {
      this.syncStatus({ progress: 100, state: 'ready' });
      this.readyResolve?.();
      this.readyResolve = null;
      this.readyReject = null;
      return;
    }

    if (message.type === 'result') {
      const pending = this.pending.get(message.requestId);
      if (!pending) return;
      this.pending.delete(message.requestId);
      pending.resolve({ chunks: message.chunks });
      return;
    }

    if (message.type === 'error') {
      const error = new Error(message.message);
      if (message.requestId === null) {
        this.resetWorker(error);
        this.readyReject?.(error);
        this.readyResolve = null;
        this.readyReject = null;
        return;
      }

      const pending = this.pending.get(message.requestId);
      if (!pending) return;
      this.pending.delete(message.requestId);
      pending.reject(error);
      return;
    }
  }

  private createWorker(): Worker {
    const worker = new Worker(WORKER_PATH);

    worker.on('message', (raw) => {
      this.handleWorkerMessage(raw as WorkerMessage);
    });

    worker.once('error', (error) => {
      this.readyReject?.(error);
      this.resetWorker(error);
    });

    worker.once('exit', (code) => {
      if (code !== 0) {
        const error = new Error(`Offline Whisper worker exited with code ${code}`);
        this.readyReject?.(error);
        this.resetWorker(error);
      } else {
        this.resetWorker();
      }
    });

    return worker;
  }

  async ensureReady(): Promise<void> {
    if (this.readyPromise) {
      return this.readyPromise;
    }

    fs.mkdirSync(CACHE_DIR, { recursive: true });

    if (hasPartialWhisperCache(CACHE_DIR, this.activeModel)) {
      resetWhisperCache(CACHE_DIR, this.activeModel);
    }

    this.syncStatus({ progress: 0, state: 'downloading' });

    this.readyPromise = new Promise<void>((resolve, reject) => {
      if (!this.worker) {
        this.worker = this.createWorker();
      }

      this.readyResolve = resolve;
      this.readyReject = reject;

      this.worker.postMessage({
        cacheDir: CACHE_DIR,
        modelId: WHISPER_MODEL_IDS[this.activeModel],
        type: 'init',
      });
    });

    try {
      await this.readyPromise;
      if (!hasCompleteWhisperCache(CACHE_DIR, this.activeModel)) {
        this.resetWorker(new Error(`Offline Whisper cache for ${this.activeModel} is incomplete`));
        throw new Error(`Offline Whisper cache for ${this.activeModel} is incomplete. Retry setup.`);
      }
    } catch (error) {
      this.syncStatus({ progress: 0, state: 'idle' });
      throw error;
    }
  }

  async transcribe(request: RecognitionRequest): Promise<RecognitionResult> {
    await this.ensureReady();
    if (!this.worker) {
      throw new Error('Offline Whisper worker is unavailable');
    }

    console.log('[whisper] transcribe lang:', request.language);
    const pcmCopy = new Float32Array(request.pcmData);
    const requestId = this.requestId += 1;

    const promise = new Promise<RecognitionResult>((resolve, reject) => {
      this.pending.set(requestId, { reject, resolve });
      this.worker?.postMessage(
        {
          audioDurationMs: request.audioDurationMs,
          language: request.language,
          pcmData: pcmCopy.buffer,
          requestId,
          task: this.currentTask,
          type: 'transcribe',
        },
        [pcmCopy.buffer],
      );
    });

    this.inflightTranscriptions.set(requestId, promise);
    void promise.finally(() => this.inflightTranscriptions.delete(requestId));
    return promise;
  }

  getStatus(): WhisperStatus {
    return { ...this.status, model: this.activeModel };
  }

  getModelName(): WhisperModelName {
    return this.activeModel;
  }

  setTask(task: 'transcribe' | 'translate'): void {
    this.currentTask = task;
  }

  async setModel(name: WhisperModelName): Promise<void> {
    if (name === this.activeModel) return;

    this.activeModel = name;
    this.syncStatus({ progress: 0, state: 'idle' });

    if (this.worker) {
      // Wait for any in-flight transcriptions to settle before asking the
      // existing worker to load the next model. Reusing the worker avoids
      // reloading native ONNX bindings on platforms where addons cannot be
      // safely unloaded and loaded again in a new worker.
      await Promise.allSettled([...this.inflightTranscriptions.values()]);
      this.readyPromise = null;
    }
  }

  createRecognizer(): TranscriptionRecognizer {
    return {
      start: async () => {
        await this.ensureReady();
      },
      stop: async () => {},
      transcribe: async (request) => {
        return this.transcribe(request);
      },
    };
  }
}

const manager = new WhisperWorkerManager();

export function createTransformersWhisperRecognizer(): TranscriptionRecognizer {
  return manager.createRecognizer();
}

export async function ensureTransformersWhisperReady(): Promise<void> {
  await manager.ensureReady();
}

export async function setTransformersWhisperModel(name: WhisperModelName): Promise<void> {
  await manager.setModel(name);
}

export function setTransformersWhisperTask(task: 'transcribe' | 'translate'): void {
  manager.setTask(task);
}

export function getTransformersWhisperModelName(): WhisperModelName {
  return manager.getModelName();
}

export function getTransformersWhisperStatus(): WhisperStatus {
  return manager.getStatus();
}

export async function ensureAllTransformersWhisperModelsDownloaded(
  onProgress?: (modelIndex: number, total: number, status: WhisperStatus) => void,
): Promise<void> {
  await ensureTransformersWhisperModelsDownloaded(ALL_WHISPER_MODELS, (_modelName, modelIndex, total, status) => {
    onProgress?.(modelIndex, total, status);
  });
}

export async function ensureTransformersWhisperModelsDownloaded(
  models: WhisperModelName[],
  onProgress?: (modelName: WhisperModelName, modelIndex: number, total: number, status: WhisperStatus) => void,
): Promise<void> {
  const saved = manager.getModelName();
  const uniqueModels = Array.from(new Set(models));

  for (let i = 0; i < uniqueModels.length; i++) {
    const modelName = uniqueModels[i];

    if (hasCompleteWhisperCache(CACHE_DIR, modelName)) {
      // Already on disk — skip loading into memory, just advance progress
      onProgress?.(modelName, i + 1, uniqueModels.length, manager.getStatus());
      continue;
    }

    await manager.setModel(modelName);
    onProgress?.(modelName, i, uniqueModels.length, manager.getStatus());
    await manager.ensureReady();
    onProgress?.(modelName, i + 1, uniqueModels.length, manager.getStatus());
  }

  // Restore to the default model and pre-load it so the first transcription is fast
  if (manager.getModelName() !== saved) {
    await manager.setModel(saved);
  }
  await manager.ensureReady();
}
