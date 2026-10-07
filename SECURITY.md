# Security policy

## Reporting a vulnerability

Please report security issues privately:

<https://github.com/mohcineelharras/barrier-free-meetings/security/advisories/new>

Do not open a public GitHub issue for an undisclosed vulnerability, and do
not include API keys, transcripts, or other private meeting content in the
report.

Include the version or commit, how you reproduced the issue, and the impact
you expect (data exposure, key theft, denial of service, and so on).

## Supported use

This app is a local-first meeting tool. The HTTP API on a machine you
control is not an authenticated multi-tenant service.

- Bind `HOST=127.0.0.1` unless you intend other devices to reach it.
- Do not put translation API keys on a server exposed with
  `CORS_ALLOWED_ORIGINS=*`. Production ignores that wildcard unless
  `ALLOW_WILDCARD_CORS=1`.
- `OLLAMA_HOST` must be an `http` or `https` URL. Cloud metadata addresses
  and embedded credentials are rejected.
- Transcripts and reports you send to OpenRouter, Google AI Studio, or
  MiniMax leave the machine. Offline Ollama does not.

## Dependency updates

Critical advisories are gated in CI with `npm audit --audit-level=critical`.
High findings that only exist in desktop packaging tools (`electron-builder`
and its tree) are tracked separately and are not part of the web server
runtime.
