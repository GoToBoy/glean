import { resolveAutoTranslationTargetLanguage } from './translationLanguagePolicy'

/**
 * Backward-compatible wrapper.
 *
 * New translation policy only auto-translates non-Chinese content to Chinese.
 * For Chinese/unknown content this returns "zh-CN" as a stable fallback.
 */
export function detectTargetLanguage(text: string): string {
  return resolveAutoTranslationTargetLanguage(text) ?? 'zh-CN'
}
