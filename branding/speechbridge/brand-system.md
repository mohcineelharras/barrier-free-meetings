# SpeechBridge Visual Identity

## Brand Position

SpeechBridge is a professional live speech translation product built for serious multilingual work: meetings, interviews, research, field operations, and institutional communication.

The identity should feel:

- precise
- calm
- premium
- infrastructural rather than flashy

## Brand Directions

### Direction 1: Raised Span

An abstract bridge span connects two language endpoints, with a live signal bar rising through the center. It feels like infrastructure: stable, active, and useful under pressure.

Why it works:

- immediately connects to the product name
- feels professional instead of playful
- scales well from favicon to social card
- creates a distinctive symbol without leaning on AI clichés

### Direction 2: Interpreter's Ledger

A more editorial system built from bilingual columns, seam lines, and archival typography. It feels institutional, thoughtful, and documentation-first.

Why it works:

- excellent for research and enterprise credibility
- visually references source and target text columns
- creates a strong README/editorial presence

Risk:

- less immediate as an app icon
- more system than symbol

### Direction 3: Relay Circuit

A directional mark built from linked nodes and a transmission path. This leans more software-native and operational, suggesting handoff, routing, and continuity of speech.

Why it works:

- strong product-tech feel
- clear motion and connection metaphor
- adaptable to interaction design

Risk:

- edges closer to familiar SaaS territory
- less culturally neutral and timeless than the bridge concept

## Recommended Direction

`Raised Span` is the strongest choice.

It gives SpeechBridge a memorable, ownable symbol with immediate semantic value. It feels like a dependable professional tool rather than a generic AI app, and it remains legible when reduced to a notification icon or favicon.

## Final System

### Color Palette

- `Carbon` `#111418`
  Primary ink, app icon background, dark surfaces, wordmark on light.
- `Porcelain` `#F3EEE7`
  Primary light surface, reversed logo color, app icon mark.
- `Bridge Copper` `#C46A38`
  Signature accent for the live signal and high-attention actions.
- `Steel Mist` `#88919B`
  Secondary interface neutral, metadata, dividers.
- `Ledger Line` `#2C3138`
  Hairlines, dark panel borders, structured depth.
- `Quiet Sand` `#DDD4C7`
  Warm supporting neutral for print-like backgrounds.

### Typography Direction

Use a disciplined neo-grotesk with multilingual coverage.

- Preferred premium direction: `Suisse Int'l` or `Neue Haas Grotesk`
- Practical brand/system fallback: `Avenir Next` for marketing and `IBM Plex Sans` or `Inter` for product UI if licensing or platform support requires it

Type rules:

- Title case for brand lockups
- slightly tight tracking on headlines
- avoid overly rounded or geometric-friendly fonts
- pair expressive size contrast with restrained weights

### Icon Language

The icon language should be built from:

- rounded terminals
- span shapes
- vertical signal strokes
- parallel source/target columns
- calm, structural symmetry

Avoid:

- chat bubbles as the primary motif
- globe marks
- random gradients
- sparkle, neuron, or assistant-style AI tropes

### Visual Motifs

- bridge spans
- bilingual columns
- narrow signal bars
- infrastructural linework
- restrained contrast between warm accent and cool neutrals

## Light / Dark Background Usage

### On Light Backgrounds

- use the standard logo with `Carbon` wordmark
- keep the bridge span or live signal in `Bridge Copper`
- use generous whitespace around the mark

### On Dark Backgrounds

- use the reversed logo with `Porcelain` wordmark
- keep the live signal in `Bridge Copper`
- avoid placing the logo over busy images or gradients

## App Icon Guidance

### iOS

- use the filled dark square with soft radius and centered mark
- keep the symbol large and vertically centered
- do not add small text or subtle inner details that depend on retina-only display
- the exported `1024` asset is the master source for app store derivations

### Android

- keep the same core symbol and color balance
- for adaptive icons, use the symbol on the dark field as the foreground treatment
- maintain safe padding so the arch does not clip in circular or squircular masks

## Notification Icon Guidance

The notification icon is intentionally simplified to a single-color bridge silhouette with no wordmark and no accent bar. It is meant to survive tiny sizes and monochrome system rendering.

Rules:

- use a single solid color only
- prefer white on dark system surfaces and black on light system surfaces
- do not add the copper accent in notification contexts

## Deliverables

- `speechbridge-logo.svg`
- `speechbridge-logo-dark.svg`
- `speechbridge-logo-mark.svg`
- `speechbridge-favicon.svg`
- `speechbridge-app-icon.svg`
- `speechbridge-notification-icon.svg`
- `speechbridge-social-card.svg`
- `speechbridge-readme-hero.svg`
- exported PNG companions produced by `scripts/export-brand-assets.mjs`
