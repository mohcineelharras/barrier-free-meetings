import { type TranscriptSegment } from '../hooks/useSpeechToText';

interface QueueAutoReportInput {
  autoSaveEnabled: boolean;
  stoppedRecording: boolean;
  translationAvailable: boolean;
}

export function shouldQueueAutoReport(input: QueueAutoReportInput): boolean {
  return input.autoSaveEnabled && input.stoppedRecording && input.translationAvailable;
}

export function hasAutoReportReadySegments(segments: TranscriptSegment[]): boolean {
  const meaningfulSegments = segments.filter((segment) => segment.original.trim().length > 0);
  if (meaningfulSegments.length === 0) {
    return false;
  }

  return meaningfulSegments.every((segment) => {
    const translated = segment.translated.trim();
    return translated.length > 0;
  });
}
