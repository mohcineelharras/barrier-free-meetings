import { useState, useCallback } from 'react';
import { type TranscriptSegment } from './useSpeechToText';

const STORAGE_KEY = 'transcribe-easy:history';
const MAX_SESSIONS = 50;

export interface SavedSession {
  id: string;
  savedAt: number;
  updatedAt: number;
  title: string;
  sourceLang: string;
  targetLang: string;
  segments: TranscriptSegment[];
  saveMode: 'auto' | 'manual';
  report?: string;
  reportGeneratedAt?: number;
}

interface SavedSessionInput {
  id: string;
  now: number;
  segments: TranscriptSegment[];
  sourceLang: string;
  targetLang: string;
  saveMode: 'auto' | 'manual';
  report?: string;
  reportGeneratedAt?: number;
}

/** Auto-derive a short title from the first non-empty translated (or original) segment. */
function deriveTitle(segments: TranscriptSegment[], sourceLang: string, targetLang: string): string {
  const first = segments[0];
  if (!first) return `${sourceLang} → ${targetLang}`;
  const text = (first.translated && !first.translated.startsWith('['))
    ? first.translated
    : first.original;
  return text.length > 48 ? `${text.slice(0, 48).trimEnd()}…` : text;
}

export function createSavedSession(input: SavedSessionInput): SavedSession {
  return {
    id: input.id,
    savedAt: input.now,
    updatedAt: input.now,
    title: deriveTitle(input.segments, input.sourceLang, input.targetLang),
    sourceLang: input.sourceLang,
    targetLang: input.targetLang,
    segments: input.segments,
    saveMode: input.saveMode,
    report: input.report,
    reportGeneratedAt: input.reportGeneratedAt,
  };
}

export function upsertSavedSession(
  sessions: SavedSession[],
  input: SavedSessionInput,
): SavedSession[] {
  const existing = sessions.find((session) => session.id === input.id);
  const nextSession = existing
    ? {
        ...existing,
        updatedAt: input.now,
        title: deriveTitle(input.segments, input.sourceLang, input.targetLang),
        sourceLang: input.sourceLang,
        targetLang: input.targetLang,
        segments: input.segments,
        saveMode: input.saveMode,
        report: input.report ?? existing.report,
        reportGeneratedAt: input.reportGeneratedAt ?? existing.reportGeneratedAt,
      }
    : createSavedSession(input);

  return [
    nextSession,
    ...sessions.filter((session) => session.id !== input.id),
  ].slice(0, MAX_SESSIONS);
}

export function attachReportToSession(
  sessions: SavedSession[],
  id: string,
  report: string,
  now = Date.now(),
): SavedSession[] {
  return sessions.map((session) =>
    session.id === id
      ? {
          ...session,
          report,
          reportGeneratedAt: now,
          updatedAt: now,
        }
      : session,
  );
}

function getReportContentKey(segments: TranscriptSegment[]): string {
  return JSON.stringify(
    segments.map((segment) => ({
      id: segment.id,
      original: segment.original,
    })),
  );
}

export function sessionHasCurrentReport(
  session: SavedSession | null | undefined,
  currentSegments: TranscriptSegment[],
): boolean {
  return Boolean(
    session?.report
    && getReportContentKey(session.segments) === getReportContentKey(currentSegments),
  );
}

function loadSessions(): SavedSession[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? (JSON.parse(raw) as SavedSession[]) : [];
  } catch {
    return [];
  }
}

function persistSessions(sessions: SavedSession[]): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(sessions));
  } catch {
    // localStorage quota exceeded — silently skip
  }
}

export function useHistory() {
  const [sessions, setSessions] = useState<SavedSession[]>(loadSessions);

  const saveSession = useCallback((
    segments: TranscriptSegment[],
    sourceLang: string,
    targetLang: string,
    options: {
      id?: string;
      saveMode?: 'auto' | 'manual';
      report?: string;
      reportGeneratedAt?: number;
    } = {},
  ): string => {
    const now = Date.now();
    const id = options.id ?? `session-${now}`;

    setSessions((prev) => {
      const updated = upsertSavedSession(prev, {
        id,
        now,
        segments,
        sourceLang,
        targetLang,
        saveMode: options.saveMode ?? 'manual',
        report: options.report,
        reportGeneratedAt: options.reportGeneratedAt,
      });
      persistSessions(updated);
      return updated;
    });

    return id;
  }, []);

  const saveReport = useCallback((id: string, report: string) => {
    setSessions((prev) => {
      const updated = attachReportToSession(prev, id, report);
      persistSessions(updated);
      return updated;
    });
  }, []);

  const deleteSession = useCallback((id: string) => {
    setSessions((prev) => {
      const updated = prev.filter((s) => s.id !== id);
      persistSessions(updated);
      return updated;
    });
  }, []);

  const clearHistory = useCallback(() => {
    setSessions([]);
    persistSessions([]);
  }, []);

  return { sessions, saveSession, saveReport, deleteSession, clearHistory };
}
