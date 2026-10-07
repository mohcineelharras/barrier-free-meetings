import assert from 'node:assert/strict';
import test from 'node:test';
import { renderToStaticMarkup } from 'react-dom/server';

import { ReportPanel } from './ReportPanel';

test('ReportPanel is a labelled dialog with an explicit close control', () => {
  const html = renderToStaticMarkup(
    <ReportPanel
      segments={[{ original: '你好', translated: 'Bonjour' }]}
      sourceLang="Chinese / Mandarin"
      targetLang="French"
      provider="openrouter"
      model="inclusionai/ling-3.0-flash:free"
      onClose={() => {}}
    />,
  );

  assert.match(html, /role="dialog"/);
  assert.match(html, /aria-modal="true"/);
  assert.match(html, /id="report-dialog-title"/);
  assert.match(html, /Meeting Report/);
  assert.match(html, /aria-label="Close"/);
  assert.match(html, /Generate now/);
});
