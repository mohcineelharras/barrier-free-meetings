import { parentPort } from 'node:worker_threads';

import { env, pipeline } from '@huggingface/transformers';

// ---------------------------------------------------------------------------
// Inlined from ./whisperConfig.ts and ./transformersWhisperResult.ts
// Worker threads do not inherit the parent's tsx loader, so they cannot
// resolve .ts imports. Keeping these helpers inline avoids that whole class
// of failure. If you change the originals, mirror the change here.
// ---------------------------------------------------------------------------

function normalizeWhisperLanguage(language) {
  if (!language || language === 'auto') return undefined;
  return language.split('-')[0].toLowerCase();
}

function buildWhisperTranscriptionOptions(language, task = 'transcribe') {
  const normalizedLanguage = normalizeWhisperLanguage(language);
  return {
    chunk_length_s: 29,
    force_full_sequences: false,
    language: normalizedLanguage,
    return_timestamps: 'word',
    stride_length_s: 5,
    task,
  };
}

function normalizeText(text) {
  return typeof text === 'string' ? text.trim() : '';
}

function hasRepetitionHallucination(text) {
  if (!text || text.length < 10) return false;

  const normalized = text.trim().replace(/\s+/g, ' ');
  if (normalized.length < 10) return false;

  const tokens = normalized.split(' ').filter((t) => t.length > 0);
  if (tokens.length < 4) return false;

  let consecutiveCount = 1;
  for (let i = 1; i < tokens.length; i++) {
    if (tokens[i] === tokens[i - 1]) {
      consecutiveCount++;
      if (consecutiveCount > 3) return true;
    } else {
      consecutiveCount = 1;
    }
  }

  for (let n = 2; n <= Math.min(4, Math.floor(tokens.length / 3)); n++) {
    for (let i = 0; i <= tokens.length - n * 3; i++) {
      const phrase = tokens.slice(i, i + n).join(' ');
      let repeatCount = 1;
      for (let j = i + n; j <= tokens.length - n; j += n) {
        const nextPhrase = tokens.slice(j, j + n).join(' ');
        if (nextPhrase === phrase) {
          repeatCount++;
          if (repeatCount >= 3) return true;
        } else {
          break;
        }
      }
    }
  }

  const uniqueTokens = new Set(tokens);
  if (uniqueTokens.size <= 2 && tokens.length > 6) return true;
  if (tokens.length > 8 && uniqueTokens.size / tokens.length < 0.2) return true;

  return false;
}

function toTimestampedChunks(chunks) {
  if (!Array.isArray(chunks)) return [];

  return chunks
    .filter((chunk) => Array.isArray(chunk.timestamp) && chunk.timestamp.length === 2)
    .map((chunk) => ({
      text: normalizeText(chunk.text),
      startMs: Math.round(Number(chunk.timestamp[0]) * 1000),
      endMs: Math.round(Number(chunk.timestamp[1]) * 1000),
    }))
    .filter((chunk) => Number.isFinite(chunk.startMs) && Number.isFinite(chunk.endMs) && chunk.text)
    .filter((chunk) => !hasRepetitionHallucination(chunk.text));
}

function buildRecognitionResult({ audioDurationMs, result }) {
  const text = normalizeText(result?.text);
  const chunks = toTimestampedChunks(result?.chunks);

  if (chunks.length > 0) {
    const remainingText = chunks.map((c) => c.text).join(' ').trim();
    return { chunks, text: remainingText };
  }

  if (!text) {
    return { chunks: [], text: '' };
  }

  if (hasRepetitionHallucination(text)) {
    console.log('[whisper] filtered repetition:', text.substring(0, 60));
    return { chunks: [], text: '' };
  }

  return {
    chunks: [
      {
        text,
        startMs: 0,
        endMs: Math.max(0, Math.round(audioDurationMs)),
      },
    ],
    text,
  };
}

// ---------------------------------------------------------------------------
// Worker loop
// ---------------------------------------------------------------------------

let transcriber = null;
let currentModelId = null;

function isTimestampExtractionError(error) {
  const message = error instanceof Error ? error.message : String(error);
  return /cross attentions|ending timestamp|timestamp/i.test(message);
}

async function transcribeWithFallback(audio, language, task) {
  try {
    return await transcriber(audio, buildWhisperTranscriptionOptions(language, task));
  } catch (error) {
    if (!isTimestampExtractionError(error)) {
      throw error;
    }

    return transcriber(audio, {
      ...buildWhisperTranscriptionOptions(language, task),
      return_timestamps: false,
    });
  }
}

async function ensurePipeline({ cacheDir, modelId }) {
  if (transcriber && currentModelId === modelId) {
    return;
  }

  env.cacheDir = cacheDir;
  env.allowLocalModels = true;
  env.allowRemoteModels = true;
  env.useFSCache = true;

  parentPort?.postMessage({
    type: 'status',
    state: 'downloading',
    progress: 10,
    message: `Loading offline Whisper model ${modelId}`,
  });

  transcriber?.dispose?.();
  transcriber = await pipeline('automatic-speech-recognition', modelId);
  if (modelId.includes('turbo') && transcriber.model?.generation_config) {
    transcriber.model.generation_config.is_multilingual = true;
  }
  currentModelId = modelId;

  parentPort?.postMessage({
    type: 'ready',
    modelId,
  });
}

parentPort?.on('message', async (message) => {
  try {
    if (message.type === 'init') {
      await ensurePipeline(message);
      return;
    }

    if (message.type === 'transcribe') {
      if (!transcriber) {
        throw new Error('Offline Whisper worker is not initialized');
      }

      console.log('[transformersWhisperWorker] Received transcribe request with language:', message.language, 'task:', message.task);
      const audio = new Float32Array(message.pcmData);
      const task = message.task || 'transcribe';
      const result = await transcribeWithFallback(audio, message.language, task);
      const recognition = buildRecognitionResult({
        audioDurationMs: message.audioDurationMs,
        result,
      });

      parentPort?.postMessage({
        type: 'result',
        requestId: message.requestId,
        chunks: recognition.chunks,
        text: recognition.text,
      });
      return;
    }

    if (message.type === 'dispose') {
      transcriber?.dispose?.();
      transcriber = null;
      currentModelId = null;
      parentPort?.postMessage({ type: 'disposed' });
    }
  } catch (error) {
    parentPort?.postMessage({
      type: 'error',
      requestId: message.requestId ?? null,
      message: error instanceof Error ? error.message : String(error),
    });
  }
});
