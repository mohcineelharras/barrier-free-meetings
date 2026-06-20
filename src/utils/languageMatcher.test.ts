import assert from 'node:assert/strict';
import test from 'node:test';
import { isScriptMatching, requiresLlmVerification } from './languageMatcher';

test('isScriptMatching identifies Arabic script', () => {
  assert.ok(isScriptMatching('مرحبا كيف حالك', 'ar-SA'));
  assert.ok(!isScriptMatching('Hello how are you', 'ar-SA'));
  assert.ok(!isScriptMatching('你好吗', 'ar-SA'));
});

test('isScriptMatching identifies Chinese characters', () => {
  assert.ok(isScriptMatching('你好，今天天气怎么样', 'zh-CN'));
  assert.ok(isScriptMatching('繁體中文測試', 'zh-TW'));
  assert.ok(!isScriptMatching('Hello world', 'zh-CN'));
  assert.ok(!isScriptMatching('Привет как дела', 'zh-CN'));
});

test('isScriptMatching identifies Japanese scripts', () => {
  assert.ok(isScriptMatching('こんにちは', 'ja-JP')); // Hiragana
  assert.ok(isScriptMatching('テスト', 'ja-JP')); // Katakana
  assert.ok(isScriptMatching('日本語のテスト', 'ja-JP')); // Kanji + Hiragana
  assert.ok(!isScriptMatching('Hello', 'ja-JP'));
});

test('isScriptMatching identifies Korean script', () => {
  assert.ok(isScriptMatching('안녕하세요', 'ko-KR')); // Hangul
  assert.ok(!isScriptMatching('Hello', 'ko-KR'));
});

test('isScriptMatching identifies Russian Cyrillic script', () => {
  assert.ok(isScriptMatching('Привет, как дела?', 'ru-RU'));
  assert.ok(!isScriptMatching('Hello, how are you?', 'ru-RU'));
});

test('isScriptMatching identifies Hindi Devanagari script', () => {
  assert.ok(isScriptMatching('नमस्ते, आप कैसे हैं?', 'hi-IN'));
  assert.ok(!isScriptMatching('Hello', 'hi-IN'));
});

test('isScriptMatching validates Latin script languages and avoids non-Latin bleed', () => {
  assert.ok(isScriptMatching('Hello world', 'en-US'));
  assert.ok(isScriptMatching('Bonjour tout le monde', 'fr-FR'));
  assert.ok(!isScriptMatching('안녕하세요', 'en-US'));
  assert.ok(!isScriptMatching('مرحبا', 'fr-FR'));
  assert.ok(!isScriptMatching('你好', 'es-ES'));
});

test('requiresLlmVerification identifies Latin script languages', () => {
  assert.ok(requiresLlmVerification('en-US'));
  assert.ok(requiresLlmVerification('fr-FR'));
  assert.ok(requiresLlmVerification('es-ES'));
  assert.ok(!requiresLlmVerification('zh-CN'));
  assert.ok(!requiresLlmVerification('ar-SA'));
});
