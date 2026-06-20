import {
  fetchWithTimeout,
  getOpenRouterApiKey,
  getOpenRouterPaidApiKey,
  OPENROUTER_MIN_THROUGHPUT_TOKENS_PER_SECOND,
  OPENROUTER_PAID_FALLBACK_MODEL,
  PAID_OPENROUTER_FALLBACK_ENABLED,
  stripReasoningBlocks,
  UpstreamApiError,
} from './translate.js';
import { callMinimaxReport } from './minimax.js';

const OPENROUTER_CHAT_URL = 'https://openrouter.ai/api/v1/chat/completions';
const GOOGLE_AI_BASE = 'https://generativelanguage.googleapis.com/v1beta/openai';
const OLLAMA_BASE_URL = 'http://localhost:11434';
const REPORT_MODEL_FALLBACK = 'liquid/lfm-2.5-1.2b-instruct:free';
// The client aborts at 35s; keep the upstream timeout safely under that so a slow
// free model on a long transcript fails with our message rather than the client's.
const REPORT_OPENROUTER_TIMEOUT_MS = 30_000;
const REPORT_GOOGLE_AI_TIMEOUT_MS = 30_000;
const REPORT_OLLAMA_TIMEOUT_MS = 30_000;
// A full 4-section report for a long meeting needs more than ~250 words; 320 tokens
// truncated the Action Items section mid-sentence.
const REPORT_MAX_TOKENS = 768;
// Cap the transcript fed to the model so long sessions don't overflow the (small)
// report model's context window. ~16k chars ≈ 4k input tokens, leaving room for the
// instructions and the 768-token response.
const REPORT_MAX_TRANSCRIPT_CHARS = 16_000;
const TRANSCRIPT_TRUNCATION_MARKER =
  '[… middle of the transcript omitted to fit the model context limit …]';

export interface ReportSegment {
  original: string;
  translated: string;
}

function getDisplayText(segment: ReportSegment): string {
  const translated = segment.translated?.trim();
  if (translated && !translated.startsWith('[')) {
    return translated;
  }

  return segment.original.trim();
}

function countMeaningfulChars(segments: ReportSegment[]): number {
  return segments.reduce((total, segment) => total + getDisplayText(segment).length, 0);
}

export function shouldUseSparseReportFallback(segments: ReportSegment[]): boolean {
  const meaningfulChars = countMeaningfulChars(segments);

  if (segments.length <= 2 && meaningfulChars < 220) {
    return true;
  }

  if (meaningfulChars < 120) {
    return true;
  }

  return false;
}

export function buildSparseReport(
  segments: ReportSegment[],
  sourceLang: string,
  targetLang: string,
  reportLang: string,
): string {
  const exchangeLines = segments
    .slice(0, 3)
    .map((segment) => `- ${getDisplayText(segment)}`)
    .join('\n');

  const summary =
    reportLang.toLowerCase() === 'french'
      ? "Bref échange de salutations ou de prise de contact. Le contenu disponible est trop limité pour déduire un sujet de réunion, des décisions ou des actions concrètes."
      : `Brief exchange of greetings or casual check-in. The available transcript is too limited to infer a meeting topic, decisions, or concrete next steps.`;

  return `## Summary
${summary}

## Key Topics Discussed
- ${reportLang.toLowerCase() === 'french' ? 'Salutations et prise de contact.' : 'Greetings and brief check-in.'}
- ${reportLang.toLowerCase() === 'french' ? 'Aucun sujet de réunion explicite identifié.' : 'No explicit meeting topic identified.'}

## Decisions Made
None identified

## Action Items & Next Steps
None identified

## Transcript Evidence
${exchangeLines || `- ${sourceLang} / ${targetLang}`}`;
}

export function buildTranscriptLines(
  segments: ReportSegment[],
  sourceLang: string,
  targetLang: string,
): string[] {
  return segments.map((s, i) => {
    const hasTranslation = s.translated && !s.translated.startsWith('[');
    return hasTranslation
      ? `${i + 1}. [${sourceLang}] ${s.original}\n   [${targetLang}] ${s.translated}`
      : `${i + 1}. ${s.original}`;
  });
}

/**
 * Fit the transcript within a character budget so long meetings don't overflow the
 * report model's context window. Keeps the opening (meeting purpose) and the closing
 * (decisions / action items) and drops the middle, where redundancy is highest.
 */
export function fitTranscriptToBudget(lines: string[], maxChars: number): string {
  const separator = '\n\n';
  const full = lines.join(separator);
  if (full.length <= maxChars) {
    return full;
  }

  const budget = Math.max(
    0,
    maxChars - TRANSCRIPT_TRUNCATION_MARKER.length - separator.length * 2,
  );
  const headBudget = Math.floor(budget / 2);

  const head: string[] = [];
  let headLen = 0;
  for (const line of lines) {
    const nextLen = headLen + line.length + separator.length;
    if (nextLen > headBudget) break;
    head.push(line);
    headLen = nextLen;
  }

  const tail: string[] = [];
  let tailLen = 0;
  for (let i = lines.length - 1; i >= head.length; i--) {
    const nextLen = tailLen + lines[i].length + separator.length;
    if (nextLen > budget - headLen) break;
    tail.unshift(lines[i]);
    tailLen = nextLen;
  }

  return [...head, TRANSCRIPT_TRUNCATION_MARKER, ...tail].join(separator);
}

