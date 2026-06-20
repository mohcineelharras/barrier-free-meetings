import { useCallback } from 'react';
import { useSpeechToText } from './useSpeechToText';
import { useWhisperSTT } from './useWhisperSTT';
import { type RuntimeConfig } from '../config/runtime';

type STTMode = 'web-speech' | 'whisper';

interface UseSTTProps {
  mode: STTMode;
  onSegmentFinalized: (text: string, id: string, confidence: number) => void;
  language?: string;
  audioSource?: 'microphone' | 'system';
  runtimeConfig?: RuntimeConfig;
  onTrackAcquired?: (track: MediaStreamTrack) => void;
}

// Both internal hooks are always called unconditionally to satisfy Rules of Hooks.
// The inactive hook receives active=false and stays idle.
export function useSTT({
  mode,
  onSegmentFinalized,
  language = 'zh-CN',
  audioSource = 'microphone',
  runtimeConfig,
  onTrackAcquired,
}: UseSTTProps) {
  const webSpeech = useSpeechToText({
    active: mode === 'web-speech',
    onSegmentFinalized,
    language,
  });

  const whisper = useWhisperSTT({
    onSegmentFinalized,
    language,
    active: mode === 'whisper',
    audioSource,
    runtimeConfig,
    onTrackAcquired,
  });

  const activeHook = mode === 'whisper' ? whisper : webSpeech;

  const startRecording = useCallback(
    async () => {
      await activeHook.startRecording();
    },
    [activeHook],
  );

  return {
    ...activeHook,
    startRecording,
  };
}
