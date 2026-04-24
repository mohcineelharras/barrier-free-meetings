import { useState, useEffect, useCallback, useRef } from 'react';

export interface TranscriptSegment {
  id: string;
  original: string;
  translated: string;
  timestamp: number;
  isFinal: boolean;
}

interface UseSpeechToTextProps {
  onSegmentFinalized: (text: string, id: string) => void;
  language?: string;
}

export function useSpeechToText({ onSegmentFinalized, language = 'zh-CN' }: UseSpeechToTextProps) {
  const [isRecording, setIsRecording] = useState(false);
  const [interimTranscript, setInterimTranscript] = useState('');
  const [error, setError] = useState<string | null>(null);
  
  const recognitionRef = useRef<any>(null);
  const isManuallyStopped = useRef(false);

  useEffect(() => {
    const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    
    if (!SpeechRecognition) {
      setError('Speech Recognition API is not supported in this browser.');
      return;
    }

    const recognition = new SpeechRecognition();
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.lang = language;

    recognition.onstart = () => {
      setIsRecording(true);
      setError(null);
    };

    recognition.onerror = (event: any) => {
      console.error('Speech recognition error', event.error);
      if (event.error === 'not-allowed') {
        setError('Microphone access denied. Please click the microphone icon in your browser address bar to allow access for this site.');
        setIsRecording(false);
      } else if (event.error === 'service-not-allowed') {
        setError('Speech recognition service is not allowed by the browser.');
        setIsRecording(false);
      } else {
        setError(`Speech recognition error: ${event.error}`);
      }
    };

    recognition.onend = () => {
      if (!isManuallyStopped.current && isRecording) {
        // Automatically restart if it was not manually stopped
        try {
          recognition.start();
        } catch (e) {
          console.error("Failed to restart recognition", e);
        }
      } else if (isManuallyStopped.current) {
        setIsRecording(false);
      }
    };

    recognition.onresult = (event: any) => {
      let currentInterim = '';
      
      for (let i = event.resultIndex; i < event.results.length; ++i) {
        const result = event.results[i];
        const transcript = result[0].transcript;
        
        if (result.isFinal) {
          const id = Math.random().toString(36).substring(2, 9);
          onSegmentFinalized(transcript, id);
        } else {
          currentInterim += transcript;
        }
      }
      
      setInterimTranscript(currentInterim);
    };

    recognitionRef.current = recognition;

    return () => {
      if (recognitionRef.current) {
        recognitionRef.current.stop();
      }
    };
  }, [language, onSegmentFinalized, isRecording]);

  const startRecording = useCallback(() => {
    if (recognitionRef.current) {
      isManuallyStopped.current = false;
      try {
        recognitionRef.current.start();
      } catch (e) {
        console.error("Error starting recognition:", e);
      }
    }
  }, []);

  const stopRecording = useCallback(() => {
    if (recognitionRef.current) {
      isManuallyStopped.current = true;
      recognitionRef.current.stop();
      setIsRecording(false);
    }
  }, []);

  return {
    isRecording,
    interimTranscript,
    error,
    startRecording,
    stopRecording
  };
}
