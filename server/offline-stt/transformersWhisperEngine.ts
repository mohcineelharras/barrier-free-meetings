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

export type WhisperModelName = 'tiny' | 'base' | 'small' | 'medium' | 'turbo' | 'turbo-v3';

export interface WhisperStatus {
  state: 'idle' | 'downloading' | 'ready';
  progress: number;
  model: WhisperModelName;
}

const CACHE_DIR = path.join(os.homedir(), '.transcribe-easy', 'transformers-cache');
const WORKER_PATH = new URL('./transformersWhisperWorker.js', import.meta.url);

const ALL_WHISPER_MODELS: WhisperModelName[] = ['tiny', 'base', 'small', 'turbo-v3', 'turbo'];

const MODEL_IDS: Record<WhisperModelName, string> = {
  tiny: 'onnx-community/whisper-tiny_timestamped',
  base: 'onnx-community/whisper-base_timestamped',
  small: 'onnx-community/whisper-small_timestamped',
  medium: 'onnx-community/whisper-medium_timestamped',
  turbo: 'onnx-community/lite-whisper-large-v3-turbo-ONNX',
  'turbo-v3': 'onnx-community/whisper-large-v3-turbo_timestamped',
};

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

    for (const pending of this.pending.values()) {
      pending.reject(error ?? new Error('Offline Whisper worker stopped unexpectedly'));
    }
    this.pending.clear();
    this.inflightTranscriptions.clear();

    if (this.status.state !== 'idle') {
      this.syncStatus({ progress: 0, state: 'idle' });
    }
  }

  private handleWorkerMessage(message: WorkerMessage, resolveReady: () => void, rejectReady: (error: Error) => void): void {
    if (message.type === 'status') {
      this.syncStatus({ progress: message.progress, state: message.state });
      return;
    }

    if (message.type === 'ready') {
      this.syncStatus({ progress: 100, state: 'ready' });
      resolveReady();
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
        rejectReady(error);
        return;
      }

      const pending = this.pending.get(message.requestId);
      if (!pending) return;
      this.pending.delete(message.requestId);
      pending.reject(error);
      return;
    }
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
      const worker = new Worker(WORKER_PATH);
      this.worker = worker;

      worker.on('message', (raw) => {
        this.handleWorkerMessage(raw as WorkerMessage, resolve, reject);
      });

      worker.once('error', (error) => {
        this.resetWorker(error);
        reject(error);
      });

      worker.once('exit', (code) => {
        if (code !== 0) {
          this.resetWorker(new Error(`Offline Whisper worker exited with code ${code}`));
        } else {
          this.resetWorker();
        }
      });

      worker.postMessage({
        cacheDir: CACHE_DIR,
        modelId: MODEL_IDS[this.activeModel],
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
      // Wait for any in-flight transcriptions to settle before tearing down
      // the worker. This prevents sessions from crashing with runtimeFailed
      // when the model is switched while audio is being processed.
      await Promise.allSettled([...this.inflightTranscriptions.values()]);
      const worker = this.worker;
      this.resetWorker();
      await worker.terminate();
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
  const saved = manager.getModelName();

  for (let i = 0; i < ALL_WHISPER_MODELS.length; i++) {
    const modelName = ALL_WHISPER_MODELS[i];

    if (hasCompleteWhisperCache(CACHE_DIR, modelName)) {
      // Already on disk — skip loading into memory, just advance progress
      onProgress?.(i + 1, ALL_WHISPER_MODELS.length, manager.getStatus());
      continue;
    }

    await manager.setModel(modelName);
    onProgress?.(i, ALL_WHISPER_MODELS.length, manager.getStatus());
    await manager.ensureReady();
    onProgress?.(i + 1, ALL_WHISPER_MODELS.length, manager.getStatus());
  }

  // Restore to the default model and pre-load it so the first transcription is fast
  if (manager.getModelName() !== saved) {
    await manager.setModel(saved);
  }
  await manager.ensureReady();
}
