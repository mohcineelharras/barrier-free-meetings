export interface TimestampedChunk {
  text: string;
  startMs: number;
  endMs: number;
}

export interface TranscriptAssembly {
  finals: string[];
  partial: string | null;
}

interface TranscriptAssemblerOptions {
  maxSegmentChars?: number;
  maxSegmentDurationMs?: number;
  unstableTailMs: number;
}

const SENTENCE_END_PATTERN = /[.!?…。！？؟]$/u;

function normalizeText(text: string): string {
  return text.replace(/\s+/g, ' ').trim();
}

function joinChunks(chunks: TimestampedChunk[]): string {
  return normalizeText(chunks.map((chunk) => chunk.text).join(' '));
}

function chunkEndsSentence(chunk: TimestampedChunk | undefined): boolean {
  return Boolean(chunk && SENTENCE_END_PATTERN.test(chunk.text.trim()));
}

function getChunksDurationMs(chunks: TimestampedChunk[]): number {
  const first = chunks[0];
  const last = chunks[chunks.length - 1];
  if (!first || !last) return 0;
  return Math.max(0, last.endMs - first.startMs);
}

function findForcedBoundaryChunkCount(
  chunks: TimestampedChunk[],
  options: TranscriptAssemblerOptions,
): number {
  if (options.maxSegmentChars !== undefined) {
    for (let index = 0; index < chunks.length; index += 1) {
      if (joinChunks(chunks.slice(0, index + 1)).length >= options.maxSegmentChars) {
        return index + 1;
      }
    }
  }

  if (
    options.maxSegmentDurationMs !== undefined &&
    getChunksDurationMs(chunks) >= options.maxSegmentDurationMs
  ) {
    return chunks.length;
  }

  return 0;
}

export function createTranscriptAssembler(options: TranscriptAssemblerOptions) {
  let committedUntilMs = 0;
  let lastPartialText = '';
  let lastChunks: TimestampedChunk[] = [];

  return {
    applyWindow({
      audioDurationMs,
      chunks,
    }: {
      audioDurationMs: number;
      chunks: TimestampedChunk[];
    }): TranscriptAssembly {
      const sorted = [...chunks].sort((a, b) => a.startMs - b.startMs);
      lastChunks = sorted;

      const pendingChunks = sorted.filter((chunk) => chunk.endMs > committedUntilMs);
      const stableCutoffMs = Math.max(0, audioDurationMs - options.unstableTailMs);
      const stableChunks = pendingChunks.filter((chunk) => chunk.endMs <= stableCutoffMs);
      const unstableChunks = pendingChunks.filter((chunk) => chunk.endMs > stableCutoffMs);

      const finals: string[] = [];
      let finalizedChunkCount = 0;
      let lastSentenceStart = 0;

      stableChunks.forEach((chunk, index) => {
        if (!chunkEndsSentence(chunk)) return;

        const sentenceChunks = stableChunks.slice(lastSentenceStart, index + 1);
        const sentenceText = joinChunks(sentenceChunks);
        if (sentenceText) {
          finals.push(sentenceText);
          finalizedChunkCount = index + 1;
        }
        lastSentenceStart = index + 1;
      });

      if (finalizedChunkCount === 0) {
        const forcedChunkCount = findForcedBoundaryChunkCount(stableChunks, options);
        if (forcedChunkCount > 0) {
          const forcedText = joinChunks(stableChunks.slice(0, forcedChunkCount));
          if (forcedText) {
            finals.push(forcedText);
            finalizedChunkCount = forcedChunkCount;
          }
        }
      }

      if (finalizedChunkCount === 0 && stableChunks.length > 0 && unstableChunks.length === 0) {
        const settledText = joinChunks(stableChunks);
        if (settledText) {
          finals.push(settledText);
          finalizedChunkCount = stableChunks.length;
        }
      }

      if (finalizedChunkCount > 0) {
        committedUntilMs = stableChunks[finalizedChunkCount - 1].endMs;
      }

      const partialChunks = sorted.filter((chunk) => chunk.endMs > committedUntilMs);
      const partialText = joinChunks(partialChunks);

      if (!partialText) {
        const hadPartial = lastPartialText.length > 0;
        lastPartialText = '';
        return { finals, partial: hadPartial ? '' : null };
      }

      if (partialText === lastPartialText) {
        return { finals, partial: null };
      }

      lastPartialText = partialText;
      return { finals, partial: partialText };
    },

    finalize(): TranscriptAssembly {
      const remainingChunks = lastChunks.filter((chunk) => chunk.endMs > committedUntilMs);
      const finals = remainingChunks.length > 0 ? [joinChunks(remainingChunks)] : [];

      if (remainingChunks.length > 0) {
        committedUntilMs = remainingChunks[remainingChunks.length - 1].endMs;
      }

      const hadPartial = lastPartialText.length > 0;
      lastPartialText = '';
      return {
        finals,
        partial: hadPartial ? '' : null,
      };
    },

    reset(): void {
      committedUntilMs = 0;
      lastPartialText = '';
      lastChunks = [];
    },
  };
}
