import {
  createTransformersWhisperRecognizer,
  ensureAllTransformersWhisperModelsDownloaded,
  ensureTransformersWhisperReady,
  getTransformersWhisperModelName,
  getTransformersWhisperStatus,
  setTransformersWhisperModel,
  setTransformersWhisperTask,
  type WhisperModelName,
  type WhisperStatus,
} from './offline-stt/transformersWhisperEngine.js';

export type { WhisperModelName, WhisperStatus };

export function getWhisperModelName(): WhisperModelName {
  return getTransformersWhisperModelName();
}

export function getWhisperStatus(): WhisperStatus {
  return getTransformersWhisperStatus();
}

export async function ensureModelDownloaded(
  onProgress?: (status: WhisperStatus) => void,
): Promise<void> {
  onProgress?.(getWhisperStatus());
  await ensureTransformersWhisperReady();
  onProgress?.(getWhisperStatus());
}

export function createWhisperRecognizer() {
  return createTransformersWhisperRecognizer();
}

export async function setWhisperModel(name: WhisperModelName): Promise<void> {
  await setTransformersWhisperModel(name);
}

export function setWhisperTask(task: 'transcribe' | 'translate'): void {
  setTransformersWhisperTask(task);
}

export async function ensureAllModelsDownloaded(
  onProgress?: (modelIndex: number, total: number, status: WhisperStatus) => void,
): Promise<void> {
  await ensureAllTransformersWhisperModelsDownloaded(onProgress);
}
