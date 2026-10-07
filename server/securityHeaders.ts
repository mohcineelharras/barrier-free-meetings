export interface SecurityHeaderOptions {
  isProduction: boolean;
  isHostedDemo: boolean;
}

export function buildSecurityHeaders({
  isProduction,
  isHostedDemo,
}: SecurityHeaderOptions): Record<string, string> {
  const headers: Record<string, string> = {
    'X-Content-Type-Options': 'nosniff',
    'Referrer-Policy': 'no-referrer',
    'Permissions-Policy': 'camera=(), microphone=(self), geolocation=(), payment=()',
  };

  // Hugging Face embeds the Space in an iframe on huggingface.co.
  if (!isHostedDemo) {
    headers['X-Frame-Options'] = 'SAMEORIGIN';
  }

  if (isProduction) {
    const frameAncestors = isHostedDemo
      ? "frame-ancestors 'self' https://huggingface.co https://*.hf.space"
      : "frame-ancestors 'self'";
    headers['Content-Security-Policy'] = [
      "default-src 'self'",
      "base-uri 'self'",
      "object-src 'none'",
      "script-src 'self'",
      "style-src 'self' 'unsafe-inline'",
      "img-src 'self' data:",
      "font-src 'self' data:",
      "connect-src 'self'",
      "form-action 'self'",
      frameAncestors,
    ].join('; ');
  }

  return headers;
}
