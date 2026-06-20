export interface Language {
  code: string;
  name: string;
}

export const LANGUAGES: Language[] = [
  { code: 'ar-SA', name: 'Arabic' },
  { code: 'zh-CN', name: 'Chinese / Mandarin' },
  { code: 'zh-TW', name: 'Chinese / Taiwan' },
  { code: 'yue-HK', name: 'Cantonese / Hong Kong' },
  { code: 'en-US', name: 'English' },
  { code: 'fr-FR', name: 'French' },
  { code: 'de-DE', name: 'German' },
  { code: 'hi-IN', name: 'Hindi' },
  { code: 'it-IT', name: 'Italian' },
  { code: 'ja-JP', name: 'Japanese' },
  { code: 'ko-KR', name: 'Korean' },
  { code: 'pt-BR', name: 'Portuguese' },
  { code: 'ru-RU', name: 'Russian' },
  { code: 'es-ES', name: 'Spanish' },
  { code: 'tr-TR', name: 'Turkish' },
];

export function getLanguageName(code: string): string {
  return LANGUAGES.find((l) => l.code === code)?.name ?? code;
}
