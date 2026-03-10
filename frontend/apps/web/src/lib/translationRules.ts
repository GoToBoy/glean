export const TRANSLATABLE_BLOCKS = new Set([
  'P',
  'H1',
  'H2',
  'H3',
  'H4',
  'H5',
  'H6',
  'LI',
  'BLOCKQUOTE',
  'FIGCAPTION',
  'DT',
  'DD',
  'ARTICLE',
  'PRE',
])

export const SKIP_TAGS = new Set(['CODE', 'PRE', 'SCRIPT', 'STYLE', 'KBD', 'SAMP'])

export function hasSkipAncestor(el: Element): boolean {
  let current = el.parentElement
  while (current) {
    if (SKIP_TAGS.has(current.tagName)) return true
    current = current.parentElement
  }
  return false
}

export function collectTranslatableBlocks(
  root: HTMLElement,
  translatePreUnknown: boolean,
  classifyPreElement: (el: Element) => 'text' | 'code' | 'unknown',
): Element[] {
  const blocks: Element[] = []
  for (const tagName of TRANSLATABLE_BLOCKS) {
    const elements = root.querySelectorAll(tagName.toLowerCase())
    elements.forEach((el) => {
      if (el.tagName === 'ARTICLE' && el.children.length > 0) return
      if (el.tagName === 'PRE') {
        const preClass = classifyPreElement(el)
        if (preClass === 'code') return
        if (preClass === 'unknown' && !translatePreUnknown) return
      }
      if (el.classList.contains('glean-bilingual-active')) return
      if (!hasSkipAncestor(el) && el.textContent?.trim()) {
        blocks.push(el)
      }
    })
  }

  // Keep only leaf-most translatable blocks. This prevents parent/child overlap
  // (e.g. blockquote + p, li + p) from being translated twice.
  const uniqueBlocks = Array.from(new Set(blocks))
  return uniqueBlocks.filter(
    (el) => !uniqueBlocks.some((other) => other !== el && el.contains(other)),
  )
}

export function normalizeLooseTextNodes(root: HTMLElement, originalHtmlAttr: string): void {
  const containers = [
    root,
    ...Array.from(root.querySelectorAll('div, article, section, blockquote, li, dt, dd, figcaption')),
  ]

  for (const container of containers) {
    if (hasSkipAncestor(container)) continue

    const directNodes = Array.from(container.childNodes)
    const hasLooseText = directNodes.some(
      (node) => node.nodeType === Node.TEXT_NODE && (node.textContent?.trim().length ?? 0) > 0,
    )
    if (!hasLooseText) continue

    if (!container.hasAttribute(originalHtmlAttr)) {
      container.setAttribute(originalHtmlAttr, container.innerHTML)
    }

    const fragment = document.createDocumentFragment()
    for (const node of directNodes) {
      if (node.nodeType === Node.TEXT_NODE) {
        const text = node.textContent?.trim()
        if (!text) continue
        const p = document.createElement('p')
        p.textContent = text
        fragment.appendChild(p)
      } else {
        fragment.appendChild(node)
      }
    }

    container.replaceChildren(fragment)
  }
}

/**
 * Split block text by <br> boundaries so each line/section is translated independently.
 */
export function splitBlockByBreaks(block: Element): string[] {
  const parts: string[] = []
  let current = ''

  const flush = () => {
    const text = current.trim()
    if (text) parts.push(text)
    current = ''
  }

  const walk = (node: Node) => {
    if (node.nodeType === Node.TEXT_NODE) {
      const text = node.textContent ?? ''
      if (!text) return
      // Preserve token boundaries across adjacent text nodes.
      if (current && !/\s$/.test(current) && !/^\s/.test(text)) {
        current += ' '
      }
      current += text
      return
    }

    if (node.nodeType !== Node.ELEMENT_NODE) return
    const el = node as Element

    if (el.tagName === 'BR') {
      flush()
      return
    }

    // Prevent reusing previously rendered bilingual lines as source sentences.
    if (
      el.classList.contains('glean-original-sentence') ||
      el.classList.contains('glean-translated-sentence')
    ) {
      return
    }

    if (SKIP_TAGS.has(el.tagName)) return

    const children = Array.from(el.childNodes)
    children.forEach((child) => walk(child))
  }

  walk(block)
  flush()

  return parts
}
