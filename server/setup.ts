import { execSync, spawn, type ChildProcess } from 'node:child_process';
import fs from 'node:fs';
import https from 'node:https';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export interface SetupStatus {
  step:
    | 'detecting'
    | 'downloading-ollama'
    | 'starting-ollama'
    | 'pulling-model'
    | 'downloading-whisper'
    | 'ready'
    | 'error';
  progress: number;
  error: string | null;
}

const OLLAMA_MODELS = ['qwen3.5:0.8b', 'qwen3.5:2b', 'qwen3.5:4b'];
const OLLAMA_OBSOLETE_MODELS = ['qwen3:0.5b', 'qwen:0.5b', 'qwen3:0.6b'];
const OLLAMA_RELEASE_BASE = 'https://github.com/ollama/ollama/releases/latest/download';
const DOWNLOAD_TIMEOUT_MS = 5 * 60 * 1000;

const PROJECT_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

let currentStatus: SetupStatus = { step: 'detecting', progress: 0, error: null };
let ollamaProcess: ChildProcess | null = null;
let setupRunning = false;

export function getSetupStatus(): SetupStatus {
  return { ...currentStatus };
}

function setStatus(update: Partial<SetupStatus>) {
  currentStatus = { ...currentStatus, ...update };
}

function getInstallDir(): string {
  if (process.platform === 'win32') {
    const localAppData = process.env.LOCALAPPDATA ?? path.join(os.homedir(), 'AppData', 'Local');
    return path.join(localAppData, 'TranscribeEasy', 'ollama');
  }
  if (process.platform === 'linux') {
    return path.join(os.homedir(), '.local', 'share', 'TranscribeEasy', 'ollama');
  }
  return path.join(os.homedir(), 'Library', 'Application Support', 'TranscribeEasy', 'ollama');
}

function getOllamaBinaryName(): string {
  return process.platform === 'win32' ? 'ollama.exe' : 'ollama';
}

function formatErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function bestEffortRemoveFile(filePath: string, label: string): void {
  try {
    fs.unlinkSync(filePath);
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code;
    if (code !== 'ENOENT') {
      console.warn(
        `[setup] Failed to remove partial ${label} at ${filePath}: ${formatErrorMessage(error)}`,
      );
    }
  }
}

