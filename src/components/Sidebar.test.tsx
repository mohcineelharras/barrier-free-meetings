import assert from 'node:assert/strict';
import test from 'node:test';
import { renderToStaticMarkup } from 'react-dom/server';

import { Sidebar } from './Sidebar';

test('hosted demo sidebar keeps advanced transcription controls under one collapsible menu', () => {
  const html = renderToStaticMarkup(
    <Sidebar
      selectedProvider="openrouter"
      onProviderChange={() => {}}
      selectedModel="inclusionai/ling-3.0-flash:free"
      onModelChange={() => {}}
      sourceLanguage="zh-CN"
      onSourceLanguageChange={() => {}}
      targetLanguage="fr-FR"
      onTargetLanguageChange={() => {}}
      isOffline={false}
      onOfflineChange={() => {}}
      whisperTier="low"
      onWhisperTierChange={() => {}}
      ollamaTier="medium"
      onOllamaTierChange={() => {}}
      audioSource="microphone"
      onAudioSourceChange={() => {}}
      transcriptionBackendPreference="whisper"
      onTranscriptionBackendPreferenceChange={() => {}}
      onSaveDefaults={() => {}}
      onResetDefaults={() => {}}
      runtimeConfig={{
        apiBaseUrl: 'https://demo.example.com',
        isHostedDemo: true,
        isLocalhost: false,
        isNativeApp: false,
        wsBaseUrl: 'wss://demo.example.com',
      }}
      transcriptionSupport={{
        canStartRecording: true,
        preferredLiveTranscriptionMode: 'web-speech',
        recordingDisabledReason: null,
        supportsMicrophoneCapture: true,
        supportsOfflineMode: false,
        supportsRemoteWhisper: true,
        supportsSystemAudioCapture: true,
        supportsWebSpeechRecognition: true,
      }}
    />,
  );

  assert.match(html, /Advanced settings/);
  assert.match(html, /Audio Input/);
  assert.match(html, />\s*Mic\s*</);
  assert.match(html, /Browser audio/);
  assert.doesNotMatch(html, /Device/);
  assert.match(html, /Input Language/);
  assert.match(html, /Output Language/);
  assert.doesNotMatch(html, /Transcription Backend/);
  assert.doesNotMatch(html, />\s*Browser Speech\s*</);
  assert.doesNotMatch(html, /Provider/);
  assert.doesNotMatch(html, /Model/);
  assert.doesNotMatch(html, /Whisper base/i);
  assert.doesNotMatch(html, /Whisper small/i);
  assert.doesNotMatch(html, /Show all free models/i);
});

test('hosted demo browser audio selection shows share-audio helper copy', () => {
  const html = renderToStaticMarkup(
    <Sidebar
      selectedProvider="openrouter"
      onProviderChange={() => {}}
      selectedModel="inclusionai/ling-3.0-flash:free"
      onModelChange={() => {}}
      sourceLanguage="zh-CN"
      onSourceLanguageChange={() => {}}
      targetLanguage="fr-FR"
      onTargetLanguageChange={() => {}}
      isOffline={false}
      onOfflineChange={() => {}}
      whisperTier="low"
      onWhisperTierChange={() => {}}
      ollamaTier="medium"
      onOllamaTierChange={() => {}}
      audioSource="system"
      onAudioSourceChange={() => {}}
      transcriptionBackendPreference="web-speech"
      onTranscriptionBackendPreferenceChange={() => {}}
      onSaveDefaults={() => {}}
      onResetDefaults={() => {}}
      runtimeConfig={{
        apiBaseUrl: 'https://demo.example.com',
        isHostedDemo: true,
        isLocalhost: false,
        isNativeApp: false,
        wsBaseUrl: 'wss://demo.example.com',
      }}
      transcriptionSupport={{
        canStartRecording: true,
        preferredLiveTranscriptionMode: 'web-speech',
        recordingDisabledReason: null,
        supportsMicrophoneCapture: true,
        supportsOfflineMode: false,
        supportsRemoteWhisper: true,
        supportsSystemAudioCapture: true,
        supportsWebSpeechRecognition: true,
      }}
    />,
  );

  assert.match(html, /Share a browser tab or window/);
  assert.match(html, /Share audio/);
  assert.doesNotMatch(html, /Device/);
});
