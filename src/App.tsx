/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useState, useCallback, useRef, useEffect } from 'react';
import { useSpeechToText, TranscriptSegment } from './hooks/useSpeechToText';
import { translateChineseToFrench } from './services/gemini';
import { motion } from 'motion/react';
import { 
   Mic, 
   Trash2, 
   AlertCircle
} from 'lucide-react';

export default function App() {
  const [segments, setSegments] = useState<TranscriptSegment[]>([]);
  const scrollRef = useRef<HTMLDivElement>(null);
  const [sessionStartTime, setSessionStartTime] = useState<number | null>(null);
  const [elapsedTime, setElapsedTime] = useState(0);

  const onSegmentFinalized = useCallback(async (text: string, id: string) => {
    if (!text.trim()) return;

    const newSegment: TranscriptSegment = {
      id,
      original: text,
      translated: "...",
      timestamp: Date.now(),
      isFinal: true
    };

    setSegments(prev => [...prev, newSegment]);

    // Translate
    const translation = await translateChineseToFrench(text);
    setSegments(prev => prev.map(s => s.id === id ? { ...s, translated: translation } : s));
  }, []);

  const {
    isRecording,
    interimTranscript,
    error: speechError,
    startRecording,
    stopRecording
  } = useSpeechToText({ onSegmentFinalized });

  const [browserWarning, setBrowserWarning] = useState<string | null>(null);

  useEffect(() => {
    if (!window.isSecureContext) {
      setBrowserWarning("This browser feature requires a secure context (HTTPS). Please ensure you are viewing the app on an HTTPS URL.");
    }
  }, []);

  // Handle auto-scroll
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [segments, interimTranscript]);

  // Timer logic
  useEffect(() => {
    let interval: any;
    if (isRecording) {
      if (!sessionStartTime) setSessionStartTime(Date.now());
      interval = setInterval(() => {
        setElapsedTime(Math.floor((Date.now() - (sessionStartTime || Date.now())) / 1000));
      }, 1000);
    } else {
      clearInterval(interval);
    }
    return () => clearInterval(interval);
  }, [isRecording, sessionStartTime]);

  const formatTime = (seconds: number) => {
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    const s = seconds % 60;
    return `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
  };

  const handleToggleRecording = () => {
    if (isRecording) {
      stopRecording();
    } else {
      startRecording();
    }
  };

  const exportData = () => {
    if (segments.length === 0) return;

    const content = segments.map(s => {
      const time = new Date(s.timestamp).toLocaleTimeString();
      return `### [${time}]\n**ZH:** ${s.original}\n**FR:** ${s.translated}\n\n---\n\n`;
    }).join("");

    const header = `# Sino Export\nDate: ${new Date().toLocaleDateString()}\nDuration: ${formatTime(elapsedTime)}\n\n`;
    const fullText = header + content;

    const blob = new Blob([fullText], { type: 'text/markdown' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `sino-export-${new Date().toISOString().split('T')[0]}.md`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const clearTranscript = () => {
    if (window.confirm("Are you sure you want to clear the transcript?")) {
      setSegments([]);
      setElapsedTime(0);
      setSessionStartTime(null);
    }
  };

  return (
    <div className="h-screen w-full bg-slate-50 flex flex-col overflow-hidden font-sans text-slate-900">
      {/* Header Navigation */}
      <header className="h-16 flex items-center justify-between px-10 bg-white border-b border-slate-200 shrink-0">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 bg-red-500 rounded-full flex items-center justify-center">
            <div className="w-3 h-3 bg-white rounded-full"></div>
          </div>
          <h1 className="text-xl font-semibold tracking-tight">Sino</h1>
        </div>
        
        <div className="flex items-center gap-6">
          {isRecording && (
            <div className="flex items-center gap-2 px-3 py-1 bg-red-50 border border-red-100 rounded-md">
              <span className="w-2 h-2 bg-red-500 rounded-full animate-pulse"></span>
              <span className="text-xs font-medium text-red-600 uppercase tracking-widest">Recording Live</span>
              <span className="text-sm font-mono text-red-700 ml-2">{formatTime(elapsedTime)}</span>
            </div>
          )}
          
          <div className="flex items-center gap-2">
            <button 
              onClick={exportData}
              disabled={segments.length === 0}
              className="px-4 py-2 bg-slate-900 text-white text-sm font-medium rounded-lg disabled:opacity-30 disabled:cursor-not-allowed transition-all hover:bg-slate-800"
            >
              Export Transcript
            </button>
            <button 
              onClick={clearTranscript}
              disabled={segments.length === 0}
              className="p-2 text-slate-400 hover:text-red-500 transition-colors"
              title="Clear Transcript"
            >
              <Trash2 className="w-5 h-5" />
            </button>
          </div>
        </div>
      </header>

      {(browserWarning || speechError) && (
        <div className="mx-10 mt-6 space-y-2">
          {browserWarning && (
            <div className="p-3 bg-amber-50 border border-amber-200 rounded-lg flex items-center gap-3 text-amber-800 text-sm">
              <AlertCircle className="w-4 h-4 shrink-0" />
              <p>{browserWarning}</p>
            </div>
          )}
          {speechError && (
            <div className="p-3 bg-red-50 border border-red-200 rounded-lg flex items-center gap-3 text-red-800 text-sm">
              <AlertCircle className="w-4 h-4 shrink-0" />
              <p>{speechError}</p>
            </div>
          )}
        </div>
      )}

      {/* Main Content Area */}
      <main className="flex-1 flex gap-8 p-10 overflow-hidden">
        {/* Transcription Column (Chinese) */}
        <section className="flex-1 flex flex-col min-w-0">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-xs font-bold uppercase tracking-widest text-slate-400">Transcription (ZH-CN)</h2>
            <span className="text-[10px] bg-slate-200 px-2 py-0.5 rounded text-slate-600">Audio Input: Active</span>
          </div>
          <div className="flex-1 bg-white border border-slate-200 rounded-2xl shadow-sm flex flex-col overflow-hidden">
            <div 
              ref={scrollRef}
              className="flex-1 overflow-y-auto p-8 space-y-6 text-2xl leading-relaxed text-slate-800 font-medium"
            >
              {segments.length === 0 && !interimTranscript && (
                <div className="h-full flex items-center justify-center text-slate-300 italic font-light text-xl">
                  Awaiting audio signal...
                </div>
              )}
              
              {segments.map((segment) => (
                <p key={segment.id} className="transition-all duration-500 animate-in fade-in slide-in-from-bottom-2">
                  {segment.original}
                </p>
              ))}
              
              {interimTranscript && (
                <p className="opacity-40 italic font-light text-slate-500">
                  {interimTranscript}
                </p>
              )}
            </div>
          </div>
        </section>

        {/* Translation Column (French) */}
        <section className="flex-1 flex flex-col min-w-0">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-xs font-bold uppercase tracking-widest text-slate-400">Traduction (FR)</h2>
            <span className="text-[10px] bg-blue-50 px-2 py-0.5 rounded text-blue-600 font-medium italic">Gemma Engine</span>
          </div>
          <div className="flex-1 bg-white border border-slate-200 rounded-2xl shadow-sm flex flex-col overflow-hidden">
            <div className="flex-1 overflow-y-auto p-8 space-y-6 text-xl leading-relaxed text-slate-600">
              {segments.length === 0 && (
                <div className="h-full flex items-center justify-center text-slate-200 italic font-light">
                  No translation available yet.
                </div>
              )}
              
              {segments.map((segment) => (
                <div key={`${segment.id}-translated`}>
                  {segment.translated === "..." ? (
                    <div className="flex gap-1 items-center py-2">
                       <motion.div animate={{ opacity: [0.3, 1, 0.3] }} transition={{ repeat: Infinity, duration: 1.5 }} className="w-1.5 h-1.5 rounded-full bg-slate-300" />
                       <motion.div animate={{ opacity: [0.3, 1, 0.3] }} transition={{ repeat: Infinity, duration: 1.5, delay: 0.2 }} className="w-1.5 h-1.5 rounded-full bg-slate-300" />
                       <motion.div animate={{ opacity: [0.3, 1, 0.3] }} transition={{ repeat: Infinity, duration: 1.5, delay: 0.4 }} className="w-1.5 h-1.5 rounded-full bg-slate-300" />
                    </div>
                  ) : (
                    <p className="animate-in fade-in duration-700 italic font-light">
                      {segment.translated}
                    </p>
                  )}
                </div>
              ))}
            </div>
          </div>
        </section>
      </main>

      {/* Bottom Control Bar */}
      <footer className="h-24 bg-white border-t border-slate-200 flex items-center justify-center px-10 gap-12 shrink-0">
        <div className="flex flex-col items-center">
          <span className="text-[10px] uppercase tracking-tighter text-slate-400 mb-1">Status</span>
          <span className="text-sm font-bold text-slate-700">{isRecording ? 'Capturing' : 'Idle'}</span>
        </div>
        
        <button 
          onClick={handleToggleRecording}
          className={`group flex items-center gap-4 px-8 py-3 rounded-full transition-all shadow-lg text-white font-semibold tracking-wide ${
            isRecording 
            ? 'bg-red-600 hover:bg-red-700' 
            : 'bg-slate-900 hover:bg-slate-800'
          }`}
        >
          {isRecording ? (
            <>
              <div className="w-3 h-3 bg-white rounded-sm"></div>
              <span>STOP RECORDING</span>
            </>
          ) : (
            <>
              <Mic className="w-4 h-4 text-white" />
              <span>START RECORDING</span>
            </>
          )}
        </button>

        <div className="flex flex-col items-center">
          <span className="text-[10px] uppercase tracking-tighter text-slate-400 mb-1">Memory Usage</span>
          <div className="w-32 h-1.5 bg-slate-100 rounded-full overflow-hidden">
            <div className={`h-full bg-slate-300 transition-all duration-500`} style={{ width: `${Math.min((segments.length / 50) * 100, 100)}%` }}></div>
          </div>
        </div>
      </footer>
    </div>
  );
}
