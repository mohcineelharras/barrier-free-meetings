# SpeechBridge Landing Page Design

Date: 2026-04-26
Status: Approved for planning
Owner: Codex

## Objective

Design and build a launch-ready landing page for `SpeechBridge` inside the current React + Vite stack. The page should present `SpeechBridge` as a premium, globally relevant live speech translation product for anyone who needs to understand spoken language in real time.

The page should feel:

- polished and intentional
- cinematic but fast
- premium rather than generic SaaS
- mobile-first and fully responsive
- product-led, not copy-only

Primary CTA: `Try the Demo`

## Product Positioning

`SpeechBridge` helps people understand live speech before the moment passes. It turns spoken language into structured, readable, real-time translation so conversations can keep moving in meetings, travel, interviews, classrooms, research settings, care environments, and multilingual day-to-day life.

The message is broad-market, not niche. The page should not frame the product as only for interpreters, language learners, or a single use case.

## Chosen Visual Direction

### Direction

`Editorial Cinematic`

### Why this direction

This direction best matches the existing `SpeechBridge` identity and gives the product a memorable point of view without drifting into flashy AI-brand cliches. The tone should feel calm, precise, and globally credible. The page should communicate that `SpeechBridge` reduces tension in high-stakes multilingual moments.

### Visual principles

- Dominant dark field with strong negative space
- Warm ivory text for readability and contrast
- Restrained copper accent drawn from the existing logo mark
- Typography-led composition with minimal filler UI
- Product surfaces framed like premium editorial objects
- Atmosphere through lighting, depth, and subtle structural lines rather than decorative clutter

## Brand Inputs

Use the existing brand assets in `branding/speechbridge`.

Key references:

- `branding/speechbridge/speechbridge-logo.svg`
- `branding/speechbridge/speechbridge-logo-dark.svg`
- `branding/speechbridge/speechbridge-social-card.svg`

The landing page should extend this system rather than invent a conflicting new brand language.

## Audience

Primary audience:

- anyone who needs live speech translation

Representative moments:

- multilingual meetings
- interviews
- travel
- classrooms
- field research
- customer conversations
- care and support situations

## Core Message

The user should leave remembering one idea:

`SpeechBridge makes live conversation feel clear before the moment is gone.`

## Landing Page Structure

### 1. Hero

Purpose:
Establish product value instantly and create a memorable first impression.

Content:

- SpeechBridge wordmark
- strong headline
- concise subhead
- primary CTA: `Try the Demo`
- secondary supporting proof line
- immersive product composition showing transcription and translation happening live

Hero copy direction:

- Headline: `Understand live speech before the moment passes.`
- Subhead: `SpeechBridge turns spoken language into clear, real-time translation so conversations stay fluid, fast, and fully understood.`

### 2. Problem

Purpose:
Surface the friction of multilingual live conversation without fear-based exaggeration.

Message:

- important details disappear fast
- translating in your head is exhausting
- fragmented tools interrupt the moment

### 3. Solution

Purpose:
Introduce `SpeechBridge` as the calm layer between spoken language and comprehension.

Message:

- capture speech as it happens
- translate it into a readable second language
- keep both sides visible in a structured interface

### 4. Features

Purpose:
Prove the product through concrete capabilities rather than a generic feature grid.

Feature story blocks:

- `Catch the moment live` for real-time transcription
- `See meaning instantly` for live translation
- `Keep the conversation usable` for exportable transcripts
- `Stay focused under pressure` for the calm two-pane interface

Each block should pair short copy with a focused product crop or framed UI moment.

### 5. Product Experience

Purpose:
Show how the product feels in use.

Content:

- large product frame or device/window composition
- staged transcript and translation examples
- compact interface callouts
- demo-oriented CTA connection

This section should make the page feel product-led instead of marketing-led.

### 6. Trust

Purpose:
Make the product feel dependable without fake enterprise signals.

Content direction:

- grounded use-case band
- restrained proof chips or signals such as `real-time capture`, `clear bilingual view`, `exportable transcripts`
- copy that reinforces calm, speed, and structure

Avoid:

- fabricated stats
- fake customer logos
- overblown claims

### 7. Final CTA

Purpose:
Close with clarity and momentum.

Content:

- short final statement
- repeated `Try the Demo` CTA
- CTA anchors to the product preview / demo section

## Hero Composition

The hero should not be a standard centered SaaS block with a screenshot underneath.

