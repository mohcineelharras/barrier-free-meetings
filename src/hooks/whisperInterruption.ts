export const INTERRUPTED_RECORDING_MESSAGE =
  'Recording was interrupted while your device was asleep, offline, or unable to keep the live connection. Start recording again to continue this conversation.';

interface ResolveWhisperRecordingErrorOptions {
  fallbackMessage: string;
  isManualStop: boolean;
  serverMessage: string | null;
  serverStarted: boolean;
}

export function resolveWhisperRecordingError({
  fallbackMessage,
  isManualStop,
  serverMessage,
  serverStarted,
}: ResolveWhisperRecordingErrorOptions): string | null {
  if (isManualStop) {
    return null;
  }

  if (serverMessage) {
    return serverMessage;
  }

  if (serverStarted) {
    return INTERRUPTED_RECORDING_MESSAGE;
  }

  return fallbackMessage;
}

export function isPersistentWhisperRecordingError(message: string | null): boolean {
  return message === INTERRUPTED_RECORDING_MESSAGE;
}

export function getWhisperErrorDismissMs(message: string | null): number | null {
  return isPersistentWhisperRecordingError(message) ? null : 5000;
}
