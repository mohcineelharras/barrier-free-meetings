import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { getModelManifest, WHISPER_MODEL_IDS } from '../server/modelManifest.js';
import { getOllamaBaseUrl } from '../server/setup.js';

interface CheckResult {
  label: string;
  ok: boolean;
  detail: string;
}

const manifest = getModelManifest();
const checks: CheckResult[] = [];

function addCheck(label: string, ok: boolean, detail: string): void {
  checks.push({ label, ok, detail });
}

function whisperCacheDir(model: string): string {
  const modelId = WHISPER_MODEL_IDS[model as keyof typeof WHISPER_MODEL_IDS];
  const modelDir = modelId.replace(/^onnx-community\//, '');
  return path.join(os.homedir(), '.transcribe-easy', 'transformers-cache', 'onnx-community', modelDir, 'onnx');
}

addCheck('Node.js', Number.parseInt(process.versions.node.split('.')[0] ?? '0', 10) >= 20, process.version);
addCheck('Frontend build', fs.existsSync(path.join(process.cwd(), 'dist', 'index.html')), 'dist/index.html');

try {
  const response = await fetch(`${getOllamaBaseUrl()}/api/tags`, {
    signal: AbortSignal.timeout(2500),
  });
  addCheck('Ollama server', response.ok, `${getOllamaBaseUrl()}/api/tags`);

  if (response.ok) {
    const data = (await response.json()) as { models?: Array<{ name: string }> };
    const available = new Set((data.models ?? []).map((model) => model.name.replace(/:latest$/, '')));
    for (const model of manifest.requiredOllamaModels) {
      addCheck(`Ollama model ${model}`, available.has(model), available.has(model) ? 'available' : 'missing');
    }
  }
} catch (error) {
  addCheck('Ollama server', false, error instanceof Error ? error.message : String(error));
  for (const model of manifest.requiredOllamaModels) {
    addCheck(`Ollama model ${model}`, false, 'Ollama unavailable');
  }
}

for (const model of manifest.requiredWhisperModels) {
  const dir = whisperCacheDir(model);
  const ok =
    fs.existsSync(path.join(dir, 'encoder_model.onnx')) &&
    fs.existsSync(path.join(dir, 'decoder_model_merged.onnx'));
  addCheck(`Whisper model ${model}`, ok, dir);
}

addCheck(
  'Report provider',
  Boolean(
    process.env.OPENROUTER_API_KEY ||
      process.env.GOOGLE_AI_STUDIO_API_KEY ||
      process.env.MINIMAX_API_KEY ||
      manifest.requiredOllamaModels.length > 0,
  ),
  'OpenRouter, Google AI, MiniMax, or local Ollama',
);

for (const check of checks) {
  console.log(`${check.ok ? 'PASS' : 'FAIL'} ${check.label} - ${check.detail}`);
}

if (checks.some((check) => !check.ok)) {
  process.exit(1);
}
