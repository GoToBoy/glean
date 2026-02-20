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

const STRUCTURED_BLOCK_TAGS = new Set([
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
])

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
      if (!hasSkipAncestor(el) && el.textContent?.trim()) {
        blocks.push(el)
      }
    })
  }
  return blocks
}

export function normalizeLooseTextNodes(root: HTMLElement, originalHtmlAttr: string): void {
  const containers = [root, ...Array.from(root.querySelectorAll('div, article, section'))]

  for (const container of containers) {
    if (hasSkipAncestor(container)) continue

    const hasStructuredDirectChild = Array.from(container.children).some((child) =>
      STRUCTURED_BLOCK_TAGS.has(child.tagName),
    )
    if (hasStructuredDirectChild) continue

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

    if (SKIP_TAGS.has(el.tagName)) return

    const children = Array.from(el.childNodes)
    children.forEach((child) => walk(child))
  }

  walk(block)
  flush()

  return parts
}
