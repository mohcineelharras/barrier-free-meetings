import { useState, useEffect, useCallback, useRef } from 'react';

import {
  createSpeechRecognitionController,
  type SpeechRecognitionController,
  type SpeechRecognitionLike,
} from './speechRecognitionController';

export interface TranscriptSegment {
  id: string;
  original: string;
  translated: string;
  timestamp: number;
  isFinal: boolean;
  confidence?: number;
}

interface UseSpeechToTextProps {
  active?: boolean;
  onSegmentFinalized: (text: string, id: string, confidence: number) => void;
  language?: string;
}

export function useSpeechToText({
  active = true,
  onSegmentFinalized,
  language = 'zh-CN',
}: UseSpeechToTextProps) {
  const [isRecording, setIsRecording] = useState(false);
  const [interimTranscript, setInterimTranscript] = useState('');
  const [error, setError] = useState<string | null>(null);
  const controllerRef = useRef<SpeechRecognitionController | null>(null);
  const onSegmentFinalizedRef = useRef(onSegmentFinalized);

  useEffect(() => {
    onSegmentFinalizedRef.current = onSegmentFinalized;
  }, [onSegmentFinalized]);

  useEffect(() => {
    if (!active) {
      controllerRef.current?.dispose();
      controllerRef.current = null;
      setIsRecording(false);
      setInterimTranscript('');
      setError(null);
      return;
    }

    const SpeechRecognitionConstructor = (
      window as Window & {
        SpeechRecognition?: new () => SpeechRecognitionLike;
        webkitSpeechRecognition?: new () => SpeechRecognitionLike;
      }
    ).SpeechRecognition || (
      window as Window & {
        SpeechRecognition?: new () => SpeechRecognitionLike;
        webkitSpeechRecognition?: new () => SpeechRecognitionLike;
      }
    ).webkitSpeechRecognition;
    
    if (!SpeechRecognitionConstructor) {
      setError('Speech Recognition API is not supported in this browser.');
      return;
    }

    const controller = createSpeechRecognitionController({
      recognition: new SpeechRecognitionConstructor(),
      language,
      onSegmentFinalized: (text, id, confidence) => onSegmentFinalizedRef.current(text, id, confidence),
      onStateChange: (snapshot) => {
        setIsRecording(snapshot.isRecording);
        setInterimTranscript(snapshot.interimTranscript);
        setError(snapshot.error);
      },
    });

    controllerRef.current = controller;

    return () => {
      controller.dispose();
      controllerRef.current = null;
    };
  }, [active, language]);

  const startRecording = useCallback(() => {
    if (!active) return;
    controllerRef.current?.startRecording();
  }, [active]);

  const stopRecording = useCallback(() => {
    controllerRef.current?.stopRecording();
  }, []);

  return {
    isRecording,
    interimTranscript,
    error,
    startRecording,
    stopRecording
  };
}
