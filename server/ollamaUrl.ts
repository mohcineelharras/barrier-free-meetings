/**
 * Resolve the Ollama HTTP base URL from the environment.
 * Accepts host:port or a full http(s) URL.
 */
export function getOllamaBaseUrl(env: NodeJS.ProcessEnv = process.env): string {
  const host = env.OLLAMA_HOST?.trim();
  if (!host) return 'http://127.0.0.1:11434';
  return host.startsWith('http') ? host : `http://${host}`;
}
