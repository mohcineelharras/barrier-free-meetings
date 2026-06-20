import type { RecognitionResult } from './session';

interface WhisperChunkLike {
  text?: unknown;
  timestamp?: unknown;
}

interface WhisperResultLike {
  chunks?: WhisperChunkLike[];
  text?: unknown;
}

function normalizeText(text: unknown): string {
  return typeof text === 'string' ? text.trim() : '';
}

function hasRepetitionHallucination(text: string): boolean {
  if (!text || text.length < 10) return false;

  const normalized = text.trim().replace(/\s+/g, ' ');
  if (normalized.length < 10) return false;

  const tokens = normalized.split(' ').filter((t) => t.length > 0);
  if (tokens.length < 4) return false;

  // Check for consecutive repetition of same token
  let consecutiveCount = 1;
  for (let i = 1; i < tokens.length; i++) {
    if (tokens[i] === tokens[i - 1]) {
      consecutiveCount++;
      if (consecutiveCount > 3) return true;
    } else {
      consecutiveCount = 1;
    }
  }

  // Check for repeating n-grams (2-4 tokens)
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

  // Check for very low token diversity
  const uniqueTokens = new Set(tokens);
  if (uniqueTokens.size <= 2 && tokens.length > 6) return true;
  if (tokens.length > 8 && uniqueTokens.size / tokens.length < 0.2) return true;

  return false;
}

function toTimestampedChunks(chunks: WhisperChunkLike[] | undefined): RecognitionResult['chunks'] {
  if (!Array.isArray(chunks)) return [];

  return chunks
    .filter((chunk) => Array.isArray(chunk.timestamp) && chunk.timestamp.length === 2)
    .map((chunk) => ({
      text: normalizeText(chunk.text),
      startMs: Math.round(Number((chunk.timestamp as [number, number])[0]) * 1000),
      endMs: Math.round(Number((chunk.timestamp as [number, number])[1]) * 1000),
    }))
    .filter((chunk) => Number.isFinite(chunk.startMs) && Number.isFinite(chunk.endMs) && chunk.text)
    .filter((chunk) => !hasRepetitionHallucination(chunk.text));
}

export function buildRecognitionResult({
  audioDurationMs,
  result,
}: {
  audioDurationMs: number;
  result: WhisperResultLike | null | undefined;
}): RecognitionResult & { text: string } {
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