Target composition:

- left or upper-left content stack for wordmark, headline, subhead, CTA
- large overlapping product frame positioned to the right or centered with offset balance
- product frame shows live bilingual flow, including transcript lines entering and translated lines resolving
- atmospheric background with radial light, faint grid logic, and subtle bridge-inspired structural strokes

The bridge motif should be echoed abstractly through linework and composition, not illustrated literally across the page.

## Motion Language

Motion should feel directed and premium, not busy.

### Load motion

- wordmark and nav reveal first
- headline and subhead rise with soft opacity timing
- CTA follows with slight delay
- product frame enters last for a staged reveal

### Idle motion

- recording indicator breathes softly
- transcript lines appear with gentle stagger
- translation states resolve with subtle pulse or fade
- background glow shifts almost imperceptibly

### Scroll motion

- section content reveals through masked fades and vertical offset
- selective parallax on background fields and framed surfaces
- occasional pinned or sticky composition moments to pace the narrative

### Interaction motion

- CTA hover states should feel tactile but restrained
- product callouts can highlight on hover or scroll focus
- no noisy micro-animations or constant floating effects

## Visual System

### Color

Core palette direction:

- near-black / charcoal for dominant surfaces
- warm ivory for high-contrast text
- muted gray for secondary information
- copper accent from the current logo system

The accent should be used sparingly for highlights, controls, and key emphasis.

### Typography

Use premium typography with character. Avoid generic default stacks as the visible brand voice.

Desired structure:

- expressive display face or high-quality serif / neo-grotesk for hero moments
- clean readable sans for body and UI copy
- mono accents only where they help signal live timing or technical precision

### Spacing and layout

- spacious first viewport
- consistent vertical rhythm between narrative sections
- asymmetry where it improves focus
- strong mobile collapse behavior without losing visual drama

## Copy Guidelines

Voice:

- calm
- sharp
- confident
- human

Rules:

- avoid inflated AI language
- avoid empty superlatives
- keep headlines short and memorable
- keep supporting copy concrete and readable
- focus on real user moments rather than abstract platform language

## Responsive Behavior

### Desktop

- editorial composition with overlap and spatial depth
- large product frame
- generous whitespace

### Mobile

- hero stack collapses cleanly
- product frame remains prominent and legible
- section order stays the same
- motion simplifies where needed for clarity and performance
- CTA remains easy to reach and obvious

Mobile quality is a hard requirement. The page should feel designed, not merely compressed.

## Accessibility and Performance

Accessibility requirements:

- sufficient contrast across dark surfaces
- semantic heading structure
- keyboard-accessible CTAs
- reduced motion support
- readable line lengths and tap targets

Performance requirements:

- motion should rely on transform/opacity where possible
- avoid heavy runtime effects that slow first paint
- images and branded assets should be sized intentionally
- keep the page cinematic without turning it into a slow showcase

## Technical Approach

Implementation should stay within the current repo stack:

- React 19
- Vite
- Tailwind CSS v4
- `motion` for animation

Expected implementation shape:

- replace the current app-shell presentation in `src/App.tsx` with a landing-page experience
- extract reusable section components if needed
- define cohesive design tokens and layout utilities in `src/index.css`
- reuse existing `SpeechBridge` assets from `branding/speechbridge`
- connect `Try the Demo` to an in-page demo surface or a strong anchor into the product preview

## Deliverables for Implementation

Implementation should cover:

1. chosen visual direction reflected in code
2. full landing page structure
3. production-grade responsive implementation
4. defined motion system for load, scroll, and transitions
5. explicit list of any remaining asset or copy gaps

## Known Asset or Copy Gaps

These items may still need to be created or refined during implementation:

- polished product screenshot or stylized product mockup for the hero
- possible refined social/share image aligned with the landing-page art direction
- final production copy polish after visual integration
- additional secondary screenshots only if the existing live UI crops are not visually strong enough

These are not blockers for implementation because the existing `SpeechBridge` brand assets are already usable.

## Out of Scope

- rewriting the backend translation flow
- adding authentication or onboarding flows
- inventing fake metrics, customer logos, or testimonials
- turning the page into a generic template marketing site

## Success Criteria

The landing page is successful if it:

- feels launch-ready and premium
- clearly communicates the product value within the first viewport
- looks distinctive from common AI SaaS templates
- demonstrates the product visually instead of relying on abstract claims
- remains fast, accessible, and strong on mobile
