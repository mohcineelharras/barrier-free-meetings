import { useState, useEffect, useCallback } from 'react';

import {
  buildApiUrl,
  MOBILE_BACKEND_CONFIG_MESSAGE,
  type RuntimeConfig,
} from '../config/runtime';

export interface Model {
  id: string;
  name: string;
}

export function useModels(provider = 'openrouter', runtimeConfig?: RuntimeConfig) {
  const [models, setModels] = useState<Model[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [refetchIndex, setRefetchIndex] = useState(0);

  const refetch = useCallback(() => setRefetchIndex((i) => i + 1), []);

  useEffect(() => {
    const endpoint = buildApiUrl(`/api/models?provider=${encodeURIComponent(provider)}`, runtimeConfig);
    if (!endpoint) {
      setModels([]);
      setError(MOBILE_BACKEND_CONFIG_MESSAGE);
      setIsLoading(false);
      return;
    }

    const controller = new AbortController();
    let isCurrent = true;

    setIsLoading(true);
    setError(null);
    setModels([]);

    fetch(endpoint, {
      signal: controller.signal,
    })
      .then(async (res) => {
        if (!res.ok) {
          const body = (await res.json().catch(() => ({}))) as { error?: string };
          throw new Error(body.error ?? 'Failed to load models');
        }
        return res.json() as Promise<Model[]>;
      })
      .then((nextModels) => {
        if (!isCurrent) return;
        setModels(nextModels);
      })
      .catch((err: unknown) => {
        if (!isCurrent || (err instanceof Error && err.name === 'AbortError')) return;
        setError(err instanceof Error ? err.message : 'Unknown error');
      })
      .finally(() => {
        if (!isCurrent) return;
        setIsLoading(false);
      });

    return () => {
      isCurrent = false;
      controller.abort();
    };
  }, [provider, runtimeConfig?.apiBaseUrl, runtimeConfig?.isNativeApp, runtimeConfig?.wsBaseUrl, refetchIndex]);

  return { models, isLoading, error, refetch };
}
