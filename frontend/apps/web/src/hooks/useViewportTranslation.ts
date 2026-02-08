import { useState, useRef, useCallback, useEffect } from 'react'
import { entryService } from '@glean/api-client'
import { splitIntoSentences } from '../lib/sentenceSplitter'

// Block elements whose text content should be translated
const TRANSLATABLE_BLOCKS = new Set([
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

// Elements whose descendants should never be translated
const SKIP_TAGS = new Set(['CODE', 'PRE', 'SCRIPT', 'STYLE', 'KBD', 'SAMP'])

// CSS class for inserted translation lines
const TRANSLATION_LINE_CLASS = 'glean-translation-line'

// Data attribute to mark a block as already processed
const PROCESSED_ATTR = 'data-translation-processed'

interface UseViewportTranslationOptions {
  contentRef: React.RefObject<HTMLElement | null>
  scrollContainerRef: React.RefObject<HTMLElement | null>
  targetLanguage: string
  entryId: string
}

interface UseViewportTranslationReturn {
  isActive: boolean
  isTranslating: boolean
  error: string | null
  activate: () => void
  deactivate: () => void
  toggle: () => void
}

/**
 * Check if an element is inside a skip-tag ancestor (code, pre, etc.)
 */
function hasSkipAncestor(el: Element): boolean {
  let current = el.parentElement
  while (current) {
    if (SKIP_TAGS.has(current.tagName)) return true
    current = current.parentElement
  }
  return false
}

/**
 * Hook for viewport-based sentence-level translation.
 *
 * Translates only the content visible in the scroll container (plus a 500px buffer below).
 * Each block element's text is split into sentences, translated, and shown line-by-line.
 */
export function useViewportTranslation({
  contentRef,
  scrollContainerRef,
  targetLanguage,
  entryId,
}: UseViewportTranslationOptions): UseViewportTranslationReturn {
  const [isActive, setIsActive] = useState(false)
  const [isTranslating, setIsTranslating] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Translation cache: sentence text -> translated text
  const cacheRef = useRef<Map<string, string>>(new Map())
  // Blocks currently being translated (prevent duplicate requests)
  const pendingBlocksRef = useRef<Set<Element>>(new Set())
  // IntersectionObserver ref
  const observerRef = useRef<IntersectionObserver | null>(null)
  // Track active state in ref for use inside observer callback
  const isActiveRef = useRef(false)
  // Previous entryId for detecting changes
  const prevEntryIdRef = useRef(entryId)

  /**
   * Translate a batch of visible blocks and insert translation lines.
   */
  const translateBlocks = useCallback(
    async (blocks: Element[]) => {
      // Filter out already-processed or currently-pending blocks
      const toTranslate = blocks.filter(
        (b) => !b.hasAttribute(PROCESSED_ATTR) && !pendingBlocksRef.current.has(b),
      )
      if (toTranslate.length === 0) return

      // Mark as pending
      toTranslate.forEach((b) => pendingBlocksRef.current.add(b))
      setIsTranslating(true)
      setError(null)

      // Collect sentences from all blocks
      const blockSentences: { block: Element; sentences: string[] }[] = []
      for (const block of toTranslate) {
        if (hasSkipAncestor(block)) continue
        const text = block.textContent?.trim()
        if (!text) continue
        const sentences = splitIntoSentences(text)
        if (sentences.length > 0) {
          blockSentences.push({ block, sentences })
        }
      }

      if (blockSentences.length === 0) {
        toTranslate.forEach((b) => pendingBlocksRef.current.delete(b))
        setIsTranslating(false)
        return
      }

      // Collect all unique uncached sentences
      const allSentences = blockSentences.flatMap((bs) => bs.sentences)
      const uncached = [...new Set(allSentences.filter((s) => !cacheRef.current.has(s)))]

      // Call API for uncached sentences
      if (uncached.length > 0) {
        try {
          const response = await entryService.translateTexts(uncached, targetLanguage)
          uncached.forEach((text, i) => {
            cacheRef.current.set(text, response.translations[i])
          })
        } catch (err) {
          const msg = err instanceof Error ? err.message : 'Translation failed'
          setError(msg)
          toTranslate.forEach((b) => pendingBlocksRef.current.delete(b))
          setIsTranslating(false)
          return
        }
      }

      // Insert translation lines into DOM
      for (const { block, sentences } of blockSentences) {
        // Create a container for all sentence translations
        const translationDiv = document.createElement('div')
        translationDiv.className = TRANSLATION_LINE_CLASS

        for (const sentence of sentences) {
          const translated = cacheRef.current.get(sentence)
          if (translated && translated.trim()) {
            const line = document.createElement('div')
            line.textContent = translated.trim()
            translationDiv.appendChild(line)
          }
        }

        if (translationDiv.childElementCount > 0) {
          block.after(translationDiv)
        }

        block.setAttribute(PROCESSED_ATTR, 'true')
        pendingBlocksRef.current.delete(block)
      }

      setIsTranslating(false)
    },
    [targetLanguage],
  )

  /**
   * Set up IntersectionObserver on all translatable blocks.
   */
  const setupObserver = useCallback(() => {
    if (!contentRef.current || !scrollContainerRef.current) return

    // Find all translatable block elements
    const blocks: Element[] = []
    for (const tagName of TRANSLATABLE_BLOCKS) {
      const elements = contentRef.current.querySelectorAll(tagName.toLowerCase())
      elements.forEach((el) => {
        if (!hasSkipAncestor(el) && el.textContent?.trim()) {
          blocks.push(el)
        }
      })
    }

    if (blocks.length === 0) return

    // Batch visible blocks with a debounce
    let pendingVisible: Element[] = []
    let debounceTimer: ReturnType<typeof setTimeout> | null = null

    const observer = new IntersectionObserver(
      (entries) => {
        if (!isActiveRef.current) return

        const newlyVisible = entries.filter((e) => e.isIntersecting).map((e) => e.target)

        if (newlyVisible.length > 0) {
          pendingVisible.push(...newlyVisible)

          // Debounce to batch nearby blocks
          if (debounceTimer) clearTimeout(debounceTimer)
          debounceTimer = setTimeout(() => {
            const batch = [...pendingVisible]
            pendingVisible = []
            translateBlocks(batch)
          }, 200)
        }
      },
      {
        root: scrollContainerRef.current,
        // Pre-translate 500px below viewport
        rootMargin: '0px 0px 500px 0px',
        threshold: 0,
      },
    )

    observerRef.current = observer
    blocks.forEach((block) => observer.observe(block))
  }, [contentRef, scrollContainerRef, translateBlocks])

  /**
   * Remove all translation elements from the DOM.
   */
  const removeTranslationElements = useCallback(() => {
    if (!contentRef.current) return

    // Remove translation lines (they're siblings of blocks, inside the article's parent)
    const parent = contentRef.current
    const translationLines = parent.querySelectorAll(`.${TRANSLATION_LINE_CLASS}`)
    translationLines.forEach((el) => el.remove())

    // Remove processed markers
    const processed = parent.querySelectorAll(`[${PROCESSED_ATTR}]`)
    processed.forEach((el) => el.removeAttribute(PROCESSED_ATTR))
  }, [contentRef])

  const activate = useCallback(() => {
    setIsActive(true)
    isActiveRef.current = true
    setError(null)
  }, [])

  const deactivate = useCallback(() => {
    setIsActive(false)
    isActiveRef.current = false

    // Disconnect observer
    if (observerRef.current) {
      observerRef.current.disconnect()
      observerRef.current = null
    }

    // Remove translation elements from DOM
    removeTranslationElements()

    // Clear state
    cacheRef.current.clear()
    pendingBlocksRef.current.clear()
    setIsTranslating(false)
    setError(null)
  }, [removeTranslationElements])

  const toggle = useCallback(() => {
    if (isActiveRef.current) {
      deactivate()
    } else {
      activate()
    }
  }, [activate, deactivate])

  // Set up observer when activated (with delay for useContentRenderer)
  useEffect(() => {
    if (!isActive) return

    // Wait for useContentRenderer to finish (syntax highlighting, gallery)
    const timer = setTimeout(() => {
      setupObserver()
    }, 150)

    return () => {
      clearTimeout(timer)
      if (observerRef.current) {
        observerRef.current.disconnect()
        observerRef.current = null
      }
    }
  }, [isActive, setupObserver])

  // Reset when entry changes
  useEffect(() => {
    if (prevEntryIdRef.current !== entryId) {
      prevEntryIdRef.current = entryId
      if (isActiveRef.current) {
        deactivate()
      }
      cacheRef.current.clear()
    }
  }, [entryId, deactivate])

  return {
    isActive,
    isTranslating,
    error,
    activate,
    deactivate,
    toggle,
  }
}
