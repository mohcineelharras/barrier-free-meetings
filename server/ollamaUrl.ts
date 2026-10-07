/**
 * Resolve the Ollama HTTP base URL from the environment.
 * Accepts host:port or a full http(s) URL.
 * Rejects non-HTTP schemes, embedded credentials, and cloud-metadata addresses.
 */
export class OllamaUrlError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'OllamaUrlError';
  }
}

const BLOCKED_HOSTNAMES = new Set([
  'metadata.google.internal',
  'metadata.goog',
]);

function isBlockedHostname(hostname: string): boolean {
  const normalized = hostname.replace(/^\[|\]$/g, '').toLowerCase();
  if (BLOCKED_HOSTNAMES.has(normalized) || normalized.endsWith('.metadata.google.internal')) {
    return true;
  }

  if (normalized.startsWith('fe80:') || normalized.startsWith('fd00:ec2::')) {
    return true;
  }

  const ipv4 = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.exec(normalized);
  if (!ipv4) {
    return false;
  }

  const parts = ipv4.slice(1).map((part) => Number(part));
  if (parts.some((part) => part > 255)) {
    return true;
  }

  const [first, second] = parts;
  // 169.254.0.0/16 is link-local, including the cloud metadata address.
  // 0.0.0.0/8 is "this network" and is not a usable Ollama host.
  return first === 0 || (first === 169 && second === 254);
}

export function getOllamaBaseUrl(env: NodeJS.ProcessEnv = process.env): string {
  const host = env.OLLAMA_HOST?.trim();
  if (!host) return 'http://127.0.0.1:11434';

  if (host.includes('://') && !/^https?:\/\//i.test(host)) {
    throw new OllamaUrlError('OLLAMA_HOST must use http or https.');
  }

  const withProtocol = /^https?:\/\//i.test(host) ? host : `http://${host}`;
  let url: URL;
  try {
    url = new URL(withProtocol);
  } catch {
    throw new OllamaUrlError('OLLAMA_HOST is not a valid URL.');
  }

  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    throw new OllamaUrlError('OLLAMA_HOST must use http or https.');
  }

  if (url.username || url.password) {
    throw new OllamaUrlError('OLLAMA_HOST must not include credentials.');
  }

  if (isBlockedHostname(url.hostname)) {
    throw new OllamaUrlError('OLLAMA_HOST points at a blocked address.');
  }

  return `${url.protocol}//${url.host}`;
}
