export interface WhisperTranscriptionOptions {
  chunk_length_s: number;
  force_full_sequences: boolean;
  language: string | undefined;
  return_timestamps: boolean | 'word';
  stride_length_s: number;
  task: 'transcribe' | 'translate';
}

export function normalizeWhisperLanguage(language: string | undefined): string | undefined {
  if (!language || language === 'auto') return undefined;
  return language.split('-')[0].toLowerCase();
}

export function buildWhisperTranscriptionOptions(
  language: string | undefined,
  task: 'transcribe' | 'translate' = 'transcribe',
): WhisperTranscriptionOptions {
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
