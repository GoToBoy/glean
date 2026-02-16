import { useEffect, useMemo, useRef, type RefObject } from 'react'
import { entryService } from '@glean/api-client'

interface UseEntryListEngagementTrackingParams {
  entryIds: string[]
  scrollContainerRef: RefObject<HTMLDivElement | null>
  scopeKey: string
  minVisibleRatio?: number
  exposedMs?: number
  skimmedMs?: number
  enabled?: boolean
}

interface EntryVisibilityState {
  visibleSince: number | null
  visibleMs: number
  exposedSent: boolean
  skimmedSent: boolean
}

const DEFAULT_EXPOSED_MS = 300
const DEFAULT_SKIMMED_MS = 600
const DEFAULT_MIN_VISIBLE_RATIO = 0.5

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

export function useEntryListEngagementTracking({
  entryIds,
  scrollContainerRef,
  scopeKey,
  minVisibleRatio = DEFAULT_MIN_VISIBLE_RATIO,
  exposedMs = DEFAULT_EXPOSED_MS,
  skimmedMs = DEFAULT_SKIMMED_MS,
  enabled = true,
}: UseEntryListEngagementTrackingParams) {
  const sessionId = useMemo(() => {
    if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
      return crypto.randomUUID()
    }
    return `list_session_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`
  }, [scopeKey])

  const statesRef = useRef<Map<string, EntryVisibilityState>>(new Map())

  const ensureState = (entryId: string): EntryVisibilityState => {
    const existing = statesRef.current.get(entryId)
    if (existing) return existing
    const created: EntryVisibilityState = {
      visibleSince: null,
      visibleMs: 0,
      exposedSent: false,
      skimmedSent: false,
    }
    statesRef.current.set(entryId, created)
    return created
  }

  useEffect(() => {
    if (!enabled) return

    const scrollContainer = scrollContainerRef.current
    if (!scrollContainer) return

    const trackedIds = new Set(entryIds)

    // Remove stale items from in-memory state when list changes.
    for (const id of statesRef.current.keys()) {
      if (!trackedIds.has(id)) {
        statesRef.current.delete(id)
      }
    }

    const sendSignal = async (
      entryId: string,
      signal: 'exposed' | 'skimmed',
      visibleMs: number
    ): Promise<void> => {
      try {
        await entryService.trackEntryEvent(entryId, {
          event_id: getEventId(),
          event_type: signal === 'exposed' ? 'entry_impression' : 'entry_dwell',
          session_id: sessionId,
          occurred_at: new Date().toISOString(),
          client_ts: new Date().toISOString(),
          view: getViewType(),
          device_type: getDeviceType(),
          active_ms: Math.max(0, Math.floor(visibleMs)),
          scroll_depth_max: 0,
          est_read_time_sec: 0,
          extra: {
            surface: 'list',
            signal,
            visible_ms: Math.max(0, Math.floor(visibleMs)),
          },
        })
      } catch {
        // best-effort telemetry
      }
    }

    const maybeEmit = (entryId: string, state: EntryVisibilityState, now: number) => {
      const ongoingVisibleMs =
        state.visibleMs + (state.visibleSince !== null ? Math.max(0, now - state.visibleSince) : 0)

      if (!state.exposedSent && ongoingVisibleMs >= exposedMs) {
        state.exposedSent = true
        void sendSignal(entryId, 'exposed', ongoingVisibleMs)
      }

      if (!state.skimmedSent && ongoingVisibleMs >= skimmedMs) {
        state.skimmedSent = true
        void sendSignal(entryId, 'skimmed', ongoingVisibleMs)
      }
    }

    const onIntersect: IntersectionObserverCallback = (records) => {
      const now = Date.now()
      for (const record of records) {
        const target = record.target as HTMLElement
        const entryId = target.dataset.entryId
        if (!entryId || !trackedIds.has(entryId)) continue

        const state = ensureState(entryId)
        const visibleEnough = record.isIntersecting && record.intersectionRatio >= minVisibleRatio

        if (visibleEnough) {
          if (state.visibleSince === null) {
            state.visibleSince = now
          }
          maybeEmit(entryId, state, now)
          continue
        }

        if (state.visibleSince !== null) {
          state.visibleMs += Math.max(0, now - state.visibleSince)
          state.visibleSince = null
        }
        maybeEmit(entryId, state, now)
      }
    }

    const observer = new IntersectionObserver(onIntersect, {
      root: scrollContainer,
      threshold: [0, minVisibleRatio, 1],
    })

    const nodes = scrollContainer.querySelectorAll<HTMLElement>('[data-entry-id]')
    nodes.forEach((node) => observer.observe(node))

    const tick = window.setInterval(() => {
      const now = Date.now()
      for (const [entryId, state] of statesRef.current.entries()) {
        if (state.visibleSince === null) continue
        maybeEmit(entryId, state, now)
      }
    }, 120)

    return () => {
      window.clearInterval(tick)
      observer.disconnect()

      const now = Date.now()
      for (const state of statesRef.current.values()) {
        if (state.visibleSince !== null) {
          state.visibleMs += Math.max(0, now - state.visibleSince)
          state.visibleSince = null
        }
      }
    }
  }, [enabled, entryIds, exposedMs, minVisibleRatio, scrollContainerRef, sessionId, skimmedMs])
}
