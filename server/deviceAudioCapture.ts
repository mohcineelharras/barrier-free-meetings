import { spawn, type ChildProcess } from 'node:child_process';
import { platform } from 'node:os';
import { execFile } from 'node:child_process';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

export interface DeviceAudioCaptureOptions {
  onChunk: (chunk: Buffer) => void;
  onError: (message: string) => void;
  onEnd: () => void;
  sampleRate?: number;
  device?: string;
}

export interface DeviceAudioCapture {
  start(): Promise<void>;
  stop(): void;
  isActive(): boolean;
}

export interface DeviceAudioStatus {
  available: boolean;
  reason?: string;
  platform: string;
  ffmpegFound: boolean;
  devices?: Array<{ name: string; index: number }>;
}

const SAMPLE_RATE = 16_000;

function promisifyExecFile(
  file: string,
  args: string[],
  options?: { timeout?: number; encoding?: BufferEncoding },
): Promise<{ stdout: string; stderr: string; exitCode: number | null }> {
  return new Promise((resolve) => {
    execFile(file, args, options ?? {}, (error, stdout, stderr) => {
      // FFmpeg -list_devices exits with error code but still outputs device list to stderr
      const exitCode = error?.code !== undefined && typeof error.code === 'number' ? error.code : 0;
      resolve({ stdout: stdout ?? '', stderr: stderr ?? '', exitCode });
    });
  });
}

export async function isFFmpegAvailable(): Promise<boolean> {
  try {
    await promisifyExecFile('ffmpeg', ['-version'], { timeout: 5000 });
    return true;
  } catch {
    return false;
  }
}

function getPlatform(): string {
  return platform();
}

export async function listAudioDevices(): Promise<Array<{ name: string; index: number }>> {
  const os = getPlatform();
  const devices: Array<{ name: string; index: number }> = [];

  if (os === 'darwin') {
    try {
      const { stderr } = await promisifyExecFile(
        'ffmpeg',
        ['-f', 'avfoundation', '-list_devices', 'true', '-i', ''],
        { timeout: 10000 },
      );
      const lines = stderr.split('\n');
      let inAudioSection = false;
      for (const line of lines) {
        if (line.includes('AVFoundation audio devices:')) {
          inAudioSection = true;
          continue;
        }
        if (line.includes('AVFoundation video devices:')) {
          inAudioSection = false;
          continue;
        }
        if (inAudioSection) {
          const match = line.match(/\[(\d+)\]\s+(.+)/);
          if (match) {
            devices.push({ name: match[2].trim(), index: parseInt(match[1], 10) });
          }
        }
      }
    } catch {
      // ignore
    }
  } else if (os === 'win32') {
    try {
      const { stderr } = await promisifyExecFile(
        'ffmpeg',
        ['-f', 'dshow', '-list_devices', 'true', '-i', ''],
        { timeout: 10000 },
      );
      const lines = stderr.split('\n');
      for (const line of lines) {
        const match = line.match(/"([^"]+)"\s*$/);
        if (match && line.includes('audio=')) {
          devices.push({ name: match[1], index: devices.length });
        }
      }
    } catch {
      // ignore
    }
  } else if (os === 'linux') {
    try {
      const { stdout } = await promisifyExecFile(
        'pactl',
        ['list', 'sources', 'short'],
        { timeout: 5000 },
      );
      const lines = stdout.split('\n');
      for (const line of lines) {
        const parts = line.trim().split(/\s+/);
        if (parts.length >= 2) {
          devices.push({ name: parts[1], index: parseInt(parts[0], 10) });
        }
      }
    } catch {
      // ignore
    }
  }

  return devices;
}

