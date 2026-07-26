import dotenv from "dotenv";
import express from "express";
import { createServer } from "node:http";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  TranslateRequestError,
  UpstreamApiError,
  UpstreamTimeoutError,
  parseTranslationLanguages,
  parseTranslationLanguage,
  parseTranslateRequest,
  translateWithOpenRouterModel,
  DEFAULT_MODEL,
  type TranslationLanguage,
} from "./server/translate.js";
import { verifyLanguage } from "./server/languageVerification.js";
import { fetchFreeModels, fetchOllamaModels, fetchMinimaxModels } from "./server/models.js";
import { translateWithMinimax } from "./server/minimax.js";
import { translateWithOllama, isOllamaRunning } from "./server/ollama.js";
import { fetchGoogleAIModels, translateWithGoogleAI } from "./server/googleai.js";
import { getSetupStatus, runSetup } from "./server/setup.js";
import { getWhisperStatus, getWhisperModelName, setWhisperModel, setWhisperTask, type WhisperModelName } from "./server/whisper.js";
import { getDeviceAudioStatus } from "./server/deviceAudioCapture.js";
import { generateReport, type ReportSegment } from "./server/report.js";
import { getServerRuntimeConfig } from "./server/runtimeConfig.js";
import { attachWebSocketServer } from "./server/wsTranscribe.js";
import { buildCorsHeaders } from "./server/cors.js";

dotenv.config();

const app = express();
const httpServer = createServer(app);
const isProduction = process.env.NODE_ENV === "production";
const runtimeConfig = getServerRuntimeConfig();
const { host, port, transcription } = runtimeConfig;
const rootDir = path.dirname(fileURLToPath(import.meta.url));
const isHostedDemo = process.env.HF_SPACES === "1" || process.env.HF_SPACES === "true";
const isAutoSetupDisabled =
  process.env.DISABLE_AUTO_SETUP === "1" ||
  process.env.DISABLE_AUTO_SETUP === "true" ||
  isHostedDemo;

app.use((req, res, next) => {
  const headers = buildCorsHeaders(req.headers.origin);
  if (headers) {
    for (const [key, value] of Object.entries(headers)) {
      res.setHeader(key, value);
    }
  }

  if (req.method === "OPTIONS") {
    res.sendStatus(req.headers.origin && !headers ? 403 : 204);
    return;
  }

  next();
});

app.use(express.json({ limit: "256kb" }));

// Hosted Spaces demos are browser Web Speech only — do not attach Whisper WS.
const transcribeRuntime = isHostedDemo
  ? null
  : attachWebSocketServer(httpServer, {
      config: transcription,
      isOriginAllowed: (origin) => !origin || buildCorsHeaders(origin) !== null,
    });

const GOOGLE_AI_PRIMARY_FALLBACK_MODEL = "gemma-4-26b-a4b-it";
const GOOGLE_AI_SECONDARY_FALLBACK_MODEL = "gemma-4-31b-it";
const MINIMAX_FALLBACK_MODEL = "MiniMax-M3";

type FallbackProviderId =
  | "openrouter"
  | "minimax"
  | "google-ai-studio"
  | "google-ai-studio-secondary";

interface FallbackResult {
  translation: string;
  fallback?: string;
}

interface FallbackStep {
  fallback?: string;
  available: boolean;
  run: () => Promise<string>;
}

/** Default self-host order. Hosted Spaces override via TRANSLATION_FALLBACK_ORDER. */
const DEFAULT_FALLBACK_ORDER: FallbackProviderId[] = [
  "openrouter",
  "google-ai-studio",
  "google-ai-studio-secondary",
  "minimax",
];

const HOSTED_DEMO_FALLBACK_ORDER: FallbackProviderId[] = [
  "openrouter",
  "minimax",
  "google-ai-studio",
];

function parseFallbackOrder(value: string | undefined): FallbackProviderId[] | null {
  if (!value?.trim()) {
    return null;
  }

  const allowed = new Set<string>([
    "openrouter",
    "minimax",
    "google-ai-studio",
    "google-ai-studio-secondary",
  ]);
  const parsed = value
    .split(",")
    .map((part) => part.trim())
    .filter((part): part is FallbackProviderId => allowed.has(part));

  return parsed.length > 0 ? parsed : null;
}

function resolveTranslationFallbackOrder(
  env: NodeJS.ProcessEnv = process.env,
  hostedDemo = isHostedDemo,
): FallbackProviderId[] {
  return (
    parseFallbackOrder(env.TRANSLATION_FALLBACK_ORDER) ??
    (hostedDemo ? HOSTED_DEMO_FALLBACK_ORDER : DEFAULT_FALLBACK_ORDER)
  );
}

