import assert from 'node:assert/strict';
import test from 'node:test';
import { renderToStaticMarkup } from 'react-dom/server';
import App, { DEFAULT_CONFIDENCE_THRESHOLD, isQualityButtonSelected } from './App';

test('App renders the Barrier-Free Meetings header', () => {
  const html = renderToStaticMarkup(<App />);

  assert.match(html, /Barrier-Free Meetings/);
});

test('App shows a visible STT badge when rendering the main header', () => {
  const html = renderToStaticMarkup(<App />);

  assert.match(html, /No STT available/);
});

test('App renders language selector', () => {
  const html = renderToStaticMarkup(<App />);

  assert.match(html, /Input Language/);
  assert.match(html, /zh-CN/);
});

test('App lets users hide the transcript for translation-focused viewing', () => {
  const html = renderToStaticMarkup(<App />);

  assert.match(html, /aria-label="Hide transcription"/);
});

test('App keeps the recording surface focused without the Chinese helper copy or auto-save checkbox', () => {
  const html = renderToStaticMarkup(<App />);

  assert.doesNotMatch(html, /If you are not sure which Chinese variety is spoken/);
  assert.doesNotMatch(html, /Save conversations automatically/);
  assert.doesNotMatch(html, /type="checkbox"/);
});

test('App renders start recording button', () => {
  const html = renderToStaticMarkup(<App />);

  assert.match(html, /Start Recording/);
});

test('App shows placeholder when no segments exist', () => {
  const html = renderToStaticMarkup(<App />);

  assert.match(html, /Press record to start transcribing…/);
});

test('App keeps Audio Input directly below the Online Offline mode switch', () => {
  const html = renderToStaticMarkup(<App />);

  const offlineIndex = html.indexOf('Offline');
  const audioInputIndex = html.indexOf('Audio Input');
  const inputLanguageIndex = html.indexOf('Input Language');

  assert.notEqual(offlineIndex, -1);
  assert.notEqual(audioInputIndex, -1);
  assert.notEqual(inputLanguageIndex, -1);
  assert.ok(offlineIndex < audioInputIndex);
  assert.ok(audioInputIndex < inputLanguageIndex);
});

test('App hides beta Device audio capture on non-localhost', () => {
  const html = renderToStaticMarkup(<App />);

  // SSR has no window.location, so isLocalhost is false — Device should be hidden
  assert.doesNotMatch(html, /Device/);
});

test('App uses the dynamic viewport height shell to avoid bottom clipping', () => {
  const html = renderToStaticMarkup(<App />);

  assert.match(html, /h-dvh/);
});

test('App keeps the sidebar and main headers on the same fixed height', () => {
  const html = renderToStaticMarkup(<App />);

  const headerHeightClassCount = (html.match(/h-16/g) ?? []).length;
  assert.ok(headerHeightClassCount >= 2);
});

test('App defaults the confidence threshold to 80 percent', () => {
  assert.equal(DEFAULT_CONFIDENCE_THRESHOLD, 80);
});

test('App selects the quality button only when confidence scores are shown', () => {
  assert.equal(isQualityButtonSelected({ showConfidence: false }), false);
  assert.equal(isQualityButtonSelected({ showConfidence: true }), true);
});
