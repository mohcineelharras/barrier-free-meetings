import { env, pipeline } from '@huggingface/transformers';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const CACHE_DIR = path.join(os.homedir(), '.transcribe-easy', 'transformers-cache');

async function downloadModel(modelId) {
  console.log(`\n========================================`);
  console.log(`Downloading: ${modelId}`);
  console.log(`Cache dir: ${CACHE_DIR}`);
  console.log(`========================================\n`);

  env.cacheDir = CACHE_DIR;
  env.allowLocalModels = true;
  env.allowRemoteModels = true;
  env.useFSCache = true;

  try {
    const transcriber = await pipeline('automatic-speech-recognition', modelId);
    console.log(`✓ Model ${modelId} loaded successfully`);
    
    // Test with dummy audio
    const audio = new Float32Array(16000 * 2);
    console.log(`Testing transcription...`);
    
    const result = await transcriber(audio, {
      language: 'fr',
      task: 'transcribe',
      return_timestamps: 'word'
    });
    
    console.log(`✓ Test transcription succeeded:`, result.text);
    
    transcriber.dispose();
    return true;
  } catch (error) {
    console.error(`✗ Failed to download/load ${modelId}:`, error.message);
    return false;
  }
}

async function main() {
  fs.mkdirSync(CACHE_DIR, { recursive: true });
  
  const models = [
    'onnx-community/whisper-tiny_timestamped',
    'onnx-community/whisper-base_timestamped',
    'onnx-community/whisper-small_timestamped',
    'onnx-community/whisper-large-v3-turbo_timestamped',
    'onnx-community/lite-whisper-large-v3-turbo-ONNX',
  ];
  
  const results = {};
  
  for (const modelId of models) {
    results[modelId] = await downloadModel(modelId);
  }
  
  console.log(`\n========================================`);
  console.log(`Download Summary`);
  console.log(`========================================`);
  
  for (const [modelId, success] of Object.entries(results)) {
    console.log(`${success ? '✓' : '✗'} ${modelId}`);
  }
  
  // Verify cache
  console.log(`\n========================================`);
  console.log(`Cache Verification`);
  console.log(`========================================`);
  
  const onnxDir = path.join(CACHE_DIR, 'onnx-community');
  if (fs.existsSync(onnxDir)) {
    const models = fs.readdirSync(onnxDir);
    for (const model of models) {
      const modelPath = path.join(onnxDir, model);
      const stats = fs.statSync(modelPath);
      if (stats.isDirectory()) {
        const onnxPath = path.join(modelPath, 'onnx');
        if (fs.existsSync(onnxPath)) {
          const files = fs.readdirSync(onnxPath);
          console.log(`\n${model}:`);
          files.forEach(f => {
            const fpath = path.join(onnxPath, f);
            const fstat = fs.statSync(fpath);
            console.log(`  ${f} - ${(fstat.size / 1024 / 1024).toFixed(2)} MB`);
          });
        }
      }
    }
  }
}

main().catch(console.error);
