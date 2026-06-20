# SpeechBridge Landing Page Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the current barebones app shell with a launch-ready `SpeechBridge` landing page that communicates the product clearly, feels premium, and includes a polished in-page demo experience anchored to `Try the Demo`.

**Architecture:** Keep the implementation in the existing React + Vite app, but split the page into focused landing components plus one small demo-timeline helper for motion state. Preserve a simple top-level `App` composition, move reusable copy into a content module, and centralize the visual system in `src/index.css` with brand-aware tokens and reduced-motion support.

**Tech Stack:** React 19, TypeScript, Vite, Tailwind CSS v4, `motion`, Node built-in test runner, `react-dom/server`

---

## File Structure

### Create

- `src/content/landingContent.ts`
  Responsibility: Structured copy and data for hero, problem points, features, trust signals, use cases, and demo transcript scenarios.
- `src/components/landing/demoTimeline.ts`
  Responsibility: Pure helper that expands transcript demo lines into timed animation state the UI can consume.
- `src/components/landing/LiveDemoFrame.tsx`
  Responsibility: Product-preview section with scenario switching and animated transcript / translation rendering.
- `src/components/landing/HeroSection.tsx`
  Responsibility: Hero copy, CTA, proof line, and intro composition around the demo frame.
- `src/components/landing/StorySection.tsx`
  Responsibility: Problem, solution, and feature-story rendering with consistent section scaffolding.
- `src/components/landing/TrustSection.tsx`
  Responsibility: Use-case coverage, trust signals, and final CTA band.
- `src/App.test.tsx`
  Responsibility: Render-level landing-page smoke test and demo helper test coverage.

### Modify

- `src/App.tsx`
  Responsibility: Compose the landing page from the new focused sections and remove the old utility-style recorder layout.
- `src/index.css`
  Responsibility: Global theme tokens, imported fonts, dark visual field, spacing rhythm, motion-aware utility styles, and accessibility-safe defaults.
- `package.json`
  Responsibility: Include the new landing page test file in the existing `npm test` command.

---

### Task 1: Add a landing-page test seam before changing UI

**Files:**
- Create: `src/App.test.tsx`
- Modify: `package.json`
- Test: `src/App.test.tsx`

- [ ] **Step 1: Write the failing render test**

```tsx
import test from 'node:test';
import assert from 'node:assert/strict';
import { renderToStaticMarkup } from 'react-dom/server';
import App from './App';

test('App renders the SpeechBridge landing page structure', () => {
  const html = renderToStaticMarkup(<App />);

  assert.match(html, /SpeechBridge/);
  assert.match(html, /Understand live speech before the moment passes\./);
  assert.match(html, /Try the Demo/);
  assert.match(html, /Catch the moment live/);
  assert.match(html, /See meaning instantly/);
  assert.match(html, /Stay focused under pressure/);
  assert.match(html, /id="demo"/);
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `node --test --import tsx src/App.test.tsx`

Expected: FAIL because the current `App` still renders the old recorder UI and does not contain the landing-page copy or `demo` anchor.

- [ ] **Step 3: Update the test script to include the new test file**

```json
{
  "scripts": {
    "test": "node --test --import tsx server/translate.test.ts src/hooks/speechRecognitionController.test.ts src/App.test.tsx"
  }
}
```

- [ ] **Step 4: Run the full test command and confirm the new assertion is the only failure**

Run: `npm test`

Expected: existing server and hook tests pass, and `src/App.test.tsx` fails on missing landing-page content.

- [ ] **Step 5: Commit the red test state setup**

```bash
git add package.json src/App.test.tsx
git commit -m "test: add SpeechBridge landing page render coverage"
```

---

### Task 2: Add content and the demo-timeline helper with real TDD coverage

**Files:**
- Create: `src/content/landingContent.ts`
- Create: `src/components/landing/demoTimeline.ts`
- Modify: `src/App.test.tsx`
- Test: `src/App.test.tsx`

- [ ] **Step 1: Extend the test file with a failing helper test**

```tsx
import { buildDemoTimeline } from './components/landing/demoTimeline';

