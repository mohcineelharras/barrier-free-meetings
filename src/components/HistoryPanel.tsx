import { useRef, useState } from 'react';
import { type SavedSession } from '../hooks/useHistory';
import { ReportPanel } from './ReportPanel';
import { type RuntimeConfig } from '../config/runtime';
import { getLanguageCode } from '../constants/languages';
import { useModalBehavior } from './useModalBehavior';

interface HistoryPanelProps {
  sessions: SavedSession[];
  onDelete: (id: string) => void;
  onReportGenerated: (id: string, report: string) => void;
  onClear: () => void;
  onClose: () => void;
  onLoad: (session: SavedSession) => void;
  provider: string;
  model: string;
  runtimeConfig?: RuntimeConfig;
}

function formatDate(ts: number): string {
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(new Date(ts));
}

function sessionName(session: SavedSession): string {
  return session.title || `${session.sourceLang} to ${session.targetLang}`;
}

export function HistoryPanel({
  sessions,
  onDelete,
  onReportGenerated,
  onClear,
  onClose,
  onLoad,
  provider,
  model,
  runtimeConfig,
}: HistoryPanelProps) {
  const [viewing, setViewing] = useState<SavedSession | null>(null);
  const [reporting, setReporting] = useState<SavedSession | null>(null);
  const [confirmClear, setConfirmClear] = useState(false);
  const panelRef = useRef<HTMLDivElement>(null);
  useModalBehavior(onClose, panelRef, reporting === null);

  const getReportLabel = (session: SavedSession): string => (session.report ? 'View report' : 'Generate now');
  const getReportTitle = (session: SavedSession): string => (session.report ? 'View report' : 'Generate report now');

  if (reporting) {
    return (
      <ReportPanel
        segments={reporting.segments}
        sourceLang={reporting.sourceLang}
        targetLang={reporting.targetLang}
        provider={provider}
        model={model}
        initialReport={reporting.report}
        runtimeConfig={runtimeConfig}
        onReportGenerated={(report) => onReportGenerated(reporting.id, report)}
        onClose={() => setReporting(null)}
      />
    );
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-stretch justify-end bg-black/40 backdrop-blur-sm"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="history-dialog-title"
        tabIndex={-1}
        className="w-full max-w-md bg-white dark:bg-gray-900 flex flex-col shadow-2xl outline-none"
      >

        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-200 dark:border-gray-800 flex-shrink-0">
          <div className="flex items-center gap-2">
            {viewing ? (
              <button type="button" onClick={() => setViewing(null)}
                aria-label="Back to session list"
                className="inline-flex h-8 w-8 items-center justify-center rounded text-gray-600 hover:text-gray-900 dark:text-gray-300 dark:hover:text-gray-100 transition-colors">
                <ChevronLeftIcon />
              </button>
            ) : (
              <ClockIcon />
            )}
            <h2 id="history-dialog-title" className="font-semibold text-gray-900 dark:text-gray-100 truncate max-w-[220px]">
              {viewing ? (viewing.title || formatDate(viewing.savedAt)) : 'History'}
            </h2>
            {!viewing && sessions.length > 0 && (
              <span className="text-xs text-gray-600 dark:text-gray-300">{sessions.length} session{sessions.length !== 1 ? 's' : ''}</span>
            )}
          </div>
          <div className="flex items-center gap-1">
            {!viewing && sessions.length > 0 && (
              <button type="button" onClick={() => setConfirmClear(true)} title="Clear all history"
                aria-label="Clear all history"
                className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-gray-600 hover:text-red-600 hover:bg-red-50 dark:text-gray-300 dark:hover:bg-red-950/40 dark:hover:text-red-300 transition-colors">
                <TrashIcon />
              </button>
            )}
            <button type="button" onClick={onClose} aria-label="Close history"
              className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-gray-600 hover:text-gray-900 dark:text-gray-300 dark:hover:text-gray-100 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors">
              <XIcon />
            </button>
          </div>
        </div>

        {confirmClear && (
          <div role="alertdialog" aria-labelledby="clear-history-title" className="mx-5 mt-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800 dark:border-red-900 dark:bg-red-950/40 dark:text-red-200">
            <p id="clear-history-title" className="font-medium">Delete every saved session on this device?</p>
            <div className="mt-3 flex gap-2">
              <button type="button" onClick={() => { onClear(); setConfirmClear(false); }}
                className="rounded-lg bg-red-700 px-3 py-1.5 text-xs font-semibold text-white hover:bg-red-600">
                Delete all
              </button>
              <button type="button" onClick={() => setConfirmClear(false)}
                className="rounded-lg border border-red-200 px-3 py-1.5 text-xs font-semibold text-red-800 hover:bg-red-100 dark:border-red-800 dark:text-red-100 dark:hover:bg-red-950">
                Cancel
              </button>
            </div>
          </div>
        )}

        <div className="flex-1 overflow-y-auto">
          {!viewing && (
            sessions.length === 0 ? (
              <div className="flex flex-col items-center gap-2 py-16 text-center px-6">
                <ClockIcon className="h-8 w-8 text-gray-600 dark:text-gray-300" />
                <p className="text-sm text-gray-600 dark:text-gray-300">No saved sessions yet.</p>
                <p className="text-xs text-gray-600 dark:text-gray-300">Saved conversations appear here automatically.</p>
                <p className="text-xs text-gray-600 dark:text-gray-300">Sessions stay on this device.</p>
              </div>
            ) : (
              <ul className="divide-y divide-gray-100 dark:divide-gray-800">
                {sessions.map((s) => {
                  const name = sessionName(s);
                  return (
                  <li key={s.id}
                    className="group flex items-center gap-3 px-5 py-3.5 hover:bg-gray-50 dark:hover:bg-gray-800/50 transition-colors">
                    <button type="button" onClick={() => setViewing(s)} className="flex-1 text-left min-w-0">
                      <p className="text-sm font-medium text-gray-800 dark:text-gray-200 truncate">
                        {s.title || `${s.sourceLang} → ${s.targetLang}`}
                      </p>
                      <p className="text-xs text-gray-600 dark:text-gray-300 mt-0.5">
                        {s.sourceLang} → {s.targetLang} · {formatDate(s.savedAt)} · {s.segments.length} segment{s.segments.length !== 1 ? 's' : ''}
                      </p>
                    </button>
                    <button
                      type="button"
                      onClick={() => onLoad(s)}
                      title="Resume session"
                      aria-label={`Resume ${name}`}
                      className="inline-flex h-8 w-8 flex-shrink-0 items-center justify-center rounded text-gray-600 hover:text-emerald-700 dark:text-gray-300 dark:hover:text-emerald-300">
                      <ResumeIcon />
                    </button>
                    <button
                      type="button"
                      onClick={() => setReporting(s)}
                      title={getReportTitle(s)}
                      aria-label={`${getReportLabel(s)} for ${name}`}
                      className="inline-flex h-8 w-8 flex-shrink-0 items-center justify-center rounded text-gray-600 hover:text-gray-900 dark:text-gray-300 dark:hover:text-gray-100">
                      <span className="sr-only">{getReportLabel(s)}</span>
                      <SparkleIcon />
                    </button>
                    <button type="button" onClick={() => onDelete(s.id)} title="Delete session"
                      aria-label={`Delete ${name}`}
                      className="inline-flex h-8 w-8 flex-shrink-0 items-center justify-center rounded text-gray-600 hover:text-red-600 dark:text-gray-300 dark:hover:text-red-300">
                      <TrashIcon />
                    </button>
                  </li>
                  );
                })}
              </ul>
            )
          )}

          {viewing && (
            <div className="px-5 py-4 space-y-3">
              <div className="flex items-center justify-between mb-1">
                <p className="text-xs text-gray-600 dark:text-gray-300">
                  {viewing.sourceLang} → {viewing.targetLang} · {viewing.segments.length} segments
                </p>
                <div className="flex items-center gap-3">
                  <button type="button" onClick={() => onLoad(viewing)}
                    className="inline-flex items-center gap-1.5 text-xs font-medium text-emerald-700 hover:text-emerald-800 dark:text-emerald-300 dark:hover:text-emerald-200 transition-colors">
                    <ResumeIcon />
                    Resume
                  </button>
                  <button type="button" onClick={() => setReporting(viewing)}
                    className="inline-flex items-center gap-1.5 text-xs font-medium text-blue-700 hover:text-blue-800 dark:text-blue-300 transition-colors">
                    <SparkleIcon />
                    {getReportLabel(viewing)}
                  </button>
                </div>
              </div>
              {viewing.segments.map((seg) => (
                <div key={seg.id} className="rounded-xl border border-gray-200 dark:border-gray-800 overflow-hidden">
                  <div className="px-4 py-2.5 bg-gray-50 dark:bg-gray-900/50">
                    <p className="text-xs text-gray-600 dark:text-gray-300 mb-1 font-medium">{viewing.sourceLang}</p>
                    <p lang={getLanguageCode(viewing.sourceLang)} className="text-sm text-gray-800 dark:text-gray-200">{seg.original}</p>
                  </div>
                  {seg.translated && !seg.translated.startsWith('[') && (
                    <div className="px-4 py-2.5 border-t border-gray-200 dark:border-gray-800">
                      <p className="text-xs text-gray-600 dark:text-gray-300 mb-1 font-medium">{viewing.targetLang}</p>
                      <p lang={getLanguageCode(viewing.targetLang)} className="text-sm text-gray-700 dark:text-gray-300">{seg.translated}</p>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
        <p className="px-5 py-3 text-xs text-gray-600 dark:text-gray-300 border-t border-gray-200 dark:border-gray-800">
          Sessions stay on this device. Cloud providers only see text you send for translation or a report.
        </p>
      </div>
    </div>
  );
}

function ClockIcon({ className = 'h-4 w-4 text-gray-600 dark:text-gray-300' }: { className?: string }) {
  return (
    <svg aria-hidden="true" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className={className}>
      <circle cx="12" cy="12" r="10" />
      <polyline points="12 6 12 12 16 14" />
    </svg>
  );
}

function TrashIcon() {
  return (
    <svg aria-hidden="true" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4">
      <path d="M3 6h18M8 6V4h8v2M19 6l-1 14H6L5 6" />
      <path d="M10 11v6M14 11v6" />
    </svg>
  );
}

function SparkleIcon() {
  return (
    <svg aria-hidden="true" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className="h-3.5 w-3.5">
      <path d="m12 3-1.912 5.813a2 2 0 0 1-1.275 1.275L3 12l5.813 1.912a2 2 0 0 1 1.275 1.275L12 21l1.912-5.813a2 2 0 0 1 1.275-1.275L21 12l-5.813-1.912a2 2 0 0 1-1.275-1.275L12 3Z" />
    </svg>
  );
}

function XIcon() {
  return (
    <svg aria-hidden="true" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4">
      <path d="M18 6 6 18M6 6l12 12" />
    </svg>
  );
}

function ResumeIcon() {
  return (
    <svg aria-hidden="true" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className="h-3.5 w-3.5">
      <path d="M21 12a9 9 0 1 1-9-9c2.52 0 4.93 1 6.74 2.74L21 8" />
      <path d="M21 3v5h-5" />
    </svg>
  );
}

function ChevronLeftIcon() {
  return (
    <svg aria-hidden="true" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4">
      <path d="m15 18-6-6 6-6" />
    </svg>
  );
}