function findOllamaInPath(): string | null {
  try {
    const cmd = process.platform === 'win32' ? 'where ollama' : 'which ollama';
    const result = execSync(cmd, { encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'] }).trim();
    const first = result.split('\n')[0]?.trim();
    return first || null;
  } catch {
    return null;
  }
}

function resolveOllamaBinary(): string | null {
  const inPath = findOllamaInPath();
  if (inPath) return inPath;
  const local = path.join(getInstallDir(), getOllamaBinaryName());
  if (fs.existsSync(local)) return local;
  return null;
}

function downloadFile(
  url: string,
  dest: string,
  onProgress?: (pct: number) => void,
): Promise<void> {
  return new Promise((resolve, reject) => {
    const tempDest = `${dest}.part`;
    fs.mkdirSync(path.dirname(dest), { recursive: true });
    bestEffortRemoveFile(tempDest, 'download temp file');
    const file = fs.createWriteStream(tempDest);
    let settled = false;
    let request: ReturnType<typeof https.get> | null = null;

    const complete = (fn: () => void) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      fn();
    };

    const fail = (error: Error) => {
      complete(() => {
        request?.destroy();
        file.once('close', () => {
          bestEffortRemoveFile(tempDest, 'download temp file');
        });
        file.destroy();
        reject(error);
      });
    };

    const timer = setTimeout(() => {
      fail(new Error(`Download timed out after ${DOWNLOAD_TIMEOUT_MS / 1000}s: ${url}`));
    }, DOWNLOAD_TIMEOUT_MS);

    file.on('error', (err) => fail(err));
    file.on('finish', () => {
      complete(() => {
        file.close((closeError) => {
          if (closeError) {
            bestEffortRemoveFile(tempDest, 'download temp file');
            reject(closeError);
            return;
          }

          try {
            fs.renameSync(tempDest, dest);
            resolve();
          } catch (error) {
            bestEffortRemoveFile(tempDest, 'download temp file');
            reject(error instanceof Error ? error : new Error(String(error)));
          }
        });
      });
    });

    const follow = (reqUrl: string, redirects = 0) => {
      if (redirects > 10) {
        fail(new Error('Too many redirects'));
        return;
      }

      request = https.get(reqUrl, (res) => {
        if (res.statusCode === 301 || res.statusCode === 302) {
          const location = res.headers.location;
          if (!location) {
            res.resume();
            fail(new Error('Redirect without Location header'));
            return;
          }
          res.resume();
          follow(location, redirects + 1);
          return;
        }
        if (res.statusCode !== 200) {
          res.resume();
          fail(new Error(`HTTP ${res.statusCode} downloading ${reqUrl}`));
          return;
        }
        const total = parseInt(res.headers['content-length'] ?? '0', 10);
        let downloaded = 0;
        res.on('data', (chunk: Buffer) => {
          downloaded += chunk.length;
          if (total > 0) onProgress?.(Math.round((downloaded / total) * 100));
        });
        res.pipe(file);
        res.on('error', (err) => {
          fail(err);
        });
      });
      request.on('error', (err) => fail(err));
    };

    follow(url);
  });
}

function getDownloadUrl(): string {
  if (process.platform === 'darwin') {
    return `${OLLAMA_RELEASE_BASE}/ollama-darwin`;
  }
  if (process.platform === 'win32') {
    return `${OLLAMA_RELEASE_BASE}/ollama-windows-amd64.zip`;
  }
  const arch = os.arch() === 'arm64' ? 'arm64' : 'amd64';
  return `${OLLAMA_RELEASE_BASE}/ollama-linux-${arch}`;
}

async function downloadOllamaBinary(): Promise<string> {
  const installDir = getInstallDir();
  fs.mkdirSync(installDir, { recursive: true });

  const binaryPath = path.join(installDir, getOllamaBinaryName());
  if (fs.existsSync(binaryPath)) return binaryPath;

  setStatus({ step: 'downloading-ollama', progress: 0 });
  const url = getDownloadUrl();

  if (process.platform === 'win32') {
    const zipPath = path.join(installDir, 'ollama-windows.zip');
    try {
      await downloadFile(url, zipPath, (pct) => setStatus({ progress: pct }));

      const AdmZip = (await import('adm-zip')).default;
      const zip = new AdmZip(zipPath);
      zip.extractAllTo(installDir, true);

      if (!fs.existsSync(binaryPath)) {
        throw new Error('ollama.exe not found after extracting zip');
      }
      return binaryPath;
    } catch (error) {
      bestEffortRemoveFile(binaryPath, 'Ollama binary');
      throw error;
    } finally {
      bestEffortRemoveFile(zipPath, 'Ollama zip');
    }
  }

  // macOS and Linux: download standalone binary directly
  try {
    await downloadFile(url, binaryPath, (pct) => setStatus({ progress: pct }));
    fs.chmodSync(binaryPath, 0o755);
    return binaryPath;
  } catch (error) {
    bestEffortRemoveFile(binaryPath, 'Ollama binary');
    throw error;
  }
}

async function isOllamaServerRunning(): Promise<boolean> {
  try {
    const res = await fetch('http://localhost:11434/api/tags', {
      signal: AbortSignal.timeout(2000),
    });
    return res.ok;
  } catch {
    return false;
  }
}

function startOllamaServer(binaryPath: string) {
  // Allow restart if the previous process has already exited
  if (ollamaProcess && ollamaProcess.exitCode === null) return;

  ollamaProcess = spawn(binaryPath, ['serve'], {
    detached: false,
    stdio: 'ignore',
    env: { ...process.env },
  });
  ollamaProcess.on('error', (err) => {
    console.error('[setup] Failed to start Ollama server:', err.message);
    ollamaProcess = null;
  });
  ollamaProcess.on('exit', () => {
    ollamaProcess = null;
  });
  process.on('exit', () => ollamaProcess?.kill());
}

async function waitForOllamaReady(timeoutMs = 60_000): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (await isOllamaServerRunning()) return;
    await new Promise((r) => setTimeout(r, 500));
  }
  throw new Error('Ollama server did not start within 60 seconds');
}

