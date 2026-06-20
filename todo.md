# TODO

- [ ] **Device audio capture without screen recording** — Currently relies on ScreenCaptureKit (needs "Screen Recording" macOS permission) or FFmpeg + virtual audio cable (BlackHole). Both are overengineered for just capturing device audio. Need to find a simpler solution or consider if the feature is worth the complexity. The dead `getDisplayMedia` code in `mediaCapture.ts` should also be cleaned up.