test('buildDemoTimeline assigns increasing delays and translation states', () => {
  const timeline = buildDemoTimeline([
    { original: 'Ni hao', translated: 'Bonjour' },
    { original: 'Xie xie', translated: 'Merci' },
  ]);

  assert.equal(timeline.length, 2);
  assert.deepEqual(
    timeline.map((item) => item.delayMs),
    [0, 900],
  );
  assert.equal(timeline[0]?.translated, 'Bonjour');
  assert.equal(timeline[1]?.translated, 'Merci');
});
```

- [ ] **Step 2: Run the targeted test to verify it fails**

Run: `node --test --import tsx src/App.test.tsx`

Expected: FAIL with module-not-found or missing export errors for `buildDemoTimeline`.

- [ ] **Step 3: Create the landing content module**

```ts
export const landingContent = {
  hero: {
    eyebrow: 'LIVE SPEECH TRANSLATION',
    title: 'Understand live speech before the moment passes.',
    description:
      'SpeechBridge turns spoken language into clear, real-time translation so conversations stay fluid, fast, and fully understood.',
    ctaLabel: 'Try the Demo',
    proof: 'Structured. Fast. Calm under pressure.',
  },
  features: [
    {
      title: 'Catch the moment live',
      body: 'Capture speech as it happens so important meaning does not disappear into memory.',
    },
    {
      title: 'See meaning instantly',
      body: 'Watch translation resolve in a readable second language without breaking the flow.',
    },
    {
      title: 'Keep the conversation usable',
      body: 'Export structured transcript history for review, sharing, and follow-up.',
    },
    {
      title: 'Stay focused under pressure',
      body: 'Work inside a calm bilingual interface built for speed, clarity, and attention.',
    },
  ],
  demoScenarios: [
    {
      id: 'meeting',
      label: 'Meeting',
      lines: [
        { original: '欢迎来到今天的会议。', translated: "Bienvenue a la reunion d'aujourd'hui." },
        { original: '我们先讨论发布时间。', translated: "Commencons par discuter de la date de lancement." },
        { original: '之后我会分享下一步。', translated: 'Ensuite, je partagerai les prochaines etapes.' },
      ],
    },
  ],
} as const;
```

- [ ] **Step 4: Create the demo timeline helper with the minimum implementation**

```ts
export interface DemoLine {
  original: string;
  translated: string;
}

export interface DemoTimelineItem extends DemoLine {
  delayMs: number;
}

export function buildDemoTimeline(lines: DemoLine[]): DemoTimelineItem[] {
  return lines.map((line, index) => ({
    ...line,
    delayMs: index * 900,
  }));
}
```

- [ ] **Step 5: Run the targeted test to verify the helper now passes**

Run: `node --test --import tsx src/App.test.tsx`

Expected: the helper test passes while the landing-page render test still fails because the new UI has not been implemented yet.

- [ ] **Step 6: Commit the content and helper foundation**

```bash
git add src/content/landingContent.ts src/components/landing/demoTimeline.ts src/App.test.tsx
git commit -m "feat: add landing page content and demo timeline helper"
```

---

### Task 3: Build the landing sections and make the render test pass

**Files:**
- Create: `src/components/landing/HeroSection.tsx`
- Create: `src/components/landing/LiveDemoFrame.tsx`
- Create: `src/components/landing/StorySection.tsx`
- Create: `src/components/landing/TrustSection.tsx`
- Modify: `src/App.tsx`
- Modify: `src/App.test.tsx`
- Test: `src/App.test.tsx`

- [ ] **Step 1: Add one more failing assertion for the trust section**

```tsx
test('App renders the trust section and final CTA', () => {
  const html = renderToStaticMarkup(<App />);

  assert.match(html, /Built for meetings, interviews, travel, classrooms, and multilingual daily life\./);
  assert.match(html, /Start hearing the whole conversation\./);
});
```

- [ ] **Step 2: Run the targeted test and verify it fails on missing content**

Run: `node --test --import tsx src/App.test.tsx`

Expected: FAIL because the current `App` still does not render the landing page.

- [ ] **Step 3: Create the hero section**

```tsx
import { motion } from 'motion/react';
import { landingContent } from '../../content/landingContent';

