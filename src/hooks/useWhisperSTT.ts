import { useState, useCallback, useRef, useEffect } from 'react';
import {
  applyWhisperSocketMessage,
  type WhisperSocketClientState,
} from './whisperSocketProtocol';
import { getCaptureStream, resolveSystemAudioCapturePath } from './mediaCapture';
import { resolveWhisperRecordingError } from './whisperInterruption';
import { getClientRuntimeConfig, requireWebSocketUrl, type RuntimeConfig } from '../config/runtime';

interface UseWhisperSTTProps {
  onSegmentFinalized: (text: string, id: string, confidence: number) => void;
  language: string;
  active: boolean;
  audioSource?: 'microphone' | 'system';
  runtimeConfig?: RuntimeConfig;
  onTrackAcquired?: (track: MediaStreamTrack) => void;
}

type AudioContextConstructor = typeof AudioContext;

function getAudioContextConstructor(): AudioContextConstructor | undefined {
  return (
    (window as Window & {
      AudioContext?: AudioContextConstructor;
      webkitAudioContext?: AudioContextConstructor;
    }).AudioContext ||
    (window as Window & {
      AudioContext?: AudioContextConstructor;
      webkitAudioContext?: AudioContextConstructor;
    }).webkitAudioContext
  );
}

export function useWhisperSTT({
  onSegmentFinalized,
  language,
  active,
  audioSource = 'microphone',
  runtimeConfig,
  onTrackAcquired,
}: UseWhisperSTTProps) {
  if (!language || language === 'auto') {
    console.error('[whisper] invalid language:', language);
  }
  const [isRecording, setIsRecording] = useState(false);
  const [interimTranscript, setInterimTranscript] = useState('');
  const [error, setError] = useState<string | null>(null);

  const wsRef = useRef<WebSocket | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const workletNodeRef = useRef<AudioWorkletNode | null>(null);
  const captureSinkRef = useRef<MediaStreamAudioDestinationNode | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const onSegmentRef = useRef(onSegmentFinalized);
  const segmentCountRef = useRef(0);
  const isRecordingRef = useRef(false);
  const stopTimerRef = useRef<number | null>(null);
  const stopRequestedRef = useRef(false);
  const lastServerErrorRef = useRef<string | null>(null);
  const socketStateRef = useRef<WhisperSocketClientState>({
    error: null,
    interimTranscript: '',
  });
  const socketFailureHandledRef = useRef(false);
  const languageRef = useRef(language);

  useEffect(() => {
    languageRef.current = language;
    if (active) console.log('[whisper] lang:', language);
  }, [language, active]);

  useEffect(() => {
    onSegmentRef.current = onSegmentFinalized;
  }, [onSegmentFinalized]);

  const clearStopTimer = useCallback(() => {
    if (stopTimerRef.current !== null) {
      window.clearTimeout(stopTimerRef.current);
      stopTimerRef.current = null;
    }
  }, []);

  const setClientError = useCallback((nextError: string | null) => {
    if (socketStateRef.current.error === nextError) return;

    socketStateRef.current = {
      ...socketStateRef.current,
      error: nextError,
    };
    setError(nextError);
  }, []);

  const setClientInterimTranscript = useCallback((nextInterimTranscript: string) => {
    if (socketStateRef.current.interimTranscript === nextInterimTranscript) return;

    socketStateRef.current = {
      ...socketStateRef.current,
      interimTranscript: nextInterimTranscript,
    };
    setInterimTranscript(nextInterimTranscript);
  }, []);

  const closeSocket = useCallback(() => {
    clearStopTimer();

    const ws = wsRef.current;
    if (!ws) return;

    wsRef.current = null;
    ws.onclose = null;
    ws.onerror = null;
    ws.onmessage = null;
    ws.close();
  }, [clearStopTimer]);

  const stopRecording = useCallback((graceful = true) => {
    workletNodeRef.current?.disconnect();
    workletNodeRef.current = null;

    captureSinkRef.current?.disconnect();
    captureSinkRef.current = null;

    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;

    void audioContextRef.current?.close();
    audioContextRef.current = null;

    const ws = wsRef.current;
    if (!graceful || !ws || ws.readyState !== WebSocket.OPEN) {
      closeSocket();
      stopRequestedRef.current = false;
      setClientInterimTranscript('');
    } else if (!stopRequestedRef.current) {
      stopRequestedRef.current = true;
      ws.send(JSON.stringify({ type: 'stop' }));
      stopTimerRef.current = window.setTimeout(() => {
        closeSocket();
        stopRequestedRef.current = false;
        setClientInterimTranscript('');
      }, 750);
    }

    isRecordingRef.current = false;
    setIsRecording(false);
  }, [closeSocket, setClientInterimTranscript]);

  useEffect(() => {
    if (!active && isRecordingRef.current) stopRecording();
  }, [active, stopRecording]);

  useEffect(() => {
    const currentLanguage = languageRef.current;
    if (isRecordingRef.current && wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({ type: 'config', language: currentLanguage }));
    }
  }, [language]);

  const startRecording = useCallback(async () => {
    const currentLanguage = languageRef.current;
    if (isRecordingRef.current || !active) return;
    console.log('[whisper] recording lang:', currentLanguage);
    socketFailureHandledRef.current = false;
    stopRequestedRef.current = false;
    lastServerErrorRef.current = null;
    setClientError(null);
    setClientInterimTranscript('');

    try {
      if (!window.isSecureContext && !runtimeConfig?.isNativeApp) {
        throw new Error(
          'Audio capture requires a secure context. ' +
          'Open the app via http://localhost (not a network IP) or use HTTPS.',
        );
      }
      if (audioSource === 'microphone' && !navigator.mediaDevices?.getUserMedia) {
        throw new Error('Your browser does not support microphone access on this page.');
      }
      const resolvedRuntime = runtimeConfig ?? getClientRuntimeConfig();
      const useServerDeviceCapture =
        audioSource === 'system' &&
        resolveSystemAudioCapturePath(resolvedRuntime) === 'server-device';
      if (
        audioSource === 'system' &&
        !useServerDeviceCapture &&
        !navigator.mediaDevices?.getDisplayMedia
      ) {
        throw new Error('Browser audio capture is not supported in this browser or webview.');
      }
      const ws = new WebSocket(requireWebSocketUrl('/ws/transcribe', runtimeConfig));
      wsRef.current = ws;
      clearStopTimer();
      let serverStarted = false;
      let settleServerReady = (_error?: Error) => {};
      const serverReady = new Promise<void>((resolve, reject) => {
        let settled = false;
        settleServerReady = (error?: Error) => {
          if (settled) return;
          settled = true;
          if (error) {
            reject(error);
            return;
          }
          resolve();
        };
      });

      await new Promise<void>((resolve, reject) => {
        const timer = setTimeout(() => reject(new Error('WebSocket connection timed out')), 5000);
        ws.onopen = () => { clearTimeout(timer); resolve(); };
        ws.onerror = () => { clearTimeout(timer); reject(new Error('WebSocket connection failed')); };
      });

      isRecordingRef.current = true;
      setIsRecording(true);

      const handleSocketFailure = (message: string) => {
        if (socketFailureHandledRef.current || stopRequestedRef.current || !isRecordingRef.current) return;

        socketFailureHandledRef.current = true;
        const resolvedMessage = resolveWhisperRecordingError({
          fallbackMessage: message,
          isManualStop: stopRequestedRef.current,
          serverMessage: lastServerErrorRef.current,
          serverStarted,
        });
        setClientError(resolvedMessage);
        stopRecording(false);
      };

      ws.onmessage = (event) => {
        try {
          const msg = JSON.parse(event.data as string) as {
            type: string;
            text?: string;
            message?: string;
          };

          const transition = applyWhisperSocketMessage(
            socketStateRef.current,
            msg,
            () => `whisper-${Date.now()}-${segmentCountRef.current++}`,
          );

          const previousState = socketStateRef.current;
          socketStateRef.current = transition.nextState;
          if (transition.nextState.interimTranscript !== previousState.interimTranscript) {
            setInterimTranscript(transition.nextState.interimTranscript);
          }

          if (transition.nextState.error !== previousState.error) {
            setError(transition.nextState.error);
          }

          if (msg.type === 'started') {
            serverStarted = true;
            lastServerErrorRef.current = null;
            settleServerReady();
          }

          if (transition.nextState.error) {
            lastServerErrorRef.current = transition.nextState.error;
            if (!serverStarted && (msg.type === 'busy' || msg.type === 'error')) {
              settleServerReady(new Error(transition.nextState.error));
            }
          }

          if (transition.commit) {
            onSegmentRef.current(transition.commit.text, transition.commit.id, 0);
          }

          if (transition.stopped) {
            if (!serverStarted) {
              settleServerReady(new Error('Transcription stopped before recording started.'));
            }
            socketFailureHandledRef.current = true;
            closeSocket();
            stopRequestedRef.current = false;
          }
        } catch {
          // ignore malformed frames
        }
      };

      ws.onclose = () => {
        clearStopTimer();
        if (!serverStarted) {
          settleServerReady(
            new Error(lastServerErrorRef.current ?? 'WebSocket disconnected before transcription could start.'),
          );
        }
        handleSocketFailure(lastServerErrorRef.current ?? 'WebSocket disconnected — recording stopped');
      };

      ws.onerror = () => {
        const message = lastServerErrorRef.current ?? 'WebSocket error — recording stopped';
        if (!serverStarted) {
          settleServerReady(new Error(message));
        }
        handleSocketFailure(message);
      };

      ws.send(JSON.stringify({ type: 'config', language: currentLanguage }));
      await serverReady;

      if (useServerDeviceCapture) {
        if (!isRecordingRef.current || stopRequestedRef.current) {
          stopRecording(false);
          return;
        }
        // Localhost-only server-side device audio capture
        ws.send(JSON.stringify({ type: 'start_device_capture' }));
      } else {
        // Browser microphone or tab/window audio via getDisplayMedia
        const AudioContextConstructor = getAudioContextConstructor();
        if (typeof AudioContextConstructor !== 'function' || typeof AudioWorkletNode !== 'function') {
          throw new Error('Streaming transcription requires Web Audio Worklet support in this runtime.');
        }

        const stream = await getCaptureStream({
          audioSource,
          mediaDevices: navigator.mediaDevices,
        });

        // Share picker / getUserMedia can outlive a Stop click or audioSource change.
        if (!isRecordingRef.current || stopRequestedRef.current) {
          stream.getTracks().forEach((track) => track.stop());
          stopRecording(false);
          return;
        }

        streamRef.current = stream;

        const audioTrack = stream.getAudioTracks()[0];
        if (audioTrack && onTrackAcquired) {
          onTrackAcquired(audioTrack);
        }

        const audioContext = new AudioContextConstructor();
        audioContextRef.current = audioContext;

        await audioContext.audioWorklet.addModule('/worklets/pcm-capture.worklet.js');

        if (!isRecordingRef.current || stopRequestedRef.current) {
          stopRecording(false);
          return;
        }

        const source = audioContext.createMediaStreamSource(stream);
        const workletNode = new AudioWorkletNode(audioContext, 'pcm-capture');
        const captureSink = audioContext.createMediaStreamDestination();
        workletNodeRef.current = workletNode;
        captureSinkRef.current = captureSink;

        workletNode.port.onmessage = (e: MessageEvent<Float32Array>) => {
          if (ws.readyState === WebSocket.OPEN) {
            ws.send(e.data.buffer);
          }
        };

        source.connect(workletNode);
        workletNode.connect(captureSink);
      }
    } catch (err) {
      const isPermissionDenied =
        err instanceof Error && (err.name === 'NotAllowedError' || err.name === 'AbortError');
      const msg = isPermissionDenied
        ? audioSource === 'system'
          ? 'Browser audio share was denied or cancelled. Allow tab or window sharing (with Share audio enabled) and try again.'
          : 'Microphone access was denied. Allow microphone access in the system prompt or app settings and try again.'
        : err instanceof Error
        ? err.message
        : 'Failed to start recording';
      setClientError(msg);
      stopRecording(false);
    }
  }, [
    active,
    audioSource,
    clearStopTimer,
    closeSocket,
    onTrackAcquired,
    runtimeConfig,
    setClientError,
    setClientInterimTranscript,
    stopRecording,
  ]);

  return { isRecording, interimTranscript, error, startRecording, stopRecording };
}
