export const landingContent = {
  hero: {
    eyebrow: 'LIVE SPEECH TRANSLATION',
    title: 'Understand live speech before the moment passes.',
    description:
      'SpeechBridge turns spoken language into clear, real-time translation so conversations stay fluid, fast, and fully understood.',
    ctaLabel: 'Try the Demo',
    proof: 'Structured. Fast. Calm under pressure.',
  },
  problemPoints: [
    'Important details disappear quickly when you are translating in your head.',
    'Switching between tools breaks eye contact, pacing, and confidence.',
    'Without a clean record, useful conversations become hard to revisit or share.',
  ],
  features: [
    {
      title: 'Catch the moment live',
      body: 'Capture speech as it happens so important meaning does not disappear into memory.',
    },
    {
      title: 'See meaning instantly',
      body: 'Watch translation resolve in a readable second language without breaking the flow.',
    },
    {
      title: 'Keep the conversation usable',
      body: 'Export structured transcript history for review, sharing, and follow-up.',
    },
    {
      title: 'Stay focused under pressure',
      body: 'Work inside a calm bilingual interface built for speed, clarity, and attention.',
    },
  ],
  demoScenarios: [
    {
      id: 'meeting',
      label: 'Meeting',
      lines: [
        { original: '欢迎来到今天的会议。', translated: "Bienvenue a la reunion d'aujourd'hui." },
        { original: '我们先讨论发布时间。', translated: 'Commencons par discuter de la date de lancement.' },
        { original: '之后我会分享下一步。', translated: 'Ensuite, je partagerai les prochaines etapes.' },
      ],
    },
    {
      id: 'fieldwork',
      label: 'Fieldwork',
      lines: [
        { original: '请记录这个样本的位置。', translated: "Veuillez noter l'emplacement de cet echantillon." },
        { original: '我们还需要两张照片。', translated: 'Il nous faut aussi deux photos.' },
        { original: '之后我们回去整理数据。', translated: 'Ensuite, nous retournerons organiser les donnees.' },
      ],
    },
  ],
  trustSignals: ['Real-time capture', 'Clear bilingual view', 'Exportable transcripts'],
  useCases: ['Meetings', 'Interviews', 'Travel', 'Classrooms', 'Field research', 'Daily conversation'],
} as const;