interface HeroSectionProps {
  demo: React.ReactNode;
}

export function HeroSection({ demo }: HeroSectionProps) {
  return (
    <section className="hero-shell">
      <div className="hero-copy">
        <p className="hero-eyebrow">{landingContent.hero.eyebrow}</p>
        <motion.h1 className="hero-title" initial={{ opacity: 0, y: 24 }} animate={{ opacity: 1, y: 0 }}>
          {landingContent.hero.title}
        </motion.h1>
        <motion.p className="hero-body" initial={{ opacity: 0, y: 28 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.08 }}>
          {landingContent.hero.description}
        </motion.p>
        <motion.div className="hero-actions" initial={{ opacity: 0, y: 28 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.16 }}>
          <a className="primary-cta" href="#demo">{landingContent.hero.ctaLabel}</a>
          <p className="hero-proof">{landingContent.hero.proof}</p>
        </motion.div>
      </div>
      <div className="hero-demo">{demo}</div>
    </section>
  );
}
```

- [ ] **Step 4: Create the demo frame**

```tsx
import { useEffect, useMemo, useState } from 'react';
import { motion } from 'motion/react';
import { landingContent } from '../../content/landingContent';
import { buildDemoTimeline } from './demoTimeline';

export function LiveDemoFrame() {
  const [scenarioId, setScenarioId] = useState(landingContent.demoScenarios[0].id);
  const scenario = landingContent.demoScenarios.find((item) => item.id === scenarioId) ?? landingContent.demoScenarios[0];
  const timeline = useMemo(() => buildDemoTimeline(scenario.lines), [scenario]);
  const [visibleCount, setVisibleCount] = useState(1);

  useEffect(() => {
    setVisibleCount(1);
    const timers = timeline.slice(1).map((item, index) =>
      window.setTimeout(() => setVisibleCount(index + 2), item.delayMs),
    );

    return () => timers.forEach((timer) => window.clearTimeout(timer));
  }, [timeline]);

  return (
    <section id="demo" className="demo-shell" aria-label="SpeechBridge demo">
      <div className="demo-toolbar">
        {landingContent.demoScenarios.map((item) => (
          <button key={item.id} type="button" className={item.id === scenarioId ? 'scenario-pill active' : 'scenario-pill'} onClick={() => setScenarioId(item.id)}>
            {item.label}
          </button>
        ))}
      </div>
      <div className="demo-grid">
        <div className="demo-panel">
          <p className="demo-label">Transcription</p>
          {timeline.slice(0, visibleCount).map((line) => (
            <motion.p key={`${scenario.id}-${line.delayMs}-o`} className="demo-line" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}>
              {line.original}
            </motion.p>
          ))}
        </div>
        <div className="demo-panel">
          <p className="demo-label">Translation</p>
          {timeline.slice(0, visibleCount).map((line) => (
            <motion.p key={`${scenario.id}-${line.delayMs}-t`} className="demo-line demo-line--translated" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.12 }}>
              {line.translated}
            </motion.p>
          ))}
        </div>
      </div>
    </section>
  );
}
```

- [ ] **Step 5: Create the story and trust sections**

```tsx
import { landingContent } from '../../content/landingContent';

export function StorySection() {
  return (
    <>
      <section className="story-shell" aria-labelledby="problem-title">
        <p className="section-kicker">The problem</p>
        <h2 id="problem-title">Live multilingual moments move too fast for fragmented tools.</h2>
        <div className="story-points">
          {landingContent.problemPoints.map((point) => (
            <p key={point}>{point}</p>
          ))}
        </div>
      </section>

      <section className="feature-shell" aria-labelledby="feature-title">
        <p className="section-kicker">The solution</p>
        <h2 id="feature-title">A calm bridge between spoken language and understanding.</h2>
        <div className="feature-list">
          {landingContent.features.map((feature) => (
            <article key={feature.title} className="feature-card">
              <h3>{feature.title}</h3>
              <p>{feature.body}</p>
            </article>
          ))}
        </div>
      </section>
    </>
  );
}
```

```tsx
import { landingContent } from '../../content/landingContent';

