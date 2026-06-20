# Hugging Face Whisper Tiny And Curated Models Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Keep the Hugging Face demo pinned to backend `Whisper tiny`, reuse the app’s existing segmented-control sidebar patterns instead of adding a new Whisper model system there, and make the OpenRouter dropdown reflect only the curated low-latency fallback models.

**Architecture:** Preserve the current browser-speech-first plus backend-Whisper-fallback architecture. Add only a narrow hosted-demo UI explanation for the fixed `Whisper tiny` fallback, and move model curation to the server-side model list so the existing online model dropdown naturally shows only supported live-safe choices.

**Tech Stack:** TypeScript, React, Express, Node test runner, shared runtime config, existing sidebar component patterns.

---

### Task 1: Lock curated OpenRouter model behavior at the server boundary

**Files:**
- Modify: `server/models.ts`
- Modify: `server/translate.ts`
- Modify: `server/models.test.ts`
- Modify: `server/translate.test.ts`

- [ ] **Step 1: Write the failing tests**

Add tests that make the OpenRouter model list and translation fallback shortlist match the curated low-latency set:

```ts
test('fetchFreeModels returns only curated live-safe OpenRouter models in configured order', async () => {
  // Arrange an OpenRouter payload that mixes curated and excluded models
  // Assert only the curated shortlist remains and ordering matches the app policy.
});

test('fast free translation models stay ordered by benchmarked live responsiveness', () => {
  assert.deepEqual([...OPENROUTER_FAST_FREE_TRANSLATION_MODELS], [
    'nvidia/nemotron-3-nano-30b-a3b:free',
    'liquid/lfm-2.5-1.2b-instruct:free',
    'z-ai/glm-4.5-air:free',
    'poolside/laguna-m.1:free',
  ]);
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `node --test --import tsx server/models.test.ts server/translate.test.ts`
Expected: FAIL because `fetchFreeModels()` still exposes the broad free-model inventory and/or the fallback list order is not yet fully enforced at the model list endpoint.

- [ ] **Step 3: Write minimal implementation**

Update `server/models.ts` so OpenRouter model discovery filters down to the same curated shortlist used by translation fallback routing, while preserving readable labels:

```ts
const CURATED_OPENROUTER_MODELS = [
  'nvidia/nemotron-3-nano-30b-a3b:free',
  'liquid/lfm-2.5-1.2b-instruct:free',
  'z-ai/glm-4.5-air:free',
  'poolside/laguna-m.1:free',
] as const;

