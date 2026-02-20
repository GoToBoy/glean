import { describe, it, expect } from 'vitest'
import {
  detectTranslationLanguageCategory,
  resolveAutoTranslationTargetLanguage,
  shouldTranslateToChinese,
} from '@/lib/translationLanguagePolicy'

describe('translationLanguagePolicy', () => {
  it('marks Chinese text as chinese and does not auto-translate', () => {
    const text = '这是一个中文段落，用于验证中文内容保持不变。'
    expect(detectTranslationLanguageCategory(text)).toBe('chinese')
    expect(resolveAutoTranslationTargetLanguage(text)).toBeNull()
    expect(shouldTranslateToChinese(text)).toBe(false)
  })

  it('marks English text as non_chinese and targets zh-CN', () => {
    const text = 'This is an English paragraph for translation.'
    expect(detectTranslationLanguageCategory(text)).toBe('non_chinese')
    expect(resolveAutoTranslationTargetLanguage(text)).toBe('zh-CN')
    expect(shouldTranslateToChinese(text)).toBe(true)
  })

  it('marks Japanese text as non_chinese and targets zh-CN', () => {
    const text = 'これは日本語の記事です。ニュースを翻訳します。'
    expect(detectTranslationLanguageCategory(text)).toBe('non_chinese')
    expect(resolveAutoTranslationTargetLanguage(text)).toBe('zh-CN')
    expect(shouldTranslateToChinese(text)).toBe(true)
  })

  it('marks Korean text as non_chinese and targets zh-CN', () => {
    const text = '이 문장은 한국어로 작성되었습니다.'
    expect(detectTranslationLanguageCategory(text)).toBe('non_chinese')
    expect(resolveAutoTranslationTargetLanguage(text)).toBe('zh-CN')
    expect(shouldTranslateToChinese(text)).toBe(true)
  })
})
