import { useState, useCallback, useEffect } from 'react';
import { generateReport, type ReportSegment } from '../services/report';
import { type RuntimeConfig } from '../config/runtime';

interface ReportPanelProps {
  segments: ReportSegment[];
  sourceLang: string;
  targetLang: string;
  provider: string;
  model: string;
  initialReport?: string;
  runtimeConfig?: RuntimeConfig;
  onClose: () => void;
  onReportGenerated?: (report: string) => void;
}

type Status = 'idle' | 'loading' | 'done' | 'error';

function ReportContent({ text }: { text: string }) {
  const lines = text.split('\n');
  return (
    <div className="space-y-1 text-sm">
      {lines.map((line, i) => {
        if (line.startsWith('## ')) {
          return (
            <h3 key={i} className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider mt-5 first:mt-0">
              {line.slice(3)}
            </h3>
          );
        }
        if (line.startsWith('- ') || line.startsWith('• ')) {
          return (
            <div key={i} className="flex gap-2 text-gray-800 dark:text-gray-200">
              <span className="text-gray-400 flex-shrink-0 mt-0.5">•</span>
              <span>{line.slice(2)}</span>
            </div>
          );
        }
        if (line.trim() === '') return <div key={i} className="h-1" />;
        return <p key={i} className="text-gray-800 dark:text-gray-200 leading-relaxed">{line}</p>;
      })}
    </div>
  );
}

export function ReportPanel({
  segments,
  sourceLang,
  targetLang,
  provider,
  model,
  initialReport,
  runtimeConfig,
  onClose,
  onReportGenerated,
}: ReportPanelProps) {
  const [status, setStatus] = useState<Status>(initialReport ? 'done' : 'idle');
  const [report, setReport] = useState(initialReport ?? '');
  const [errorMsg, setErrorMsg] = useState('');
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!initialReport) {
      return;
    }

    setReport(initialReport);
    setStatus('done');
    setErrorMsg('');
  }, [initialReport]);

  const handleGenerate = useCallback(async () => {
    setStatus('loading');
    setErrorMsg('');
    try {
      const result = await generateReport(
        { segments, sourceLang, targetLang, reportLang: targetLang, provider, model },
        runtimeConfig,
      );
      setReport(result);
      onReportGenerated?.(result);
      setStatus('done');
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Failed to generate report');
      setStatus('error');
    }
  }, [segments, sourceLang, targetLang, provider, model, runtimeConfig, onReportGenerated]);

  const handleCopy = useCallback(async () => {
    await navigator.clipboard.writeText(report);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }, [report]);

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-4 bg-black/40 backdrop-blur-sm">
      <div className="w-full max-w-2xl bg-white dark:bg-gray-900 rounded-2xl shadow-2xl flex flex-col max-h-[85vh]">

        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200 dark:border-gray-800 flex-shrink-0">
          <div className="flex items-center gap-2">
            <FileTextIcon />
            <span className="font-semibold text-gray-900 dark:text-gray-100">Meeting Report</span>
            <span className="text-xs text-gray-400 dark:text-gray-600">
              · {segments.length} segment{segments.length !== 1 ? 's' : ''}
            </span>
          </div>
          <button type="button" onClick={onClose} aria-label="Close"
            className="p-1.5 rounded-lg text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors">
            <XIcon />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-6 py-5">
          {status === 'idle' && (
            <div className="flex flex-col items-center gap-4 py-10 text-center">
              <p className="text-sm text-gray-500 dark:text-gray-400 max-w-sm">
                This conversation does not have a saved report yet. Generate one now in <strong>{targetLang}</strong>.
              </p>
              <button type="button" onClick={handleGenerate}
                className="inline-flex items-center gap-2 rounded-full px-5 py-2.5 text-sm font-semibold bg-gray-900 dark:bg-white text-white dark:text-gray-900 hover:bg-gray-700 dark:hover:bg-gray-100 transition-colors">
                <SparkleIcon />
                Generate now
              </button>
            </div>
          )}

          {status === 'loading' && (
            <div className="flex flex-col items-center gap-3 py-10">
              <div className="h-6 w-6 rounded-full border-2 border-gray-300 dark:border-gray-700 border-t-gray-700 dark:border-t-gray-300 animate-spin" />
              <p className="text-sm text-gray-400">Analysing conversation…</p>
            </div>
          )}

          {status === 'error' && (
            <div className="flex flex-col items-center gap-3 py-10 text-center">
              <p className="text-sm text-red-500">{errorMsg}</p>
              <button type="button" onClick={handleGenerate} className="text-sm text-blue-500 hover:underline">Try again</button>
            </div>
          )}

          {status === 'done' && <ReportContent text={report} />}
        </div>

        {status === 'done' && (
          <div className="flex items-center justify-between px-6 py-4 border-t border-gray-200 dark:border-gray-800 flex-shrink-0">
            <button type="button" onClick={handleGenerate}
              className="text-xs text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 transition-colors">
              Regenerate
            </button>
            <button type="button" onClick={handleCopy}
              className="inline-flex items-center gap-1.5 rounded-lg px-4 py-2 text-sm font-medium bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors">
              {copied ? <CheckIcon /> : <CopyIcon />}
              {copied ? 'Copied!' : 'Copy'}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

function FileTextIcon() {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4 text-gray-500">
      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8Z" />
      <path d="M14 2v6h6M16 13H8M16 17H8M10 9H8" />
    </svg>
  );
}

function SparkleIcon() {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4">
      <path d="m12 3-1.912 5.813a2 2 0 0 1-1.275 1.275L3 12l5.813 1.912a2 2 0 0 1 1.275 1.275L12 21l1.912-5.813a2 2 0 0 1 1.275-1.275L21 12l-5.813-1.912a2 2 0 0 1-1.275-1.275L12 3Z" />
    </svg>
  );
}

function XIcon() {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4">
      <path d="M18 6 6 18M6 6l12 12" />
    </svg>
  );
}

function CopyIcon() {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className="h-3.5 w-3.5">
      <rect width="14" height="14" x="8" y="8" rx="2" ry="2" />
      <path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2" />
    </svg>
  );
}

function CheckIcon() {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className="h-3.5 w-3.5 text-green-500">
      <path d="M20 6 9 17l-5-5" />
    </svg>
  );
}
