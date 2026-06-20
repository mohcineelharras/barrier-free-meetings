/**
 * Checks if the characters in the transcribed text match the script expected
 * for the selected input language code (e.g. 'zh-CN', 'ar-SA', 'en-US').
 */
export function isScriptMatching(text: string, langCode: string): boolean {
  const cleanText = text.trim();
  if (!cleanText) return false;

  // Extract base language code (e.g. 'zh' from 'zh-CN')
  const baseLang = langCode.split('-')[0].toLowerCase();

  switch (baseLang) {
    case 'ar':
      // Arabic script (range \u0600-\u06FF)
      return /[\u0600-\u06FF]/.test(cleanText);
    case 'zh':
    case 'yue':
      // Han script (Chinese characters, range \u4E00-\u9FFF)
      return /[\u4E00-\u9FFF]/.test(cleanText);
    case 'ja':
      // Hiragana (\u3040-\u309F), Katakana (\u30A0-\u30FF), or Kanji (\u4E00-\u9FFF)
      return /[\u3040-\u309F\u30A0-\u30FF\u4E00-\u9FFF]/.test(cleanText);
    case 'ko':
      // Hangul Syllables (\uAC00-\uD7AF) or Hangul Jamo (\u1100-\u11FF)
      return /[\uAC00-\uD7AF\u1100-\u11FF]/.test(cleanText);
    case 'ru':
      // Cyrillic script (range \u0400-\u04FF)
      return /[\u0400-\u04FF]/.test(cleanText);
    case 'hi':
      // Devanagari script (range \u0900-\u097F)
      return /[\u0900-\u097F]/.test(cleanText);
    default:
      // For Latin-script languages (English, French, German, Italian, Portuguese, Spanish, Turkish):
      // 1. Ensure it does NOT contain non-Latin scripts that are clearly wrong.
      const hasArabic = /[\u0600-\u06FF]/.test(cleanText);
      const hasChinese = /[\u4E00-\u9FFF]/.test(cleanText);
      const hasCyrillic = /[\u0400-\u04FF]/.test(cleanText);
      const hasDevanagari = /[\u0900-\u097F]/.test(cleanText);
      const hasJapanese = /[\u3040-\u309F\u30A0-\u30FF]/.test(cleanText);
      const hasKorean = /[\uAC00-\uD7AF\u1100-\u11FF]/.test(cleanText);

      if (hasArabic || hasChinese || hasCyrillic || hasDevanagari || hasJapanese || hasKorean) {
        return false;
      }

      // 2. Must contain at least one Latin alphabetical character.
      return /[a-zA-Z]/.test(cleanText);
  }
}

/**
 * Determines whether the given language code requires server-side LLM verification
 * to distinguish it from other languages sharing the same script (e.g. English vs Spanish).
 */
export function requiresLlmVerification(langCode: string): boolean {
  const baseLang = langCode.split('-')[0].toLowerCase();
  // Latin-script languages benefit highly from LLM verification to avoid cross-language leakage.
  const latinLanguages = ['en', 'fr', 'de', 'it', 'pt', 'es', 'tr'];
  return latinLanguages.includes(baseLang);
}