function findBestDevice(devices: Array<{ name: string; index: number }>): string | null {
  const os = getPlatform();

  if (os === 'darwin') {
    // Look for BlackHole or Soundflower (virtual audio loopback devices)
    const virtualDevice = devices.find(
      (d) =>
        d.name.toLowerCase().includes('blackhole') ||
        d.name.toLowerCase().includes('soundflower'),
    );
    if (virtualDevice) {
      return `:${virtualDevice.index}`;
    }
    // Do NOT fall back to microphone — it won't capture system audio
    return null;
  }

  if (os === 'win32') {
    // Look for Stereo Mix (loopback capture)
    const stereoMix = devices.find((d) => d.name.toLowerCase().includes('stereo mix'));
    if (stereoMix) {
      return `audio=${stereoMix.name}`;
    }
    // Look for WASAPI output devices (loopback)
    const wasapiDevice = devices.find((d) => d.name.toLowerCase().includes('wasapi'));
    if (wasapiDevice) {
      return `audio=${wasapiDevice.name}`;
    }
    // Fall back to first device
    if (devices.length > 0) {
      return `audio=${devices[0].name}`;
    }
  }

  if (os === 'linux') {
    // Look for monitor sources (loopback)
    const monitor = devices.find((d) => d.name.toLowerCase().includes('.monitor'));
    if (monitor) {
      return monitor.name;
    }
    // Fall back to default
    return 'default';
  }

  return null;
}

export async function getDeviceAudioStatus(): Promise<DeviceAudioStatus> {
  const os = getPlatform();
  const ffmpegFound = await isFFmpegAvailable();

  if (os === 'darwin') {
    // On macOS, prefer the Swift ScreenCaptureKit helper (no virtual driver needed)
    const swiftHelper = getSwiftHelperPath();
    if (swiftHelper) {
      return {
        available: true,
        platform: os,
        ffmpegFound: ffmpegFound,
        devices: [],
      };
    }

    // No Swift helper — check for virtual audio devices as fallback
    if (!ffmpegFound) {
      return {
        available: false,
        reason: 'System audio capture requires FFmpeg or the Swift helper. Install FFmpeg (brew install ffmpeg) or compile the Swift helper.',
        platform: os,
        ffmpegFound: false,
      };
    }

    const devices = await listAudioDevices();
    const hasVirtualDevice = devices.some(
      (d) =>
        d.name.toLowerCase().includes('blackhole') ||
        d.name.toLowerCase().includes('soundflower'),
    );
    if (!hasVirtualDevice) {
      return {
        available: false,
        reason:
          'System audio capture on macOS requires a virtual audio driver. Install BlackHole 2ch: brew install blackhole-2ch',
        platform: os,
        ffmpegFound: true,
        devices,
      };
    }

    return {
      available: true,
      platform: os,
      ffmpegFound: true,
      devices,
    };
  }

  if (!ffmpegFound) {
    return {
      available: false,
      reason: 'FFmpeg is not installed. Install it to enable device audio capture.',
      platform: os,
      ffmpegFound: false,
    };
  }

  const devices = await listAudioDevices();

  if (os === 'win32') {
    const hasLoopback = devices.some(
      (d) =>
        d.name.toLowerCase().includes('stereo mix') ||
        d.name.toLowerCase().includes('what u hear'),
    );
    if (!hasLoopback) {
      return {
        available: false,
        reason:
          'No loopback audio device found. Enable "Stereo Mix" in Windows Sound settings or install a virtual audio cable.',
        platform: os,
        ffmpegFound: true,
        devices,
      };
    }
  }

  return {
    available: true,
    platform: os,
    ffmpegFound: true,
    devices,
  };
}

function getFFmpegArgs(device: string | null, sampleRate: number): string[] {
  const os = getPlatform();

  if (os === 'darwin') {
    return [
      '-f',
      'avfoundation',
      '-i',
      device ?? ':0',
      '-ar',
      String(sampleRate),
      '-ac',
      '1',
      '-f',
      'f32le',
      '-loglevel',
      'error',
      'pipe:1',
    ];
  }

  if (os === 'win32') {
    return [
      '-f',
      'dshow',
      '-i',
      device ?? 'audio=Stereo Mix',
      '-ar',
      String(sampleRate),
      '-ac',
      '1',
      '-f',
      'f32le',
      '-loglevel',
      'error',
      'pipe:1',
    ];
  }

  if (os === 'linux') {
    return [
      '-f',
      'pulse',
      '-i',
      device ?? 'default',
      '-ar',
      String(sampleRate),
      '-ac',
      '1',
      '-f',
      'f32le',
      '-loglevel',
      'error',
      'pipe:1',
    ];
  }

  throw new Error(`System audio capture is not supported on ${os}`);
}