export function TrustSection() {
  return (
    <>
      <section className="trust-shell" aria-labelledby="trust-title">
        <p className="section-kicker">Built for real moments</p>
        <h2 id="trust-title">Built for meetings, interviews, travel, classrooms, and multilingual daily life.</h2>
        <div className="trust-signals">
          {landingContent.trustSignals.map((signal) => (
            <span key={signal} className="signal-pill">{signal}</span>
          ))}
        </div>
      </section>

      <section className="final-cta-shell" aria-labelledby="final-cta-title">
        <h2 id="final-cta-title">Start hearing the whole conversation.</h2>
        <a className="primary-cta" href="#demo">Try the Demo</a>
      </section>
    </>
  );
}
```

- [ ] **Step 6: Replace `src/App.tsx` with the landing-page composition**

```tsx
import { HeroSection } from './components/landing/HeroSection';
import { LiveDemoFrame } from './components/landing/LiveDemoFrame';
import { StorySection } from './components/landing/StorySection';
import { TrustSection } from './components/landing/TrustSection';

export default function App() {
  return (
    <div className="landing-root">
      <header className="site-header">
        <a className="brand-lockup" href="#top">
          <span className="brand-mark" aria-hidden="true" />
          <span className="brand-wordmark">SpeechBridge</span>
        </a>
        <a className="header-cta" href="#demo">Try the Demo</a>
      </header>

      <main id="top">
        <HeroSection demo={<LiveDemoFrame />} />
        <StorySection />
        <TrustSection />
      </main>
    </div>
  );
}
```

- [ ] **Step 7: Run the targeted test to verify the landing structure now passes**

Run: `node --test --import tsx src/App.test.tsx`

Expected: PASS for both render tests and the helper test.

- [ ] **Step 8: Commit the landing-page structure**

```bash
git add src/App.tsx src/App.test.tsx src/components/landing/HeroSection.tsx src/components/landing/LiveDemoFrame.tsx src/components/landing/StorySection.tsx src/components/landing/TrustSection.tsx
git commit -m "feat: build SpeechBridge landing page structure"
```

---

### Task 4: Implement the visual system, responsive layout, and motion polish

**Files:**
- Modify: `src/index.css`
- Modify: `src/content/landingContent.ts`
- Modify: `src/components/landing/HeroSection.tsx`
- Modify: `src/components/landing/LiveDemoFrame.tsx`
- Modify: `src/components/landing/StorySection.tsx`
- Modify: `src/components/landing/TrustSection.tsx`
- Test: `src/App.test.tsx`

- [ ] **Step 1: Add any missing content fields needed for trust and problem sections**

```ts
problemPoints: [
  'Important details disappear quickly when you are translating in your head.',
  'Switching between tools breaks eye contact, pacing, and confidence.',
  'Without a clean record, useful conversations become hard to revisit or share.',
],
trustSignals: ['Real-time capture', 'Clear bilingual view', 'Exportable transcripts'],
```

- [ ] **Step 2: Replace the global stylesheet with the brand-aware theme and layout system**

```css
@import url('https://fonts.googleapis.com/css2?family=Manrope:wght@400;500;600;700;800&family=Source+Serif+4:wght@600;700&display=swap');
@import "tailwindcss";

@theme {
  --font-sans: "Manrope", ui-sans-serif, system-ui, sans-serif;
  --font-serif: "Source Serif 4", ui-serif, Georgia, serif;
  --color-ink: #111418;
  --color-ink-soft: #1a1f25;
  --color-ivory: #f4efe7;
  --color-mist: #b6b0a7;
  --color-copper: #c46a38;
  --color-line: rgba(244, 239, 231, 0.12);
}

