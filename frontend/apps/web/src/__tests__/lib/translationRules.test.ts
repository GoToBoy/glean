import { describe, expect, it } from 'vitest'
import { collectTranslatableBlocks, normalizeLooseTextNodes } from '@/lib/translationRules'

describe('translationRules', () => {
  it('skips blockquote wrapper when it contains structured blocks', () => {
    const root = document.createElement('article')
    root.innerHTML = `
      <blockquote>
        <p>First paragraph.</p>
        <p>Second paragraph.</p>
      </blockquote>
    `

    const blocks = collectTranslatableBlocks(root, false, () => 'text')
    const tags = blocks.map((el) => el.tagName)

    expect(tags).toEqual(['P', 'P'])
  })

  it('keeps only leaf-most blocks for nested list content', () => {
    const root = document.createElement('article')
    root.innerHTML = `
      <ul>
        <li><p>Item one.</p></li>
        <li><p>Item two.</p></li>
      </ul>
    `

    const blocks = collectTranslatableBlocks(root, false, () => 'text')
    const tags = blocks.map((el) => el.tagName)

    expect(tags).toEqual(['P', 'P'])
  })

  it('still translates blockquote with inline-only children', () => {
    const root = document.createElement('article')
    root.innerHTML = `
      <blockquote><span>Inline quote text.</span></blockquote>
    `

    const blocks = collectTranslatableBlocks(root, false, () => 'text')
    const tags = blocks.map((el) => el.tagName)

    expect(tags).toEqual(['BLOCKQUOTE'])
  })

  it('preserves outer direct text by wrapping it into paragraphs', () => {
    const root = document.createElement('article')
    root.innerHTML = `
      <blockquote>
        Outer text.
        <p>Inner paragraph.</p>
      </blockquote>
    `

    normalizeLooseTextNodes(root, 'data-original-html')
    const blocks = collectTranslatableBlocks(root, false, () => 'text')
    const tags = blocks.map((el) => el.tagName)
    const texts = blocks.map((el) => (el.textContent ?? '').trim())

    expect(tags).toEqual(['P', 'P'])
    expect(texts).toContain('Outer text.')
    expect(texts).toContain('Inner paragraph.')
  })
})
