import { useEffect, useRef, useCallback } from 'react';

export interface RecordingGuardCallbacks {
  onNetworkLost: () => void;
  onNetworkRestored: () => void;
  onTabHidden: () => void;
  onTabVisible: () => void;
  onBeforeUnload: () => void;
  onTrackEnded: () => void;
}

export interface RecordingGuardHandle {
  watchTrack: (track: MediaStreamTrack) => void;
  clearTrack: () => void;
}

export function useRecordingGuard(
  isRecording: boolean,
  callbacks: RecordingGuardCallbacks,
): RecordingGuardHandle {
  const callbacksRef = useRef(callbacks);
  callbacksRef.current = callbacks;

  const trackRef = useRef<MediaStreamTrack | null>(null);
  const trackHandlerRef = useRef<(() => void) | null>(null);

  const clearTrack = useCallback(() => {
    const track = trackRef.current;
    const handler = trackHandlerRef.current;
    if (track && handler) {
      track.removeEventListener('ended', handler);
    }
    trackRef.current = null;
    trackHandlerRef.current = null;
  }, []);

  const watchTrack = useCallback((track: MediaStreamTrack) => {
    clearTrack();
    trackRef.current = track;
    const handler = () => callbacksRef.current.onTrackEnded();
    trackHandlerRef.current = handler;
    track.addEventListener('ended', handler);
  }, [clearTrack]);

  useEffect(() => {
    if (!isRecording) {
      clearTrack();
      return;
    }

    const handleOffline = () => callbacksRef.current.onNetworkLost();
    const handleOnline = () => callbacksRef.current.onNetworkRestored();

    const handleVisibility = () => {
      if (document.visibilityState === 'hidden') {
        callbacksRef.current.onTabHidden();
      } else {
        callbacksRef.current.onTabVisible();
      }
    };

    const handleBeforeUnload = () => {
      callbacksRef.current.onBeforeUnload();
    };

    window.addEventListener('offline', handleOffline);
    window.addEventListener('online', handleOnline);
    document.addEventListener('visibilitychange', handleVisibility);
    window.addEventListener('beforeunload', handleBeforeUnload);

    return () => {
      window.removeEventListener('offline', handleOffline);
      window.removeEventListener('online', handleOnline);
      document.removeEventListener('visibilitychange', handleVisibility);
      window.removeEventListener('beforeunload', handleBeforeUnload);
      clearTrack();
    };
  }, [isRecording, clearTrack]);

  return { watchTrack, clearTrack };
}
