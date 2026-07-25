# TODO

- [ ] **Localhost Device audio capture without screen recording** — Localhost Device (beta) still relies on ScreenCaptureKit (needs "Screen Recording" macOS permission) or FFmpeg + virtual audio cable (BlackHole). Hosted/non-localhost already use browser `getDisplayMedia` tab/window share. Consider simplifying or retiring the localhost server-side path if browser share is good enough locally.
