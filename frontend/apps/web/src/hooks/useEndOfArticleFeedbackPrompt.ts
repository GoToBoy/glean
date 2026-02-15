import { useEffect, useMemo, useRef, useState, type RefObject } from 'react'
import { entryService } from '@glean/api-client'

interface UseEndOfArticleFeedbackPromptParams {
  entryId: string
  isLiked: boolean | null
  content: string | undefined
  scrollContainerRef: RefObject<HTMLDivElement | null>
}

function stripHtmlToText(html: string): string {
  return html
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

function estimateReadSeconds(content: string | undefined): number {
  if (!content) return 15
  const words = stripHtmlToText(content).split(/\s+/).filter(Boolean).length
  return Math.max(15, Math.min(900, Math.round(words / 4)))
}

export function useEndOfArticleFeedbackPrompt({
  entryId,
  isLiked,
  content,
  scrollContainerRef,
}: UseEndOfArticleFeedbackPromptParams) {
  const [showPrompt, setShowPrompt] = useState(false)
  const [recentFeedbackCount, setRecentFeedbackCount] = useState<number | null>(null)

  const activeMsRef = useRef(0)
  const activeStartRef = useRef<number | null>(null)
  const maxScrollDepthRef = useRef(0)

  const estReadTimeSec = useMemo(() => estimateReadSeconds(content), [content])
  const dismissKey = `entry_feedback_prompt_dismissed:${entryId}`

  useEffect(() => {
    let mounted = true
    entryService
      .getFeedbackSummary(7)
      .then((result) => {
        if (mounted) {
          setRecentFeedbackCount(result.recent_explicit_feedback_count)
        }
      })
      .catch(() => {
        if (mounted) {
          setRecentFeedbackCount(0)
        }
      })
    return () => {
      mounted = false
    }
  }, [entryId])

  useEffect(() => {
    const canTrackActive = () =>
      document.visibilityState === 'visible' &&
      typeof document.hasFocus === 'function' &&
      document.hasFocus()

    const startActive = () => {
      if (activeStartRef.current === null && canTrackActive()) {
        activeStartRef.current = Date.now()
      }
    }

    const stopActive = () => {
      if (activeStartRef.current !== null) {
        activeMsRef.current += Date.now() - activeStartRef.current
        activeStartRef.current = null
      }
    }

    const updateActive = () => {
      if (activeStartRef.current !== null) {
        activeMsRef.current += Date.now() - activeStartRef.current
        activeStartRef.current = Date.now()
      }
    }

    const maybeShowPrompt = () => {
      if (localStorage.getItem(dismissKey) === '1') return
      if (isLiked !== null) return
      if (recentFeedbackCount === null || recentFeedbackCount >= 3) return
      if (maxScrollDepthRef.current < 0.95) return

      const normalized = Math.min(1.5, Math.max(0, activeMsRef.current / 1000 / estReadTimeSec))
      if (normalized < 0.4) return

      setShowPrompt(true)
    }

    const onVisibilityChange = () => {
      if (canTrackActive()) {
        startActive()
      } else {
        stopActive()
      }
      maybeShowPrompt()
    }

    const onFocus = () => startActive()
    const onBlur = () => {
      stopActive()
      maybeShowPrompt()
    }

    const onScroll = () => {
      const container = scrollContainerRef.current
      if (!container) return
      const maxScrollable = Math.max(1, container.scrollHeight - container.clientHeight)
      maxScrollDepthRef.current = Math.max(
        maxScrollDepthRef.current,
        Math.max(0, Math.min(1, container.scrollTop / maxScrollable))
      )
      updateActive()
      maybeShowPrompt()
    }

    startActive()

    const intervalId = window.setInterval(() => {
      updateActive()
      maybeShowPrompt()
    }, 5000)

    const scrollContainer = scrollContainerRef.current
    if (scrollContainer) {
      scrollContainer.addEventListener('scroll', onScroll, { passive: true })
    }

    document.addEventListener('visibilitychange', onVisibilityChange)
    window.addEventListener('focus', onFocus)
    window.addEventListener('blur', onBlur)

    return () => {
      stopActive()
      window.clearInterval(intervalId)
      if (scrollContainer) {
        scrollContainer.removeEventListener('scroll', onScroll)
      }
      document.removeEventListener('visibilitychange', onVisibilityChange)
      window.removeEventListener('focus', onFocus)
      window.removeEventListener('blur', onBlur)
    }
  }, [dismissKey, estReadTimeSec, isLiked, recentFeedbackCount, scrollContainerRef])

  const dismissPrompt = () => {
    localStorage.setItem(dismissKey, '1')
    setShowPrompt(false)
  }

  return {
    showPrompt,
    dismissPrompt,
  }
}