export async function fetchFreeModels(): Promise<FreeModel[]> {
  const response = await fetch('https://openrouter.ai/api/v1/models');
  // existing error handling…

  const available = new Map(
    data.data
      .filter((m) => m.pricing.prompt === '0' && m.pricing.completion === '0')
      .map((m) => [m.id, { id: m.id, name: m.name }]),
  );

  return CURATED_OPENROUTER_MODELS
    .map((id) => available.get(id))
    .filter((model): model is FreeModel => Boolean(model));
}
```

Keep `server/translate.ts` aligned with the same shortlist order so the dropdown and actual fallback path do not drift.

- [ ] **Step 4: Run tests to verify they pass**

Run: `node --test --import tsx server/models.test.ts server/translate.test.ts`
Expected: PASS

### Task 2: Add a minimal Hugging Face “Whisper tiny” explanation using existing sidebar patterns

**Files:**
- Modify: `src/components/Sidebar.tsx`
- Modify: `src/App.test.tsx`
- Modify: `src/config/transcriptionSupport.test.ts`

- [ ] **Step 1: Write the failing tests**

Add rendering coverage that expects the hosted demo sidebar to explain the fixed backend fallback without introducing a new general-purpose Whisper model selector:

```ts
test('hosted demo sidebar explains that backend fallback is fixed to Whisper tiny', () => {
  const html = renderToStaticMarkup(<App />);
  assert.match(html, /Whisper tiny/);
  assert.doesNotMatch(html, /tiny.*base.*small/);
});
```

Also add or extend a runtime/transcription-support test to ensure hosted demos still expose remote Whisper availability while remaining pinned to the hosted-safe path.

- [ ] **Step 2: Run tests to verify they fail**

Run: `node --test --import tsx src/App.test.tsx src/config/transcriptionSupport.test.ts`
Expected: FAIL because the sidebar does not yet explain the fixed hosted `Whisper tiny` fallback.

- [ ] **Step 3: Write minimal implementation**

Reuse the existing sidebar vocabulary instead of adding a new model picker:

```tsx
{runtimeConfig.isHostedDemo && (
  <Section label="Transcription Backend">
    <div className="flex rounded-lg overflow-hidden border border-gray-200 dark:border-gray-700 text-xs font-semibold">
      <button
        type="button"
        className="flex-1 py-1.5 bg-blue-600 text-white"
        disabled
      >
        Whisper tiny
      </button>
    </div>
    <p className="text-xs text-gray-400 dark:text-gray-600">
      Hosted demo mode keeps backend fallback on Whisper tiny for faster startup and lighter CPU use.
    </p>
  </Section>
)}
```

Important constraints:
- Do not create a general `tiny/base/small` selector for the Hugging Face demo.
- Do not duplicate the existing “Audio Input” or `Online / Offline` logic.
- Keep the control visually consistent with the current segmented buttons.

- [ ] **Step 4: Run tests to verify they pass**

Run: `node --test --import tsx src/App.test.tsx src/config/transcriptionSupport.test.ts`
Expected: PASS

### Task 3: Make the online OpenRouter dropdown naturally reflect the curated shortlist

**Files:**
- Modify: `src/components/Sidebar.tsx`
- Modify: `src/hooks/useModels.ts` (only if error/empty states need adjustment)
- Modify: `src/App.test.tsx`

- [ ] **Step 1: Write the failing test**

Add a render-level assertion that the online model section remains a normal dropdown surface and does not expose copy or controls that imply unsupported free-model exploration:

```ts
test('online model picker stays a simple dropdown for curated live-safe models', () => {
  const html = renderToStaticMarkup(<App />);
  assert.match(html, /Model/);
  assert.doesNotMatch(html, /Show all free models/);
});
```

- [ ] **Step 2: Run test to verify it fails only if new UI drift exists**

Run: `node --test --import tsx src/App.test.tsx`
Expected: PASS or targeted FAIL depending on whether the sidebar copy needs tightening after Task 2.

- [ ] **Step 3: Write minimal implementation**

If needed, tighten only the model-section helper copy so it matches the curated behavior. Do not add advanced toggles or a second model browser.

```tsx
{!isLoading && !error && models.length === 0 && (
  <p className="text-xs text-gray-500 dark:text-gray-400">
    No live-safe free models are available right now.
  </p>
)}
```

- [ ] **Step 4: Run tests to verify it passes**

Run: `node --test --import tsx src/App.test.tsx`
Expected: PASS

### Task 4: Verify the integrated behavior and document tradeoffs

**Files:**
- Modify: `docs/huggingface-spaces.md`
- Modify: `README.md`
- Modify: `package.json` only if a new test file is added

- [ ] **Step 1: Write the failing documentation-aware assertions if needed**

If the repo already codifies hosted demo expectations in tests, extend them. Otherwise proceed directly to docs implementation.

- [ ] **Step 2: Write minimal documentation updates**

Document that:
- Hugging Face demo backend fallback stays pinned to `Whisper tiny`
- OpenRouter live translation choices are intentionally curated for responsiveness
- Browser speech remains the first-choice path when available

Suggested doc lines:

```md
- Hosted demo fallback stays pinned to multilingual Whisper `tiny`.
- The OpenRouter model picker is intentionally limited to a low-latency curated shortlist for live use.
```

- [ ] **Step 3: Run scoped verification**

Run: `npm run lint`
Expected: PASS

Run: `node --test --import tsx server/models.test.ts server/translate.test.ts src/config/transcriptionSupport.test.ts src/App.test.tsx`
Expected: PASS

- [ ] **Step 4: Run the full test command and report baseline reality**

Run: `npm run test`
Expected: Existing unrelated failures may still remain in `server/offline-stt/transformersWhisperCache.test.ts`; the touched tests for model curation and hosted demo copy should pass.

- [ ] **Step 5: Commit**

Commit only the curated-model and hosted-demo Whisper tiny changes with a focused message, for example:

```bash
git add server/models.ts server/models.test.ts server/translate.ts server/translate.test.ts src/components/Sidebar.tsx src/App.test.tsx src/config/transcriptionSupport.test.ts docs/huggingface-spaces.md README.md
git commit -m "feat: pin hosted whisper tiny and curate live models"
```
