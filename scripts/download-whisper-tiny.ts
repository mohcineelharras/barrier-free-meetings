import { env, pipeline } from '@huggingface/transformers';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const CACHE_DIR = path.join(os.homedir(), '.transcribe-easy', 'transformers-cache');
const MODEL_ID = 'onnx-community/whisper-tiny_timestamped';

async function main() {
  const onnxDir = path.join(CACHE_DIR, 'onnx-community', 'whisper-tiny_timestamped', 'onnx');
  if (
    fs.existsSync(path.join(onnxDir, 'encoder_model.onnx')) &&
    fs.existsSync(path.join(onnxDir, 'decoder_model_merged.onnx'))
  ) {
    console.log('[whisper] tiny model already cached');
    return;
  }

  fs.mkdirSync(CACHE_DIR, { recursive: true });

  env.cacheDir = CACHE_DIR;
  env.allowLocalModels = true;
  env.allowRemoteModels = true;
  env.useFSCache = true;

  console.log('[whisper] Downloading whisper-tiny model...');
  const transcriber = await pipeline('automatic-speech-recognition', MODEL_ID);
  console.log('[whisper] Model downloaded and verified');
  transcriber.dispose();
}

main().catch((err) => {
  console.error('[whisper] Failed:', err.message);
  process.exit(1);
});
