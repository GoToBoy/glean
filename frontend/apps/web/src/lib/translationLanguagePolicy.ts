import type { TranslationTargetLanguage } from '@glean/types'

const HAN_RE = /[\u3400-\u4dbf\u4e00-\u9fff\uf900-\ufaff]/g
const KANA_RE = /[\u3040-\u30ff\uff66-\uff9f]/g
const HANGUL_RE = /[\u1100-\u11ff\u3130-\u318f\uac00-\ud7af]/g
// Count Latin words (not individual chars) to avoid over-weighting English in CJK-Latin mixed text.
// e.g. "React" = 1 word (not 5 chars), keeping Chinese tech articles classified as 'chinese'.
const LATIN_WORD_RE = /[A-Za-z][A-Za-z'-]*/g
const OTHER_SCRIPT_RE = /[\u0370-\u03ff\u0400-\u04ff\u0530-\u058f\u0590-\u05ff\u0600-\u06ff\u0900-\u097f]/g

export type TranslationLanguageCategory = 'chinese' | 'non_chinese' | 'unknown'

function countMatches(text: string, regex: RegExp): number {
  return text.match(regex)?.length ?? 0
}

function normalizeSample(text: string): string {
  return text
    .replace(/<[^>]*>/g, ' ')
    .replace(/&[a-zA-Z0-9#]+;/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 900)
}

export function detectTranslationLanguageCategory(text: string): TranslationLanguageCategory {
  const sample = normalizeSample(text)
  if (!sample) return 'unknown'

  const hanCount = countMatches(sample, HAN_RE)
  const kanaCount = countMatches(sample, KANA_RE)
  const hangulCount = countMatches(sample, HANGUL_RE)
  // latinCount is word count, not char count — "TypeScript" = 1, not 10
  const latinCount = countMatches(sample, LATIN_WORD_RE)
  const otherScriptCount = countMatches(sample, OTHER_SCRIPT_RE)

  const nonChineseSignal = kanaCount + hangulCount + latinCount + otherScriptCount
  const totalSignal = hanCount + nonChineseSignal

  // Minimum 2 units; lower than before because word-based Latin counts are smaller than char counts.
  if (totalSignal < 2) return 'unknown'
  if (kanaCount > 0 || hangulCount > 0 || otherScriptCount > 0) return 'non_chinese'
  if (hanCount === 0) return latinCount > 0 ? 'non_chinese' : 'unknown'
  if (nonChineseSignal === 0) return 'chinese'

  const hanRatio = hanCount / totalSignal
  return hanRatio >= 0.65 ? 'chinese' : 'non_chinese'
}

export function resolveAutoTranslationTargetLanguage(
  text: string,
  preferredTargetLanguage: TranslationTargetLanguage = 'zh-CN'
): TranslationTargetLanguage | null {
  const category = detectTranslationLanguageCategory(text)
  if (category === 'unknown') return null

  if (preferredTargetLanguage === 'zh-CN') {
    return category === 'non_chinese' ? 'zh-CN' : null
  }

  return category === 'chinese' ? 'en' : null
}

export function shouldAutoTranslate(
  text: string,
  preferredTargetLanguage: TranslationTargetLanguage = 'zh-CN'
): boolean {
  return resolveAutoTranslationTargetLanguage(text, preferredTargetLanguage) !== null
}