@layer base {
  html {
    scroll-behavior: smooth;
  }

  body {
    @apply m-0 min-h-screen bg-[var(--color-ink)] text-[var(--color-ivory)] font-sans antialiased;
    background-image:
      radial-gradient(circle at top, rgba(196, 106, 56, 0.24), transparent 32%),
      linear-gradient(180deg, #161a20 0%, #111418 45%, #0d1014 100%);
  }

  * {
    box-sizing: border-box;
  }

  a {
    color: inherit;
    text-decoration: none;
  }
}

@layer components {
  .landing-root {
    @apply relative overflow-x-hidden;
  }

  .site-header {
    @apply sticky top-0 z-30 mx-auto flex w-full max-w-7xl items-center justify-between px-5 py-5 md:px-8;
    backdrop-filter: blur(18px);
  }

  .hero-shell {
    @apply mx-auto grid min-h-screen max-w-7xl items-center gap-12 px-5 pb-16 pt-24 md:px-8 lg:grid-cols-[minmax(0,0.92fr)_minmax(0,1.08fr)];
  }

  .hero-title {
    font-family: var(--font-serif);
    @apply max-w-3xl text-5xl leading-none tracking-[-0.04em] md:text-7xl;
  }

  .primary-cta {
    @apply inline-flex items-center justify-center rounded-full bg-[var(--color-ivory)] px-6 py-3 text-sm font-semibold text-[var(--color-ink)] transition-transform duration-300 hover:-translate-y-0.5;
  }

  .demo-shell {
    @apply rounded-[2rem] border border-[var(--color-line)] bg-white/5 p-4 shadow-[0_20px_80px_rgba(0,0,0,0.35)] backdrop-blur;
  }

  .demo-grid {
    @apply grid gap-4 md:grid-cols-2;
  }

  .feature-list {
    @apply grid gap-4 md:grid-cols-2;
  }

  .feature-card,
  .demo-panel,
  .trust-shell,
  .final-cta-shell,
  .story-shell {
    @apply rounded-[1.75rem] border border-[var(--color-line)] bg-white/4;
  }

  @media (prefers-reduced-motion: reduce) {
    html {
      scroll-behavior: auto;
    }

    *,
    *::before,
    *::after {
      animation: none !important;
      transition: none !important;
    }
  }
}
```

- [ ] **Step 3: Add motion and composition polish to the sections without changing their content contract**

```tsx
<motion.section
  className="story-shell"
  initial={{ opacity: 0, y: 36 }}
  whileInView={{ opacity: 1, y: 0 }}
  viewport={{ once: true, amount: 0.35 }}
  transition={{ duration: 0.7, ease: 'easeOut' }}
>
```

```tsx
<motion.div
  className="hero-demo"
  initial={{ opacity: 0, scale: 0.96, y: 32 }}
  animate={{ opacity: 1, scale: 1, y: 0 }}
  transition={{ duration: 0.8, delay: 0.2, ease: 'easeOut' }}
>
```

- [ ] **Step 4: Run the landing test suite after the visual pass**

Run: `node --test --import tsx src/App.test.tsx`

Expected: PASS. The visual changes should not break the copy or structure assertions.

- [ ] **Step 5: Run the complete verification commands**

Run: `npm test`
Expected: PASS

Run: `npm run build`
Expected: PASS with a production build emitted into `dist`

- [ ] **Step 6: Commit the final design system and motion implementation**

```bash
git add src/index.css src/content/landingContent.ts src/components/landing/HeroSection.tsx src/components/landing/LiveDemoFrame.tsx src/components/landing/StorySection.tsx src/components/landing/TrustSection.tsx
git commit -m "feat: polish SpeechBridge landing page visuals"
```

---

## Self-Review

### Spec coverage

- Visual direction: covered in Task 4 via global theme, typography, and motion polish.
- Hero, problem, solution, features, trust, CTA: covered in Task 3.
- Product experience / demo framing: covered in Task 3 via `LiveDemoFrame`.
- Responsive behavior, accessibility, performance: covered in Task 4.
- Missing assets / copy placeholders: preserved as content-driven fields in Task 2 and refinements in Task 4.

### Placeholder scan

- No `TBD` or `TODO` markers remain.
- Every task names exact files and commands.
- Code steps include concrete snippets instead of abstract instructions.

### Type consistency

- `landingContent` keys used in section components are defined in the plan.
- `buildDemoTimeline` types match the helper test expectations.
- All CTA anchors consistently target `#demo`.