export function buildReportPrompt(
  segments: ReportSegment[],
  sourceLang: string,
  targetLang: string,
  reportLang: string,
): string {
  const lines = buildTranscriptLines(segments, sourceLang, targetLang);
  const transcript = fitTranscriptToBudget(lines, REPORT_MAX_TRANSCRIPT_CHARS);

  return `You are a careful meeting scribe. Based only on the transcript below, write a concise structured meeting report in ${reportLang}.

Your report MUST follow this exact structure:

## Summary
(2–3 sentences capturing the overall purpose and outcome of the meeting)

## Key Topics Discussed
(bullet points — one line each, 3–8 items)

## Decisions Made
(bullet points, or write "None identified" if there are none)

## Action Items & Next Steps
(bullet points with owner name if identifiable, or write "None identified")

Rules:
- Write entirely in ${reportLang}
- Be concise and professional
- Do NOT include any preamble or closing remarks outside the sections above
- Do NOT repeat the transcript
- Do NOT invent participants, names, decisions, dates, actions, or project details
- Only mention decisions or action items if they are explicitly supported by the transcript
- If the transcript is sparse, ambiguous, or only contains greetings / pleasantries, say so plainly
- When evidence is insufficient, write "None identified"

TRANSCRIPT (${sourceLang} with ${targetLang} translations):

${transcript}`;
}

async function callOpenRouter(prompt: string, model: string): Promise<string> {
  const makeRequest = async (targetModel: string) => {
    // Paid model (selected or 429 fallback) uses the dedicated paid key when set.
    const apiKey =
      targetModel === OPENROUTER_PAID_FALLBACK_MODEL
        ? getOpenRouterPaidApiKey()
        : getOpenRouterApiKey();
    const res = await fetchWithTimeout(OPENROUTER_CHAT_URL, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: targetModel,
        messages: [{ role: 'user', content: prompt }],
        temperature: 0.3,
        max_tokens: REPORT_MAX_TOKENS,
        reasoning: {
          effort: 'none',
          exclude: true,
        },
        provider: {
          sort: {
            by: 'throughput',
            partition: 'none',
          },
          preferred_min_throughput: {
            p50: OPENROUTER_MIN_THROUGHPUT_TOKENS_PER_SECOND,
          },
        },
      }),
    }, REPORT_OPENROUTER_TIMEOUT_MS, 'OpenRouter report');
    return res;
  };

  const res = await makeRequest(model);

  if (res.status === 429 && model !== OPENROUTER_PAID_FALLBACK_MODEL && PAID_OPENROUTER_FALLBACK_ENABLED) {
    const fallbackRes = await makeRequest(OPENROUTER_PAID_FALLBACK_MODEL);
    if (!fallbackRes.ok) {
      const body = await fallbackRes.text();
      throw new UpstreamApiError(fallbackRes.status, body);
    }
    const data = (await fallbackRes.json()) as { choices: { message: { content: string } }[] };
    return stripReasoningBlocks(data.choices[0]?.message?.content ?? '');
  }

  if (!res.ok) {
    const body = await res.text();
    throw new UpstreamApiError(res.status, body);
  }

  const data = (await res.json()) as { choices: { message: { content: string } }[] };
  return stripReasoningBlocks(data.choices[0]?.message?.content ?? '');
}

async function callOllama(prompt: string, model: string): Promise<string> {
  const res = await fetchWithTimeout(`${OLLAMA_BASE_URL}/api/chat`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model,
      messages: [{ role: 'user', content: prompt }],
      stream: false,
      think: false,
      options: { temperature: 0.3 },
    }),
  }, REPORT_OLLAMA_TIMEOUT_MS, 'Ollama report');

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Ollama error ${res.status}: ${body}`);
  }

  const data = (await res.json()) as { message?: { content?: string } };
  return stripReasoningBlocks(data.message?.content ?? '');
}

async function callGoogleAI(prompt: string, model: string): Promise<string> {
  const key = process.env.GOOGLE_AI_STUDIO_API_KEY;
  if (!key) throw new Error('GOOGLE_AI_STUDIO_API_KEY is missing');

  const res = await fetchWithTimeout(`${GOOGLE_AI_BASE}/chat/completions`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model,
      messages: [{ role: 'user', content: prompt }],
      temperature: 0.3,
      max_tokens: REPORT_MAX_TOKENS,
    }),
  }, REPORT_GOOGLE_AI_TIMEOUT_MS, 'Google AI report');

  if (!res.ok) {
    const body = await res.text();
    throw new UpstreamApiError(res.status, body);
  }

  const data = (await res.json()) as { choices: Array<{ message: { content: string } }> };
  return stripReasoningBlocks(data.choices[0]?.message?.content ?? '');
}

export async function generateReport(
  segments: ReportSegment[],
  sourceLang: string,
  targetLang: string,
  reportLang: string,
  provider: string,
  model: string,
): Promise<string> {
  if (segments.length === 0) throw new Error('No transcript segments to summarise.');

  const prompt = buildReportPrompt(segments, sourceLang, targetLang, reportLang);

  if (provider === 'ollama') return callOllama(prompt, model);
  if (provider === 'google-ai-studio') return callGoogleAI(prompt, model);
  if (provider === 'minimax') return callMinimaxReport(prompt, model, REPORT_MAX_TOKENS);
  return callOpenRouter(prompt, model || REPORT_MODEL_FALLBACK);
}
