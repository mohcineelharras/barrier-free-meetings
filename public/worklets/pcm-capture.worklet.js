// AudioWorklet processor: downsamples browser audio to 16 kHz Float32,
// batches ~100 ms frames, posts Float32Array to the main thread.

const TARGET_SAMPLE_RATE = 16000;
const FLUSH_INTERVAL_MS = 100;

class PcmCaptureProcessor extends AudioWorkletProcessor {
  constructor() {
    super();
    this.downsampleRatio = sampleRate / TARGET_SAMPLE_RATE;
    this.flushSize = Math.ceil(TARGET_SAMPLE_RATE * (FLUSH_INTERVAL_MS / 1000));
    this.buffer = new Float32Array(this.flushSize * 2);
    this.bufferIndex = 0;
  }

  process(inputs) {
    const input = inputs[0]?.[0];
    if (!input) return true;

    for (let i = 0; i < input.length; i += this.downsampleRatio) {
      const sample = input[Math.floor(i)];
      if (this.bufferIndex >= this.buffer.length) {
        const expanded = new Float32Array(this.buffer.length * 2);
        expanded.set(this.buffer);
        this.buffer = expanded;
      }
      this.buffer[this.bufferIndex++] = sample;
    }

    if (this.bufferIndex >= this.flushSize) {
      const frame = this.buffer.slice(0, this.bufferIndex);
      this.port.postMessage(frame, [frame.buffer]);
      this.bufferIndex = 0;
    }

    return true;
  }
}

registerProcessor('pcm-capture', PcmCaptureProcessor);
