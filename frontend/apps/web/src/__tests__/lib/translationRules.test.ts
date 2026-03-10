import { describe, expect, it } from 'vitest'
import { collectTranslatableBlocks } from '@/lib/translationRules'

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
})
