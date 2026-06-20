import assert from 'node:assert/strict';
import test from 'node:test';

import { getConversationPaneClasses } from './conversationLayout';

test('conversation layout shows both panes by default', () => {
  const classes = getConversationPaneClasses(false);

  assert.match(classes.transcriptionPane, /flex-1/);
  assert.match(classes.transcriptionPane, /border-r/);
  assert.match(classes.translationPane, /flex-1/);
});

test('conversation layout lets translation take the full work area when transcript is hidden', () => {
  const classes = getConversationPaneClasses(true);

  assert.equal(classes.transcriptionPane, 'hidden');
  assert.match(classes.translationPane, /flex-\[1_1_100%\]/);
});

