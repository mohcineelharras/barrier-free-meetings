import { pipeline } from '@huggingface/transformers';

async function run() {
  const transcriber = await pipeline('automatic-speech-recognition', 'onnx-community/whisper-tiny_timestamped');
  
  // create dummy audio
  const audio = new Float32Array(16000 * 2);
  
  const options = {
    chunk_length_s: 29,
    force_full_sequences: true,
    language: 'zh',
    return_timestamps: 'word',
    stride_length_s: 5,
    task: 'transcribe',
  };
  console.log("Options:", options);
  
  try {
    const result = await transcriber(audio, options);
    console.log("Result:", result);
  } catch(e) {
    console.error("Error:", e);
  }
}

run();