function buildTranslationFallbackSteps(
  text: string,
  model: string | undefined,
  sourceLang: TranslationLanguage,
  targetLang: TranslationLanguage,
  order: FallbackProviderId[] = resolveTranslationFallbackOrder(),
): FallbackStep[] {
  const catalog: Record<FallbackProviderId, FallbackStep> = {
    openrouter: {
      available: true,
      run: () => translateWithOpenRouterModel(text, model || DEFAULT_MODEL, sourceLang, targetLang),
    },
    minimax: {
      fallback: "MiniMax M3",
      available: Boolean(process.env.MINIMAX_API_KEY),
      run: () => translateWithMinimax(text, MINIMAX_FALLBACK_MODEL, sourceLang, targetLang),
    },
    "google-ai-studio": {
      fallback: "Gemini",
      available: Boolean(process.env.GOOGLE_AI_STUDIO_API_KEY),
      run: () => translateWithGoogleAI(text, GOOGLE_AI_PRIMARY_FALLBACK_MODEL, sourceLang, targetLang),
    },
    "google-ai-studio-secondary": {
      fallback: "Gemma 4 31B IT",
      available: Boolean(process.env.GOOGLE_AI_STUDIO_API_KEY),
      run: () => translateWithGoogleAI(text, GOOGLE_AI_SECONDARY_FALLBACK_MODEL, sourceLang, targetLang),
    },
  };

  return order.map((id) => catalog[id]);
}

async function translateWithFallbackChain(
  text: string,
  model: string | undefined,
  sourceLang: TranslationLanguage,
  targetLang: TranslationLanguage,
): Promise<FallbackResult> {
  // Free-only ordered fallback chain (no paid OpenRouter).
  // Hosted demo default: OpenRouter → MiniMax → Gemini.
  // Self-host default: OpenRouter → Gemini → Gemma 31B → MiniMax.
  const steps = buildTranslationFallbackSteps(text, model, sourceLang, targetLang);
  let lastError: unknown = null;
  let attempted = 0;

  for (const step of steps) {
    if (!step.available) continue;
    attempted += 1;

    try {
      const translation = await step.run();
      return attempted === 1 ? { translation } : { translation, fallback: step.fallback };
    } catch (error) {
      lastError = error;
      console.error(
        `[fallback] ${step.fallback ?? "OpenRouter"} failed:`,
        error instanceof Error ? error.message : error,
      );
      // Roll over to the next provider only on upstream failures; surface config
      // and programming errors immediately.
      if (!(error instanceof UpstreamApiError) && !(error instanceof UpstreamTimeoutError)) {
        throw error;
      }
    }
  }

  if (lastError instanceof UpstreamApiError || lastError instanceof UpstreamTimeoutError) {
    throw lastError;
  }
  throw new UpstreamApiError(429, "All free translation fallbacks are exhausted.");
}

app.get("/api/models", async (req, res) => {
  const provider =
    typeof req.query.provider === "string" ? req.query.provider : "openrouter";
  try {
    const models =
      provider === "ollama" ? await fetchOllamaModels() :
      provider === "google-ai-studio" ? await fetchGoogleAIModels() :
      provider === "minimax" ? fetchMinimaxModels() :
      await fetchFreeModels();
    res.json(models);
  } catch (error) {
    console.error("[api] fetch models failed:", error);
    if (error instanceof Error && error.message === "GOOGLE_AI_STUDIO_API_KEY is missing") {
      res.status(503).json({ error: "Google AI Studio is not configured. Set GOOGLE_AI_STUDIO_API_KEY." });
      return;
    }
    if (error instanceof Error && error.message === "MINIMAX_API_KEY is missing") {
      res.status(503).json({ error: "MiniMax is not configured. Set MINIMAX_API_KEY." });
      return;
    }
    if (error instanceof Error) {
      res.status(502).json({ error: error.message });
      return;
    }
    res.status(502).json({ error: "Failed to fetch available models." });
  }
});

