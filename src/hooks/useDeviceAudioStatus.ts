import { useState, useEffect } from 'react';
import { buildApiUrl, type RuntimeConfig } from '../config/runtime';

export interface DeviceAudioStatus {
  available: boolean;
  reason?: string;
  platform: string;
  ffmpegFound: boolean;
  devices?: Array<{ name: string; index: number }>;
}

export function useDeviceAudioStatus(runtimeConfig: RuntimeConfig) {
  const [status, setStatus] = useState<DeviceAudioStatus | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;

    async function check() {
      try {
        const res = await fetch(buildApiUrl('/api/device-audio/status', runtimeConfig));
        if (!res.ok) {
          throw new Error(`HTTP ${res.status}`);
        }
        const data = (await res.json()) as DeviceAudioStatus;
        if (!cancelled) {
          setStatus(data);
        }
      } catch {
        if (!cancelled) {
          setStatus({
            available: false,
            reason: 'Could not reach the backend to check device audio support.',
            platform: 'unknown',
            ffmpegFound: false,
          });
        }
      } finally {
        if (!cancelled) {
          setIsLoading(false);
        }
      }
    }

    check();
    return () => {
      cancelled = true;
    };
  }, [runtimeConfig]);

  return { status, isLoading };
}
