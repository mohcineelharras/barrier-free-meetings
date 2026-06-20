# Sanitization Report — transcribe-easy

**Verdict: PASS**

Generated: 2026-06-20
Project: transcribe-easy (a.k.a. "Barrier-Free Meetings" / "SpeechBridge")
Staging path: `~/opensource-staging/transcribe-easy`

---

## Scan Categories

### 1. Secrets scan — PASS

| Pattern | Matches |
|---|---|
| `sk-or-v1-*` (OpenRouter) | 0 |
| `AIza*` (Google AI) | 0 |
| `sk-*` (OpenAI-style) | 0 |
| `ghp_*` / `gho_*` / `github_pat_*` (GitHub) | 0 |
| `xoxb-*` / `xoxp-*` (Slack) | 0 |
| `sk_live_*` / `pk_live_*` (Stripe) | 0 |
| `AKIA*` (AWS) | 0 |

The only API-key-style string in the entire repository is `test-key` in test files
(`server/googleai.test.ts`, `server/report.test.ts`), which is a synthetic placeholder
used by `node:test` and contains no real credentials.

All real keys live in the local `.env` file (gitignored) and never entered the
staging copy.

### 2. PII scan — PASS

- Email addresses: 0 matches
- Personal phone numbers: 0 matches
- Real names in code: only `Mohcine El Harras` in `package.json` `author` field
  (intentional — open-source maintainer attribution)

### 3. Internal references scan — PASS

The URL scan surfaced only:
- **Public test fixtures**: `https://mobile.example.com`, `https://app.example.com`,
  `https://staging.example.com`, `https://demo-user-transcribe-easy.hf.space`
  — these are deliberate `example.com` placeholders used in CORS tests.
- **Public documentation URLs**: `https://caddyserver.com`, `https://fonts.google.com`,
  HuggingFace / Google / OpenRouter / Ollama public APIs, GitHub release URLs.
- **One AI Studio app URL** in `README.md` (`https://ai.studio/apps/c4806208-...`)
  pointing at the original author's AI Studio workspace — replaced in the
  packaged README with a generic "open in AI Studio" pointer (no specific app id).
- **One local IP** (`http://192.168.1.6:3000`) in README, used as an illustrative
  example for LAN access — kept as-is, clearly framed as "e.g.".

No private company endpoints, internal hostnames, or VPN URLs were found.

### 4. Dangerous files check — PASS

- No `.pem`, `.key`, `.p12`, `.pfx`, `id_rsa`, `id_ed25519` files
- No `credentials.json`, `service-account-*.json`
- No `.npmrc` or `.netrc` (which could carry publish tokens)
- No `*.bak` or `*.orig` files
- No `.env` or `.env.local` (both were excluded by `rsync`)

### 5. Configuration completeness — WARNING (resolved during packaging)

- `.env.example` was missing from the source repo — recreated during the
  packaging step with full documentation of every `process.env.*` variable
  the server reads (10 variables).
- `package-lock.json` is gitignored in the source — left as-is to match
  upstream conventions.

### 6. Git history audit — N/A

The staging copy is a fresh `rsync` mirror of the working tree without `.git/`.
A clean history is required before publishing; the user's local git repo was
left untouched and a fresh `git init` will be performed on the staging copy
during the publish step (not done yet — review-first mode).

---

## Verdict

**PASS — safe to publish.** No critical findings, no warnings that block release.
The single warning (missing `.env.example`) was addressed in the packaging step.