async function areModelsAvailable(): Promise<boolean> {
  try {
    const res = await fetch('http://localhost:11434/api/tags');
    if (!res.ok) return false;
    const data = (await res.json()) as { models: Array<{ name: string }> };
    const available = new Set(data.models.map((m) => m.name));
    return OLLAMA_MODELS.every((model) => available.has(model));
  } catch {
    return false;
  }
}

async function removeObsoleteModels(): Promise<void> {
  try {
    const res = await fetch('http://localhost:11434/api/tags');
    if (!res.ok) return;
    const data = (await res.json()) as { models: Array<{ name: string }> };
    const available = new Set(data.models.map((m) => m.name));
    
    for (const model of OLLAMA_OBSOLETE_MODELS) {
      if (available.has(model) || available.has(model + ':latest')) {
        await fetch('http://localhost:11434/api/delete', {
          method: 'DELETE',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ name: model }),
        }).catch(() => null);
      }
    }
  } catch {
    // Ignore errors during cleanup
  }
}

async function pullOllamaModels(): Promise<void> {
  for (const model of OLLAMA_MODELS) {
    setStatus({ step: 'pulling-model', progress: 0 });
    try {
      const res = await fetch('http://localhost:11434/api/pull', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: model }),
      });

      if (!res.ok || !res.body) {
        throw new Error(`Failed to pull ${model}: HTTP ${res.status}`);
      }

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() ?? '';

        for (const line of lines) {
          if (!line.trim()) continue;
          try {
            const obj = JSON.parse(line) as {
              status?: string;
              completed?: number;
              total?: number;
            };
            if (obj.total && obj.completed) {
              setStatus({ progress: Math.round((obj.completed / obj.total) * 100) });
            }
          } catch {
            // Ignore parse errors on partial streams
          }
        }
      }
    } catch (error) {
      throw new Error(`Failed pulling ${model}: ${formatErrorMessage(error)}`);
    }
  }
}

async function ensureWhisperModel(): Promise<void> {
  const { ensureAllModelsDownloaded } = await import('./whisper.js');
  setStatus({ step: 'downloading-whisper', progress: 0 });

  await ensureAllModelsDownloaded((modelIndex, total, status) => {
    const base = (modelIndex / total) * 100;
    const slice = (1 / total) * 100;
    const within = (status.progress / 100) * slice;
    setStatus({ step: 'downloading-whisper', progress: Math.round(base + within) });
  });
}

export async function runSetup(onProgress: (status: SetupStatus) => void): Promise<void> {
  if (setupRunning) return;
  setupRunning = true;

  try {
    setStatus({ step: 'detecting', progress: 0, error: null });
    onProgress(getSetupStatus());

    let binaryPath = resolveOllamaBinary();

    if (!binaryPath) {
      binaryPath = await downloadOllamaBinary();
    }
    onProgress(getSetupStatus());

    if (!(await isOllamaServerRunning())) {
      setStatus({ step: 'starting-ollama', progress: 0 });
      onProgress(getSetupStatus());
      startOllamaServer(binaryPath);
      await waitForOllamaReady();
    }
    onProgress(getSetupStatus());

    if (!(await areModelsAvailable())) {
      await removeObsoleteModels();
      await pullOllamaModels();
    }
    onProgress(getSetupStatus());

    await ensureWhisperModel();
    setStatus({ step: 'ready', progress: 100 });
    onProgress(getSetupStatus());
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    setStatus({ step: 'error', progress: 0, error: msg });
    onProgress(getSetupStatus());
    console.error('[setup] Failed:', msg);
  } finally {
    setupRunning = false;
  }
}

export function ensureOllamaRunning(): void {
  const binary = resolveOllamaBinary();
  if (!binary) return;
  void isOllamaServerRunning()
    .then((running) => {
      if (!running) startOllamaServer(binary);
    })
    .catch((error) => {
      console.error('[setup] Failed to ensure Ollama is running:', formatErrorMessage(error));
    });
}
