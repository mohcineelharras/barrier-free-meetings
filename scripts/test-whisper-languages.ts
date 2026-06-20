import { env, pipeline } from '@huggingface/transformers';
import os from 'node:os';
import path from 'node:path';

const CACHE_DIR = path.join(os.homedir(), '.transcribe-easy', 'transformers-cache');

async function testLanguage(modelId, language) {
  console.log(`\n========================================`);
  console.log(`Testing ${modelId} with language: ${language}`);
  console.log(`========================================`);

  env.cacheDir = CACHE_DIR;
  env.allowLocalModels = true;
  env.allowRemoteModels = true;
  env.useFSCache = true;

  const transcriber = await pipeline('automatic-speech-recognition', modelId);
  
  // Test with dummy audio
  const audio = new Float32Array(16000 * 2);
  
  try {
    const result = await transcriber(audio, {
      language: language,
      task: 'transcribe',
      return_timestamps: 'word'
    });
    
    console.log(`✓ Success - Text: "${result.text}"`);
    return true;
  } catch (error) {
    console.error(`✗ Error:`, error.message);
    return false;
  } finally {
    transcriber.dispose();
  }
}

async function main() {
  const models = [
    'onnx-community/whisper-tiny_timestamped',
    'onnx-community/whisper-base_timestamped',
    'onnx-community/lite-whisper-large-v3-turbo-ONNX',
  ];
  
  const languages = ['fr', 'ar', 'zh', 'auto'];
  
  for (const modelId of models) {
    for (const language of languages) {
      await testLanguage(modelId, language);
    }
  }
}

main().catch(console.error);