app.post("/api/translate", async (req, res) => {
  try {
    const text = parseTranslateRequest(req.body);
    const model =
      typeof req.body?.model === "string" ? req.body.model : undefined;
    const { sourceLang, targetLang } = parseTranslationLanguages(
      req.body?.sourceLang,
      req.body?.targetLang,
    );
    const provider =
      typeof req.body?.provider === "string" ? req.body.provider : "openrouter";

    let translation: string;
    let fallback: string | undefined;

    if (provider === "ollama") {
      if (!model) {
        res.status(400).json({ error: "model is required for Ollama provider" });
        return;
      }
      translation = await translateWithOllama(text, model, sourceLang, targetLang);
    } else if (provider === "google-ai-studio") {
      if (!model) {
        res.status(400).json({ error: "model is required for Google AI Studio provider" });
        return;
      }
      translation = await translateWithGoogleAI(text, model, sourceLang, targetLang);
    } else if (provider === "minimax") {
      if (!model) {
        res.status(400).json({ error: "model is required for MiniMax provider" });
        return;
      }
      translation = await translateWithMinimax(text, model, sourceLang, targetLang);
    } else {
      const result = await translateWithFallbackChain(text, model, sourceLang, targetLang);
      translation = result.translation;
      fallback = result.fallback;
    }

    const response: Record<string, string> = { translation };
    if (fallback) {
      response.fallback = fallback;
    }
    res.json(response);
  } catch (error) {
    if (error instanceof TranslateRequestError) {
      res.status(error.statusCode).json({ error: error.message });
      return;
    }

    if (error instanceof UpstreamApiError) {
      if (error.upstreamStatus === 429) {
        res.status(429).json({ error: 'Translation rate-limited. Please try a different model or wait a moment.' });
        return;
      }
      res.status(502).json({ error: `Upstream translation error (${error.upstreamStatus}).` });
      return;
    }

    if (error instanceof UpstreamTimeoutError) {
      res.status(504).json({ error: error.message });
      return;
    }

    console.error("[api] translate failed:", error);

    if (error instanceof Error && error.message === "OPENROUTER_API_KEY is missing") {
      res.status(503).json({ error: "Translation service is not configured. Set OPENROUTER_API_KEY." });
      return;
    }

    if (error instanceof Error && error.message === "GOOGLE_AI_STUDIO_API_KEY is missing") {
      res.status(503).json({ error: "Google AI Studio is not configured. Set GOOGLE_AI_STUDIO_API_KEY." });
      return;
    }

    if (error instanceof Error && error.message === "MINIMAX_API_KEY is missing") {
      res.status(503).json({ error: "MiniMax is not configured. Set MINIMAX_API_KEY." });
      return;
    }

    res.status(502).json({ error: "Translation failed." });
  }
});

app.post("/api/verify-language", async (req, res) => {
  try {
    const text = typeof req.body?.text === "string" ? req.body.text.trim() : "";
    if (!text) {
      res.status(400).json({ error: "text is required" });
      return;
    }

    const expectedLang = parseTranslationLanguage(
      req.body?.expectedLang,
      "sourceLang",
      "English",
    );

    const provider =
      typeof req.body?.provider === "string" ? req.body.provider : "openrouter";
    const model =
      typeof req.body?.model === "string" ? req.body.model : undefined;

    const isValid = await verifyLanguage(text, expectedLang, provider, model);
    res.json({ isValid });
  } catch (error) {
    console.error("[api] verify-language failed:", error);
    res.status(200).json({ isValid: true, error: error instanceof Error ? error.message : "Verification error" });
  }
});

app.get("/api/setup/status", (_req, res) => {
  if (isAutoSetupDisabled) {
    res.json({ ...getSetupStatus(), step: "ready", progress: 100, error: null });
    return;
  }
  res.json(getSetupStatus());
});

app.post("/api/setup/start", (_req, res) => {
  if (isAutoSetupDisabled) {
    res.status(409).json({ error: "Local setup is disabled for this deployment." });
    return;
  }
  res.json({ started: true });
  runSetup((status) => {
    console.log("[setup]", status.step, status.progress);
  }).catch((err: unknown) => {
    console.error("[setup] error:", err);
  });
});

app.get("/api/ollama/status", async (_req, res) => {
  if (isHostedDemo) {
    res.json({ running: false });
    return;
  }
  const running = await isOllamaRunning();
  res.json({ running });
});

app.get("/api/whisper/status", (_req, res) => {
  if (isHostedDemo) {
    res.json({ ready: false, loading: false, model: null, disabled: true, reason: "Whisper STT is disabled on the hosted demo." });
    return;
  }
  res.json(getWhisperStatus());
});

app.get("/api/whisper/model", (_req, res) => {
  if (isHostedDemo) {
    res.status(409).json({ error: "Whisper STT is disabled on the hosted demo." });
    return;
  }
  res.json({ model: getWhisperModelName() });
});

app.get("/api/device-audio/status", async (_req, res) => {
  if (isHostedDemo) {
    res.json({ available: false, reason: "Device audio capture is disabled on the hosted demo.", platform: process.platform, ffmpegFound: false });
    return;
  }
  try {
    const status = await getDeviceAudioStatus();
    res.json(status);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to get device audio status";
    res.status(500).json({ available: false, reason: message, platform: process.platform, ffmpegFound: false });
  }
});

app.get("/api/transcribe/status", (_req, res) => {
  if (isHostedDemo || !transcribeRuntime) {
    res.json({
      disabled: true,
      reason: "Backend Whisper transcription is disabled on the hosted demo (browser speech only).",
      limits: null,
      metrics: null,
    });
    return;
  }
  res.json({
    limits: {
      host,
      port,
      maxWsConnections: transcription.maxWsConnections,
      maxActiveTranscriptions: transcription.maxActiveTranscriptions,
      maxQueueSize: transcription.maxQueueSize,
      sessionIdleTimeoutMs: transcription.sessionIdleTimeoutMs,
      sessionMaxDurationMs: transcription.sessionMaxDurationMs,
      rateLimitWindowMs: transcription.rateLimitWindowMs,
      rateLimitMaxRequests: transcription.rateLimitMaxRequests,
    },
    metrics: transcribeRuntime.getSnapshot(),
  });
});

