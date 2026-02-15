import { useEffect, useMemo, useRef, type RefObject } from 'react'
import { entryService } from '@glean/api-client'
import type { EntryEventType } from '@glean/types'

interface UseEntryEngagementTrackingParams {
  entryId: string
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
  if (!content) return 0
  const text = stripHtmlToText(content)
  if (!text) return 0
  const words = text.split(/\s+/).filter(Boolean).length
  return Math.max(15, Math.min(900, Math.round(words / 4)))
}

function getDeviceType(): 'desktop' | 'mobile' | 'tablet' | 'unknown' {
  if (typeof window === 'undefined') return 'unknown'
  const width = window.innerWidth
  if (width < 768) return 'mobile'
  if (width < 1024) return 'tablet'
  return 'desktop'
}

function getViewType(): 'timeline' | 'smart' {
  if (typeof window === 'undefined') return 'timeline'
  const params = new URLSearchParams(window.location.search)
  return params.get('view') === 'smart' ? 'smart' : 'timeline'
}

function getEventId(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
    return crypto.randomUUID()
  }
  return `evt_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`
}

export function useEntryEngagementTracking({
  entryId,
  content,
  scrollContainerRef,
}: UseEntryEngagementTrackingParams) {
  const sessionId = useMemo(() => {
    if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
      return crypto.randomUUID()
    }
    return `session_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`
  }, [entryId])

  const estReadTimeSec = useMemo(() => estimateReadSeconds(content), [content])
  const activeMsRef = useRef(0)
  const activeStartRef = useRef<number | null>(null)
  const maxScrollDepthRef = useRef(0)
  const lastScrollBucketRef = useRef(0)

  const sendEvent = async (
    eventType: EntryEventType,
    extra: Record<string, string | number | boolean | null> | undefined = undefined
  ) => {
    try {
      await entryService.trackEntryEvent(entryId, {
        event_id: getEventId(),
        event_type: eventType,
        session_id: sessionId,
        occurred_at: new Date().toISOString(),
        client_ts: new Date().toISOString(),
        view: getViewType(),
        device_type: getDeviceType(),
        active_ms: Math.max(0, Math.floor(activeMsRef.current)),
        scroll_depth_max: Math.max(0, Math.min(1, maxScrollDepthRef.current)),
        est_read_time_sec: estReadTimeSec,
        extra,
      })
    } catch {
      // best-effort telemetry
    }
  }

  useEffect(() => {
    const updateActiveTime = () => {
      if (activeStartRef.current !== null) {
        activeMsRef.current += Date.now() - activeStartRef.current
        activeStartRef.current = Date.now()
      }
    }

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

    const onVisibilityChange = () => {
      if (canTrackActive()) {
        startActive()
      } else {
        stopActive()
      }
    }

    const onFocus = () => startActive()
    const onBlur = () => stopActive()

    const onScroll = () => {
      const container = scrollContainerRef.current
      if (!container) return
      const maxScrollable = Math.max(1, container.scrollHeight - container.clientHeight)
      const depth = Math.max(0, Math.min(1, container.scrollTop / maxScrollable))
      if (depth > maxScrollDepthRef.current) {
        maxScrollDepthRef.current = depth
      }

      const bucket = Math.floor(maxScrollDepthRef.current * 10)
      if (bucket >= lastScrollBucketRef.current + 2) {
        lastScrollBucketRef.current = bucket
        void sendEvent('entry_scroll_depth')
      }
    }

    const start = async () => {
      const now = Date.now()
      const key = `entry_last_open:${entryId}`
      const previousOpen = Number(localStorage.getItem(key) || '0')
      if (previousOpen > 0 && now - previousOpen <= 24 * 60 * 60 * 1000) {
        await sendEvent('entry_return')
      }
      localStorage.setItem(key, String(now))

      await sendEvent('entry_impression')
      await sendEvent('entry_open')
    }

    startActive()
    void start()

    const dwellInterval = window.setInterval(() => {
      updateActiveTime()
      if (activeMsRef.current >= 5000) {
        void sendEvent('entry_dwell')
      }
    }, 15000)

    const scrollContainer = scrollContainerRef.current
    if (scrollContainer) {
      scrollContainer.addEventListener('scroll', onScroll, { passive: true })
    }

    document.addEventListener('visibilitychange', onVisibilityChange)
    window.addEventListener('focus', onFocus)
    window.addEventListener('blur', onBlur)

    return () => {
      stopActive()
      window.clearInterval(dwellInterval)
      if (scrollContainer) {
        scrollContainer.removeEventListener('scroll', onScroll)
      }
      document.removeEventListener('visibilitychange', onVisibilityChange)
      window.removeEventListener('focus', onFocus)
      window.removeEventListener('blur', onBlur)

      void sendEvent('entry_exit')
    }
  }, [entryId, estReadTimeSec, scrollContainerRef, sessionId])
}
