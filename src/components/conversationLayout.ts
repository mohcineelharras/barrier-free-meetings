interface ConversationPaneClasses {
  transcriptionPane: string;
  translationPane: string;
}

export function getConversationPaneClasses(isTranscriptHidden: boolean): ConversationPaneClasses {
  return {
    transcriptionPane: isTranscriptHidden
      ? 'hidden'
      : 'flex-1 flex flex-col overflow-hidden border-r border-gray-200 dark:border-gray-800',
    translationPane: isTranscriptHidden
      ? 'flex-[1_1_100%] flex flex-col overflow-hidden'
      : 'flex-1 flex flex-col overflow-hidden',
  };
}