app.post("/api/report", async (req, res) => {
  try {
    const { segments, sourceLang, targetLang, reportLang, provider, model } = req.body as {
      segments?: ReportSegment[];
      sourceLang?: string;
      targetLang?: string;
      reportLang?: string;
      provider?: string;
      model?: string;
    };

    if (!Array.isArray(segments) || segments.length === 0) {
      res.status(400).json({ error: "segments array is required and must not be empty." });
      return;
    }

    const report = await generateReport(
      segments,
      sourceLang ?? "English",
      targetLang ?? "English",
      reportLang ?? targetLang ?? "English",
      provider ?? "openrouter",
      model ?? "",
    );

    res.json({ report });
  } catch (error) {
    if (error instanceof UpstreamApiError) {
      if (error.upstreamStatus === 429) {
        res.status(429).json({ error: "Rate-limited. Try a different model or wait a moment." });
        return;
      }
      res.status(502).json({ error: `Report generation failed (${error.upstreamStatus}).` });
      return;
    }
    console.error("[api] report failed:", error);
    res.status(502).json({ error: "Failed to generate report." });
  }
});

app.post("/api/whisper/model", async (req, res) => {
  if (isHostedDemo) {
    res.status(409).json({ error: "Whisper STT is disabled on the hosted demo." });
    return;
  }
  const model = req.body?.model as string;
  if (model !== 'tiny' && model !== 'base' && model !== 'small' && model !== 'turbo' && model !== 'turbo-v3') {
    res.status(400).json({ error: 'model must be "tiny", "base", "small", "turbo", or "turbo-v3"' });
    return;
  }
  const task = req.body?.task as string;
  if (task && task !== 'transcribe' && task !== 'translate') {
    res.status(400).json({ error: 'task must be "transcribe" or "translate"' });
    return;
  }
  try {
    await setWhisperModel(model as WhisperModelName);
    if (task) {
      setWhisperTask(task as 'transcribe' | 'translate');
    }
    res.json({ model, task: task || 'transcribe' });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to switch Whisper model.';
    res.status(500).json({ error: message });
  }
});

if (isProduction) {
  const distPath = path.resolve(rootDir, "dist");

  app.use(express.static(distPath));
  app.get("*", (_req, res) => {
    res.sendFile(path.join(distPath, "index.html"));
  });
} else {
  const { createServer: createViteServer } = await import("vite");
  const vite = await createViteServer({
    appType: "spa",
    server: {
      // `host` is irrelevant in middlewareMode — Vite does not start its own
      // listener; Express owns the socket. Omitting it prevents the HMR
      // client from being told to connect to 127.0.0.1 instead of localhost.
      middlewareMode: true,
      hmr: process.env.DISABLE_HMR === "true"
        ? false
        : {
            // Attach Vite's HMR WebSocket upgrade handler to the existing
            // httpServer so HMR traffic shares port 3000 with Express.
            server: httpServer,
            // Tell the injected browser HMR client which port to dial.
            // Without this it falls back to Vite's own default (5173).
            clientPort: port,
          },
    },
  });

  app.use(vite.middlewares);
}

function getLanAddresses(): string[] {
  return Object.values(os.networkInterfaces())
    .flat()
    .filter((iface): iface is os.NetworkInterfaceInfo => !!iface && iface.family === 'IPv4' && !iface.internal)
    .map((iface) => `http://${iface.address}:${port}`);
}

httpServer.listen(port, host, () => {
  console.log(`Transcribe Easy listening on http://${host}:${port}`);
  if (host === '0.0.0.0') {
    const addresses = getLanAddresses();
    if (addresses.length > 0) {
      console.log('  LAN access:');
      for (const addr of addresses) console.log(`    ${addr}`);
    }
  }
  if (isHostedDemo) {
    console.log("[transcribe] hosted demo mode: browser Web Speech only (Whisper WS disabled)");
  } else {
    console.log(`[transcribe] capacity: ${transcription.maxActiveTranscriptions} active, ${transcription.maxWsConnections} ws, queue ${transcription.maxQueueSize}, idle ${transcription.sessionIdleTimeoutMs}ms`);
  }

  if (!isAutoSetupDisabled) {
    // Automatically start background setup
    runSetup((status) => {
      if (status.step === 'error') {
        console.error("[setup/auto] error:", status.error);
      }
    }).catch((err: unknown) => {
      console.error("[setup/auto] failed:", err);
    });
  }
});
