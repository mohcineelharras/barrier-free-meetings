import assert from 'node:assert/strict';
import test from 'node:test';

import { PROVIDERS } from './providers';

test('PROVIDERS lists cloud translation options as OpenRouter → MiniMax → Gemini', () => {
  assert.deepEqual(
    PROVIDERS.filter((provider) => provider.id !== 'ollama').map((provider) => provider.id),
    ['openrouter', 'minimax', 'google-ai-studio'],
  );
});
