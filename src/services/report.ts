import { requireApiUrl, type RuntimeConfig } from '../config/runtime';

const CLIENT_REPORT_TIMEOUT_MS = 35_000;

export interface ReportSegment {
  original: string;
  translated: string;
}

export interface GenerateReportOptions {
  segments: ReportSegment[];
  sourceLang: string;
  targetLang: string;
  reportLang: string;
  provider: string;
  model: string;
}

export async function generateReport(
  opts: GenerateReportOptions,
  runtimeConfig?: RuntimeConfig,
): Promise<string> {
  let res: Response;

  try {
    res = await fetch(requireApiUrl('/api/report', runtimeConfig), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(opts),
      signal: AbortSignal.timeout(CLIENT_REPORT_TIMEOUT_MS),
    });
  } catch (error) {
    if (error instanceof Error && (error.name === 'TimeoutError' || error.name === 'AbortError')) {
      throw new Error('Report generation timed out. Please try again.');
    }
    throw error;
  }

  let data: { report?: string; error?: string };
  try {
    data = (await res.json()) as { report?: string; error?: string };
  } catch {
    if (res.status === 404) {
      throw new Error('Report endpoint not found — please restart the server.');
    }
    throw new Error(`Server returned an unexpected response (${res.status}).`);
  }

  if (!res.ok) {
    throw new Error(data.error ?? `Report generation failed (${res.status})`);
  }

  return data.report ?? '';
}