function getSwiftHelperPath(): string | null {
  const os = getPlatform();
  if (os !== 'darwin') return null;

  // Resolve relative to this module's directory
  const moduleDir = path.dirname(fileURLToPath(import.meta.url));
  const possiblePaths = [
    path.resolve(moduleDir, '..', 'scripts', 'captureSystemAudio'),
    path.resolve(moduleDir, '..', 'scripts', 'captureSystemAudio.swift'),
    path.resolve(process.cwd(), 'scripts', 'captureSystemAudio'),
    path.resolve(process.cwd(), 'scripts', 'captureSystemAudio.swift'),
    './scripts/captureSystemAudio',
  ];

  for (const p of possiblePaths) {
    if (existsSync(p)) {
      return p;
    }
  }

  return null;
}

function createSwiftAudioCapture(options: DeviceAudioCaptureOptions): DeviceAudioCapture | null {
  const helperPath = getSwiftHelperPath();
  if (!helperPath) return null;

  let process: ChildProcess | null = null;
  let active = false;

  return {
    async start(): Promise<void> {
      if (active) return;

      console.log('[audio] starting swift helper:', helperPath);
      process = spawn(helperPath, [], { stdio: ['ignore', 'pipe', 'pipe'] });
      active = true;

      process.stdout!.on('data', (chunk: Buffer) => {
        if (!active) return;
        options.onChunk(chunk);
      });

      process.stderr!.on('data', (data: Buffer) => {
        const msg = data.toString().trim();
        if (msg) {
          console.error('[audio] swift:', msg);
        }
      });

      process.on('close', (code) => {
        active = false;
        process = null;
        if (code !== 0 && code !== null) {
          options.onError(`Swift helper exited with code ${code}. If you see a permission error, grant Screen Recording permission in System Settings > Privacy & Security > Screen Recording for your terminal app.`);
        }
        options.onEnd();
      });

      process.on('error', (err) => {
        active = false;
        process = null;
        options.onError(`Failed to start Swift helper: ${err.message}`);
      });
    },

    stop(): void {
      if (process && active) {
        process.kill('SIGTERM');
        active = false;
      }
    },

    isActive(): boolean {
      return active;
    },
  };
}

export function createDeviceAudioCapture(options: DeviceAudioCaptureOptions): DeviceAudioCapture {
  const os = getPlatform();

  // On macOS, prefer the Swift ScreenCaptureKit helper (no virtual driver needed)
  if (os === 'darwin') {
    const swiftCapture = createSwiftAudioCapture(options);
    if (swiftCapture) {
      return swiftCapture;
    }
    console.log('[audio] swift helper not found, falling back to ffmpeg');
  }

  // Fallback to FFmpeg-based capture
  let process: ChildProcess | null = null;
  let active = false;
  const sampleRate = options.sampleRate ?? SAMPLE_RATE;

  return {
    async start(): Promise<void> {
      if (active) return;

      const devices = await listAudioDevices();
      const device = findBestDevice(devices);

      if (!device) {
        throw new Error(
          'No suitable audio capture device found. ' +
          (os === 'darwin'
            ? 'Install BlackHole 2ch (brew install blackhole-2ch) or ensure the Swift helper is compiled.'
            : 'Enable "Stereo Mix" in sound settings or install a virtual audio cable.'),
        );
      }

      const args = getFFmpegArgs(device, sampleRate);

      process = spawn('ffmpeg', args, { stdio: ['ignore', 'pipe', 'pipe'] });
      active = true;

      process.stdout!.on('data', (chunk: Buffer) => {
        if (!active) return;
        options.onChunk(chunk);
      });

      process.stderr!.on('data', (data: Buffer) => {
        const msg = data.toString().trim();
        if (msg) {
          console.error('[audio] ffmpeg:', msg);
        }
      });

      process.on('close', (code) => {
        active = false;
        process = null;
        if (code !== 0 && code !== null) {
          options.onError(`FFmpeg exited with code ${code}`);
        }
        options.onEnd();
      });

      process.on('error', (err) => {
        active = false;
        process = null;
        options.onError(`Failed to start FFmpeg: ${err.message}`);
      });
    },

    stop(): void {
      if (process && active) {
        process.kill('SIGTERM');
        active = false;
      }
    },

    isActive(): boolean {
      return active;
    },
  };
}
