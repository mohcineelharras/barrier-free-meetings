import assert from 'node:assert/strict';
import test from 'node:test';

import { getLanguageCode, getLanguageName, LANGUAGES } from './languages';

test('language picker includes Turkish', () => {
  assert.ok(LANGUAGES.some((language) => language.code === 'tr-TR' && language.name === 'Turkish'));
  assert.equal(getLanguageName('tr-TR'), 'Turkish');
});

test('language codes round-trip from saved display names', () => {
  assert.equal(getLanguageCode('zh-CN'), 'zh-CN');
  assert.equal(getLanguageCode('Chinese / Mandarin'), 'zh-CN');
  assert.equal(getLanguageCode('French'), 'fr-FR');
  assert.equal(getLanguageCode('not-a-language'), 'und');
});

test('language picker offers practical Chinese meeting choices', () => {
  assert.ok(LANGUAGES.some((language) => language.code === 'zh-CN' && language.name === 'Chinese / Mandarin'));
  assert.ok(LANGUAGES.some((language) => language.code === 'zh-TW' && language.name === 'Chinese / Taiwan'));
  assert.ok(LANGUAGES.some((language) => language.code === 'yue-HK' && language.name === 'Cantonese / Hong Kong'));
  assert.equal(getLanguageName('yue-HK'), 'Cantonese / Hong Kong');
});
