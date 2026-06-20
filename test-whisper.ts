import { pipeline } from '@huggingface/transformers';
import { buildWhisperTranscriptionOptions } from './server/offline-stt/whisperConfig.js';

async function run() {
  const transcriber = await pipeline('automatic-speech-recognition', 'onnx-community/whisper-tiny_timestamped');
  
  // create dummy audio
  const audio = new Float32Array(16000 * 2);
  
  const options = buildWhisperTranscriptionOptions('fr-FR');
  console.log("Options:", options);
  
  try {
    const result = await transcriber(audio, options);
    console.log("Result:", result);
  } catch(e) {
    console.error("Error:", e);
  }
}

run();
