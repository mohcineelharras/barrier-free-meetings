export interface WhisperSocketClientState {
  error: string | null;
  interimTranscript: string;
}

export interface WhisperSegmentCommit {
  id: string;
  text: string;
}

export interface WhisperSocketTransition {
  commit: WhisperSegmentCommit | null;
  nextState: WhisperSocketClientState;
  stopped: boolean;
}

interface WhisperSocketPayload {
  message?: string;
  text?: string;
  type?: string;
}

export function applyWhisperSocketMessage(
  state: WhisperSocketClientState,
  payload: WhisperSocketPayload,
  nextSegmentId: () => string,
): WhisperSocketTransition {
  if (payload.type === 'queued') {
    return {
      commit: null,
      nextState: {
        ...state,
        error: null,
        interimTranscript: payload.message ?? 'Waiting for transcription capacity…',
      },
      stopped: false,
    };
  }

  if (payload.type === 'started') {
    return {
      commit: null,
      nextState: {
        ...state,
        error: null,
        interimTranscript: '',
      },
      stopped: false,
    };
  }

  if (payload.type === 'busy') {
    return {
      commit: null,
      nextState: {
        ...state,
        error: payload.message ?? 'Transcription service is busy. Please retry.',
        interimTranscript: '',
      },
      stopped: false,
    };
  }

  if (payload.type === 'partial' && payload.text) {
    return {
      commit: null,
      nextState: {
        ...state,
        interimTranscript: payload.text,
      },
      stopped: false,
    };
  }

  if ((payload.type === 'final' || payload.type === 'transcript') && payload.text) {
    return {
      commit: {
        id: nextSegmentId(),
        text: payload.text,
      },
      nextState: {
        ...state,
        interimTranscript: '',
      },
      stopped: false,
    };
  }

  if (payload.type === 'error') {
    return {
      commit: null,
      nextState: {
        ...state,
        error: payload.message ?? 'Transcription error',
      },
      stopped: false,
    };
  }

  if (payload.type === 'stopped') {
    return {
      commit: null,
      nextState: {
        ...state,
        interimTranscript: '',
      },
      stopped: true,
    };
  }

  return {
    commit: null,
    nextState: state,
    stopped: false,
  };
}
