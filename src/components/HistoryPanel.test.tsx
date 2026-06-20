import assert from 'node:assert/strict';
import test from 'node:test';
import { renderToStaticMarkup } from 'react-dom/server';

import { HistoryPanel } from './HistoryPanel';

test('HistoryPanel empty state explains that conversations are saved automatically', () => {
  const html = renderToStaticMarkup(
    <HistoryPanel
      sessions={[]}
      onDelete={() => {}}
      onReportGenerated={() => {}}
      onClear={() => {}}
      onClose={() => {}}
      onLoad={() => {}}
      provider="openrouter"
      model="openai/gpt-4o-mini"
    />,
  );

  assert.match(html, /Saved conversations appear here automatically\./);
  assert.doesNotMatch(html, /Press the save button to keep a conversation\./);
});

test('HistoryPanel uses explicit fallback copy when a saved session has no report yet', () => {
  const html = renderToStaticMarkup(
    <HistoryPanel
      sessions={[
        {
          id: 'session-1',
          savedAt: 10,
          updatedAt: 20,
          title: 'Bonjour',
          sourceLang: 'Chinese / Mandarin',
          targetLang: 'French',
          segments: [
            {
              id: 'segment-1',
              original: '你好',
              translated: 'Bonjour',
              timestamp: 1,
              isFinal: true,
            },
          ],
          saveMode: 'auto',
        },
      ]}
      onDelete={() => {}}
      onReportGenerated={() => {}}
      onClear={() => {}}
      onClose={() => {}}
      onLoad={() => {}}
      provider="openrouter"
      model="openai/gpt-4o-mini"
    />,
  );

  assert.match(html, /Generate now/);
  assert.doesNotMatch(html, />Generate Report</);
});
